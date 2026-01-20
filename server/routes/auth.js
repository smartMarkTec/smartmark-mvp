// server/routes/auth.js
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db');
const { getFbUserToken, setFbUserToken } = require('../tokenStore');
const { policy } = require('../smartCampaignEngine');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

/* ------------------------------------------------------------------ */
/*                    Small in-process defaults cache                  */
/* ------------------------------------------------------------------ */
// Per-user defaults (prevents users overwriting each other)
const DEFAULTS_BY_OWNER = new Map();

function defaultsFor(ownerKey) {
  if (!DEFAULTS_BY_OWNER.has(ownerKey)) {
    DEFAULTS_BY_OWNER.set(ownerKey, {
      adAccountId: null,
      pageId: null,
      adAccounts: [],
      pages: [],
    });
  }
  return DEFAULTS_BY_OWNER.get(ownerKey);
}

async function refreshDefaults(userToken, ownerKey) {
  const DEFAULTS = defaultsFor(ownerKey);

  try {
    const [acctRes, pagesRes] = await Promise.all([
      axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
        params: { access_token: userToken, fields: 'id,name,account_status' },
      }),
      axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: userToken, fields: 'id,name,access_token' },
      }),
    ]);

    const accts = Array.isArray(acctRes.data?.data) ? acctRes.data.data : [];
    const pages = Array.isArray(pagesRes.data?.data) ? pagesRes.data.data : [];

    DEFAULTS.adAccounts = accts.map(a => ({
      id: String(a.id).replace(/^act_/, ''),
      name: a.name,
      account_status: a.account_status
    }));
    DEFAULTS.pages = pages.map(p => ({ id: p.id, name: p.name }));

    const firstAcct = DEFAULTS.adAccounts[0]?.id || null;
    const firstPage = DEFAULTS.pages[0]?.id || null;

    if (!DEFAULTS.adAccountId || !DEFAULTS.adAccounts.find(a => a.id === DEFAULTS.adAccountId)) {
      DEFAULTS.adAccountId = firstAcct;
    }
    if (!DEFAULTS.pageId || !DEFAULTS.pages.find(p => p.id === DEFAULTS.pageId)) {
      DEFAULTS.pageId = firstPage;
    }
  } catch { /* ignore */ }
}

/* ------------------------------- ENV ------------------------------- */
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const COOKIE_NAME = 'sm_sid';
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const RETURN_TO_COOKIE = 'sm_return_to';

// --- per-user key for tokenStore (so users don't overwrite each other) ---
function ownerKeyFromReq(req) {
  const cookieSid = req.cookies?.sm_sid;
  const headerSid = req.get('x-sm-sid');
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  return cookieSid || headerSid || bearer || `ip:${req.ip}`;
}

function computeCookieDomain() {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN; // e.g. smartmark-mvp.onrender.com
  if (process.env.RENDER_EXTERNAL_URL) {
    try { return new URL(process.env.RENDER_EXTERNAL_URL).hostname; } catch {}
  }
  return undefined;
}

/* Consistent cookie setter */
function setSessionCookie(res, sid) {
  const opts = {
    httpOnly: true,
    secure: isProd,                   // required when SameSite=None
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
  const dom = computeCookieDomain();
  if (dom) opts.domain = dom;
  res.cookie(COOKIE_NAME, sid, opts);
}

/* ----------------------------- Sanity route ----------------------------- */
router.get('/facebook/ping', (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const DEFAULTS = defaultsFor(ownerKey);

  res.json({
    ok: true,
    env: {
      FACEBOOK_APP_ID: !!FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: !!FACEBOOK_APP_SECRET,
      FACEBOOK_REDIRECT_URI
    },
    defaults: {
      adAccountId: DEFAULTS.adAccountId,
      pageId: DEFAULTS.pageId,
      adAccounts: DEFAULTS.adAccounts,
      pages: DEFAULTS.pages,
    }
  });
});

// Helper: absolute public URL for generated assets
function absolutePublicUrl(relativePath) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com';
  if (!relativePath) return '';
  return /^https?:\/\//i.test(relativePath) ? relativePath : `${base}${relativePath}`;
}

/* ------------------------------ Facebook OAuth ------------------------------ */
const FB_SCOPES = [
  'pages_manage_engagement','pages_manage_metadata','pages_manage_posts',
  'pages_read_engagement','pages_read_user_content','pages_show_list',
  'public_profile','read_insights','business_management','ads_management','ads_read'
];

router.get('/facebook', (req, res) => {
  // ✅ ensure we have a stable sid before redirect
  let sid = req.cookies?.[COOKIE_NAME];
  if (!sid) {
    sid = `sm_${nanoid(24)}`;
    setSessionCookie(res, sid);
  }

  // ✅ state MUST be tied to this user/session
  const state = sid;

  // ✅ store expected state for callback validation
  const dom = computeCookieDomain();
  res.cookie('sm_oauth_state', state, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000, // 10 min
    ...(dom ? { domain: dom } : {})
  });

  // where to send user back after OAuth
  const fallback = `${FRONTEND_URL}/setup`;
  const rawReturnTo = String(req.query.return_to || '').trim();
  const returnTo = rawReturnTo || fallback;

  // basic open-redirect safety: only allow your own frontends
  let safeReturnTo = fallback;
  try {
    const u = new URL(returnTo);
    const host = u.hostname.toLowerCase();
    const allowed =
      host === 'www.smartemark.com' ||
      host === 'smartemark.com' ||
      host === 'localhost';

    if (allowed) safeReturnTo = u.toString();
  } catch {}

  const dom2 = computeCookieDomain();
  res.cookie(RETURN_TO_COOKIE, safeReturnTo, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000, // 10 min
    ...(dom2 ? { domain: dom2 } : {})
  });

  const fbUrl =
    `https://www.facebook.com/v18.0/dialog/oauth` +
    `?client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(FB_SCOPES.join(','))}` +
    `&response_type=code&state=${state}`;

  res.redirect(fbUrl);
});

router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Facebook.');

  const state = String(req.query.state || '');
  const expected = String(req.cookies?.sm_oauth_state || '');

  if (!state || !expected || state !== expected) {
    return res.status(400).send('Invalid OAuth state.');
  }

  res.clearCookie('sm_oauth_state', { path: '/', domain: computeCookieDomain() });

  const ownerKey = state; // sid we set before redirect

  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code
      }
    });
    const accessToken = tokenRes.data.access_token;

    try {
      const x = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          fb_exchange_token: accessToken
        }
      });
      if (x.data?.access_token) {
        await setFbUserToken(x.data.access_token, ownerKey);
        await refreshDefaults(x.data.access_token, ownerKey);
        console.log('[auth] stored LONG-LIVED FB user token + refreshed defaults');
      } else {
        await setFbUserToken(accessToken, ownerKey);
        await refreshDefaults(accessToken, ownerKey);
        console.log('[auth] stored SHORT-LIVED FB user token + refreshed defaults');
      }
    } catch {
      await setFbUserToken(accessToken, ownerKey);
      await refreshDefaults(accessToken, ownerKey);
      console.warn('[auth] long-lived exchange failed, stored short-lived token; defaults refreshed');
    }

    const fallback = `${FRONTEND_URL}/setup`;
    let returnTo = String(req.cookies?.[RETURN_TO_COOKIE] || '').trim();

    res.clearCookie(RETURN_TO_COOKIE, { path: '/' });

    // Safety: only allow your own frontend origin
    try {
      const u = new URL(returnTo || fallback);
      const front = new URL(FRONTEND_URL);

      if (u.origin !== front.origin) returnTo = fallback;
      else returnTo = u.toString();
    } catch {
      returnTo = fallback;
    }

    res.redirect(`${returnTo}${returnTo.includes('?') ? '&' : '?'}facebook_connected=1`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
});

router.get('/debug/fbtoken', (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  res.json({ fbUserToken: getFbUserToken(ownerKey) ? 'present' : 'missing' });
});

/* =========================
   Defaults helper
   ========================= */
router.get('/facebook/defaults', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const DEFAULTS = defaultsFor(ownerKey);
  const userToken = getFbUserToken(ownerKey);

  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  await refreshDefaults(userToken, ownerKey);

  res.json({
    ok: true,
    adAccountId: DEFAULTS.adAccountId,
    pageId: DEFAULTS.pageId,
    adAccounts: DEFAULTS.adAccounts,
    pages: DEFAULTS.pages,
  });
});

router.get('/facebook/adaccounts', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const DEFAULTS = defaultsFor(ownerKey);
  const userToken = getFbUserToken(ownerKey);

  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  await refreshDefaults(userToken, ownerKey);

  return res.json({ data: DEFAULTS.adAccounts || [] });
});

router.get('/facebook/pages', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const DEFAULTS = defaultsFor(ownerKey);
  const userToken = getFbUserToken(ownerKey);

  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  await refreshDefaults(userToken, ownerKey);

  return res.json({ data: DEFAULTS.pages || [] });
});

router.post('/facebook/defaults/select', (req, res) => {
  const DEFAULTS = defaultsFor(ownerKeyFromReq(req));
  const { adAccountId, pageId } = req.body || {};

  if (adAccountId) DEFAULTS.adAccountId = String(adAccountId).replace(/^act_/, '');
  if (pageId) DEFAULTS.pageId = String(pageId);

  return res.json({ ok: true, adAccountId: DEFAULTS.adAccountId, pageId: DEFAULTS.pageId });
});

/* ---------------------------- LowDB init helpers ---------------------------- */
async function ensureUsersAndSessions() {
  await db.read();
  db.data = db.data || {};
  db.data.users = db.data.users || [];
  db.data.sessions = db.data.sessions || [];
  await db.write();
}

/* ---------------------------- Session helper ---------------------------- */
async function requireSession(req) {
  await ensureUsersAndSessions();
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const sid =
    req.cookies?.[COOKIE_NAME] ||
    req.get('x-sm-sid') ||
    bearer;

  if (!sid) return { ok: false, status: 401, error: 'Not logged in' };
  const sess = db.data.sessions.find(s => s.sid === sid);
  if (!sess) return { ok: false, status: 401, error: 'Session not found' };

  const user = db.data.users.find(u => u.username === sess.username);
  if (!user) return { ok: false, status: 401, error: 'User not found for session' };

  return { ok: true, sid, sess, user };
}

/* =========================
   REAL AUTH (LowDB + bcrypt)
   ========================= */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    await ensureUsersAndSessions();
    if (db.data.users.find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const user = { username: String(username).trim(), email: String(email).trim(), passwordHash };
    db.data.users.push(user);
    await db.write();

    const sid = `sm_${nanoid(24)}`;
    db.data.sessions.push({ sid, username: user.username });
    await db.write();

    setSessionCookie(res, sid);
    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = String(username || '').trim();
    const p = String(password || '').trim();

    if (!u || !p) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    await ensureUsersAndSessions();

    // Allow login by username OR email
    const user =
      db.data.users.find(x => x.username === u) ||
      db.data.users.find(x => x.email === u);

    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const match = bcrypt.compareSync(p, user.passwordHash);
    if (!match) return res.status(401).json({ error: 'Invalid username or password' });

    const sid = `sm_${nanoid(24)}`;
    db.data.sessions.push({ sid, username: user.username });
    await db.write();

    setSessionCookie(res, sid);
    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed', detail: err.message });
  }
});

router.post('/logout', async (req, res) => {
  try {
    await ensureUsersAndSessions();
    const sid = req.cookies?.[COOKIE_NAME];
    if (sid) {
      db.data.sessions = db.data.sessions.filter(s => s.sid !== sid);
      await db.write();
    }
    res.clearCookie(COOKIE_NAME, {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: computeCookieDomain()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed', detail: err.message });
  }
});

/* ---------------------------- Debug cookies ---------------------------- */
router.get('/debug/cookies', (req, res) => {
  res.json({
    headerCookie: req.headers.cookie || null,
    parsed: req.cookies || null
  });
});

/* =========================
   WHOAMI (cookie + header fallback)
   ========================= */
router.get('/whoami', async (req, res) => {
  try {
    const s = await requireSession(req);
    if (!s.ok) return res.status(s.status).json({ error: s.error });

    res.json({ success: true, user: { username: s.user.username, email: s.user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve session', detail: err.message });
  }
});

/* =========================
   LAUNCH CAMPAIGN (STATIC IMAGE ONLY)
   ========================= */
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const userToken = getFbUserToken(ownerKey);

  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  // ✅ IMPORTANT: do NOT let an env var accidentally put real users into PAUSED.
  // Only allow "no spend" in dev, or if you explicitly enable it.
  const allowNoSpend = process.env.ALLOW_NO_SPEND === '1' || !isProd;
  const NO_SPEND =
    allowNoSpend &&
    (req.query.no_spend === '1' || !!req.body.noSpend || process.env.NO_SPEND === '1');

  const VALIDATE_ONLY = req.query.validate_only === '1' || !!req.body.validateOnly;

  const mkParams = () => {
    const p = { access_token: userToken };
    if (VALIDATE_ONLY) p.execution_options = ['validate_only'];
    return p;
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function normalizeLink(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  }

  // If your frontend ever stores /generated URLs on smartemark.com,
  // the backend should still fetch from the backend public base.
  function normalizeImageUrl(u) {
    const s = String(u || '').trim();
    if (!s) return s;

    // blob: cannot be fetched server-side
    if (/^blob:/i.test(s)) return '';

    // if it's already a data url, keep it
    if (/^data:image\//i.test(s)) return s;

    // if it's a relative path, force it onto backend base
    if (!/^https?:\/\//i.test(s)) return absolutePublicUrl(s);

    // if it's absolute but on your frontend domain, remap to backend base
    try {
      const parsed = new URL(s);
      const host = parsed.hostname.toLowerCase();
      if (host === 'smartemark.com' || host === 'www.smartemark.com') {
        const backendBase =
          process.env.PUBLIC_BASE_URL ||
          process.env.RENDER_EXTERNAL_URL ||
          'https://smartmark-mvp.onrender.com';
        return new URL(parsed.pathname + parsed.search, backendBase).toString();
      }
    } catch {}
    return s;
  }

   async function fetchImageAsBase64(url) {
    if (!url) throw new Error('No image URL');

    // Accept Data URLs directly (best-case: no fetching needed)
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(String(url).trim());
    if (m) return m[1];

    const raw = String(url).trim();

    // We prefer fetching from the backend public base (Render), because it definitely has /api/media + /generated.
    const backendBase =
      process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'https://smartmark-mvp.onrender.com';

    // Build a list of candidate URLs to try.
    const candidates = [];
    try {
      // If it's already absolute, try it as-is first.
      if (/^https?:\/\//i.test(raw)) {
        candidates.push(raw);

        // If it points to Vercel (smartemark.com) but path is /api/media or /generated, rewrite to backendBase.
        const u = new URL(raw);
        if (u.pathname.startsWith('/api/media') || u.pathname.startsWith('/generated') || u.pathname.startsWith('/media')) {
          candidates.push(`${backendBase}${u.pathname}${u.search || ''}`);
        }
      } else {
        // If it's relative, force it to backendBase
        const rel = raw.startsWith('/') ? raw : `/${raw}`;
        candidates.push(`${backendBase}${rel}`);
      }
    } catch {
      // If URL parsing fails, just force backendBase
      const rel = raw.startsWith('/') ? raw : `/${raw}`;
      candidates.push(`${backendBase}${rel}`);
    }

    // Also try your existing absolutePublicUrl behavior as a fallback
    try {
      candidates.push(absolutePublicUrl(raw));
    } catch {}

    // De-dupe
    const uniq = Array.from(new Set(candidates.filter(Boolean)));

    const tries = [0, 400, 900];
    let lastErr;

    for (const attemptDelay of tries) {
      for (const abs of uniq) {
        try {
          if (attemptDelay) await sleep(attemptDelay);

          const imgRes = await axios.get(abs, {
            responseType: 'arraybuffer',
            timeout: 20000,
            headers: { Accept: 'image/*' }
          });

          const ct = String(imgRes.headers?.['content-type'] || '').toLowerCase();
          if (!ct.includes('image')) throw new Error(`Non-image content-type: ${ct || 'unknown'} from ${abs}`);

          return Buffer.from(imgRes.data).toString('base64');
        } catch (e) {
          lastErr = e;
        }
      }
    }

    throw lastErr || new Error('Image download failed');
  }


  async function uploadImage(imageUrl) {
    // ✅ Do NOT silently upload the green fallback in production.
    // If the image can’t be fetched, fail fast so you never launch a broken creative.
    const base64 = await fetchImageAsBase64(imageUrl);

    const fbImageRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
      new URLSearchParams({ bytes: base64 }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, params: mkParams() }
    );
    const imgData = fbImageRes.data?.images || {};
    const hash = Object.values(imgData)[0]?.hash || null;
    if (hash) return hash;
    if (VALIDATE_ONLY) return 'VALIDATION_ONLY_HASH';
    throw new Error('Image upload failed');
  }

  async function resolvePageId(explicitPageId) {
    const DEFAULTS = defaultsFor(ownerKeyFromReq(req));

    if (explicitPageId) return String(explicitPageId);
    if (DEFAULTS.pageId) return String(DEFAULTS.pageId);
    try {
      const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
        params: { access_token: userToken, fields: 'id,name' }
      });
      const first = pagesRes.data?.data?.[0]?.id || null;
      if (first) { DEFAULTS.pageId = String(first); return String(first); }
    } catch {}
    return null;
  }

  try {
    const {
      form = {},
      budget,
      adCopy,
      pageId,
      aiAudience: aiAudienceRaw,

      // ✅ static-only input
      imageVariants = [],

      flightStart = null,
      flightEnd = null,
      flightHours = null,
      overrideCountPerType = null
    } = req.body;

    const pageIdFinal = await resolvePageId(pageId);
    if (!pageIdFinal) {
      return res.status(400).json({
        error: 'No Facebook Page available on this account. Connect a Page and try again.'
      });
    }

    const campaignName = form.campaignName || form.businessName || 'SmartMark Campaign';

    // ✅ Always use the real business website link (typeform), not a placeholder.
    const destinationUrl =
      normalizeLink(
        form.websiteUrl ||
        form.website ||
        form.businessWebsite ||
        form.businessUrl ||
        form.url ||
        req.body.websiteUrl ||
        req.body.url
      ) || 'https://smartemark.com';

    let aiAudience = null;
    try {
      if (typeof aiAudienceRaw === 'string') aiAudience = JSON.parse(aiAudienceRaw);
      else if (aiAudienceRaw && typeof aiAudienceRaw === 'object') aiAudience = aiAudienceRaw;
    } catch { aiAudience = null; }

    // ✅ force images-only
    const ms = 'image';

    let targeting = {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 }
    };
    if (aiAudience?.location) {
      const loc = String(aiAudience.location).trim();
      if (/^[A-Za-z]{2}$/.test(loc)) {
        targeting.geo_locations = { countries: [loc.toUpperCase()] };
      } else if (/united states|usa/i.test(loc)) {
        targeting.geo_locations = { countries: ['US'] };
      } else {
        targeting.geo_locations = { countries: [loc.toUpperCase()] };
      }
    }
    if (aiAudience?.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
      const [min, max] = aiAudience.ageRange.split('-').map(Number);
      targeting.age_min = min; targeting.age_max = max;
    }
    if (aiAudience?.fbInterestIds?.length) {
      targeting.flexible_spec = [{ interests: aiAudience.fbInterestIds.map(id => ({ id })) }];
      targeting.targeting_automation.advantage_audience = 0;
    } else {
      targeting.targeting_automation.advantage_audience = 1; // let FB optimize
    }

    // limit 2 active campaigns (kept)
    if (!VALIDATE_ONLY) {
      const existing = await axios.get(
        `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
        { params: { access_token: userToken, fields: 'id,name,effective_status', limit: 50 } }
      );
      const activeCount = (existing.data?.data || []).filter(
        c => !['ARCHIVED', 'DELETED'].includes((c.effective_status || '').toUpperCase())
      ).length;
      if (activeCount >= 2) {
        return res.status(400).json({ error: 'Limit reached: maximum of 2 active campaigns per user.' });
      }
    }

    const dailyBudget = Number(budget) || 0;
    const hours = (() => {
      if (flightEnd && flightStart) return Math.max(0, (new Date(flightEnd) - new Date(flightStart)) / 36e5);
      if (flightHours) return Number(flightHours) || 0;
      return 0;
    })();

    // ✅ images only
    const plan = policy.decideVariantPlan({
      assetTypes: 'image',
      dailyBudget,
      flightHours: hours,
      overrideCountPerType: overrideCountPerType && typeof overrideCountPerType === 'object'
        ? { images: Number(overrideCountPerType.images || 0) }
        : overrideCountPerType
    });
    const needImg = plan.images || 0;

    if (needImg > 0 && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }

    const now = new Date();
    let startISO = flightStart
      ? new Date(flightStart).toISOString()
      : (NO_SPEND
          ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(now.getTime() + 60 * 1000).toISOString());

    let endISO = flightEnd ? new Date(flightEnd).toISOString() : null;
    if (endISO) {
      const maxEnd = new Date(new Date(startISO).getTime() + 14 * 24 * 60 * 60 * 1000);
      if (new Date(endISO) > maxEnd) endISO = maxEnd.toISOString();
      if (new Date(endISO) <= new Date(startISO)) {
        endISO = new Date(new Date(startISO).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const campaignRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      {
        name: campaignName,
        objective: 'OUTCOME_TRAFFIC',
        status: NO_SPEND ? 'PAUSED' : 'ACTIVE',
        special_ad_categories: []
      },
      { params: mkParams() }
    );
    const campaignId = campaignRes.data?.id || 'VALIDATION_ONLY';

    // ✅ single adset for images
    const perAdsetBudgetCents = Math.max(100, Math.round((Number(budget) || 0) * 100));
    const { data: adsetData } = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
      {
        name: `${campaignName} (Image) - ${new Date().toISOString()}`,
        campaign_id: campaignId,
        daily_budget: perAdsetBudgetCents,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        status: NO_SPEND ? 'PAUSED' : 'ACTIVE',
        start_time: startISO,
        ...(endISO ? { end_time: endISO } : {}),
        promoted_object: { page_id: pageIdFinal },
        targeting: {
          ...targeting,
          publisher_platforms: ['facebook', 'instagram'],
          facebook_positions: ['feed', 'marketplace'],
          instagram_positions: ['stream', 'story', 'reels'],
          audience_network_positions: [],
          messenger_positions: [],
        }
      },
      { params: mkParams() }
    );
    const imageAdSetId = adsetData?.id || null;

    const adIds = [];
    const usedImages = [];

 for (let i = 0; i < needImg; i++) {
  const srcUrlRaw = imageVariants[i];
  const srcUrl = normalizeImageUrl(srcUrlRaw);   // ✅ USE IT

  if (!srcUrl) throw new Error("Invalid image URL");

  const hash = await uploadImage(srcUrl);

  const cr = await axios.post(
    `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
    {
      name: `${campaignName} (Image v${i + 1})`,
      object_story_spec: {
        page_id: pageIdFinal,
        link_data: {
          message: form.adCopy || adCopy || '',
          link: destinationUrl,
          image_hash: hash,
          description: form.description || ''
        }
      }
    },
    { params: mkParams() }
  );

  const ad = await axios.post(
    `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
    {
      name: `${campaignName} (Image v${i + 1})`,
      adset_id: imageAdSetId,
      creative: { creative_id: cr.data.id },
      status: NO_SPEND ? 'PAUSED' : 'ACTIVE'
    },
    { params: mkParams() }
  );

  adIds.push(ad.data?.id || `VALIDATION_ONLY_IMG_${i + 1}`);
  usedImages.push(srcUrl); // ✅ store the resolved URL, not absolutePublicUrl() of a full URL
}


    const campaignStatus = NO_SPEND ? 'PAUSED' : 'ACTIVE';

    // store creatives record (static-only)
    await ensureUsersAndSessions();
    await db.read();
    db.data.campaign_creatives = db.data.campaign_creatives || [];
    const list = db.data.campaign_creatives;
    const idx = list.findIndex(c => c.campaignId === campaignId);
    const nowIso = new Date().toISOString();

    const record = {
      ownerKey,
      campaignId,
      accountId: String(accountId || ''),
      pageId: String(pageIdFinal || ''),
      name: campaignName,
      status: campaignStatus,
      mediaSelection: 'image',
      images: usedImages,
      videos: [],
      fbVideoIds: [],
      updatedAt: nowIso,
      ...(idx === -1 ? { createdAt: nowIso } : {})
    };

    if (idx === -1) list.push(record);
    else list[idx] = { ...list[idx], ...record };

    await db.write();

    res.json({
      success: true,
      campaignId,
      adSetIds: [imageAdSetId].filter(Boolean),
      adIds,
      variantPlan: plan,
      campaignStatus,
      validateOnly: VALIDATE_ONLY,
      resolvedPageId: pageIdFinal
    });
  } catch (err) {
    let errorMsg = 'Failed to launch campaign.';
    if (err.response?.data?.error) errorMsg = err.response.data.error.message;

    let detail = err.response?.data || err.message;
    if (Buffer.isBuffer(detail)) {
      try { detail = detail.toString('utf8'); } catch {}
    }
    console.error('FB Campaign Launch Error:', detail);

    // If the image URL can't be fetched, return a clean message (prevents green fallback launches)
    if (String(err?.message || '').toLowerCase().includes('image')) {
      return res.status(400).json({
        error: 'One of your ad images could not be fetched by the server. Please regenerate the image and try again.',
        detail
      });
    }

    res.status(500).json({ error: errorMsg, detail });
  }
});

/* =========================
   TEST/UTILITY ROUTES (unchanged)
   ========================= */
router.get('/facebook/adaccount/:accountId/campaigns', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      { params: { access_token: userToken, fields: 'id,name,status,start_time' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch campaigns.' });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/details', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { params: { access_token: userToken, fields: 'id,name,status,start_time,objective,effective_status' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch campaign details.' });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/metrics', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}/insights`,
      {
        params: {
          access_token: userToken,
          fields: 'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks',
          date_preset: 'maximum'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch campaign metrics.' });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/creatives', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const rec = (db.data.campaign_creatives || []).find(
      r => r.campaignId === campaignId && r.ownerKey === ownerKey
    ) || null;

    if (!rec) return res.status(404).json({ error: 'No creatives stored for this campaign.' });
    res.json({
      campaignId: rec.campaignId,
      accountId: rec.accountId,
      pageId: rec.pageId,
      name: rec.name,
      status: rec.status,
      mediaSelection: 'image',
      images: rec.images || [],
      videos: [],
      fbVideoIds: [],
      updatedAt: rec.updatedAt,
      createdAt: rec.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load creatives.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/pause', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'PAUSED' },
      { params: { access_token: userToken } }
    );
    res.json({ success: true, message: `Campaign ${campaignId} paused.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to pause campaign.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/unpause', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ACTIVE' },
      { params: { access_token: userToken } }
    );
    res.json({ success: true, message: `Campaign ${campaignId} unpaused.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to unpause campaign.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/cancel', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ARCHIVED' },
      { params: { access_token: userToken } }
    );
    res.json({ success: true, message: `Campaign ${campaignId} canceled.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to cancel campaign.' });
  }
});

module.exports = router;
