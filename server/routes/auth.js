const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db'); // LOWDB

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

let userTokens = {};

// --- FACEBOOK OAUTH --- //
router.get('/facebook', (req, res) => {
  const state = "randomstring123";
  const fbUrl = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&scope=${FB_SCOPES.join(',')}&response_type=code&state=${state}`;
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
    userTokens['singleton'] = accessToken;
    res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1`);
  } catch (err) {
    console.error('FB OAuth error:', err.response?.data || err.message);
    res.status(500).send('Failed to authenticate with Facebook.');
  }
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

// --- AUTH SIGNUP/LOGIN (LowDB) --- //
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

// ====== LAUNCH CAMPAIGN (AI TARGETING ENABLED) ======
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  const { form = {}, budget, adCopy, adImage, campaignType, pageId, aiAudience: aiAudienceRaw } = req.body;
  const campaignName = form.campaignName || form.businessName || "SmartMark Campaign";

  // ===== 1. Parse AI Audience (from frontend or fallback) =====
  let aiAudience = null;
  try {
    if (typeof aiAudienceRaw === "string") {
      aiAudience = JSON.parse(aiAudienceRaw);
    } else if (typeof aiAudienceRaw === "object" && aiAudienceRaw !== null) {
      aiAudience = aiAudienceRaw;
    }
  } catch {
    aiAudience = null;
  }

  // ===== 2. Build Targeting Dynamically =====
  let targeting = {
    geo_locations: { countries: ["US"] },
    age_min: 18,
    age_max: 65
  };

  // --- Location ---
  if (aiAudience && aiAudience.location) {
    const loc = aiAudience.location.toLowerCase();
    if (loc.includes("texas")) {
      targeting.geo_locations = { regions: [{ key: "3886" }] }; // Example: Texas
    } else if (loc.includes("usa") || loc.includes("united states")) {
      targeting.geo_locations = { countries: ["US"] };
    } else if (loc.match(/[a-z]+/)) {
      // Add more mappings for other states/countries as needed!
      targeting.geo_locations = { countries: [aiAudience.location] };
    }
  }

  // --- Age ---
  if (aiAudience && aiAudience.ageRange && /^\d{2}-\d{2}$/.test(aiAudience.ageRange)) {
    const [min, max] = aiAudience.ageRange.split('-').map(Number);
    targeting.age_min = min;
    targeting.age_max = max;
  }

  // --- Interests: Lookup FB Interest IDs ---
  if (aiAudience && aiAudience.interests) {
    const interestNames = aiAudience.interests.split(',').map(s => s.trim()).filter(Boolean);
    const fbInterestIds = [];
    for (let name of interestNames) {
      try {
        const fbRes = await axios.get(
          'https://graph.facebook.com/v18.0/search',
          {
            params: {
              type: 'adinterest',
              q: name,
              access_token: userToken
            }
          }
        );
        if (fbRes.data && fbRes.data.data && fbRes.data.data.length > 0) {
          fbInterestIds.push({ id: fbRes.data.data[0].id, name: fbRes.data.data[0].name });
        }
      } catch (e) {
        console.warn("FB interest search failed for:", name, e.message);
      }
    }
    if (fbInterestIds.length > 0) {
      targeting.flexible_spec = [{ interests: fbInterestIds }];
    }
  }

  // --- (OPTIONAL) Genders, Demographics, etc ---
  // If your AI adds "men"/"women"/"male"/"female" to demographic, you could:
  /*
  if (aiAudience && aiAudience.demographic) {
    if (aiAudience.demographic.toLowerCase().includes("men")) targeting.genders = [1];
    if (aiAudience.demographic.toLowerCase().includes("women")) targeting.genders = [2];
  }
  */

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

    // 2. Budget (Facebook minimum: $3.00/day)
    let dailyBudgetCents = Math.round(parseFloat(budget) * 100);
    if (!Number.isInteger(dailyBudgetCents) || dailyBudgetCents < 300) {
      return res.status(400).json({ error: "Budget must be at least $3.00 USD per day" });
    }

    // 3. Create campaign
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

    // 4. Create ad set (now with AI-powered targeting!)
    const adSetRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
      {
        name: `${campaignName} - ${new Date().toISOString()}`,
        campaign_id: campaignId,
        daily_budget: dailyBudgetCents,
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

    // 5. Create ad creative
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
            description: form.description || ""
          }
        }
      },
      { params: { access_token: userToken } }
    );
    const creativeId = creativeRes.data.id;

    // 6. Create ad
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


// --- CAMPAIGN MGMT (unchanged, just tightened error handling) --- //
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
