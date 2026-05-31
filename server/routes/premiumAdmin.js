// server/routes/premiumAdmin.js
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { secureHeaders, basicRateLimit, basicAuth } = require('../middleware/security');

// ── Session helpers (same read-only pattern as auth.js) ──────────────────────
const COOKIE_NAME = 'sm_sid';
const SID_HEADER = 'x-sm-sid';
const ADMIN_USERNAME = process.env.ADMIN_BYPASS_USERNAME || 'TheBoss';

function getSidFromReq(req) {
  return (
    req.cookies?.[COOKIE_NAME] ||
    req.get(SID_HEADER) ||
    String(req.query?.sm_sid || '').trim() ||
    ''
  ).trim();
}

function ownerKeyFromReq(req) {
  const sid = getSidFromReq(req);
  try {
    const sess = db?.data?.sessions?.find((s) => String(s.sid) === sid);
    const username = sess?.username ? String(sess.username).trim() : '';
    if (username) return `user:${username}`;
  } catch {}
  return sid || `ip:${req.ip}`;
}

async function ensureDB() {
  try { await db.read(); } catch {}
  db.data = db.data || {};
  db.data.users = Array.isArray(db.data.users) ? db.data.users : [];
  db.data.sessions = Array.isArray(db.data.sessions) ? db.data.sessions : [];
  db.data.campaign_creatives = Array.isArray(db.data.campaign_creatives)
    ? db.data.campaign_creatives
    : [];
}

async function findUserByOwnerKey(ownerKey) {
  await ensureDB();
  const key = String(ownerKey || '').trim();
  if (!key) return null;
  if (key.startsWith('user:')) {
    const username = key.slice(5).trim();
    return (db.data.users || []).find((u) => String(u?.username || '').trim() === username) || null;
  }
  const sess = (db.data.sessions || []).find((s) => String(s?.sid || '').trim() === key) || null;
  if (!sess?.username) return null;
  return (
    (db.data.users || []).find(
      (u) => String(u?.username || '').trim() === String(sess.username || '').trim()
    ) || null
  );
}

async function findUserByUsername(username) {
  await ensureDB();
  const u = String(username || '').trim();
  if (!u) return null;
  return (db.data.users || []).find((user) => String(user?.username || '').trim() === u) || null;
}

// ── Admin check (local to this feature) ──────────────────────────────────────
function isAdminUser(user) {
  if (!user) return false;
  return (
    user.role === 'admin' ||
    String(user.username || '').trim() === ADMIN_USERNAME ||
    String(user?.billing?.planKey || '').trim().toLowerCase() === 'operator'
  );
}

async function requireAdmin(req, res, next) {
  const ownerKey = ownerKeyFromReq(req);
  const user = await findUserByOwnerKey(ownerKey);
  if (!user || !isAdminUser(user)) {
    return res.status(403).json({ ok: false, error: 'Admin access required.' });
  }
  req._adminUser = user;
  next();
}

// ── Premium intake plan check (local to this feature only) ───────────────────
function canSubmitPremiumIntake(user) {
  if (!user) return false;
  if (isAdminUser(user)) return true;
  const s = String(user?.billing?.planKey || '').trim().toLowerCase();
  return s === 'premium' || s === 'operator';
}

// ── Onboarding checklist ──────────────────────────────────────────────────────
const ONBOARDING_FIELDS = [
  'intake_completed',
  'facebook_connected',
  'website_access_received',
  'meta_pixel_setup',
  'ga4_setup',
  'call_tracking_setup',
  'conversion_tracking_setup',
  'campaign_created',
  'campaign_launched',
  'monthly_report_sent',
];

function defaultOnboarding() {
  return Object.fromEntries([
    ...ONBOARDING_FIELDS.map((f) => [f, false]),
    ['updatedAt', new Date().toISOString()],
  ]);
}

// ── Rate limits ───────────────────────────────────────────────────────────────
const limitIntake = basicRateLimit({ windowMs: 60 * 1000, max: 10 });
const limitAdmin = basicRateLimit({ windowMs: 60 * 1000, max: 60 });

router.use(secureHeaders());
router.use(basicAuth());

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/premium-intake
// ─────────────────────────────────────────────────────────────────────────────
router.post('/premium-intake', limitIntake, async (req, res) => {
  try {
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
    }
    if (!canSubmitPremiumIntake(user)) {
      return res.status(403).json({
        ok: false,
        error: 'Premium intake is for Premium plan customers.',
      });
    }

    const b = req.body || {};
    const required = ['businessName', 'websiteUrl', 'mainPhone', 'serviceArea', 'mainServices', 'bestContactName', 'bestContactEmail'];
    const missing = required.filter((k) => !String(b[k] || '').trim());
    if (missing.length) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.', missing });
    }

    await ensureDB();
    const idx = db.data.users.findIndex(
      (u) => String(u?.username || '').trim() === String(user.username || '').trim()
    );
    if (idx === -1) return res.status(500).json({ ok: false, error: 'User record not found.' });

    const now = new Date().toISOString();

    db.data.users[idx].premiumIntake = {
      businessName:                   String(b.businessName || '').trim(),
      websiteUrl:                     String(b.websiteUrl || '').trim(),
      mainPhone:                      String(b.mainPhone || '').trim(),
      serviceArea:                    String(b.serviceArea || '').trim(),
      mainServices:                   String(b.mainServices || '').trim(),
      currentSpecialOrOffer:          String(b.currentSpecialOrOffer || '').trim(),
      preferredAdBudget:              String(b.preferredAdBudget || '').trim(),
      facebookPageUrl:                String(b.facebookPageUrl || '').trim(),
      facebookAdAccountNotes:         String(b.facebookAdAccountNotes || '').trim(),
      websitePlatform:                String(b.websitePlatform || '').trim(),
      websiteLoginOrWebPersonContact: String(b.websiteLoginOrWebPersonContact || '').trim(),
      bestContactName:                String(b.bestContactName || '').trim(),
      bestContactEmail:               String(b.bestContactEmail || '').trim(),
      bestContactPhone:               String(b.bestContactPhone || '').trim(),
      additionalNotes:                String(b.additionalNotes || '').trim(),
      submittedAt: db.data.users[idx].premiumIntake?.submittedAt || now,
      updatedAt: now,
    };

    db.data.users[idx].onboarding = {
      ...(db.data.users[idx].onboarding || defaultOnboarding()),
      intake_completed: true,
      updatedAt: now,
    };

    await db.write();
    return res.json({ ok: true, message: 'Premium intake saved.' });
  } catch (err) {
    console.error('[PremiumIntake] error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

// ── GET /api/premium-intake/status — lets frontend check if already submitted ─
router.get('/premium-intake/status', async (req, res) => {
  try {
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false });
    return res.json({
      ok: true,
      submitted: !!user.premiumIntake?.submittedAt,
      businessName: user.premiumIntake?.businessName || null,
    });
  } catch {
    return res.status(500).json({ ok: false });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients', limitAdmin, requireAdmin, async (_req, res) => {
  try {
    await ensureDB();
    const users = db.data.users || [];

    const clients = users
      .filter((u) => u && !isAdminUser(u))
      .map((u) => {
        const ownerKey = `user:${String(u.username || '').trim()}`;
        const fbConnected = !!getFbUserToken(ownerKey);
        const campaigns = (db.data.campaign_creatives || []).filter(
          (c) => String(c?.ownerKey || '').trim() === ownerKey
        );
        const onboarding = u.onboarding || {};
        const done = ONBOARDING_FIELDS.filter((f) => !!onboarding[f]).length;

        return {
          id: encodeURIComponent(u.username),
          username: u.username,
          email: u.email || u.username,
          displayName: u.displayName || u.email || u.username,
          planKey: String(u.billing?.planKey || '').trim() || 'none',
          hasAccess: !!u.billing?.hasAccess,
          billingStatus: String(u.billing?.status || '').trim(),
          intakeSubmitted: !!u.premiumIntake?.submittedAt,
          businessName: u.premiumIntake?.businessName || null,
          fbConnected,
          campaignCount: campaigns.length,
          activeCampaignCount: campaigns.filter((c) => c?.status === 'ACTIVE').length,
          checklistProgress: `${done}/${ONBOARDING_FIELDS.length}`,
          checklistDone: done,
          checklistTotal: ONBOARDING_FIELDS.length,
          createdAt: u.createdAt || null,
        };
      });

    return res.json({ ok: true, clients });
  } catch (err) {
    console.error('[Admin] clients error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load clients.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const ownerKey = `user:${String(user.username || '').trim()}`;
    const fbConnected = !!getFbUserToken(ownerKey);
    const campaigns = (db.data.campaign_creatives || [])
      .filter((c) => String(c?.ownerKey || '').trim() === ownerKey)
      .map((c) => ({
        campaignId: c.campaignId,
        accountId: c.accountId,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        launchComplete: !!c.launchComplete,
      }));

    return res.json({
      ok: true,
      client: {
        id: encodeURIComponent(user.username),
        username: user.username,
        email: user.email || user.username,
        displayName: user.displayName || user.email || user.username,
        planKey: String(user.billing?.planKey || '').trim() || 'none',
        hasAccess: !!user.billing?.hasAccess,
        billingStatus: String(user.billing?.status || '').trim(),
        createdAt: user.createdAt || null,
        fbConnected,
        premiumIntake: user.premiumIntake || null,
        onboarding: user.onboarding || defaultOnboarding(),
        campaigns,
      },
    });
  } catch (err) {
    console.error('[Admin] client detail error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load client.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/clients/:id/onboarding-status
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/admin/clients/:id/onboarding-status', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    await ensureDB();

    const idx = db.data.users.findIndex(
      (u) => String(u?.username || '').trim() === username
    );
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const updates = req.body || {};
    const validUpdates = {};
    for (const field of ONBOARDING_FIELDS) {
      if (field in updates) validUpdates[field] = !!updates[field];
    }

    db.data.users[idx].onboarding = {
      ...(db.data.users[idx].onboarding || defaultOnboarding()),
      ...validUpdates,
      updatedAt: new Date().toISOString(),
    };

    await db.write();
    return res.json({ ok: true, onboarding: db.data.users[idx].onboarding });
  } catch (err) {
    console.error('[Admin] onboarding-status error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to update onboarding status.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:id/facebook-info
// Returns ad account info ONLY — token is never sent to frontend
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id/facebook-info', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const ownerKey = `user:${String(user.username || '').trim()}`;
    const token = getFbUserToken(ownerKey);

    if (!token) {
      return res.json({ ok: true, fbConnected: false, adAccounts: [], pages: [], ownerKey });
    }

    try {
      const [acctRes, pagesRes] = await Promise.all([
        axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
          params: { fields: 'id,name,account_status', access_token: token },
          timeout: 10000,
        }),
        axios.get('https://graph.facebook.com/v18.0/me/accounts', {
          params: { fields: 'id,name', access_token: token },
          timeout: 10000,
        }),
      ]);

      const adAccounts = (acctRes.data?.data || []).map((a) => ({
        id: a.id,
        name: a.name || '',
        status: a.account_status,
      }));
      const pages = (pagesRes.data?.data || []).map((p) => ({
        id: p.id,
        name: p.name || '',
      }));

      return res.json({ ok: true, fbConnected: true, adAccounts, pages, ownerKey });
    } catch (fbErr) {
      const fbMsg = fbErr?.response?.data?.error?.message || 'Could not fetch ad account info.';
      return res.json({ ok: true, fbConnected: true, fbError: fbMsg, adAccounts: [], pages: [], ownerKey });
    }
  } catch (err) {
    console.error('[Admin] facebook-info error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to fetch Facebook info.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/launch-campaign
// Admin-only. Forwards to existing launch route using client's stored FB token.
// The existing /auth/facebook/adaccount/:id/launch-campaign route already
// supports `ownerKey` in the body for token resolution (preferredOwnerKey).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/launch-campaign', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const clientOwnerKey = `user:${String(user.username || '').trim()}`;

    const clientToken = getFbUserToken(clientOwnerKey);
    if (!clientToken) {
      return res.status(400).json({
        ok: false,
        error: 'Client does not have Facebook connected. They must connect Facebook first from their account.',
      });
    }

    const { adAccountId, ...campaignBody } = req.body || {};
    if (!adAccountId) {
      return res.status(400).json({ ok: false, error: 'adAccountId is required.' });
    }

    const normalizedAccountId = String(adAccountId).replace(/^act_/, '');
    const selfBase =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_BASE_URL ||
      `http://localhost:${process.env.PORT || 3001}`;

    const adminSid = getSidFromReq(req);

    const launchRes = await axios.post(
      `${selfBase}/auth/facebook/adaccount/${normalizedAccountId}/launch-campaign`,
      {
        ...campaignBody,
        ownerKey: clientOwnerKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [SID_HEADER]: adminSid,
          Cookie: req.headers.cookie || '',
        },
        timeout: 90000,
      }
    );

    return res.json({ ok: true, ...launchRes.data });
  } catch (err) {
    const upstream = err?.response?.data;
    if (upstream) {
      console.error('[Admin] launch upstream error:', upstream);
      return res.status(err.response?.status || 500).json({
        ok: false,
        error: upstream?.error || 'Launch failed.',
        upstream,
      });
    }
    console.error('[Admin] launch error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Campaign launch failed. Please try again.' });
  }
});

module.exports = router;
