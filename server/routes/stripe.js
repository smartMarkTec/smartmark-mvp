"use strict";

const express = require("express");
const Stripe = require("stripe");
const db = require("../db");

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("[stripe] STRIPE_SECRET_KEY is missing");
}

const stripe = new Stripe(stripeSecretKey || "");

const COOKIE_NAME = "sm_sid";
const SID_HEADER = "x-sm-sid";

const PLAN_NAME_MAP = {
  starter: "Starter",
  pro: "Pro",
  operator: "Operator",
};

const PUBLIC_PRICE_MAP = {
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  operator: process.env.STRIPE_PRICE_OPERATOR || "",
};

const FOUNDER_PRICE_MAP = {
  starter: process.env.STRIPE_PRICE_STARTER_FOUNDER || "",
  pro: process.env.STRIPE_PRICE_PRO_FOUNDER || "",
  operator: process.env.STRIPE_PRICE_OPERATOR_FOUNDER || "",
};

function normalizePlanKey(raw) {
  return String(raw || "").trim().toLowerCase();
}

function normalizeFounderFlag(value) {
  if (typeof value === "boolean") return value;
  const s = String(value || "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "founder";
}

function getClientUrl(req) {
  return process.env.CLIENT_URL || req.headers.origin || "http://localhost:3000";
}

function getPriceMap(founder = false) {
  return founder ? FOUNDER_PRICE_MAP : PUBLIC_PRICE_MAP;
}

function getPriceId(planKey, founder = false) {
  const map = getPriceMap(founder);
  return String(map[planKey] || "").trim();
}

function buildPriceToPlanLookup() {
  const out = {};

  for (const [planKey, priceId] of Object.entries(PUBLIC_PRICE_MAP)) {
    if (priceId) out[priceId] = { planKey, founder: false };
  }

  for (const [planKey, priceId] of Object.entries(FOUNDER_PRICE_MAP)) {
    if (priceId) out[priceId] = { planKey, founder: true };
  }

  return out;
}

function derivePlanMetaFromPriceId(priceId) {
  const lookup = buildPriceToPlanLookup();
  return lookup[String(priceId || "").trim()] || { planKey: "", founder: false };
}

async function ensureDbShape() {
  await db.read();
  db.data = db.data || {};
  db.data.users = Array.isArray(db.data.users) ? db.data.users : [];
  db.data.sessions = Array.isArray(db.data.sessions) ? db.data.sessions : [];
  await db.write();
}

function getSidFromReq(req) {
  const cookieSid = req.cookies?.[COOKIE_NAME];
  const headerSid = req.get(SID_HEADER);
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return (cookieSid || headerSid || bearer || "").trim();
}

async function getSessionUser(req) {
  await ensureDbShape();

  const sid = getSidFromReq(req);
  if (!sid) return null;

  const sess = db.data.sessions.find((s) => String(s.sid || "").trim() === sid);
  if (!sess) return null;

  const user = db.data.users.find(
    (u) => String(u.username || "").trim() === String(sess.username || "").trim()
  );
  if (!user) return null;

  return { sid, sess, user };
}

async function setUserBillingByIdentity({
  username = "",
  email = "",
  patch = {},
}) {
  await ensureDbShape();

  const u = String(username || "").trim();
  const e = String(email || "").trim().toLowerCase();

  const user =
    db.data.users.find((x) => String(x.username || "").trim() === u) ||
    db.data.users.find((x) => String(x.email || "").trim().toLowerCase() === e);

  if (!user) {
    return { ok: false, reason: "user_not_found" };
  }

  user.billing = {
    ...(user.billing || {}),
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  await db.write();

  return {
    ok: true,
    user: {
      username: user.username,
      email: user.email,
      billing: user.billing,
    },
  };
}

async function markSubscriptionFromStripe({
  username = "",
  email = "",
  customerId = "",
  subscriptionId = "",
  priceId = "",
  status = "",
  currentPeriodEnd = null,
}) {
  const { planKey, founder } = derivePlanMetaFromPriceId(priceId);

  return await setUserBillingByIdentity({
    username,
    email,
    patch: {
      provider: "stripe",
      stripeCustomerId: customerId || "",
      stripeSubscriptionId: subscriptionId || "",
      stripePriceId: priceId || "",
      planKey: planKey || "",
      founder: !!founder,
      planName: planKey ? PLAN_NAME_MAP[planKey] : "",
      status: String(status || "").trim(),
      hasAccess: ["active", "trialing"].includes(
        String(status || "").trim().toLowerCase()
      ),
      currentPeriodEnd: currentPeriodEnd || null,
    },
  });
}

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    clientUrl: process.env.CLIENT_URL || null,
    prices: {
      public: {
        starter: !!PUBLIC_PRICE_MAP.starter,
        pro: !!PUBLIC_PRICE_MAP.pro,
        operator: !!PUBLIC_PRICE_MAP.operator,
      },
      founder: {
        starter: !!FOUNDER_PRICE_MAP.starter,
        pro: !!FOUNDER_PRICE_MAP.pro,
        operator: !!FOUNDER_PRICE_MAP.operator,
      },
    },
  });
});

/* ========= public checkout after signup ========= */
router.post("/create-checkout-session", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured. Missing STRIPE_SECRET_KEY.",
      });
    }

    const planKey = normalizePlanKey(req.body?.plan);
    const founder = normalizeFounderFlag(req.body?.founder);
    const email = String(req.body?.email || "").trim() || undefined;
    const launchIntent = String(req.body?.launchIntent || "").trim() === "1";

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const priceId = getPriceId(planKey, founder);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for ${planKey}${founder ? " founder" : ""}.`,
      });
    }

    const clientUrl = getClientUrl(req);

    const successUrl = launchIntent
      ? `${clientUrl}/setup?checkout=success&launch_intent=1&plan=${planKey}${founder ? "&founder=1" : ""}`
      : `${clientUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}${founder ? "&founder=1" : ""}`;

    const cancelUrl = launchIntent
      ? `${clientUrl}/setup?checkout=cancelled&launch_intent=1`
      : `${clientUrl}/setup`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        planKey,
        founder: founder ? "true" : "false",
        planName: PLAN_NAME_MAP[planKey],
        source: launchIntent ? "campaign_setup_launch_gate" : "public_pricing_page",
      },
      subscription_data: {
        metadata: {
          planKey,
          founder: founder ? "true" : "false",
          planName: PLAN_NAME_MAP[planKey],
          source: launchIntent ? "campaign_setup_launch_gate" : "public_pricing_page",
        },
      },
    });

    return res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("[stripe] create-checkout-session error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to create checkout session",
    });
  }
});

/* ========= authenticated setup-page checkout ========= */
router.get("/billing-status", async (req, res) => {
  try {
    const auth = await getSessionUser(req);

    if (!auth) {
      return res.status(401).json({
        ok: false,
        authenticated: false,
        error: "Not logged in",
      });
    }

    const billing = auth.user.billing || {};

    return res.json({
      ok: true,
      authenticated: true,
      user: {
        username: auth.user.username,
        email: auth.user.email,
      },
      billing: {
        provider: billing.provider || "",
        planKey: billing.planKey || "",
        planName: billing.planName || "",
        founder: !!billing.founder,
        status: billing.status || "",
        hasAccess: !!billing.hasAccess,
        currentPeriodEnd: billing.currentPeriodEnd || null,
        stripeCustomerId: billing.stripeCustomerId || "",
        stripeSubscriptionId: billing.stripeSubscriptionId || "",
        stripePriceId: billing.stripePriceId || "",
      },
    });
  } catch (err) {
    console.error("[stripe] billing-status error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to load billing status",
    });
  }
});

router.post("/create-checkout-session-auth", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured. Missing STRIPE_SECRET_KEY.",
      });
    }

    const auth = await getSessionUser(req);
    if (!auth) {
      return res.status(401).json({
        ok: false,
        error: "You must be logged in before checkout.",
      });
    }

    const planKey = normalizePlanKey(req.body?.plan);
    const founder = normalizeFounderFlag(req.body?.founder);

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const priceId = getPriceId(planKey, founder);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for ${planKey}${founder ? " founder" : ""}.`,
      });
    }

    const clientUrl = getClientUrl(req);
    const username = String(auth.user.username || "").trim();
    const email = String(auth.user.email || "").trim();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${clientUrl}/setup?checkout=success&plan=${planKey}${founder ? "&founder=1" : ""}`,
      cancel_url: `${clientUrl}/setup?checkout=cancelled`,
      metadata: {
        username,
        email,
        planKey,
        founder: founder ? "true" : "false",
        planName: PLAN_NAME_MAP[planKey],
        source: "campaign_setup",
      },
      subscription_data: {
        metadata: {
          username,
          email,
          planKey,
          founder: founder ? "true" : "false",
          planName: PLAN_NAME_MAP[planKey],
          source: "campaign_setup",
        },
      },
    });

    return res.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("[stripe] create-checkout-session-auth error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to create authenticated checkout session",
    });
  }
});

router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("[stripe webhook] Missing STRIPE_WEBHOOK_SECRET");
      return res.status(500).send("Missing webhook secret");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("[stripe webhook] Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const username = String(session?.metadata?.username || "").trim();
        const email = String(
          session?.customer_details?.email ||
            session?.customer_email ||
            session?.metadata?.email ||
            ""
        ).trim();

        const customerId = String(session?.customer || "").trim();
        const subscriptionId = String(session?.subscription || "").trim();

        let priceId = "";
        let subscriptionStatus = "active";
        let currentPeriodEnd = null;

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            priceId = String(sub?.items?.data?.[0]?.price?.id || "").trim();
            subscriptionStatus = String(sub?.status || "active").trim();
            currentPeriodEnd = sub?.current_period_end
              ? new Date(Number(sub.current_period_end) * 1000).toISOString()
              : null;
          } catch (e) {
            console.warn(
              "[stripe webhook] could not retrieve subscription on checkout.session.completed"
            );
          }
        }

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status: subscriptionStatus,
          currentPeriodEnd,
        });

        console.log("[stripe webhook] checkout.session.completed", {
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          subscriptionStatus,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const customerId = String(invoice?.customer || "").trim();
        const subscriptionId = String(invoice?.subscription || "").trim();

        let priceId = "";
        let status = "active";
        let currentPeriodEnd = null;
        let username = "";
        let email = String(invoice?.customer_email || "").trim();

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            priceId = String(sub?.items?.data?.[0]?.price?.id || "").trim();
            status = String(sub?.status || "active").trim();
            currentPeriodEnd = sub?.current_period_end
              ? new Date(Number(sub.current_period_end) * 1000).toISOString()
              : null;
            username = String(sub?.metadata?.username || "").trim();
            if (!email) email = String(sub?.metadata?.email || "").trim();
          } catch (e) {
            console.warn("[stripe webhook] could not retrieve subscription on invoice.paid");
          }
        }

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status,
          currentPeriodEnd,
        });

        console.log("[stripe webhook] invoice.paid", {
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status,
        });
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const subscriptionId = String(invoice?.subscription || "").trim();
        let username = "";
        let email = String(invoice?.customer_email || "").trim();
        const customerId = String(invoice?.customer || "").trim();
        let priceId = "";
        let currentPeriodEnd = null;

        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            username = String(sub?.metadata?.username || "").trim();
            if (!email) email = String(sub?.metadata?.email || "").trim();
            priceId = String(sub?.items?.data?.[0]?.price?.id || "").trim();
            currentPeriodEnd = sub?.current_period_end
              ? new Date(Number(sub.current_period_end) * 1000).toISOString()
              : null;
          } catch (e) {
            console.warn(
              "[stripe webhook] could not retrieve subscription on invoice.payment_failed"
            );
          }
        }

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status: "past_due",
          currentPeriodEnd,
        });

        console.log("[stripe webhook] invoice.payment_failed", {
          username,
          email,
          customerId,
          subscriptionId,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = String(subscription?.id || "").trim();
        const customerId = String(subscription?.customer || "").trim();
        const username = String(subscription?.metadata?.username || "").trim();
        const email = String(subscription?.metadata?.email || "").trim();
        const priceId = String(subscription?.items?.data?.[0]?.price?.id || "").trim();
        const status = String(subscription?.status || "").trim();
        const currentPeriodEnd = subscription?.current_period_end
          ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
          : null;

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status,
          currentPeriodEnd,
        });

        console.log(`[stripe webhook] ${event.type}`, {
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status,
        });
        break;
      }

      default:
        console.log("[stripe webhook] Unhandled event:", event.type);
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[stripe webhook] fatal error:", err);
    return res.status(500).send("Webhook handler error");
  }
});

module.exports = router;