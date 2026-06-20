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
   When adminClientId is provided, the requester must be an admin — the
   selection is saved under the CLIENT's ownerKey, not the admin's.
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/selection', async (req, res) => {
  const { adAccountId, pageId, adAccountName, pageName, adminClientId } = req.body || {};

  // If adminClientId is present, verify the requester is admin before allowing
  // a cross-user write (prevents any authenticated user from overwriting another's selection).
  if (adminClientId) {
    await ensureCollections();
    const sid = getSidFromReq(req);
    const ADMIN_UN = process.env.ADMIN_BYPASS_USERNAME || 'TheBoss';
    try {
      const sess = (db.data.sessions || []).find((s) => String(s.sid) === sid);
      const username = String(sess?.username || '').trim();
      const user = (db.data.users || []).find((u) => String(u?.username || '').trim() === username);
      const isAdmin = username === ADMIN_UN || user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ ok: false, error: 'Admin access required for cross-user selection save.' });
      }
    } catch {
      return res.status(403).json({ ok: false, error: 'Could not verify admin status.' });
    }
  }

  const ownerKey = resolveOwnerKey(req, adminClientId);
  console.log('[FB Selection API] saving for ownerKey:', ownerKey);

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
    // is_adset_budget_sharing_enabled: false tells Meta budgets live on adsets, not campaign.
    // Some Meta accounts accept only string "false"; send both boolean and string-coerced.
    const draftCampaignPayload = {
      name,
      objective: 'OUTCOME_TRAFFIC',
      status: 'PAUSED',
      special_ad_categories: [],
      is_adset_budget_sharing_enabled: false,
    };
    console.log('[facebook/create-draft][campaignPayload]', JSON.stringify(draftCampaignPayload));

    const campaignRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/campaigns`,
      draftCampaignPayload,
      { params: mkParams() }
    );
    draftCampaignId = campaignRes.data?.id;
    if (!draftCampaignId) throw new Error('Campaign creation returned no ID');

    // 2. Create PAUSED adset
    const draftAdsetPayload = {
      name: `${name} — Ad Set`,
      campaign_id: draftCampaignId,
      daily_budget: budget,
      billing_event: 'IMPRESSIONS',
      optimization_goal: 'LINK_CLICKS',
      bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      status: 'PAUSED',
      is_adset_budget_sharing_enabled: false,
      targeting: {
        geo_locations: { countries: ['US'] },
        age_min: 18,
        age_max: 65,
      },
    };
    console.log('[facebook/create-draft][adsetPayload]', JSON.stringify(draftAdsetPayload));

    const adSetRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adsets`,
      draftAdsetPayload,
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

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/facebook/multi-area-launch
   Launches one Meta campaign per area entry, using the caller's existing
   single-campaign flow as the engine for each area. Grouping metadata is
   saved on every resulting campaign record so the dashboard can group them.

   Payload:
   {
     adAccountId, pageId,
     launchMode: "multi_area",
     parentCampaignGroupName,
     areaCampaigns: [
       { areaKey, areaName, monthlyBudget, dailyBudget, offer, priceLine,
         destinationUrl, targetingLocations: [...] }
     ],
     // shared creative / copy fields forwarded as-is to each child launch:
     form, answers, adCopy, imageVariants, mediaSelection, ...
   }

   Body may also include ownerKey (for admin-client forwarding from the admin
   route below). Non-admin callers must be authenticated via session cookie/header.

   Partial success: if some areas launch and others fail, ok:true is returned
   with partialSuccess:true. Do NOT automatically roll back already-created
   Meta campaigns — that is a human decision.
─────────────────────────────────────────────────────────────────────────── */
router.post('/facebook/multi-area-launch', async (req, res) => {
  const {
    adAccountId,
    pageId,
    launchMode,
    parentCampaignGroupName,
    areaCampaigns,
    ownerKey: bodyOwnerKey,
    adminClientId: bodyAdminClientId,
    ...sharedPayload
  } = req.body || {};

  if (launchMode !== 'multi_area') {
    return res.status(400).json({ ok: false, error: 'launchMode must be "multi_area".' });
  }

  if (!Array.isArray(areaCampaigns) || areaCampaigns.length === 0) {
    return res.status(400).json({ ok: false, error: 'areaCampaigns must be a non-empty array.' });
  }

  const normalizedAccountId = String(adAccountId || '').replace(/^act_/, '').trim();
  if (!normalizedAccountId) {
    return res.status(400).json({ ok: false, error: 'adAccountId is required.' });
  }

  const callerSid = getSidFromReq(req);

  const selfBase =
    process.env.RENDER_EXTERNAL_URL ||
    process.env.PUBLIC_BASE_URL ||
    `http://localhost:${process.env.PORT || 5176}`;

  const parentCampaignGroupId = `multi-area-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  console.log('[MULTI_AREA_LAUNCH_START]', {
    adAccountId: normalizedAccountId,
    parentCampaignGroupName,
    parentCampaignGroupId,
    areaCount: areaCampaigns.length,
    callerHasSid: !!callerSid,
    hasBodyOwnerKey: !!bodyOwnerKey,
  });

  const results = [];
  const errors = [];

  for (const area of areaCampaigns) {
    const areaKey  = String(area.areaKey  || '').trim();
    const areaName = String(area.areaName || '').trim();

    console.log('[MULTI_AREA_CHILD_LAUNCH_START]', { areaKey, areaName });

    try {
      // Derive a primary city for the existing single-launch geo lookup.
      // The single launch route resolves one city + 50-mile radius from
      // bodyAnswers.city + bodyAnswers.state. We pick the first location in
      // the area's targetingLocations list as the anchor city.
      const firstLoc = Array.isArray(area.targetingLocations) && area.targetingLocations[0]
        ? String(area.targetingLocations[0]).trim()
        : areaName;
      // Strip anything after a comma (e.g. "Austin, TX" → "Austin")
      const anchorCity = firstLoc.split(',')[0].trim();

      const areaPayload = {
        ...sharedPayload,
        form: {
          ...(sharedPayload.form || {}),
          campaignName: `${parentCampaignGroupName || 'Campaign'} — ${areaName}`,
          websiteUrl: area.destinationUrl,
          url:        area.destinationUrl,
        },
        budget:     area.dailyBudget,
        pageId:     pageId || sharedPayload.pageId,
        websiteUrl: area.destinationUrl,
        answers: {
          ...(sharedPayload.answers || {}),
          city:  anchorCity,
          state: 'TX',
          offer: String(area.offer || sharedPayload.answers?.offer || '').trim(),
        },
        // Pass ownerKey through so the single-launch route can resolve the
        // right FB token (required for admin-client mode).
        ...(bodyOwnerKey ? { ownerKey: bodyOwnerKey } : {}),
      };

      const launchResp = await axios.post(
        `${selfBase}/auth/facebook/adaccount/${normalizedAccountId}/launch-campaign`,
        areaPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            [SID_HEADER]: callerSid || '',
            Cookie: req.headers.cookie || '',
          },
          timeout: 90000,
        }
      );

      const data = launchResp.data || {};
      console.log('[MULTI_AREA_CHILD_LAUNCHED]', {
        areaKey,
        areaName,
        campaignId: data.campaignId,
      });

      // Patch the campaign record with grouping metadata so the dashboard
      // can group children under the parent group.
      if (data.campaignId) {
        try {
          await ensureCollections();
          const cIdx = (db.data.campaign_creatives || []).findIndex(
            (c) => String(c.campaignId || '') === String(data.campaignId)
          );
          if (cIdx !== -1) {
            Object.assign(db.data.campaign_creatives[cIdx], {
              parentCampaignGroupId,
              parentCampaignGroupName: String(parentCampaignGroupName || ''),
              areaKey,
              areaName,
              isMultiAreaChild: true,
            });
          }

          const optArr = db.data.optimizer_campaign_state || [];
          const oIdx = optArr.findIndex(
            (s) => String(s.campaignId || '') === String(data.campaignId)
          );
          if (oIdx !== -1) {
            Object.assign(optArr[oIdx], {
              parentCampaignGroupId,
              parentCampaignGroupName: String(parentCampaignGroupName || ''),
              areaKey,
              areaName,
              isMultiAreaChild: true,
            });
          }

          await db.write();
        } catch (patchErr) {
          // Non-fatal — campaign already launched, grouping metadata can be applied later
          console.error('[MULTI_AREA] grouping-metadata patch failed:', patchErr?.message);
        }
      }

      results.push({
        areaKey,
        areaName,
        ok:         true,
        campaignId: data.campaignId,
        campaignName: data.campaignName,
        adSetIds:   data.adSetIds,
        adIds:      data.adIds,
      });
    } catch (err) {
      const upstream = err?.response?.data;
      const errMsg   = String(upstream?.error || err?.message || 'Launch failed').trim();
      console.error('[MULTI_AREA_CHILD_LAUNCH_FAILED]', { areaKey, areaName, error: errMsg });
      errors.push({ areaKey, areaName, ok: false, error: errMsg });
    }
  }

  const partialFail = errors.length > 0 && results.length > 0;
  const allFailed   = errors.length > 0 && results.length === 0;

  if (partialFail) {
    console.log('[MULTI_AREA_LAUNCH_PARTIAL_FAIL]', {
      parentCampaignGroupId,
      parentCampaignGroupName,
      launched: results.length,
      failed:   errors.length,
    });
  } else if (!allFailed) {
    console.log('[MULTI_AREA_LAUNCH_DONE]', {
      parentCampaignGroupId,
      parentCampaignGroupName,
      launched: results.length,
    });
  } else {
    console.log('[MULTI_AREA_LAUNCH_PARTIAL_FAIL]', {
      parentCampaignGroupId,
      parentCampaignGroupName,
      launched: 0,
      failed:   errors.length,
    });
  }

  return res.status(allFailed ? 500 : 200).json({
    ok:                    !allFailed,
    partialSuccess:        partialFail,
    parentCampaignGroupId,
    parentCampaignGroupName,
    results,
    errors,
  });
});

module.exports = router;
