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
const { upsertOptimizerCampaignState } = require('../optimizerCampaignState');
const { resolveLocationsToGeoTargeting } = require('../metaGeoTargeting');
// Same multi-alias token resolver the working /facebook/adaccount/:id/launch-campaign
// route uses — a bare ownerKey lookup here misses tokens stored under a different
// session/username alias, which was causing draft creation to 401 for users the
// direct-launch flow could authenticate fine.
const { resolveFacebookTokenFromReq } = require('./auth');

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
   Creates a PAUSED campaign / adset on Meta, plus one creative + ad PER
   entry in creativeSet (or a single ad from the top-level fields when no
   set is given), so the user can review the whole set in Ads Manager
   before committing to a live launch.
   Body: {
     adAccountId, pageId, imageUrl?, primaryText?, headline?,
     destinationUrl?, dailyBudget?, campaignName?, adminClientId?,
     creativeSet?: [{ headline, body, cta, imageUrl, link, angleLabel }]
   }
   Returns: { ok: true, draft: { id, metaCampaignId, metaAdSetId, metaAdIds, ... } }
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/create-draft', async (req, res) => {
  const {
    adAccountId, pageId, imageUrl,
    primaryText, headline, destinationUrl,
    dailyBudget, campaignName, adminClientId,
    creativeSet, targetingLocations,
  } = req.body || {};

  if (!adAccountId) return res.status(400).json({ ok: false, error: 'adAccountId required' });
  if (!pageId) return res.status(400).json({ ok: false, error: 'pageId required' });

  const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req, {
    accountId: adAccountId,
    preferredOwnerKey: adminClientId ? `user:${String(adminClientId).trim()}` : '',
  });

  if (!userToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated with Facebook. Connect Facebook and try again.' });
  }

  const accountId = String(adAccountId).replace(/^act_/, '').trim();
  const pageIdStr = String(pageId).trim();
  const name = String(campaignName || `Draft Review ${new Date().toLocaleDateString()}`).slice(0, 200);
  const budget = Math.max(100, Math.round((parseFloat(dailyBudget) || 5) * 100));

  // One ad per creativeSet entry when a multi-ad test was generated; otherwise
  // fall back to a single ad built from the top-level fields.
  const adsToCreate = Array.isArray(creativeSet) && creativeSet.length > 0
    ? creativeSet.map((c, i) => ({
        headlineText: String(c?.headline || headline || campaignName || 'Learn More').trim(),
        msgText: String(c?.body || primaryText || '').trim(),
        destUrl: String(c?.link || destinationUrl || '').trim(),
        imageUrlFinal: normalizeImageUrl(c?.imageUrl || imageUrl),
        label: String(c?.angleLabel || c?.angle || `Ad ${i + 1}`).trim(),
      }))
    : [{
        headlineText: String(headline || campaignName || 'Learn More').trim(),
        msgText: String(primaryText || '').trim(),
        destUrl: String(destinationUrl || '').trim(),
        imageUrlFinal: normalizeImageUrl(imageUrl),
        label: 'Ad 1',
      }];

  const mkParams = () => ({ access_token: userToken });

  let draftCampaignId = null;
  let draftAdSetId = null;
  const draftCreativeIds = [];
  const draftAdIds = [];

  // Resolve any explicit zip codes/cities BEFORE creating anything on Meta, so a
  // location that fails to resolve is reported back rather than the campaign
  // silently launching nationwide (the previous hardcoded countries:['US']
  // default with no way to target specific areas at all).
  let targetingResolution = { geoLocations: null, resolved: [], failed: [] };
  if (Array.isArray(targetingLocations) && targetingLocations.length > 0) {
    const r = await resolveLocationsToGeoTargeting(targetingLocations, userToken);
    targetingResolution = { geoLocations: Object.keys(r.geoLocations).length ? r.geoLocations : null, resolved: r.resolved, failed: r.failed };
    if (!targetingResolution.geoLocations) {
      return res.json({
        ok: false,
        error: 'None of the provided zip codes/cities could be matched on Meta.',
        resolved: targetingResolution.resolved,
        failed: targetingResolution.failed,
      });
    }
  }

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

    // 2. Create PAUSED adset — shared by every ad in the set
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
        // Only specific zip/city targeting when the caller provided (and Meta
        // resolved) real locations — otherwise fall back to the previous
        // whole-US default so campaigns without explicit targeting still launch.
        geo_locations: targetingResolution.geoLocations || { countries: ['US'] },
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

    // 3. Create one creative + one PAUSED ad per entry in adsToCreate
    for (const a of adsToCreate) {
      const linkData = {
        message: a.msgText || name,
        call_to_action: {
          type: a.destUrl ? 'LEARN_MORE' : 'NO_BUTTON',
          ...(a.destUrl ? { value: { link: a.destUrl } } : {}),
        },
        name: a.headlineText,
        ...(a.destUrl ? { link: a.destUrl } : {}),
        ...(a.imageUrlFinal ? { picture: a.imageUrlFinal } : {}),
      };

      const creativeRes = await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adcreatives`,
        {
          name: `${name} — ${a.label} Creative`,
          object_story_spec: {
            page_id: pageIdStr,
            link_data: linkData,
          },
        },
        { params: mkParams() }
      );
      const creativeId = creativeRes.data?.id;
      if (!creativeId) throw new Error(`Creative creation returned no ID for ${a.label}`);
      draftCreativeIds.push(creativeId);

      const adRes = await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads`,
        {
          name: `${name} — ${a.label}`,
          adset_id: draftAdSetId,
          creative: { creative_id: creativeId },
          status: 'PAUSED',
        },
        { params: mkParams() }
      );
      const adId = adRes.data?.id;
      if (!adId) throw new Error(`Ad creation returned no ID for ${a.label}`);
      draftAdIds.push(adId);
    }

    // 4. Persist draft to LowDB — including the resolved creative content (not just
    // Meta object IDs) so launch-draft can build a proper campaign_creatives record
    // for this specific campaign once activated (that's what the Creatives tab reads).
    await ensureCollections();
    const draft = {
      id: crypto.randomUUID(),
      ownerKey,
      adminClientId: adminClientId || null,
      adAccountId: accountId,
      pageId: pageIdStr,
      metaCampaignId: draftCampaignId,
      metaAdSetId: draftAdSetId,
      metaCreativeIds: draftCreativeIds,
      metaAdIds: draftAdIds,
      // Back-compat single-value fields for any older readers of this record.
      metaCreativeId: draftCreativeIds[0] || null,
      metaAdId: draftAdIds[0] || null,
      campaignName: name,
      status: 'draft_review',
      metaManagerUrl: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId}&selected_campaign_ids=${draftCampaignId}`,
      creativeSet: adsToCreate.map((a, i) => ({
        id: `draft-${i}`,
        angleLabel: a.label,
        headline: a.headlineText,
        body: a.msgText,
        cta: '',
        imageUrl: a.imageUrlFinal,
        link: a.destUrl,
      })),
      targetingResolved: targetingResolution.resolved,
      targetingFailed: targetingResolution.failed,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.data.campaign_drafts.push(draft);
    await db.write();

    console.log('[facebook/create-draft] created PAUSED draft:', {
      ownerKey, accountId, draftCampaignId, draftAdSetId, adCount: draftAdIds.length,
      targetingResolvedCount: targetingResolution.resolved.length,
      targetingFailedCount: targetingResolution.failed.length,
    });

    return res.json({ ok: true, draft, targetingFailed: targetingResolution.failed });
  } catch (err) {
    const metaErr = err?.response?.data?.error;
    console.error('[facebook/create-draft] error:', metaErr || err.message);

    // Best-effort cleanup: delete campaign if any ad failed to create — deleting the
    // campaign cascades to its adsets/creatives/ads on Meta's side.
    if (draftCampaignId && draftAdIds.length < adsToCreate.length) {
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
   POST /api/facebook/delete-draft
   Deletes a PAUSED draft campaign from Meta (cascades to its adsets/ads)
   and removes the local draft record. Never touches Smartemark's own
   creative draft (draftCreatives / creative-draft backend record) — the
   Creatives tab and AI Agent tab creatives are a separate, untouched store.
   Body: { draftId, adminClientId? }
───────────────────────────────────────────────────────────────────────── */
router.post('/facebook/delete-draft', async (req, res) => {
  const { draftId, adminClientId } = req.body || {};
  if (!draftId) return res.status(400).json({ ok: false, error: 'draftId required' });

  const { userToken } = await resolveFacebookTokenFromReq(req, {
    preferredOwnerKey: adminClientId ? `user:${String(adminClientId).trim()}` : '',
  });

  if (!userToken) {
    return res.status(401).json({ ok: false, error: 'Not authenticated with Facebook' });
  }

  await ensureCollections();
  const idx = (db.data.campaign_drafts || []).findIndex((d) => d.id === draftId);
  if (idx === -1) return res.status(404).json({ ok: false, error: 'Draft not found' });
  const draft = db.data.campaign_drafts[idx];

  try {
    if (draft.metaCampaignId) {
      await axios.delete(
        `https://graph.facebook.com/${META_API_VERSION}/${draft.metaCampaignId}`,
        { params: { access_token: userToken } }
      );
    }
  } catch (err) {
    const metaErr = err?.response?.data?.error;
    // If Meta already doesn't have it (e.g. deleted manually in Ads Manager), treat as success.
    if (metaErr?.error_subcode !== 1487534 && metaErr?.code !== 100) {
      console.error('[facebook/delete-draft] error:', metaErr || err.message);
      return res.status(500).json({ ok: false, error: metaErr?.message || err.message || 'Delete failed' });
    }
  }

  db.data.campaign_drafts.splice(idx, 1);
  await db.write();

  console.log('[facebook/delete-draft] deleted draft:', { draftId, metaCampaignId: draft.metaCampaignId });
  return res.json({ ok: true });
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

  const { ownerKey, userToken } = await resolveFacebookTokenFromReq(req, {
    preferredOwnerKey: adminClientId ? `user:${String(adminClientId).trim()}` : '',
  });

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
    // Activate the campaign, the adset, and every ad in the set (draft.metaAdIds —
    // falls back to the single metaAdId field for older draft records).
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

    const adIds = Array.isArray(draft.metaAdIds) && draft.metaAdIds.length > 0
      ? draft.metaAdIds
      : [draft.metaAdId].filter(Boolean);

    for (const adId of adIds) {
      await axios.post(
        `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
        { status: 'ACTIVE' },
        { params: mkParams() }
      );
    }

    draft.status = 'launched';
    draft.launchedAt = new Date().toISOString();
    draft.updatedAt = new Date().toISOString();
    await db.write();

    // Register the now-live campaign for optimizer metrics tracking. Without this
    // record the campaign has no backend state at all — metrics never populate and
    // the frontend has nothing to distinguish it from a draft, so it keeps showing
    // the pre-launch form (budget/name inputs) instead of the campaign dashboard.
    try {
      await upsertOptimizerCampaignState({
        campaignId: draft.metaCampaignId,
        metaCampaignId: draft.metaCampaignId,
        accountId: draft.adAccountId,
        ownerKey,
        pageId: draft.pageId,
        campaignName: draft.campaignName,
        currentStatus: 'ACTIVE',
        optimizationEnabled: false,
        aiSettingsInitialized: false,
        aiApprovalRequired: true,
        billingBlocked: false,
        metricsSnapshot: {},
        publicSummary: {
          headline: 'Monitoring campaign performance',
          subtext: 'Smartemark is preparing to learn from campaign data and improve results over time.',
          stage: 'monitoring',
          tone: 'calm',
          updatedAt: new Date().toISOString(),
          mode: 'public_marketer_summary_v1',
        },
      });
    } catch (stateErr) {
      console.error('[facebook/launch-draft] optimizer state upsert failed:', stateErr?.message);
    }

    // Register the real creative content for this specific campaign — this is what
    // the Creatives tab actually reads (images/headline/body/launchedCreativeSet),
    // not optimizer_campaign_state. Scoped precisely to this campaignId + ownerKey;
    // never touches any other campaign or client's records.
    try {
      await ensureCollections();
      db.data.campaign_creatives = db.data.campaign_creatives || [];
      const adIdsForSet = Array.isArray(draft.metaAdIds) && draft.metaAdIds.length > 0
        ? draft.metaAdIds
        : [draft.metaAdId].filter(Boolean);
      const launchedCreativeSet = (Array.isArray(draft.creativeSet) ? draft.creativeSet : []).map((c, i) => ({
        id: c.id || `launched-${i}`,
        angleLabel: c.angleLabel || `Ad ${i + 1}`,
        headline: c.headline || '',
        body: c.body || '',
        cta: c.cta || '',
        imageUrl: c.imageUrl || '',
        link: c.link || '',
        metaAdId: adIdsForSet[i] || null,
        status: 'active',
      }));

      const nowIso = new Date().toISOString();
      const ccIdx = db.data.campaign_creatives.findIndex(
        (r) => String(r.campaignId || '') === String(draft.metaCampaignId) && String(r.ownerKey || '') === ownerKey
      );
      const ccRecord = {
        ownerKey,
        campaignId: draft.metaCampaignId,
        metaCampaignId: draft.metaCampaignId,
        accountId: draft.adAccountId,
        pageId: draft.pageId,
        name: draft.campaignName,
        status: 'ACTIVE',
        effective_status: 'ACTIVE',
        currentStatus: 'ACTIVE',
        mediaSelection: 'image',
        mediaType: 'image',
        images: launchedCreativeSet.map((c) => c.imageUrl).filter(Boolean),
        launchedCreativeSet: launchedCreativeSet.length > 0 ? launchedCreativeSet : null,
        launchComplete: true,
        isDraft: false,
        smArchived: false,
        hiddenFromHistory: false,
        meta: {
          headline: launchedCreativeSet[0]?.headline || '',
          body: launchedCreativeSet[0]?.body || '',
          link: launchedCreativeSet[0]?.link || '',
        },
        updatedAt: nowIso,
        ...(ccIdx === -1 ? { createdAt: nowIso } : {}),
      };
      if (ccIdx === -1) db.data.campaign_creatives.push(ccRecord);
      else db.data.campaign_creatives[ccIdx] = { ...db.data.campaign_creatives[ccIdx], ...ccRecord };
      await db.write();
    } catch (ccErr) {
      console.error('[facebook/launch-draft] campaign_creatives write failed:', ccErr?.message);
    }

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
