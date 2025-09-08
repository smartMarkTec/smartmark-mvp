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

/* ------------------------------- Defaults ------------------------------- */
const DEFAULTS = { adAccountId: null, pageId: null, adAccounts: [], pages: [] };

async function refreshDefaults(userToken) {
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

    DEFAULTS.adAccounts = accts.map(a => ({ id: String(a.id).replace(/^act_/, ''), name: a.name, account_status: a.account_status }));
    DEFAULTS.pages = pages.map(p => ({ id: p.id, name: p.name }));

    const firstAcct = DEFAULTS.adAccounts[0]?.id || null;
    const firstPage = DEFAULTS.pages[0]?.id || null;
    if (!DEFAULTS.adAccountId || !DEFAULTS.adAccounts.find(a => a.id === DEFAULTS.adAccountId)) DEFAULTS.adAccountId = firstAcct;
    if (!DEFAULTS.pageId || !DEFAULTS.pages.find(p => p.id === DEFAULTS.pageId)) DEFAULTS.pageId = firstPage;
  } catch { /* noop */ }
}

/* ------------------------------- ENV ------------------------------- */
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const COOKIE_NAME = 'sm_sid';
const isProd = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

/* Helper to set session cookie consistently */
function setSessionCookie(res, sid) {
  const opts = {
    httpOnly: true,
    secure: isProd,                // required for SameSite=None
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
  if (process.env.COOKIE_DOMAIN) {
    // e.g. COOKIE_DOMAIN=smartmark-mvp.onrender.com
    opts.domain = process.env.COOKIE_DOMAIN;
  }
  res.cookie(COOKIE_NAME, sid, opts);
}

/* ----------------------------- Sanity route ----------------------------- */
router.get('/facebook/ping', (_req, res) => {
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

/* Public URL helper (for asset fetches) */
function absolutePublicUrl(relativePath) {
  const base = process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || 'https://smartmark-mvp.onrender.com';
  if (!relativePath) return '';
  return /^https?:\/\//i.test(relativePath) ? relativePath : `${base}${relativePath}`;
}

/* ------------------------------ Facebook OAuth ------------------------------ */
const FB_SCOPES = [
  'pages_manage_engagement','pages_manage_metadata','pages_manage_posts','pages_read_engagement',
  'pages_read_user_content','pages_show_list','public_profile','read_insights',
  'business_management','ads_management','ads_read'
];

router.get('/facebook', (_req, res) => {
  const state = 'smartmark_state_1';
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
  try {
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: { client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET, redirect_uri: FACEBOOK_REDIRECT_URI, code }
    });
    const accessToken = tokenRes.data.access_token;

    try {
      const x = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: { grant_type: 'fb_exchange_token', client_id: FACEBOOK_APP_ID, client_secret: FACEBOOK_APP_SECRET, fb_exchange_token: accessToken }
      });
      if (x.data?.access_token) {
        await setFbUserToken(x.data.access_token);
        await refreshDefaults(x.data.access_token);
        console.log('[auth] stored LONG-LIVED FB user token + refreshed defaults');
      } else {
        await setFbUserToken(accessToken);
        await refreshDefaults(accessToken);
        console.log('[auth] stored SHORT-LIVED FB user token + refreshed defaults');
      }
    } catch {
      await setFbUserToken(accessToken);
      await refreshDefaults(accessToken);
      console.warn('[auth] long-lived exchange failed, stored short-lived token; defaults refreshed');
    }

    res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
});

router.get('/debug/fbtoken', (_req, res) => {
  res.json({ fbUserToken: getFbUserToken() ? 'present' : 'missing' });
});

/* ---------------------------- Defaults helper ---------------------------- */
router.get('/facebook/defaults', async (_req, res) => {
  const userToken = getFbUserToken();
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  await refreshDefaults(userToken);
  res.json({ ok: true, adAccountId: DEFAULTS.adAccountId, pageId: DEFAULTS.pageId, adAccounts: DEFAULTS.adAccounts, pages: DEFAULTS.pages });
});

router.post('/facebook/defaults/select', (req, res) => {
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

/* ---------------------------- Auth: register/login ---------------------------- */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) return res.status(400).json({ error: 'Username, email, and password required' });

    await ensureUsersAndSessions();
    if (db.data.users.find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // use sync to avoid any async worker/thread delays on small hosts
    const passwordHash = bcrypt.hashSync(password, 10);
    const user = { username, email, passwordHash };
    db.data.users.push(user);
    await db.write();

    const sid = `sm_${nanoid(24)}`;
    db.data.sessions.push({ sid, username: user.username });
    await db.write();

    setSessionCookie(res, sid);
    res.json({ success: true, user: { username, email } });
  } catch (err) {
    res.status(500).json({ error: 'Registration failed', detail: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

    await ensureUsersAndSessions();
    const user = db.data.users.find(u => u.username === username);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    const match = bcrypt.compareSync(password, user.passwordHash);
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
    res.clearCookie(COOKIE_NAME, { path: '/', secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Logout failed', detail: err.message });
  }
});

/* ---------------------------- Debug cookies (optional) ---------------------------- */
router.get('/debug/cookies', (req, res) => {
  res.json({
    headerCookie: req.headers.cookie || null,
    parsed: req.cookies || null
  });
});

/* ---------------------------- Launch campaign (unchanged core) ---------------------------- */
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = getFbUserToken();
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  const NO_SPEND = process.env.NO_SPEND === '1' || req.query.no_spend === '1' || !!req.body.noSpend;
  const VALIDATE_ONLY = req.query.validate_only === '1' || !!req.body.validateOnly;
  const mkParams = () => {
    const p = { access_token: userToken };
    if (VALIDATE_ONLY) p.execution_options = ['validate_only'];
    return p;
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function fetchImageAsBase64(url) {
    if (!url) throw new Error('No image URL');
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(url);
    if (m) return m[1];
    const abs = absolutePublicUrl(url);
    const tries = [0, 400, 900];
    let lastErr;
    for (const d of tries) {
      try {
        if (d) await sleep(d);
        const imgRes = await axios.get(abs, { responseType: 'arraybuffer', timeout: 15000, headers: { 'Accept': 'image/*' } });
        const ct = String(imgRes.headers?.['content-type'] || '').toLowerCase();
        if (!ct.includes('image')) throw new Error(`Non-image content-type: ${ct || 'unknown'}`);
        return Buffer.from(imgRes.data).toString('base64');
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Image download failed');
  }

  async function uploadImage(imageUrl) {
    try {
      let base64;
      try { base64 = await fetchImageAsBase64(imageUrl); }
      catch { base64 = await fetchImageAsBase64('/__fallback/1200.jpg'); }
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
    } catch (e) {
      if (VALIDATE_ONLY) return 'VALIDATION_ONLY_HASH';
      throw e;
    }
  }

  async function ensureVideoIdByIndex(idx, videoVariants, fbVideoIds) {
    const existingId = fbVideoIds[idx];
    if (existingId) return existingId;
    const vUrl = videoVariants[idx];
    if (!vUrl) throw new Error('No video URL provided for this index');
    const FormData = require('form-data');
    const formd = new FormData();
    formd.append('file_url', absolutePublicUrl(vUrl));
    formd.append('name', 'SmartMark Generated Video');
    formd.append('description', 'Generated by SmartMark');
    const up = await axios.post(
      `https://graph.facebook.com/v23.0/act_${accountId}/advideos`,
      formd,
      { headers: formd.getHeaders(), params: mkParams() }
    );
    return up?.data?.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_VIDEO_${Date.now()}` : null);
  }

  async function resolvePageId(explicitPageId) {
    if (explicitPageId) return String(explicitPageId);
    if (DEFAULTS.pageId) return String(DEFAULTS.pageId);
    try {
      const pagesRes = await axios.get('https://graph.facebook.com/v18.0/me/accounts', { params: { access_token: userToken, fields: 'id,name' } });
      const first = pagesRes.data?.data?.[0]?.id || null;
      if (first) { DEFAULTS.pageId = String(first); return String(first); }
    } catch {}
    return null;
  }

  try {
    const {
      form = {}, budget, adCopy, pageId,
      aiAudience: aiAudienceRaw, mediaSelection = 'both',
      imageVariants = [], videoVariants = [], fbVideoIds = [],
      videoThumbnailUrl = null, flightStart = null, flightEnd = null, flightHours = null,
      overrideCountPerType = null
    } = req.body;

    const pageIdFinal = await resolvePageId(pageId);
    if (!pageIdFinal) return res.status(400).json({ error: 'No Facebook Page available on this account. Connect a Page and try again.' });

    const campaignName = form.campaignName || form.businessName || 'SmartMark Campaign';

    let aiAudience = null;
    try { aiAudience = typeof aiAudienceRaw === 'string' ? JSON.parse(aiAudienceRaw) : (aiAudienceRaw && typeof aiAudienceRaw === 'object' ? aiAudienceRaw : null); }
    catch { aiAudience = null; }

    const ms = String(mediaSelection || 'both').toLowerCase();
    const wantImage = ms === 'image' || ms === 'both';
    const wantVideo = ms === 'video' || ms === 'both';

    let targeting = { geo_locations: { countries: ['US'] }, age_min: 18, age_max: 65, targeting_automation: { advantage_audience: 0 } };
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
      const existing = await axios.get(`https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
        { params: { access_token: userToken, fields: 'id,name,effective_status', limit: 50 } });
      const activeCount = (existing.data?.data || []).filter(
        c => !['ARCHIVED', 'DELETED'].includes((c.effective_status || '').toUpperCase())
      ).length;
      if (activeCount >= 2) return res.status(400).json({ error: 'Limit reached: maximum of 2 active campaigns per user.' });
    }

    const dailyBudget = Number(budget) || 0;
    const hours = (() => {
      if (flightEnd && flightStart) return Math.max(0, (new Date(flightEnd) - new Date(flightStart)) / 36e5);
      if (flightHours) return Number(flightHours) || 0;
      return 0;
    })();
    const plan = policy.decideVariantPlan({ assetTypes: ms, dailyBudget, flightHours: hours, overrideCountPerType });
    const needImg = wantImage ? plan.images : 0;
    const needVid = wantVideo ? plan.videos : 0;

    if (wantImage && imageVariants.length < needImg) return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    const providedVideoCount = Math.max(videoVariants.length, fbVideoIds.length);
    if (wantVideo && providedVideoCount < needVid) return res.status(400).json({ error: `Need ${needVid} video(s) but received ${providedVideoCount}.` });

    const now = new Date();
    let startISO = flightStart ? new Date(flightStart).toISOString()
      : (NO_SPEND ? new Date(now.getTime() + 7*24*60*60*1000).toISOString() : new Date(now.getTime() + 60*1000).toISOString());
    let endISO = flightEnd ? new Date(flightEnd).toISOString() : null;
    if (endISO) {
      const maxEnd = new Date(new Date(startISO).getTime() + 14*24*60*60*1000);
      if (new Date(endISO) > maxEnd) endISO = maxEnd.toISOString();
      if (new Date(endISO) <= new Date(startISO)) endISO = new Date(new Date(startISO).getTime() + 24*60*60*1000).toISOString();
    }

    const campaignRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      { name: campaignName, objective: 'OUTCOME_TRAFFIC', status: NO_SPEND ? 'PAUSED' : 'ACTIVE', special_ad_categories: [] },
      { params: mkParams() }
    );
    const campaignId = campaignRes.data?.id || 'VALIDATION_ONLY';

    const typesUsed = (wantImage ? 1 : 0) + (wantVideo ? 1 : 0);
    const perAdsetBudgetCents = Math.max(100, Math.round((Number(budget) || 0) * 100 / Math.max(1, typesUsed)));

    let imageAdSetId = null, videoAdSetId = null;
    if (wantImage) {
      const { data } = await axios.post(
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
            publisher_platforms: ['facebook','instagram'],
            facebook_positions: ['feed','marketplace'],
            instagram_positions: ['stream','story','reels'],
            audience_network_positions: [],
            messenger_positions: []
          }
        },
        { params: mkParams() }
      );
      imageAdSetId = data?.id || null;
    }
    if (wantVideo) {
      const { data } = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
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
            publisher_platforms: ['facebook','instagram'],
            facebook_positions: ['feed','video_feeds','marketplace'],
            instagram_positions: ['stream','reels','story'],
            audience_network_positions: [],
            messenger_positions: []
          }
        },
        { params: mkParams() }
      );
      videoAdSetId = data?.id || null;
    }

    const adIds = [];
    const usedImages = [];
    const usedVideos = [];
    const usedFbIds  = [];

    async function uploadImage(imageUrl) {
      try {
        let base64;
        try { base64 = await fetchImageAsBase64(imageUrl); }
        catch { base64 = await fetchImageAsBase64('/__fallback/1200.jpg'); }
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
      } catch (e) {
        if (VALIDATE_ONLY) return 'VALIDATION_ONLY_HASH';
        throw e;
      }
    }

    if (wantImage && imageAdSetId) {
      for (let i = 0; i < needImg; i++) {
        const srcUrl = imageVariants[i];
        const hash = await uploadImage(srcUrl);
        const cr = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
          {
            name: `${campaignName} (Image v${i + 1})`,
            object_story_spec: {
              page_id: pageIdFinal,
              link_data: {
                message: form.adCopy || adCopy || '',
                link: form.url || 'https://your-smartmark-site.com',
                image_hash: hash,
                description: form.description || ''
              }
            }
          },
          { params: mkParams() }
        );
        const ad = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
          { name: `${campaignName} (Image v${i + 1})`, adset_id: imageAdSetId, creative: { creative_id: cr.data.id }, status: NO_SPEND ? 'PAUSED' : 'ACTIVE' },
          { params: mkParams() }
        );
        adIds.push(ad.data?.id || `VALIDATION_ONLY_IMG_${i+1}`);
        if (srcUrl) usedImages.push(absolutePublicUrl(srcUrl));
      }
    }

    if (wantVideo && videoAdSetId) {
      for (let i = 0; i < needVid; i++) {
        const video_id = await ensureVideoIdByIndex(i, videoVariants, fbVideoIds);
        const vUrl = videoVariants[i] ? absolutePublicUrl(videoVariants[i]) : null;

        let thumbUrl = null;
        const candBody = (typeof videoThumbnailUrl === 'string' && videoThumbnailUrl) ? videoThumbnailUrl : null;
        const candImg  = imageVariants[i] || imageVariants[0] || null;
        if (candBody) thumbUrl = absolutePublicUrl(candBody);
        else if (candImg) thumbUrl = absolutePublicUrl(candImg);
        else {
          try {
            const { data } = await axios.get(
              `https://graph.facebook.com/v18.0/${video_id}/thumbnails`,
              { params: { access_token: userToken, fields: 'uri,is_preferred' } }
            );
            const thumbs = data?.data || [];
            const preferred = thumbs.find(t => t.is_preferred) || thumbs[0];
            thumbUrl = preferred?.uri || null;
          } catch {}
        }

        const video_data = {
          video_id,
          message: form.adCopy || adCopy || '',
          title: campaignName,
          call_to_action: { type: 'LEARN_MORE', value: { link: form.url || 'https://your-smartmark-site.com' } }
        };
        if (thumbUrl) video_data.image_url = thumbUrl;

        const cr = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
          { name: `${campaignName} (Video v${i + 1})`, object_story_spec: { page_id: pageIdFinal, video_data } },
          { params: mkParams() }
        );
        const ad = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
          { name: `${campaignName} (Video v${i + 1})`, adset_id: videoAdSetId, creative: { creative_id: cr.data.id }, status: NO_SPEND ? 'PAUSED' : 'ACTIVE' },
          { params: mkParams() }
        );
        adIds.push(ad.data?.id || `VALIDATION_ONLY_VID_${i+1}`);
        if (vUrl) usedVideos.push(vUrl);
        if (video_id) usedFbIds.push(video_id);
      }
    }

    const campaignStatus = NO_SPEND ? 'PAUSED' : 'ACTIVE';

    await ensureUsersAndSessions(); // reuse lowdb init
    await db.read();
    db.data.campaign_creatives = db.data.campaign_creatives || [];
    const list = db.data.campaign_creatives;
    const idx = list.findIndex(c => c.campaignId === campaignId);
    const nowIso = new Date().toISOString();
    const record = {
      campaignId, accountId: String(accountId || ''), pageId: String(pageIdFinal || ''),
      name: campaignName, status: campaignStatus, mediaSelection: ms,
      images: usedImages, videos: usedVideos, fbVideoIds: usedFbIds.length ? usedFbIds : fbVideoIds,
      updatedAt: nowIso, ...(idx === -1 ? { createdAt: nowIso } : {})
    };
    if (idx === -1) list.push(record); else list[idx] = { ...list[idx], ...record };
    await db.write();

    res.json({
      success: true,
      campaignId,
      adSetIds: [imageAdSetId, videoAdSetId].filter(Boolean),
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
    if (Buffer.isBuffer(detail)) { try { detail = detail.toString('utf8'); } catch {} }
    console.error('FB Campaign Launch Error:', detail);
    res.status(500).json({ error: errorMsg, detail });
  }
});

/* ---------------------------- Insights/controls ---------------------------- */
router.get('/facebook/adaccount/:accountId/campaigns', async (req, res) => {
  const userToken = getFbUserToken();
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
  const userToken = getFbUserToken();
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
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}/insights`,
      { params: { access_token: userToken, fields: 'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks', date_preset: 'maximum' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch campaign metrics.' });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/creatives', async (req, res) => {
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await db.read();
    const rec = (db.data.campaign_creatives || []).find(r => r.campaignId === campaignId) || null;
    if (!rec) return res.status(404).json({ error: 'No creatives stored for this campaign.' });
    res.json({
      campaignId: rec.campaignId,
      accountId: rec.accountId,
      pageId: rec.pageId,
      name: rec.name,
      status: rec.status,
      mediaSelection: rec.mediaSelection,
      images: rec.images || [],
      videos: rec.videos || [],
      fbVideoIds: rec.fbVideoIds || [],
      updatedAt: rec.updatedAt,
      createdAt: rec.createdAt
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load creatives.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/pause', async (req, res) => {
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${campaignId}`, { status: 'PAUSED' }, { params: { access_token: userToken } });
    res.json({ success: true, message: `Campaign ${campaignId} paused.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to pause campaign.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/unpause', async (req, res) => {
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${campaignId}`, { status: 'ACTIVE' }, { params: { access_token: userToken } });
    res.json({ success: true, message: `Campaign ${campaignId} unpaused.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to unpause campaign.' });
  }
});

router.post('/facebook/adaccount/:accountId/campaign/:campaignId/cancel', async (req, res) => {
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    await axios.post(`https://graph.facebook.com/v18.0/${campaignId}`, { status: 'ARCHIVED' }, { params: { access_token: userToken } });
    res.json({ success: true, message: `Campaign ${campaignId} canceled.` });
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to cancel campaign.' });
  }
});

/* ---------------------------- whoami ---------------------------- */
router.get('/whoami', async (req, res) => {
  try {
    await ensureUsersAndSessions();
    const sid = req.cookies?.[COOKIE_NAME];
    if (!sid) return res.status(401).json({ error: 'Not logged in' });

    const sess = db.data.sessions.find(s => s.sid === sid);
    if (!sess) return res.status(401).json({ error: 'Session not found' });

    const user = db.data.users.find(u => u.username === sess.username);
    if (!user) return res.status(401).json({ error: 'User not found for session' });

    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve session', detail: err.message });
  }
});

module.exports = router;
