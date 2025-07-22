const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Buffer } = require('buffer'); // Needed for base64 image upload

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

let userTokens = {}; // MVP

// Step 1: Redirect to Facebook OAuth
router.get('/facebook', (req, res) => {
  const fbAuthUrl =
    `https://www.facebook.com/v18.0/dialog/oauth?client_id=${FACEBOOK_APP_ID}&redirect_uri=${encodeURIComponent(FACEBOOK_REDIRECT_URI)}&scope=${FB_SCOPES.join(',')}`;
  res.redirect(fbAuthUrl);
});

// Step 2: Facebook callback — exchange code for access_token
router.get('/facebook/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const tokenRes = await axios.get(
      `https://graph.facebook.com/v18.0/oauth/access_token`, {
        params: {
          client_id: FACEBOOK_APP_ID,
          redirect_uri: FACEBOOK_REDIRECT_URI,
          client_secret: FACEBOOK_APP_SECRET,
          code
        }
      }
    );
    userTokens['singleton'] = tokenRes.data.access_token;
    return res.redirect(`${FRONTEND_URL}/setup?facebook_connected=1`);
  } catch (err) {
    return res.status(500).send('Facebook Auth Failed');
  }
});

// Get all ad accounts for user
router.get('/facebook/adaccounts', async (req, res) => {
  const userToken = userTokens['singleton'];
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const accountRes = await axios.get(
      `https://graph.facebook.com/v18.0/me/adaccounts`, {
        params: { access_token: userToken }
      }
    );
    res.json(accountRes.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
});

// Get Facebook Pages the user manages
router.get('/facebook/pages', async (req, res) => {
  const userToken = userTokens['singleton'];
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });
  try {
    const pagesRes = await axios.get(
      `https://graph.facebook.com/v18.0/me/accounts`, {
        params: { access_token: userToken }
      }
    );
    res.json(pagesRes.data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch Facebook Pages' });
  }
});

// LAUNCH A FACEBOOK CAMPAIGN (ACTIVE + IMAGE UPLOAD)
router.post('/facebook/adaccount/:accountId/launch-campaign', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  // Pull details from the request body
  const { form, budget, adCopy, adImage, campaignType, pageId } = req.body;

  try {
    // --- STEP 1: UPLOAD IMAGE TO FACEBOOK ---
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

    // --- STEP 2: CREATE CAMPAIGN (ACTIVE) ---
    const campaignRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      {
        name: form.businessName || "SmartMark Campaign",
        objective: "OUTCOME_TRAFFIC",
        status: "ACTIVE",
        special_ad_categories: []
      },
      { params: { access_token: userToken } }
    );
    const campaignId = campaignRes.data.id;

    // --- STEP 3: CREATE AD SET (ACTIVE) ---
    const adSetRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adsets`,
      {
        name: `${form.businessName || "Ad Set"} - ${new Date().toISOString()}`,
        campaign_id: campaignId,
        daily_budget: Math.round(parseFloat(budget) * 100),
        billing_event: "IMPRESSIONS",
        optimization_goal: "LINK_CLICKS",
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        status: "ACTIVE",
        start_time: new Date(Date.now() + 60 * 1000).toISOString(),
        end_time: null,
        targeting: {
          geo_locations: { countries: ["US"] },
          age_min: 18,
          age_max: 65
        }
      },
      { params: { access_token: userToken } }
    );
    const adSetId = adSetRes.data.id;

    // --- STEP 4: CREATE AD CREATIVE (with image_hash) ---
    const creativeRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
      {
        name: `${form.businessName || "Ad Creative"} - ${new Date().toISOString()}`,
        object_story_spec: {
          page_id: pageId,
          link_data: {
            message: adCopy,
            link: form.url || "https://your-smartmark-site.com",
            image_hash: imageHash,
            caption: form.businessName || "",
            description: form.description || ""
          }
        }
      },
      { params: { access_token: userToken } }
    );
    const creativeId = creativeRes.data.id;

    // --- STEP 5: CREATE THE AD (ACTIVE) ---
    const adRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${accountId}/ads`,
      {
        name: `${form.businessName || "Ad"} - ${new Date().toISOString()}`,
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

// List all campaigns for an ad account
router.get('/facebook/adaccount/:accountId/campaigns', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId } = req.params;
  if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

  try {
    const response = await axios.get(
      `https://graph.facebook.com/v18.0/act_${accountId}/campaigns`,
      { params: { access_token: userToken, fields: 'id,name,status' } }
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

// Get campaign details (status, etc)
router.get('/facebook/adaccount/:accountId/campaign/:campaignId/details', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId, campaignId } = req.params;
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

// Get campaign metrics/insights (impressions, clicks, etc)
router.get('/facebook/adaccount/:accountId/campaign/:campaignId/metrics', async (req, res) => {
  const userToken = userTokens['singleton'];
  const { accountId, campaignId } = req.params;
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

module.exports = router;
