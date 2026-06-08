// server/routes/agreement.js
'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');

const COOKIE_NAME = 'sm_sid';
const SID_HEADER  = 'x-sm-sid';
const AGREEMENT_VERSION = 'smartemark_msa_v1';

const PLAN_LABEL = { base: 'Base', deluxe: 'Deluxe', premium: 'Premium', operator: 'Premium', starter: 'Base', pro: 'Deluxe' };
const VARIANT_LABEL = { high_ticket_test: 'Growth Plan Pricing', normal: 'Standard Pricing' };

function getSid(req) {
  return (
    req.cookies?.[COOKIE_NAME] ||
    req.get(SID_HEADER) ||
    String(req.query?.sm_sid || '').trim() ||
    ''
  ).trim();
}

function ownerKey(req) {
  const sid = getSid(req);
  try {
    const sess = db?.data?.sessions?.find((s) => String(s.sid) === sid);
    const u = sess?.username ? String(sess.username).trim() : '';
    if (u) return `user:${u}`;
  } catch {}
  return sid || `ip:${req.ip}`;
}

async function ensureDB() {
  try { await db.read(); } catch {}
  db.data = db.data || {};
  db.data.users    = Array.isArray(db.data.users)    ? db.data.users    : [];
  db.data.sessions = Array.isArray(db.data.sessions) ? db.data.sessions : [];
}

async function findUser(oKey) {
  await ensureDB();
  const key = String(oKey || '').trim();
  if (!key) return null;
  if (key.startsWith('user:')) {
    const u = key.slice(5);
    return db.data.users.find((x) => String(x?.username || '').trim() === u) || null;
  }
  const sess = db.data.sessions.find((s) => String(s?.sid || '').trim() === key);
  if (!sess?.username) return null;
  return db.data.users.find((x) => String(x?.username || '').trim() === String(sess.username).trim()) || null;
}

// ── GET /api/agreement/status ─────────────────────────────────────────────────
router.get('/agreement/status', async (req, res) => {
  try {
    const user = await findUser(ownerKey(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const billing = user.billing || {};
    const signed = !!user.agreement?.signedAt;
    // Grandfathered = already completed intake before this feature launched (no forced re-sign)
    const grandfathered = !signed && !!user.premiumIntake?.submittedAt;

    const planKey = String(billing.planKey || '').trim().toLowerCase();
    const monthlyPrice = Number(billing.monthlyPrice || 0);
    const pricingVariant = String(billing.pricingVariant || 'normal').trim();

    return res.json({
      ok: true,
      signed,
      grandfathered,
      hasAccess: !!billing.hasAccess,
      planKey,
      planLabel: PLAN_LABEL[planKey] || planKey || '—',
      monthlyPrice,
      pricingVariant,
      variantLabel: VARIANT_LABEL[pricingVariant] || 'Standard Pricing',
      stripeCustomerId:     String(billing.stripeCustomerId     || '').trim(),
      stripeSubscriptionId: String(billing.stripeSubscriptionId || '').trim(),
      stripePriceId:        String(billing.stripePriceId        || '').trim(),
      // If already signed, surface key fields for reference
      ...(signed ? {
        signerName:  user.agreement.signerName  || '',
        signedAt:    user.agreement.signedAt    || '',
        businessName: user.agreement.businessName || '',
      } : {}),
    });
  } catch (err) {
    console.error('[agreement] status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load agreement status.' });
  }
});

// ── POST /api/agreement/accept ────────────────────────────────────────────────
router.post('/agreement/accept', express.json({ limit: '1mb' }), async (req, res) => {
  try {
    const user = await findUser(ownerKey(req));
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const billing = user.billing || {};
    if (!billing.hasAccess) {
      return res.status(403).json({ ok: false, error: 'No active subscription.' });
    }

    const {
      businessName,
      signerName,
      signerTitle,
      signerEmail,
      electronicSignature,
      checkboxAccepted,
      agreementVersion,
      agreementTextSnapshot,
      selectedPlan,
      monthlyPrice,
      pricingVariant,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
    } = req.body || {};

    if (!businessName)        return res.status(400).json({ ok: false, error: 'Business name required.' });
    if (!signerName)          return res.status(400).json({ ok: false, error: 'Signer name required.' });
    if (!signerEmail)         return res.status(400).json({ ok: false, error: 'Signer email required.' });
    if (!electronicSignature) return res.status(400).json({ ok: false, error: 'Electronic signature required.' });
    if (!checkboxAccepted)    return res.status(400).json({ ok: false, error: 'Checkbox acceptance required.' });

    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';

    user.agreement = {
      businessName:       String(businessName       || '').trim(),
      signerName:         String(signerName         || '').trim(),
      signerTitle:        String(signerTitle        || '').trim(),
      signerEmail:        String(signerEmail        || '').trim(),
      electronicSignature:String(electronicSignature|| '').trim(),
      checkboxAccepted:   true,
      agreementVersion:   String(agreementVersion   || AGREEMENT_VERSION).trim(),
      agreementTextSnapshot: typeof agreementTextSnapshot === 'string'
        ? agreementTextSnapshot.slice(0, 20000)
        : '',
      selectedPlan:         String(selectedPlan  || billing.planKey || '').trim(),
      monthlyPrice:         Number(monthlyPrice  || billing.monthlyPrice || 0),
      pricingVariant:       String(pricingVariant|| billing.pricingVariant || 'normal').trim(),
      stripeCustomerId:     String(stripeCustomerId     || billing.stripeCustomerId     || '').trim(),
      stripeSubscriptionId: String(stripeSubscriptionId || billing.stripeSubscriptionId || '').trim(),
      stripePriceId:        String(stripePriceId        || billing.stripePriceId        || '').trim(),
      signedAt:  new Date().toISOString(),
      ip,
      userAgent,
    };

    await db.write();

    console.log(`[agreement] signed by ${user.username} | plan=${user.agreement.selectedPlan} | price=${user.agreement.monthlyPrice} | variant=${user.agreement.pricingVariant}`);

    return res.json({ ok: true, signedAt: user.agreement.signedAt });
  } catch (err) {
    console.error('[agreement] accept error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to save agreement.' });
  }
});

module.exports = router;
