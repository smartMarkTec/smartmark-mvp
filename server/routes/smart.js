// server/routes/smart.js
// SmartCampaign API: enable, run-once (initial A/B or plateau challengers), status.
// Uses LowDB and the combined SmartCampaignEngine (policy, analyzer, generator, deployer).

const express = require('express');
const router = express.Router();
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer } = require('../smartCampaignEngine');

// ---- DB helpers / migrations ----
async function ensureSmartTables() {
  await db.read();
  db.data = db.data || {};
  db.data.users = db.data.users || [];
  db.data.campaigns = db.data.campaigns || [];
  db.data.smart_configs = db.data.smart_configs || [];
  db.data.smart_runs = db.data.smart_runs || [];
  db.data.creative_history = db.data.creative_history || [];
  await db.write();
}

function nowIso() { return new Date().toISOString(); }

function resolveFlightHours({ startAt, endAt, fallbackHours = 0 }) {
  if (endAt) {
    const start = startAt || nowIso();
    const h = (new Date(endAt).getTime() - new Date(start).getTime()) / 36e5;
    return Math.max(0, Math.round(h));
  }
  return Math.max(0, Number(fallbackHours || 0));
}

function decideVariantPlanFrom(cfg = {}, overrides = {}) {
  const assetTypes = overrides.assetTypes || cfg.assetTypes || 'both';
  const dailyBudget = Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0);
  const flightHours = resolveFlightHours({
    startAt: overrides.flightStart || cfg.flightStart,
    endAt: overrides.flightEnd || cfg.flightEnd,
    fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
  });
  const overrideCountPerType = overrides.overrideCountPerType || cfg.overrideCountPerType || null;
  return policy.decideVariantPlan({ assetTypes, dailyBudget, flightHours, overrideCountPerType });
}

// Enable Smart management for a campaign (stores guardrails and selections)
router.post('/enable', async (req, res) => {
  try {
    await ensureSmartTables();
    const {
      accountId,
      campaignId,
      pageId,
      link,
      kpi = 'cpc',
      assetTypes = 'both',
      dailyBudget = 0,
      flightStart = null,
      flightEnd = null,
      flightHours = 0,
      overrideCountPerType = null,
      thresholds = {},
      stopRules = {}
    } = req.body;

    if (!accountId || !campaignId || !pageId) {
      return res.status(400).json({ error: 'accountId, campaignId, pageId are required' });
    }

    const existing = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (existing) {
      existing.pageId = pageId;
      existing.accountId = accountId;
      existing.link = link || existing.link || '';
      existing.kpi = kpi;
      existing.assetTypes = assetTypes;
      existing.dailyBudget = Number(dailyBudget) || 0;
      existing.flightStart = flightStart;
      existing.flightEnd = flightEnd;
      existing.flightHours = Number(flightHours) || 0;
      existing.overrideCountPerType = overrideCountPerType;
      existing.thresholds = { ...(existing.thresholds || {}), ...thresholds };
      existing.stopRules = { ...(existing.stopRules || {}), ...stopRules };
      existing.updatedAt = nowIso();
    } else {
      db.data.smart_configs.push({
        id: `sc_${campaignId}`,
        accountId,
        campaignId,
        pageId,
        link: link || '',
        kpi,
        assetTypes,
        dailyBudget: Number(dailyBudget) || 0,
        flightStart,
        flightEnd,
        flightHours: Number(flightHours) || 0,
        overrideCountPerType,
        thresholds,
        stopRules,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastRunAt: null
      });
    }
    await db.write();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Manually trigger a single Smart run for a campaign.
 * Modes:
 *  - initial/force=true → start first A/B (ignores plateau)
 *  - default          → only act when plateau detected
 */
router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();
    const userToken = getFbUserToken();
    if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

    const {
      accountId,
      campaignId,
      form = {},
      answers = {},
      url = '',
      mediaSelection = 'both',
      // optional overrides for this run
      force = false,
      initial = false,
      dailyBudget = null,
      flightStart = null,
      flightEnd = null,
      flightHours = null,
      overrideCountPerType = null
    } = req.body;

    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    // Ensure config exists or create a minimal one on the fly
    await db.read();
    let cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) {
      const pageId = req.body.pageId || null;
      if (!pageId) return res.status(400).json({ error: 'Config not found. Provide pageId or call /smart/enable first.' });
      cfg = {
        id: `sc_${campaignId}`,
        accountId,
        campaignId,
        pageId,
        link: form?.url || url || '',
        kpi: 'cpc',
        assetTypes: (mediaSelection || 'both').toLowerCase(),
        dailyBudget: Number(dailyBudget) || 0,
        flightStart,
        flightEnd,
        flightHours: Number(flightHours) || 0,
        overrideCountPerType,
        thresholds: {},
        stopRules: {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastRunAt: null
      };
      db.data.smart_configs.push(cfg);
      await db.write();
    }

    // Analyzer pass
    const analysis = await analyzer.analyzeCampaign({
      accountId,
      campaignId,
      userToken,
      kpi: cfg.kpi || 'cpc'
    });

    // Decide variant plan (1 vs 2 per type)
    const variantPlan = decideVariantPlanFrom(cfg, {
      assetTypes: mediaSelection,
      dailyBudget,
      flightStart,
      flightEnd,
      flightHours,
      overrideCountPerType
    });

    // Determine whether to act
    const plateauDetected = Object.values(analysis.plateauByAdset || {}).some(Boolean);
    const shouldForceInitial = !!force || !!initial;
    if (!plateauDetected && !shouldForceInitial) {
      return res.json({ success: true, message: 'No plateau detected (and not forced).', analysis, variantPlan });
    }

    // Generate variants
    const creatives = await generator.generateVariants({
      form,
      answers,
      url,
      mediaSelection: mediaSelection || cfg.assetTypes || 'both',
      variantPlan
    });

    // Deploy
    const deployed = await deployer.deploy({
      accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || form?.url || url || 'https://your-smartmark-site.com',
      adsetIds: analysis.adsetIds,
      winnersByAdset: shouldForceInitial ? {} : analysis.winnersByAdset,
      losersByAdset: shouldForceInitial ? {} : analysis.losersByAdset,
      creatives,
      userToken
    });

    // Log run
    await db.read();
    const run = {
      id: `run_${Date.now()}`,
      campaignId,
      accountId,
      startedAt: nowIso(),
      mode: shouldForceInitial ? 'initial' : 'plateau',
      plateauDetected: plateauDetected || shouldForceInitial,
      variantPlan,
      createdAdsByAdset: deployed.createdAdsByAdset,
      pausedAdsByAdset: deployed.pausedAdsByAdset
    };
    db.data.smart_runs.push(run);

    // Archive variant↔adId mapping
    Object.entries(deployed.variantMapByAdset || {}).forEach(([adsetId, vmap]) => {
      Object.entries(vmap || {}).forEach(([variantId, adId]) => {
        db.data.creative_history.push({
          id: `ch_${adId}`,
          campaignId,
          adsetId,
          adId,
          variantId,
          createdAt: nowIso(),
          kind: (variantId || '').startsWith('img_') ? 'image' : 'video'
        });
      });
    });

    // Update config last run
    const cfgRef = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (cfgRef) {
      cfgRef.lastRunAt = nowIso();
      cfgRef.updatedAt = nowIso();
    }
    await db.write();

    res.json({ success: true, run, analysis, variantPlan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status for a campaign
router.get('/status/:campaignId', async (req, res) => {
  try {
    await ensureSmartTables();
    const { campaignId } = req.params;
    await db.read();
    const cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    const runs = (db.data.smart_runs || []).filter(r => r.campaignId === campaignId).slice(-10).reverse();
    res.json({ config: cfg || null, recentRuns: runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
