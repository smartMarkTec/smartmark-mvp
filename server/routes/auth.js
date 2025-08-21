'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db');
const { getFbUserToken, setFbUserToken } = require('../tokenStore');
const { policy } = require('../smartCampaignEngine');

// ---- env ----
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ADD NEAR THE TOP, after the env consts:
router.get('/facebook/ping', (req, res) => {
  res.json({
    ok: true,
    env: {
      FACEBOOK_APP_ID: !!FACEBOOK_APP_ID,
      FACEBOOK_APP_SECRET: !!FACEBOOK_APP_SECRET,
      FACEBOOK_REDIRECT_URI
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

const FB_SCOPES = [
  'pages_manage_engagement',
  'pages_manage_metadata',
  'pages_manage_posts',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_show_list',
  'public_profile',
  'read_insights',
  'business_management',
  'ads_management',
  'ads_read'
];

/* =========================
   FACEBOOK OAUTH
   ========================= */
router.get('/facebook', (req, res, next) => {
  try {
    if (!FACEBOOK_APP_ID || !FACEBOOK_REDIRECT_URI) {
      return res.status(500).json({
        error: 'Missing FACEBOOK_APP_ID or FACEBOOK_REDIRECT_URI on the server'
      });
    }
    const url = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    url.searchParams.set('client_id', FACEBOOK_APP_ID);
    url.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
    url.searchParams.set('scope', FB_SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', 'smartmark_state_1');
    res.redirect(url.toString());
  } catch (err) {
    next(err);
  }
});

router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Facebook.');
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
        await setFbUserToken(x.data.access_token);
        console.log('[auth] stored LONG-LIVED FB user token');
      } else {
        await setFbUserToken(accessToken);
        console.log('[auth] stored SHORT-LIVED FB user token (no exchange data)');
      }
    } catch (e) {
      await setFbUserToken(accessToken);
      console.warn('[auth] long-lived exchange failed, stored short-lived token');
    }

    res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
});

// Debug route
router.get('/debug/fbtoken', (req, res) => {
  res.json({ fbUserToken: getFbUserToken() ? 'present' : 'missing' });
});

/* =========================
   ACCOUNT / PAGES LIST
   ========================= */
router.get('/facebook/adaccounts', async (req, res) => {
  const userToken = getFbUserToken();
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const me = await axios.get(
      `https://graph.facebook.com/v18.0/me/adaccounts`,
      { params: { access_token: userToken, fields: 'id,name,account_status' } }
    );
    res.json(me.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch ad accounts.' });
  }
});

router.get('/facebook/pages', async (req, res) => {
  const userToken = getFbUserToken();
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const me = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      { params: { access_token: userToken, fields: 'id,name,access_token' } }
    );
    res.json(me.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch Facebook Pages.' });
  }
});

/* =========================
   DEMO AUTH (lowdb)
   ========================= */
router.post('/signup', async (req, res) => {
  const { username, email, cashtag, password } = req.body;
  if (!username || !email || !cashtag || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  await db.read();
  db.data.users = db.data.users || [];
  if (db.data.users.find(u => u.username === username || u.email === email || u.cashtag === cashtag)) {
    return res.status(400).json({ error: 'Username, email, or cashtag already exists' });
  }
  db.data.users.push({ username, email, cashtag, password });
  await db.write();
  res.json({ success: true, user: { username, email, cashtag } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  await db.read();
  let user = db.data.users.find(u => u.username === username && u.password === password);
  if (!user) {
    user = { username, email: password, cashtag: username, password };
    db.data.users.push(user);
    await db.write();
  }
  res.json({ success: true, user: { username: user.username, email: user.email, cashtag: user.cashtag } });
});

/* =========================
   LAUNCH CAMPAIGN
   ========================= */
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
        const imgRes = await axios.get(abs, {
          responseType: 'arraybuffer',
          timeout: 15000,
          headers: { 'Accept': 'image/*' }
        });
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
      try {
        base64 = await fetchImageAsBase64(imageUrl);
      } catch (e) {
        base64 = await fetchImageAsBase64('/__fallback/1200.jpg');
      }
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

  try {
    const {
      form = {},
      budget,
      adCopy,
      pageId,
      aiAudience: aiAudienceRaw,
      mediaSelection = 'both',               // <-- CRITICAL: respect client selection
      imageVariants = [],
      videoVariants = [],
      fbVideoIds = [],
      videoThumbnailUrl = null,
      flightStart = null,
      flightEnd = null,
      flightHours = null,
      overrideCountPerType = null
    } = req.body;

    const campaignName = form.campaignName || form.businessName || 'SmartMark Campaign';

    let aiAudience = null;
    try {
      if (typeof aiAudienceRaw === 'string') aiAudience = JSON.parse(aiAudienceRaw);
      else if (aiAudienceRaw && typeof aiAudienceRaw === 'object') aiAudience = aiAudienceRaw;
    } catch { aiAudience = null; }

    const ms = String(mediaSelection || 'both').toLowerCase();
    const wantImage = ms === 'image' || ms === 'both';
    const wantVideo = ms === 'video' || ms === 'both';

    // Targeting baseline + Advantage+ when user didn't provide interests
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

    // limit: max 2 active (skip in validate-only)
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

    // Decide variants
    const dailyBudget = Number(budget) || 0;
    const hours = (() => {
      if (flightEnd && flightStart) return Math.max(0, (new Date(flightEnd) - new Date(flightStart)) / 36e5);
      if (flightHours) return Number(flightHours) || 0;
      return 0;
    })();
    const plan = policy.decideVariantPlan({
      assetTypes: ms,
      dailyBudget,
      flightHours: hours,
      overrideCountPerType
    });
    const needImg = wantImage ? plan.images : 0;
    const needVid = wantVideo ? plan.videos : 0;

    if (wantImage && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }
    const providedVideoCount = Math.max(videoVariants.length, fbVideoIds.length);
    if (wantVideo && providedVideoCount < needVid) {
      return res.status(400).json({ error: `Need ${needVid} video(s) but received ${providedVideoCount}.` });
    }

    // Timeframe normalization + 14-day cap (what the UI enforces)
    const now = new Date();
    let startISO = flightStart ? new Date(flightStart).toISOString()
      : (NO_SPEND ? new Date(now.getTime() + 7*24*60*60*1000).toISOString() : new Date(now.getTime() + 60*1000).toISOString());
    let endISO = flightEnd ? new Date(flightEnd).toISOString() : null;
    if (endISO) {
      const maxEnd = new Date(new Date(startISO).getTime() + 14*24*60*60*1000);
      if (new Date(endISO) > maxEnd) endISO = maxEnd.toISOString();
      if (new Date(endISO) <= new Date(startISO)) endISO = new Date(new Date(startISO).getTime() + 24*60*60*1000).toISOString();
    }

    // 1) Campaign
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

    // Per-adset budget split
    const typesUsed = (wantImage ? 1 : 0) + (wantVideo ? 1 : 0);
    const perAdsetBudgetCents = Math.max(100, Math.round((Number(budget) || 0) * 100 / Math.max(1, typesUsed)));

    // 2) Ad Sets
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
          promoted_object: { page_id: pageId },
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
          promoted_object: { page_id: pageId },
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

    // 3) Ads
    const adIds = [];

    if (wantImage && imageAdSetId) {
      for (let i = 0; i < needImg; i++) {
        const hash = await uploadImage(imageVariants[i]);
        const cr = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
          {
            name: `${campaignName} (Image v${i + 1})`,
            object_story_spec: {
              page_id: pageId,
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
      }
    }

    if (wantVideo && videoAdSetId) {
      for (let i = 0; i < needVid; i++) {
        const video_id = await ensureVideoIdByIndex(i, videoVariants, fbVideoIds);

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
          { name: `${campaignName} (Video v${i + 1})`, object_story_spec: { page_id: pageId, video_data } },
          { params: mkParams() }
        );
        const ad = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
          { name: `${campaignName} (Video v${i + 1})`, adset_id: videoAdSetId, creative: { creative_id: cr.data.id }, status: NO_SPEND ? 'PAUSED' : 'ACTIVE' },
          { params: mkParams() }
        );
        adIds.push(ad.data?.id || `VALIDATION_ONLY_VID_${i+1}`);
      }
    }

    res.json({
      success: true,
      campaignId,
      adSetIds: [imageAdSetId, videoAdSetId].filter(Boolean),
      adIds,
      variantPlan: plan,
      campaignStatus: NO_SPEND ? 'PAUSED' : 'ACTIVE',
      validateOnly: VALIDATE_ONLY
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

/* =========================
   TEST/UTILITY ROUTES
   ========================= */
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

/* Pause / Unpause / Cancel */
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/pause', async (req, res) => {
  const userToken = getFbUserToken();
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
  const userToken = getFbUserToken();
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
  const userToken = getFbUserToken();
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
