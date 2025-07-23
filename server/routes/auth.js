const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db'); // <-- LOWDB DB

// ENV VARS
const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const FB_SCOPES = [
  'ads_management',
  'ads_read',
  'public_profile',
  'pages_show_list'
];

// ====== MVP: store ONE user access token in memory ======
let userTokens = {};

// ====== FACEBOOK OAUTH - Connect Facebook ======

// GET /auth/facebook  <-- This is the route you were missing!
router.get('/facebook', (req, res) => {
  const state = "randomstring123";
  const fbUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&scope=${FB_SCOPES.join(',')}&response_type=code&state=${state}`;
  res.redirect(fbUrl);
});

// GET /auth/facebook/callback
router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No code returned from Facebook.");

  try {
    // Exchange code for access token
    const tokenRes = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: FACEBOOK_APP_ID,
        client_secret: FACEBOOK_APP_SECRET,
        redirect_uri: FACEBOOK_REDIRECT_URI,
        code
      }
    });
    const accessToken = tokenRes.data.access_token;
    userTokens['singleton'] = accessToken; // MVP: one user

    // Redirect to frontend, notify connection
    res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
});

// ====== MVP: AUTH SIGNUP/LOGIN ENDPOINTS (LowDB) ======

// POST /auth/signup
router.post('/signup', async (req, res) => {
  const { username, email, cashtag, password } = req.body;
  if (!username || !email || !cashtag || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  await db.read();
  if (
    db.data.users.find(u => u.username === username || u.email === email || u.cashtag === cashtag)
  ) {
    return res.status(400).json({ error: 'Username, email, or cashtag already exists' });
  }
  db.data.users.push({ username, email, cashtag, password });
  await db.write();
  res.json({ success: true, user: { username, email, cashtag } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  await db.read();
  const user = db.data.users.find(u => u.username === username && u.password === password);
  if (!user)
    return res.status(401).json({ error: 'Invalid login' });
  res.json({ success: true, user: { username: user.username, email: user.email, cashtag: user.cashtag } });
});

// ====== LAUNCH CAMPAIGN (with campaignName, startDate, and AI audience) ======
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  // Accept aiAudience at top level or inside form
  const aiAudience = req.body.aiAudience || (req.body.form && req.body.form.aiAudience);
  const { form = {}, budget, adCopy, adImage, campaignType, pageId } = req.body;
  const campaignName = form.campaignName || form.businessName || "SmartMark Campaign";

  // ==== AI AUDIENCE LOGIC ====
  let targeting = {
    geo_locations: { countries: ["US"] },
    age_min: 18,
    age_max: 65,
  };
  if (aiAudience) {
    try {
      const ai = typeof aiAudience === "string" ? JSON.parse(aiAudience) : aiAudience;
      if (ai.location && ai.location.length > 1) {
        let loc = ai.location;
        if (/united states|usa|america/i.test(loc)) loc = "US";
        targeting.geo_locations = { countries: [loc] };
      }
      if (ai.ageRange && /^\d{2}-\d{2}$/.test(ai.ageRange)) {
        const [age_min, age_max] = ai.ageRange.split('-').map(x => parseInt(x));
        if (age_min && age_max && age_max > age_min) {
          targeting.age_min = age_min;
          targeting.age_max = age_max;
        }
      }
      if (ai.interests && ai.interests.length > 1) {
        targeting.flexible_spec = [{ interests: [{ name: ai.interests }] }];
      }
    } catch (err) {
      console.error("Failed to parse aiAudience JSON:", err.message);
    }
  }

  try {
    // 1. Upload image (to Facebook)
    let imageHash;
    if (adImage && adImage.startsWith("data:")) {
      const matches = adImage.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!matches) throw new Error("Invalid image data.");
      const base64Data = matches[2];
      const fbImageRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
        new URLSearchParams({ bytes: base64Data }),
        {
          headers: {
            Authorization: undefined,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          params: { access_token: userToken }
        }
      );
      const imgData = fbImageRes.data.images;
      imageHash = Object.values(imgData)[0]?.hash;
      if (!imageHash) throw new Error("Failed to upload image to Facebook.");
    } else {
      throw new Error("Ad image required and must be base64 Data URL.");
    }

    // 2. Create campaign
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

    // 3. Create ad set (uses AI audience for targeting!)
    const adSetRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
      {
        name: `${campaignName} - ${new Date().toISOString()}`,
        campaign_id: campaignId,
        daily_budget: Math.round(parseFloat(budget) * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        status: "ACTIVE",
        start_time: new Date(Date.now() + 60 * 1000).toISOString(),
        end_time: null,
        targeting,
      },
      { params: { access_token: userToken } }
    );
    const adSetId = adSetRes.data.id;

    // 4. Create ad creative
    const creativeRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
      {
        name: `${campaignName} - ${new Date().toISOString()}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            message: adCopy,
            link: form.url || "https://your-smartmark-site.com",
            image_hash: imageHash,
            caption: campaignName,
            description: form.description || ""
          }
        }
      },
      { params: { access_token: userToken } }
    );
    const creativeId = creativeRes.data.id;

    // 5. Create ad
    const adRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
      {
        name: `${campaignName} - ${new Date().toISOString()}`,
        adset_id: adSetId,
        creative: { creative_id: creativeId },
        status: "ACTIVE"
      },
      { params: { access_token: userToken } }
    );

    res.json({
      success: true,
      campaignId,
      adSetId,
      creativeId,
      adId: adRes.data.id,
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

// ====== LIST CAMPAIGNS (name, start_time, status) ======
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
    let errorMsg = "Failed to fetch campaigns.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// ====== GET CAMPAIGN DETAILS ======
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
    let errorMsg = "Failed to fetch campaign details.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// ====== GET CAMPAIGN METRICS ======
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
    let errorMsg = "Failed to fetch campaign metrics.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// ====== PAUSE CAMPAIGN (status: PAUSED) ======
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
    let errorMsg = "Failed to pause campaign.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// ====== UNPAUSE CAMPAIGN (status: ACTIVE) ======
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
    let errorMsg = "Failed to unpause campaign.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

// ====== CANCEL (ARCHIVE) CAMPAIGN (status: ARCHIVED) ======
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
    let errorMsg = "Failed to cancel campaign.";
    if (err.response && err.response.data && err.response.data.error) {
      errorMsg = err.response.data.error.message;
    }
    res.status(500).json({ error: errorMsg });
  }
});

module.exports = router;
