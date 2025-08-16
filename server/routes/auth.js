// server/routes/auth.js

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db'); // LOWDB
const FormData = require('form-data');
const { setFbUserToken } = require('../tokenStore');

// Use ONLY policy (no generator here)
const { policy } = require('../smartCampaignEngine');

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

let userTokens = {};

// Helper: absolute public URL for generated assets
function absolutePublicUrl(relativePath) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com';
  if (!relativePath) return '';
  return relativePath.startsWith('http') ? relativePath : `${base}${relativePath}`;
}

// --- FACEBOOK OAUTH --- //
router.get('/facebook', (req, res) => {
  const state = "randomstring123";
  const fbUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&scope=${FB_SCOPES.join(',')}&response_type=code&state=${state}&auth_type=reauthenticate`;
  res.redirect(fbUrl);
});

router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code returned from Facebook.");
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
    setFbUserToken(accessToken);
    userTokens['singleton'] = accessToken;

    console.log('[auth] FB user token stored in tokenStore:', !!accessToken);

    res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1&fb_user_token=${encodeURIComponent(accessToken)}`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
});

// --- TEMP DEBUG ROUTE (delete later) ---
router.get('/debug/fbtoken', (req, res) => {
  const { getFbUserToken } = require('../tokenStore');
  res.json({ fbUserToken: getFbUserToken() ? 'present' : 'missing' });
});

// --- AD ACCOUNTS --- //
router.get('/facebook/adaccounts', async (req, res) => {
  const userToken = userTokens['singleton'];
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const me = await axios.get(
      `https://graph.facebook.com/v18.0/me/adaccounts`,
      { params: { access_token: userToken, fields: 'id,name,account_status' } }
    );
    res.json(me.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to fetch ad accounts." });
  }
});

// --- FB PAGES --- //
router.get('/facebook/pages', async (req, res) => {
  const userToken = userTokens['singleton'];
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const me = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      { params: { access_token: userToken, fields: 'id,name,access_token' } }
    );
    res.json(me.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to fetch Facebook Pages." });
  }
});

// --- AUTH SIGNUP/LOGIN (LowDB demo) --- //
router.post('/signup', async (req, res) => {
  const { username, email, cashtag, password } = req.body;
  if (!username || !email || !cashtag || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  await db.read();
  if (!db.data.users) db.data.users = [];
  if (db.data.users.find(u => u.username === username || u.email === email || u.cashtag === cashtag)) {
    return res.status(400).json({ error: 'Username, email, or cashtag already exists' });
  }
  db.data.users.push({ username, email, cashtag, password });
  await db.write();
  res.json({ success: true, user: { username, email, cashtag } });
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  await db.read();
  let user = db.data.users.find(u => u.username === username && u.password === password);

  if (!user) {
    user = { username, email: password, cashtag: username, password };
    db.data.users.push(user);
    await db.write();
  }

  res.json({ success: true, user: { username: user.username, email: user.email, cashtag: user.cashtag } });
});

// ====== LAUNCH CAMPAIGN (Use ONLY FormPage creatives; no generation here) ======
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const {
      form = {},
      budget,
      adCopy,
      campaignType,
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
      overrideCountPerType = null,
      answers = {},
      url = ''
    } = req.body;

    const campaignName = form.campaignName || form.businessName || "SmartMark Campaign";

    // Parse AI audience (if stringified)
    let aiAudience = null;
    try {
      if (typeof aiAudienceRaw === "string") aiAudience = JSON.parse(aiAudienceRaw);
      else if (aiAudienceRaw && typeof aiAudienceRaw === "object") aiAudience = aiAudienceRaw;
    } catch { aiAudience = null; }

    const ms = String(mediaSelection || 'both').toLowerCase();
    const wantImage = ms === 'image' || ms === 'both';
    const wantVideo = ms === 'video' || ms === 'both';

    // === Build targeting ===
    let targeting = {
      geo_locations: { countries: ["US"] },
      age_min: 18,
      age_max: 65,
      targeting_automation: { advantage_audience: 0 },
    };
    if (aiAudience && aiAudience.location) {
      const loc = aiAudience.location.toLowerCase();
      if (loc.includes("texas")) targeting.geo_locations = { regions: [{ key: "3886" }] };
      else if (loc.includes("california")) targeting.geo_locations = { regions: [{ key: "3841" }] };
      else if (loc.includes("usa") || loc.includes("united states")) targeting.geo_locations = { countries: ["US"] };
      else if (/^[a-z]{2}$/i.test(aiAudience.location.trim())) targeting.geo_locations = { countries: [aiAudience.location.trim().toUpperCase()] };
      else targeting.geo_locations = { countries: [aiAudience.location.trim().toUpperCase()] };
    }
    if (aiAudience && aiAudience.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
      const [min, max] = aiAudience.ageRange.split('-').map(Number);
      targeting.age_min = min; targeting.age_max = max;
    }
    if (aiAudience && aiAudience.interests) {
      const interestNames = aiAudience.interests.split(',').map(s => s.trim()).filter(Boolean);
      const fbInterestIds = [];
      for (let name of interestNames) {
        try {
          const fbRes = await axios.get(
            'https://graph.facebook.com/v18.0/search',
            { params: { type: 'adinterest', q: name, access_token: userToken } }
          );
          if (fbRes.data?.data?.length > 0) fbInterestIds.push(fbRes.data.data[0].id);
        } catch {}
      }
      if (fbInterestIds.length > 0) targeting.flexible_spec = [{ interests: fbInterestIds.map(id => ({ id })) }];
    }

    // Enforce max 2 active campaigns on this ad account
    const existing = await axios.get(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      { params: { access_token: userToken, fields: 'id,name,effective_status', limit: 50 } }
    );
    const activeCount = (existing.data?.data || []).filter(
      c => !["ARCHIVED", "DELETED"].includes((c.effective_status || "").toUpperCase())
    ).length;
    if (activeCount >= 2) {
      return res.status(400).json({ error: "Limit reached: maximum of 2 active campaigns per user." });
    }

    // === Variant plan (2 by default; fallback when budget/flight small) ===
    const dailyBudget = Number(budget) || 0;
    const hours = (function () {
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

    if (wantImage && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }
    const providedVideoCount = Math.max(videoVariants.length, fbVideoIds.length);
    if (wantVideo && providedVideoCount < needVid) {
      return res.status(400).json({ error: `Need ${needVid} video(s) but received ${providedVideoCount}.` });
    }

    // 1) Campaign
    const campaignRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      {
        name: campaignName,
        objective: "OUTCOME_TRAFFIC",
        status: "ACTIVE",
        special_ad_categories: []
      },
      { params: { access_token: userToken } }
    );
    const campaignId = campaignRes.data.id;

    // 2) Adsets (split evenly across used types)
    const typesUsed = (wantImage ? 1 : 0) + (wantVideo ? 1 : 0);
    const perAdsetBudgetCents = Math.max(100, Math.round(dailyBudget * 100 / Math.max(1, typesUsed)));

    let imageAdSetId = null, videoAdSetId = null;
    if (wantImage) {
      const { data } = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
          campaign_id: campaignId,
          daily_budget: perAdsetBudgetCents,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "ACTIVE",
          start_time: new Date(Date.now() + 60 * 1000).toISOString(),
          targeting: {
            ...targeting,
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["feed"],
            audience_network_positions: [],
            instagram_positions: ["stream"]
          },
        },
        { params: { access_token: userToken } }
      );
      imageAdSetId = data.id;
    }
    if (wantVideo) {
      const { data } = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          campaign_id: campaignId,
          daily_budget: perAdsetBudgetCents,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "ACTIVE",
          start_time: new Date(Date.now() + 60 * 1000).toISOString(),
          targeting: {
            ...targeting,
            publisher_platforms: ["facebook", "audience_network", "instagram"],
            facebook_positions: ["feed", "instream_video"],
            audience_network_positions: ["rewarded_video"],
            instagram_positions: ["stream", "reels", "story"]
          },
        },
        { params: { access_token: userToken } }
      );
      videoAdSetId = data.id;
    }

    // helpers
    async function uploadImage(imageUrl) {
      const abs = absolutePublicUrl(imageUrl);
      const imgRes = await axios.get(abs, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(imgRes.data).toString('base64');
      const fbImageRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
        new URLSearchParams({ bytes: base64 }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, params: { access_token: userToken } }
      );
      const imgData = fbImageRes.data.images;
      return Object.values(imgData)[0]?.hash;
    }
    async function ensureVideoIdByIndex(idx) {
      const existingId = fbVideoIds[idx];
      if (existingId) return existingId;
      const vUrl = videoVariants[idx];
      const formd = new FormData();
      formd.append('file_url', absolutePublicUrl(vUrl));
      formd.append('name', 'SmartMark Generated Video');
      formd.append('description', 'Generated by SmartMark');
      const up = await axios.post(
        `https://graph.facebook.com/v23.0/act_${accountId}/advideos`,
        formd,
        { headers: formd.getHeaders(), params: { access_token: userToken } }
      );
      return up?.data?.id;
    }

    // 3) Create ads (exactly plan.images / plan.videos)
    const adIds = [];

    if (wantImage && imageAdSetId) {
      for (let i = 0; i < needImg; i++) {
        const hash = await uploadImage(imageVariants[i]);
        const cr = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
          {
            name: `${campaignName} (Image v${i+1})`,
            object_story_spec: {
              page_id: pageId,
              link_data: {
                message: adCopy || '',
                link: form.url || "https://your-smartmark-site.com",
                image_hash: hash,
                description: form.description || ""
              }
            }
          },
          { params: { access_token: userToken } }
        );
        const ad = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
          { name: `${campaignName} (Image v${i+1})`, adset_id: imageAdSetId, creative: { creative_id: cr.data.id }, status: "ACTIVE" },
          { params: { access_token: userToken } }
        );
        adIds.push(ad.data.id);
      }
    }

    if (wantVideo && videoAdSetId) {
      for (let i = 0; i < needVid; i++) {
        const video_id = await ensureVideoIdByIndex(i);

        // thumbnail priority: explicit → imageVariants[i] → imageVariants[0] → FB preferred thumbnail
        let thumbUrl = null;
        const candBody = (typeof videoThumbnailUrl === 'string' && videoThumbnailUrl) ? videoThumbnailUrl : null;
        const candImg  = imageVariants[i] || imageVariants[0] || null;
        if (candBody) thumbUrl = absolutePublicUrl(candBody);
        else if (candImg) thumbUrl = absolutePublicUrl(candImg);
        else {
          try {
            const { data } = await axios.get(`https://graph.facebook.com/v18.0/${video_id}/thumbnails`,
              { params: { access_token: userToken, fields: 'uri,is_preferred' } });
            const thumbs = data?.data || [];
            const preferred = thumbs.find(t => t.is_preferred) || thumbs[0];
            thumbUrl = preferred?.uri || null;
          } catch {}
        }

        const video_data = {
          video_id,
          message: adCopy || "",
          title: campaignName,
          call_to_action: { type: "LEARN_MORE", value: { link: form.url || "https://your-smartmark-site.com" } }
        };
        if (thumbUrl) video_data.image_url = thumbUrl;

        const cr = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
          { name: `${campaignName} (Video v${i+1})`, object_story_spec: { page_id: pageId, video_data } },
          { params: { access_token: userToken } }
        );
        const ad = await axios.post(
          `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
          { name: `${campaignName} (Video v${i+1})`, adset_id: videoAdSetId, creative: { creative_id: cr.data.id }, status: "ACTIVE" },
          { params: { access_token: userToken } }
        );
        adIds.push(ad.data.id);
      }
    }

    res.json({
      success: true,
      campaignId,
      adSetIds: [imageAdSetId, videoAdSetId].filter(Boolean),
      adIds,
      variantPlan: plan,
      campaignStatus: "ACTIVE"
    });
  } catch (err) {
    let errorMsg = "Failed to launch campaign.";
    if (err.response?.data?.error) errorMsg = err.response.data.error.message;
    console.error("FB Campaign Launch Error:", err.response ? err.response.data : err);
    res.status(500).json({ error: errorMsg });
  }
});

// ====== FACEBOOK API TEST ROUTES (optional) ======
router.post('/facebook/test-pages-manage-metadata/:pageId', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}`,
      { about: "SmartMark API permission test" },
      { params: { access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "pages_manage_metadata test failed" });
  }
});

router.get('/facebook/test-read-insights/:pageId', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.get(
      `https://graph.facebook.com/v18.0/${pageId}/insights`,
      { params: { metric: 'page_impressions', access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "read_insights test failed" });
  }
});

router.get('/facebook/adaccount/:accountId/campaigns', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      { params: { access_token: userToken, fields: 'id,name,status,start_time' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to fetch campaigns." });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/details', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { params: { access_token: userToken, fields: 'id,name,status,start_time,objective,effective_status' } }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to fetch campaign details." });
  }
});

router.get('/facebook/adaccount/:accountId/campaign/:campaignId/metrics', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { campaignId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}/insights`,
      {
        params: {
          access_token: userToken,
          fields: 'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks',
          date_preset: 'lifetime'
        }
      }
    );
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to fetch campaign metrics." });
  }
});

// --- PAUSE / UNPAUSE / CANCEL --- //
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/pause', async (req, res) => {
  const userToken = userTokens['singleton'];
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
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to pause campaign." });
  }
});
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/unpause', async (req, res) => {
  const userToken = userTokens['singleton'];
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
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to unpause campaign." });
  }
});
router.post('/facebook/adaccount/:accountId/campaign/:campaignId/cancel', async (req, res) => {
  const userToken = userTokens['singleton'];
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
    res.status(500).json({ error: err.response?.data?.error?.message || "Failed to cancel campaign." });
  }
});

module.exports = router;
