// server/routes/auth.js
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db');
const {
  getFbUserToken,
  setFbUserToken,
  clearFbUserToken,
  getFbUserTokenMeta,
  setFbUserTokenMeta,
  clearFbUserTokenMeta,
} = require('../tokenStore');

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

// If cookies are blocked, frontend can send this header as a fallback
const SID_HEADER = 'x-sm-sid';

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

function isSidLike(x) {
  const s = String(x || '').trim();
  return !!s && /^sm_[A-Za-z0-9_-]{10,}$/.test(s);
}

// Always keep a stable sid for FB token ownership.
function getSidFromReq(req) {
  const cookieSid = req.cookies?.[COOKIE_NAME];
  const headerSid = req.get(SID_HEADER);
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  return (cookieSid || headerSid || bearer || '').trim();
}

function ensureSid(req, res) {
  let sid = getSidFromReq(req);
  if (!sid) {
    sid = `sm_${nanoid(24)}`;
    setSessionCookie(res, sid);
  }
  req.smSid = sid;
  return sid;
}

function ownerKeyFromReq(req) {
  const sid = (req.smSid || getSidFromReq(req) || '').trim();

  // ✅ If logged in, bind FB token to the USER (persists across new sid logins)
  try {
    const sess = db?.data?.sessions?.find(s => String(s.sid) === String(sid));
    const username = sess?.username ? String(sess.username).trim() : '';
    if (username) return `user:${username}`;
  } catch {}

  // fallback: still support sid-based ownership
  return sid || `ip:${req.ip}`;
}


// ✅ Ensure sid exists on all facebook/auth flows (including launch)
router.use((req, res, next) => {
  if (
    req.path.startsWith('/facebook') ||
    req.path.startsWith('/debug/fbtoken') ||
    req.path.includes('/launch-campaign')
  ) {
    ensureSid(req, res);
  }
  next();
});

/**
 * SID stitch:
 * If frontend sends x-sm-sid (or Bearer sm_...) but cookies are missing,
 * set cookie so downstream routes (including OAuth + launch) use same ownerKey.
 */
router.use((req, res, next) => {
  try {
    const cookieSid = req.cookies?.[COOKIE_NAME];
    if (isSidLike(cookieSid)) return next();

    const headerSid = req.get(SID_HEADER);
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const candidate = isSidLike(headerSid) ? headerSid : (isSidLike(bearer) ? bearer : '');

    if (candidate) {
      setSessionCookie(res, candidate);
      req.cookies = req.cookies || {};
      req.cookies[COOKIE_NAME] = candidate;
      req.smSid = candidate;
    }
  } catch {}
  next();
});

// ✅ Ensure db sessions are loaded for routes that need sid->username mapping
router.use(async (req, res, next) => {
  try {
    if (
      req.path.startsWith('/facebook') ||
      req.path.startsWith('/debug/fbtoken') ||
      req.path.includes('/launch-campaign')
    ) {
      await ensureUsersAndSessions();
      await db.read();
    }
  } catch {}
  next();
});


// Helper: safely append sid to return_to so frontend can store it even if cookies are blocked
function appendSidToReturnTo(urlStr, sid) {
  try {
    if (!urlStr) return urlStr;
    const u = new URL(urlStr);
    if (!u.searchParams.get('sm_sid')) u.searchParams.set('sm_sid', sid);
    if (!u.searchParams.get('sid')) u.searchParams.set('sid', sid);
    return u.toString();
  } catch {
    return urlStr;
  }
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

// ✅ Returns whether FB is connected for the current logged-in user
router.get('/facebook/status', async (req, res) => {
  try {
    const ownerKey = ownerKeyFromReq(req);
    const token = getFbUserToken(ownerKey);
    const meta = getFbUserTokenMeta(ownerKey);

    if (!token) return res.json({ ok: true, connected: false });

    const expiresAt = Number(meta?.expiresAt || 0);
    if (expiresAt && Date.now() > expiresAt) {
      await clearFbUserToken(ownerKey);
      await clearFbUserTokenMeta(ownerKey);
      return res.json({ ok: true, connected: false, expired: true });
    }

    const daysLeft = expiresAt
      ? Math.max(0, Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    return res.json({ ok: true, connected: true, expiresAt: expiresAt || null, daysLeft });
  } catch {
    return res.json({ ok: true, connected: false });
  }
});


function absolutePublicUrl(relativePath) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com';

  if (!relativePath) return '';

  // keep absolute urls
  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const rel = String(relativePath).startsWith('/') ? String(relativePath) : `/${relativePath}`;
  return `${base}${rel}`;
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

  const state = sid;

  // store expected state for callback validation
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

  // ✅ put sid into return_to so frontend can persist it (cookie fallback)
  safeReturnTo = appendSidToReturnTo(safeReturnTo, sid);

  const dom2 = computeCookieDomain();
  res.cookie(RETURN_TO_COOKIE, safeReturnTo, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 10 * 60 * 1000,
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

 // sid we set before redirect
const sidOwner = state;

// ✅ Prefer storing token under the logged-in USER (persists across logins)
let userOwner = sidOwner;
try {
  await ensureUsersAndSessions();
  await db.read();
  const sess = (db.data.sessions || []).find(s => String(s.sid) === String(sidOwner));
  if (sess?.username) userOwner = `user:${String(sess.username).trim()}`;
} catch {}


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
  const tok = x.data.access_token;

  // expires_in is usually provided for long-lived tokens
  const expiresInSec = Number(x.data.expires_in || 0);
  const fallback60Days = 60 * 24 * 60 * 60; // 60 days
  const expSec = expiresInSec > 0 ? expiresInSec : fallback60Days;
  const expiresAt = Date.now() + expSec * 1000;

  // ✅ store under USER key for persistence
  await setFbUserToken(tok, userOwner);
  await setFbUserTokenMeta(
    { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'long_lived' },
    userOwner
  );

  // optional: also store under sid as fallback
  await setFbUserToken(tok, sidOwner);
  await setFbUserTokenMeta(
    { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'long_lived' },
    sidOwner
  );

  await refreshDefaults(tok, userOwner);
  console.log('[auth] stored LONG-LIVED FB user token (user-bound) + refreshed defaults');
}
else {
  const tok = accessToken;
  // short-lived tokens can be ~1-2 hours; set a conservative TTL
  const expSec = 2 * 60 * 60; // 2 hours
  const expiresAt = Date.now() + expSec * 1000;

  await setFbUserToken(tok, userOwner);
  await setFbUserTokenMeta(
    { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
    userOwner
  );

  // optional sid fallback
  await setFbUserToken(tok, sidOwner);
  await setFbUserTokenMeta(
    { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
    sidOwner
  );

  await refreshDefaults(tok, userOwner);
  console.log('[auth] stored SHORT-LIVED FB user token (user-bound) + refreshed defaults');
}

    } catch {
     const tok = accessToken;
const expSec = 2 * 60 * 60; // 2 hours
const expiresAt = Date.now() + expSec * 1000;

await setFbUserToken(tok, userOwner);
await setFbUserTokenMeta(
  { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
  userOwner
);

// sid fallback
await setFbUserToken(tok, sidOwner);
await setFbUserTokenMeta(
  { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
  sidOwner
);

await refreshDefaults(tok, userOwner);

      console.warn('[auth] long-lived exchange failed, stored short-lived token; defaults refreshed');
    }

    const fallback = `${FRONTEND_URL}/setup`;
    let returnTo = String(req.cookies?.[RETURN_TO_COOKIE] || '').trim();

    res.clearCookie(RETURN_TO_COOKIE, { path: '/', domain: computeCookieDomain() });

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
    req.get(SID_HEADER) ||
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
  const { accountId } = req.params;

  const userToken = getFbUserToken(ownerKey);
  if (!userToken) {
    return res.status(401).json({
      error: 'Not authenticated with Facebook',
      hint: 'Session mismatch: your sid cookie/header must match the one used during OAuth.',
      ownerKeyUsed: ownerKey
    });
  }

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

  function normalizeLink(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('//')) s = 'https:' + s;
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s;
  }

  function normalizeImageUrl(u) {
    const s = String(u || '').trim();
    if (!s) return '';

    if (/^blob:/i.test(s)) return '';
    if (/^data:image\//i.test(s)) return s;

    if (!/^https?:\/\//i.test(s)) return absolutePublicUrl(s);

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

  function extractBase64FromDataUrl(s) {
    const m = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(String(s || '').trim());
    return m ? m[1] : null;
  }

  function parseImageVariant(v) {
    if (typeof v === 'string') return { url: v, bytes: null };
    if (v && typeof v === 'object') {
      return {
        url: v.url || v.src || v.imageUrl || v.image || '',
        bytes: v.bytes || v.base64 || v.b64 || null
      };
    }
    return { url: '', bytes: null };
  }

  async function fetchImageAsBase64(url, debugLabel = '') {
    if (!url) throw new Error(`No image URL${debugLabel ? ` (${debugLabel})` : ''}`);

    const inline = extractBase64FromDataUrl(url);
    if (inline) return inline;

    const raw = String(url).trim();
    const backendBase =
      process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'https://smartmark-mvp.onrender.com';

    const candidates = [];
    const push = (u) => { if (u) candidates.push(String(u)); };

    try {
      if (/^https?:\/\//i.test(raw)) {
        push(raw);

        const u = new URL(raw);
        push(`${backendBase}${u.pathname}${u.search || ''}`);

        if (u.pathname.startsWith('/generated/')) {
          push(`${backendBase}${u.pathname}`);
          push(`${backendBase}/api/media${u.pathname}`);
        }
        if (u.pathname.startsWith('/api/media/')) push(`${backendBase}${u.pathname}${u.search || ''}`);
        if (u.pathname.startsWith('/media/')) push(`${backendBase}${u.pathname}${u.search || ''}`);
      } else {
        const rel = raw.startsWith('/') ? raw : `/${raw}`;
        push(`${backendBase}${rel}`);
        if (rel.startsWith('/generated/')) push(`${backendBase}/api/media${rel}`);
      }
    } catch {
      const rel = raw.startsWith('/') ? raw : `/${raw}`;
      push(`${backendBase}${rel}`);
      if (rel.startsWith('/generated/')) push(`${backendBase}/api/media${rel}`);
    }

    try { push(absolutePublicUrl(raw)); } catch {}

    const uniq = Array.from(new Set(candidates.filter(Boolean)));

    let lastErr = null;
    let lastTried = '';

    for (const abs of uniq) {
      lastTried = abs;
      try {
        const imgRes = await axios.get(abs, {
          responseType: 'arraybuffer',
          timeout: 25000,
          maxBodyLength: 25 * 1024 * 1024,
          maxContentLength: 25 * 1024 * 1024,
          validateStatus: (s) => s >= 200 && s < 400,
          headers: {
            Accept: 'image/*',
            'User-Agent': 'SmartMark/1.0'
          }
        });

        const ct = String(imgRes.headers?.['content-type'] || '').toLowerCase();
        if (!ct.includes('image')) {
          throw new Error(`Non-image content-type: ${ct || 'unknown'} from ${abs}`);
        }

        return Buffer.from(imgRes.data).toString('base64');
      } catch (e) {
        lastErr = e;
        const status = e?.response?.status;
        const data = e?.response?.data;
        console.error('[fetchImageAsBase64] failed', {
          label: debugLabel || '',
          url: abs,
          status,
          data: Buffer.isBuffer(data) ? '(buffer)' : data
        });
      }
    }

    const status = lastErr?.response?.status ? `HTTP ${lastErr.response.status}` : '';
    throw new Error(
      `Image download failed${debugLabel ? ` (${debugLabel})` : ''}. Last tried: ${lastTried} ${status}`.trim()
    );
  }

  async function uploadImageFromBase64(base64, debugLabel = '') {
    if (!base64) throw new Error(`Missing base64 bytes${debugLabel ? ` (${debugLabel})` : ''}`);

    const fbImageRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
      new URLSearchParams({ bytes: base64 }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, params: mkParams() }
    );

    const imgData = fbImageRes.data?.images || {};
    const hash = Object.values(imgData)[0]?.hash || null;

    if (hash) return hash;
    if (VALIDATE_ONLY) return 'VALIDATION_ONLY_HASH';
    throw new Error(`Image upload failed${debugLabel ? ` (${debugLabel})` : ''}`);
  }

  async function uploadImage(variant, index) {
    const label = `variant ${index + 1}`;

    if (variant.bytes) {
      const inline = extractBase64FromDataUrl(variant.bytes) || String(variant.bytes).trim();
      return await uploadImageFromBase64(inline, label);
    }

    const normalized = normalizeImageUrl(variant.url);
    if (!normalized) {
      throw new Error(`Invalid image URL (${label}). Do NOT send blob: URLs.`);
    }

    const base64 = await fetchImageAsBase64(normalized, label);
    return await uploadImageFromBase64(base64, label);
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

    let targeting = {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 }
    };

    if (aiAudience?.location) {
      const loc = String(aiAudience.location).trim();
      if (/^[A-Za-z]{2}$/.test(loc)) targeting.geo_locations = { countries: [loc.toUpperCase()] };
      else if (/united states|usa/i.test(loc)) targeting.geo_locations = { countries: ['US'] };
      else targeting.geo_locations = { countries: [loc.toUpperCase()] };
    }

    if (aiAudience?.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
      const [min, max] = aiAudience.ageRange.split('-').map(Number);
      targeting.age_min = min; targeting.age_max = max;
    }

    if (aiAudience?.fbInterestIds?.length) {
      targeting.flexible_spec = [{ interests: aiAudience.fbInterestIds.map(id => ({ id })) }];
      targeting.targeting_automation.advantage_audience = 0;
    } else {
      targeting.targeting_automation.advantage_audience = 1;
    }

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

    // ✅ validate first N variants BEFORE creating FB campaign/adset
    const parsedVariants = [];
    for (let i = 0; i < needImg; i++) {
      const v = parseImageVariant(imageVariants[i]);
      const normalized = normalizeImageUrl(v.url);
      const inline = v.bytes ? (extractBase64FromDataUrl(v.bytes) || String(v.bytes).trim()) : null;

      if (!inline && !normalized) {
        return res.status(400).json({
          error: `Invalid image URL for variant ${i + 1}. Do NOT send blob: URLs.`,
          badValue: imageVariants[i]
        });
      }
      parsedVariants.push({ url: normalized || v.url, bytes: inline });
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
      const variant = parsedVariants[i];
      const hash = await uploadImage(variant, i);

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
      usedImages.push(variant.bytes ? '(inline_base64)' : String(variant.url || ''));
    }

    const campaignStatus = NO_SPEND ? 'PAUSED' : 'ACTIVE';

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

    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('image') || msg.includes('download') || msg.includes('blob')) {
      return res.status(400).json({
        error: 'One of your ad images could not be fetched by the server (or a blob: URL was sent). Regenerate the image and try again.',
        detail: String(err?.message || detail)
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

// ✅ Delete (one click): archive on FB + purge stored creatives so "in progress" doesn't stick
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/cancel', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const userToken = getFbUserToken(ownerKey);

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ARCHIVED' },
      { params: { access_token: userToken } }
    );

    try {
      await ensureUsersAndSessions();
      await db.read();
      db.data.campaign_creatives = db.data.campaign_creatives || [];
      db.data.campaign_creatives = db.data.campaign_creatives.filter(
        (r) => !(String(r.campaignId) === String(campaignId) && String(r.ownerKey) === String(ownerKey))
      );
      await db.write();
    } catch (e) {
      console.warn('[auth] cancel: failed to purge campaign_creatives record', e?.message || e);
    }

    res.json({ success: true, message: `Campaign ${campaignId} canceled.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to cancel campaign.' });
  }
});

module.exports = router;
