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
const { buildPublicSummary } = require('../optimizerPublicSummary');
const { runFullOptimizerCycle } = require('../optimizerOrchestrator');
const { runScheduledOptimizerPass } = require('../optimizerScheduler');
const { startOptimizerAutoRunner } = require('../optimizerAutoRunner');

const { policy } = require('../smartCampaignEngine');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const crypto = require('crypto');

/* ------------------------------------------------------------------ */
/*        META API USAGE TRACKER (GENERAL + QUALIFIED MARKETING)      */
/* ------------------------------------------------------------------ */
const META_CALL_STATS = {
  startedAt: new Date().toISOString(),
  total: 0,
  success: 0,
  fail: 0,
  byLabel: {},
  recent: [],
};

const META_USAGE_DB_KEY = 'meta_api_usage';
const META_USAGE_ALL_TIME_DB_KEY = 'meta_api_usage_all_time';
const META_USAGE_KEEP_DAYS = 20; // keep a little extra beyond 15-day review window

function ensureMetaUsageStore() {
  db.data = db.data || {};
  db.data[META_USAGE_DB_KEY] = Array.isArray(db.data[META_USAGE_DB_KEY])
    ? db.data[META_USAGE_DB_KEY]
    : [];
  return db.data[META_USAGE_DB_KEY];
}

function ensureMetaUsageAllTimeStore() {
  db.data = db.data || {};
  db.data[META_USAGE_ALL_TIME_DB_KEY] = Array.isArray(db.data[META_USAGE_ALL_TIME_DB_KEY])
    ? db.data[META_USAGE_ALL_TIME_DB_KEY]
    : [];
  return db.data[META_USAGE_ALL_TIME_DB_KEY];
}

function normalizeGraphPath(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const u = new URL(raw);
    return u.pathname || '';
  } catch {
    return raw;
  }
}

function getMetaLabel(method, url) {
  const m = String(method || 'GET').toUpperCase();
  const path = normalizeGraphPath(url);

  if (path.includes('/me/adaccounts')) return `${m} me/adaccounts`;
  if (path.includes('/me/accounts')) return `${m} me/accounts`;
  if (path.includes('/insights')) return `${m} insights`;
  if (path.includes('/adimages')) return `${m} adimages`;
  if (path.includes('/adcreatives')) return `${m} adcreatives`;
  if (/\/adsets(?:\/|$)/.test(path)) return `${m} adsets`;
  if (/\/ads(?:\/|$)/.test(path)) return `${m} ads`;

  if (/\/act_[^/]+\/campaigns(?:\/|$)/.test(path)) {
    return m === 'POST' ? 'POST campaigns_create' : 'GET campaigns_list';
  }

  if (/\/v\d+\.\d+\/[^/]+$/.test(path)) {
    return `${m} campaign_object_update_or_read`;
  }

  return `${m} other`;
}

function getQualifiedMarketingLabel(method, url) {
  const m = String(method || 'GET').toUpperCase();
  const path = normalizeGraphPath(url);

  // Strongest calls to rely on for Ads Management Standard Access
  if (m === 'GET' && /\/act_[^/]+\/campaigns(?:\/|$)/.test(path)) return 'marketing_campaigns_list';
  if (m === 'GET' && /\/act_[^/]+\/adsets(?:\/|$)/.test(path)) return 'marketing_adsets_list';
  if (m === 'GET' && /\/act_[^/]+\/ads(?:\/|$)/.test(path)) return 'marketing_ads_list';

  if (m === 'GET' && /\/[^/]+\/insights(?:\/|$)/.test(path)) return 'marketing_insights';
  if (m === 'POST' && /\/act_[^/]+\/campaigns(?:\/|$)/.test(path)) return 'marketing_campaign_create';
  if (m === 'POST' && /\/act_[^/]+\/adsets(?:\/|$)/.test(path)) return 'marketing_adset_create';
  if (m === 'POST' && /\/act_[^/]+\/ads(?:\/|$)/.test(path)) return 'marketing_ad_create';
  if (m === 'POST' && /\/act_[^/]+\/adimages(?:\/|$)/.test(path)) return 'marketing_adimage_upload';
  if (m === 'POST' && /\/act_[^/]+\/adcreatives(?:\/|$)/.test(path)) return 'marketing_adcreative_create';

  // Updating campaign/adset/ad objects by ID
  if (m === 'POST' && /\/v\d+\.\d+\/\d+(?:\/|$)?/.test(path)) {
    return 'marketing_object_update';
  }

  return null;
}

function isQualifiedMarketingCall(method, url) {
  const path = normalizeGraphPath(url);
  const m = String(method || 'GET').toUpperCase();

  // Explicitly exclude auth/helper endpoints from "qualified" counting
  if (path.includes('/me/accounts')) return false;
  if (path.includes('/me/adaccounts')) return false;
  if (path.includes('/oauth/')) return false;
  if (path.includes('/dialog/oauth')) return false;
  if (!String(url || '').includes('graph.facebook.com')) return false;

  return !!getQualifiedMarketingLabel(m, url);
}

function inferMetaObjectType(method, url) {
  const path = normalizeGraphPath(url);
  const m = String(method || 'GET').toUpperCase();

  if (/\/act_[^/]+\/campaigns(?:\/|$)/.test(path)) return 'campaign';
  if (/\/act_[^/]+\/adsets(?:\/|$)/.test(path)) return 'adset';
  if (/\/act_[^/]+\/ads(?:\/|$)/.test(path)) return 'ad';
  if (/\/insights(?:\/|$)/.test(path)) return 'insights';
  if (m === 'POST' && /\/v\d+\.\d+\/\d+(?:\/|$)?/.test(path)) return 'object_update';
  return 'other';
}

function tryExtractAccountId(url) {
  const s = String(url || '');
  const actMatch = s.match(/act_(\d+)/);
  if (actMatch?.[1]) return actMatch[1];
  return '';
}

function tryExtractObjectId(url) {
  const path = normalizeGraphPath(url);
  const match = path.match(/\/v\d+\.\d+\/(\d+)(?:\/|$)/);
  return match?.[1] || '';
}

async function persistMetaUsageRow(row) {
  try {
    await db.read();

    const rollingStore = ensureMetaUsageStore();
    const allTimeStore = ensureMetaUsageAllTimeStore();

    rollingStore.push(row);
    allTimeStore.push(row);

    const cutoff = Date.now() - META_USAGE_KEEP_DAYS * 24 * 60 * 60 * 1000;
    db.data[META_USAGE_DB_KEY] = rollingStore.filter((r) => {
      const t = new Date(r.t || 0).getTime();
      return Number.isFinite(t) && t >= cutoff;
    });

    // all-time store intentionally does NOT prune
    db.data[META_USAGE_ALL_TIME_DB_KEY] = allTimeStore;

    await db.write();
  } catch (e) {
    console.warn('[META_API_TRACKER] persist failed:', e?.message || e);
  }
}

function recordMetaCallMemory({ method, url, status, ok }) {
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

  return row;
}

function buildMetaUsageRow({ method, url, status, ok }) {
  const qualified = isQualifiedMarketingCall(method, url);
  const qualifiedLabel = qualified ? getQualifiedMarketingLabel(method, url) : null;

  return {
    t: new Date().toISOString(),
    method: String(method || '').toUpperCase(),
    url: String(url || ''),
    path: normalizeGraphPath(url),
    status: Number(status || 0),
    ok: !!ok,
    label: getMetaLabel(method, url),

    qualifiedMarketingCall: qualified,
    qualifiedLabel,
    objectType: inferMetaObjectType(method, url),

    accountId: tryExtractAccountId(url),
    objectId: tryExtractObjectId(url),
  };
}

function summarizeMetaRows(rows, { qualifiedOnly = false } = {}) {
  const source = qualifiedOnly ? rows.filter((r) => r.qualifiedMarketingCall) : rows;

  const summary = {
    total: source.length,
    success: source.filter((r) => r.ok).length,
    fail: source.filter((r) => !r.ok).length,
    errorRatePct: 0,
    byLabel: {},
    byDay: {},
  };

  summary.errorRatePct =
    summary.total > 0 ? Number(((summary.fail / summary.total) * 100).toFixed(2)) : 0;

  for (const row of source) {
    const label = qualifiedOnly
      ? row.qualifiedLabel || 'unclassified_qualified'
      : row.label || 'other';

    if (!summary.byLabel[label]) {
      summary.byLabel[label] = { total: 0, success: 0, fail: 0 };
    }

    summary.byLabel[label].total += 1;
    if (row.ok) summary.byLabel[label].success += 1;
    else summary.byLabel[label].fail += 1;

    const day = String(row.t || '').slice(0, 10);
    if (!summary.byDay[day]) {
      summary.byDay[day] = { total: 0, success: 0, fail: 0 };
    }

    summary.byDay[day].total += 1;
    if (row.ok) summary.byDay[day].success += 1;
    else summary.byDay[day].fail += 1;
  }

  return summary;
}

async function recordMetaCall({ method, url, status, ok }) {
  const memoryRow = recordMetaCallMemory({ method, url, status, ok });
  const dbRow = buildMetaUsageRow({ method, url, status, ok });

  console.log(
    `[META_API] ${memoryRow.t} | ${dbRow.label} | ${dbRow.method} ${dbRow.url} | status=${dbRow.status} | ok=${dbRow.ok ? 1 : 0} | qualified=${dbRow.qualifiedMarketingCall ? 1 : 0} | qLabel=${dbRow.qualifiedLabel || 'none'}`
  );

  await persistMetaUsageRow(dbRow);
}

if (!global.__SMARTMARK_META_AXIOS_LOGGER__) {
  axios.interceptors.request.use((config) => {
    try {
      config.__smMetaStart = Date.now();
    } catch {}
    return config;
  });

  axios.interceptors.response.use(
    async (response) => {
      try {
        const url = String(response?.config?.url || '');
        if (url.includes('graph.facebook.com')) {
          await recordMetaCall({
            method: response?.config?.method || 'GET',
            url,
            status: response?.status || 200,
            ok: true,
          });
        }
      } catch {}
      return response;
    },
    async (error) => {
      try {
        const url = String(error?.config?.url || '');
        if (url.includes('graph.facebook.com')) {
          await recordMetaCall({
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

  try {
    if (process.env.FRONTEND_URL) {
      const host = new URL(process.env.FRONTEND_URL).hostname.toLowerCase();

      if (host === 'localhost') return undefined;
      if (host === 'www.smartemark.com' || host === 'smartemark.com') {
        return '.smartemark.com';
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

function makeInitialPublicSummary(overrides = {}) {
  return {
    headline: 'Monitoring campaign performance',
    subtext: 'Smartemark is preparing to learn from campaign data and improve results over time.',
    stage: 'monitoring',
    tone: 'calm',
    updatedAt: new Date().toISOString(),
    mode: 'public_marketer_summary_v1',
    ...overrides,
  };
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
  let sid =
    String(
      req.query?.sm_sid ||
      req.query?.sid ||
      req.cookies?.[COOKIE_NAME] ||
      ''
    ).trim();

  if (!isSidLike(sid)) {
    sid = `sm_${nanoid(24)}`;
  }

  setSessionCookie(res, sid);
  req.smSid = sid;

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

async function resolveFacebookTokenFromReq(req) {
  await ensureUsersAndSessions();
  await db.read();

  const candidates = [];
  const seen = new Set();

  const add = (v) => {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    candidates.push(s);
  };

  const reqOwner = ownerKeyFromReq(req);
  const sid = getSidFromReq(req);

  add(reqOwner);
  add(sid);

  const sess =
    sid
      ? (db.data.sessions || []).find((s) => String(s.sid || "").trim() === String(sid).trim())
      : null;

  if (sess?.username) add(`user:${String(sess.username).trim()}`);

  for (const key of candidates) {
    const token = getFbUserToken(key);
    if (token) {
      return { ownerKey: key, userToken: token };
    }
  }

  return { ownerKey: reqOwner || sid || "", userToken: null };
}

router.get('/facebook/defaults', async (req, res) => {
  const DEFAULTS = defaultsFor(ownerKeyFromReq(req));
  const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req);

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  await refreshDefaults(userToken, ownerKey);

  const resolvedDefaults = defaultsFor(ownerKey);

  res.json({
    ok: true,
    adAccountId: resolvedDefaults.adAccountId,
    pageId: resolvedDefaults.pageId,
    adAccounts: resolvedDefaults.adAccounts,
    pages: resolvedDefaults.pages,
  });
});

router.get('/facebook/adaccounts', async (req, res) => {
  const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req);

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  await refreshDefaults(userToken, ownerKey);
  const DEFAULTS = defaultsFor(ownerKey);

  return res.json({ data: DEFAULTS.adAccounts || [] });
});

router.get('/facebook/pages', async (req, res) => {
  const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req);

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  await refreshDefaults(userToken, ownerKey);
  const DEFAULTS = defaultsFor(ownerKey);

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

async function markManualOverride(campaignId, patch = {}) {
  const normalizedCampaignId = String(campaignId || '').trim();
  if (!normalizedCampaignId) return null;

  const manualOverride =
    typeof patch.manualOverride === 'boolean' ? patch.manualOverride : true;

  let existing = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);

  if (!existing) {
 existing = await upsertOptimizerCampaignState({
  campaignId: normalizedCampaignId,
  metaCampaignId: normalizedCampaignId,
  accountId: String(patch.accountId || '').replace(/^act_/, '').trim(),
  ownerKey: String(patch.ownerKey || '').trim(),
  pageId: String(patch.pageId || '').trim(),
  campaignName: String(patch.campaignName || '').trim(),
  niche: '',
  currentStatus: String(patch.currentStatus || '').trim() || 'ACTIVE',
  optimizationEnabled: true,
  metricsSnapshot: {},
  latestAction: null,
  latestMonitoringDecision: null,
  currentWinner: null,
  activeTestType: '',
  manualOverride,
  manualOverrideType: String(patch.manualOverrideType || '').trim(),
  manualOverrideReason: String(patch.manualOverrideReason || '').trim(),
  manualOverrideAt: manualOverride ? new Date().toISOString() : '',
  publicSummary: makeInitialPublicSummary({
    headline: manualOverride
      ? 'Manual campaign control detected'
      : 'Monitoring campaign performance',
    subtext: manualOverride
      ? 'Smartemark detected a manual update and will respect your campaign control.'
      : 'Smartemark is preparing to learn from campaign data and improve results over time.',
    stage: manualOverride ? 'manual_override' : 'monitoring',
  }),
});
    return existing;
  }

  return await updateOptimizerCampaignState(normalizedCampaignId, {
    manualOverride,
    manualOverrideType: String(patch.manualOverrideType || '').trim(),
    manualOverrideReason: String(patch.manualOverrideReason || '').trim(),
    manualOverrideAt: manualOverride ? new Date().toISOString() : '',
  });
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
};

if (aiAudience?.location) {
  const loc = String(aiAudience.location).trim();
  if (/^[A-Za-z]{2}$/.test(loc)) {
    targeting.geo_locations = { countries: [loc.toUpperCase()] };
  } else if (/united states|usa/i.test(loc)) {
    targeting.geo_locations = { countries: ['US'] };
  }
}

if (aiAudience?.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
  const [min, max] = aiAudience.ageRange.split('-').map(Number);
  targeting.age_min = min;
  targeting.age_max = max;
}

if (aiAudience?.fbInterestIds?.length) {
  targeting.flexible_spec = [
    {
      interests: aiAudience.fbInterestIds.map((id) => ({ id: String(id) })),
    },
  ];
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

    console.log('[LAUNCH][campaign create]', {
  accountId,
  campaignName,
  objective: 'OUTCOME_TRAFFIC',
  status: NO_SPEND ? 'PAUSED' : 'ACTIVE',
});
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

console.log('[LAUNCH][adset create]', {
  accountId,
  campaignId,
  pageIdFinal,
  perAdsetBudgetCents,
  startISO,
  endISO,
  targeting,
});

const { data: adsetData } = await axios.post(
  `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
  {
    name: `${campaignName} (Image) - ${new Date().toISOString()}`,
    campaign_id: campaignId,
    daily_budget: perAdsetBudgetCents,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'LINK_CLICKS',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    destination_type: 'WEBSITE',
    status: NO_SPEND ? 'PAUSED' : 'ACTIVE',
    start_time: startISO,
    ...(endISO ? { end_time: endISO } : {}),
    targeting,
  },
  { params: mkParams() }
);
    const imageAdSetId = adsetData?.id || null;

    const adIds = [];
    const usedImages = [];

    for (let i = 0; i < needImg; i++) {
      const variant = parsedVariants[i];
      const hash = await uploadImage(variant, i);

      console.log('[LAUNCH][creative create]', {
  accountId,
  campaignName,
  pageIdFinal,
  destinationUrl,
  hash,
  message: form.adCopy || adCopy || '',
  variantIndex: i + 1,
});

     const creativeMessage = String(form.adCopy || adCopy || '').trim();
const creativeTitle = String(form.headline || form.campaignName || campaignName || 'Learn More').trim();

const cr = await axios.post(
  `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
  {
    name: `${campaignName} (Image v${i + 1})`,
    object_story_spec: {
      page_id: pageIdFinal,
      link_data: {
        link: destinationUrl,
        message: creativeMessage,
        name: creativeTitle,
        image_hash: hash,
        call_to_action: {
          type: 'LEARN_MORE',
          value: {
            link: destinationUrl,
          },
        },
      },
    },
  },
  { params: mkParams() }
);

      console.log('[LAUNCH][ad create]', {
  accountId,
  adsetId: imageAdSetId,
  creativeId: cr.data.id,
  campaignName,
  variantIndex: i + 1,
});

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
  billingBlocked: false,
  metricsSnapshot: {},
  latestAction: null,
  latestMonitoringDecision: null,
  currentWinner: null,
  activeTestType: '',
publicSummary: makeInitialPublicSummary(),
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
 console.error('FB Campaign Launch Error:', {
  message: err?.message || '',
  responseData: err?.response?.data || null,
  responseStatus: err?.response?.status || null,
  stack: err?.stack || null,
});

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
  billingBlocked: false,
  metricsSnapshot: {},
  latestAction: null,
  latestMonitoringDecision: null,
  currentWinner: null,
  activeTestType: '',
  publicSummary: makeInitialPublicSummary(),
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

const requestOwnerKey = String(ownerKeyFromReq(req) || '').trim();

// No usable owner context at all
if (!requestOwnerKey) {
  return res.status(401).json({
    ok: false,
    error: 'Not authorized to read optimizer campaign state.',
  });
}

const stateOwnerKey = String(state.ownerKey || '').trim();

// If state has no owner yet, bind it to the current request owner
if (!stateOwnerKey) {
  state = await upsertOptimizerCampaignState({
    ...state,
    ownerKey: requestOwnerKey,
  });

  return res.json({
    ok: true,
    accessMode: 'owner_key',
    optimizerState: state,
  });
}

// Exact owner match
if (stateOwnerKey === requestOwnerKey) {
  return res.json({
    ok: true,
    accessMode: 'owner_key',
    optimizerState: state,
  });
}

// If state is still tied to a raw sid (sm_...) but this request resolves to a user:* owner,
// allow rebinding only when that sid belongs to the same logged-in Smartemark user.
if (stateOwnerKey.startsWith('sm_') && requestOwnerKey.startsWith('user:')) {
  await ensureUsersAndSessions();
  await db.read();

  const sidSession =
    (db.data.sessions || []).find((s) => String(s.sid || '').trim() === stateOwnerKey) || null;

  const requestUsername = requestOwnerKey.slice(5).trim();
  const sidUsername = String(sidSession?.username || '').trim();

  if (sidUsername && requestUsername && sidUsername === requestUsername) {
    state = await upsertOptimizerCampaignState({
      ...state,
      ownerKey: requestOwnerKey,
    });

    return res.json({
      ok: true,
      accessMode: 'owner_key_rebound',
      optimizerState: state,
    });
  }
}

return res.status(403).json({
  ok: false,
  error: 'You do not have access to this optimizer campaign state.',
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
  billingBlocked: false,
  publicSummary: makeInitialPublicSummary(),
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
  billingBlocked: false,
  metricsSnapshot: {},
  latestAction: null,
  latestMonitoringDecision: null,
  currentWinner: null,
  activeTestType: '',
  publicSummary: makeInitialPublicSummary(),
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

   const diagnosisPatchedState = {
  ...state,
  latestDiagnosis: diagnosis,
};

state = await updateOptimizerCampaignState(normalizedCampaignId, {
  latestDiagnosis: diagnosis,
  publicSummary: buildPublicSummary({
    optimizerState: diagnosisPatchedState,
  }),
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

   const decisionPatchedState = {
  ...state,
  latestDecision: decision,
};

state = await updateOptimizerCampaignState(normalizedCampaignId, {
  latestDecision: decision,
  publicSummary: buildPublicSummary({
    optimizerState: decisionPatchedState,
  }),
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

    const actionPatchedState = {
  ...state,
  latestAction: action,
};

state = await updateOptimizerCampaignState(normalizedCampaignId, {
  latestAction: action,
  publicSummary: buildPublicSummary({
    optimizerState: actionPatchedState,
  }),
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

   const monitoringPatchedState = {
  ...state,
  latestMonitoringDecision: monitoring,
};

state = await updateOptimizerCampaignState(normalizedCampaignId, {
  latestMonitoringDecision: monitoring,
  publicSummary: buildPublicSummary({
    optimizerState: monitoringPatchedState,
  }),
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
  billingBlocked: false,
  publicSummary: makeInitialPublicSummary(),
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
  billingBlocked: false,
  publicSummary: makeInitialPublicSummary(),
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
 const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req);
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
      params: {
        access_token: userToken,
        fields:
          'id,name,status,effective_status,configured_status,objective,buying_type,start_time,stop_time,created_time,updated_time,special_ad_categories',
      },
    });

    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      error: err.response?.data?.error?.message || 'Failed to fetch campaign details.',
      detail: err.response?.data || err.message,
    });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/delivery-debug', async (req, res) => {
  const ownerKey = ownerKeyFromReq(req);
  const userToken = getFbUserToken(ownerKey);

  const { campaignId, accountId } = req.params;
  const normalizedCampaignId = String(campaignId || '').trim();
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  try {
    const [
      campaignRes,
      insightsRes,
      adsetsRes,
      adsRes,
      accountRes,
    ] = await Promise.all([
      axios.get(`https://graph.facebook.com/v18.0/${normalizedCampaignId}`, {
        params: {
          access_token: userToken,
          fields:
            'id,name,status,effective_status,configured_status,objective,buying_type,start_time,stop_time,created_time,updated_time',
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/${normalizedCampaignId}/insights`, {
        params: {
          access_token: userToken,
          fields:
            'impressions,reach,clicks,unique_clicks,spend,cpm,cpp,ctr,actions',
          date_preset: 'maximum',
          limit: 1,
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/adsets`, {
        params: {
          access_token: userToken,
          fields:
            'id,name,campaign_id,status,effective_status,configured_status,daily_budget,lifetime_budget,billing_event,optimization_goal,bid_strategy,start_time,end_time,targeting',
          limit: 25,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'IN', value: [normalizedCampaignId] },
          ]),
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/ads`, {
        params: {
          access_token: userToken,
          fields:
            'id,name,campaign_id,adset_id,status,effective_status,configured_status,creative{id,name,object_story_spec,image_url,thumbnail_url},issues_info',
          limit: 25,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'IN', value: [normalizedCampaignId] },
          ]),
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}`, {
        params: {
          access_token: userToken,
          fields:
            'id,name,account_status,disable_reason,amount_spent,balance,spend_cap,min_campaign_group_spend_cap',
        },
      }),
    ]);

    const campaign = campaignRes.data || {};
    const insightRow = Array.isArray(insightsRes.data?.data) ? (insightsRes.data.data[0] || {}) : {};
    const adsets = Array.isArray(adsetsRes.data?.data) ? adsetsRes.data.data : [];
    const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
    const account = accountRes.data || {};

    const summary = {
      campaignActiveLike:
        ['ACTIVE', 'PAUSED'].includes(String(campaign.effective_status || campaign.status || '').toUpperCase()),
      hasSpend: Number(insightRow.spend || 0) > 0,
      hasImpressions: Number(insightRow.impressions || 0) > 0,
      adsetCount: adsets.length,
      adCount: ads.length,
      anyPausedAdset: adsets.some((a) =>
        ['PAUSED', 'ARCHIVED', 'DELETED'].includes(
          String(a.effective_status || a.status || '').toUpperCase()
        )
      ),
      anyPausedAd: ads.some((a) =>
        ['PAUSED', 'ARCHIVED', 'DELETED'].includes(
          String(a.effective_status || a.status || '').toUpperCase()
        )
      ),
      anyIssuesInfo: ads.some((a) => Array.isArray(a.issues_info) && a.issues_info.length > 0),
      accountDisabledReason: account.disable_reason || null,
      accountStatus: account.account_status || null,
    };

    res.json({
      ok: true,
      ownerKey,
      account: {
        id: account.id || normalizedAccountId,
        name: account.name || '',
        account_status: account.account_status || '',
        disable_reason: account.disable_reason || '',
        amount_spent: account.amount_spent || '0',
        balance: account.balance || '0',
        spend_cap: account.spend_cap || null,
        min_campaign_group_spend_cap: account.min_campaign_group_spend_cap || null,
      },
      campaign: {
        id: campaign.id || normalizedCampaignId,
        name: campaign.name || '',
        status: campaign.status || '',
        effective_status: campaign.effective_status || '',
        configured_status: campaign.configured_status || '',
        objective: campaign.objective || '',
        buying_type: campaign.buying_type || '',
        start_time: campaign.start_time || '',
        stop_time: campaign.stop_time || '',
        created_time: campaign.created_time || '',
        updated_time: campaign.updated_time || '',
      },
      insights: {
        impressions: Number(insightRow.impressions || 0),
        reach: Number(insightRow.reach || 0),
        clicks: Number(insightRow.clicks || 0),
        unique_clicks: Number(insightRow.unique_clicks || 0),
        spend: Number(insightRow.spend || 0),
        cpm: Number(insightRow.cpm || 0),
        cpp: Number(insightRow.cpp || 0),
        ctr: Number(insightRow.ctr || 0),
        actions: Array.isArray(insightRow.actions) ? insightRow.actions : [],
      },
      adsets: adsets.map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status || '',
        effective_status: a.effective_status || '',
        configured_status: a.configured_status || '',
        daily_budget: a.daily_budget || null,
        lifetime_budget: a.lifetime_budget || null,
        billing_event: a.billing_event || '',
        optimization_goal: a.optimization_goal || '',
        bid_strategy: a.bid_strategy || '',
        start_time: a.start_time || '',
        end_time: a.end_time || '',
        targeting: a.targeting || {},
      })),
      ads: ads.map((a) => ({
        id: a.id,
        name: a.name,
        adset_id: a.adset_id || '',
        status: a.status || '',
        effective_status: a.effective_status || '',
        configured_status: a.configured_status || '',
        creative_id: a.creative?.id || '',
        creative_name: a.creative?.name || '',
        image_url: a.creative?.image_url || a.creative?.thumbnail_url || '',
        object_story_spec: a.creative?.object_story_spec || {},
        issues_info: Array.isArray(a.issues_info) ? a.issues_info : [],
      })),
      summary,
    });
  } catch (err) {
    console.error('[delivery-debug] failed:', err?.response?.data || err?.message || err);
    return res.status(500).json({
      error: err?.response?.data?.error?.message || 'Failed to debug campaign delivery.',
      detail: err?.response?.data || err?.message,
    });
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
  const ownerKey = ownerKeyFromReq(req);
  const userToken = getFbUserToken(ownerKey);

  const { campaignId, accountId } = req.params;
  const normalizedCampaignId = String(campaignId || '').trim();
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();

  if (!userToken) {
    return res.status(401).json({ error: 'Not authenticated with Facebook' });
  }

  const fs = require('fs');
  const path = require('path');

  const generatedDir =
    process.env.GENERATED_DIR ||
    (process.env.RENDER ? '/tmp/generated' : path.join(__dirname, '../public/generated'));

  try {
    fs.mkdirSync(generatedDir, { recursive: true });
  } catch {}

  const normalizeCreativeUrl = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (/^data:image\//i.test(s)) return '';
    if (/^blob:/i.test(s)) return '';

    if (/^https?:\/\//i.test(s)) return s;

    if (s.startsWith('/api/media/')) return absolutePublicUrl(s);
    if (s.startsWith('/media/')) return absolutePublicUrl(`/api${s}`);
    if (s.startsWith('/generated/')) return absolutePublicUrl(`/api/media${s}`);
    if (!s.startsWith('/') && /\.(png|jpe?g|webp)$/i.test(s)) {
      return absolutePublicUrl(`/api/media/${s}`);
    }

    return absolutePublicUrl(s.startsWith('/') ? s : `/${s}`);
  };

  const dedupeKeepOrder = (arr, max = 20) => {
    const out = [];
    const seen = new Set();

    for (const item of Array.isArray(arr) ? arr : []) {
      const s = String(item || '').trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
      if (out.length >= max) break;
    }

    return out;
  };

  const firstNonEmpty = (...vals) => {
    for (const v of vals) {
      const s = String(v || '').trim();
      if (s) return s;
    }
    return '';
  };

  const cacheRemoteImageToLocal = async (url, tag) => {
    const abs = normalizeCreativeUrl(url);
    if (!abs) return '';

    try {
      const imgRes = await axios.get(abs, {
        responseType: 'arraybuffer',
        timeout: 15000,
        maxBodyLength: 20 * 1024 * 1024,
        maxContentLength: 20 * 1024 * 1024,
        validateStatus: (status) => status >= 200 && status < 400,
        headers: {
          Accept: 'image/*,*/*',
          'User-Agent': 'SmartMark/1.0',
        },
      });

      const ct = String(imgRes.headers?.['content-type'] || '').toLowerCase();
      let ext = 'jpg';
      if (ct.includes('png')) ext = 'png';
      else if (ct.includes('webp')) ext = 'webp';
      else if (ct.includes('jpeg') || ct.includes('jpg')) ext = 'jpg';

      const fileName = `fb-cache-${normalizedCampaignId}-${tag}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const outPath = path.join(generatedDir, fileName);

      fs.writeFileSync(outPath, Buffer.from(imgRes.data));

      const publicUrl = absolutePublicUrl(`/api/media/${fileName}`);
      console.log('[creatives] cached image locally', {
        campaignId: normalizedCampaignId,
        tag,
        sourceUrl: abs,
        publicUrl,
      });

      return publicUrl;
    } catch (err) {
      console.error('[creatives] image cache failed', {
        campaignId: normalizedCampaignId,
        tag,
        sourceUrl: abs,
        status: err?.response?.status || 0,
        error: err?.message || err,
      });
      return '';
    }
  };

  try {
    await ensureUsersAndSessions();
    await db.read();

    db.data = db.data || {};
    db.data.campaign_creatives = Array.isArray(db.data.campaign_creatives)
      ? db.data.campaign_creatives
      : [];

    const creativeList = db.data.campaign_creatives;

    const rec =
      creativeList.find((r) => {
        return (
          String(r?.campaignId || '').trim() === normalizedCampaignId &&
          String(r?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
        );
      }) || null;

    const safeMetaFromRecord = {
      headline: String(rec?.meta?.headline || '').trim(),
      body: String(rec?.meta?.body || '').trim(),
      link: String(rec?.meta?.link || '').trim(),
    };

    const adsRes = await axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/ads`, {
      params: {
        access_token: userToken,
        fields: [
          'id',
          'name',
          'campaign_id',
          'creative{id,name,image_url,thumbnail_url,object_story_spec,effective_object_story_id}'
        ].join(','),
        limit: 25,
        filtering: JSON.stringify([
          { field: 'campaign.id', operator: 'IN', value: [normalizedCampaignId] },
        ]),
      },
    });

    const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
    console.log('[creatives] ads fetched', {
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      adCount: ads.length,
    });

    let recoveredHeadline = safeMetaFromRecord.headline;
    let recoveredBody = safeMetaFromRecord.body;
    let recoveredLink = safeMetaFromRecord.link;

    const perAdLocalImages = [];

    for (let i = 0; i < ads.length; i += 1) {
      const ad = ads[i] || {};
      const creative = ad?.creative || {};
      const oss = creative?.object_story_spec || {};
      const linkData = oss?.link_data || {};
      const photoData = oss?.photo_data || {};
      const videoData = oss?.video_data || {};

      if (!recoveredHeadline) {
        recoveredHeadline = firstNonEmpty(
          linkData?.name,
          photoData?.title,
          videoData?.title,
          linkData?.caption
        );
      }

      if (!recoveredBody) {
        recoveredBody = firstNonEmpty(
          linkData?.message,
          photoData?.message,
          videoData?.message
        );
      }

      if (!recoveredLink) {
        recoveredLink = firstNonEmpty(
          linkData?.link,
          photoData?.link,
          videoData?.call_to_action?.value?.link
        );
      }

      const adCandidates = dedupeKeepOrder([
        linkData?.image_url,
        photoData?.image_url,
        videoData?.image_url,
        creative?.image_url,
        creative?.thumbnail_url,
      ], 8);

      console.log('[creatives] ad candidates', {
        campaignId: normalizedCampaignId,
        adId: String(ad?.id || ''),
        adName: String(ad?.name || ''),
        candidates: adCandidates,
      });

      let localHit = '';
      for (let j = 0; j < adCandidates.length; j += 1) {
        localHit = await cacheRemoteImageToLocal(adCandidates[j], `ad${i + 1}-cand${j + 1}`);
        if (localHit) break;
      }

      if (localHit) perAdLocalImages.push(localHit);
      if (perAdLocalImages.length >= 2) break;
    }

    const storedImagesRaw = dedupeKeepOrder(rec?.images || [], 4);
    const storedLocalImages = [];

    for (let i = 0; i < storedImagesRaw.length; i += 1) {
      const img = normalizeCreativeUrl(storedImagesRaw[i]);
      if (!img) continue;

      if (/\/api\/media\//i.test(img) && !storedLocalImages.includes(img)) {
        storedLocalImages.push(img);
      }
    }

    const finalImages = dedupeKeepOrder(
      [...perAdLocalImages, ...storedLocalImages],
      2
    );

    console.log('[creatives] final images selected', {
      campaignId: normalizedCampaignId,
      perAdLocalImages,
      storedLocalImages,
      finalImages,
    });

       if (!recoveredHeadline) {
      recoveredHeadline = safeMetaFromRecord.headline || '';
    }

    if (!recoveredHeadline && recoveredBody) {
      recoveredHeadline = String(recoveredBody).split('\n')[0].trim().slice(0, 90);
    }

    if (!finalImages.length) {
      return res.status(404).json({
        error: 'No live creative images found for this campaign.',
      });
    }

    const nowIso = new Date().toISOString();

    const nextRecord = {
      ownerKey: String(rec?.ownerKey || ownerKey || '').trim(),
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      pageId: String(rec?.pageId || '').trim(),
      name: String(rec?.name || '').trim(),
      status: String(rec?.status || 'ACTIVE').trim(),
      mediaSelection: 'image',
      images: finalImages,
      videos: [],
      fbVideoIds: [],
      meta: {
        headline: recoveredHeadline,
        body: recoveredBody,
        link: recoveredLink,
      },
      updatedAt: nowIso,
      createdAt: rec?.createdAt || nowIso,
    };

    const idx = creativeList.findIndex((r) => {
      return (
        String(r?.campaignId || '').trim() === normalizedCampaignId &&
        String(r?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
      );
    });

    if (idx >= 0) {
      creativeList[idx] = {
        ...creativeList[idx],
        ...nextRecord,
      };
    } else {
      creativeList.push(nextRecord);
    }

    db.data.campaign_creatives = creativeList;
    await db.write();

    return res.json({
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      pageId: nextRecord.pageId,
      name: nextRecord.name,
      status: nextRecord.status,
      mediaSelection: 'image',
      images: finalImages,
      videos: [],
      fbVideoIds: [],
      meta: nextRecord.meta,
      updatedAt: nextRecord.updatedAt,
      createdAt: nextRecord.createdAt,
      source: 'facebook_cached_locally',
    });
  } catch (e) {
    console.error('[creatives] failed to load/recover campaign creatives:', e?.response?.data || e?.message || e);
    return res.status(500).json({ error: e?.message || 'Failed to load creatives.' });
  }
});
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/pause', async (req, res) => {
  try {
    const { campaignId } = req.params;
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
          error: 'owner_key is required for debug pause route.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          error: 'Not authenticated with Facebook',
          ownerKey,
        });
      }
    } else {
      ownerKey = ownerKeyFromReq(req);
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({ error: 'Not authenticated with Facebook' });
      }
    }

    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'PAUSED' },
      { params: { access_token: userToken } }
    );

      try {
      await markManualOverride(campaignId, {
        manualOverride: true,
        manualOverrideType: 'paused_by_user',
        manualOverrideReason: 'User manually paused campaign.',
        accountId: String(req.params.accountId || '').replace(/^act_/, '').trim(),
        ownerKey: String(ownerKey || '').trim(),
        currentStatus: 'PAUSED',
      });

      await updateOptimizerCampaignState(campaignId, {
        currentStatus: 'PAUSED',
        ownerKey: String(ownerKey || '').trim(),
      });
    } catch (e) {
      console.warn('[manual override] failed to mark pause override', e?.message || e);
    }

    res.json({
      success: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      ownerKey,
      message: `Campaign ${campaignId} paused.`,
    });
  } catch (err) {
    res.status(500).json({
      error: err.response?.data?.error?.message || 'Failed to pause campaign.',
    });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/unpause', async (req, res) => {
  try {
    const { campaignId } = req.params;
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
          error: 'owner_key is required for debug unpause route.',
        });
      }

      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({
          error: 'Not authenticated with Facebook',
          ownerKey,
        });
      }
    } else {
      ownerKey = ownerKeyFromReq(req);
      userToken = getFbUserToken(ownerKey);

      if (!userToken) {
        return res.status(401).json({ error: 'Not authenticated with Facebook' });
      }
    }

    await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ACTIVE' },
      { params: { access_token: userToken } }
    );

     try {
      await markManualOverride(campaignId, {
        manualOverride: false,
        manualOverrideType: '',
        manualOverrideReason: '',
        accountId: String(req.params.accountId || '').replace(/^act_/, '').trim(),
        ownerKey: String(ownerKey || '').trim(),
        currentStatus: 'ACTIVE',
      });

      await updateOptimizerCampaignState(campaignId, {
        currentStatus: 'ACTIVE',
        ownerKey: String(ownerKey || '').trim(),
      });
    } catch (e) {
      console.warn('[manual override] failed to clear override on unpause', e?.message || e);
    }

    res.json({
      success: true,
      accessMode: usingDebugKey ? 'debug_key' : 'session',
      ownerKey,
      message: `Campaign ${campaignId} unpaused.`,
    });
  } catch (err) {
    res.status(500).json({
      error: err.response?.data?.error?.message || 'Failed to unpause campaign.',
    });
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

router.get('/facebook/debug/meta-call-stats', async (req, res) => {
  try {
    await db.read();

    const rollingStore = ensureMetaUsageStore();
    const allTimeStore = ensureMetaUsageAllTimeStore();

    const now = Date.now();
    const last15dCutoff = now - 15 * 24 * 60 * 60 * 1000;

    const rows15d = rollingStore.filter((r) => {
      const t = new Date(r.t || 0).getTime();
      return Number.isFinite(t) && t >= last15dCutoff;
    });

    const summaryAll15d = summarizeMetaRows(rows15d, { qualifiedOnly: false });
    const summaryQualified15d = summarizeMetaRows(rows15d, { qualifiedOnly: true });

    const summaryAllTimeAll = summarizeMetaRows(allTimeStore, { qualifiedOnly: false });
    const summaryAllTimeQualified = summarizeMetaRows(allTimeStore, { qualifiedOnly: true });

    const qualifiedSuccess = summaryQualified15d.success;
    const qualifiedFail = summaryQualified15d.fail;
    const qualifiedTotal = summaryQualified15d.total;
    const qualifiedErrorRatePct = summaryQualified15d.errorRatePct;

    return res.json({
      ok: true,

      inMemory: META_CALL_STATS,

      rolling15d: {
        allGraphCalls: summaryAll15d,
        qualifiedMarketingCalls: summaryQualified15d,
      },

      allTime: {
        allGraphCalls: summaryAllTimeAll,
        qualifiedMarketingCalls: summaryAllTimeQualified,
      },

      standardAccessReadiness: {
        requirementSuccessfulCalls: 1500,
        currentSuccessfulQualifiedCalls: qualifiedSuccess,
        currentFailedQualifiedCalls: qualifiedFail,
        currentQualifiedTotalCalls: qualifiedTotal,
        currentQualifiedErrorRatePct: qualifiedErrorRatePct,

        meetsCallThreshold: qualifiedSuccess >= 1500,
        meetsErrorRateThreshold: qualifiedTotal > 0 ? qualifiedErrorRatePct < 10 : false,
        likelyReady:
          qualifiedSuccess >= 1500 &&
          qualifiedTotal > 0 &&
          qualifiedErrorRatePct < 10,
      },

      recentQualifiedCalls: rows15d
        .filter((r) => r.qualifiedMarketingCall)
        .slice(-100),

      recentAllTimeQualifiedCalls: allTimeStore
        .filter((r) => r.qualifiedMarketingCall)
        .slice(-100),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to read Meta API usage stats.',
    });
  }
});

router.get('/facebook/debug/meta-call-stats-all-time', async (req, res) => {
  try {
    await db.read();
    const allTimeStore = ensureMetaUsageAllTimeStore();

    return res.json({
      ok: true,
      totalRows: allTimeStore.length,
      qualifiedRows: allTimeStore.filter((r) => r.qualifiedMarketingCall).length,
      summary: {
        allGraphCalls: summarizeMetaRows(allTimeStore, { qualifiedOnly: false }),
        qualifiedMarketingCalls: summarizeMetaRows(allTimeStore, { qualifiedOnly: true }),
      },
      recentRows: allTimeStore.slice(-200),
      recentQualifiedRows: allTimeStore.filter((r) => r.qualifiedMarketingCall).slice(-200),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'Failed to read all-time Meta API usage stats.',
    });
  }
});

/* ------------------------------------------------------------------ */
/*     Legit autonomous marketer runner: real work + rate safety      */
/* ------------------------------------------------------------------ */

const AUTORUN_STATE = (global.__SMARTEMARK_AUTORUN_STATE__ =
  global.__SMARTEMARK_AUTORUN_STATE__ || {
    startedAt: null,
    lastStartedLoopAt: null,
    lastFinishedLoopAt: null,
    lastLoopSummary: null,
    loops: 0,
    isRunning: false,
  });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function getEnvNumber(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

function parseUsageHeaderPercent(v) {
  try {
    if (!v) return 0;
    if (typeof v === 'number') return v;
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    const pct = Number(
      parsed?.call_count ??
      parsed?.acc_id_util_pct ??
      parsed?.total_cputime ??
      parsed?.total_time ??
      0
    );
    return Number.isFinite(pct) ? pct : 0;
  } catch {
    return 0;
  }
}

async function getMetaRateSnapshot(userToken, accountId) {
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
  if (!userToken || !normalizedAccountId) {
    return {
      ok: false,
      accountId: normalizedAccountId,
      estimatedPercent: 0,
      headers: {},
    };
  }

  try {
    const resp = await axios.get(
      `https://graph.facebook.com/v18.0/act_${normalizedAccountId}/campaigns`,
      {
        params: {
          access_token: userToken,
          fields: 'id',
          limit: 1,
        },
      }
    );

    const usageHeaders = {
      accountUsage: resp?.headers?.['x-ad-account-usage'] || null,
      appUsage: resp?.headers?.['x-app-usage'] || null,
      businessUseCaseUsage: resp?.headers?.['x-business-use-case-usage'] || null,
    };

    const estimatedPercent = Math.max(
      parseUsageHeaderPercent(usageHeaders.accountUsage),
      parseUsageHeaderPercent(usageHeaders.appUsage)
    );

    return {
      ok: true,
      accountId: normalizedAccountId,
      estimatedPercent,
      headers: usageHeaders,
    };
  } catch (err) {
    return {
      ok: false,
      accountId: normalizedAccountId,
      estimatedPercent: 0,
      headers: {},
      error: err?.response?.data || err?.message || 'rate snapshot failed',
    };
  }
}

async function bootstrapOptimizerStatesFromMeta({ ownerKey, accountId, userToken }) {
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
  if (!ownerKey || !normalizedAccountId || !userToken) return { bootstrapped: 0 };

  const campaignsRes = await axios.get(
    `https://graph.facebook.com/v18.0/act_${normalizedAccountId}/campaigns`,
    {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,configured_status,objective,start_time',
        limit: 50,
      },
    }
  );

  const liveCampaigns = Array.isArray(campaignsRes.data?.data)
    ? campaignsRes.data.data
    : [];

  let bootstrapped = 0;

  for (const campaign of liveCampaigns) {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) continue;

    await upsertOptimizerCampaignState({
      campaignId,
      metaCampaignId: campaignId,
      accountId: normalizedAccountId,
      ownerKey,
      pageId: '',
      campaignName: String(campaign?.name || '').trim(),
      niche: '',
      currentStatus: String(
        campaign?.effective_status || campaign?.status || 'ACTIVE'
      ).trim(),
      optimizationEnabled: true,
      billingBlocked: false,
      publicSummary: makeInitialPublicSummary(),
    });

    bootstrapped += 1;
  }

  return { bootstrapped };
}

async function runQualifiedMonitoringSweep({ ownerKey, accountId, userToken, maxCampaigns = 2 }) {
  const normalizedAccountId = String(accountId || '').replace(/^act_/, '').trim();
  const out = {
    accountId: normalizedAccountId,
    ownerKey,
    campaignsSeen: 0,
    campaignsProcessed: 0,
    details: [],
  };

  if (!ownerKey || !normalizedAccountId || !userToken) return out;

  const campaignsRes = await axios.get(
    `https://graph.facebook.com/v18.0/act_${normalizedAccountId}/campaigns`,
    {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,objective,start_time',
        limit: Math.max(1, maxCampaigns),
      },
    }
  );

  const campaigns = Array.isArray(campaignsRes.data?.data) ? campaignsRes.data.data : [];
  out.campaignsSeen = campaigns.length;

  for (const campaign of campaigns) {
    const campaignId = String(campaign?.id || '').trim();
    if (!campaignId) continue;

    const effectiveStatus = String(
      campaign?.effective_status || campaign?.status || 'ACTIVE'
    ).toUpperCase();

    await upsertOptimizerCampaignState({
      campaignId,
      metaCampaignId: campaignId,
      accountId: normalizedAccountId,
      ownerKey,
      pageId: '',
      campaignName: String(campaign?.name || '').trim(),
      niche: '',
      currentStatus: effectiveStatus,
      optimizationEnabled: true,
      billingBlocked: false,
      publicSummary: makeInitialPublicSummary(),
    });

    if (['PAUSED', 'ARCHIVED', 'DELETED'].includes(effectiveStatus)) {
      out.details.push({
        campaignId,
        skipped: true,
        reason: 'inactive_status',
        status: effectiveStatus,
      });
      continue;
    }

    // Legit monitoring reads: campaign details + insights + adsets + ads
    const [campaignDetailRes, insightsRes, adsetsRes, adsRes] = await Promise.allSettled([
      axios.get(`https://graph.facebook.com/v18.0/${campaignId}`, {
        params: {
          access_token: userToken,
          fields: 'id,name,status,effective_status,objective,start_time',
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/${campaignId}/insights`, {
        params: {
          access_token: userToken,
          fields: 'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks',
          date_preset: 'today',
          limit: 1,
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/adsets`, {
        params: {
          access_token: userToken,
          fields: 'id,name,status,effective_status,campaign_id,daily_budget,bid_strategy',
          limit: 25,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'IN', value: [campaignId] },
          ]),
        },
      }),
      axios.get(`https://graph.facebook.com/v18.0/act_${normalizedAccountId}/ads`, {
        params: {
          access_token: userToken,
          fields: 'id,name,status,effective_status,campaign_id,adset_id',
          limit: 25,
          filtering: JSON.stringify([
            { field: 'campaign.id', operator: 'IN', value: [campaignId] },
          ]),
        },
      }),
    ]);

    let state = await findOptimizerCampaignStateByCampaignId(campaignId);

    const rawInsight = Array.isArray(insightsRes?.value?.data?.data)
      ? insightsRes.value.data.data[0] || {}
      : {};

    const metricsSnapshot = {
      impressions: Number(rawInsight?.impressions || 0),
      clicks: Number(rawInsight?.clicks || 0),
      spend: Number(rawInsight?.spend || 0),
      ctr: Number(rawInsight?.ctr || 0),
      reach: Number(rawInsight?.reach || 0),
      uniqueClicks: Number(rawInsight?.unique_clicks || 0),
      syncedAt: new Date().toISOString(),
    };

    state = await updateOptimizerCampaignState(campaignId, {
      ownerKey,
      campaignName:
        String(campaignDetailRes?.value?.data?.name || campaign?.name || '').trim(),
      currentStatus: String(
        campaignDetailRes?.value?.data?.effective_status || effectiveStatus
      ).trim(),
      metricsSnapshot,
    });

    const creativesRecord = await (async () => {
      await ensureUsersAndSessions();
      await db.read();
      db.data.campaign_creatives = db.data.campaign_creatives || [];
      return (
        db.data.campaign_creatives.find((row) => {
          return (
            String(row?.campaignId || '').trim() === campaignId &&
            String(row?.accountId || '').replace(/^act_/, '').trim() === normalizedAccountId
          );
        }) || null
      );
    })();

    const diagnosis = buildDiagnosis({
      optimizerState: state,
      creativesRecord,
    });

    state = await updateOptimizerCampaignState(campaignId, {
      latestDiagnosis: diagnosis,
      publicSummary: buildPublicSummary({
        optimizerState: { ...state, latestDiagnosis: diagnosis },
      }),
    });

    const decision = buildDecision({
      optimizerState: state,
    });

    state = await updateOptimizerCampaignState(campaignId, {
      latestDecision: decision,
      publicSummary: buildPublicSummary({
        optimizerState: { ...state, latestDecision: decision },
      }),
    });

    const monitoring = buildMonitoring({
      optimizerState: state,
    });

    state = await updateOptimizerCampaignState(campaignId, {
      latestMonitoringDecision: monitoring,
      publicSummary: buildPublicSummary({
        optimizerState: { ...state, latestMonitoringDecision: monitoring },
      }),
      lastAutoSweepAt: new Date().toISOString(),
    });

    out.campaignsProcessed += 1;
    out.details.push({
      campaignId,
      status: effectiveStatus,
      metricsSnapshot,
      adsetsFetched:
        adsetsRes.status === 'fulfilled'
          ? Array.isArray(adsetsRes.value?.data?.data)
            ? adsetsRes.value.data.data.length
            : 0
          : 0,
      adsFetched:
        adsRes.status === 'fulfilled'
          ? Array.isArray(adsRes.value?.data?.data)
            ? adsRes.value.data.data.length
            : 0
          : 0,
    });
  }

  return out;
}

async function runContinuousAutonomousMarketerLoop() {
  if (AUTORUN_STATE.isRunning) {
    return { ok: true, skipped: true, reason: 'already_running' };
  }

  AUTORUN_STATE.isRunning = true;
  AUTORUN_STATE.startedAt = AUTORUN_STATE.startedAt || new Date().toISOString();

  try {
    while (true) {
      AUTORUN_STATE.loops += 1;
      AUTORUN_STATE.lastStartedLoopAt = new Date().toISOString();

      const ownerKey = String(process.env.OPTIMIZER_AUTORUN_OWNER_KEY || '').trim();
      const accountId = String(process.env.OPTIMIZER_AUTORUN_ACCOUNT_ID || '')
        .replace(/^act_/, '')
        .trim();
      const userToken = ownerKey ? getFbUserToken(ownerKey) : null;

      const hardSleepMs = getEnvNumber('OPTIMIZER_AUTORUN_SLEEP_MS', 15 * 60 * 1000);
      const minSleepMs = getEnvNumber('OPTIMIZER_AUTORUN_MIN_SLEEP_MS', 8 * 60 * 1000);
      const maxCampaignsPerSweep = clamp(
        getEnvNumber('OPTIMIZER_AUTORUN_MAX_CAMPAIGNS', 2),
        1,
        5
      );

      if (!ownerKey || !accountId || !userToken) {
        AUTORUN_STATE.lastLoopSummary = {
          ok: false,
          reason: 'missing_owner_account_or_token',
          ownerKey,
          accountId,
          at: new Date().toISOString(),
        };
        AUTORUN_STATE.lastFinishedLoopAt = new Date().toISOString();
        await sleep(minSleepMs);
        continue;
      }

      await ensureUsersAndSessions();
      await db.read();

      let states = await getAllOptimizerCampaignStates();
      if (!Array.isArray(states) || states.length === 0) {
        await bootstrapOptimizerStatesFromMeta({ ownerKey, accountId, userToken });
        states = await getAllOptimizerCampaignStates();
      }

      const rate = await getMetaRateSnapshot(userToken, accountId);
      const usagePct = Number(rate?.estimatedPercent || 0);

      let loopSleepMs = hardSleepMs;
      if (usagePct >= 80) loopSleepMs = 60 * 60 * 1000;
      else if (usagePct >= 60) loopSleepMs = 30 * 60 * 1000;
      else if (usagePct >= 40) loopSleepMs = 20 * 60 * 1000;
      else if (usagePct >= 20) loopSleepMs = 12 * 60 * 1000;

      const qualifiedSweep = await runQualifiedMonitoringSweep({
        ownerKey,
        accountId,
        userToken,
        maxCampaigns: maxCampaignsPerSweep,
      });

      const scheduledPassResult = await runInternalScheduledPass({
        minHoursBetweenRuns: 1,
        limit: maxCampaignsPerSweep,
      });

      AUTORUN_STATE.lastLoopSummary = {
        ok: true,
        at: new Date().toISOString(),
        ownerKey,
        accountId,
        usagePct,
        nextSleepMs: loopSleepMs,
        qualifiedSweep,
        scheduledPassResult,
      };

      console.log('[autonomous marketer loop] completed', AUTORUN_STATE.lastLoopSummary);

      AUTORUN_STATE.lastFinishedLoopAt = new Date().toISOString();
      await sleep(loopSleepMs);
    }
  } catch (err) {
    AUTORUN_STATE.lastLoopSummary = {
      ok: false,
      at: new Date().toISOString(),
      error: err?.response?.data || err?.message || 'autonomous loop failed',
    };

    console.error('[autonomous marketer loop] failed', AUTORUN_STATE.lastLoopSummary);
    AUTORUN_STATE.lastFinishedLoopAt = new Date().toISOString();

    await sleep(10 * 60 * 1000);
    AUTORUN_STATE.isRunning = false;
    return runContinuousAutonomousMarketerLoop();
  }
}

router.get('/facebook/debug/autorun-status', async (req, res) => {
  return res.json({
    ok: true,
    autorun: AUTORUN_STATE,
  });
});

if (!global.__SMARTEMARK_OPTIMIZER_AUTORUN_STARTED__) {
  try {
    startOptimizerAutoRunner({
      runScheduledPass: async ({ minHoursBetweenRuns, limit }) => {
        await ensureUsersAndSessions();
        await db.read();

        const ownerKey = String(process.env.OPTIMIZER_AUTORUN_OWNER_KEY || '').trim();
        const accountId = String(process.env.OPTIMIZER_AUTORUN_ACCOUNT_ID || '')
          .replace(/^act_/, '')
          .trim();
        const userToken = ownerKey ? getFbUserToken(ownerKey) : null;

        let existingStates = await getAllOptimizerCampaignStates();

        if (!existingStates.length && ownerKey && accountId && userToken) {
          await bootstrapOptimizerStatesFromMeta({ ownerKey, accountId, userToken });
          existingStates = await getAllOptimizerCampaignStates();
        }

        return await runInternalScheduledPass({
          minHoursBetweenRuns,
          limit,
        });
      },
    });

    runContinuousAutonomousMarketerLoop().catch((err) => {
      console.error('[autonomous marketer loop] startup error', {
        message: err?.message || 'unknown error',
        stack: err?.stack || null,
      });
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