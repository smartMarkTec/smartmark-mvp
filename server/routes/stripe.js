// server/routes/stripe.js
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

const PRICE_MAP = {
  starter: "price_1TCY6cAazBFzIoI1zr5yRAxu",
  pro: "price_1TCY78AazBFzIoI1FR7x7jG4",
  operator: "price_1TCY7bAazBFzIoI1lwe7fxwy",
};

const PLAN_NAME_MAP = {
  starter: "Starter",
  pro: "Pro",
  operator: "Operator",
};

const COOKIE_NAME = "sm_sid";
const SID_HEADER = "x-sm-sid";

const PRICE_TO_PLAN = Object.entries(PRICE_MAP).reduce((acc, [plan, priceId]) => {
  acc[priceId] = plan;
  return acc;
}, {});

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

function derivePlanKeyFromPriceId(priceId) {
  return PRICE_TO_PLAN[String(priceId || "").trim()] || "";
}

async function setUserBillingByIdentity({
  username = "",
  email = "",
  patch = {},
}) {
  await ensureDbShape();

  const u = String(username || "").trim();
  const e = String(email || "").trim().toLowerCase();

  let user =
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
  const planKey = derivePlanKeyFromPriceId(priceId);

  return await setUserBillingByIdentity({
    username,
    email,
    patch: {
      provider: "stripe",
      stripeCustomerId: customerId || "",
      stripeSubscriptionId: subscriptionId || "",
      stripePriceId: priceId || "",
      planKey: planKey || "",
      status: String(status || "").trim(),
      hasAccess: ["active", "trialing"].includes(String(status || "").trim().toLowerCase()),
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
    plans: Object.keys(PRICE_MAP),
  });
});

/* ========= public pricing page checkout ========= */
router.post("/create-checkout-session", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured. Missing STRIPE_SECRET_KEY.",
      });
    }

    const rawPlan = String(req.body?.plan || "").trim().toLowerCase();
    const email = String(req.body?.email || "").trim() || undefined;

    if (!rawPlan || !PRICE_MAP[rawPlan]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const clientUrl =
      process.env.CLIENT_URL ||
      req.headers.origin ||
      "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_MAP[rawPlan], quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${clientUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}&plan=${rawPlan}`,
      cancel_url: `${clientUrl}/setup`,
      metadata: {
        planKey: rawPlan,
        planName: PLAN_NAME_MAP[rawPlan],
      },
      subscription_data: {
        metadata: {
          planKey: rawPlan,
          planName: PLAN_NAME_MAP[rawPlan],
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

    const rawPlan = String(req.body?.plan || "").trim().toLowerCase();
    if (!rawPlan || !PRICE_MAP[rawPlan]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const clientUrl =
      process.env.CLIENT_URL ||
      req.headers.origin ||
      "http://localhost:3000";

    const username = String(auth.user.username || "").trim();
    const email = String(auth.user.email || "").trim();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: PRICE_MAP[rawPlan], quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${clientUrl}/setup?checkout=success&plan=${rawPlan}`,
      cancel_url: `${clientUrl}/setup?checkout=cancelled`,
      metadata: {
        username,
        email,
        planKey: rawPlan,
        planName: PLAN_NAME_MAP[rawPlan],
        source: "campaign_setup",
      },
      subscription_data: {
        metadata: {
          username,
          email,
          planKey: rawPlan,
          planName: PLAN_NAME_MAP[rawPlan],
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

/* ========= webhook ========= */
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
            console.warn("[stripe webhook] could not retrieve subscription on checkout.session.completed");
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
        let customerId = String(invoice?.customer || "").trim();
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
            console.warn("[stripe webhook] could not retrieve subscription on invoice.payment_failed");
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