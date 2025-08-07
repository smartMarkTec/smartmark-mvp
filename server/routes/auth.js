const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer');
const db = require('../db'); // LOWDB
const FormData = require('form-data');

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
  if (!db.data.users) db.data.users = []; // --- PATCHED LINE ---
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

// ====== LAUNCH CAMPAIGN (Create separate ad sets for image and video) ======
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  const { form = {}, budget, adCopy, adImage, adVideo, campaignType, pageId, aiAudience: aiAudienceRaw } = req.body;
  const campaignName = form.campaignName || form.businessName || "SmartMark Campaign";
  let aiAudience = null;
  try {
    if (typeof aiAudienceRaw === "string") {
      aiAudience = JSON.parse(aiAudienceRaw);
    } else if (typeof aiAudienceRaw === "object" && aiAudienceRaw !== null) {
      aiAudience = aiAudienceRaw;
    }
  } catch { aiAudience = null; }

  // === Build targeting as you did before ===
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
    // For country codes like "CA", "GB"
    targeting.geo_locations = { countries: [aiAudience.location.trim().toUpperCase()] };
  } else {
    // Default: use countries with upper-case
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
        {
          params: {
            type: 'adinterest',
            q: name,
            access_token: userToken
          }
        }
      );
      if (fbRes.data && fbRes.data.data && fbRes.data.data.length > 0) {
        fbInterestIds.push(fbRes.data.data[0].id);
      }
    } catch (e) {
      console.warn("FB interest search failed for:", name, e.message);
    }
  }
  if (fbInterestIds.length > 0) {
    targeting.flexible_spec = [{ interests: fbInterestIds.map(id => ({ id })) }];
  }
}


try {
  // 1. Upload creatives
  let imageHash = null, videoId = null;

  // IMAGE
  if (adImage && adImage.startsWith("data:")) {
    const matches = adImage.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid image data.");
    const base64Data = matches[2];
    const fbImageRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adimages`,
      new URLSearchParams({ bytes: base64Data }),
      {
        headers: { Authorization: undefined, 'Content-Type': 'application/x-www-form-urlencoded' },
        params: { access_token: userToken }
      }
    );
    const imgData = fbImageRes.data.images;
    imageHash = Object.values(imgData)[0]?.hash;
    if (!imageHash) throw new Error("Failed to upload image to Facebook.");
    console.log("[launch-campaign] Uploaded imageHash:", imageHash);
  }

// VIDEO (chunked upload, robust for Facebook advideos)
if (adVideo && adVideo.startsWith("data:")) {
  try {
    // --- 1. Get the PAGE access token (not user token!) ---
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`,
      { params: { access_token: userToken, fields: 'id,name,access_token' } }
    );
    const pages = pagesRes.data.data || [];
    const page = pages.find(p => p.id === pageId);
    const pageToken = page ? page.access_token : null;
    if (!pageToken) throw new Error('Could not find page access token for video upload.');

    // --- 1.1 DEBUG: Check if the token has pages_manage_metadata ---
    try {
      const debugRes = await axios.get(
        `https://graph.facebook.com/debug_token`,
        {
          params: {
            input_token: pageToken,
            access_token: `${FACEBOOK_APP_ID}|${FACEBOOK_APP_SECRET}`,
          },
        }
      );
      if (
        !debugRes.data.data.is_valid ||
        !debugRes.data.data.scopes.includes('pages_manage_metadata')
      ) {
        throw new Error('Page access token is missing required permissions: pages_manage_metadata. Please remove and re-add the app, then approve all permissions for your page.');
      }
    } catch (permCheckErr) {
      throw new Error(
        "Page token is missing the required 'pages_manage_metadata' permission. " +
        "Remove and re-add the app, make sure all permissions are granted, and select the right page."
      );
    }

    const matches = adVideo.match(/^data:(video\/\w+);base64,(.+)$/);
    if (!matches) throw new Error("Invalid video data.");
    const base64Video = matches[2];
    const videoBuffer = Buffer.from(base64Video, "base64");
    const totalBytes = videoBuffer.length;

    // --- 2. Start upload session with PAGE token ---
    const startRes = await axios.post(
      `https://graph.facebook.com/v18.0/advideos?access_token=${pageToken}`,
      new URLSearchParams({
        file_size: totalBytes,
        upload_phase: "start"
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const uploadSessionId = startRes.data.upload_session_id;
    let start_offset = parseInt(startRes.data.start_offset, 10);
    let end_offset = parseInt(startRes.data.end_offset, 10);

    // --- 3. Transfer chunks ---
    while (start_offset < end_offset) {
      const chunk = videoBuffer.slice(start_offset, end_offset);
      const form = new FormData();
      form.append('upload_phase', 'transfer');
      form.append('upload_session_id', uploadSessionId);
      form.append('start_offset', start_offset.toString());
      form.append('video_file_chunk', chunk, { filename: 'video.mp4' });

      const transferRes = await axios.post(
        `https://graph.facebook.com/v18.0/advideos?access_token=${pageToken}`,
        form,
        { headers: form.getHeaders() }
      );
      start_offset = parseInt(transferRes.data.start_offset, 10);
      end_offset = parseInt(transferRes.data.end_offset, 10);
    }

    // --- 4. Finish phase ---
    const finishRes = await axios.post(
      `https://graph.facebook.com/v18.0/advideos?access_token=${pageToken}`,
      new URLSearchParams({
        upload_phase: "finish",
        upload_session_id: uploadSessionId
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    videoId = finishRes.data.video_id || null;

    if (!videoId) {
      throw new Error("No videoId returned after finish phase! " + JSON.stringify(finishRes.data));
    }
    console.log("[launch-campaign] Uploaded videoId:", videoId);
  } catch (e) {
    console.error("[launch-campaign] Video upload failed:", e?.response?.data || e?.message || e);
    videoId = null; // Continue with just image if needed
  }
}





  // --- log final state ---
  console.log(`[launch-campaign] Finished uploads | imageHash: ${imageHash || "null"} | videoId: ${videoId || "null"}`);

  // (continue your campaign/ad set logic below here...)

  // ...the rest of your code below remains unchanged...




    // 2. Create Campaign
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

    let adSetIds = [], creativeIds = [], adIds = [];
    let dailyBudgetCents = Math.round(parseFloat(budget) * 100);

    // 3. For each creative, create an ad set and ad
    if (imageHash) {
      // Image Ad Set
      let imgAdSetRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
          campaign_id: campaignId,
          daily_budget: dailyBudgetCents,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "ACTIVE",
          start_time: new Date(Date.now() + 60 * 1000).toISOString(),
          targeting: { ...targeting, publisher_platforms: ["facebook", "instagram"], facebook_positions: ["feed"], audience_network_positions: [], instagram_positions: ["stream"] },
        },
        { params: { access_token: userToken } }
      );
      let adSetId = imgAdSetRes.data.id;
      adSetIds.push(adSetId);

      // Create Ad Creative for Image
      let creativeRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
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
      let creativeId = creativeRes.data.id;
      creativeIds.push(creativeId);

      // Create Ad for Image
      let adRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
        {
          name: `${campaignName} (Image) - ${new Date().toISOString()}`,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: "ACTIVE"
        },
        { params: { access_token: userToken } }
      );
      adIds.push(adRes.data.id);
    }

    if (videoId) {
      // Video Ad Set
      let vidAdSetRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          campaign_id: campaignId,
          daily_budget: dailyBudgetCents,
          billing_event: "IMPRESSIONS",
          optimization_goal: "LINK_CLICKS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          status: "ACTIVE",
          start_time: new Date(Date.now() + 60 * 1000).toISOString(),
          targeting: { ...targeting, publisher_platforms: ["facebook", "audience_network", "instagram"], facebook_positions: ["feed", "instream_video"], audience_network_positions: ["rewarded_video"], instagram_positions: ["stream", "reels", "story"] },
        },
        { params: { access_token: userToken } }
      );
      let adSetId = vidAdSetRes.data.id;
      adSetIds.push(adSetId);

      // Create Ad Creative for Video
      let creativeRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          object_story_spec: {
            page_id: pageId,
            video_data: {
              video_id: videoId,
              message: adCopy,
              title: campaignName,
              description: form.description || "",
              link: form.url || "https://your-smartmark-site.com"
            }
          }
        },
        { params: { access_token: userToken } }
      );
      let creativeId = creativeRes.data.id;
      creativeIds.push(creativeId);

      // Create Ad for Video
      let adRes = await axios.post(
        `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
        {
          name: `${campaignName} (Video) - ${new Date().toISOString()}`,
          adset_id: adSetId,
          creative: { creative_id: creativeId },
          status: "ACTIVE"
        },
        { params: { access_token: userToken } }
      );
      adIds.push(adRes.data.id);
    }

    // Done
    res.json({
      success: true,
      campaignId,
      adSetIds,
      creativeIds,
      adIds,
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

// ====== FACEBOOK API TEST ROUTES (for permissions/feature validation) ======

// Test pages_manage_metadata (update page about)
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

// Test read_insights
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

// Test pages_read_user_content (read conversations)
router.get('/facebook/test-pages-read-user-content/:pageId', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.get(
      `https://graph.facebook.com/v18.0/${pageId}/conversations`,
      { params: { access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "pages_read_user_content test failed" });
  }
});

// Test pages_manage_posts (create a post)
router.post('/facebook/test-pages-manage-posts/:pageId', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { pageId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.post(
      `https://graph.facebook.com/v18.0/${pageId}/feed`,
      { message: "SmartMark test post" },
      { params: { access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "pages_manage_posts test failed" });
  }
});

// Test pages_manage_engagement (reply to a comment)
router.post('/facebook/test-pages-manage-engagement/:commentId', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { commentId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const result = await axios.post(
      `https://graph.facebook.com/v18.0/${commentId}/comments`,
      { message: "SmartMark test reply" },
      { params: { access_token: userToken } }
    );
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.response?.data?.error?.message || "pages_manage_engagement test failed" });
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
