/* eslint-disable */
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db'); // LowDB instance (persisted to disk)
const { getFbUserToken, setFbUserToken } = require('../tokenStore');
const { policy } = require('../smartCampaignEngine'); // decideVariantPlan, STOP_RULES, etc.

// ---- env ----
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

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

// Helper: absolute public URL for generated assets
function absolutePublicUrl(relativePath) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com';
  if (!relativePath) return '';
  return /^https?:\/\//i.test(relativePath) ? relativePath : `${base}${relativePath}`;
}

/* =========================
   FACEBOOK OAUTH
   ========================= */
router.get('/facebook', (req, res) => {
  try {
    if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET || !FACEBOOK_REDIRECT_URI) {
      return res.status(500).json({
        error: 'Facebook OAuth not configured',
        missing: {
          FACEBOOK_APP_ID: !!FACEBOOK_APP_ID,
          FACEBOOK_APP_SECRET: !!FACEBOOK_APP_SECRET,
          FACEBOOK_REDIRECT_URI: !!FACEBOOK_REDIRECT_URI
        }
      });
    }
    const state = 'smartmark_state_1';
    const fbUrl =
      `https://www.facebook.com/v18.0/dialog/oauth` +
      `?client_id=${FACEBOOK_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}` +
      `&scope=${encodeURIComponent(FB_SCOPES.join(','))}` +
      `&response_type=code&state=${state}`;
    return res.redirect(fbUrl);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to start Facebook OAuth', detail: e.message });
  }
});

router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('No code returned from Facebook.');
  try {
    // short-lived
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code
      }
    });
    const accessToken = tokenRes.data.access_token;

    // exchange to long-lived if possible
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

// Debug route: confirm token presence
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
   LAUNCH CAMPAIGN (uses provided creatives)
   ========================= */

router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = getFbUserToken();
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  // no-spend flags
  const NO_SPEND = process.env.NO_SPEND === '1' || req.query.no_spend === '1' || !!req.body.noSpend;
  const VALIDATE_ONLY = req.query.validate_only === '1' || !!req.body.validateOnly;
  const SAFE_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7 days

  // helper to build params (adds validate_only when requested)
  const mkParams = () => {
    const p = { access_token: userToken };
    if (VALIDATE_ONLY) p.execution_options = ['validate_only'];
    return p;
  };

  // tiny sleep
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // robust image fetch (with fallback) + upload
  async function fetchImageAsBase64(url) {
    if (!url) throw new Error('No image URL');
    // allow data URLs directly
    const m = /^data:image\/\w+;base64,(.+)$/i.exec(url);
    if (m) return m[1];

    const abs = absolutePublicUrl(url);
    const tries = [0, 400, 900]; // backoff
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
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Image download failed');
  }

  async function uploadImage(imageUrl) {
    try {
      let base64;
      try {
        base64 = await fetchImageAsBase64(imageUrl);
      } catch (e) {
        // guaranteed fallback (prevents picsum/remote 503s)
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
      // in validate-only, accept stub
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
      mediaSelection = 'both',
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

    // parse AI audience
    let aiAudience = null;
    try {
      if (typeof aiAudienceRaw === 'string') aiAudience = JSON.parse(aiAudienceRaw);
      else if (aiAudienceRaw && typeof aiAudienceRaw === 'object') aiAudience = aiAudienceRaw;
    } catch { aiAudience = null; }

    const ms = String(mediaSelection || 'both').toLowerCase();
    const wantImage = ms === 'image' || ms === 'both';
    const wantVideo = ms === 'video' || ms === 'both';

    // Targeting baseline
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
    }

    // limit: max 2 active campaigns (skip when validate-only)
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

    // decide variants
    const dailyBudget = Number(budget) || 0;
    const hours = (() => {
      if (flightEnd) return Math.max(0, (new Date(flightEnd) - Date.now()) / 36e5);
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

    // validate creative counts
    if (wantImage && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }
    const providedVideoCount = Math.max(videoVariants.length, fbVideoIds.length);
    if (wantVideo && providedVideoCount < needVid) {
      return res.status(400).json({ error: `Need ${needVid} video(s) but received ${providedVideoCount}.` });
    }

    // 1) Campaign (PAUSED in no-spend; ACTIVE otherwise)
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

    // 2) Ad Sets
    const typesUsed = (wantImage ? 1 : 0) + (wantVideo ? 1 : 0);
    const perAdsetBudgetCents = Math.max(100, Math.round(dailyBudget * 100 / Math.max(1, typesUsed)));

    let imageAdSetId = null, videoAdSetId = null;
    if (wantImage) {
      // IMAGE ad set
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
          start_time: NO_SPEND ? SAFE_START : new Date(Date.now() + 60 * 1000).toISOString(),
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
      // VIDEO ad set
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
          start_time: NO_SPEND ? SAFE_START : new Date(Date.now() + 60 * 1000).toISOString(),
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

    // 3) Ads (PAUSED in no-spend)
    const adIds = [];

    // images
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

    // videos (with GUARANTEED THUMBNAIL)
    if (wantVideo && videoAdSetId) {
      for (let i = 0; i < needVid; i++) {
        const video_id = await ensureVideoIdByIndex(i, videoVariants, fbVideoIds);

        // try to resolve a thumbnail: explicit → imageVariants[i]/[0] → FB preferred → guaranteed fallback
        let thumbUrl = null;
        let thumbHash = null;

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
        // GUARANTEED fallback: if still nothing, upload our reliable image and use image_hash
        if (!thumbUrl) {
          try {
            thumbHash = await uploadImage('/__fallback/1200.jpg');
          } catch {
            // final safety: use absolute URL anyway
            thumbUrl = absolutePublicUrl('/__fallback/1200.jpg');
          }
        }

        const video_data = {
          video_id,
          message: form.adCopy || adCopy || '',
          title: campaignName,
          call_to_action: { type: 'LEARN_MORE', value: { link: form.url || 'https://your-smartmark-site.com' } }
        };
        if (thumbUrl) video_data.image_url = thumbUrl;
        else if (thumbHash) video_data.image_hash = thumbHash;

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

    // Convert HTML/Buffer errors to readable text
    let detail = err.response?.data || err.message;
    if (Buffer.isBuffer(detail)) {
      try { detail = detail.toString('utf8'); } catch {}
    }

    console.error('FB Campaign Launch Error:', detail);
    res.status(500).json({ error: errorMsg, detail });
  }
});


/* =========================
   TEST/UTILITY ROUTES
   ========================= */
router.post('/facebook/test-pages-manage-metadata/:pageId', async (req, res) => {
  const userToken = getFbUserToken();
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}`,
      { about: 'SmartMark API permission test' },
      { params: { access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'pages_manage_metadata test failed' });
  }
});

router.get('/facebook/test-read-insights/:pageId', async (req, res) => {
  const userToken = getFbUserToken();
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.get(
      `https://graph.facebook.com/v18.0/${pageId}/insights`,
      { params: { metric: 'page_impressions', access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'read_insights test failed' });
  }
});

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

/* === DEBUG: list ads for a campaign === */
router.get('/facebook/campaign/:campaignId/ads', async (req, res) => {
  const userToken = getFbUserToken();
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}/ads`,
      { params: { access_token: userToken, fields: 'id,name,status,effective_status,adset_id,created_time', limit: 200 } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || 'Failed to fetch campaign ads.' });
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

/* === ADMIN: override policy STOP_RULES at runtime (for testing) === */
router.post('/admin/set-policy-stop-rules', async (req, res) => {
  try {
    const { policy } = require('../smartCampaignEngine');
    const inb = req.body || {};
    const next = {
      MIN_SPEND_PER_AD: Number(inb.MIN_SPEND_PER_AD ?? policy.STOP_RULES.MIN_SPEND_PER_AD),
      MIN_IMPRESSIONS_PER_AD: Number(inb.MIN_IMPRESSIONS_PER_AD ?? policy.STOP_RULES.MIN_IMPRESSIONS_PER_AD),
      MIN_CLICKS_PER_AD: Number(inb.MIN_CLICKS_PER_AD ?? policy.STOP_RULES.MIN_CLICKS_PER_AD),
      MAX_TEST_HOURS: Number(inb.MAX_TEST_HOURS ?? policy.STOP_RULES.MAX_TEST_HOURS)
    };
    policy.STOP_RULES = next;
    res.json({ ok: true, STOP_RULES: policy.STOP_RULES });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
