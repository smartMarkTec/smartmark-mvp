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

const isProd = process.env.NODE_ENV === "production" || !!process.env.RENDER;

function computeCookieDomain() {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;

  try {
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || "";
    if (clientUrl) {
      const host = new URL(clientUrl).hostname.toLowerCase();

      if (host === "localhost") return undefined;
      if (host === "www.smartemark.com" || host === "smartemark.com") {
        return ".smartemark.com";
      }

      return host;
    }
  } catch {}

  return undefined;
}

function setSessionCookie(res, sid) {
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };

  const dom = computeCookieDomain();
  if (dom) opts.domain = dom;

  res.cookie(COOKIE_NAME, sid, opts);
}

const PLAN_NAME_MAP = {
  // Legacy plans — kept for grandfathered customers. Do NOT remove.
  starter: "Starter",
  pro: "Pro",
  operator: "Operator",
  // New plans for new customers (2026).
  base: "Base",
  deluxe: "Deluxe",
  premium: "Premium",
};

const PUBLIC_PRICE_MAP = {
  // Legacy price IDs — kept for grandfathered customers. Do NOT remove.
  starter: process.env.STRIPE_PRICE_STARTER || "",
  pro: process.env.STRIPE_PRICE_PRO || "",
  operator: process.env.STRIPE_PRICE_OPERATOR || "",
  // New price IDs for new customers. Requires STRIPE_BASE_PRICE_ID,
  // STRIPE_DELUXE_PRICE_ID, and STRIPE_PREMIUM_PRICE_ID on Render.
  base: process.env.STRIPE_BASE_PRICE_ID || "",
  deluxe: process.env.STRIPE_DELUXE_PRICE_ID || "",
  premium: process.env.STRIPE_PREMIUM_PRICE_ID || "",
};

// High-ticket test price IDs — completely separate from normal pricing.
// Existing customers and grandfathered subscriptions are never touched by this map.
const HIGH_TICKET_PRICE_MAP = {
  base: process.env.STRIPE_TEST_BASE_PRICE_ID || "price_1Tg5MPPT5b2dVWTGC9d0HbkO",
  deluxe: process.env.STRIPE_TEST_DELUXE_PRICE_ID || "price_1Tg5MqPT5b2dVWTGuc2kWk09",
  premium: process.env.STRIPE_TEST_PREMIUM_PRICE_ID || "price_1Tg5NDPT5b2dVWTGvTtDGVju",
};

// Monthly prices (used for display and metadata — not authoritative for billing).
const NORMAL_MONTHLY_PRICE = { base: 249, deluxe: 495, premium: 749 };
const HIGH_TICKET_MONTHLY_PRICE = { base: 495, deluxe: 995, premium: 1500 };

// Non-blocking informational text shown below Stripe Checkout's pay button.
const CHECKOUT_SUBMIT_TEXT =
  "By subscribing, you understand Smartemark provides monthly marketing services. " +
  "The current paid service period is non-refundable once service begins. " +
  "You will review and sign the full Smartemark Marketing Services Agreement " +
  "after checkout before onboarding starts.";

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

function normalizePricingVariant(raw) {
  const v = String(raw || "").trim().toLowerCase();
  return v === "high_ticket_test" ? "high_ticket_test" : "normal";
}

function getPriceIdForVariant(planKey, pricingVariant) {
  if (normalizePricingVariant(pricingVariant) === "high_ticket_test") {
    return String(HIGH_TICKET_PRICE_MAP[planKey] || "").trim();
  }
  return String(PUBLIC_PRICE_MAP[planKey] || "").trim();
}

function getMonthlyPrice(planKey, pricingVariant) {
  if (normalizePricingVariant(pricingVariant) === "high_ticket_test") {
    return HIGH_TICKET_MONTHLY_PRICE[planKey] || 0;
  }
  return NORMAL_MONTHLY_PRICE[planKey] || 0;
}

// Keep legacy helper for backwards compat (normal variant only)
function getPriceMap() {
  return PUBLIC_PRICE_MAP;
}

function getPriceId(planKey) {
  return getPriceIdForVariant(planKey, "normal");
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
      pricingVariant: "normal",
      monthlyPrice: NORMAL_MONTHLY_PRICE[planKey] || 0,
    };
  }

  // Register high-ticket test price IDs so webhook can identify them.
  for (const [planKey, priceId] of Object.entries(HIGH_TICKET_PRICE_MAP)) {
    if (!priceId) continue;
    const existing = out[String(priceId).trim()];
    if (!existing) {
      out[String(priceId).trim()] = {
        planKey,
        founder: false,
        hidden: false,
        planName: PLAN_NAME_MAP[planKey] || planKey,
        billingLabel: PLAN_NAME_MAP[planKey] || planKey,
        offerKey: `high_ticket_${planKey}`,
        pricingVariant: "high_ticket_test",
        monthlyPrice: HIGH_TICKET_MONTHLY_PRICE[planKey] || 0,
      };
    }
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
      pricingVariant: "normal",
      monthlyPrice: 0,
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
      pricingVariant: "normal",
      monthlyPrice: 0,
    }
  );
}

async function ensureDbShape() {
  await db.read();
  let needsWrite = false;
  if (!db.data) { db.data = {}; needsWrite = true; }
  if (!Array.isArray(db.data.users)) { db.data.users = []; needsWrite = true; }
  if (!Array.isArray(db.data.sessions)) { db.data.sessions = []; needsWrite = true; }
  if (needsWrite) await db.write();
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
  extra = {},
}) {
  const meta = derivePlanMetaFromPriceId(priceId);

  // Always update billing/subscription state fields.
  // Only overwrite identity fields (stripeCustomerId, stripeSubscriptionId,
  // stripePriceId, planKey, etc.) when the incoming value is non-empty.
  // An incomplete or non-subscription webhook (e.g. checkout.session.completed
  // for a setup_intent or one-time charge where session.subscription is null)
  // must never erase valid IDs that are already stored in DB.
  const patch = {
    provider: "stripe",
    status: String(status || "").trim(),
    hasAccess: ["active", "trialing"].includes(
      String(status || "").trim().toLowerCase()
    ),
    currentPeriodEnd: currentPeriodEnd || null,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
    ...(priceId ? { stripePriceId: priceId } : {}),
    ...(meta.planKey
      ? {
          planKey: meta.planKey,
          founder: !!meta.founder,
          hiddenPlan: !!meta.hidden,
          offerKey: meta.offerKey || "",
          planName: meta.planName || "",
          billingLabel: meta.billingLabel || "",
          // Persist pricing variant from price ID lookup if not overridden by extra
          ...(!extra?.pricingVariant && meta.pricingVariant
            ? { pricingVariant: meta.pricingVariant }
            : {}),
          ...(!extra?.monthlyPrice && meta.monthlyPrice
            ? { monthlyPrice: meta.monthlyPrice }
            : {}),
        }
      : {}),
    ...(extra && typeof extra === "object" ? extra : {}),
  };

  return await setUserBillingByIdentity({ username, email, patch });
}

async function syncCheckoutSessionToUser(sessionId, fallbackUser = null) {
  const id = String(sessionId || "").trim();
  if (!id) return { ok: false, reason: "missing_session_id" };

  const session = await stripe.checkout.sessions.retrieve(id, {
    expand: ["subscription"],
  });

  const stripeUsername = String(session?.metadata?.username || "").trim().toLowerCase();
  const stripeEmail = String(
    session?.customer_details?.email ||
      session?.customer_email ||
      session?.metadata?.email ||
      ""
  ).trim().toLowerCase();

  const fallbackUsername = String(fallbackUser?.username || "").trim().toLowerCase();
  const fallbackEmail = String(fallbackUser?.email || "").trim().toLowerCase();

  // Prefer the authenticated session user as the identity anchor.
  // stripeEmail is used only when no session exists, preventing ghost user creation
  // when the user types a different email in Stripe's hosted checkout form.
  const email = fallbackEmail || stripeEmail || fallbackUsername || stripeUsername;
  const username = fallbackUsername || email || stripeUsername || "";

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

  if (!result?.ok) {
    return {
      ok: false,
      reason: "user_not_found_after_sync",
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

  await ensureDbShape();

  const resolvedUser =
    db.data.users.find(
      (x) => String(x?.username || "").trim().toLowerCase() === String(username || "").trim().toLowerCase()
    ) ||
    db.data.users.find(
      (x) => String(x?.email || "").trim().toLowerCase() === String(email || "").trim().toLowerCase()
    ) ||
    null;

  return {
    ok: !!resolvedUser,
    result,
    user: resolvedUser
      ? {
          username: resolvedUser.username,
          email: resolvedUser.email,
        }
      : null,
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
      newPlans: {
        base: !!PUBLIC_PRICE_MAP.base,
        deluxe: !!PUBLIC_PRICE_MAP.deluxe,
        premium: !!PUBLIC_PRICE_MAP.premium,
      },
      legacyPlans: {
        starter: !!PUBLIC_PRICE_MAP.starter,
        pro: !!PUBLIC_PRICE_MAP.pro,
        operator: !!PUBLIC_PRICE_MAP.operator,
      },
    },
  });
});

/* ========= checkout-session-info (used by /post-checkout page) =========
   Returns the customer email + planKey from a completed Stripe checkout session.
   Does NOT require authentication. Only returns data from paid sessions.
   The /post-checkout page uses this to pre-fill the email in the account creation form. */
router.get("/checkout-session-info", async (req, res) => {
  try {
    const sessionId = String(req.query?.session_id || "").trim();
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: "Missing session_id" });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return res.status(400).json({ ok: false, error: "Payment not completed" });
    }

    const email = String(
      session?.customer_details?.email ||
        session?.customer_email ||
        session?.metadata?.email ||
        ""
    )
      .trim()
      .toLowerCase();

    const planKey = String(session?.metadata?.planKey || req.query?.plan || "").trim();

    return res.json({ ok: true, email, planKey, sessionId });
  } catch (err) {
    console.error("[stripe] checkout-session-info error:", err);
    return res.status(500).json({ ok: false, error: err?.message || "Failed to retrieve session" });
  }
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
    const pricingVariant = normalizePricingVariant(req.body?.pricingVariant);
    const pricingMarket = ["service", "tech"].includes(String(req.body?.pricingMarket || "").trim())
      ? String(req.body.pricingMarket).trim()
      : "tech";

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Valid plans: base, deluxe, premium.",
      });
    }

    const priceId = getPriceIdForVariant(planKey, pricingVariant);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for plan "${planKey}" (variant: ${pricingVariant}). Set the corresponding env var on the server.`,
      });
    }

    const monthlyPrice = getMonthlyPrice(planKey, pricingVariant);
    const clientUrl = getClientUrl(req);
    const cancelPath = pricingVariant === "high_ticket_test" ? "/pricing-test" : "/pricing";

    const successUrl = `${clientUrl}/post-checkout?session_id={CHECKOUT_SESSION_ID}&plan=${planKey}`;
    const cancelUrl = `${clientUrl}${cancelPath}?checkout=cancelled&plan=${planKey}`;

    const sharedMeta = {
      username: email || "",
      email: email || "",
      planKey,
      founder: "false",
      planName: PLAN_NAME_MAP[planKey],
      billingLabel: PLAN_NAME_MAP[planKey],
      offerKey: pricingVariant === "high_ticket_test" ? `high_ticket_${planKey}` : `public_${planKey}`,
      pricingVariant,
      pricingMarket,
      monthlyPrice: String(monthlyPrice),
      source: launchIntent ? "campaign_setup_launch_gate" : (pricingVariant === "high_ticket_test" ? "high_ticket_pricing_page" : "public_pricing_page"),
      sid: getSidFromReq(req) || "",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: successUrl,
      cancel_url: cancelUrl,
      custom_text: { submit: { message: CHECKOUT_SUBMIT_TEXT } },
      metadata: sharedMeta,
      subscription_data: {
        metadata: { ...sharedMeta },
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

    // Diagnostic: always log DB billing state so Render logs show the full picture.
    console.log("[stripe] billing-status:", {
      u: auth.user.username,
      dbPlanKey: billing.planKey || "(empty)",
      dbHasAccess: billing.hasAccess,
      dbStatus: billing.status || "(empty)",
      dbSubId: billing.stripeSubscriptionId
        ? `…${String(billing.stripeSubscriptionId).slice(-8)}`
        : "(none)",
      dbPriceId: billing.stripePriceId
        ? `…${String(billing.stripePriceId).slice(-8)}`
        : "(none)",
      dbCustId: billing.stripeCustomerId
        ? `…${String(billing.stripeCustomerId).slice(-8)}`
        : "(none)",
    });

    // Recovery: if planKey is missing, try two sources in order.
    // Source A: env-var price-ID map (fast, no network call).
    // Source B: live Stripe subscription metadata (authoritative, env-var independent).
    // Both paths persist the recovered value so all downstream plan-limit checks
    // (campaign cap, optimizer tier, image gen) read the correct plan from DB.
    // All three fields (planKey, planName, billingLabel) are tracked so the response
    // is fully correct even before the DB write completes.
    let effectivePlanKey = billing.planKey || "";
    let effectivePlanName = billing.planName || "";
    let effectiveBillingLabel = billing.billingLabel || "";

    // Source A: env-var price-ID map
    if (!effectivePlanKey && billing.stripePriceId) {
      const derived = derivePlanMetaFromPriceId(billing.stripePriceId);
      if (derived.planKey) {
        effectivePlanKey = derived.planKey;
        effectivePlanName = derived.planName || billing.planName || "";
        effectiveBillingLabel = derived.billingLabel || billing.billingLabel || "";
        try {
          await setUserBillingByIdentity({
            username: auth.user.username,
            email: auth.user.email,
            patch: {
              planKey: derived.planKey,
              planName: effectivePlanName,
              billingLabel: effectiveBillingLabel,
            },
          });
          console.log("[stripe] billing-status: source-A recovered →", derived.planKey, "for", auth.user.username);
        } catch (persistErr) {
          console.warn("[stripe] billing-status: source-A persist failed:", persistErr?.message);
        }
      } else {
        console.log("[stripe] billing-status: source-A failed — priceId not in env map:", billing.stripePriceId.slice(-8));
      }
    }

    // Source B: live Stripe subscription metadata (fires when Source A fails —
    // e.g. STRIPE_PRICE_* env vars missing or mismatched).
    // The planKey was embedded in subscription_data.metadata at checkout creation
    // so it is always present regardless of env var state.
    // Condition uses status in addition to hasAccess in case hasAccess was
    // incorrectly stored as false while subscription status is still active.
    const _subId = String(billing.stripeSubscriptionId || "").trim();
    const _isActiveInStripe =
      billing.hasAccess ||
      ["active", "trialing"].includes(String(billing.status || "").trim().toLowerCase());

    if (!effectivePlanKey && _isActiveInStripe && _subId) {
      try {
        console.log("[stripe] billing-status: source-B fetching live sub…", _subId.slice(-8));
        const liveSub = await stripe.subscriptions.retrieve(_subId);
        const fromMeta = String(liveSub?.metadata?.planKey || "").trim().toLowerCase();
        console.log("[stripe] billing-status: source-B sub.metadata.planKey =", fromMeta || "(empty)");
        if (PLAN_NAME_MAP[fromMeta]) {
          effectivePlanKey = fromMeta;
          effectivePlanName = PLAN_NAME_MAP[fromMeta] || fromMeta;
          effectiveBillingLabel = PLAN_NAME_MAP[fromMeta] || fromMeta;
          const livePriceId = String(liveSub?.items?.data?.[0]?.price?.id || "").trim();
          try {
            await setUserBillingByIdentity({
              username: auth.user.username,
              email: auth.user.email,
              patch: {
                planKey: fromMeta,
                planName: effectivePlanName,
                billingLabel: effectiveBillingLabel,
                ...(livePriceId ? { stripePriceId: livePriceId } : {}),
              },
            });
            console.log("[stripe] billing-status: source-B recovered →", fromMeta, "for", auth.user.username);
          } catch (persistErr) {
            console.warn("[stripe] billing-status: source-B persist failed:", persistErr?.message);
          }
        } else {
          console.warn("[stripe] billing-status: source-B sub metadata has no valid planKey for", auth.user.username);
        }
      } catch (subErr) {
        console.warn("[stripe] billing-status: source-B Stripe fetch failed:", subErr?.message);
      }
    }

    // Source C: Stripe customer subscription list (fires when subId AND priceId are
    // both missing — i.e. a bad webhook erased them — but stripeCustomerId survived).
    // Lists the customer's active subscriptions directly from Stripe and restores
    // all three identity fields (subId, priceId, planKey) in one pass.
    const _customerId = String(billing.stripeCustomerId || "").trim();
    if (!effectivePlanKey && _isActiveInStripe && !_subId && _customerId) {
      try {
        console.log("[stripe] billing-status: source-C listing subs for cust…", _customerId.slice(-8));
        const subList = await stripe.subscriptions.list({
          customer: _customerId,
          status: "active",
          limit: 1,
        });
        const liveSub = subList?.data?.[0] || null;
        if (liveSub) {
          const fromMeta = String(liveSub?.metadata?.planKey || "").trim().toLowerCase();
          const foundSubId = String(liveSub?.id || "").trim();
          const foundPriceId = String(liveSub?.items?.data?.[0]?.price?.id || "").trim();
          console.log("[stripe] billing-status: source-C sub=…", foundSubId.slice(-8), "planKey=", fromMeta || "(empty)");

          const recoveryPatch = {};
          if (foundSubId) recoveryPatch.stripeSubscriptionId = foundSubId;
          if (foundPriceId) recoveryPatch.stripePriceId = foundPriceId;

          if (PLAN_NAME_MAP[fromMeta]) {
            effectivePlanKey = fromMeta;
            effectivePlanName = PLAN_NAME_MAP[fromMeta] || fromMeta;
            effectiveBillingLabel = PLAN_NAME_MAP[fromMeta] || fromMeta;
            recoveryPatch.planKey = fromMeta;
            recoveryPatch.planName = effectivePlanName;
            recoveryPatch.billingLabel = effectiveBillingLabel;
          }

          if (Object.keys(recoveryPatch).length > 0) {
            try {
              await setUserBillingByIdentity({
                username: auth.user.username,
                email: auth.user.email,
                patch: recoveryPatch,
              });
              console.log("[stripe] billing-status: source-C recovered for", auth.user.username, "→ planKey=", effectivePlanKey || "(ids restored, plan unknown)");
            } catch (persistErr) {
              console.warn("[stripe] billing-status: source-C persist failed:", persistErr?.message);
            }
          }
        } else {
          console.warn("[stripe] billing-status: source-C no active sub found for cust…", _customerId.slice(-8));
        }
      } catch (subErr) {
        console.warn("[stripe] billing-status: source-C list failed:", subErr?.message);
      }
    }

    console.log("[stripe] billing-status: returning planKey =", effectivePlanKey || "(empty)", "for", auth.user.username);

    // Infer monthlyPrice from price ID if not stored
    let effectiveMonthlyPrice = Number(billing.monthlyPrice || 0);
    if (!effectiveMonthlyPrice && billing.stripePriceId) {
      const derived = derivePlanMetaFromPriceId(billing.stripePriceId);
      if (derived.monthlyPrice) effectiveMonthlyPrice = derived.monthlyPrice;
    }

    // Infer pricingVariant from price ID if not stored
    const effectivePricingVariant = billing.pricingVariant ||
      (billing.stripePriceId ? derivePlanMetaFromPriceId(billing.stripePriceId).pricingVariant : "normal") ||
      "normal";

    return res.json({
      ok: true,
      authenticated: true,
      user: {
        username: auth.user.username,
        email: auth.user.email,
      },
      billing: {
        provider: billing.provider || "",
        planKey: effectivePlanKey,
        planName: effectivePlanName,
        billingLabel: effectiveBillingLabel,
        founder: !!billing.founder,
        hiddenPlan: !!billing.hiddenPlan,
        offerKey: billing.offerKey || "",
        status: billing.status || "",
        hasAccess: !!billing.hasAccess,
        currentPeriodEnd: billing.currentPeriodEnd || null,
        stripeCustomerId: billing.stripeCustomerId || "",
        stripeSubscriptionId: billing.stripeSubscriptionId || "",
        stripePriceId: billing.stripePriceId || "",
        pricingVariant: effectivePricingVariant,
        monthlyPrice: effectiveMonthlyPrice,
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
    const pricingVariant = normalizePricingVariant(req.body?.pricingVariant);
    const pricingMarket = ["service", "tech"].includes(String(req.body?.pricingMarket || "").trim())
      ? String(req.body.pricingMarket).trim()
      : "tech";

    if (!planKey || !PLAN_NAME_MAP[planKey]) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan. Valid plans: base, deluxe, premium.",
      });
    }

    const priceId = getPriceIdForVariant(planKey, pricingVariant);
    if (!priceId) {
      return res.status(400).json({
        ok: false,
        error: `Missing Stripe price for plan "${planKey}" (variant: ${pricingVariant}). Set the corresponding env var on the server.`,
      });
    }

    const monthlyPrice = getMonthlyPrice(planKey, pricingVariant);
    const clientUrl = getClientUrl(req);
    const username = String(auth.user.username || "").trim();
    const email = String(auth.user.email || "").trim();

    const sharedMeta = {
      username,
      email,
      planKey,
      founder: "false",
      planName: PLAN_NAME_MAP[planKey],
      billingLabel: PLAN_NAME_MAP[planKey],
      offerKey: pricingVariant === "high_ticket_test" ? `high_ticket_${planKey}` : `public_${planKey}`,
      pricingVariant,
      pricingMarket,
      monthlyPrice: String(monthlyPrice),
      source: "campaign_setup",
      sid: getSidFromReq(req) || "",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${clientUrl}/setup?checkout=success&session_id={CHECKOUT_SESSION_ID}&launch_intent=1&plan=${planKey}`,
      cancel_url: `${clientUrl}/setup?billing_cancelled=1&plan=${planKey}`,
      custom_text: { submit: { message: CHECKOUT_SUBMIT_TEXT } },
      metadata: sharedMeta,
      subscription_data: {
        metadata: { ...sharedMeta },
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
    // Build public plan meta from PLAN_NAME_MAP so new plans are automatically supported.
    const publicPlanKey = offerKey.startsWith("public_") ? offerKey.slice("public_".length) : "";
    const publicMeta =
      publicPlanKey && PLAN_NAME_MAP[publicPlanKey]
        ? {
            planKey: publicPlanKey,
            planName: PLAN_NAME_MAP[publicPlanKey],
            billingLabel: PLAN_NAME_MAP[publicPlanKey],
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
        error: "Invalid plan. Valid plans: base, deluxe, premium (or legacy: starter, pro, operator).",
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

    if (!synced?.ok || !synced?.user?.username) {
      return res.status(404).json({
        ok: false,
        error: "Could not sync checkout session to user",
        detail: synced || null,
      });
    }

    await ensureDbShape();

    const sid = `sm_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

    db.data.sessions.push({
      sid,
      username: String(synced.user.username || "").trim(),
    });

    await db.write();
    setSessionCookie(res, sid);

    return res.json({
      ok: true,
      synced: true,
      sessionCreated: true,
      newSid: sid,
      billing: synced.billing,
      user: synced.user,
    });
  } catch (err) {
    console.error("[stripe] sync-checkout-session error:", err);
    return res.status(500).json({
      ok: false,
      error: err?.message || "Failed to sync checkout session",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/stripe/create-portal-session
// Creates a Stripe Customer Portal session for the currently logged-in user.
// Returns { ok, url } — the frontend should redirect to url.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/create-portal-session", async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ ok: false, error: "Stripe is not configured." });
    }

    const result = await getAuthenticatedBilling(req);
    if (!result.ok) {
      return res.status(result.status).json({ ok: false, error: result.error });
    }

    const { billing } = result;
    const customerId = String(billing?.stripeCustomerId || "").trim();
    if (!customerId) {
      return res.status(400).json({ ok: false, error: "No Stripe customer found for this account." });
    }

    const clientUrl = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || "https://smartmark-mvp.onrender.com";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${clientUrl}/settings`,
    });

    return res.json({ ok: true, url: session.url });
  } catch (err) {
    console.error("[stripe] create-portal-session error:", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || "Failed to create portal session." });
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

        const username = String(session?.metadata?.username || "").trim().toLowerCase();
        const email = String(
          session?.customer_details?.email ||
            session?.customer_email ||
            session?.metadata?.email ||
            ""
        ).trim().toLowerCase();

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

        const sessionPricingVariant = normalizePricingVariant(session?.metadata?.pricingVariant);
        const sessionMonthlyPrice = Number(session?.metadata?.monthlyPrice || 0) || undefined;

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status: subscriptionStatus,
          currentPeriodEnd,
          extra: {
            pricingVariant: sessionPricingVariant,
            ...(sessionMonthlyPrice ? { monthlyPrice: sessionMonthlyPrice } : {}),
            planStartedAt: new Date().toISOString(),
          },
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

        let invoicePricingVariant = "normal";
        let invoiceMonthlyPrice = 0;

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
            invoicePricingVariant = normalizePricingVariant(sub?.metadata?.pricingVariant);
            invoiceMonthlyPrice = Number(sub?.metadata?.monthlyPrice || 0) || 0;
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
          extra: {
            pricingVariant: invoicePricingVariant,
            ...(invoiceMonthlyPrice ? { monthlyPrice: invoiceMonthlyPrice } : {}),
          },
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
        const hostedInvoiceUrl = String(invoice?.hosted_invoice_url || "").trim();

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

        // Fallback: if invoice had no subscription ID, find the customer's sub by customerId
        if (!subscriptionId && customerId) {
          try {
            const subList = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
            const foundSub = subList?.data?.[0];
            if (foundSub) {
              if (!priceId) priceId = String(foundSub?.items?.data?.[0]?.price?.id || "").trim();
              if (!currentPeriodEnd) currentPeriodEnd = foundSub?.current_period_end
                ? new Date(Number(foundSub.current_period_end) * 1000).toISOString()
                : null;
              if (!username) username = String(foundSub?.metadata?.username || "").trim();
              if (!email) email = String(foundSub?.metadata?.email || "").trim();
            }
          } catch (_e) {
            console.warn("[stripe webhook] could not list subs for customer on payment_failed");
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
          extra: {
            lastPaymentStatus: "failed",
            lastPaymentFailedAt: new Date().toISOString(),
            ...(hostedInvoiceUrl ? { hostedInvoiceUrl } : {}),
          },
        });

        console.log("[stripe webhook] invoice.payment_failed", {
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          hostedInvoiceUrl,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = String(subscription?.id || "").trim();
        const customerId = String(subscription?.customer || "").trim();
        const username = String(subscription?.metadata?.username || "").trim().toLowerCase();
        const email = String(subscription?.metadata?.email || "").trim().toLowerCase();
        const priceId = String(subscription?.items?.data?.[0]?.price?.id || "").trim();
        const status = String(subscription?.status || "").trim();
        const currentPeriodEnd = subscription?.current_period_end
          ? new Date(Number(subscription.current_period_end) * 1000).toISOString()
          : null;
        const subPricingVariant = normalizePricingVariant(subscription?.metadata?.pricingVariant);
        const subMonthlyPrice = Number(subscription?.metadata?.monthlyPrice || 0) || 0;

        await markSubscriptionFromStripe({
          username,
          email,
          customerId,
          subscriptionId,
          priceId,
          status,
          currentPeriodEnd,
          extra: {
            pricingVariant: subPricingVariant,
            ...(subMonthlyPrice ? { monthlyPrice: subMonthlyPrice } : {}),
          },
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