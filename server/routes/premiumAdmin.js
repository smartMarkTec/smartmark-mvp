// server/routes/premiumAdmin.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { secureHeaders, basicRateLimit, basicAuth } = require('../middleware/security');
const { META_API_VERSION } = require('../metaConfig');

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
  return user.role === 'admin' || String(user.username || '').trim() === ADMIN_USERNAME;
}

async function requireAdmin(req, res, next) {
  await ensureDB(); // load sessions/users before ownerKey lookup
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

// Helper: build the intake object from request body (shared by normal + admin routes)
function buildIntakeFromBody(b, existingIntake) {
  const now = new Date().toISOString();
  return {
    // Business basics
    businessName:                   String(b.businessName || '').trim(),
    websiteUrl:                     String(b.websiteUrl || '').trim(),
    mainPhone:                      String(b.mainPhone || '').trim(),
    serviceArea:                    String(b.serviceArea || '').trim(),
    mainServices:                   String(b.mainServices || '').trim(),
    callForwardingNumber:           String(b.callForwardingNumber || '').trim(),
    // Offers / specials
    currentSpecialOrOffer:          String(b.currentSpecialOrOffer || '').trim(),
    seasonalSpecials:               String(b.seasonalSpecials || '').trim(),
    servicesNotToAdvertise:         String(b.servicesNotToAdvertise || '').trim(),
    preferredAdBudget:              String(b.preferredAdBudget || '').trim(),
    // Campaign strategy
    serviceToPromoteFirst:          String(b.serviceToPromoteFirst || '').trim(),
    targetCities:                   String(b.targetCities || '').trim(),
    idealCustomer:                  String(b.idealCustomer || '').trim(),
    businessDifferentiator:         String(b.businessDifferentiator || '').trim(),
    customerProblem:                String(b.customerProblem || '').trim(),
    promotionOffer:                 String(b.promotionOffer || '').trim(),
    preferredTone:                  String(b.preferredTone || '').trim(),
    // Website access (no passwords)
    websitePlatform:                String(b.websitePlatform || '').trim(),
    websiteLoginOrWebPersonContact: String(b.websiteLoginOrWebPersonContact || '').trim(),
    websiteAccessMethod:            String(b.websiteAccessMethod || '').trim(),
    canAddSmartemark:               String(b.canAddSmartemark || '').trim(),
    // Facebook / tracking
    facebookPageUrl:                String(b.facebookPageUrl || '').trim(),
    facebookAdAccountNotes:         String(b.facebookAdAccountNotes || '').trim(),
    // Contact
    bestContactName:                String(b.bestContactName || '').trim(),
    bestContactEmail:               String(b.bestContactEmail || '').trim(),
    bestContactPhone:               String(b.bestContactPhone || '').trim(),
    additionalNotes:                String(b.additionalNotes || '').trim(),
    // Timestamps — preserve original submission date on re-submit
    submittedAt: existingIntake?.submittedAt || now,
    updatedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/intake-link
// Admin only. Generates (or retrieves) a secure public intake token for the
// client so the admin can send them a link they can fill out without logging in.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/intake-link', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    await ensureDB();
    const idx = db.data.users.findIndex(
      (u) => String(u?.username || '').trim() === String(user.username || '').trim()
    );
    if (idx === -1) return res.status(500).json({ ok: false, error: 'Client record not found.' });

    let token = db.data.users[idx].premiumIntakeToken;
    if (!token) {
      token = crypto.randomBytes(24).toString('hex');
      db.data.users[idx].premiumIntakeToken = token;
      await db.write();
    }

    const base = (
      process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.FRONTEND_URL ||
      'https://smartemark.com'
    ).replace(/\/+$/, '');

    return res.json({ ok: true, token, url: `${base}/premium-intake?token=${token}` });
  } catch (err) {
    console.error('[Admin] intake-link error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to generate intake link.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/premium-intake/token
// Public — no login required. Customer submits the intake form via a token link
// that the admin generated for their account.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/premium-intake/token', limitIntake, async (req, res) => {
  try {
    await ensureDB();
    const b = req.body || {};
    const token = String(b.token || '').trim();

    if (!token) {
      return res.status(400).json({ ok: false, error: 'Invalid or missing intake token.' });
    }

    const idx = db.data.users.findIndex(
      (u) => String(u?.premiumIntakeToken || '') === token
    );
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'This intake link is invalid. Please contact Smartemark for a new link.' });
    }

    const required = ['businessName', 'websiteUrl', 'mainPhone', 'serviceArea', 'mainServices', 'bestContactName', 'bestContactEmail'];
    const missing = required.filter((k) => !String(b[k] || '').trim());
    if (missing.length) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.', missing });
    }

    const now = new Date().toISOString();
    db.data.users[idx].premiumIntake = buildIntakeFromBody(b, db.data.users[idx].premiumIntake);
    db.data.users[idx].onboarding = {
      ...(db.data.users[idx].onboarding || defaultOnboarding()),
      intake_completed: true,
      updatedAt: now,
    };

    await db.write();
    return res.json({ ok: true, message: 'Setup information received. Thank you!' });
  } catch (err) {
    console.error('[PublicIntake] token error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/premium-intake
// Any authenticated user can submit — plan check removed so standalone links
// sent to customers (who may not yet have upgraded in Stripe) still work.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/premium-intake', limitIntake, async (req, res) => {
  try {
    await ensureDB();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in to your Smartemark account first, then open this link.' });
    }

    const b = req.body || {};
    const required = ['businessName', 'websiteUrl', 'mainPhone', 'serviceArea', 'mainServices', 'bestContactName', 'bestContactEmail'];
    const missing = required.filter((k) => !String(b[k] || '').trim());
    if (missing.length) {
      return res.status(400).json({ ok: false, error: 'Missing required fields.', missing });
    }

    const idx = db.data.users.findIndex(
      (u) => String(u?.username || '').trim() === String(user.username || '').trim()
    );
    if (idx === -1) return res.status(500).json({ ok: false, error: 'User record not found.' });

    const now = new Date().toISOString();
    db.data.users[idx].premiumIntake = buildIntakeFromBody(b, db.data.users[idx].premiumIntake);
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/premium-intake
// Admin fills the intake form on behalf of an existing client.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/premium-intake', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

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
    if (idx === -1) return res.status(500).json({ ok: false, error: 'Client record not found.' });

    const now = new Date().toISOString();
    db.data.users[idx].premiumIntake = buildIntakeFromBody(b, db.data.users[idx].premiumIntake);
    db.data.users[idx].onboarding = {
      ...(db.data.users[idx].onboarding || defaultOnboarding()),
      intake_completed: true,
      updatedAt: now,
    };

    await db.write();
    return res.json({ ok: true, message: 'Intake saved for client.' });
  } catch (err) {
    console.error('[AdminIntake] error:', err?.message || err);
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
        metaPixel: user.metaPixel || null,
        campaigns,
      },
    });
  } catch (err) {
    console.error('[Admin] client detail error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load client.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:id/campaigns
// Returns the selected client's complete campaign history, bundled with metrics
// and optimizer state from the DB so CampaignSetup can display exactly what the
// client sees when logged in directly.
// Joins campaign_creatives + optimizer_campaign_state, both scoped to the
// client's ownerKey. Never returns tokens or raw AI content.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id/campaigns', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    await ensureDB();
    const ownerKey = `user:${String(user.username || '').trim()}`;

    const creativeRecords = (db.data.campaign_creatives || []).filter(
      (c) => String(c?.ownerKey || '').trim() === ownerKey
    );
    const optimizerStates = (db.data.optimizer_campaign_state || []).filter(
      (s) => String(s?.ownerKey || '').trim() === ownerKey
    );

    // Helper: sanitize an optimizer state row into what the frontend needs.
    // Never exposes raw AI history, decision chains, or full action logs.
    const sanitizeOptState = (s) => ({
      campaignId:      String(s?.campaignId || ''),
      campaignName:    s?.campaignName || '',
      currentStatus:   String(s?.currentStatus || '').toUpperCase(),
      smArchived:      !!s?.smArchived,
      metricsSnapshot: s?.metricsSnapshot && Object.keys(s.metricsSnapshot).length > 0
        ? s.metricsSnapshot
        : null,
      publicSummary:   s?.publicSummary || null,
      latestDiagnosis: s?.latestDiagnosis
        ? {
            diagnosis:         s.latestDiagnosis.diagnosis,
            likelyProblem:     s.latestDiagnosis.likelyProblem,
            recommendedAction: s.latestDiagnosis.recommendedAction,
            generatedAt:       s.latestDiagnosis.generatedAt,
          }
        : null,
      latestAction: s?.latestAction
        ? {
            actionType:  s.latestAction.actionType,
            executed:    !!s.latestAction.executed,
            generatedAt: s.latestAction.generatedAt,
          }
        : null,
    });

    // Build campaign list from creative records, enriched with optimizer state.
    // Skip campaigns marked hiddenFromHistory — they are soft-deleted from the UI.
    const seen = new Set();
    const campaigns = [];

    for (const c of creativeRecords) {
      const cId = String(c?.campaignId || '').trim();
      if (!cId || seen.has(cId)) continue;
      if (c.hiddenFromHistory) { seen.add(cId); continue; } // soft-deleted
      seen.add(cId);

      const opt = optimizerStates.find(
        (s) => String(s?.campaignId || '').trim() === cId
      ) || null;

      // Do NOT default to 'ACTIVE' — stubs with no stored status should have empty string
      // so the frontend can correctly identify them as unknown/stub (not truly live).
      const status = String(
        c.status || opt?.currentStatus || ''
      ).trim().toUpperCase();

      // Treat as archived if Smartemark's own flag is set OR if Meta's stored status
      // is ARCHIVED/DELETED (campaign was archived on Meta without going through Smartemark)
      const isMetaArchived = status === 'ARCHIVED' || status === 'DELETED';

      campaigns.push({
        id:               cId,
        name:             c.name || opt?.campaignName || 'Campaign',
        status,
        effective_status: status,
        start_time:       c.createdAt || c.updatedAt || null,
        stop_time:        c.endDate || null,
        smArchived:       !!(c.smArchived || opt?.smArchived || isMetaArchived),
        archivedAt:       c.archivedAt || null,
        accountId:        String(c.accountId || opt?.accountId || '').replace(/^act_/, ''),
        launchComplete:   !!c.launchComplete,
        createdAt:        c.createdAt || null,
        // Creative fields so CampaignSetup can show the correct creative per campaign
        images:           Array.isArray(c.images) ? c.images : [],
        meta:             { headline: String(c.meta?.headline || ''), body: String(c.meta?.body || ''), link: String(c.meta?.link || '') },
        mediaSelection:   c.mediaSelection || 'image',
        optimizerState:   opt ? sanitizeOptState(opt) : null,
      });
    }

    // Include campaigns that exist only in optimizer_campaign_state (no creative record).
    // Skip hidden ones.
    for (const s of optimizerStates) {
      const cId = String(s?.campaignId || '').trim();
      if (!cId || seen.has(cId)) continue;
      if (s.hiddenFromHistory) { seen.add(cId); continue; }
      seen.add(cId);

      const status = String(s.currentStatus || '').trim().toUpperCase();
      campaigns.push({
        id:               cId,
        name:             s.campaignName || 'Campaign',
        status,
        effective_status: status,
        start_time:       s.createdAt || null,
        stop_time:        null,
        smArchived:       !!s.smArchived,
        archivedAt:       s.archivedAt || null,
        accountId:        String(s.accountId || '').replace(/^act_/, ''),
        launchComplete:   false,
        createdAt:        s.createdAt || null,
        images:           [],
        meta:             { headline: '', body: '', link: '' },
        mediaSelection:   'image',
        optimizerState:   sanitizeOptState(s),
      });
    }

    return res.json({ ok: true, campaigns, ownerKey });
  } catch (err) {
    console.error('[Admin] client campaigns error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load client campaigns.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/clients/:id/campaign/:campaignId/hide-history
// Admin-only. Soft-deletes an archived campaign from the client's history UI.
// Does NOT delete from Meta. Only applies to campaigns with smArchived === true.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/admin/clients/:id/campaign/:campaignId/hide-history', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    await ensureDB();
    const ownerKey = `user:${String(user.username || '').trim()}`;
    const campaignId = String(req.params.campaignId || '').trim();
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId is required.' });

    const cIdx = (db.data.campaign_creatives || []).findIndex(
      (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
    );
    if (cIdx !== -1) {
      const rec = db.data.campaign_creatives[cIdx];
      const metaStatus = String(rec.status || rec.effective_status || '').toUpperCase();
      const LIVE = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES']);
      if (LIVE.has(metaStatus) && !rec.smArchived) {
        return res.status(400).json({ ok: false, error: 'Active campaigns cannot be removed from history. Archive or pause the campaign first.' });
      }
      db.data.campaign_creatives[cIdx].hiddenFromHistory = true;
      db.data.campaign_creatives[cIdx].hiddenAt = new Date().toISOString();
    } else {
      // No creative record — create a stub so the hidden flag persists across reloads
      db.data.campaign_creatives = db.data.campaign_creatives || [];
      db.data.campaign_creatives.push({
        campaignId,
        ownerKey,
        smArchived: true,
        hiddenFromHistory: true,
        hiddenAt: new Date().toISOString(),
        hiddenReason: 'hide_from_history',
      });
    }

    db.data.optimizer_campaign_state = db.data.optimizer_campaign_state || [];
    const optIdx = db.data.optimizer_campaign_state.findIndex(
      (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
    );
    if (optIdx !== -1) {
      db.data.optimizer_campaign_state[optIdx].hiddenFromHistory = true;
      db.data.optimizer_campaign_state[optIdx].hiddenAt = new Date().toISOString();
    }

    await db.write();
    return res.json({ ok: true, campaignId, hiddenFromHistory: true });
  } catch (err) {
    console.error('[Admin] hide-history error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to hide campaign from history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/campaigns/cleanup-test-history
// Admin-only. Soft-hides all archived/finished campaign records for the given
// client. Does NOT delete Meta/Facebook campaigns. Never touches active campaigns.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/campaigns/cleanup-test-history', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    await ensureDB();
    const ownerKey = `user:${String(user.username || '').trim()}`;
    const now = new Date().toISOString();
    const TRULY_LIVE = new Set(['ACTIVE', 'IN_PROCESS', 'WITH_ISSUES']);

    let ccHidden = 0, ccSkipped = 0, osHidden = 0, osSkipped = 0;

    // Pre-build optimizer state map for quick lookup during creative record pass
    const optMap = {};
    for (const os of (db.data.optimizer_campaign_state || [])) {
      if (String(os?.ownerKey || '') === ownerKey) {
        optMap[String(os.campaignId || '')] = os;
      }
    }

    // campaign_creatives
    db.data.campaign_creatives = db.data.campaign_creatives || [];
    for (let i = 0; i < db.data.campaign_creatives.length; i++) {
      const r = db.data.campaign_creatives[i];
      if (String(r?.ownerKey || '') !== ownerKey) continue;
      if (r.hiddenFromHistory) { ccSkipped++; continue; }

      const s = String(r.status || r.effective_status || '').toUpperCase();

      // Never hide truly live campaigns
      if (TRULY_LIVE.has(s) && !r.smArchived) { ccSkipped++; continue; }

      const isArchivedOrOld = r.smArchived || ['ARCHIVED', 'DELETED', 'COMPLETED'].includes(s);

      // For PAUSED: hide only if no real delivery in stored metrics
      if (s === 'PAUSED' && !r.smArchived) {
        const optState = optMap[String(r.campaignId || '')];
        const snap = optState?.metricsSnapshot || {};
        const hasDelivery = Number(snap.impressions || 0) > 0 || Number(snap.spend || 0) > 0;
        if (hasDelivery) { ccSkipped++; continue; } // real paused campaign, keep
        // no delivery → treat as clutter, fall through to hide
      } else if (!isArchivedOrOld && s !== '') {
        ccSkipped++;
        continue;
      }

      db.data.campaign_creatives[i] = {
        ...r,
        hiddenFromHistory: true,
        hiddenAt: now,
        hiddenReason: 'manual_test_cleanup',
      };
      ccHidden++;
    }

    // optimizer_campaign_state
    db.data.optimizer_campaign_state = db.data.optimizer_campaign_state || [];
    for (let i = 0; i < db.data.optimizer_campaign_state.length; i++) {
      const os = db.data.optimizer_campaign_state[i];
      if (String(os?.ownerKey || '') !== ownerKey) continue;
      if (os.hiddenFromHistory) { osSkipped++; continue; }

      const status = String(os.currentStatus || '').toUpperCase();

      if (TRULY_LIVE.has(status) && !os.smArchived) { osSkipped++; continue; }

      const isArchivedOrOld = os.smArchived || ['ARCHIVED', 'DELETED', 'COMPLETED'].includes(status);

      if (status === 'PAUSED' && !os.smArchived) {
        const snap = os.metricsSnapshot || {};
        const hasDelivery = Number(snap.impressions || 0) > 0 || Number(snap.spend || 0) > 0;
        if (hasDelivery) { osSkipped++; continue; }
        // no delivery → fall through to hide
      } else if (!isArchivedOrOld && status !== '') {
        osSkipped++;
        continue;
      }

      db.data.optimizer_campaign_state[i] = {
        ...os,
        hiddenFromHistory: true,
        hiddenAt: now,
        hiddenReason: 'manual_test_cleanup',
      };
      osHidden++;
    }

    await db.write();
    return res.json({
      ok: true,
      ownerKey,
      campaign_creatives: { hidden: ccHidden, skipped: ccSkipped },
      optimizer_campaign_state: { hidden: osHidden, skipped: osSkipped },
    });
  } catch (err) {
    console.error('[Admin] cleanup-test-history error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Cleanup failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:id/campaign/:campaignId/metrics
// Admin-only. Returns stored or live metrics for a specific client campaign.
// First checks optimizer_campaign_state (DB). Falls back to Meta Insights API
// using the client's stored FB token if no DB metrics exist. Never returns tokens.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id/campaign/:campaignId/metrics', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const campaignId = String(req.params.campaignId || '').trim();
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId required.' });

    await ensureDB();
    const ownerKey = `user:${String(user.username || '').trim()}`;

    // Check stored optimizer state first
    const stored = (db.data.optimizer_campaign_state || []).find(
      (s) => String(s?.campaignId || '') === campaignId && String(s?.ownerKey || '') === ownerKey
    );
    if (stored?.metricsSnapshot && Object.keys(stored.metricsSnapshot).length > 0) {
      const snap = stored.metricsSnapshot;
      const hasData = Number(snap.impressions || 0) > 0 || Number(snap.spend || 0) > 0;
      if (hasData) {
        return res.json({ ok: true, source: 'db', metricsSnapshot: snap });
      }
    }

    // Fall back to Meta Insights API using client's token
    const token = getFbUserToken(ownerKey);
    if (!token) {
      return res.json({ ok: false, noMetrics: true, source: 'none',
        error: 'No stored metrics and Facebook is not connected for this client.' });
    }

    const response = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${campaignId}/insights`, {
      params: {
        access_token: token,
        fields: 'impressions,clicks,spend,cpm,ctr,actions,reach,unique_clicks',
        date_preset: 'maximum',
      },
      timeout: 10000,
    });

    const row = Array.isArray(response.data?.data) ? (response.data.data[0] || {}) : {};
    const actions = Array.isArray(row.actions) ? row.actions : [];

    const CONV_TYPES = new Set(['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead',
      'omni_lead','purchase','offsite_conversion.fb_pixel_purchase']);
    const LINK_TYPES = new Set(['link_click','landing_page_view','outbound_click']);

    const conversions = actions.reduce((sum, a) =>
      CONV_TYPES.has(String(a?.action_type||'').toLowerCase()) ? sum + Number(a?.value||0) : sum, 0);
    const linkClicks = actions.reduce((sum, a) =>
      LINK_TYPES.has(String(a?.action_type||'').toLowerCase()) ? sum + Number(a?.value||0) : sum, 0);

    const impressions = Number(row.impressions || 0);
    const clicks      = Number(row.clicks      || 0);
    const spend       = Number(row.spend       || 0);
    const ctr         = Number(row.ctr         || 0);
    const cpm         = Number(row.cpm         || 0);
    const reach       = Number(row.reach       || 0);
    const cpc         = linkClicks > 0 ? spend / linkClicks : clicks > 0 ? spend / clicks : 0;
    const costPerConversion  = conversions > 0 ? spend / conversions : 0;
    const conversionRate     = linkClicks > 0 && conversions > 0 ? (conversions / linkClicks) * 100 : 0;

    const metricsSnapshot = {
      impressions, clicks, linkClicks, spend, ctr, cpm, cpc, reach,
      conversions, conversionRate, costPerConversion,
      lastSyncedAt: new Date().toISOString(),
    };

    return res.json({ ok: true, source: 'meta', metricsSnapshot });
  } catch (err) {
    const fbErr = err?.response?.data?.error;
    if (fbErr?.code === 190 || fbErr?.code === 102) {
      return res.json({ ok: false, noMetrics: true, error: 'Facebook session expired for this client.' });
    }
    // Object does not exist / missing permissions / unsupported request — old/test campaign
    if (fbErr?.code === 100 || fbErr?.code === 803 || fbErr?.code === 200 ||
        String(fbErr?.message || '').toLowerCase().includes('does not exist') ||
        String(fbErr?.message || '').toLowerCase().includes('unsupported')) {
      return res.json({ ok: false, noMetrics: true, error: 'This campaign no longer exists on Meta or permissions are missing.' });
    }
    console.error('[Admin] campaign metrics error:', err?.message || err);
    // Return ok:false (not a 500) so the frontend can handle gracefully without crashing
    return res.json({ ok: false, noMetrics: true, error: 'Could not fetch campaign metrics from Meta.' });
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
        axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`, {
          params: { fields: 'id,name,account_status', access_token: token },
          timeout: 10000,
        }),
        axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/accounts`, {
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

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/admin/clients/:id
// Admin-only. Removes the user/client row only. Does not touch campaigns or tokens.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/admin/clients/:id', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    await ensureDB();

    const before = db.data.users.length;
    db.data.users = db.data.users.filter(
      (u) => String(u?.username || '').trim() !== username
    );

    if (db.data.users.length === before) {
      return res.status(404).json({ ok: false, error: 'Client not found.' });
    }

    await db.write();
    return res.json({ ok: true, removed: username });
  } catch (err) {
    console.error('[Admin] delete client error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to remove client.' });
  }
});

module.exports = router;
