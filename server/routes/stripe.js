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

const HIDDEN_FOUNDER_PRICE_META = {};
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

function getPriceMap() {
  return PUBLIC_PRICE_MAP;
}

function getPriceId(planKey) {
  const map = getPriceMap();
  return String(map[planKey] || "").trim();
}

function buildPriceToPlanLookup() {
  const out = {};

  for (const [planKey, priceId] of Object.entries(PUBLIC_PRICE_MAP)) {
    if (!priceId) continue;

    out[String(priceId).trim()] = {
      planKey,
      founder: false,
      hidden: false,
      planName: PLAN_NAME_MAP[planKey] || planKey,
      billingLabel: PLAN_NAME_MAP[planKey] || planKey,
      offerKey: `public_${planKey}`,
    };
  }

  for (const [offerKey, meta] of Object.entries(HIDDEN_FOUNDER_PRICE_META)) {
    const priceId = String(meta?.priceId || "").trim();
    if (!priceId) continue;

    out[priceId] = {
      planKey: String(meta.planKey || "").trim(),
      founder: !!meta.founder,
      hidden: !!meta.hidden,
      planName: String(meta.planName || "").trim(),
      billingLabel: String(meta.billingLabel || "").trim(),
      offerKey,
    };
  }

  return out;
}

function derivePlanMetaFromPriceId(priceId) {
  const lookup = buildPriceToPlanLookup();

  return (
    lookup[String(priceId || "").trim()] || {
      planKey: "",
      founder: false,
      hidden: false,
      planName: "",
      billingLabel: "",
      offerKey: "",
    }
  );
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

  const u = String(username || "").trim().toLowerCase();
  const e = String(email || "").trim().toLowerCase();
  const stripeCustomerId = String(patch?.stripeCustomerId || "").trim();
  const stripeSubscriptionId = String(patch?.stripeSubscriptionId || "").trim();

  let user =
    (stripeCustomerId
      ? db.data.users.find(
          (x) =>
            String(x?.billing?.stripeCustomerId || "").trim() === stripeCustomerId
        )
      : null) ||
    (stripeSubscriptionId
      ? db.data.users.find(
          (x) =>
            String(x?.billing?.stripeSubscriptionId || "").trim() === stripeSubscriptionId
        )
      : null) ||
    db.data.users.find((x) => String(x.username || "").trim().toLowerCase() === u) ||
    db.data.users.find((x) => String(x.email || "").trim().toLowerCase() === e);

  // ✅ If Stripe completed but account record is missing, auto-create it from email
  if (!user && e) {
    user = {
      username: e,
      email: e,
      displayName: e.split("@")[0],
      passwordHash: "",
      createdAt: new Date().toISOString(),
      billing: {},
    };

    db.data.users.push(user);
  }

  if (!user) {
    return { ok: false, reason: "user_not_found" };
  }

  // ✅ normalize canonical identity
  if (e) {
    user.email = e;
    user.username = e;
  } else if (u) {
    user.username = u;
    if (!user.email) user.email = u;
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
  const {
    planKey,
    founder,
    hidden,
    planName,
    billingLabel,
    offerKey,
  } = derivePlanMetaFromPriceId(priceId);

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
      hiddenPlan: !!hidden,
      offerKey: offerKey || "",
      planName: planName || "",
      billingLabel: billingLabel || "",
      status: String(status || "").trim(),
      hasAccess: ["active", "trialing"].includes(
        String(status || "").trim().toLowerCase()
      ),
      currentPeriodEnd: currentPeriodEnd || null,
    },
  });
}

async function syncCheckoutSessionToUser(sessionId, fallbackUser = null) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, reason: "missing_session_id" };

  const session = await stripe.checkout.sessions.retrieve(id, {
    expand: ["subscription"],
  });

  const stripeUsername = String(session?.metadata?.username || "").trim();
  const stripeEmail = String(
    session?.customer_details?.email ||
      session?.customer_email ||
      session?.metadata?.email ||
      ""
  ).trim().toLowerCase();

  const fallbackUsername = String(fallbackUser?.username || "").trim();
  const fallbackEmail = String(fallbackUser?.email || "").trim().toLowerCase();

  const username = stripeUsername || fallbackUsername || stripeEmail || fallbackEmail;
  const email = stripeEmail || fallbackEmail || stripeUsername || fallbackUsername;

  const customerId = String(session?.customer || "").trim();
  const subscriptionObj = session?.subscription || null;
  const subscriptionId =
    typeof subscriptionObj === "string"
      ? String(subscriptionObj).trim()
      : String(subscriptionObj?.id || "").trim();

  let priceId = "";
  let status = "active";
  let currentPeriodEnd = null;

  if (subscriptionObj && typeof subscriptionObj === "object") {
    priceId = String(subscriptionObj?.items?.data?.[0]?.price?.id || "").trim();
    status = String(subscriptionObj?.status || "active").trim();
    currentPeriodEnd = subscriptionObj?.current_period_end
      ? new Date(Number(subscriptionObj.current_period_end) * 1000).toISOString()
      : null;
  } else if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    priceId = String(sub?.items?.data?.[0]?.price?.id || "").trim();
    status = String(sub?.status || "active").trim();
    currentPeriodEnd = sub?.current_period_end
      ? new Date(Number(sub.current_period_end) * 1000).toISOString()
      : null;
  }

  const result = await markSubscriptionFromStripe({
    username,
    email,
    customerId,
    subscriptionId,
    priceId,
    status,
    currentPeriodEnd,
  });

  return {
    ok: !!result?.ok,
    result,
    billing: {
      username,
      email,
      customerId,
      subscriptionId,
      priceId,
      status,
      currentPeriodEnd,
    },
  };
}
async function getAuthenticatedBilling(req) {
  const auth = await getSessionUser(req);

  if (!auth) {
    return { ok: false, status: 401, error: "Not logged in" };
  }

  const billing = auth.user.billing || {};
  return {
    ok: true,
    auth,
    billing,
  };
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
      founderHidden: {
        founder_legacy_40: !!HIDDEN_FOUNDER_PRICE_META.founder_legacy_40.priceId,
        founder_starter_70: !!HIDDEN_FOUNDER_PRICE_META.founder_starter_70.priceId,
        founder_pro_105: !!HIDDEN_FOUNDER_PRICE_META.founder_pro_105.priceId,
        founder_operator_175: !!HIDDEN_FOUNDER_PRICE_META.founder_operator_175.priceId,
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
    const email = String(req.body?.email || "").trim() || undefined;
    const launchIntent = String(req.body?.launchIntent || "").trim() === "1";

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const priceId = getPriceId(planKey);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for ${planKey}.`,
      });
    }

    const clientUrl = getClientUrl(req);

const successUrl = `${clientUrl}/setup?checkout=success&session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`;
const cancelUrl = `${clientUrl}/pricing?checkout=cancelled&plan=${planKey}`;

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
        username: email || "",
        email: email || "",
        planKey,
        founder: "false",
        planName: PLAN_NAME_MAP[planKey],
        billingLabel: PLAN_NAME_MAP[planKey],
        offerKey: `public_${planKey}`,
        source: launchIntent ? "campaign_setup_launch_gate" : "public_pricing_page",
      },
      subscription_data: {
        metadata: {
          username: email || "",
          email: email || "",
          planKey,
          founder: "false",
          planName: PLAN_NAME_MAP[planKey],
          billingLabel: PLAN_NAME_MAP[planKey],
          offerKey: `public_${planKey}`,
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
        billingLabel: billing.billingLabel || "",
        founder: !!billing.founder,
        hiddenPlan: !!billing.hiddenPlan,
        offerKey: billing.offerKey || "",
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

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const priceId = getPriceId(planKey);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for ${planKey}.`,
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
    success_url: `${clientUrl}/setup?checkout=success&session_id={CHECKOUT_SESSION_ID}&launch_intent=1&plan=${planKey}`,
cancel_url: `${clientUrl}/setup?billing_cancelled=1&plan=${planKey}`,
      metadata: {
        username,
        email,
        planKey,
        founder: "false",
        planName: PLAN_NAME_MAP[planKey],
        billingLabel: PLAN_NAME_MAP[planKey],
        offerKey: `public_${planKey}`,
        source: "campaign_setup",
      },
      subscription_data: {
        metadata: {
          username,
          email,
          planKey,
          founder: "false",
          planName: PLAN_NAME_MAP[planKey],
          billingLabel: PLAN_NAME_MAP[planKey],
          offerKey: `public_${planKey}`,
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

router.post("/admin/assign-plan", async (req, res) => {
  try {
    const adminUser = String(req.body?.adminUser || "").trim();
    if (adminUser !== "TheBoss") {
      return res.status(403).json({
        ok: false,
        error: "Forbidden",
      });
    }

    const username = String(req.body?.username || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const offerKey = String(req.body?.offerKey || "").trim();

    const hiddenMeta = HIDDEN_FOUNDER_PRICE_META[offerKey] || null;
    const publicMeta =
      offerKey === "public_starter"
        ? {
            planKey: "starter",
            planName: "Starter",
            billingLabel: "Starter",
            founder: false,
            hidden: false,
            offerKey,
          }
        : offerKey === "public_pro"
        ? {
            planKey: "pro",
            planName: "Pro",
            billingLabel: "Pro",
            founder: false,
            hidden: false,
            offerKey,
          }
        : offerKey === "public_operator"
        ? {
            planKey: "operator",
            planName: "Operator",
            billingLabel: "Operator",
            founder: false,
            hidden: false,
            offerKey,
          }
        : null;

    const meta = hiddenMeta || publicMeta;

    if (!meta) {
      return res.status(400).json({
        ok: false,
        error: "Invalid offerKey",
      });
    }

    const result = await setUserBillingByIdentity({
      username,
      email,
      patch: {
        provider: "stripe",
        planKey: meta.planKey,
        planName: meta.planName,
        billingLabel: meta.billingLabel,
        founder: !!meta.founder,
        hiddenPlan: !!meta.hidden,
        offerKey: meta.offerKey,
        status: "active",
        hasAccess: true,
        currentPeriodEnd: null,
      },
    });

    if (!result?.ok) {
      return res.status(404).json({
        ok: false,
        error: "User not found",
      });
    }

    return res.json({
      ok: true,
      user: result.user,
    });
  } catch (err) {
    console.error("[stripe] admin/assign-plan error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to assign plan",
    });
  }
});

router.post("/cancel-subscription", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured.",
      });
    }

    const result = await getAuthenticatedBilling(req);
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
      });
    }

    const { auth, billing } = result;
    const subscriptionId = String(billing?.stripeSubscriptionId || "").trim();

    if (!subscriptionId) {
      return res.status(400).json({
        ok: false,
        error: "No active Stripe subscription found.",
      });
    }

    const canceled = await stripe.subscriptions.cancel(subscriptionId);

    await markSubscriptionFromStripe({
      username: String(auth.user.username || "").trim(),
      email: String(auth.user.email || "").trim(),
      customerId: String(canceled?.customer || billing?.stripeCustomerId || "").trim(),
      subscriptionId,
      priceId: String(canceled?.items?.data?.[0]?.price?.id || billing?.stripePriceId || "").trim(),
      status: String(canceled?.status || "canceled").trim(),
      currentPeriodEnd: canceled?.current_period_end
        ? new Date(Number(canceled.current_period_end) * 1000).toISOString()
        : null,
    });

    return res.json({
      ok: true,
      canceled: true,
      status: String(canceled?.status || "canceled").trim(),
    });
  } catch (err) {
    console.error("[stripe] cancel-subscription error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to cancel subscription",
    });
  }
});

router.post("/change-plan", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Stripe is not configured.",
      });
    }

    const result = await getAuthenticatedBilling(req);
    if (!result.ok) {
      return res.status(result.status).json({
        ok: false,
        error: result.error,
      });
    }

    const { auth, billing } = result;
    const subscriptionId = String(billing?.stripeSubscriptionId || "").trim();
    const nextPlanKey = normalizePlanKey(req.body?.plan);

    if (!subscriptionId) {
      return res.status(400).json({
        ok: false,
        error: "No active Stripe subscription found.",
      });
    }

    if (!nextPlanKey || !PLAN_NAME_MAP[nextPlanKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Use starter, pro, or operator.",
      });
    }

    const currentPlanKey = normalizePlanKey(billing?.planKey);
    if (currentPlanKey === nextPlanKey) {
      return res.status(400).json({
        ok: false,
        error: "You are already on that plan.",
      });
    }

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const itemId = String(sub?.items?.data?.[0]?.id || "").trim();
    if (!itemId) {
      return res.status(400).json({
        ok: false,
        error: "Subscription item not found.",
      });
    }

    const newPriceId = getPriceId(nextPlanKey);
    if (!newPriceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for ${nextPlanKey}.`,
      });
    }

    const updated = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
      proration_behavior: "create_prorations",
      items: [
        {
          id: itemId,
          price: newPriceId,
        },
      ],
      metadata: {
        ...(sub?.metadata || {}),
        username: String(auth.user.username || "").trim(),
        email: String(auth.user.email || "").trim(),
        planKey: nextPlanKey,
        founder: "false",
        planName: PLAN_NAME_MAP[nextPlanKey],
        billingLabel: PLAN_NAME_MAP[nextPlanKey],
        offerKey: `public_${nextPlanKey}`,
        source: "account_upgrade",
      },
    });

    await markSubscriptionFromStripe({
      username: String(auth.user.username || "").trim(),
      email: String(auth.user.email || "").trim(),
      customerId: String(updated?.customer || billing?.stripeCustomerId || "").trim(),
      subscriptionId,
      priceId: String(updated?.items?.data?.[0]?.price?.id || newPriceId).trim(),
      status: String(updated?.status || "active").trim(),
      currentPeriodEnd: updated?.current_period_end
        ? new Date(Number(updated.current_period_end) * 1000).toISOString()
        : null,
    });

    return res.json({
      ok: true,
      updated: true,
      planKey: nextPlanKey,
      planName: PLAN_NAME_MAP[nextPlanKey],
      status: String(updated?.status || "active").trim(),
    });
  } catch (err) {
    console.error("[stripe] change-plan error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to change plan",
    });
  }
});

router.post("/sync-checkout-session", async (req, res) => {
  try {
    const sessionId = String(req.body?.sessionId || "").trim();

    if (!sessionId) {
      return res.status(400).json({
        ok: false,
        error: "Missing sessionId",
      });
    }

    const auth = await getSessionUser(req);
    const fallbackUser = auth?.user || null;

    const synced = await syncCheckoutSessionToUser(sessionId, fallbackUser);

    if (!synced?.ok) {
      return res.status(404).json({
        ok: false,
        error: "Could not sync checkout session to user",
        detail: synced || null,
      });
    }

    return res.json({
      ok: true,
      synced: true,
      billing: synced.billing,
      user: synced.result?.user || null,
    });
  } catch (err) {
    console.error("[stripe] sync-checkout-session error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to sync checkout session",
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
     event = stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
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
          } catch (_e) {
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
          } catch (_e) {
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
          } catch (_e) {
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