// server/routes/smart.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer } = require('../smartCampaignEngine');

const normalizeAccountId = (id) => String(id || '').replace(/^act_/, '');

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
  const assetTypes = String(overrides.assetTypes || cfg.assetTypes || 'both').toLowerCase();
  const wantsImage = assetTypes === 'image' || assetTypes === 'both';
  const wantsVideo = assetTypes === 'video' || assetTypes === 'both';
  const forceTwoPerType = !!(overrides.forceTwoPerType ?? cfg.forceTwoPerType);

  if (forceTwoPerType) {
    return { images: wantsImage ? 2 : 0, videos: wantsVideo ? 2 : 0 };
  }
  const overrideCountPerType = overrides.overrideCountPerType || cfg.overrideCountPerType || null;
  const dailyBudget = Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0);
  const flightHours = resolveFlightHours({
    startAt: overrides.flightStart || cfg.flightStart,
    endAt: overrides.flightEnd || cfg.flightEnd,
    fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
  });
  return policy.decideVariantPlan({ assetTypes, dailyBudget, flightHours, overrideCountPerType });
}

// Enable Smart
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
      forceTwoPerType = false,
      thresholds = {},
      stopRules = {}
    } = req.body;

    if (!accountId || !campaignId || !pageId) {
      return res.status(400).json({ error: 'accountId, campaignId, pageId are required' });
    }

    const acctIdClean = normalizeAccountId(accountId);
    const mergedThresholds = { ...(policy.THRESHOLDS || {}), ...(thresholds || {}) };
    const mergedStopRules  = { ...(policy.STOP_RULES || {}), ...(stopRules || {}) };

    await db.read();
    const existing = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (existing) {
      existing.pageId = pageId;
      existing.accountId = acctIdClean;
      existing.link = link || existing.link || '';
      existing.kpi = kpi;
      existing.assetTypes = assetTypes;
      existing.dailyBudget = Number(dailyBudget) || 0;
      existing.flightStart = flightStart;
      existing.flightEnd = flightEnd;
      existing.flightHours = Number(flightHours) || 0;
      existing.overrideCountPerType = overrideCountPerType;
      existing.forceTwoPerType = !!forceTwoPerType;
      existing.thresholds = mergedThresholds;
      existing.stopRules = mergedStopRules;
      existing.updatedAt = nowIso();
    } else {
      db.data.smart_configs.push({
        id: `sc_${campaignId}`,
        accountId: acctIdClean,
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
        forceTwoPerType: !!forceTwoPerType,
        thresholds: mergedThresholds,
        stopRules: mergedStopRules,
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

// Run once
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
      force = false,
      initial = false,
      dailyBudget = null,
      flightStart = null,
      flightEnd = null,
      flightHours = null,
      overrideCountPerType = null,
      forceTwoPerType = null
    } = req.body;

    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    await db.read();
    let cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) {
      const pageId = req.body.pageId || null;
      if (!pageId) return res.status(400).json({ error: 'Config not found. Provide pageId or call /smart/enable first.' });
      cfg = {
        id: `sc_${campaignId}`,
        accountId: normalizeAccountId(accountId),
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
        forceTwoPerType: !!forceTwoPerType,
        thresholds: {},
        stopRules: {},
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastRunAt: null
      };
      db.data.smart_configs.push(cfg);
      await db.write();
    }

    const analysis = await analyzer.analyzeCampaign({
      accountId: normalizeAccountId(accountId),
      campaignId,
      userToken,
      kpi: cfg.kpi || 'cpc'
    });

    const variantPlan = decideVariantPlanFrom(cfg, {
      assetTypes: mediaSelection,
      dailyBudget,
      flightStart,
      flightEnd,
      flightHours,
      overrideCountPerType,
      forceTwoPerType
    });

    const plateauDetected = Object.values(analysis.plateauByAdset || {}).some(Boolean);
    const shouldForceInitial = !!force || !!initial;
    if (!plateauDetected && !shouldForceInitial) {
      return res.json({ success: true, message: 'No plateau detected (and not forced).', analysis, variantPlan });
    }

    const creatives = await generator.generateVariants({
      form,
      answers,
      url,
      mediaSelection: (mediaSelection || cfg.assetTypes || 'both').toLowerCase(),
      variantPlan
    });

    const deployed = await deployer.deploy({
      accountId: normalizeAccountId(accountId),
      pageId: cfg.pageId,
      campaignLink: cfg.link || form?.url || url || 'https://your-smartmark-site.com',
      adsetIds: analysis.adsetIds,
      winnersByAdset: shouldForceInitial ? {} : analysis.winnersByAdset,
      losersByAdset: shouldForceInitial ? {} : analysis.losersByAdset,
      creatives,
      userToken
    });

    await db.read();
    const run = {
      id: `run_${Date.now()}`,
      campaignId,
      accountId: normalizeAccountId(accountId),
      startedAt: nowIso(),
      mode: shouldForceInitial ? 'initial' : 'plateau',
      plateauDetected: plateauDetected || shouldForceInitial,
      variantPlan,
      createdAdsByAdset: deployed.createdAdsByAdset,
      pausedAdsByAdset: deployed.pausedAdsByAdset
    };
    db.data.smart_runs.push(run);

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

    const cfgRef = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (cfgRef) {
      cfgRef.lastRunAt = nowIso();
      cfgRef.updatedAt = nowIso();
    }
    await db.write();

    const wantImages = variantPlan.images || 0;
    const wantVideos = variantPlan.videos || 0;
    const createdCounts = Object.fromEntries(
      Object.entries(deployed.variantMapByAdset || {}).map(([adsetId, vmap]) => {
        const counts = { images: 0, videos: 0 };
        Object.keys(vmap || {}).forEach(vid => {
          if (vid.startsWith('img_')) counts.images++;
          else if (vid.startsWith('vid_')) counts.videos++;
        });
        return [adsetId, counts];
      })
    );

    res.json({
      success: true,
      run,
      analysis,
      variantPlan,
      expectedPerType: { images: wantImages, videos: wantVideos },
      createdCountsPerAdset: createdCounts
    });
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
