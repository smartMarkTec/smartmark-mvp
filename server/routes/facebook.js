// server/routes/facebook.js
// Selection persistence + draft campaign creation/launch
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { META_API_VERSION } = require('../metaConfig');

const COOKIE_NAME = 'sm_sid';
const SID_HEADER = 'x-sm-sid';

function getSidFromReq(req) {
  return (
    req.cookies?.[COOKIE_NAME] ||
    req.get(SID_HEADER) ||
    String(req.query?.sm_sid || req.query?.sid || '').trim() ||
    ''
  ).trim();
}

function ownerKeyFromReq(req) {
  const sid = getSidFromReq(req);
  try {
    const sess = db?.data?.sessions?.find((s) => String(s.sid) === sid);
    const username = sess?.username ? String(sess.username).trim() : '';
    if (username) return `user:${username}`;
  } catch {}
  return sid || `ip:${req.ip}`;
}

// For admin-client mode, resolve ownerKey as the client's user key.
// For normal user mode, resolve from the request session.
function resolveOwnerKey(req, adminClientId) {
  if (adminClientId) return `user:${String(adminClientId).trim()}`;
  return ownerKeyFromReq(req);
}

async function ensureCollections() {
  try { await db.read(); } catch {}
  db.data = db.data || {};
  if (!Array.isArray(db.data.fb_selections)) db.data.fb_selections = [];
  if (!Array.isArray(db.data.campaign_drafts)) db.data.campaign_drafts = [];
  if (!Array.isArray(db.data.sessions)) db.data.sessions = [];
}

const backendBase = () =>
  process.env.PUBLIC_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  'https://smartmark-mvp.onrender.com';

function normalizeImageUrl(u) {
  const s = String(u || '').trim();
  if (!s || /^blob:/i.test(s) || /^data:/i.test(s)) return '';
  if (!/^https?:\/\//i.test(s)) {
    const rel = s.startsWith('/') ? s : `/${s}`;
    return `${backendBase()}${rel}`;
  }
  return s;
}

/* ─────────────────────────────────────────────────────────────────────────
   GET /api/facebook/selection
   Returns the saved ad account + page selection for the caller.
   Query params:
     adminClientId — if set, returns the selection for that client (username)
───────────────────────────────────────────────────────────────────────── */
router.get('/facebook/selection', async (req, res) => {
  const adminClientId = String(req.query?.adminClientId || '').trim();
  const ownerKey = resolveOwnerKey(req, adminClientId);

  await ensureCollections();
  const rec = (db.data.fb_selections || []).find((s) => s.ownerKey === ownerKey) || null;

  return res.json({
    ok: true,
    adAccountId: rec?.adAccountId || null,
    pageId: rec?.pageId || null,
    adAccountName: rec?.adAccountName || null,
    pageName: rec?.pageName || null,
    updatedAt: rec?.updatedAt || null,
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/facebook/selection
   Saves the selected ad account and/or page to LowDB.
   Body: { adAccountId, pageId, adAccountName?, pageName?, adminClientId? }
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/selection', async (req, res) => {
  const { adAccountId, pageId, adAccountName, pageName, adminClientId } = req.body || {};
  const ownerKey = resolveOwnerKey(req, adminClientId);

  if (!adAccountId && !pageId) {
    return res.status(400).json({ ok: false, error: 'adAccountId or pageId required' });
  }

  await ensureCollections();

  const normalizedAccountId = String(adAccountId || '').replace(/^act_/, '').trim();
  const normalizedPageId = String(pageId || '').trim();

  const existing = (db.data.fb_selections || []).find((s) => s.ownerKey === ownerKey);
  if (existing) {
    if (normalizedAccountId) existing.adAccountId = normalizedAccountId;
    if (normalizedPageId) existing.pageId = normalizedPageId;
    if (adAccountName) existing.adAccountName = String(adAccountName).trim();
    if (pageName) existing.pageName = String(pageName).trim();
    existing.updatedAt = new Date().toISOString();
  } else {
    db.data.fb_selections.push({
      id: crypto.randomUUID(),
      ownerKey,
      adAccountId: normalizedAccountId,
      pageId: normalizedPageId,
      adAccountName: adAccountName ? String(adAccountName).trim() : null,
      pageName: pageName ? String(pageName).trim() : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  await db.write();
  return res.json({ ok: true, adAccountId: normalizedAccountId, pageId: normalizedPageId });
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/facebook/create-draft
   Creates a PAUSED campaign / adset / creative / ad on Meta so the user
   can review it in Ads Manager before committing to a live launch.
   Body: {
     adAccountId, pageId, imageUrl?, primaryText?, headline?,
     destinationUrl?, dailyBudget?, campaignName?, adminClientId?
   }
   Returns: { ok: true, draft: { id, metaCampaignId, metaAdSetId, metaAdId, ... } }
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/create-draft', async (req, res) => {
  const {
    adAccountId, pageId, imageUrl,
    primaryText, headline, destinationUrl,
    dailyBudget, campaignName, adminClientId,
  } = req.body || {};

  if (!adAccountId) return res.status(400).json({ ok: false, error: 'adAccountId required' });
  if (!pageId) return res.status(400).json({ ok: false, error: 'pageId required' });

  const ownerKey = resolveOwnerKey(req, adminClientId);
  const userToken = getFbUserToken(ownerKey);

  if (!userToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated with Facebook. Connect Facebook and try again.' });
  }

  const accountId = String(adAccountId).replace(/^act_/, '').trim();
  const pageIdStr = String(pageId).trim();
  const destUrl = String(destinationUrl || '').trim();
  const msgText = String(primaryText || '').trim();
  const headlineText = String(headline || campaignName || 'Learn More').trim();
  const name = String(campaignName || `Draft Review ${new Date().toLocaleDateString()}`).slice(0, 200);
  const budget = Math.max(100, Math.round((parseFloat(dailyBudget) || 5) * 100));
  const imageUrlFinal = normalizeImageUrl(imageUrl);

  const mkParams = () => ({ access_token: userToken });

  let draftCampaignId = null;
  let draftAdSetId = null;
  let draftCreativeId = null;
  let draftAdId = null;

  try {
    // 1. Create PAUSED campaign
    const campaignRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns`,
      {
        name,
        objective: 'OUTCOME_TRAFFIC',
        status: 'PAUSED',
        special_ad_categories: [],
      },
      { params: mkParams() }
    );
    draftCampaignId = campaignRes.data?.id;
    if (!draftCampaignId) throw new Error('Campaign creation returned no ID');

    // 2. Create PAUSED adset
    const adSetRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adsets`,
      {
        name: `${name} — Ad Set`,
        campaign_id: draftCampaignId,
        daily_budget: budget,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        status: 'PAUSED',
        targeting: {
          geo_locations: { countries: ['US'] },
          age_min: 18,
          age_max: 65,
        },
      },
      { params: mkParams() }
    );
    draftAdSetId = adSetRes.data?.id;
    if (!draftAdSetId) throw new Error('Ad set creation returned no ID');

    // 3. Create creative
    const linkData = {
      message: msgText || name,
      call_to_action: {
        type: destUrl ? 'LEARN_MORE' : 'NO_BUTTON',
        ...(destUrl ? { value: { link: destUrl } } : {}),
      },
      name: headlineText,
      ...(destUrl ? { link: destUrl } : {}),
      ...(imageUrlFinal ? { picture: imageUrlFinal } : {}),
    };

    const creativeRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adcreatives`,
      {
        name: `${name} — Creative`,
        object_story_spec: {
          page_id: pageIdStr,
          link_data: linkData,
        },
      },
      { params: mkParams() }
    );
    draftCreativeId = creativeRes.data?.id;
    if (!draftCreativeId) throw new Error('Creative creation returned no ID');

    // 4. Create PAUSED ad
    const adRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads`,
      {
        name: `${name} — Ad`,
        adset_id: draftAdSetId,
        creative: { creative_id: draftCreativeId },
        status: 'PAUSED',
      },
      { params: mkParams() }
    );
    draftAdId = adRes.data?.id;
    if (!draftAdId) throw new Error('Ad creation returned no ID');

    // 5. Persist draft to LowDB
    await ensureCollections();
    const draft = {
      id: crypto.randomUUID(),
      ownerKey,
      adminClientId: adminClientId || null,
      adAccountId: accountId,
      pageId: pageIdStr,
      metaCampaignId: draftCampaignId,
      metaAdSetId: draftAdSetId,
      metaCreativeId: draftCreativeId,
      metaAdId: draftAdId,
      campaignName: name,
      status: 'draft_review',
      metaManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId}&selected_campaign_ids=${draftCampaignId}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.data.campaign_drafts.push(draft);
    await db.write();

    console.log('[facebook/create-draft] created PAUSED draft:', {
      ownerKey, accountId, draftCampaignId, draftAdSetId, draftAdId,
    });

    return res.json({ ok: true, draft });
  } catch (err) {
    const metaErr = err?.response?.data?.error;
    console.error('[facebook/create-draft] error:', metaErr || err.message);

    // Best-effort cleanup: delete campaign if downstream object creation failed
    if (draftCampaignId && !draftAdId) {
      try {
        await axios.delete(
          `https://graph.facebook.com/${META_API_VERSION}/${draftCampaignId}`,
          { params: mkParams() }
        );
      } catch {}
    }

    return res.status(500).json({
      ok: false,
      error: metaErr?.message || err.message || 'Draft creation failed',
      metaErrorCode: metaErr?.code || null,
      metaErrorType: metaErr?.type || null,
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/facebook/launch-draft
   Activates a previously created PAUSED draft (campaign → adset → ad).
   Body: { draftId, adminClientId? }
   Returns: { ok: true, draft }
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/launch-draft', async (req, res) => {
  const { draftId, adminClientId } = req.body || {};
  if (!draftId) return res.status(400).json({ ok: false, error: 'draftId required' });

  const ownerKey = resolveOwnerKey(req, adminClientId);
  const userToken = getFbUserToken(ownerKey);

  if (!userToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated with Facebook' });
  }

  await ensureCollections();
  const draft = (db.data.campaign_drafts || []).find((d) => d.id === draftId);
  if (!draft) return res.status(404).json({ ok: false, error: 'Draft not found' });
  if (draft.status === 'launched') {
    return res.json({ ok: true, draft, alreadyLaunched: true });
  }

  const mkParams = () => ({ access_token: userToken });

  try {
    // Activate all three objects in order
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${draft.metaCampaignId}`,
      { status: 'ACTIVE' },
      { params: mkParams() }
    );
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${draft.metaAdSetId}`,
      { status: 'ACTIVE' },
      { params: mkParams() }
    );
    await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/${draft.metaAdId}`,
      { status: 'ACTIVE' },
      { params: mkParams() }
    );

    draft.status = 'launched';
    draft.launchedAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    await db.write();

    console.log('[facebook/launch-draft] activated draft:', { ownerKey, draftId, metaCampaignId: draft.metaCampaignId });

    return res.json({ ok: true, draft });
  } catch (err) {
    const metaErr = err?.response?.data?.error;
    console.error('[facebook/launch-draft] error:', metaErr || err.message);
    return res.status(500).json({
      ok: false,
      error: metaErr?.message || err.message || 'Launch failed',
      metaErrorCode: metaErr?.code || null,
    });
  }
});

module.exports = router;
