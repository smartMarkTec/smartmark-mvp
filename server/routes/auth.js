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
      // ONLY these creatives are accepted (from FormPage)
      imageVariants = [],
      videoVariants = [],
      fbVideoIds = [],
      // optional flight overrides (still used for policy)
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
      if (typeof aiAudienceRaw === "string") {
        aiAudience = JSON.parse(aiAudienceRaw);
      } else if (typeof aiAudienceRaw === "object" && aiAudienceRaw !== null) {
        aiAudience = aiAudienceRaw;
      }
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
      if (loc.includes("texas")) {
        targeting.geo_locations = { regions: [{ key: "3886" }] };
      } else if (loc.includes("california")) {
        targeting.geo_locations = { regions: [{ key: "3841" }] };
      } else if (loc.includes("usa") || loc.includes("united states")) {
        targeting.geo_locations = { countries: ["US"] };
      } else if (/^[a-z]{2}$/i.test(aiAudience.location.trim())) {
        targeting.geo_locations = { countries: [aiAudience.location.trim().toUpperCase()] };
      } else {
        targeting.geo_locations = { countries: [aiAudience.location.trim().toUpperCase()] };
      }
    }

    if (aiAudience && aiAudience.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
      const [min, max] = aiAudience.ageRange.split('-').map(Number);
      targeting.age_min = min;
      targeting.age_max = max;
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
        } catch (e) {
          console.warn("FB interest search failed for:", name, e.message);
        }
      }
      if (fbInterestIds.length > 0) {
        targeting.flexible_spec = [{ interests: fbInterestIds.map(id => ({ id })) }];
      }
    }

    // --- Enforce max 2 active campaigns on this ad account ---
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

    // Decide variant plan (1 or 2 per type based on budget/flight)
    const variantPlan = policy.decideVariantPlan({
      assetTypes: ms,
      dailyBudget: Number(budget) || 0,
      flightHours: (function () {
        if (flightEnd) return Math.max(0, (new Date(flightEnd) - Date.now()) / 36e5);
        if (flightHours) return Number(flightHours) || 0;
        return 0;
      })(),
      overrideCountPerType
    });
    const needImg = wantImage ? variantPlan.images : 0;
    const needVid = wantVideo ? variantPlan.videos : 0;

    // Validate we have enough creatives from FormPage (no server generation here)
    if (wantImage && imageVariants.length < needImg) {
      return res.status(400).json({ error: `Need ${needImg} image(s) but received ${imageVariants.length}.` });
    }
    // Videos can be provided as fb ids or raw URLs (we accept either)
    const providedVideoCount = Math.max(videoVariants.length, fbVideoIds.length);
    if (wantVideo && providedVideoCount < needVid) {
      return res.status(400).json({ error: `Need ${needVid} video(s) but received ${providedVideoCount}.` });
    }

    // 1) Create Campaign
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

    // 2) Create Ad Sets (split daily budget across the media types used)
    const typesUsed = (wantImage ? 1 : 0) + (wantVideo ? 1 : 0);
    const perAdsetBudgetCents = Math.max(1, Math.round((Number(budget) || 0) * 100 / Math.max(1, typesUsed)));

    const adSetIds = [];
    let imageAdSetId = null, videoAdSetId = null;

    if (wantImage) {
      const imgAdSetRes = await axios.post(
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
      imageAdSetId = imgAdSetRes.data.id;
      adSetIds.push(imageAdSetId);
    }

    if (wantVideo) {
      const vidAdSetRes = await axios.post(
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
      videoAdSetId = vidAdSetRes.data.id;
      adSetIds.push(videoAdSetId);
    }

    // Helper: upload image URL -> image_hash, then create creative + ad
    async function uploadImageAndCreateAd(imageUrl, adsetId, copy) {
      if (!imageUrl) throw new Error('No image URL provided');

      let imageHash = null;
      // Fetch and upload as base64 bytes (reliable across hosts)
      const abs = absolutePublicUrl(imageUrl);
      const imgRes = await axios.get(abs, { responseType: 'arraybuffer' });
      const base64 = Buffer.from(imgRes.data).toString('base64');

      const fbImageRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
        new URLSearchParams({ bytes: base64 }),
        {
          headers: { Authorization: undefined, 'Content-Type': 'application/x-www-form-urlencoded' },
          params: { access_token: userToken }
        }
      );
      const imgData = fbImageRes.data.images;
      imageHash = Object.values(imgData)[0]?.hash;

      if (!imageHash) throw new Error("Failed to upload image to Facebook.");

      const creativeRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
          object_story_spec: {
            page_id: pageId,
            link_data: {
              message: copy || adCopy || '',
              link: form.url || "https://your-smartmark-site.com",
              image_hash: imageHash,
              description: form.description || ""
            }
          }
        },
        { params: { access_token: userToken } }
      );

      const adRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
          adset_id: adsetId,
          creative: { creative_id: creativeRes.data.id },
          status: "ACTIVE"
        },
        { params: { access_token: userToken } }
      );

      return adRes.data.id;
    }

    // Helper: ensure a video_id for a provided source (fb id or URL)
    async function ensureVideoIdByIndex(idx) {
      const existingId = fbVideoIds[idx];
      if (existingId) return existingId;

      const vUrl = videoVariants[idx];
      if (!vUrl) throw new Error('Missing video source');

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

    async function createVideoAdByIndex(idx, adsetId, copy) {
      const videoId = await ensureVideoIdByIndex(idx);

      // Try to fetch a thumbnail (optional)
      let thumbUrl = null;
      try {
        const thumbRes = await axios.get(
          `https://graph.facebook.com/v18.0/${videoId}/thumbnails`,
          { params: { access_token: userToken, fields: 'uri,is_preferred' } }
        );
        const thumbs = thumbRes.data?.data || [];
        const preferred = thumbs.find(t => t.is_preferred) || thumbs[0];
        thumbUrl = preferred?.uri || null;
      } catch {}

      const videoData = {
        video_id: videoId,
        message: copy || adCopy || "",
        title: campaignName,
        call_to_action: { type: "LEARN_MORE", value: { link: form.url || "https://your-smartmark-site.com" } }
      };
      if (thumbUrl) videoData.image_url = thumbUrl;

      const creativeRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          object_story_spec: { page_id: pageId, video_data: videoData }
        },
        { params: { access_token: userToken } }
      );

      const adRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          adset_id: adsetId,
          creative: { creative_id: creativeRes.data.id },
          status: "ACTIVE"
        },
        { params: { access_token: userToken } }
      );

      return adRes.data.id;
    }

    // 3) Create ads strictly from provided FormPage variants (clip to policy counts)
    const adIds = [];
    const creativeIds = []; // kept for parity with previous response
    const variantResults = [];

    if (wantImage && imageAdSetId && needImg > 0) {
      for (let i = 0; i < needImg; i++) {
        const imgUrl = imageVariants[i];
        const adId = await uploadImageAndCreateAd(imgUrl, imageAdSetId, adCopy);
        adIds.push(adId);
        variantResults.push({ kind: 'image', adId, index: i });
      }
    }

    if (wantVideo && videoAdSetId && needVid > 0) {
      for (let i = 0; i < needVid; i++) {
        const adId = await createVideoAdByIndex(i, videoAdSetId, adCopy);
        adIds.push(adId);
        variantResults.push({ kind: 'video', adId, index: i });
      }
    }

    // Done
    res.json({
      success: true,
      campaignId,
      adSetIds,
      creativeIds, // empty list here (we’re not returning them; could be extended)
      adIds,
      variants: variantResults,
      variantPlan,
      campaignStatus: "ACTIVE"
    });
  } catch (err) {
    let errorMsg = "Failed to launch campaign.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
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
