'use strict';

/**
 * Campaign context + AI action proposal routes.
 *
 * Campaign context: structured intake/objective data collected during the
 * FormPage flow. Saved by the frontend before navigating to /setup, and read
 * by the Ad Agent to give context-aware answers.
 *
 * AI action proposals: approval-mode queue for AI-recommended changes. The
 * AI creates a proposal; the user approves or rejects it before any live Meta
 * change happens.
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { nanoid } = require('nanoid');
const { getFbUserToken } = require('../tokenStore');
const { META_API_VERSION } = require('../metaConfig');
const { executeAction } = require('../optimizerAction');
const { generateOpenAIAdImageBuffers } = require('./staticAds');
const {
  findOptimizerCampaignStateByCampaignId,
  updateOptimizerCampaignState,
  appendAiHistoryEntry,
} = require('../optimizerCampaignState');

// Extracts the creative patch fields from an executeAction result.
function buildCreativePatch(action) {
  const result = action?.actionResult || null;
  const imageUrls = Array.isArray(result?.imageUrls)
    ? result.imageUrls.filter(Boolean)
    : Array.isArray(result?.sourceGeneratedCreatives)
    ? result.sourceGeneratedCreatives.filter(Boolean)
    : [];
  const patch = {};
  if (result?.pendingCreativeTest && typeof result.pendingCreativeTest === 'object') {
    patch.pendingCreativeTest = result.pendingCreativeTest;
  } else if (imageUrls.length) {
    patch.pendingCreativeTest = {
      status: 'ready',
      sourceActionType: 'generate_single_creative_variant',
      variantCount: imageUrls.length,
      creativeGoal:      String(result?.creativeGoal || '').trim(),
      generationReason:  String(result?.generationReason || '').trim(),
      generatedAt:       String(action?.generatedAt || new Date().toISOString()).trim(),
      imageUrls,
    };
  }
  if (imageUrls.length) {
    patch.latestCreativeMeta = {
      sourceActionType:  'generate_single_creative_variant',
      creativeGoal:      String(result?.creativeGoal || '').trim(),
      generationReason:  String(result?.generationReason || '').trim(),
      generatedAt:       String(action?.generatedAt || new Date().toISOString()).trim(),
      imageUrls,
    };
  }
  return patch;
}

// ── Auth helpers (same pattern as campaigns.js / adAgent.js) ─────────────────
const COOKIE_NAME = 'sm_sid';
const SID_HEADER  = 'x-sm-sid';

function getSidFromReq(req) {
  return (
    req.cookies?.[COOKIE_NAME] ||
    req.get(SID_HEADER) ||
    String(req.query?.sm_sid || '').trim() ||
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
  return sid ? `ip:${sid}` : null;
}

async function ensureData() {
  await db.read();
  db.data.campaign_contexts   ||= [];
  db.data.ai_action_proposals ||= [];
  db.data.creative_drafts     ||= [];
  db.data.users               ||= [];
  db.data.sessions            ||= [];
}

// ── Admin helpers ─────────────────────────────────────────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_BYPASS_USERNAME || 'TheBoss';

function isAdminOwnerKey(ownerKey) {
  if (!ownerKey || !ownerKey.startsWith('user:')) return false;
  const username = ownerKey.slice('user:'.length).trim();
  const user = (db.data?.users || []).find(
    (u) => String(u?.username || '').trim() === username
  );
  if (!user) return false;
  return user.role === 'admin' || String(user.username || '').trim() === ADMIN_USERNAME;
}

// Resolve a client user by email/username passed as adminClientId.
// Returns null if not found.
function resolveClientUser(adminClientId) {
  const id = String(adminClientId || '').trim();
  if (!id) return null;
  return (db.data?.users || []).find(
    (u) =>
      String(u?.username || '').trim() === id ||
      String(u?.email    || '').trim() === id
  ) || null;
}

// Build a synthesized campaign context from a user's premiumIntake.
function synthesizeFromPremiumIntake(pi) {
  if (!pi || (!pi.businessName && !pi.mainServices)) return null;
  const offer = [pi.currentSpecialOrOffer, pi.promotionOffer].filter(Boolean)[0] || '';
  const serviceArea = pi.serviceArea || pi.targetCities || '';
  return {
    source: 'premium_intake',
    businessName:   pi.businessName || '',
    websiteUrl:     pi.websiteUrl   || '',
    phoneNumber:    pi.mainPhone || pi.bestContactPhone || '',
    industry:       pi.mainServices || '',
    city:  '',
    state: '',
    serviceArea,
    idealCustomer:  pi.idealCustomer || '',
    offer,
    mainBenefit:    pi.businessDifferentiator || pi.mainServices || '',
    cta:            'Call now',
    intakeText: [
      pi.businessName           ? `Business: ${pi.businessName}`                       : null,
      pi.mainServices           ? `Services: ${pi.mainServices}`                       : null,
      serviceArea               ? `Service area: ${serviceArea}`                       : null,
      pi.idealCustomer          ? `Ideal customer: ${pi.idealCustomer}`                : null,
      offer                     ? `Offer: ${offer}`                                    : null,
      pi.businessDifferentiator ? `What makes us different: ${pi.businessDifferentiator}` : null,
      pi.websiteUrl             ? `Website: ${pi.websiteUrl}`                          : null,
    ].filter(Boolean).join('\n'),
    selectedObjectiveLabel: null,
    selectedObjectiveValue: null,
    objectiveRecommendationReason: null,
    creativePreference: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/save
// Upserts a campaign context record for the current user.
// Called by FormPage (fire-and-forget) before navigating to /setup.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/save', async (req, res) => {
  try {
    await ensureData();
    const callerOwnerKey = ownerKeyFromReq(req);
    if (!callerOwnerKey) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }

    const {
      ctxKey,
      answers = {},
      selectedObjective,
      creativePreference,
      generatedCopy,
      campaignId,
      adminClientId,
    } = req.body || {};

    // Admin-client mode: save under the client's ownerKey, not the admin's
    let ownerKey = callerOwnerKey;
    if (adminClientId) {
      if (!isAdminOwnerKey(callerOwnerKey)) {
        return res.status(403).json({ ok: false, error: 'Admin access required.' });
      }
      const clientUser = resolveClientUser(String(adminClientId).trim());
      if (clientUser) {
        ownerKey = `user:${String(clientUser.username || '').trim()}`;
      }
    }

    const now = new Date().toISOString();

    // Detect whether the website URL has changed so we can issue a new intakeVersion
    const existingRecord = db.data.campaign_contexts.find(
      (c) =>
        String(c.ownerKey || '') === ownerKey &&
        (ctxKey ? String(c.ctxKey || '') === String(ctxKey || '').trim() : true)
    );
    const prevWebsiteUrl = String(existingRecord?.websiteUrl || '').trim().toLowerCase();
    const newWebsiteUrl  = String(answers.url || '').trim().toLowerCase();
    const urlChanged = !!newWebsiteUrl && prevWebsiteUrl !== newWebsiteUrl;

    // intakeVersion bumps whenever the URL (or any core intake field) is updated.
    // Downstream generation calls can use this to detect stale creative caches.
    const intakeVersion = (urlChanged || !existingRecord)
      ? nanoid(8)
      : (existingRecord?.intakeVersion || nanoid(8));

    // Build the structured context record
    const patch = {
      ownerKey,
      ctxKey:           String(ctxKey || '').trim() || null,
      campaignId:       String(campaignId || '').trim() || null,
      businessName:     String(answers.businessName || '').trim(),
      websiteUrl:       String(answers.url || '').trim(),
      intakeVersion,
      intakeUpdatedAt:  now,
      intakeChanged:    urlChanged,
      phoneNumber:      String(answers.phone || '').trim(),
      industry:         String(answers.industry || '').trim(),
      city:             String(answers.city || '').trim(),
      state:            String(answers.state || '').trim(),
      serviceArea:      [answers.city, answers.state].filter(Boolean).join(', '),
      idealCustomer:    String(answers.idealCustomer || '').trim(),
      offer:            String(answers.offer || '').trim(),
      mainBenefit:      String(answers.mainBenefit || '').trim(),
      cta:              String(answers.cta || '').trim(),
      intakeText: [
        answers.businessName ? `Business: ${answers.businessName}` : null,
        answers.industry     ? `Industry: ${answers.industry}`     : null,
        answers.city || answers.state
          ? `Location: ${[answers.city, answers.state].filter(Boolean).join(', ')}`
          : null,
        answers.idealCustomer ? `Ideal customer: ${answers.idealCustomer}` : null,
        answers.offer         ? `Offer: ${answers.offer}`                  : null,
        answers.mainBenefit   ? `Main benefit: ${answers.mainBenefit}`     : null,
        answers.cta           ? `CTA: ${answers.cta}`                      : null,
        answers.url           ? `Website: ${answers.url}`                  : null,
      ].filter(Boolean).join('\n'),
      selectedObjectiveLabel: selectedObjective?.label || null,
      selectedObjectiveValue: selectedObjective?.value || null,
      objectiveRecommendationReason: selectedObjective?.reason || null,
      creativePreference: String(creativePreference || 'ai_generate').trim(),
      generatedCopy:  generatedCopy || null,
      updatedAt: now,
    };

    // Upsert: find existing record for this ownerKey (+ optional ctxKey)
    const idx = db.data.campaign_contexts.findIndex(
      (c) =>
        String(c.ownerKey || '') === ownerKey &&
        (ctxKey ? String(c.ctxKey || '') === patch.ctxKey : true)
    );

    if (idx >= 0) {
      db.data.campaign_contexts[idx] = {
        ...db.data.campaign_contexts[idx],
        ...patch,
      };
    } else {
      db.data.campaign_contexts.push({
        id: nanoid(12),
        createdAt: now,
        ...patch,
      });
    }

    // Cap per-user records to 20 (keep most recent)
    const userRecords = db.data.campaign_contexts.filter(
      (c) => String(c.ownerKey || '') === ownerKey
    );
    if (userRecords.length > 20) {
      const sorted = [...userRecords].sort(
        (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
      );
      const toRemove = new Set(sorted.slice(20).map((r) => r.id));
      db.data.campaign_contexts = db.data.campaign_contexts.filter(
        (c) => !(String(c.ownerKey || '') === ownerKey && toRemove.has(c.id))
      );
    }

    await db.write();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[campaignContext] save error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to save context.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/campaign-context
// Returns the most recent campaign context for the current user.
// Used by AdAgent and future dashboard components.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/campaign-context', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }

    const { campaignId, ctxKey } = req.query;
    const adminClientId = String(req.query.adminClientId || '').trim();

    // ── Admin-client mode: look up the selected client's context ─────────────
    if (adminClientId) {
      if (!isAdminOwnerKey(ownerKey)) {
        return res.status(403).json({ ok: false, error: 'Admin access required.' });
      }
      const clientUser = resolveClientUser(adminClientId);
      if (!clientUser) {
        return res.json({ ok: true, context: null, hasUsableContext: false });
      }
      const clientOwnerKey = `user:${String(clientUser.username || '').trim()}`;

      // 1. Most recent campaign_context for the client
      const clientRecords = db.data.campaign_contexts
        .filter((c) => String(c.ownerKey || '') === clientOwnerKey)
        .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

      if (clientRecords[0]) {
        // Always override websiteUrl with premiumIntake.websiteUrl when available.
        // The campaign_contexts record may have a stale chat-conversation answer
        // (e.g. "Aspen93.godaddysites.com") that predates the current intake.
        const piUrl = String(clientUser.premiumIntake?.websiteUrl || '').trim();
        const context = piUrl
          ? { ...clientRecords[0], websiteUrl: piUrl }
          : clientRecords[0];
        return res.json({
          ok: true,
          context,
          source: 'campaign_context',
          hasUsableContext: true,
          resolvedAdminClientId: adminClientId,
          clientOwnerKey,
          contextOwnerKey: String(clientRecords[0].ownerKey || ''),
        });
      }

      // 2. Synthesize from premiumIntake
      const synthesized = synthesizeFromPremiumIntake(clientUser.premiumIntake);
      if (synthesized) {
        return res.json({
          ok: true,
          context: synthesized,
          source: 'premium_intake',
          hasUsableContext: true,
          resolvedAdminClientId: adminClientId,
          clientOwnerKey,
          contextOwnerKey: clientOwnerKey,
        });
      }

      // 3. If only the business name is known (from displayName / email), that's not enough
      return res.json({
        ok: true,
        context: null,
        hasUsableContext: false,
        resolvedAdminClientId: adminClientId,
        clientOwnerKey,
      });
    }

    // ── Normal mode: return the logged-in user's own context ─────────────────
    let records = db.data.campaign_contexts.filter(
      (c) => String(c.ownerKey || '') === ownerKey
    );

    if (campaignId) {
      const byId = records.find((c) => String(c.campaignId || '') === campaignId);
      if (byId) return res.json({ ok: true, context: byId, source: 'campaign_context' });
    }

    if (ctxKey) {
      const byCtx = records.find((c) => String(c.ctxKey || '') === ctxKey);
      if (byCtx) return res.json({ ok: true, context: byCtx, source: 'campaign_context' });
    }

    const sorted = [...records].sort(
      (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
    );
    if (sorted[0]) return res.json({ ok: true, context: sorted[0], source: 'campaign_context' });

    // Fallback: synthesize from the user's own premiumIntake
    if (ownerKey.startsWith('user:')) {
      const username = ownerKey.slice('user:'.length);
      const user = (db.data.users || []).find(
        (u) => String(u?.username || '').trim() === username
      );
      const synthesized = synthesizeFromPremiumIntake(user?.premiumIntake);
      if (synthesized) {
        return res.json({ ok: true, context: synthesized, source: 'premium_intake' });
      }
    }

    return res.json({ ok: true, context: null });
  } catch (err) {
    console.error('[campaignContext] get error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to get context.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/link-campaign
// Links a campaign_context record to a specific campaign ID after it's created.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/link-campaign', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { ctxKey, campaignId } = req.body || {};
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId required.' });

    const record = db.data.campaign_contexts.find(
      (c) =>
        String(c.ownerKey || '') === ownerKey &&
        (ctxKey ? String(c.ctxKey || '') === String(ctxKey) : true)
    );

    if (!record) return res.json({ ok: false, error: 'Context not found.' });

    record.campaignId = String(campaignId).trim();
    record.updatedAt  = new Date().toISOString();
    await db.write();

    return res.json({ ok: true });
  } catch (err) {
    console.error('[campaignContext] link-campaign error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to link campaign.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-proposal/create
// Creates an AI action proposal (approval mode).
// The AI calls this instead of executing a live Meta change directly.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ai-proposal/create', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const {
      campaignId,
      actionType,
      title,
      reasoning,
      proposedChanges,
      riskLevel = 'low',
    } = req.body || {};

    if (!actionType || !title) {
      return res.status(400).json({ ok: false, error: 'actionType and title are required.' });
    }

    const now = new Date().toISOString();
    const proposal = {
      id:              nanoid(12),
      ownerKey,
      campaignId:      String(campaignId || '').trim() || null,
      actionType:      String(actionType).trim(),
      title:           String(title).trim().slice(0, 200),
      reasoning:       String(reasoning || '').trim().slice(0, 1000),
      proposedChanges: proposedChanges || null,
      riskLevel:       ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'low',
      status:          'pending',
      createdAt:       now,
      updatedAt:       now,
      approvedAt:      null,
      executedAt:      null,
    };

    db.data.ai_action_proposals.push(proposal);
    await db.write();

    return res.json({ ok: true, proposal });
  } catch (err) {
    console.error('[aiProposal] create error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to create proposal.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-proposal/pending-count
// Returns the number of pending proposals for the current user.
// Used for the dashboard notification badge.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ai-proposal/pending-count', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.json({ ok: true, count: 0 });

    const count = db.data.ai_action_proposals.filter(
      (p) => String(p.ownerKey || '') === ownerKey && p.status === 'pending'
    ).length;

    return res.json({ ok: true, count });
  } catch (err) {
    console.error('[aiProposal] pending-count error:', err?.message);
    return res.json({ ok: true, count: 0 });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ai-proposal/list
// Returns all proposals for the current user (most recent first).
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ai-proposal/list', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { status, campaignId } = req.query;

    let proposals = db.data.ai_action_proposals.filter(
      (p) => String(p.ownerKey || '') === ownerKey
    );

    if (status) proposals = proposals.filter((p) => p.status === status);
    if (campaignId) proposals = proposals.filter(
      (p) => String(p.campaignId || '') === campaignId
    );

    proposals = [...proposals].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    return res.json({ ok: true, proposals });
  } catch (err) {
    console.error('[aiProposal] list error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to list proposals.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/ai-proposal/:id
// Update a proposal status: approve, reject, cancel.
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/ai-proposal/:id', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { id } = req.params;
    const { status } = req.body || {};

    if (!['approved', 'rejected', 'cancelled'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'status must be approved, rejected, or cancelled.' });
    }

    const proposal = db.data.ai_action_proposals.find(
      (p) => p.id === id && String(p.ownerKey || '') === ownerKey
    );

    if (!proposal) {
      return res.status(404).json({ ok: false, error: 'Proposal not found.' });
    }

    if (proposal.status !== 'pending') {
      return res.status(400).json({ ok: false, error: `Proposal is already ${proposal.status}.` });
    }

    const now = new Date().toISOString();
    proposal.status    = status;
    proposal.updatedAt = now;
    if (status === 'approved') proposal.approvedAt = now;

    await db.write();
    return res.json({ ok: true, proposal });
  } catch (err) {
    console.error('[aiProposal] patch error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to update proposal.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ai-proposal/:id/apply
// Executes the proposal's action via the optimizer pipeline, then marks it
// applied (or failed). This is what "Approve & Apply" calls — it actually
// mutates Meta, not just marks the record approved.
// ─────────────────────────────────────────────────────────────────────────────
// Build an image-generation prompt from control-ad context.
// Uses the same system instruction as the normal Smartemark ad-image pipeline
// so the result feels like a Smartemark creative, not a plain stock photo.
// "change only the image" is an A/B rule for Meta — NOT this prompt.
function buildAbImagePrompt({ headline, body, cta }) {
  const lines = [
    headline ? `Headline: "${headline}"` : null,
    body     ? `Ad copy: "${body.slice(0, 200)}"` : null,
    cta      ? `CTA: "${cta}"` : null,
  ].filter(Boolean);

  return [
    'Create a simple, visually appealing, mildly creative, photorealistic ad image using the brief below.',
    'Base the visual concept on the industry and ad copy. Keep it professional and not over the top.',
    'Avoid humans when possible; if humans appear, vary race, gender, age, and appearance.',
    'Use tasteful overlay copy that feels like a real ad, not a template.',
    'Keep all text fully inside the image frame.',
    'Do not invent phone numbers, websites, locations, offers, or contact details not listed below.',
    'Each generation should have a visually distinct concept — vary the subject, composition, angle, setting, and layout so repeated generations feel fresh.',
    'Do not draw any invented logo or brand mark.',
    '',
    'Brief:',
    ...lines,
  ].join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// buildChallengerDraftPreviews — Step 1 of the two-step flow.
// Fetches the control ad from Meta (read-only), builds draft preview objects
// showing what each challenger will look like, and saves them to the DB.
// Does NOT create any Meta ads. Returns draft objects for user review.
// ─────────────────────────────────────────────────────────────────────────────
async function buildChallengerDraftPreviews({ clientOwnerKey, campaignId, controlAdId, challengers, accountId }) {
  const userToken = getFbUserToken(clientOwnerKey);
  if (!userToken) throw new Error(`No Facebook token found for ${clientOwnerKey}. Please reconnect the client's Facebook account.`);

  const previewSessionId = nanoid(8);
  console.log('[AB_TEST_PREVIEW_SESSION_START]', { previewSessionId, controlAdId, campaignId, clientOwnerKey, challengerCount: challengers.length });

  // Fetch control ad from Meta (read-only)
  const controlRes = await axios.get(
    `https://graph.facebook.com/${META_API_VERSION}/${controlAdId}`,
    {
      params: {
        access_token: userToken,
        fields: 'id,name,adset_id,campaign_id,creative{id,name,object_story_spec,image_hash,thumbnail_url}',
      },
      timeout: 15000,
    }
  );
  const controlAd       = controlRes.data || {};
  const adsetId         = String(controlAd.adset_id || '').trim();
  if (!adsetId) throw new Error('Could not read adset_id from control ad.');
  const creative        = controlAd.creative || {};
  const objectStorySpec = creative.object_story_spec || {};
  const pageId          = String(objectStorySpec.page_id || '').trim();
  const linkData        = objectStorySpec.link_data || {};
  if (!pageId) throw new Error('Could not read page_id from control ad creative.');

  const controlHeadline = String(linkData.name    || '').trim();
  const controlBody     = String(linkData.message || '').trim();
  const controlCta      = String(linkData.call_to_action?.type || 'LEARN_MORE').trim();
  const controlLink     = String(linkData.link    || '').trim();
  const controlImageUrl     = String(creative.thumbnail_url || '').trim();
  const controlFullImageUrl = String(linkData.picture      || '').trim();
  const imageHash           = String(creative.image_hash   || '').trim();

  // Set up storage for generated images
  const fs   = require('fs');
  const path = require('path');
  const generatedDir = process.env.GENERATED_DIR ||
    (process.env.RENDER ? '/tmp/generated' : path.join(__dirname, '../public/generated'));
  const renderBase = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  try { fs.mkdirSync(generatedDir, { recursive: true }); } catch {}

  // Resolve the best control image URL.
  // Priority: image_hash lookup → linkData.picture → thumbnail_url (tiny, last resort).
  const CTRL_IMG_MIN_BYTES = 50000; // anything smaller is a thumbnail/icon, not a proper ad image
  let controlHiResUrl    = '';
  let controlCachedImageUrl = '';
  let controlImageLowRes = false; // set true when no usable full-size image is available

  if (imageHash) {
    console.log('[CONTROL_IMAGE_HASH_LOOKUP_START]', { previewSessionId, imageHash, accountId });
    try {
      const hashRes   = await axios.get(
        `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adimages`,
        {
          params: { access_token: userToken, hashes: JSON.stringify([imageHash]), fields: 'url' },
          timeout: 10000,
        }
      );
      const entry     = (hashRes.data?.data || [])[0];
      controlHiResUrl = String(entry?.url || '').trim();
      console.log('[CONTROL_IMAGE_HASH_LOOKUP_RESULT]', { previewSessionId, imageHash, found: !!controlHiResUrl, urlPreview: controlHiResUrl.slice(0, 100) });
    } catch (hashErr) {
      console.warn('[CONTROL_IMAGE_HASH_LOOKUP_FAILED]', { previewSessionId, imageHash, message: hashErr?.message });
    }
  }

  // Try each candidate source in priority order; accept only images ≥ 50 KB with an image content-type.
  const candidateSources = [
    { url: controlHiResUrl,     type: 'image_hash_url'    },
    { url: controlFullImageUrl, type: 'linkdata_picture'  },
    { url: controlImageUrl,     type: 'thumbnail_url'     },
  ].filter((s) => !!s.url);

  for (const candidate of candidateSources) {
    try {
      const imgDl      = await axios.get(candidate.url, { responseType: 'arraybuffer', timeout: 15000 });
      const bytes      = imgDl.data.byteLength;
      const contentType = String(imgDl.headers?.['content-type'] || '').toLowerCase();
      const isImage    = contentType.startsWith('image/');
      const isUsable   = isImage && bytes >= CTRL_IMG_MIN_BYTES;

      if (!isUsable) {
        console.warn('[CONTROL_IMAGE_TOO_SMALL]', { previewSessionId, sourceType: candidate.type, bytes, contentType, url: candidate.url.slice(0, 100) });
        continue; // try next candidate
      }

      const fname = `ctrl-img-${nanoid(10)}.jpg`;
      fs.writeFileSync(path.join(generatedDir, fname), Buffer.from(imgDl.data));
      controlCachedImageUrl = `/api/media/${fname}`;
      console.log('[CONTROL_IMAGE_SOURCE_SELECTED]', { previewSessionId, sourceType: candidate.type, fname, bytes });
      break;
    } catch (dlErr) {
      console.warn('[CONTROL_IMAGE_CACHE_FAILED]', { previewSessionId, sourceType: candidate.type, message: dlErr?.message });
    }
  }

  if (!controlCachedImageUrl) {
    controlImageLowRes = true;
    console.warn('[CONTROL_IMAGE_SOURCE_SELECTED]', { previewSessionId, sourceType: 'none', reason: 'no usable full-size image — headline fullscreen will show low-res warning' });
  }

  const nowIso = new Date().toISOString();
  const drafts = [];

  for (let i = 0; i < challengers.length; i++) {
    const challenger = challengers[i];
    const isHeadline = challenger.testType === 'headline';
    let imageUrl       = controlCachedImageUrl || controlImageUrl; // cached full-size for card; falls back to thumbnail
    let imagePublicUrl = controlImageUrl; // Meta upload: headline test never re-uploads
    let imageFailed    = false;

    if (!isHeadline) {
      // Image challenger: generate using the same creative pipeline as normal Smartemark ad creation.
      // "change only the image" is the A/B rule for Meta — it is NOT the image prompt.
      const imagePrompt = buildAbImagePrompt({ headline: controlHeadline, body: controlBody, cta: controlCta });
      try {
        console.log('[OPENAI_IMAGE_GENERATION_START]', { previewSessionId, challengerName: challenger.name });
        const buffers = await generateOpenAIAdImageBuffers({ prompt: imagePrompt, quality: 'high', n: 1 });
        const buf      = buffers[0];
        const fname    = `ab-img-${nanoid(10)}.png`;
        const fpath    = path.join(generatedDir, fname);
        fs.writeFileSync(fpath, buf);
        imageUrl       = `/api/media/${fname}`;
        imagePublicUrl = renderBase ? `${renderBase}/api/media/${fname}` : imageUrl;
        console.log('[OPENAI_IMAGE_GENERATION_SUCCESS]', { previewSessionId, filename: fname, bytes: buf.length, imageUrl });
      } catch (imgErr) {
        console.error('[OPENAI_IMAGE_GENERATION_FAILED]', { previewSessionId, message: imgErr?.message, prompt: imagePrompt });
        throw new Error(`Image generation failed. Please try again.`);
      }
    }

    drafts.push({
      id:              `preview-${previewSessionId}-${i}`,
      previewSessionId,
      status:          'draft',
      publishStatus:   imageFailed ? 'image_generation_failed' : 'needs_review',
      source:          'ai_agent',
      controlAdId,
      campaignId,
      adsetId,
      pageId,
      accountId,
      testType:        challenger.testType,
      name:            challenger.name,
      headline:        isHeadline ? (challenger.headline || controlHeadline) : controlHeadline,
      body:            controlBody,
      cta:             controlCta,
      link:            controlLink,
      imageUrl,
      imagePublicUrl,
      // fullImageUrl: only set for lightbox when we have a proper-sized image (≥50 KB).
      // Empty string means frontend will not offer Enlarge for headline test.
      fullImageUrl:        isHeadline ? (controlCachedImageUrl || '') : imageUrl,
      controlImageLowRes:  isHeadline ? controlImageLowRes : false,
      imageFailed,
      changes:         isHeadline ? ['headline'] : ['image'],
      controlHeadline,
      controlImageUrl,
      linkDataJson:    JSON.stringify(linkData),
      createdAt:       nowIso,
    });
  }

  // Save previews to DB
  await db.read();
  const recIdx = (db.data.campaign_creatives || []).findIndex(
    (r) => String(r.campaignId || '').trim() === String(campaignId || '').trim()
  );
  if (recIdx >= 0) {
    db.data.campaign_creatives[recIdx].pendingChallengerDrafts = drafts;
    await db.write();
  }

  console.log('[AB_TEST_PREVIEWS_READY]', {
    previewSessionId,
    campaignId,
    draftCount: drafts.length,
    drafts: drafts.map((d) => ({ id: d.id, testType: d.testType, imageUrl: d.imageUrl, fullImageUrl: d.fullImageUrl })),
  });
  return { drafts, adsetId, pageId, controlHeadline, controlBody, controlCta, controlLink, controlImageUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// createChallengerAds — Step 2: creates new Meta ads from approved draft previews.
// Only changes headline OR image per challenger. Returns real Meta ad IDs only.
// Throws on any failure so the caller can surface the error cleanly.
// ─────────────────────────────────────────────────────────────────────────────
async function createChallengerAds({ clientOwnerKey, campaignId, controlAdId, challengers, accountId }) {
  const userToken = getFbUserToken(clientOwnerKey);
  if (!userToken) throw new Error(`No Facebook token found for ${clientOwnerKey}. Please reconnect the client's Facebook account.`);

  console.log('[CHALLENGER_CREATE_START]', { controlAdId, campaignId, clientOwnerKey, challengerCount: challengers.length });

  // 1. Fetch control ad details from Meta
  const controlRes = await axios.get(
    `https://graph.facebook.com/${META_API_VERSION}/${controlAdId}`,
    {
      params: {
        access_token: userToken,
        fields: 'id,name,adset_id,campaign_id,creative{id,name,object_story_spec,image_hash,thumbnail_url}',
      },
      timeout: 15000,
    }
  );
  const controlAd  = controlRes.data || {};
  const adsetId    = String(controlAd.adset_id || '').trim();
  if (!adsetId) throw new Error('Could not read adset_id from control ad.');

  const creative         = controlAd.creative || {};
  const objectStorySpec  = creative.object_story_spec || {};
  const pageId           = String(objectStorySpec.page_id || '').trim();
  const linkData         = objectStorySpec.link_data || {};

  if (!pageId) throw new Error('Could not read page_id from control ad creative.');

  console.log('[CHALLENGER_CONTROL_AD_FETCHED]', {
    adsetId, campaignId, creativeId: creative.id,
    pageId, hasLinkData: !!Object.keys(linkData).length,
  });

  // 2. Create each challenger
  const createdAds = [];
  for (const challenger of challengers) {
    const newLinkData = { ...linkData };

    if (challenger.testType === 'headline') {
      if (!challenger.headline) throw new Error(`Challenger "${challenger.name}" has no headline specified.`);
      newLinkData.name = challenger.headline;  // headline lives in link_data.name

    } else if (challenger.testType === 'image') {
      if (!challenger.imageUrl && !challenger.imageHash) {
        throw new Error(`Challenger "${challenger.name}" has no imageUrl or imageHash specified.`);
      }
      if (challenger.imageHash) {
        newLinkData.image_hash = challenger.imageHash;
      } else {
        // Upload image URL to Meta ad account to get a hash
        const uploadRes = await axios.post(
          `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adimages`,
          null,
          {
            params: { access_token: userToken, 'url': challenger.imageUrl },
            timeout: 30000,
          }
        );
        const imgHash = Object.values(uploadRes.data?.images || {})[0]?.hash;
        if (!imgHash) throw new Error(`Failed to upload image for challenger "${challenger.name}".`);
        newLinkData.image_hash = imgHash;
        delete newLinkData.image_url; // remove URL reference if present
      }
    } else {
      throw new Error(`Unknown testType "${challenger.testType}" for challenger "${challenger.name}".`);
    }

    // 3. Create new ad creative
    const creativeRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/adcreatives`,
      {
        name: challenger.name,
        object_story_spec: { page_id: pageId, link_data: newLinkData },
      },
      { params: { access_token: userToken }, timeout: 15000 }
    );
    const newCreativeId = String(creativeRes.data?.id || '').trim();
    if (!newCreativeId || !(/^\d+$/.test(newCreativeId))) {
      throw new Error(`Meta did not return a real creative ID for "${challenger.name}". Got: ${creativeRes.data?.id}`);
    }

    // 4. Create new ad in same ad set
    const adRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/act_${accountId}/ads`,
      {
        name:     challenger.name,
        adset_id: adsetId,
        creative: { creative_id: newCreativeId },
        status:   'ACTIVE',
      },
      { params: { access_token: userToken }, timeout: 15000 }
    );
    const newAdId = String(adRes.data?.id || '').trim();
    if (!newAdId || !(/^\d+$/.test(newAdId))) {
      throw new Error(`Meta did not return a real ad ID for "${challenger.name}". Got: ${adRes.data?.id}`);
    }

    createdAds.push({
      id:             newAdId,
      metaAdId:       newAdId,
      metaCreativeId: newCreativeId,
      angleLabel:     challenger.name,
      headline:       newLinkData.name || linkData.name || '',
      body:           linkData.message || '',
      cta:            linkData.call_to_action?.type || 'LEARN_MORE',
      imageUrl:       '',
      link:           linkData.link || '',
      status:         'active',
      uiStatus:       'ACTIVE',
      lastAction:     'challenger_created',
      lastActionAt:   new Date().toISOString(),
      angle:          challenger.testType,
    });
  }

  console.log('[CHALLENGER_META_CREATE_RESULT]', { createdAds: createdAds.map(a => ({ name: a.angleLabel, metaAdId: a.metaAdId })) });

  // 5. Persist new ads into campaign_creatives.launchedCreativeSet
  await db.read();
  const recIdx = (db.data.campaign_creatives || []).findIndex(
    (r) => String(r.campaignId || '').trim() === String(campaignId || '').trim()
  );
  if (recIdx >= 0) {
    const existing = db.data.campaign_creatives[recIdx].launchedCreativeSet || [];
    db.data.campaign_creatives[recIdx].launchedCreativeSet = [...existing, ...createdAds];
    await db.write();
    console.log('[CHALLENGER_DB_PERSISTED]', {
      campaignId,
      launchedCreativeSetCount: db.data.campaign_creatives[recIdx].launchedCreativeSet.length,
    });
  }

  return createdAds;
}

router.post('/ai-proposal/:id/apply', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { id } = req.params;
    const adminClientIdFromBody = String(req.body?.adminClientId || '').trim();

    // Primary lookup: proposal stored under the requester's own ownerKey
    let proposal = db.data.ai_action_proposals.find(
      (p) => p.id === id && String(p.ownerKey || '') === ownerKey
    );

    // Admin-client fallback: TheBoss applying a proposal that belongs to a client.
    // The "Approve & Apply" button sends adminClientId in the request body.
    if (!proposal && adminClientIdFromBody && isAdminOwnerKey(ownerKey)) {
      const clientOwnerKey = `user:${adminClientIdFromBody}`;
      proposal = db.data.ai_action_proposals.find(
        (p) => p.id === id && String(p.ownerKey || '') === clientOwnerKey
      );
    }

    if (!proposal) return res.status(404).json({ ok: false, error: 'Proposal not found.' });

    if (!['pending', 'approved'].includes(proposal.status)) {
      return res.status(400).json({
        ok: false,
        error: `Proposal cannot be applied (status: ${proposal.status}).`,
      });
    }

    // ── create_challenger_ads — Step 1: build draft previews, do NOT publish to Meta ──
    if (proposal.actionType === 'create_challenger_ads') {
      const pc = proposal.proposedChanges || {};
      const clientOwnerKey = String(pc.ownerKey || proposal.ownerKey || '').trim();
      const campaignId     = String(pc.campaignId     || proposal.campaignId || '').trim();
      const controlAdId    = String(pc.controlAdId    || '').trim();
      const accountId      = String(pc.accountId      || '').trim();
      const challengers    = Array.isArray(pc.challengers) ? pc.challengers : [];

      console.log('[AI_AGENT_APPROVAL_RECEIVED]', { actionType: 'create_challenger_ads', clientOwnerKey, campaignId });

      if (!clientOwnerKey || !campaignId || !controlAdId || !accountId || challengers.length === 0) {
        return res.status(400).json({
          ok: false,
          error: 'Proposal is missing required fields: ownerKey, campaignId, controlAdId, accountId, challengers.',
        });
      }

      // Build draft previews — read-only Meta fetch, no ad creation yet
      let draftResult;
      try {
        draftResult = await buildChallengerDraftPreviews({ clientOwnerKey, campaignId, controlAdId, challengers, accountId });
      } catch (draftErr) {
        console.error('[CHALLENGER_DRAFT_FAILED]', draftErr?.message);
        proposal.status    = 'failed';
        proposal.updatedAt = new Date().toISOString();
        proposal.error     = String(draftErr?.message || 'draft creation failed').slice(0, 500);
        await db.write();
        return res.status(500).json({ ok: false, error: proposal.error, proposalStatus: 'failed' });
      }

      // Mark proposal as "drafts_ready" — not yet applied to Meta
      proposal.status    = 'drafts_ready';
      proposal.updatedAt = new Date().toISOString();
      proposal.result    = { draftCount: draftResult.drafts.length };
      await db.write();

      await appendAiHistoryEntry(campaignId, {
        type:       'action',
        timestamp:  new Date().toISOString(),
        title:      'Challenger draft previews created',
        summary:    `Created ${draftResult.drafts.length} draft previews for review (not yet on Meta).`,
        actionType: 'create_challenger_ads',
        source:     'proposal_apply',
      }).catch(() => {});

      const draftLines = draftResult.drafts.map((d, i) =>
        `**Draft ${i + 1} — ${d.name}**\n` +
        `Test type: ${d.testType}\n` +
        `Headline: ${d.headline}\n` +
        `Body: ${String(d.body || '').slice(0, 80)}${d.body?.length > 80 ? '…' : ''}\n` +
        `CTA: ${d.cta} · URL: ${d.link}\n` +
        `Changes: ${d.changes.join(', ')}`
      ).join('\n\n');

      return res.json({
        ok:             true,
        proposalStatus: 'drafts_ready',
        actionType:     'create_challenger_ads',
        reviewRequired: true,
        campaignId,
        drafts:         draftResult.drafts,
        reply:          `I created **${draftResult.drafts.length} challenger draft previews** so you can review them before anything goes live on Meta.\n\n${draftLines}\n\nReview the details above, then click **Publish to Meta** to create the real ads.`,
      });
    }

    if (proposal.actionType !== 'generate_single_creative_variant') {
      return res.status(400).json({
        ok: false,
        error: `Action type '${proposal.actionType}' cannot be automatically applied yet.`,
      });
    }

    const campaignId = String(proposal.campaignId || '').trim();
    if (!campaignId) return res.status(400).json({ ok: false, error: 'Proposal has no campaignId.' });

    const campaignState = await findOptimizerCampaignStateByCampaignId(campaignId).catch(() => null);
    if (!campaignState) return res.status(404).json({ ok: false, error: 'Campaign optimizer state not found.' });

    const userToken = getFbUserToken(ownerKey);
    if (!userToken) {
      return res.status(401).json({
        ok: false,
        error: 'No Facebook token found. Please reconnect your Facebook account.',
      });
    }

    const synthDecision = {
      decision:              'launch_creative_test',
      actionType:            'generate_single_creative_variant',
      priority:              'high',
      reason:                `Applying approved proposal ${id} via user-initiated Approve & Apply.`,
      requiresHumanApproval: false,
      confidence:            0.95,
      generatedAt:           new Date().toISOString(),
      mode:                  'proposal_apply_v1',
    };

    let actionResult;
    try {
      actionResult = await executeAction({
        optimizerState: { ...campaignState, latestDecision: synthDecision },
        userToken,
      });
    } catch (execErr) {
      console.error('[ai-proposal/apply] executeAction failed:', execErr?.message);
      const now = new Date().toISOString();
      proposal.status    = 'failed';
      proposal.updatedAt = now;
      proposal.error     = String(execErr?.message || 'execution failed').slice(0, 500);
      await db.write();
      return res.status(500).json({
        ok: false,
        error: proposal.error,
        proposalStatus: 'failed',
      });
    }

    // Persist creative patch to optimizer state
    const creativePatch = buildCreativePatch(actionResult);
    await updateOptimizerCampaignState(campaignId, {
      latestDecision: synthDecision,
      latestAction:   actionResult,
      ...creativePatch,
    }).catch((e) => console.error('[ai-proposal/apply] state persist error:', e?.message));

    await appendAiHistoryEntry(campaignId, {
      type:       'action',
      timestamp:  actionResult?.generatedAt || new Date().toISOString(),
      title:      'Applied approved proposal',
      summary:    String(actionResult?.status || '').trim(),
      reason:     `User approved and applied proposal ${id} via Ad Agent.`,
      actionType: 'generate_single_creative_variant',
      source:     'proposal_apply',
    }).catch(() => {});

    const now = new Date().toISOString();
    proposal.status     = 'applied';
    proposal.updatedAt  = now;
    proposal.approvedAt = proposal.approvedAt || now;
    proposal.appliedAt  = now;
    proposal.result     = {
      actionType:   actionResult?.actionType,
      actionStatus: actionResult?.status,
    };
    await db.write();

    return res.json({
      ok:             true,
      proposalStatus: 'applied',
      actionType:     actionResult?.actionType,
      actionStatus:   actionResult?.status,
    });
  } catch (err) {
    console.error('[ai-proposal/apply] error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to apply proposal.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/save-creative-draft
// Persists the admin-client creative draft server-side so it survives beyond
// localStorage (browser clears, device changes, dashboard navigation).
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/save-creative-draft', async (req, res) => {
  try {
    await ensureData();
    const callerOwnerKey = ownerKeyFromReq(req);
    if (!callerOwnerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { adminClientId, creativeDraft } = req.body || {};

    // Accept if: at least one real image URL OR at least one creative with real content.
    // Rejects truly empty/failed saves while allowing image-free but copy-complete drafts.
    const hasImages =
      Array.isArray(creativeDraft?.images) &&
      creativeDraft.images.some(Boolean);

    const hasCreativeSet =
      Array.isArray(creativeDraft?.creativeSet) &&
      creativeDraft.creativeSet.some(
        (c) => c && (
          String(c.imageUrl || '').trim() ||
          String(c.headline || '').trim() ||
          String(c.body    || '').trim()
        )
      );

    if (!creativeDraft || (!hasImages && !hasCreativeSet)) {
      return res.status(400).json({
        ok: false,
        error: 'creativeDraft with images or creativeSet is required.',
      });
    }

    let ownerKey = callerOwnerKey;
    if (adminClientId) {
      if (!isAdminOwnerKey(callerOwnerKey)) {
        return res.status(403).json({ ok: false, error: 'Admin access required.' });
      }
      const clientUser = resolveClientUser(String(adminClientId).trim());
      if (clientUser) ownerKey = `user:${String(clientUser.username || '').trim()}`;
    }

    const now = new Date().toISOString();
    const draft = {
      ...creativeDraft,
      ownerKey,
      adminClientId: adminClientId || null,
      updatedAt: now,
      status: 'draft',
    };
    if (!draft.savedAt) draft.savedAt = now;

    // Upsert: one draft per ownerKey + adminClientId combination
    const idx = db.data.creative_drafts.findIndex(
      (d) => String(d.ownerKey || '') === ownerKey &&
             String(d.adminClientId || '') === String(adminClientId || '')
    );
    if (idx !== -1) {
      db.data.creative_drafts[idx] = { ...db.data.creative_drafts[idx], ...draft };
    } else {
      db.data.creative_drafts.push({ id: nanoid(8), ...draft });
    }

    await db.write();
    return res.json({ ok: true });
  } catch (err) {
    console.error('[save-creative-draft]', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to save creative draft.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/campaign-context/creative-draft?adminClientId=...
// Returns the most recent server-persisted creative draft for the given client.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/campaign-context/creative-draft', async (req, res) => {
  try {
    await ensureData();
    const callerOwnerKey = ownerKeyFromReq(req);
    if (!callerOwnerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const adminClientId = String(req.query.adminClientId || '').trim();
    let ownerKey = callerOwnerKey;

    if (adminClientId) {
      if (!isAdminOwnerKey(callerOwnerKey)) {
        return res.status(403).json({ ok: false, error: 'Admin access required.' });
      }
      const clientUser = resolveClientUser(adminClientId);
      if (!clientUser) return res.json({ ok: true, creativeDraft: null });
      ownerKey = `user:${String(clientUser.username || '').trim()}`;
    }

    const drafts = (db.data.creative_drafts || [])
      .filter((d) =>
        String(d.ownerKey || '') === ownerKey &&
        String(d.adminClientId || '') === String(adminClientId || '')
      )
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

    return res.json({ ok: true, creativeDraft: drafts[0] || null });
  } catch (err) {
    console.error('[get-creative-draft]', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to get creative draft.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/campaign-context/creative-draft?adminClientId=...
// Removes the stored creative draft for the given client so Clear Drafts works.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/campaign-context/creative-draft', async (req, res) => {
  try {
    await ensureData();
    const callerOwnerKey = ownerKeyFromReq(req);
    if (!callerOwnerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const adminClientId = String(req.query.adminClientId || '').trim();
    let ownerKey = callerOwnerKey;

    if (adminClientId) {
      if (!isAdminOwnerKey(callerOwnerKey)) {
        return res.status(403).json({ ok: false, error: 'Admin access required.' });
      }
      const clientUser = resolveClientUser(adminClientId);
      if (clientUser) ownerKey = `user:${String(clientUser.username || '').trim()}`;
    }

    const before = db.data.creative_drafts.length;
    db.data.creative_drafts = (db.data.creative_drafts || []).filter(
      (d) =>
        !(String(d.ownerKey || '') === ownerKey &&
          String(d.adminClientId || '') === String(adminClientId || ''))
    );
    const removed = before - db.data.creative_drafts.length;

    await db.write();
    return res.json({ ok: true, removed });
  } catch (err) {
    console.error('[delete-creative-draft]', err?.message);
    return res.status(500).json({ ok: false, error: 'Failed to delete creative draft.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/approve-challenger-previews
// Step 2 of the 3-step flow: user reviewed previews in AI Agent and clicked approve.
// Saves the previews to DB as pendingChallengerDrafts without creating Meta ads.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/approve-challenger-previews', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { campaignId, previews, adminClientId: adminClientIdFromBody } = req.body || {};
    if (!campaignId || !Array.isArray(previews) || previews.length === 0) {
      return res.status(400).json({ ok: false, error: 'campaignId and previews[] are required.' });
    }

    const now = new Date().toISOString();
    const drafts = previews.map((p) => ({
      ...p,
      status:        'draft',
      publishStatus: 'ready_for_launch',
      approvedAt:    now,
    }));

    await db.read();
    const recIdx = (db.data.campaign_creatives || []).findIndex(
      (r) => String(r.campaignId || '').trim() === String(campaignId || '').trim()
    );
    if (recIdx >= 0) {
      db.data.campaign_creatives[recIdx].pendingChallengerDrafts = drafts;
      await db.write();
    }

    console.log('[AB_TEST_PREVIEWS_APPROVED_AS_DRAFTS]', { campaignId, draftCount: drafts.length });
    return res.json({ ok: true, draftCount: drafts.length });
  } catch (err) {
    console.error('[approve-challenger-previews]', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to approve previews.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/create-challenger-drafts
// Creates staged draft previews immediately — no Meta ad creation, no proposal.
// Draft creation is safe (read-only Meta fetch) so no approval gate is needed.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/create-challenger-drafts', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const adminClientIdFromBody = String(req.body?.adminClientId || '').trim();
    const clientOwnerKey = adminClientIdFromBody && isAdminOwnerKey(ownerKey)
      ? `user:${adminClientIdFromBody}`
      : ownerKey;

    const { campaignId, controlAdId, accountId, challengers } = req.body || {};
    if (!campaignId || !controlAdId || !accountId || !Array.isArray(challengers) || challengers.length === 0) {
      return res.status(400).json({ ok: false, error: 'campaignId, controlAdId, accountId, and challengers are required.' });
    }

    const result = await buildChallengerDraftPreviews({ clientOwnerKey, campaignId, controlAdId, challengers, accountId });
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[create-challenger-drafts]', err?.message);
    // Return 200 with ok:false so adAgent.js can read the structured error without axios throwing.
    return res.json({ ok: false, error: err?.message || 'Failed to create challenger drafts.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/publish-challenger-drafts
// Step 2 of the two-step flow: reads staged draft previews from DB and creates
// real Meta ads. Only called after the user reviews the drafts and clicks
// "Publish to Meta". Returns real numeric Meta ad IDs or a clear error.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/publish-challenger-drafts', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const adminClientIdFromBody = String(req.body?.adminClientId || '').trim();
    const clientOwnerKey = adminClientIdFromBody && isAdminOwnerKey(ownerKey)
      ? `user:${adminClientIdFromBody}`
      : ownerKey;

    const { campaignId } = req.body || {};
    if (!campaignId) return res.status(400).json({ ok: false, error: 'campaignId is required.' });

    // Load the pending drafts from DB
    await db.read();
    const recIdx = (db.data.campaign_creatives || []).findIndex(
      (r) => String(r.campaignId || '').trim() === String(campaignId || '').trim()
    );
    if (recIdx < 0) return res.status(404).json({ ok: false, error: 'Campaign creative record not found.' });

    const drafts = db.data.campaign_creatives[recIdx].pendingChallengerDrafts || [];
    if (drafts.length === 0) return res.status(400).json({ ok: false, error: 'No pending challenger drafts found. Generate drafts first.' });

    const { controlAdId, accountId } = drafts[0] || {};
    if (!controlAdId || !accountId) return res.status(400).json({ ok: false, error: 'Draft is missing controlAdId or accountId.' });

    // Build challengers from drafts to pass to createChallengerAds
    const challengers = drafts.map((d) => ({
      testType:  d.testType,
      name:      d.name,
      headline:  d.headline,
      imageUrl:  d.testType === 'image' ? d.imageUrl : undefined,
    }));

    console.log('[CHALLENGER_PUBLISH_START]', { campaignId, clientOwnerKey, draftCount: drafts.length });

    let createdAds;
    try {
      createdAds = await createChallengerAds({ clientOwnerKey, campaignId, controlAdId, challengers, accountId });
    } catch (createErr) {
      console.error('[CHALLENGER_PUBLISH_FAILED]', createErr?.message);
      return res.status(500).json({
        ok:    false,
        error: createErr?.message || 'Approval received, but ad creation failed before Meta returned real ad IDs.',
      });
    }

    // Clear the pending drafts now that real ads exist
    db.data.campaign_creatives[recIdx].pendingChallengerDrafts = [];
    await db.write();

    await appendAiHistoryEntry(campaignId, {
      type:       'action',
      timestamp:  new Date().toISOString(),
      title:      'Challenger ads published to Meta',
      summary:    `Published ${createdAds.length} challenger ads after user review.`,
      actionType: 'publish_challenger_drafts',
      source:     'manual_publish',
    }).catch(() => {});

    const adLines = createdAds.map((a) => `• **${a.angleLabel}** — Ad ID: \`${a.metaAdId}\``).join('\n');
    console.log('[CHALLENGER_PUBLISH_SUCCESS]', { campaignId, createdAds: createdAds.map((a) => ({ name: a.angleLabel, metaAdId: a.metaAdId })) });

    return res.json({
      ok:          true,
      actionType:  'publish_challenger_drafts',
      actionStatus: 'success',
      createdAds:  createdAds.map((a) => ({ name: a.angleLabel, metaAdId: a.metaAdId, testType: a.angle })),
      reply:       `Challenger ads are now live on Meta:\n\n${adLines}\n\nThe Creatives tab will show them as active. Archived ads are unchanged.`,
    });
  } catch (err) {
    console.error('[publish-challenger-drafts]', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to publish challenger drafts.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/campaign-context/publish-ab-previews
// Step 3: user approved the AI Agent preview cards. Create real Meta ads now.
// Takes preview objects directly — no extra DB round-trip needed.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/campaign-context/publish-ab-previews', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { campaignId, previews, adminClientId: adminClientIdFromBody } = req.body || {};
    if (!campaignId || !Array.isArray(previews) || previews.length === 0) {
      return res.status(400).json({ ok: false, error: 'campaignId and previews[] are required.' });
    }

    const clientOwnerKey = adminClientIdFromBody && isAdminOwnerKey(ownerKey)
      ? `user:${adminClientIdFromBody}`
      : ownerKey;

    // Validate no image-failed drafts are being published
    const failedImages = previews.filter((p) => p.imageFailed || (!p.imageUrl && p.testType === 'image'));
    if (failedImages.length > 0) {
      return res.status(400).json({
        ok: false,
        error: `Cannot publish: ${failedImages.map((p) => p.name).join(', ')} has missing image. Regenerate before publishing.`,
      });
    }

    const { controlAdId, accountId } = previews[0] || {};
    if (!controlAdId || !accountId) {
      return res.status(400).json({ ok: false, error: 'Preview is missing controlAdId or accountId.' });
    }

    // Build challengers from preview data for createChallengerAds
    const challengers = previews.map((p) => ({
      testType:  p.testType,
      name:      p.name,
      headline:  p.headline,
      // For image test: use the publicly accessible URL so Meta can fetch it
      imageUrl:  p.testType === 'image' ? (p.imagePublicUrl || p.imageUrl) : undefined,
    }));

    console.log('[AB_TEST_APPROVED_BY_USER]', { campaignId, clientOwnerKey, challengerCount: challengers.length });

    let createdAds;
    try {
      createdAds = await createChallengerAds({ clientOwnerKey, campaignId, controlAdId, challengers, accountId });
    } catch (createErr) {
      console.error('[AB_TEST_META_CREATE_FAILED]', createErr?.message);
      return res.status(500).json({
        ok: false,
        error: createErr?.message || 'Ad creation failed before Meta returned real ad IDs.',
      });
    }

    // Clear pending drafts and confirm active ads in DB
    await db.read();
    const recIdx = (db.data.campaign_creatives || []).findIndex(
      (r) => String(r.campaignId || '').trim() === campaignId
    );
    if (recIdx >= 0) {
      db.data.campaign_creatives[recIdx].pendingChallengerDrafts = [];
      await db.write();
    }

    console.log('[AB_TEST_META_ADS_CREATED]', { campaignId, createdAds: createdAds.map((a) => ({ name: a.angleLabel, metaAdId: a.metaAdId })) });

    const adList = createdAds.map((a) => `\`${a.metaAdId}\``).join(', ');
    return res.json({
      ok:          true,
      createdAds:  createdAds.map((a) => ({ ...a, status: 'active', uiStatus: 'ACTIVE' })),
      campaignId,
      reply:       `Approved. I created ${createdAds.length} active A/B test ads.\nAd IDs: ${adList}`,
    });
  } catch (err) {
    console.error('[publish-ab-previews]', err?.message);
    return res.status(500).json({ ok: false, error: err?.message || 'Failed to publish A/B test ads.' });
  }
});

module.exports = router;
