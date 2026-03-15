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
const {
  ensureOptimizerCampaignStateShape,
  getAllOptimizerCampaignStates,
  upsertOptimizerCampaignState,
  findOptimizerCampaignStateByCampaignId,
  findOptimizerCampaignStatesByAccountId,
  updateOptimizerCampaignState,
} = require('../optimizerCampaignState');

const {
  syncCampaignMetricsToOptimizerState,
} = require('../optimizerMetricsSync');
const { buildDiagnosis } = require('../optimizerDiagnosis');
const { buildDecision } = require('../optimizerDecision');
const { executeAction } = require('../optimizerAction');
const { buildMonitoring } = require('../optimizerMonitoring');
const { runFullOptimizerCycle } = require('../optimizerOrchestrator');
const { runScheduledOptimizerPass } = require('../optimizerScheduler');
const { startOptimizerAutoRunner } = require('../optimizerAutoRunner');

const { policy } = require('../smartCampaignEngine');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/*                  META API CALL LOGGING / DEBUG COUNTER             */
/* ------------------------------------------------------------------ */
const META_CALL_STATS = {
  startedAt: new Date().toISOString(),
  total: 0,
  success: 0,
  fail: 0,
  byLabel: {},
  recent: [],
};

function getMetaLabel(method, url) {
  const m = String(method || 'GET').toUpperCase();
  const u = String(url || '');

  if (u.includes('/me/adaccounts')) return `${m} me/adaccounts`;
  if (u.includes('/me/accounts')) return `${m} me/accounts`;
  if (u.includes('/insights')) return `${m} insights`;
  if (u.includes('/adimages')) return `${m} adimages`;
  if (u.includes('/adcreatives')) return `${m} adcreatives`;
  if (u.includes('/adsets')) return `${m} adsets`;
  if (u.includes('/ads')) return `${m} ads`;

  if (/\/act_[^/]+\/campaigns/.test(u)) {
    return m === 'POST' ? 'POST campaigns_create' : 'GET campaigns_list';
  }

  if (/graph\.facebook\.com\/v18\.0\/[^/?]+$/.test(u)) {
    return `${m} campaign_object_update_or_read`;
  }

  return `${m} other`;
}

function recordMetaCall({ method, url, status, ok }) {
  const label = getMetaLabel(method, url);

  META_CALL_STATS.total += 1;
  if (ok) META_CALL_STATS.success += 1;
  else META_CALL_STATS.fail += 1;

  if (!META_CALL_STATS.byLabel[label]) {
    META_CALL_STATS.byLabel[label] = { total: 0, success: 0, fail: 0 };
  }

  META_CALL_STATS.byLabel[label].total += 1;
  if (ok) META_CALL_STATS.byLabel[label].success += 1;
  else META_CALL_STATS.byLabel[label].fail += 1;

  const row = {
    t: new Date().toISOString(),
    label,
    method: String(method || '').toUpperCase(),
    url: String(url || ''),
    status: Number(status || 0),
    ok: !!ok,
  };

  META_CALL_STATS.recent.push(row);
  if (META_CALL_STATS.recent.length > 200) META_CALL_STATS.recent.shift();

  console.log(
    `[META_API] ${row.t} | ${row.label} | ${row.method} ${row.url} | status=${row.status} | ok=${row.ok ? 1 : 0}`
  );
}

if (!global.__SMARTMARK_META_AXIOS_LOGGER__) {
  axios.interceptors.request.use((config) => {
    try {
      config.__smMetaStart = Date.now();
    } catch {}
    return config;
  });

  axios.interceptors.response.use(
    (response) => {
      try {
        const url = String(response?.config?.url || '');
        if (url.includes('graph.facebook.com')) {
          recordMetaCall({
            method: response?.config?.method || 'GET',
            url,
            status: response?.status || 200,
            ok: true,
          });
        }
      } catch {}
      return response;
    },
    (error) => {
      try {
        const url = String(error?.config?.url || '');
        if (url.includes('graph.facebook.com')) {
          recordMetaCall({
            method: error?.config?.method || 'GET',
            url,
            status: error?.response?.status || 500,
            ok: false,
          });
        }
      } catch {}
      return Promise.reject(error);
    }
  );

  global.__SMARTMARK_META_AXIOS_LOGGER__ = true;
}

/* ------------------------------------------------------------------ */
/*                    Small in-process defaults cache                  */
/* ------------------------------------------------------------------ */
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

  const [acctRes, pagesRes] = await Promise.allSettled([
    axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
      params: { access_token: userToken, fields: 'id,name,account_status' },
    }),
    axios.get('https://graph.facebook.com/v18.0/me/accounts', {
      params: { access_token: userToken, fields: 'id,name,access_token' },
    }),
  ]);

  if (acctRes.status === 'fulfilled') {
    const accts = Array.isArray(acctRes.value?.data?.data) ? acctRes.value.data.data : [];
    if (accts.length > 0) {
      DEFAULTS.adAccounts = accts.map((a) => ({
        id: String(a.id).replace(/^act_/, ''),
        name: a.name,
        account_status: a.account_status,
      }));
    }
  } else {
    console.warn(
      '[refreshDefaults] me/adaccounts failed:',
      acctRes.reason?.response?.data || acctRes.reason?.message
    );
  }

  if (pagesRes.status === 'fulfilled') {
    const pages = Array.isArray(pagesRes.value?.data?.data) ? pagesRes.value.data.data : [];
    if (pages.length > 0) {
      DEFAULTS.pages = pages.map((p) => ({ id: p.id, name: p.name }));
    }
  } else {
    console.warn(
      '[refreshDefaults] me/accounts failed:',
      pagesRes.reason?.response?.data || pagesRes.reason?.message
    );
  }

  const firstAcct = DEFAULTS.adAccounts[0]?.id || null;
  const firstPage = DEFAULTS.pages[0]?.id || null;

  if (!DEFAULTS.adAccountId || !DEFAULTS.adAccounts.find((a) => a.id === DEFAULTS.adAccountId)) {
    DEFAULTS.adAccountId = firstAcct;
  }
  if (!DEFAULTS.pageId || !DEFAULTS.pages.find((p) => p.id === DEFAULTS.pageId)) {
    DEFAULTS.pageId = firstPage;
  }
}

/* ------------------------------- ENV ------------------------------- */
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const SMARTEMARK_DEBUG_KEY = String(
  process.env.SMARTEMARK_DEBUG_KEY ||
  process.env.SMARTMARK_DEBUG_KEY ||
  ''
).trim();

const COOKIE_NAME = 'sm_sid';
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;
const SID_HEADER = 'x-sm-sid';
const DEBUG_KEY_HEADER = 'x-smartemark-debug-key';

function computeCookieDomain() {
  if (process.env.COOKIE_DOMAIN) return process.env.COOKIE_DOMAIN;
  if (process.env.RENDER_EXTERNAL_URL) {
    try {
      return new URL(process.env.RENDER_EXTERNAL_URL).hostname;
    } catch {}
  }
  return undefined;
}

function setSessionCookie(res, sid) {
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  const dom = computeCookieDomain();
  if (dom) opts.domain = dom;
  res.cookie(COOKIE_NAME, sid, opts);
}

function isSidLike(x) {
  const s = String(x || '').trim();
  return !!s && /^sm_[A-Za-z0-9_-]{10,}$/.test(s);
}

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

  try {
    const sess = db?.data?.sessions?.find((s) => String(s.sid) === String(sid));
    const username = sess?.username ? String(sess.username).trim() : '';
    if (username) return `user:${username}`;
  } catch {}

  return sid || `ip:${req.ip}`;
}

function hasValidDebugKey(req) {
  const supplied = String(
    req.query?.debug_key ||
      req.query?.key ||
      req.get(DEBUG_KEY_HEADER) ||
      ''
  ).trim();

  if (!SMARTEMARK_DEBUG_KEY || !supplied) {
    return false;
  }

  return supplied === SMARTEMARK_DEBUG_KEY;
}
function getDebugOwnerKeyOverride(req) {
  return String(
    req.query?.owner_key ||
      req.query?.ownerKey ||
      req.get('x-smartemark-owner-key') ||
      ''
  ).trim();
}

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

router.use((req, res, next) => {
  try {
    const cookieSid = req.cookies?.[COOKIE_NAME];
    if (isSidLike(cookieSid)) return next();

    const headerSid = req.get(SID_HEADER);
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const candidate = isSidLike(headerSid) ? headerSid : isSidLike(bearer) ? bearer : '';

    if (candidate) {
      setSessionCookie(res, candidate);
      req.cookies = req.cookies || {};
      req.cookies[COOKIE_NAME] = candidate;
      req.smSid = candidate;
    }
  } catch {}
  next();
});

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

router.get('/facebook/ping', (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const DEFAULTS = defaultsFor(ownerKey);

  res.json({
    ok: true,
    env: {
      FACEBOOK_APP_ID: !!FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: !!FACEBOOK_APP_SECRET,
      FACEBOOK_REDIRECT_URI,
      SMARTEMARK_DEBUG_KEY: !!SMARTEMARK_DEBUG_KEY,
    },
    defaults: {
      adAccountId: DEFAULTS.adAccountId,
      pageId: DEFAULTS.pageId,
      adAccounts: DEFAULTS.adAccounts,
      pages: DEFAULTS.pages,
    },
  });
});

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

  if (/^https?:\/\//i.test(relativePath)) return relativePath;

  const rel = String(relativePath).startsWith('/') ? String(relativePath) : `/${relativePath}`;
  return `${base}${rel}`;
}

const FB_SCOPES = [
  'public_profile',
  'email',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
  'ads_management',
  'ads_read',
];

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function b64urlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecode(b64) {
  const pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
  const s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

function signStateB64(b64) {
  return crypto
    .createHmac('sha256', String(FACEBOOK_APP_SECRET || ''))
    .update(b64)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeOAuthState(payloadObj) {
  const b64 = b64urlEncode(JSON.stringify(payloadObj));
  const sig = signStateB64(b64);
  return `${b64}.${sig}`;
}

function parseAndVerifyOAuthState(stateRaw) {
  const parts = String(stateRaw || '').split('.');
  if (parts.length !== 2) return { ok: false, error: 'bad_state_format' };

  const [b64, sig] = parts;
  const expected = signStateB64(b64);
  if (!sig || sig !== expected) return { ok: false, error: 'bad_state_signature' };

  let payload;
  try {
    payload = JSON.parse(b64urlDecode(b64));
  } catch {
    return { ok: false, error: 'bad_state_payload' };
  }

  const iat = Number(payload?.iat || 0);
  if (!iat || Date.now() - iat > OAUTH_STATE_TTL_MS) {
    return { ok: false, error: 'state_expired' };
  }

  return { ok: true, payload };
}

router.get('/facebook', (req, res) => {
  let sid = req.cookies?.[COOKIE_NAME];
  if (!sid) {
    sid = `sm_${nanoid(24)}`;
    setSessionCookie(res, sid);
  }

  const fallback = `${FRONTEND_URL}/setup`;
  const rawReturnTo = String(req.query.return_to || '').trim();
  const returnTo = rawReturnTo || fallback;

  let safeReturnTo = fallback;
  try {
    const u = new URL(returnTo);
    const host = u.hostname.toLowerCase();
    const allowed =
      host === 'www.smartemark.com' ||
      host === 'smartemark.com' ||
      host === 'localhost' ||
      host === 'smartmark-mvp.vercel.app';
    if (allowed) safeReturnTo = u.toString();
  } catch {}

  safeReturnTo = appendSidToReturnTo(safeReturnTo, sid);

  const state = makeOAuthState({
    sid,
    returnTo: safeReturnTo,
    iat: Date.now(),
    n: nanoid(10),
  });

  const fbUrl =
    `https://www.facebook.com/v18.0/dialog/oauth` +
    `?client_id=${FACEBOOK_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(FB_SCOPES.join(','))}` +
    `&response_type=code&state=${encodeURIComponent(state)}`;

  res.redirect(fbUrl);
});

router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Facebook.');

  const verified = parseAndVerifyOAuthState(String(req.query.state || ''));
  if (!verified.ok) return res.status(400).send('Invalid OAuth state.');

  const sidOwner = String(verified.payload?.sid || '').trim();
  if (!sidOwner) return res.status(400).send('Invalid OAuth state.');

  setSessionCookie(res, sidOwner);

  const fallback = `${FRONTEND_URL}/setup`;
  let returnTo = String(verified.payload?.returnTo || fallback).trim();

  let userOwner = sidOwner;
  try {
    await ensureUsersAndSessions();
    await db.read();
    const sess = (db.data.sessions || []).find((s) => String(s.sid) === String(sidOwner));
    if (sess?.username) userOwner = `user:${String(sess.username).trim()}`;
  } catch {}

  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code,
      },
    });
    const accessToken = tokenRes.data.access_token;

    try {
      const x = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: FACEBOOK_APP_ID,
          client_secret: FACEBOOK_APP_SECRET,
          fb_exchange_token: accessToken,
        },
      });

      if (x.data?.access_token) {
        const tok = x.data.access_token;
        const expiresInSec = Number(x.data.expires_in || 0);
        const fallback60Days = 60 * 24 * 60 * 60;
        const expSec = expiresInSec > 0 ? expiresInSec : fallback60Days;
        const expiresAt = Date.now() + expSec * 1000;

        await setFbUserToken(tok, userOwner);
        await setFbUserTokenMeta(
          { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'long_lived' },
          userOwner
        );

        await setFbUserToken(tok, sidOwner);
        await setFbUserTokenMeta(
          { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'long_lived' },
          sidOwner
        );

        await refreshDefaults(tok, userOwner);
        console.log('[auth] stored LONG-LIVED FB user token (user-bound) + refreshed defaults');
      } else {
        const tok = accessToken;
        const expSec = 2 * 60 * 60;
        const expiresAt = Date.now() + expSec * 1000;

        await setFbUserToken(tok, userOwner);
        await setFbUserTokenMeta(
          { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
          userOwner
        );

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
      const expSec = 2 * 60 * 60;
      const expiresAt = Date.now() + expSec * 1000;

      await setFbUserToken(tok, userOwner);
      await setFbUserTokenMeta(
        { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
        userOwner
      );

      await setFbUserToken(tok, sidOwner);
      await setFbUserTokenMeta(
        { expiresAt, expiresInSec: expSec, provider: 'facebook', kind: 'short_lived' },
        sidOwner
      );

      await refreshDefaults(tok, userOwner);
      console.warn('[auth] long-lived exchange failed, stored short-lived token; defaults refreshed');
    }

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

router.get('/debug/fbtoken-current', async (req, res) => {
  try {
    await ensureUsersAndSessions();
    await db.read();

    const sid = getSidFromReq(req);
    const ownerKey = ownerKeyFromReq(req);
    const token = getFbUserToken(ownerKey);
    const meta = getFbUserTokenMeta(ownerKey);

    const sessionMatch =
      sid
        ? (db.data.sessions || []).find((s) => String(s.sid) === String(sid)) || null
        : null;

    return res.json({
      ok: true,
      sid: sid || null,
      ownerKey,
      hasToken: !!token,
      tokenKind: meta?.kind || null,
      expiresAt: meta?.expiresAt || null,
      sessionMatch: sessionMatch
        ? {
            sid: sessionMatch.sid,
            username: sessionMatch.username,
          }
        : null,
      cookieSid: req.cookies?.[COOKIE_NAME] || null,
      headerSid: req.get(SID_HEADER) || null,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to inspect current Facebook token context.',
    });
  }
});

router.get('/debug/fbtoken-owners', async (req, res) => {
  try {
    await ensureUsersAndSessions();
    await db.read();

    db.data = db.data || {};
    db.data.sessions = db.data.sessions || [];
    db.data.users = db.data.users || [];

    const candidateOwnerKeys = new Set();

    // user:* keys
    for (const user of db.data.users) {
      const username = String(user?.username || '').trim();
      if (username) candidateOwnerKeys.add(`user:${username}`);
    }

    // session sid keys
    for (const sess of db.data.sessions) {
      const sid = String(sess?.sid || '').trim();
      if (sid) candidateOwnerKeys.add(sid);
    }

    const rows = Array.from(candidateOwnerKeys).map((ownerKey) => {
      const token = getFbUserToken(ownerKey);
      const meta = getFbUserTokenMeta(ownerKey);

      return {
        ownerKey,
        hasToken: !!token,
        tokenKind: meta?.kind || null,
        expiresAt: meta?.expiresAt || null,
        username:
          ownerKey.startsWith('user:')
            ? ownerKey.slice(5)
            : (
                db.data.sessions.find((s) => String(s.sid) === ownerKey)?.username || null
              ),
      };
    });

    return res.json({
      ok: true,
      owners: rows.filter((r) => r.hasToken),
      allCheckedCount: rows.length,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to inspect Facebook token owners.',
    });
  }
});

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

async function ensureUsersAndSessions() {
  await db.read();
  db.data = db.data || {};
  db.data.users = db.data.users || [];
  db.data.sessions = db.data.sessions || [];
  await db.write();
}

async function runInternalScheduledPass({ minHoursBetweenRuns = 1, limit = 10 }) {
  return await runScheduledOptimizerPass({
    getUserTokenForOwnerKey: (ownerKeyArg) => getFbUserToken(ownerKeyArg),
    loadCreativesRecord: async (campaignIdArg, accountIdArg) => {
      await ensureUsersAndSessions();
      await db.read();
      db.data.campaign_creatives = db.data.campaign_creatives || [];

      return (
        db.data.campaign_creatives.find((row) => {
          return (
            String(row?.campaignId || '').trim() === String(campaignIdArg).trim() &&
            String(row?.accountId || '').replace(/^act_/, '').trim() ===
              String(accountIdArg).replace(/^act_/, '').trim()
          );
        }) || null
      );
    },
    persistDiagnosis: async (campaignIdArg, diagnosis) => {
      return await updateOptimizerCampaignState(campaignIdArg, {
        latestDiagnosis: diagnosis,
      });
    },
    persistDecision: async (campaignIdArg, decision) => {
      return await updateOptimizerCampaignState(campaignIdArg, {
        latestDecision: decision,
      });
    },
    persistAction: async (campaignIdArg, action) => {
      const nextStatus =
        action?.actionResult?.campaign?.effectiveStatus ||
        action?.actionResult?.campaign?.status ||
        null;

      return await updateOptimizerCampaignState(campaignIdArg, {
        latestAction: action,
        ...(nextStatus ? { currentStatus: String(nextStatus).trim() } : {}),
      });
    },
    persistMonitoring: async (campaignIdArg, monitoring) => {
      return await updateOptimizerCampaignState(campaignIdArg, {
        latestMonitoringDecision: monitoring,
      });
    },
    minHoursBetweenRuns,
    limit,
  });
}

async function requireSession(req) {
  await ensureUsersAndSessions();
  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const sid = req.cookies?.[COOKIE_NAME] || req.get(SID_HEADER) || bearer;

  if (!sid) return { ok: false, status: 401, error: 'Not logged in' };
  const sess = db.data.sessions.find((s) => s.sid === sid);
  if (!sess) return { ok: false, status: 401, error: 'Session not found' };

  const user = db.data.users.find((u) => u.username === sess.username);
  if (!user) return { ok: false, status: 401, error: 'User not found for session' };

  return { ok: true, sid, sess, user };
}

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    await ensureUsersAndSessions();
    if (db.data.users.find((u) => u.username === username || u.email === email)) {
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

    const user =
      db.data.users.find((x) => x.username === u) ||
      db.data.users.find((x) => x.email === u);

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
      db.data.sessions = db.data.sessions.filter((s) => s.sid !== sid);
      await db.write();
    }
    res.clearCookie(COOKIE_NAME, {
      path: '/',
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      domain: computeCookieDomain(),
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed', detail: err.message });
  }
});

router.get('/debug/cookies', (req, res) => {
  res.json({
    headerCookie: req.headers.cookie || null,
    parsed: req.cookies || null,
  });
});

router.get('/whoami', async (req, res) => {
  try {
    const s = await requireSession(req);
    if (!s.ok) return res.status(s.status).json({ error: s.error });

    res.json({ success: true, user: { username: s.user.username, email: s.user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve session', detail: err.message });
  }
});

router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const { accountId } = req.params;

  const userToken = getFbUserToken(ownerKey);
  if (!userToken) {
    return res.status(401).json({
      error: 'Not authenticated with Facebook',
      hint: 'Session mismatch: your sid cookie/header must match the one used during OAuth.',
      ownerKeyUsed: ownerKey,
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

    const backendBase =
      process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'https://smartmark-mvp.onrender.com';

    const frontendBase =
      process.env.FRONTEND_URL ||
      'https://smartmark-mvp.vercel.app';

    if (!/^https?:\/\//i.test(s)) {
      const rel = s.startsWith('/') ? s : `/${s}`;
      return `${backendBase}${rel}`;
    }

    try {
      const parsed = new URL(s);
      const host = parsed.hostname.toLowerCase();

      const frontendHost = (() => {
        try {
          return new URL(frontendBase).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      const backendHost = (() => {
        try {
          return new URL(backendBase).hostname.toLowerCase();
        } catch {
          return '';
        }
      })();

      const shouldRewriteToBackend =
        host === 'smartemark.com' ||
        host === 'www.smartemark.com' ||
        host === 'smartmark-mvp.vercel.app' ||
        host === 'www.smartmark-mvp.vercel.app' ||
        (frontendHost && host === frontendHost);

      if (shouldRewriteToBackend) {
        return new URL(parsed.pathname + parsed.search, backendBase).toString();
      }

      if (backendHost && host === backendHost) {
        return s;
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
        bytes: v.bytes || v.base64 || v.b64 || null,
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
    const push = (u) => {
      if (u) candidates.push(String(u));
    };

    try {
      if (/^https?:\/\//i.test(raw)) {
        push(raw);

        const u = new URL(raw);
        const pathWithSearch = `${u.pathname}${u.search || ''}`;

        push(`${backendBase}${pathWithSearch}`);

        if (u.pathname.startsWith('/generated/')) {
          push(`${backendBase}${u.pathname}`);
          push(`${backendBase}/api/media${u.pathname}`);
        }

        if (u.pathname.startsWith('/api/media/')) {
          push(`${backendBase}${pathWithSearch}`);
          const stripped = u.pathname.replace(/^\/api\/media/, '');
          if (stripped) push(`${backendBase}/media${stripped}${u.search || ''}`);
        }

        if (u.pathname.startsWith('/media/')) {
          push(`${backendBase}${pathWithSearch}`);
          const stripped = u.pathname.replace(/^\/media/, '');
          if (stripped) push(`${backendBase}/api/media${stripped}${u.search || ''}`);
        }
      } else {
        const rel = raw.startsWith('/') ? raw : `/${raw}`;
        push(`${backendBase}${rel}`);

        if (rel.startsWith('/generated/')) push(`${backendBase}/api/media${rel}`);
        if (rel.startsWith('/api/media/')) {
          const stripped = rel.replace(/^\/api\/media/, '');
          if (stripped) push(`${backendBase}/media${stripped}`);
        }
        if (rel.startsWith('/media/')) {
          const stripped = rel.replace(/^\/media/, '');
          if (stripped) push(`${backendBase}/api/media${stripped}`);
        }
      }
    } catch {
      const rel = raw.startsWith('/') ? raw : `/${raw}`;
      push(`${backendBase}${rel}`);
      if (rel.startsWith('/generated/')) push(`${backendBase}/api/media${rel}`);
    }

    try {
      push(absolutePublicUrl(raw));
    } catch {}

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
            Accept: 'image/*,*/*',
            'User-Agent': 'SmartMark/1.0',
          },
        });

        const ct = String(imgRes.headers?.['content-type'] || '').toLowerCase();
        if (ct && !ct.includes('image') && !ct.includes('octet-stream')) {
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
          data: Buffer.isBuffer(data) ? '(buffer)' : data,
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
        params: { access_token: userToken, fields: 'id,name' },
      });
      const first = pagesRes.data?.data?.[0]?.id || null;
      if (first) {
        DEFAULTS.pageId = String(first);
        return String(first);
      }
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
      overrideCountPerType = null,
    } = req.body;

    const pageIdFinal = await resolvePageId(pageId);
    if (!pageIdFinal) {
      return res.status(400).json({
        error: 'No Facebook Page available on this account. Connect a Page and try again.',
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
    } catch {
      aiAudience = null;
    }

    let targeting = {
      geo_locations: { countries: ['US'] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 },
    };

    if (aiAudience?.location) {
      const loc = String(aiAudience.location).trim();
      if (/^[A-Za-z]{2}$/.test(loc)) targeting.geo_locations = { countries: [loc.toUpperCase()] };
      else if (/united states|usa/i.test(loc)) targeting.geo_locations = { countries: ['US'] };
      else targeting.geo_locations = { countries: [loc.toUpperCase()] };
    }

    if (aiAudience?.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
      const [min, max] = aiAudience.ageRange.split('-').map(Number);
      targeting.age_min = min;
      targeting.age_max = max;
    }

    if (aiAudience?.fbInterestIds?.length) {
      targeting.flexible_spec = [{ interests: aiAudience.fbInterestIds.map((id) => ({ id })) }];
      targeting.targeting_automation.advantage_audience = 0;
    } else {
      targeting.targeting_automation.advantage_audience = 1;
    }

    if (!VALIDATE_ONLY) {
      const existing = await axios.get(`https://graph.facebook.com/v18.0/act_${accountId}/campaigns`, {
        params: { access_token: userToken, fields: 'id,name,effective_status', limit: 50 },
      });
      const activeCount = (existing.data?.data || []).filter(
        (c) => !['ARCHIVED', 'DELETED'].includes((c.effective_status || '').toUpperCase())
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
      overrideCountPerType:
        overrideCountPerType && typeof overrideCountPerType === 'object'
          ? { images: Number(overrideCountPerType.images || 0) }
          : overrideCountPerType,
    });

    const needImg = plan.images || 0;

    if (needImg > 0 && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }

    const parsedVariants = [];
    for (let i = 0; i < needImg; i++) {
      const v = parseImageVariant(imageVariants[i]);
      const normalized = normalizeImageUrl(v.url);
      const inline = v.bytes ? extractBase64FromDataUrl(v.bytes) || String(v.bytes).trim() : null;

      if (!inline && !normalized) {
        return res.status(400).json({
          error: `Invalid image URL for variant ${i + 1}. Do NOT send blob: URLs.`,
          badValue: imageVariants[i],
        });
      }
      parsedVariants.push({ url: normalized || v.url, bytes: inline });
    }

    const now = new Date();
    let startISO = flightStart
      ? new Date(flightStart).toISOString()
      : NO_SPEND
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(now.getTime() + 60 * 1000).toISOString();

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
        special_ad_categories: [],
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
        },
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
              description: form.description || '',
            },
          },
        },
        { params: mkParams() }
      );

      const ad = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
        {
          name: `${campaignName} (Image v${i + 1})`,
          adset_id: imageAdSetId,
          creative: { creative_id: cr.data.id },
          status: NO_SPEND ? 'PAUSED' : 'ACTIVE',
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
    const idx = list.findIndex((c) => c.campaignId === campaignId);
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
      ...(idx === -1 ? { createdAt: nowIso } : {}),
    };

    if (idx === -1) list.push(record);
    else list[idx] = { ...list[idx], ...record };

    await db.write();

    try {
      const optimizerPayload = {
        campaignId: String(campaignId || '').trim(),
        metaCampaignId: String(campaignId || '').trim(),
        accountId: String(accountId || '').trim(),
        ownerKey: String(ownerKey || '').trim(),
        pageId: String(pageIdFinal || '').trim(),
        campaignName: String(campaignName || '').trim(),
        niche: String(
          form.businessType ||
            form.industry ||
            form.niche ||
            form.cuisineType ||
            ''
        ).trim(),
        currentStatus: String(campaignStatus || '').trim(),
        optimizationEnabled: !VALIDATE_ONLY,
        metricsSnapshot: {},
        latestAction: null,
        latestMonitoringDecision: null,
        currentWinner: null,
        activeTestType: '',
      };

      console.log('[optimizer state] launch upsert payload:', optimizerPayload);

      const savedOptimizerState = await upsertOptimizerCampaignState(optimizerPayload);

      console.log('[optimizer state] launch upsert success:', savedOptimizerState);
    } catch (stateErr) {
      console.error('[optimizer state] failed to upsert on campaign launch:', {
        message: stateErr?.message || 'unknown error',
        stack: stateErr?.stack || null,
        campaignId,
        accountId,
        ownerKey,
        pageIdFinal,
        campaignName,
        campaignStatus,
      });
    }

    res.json({
      success: true,
      campaignId,
      adSetIds: [imageAdSetId].filter(Boolean),
      adIds,
      variantPlan: plan,
      campaignStatus,
      validateOnly: VALIDATE_ONLY,
      resolvedPageId: pageIdFinal,
    });
  } catch (err) {
    let errorMsg = 'Failed to launch campaign.';
    if (err.response?.data?.error) errorMsg = err.response.data.error.message;

    let detail = err.response?.data || err.message;
    if (Buffer.isBuffer(detail)) {
      try {
        detail = detail.toString('utf8');
      } catch {}
    }
    console.error('FB Campaign Launch Error:', detail);

    const msg = String(err?.message || '').toLowerCase();
    if (msg.includes('image') || msg.includes('download') || msg.includes('blob')) {
      return res.status(400).json({
        error:
          'One of your ad images could not be fetched by the server (or a blob: URL was sent). Regenerate the image and try again.',
        detail: String(err?.message || detail),
      });
    }

    res.status(500).json({ error: errorMsg, detail });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/optimizer-state', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const usingDebugKey = hasValidDebugKey(req);

    let state = await findOptimizerCampaignStateByCampaignId(campaignId);

    // If missing, create a minimal state directly from route params
    if (!state) {
      const minimalPayload = {
        campaignId: String(campaignId || '').trim(),
        metaCampaignId: String(campaignId || '').trim(),
        accountId: String(accountId || '').replace(/^act_/, '').trim(),
        ownerKey: '',
        pageId: '',
        campaignName: '',
        niche: '',
        currentStatus: 'ACTIVE',
        optimizationEnabled: true,
        metricsSnapshot: {},
        latestAction: null,
        latestMonitoringDecision: null,
        currentWinner: null,
        activeTestType: '',
      };

      console.log('[optimizer state] creating minimal fallback state from route params:', minimalPayload);

      state = await upsertOptimizerCampaignState(minimalPayload);
    }

    if (!state) {
      return res.status(404).json({
        ok: false,
        error: 'No optimizer campaign state found for this campaign.',
      });
    }

    if (String(state.accountId || '').replace(/^act_/, '') !== String(accountId || '').replace(/^act_/, '')) {
      return res.status(403).json({
        ok: false,
        error: 'Account ID does not match this optimizer campaign state.',
      });
    }

    if (usingDebugKey) {
      return res.json({
        ok: true,
        accessMode: 'debug_key',
        optimizerState: state,
      });
    }

    const session = await requireSession(req);
    if (!session.ok) {
      return res.status(session.status).json({ ok: false, error: session.error });
    }

    const currentOwnerKey = `user:${String(session.user.username).trim()}`;

    if (state.ownerKey && String(state.ownerKey) !== currentOwnerKey) {
      return res.status(403).json({
        ok: false,
        error: 'You do not have access to this optimizer campaign state.',
      });
    }

    // If ownerKey was blank in fallback creation, attach it now
    if (!state.ownerKey) {
      state = await upsertOptimizerCampaignState({
        ...state,
        ownerKey: currentOwnerKey,
      });
    }

    return res.json({
      ok: true,
      accessMode: 'session',
      optimizerState: state,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to load optimizer campaign state.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/seed-optimizer-state', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let ownerKey = '';
    let userToken = null;

    if (usingDebugKey) {
      ownerKey = String(
        getDebugOwnerKeyOverride(req) ||
        req.body?.ownerKey ||
        req.body?.owner_key ||
        ''
      ).trim();

      if (!ownerKey) {
        return res.status(400).json({
          ok: false,
          error: 'owner_key is required for debug seed route.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'No Facebook token found for supplied owner_key.',
          ownerKey,
        });
      }
    } else {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      ownerKey = `user:${String(session.user.username).trim()}`;
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated with Facebook for this session.',
        });
      }
    }

    const campaignRes = await axios.get(`https://graph.facebook.com/v18.0/${normalizedCampaignId}`, {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,configured_status,objective,start_time',
      },
    });

    const campaign = campaignRes.data || {};

    const payload = {
      campaignId: normalizedCampaignId,
      metaCampaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey,
      pageId: '',
      campaignName: String(campaign.name || '').trim(),
      niche: '',
      currentStatus: String(
        campaign.effective_status ||
        campaign.status ||
        'ACTIVE'
      ).trim(),
      optimizationEnabled: true,
    };

    const saved = await upsertOptimizerCampaignState(payload);

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      seeded: true,
      optimizerState: saved,
      campaign: {
        id: String(campaign.id || '').trim(),
        name: String(campaign.name || '').trim(),
        status: String(campaign.status || '').trim(),
        effectiveStatus: String(campaign.effective_status || '').trim(),
        configuredStatus: String(campaign.configured_status || '').trim(),
        objective: String(campaign.objective || '').trim(),
        startTime: String(campaign.start_time || '').trim(),
      },
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.response?.data?.error?.message || err?.message || 'Failed to seed optimizer state.',
      detail: err?.response?.data || null,
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/sync-metrics', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let ownerKey = '';
    let userToken = null;

if (usingDebugKey) {
  const candidateOwnerKeys = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const v = String(value || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    candidateOwnerKeys.push(v);
  };

  const debugOwnerKey = getDebugOwnerKeyOverride(req);
  addCandidate(debugOwnerKey);

  const reqOwnerKey = ownerKeyFromReq(req);
  addCandidate(reqOwnerKey);

  const existingState = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);
  addCandidate(existingState?.ownerKey);

  await ensureUsersAndSessions();
  await db.read();
  db.data.campaign_creatives = db.data.campaign_creatives || [];
  db.data.sessions = db.data.sessions || [];

  const creativeRecord = db.data.campaign_creatives.find((row) => {
    return (
      String(row?.campaignId || '').trim() === normalizedCampaignId &&
      String(row?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
    );
  });

  addCandidate(creativeRecord?.ownerKey);

  if (debugOwnerKey.startsWith('user:')) {
    const username = debugOwnerKey.slice(5).trim();

    for (const sess of db.data.sessions) {
      if (String(sess?.username || '').trim() === username) {
        addCandidate(sess.sid);
      }
    }
  }

  const creativeOwnerKey = String(creativeRecord?.ownerKey || '').trim();
  if (creativeOwnerKey.startsWith('user:')) {
    const username = creativeOwnerKey.slice(5).trim();

    for (const sess of db.data.sessions) {
      if (String(sess?.username || '').trim() === username) {
        addCandidate(sess.sid);
      }
    }
  }

  for (const candidate of candidateOwnerKeys) {
    const tok = getFbUserToken(candidate);
    if (tok) {
      ownerKey = candidate;
      userToken = tok;
      break;
    }
  }

  if (!userToken) {
    return res.status(401).json({
      ok: false,
      error: 'No Facebook token available for debug-key metrics sync.',
      triedOwnerKeys: candidateOwnerKeys,
    });
  }

  if (ownerKey.startsWith('sm_') && debugOwnerKey.startsWith('user:')) {
    await updateOptimizerCampaignState(normalizedCampaignId, {
      ownerKey: debugOwnerKey,
    });
  } else if (ownerKey) {
    await updateOptimizerCampaignState(normalizedCampaignId, {
      ownerKey,
    });
  }
} else {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      ownerKey = `user:${String(session.user.username).trim()}`;
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated with Facebook for this session.',
        });
      }
    }

    const result = await syncCampaignMetricsToOptimizerState({
      userToken,
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey,
    });

    if (ownerKey) {
      await updateOptimizerCampaignState(normalizedCampaignId, { ownerKey });
    }

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      created: !!result.created,
      resolvedOwnerKey: ownerKey,
      metricsSnapshot: result.snapshot,
      optimizerState: result.optimizerState,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to sync campaign metrics into optimizer state.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/run-diagnosis', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

   let state = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

if (!state) {
  await ensureUsersAndSessions();
  await db.read();
  db.data.campaign_creatives = db.data.campaign_creatives || [];

  const creativeRecordForBackfill =
    db.data.campaign_creatives.find((row) => {
      return (
        String(row?.campaignId || '').trim() === normalizedCampaignId &&
        String(row?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
      );
    }) || null;

  const fallbackPayload = {
    campaignId: normalizedCampaignId,
    metaCampaignId: normalizedCampaignId,
    accountId: normalizedAccountId,
    ownerKey: String(creativeRecordForBackfill?.ownerKey || '').trim(),
    pageId: String(creativeRecordForBackfill?.pageId || '').trim(),
    campaignName: String(creativeRecordForBackfill?.name || '').trim(),
    niche: '',
    currentStatus: String(creativeRecordForBackfill?.status || 'ACTIVE').trim(),
    optimizationEnabled: true,
    metricsSnapshot: {},
    latestAction: null,
    latestMonitoringDecision: null,
    currentWinner: null,
    activeTestType: '',
  };

  state = await upsertOptimizerCampaignState(fallbackPayload);
}

    if (String(state.accountId || '').replace(/^act_/, '').trim() !== normalizedAccountId) {
      return res.status(403).json({
        ok: false,
        error: 'Account ID does not match this optimizer campaign state.',
      });
    }

    if (!usingDebugKey) {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      const currentOwnerKey = `user:${String(session.user.username).trim()}`;

      if (state.ownerKey && String(state.ownerKey).trim() !== currentOwnerKey) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have access to this optimizer campaign state.',
        });
      }
    }

    await ensureUsersAndSessions();
    await db.read();
    db.data.campaign_creatives = db.data.campaign_creatives || [];

  const creativesRecord =
  db.data.campaign_creatives.find((row) => {
    return (
      String(row?.campaignId || '').trim() === normalizedCampaignId &&
      String(row?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
    );
  }) || null;

// If metricsSnapshot is still empty but creatives exist, refresh state from DB before diagnosis
if (
  state &&
  (!state.metricsSnapshot || Object.keys(state.metricsSnapshot).length === 0)
) {
  const refreshed = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);
  if (refreshed) state = refreshed;
}

    const diagnosis = buildDiagnosis({
      optimizerState: state,
      creativesRecord,
    });

    console.log('[optimizer diagnosis] input state summary:', {
  campaignId: normalizedCampaignId,
  accountId: normalizedAccountId,
  ownerKey: state?.ownerKey || '',
  metricsSnapshot: state?.metricsSnapshot || {},
  hasCreativesRecord: !!creativesRecord,
});

console.log('[optimizer diagnosis] result:', diagnosis);

    state = await updateOptimizerCampaignState(normalizedCampaignId, {
      latestDiagnosis: diagnosis,
    });

    console.log('[optimizer diagnosis] persisted for campaign:', normalizedCampaignId);

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      diagnosis,
      optimizerState: state,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to run campaign diagnosis.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/run-decision', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let state = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

    if (!state) {
      return res.status(404).json({
        ok: false,
        error: 'No optimizer campaign state found for this campaign.',
      });
    }

    if (String(state.accountId || '').replace(/^act_/, '').trim() !== normalizedAccountId) {
      return res.status(403).json({
        ok: false,
        error: 'Account ID does not match this optimizer campaign state.',
      });
    }

    if (!usingDebugKey) {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      const currentOwnerKey = `user:${String(session.user.username).trim()}`;

      if (state.ownerKey && String(state.ownerKey).trim() !== currentOwnerKey) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have access to this optimizer campaign state.',
        });
      }
    }

    const decision = buildDecision({
      optimizerState: state,
    });

    console.log('[optimizer decision] input summary:', {
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey: state?.ownerKey || '',
      latestDiagnosis: state?.latestDiagnosis || null,
      metricsSnapshot: state?.metricsSnapshot || {},
    });

    console.log('[optimizer decision] result:', decision);

    state = await updateOptimizerCampaignState(normalizedCampaignId, {
      latestDecision: decision,
    });

    console.log('[optimizer decision] persisted for campaign:', normalizedCampaignId);

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      decision,
      optimizerState: state,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to run campaign decision.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/run-action', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let state = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

    if (!state) {
      return res.status(404).json({
        ok: false,
        error: 'No optimizer campaign state found for this campaign.',
      });
    }

    if (String(state.accountId || '').replace(/^act_/, '').trim() !== normalizedAccountId) {
      return res.status(403).json({
        ok: false,
        error: 'Account ID does not match this optimizer campaign state.',
      });
    }

    let ownerKey = '';
    let userToken = null;

    if (usingDebugKey) {
      ownerKey = String(state.ownerKey || '').trim();

      if (!ownerKey) {
        return res.status(401).json({
          ok: false,
          error: 'No ownerKey found on optimizer state for action execution.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'No Facebook token available for action execution.',
          ownerKey,
        });
      }
    } else {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      const currentOwnerKey = `user:${String(session.user.username).trim()}`;

      if (state.ownerKey && String(state.ownerKey).trim() !== currentOwnerKey) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have access to this optimizer campaign state.',
        });
      }

      ownerKey = currentOwnerKey;
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated with Facebook for this session.',
        });
      }
    }

    console.log('[optimizer action] input summary:', {
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey,
      latestDecision: state?.latestDecision || null,
      metricsSnapshot: state?.metricsSnapshot || {},
    });

    const action = await executeAction({
      optimizerState: state,
      userToken,
    });

    console.log('[optimizer action] result:', action);

    state = await updateOptimizerCampaignState(normalizedCampaignId, {
      latestAction: action,
    });

    console.log('[optimizer action] persisted for campaign:', normalizedCampaignId);

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      action,
      optimizerState: state,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.response?.data?.error?.message || err?.message || 'Failed to run campaign action.',
      detail: err?.response?.data || null,
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/run-monitoring', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let state = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

    if (!state) {
      return res.status(404).json({
        ok: false,
        error: 'No optimizer campaign state found for this campaign.',
      });
    }

    if (String(state.accountId || '').replace(/^act_/, '').trim() !== normalizedAccountId) {
      return res.status(403).json({
        ok: false,
        error: 'Account ID does not match this optimizer campaign state.',
      });
    }

    if (!usingDebugKey) {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      const currentOwnerKey = `user:${String(session.user.username).trim()}`;

      if (state.ownerKey && String(state.ownerKey).trim() !== currentOwnerKey) {
        return res.status(403).json({
          ok: false,
          error: 'You do not have access to this optimizer campaign state.',
        });
      }
    }

    console.log('[optimizer monitoring] input summary:', {
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey: state?.ownerKey || '',
      latestDiagnosis: state?.latestDiagnosis || null,
      latestDecision: state?.latestDecision || null,
      latestAction: state?.latestAction || null,
    });

    const monitoring = buildMonitoring({
      optimizerState: state,
    });

    console.log('[optimizer monitoring] result:', monitoring);

    state = await updateOptimizerCampaignState(normalizedCampaignId, {
      latestMonitoringDecision: monitoring,
    });

    console.log('[optimizer monitoring] persisted for campaign:', normalizedCampaignId);

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      monitoring,
      optimizerState: state,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to run campaign monitoring.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/run-full-cycle', async (req, res) => {
  try {
    const { campaignId, accountId } = req.params;
    const normalizedCampaignId = String(campaignId || '').trim();
    const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
    const usingDebugKey = hasValidDebugKey(req);

    let ownerKey = '';
    let userToken = null;

    if (usingDebugKey) {
      const state = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

      ownerKey = String(
        getDebugOwnerKeyOverride(req) ||
        state?.ownerKey ||
        ''
      ).trim();

      if (!ownerKey) {
        return res.status(401).json({
          ok: false,
          error: 'No ownerKey available for full cycle.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'No Facebook token available for full cycle.',
          ownerKey,
        });
      }
    } else {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      ownerKey = `user:${String(session.user.username).trim()}`;
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated with Facebook for this session.',
        });
      }
    }

    const result = await runFullOptimizerCycle({
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey,
      userToken,
      loadCreativesRecord: async (campaignIdArg, accountIdArg) => {
        await ensureUsersAndSessions();
        await db.read();
        db.data.campaign_creatives = db.data.campaign_creatives || [];

        return (
          db.data.campaign_creatives.find((row) => {
            return (
              String(row?.campaignId || '').trim() === String(campaignIdArg).trim() &&
              String(row?.accountId || '').replace(/^act_/, '').trim() ===
                String(accountIdArg).replace(/^act_/, '').trim()
            );
          }) || null
        );
      },
      persistDiagnosis: async (campaignIdArg, diagnosis) => {
        return await updateOptimizerCampaignState(campaignIdArg, {
          latestDiagnosis: diagnosis,
        });
      },
      persistDecision: async (campaignIdArg, decision) => {
        return await updateOptimizerCampaignState(campaignIdArg, {
          latestDecision: decision,
        });
      },
      persistAction: async (campaignIdArg, action) => {
        return await updateOptimizerCampaignState(campaignIdArg, {
          latestAction: action,
        });
      },
      persistMonitoring: async (campaignIdArg, monitoring) => {
        return await updateOptimizerCampaignState(campaignIdArg, {
          latestMonitoringDecision: monitoring,
        });
      },
    });

    console.log('[optimizer full cycle] completed:', {
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey,
      cycle: result.cycle,
    });

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      cycle: result.cycle,
      optimizerState: result.optimizerState,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.response?.data?.error?.message || err?.message || 'Failed to run full optimizer cycle.',
      detail: err?.response?.data || null,
    });
  }
});

router.post('/facebook/optimizer/run-scheduled-pass', async (req, res) => {
  try {
    const usingDebugKey = hasValidDebugKey(req);

    let ownerKey = '';
    let userToken = null;

    if (usingDebugKey) {
      ownerKey = String(
        getDebugOwnerKeyOverride(req) ||
        req.body?.ownerKey ||
        req.body?.owner_key ||
        ''
      ).trim();

      if (!ownerKey) {
        return res.status(400).json({
          ok: false,
          error: 'owner_key is required for debug scheduled pass.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'No Facebook token available for scheduled pass.',
          ownerKey,
        });
      }
    } else {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }

      ownerKey = `user:${String(session.user.username).trim()}`;
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          ok: false,
          error: 'Not authenticated with Facebook for this session.',
        });
      }
    }

    const minHoursBetweenRuns = Number(req.body?.minHoursBetweenRuns ?? req.query?.minHoursBetweenRuns ?? 1);
    const limit = Number(req.body?.limit ?? req.query?.limit ?? 10);
    const accountId = String(req.body?.accountId || req.query?.accountId || '').replace(/^act_/, '').trim();

    let existingStates = await getAllOptimizerCampaignStates();

    // Bootstrap from live Meta campaigns if local state is empty
    if (!existingStates.length && accountId) {
      const campaignsRes = await axios.get(`https://graph.facebook.com/v18.0/act_${accountId}/campaigns`, {
        params: {
          access_token: userToken,
          fields: 'id,name,status,effective_status,configured_status,objective,start_time',
          limit: 50,
        },
      });

      const liveCampaigns = Array.isArray(campaignsRes.data?.data) ? campaignsRes.data.data : [];

      for (const campaign of liveCampaigns) {
        const campaignId = String(campaign?.id || '').trim();
        if (!campaignId) continue;

        await upsertOptimizerCampaignState({
          campaignId,
          metaCampaignId: campaignId,
          accountId,
          ownerKey,
          pageId: '',
          campaignName: String(campaign?.name || '').trim(),
          niche: '',
          currentStatus: String(
            campaign?.effective_status ||
            campaign?.status ||
            'ACTIVE'
          ).trim(),
          optimizationEnabled: true,
        });
      }

      existingStates = await getAllOptimizerCampaignStates();
    }

const result = await runInternalScheduledPass({
  minHoursBetweenRuns,
  limit,
});

    console.log('[optimizer scheduler] scheduled pass completed:', {
      ownerKey,
      accountId,
      result,
    });

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      scheduler: result,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.response?.data?.error?.message || err?.message || 'Failed to run scheduled optimizer pass.',
      detail: err?.response?.data || null,
    });
  }
});

router.post('/facebook/optimizer/backfill-states', async (req, res) => {
  try {
    const usingDebugKey = hasValidDebugKey(req);

    if (!usingDebugKey) {
      const session = await requireSession(req);
      if (!session.ok) {
        return res.status(session.status).json({ ok: false, error: session.error });
      }
    }

    await ensureUsersAndSessions();
    await db.read();

    db.data = db.data || {};
    db.data.campaign_creatives = db.data.campaign_creatives || [];

    const sourceRecords = db.data.campaign_creatives;
    const results = [];

    for (const rec of sourceRecords) {
      const campaignId = String(rec?.campaignId || '').trim();
      const accountId = String(rec?.accountId || '').replace(/^act_/, '').trim();

      if (!campaignId || !accountId) {
        results.push({
          ok: false,
          skipped: true,
          reason: 'Missing campaignId or accountId on campaign_creatives record.',
          campaignId,
          accountId,
        });
        continue;
      }

      const payload = {
        campaignId,
        metaCampaignId: campaignId,
        accountId,
        ownerKey: String(rec?.ownerKey || '').trim(),
        pageId: String(rec?.pageId || '').trim(),
        campaignName: String(rec?.name || '').trim(),
        niche: '',
        currentStatus: String(rec?.status || 'ACTIVE').trim(),
        optimizationEnabled: true,
      };

      const saved = await upsertOptimizerCampaignState(payload);

      results.push({
        ok: true,
        campaignId,
        accountId,
        ownerKey: saved?.ownerKey || '',
        campaignName: saved?.campaignName || '',
        currentStatus: saved?.currentStatus || '',
      });
    }

    return res.json({
      ok: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      scanned: sourceRecords.length,
      backfilled: results.filter((x) => x.ok).length,
      results,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to backfill optimizer states.',
    });
  }
});

router.get('/facebook/adaccount/:accountId/campaigns', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const userToken = getFbUserToken(ownerKey);
  const { accountId } = req.params;
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '');

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  try {
    const response = await axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/campaigns`, {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,start_time',
        limit: 50,
      },
    });

    const list = Array.isArray(response.data?.data) ? response.data.data : [];

    return res.json({
      data: list.slice(0, 2),
      source: 'facebook',
    });
  } catch (err) {
    try {
      await ensureUsersAndSessions();
      await db.read();

      const sid = getSidFromReq(req);
      const ownerCandidates = new Set([String(ownerKey || ''), String(sid || '')]);

      try {
        const sess = (db.data.sessions || []).find((s) => String(s.sid) === String(sid));
        if (sess?.username) ownerCandidates.add(`user:${String(sess.username).trim()}`);
      } catch {}

      const cached = (db.data?.campaign_creatives || [])
        .filter((r) => {
          const recAccount = String(r.accountId || '').replace(/^act_/, '');
          const recOwner = String(r.ownerKey || '');
          return recAccount === normalizedAccountId && ownerCandidates.has(recOwner);
        })
        .map((r) => ({
          id: r.campaignId,
          name: r.name || 'Campaign',
          status: r.status || 'ACTIVE',
          effective_status: r.status || 'ACTIVE',
          start_time: r.createdAt || r.updatedAt || null,
        }))
        .slice(0, 2);

      if (cached.length > 0) {
        console.warn('[campaigns] Facebook fetch failed, serving cached campaigns instead:', {
          ownerKey,
          sid,
          accountId: normalizedAccountId,
          fbError: err.response?.data || err.message,
          cachedCount: cached.length,
        });

        return res.json({
          data: cached,
          source: 'cache',
          fbError: err.response?.data?.error?.message || err.message || 'Facebook campaigns fetch failed',
        });
      }
    } catch (cacheErr) {
      console.error('[campaigns] cache fallback failed:', cacheErr?.message || cacheErr);
    }

    console.error('[campaigns] Facebook fetch failed with no cache fallback:', err.response?.data || err.message);

    return res.status(500).json({
      error: err.response?.data?.error?.message || 'Failed to fetch campaigns.',
      detail: err.response?.data || err.message,
    });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/details', async (req, res) => {
  const userToken = getFbUserToken(ownerKeyFromReq(req));

  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const response = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}`, {
      params: { access_token: userToken, fields: 'id,name,status,start_time,objective,effective_status' },
    });
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
    const response = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/insights`, {
      params: {
        access_token: userToken,
        fields: 'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks',
        date_preset: 'maximum',
      },
    });
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
    const rec =
      (db.data.campaign_creatives || []).find(
        (r) => r.campaignId === campaignId && r.ownerKey === ownerKey
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
      createdAt: rec.createdAt,
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

router.get('/facebook/debug/meta-call-stats', (req, res) => {
  res.json({
    ok: true,
    stats: META_CALL_STATS,
  });
});

if (!global.__SMARTEMARK_OPTIMIZER_AUTORUN_STARTED__) {
  try {
    startOptimizerAutoRunner({
      runScheduledPass: async ({ minHoursBetweenRuns, limit }) => {
        await ensureUsersAndSessions();
        await db.read();

        let existingStates = await getAllOptimizerCampaignStates();

        // If no local optimizer states exist yet, bootstrap from known live account + owner env
        if (!existingStates.length) {
          const ownerKey = String(process.env.OPTIMIZER_AUTORUN_OWNER_KEY || '').trim();
          const accountId = String(process.env.OPTIMIZER_AUTORUN_ACCOUNT_ID || '')
            .replace(/^act_/, '')
            .trim();

          if (ownerKey && accountId) {
            const userToken = getFbUserToken(ownerKey);

            if (userToken) {
              const campaignsRes = await axios.get(
                `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
                {
                  params: {
                    access_token: userToken,
                    fields:
                      'id,name,status,effective_status,configured_status,objective,start_time',
                    limit: 50,
                  },
                }
              );

              const liveCampaigns = Array.isArray(campaignsRes.data?.data)
                ? campaignsRes.data.data
                : [];

              for (const campaign of liveCampaigns) {
                const campaignId = String(campaign?.id || '').trim();
                if (!campaignId) continue;

                await upsertOptimizerCampaignState({
                  campaignId,
                  metaCampaignId: campaignId,
                  accountId,
                  ownerKey,
                  pageId: '',
                  campaignName: String(campaign?.name || '').trim(),
                  niche: '',
                  currentStatus: String(
                    campaign?.effective_status || campaign?.status || 'ACTIVE'
                  ).trim(),
                  optimizationEnabled: true,
                });
              }
            }
          }

          existingStates = await getAllOptimizerCampaignStates();
        }

        return await runInternalScheduledPass({
          minHoursBetweenRuns,
          limit,
        });
      },
    });

    global.__SMARTEMARK_OPTIMIZER_AUTORUN_STARTED__ = true;
  } catch (err) {
    console.error('[optimizer autorun] failed to start', {
      message: err?.message || 'unknown error',
      stack: err?.stack || null,
    });
  }
}

module.exports = router;