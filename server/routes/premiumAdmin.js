// server/routes/premiumAdmin.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { secureHeaders, basicRateLimit, basicAuth } = require('../middleware/security');
const { META_API_VERSION } = require('../metaConfig');
const { CALL_CONFIGS } = require('./twilio');

// Server-side mirror of src/data/landingPages.js — only the fields needed for tracking checks.
// Keep in sync with the frontend config when adding new pages.
const LANDING_PAGE_CONFIGS = {
  'aspen-ac': {
    slug: 'aspen-ac',
    businessName: 'Aspen Air Conditioning & Heating',
    metaPixelId: '2079374046338979',
    landingPageUrl: 'https://offers.aspen-hvac.com',
  },
};

function maskPhone(phone) {
  if (!phone || phone.length < 8) return '***';
  return phone.slice(0, 5) + '******' + phone.slice(-2);
}

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

// ── Intake media file upload ──────────────────────────────────────────────────
const INTAKE_MEDIA_DIR = (() => {
  const d = process.env.INTAKE_MEDIA_DIR ||
    (process.env.RENDER ? '/tmp/intake-media' : path.join(process.cwd(), 'server', 'intake-media'));
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
  return d;
})();

const ALLOWED_INTAKE_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

const MIME_TO_EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
};

function parseIntakeFile(dataUrl) {
  const s = String(dataUrl || '').trim();
  const m = s.match(/^data:([^;]+);base64,([\s\S]+)$/);
  if (!m) return null;
  const mime = m[1].toLowerCase().trim();
  if (!ALLOWED_INTAKE_MIME.has(mime)) return null;
  const ext = MIME_TO_EXT[mime];
  if (!ext) return null;
  const buffer = Buffer.from(m[2], 'base64');
  return { mime, buffer, ext };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// Helper: build the intake object from request body (shared by normal + admin routes).
// Merge-safe: if a submitted field is empty, the existing value is preserved.
// This prevents a partial edit from blanking out fields the admin didn't touch.
function buildIntakeFromBody(b, existingIntake) {
  const e = existingIntake || {};
  const now = new Date().toISOString();
  // Returns submitted value if non-empty, otherwise falls back to existing DB value.
  const pick = (k) => String(b[k] || '').trim() || String(e[k] || '').trim();
  return {
    // Business basics
    businessName:                   pick('businessName'),
    websiteUrl:                     pick('websiteUrl'),
    mainPhone:                      pick('mainPhone'),
    serviceArea:                    pick('serviceArea'),
    mainServices:                   pick('mainServices'),
    callForwardingNumber:           pick('callForwardingNumber'),
    // Offers / specials
    currentSpecialOrOffer:          pick('currentSpecialOrOffer'),
    seasonalSpecials:               pick('seasonalSpecials'),
    servicesNotToAdvertise:         pick('servicesNotToAdvertise'),
    preferredAdBudget:              pick('preferredAdBudget'),
    // Campaign strategy
    serviceToPromoteFirst:          pick('serviceToPromoteFirst'),
    targetCities:                   pick('targetCities'),
    idealCustomer:                  pick('idealCustomer'),
    businessDifferentiator:         pick('businessDifferentiator'),
    customerProblem:                pick('customerProblem'),
    promotionOffer:                 pick('promotionOffer'),
    preferredTone:                  pick('preferredTone'),
    // Website access (no passwords)
    websitePlatform:                pick('websitePlatform'),
    websiteLoginOrWebPersonContact: pick('websiteLoginOrWebPersonContact'),
    websiteAccessMethod:            pick('websiteAccessMethod'),
    canAddSmartemark:               pick('canAddSmartemark'),
    // Facebook / tracking
    facebookPageUrl:                pick('facebookPageUrl'),
    facebookAdAccountNotes:         pick('facebookAdAccountNotes'),
    // Contact
    bestContactName:                pick('bestContactName'),
    bestContactEmail:               pick('bestContactEmail'),
    bestContactPhone:               pick('bestContactPhone'),
    additionalNotes:                pick('additionalNotes'),
    // Media assets — preserved from DB (uploaded separately via /api/intake-media/upload)
    mediaAssets: Array.isArray(e.mediaAssets) ? e.mediaAssets : [],
    mediaUploadNotes: pick('mediaUploadNotes'),
    // Timestamps — preserve original submission date on re-submit
    submittedAt: e.submittedAt || now,
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
      process.env.CLIENT_URL ||
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/intake-media/upload
// Upload a single image or video for premium intake.
// Auth: session cookie/header OR valid intake token (for public token links).
// Body: { dataUrl, originalName, token? }
// Limits: 35 MB per file, max 8 files per user.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/intake-media/upload', limitIntake, express.json({ limit: '50mb' }), async (req, res) => {
  try {
    await ensureDB();
    const b = req.body || {};
    const dataUrl = String(b.dataUrl || '').trim();
    const originalName = String(b.originalName || '').slice(0, 200).trim();
    const token = String(b.token || '').trim();

    if (!dataUrl) return res.status(400).json({ ok: false, error: 'No file data provided.' });

    // Resolve user by session or by intake token
    let userIdx = -1;
    if (token) {
      userIdx = db.data.users.findIndex((u) => String(u?.premiumIntakeToken || '') === token);
    } else {
      const ownerKey = ownerKeyFromReq(req);
      const user = await findUserByOwnerKey(ownerKey);
      if (user) {
        userIdx = db.data.users.findIndex(
          (u) => String(u?.username || '').trim() === String(user.username || '').trim()
        );
      }
    }
    if (userIdx === -1) {
      return res.status(401).json({ ok: false, error: 'Not authorized. Please reload the page and try again.' });
    }

    const parsed = parseIntakeFile(dataUrl);
    if (!parsed) {
      return res.status(400).json({ ok: false, error: 'Unsupported file type. Allowed: PNG, JPG, WEBP, MP4, MOV, WEBM.' });
    }

    const MAX_BYTES = 35 * 1024 * 1024; // 35 MB
    if (parsed.buffer.length > MAX_BYTES) {
      return res.status(400).json({ ok: false, error: `File too large (${fmtBytes(parsed.buffer.length)}). Maximum is 35 MB per file.` });
    }

    // Enforce per-user file count limit
    const existing = db.data.users[userIdx].premiumIntake?.mediaAssets;
    if (Array.isArray(existing) && existing.length >= 8) {
      return res.status(400).json({ ok: false, error: 'Maximum 8 files allowed per intake.' });
    }

    // Save to disk
    const id = crypto.randomBytes(10).toString('hex');
    const filename = `intake-${id}.${parsed.ext}`;
    fs.writeFileSync(path.join(INTAKE_MEDIA_DIR, filename), parsed.buffer);

    const meta = {
      originalName: originalName || filename,
      filename,
      url: `/api/admin/intake-media/${filename}`,
      mimeType: parsed.mime,
      size: parsed.buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    // Append to the user's premiumIntake.mediaAssets
    if (!db.data.users[userIdx].premiumIntake) db.data.users[userIdx].premiumIntake = {};
    if (!Array.isArray(db.data.users[userIdx].premiumIntake.mediaAssets)) {
      db.data.users[userIdx].premiumIntake.mediaAssets = [];
    }
    db.data.users[userIdx].premiumIntake.mediaAssets.push(meta);
    await db.write();

    console.log('[intake-media] uploaded:', { username: db.data.users[userIdx].username, filename, size: fmtBytes(meta.size) });
    return res.json({ ok: true, file: meta });
  } catch (err) {
    console.error('[intake-media/upload]', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Upload failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/intake-media/:filename
// Admin-only. Serves an uploaded intake media file for viewing or download.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/intake-media/:filename', requireAdmin, (req, res) => {
  const filename = path.basename(String(req.params.filename || '').trim());
  if (!filename || filename.includes('..')) return res.status(400).end();

  const filePath = path.join(INTAKE_MEDIA_DIR, filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'File not found.' });

  const download = req.query.download === '1';
  if (download) {
    return res.download(filePath, filename);
  }
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  return res.sendFile(filePath);
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
        planName: String(user.billing?.planName || '').trim(),
        billingLabel: String(user.billing?.billingLabel || '').trim(),
        hasAccess: !!user.billing?.hasAccess,
        billingStatus: String(user.billing?.status || '').trim(),
        stripeCustomerId: String(user.billing?.stripeCustomerId || '').trim(),
        stripeSubscriptionId: String(user.billing?.stripeSubscriptionId || '').trim(),
        stripePriceId: String(user.billing?.stripePriceId || '').trim(),
        currentPeriodEnd: user.billing?.currentPeriodEnd || null,
        lastPaymentStatus: String(user.billing?.lastPaymentStatus || '').trim(),
        lastPaymentFailedAt: user.billing?.lastPaymentFailedAt || null,
        hostedInvoiceUrl: String(user.billing?.hostedInvoiceUrl || '').trim(),
        createdAt: user.createdAt || null,
        fbConnected,
        premiumIntake: user.premiumIntake || null,
        agreement: user.agreement
          ? {
              agreementAccepted:  !!user.agreement.signedAt,
              agreementVersion:   user.agreement.agreementVersion || null,
              signedAt:           user.agreement.signedAt || null,
              signerName:         user.agreement.signerName || null,
              signerEmail:        user.agreement.signerEmail || null,
              businessName:       user.agreement.businessName || null,
              selectedPlan:       user.agreement.selectedPlan || null,
              monthlyPrice:       user.agreement.monthlyPrice || null,
              pricingVariant:     user.agreement.pricingVariant || null,
            }
          : null,
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
            skipped:     !!s.latestAction.skipped,
            status:      String(s.latestAction.status || '').trim(),
          }
        : null,
      latestDecision: s?.latestDecision
        ? {
            decision:   s.latestDecision.decision,
            actionType: s.latestDecision.actionType,
            reason:     String(s.latestDecision.reason || '').slice(0, 400),
            generatedAt: s.latestDecision.generatedAt,
          }
        : null,
      pendingCreativeTest: s?.pendingCreativeTest
        ? {
            status:               String(s.pendingCreativeTest.status || '').trim(),
            creativeGoal:         String(s.pendingCreativeTest.creativeGoal || '').trim(),
            generationReason:     String(s.pendingCreativeTest.generationReason || '').trim(),
            imageUrls:            Array.isArray(s.pendingCreativeTest.imageUrls) ? s.pendingCreativeTest.imageUrls.filter(Boolean) : [],
            controlAdIds:         Array.isArray(s.pendingCreativeTest.controlAdIds) ? s.pendingCreativeTest.controlAdIds.filter(Boolean) : [],
            candidateAdIds:       Array.isArray(s.pendingCreativeTest.candidateAdIds) ? s.pendingCreativeTest.candidateAdIds.filter(Boolean) : [],
            startedAt:            s.pendingCreativeTest.startedAt || null,
            launchStatus:         String(s.pendingCreativeTest.launchStatus || '').trim(),
            launchedVariantCount: Number(s.pendingCreativeTest.launchedVariantCount || 0),
            sourceActionType:     String(s.pendingCreativeTest.sourceActionType || '').trim(),
          }
        : null,
      currentWinner:  s?.currentWinner  || null,
      activeTestType: String(s?.activeTestType || '').trim(),
    });

    // ── Per-ad archive reconciliation ──────────────────────────────────────────
    // This is the reload path that fires when TheBoss re-enters a client account.
    // The raw DB launchedCreativeSet may contain stale "active" entries for ads
    // that Meta has already archived (because a prior rebuild from Meta's /ads
    // list omitted them and overwrote the DB before our fix was deployed).
    // Verify every saved ad ID directly with Meta and repair the DB in place.
    const clientToken = getFbUserToken(ownerKey);
    let dbNeedsWrite  = false;
    const nowRec = new Date().toISOString();
    const TERMINAL_ST = new Set(['ARCHIVED', 'DELETED']);

    if (clientToken) {
      for (const c of creativeRecords) {
        const launchedSet = Array.isArray(c.launchedCreativeSet) ? c.launchedCreativeSet : [];
        if (launchedSet.length === 0) continue;

        if (!c.archivedMetaAdIds || typeof c.archivedMetaAdIds !== 'object') c.archivedMetaAdIds = {};
        const archivedMap = c.archivedMetaAdIds;

        // Only verify ad IDs not already confirmed archived — avoids redundant Meta calls.
        const adsToCheck = launchedSet
          .filter((ad) => ad.metaAdId && !archivedMap[ad.metaAdId])
          .map((ad) => ad.metaAdId)
          .slice(0, 10); // safety cap

        if (adsToCheck.length === 0) continue;

        const verifyResults = await Promise.allSettled(
          adsToCheck.map(async (adId) => {
            try {
              const r = await axios.get(
                `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
                { params: { access_token: clientToken, fields: 'id,status,effective_status,configured_status' }, timeout: 8000 }
              );
              const d = r.data || {};
              return {
                adId,
                effectiveStatus:  String(d.effective_status  || d.status || '').toUpperCase(),
                configuredStatus: String(d.configured_status || d.status || '').toUpperCase(),
              };
            } catch (err) {
              const code = err?.response?.data?.error?.code;
              // Code 100 = object not found → treat as archived
              const st = code === 100 ? 'ARCHIVED' : 'UNKNOWN';
              console.warn('[ADMIN_CAMPAIGNS_VERIFY_ERROR]', { adId, code, msg: err?.response?.data?.error?.message || err?.message });
              return { adId, effectiveStatus: st, configuredStatus: st };
            }
          })
        );

        for (const result of verifyResults) {
          if (result.status !== 'fulfilled') continue;
          const { adId, effectiveStatus, configuredStatus } = result.value;
          if (!TERMINAL_ST.has(effectiveStatus) && !TERMINAL_ST.has(configuredStatus)) continue;

          const archiveEntry = {
            status: 'archived', uiStatus: 'ARCHIVED', configuredStatus: 'ARCHIVED',
            effectiveStatus: 'ARCHIVED', lastAction: 'admin_campaigns_reconcile_archived',
            lastActionAt: nowRec,
          };

          // Update the launchedCreativeSet entry in-place
          const adIdx = c.launchedCreativeSet
            ? c.launchedCreativeSet.findIndex((ad) => ad.metaAdId === adId)
            : -1;
          if (adIdx >= 0) {
            c.launchedCreativeSet[adIdx] = { ...c.launchedCreativeSet[adIdx], ...archiveEntry };
          }

          // Write to durable archivedMetaAdIds map
          archivedMap[adId] = archiveEntry;
          dbNeedsWrite = true;

          console.log('[ADMIN_CAMPAIGNS_ARCHIVE_REPAIRED]', {
            campaignId:         c.campaignId,
            adId,
            metaStatus:         effectiveStatus,
            metaEffectiveStatus: effectiveStatus,
          });
        }
      }

      if (dbNeedsWrite) await db.write();
    }

    // Apply archivedMetaAdIds overrides to each launchedCreativeSet before building the
    // campaign list — catches any entry the DB still has as "active" but the map says archived.
    for (const c of creativeRecords) {
      const archivedMap = c.archivedMetaAdIds || {};
      if (!Array.isArray(c.launchedCreativeSet) || Object.keys(archivedMap).length === 0) continue;
      c.launchedCreativeSet = c.launchedCreativeSet.map((ad) => {
        if (!ad.metaAdId || !archivedMap[ad.metaAdId]) return ad;
        return { ...ad, ...archivedMap[ad.metaAdId], uiStatus: 'ARCHIVED', status: 'archived' };
      });
    }
    // ── End reconciliation ──────────────────────────────────────────────────────

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
        images:              Array.isArray(c.images) ? c.images : [],
        meta:                { headline: String(c.meta?.headline || ''), body: String(c.meta?.body || ''), link: String(c.meta?.link || '') },
        mediaSelection:      c.mediaSelection || 'image',
        launchedCreativeSet:     Array.isArray(c.launchedCreativeSet) ? c.launchedCreativeSet : [],
        archivedMetaAdIds:       (c.archivedMetaAdIds && typeof c.archivedMetaAdIds === 'object') ? c.archivedMetaAdIds : {},
        pendingChallengerDrafts: Array.isArray(c.pendingChallengerDrafts) ? c.pendingChallengerDrafts : [],
        optimizerState:          opt ? sanitizeOptState(opt) : null,
      });

      console.log('[ADMIN_CAMPAIGNS_CREATIVE_STATUS]', {
        clientId:            username,
        ownerKey,
        campaignId:          cId,
        launchedCreativeSet: (Array.isArray(c.launchedCreativeSet) ? c.launchedCreativeSet : []).map((x) => ({
          metaAdId:         x.metaAdId,
          status:           x.status,
          uiStatus:         x.uiStatus,
          configuredStatus: x.configuredStatus,
          effectiveStatus:  x.effectiveStatus,
          lastAction:       x.lastAction,
        })),
        archivedMetaAdIds: c.archivedMetaAdIds || {},
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

    // Backfill creatives directly from Meta for campaigns that already belong to this
    // client (they're already in `campaigns`, built above strictly from records scoped
    // to `ownerKey`) but have no local creative content yet — e.g. launched before a
    // campaign_creatives record was written for them. This only ever looks up campaign
    // IDs already attributed to this client; it never scans the ad account for other
    // campaigns, so it cannot pull in another client's data.
    if (clientToken) {
      let creativesBackfilled = false;
      for (const camp of campaigns) {
        if (camp.smArchived) continue;
        const hasCreative = (camp.images?.length > 0) || (camp.launchedCreativeSet?.length > 0);
        // Re-run for anything this same backfill wrote previously — earlier versions of
        // this code prioritized Meta's small thumbnail over the real ad image, so records
        // it already created need to be re-fetched to pick up the corrected image. Records
        // written by the normal create-draft/launch-draft flow are left alone.
        const existingRow = creativeRecords.find((r) => String(r?.campaignId || '') === camp.id);
        const wasAutoBackfilled = !!existingRow?.backfilledFromMeta;
        if (hasCreative && !wasAutoBackfilled) continue;

        try {
          // Prefer our own originally-generated image (saved on the campaign_drafts record
          // at "Create Draft for Review" time) over asking Meta for the ad's image. Meta
          // stores/serves its own re-encoded copy of an uploaded picture, which is routinely
          // lower quality than the source — using our own original avoids that entirely.
          const draftRecord = (db.data.campaign_drafts || []).find(
            (d) => String(d?.metaCampaignId || '') === camp.id && String(d?.ownerKey || '') === ownerKey
          );

          let launchedCreativeSet = null;

          if (Array.isArray(draftRecord?.creativeSet) && draftRecord.creativeSet.length > 0) {
            const adIdsForSet = Array.isArray(draftRecord.metaAdIds) && draftRecord.metaAdIds.length > 0
              ? draftRecord.metaAdIds
              : [draftRecord.metaAdId].filter(Boolean);
            launchedCreativeSet = draftRecord.creativeSet.map((c, i) => ({
              id: c.id || `draft-${i}`,
              angleLabel: c.angleLabel || `Ad ${i + 1}`,
              headline: c.headline || '',
              body: c.body || '',
              cta: c.cta || '',
              imageUrl: c.imageUrl || '',
              link: c.link || '',
              metaAdId: adIdsForSet[i] || null,
              status: 'active',
            }));
          } else {
            const adsRes = await axios.get(
              `https://graph.facebook.com/${META_API_VERSION}/${camp.id}/ads`,
              {
                params: {
                  access_token: clientToken,
                  fields: 'id,name,status,effective_status,creative{object_story_spec,thumbnail_url,image_url}',
                  // Meta's default thumbnail is a small preview (~64-192px) meant for lists,
                  // not a full card — request a much larger one so it isn't the blurry fallback.
                  thumbnail_width: 960,
                  thumbnail_height: 960,
                  limit: 10,
                },
                timeout: 10000,
              }
            );
            const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
            if (!ads.length) continue;

            launchedCreativeSet = ads.map((ad, i) => {
              const linkData = ad.creative?.object_story_spec?.link_data || {};
              // Prefer the actual full-resolution image used in the ad; only fall back to
              // Meta's thumbnail (even at the larger requested size) if neither is present.
              return {
                id: ad.id,
                angleLabel: `Ad ${i + 1}`,
                headline: linkData.name || '',
                body: linkData.message || '',
                cta: linkData.call_to_action?.type || '',
                imageUrl: linkData.picture || ad.creative?.image_url || ad.creative?.thumbnail_url || '',
                link: linkData.link || '',
                metaAdId: ad.id,
                status: String(ad.effective_status || ad.status || '').toUpperCase() === 'PAUSED' ? 'paused' : 'active',
              };
            });
          }

          const nowIso = new Date().toISOString();
          const ccIdx = db.data.campaign_creatives.findIndex(
            (r) => String(r.campaignId || '') === camp.id && String(r.ownerKey || '') === ownerKey
          );
          const ccRecord = {
            ownerKey,
            campaignId: camp.id,
            metaCampaignId: camp.id,
            accountId: camp.accountId,
            name: camp.name,
            status: camp.status,
            effective_status: camp.status,
            currentStatus: camp.status,
            mediaSelection: 'image',
            mediaType: 'image',
            images: launchedCreativeSet.map((c) => c.imageUrl).filter(Boolean),
            launchedCreativeSet,
            launchComplete: true,
            isDraft: false,
            smArchived: false,
            hiddenFromHistory: false,
            meta: {
              headline: launchedCreativeSet[0]?.headline || '',
              body: launchedCreativeSet[0]?.body || '',
              link: launchedCreativeSet[0]?.link || '',
            },
            // Marks this record as auto-generated by this backfill (not the normal launch
            // flow) so a future fix to how we build launchedCreativeSet can re-run against it.
            backfilledFromMeta: true,
            updatedAt: nowIso,
            ...(ccIdx === -1 ? { createdAt: nowIso } : {}),
          };
          if (ccIdx === -1) db.data.campaign_creatives.push(ccRecord);
          else db.data.campaign_creatives[ccIdx] = { ...db.data.campaign_creatives[ccIdx], ...ccRecord };
          creativesBackfilled = true;

          // Reflect immediately in this response too, not just on the next load.
          camp.images = ccRecord.images;
          camp.launchedCreativeSet = launchedCreativeSet;
          camp.meta = ccRecord.meta;

          console.log('[ADMIN_CAMPAIGNS_CREATIVE_BACKFILL]', {
            ownerKey, campaignId: camp.id, adCount: launchedCreativeSet.length,
            source: draftRecord ? 'campaign_drafts' : 'meta',
          });
        } catch (backfillErr) {
          console.error('[ADMIN_CAMPAIGNS_CREATIVE_BACKFILL_ERROR]', camp.id, backfillErr?.response?.data?.error?.message || backfillErr?.message);
        }
      }
      if (creativesBackfilled) await db.write();
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
// GET /api/admin/clients/:id/creative-test-metrics
// Per-ad insights for original vs AI challenger (reads client's FB token).
// Returns optimizerCreativeTest: { status, original, challenger, conclusion }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id/creative-test-metrics', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const campaignId = String(req.query.campaignId || '').trim();
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId query param required.' });

    await ensureDB();
    const ownerKey = `user:${String(user.username || '').trim()}`;

    const stored = (db.data.optimizer_campaign_state || []).find(
      (s) => String(s?.campaignId || '') === campaignId && String(s?.ownerKey || '') === ownerKey
    );
    if (!stored) return res.status(404).json({ ok: false, error: 'No optimizer state found for this campaign.' });

    const pending = stored?.pendingCreativeTest || null;
    const pendingStatus = String(pending?.status || '').trim().toLowerCase();
    const controlAdIds = Array.isArray(pending?.controlAdIds) ? pending.controlAdIds.filter(Boolean) : [];
    const candidateAdIds = Array.isArray(pending?.candidateAdIds) ? pending.candidateAdIds.filter(Boolean) : [];

    if (!controlAdIds.length && !candidateAdIds.length) {
      return res.json({ ok: true, noLiveAds: true, status: pendingStatus, original: null, challenger: null, conclusion: 'no_live_ads' });
    }

    const token = getFbUserToken(ownerKey);
    if (!token) {
      return res.json({ ok: false, error: 'Facebook is not connected for this client — cannot fetch live ad metrics.' });
    }

    async function fetchAdMetrics(adId) {
      try {
        const [insightsRes, adRes] = await Promise.allSettled([
          axios.get(`https://graph.facebook.com/${META_API_VERSION}/${adId}/insights`, {
            params: { access_token: token, fields: 'impressions,clicks,spend,ctr,cpc,actions,reach', date_preset: 'maximum' },
            timeout: 10000,
          }),
          axios.get(`https://graph.facebook.com/${META_API_VERSION}/${adId}`, {
            params: { access_token: token, fields: 'id,name,status,effective_status,creative{id,thumbnail_url,object_story_spec{link_data{message,name,call_to_action}}}' },
            timeout: 10000,
          }),
        ]);
        const row = insightsRes.status === 'fulfilled' && Array.isArray(insightsRes.value?.data?.data)
          ? insightsRes.value.data.data[0] || {}
          : {};
        const adData = adRes.status === 'fulfilled' ? adRes.value?.data || {} : {};
        const actions = Array.isArray(row.actions) ? row.actions : [];
        const CONV = new Set(['lead','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead','omni_lead','purchase','offsite_conversion.fb_pixel_purchase']);
        const conversions = actions.reduce((s, a) => CONV.has(String(a?.action_type||'').toLowerCase()) ? s + Number(a?.value||0) : s, 0);
        const clicks = Number(row.clicks || 0);
        const linkClicks = actions.reduce((s, a) => ['link_click','landing_page_view'].includes(String(a?.action_type||'').toLowerCase()) ? s + Number(a?.value||0) : s, 0);
        const spend = Number(row.spend || 0);
        const impressions = Number(row.impressions || 0);
        const effectiveClicks = linkClicks > 0 ? linkClicks : clicks;
        const cpc = Number(row.cpc || 0) || (effectiveClicks > 0 ? spend / effectiveClicks : 0);
        return {
          adId,
          name: String(adData.name || '').trim(),
          status: String(adData.effective_status || adData.status || '').trim(),
          thumbnailUrl: String(adData.creative?.thumbnail_url || '').trim(),
          headline: String(adData.creative?.object_story_spec?.link_data?.name || '').trim(),
          body: String(adData.creative?.object_story_spec?.link_data?.message || '').trim(),
          impressions,
          clicks,
          linkClicks,
          spend: Number(spend.toFixed(2)),
          ctr: Number(row.ctr || 0),
          cpc: Number(cpc.toFixed(4)),
          conversions,
          reach: Number(row.reach || 0),
        };
      } catch (e) {
        return { adId, error: e?.response?.data?.error?.message || e?.message || 'fetch failed' };
      }
    }

    const [originalResults, challengerResults] = await Promise.all([
      Promise.all(controlAdIds.slice(0, 2).map(fetchAdMetrics)),
      Promise.all(candidateAdIds.slice(0, 2).map(fetchAdMetrics)),
    ]);

    const sumMetrics = (results) => {
      const valid = results.filter((r) => !r.error);
      if (!valid.length) return results[0] || null;
      return {
        adId: valid[0].adId,
        name: valid[0].name,
        status: valid[0].status,
        thumbnailUrl: valid[0].thumbnailUrl,
        headline: valid[0].headline,
        body: valid[0].body,
        impressions: valid.reduce((s, r) => s + r.impressions, 0),
        clicks:      valid.reduce((s, r) => s + r.clicks, 0),
        linkClicks:  valid.reduce((s, r) => s + r.linkClicks, 0),
        spend:       Number(valid.reduce((s, r) => s + r.spend, 0).toFixed(2)),
        ctr: valid[0].impressions > 0
          ? Number(((valid.reduce((s, r) => s + r.clicks, 0) / valid.reduce((s, r) => s + r.impressions, 0)) * 100).toFixed(4))
          : 0,
        cpc: valid.reduce((s, r) => s + (r.linkClicks || r.clicks), 0) > 0
          ? Number((valid.reduce((s, r) => s + r.spend, 0) / valid.reduce((s, r) => s + (r.linkClicks || r.clicks), 0)).toFixed(4))
          : 0,
        conversions: valid.reduce((s, r) => s + r.conversions, 0),
        reach:       valid.reduce((s, r) => s + r.reach, 0),
      };
    };

    const original = sumMetrics(originalResults);
    const challenger = sumMetrics(challengerResults);

    const oImpr = Number(original?.impressions || 0);
    const cImpr = Number(challenger?.impressions || 0);
    const oCtr  = Number(original?.ctr || 0);
    const cCtr  = Number(challenger?.ctr || 0);
    const winner = stored?.currentWinner || null;
    let conclusion = 'waiting_for_data';
    if (winner) {
      conclusion = winner === 'challenger' ? 'challenger_won' : 'original_won';
    } else if (oImpr >= 500 && cImpr >= 500) {
      if (cCtr >= oCtr * 1.2) conclusion = 'challenger_leading';
      else if (oCtr >= cCtr * 1.2) conclusion = 'original_leading';
      else conclusion = 'too_close';
    }

    return res.json({
      ok: true,
      status: pendingStatus,
      original,
      challenger,
      controlAdIds,
      candidateAdIds,
      conclusion,
      currentWinner: winner,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Admin] creative-test-metrics error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load creative test metrics.' });
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

    // Override destination URL with the client's latest intake websiteUrl.
    // This ensures that after admin edits the intake URL (e.g. to offers.aspen-hvac.com),
    // future launches pick it up without the frontend needing to be rebuilt.
    const intakeWebsiteUrl = String(user.premiumIntake?.websiteUrl || '').trim();
    let mergedCampaignBody = { ...campaignBody };
    if (intakeWebsiteUrl) {
      mergedCampaignBody = {
        ...mergedCampaignBody,
        websiteUrl: intakeWebsiteUrl,
        url: intakeWebsiteUrl,
        form: {
          ...(mergedCampaignBody.form || {}),
          websiteUrl: intakeWebsiteUrl,
          url: intakeWebsiteUrl,
        },
        answers: {
          ...(mergedCampaignBody.answers || {}),
          url: intakeWebsiteUrl,
          websiteUrl: intakeWebsiteUrl,
        },
      };
      console.log('[Admin Launch] destination URL from intake:', intakeWebsiteUrl);
    }

    const launchRes = await axios.post(
      `${selfBase}/auth/facebook/adaccount/${normalizedAccountId}/launch-campaign`,
      {
        ...mergedCampaignBody,
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/retry-payment
// Finds the client's latest open Stripe invoice and attempts to pay it using
// their saved payment method. Does NOT create a new subscription, checkout
// session, or payment method — only retries the existing unpaid invoice.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/retry-payment', limitAdmin, requireAdmin, async (req, res) => {
  try {
    await ensureDB();

    const username = decodeURIComponent(req.params.id || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ ok: false, error: 'Client ID required.' });

    const user = db.data.users.find(
      (u) => String(u?.username || '').trim().toLowerCase() === username ||
             String(u?.email || '').trim().toLowerCase() === username
    );
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const customerId = String(user?.billing?.stripeCustomerId || '').trim();
    if (!customerId) {
      return res.status(400).json({ ok: false, error: 'No Stripe customer ID on this account.' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ ok: false, error: 'Stripe is not configured on the server.' });
    }

    const Stripe = require('stripe');
    const stripeClient = Stripe(stripeSecretKey);
    const stripeSubscriptionId = String(user?.billing?.stripeSubscriptionId || '').trim();

    // 1. Find the latest open invoice for this customer
    const listParams = { customer: customerId, status: 'open', limit: 1 };
    if (stripeSubscriptionId) listParams.subscription = stripeSubscriptionId;
    const invoiceList = await stripeClient.invoices.list(listParams);
    const openInvoice = invoiceList?.data?.[0] || null;

    if (!openInvoice) {
      return res.json({
        ok: false,
        noOpenInvoice: true,
        message: 'No open invoice found for this customer. Payment may have already succeeded or been voided.',
      });
    }

    const invoiceId = openInvoice.id;
    const amountDue = openInvoice.amount_due;

    // 2. Attempt to pay the invoice using the customer's saved payment method
    let paidInvoice;
    let stripePayError = null;
    try {
      paidInvoice = await stripeClient.invoices.pay(invoiceId);
    } catch (payErr) {
      // Stripe throws for card declines — capture gracefully
      stripePayError = payErr?.raw?.message || payErr?.message || 'Payment attempt failed.';
      // Re-fetch the invoice to get its updated state after the failed attempt
      paidInvoice = await stripeClient.invoices.retrieve(invoiceId);
    }

    const paid = paidInvoice?.status === 'paid';
    const invoiceStatus = String(paidInvoice?.status || '').trim();
    const amountPaid = paidInvoice?.amount_paid ?? 0;
    const hostedInvoiceUrl = String(paidInvoice?.hosted_invoice_url || '').trim();
    const paymentIntentStatus = String(paidInvoice?.payment_intent?.status || paidInvoice?.payment_intent || '').trim();

    // 3. Determine subscription status from the paid invoice if possible
    let newBillingStatus = paid ? 'active' : 'past_due';
    if (paid && stripeSubscriptionId) {
      try {
        const sub = await stripeClient.subscriptions.retrieve(stripeSubscriptionId);
        const subStatus = String(sub?.status || '').trim();
        if (subStatus) newBillingStatus = subStatus;
      } catch (_e) { /* keep 'active' as best guess */ }
    }

    const hasAccess = ['active', 'trialing'].includes(newBillingStatus);
    const now = new Date().toISOString();

    // 4. Update local billing record — only payment/status fields, never prices or plan keys
    user.billing = {
      ...(user.billing || {}),
      status: newBillingStatus,
      hasAccess,
      lastPaymentStatus: paid ? 'paid' : 'failed',
      ...(paid ? { lastPaymentSucceededAt: now } : { lastPaymentFailedAt: now }),
      ...(hostedInvoiceUrl ? { hostedInvoiceUrl } : {}),
      updatedAt: now,
    };
    await db.write();

    console.log('[Admin] retry-payment', {
      username: user.username,
      customerId,
      invoiceId,
      invoiceStatus,
      paid,
      stripePayError,
    });

    return res.json({
      ok: true,
      paid,
      invoiceId,
      invoiceStatus,
      amountPaid,
      amountDue,
      newBillingStatus,
      hasAccess,
      ...(hostedInvoiceUrl ? { hostedInvoiceUrl } : {}),
      ...(paymentIntentStatus ? { paymentIntentStatus } : {}),
      ...(stripePayError ? { paymentError: stripePayError } : {}),
      message: paid
        ? 'Payment succeeded. Subscription is now active.'
        : `Payment failed: ${stripePayError || 'Invoice is still open.'}`,
    });
  } catch (err) {
    console.error('[Admin] retry-payment error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to retry payment.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/billing-portal
// Generates a Stripe Customer Portal session for a specific client.
// Returns { ok, url } — admin opens/shares the URL so the client can update
// their payment method without Smartemark storing any card details.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/billing-portal', limitAdmin, requireAdmin, async (req, res) => {
  try {
    await ensureDB();

    const username = decodeURIComponent(req.params.id || '').trim().toLowerCase();
    if (!username) return res.status(400).json({ ok: false, error: 'Client ID required.' });

    const user = db.data.users.find(
      (u) => String(u?.username || '').trim().toLowerCase() === username ||
             String(u?.email || '').trim().toLowerCase() === username
    );
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const customerId = String(user?.billing?.stripeCustomerId || '').trim();
    if (!customerId) {
      return res.status(400).json({ ok: false, error: 'No Stripe customer ID on this account. Client may not have completed checkout.' });
    }

    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return res.status(500).json({ ok: false, error: 'Stripe is not configured on the server.' });
    }

    const Stripe = require('stripe');
    const stripeClient = Stripe(stripeSecretKey);
    const clientUrl = process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || 'https://smartmark-mvp.onrender.com';

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: clientUrl,
    });

    return res.json({ ok: true, url: session.url, customerId });
  } catch (err) {
    console.error('[Admin] billing-portal error:', err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to create portal session.' });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   LANDING LEADS — admin routes
───────────────────────────────────────────────────────────────────────── */

const VALID_LEAD_STATUSES = ['new', 'contacted', 'booked', 'lost'];

function normalizeLead(lead) {
  return {
    ...lead,
    status: VALID_LEAD_STATUSES.includes(lead.status) ? lead.status : 'new',
    notes: typeof lead.notes === 'string' ? lead.notes : '',
  };
}

// GET /api/admin/tracking-status
router.get('/admin/tracking-status', limitAdmin, requireAdmin, async (req, res) => {
  const { landingPageSlug } = req.query;
  if (!landingPageSlug) {
    return res.status(400).json({ ok: false, error: 'landingPageSlug is required.' });
  }

  const lpConfig = LANDING_PAGE_CONFIGS[landingPageSlug];
  const callConfig = CALL_CONFIGS[landingPageSlug];

  if (!lpConfig) {
    return res.status(404).json({ ok: false, error: `No config found for slug: ${landingPageSlug}` });
  }

  try {
    await db.read();
    const leads = (Array.isArray(db.data.landing_leads) ? db.data.landing_leads : [])
      .filter(l => l.landingPageSlug === landingPageSlug);
    const calls = (Array.isArray(db.data.call_tracking_events) ? db.data.call_tracking_events : [])
      .filter(e => e.landingPageSlug === landingPageSlug);

    const hasReceivedLeads = leads.length > 0;
    const hasReceivedCalls = calls.length > 0;
    const metaPixelConfigured = Boolean(lpConfig.metaPixelId);
    const twilioConfigured = Boolean(callConfig?.twilioNumber);

    const checks = {
      landingPageConfigured: true,
      metaPixelConfigured,
      pageViewEventConfigured: metaPixelConfigured,
      contactEventConfigured: metaPixelConfigured,
      leadEventConfigured: metaPixelConfigured,
      twilioNumberConfigured: twilioConfigured,
      twilioWebhookRouteConfigured: twilioConfigured,
      leadFormEndpointConfigured: true,
      hasReceivedLeads,
      hasReceivedCalls,
    };

    const latestLeadAt = leads.reduce((max, l) => (!max || (l.createdAt ?? '') > max ? l.createdAt : max), null);
    const latestCallAt = calls.reduce((max, c) => (!max || (c.createdAt ?? '') > max ? c.createdAt : max), null);

    return res.json({
      ok: true,
      landingPageSlug,
      businessName: lpConfig.businessName,
      landingPageUrl: lpConfig.landingPageUrl,
      metaPixelId: lpConfig.metaPixelId || null,
      twilioNumber: callConfig?.twilioNumber || null,
      forwardingNumberMasked: callConfig?.forwardingNumber ? maskPhone(callConfig.forwardingNumber) : null,
      checks,
      recentActivity: {
        totalLeads: leads.length,
        latestLeadAt,
        totalCalls: calls.length,
        latestCallAt,
      },
      launchReady: Object.values(checks).every(Boolean),
    });
  } catch (err) {
    console.error('[admin/tracking-status]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/landing-leads
router.get('/admin/landing-leads', limitAdmin, requireAdmin, async (req, res) => {
  try {
    await db.read();
    let leads = Array.isArray(db.data.landing_leads) ? db.data.landing_leads : [];

    const { landingPageSlug, status } = req.query;
    if (landingPageSlug) leads = leads.filter(l => l.landingPageSlug === landingPageSlug);
    if (status) leads = leads.filter(l => (l.status || 'new') === status);

    const normalized = leads.map(normalizeLead).sort((a, b) => b.createdAt?.localeCompare(a.createdAt ?? '') ?? 0);
    return res.json({ ok: true, leads: normalized, total: normalized.length });
  } catch (err) {
    console.error('[admin/landing-leads GET]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/admin/landing-leads/:leadId
router.patch('/admin/landing-leads/:leadId', limitAdmin, requireAdmin, async (req, res) => {
  const { leadId } = req.params;
  const { status, notes } = req.body || {};

  if (status !== undefined && !VALID_LEAD_STATUSES.includes(status)) {
    return res.status(400).json({ ok: false, error: `Invalid status. Must be one of: ${VALID_LEAD_STATUSES.join(', ')}` });
  }

  try {
    await db.read();
    if (!Array.isArray(db.data.landing_leads)) db.data.landing_leads = [];

    const idx = db.data.landing_leads.findIndex(l => l.id === leadId);
    if (idx === -1) return res.status(404).json({ ok: false, error: 'Lead not found.' });

    if (status !== undefined) db.data.landing_leads[idx].status = status;
    if (notes !== undefined) db.data.landing_leads[idx].notes = String(notes).slice(0, 1000);
    db.data.landing_leads[idx].updatedAt = new Date().toISOString();
    await db.write();

    return res.json({ ok: true, lead: normalizeLead(db.data.landing_leads[idx]) });
  } catch (err) {
    console.error('[admin/landing-leads PATCH]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/admin/lead-summary
router.get('/admin/lead-summary', limitAdmin, requireAdmin, async (req, res) => {
  try {
    await db.read();
    const leads = Array.isArray(db.data.landing_leads) ? db.data.landing_leads : [];

    const map = {};
    for (const lead of leads) {
      const key = lead.landingPageSlug || 'unknown';
      if (!map[key]) {
        map[key] = {
          landingPageSlug: key,
          businessName: lead.businessName || '',
          totalLeads: 0,
          newLeads: 0,
          latestLeadAt: null,
        };
      }
      map[key].totalLeads++;
      if ((lead.status || 'new') === 'new') map[key].newLeads++;
      if (!map[key].latestLeadAt || (lead.createdAt ?? '') > map[key].latestLeadAt) {
        map[key].latestLeadAt = lead.createdAt || null;
      }
    }

    return res.json({ ok: true, summary: Object.values(map) });
  } catch (err) {
    console.error('[admin/lead-summary]', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   Admin-client campaign control routes
   These routes bypass resolveFacebookTokenFromReq entirely and go directly
   to the client's stored FB token. They are the authoritative admin path
   for pause/unpause/cancel so TheBoss's session token is never used by mistake.
───────────────────────────────────────────────────────────────────────── */

function buildAdminCampaignControlHandler(action) {
  return async (req, res) => {
    const clientId = decodeURIComponent(req.params.clientId || '');
    const campaignId = String(req.params.campaignId || '').trim();
    const accountId  = String(req.body?.accountId || '').replace(/^act_/, '').trim();

    const ownerKey  = `user:${clientId}`;
    const userToken = getFbUserToken(ownerKey);

    console.log('[campaign-control]', {
      action,
      adminClientId: clientId,
      resolvedOwnerKey: ownerKey,
      accountId,
      campaignId,
    });

    if (!userToken) {
      return res.status(401).json({
        ok: false,
        error: `Client ${clientId} does not have Facebook connected.`,
        action,
        resolvedOwnerKey: ownerKey,
      });
    }

    // Expected status after action (used as fallback if Meta verify fails)
    let expectedStatus;
    if (action === 'pause')   expectedStatus = 'PAUSED';
    if (action === 'unpause') expectedStatus = 'ACTIVE';
    if (action === 'cancel')  expectedStatus = 'PAUSED';

    const mkTok = () => ({ access_token: userToken });

    try {
      // ── Step 1: Set campaign status on Meta ──────────────────────────────
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
        { status: expectedStatus },
        { params: mkTok() }
      );

      // ── Step 1b (unpause only): also activate every PAUSED adset and ad ──
      // Meta requires child objects to be individually activated when the campaign
      // was paused at the adset/ad level. Skips DELETED/ARCHIVED items.
      if (action === 'unpause') {
        // Fetch adsets
        try {
          const adsetsRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/adsets`,
            { params: { ...mkTok(), fields: 'id,name,status,effective_status', limit: 50 } }
          );
          const adsets = Array.isArray(adsetsRes.data?.data) ? adsetsRes.data.data : [];
          for (const adset of adsets) {
            const st = String(adset.status || adset.effective_status || '').toUpperCase();
            if (st === 'DELETED' || st === 'ARCHIVED') continue;
            try {
              await axios.post(
                `https://graph.facebook.com/${META_API_VERSION}/${adset.id}`,
                { status: 'ACTIVE' },
                { params: mkTok() }
              );
              console.log('[campaign-control] adset activated:', adset.id);
            } catch (adsetErr) {
              const ae = adsetErr?.response?.data?.error || null;
              console.warn('[campaign-control] adset activation failed (non-fatal):', {
                adsetId: adset.id, message: ae?.message || adsetErr.message, code: ae?.code,
              });
            }
          }
        } catch (adsetsListErr) {
          console.warn('[campaign-control] could not list adsets:', adsetsListErr?.message);
        }

        // Fetch ads
        try {
          const adsRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/ads`,
            { params: { ...mkTok(), fields: 'id,name,status,effective_status', limit: 100 } }
          );
          const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
          for (const ad of ads) {
            const st = String(ad.status || ad.effective_status || '').toUpperCase();
            if (st === 'DELETED' || st === 'ARCHIVED') continue;
            try {
              await axios.post(
                `https://graph.facebook.com/${META_API_VERSION}/${ad.id}`,
                { status: 'ACTIVE' },
                { params: mkTok() }
              );
              console.log('[campaign-control] ad activated:', ad.id);
            } catch (adErr) {
              const ae = adErr?.response?.data?.error || null;
              console.warn('[campaign-control] ad activation failed (non-fatal):', {
                adId: ad.id, message: ae?.message || adErr.message, code: ae?.code,
              });
            }
          }
        } catch (adsListErr) {
          console.warn('[campaign-control] could not list ads:', adsListErr?.message);
        }
      }

      // ── Step 2: Immediately verify by reading back from Meta ─────────────
      let metaStatus = expectedStatus;
      let effectiveStatus = expectedStatus;
      let configuredStatus = expectedStatus;
      let metaCampaignName = '';
      const lastStatusCheckedAt = new Date().toISOString();

      try {
        const verifyRes = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
          {
            params: {
              access_token: userToken,
              fields: 'id,name,status,effective_status,configured_status',
            },
            timeout: 8000,
          }
        );
        const mc = verifyRes.data || {};
        metaStatus        = String(mc.status           || expectedStatus).toUpperCase();
        effectiveStatus   = String(mc.effective_status || expectedStatus).toUpperCase();
        configuredStatus  = String(mc.configured_status || expectedStatus).toUpperCase();
        metaCampaignName  = String(mc.name || '').trim();
      } catch (verifyErr) {
        console.warn('[campaign-control] Meta verify fetch failed, using expected status:', verifyErr?.message);
      }

      console.log('[campaign-control-verified]', {
        action, campaignId, ownerKey,
        metaStatus, effectiveStatus, configuredStatus,
      });

      // ── Step 3: Update DB so campaigns list returns correct status ────────
      const now = new Date().toISOString();
      try {
        await db.read();
        let needsWrite = false;

        // Update campaign_creatives record
        if (Array.isArray(db.data.campaign_creatives)) {
          const idx = db.data.campaign_creatives.findIndex(
            (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
          );
          if (idx !== -1) {
            db.data.campaign_creatives[idx].status = effectiveStatus;
            db.data.campaign_creatives[idx].lastStatusUpdatedAt = now;
            db.data.campaign_creatives[idx].lastStatusCheckedAt = now;
            if (action === 'cancel') {
              db.data.campaign_creatives[idx].smArchived = true;
              db.data.campaign_creatives[idx].archivedAt = now;
            }
            needsWrite = true;
          }
          // For cancel: also remove the record so it stops appearing in the list
          if (action === 'cancel') {
            const before = db.data.campaign_creatives.length;
            db.data.campaign_creatives = db.data.campaign_creatives.filter(
              (r) => !(String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey)
            );
            if (db.data.campaign_creatives.length !== before) needsWrite = true;
          }
        }

        // Update optimizer_campaign_state record
        if (Array.isArray(db.data.optimizer_campaign_state)) {
          const oIdx = db.data.optimizer_campaign_state.findIndex(
            (s) => String(s?.campaignId || '').trim() === campaignId && String(s?.ownerKey || '').trim() === ownerKey
          );
          if (oIdx !== -1) {
            db.data.optimizer_campaign_state[oIdx].currentStatus = effectiveStatus;
            db.data.optimizer_campaign_state[oIdx].lastStatusCheckedAt = now;
            if (action === 'cancel') {
              db.data.optimizer_campaign_state[oIdx].smArchived = true;
            }
            needsWrite = true;
          }
        }

        if (needsWrite) await db.write();
      } catch (dbErr) {
        console.warn('[campaign-control] DB status update failed (non-critical):', dbErr?.message);
      }

      return res.json({
        ok: true,
        success: true,
        action,
        campaignId,
        accountId,
        resolvedOwnerKey: ownerKey,
        metaStatus,
        effectiveStatus,
        configuredStatus,
        metaCampaignName,
        lastStatusCheckedAt,
      });
    } catch (err) {
      const metaErr = err?.response?.data?.error || null;
      console.error('[campaign-control] Meta call failed:', {
        action,
        campaignId,
        accountId,
        ownerKey,
        status: err?.response?.status,
        metaError: metaErr,
        message: metaErr?.message || err.message,
        code: metaErr?.code,
        subcode: metaErr?.error_subcode,
        userTitle: metaErr?.error_user_title,
        userMessage: metaErr?.error_user_msg,
        fbtrace_id: metaErr?.fbtrace_id,
      });
      return res.status(500).json({
        error: metaErr?.message || err.message,
        action,
        campaignId,
        accountId,
        resolvedOwnerKey: ownerKey,
        metaErrorCode: metaErr?.code || null,
        metaErrorSubcode: metaErr?.error_subcode || null,
        metaUserMessage: metaErr?.error_user_msg || null,
      });
    }
  };
}

// POST /api/admin/clients/:clientId/campaign/:campaignId/pause
router.post('/admin/clients/:clientId/campaign/:campaignId/pause',   limitAdmin, requireAdmin, buildAdminCampaignControlHandler('pause'));
// POST /api/admin/clients/:clientId/campaign/:campaignId/unpause
router.post('/admin/clients/:clientId/campaign/:campaignId/unpause', limitAdmin, requireAdmin, buildAdminCampaignControlHandler('unpause'));
// POST /api/admin/clients/:clientId/campaign/:campaignId/cancel
router.post('/admin/clients/:clientId/campaign/:campaignId/cancel',  limitAdmin, requireAdmin, buildAdminCampaignControlHandler('cancel'));

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/admin/clients/:clientId/campaign/:campaignId/archive-meta
   Stops the CLIENT's campaign on Meta (ARCHIVED → PAUSED fallback), pauses
   all adsets and ads, and marks the campaign archived+hidden in Smartemark.
   ownerKey is ALWAYS user:<clientId> — never the admin's session.
   Example: /api/admin/clients/admin%40aspenacandheat.com/campaign/52540800133888/archive-meta
───────────────────────────────────────────────────────────────────────── */
router.post('/admin/clients/:clientId/campaign/:campaignId/archive-meta', limitAdmin, requireAdmin, async (req, res) => {
  const clientId   = decodeURIComponent(req.params.clientId || '');
  const campaignId = String(req.params.campaignId || '').trim();
  const accountId  = String(req.body?.accountId || '').replace(/^act_/, '').trim();

  if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId is required' });
  if (!clientId)   return res.status(400).json({ ok: false, error: 'clientId is required' });

  // ownerKey is ALWAYS the client's key — never resolved from the admin's session
  const ownerKey  = `user:${clientId}`;
  const userToken = getFbUserToken(ownerKey);

  console.log('[admin/archive-meta]', { clientId, resolvedOwnerKey: ownerKey, accountId, campaignId });

  if (!userToken) {
    return res.status(401).json({
      ok: false,
      error: `Client ${clientId} does not have Facebook connected.`,
      resolvedOwnerKey: ownerKey,
    });
  }

  const mkTok = () => ({ access_token: userToken });
  const now = new Date().toISOString();
  let finalStatus = 'ARCHIVED';
  let metaStatus  = 'ARCHIVED';
  let effectiveStatus = 'ARCHIVED';

  try {
    // Step 1: Try ARCHIVED on Meta; fall back to PAUSED if Meta rejects it
    try {
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
        { status: 'ARCHIVED' },
        { params: mkTok() }
      );
    } catch (archiveErr) {
      console.warn('[admin/archive-meta] ARCHIVED rejected, falling back to PAUSED:', archiveErr?.response?.data?.error?.message || archiveErr.message);
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
        { status: 'PAUSED' },
        { params: mkTok() }
      );
      finalStatus = 'PAUSED';
    }

    // Step 2: Pause every non-deleted adset (cursor-paginated — no page limit)
    const childPauseFailures = [];
    try {
      let afterCursor = null;
      do {
        const params = { ...mkTok(), fields: 'id,status,effective_status', limit: 50 };
        if (afterCursor) params.after = afterCursor;
        const adsetsRes = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/adsets`,
          { params }
        );
        const adsets = Array.isArray(adsetsRes.data?.data) ? adsetsRes.data.data : [];
        for (const adset of adsets) {
          const st = String(adset.status || adset.effective_status || '').toUpperCase();
          if (st === 'DELETED' || st === 'ARCHIVED') continue;
          try {
            await axios.post(`https://graph.facebook.com/${META_API_VERSION}/${adset.id}`, { status: 'PAUSED' }, { params: mkTok() });
            console.log('[admin/archive-meta] adset paused:', adset.id);
          } catch (e) {
            const msg = e?.response?.data?.error?.message || e.message;
            console.warn('[admin/archive-meta] adset pause failed (non-fatal):', adset.id, msg);
            childPauseFailures.push({ type: 'adset', id: adset.id, error: msg });
          }
        }
        afterCursor = adsetsRes.data?.paging?.cursors?.after || null;
        if (!adsetsRes.data?.paging?.next) afterCursor = null;
      } while (afterCursor);
    } catch (e) {
      console.warn('[admin/archive-meta] adsets list failed (non-fatal):', e?.message);
      childPauseFailures.push({ type: 'adsets_list', error: e?.message });
    }

    // Step 3: Pause every non-deleted ad (cursor-paginated — no page limit)
    try {
      let afterCursor = null;
      do {
        const params = { ...mkTok(), fields: 'id,status,effective_status', limit: 100 };
        if (afterCursor) params.after = afterCursor;
        const adsRes = await axios.get(
          `https://graph.facebook.com/${META_API_VERSION}/${campaignId}/ads`,
          { params }
        );
        const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
        for (const ad of ads) {
          const st = String(ad.status || ad.effective_status || '').toUpperCase();
          if (st === 'DELETED' || st === 'ARCHIVED') continue;
          try {
            await axios.post(`https://graph.facebook.com/${META_API_VERSION}/${ad.id}`, { status: 'PAUSED' }, { params: mkTok() });
            console.log('[admin/archive-meta] ad paused:', ad.id);
          } catch (e) {
            const msg = e?.response?.data?.error?.message || e.message;
            console.warn('[admin/archive-meta] ad pause failed (non-fatal):', ad.id, msg);
            childPauseFailures.push({ type: 'ad', id: ad.id, error: msg });
          }
        }
        afterCursor = adsRes.data?.paging?.cursors?.after || null;
        if (!adsRes.data?.paging?.next) afterCursor = null;
      } while (afterCursor);
    } catch (e) {
      console.warn('[admin/archive-meta] ads list failed (non-fatal):', e?.message);
      childPauseFailures.push({ type: 'ads_list', error: e?.message });
    }

    // Step 4: Verify actual Meta status
    try {
      const verifyRes = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/${campaignId}`,
        { params: { ...mkTok(), fields: 'id,status,effective_status' }, timeout: 8000 }
      );
      const mc = verifyRes.data || {};
      metaStatus      = String(mc.status           || finalStatus).toUpperCase();
      effectiveStatus = String(mc.effective_status || finalStatus).toUpperCase();
    } catch (verifyErr) {
      console.warn('[admin/archive-meta] verify fetch failed, using expected status:', verifyErr?.message);
      metaStatus      = finalStatus;
      effectiveStatus = finalStatus;
    }

    const currentStatus = effectiveStatus === 'ARCHIVED' ? 'ARCHIVED' : 'PAUSED_ARCHIVED';

    // Step 5: Update Smartemark DB — mark smArchived + hiddenFromHistory
    try {
      await db.read();
      db.data.campaign_creatives = db.data.campaign_creatives || [];
      const idx = db.data.campaign_creatives.findIndex(
        (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
      );
      if (idx !== -1) {
        db.data.campaign_creatives[idx] = {
          ...db.data.campaign_creatives[idx],
          smArchived: true,
          hiddenFromHistory: true,
          status: effectiveStatus,
          currentStatus,
          archivedAt: now,
          hiddenAt: now,
          lastStatusCheckedAt: now,
        };
      } else {
        db.data.campaign_creatives.push({
          campaignId,
          ownerKey,
          accountId,
          smArchived: true,
          hiddenFromHistory: true,
          status: effectiveStatus,
          currentStatus,
          archivedAt: now,
          hiddenAt: now,
          lastStatusCheckedAt: now,
        });
      }

      db.data.optimizer_campaign_state = db.data.optimizer_campaign_state || [];
      const optIdx = db.data.optimizer_campaign_state.findIndex(
        (s) => String(s?.campaignId || '').trim() === campaignId && String(s?.ownerKey || '').trim() === ownerKey
      );
      if (optIdx !== -1) {
        db.data.optimizer_campaign_state[optIdx] = {
          ...db.data.optimizer_campaign_state[optIdx],
          smArchived: true,
          hiddenFromHistory: true,
          currentStatus,
          optimizationEnabled: false,
          archivedAt: now,
          lastStatusCheckedAt: now,
        };
      }

      await db.write();
    } catch (dbErr) {
      console.warn('[admin/archive-meta] DB update failed (non-critical):', dbErr?.message);
    }

    return res.json({
      ok: true,
      success: true,
      campaignId,
      accountId,
      resolvedOwnerKey: ownerKey,
      metaStatus,
      effectiveStatus,
      currentStatus,
      smArchived: true,
      hiddenFromHistory: true,
      lastStatusCheckedAt: now,
      ...(childPauseFailures.length > 0 && { childPauseFailures }),
    });
  } catch (err) {
    const metaErr = err?.response?.data?.error || null;
    console.error('[admin/archive-meta] failed:', {
      campaignId, ownerKey,
      status: err?.response?.status,
      metaError: metaErr,
      message: metaErr?.message || err.message,
    });
    return res.status(500).json({
      ok: false,
      error: metaErr?.message || err.message || 'Failed to stop campaign on Meta',
      campaignId,
      resolvedOwnerKey: ownerKey,
      metaErrorCode: metaErr?.code || null,
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────────────
   AI Control Settings — admin-client routes
   ownerKey is ALWAYS user:<clientId>, never the admin's own session.
───────────────────────────────────────────────────────────────────────────── */

// GET /api/admin/clients/:clientId/campaign/:campaignId/ai-settings
router.get('/admin/clients/:clientId/campaign/:campaignId/ai-settings', limitAdmin, requireAdmin, async (req, res) => {
  const clientId   = decodeURIComponent(req.params.clientId || '');
  const campaignId = String(req.params.campaignId || '').trim();
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
  if (!clientId)   return res.status(400).json({ error: 'clientId is required' });

  const ownerKey = `user:${clientId}`;
  try {
    await db.read();
    const state = (db.data.optimizer_campaign_state || []).find(
      (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
    );
    return res.json({
      ok: true,
      campaignId,
      resolvedOwnerKey: ownerKey,
      aiSettingsInitialized: state?.aiSettingsInitialized === true,
      aiAutopilotEnabled: state?.aiSettingsInitialized === true
        ? (state.optimizationEnabled !== false)
        : false,
      aiApprovalRequired: state?.aiSettingsInitialized === true
        ? (state.aiApprovalRequired === true)
        : true,
      aiSettingsUpdatedAt: state?.aiSettingsUpdatedAt || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to load AI settings' });
  }
});

// PATCH /api/admin/clients/:clientId/campaign/:campaignId/ai-settings
router.patch('/admin/clients/:clientId/campaign/:campaignId/ai-settings', limitAdmin, requireAdmin, async (req, res) => {
  const clientId   = decodeURIComponent(req.params.clientId || '');
  const campaignId = String(req.params.campaignId || '').trim();
  if (!campaignId) return res.status(400).json({ error: 'campaignId is required' });
  if (!clientId)   return res.status(400).json({ error: 'clientId is required' });

  const ownerKey = `user:${clientId}`;
  try {
    await db.read();
    const { aiAutopilotEnabled, aiApprovalRequired } = req.body || {};
    const now = new Date().toISOString();
    const patch = {
      ...(typeof aiAutopilotEnabled === 'boolean' && { optimizationEnabled: aiAutopilotEnabled }),
      ...(typeof aiApprovalRequired === 'boolean' && { aiApprovalRequired }),
      aiSettingsInitialized: true,  // explicit save — user has configured these settings
      aiSettingsUpdatedAt: now,
    };

    db.data.optimizer_campaign_state = db.data.optimizer_campaign_state || [];
    const sIdx = db.data.optimizer_campaign_state.findIndex(
      (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
    );
    let state;
    if (sIdx !== -1) {
      Object.assign(db.data.optimizer_campaign_state[sIdx], patch);
      state = db.data.optimizer_campaign_state[sIdx];
    } else {
      const stub = { campaignId, ownerKey, ...patch };
      db.data.optimizer_campaign_state.push(stub);
      state = stub;
    }

    db.data.campaign_creatives = db.data.campaign_creatives || [];
    const ccIdx = db.data.campaign_creatives.findIndex(
      (r) => String(r.campaignId || '') === campaignId && String(r.ownerKey || '') === ownerKey
    );
    if (ccIdx !== -1) Object.assign(db.data.campaign_creatives[ccIdx], patch);

    await db.write();
    return res.json({
      ok: true,
      campaignId,
      resolvedOwnerKey: ownerKey,
      aiSettingsInitialized: true,
      aiAutopilotEnabled: state.optimizationEnabled !== false,
      aiApprovalRequired: state.aiApprovalRequired === true,
      aiSettingsUpdatedAt: state.aiSettingsUpdatedAt || now,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Failed to save AI settings' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:id/multi-area-launch
// Admin-only. Launches one Meta campaign per area using the client's FB token.
// Delegates to POST /api/facebook/multi-area-launch, injecting the client's
// ownerKey so each child launch resolves the correct FB token.
// Body: same shape as /api/facebook/multi-area-launch (launchMode, areaCampaigns, …)
//       plus adAccountId at the top level.
// Returns: { ok, partialSuccess, parentCampaignGroupId, results, errors }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:id/multi-area-launch', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const clientOwnerKey = `user:${String(user.username || '').trim()}`;

    const clientToken = getFbUserToken(clientOwnerKey);
    if (!clientToken) {
      return res.status(400).json({
        ok: false,
        error: 'Client does not have Facebook connected. They must connect Facebook first.',
      });
    }

    const { adAccountId, ...campaignBody } = req.body || {};
    if (!adAccountId) {
      return res.status(400).json({ ok: false, error: 'adAccountId is required.' });
    }

    if (!Array.isArray(campaignBody.areaCampaigns) || campaignBody.areaCampaigns.length === 0) {
      return res.status(400).json({ ok: false, error: 'areaCampaigns must be a non-empty array.' });
    }

    const selfBase =
      process.env.RENDER_EXTERNAL_URL ||
      process.env.PUBLIC_BASE_URL ||
      `http://localhost:${process.env.PORT || 3001}`;

    const adminSid = getSidFromReq(req);

    // Override destinationUrl on each area from the client's intake websiteUrl when
    // the area didn't supply one (same policy as the single-campaign admin launch).
    const intakeWebsiteUrl = String(user.premiumIntake?.websiteUrl || '').trim();
    let mergedBody = { ...campaignBody };
    if (intakeWebsiteUrl) {
      mergedBody.areaCampaigns = (mergedBody.areaCampaigns || []).map((area) => ({
        ...area,
        destinationUrl: area.destinationUrl || intakeWebsiteUrl,
      }));
    }

    const launchRes = await axios.post(
      `${selfBase}/api/facebook/multi-area-launch`,
      {
        ...mergedBody,
        adAccountId,
        ownerKey: clientOwnerKey,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          [SID_HEADER]: adminSid,
          Cookie: req.headers.cookie || '',
        },
        timeout: 180000, // 3 min — allows multiple sequential area launches
      }
    );

    return res.json({ ok: true, ...launchRes.data });
  } catch (err) {
    const upstream = err?.response?.data;
    if (upstream) {
      console.error('[Admin] multi-area-launch upstream error:', upstream);
      return res.status(err.response?.status || 500).json({
        ok: false,
        error: upstream?.error || 'Multi-area launch failed.',
        upstream,
      });
    }
    console.error('[Admin] multi-area-launch error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Multi-area campaign launch failed. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:id/campaign/:campaignId/ad-metrics
// Admin-only. Returns per-ad Meta Insights for a client campaign.
// Delegates to the auth-route ad-metrics endpoint using the client's FB token.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:id/campaign/:campaignId/ad-metrics', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const username = decodeURIComponent(req.params.id);
    const user = await findUserByUsername(username);
    if (!user) return res.status(404).json({ ok: false, error: 'Client not found.' });

    const campaignId = String(req.params.campaignId || '').trim();
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId required.' });

    await ensureDB();
    const clientOwnerKey = `user:${String(user.username || '').trim()}`;

    console.log('[AD_METRICS_ADMIN_REQUEST]', { username, campaignId, clientOwnerKey });

    const clientToken = getFbUserToken(clientOwnerKey);
    if (!clientToken) {
      return res.json({ ok: false, noToken: true, byAdId: {}, adCount: 0, error: 'No Facebook token for this client.' });
    }

    // Look up account ID for this campaign from DB
    const creativeRecord = (db.data.campaign_creatives || []).find(
      (r) => String(r.campaignId || '').trim() === campaignId &&
             String(r.ownerKey   || '').trim() === clientOwnerKey
    );
    const accountId = String(creativeRecord?.accountId || '').replace(/^act_/, '').trim();

    console.log('[AD_METRICS_ADMIN_OWNER_RESOLVED]', { clientOwnerKey, accountId, hasCreativeRecord: !!creativeRecord });

    if (!accountId) {
      return res.json({ ok: false, error: 'Account ID not found for this campaign.', byAdId: {}, adCount: 0 });
    }

    const selfBase  = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3001}`;
    const adminSid  = getSidFromReq(req);

    const r = await axios.get(
      `${selfBase}/auth/facebook/adaccount/${accountId}/campaign/${campaignId}/ad-metrics`,
      {
        params:  { ownerKey: clientOwnerKey },
        headers: { [SID_HEADER]: adminSid, Cookie: req.headers.cookie || '' },
        timeout: 30000,
      }
    );

    console.log('[AD_METRICS_ADMIN_SUCCESS]', { clientOwnerKey, campaignId, adCount: r.data?.adCount });
    return res.json(r.data);
  } catch (err) {
    const upstream = err?.response?.data;
    console.error('[Admin] ad-metrics error:', upstream || err?.message);
    return res.status(err.response?.status || 500).json({
      ok:    false,
      error: upstream?.error || err?.message || 'Failed to fetch ad metrics.',
      byAdId: {},
      adCount: 0,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/clients/:clientId/campaign/:campaignId/conversion-summary
// Admin-only. Read-only. Returns landing page events + call tracking totals.
// Filters by pageSlug query param if provided; otherwise uses all known slugs
// from LANDING_PAGE_CONFIGS (all currently belong to Aspen/Joe).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/admin/clients/:clientId/campaign/:campaignId/conversion-summary', limitAdmin, requireAdmin, async (req, res) => {
  try {
    const clientId   = decodeURIComponent(req.params.clientId || '');
    const campaignId = String(req.params.campaignId || '').trim();
    if (!clientId) return res.status(400).json({ ok: false, error: 'clientId required.' });

    await db.read();
    db.data = db.data || {};

    // Optional filters from query
    const pageSlugParam = String(req.query.pageSlug || '').trim();
    const sinceDays     = Math.min(Math.max(Number(req.query.sinceDays || 90), 1), 365);
    const sinceDate     = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

    // Determine which page slugs to include
    const knownSlugs = new Set(Object.keys(LANDING_PAGE_CONFIGS));
    const pageSlugsToInclude = pageSlugParam
      ? new Set([pageSlugParam])
      : knownSlugs;

    // ── Landing events ────────────────────────────────────────────────────────
    const allEvents = Array.isArray(db.data.landing_events) ? db.data.landing_events : [];
    const events = allEvents.filter((e) => {
      if ((e.createdAt || '') < sinceDate) return false;
      // Match by campaignId first; fall back to pageSlug / clientSlug
      if (e.campaignId && e.campaignId === campaignId) return true;
      if (pageSlugsToInclude.has(e.pageSlug)) return true;
      // clientSlug "aspen" also maps to aspen-ac — accept either
      return [...pageSlugsToInclude].some((slug) => {
        const cfg = LANDING_PAGE_CONFIGS[slug];
        return cfg && e.clientSlug && e.clientSlug === String(slug.split('-')[0]);
      });
    });

    const TRACKED_EVENTS = ['page_view', 'call_click', 'cta_click', 'lead_submit'];
    const landingCounts = Object.fromEntries(TRACKED_EVENTS.map((k) => [k, 0]));
    for (const e of events) {
      if (e.eventName in landingCounts) landingCounts[e.eventName]++;
    }

    // Break down by metaAdId and utm_content for future attribution
    const byMetaAdId = {};
    const byUtmContent = {};
    for (const e of events) {
      if (e.metaAdId) {
        byMetaAdId[e.metaAdId] = byMetaAdId[e.metaAdId] || {};
        byMetaAdId[e.metaAdId][e.eventName] = (byMetaAdId[e.metaAdId][e.eventName] || 0) + 1;
      }
      if (e.utm_content) {
        byUtmContent[e.utm_content] = byUtmContent[e.utm_content] || {};
        byUtmContent[e.utm_content][e.eventName] = (byUtmContent[e.utm_content][e.eventName] || 0) + 1;
      }
    }

    // ── Call tracking events (real Twilio calls) ──────────────────────────────
    const allCalls = Array.isArray(db.data.call_tracking_events) ? db.data.call_tracking_events : [];
    const calls = allCalls.filter((c) => {
      if ((c.createdAt || '') < sinceDate) return false;
      return pageSlugsToInclude.has(c.landingPageSlug);
    });

    let answeredCalls = 0, missedCalls = 0, totalCallDurationSec = 0;
    for (const c of calls) {
      const statuses = Array.isArray(c.statusUpdates) ? c.statusUpdates : [];
      const completedUpdate = statuses.find((s) => s.callStatus === 'completed');
      const dur = Number(c.duration || completedUpdate?.duration || 0);
      if (dur > 0) {
        answeredCalls++;
        totalCallDurationSec += dur;
      } else {
        const isCompleted = c.callStatus === 'completed' || statuses.some((s) => s.callStatus === 'completed');
        if (isCompleted) answeredCalls++;
        else missedCalls++;
      }
    }

    const formLeads   = landingCounts.lead_submit;
    const conversions = answeredCalls + formLeads;

    const recentEvents = [...events]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 20)
      .map((e) => ({
        id:          e.id,
        eventName:   e.eventName,
        pageSlug:    e.pageSlug,
        campaignId:  e.campaignId  || null,
        metaAdId:    e.metaAdId    || null,
        utm_content: e.utm_content || null,
        createdAt:   e.createdAt,
      }));

    const recentCalls = [...calls]
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10)
      .map((c) => ({
        id:              c.id,
        callStatus:      c.callStatus,
        duration:        c.duration || null,
        createdAt:       c.createdAt,
        landingPageSlug: c.landingPageSlug,
      }));

    return res.json({
      ok: true,
      clientId,
      campaignId,
      sinceDays,
      totals: {
        pageViews:               landingCounts.page_view,
        callClicks:              landingCounts.call_click,
        scheduleClicks:          landingCounts.cta_click,
        formLeads,
        trackedCalls:            calls.length,
        answeredCalls,
        missedCalls,
        totalCallDurationSeconds: totalCallDurationSec,
        conversions,
      },
      landingEvents:   landingCounts,
      byMetaAdId:      Object.keys(byMetaAdId).length  > 0 ? byMetaAdId  : null,
      byUtmContent:    Object.keys(byUtmContent).length > 0 ? byUtmContent : null,
      calls: {
        total:    calls.length,
        answered: answeredCalls,
        missed:   missedCalls,
        recent:   recentCalls,
      },
      recentEvents,
    });
  } catch (err) {
    console.error('[conversion-summary] error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Failed to load conversion summary.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/clients/:clientId/ad/:adId/pause
// POST /api/admin/clients/:clientId/ad/:adId/resume
// POST /api/admin/clients/:clientId/ad/:adId/delete
//
// Admin-only per-ad pause/resume/delete that always uses the CLIENT's FB token.
// The regular /auth/facebook/adaccount/:accountId/ad/:adId/pause path resolves
// the token from the admin's session — which has no permission on the client's
// ad account — causing Meta code 100. This path resolves the client's own token.
//
// Steps:
//   1. Resolve client's FB token.
//   2. Verify the ad exists and is accessible via GET before attempting mutation.
//   3. If code 100 → return 400 with clear explanation (not generic 500).
//   4. Perform action (PAUSED / ACTIVE / ARCHIVED).
//   5. Re-fetch effective_status from Meta.
//   6. Update DB launchedCreativeSet.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/admin/clients/:clientId/ad/:adId/:action', limitAdmin, requireAdmin, async (req, res) => {
  const clientId  = decodeURIComponent(req.params.clientId || '').trim();
  const adId      = String(req.params.adId   || '').trim();
  const action    = String(req.params.action || '').trim(); // pause | resume | delete

  const ALLOWED_ACTIONS = new Set(['pause', 'resume', 'delete']);
  if (!ALLOWED_ACTIONS.has(action)) {
    return res.status(400).json({ ok: false, error: `Unknown action "${action}". Allowed: pause, resume, delete.` });
  }
  if (!clientId) return res.status(400).json({ ok: false, error: 'clientId is required.' });
  if (!adId)     return res.status(400).json({ ok: false, error: 'adId is required.' });

  const ownerKey  = `user:${clientId}`;
  const userToken = getFbUserToken(ownerKey);

  console.log('[AD_ACTION_REQUEST]', {
    action,
    adId,
    clientId,
    ownerKey,
    hasToken: !!userToken,
  });

  if (!userToken) {
    return res.status(401).json({
      ok:      false,
      error:   `Client ${clientId} does not have Facebook connected. Ask them to reconnect their account.`,
      ownerKey,
      adId,
      action,
    });
  }

  try {
    // ── Step 1: Verify the ad object is accessible before mutating ──────────
    console.log('[AD_ACTION_VERIFY_META_OBJECT]', { adId, action, ownerKey });
    let verifiedAd = null;
    try {
      const verifyRes = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
        {
          params: {
            access_token: userToken,
            fields: 'id,name,account_id,campaign_id,adset_id,status,effective_status,configured_status,creative{id,name}',
          },
          timeout: 10000,
        }
      );
      verifiedAd = verifyRes.data || null;
      console.log('[AD_ACTION_VERIFY_SUCCESS]', {
        adId,
        metaId:     verifiedAd?.id,
        accountId:  verifiedAd?.account_id,
        campaignId: verifiedAd?.campaign_id,
        status:     verifiedAd?.status,
        effectiveStatus: verifiedAd?.effective_status,
      });
    } catch (verifyErr) {
      const fbErr  = verifyErr?.response?.data?.error || {};
      const fbCode = fbErr?.code;
      console.error('[AD_ACTION_VERIFY_ERROR]', {
        adId,
        action,
        ownerKey,
        httpStatus: verifyErr?.response?.status,
        metaCode:   fbCode,
        metaType:   fbErr?.type,
        metaError:  fbErr?.message,
      });

      // Meta code 100 = object not found / no permission — do not return 500.
      const httpStatus = (fbCode === 100 || fbCode === 200 || fbCode === 190) ? 400 : 500;
      return res.status(httpStatus).json({
        ok:          false,
        error:       'Smartemark could not access this ad ID. It may be stale, not an ad object, or the connected account may lack permission. Refresh the campaign creatives from Meta and try again.',
        metaCode:    fbCode    || null,
        metaMessage: fbErr?.message || verifyErr?.message || null,
        adId,
        ownerKey,
        action,
        hint:        fbCode === 100
          ? 'The stored ad ID may be stale. Use Refresh from Meta in the Creatives tab to rebuild the creative set with current ad IDs.'
          : undefined,
      });
    }

    // ── Step 1b: Block pause/resume on archived/deleted ads ────────────────
    if (action === 'pause' || action === 'resume') {
      const verifiedEff = String(verifiedAd?.effective_status || verifiedAd?.status || '').toUpperCase();
      if (verifiedEff === 'ARCHIVED' || verifiedEff === 'DELETED') {
        const termStatus = verifiedEff.toLowerCase();
        const termUi     = verifiedEff;
        const termAction = termStatus === 'archived' ? 'archive_detected' : 'delete_detected';
        // Best-effort DB update
        try {
          await db.read();
          const rec = (db.data.campaign_creatives || []).find(
            (r) => Array.isArray(r.launchedCreativeSet) && r.launchedCreativeSet.some((c) => c.metaAdId === adId)
          );
          if (rec) {
            rec.launchedCreativeSet = rec.launchedCreativeSet.map((c) =>
              c.metaAdId === adId ? { ...c, status: termStatus, uiStatus: termUi, configuredStatus: termUi, effectiveStatus: termUi, lastAction: termAction, lastActionAt: new Date().toISOString() } : c
            );
            await db.write();
          }
        } catch {}
        return res.status(400).json({
          ok:              false,
          archived:        true,
          adId,
          status:          termUi,
          uiStatus:        termUi,
          configuredStatus: termUi,
          effectiveStatus: termUi,
          lastAction:      termAction,
          error:           `This ad is ${termStatus} in Meta and cannot be paused or resumed.`,
        });
      }
    }

    // ── Step 2: Perform the action ──────────────────────────────────────────
    const metaStatus =
      action === 'pause'  ? 'PAUSED'   :
      action === 'resume' ? 'ACTIVE'   :
      /* delete */          'ARCHIVED';

    console.log('[AD_ACTION_META_REQUEST]', { adId, metaStatus, apiVersion: META_API_VERSION });
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
      { status: metaStatus },
      { params: { access_token: userToken } }
    );

    // ── Step 3: Re-fetch to confirm Meta's view of the ad ────────────────────
    // effectiveStatus may return "IN_PROCESS" immediately after a mutation.
    // Use configuredStatus (what Meta was told) as the source of truth for UI.
    const requestedStatus = metaStatus; // e.g. 'PAUSED', 'ACTIVE', 'ARCHIVED'
    let effectiveStatus  = metaStatus;
    let configuredStatus = metaStatus;
    try {
      const confirmRes = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
        { params: { access_token: userToken, fields: 'id,status,effective_status,configured_status' }, timeout: 8000 }
      );
      effectiveStatus  = String(confirmRes.data?.effective_status  || metaStatus).toUpperCase();
      configuredStatus = String(confirmRes.data?.configured_status || metaStatus).toUpperCase();
      console.log('[AD_STATUS_SYNC]', { adId, action, effectiveStatus, configuredStatus });
    } catch (confirmErr) {
      console.warn('[AD_STATUS_SYNC] post-action verify failed (non-fatal):', adId, confirmErr?.message);
    }

    // uiStatus: what the frontend should display immediately.
    // Do NOT use effectiveStatus — Meta returns "IN_PROCESS" during propagation.
    // configuredStatus reflects what Meta was told; if that's also IN_PROCESS, fall back to requestedStatus.
    const uiStatus = (configuredStatus && configuredStatus !== 'IN_PROCESS')
      ? configuredStatus
      : requestedStatus;

    console.log('[AD_ACTION_STATUS_PAYLOAD]', { adId, action, requestedStatus, configuredStatus, effectiveStatus, uiStatus });

    // ── Step 4: Update DB launchedCreativeSet ─────────────────────────────────
    const dbStatus    = action === 'delete' ? 'deleted' : action === 'pause' ? 'paused' : 'active';
    const lastActionAt = new Date().toISOString();
    try {
      await db.read();
      const rec = (db.data.campaign_creatives || []).find(
        (r) => Array.isArray(r.launchedCreativeSet) &&
               r.launchedCreativeSet.some((c) => c.metaAdId === adId) &&
               r.ownerKey === ownerKey
      );
      if (rec) {
        const adPatch = { status: dbStatus, configuredStatus, effectiveStatus, uiStatus, lastAction: action, lastActionAt };
        rec.launchedCreativeSet = rec.launchedCreativeSet.map((c) =>
          c.metaAdId === adId ? { ...c, ...adPatch } : c
        );
        // For delete/archive: also write a durable archivedMetaAdIds entry so the
        // creatives endpoint can force-archive this ad even after Meta stops returning it.
        if (action === 'delete') {
          if (!rec.archivedMetaAdIds || typeof rec.archivedMetaAdIds !== 'object') rec.archivedMetaAdIds = {};
          rec.archivedMetaAdIds[adId] = {
            status: 'archived', uiStatus: 'ARCHIVED', configuredStatus: 'ARCHIVED',
            effectiveStatus: 'ARCHIVED', lastAction: 'delete', lastActionAt,
          };
        }
        await db.write();
      }
      console.log('[AD_ACTION_SUCCESS]', { adId, action, uiStatus, effectiveStatus, dbUpdated: !!rec, ownerKey });
    } catch (dbErr) {
      console.warn('[AD_ACTION_SUCCESS] DB update failed (non-fatal):', dbErr?.message);
    }

    return res.json({
      ok:              true,
      adId,
      action,
      requestedStatus,
      status:          requestedStatus,
      configuredStatus,
      effectiveStatus,
      uiStatus,
      dbUpdated:       true,
    });

  } catch (err) {
    const fbErr = err?.response?.data?.error || {};
    console.error('[AD_ACTION_META_ERROR]', {
      adId,
      action,
      clientId,
      httpStatus: err?.response?.status,
      metaCode:   fbErr?.code,
      metaType:   fbErr?.type,
      metaError:  fbErr?.message || err?.message,
    });
    const httpStatus = (fbErr?.code === 100 || fbErr?.code === 200) ? 400 : 500;
    return res.status(httpStatus).json({
      ok:          false,
      error:       fbErr?.message || err?.message || `Failed to ${action} ad.`,
      metaCode:    fbErr?.code    || null,
      metaMessage: fbErr?.message || null,
      adId,
      action,
    });
  }
});

module.exports = router;
