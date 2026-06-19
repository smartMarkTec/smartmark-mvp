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
const db = require('../db');
const { nanoid } = require('nanoid');
const { getFbUserToken } = require('../tokenStore');
const { executeAction } = require('../optimizerAction');
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

    // Build the structured context record
    const patch = {
      ownerKey,
      ctxKey:           String(ctxKey || '').trim() || null,
      campaignId:       String(campaignId || '').trim() || null,
      businessName:     String(answers.businessName || '').trim(),
      websiteUrl:       String(answers.url || '').trim(),
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
        return res.json({
          ok: true,
          context: clientRecords[0],
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
router.post('/ai-proposal/:id/apply', async (req, res) => {
  try {
    await ensureData();
    const ownerKey = ownerKeyFromReq(req);
    if (!ownerKey) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { id } = req.params;
    const proposal = db.data.ai_action_proposals.find(
      (p) => p.id === id && String(p.ownerKey || '') === ownerKey
    );
    if (!proposal) return res.status(404).json({ ok: false, error: 'Proposal not found.' });

    if (!['pending', 'approved'].includes(proposal.status)) {
      return res.status(400).json({
        ok: false,
        error: `Proposal cannot be applied (status: ${proposal.status}).`,
      });
    }

    if (proposal.actionType !== 'generate_single_creative_variant') {
      return res.status(400).json({
        ok: false,
        error: `Action type '${proposal.actionType}' cannot be automatically applied yet. Contact support.`,
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

module.exports = router;
