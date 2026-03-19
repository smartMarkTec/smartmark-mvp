// server/routes/stripe.js
"use strict";

const express = require("express");
const Stripe = require("stripe");

const router = express.Router();

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn("[stripe] STRIPE_SECRET_KEY is missing");
}

const stripe = new Stripe(stripeSecretKey || "", {
  apiVersion: "2025-02-24.acacia",
});

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

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    hasSecretKey: !!process.env.STRIPE_SECRET_KEY,
    clientUrl: process.env.CLIENT_URL || null,
    plans: Object.keys(PRICE_MAP),
  });
});

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
      line_items: [
        {
          price: PRICE_MAP[rawPlan],
          quantity: 1,
        },
      ],
      customer_email: email,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      success_url: `${clientUrl}/confirmation?session_id={CHECKOUT_SESSION_ID}&plan=${rawPlan}`,
      cancel_url: `${clientUrl}/pricing`,
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

module.exports = router;