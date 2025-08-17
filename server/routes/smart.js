'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer, testing } = require('../smartCampaignEngine');

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
const nowIso = () => new Date().toISOString();

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
  if (forceTwoPerType) return { images: wantsImage ? 2 : 0, videos: wantsVideo ? 2 : 0 };

  const overrideCountPerType = overrides.overrideCountPerType || cfg.overrideCountPerType || null;
  const baseArgs = {
    assetTypes,
    dailyBudget: Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0),
    flightHours: resolveFlightHours({
      startAt: overrides.flightStart || cfg.flightStart,
      endAt: overrides.flightEnd || cfg.flightEnd,
      fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
    })
  };
  return policy.decideVariantPlan({ ...baseArgs, overrideCountPerType });
}

function normalizeStopRules(cfg = {}) {
  const s = cfg.stopRules || {};
  const base = policy.STOP_RULES;
  return {
    MIN_SPEND_PER_AD: Number(s.spendPerAdUSD ?? base.MIN_SPEND_PER_AD),
    MIN_IMPRESSIONS_PER_AD: Number(s.impressionsPerAd ?? base.MIN_IMPRESSIONS_PER_AD),
    MIN_CLICKS_PER_AD: Number(s.clicksPerAd ?? base.MIN_CLICKS_PER_AD),
    MAX_TEST_HOURS: Number(s.timeCapHours ?? base.MAX_TEST_HOURS),
  };
}

/* =========================
   TEST MOCK ENDPOINTS
   ========================= */
// These mount under /smart/...
router.post('/mock/insights', (req, res) => {
  const { adset = {}, ad = {} } = req.body || {};
  testing.setMockInsights({ adset, ad });
  res.json({ ok: true, counts: { adset: Object.keys(adset).length, ad: Object.keys(ad).length } });
});
router.post('/mock/clear', (_req, res) => {
  testing.clearMockInsights();
  res.json({ ok: true });
});

/* =========================
   ENABLE SMART
   ========================= */
router.post('/enable', async (req, res) => {
  try {
    await ensureSmartTables();
    const {
      accountId, campaignId, pageId, link,
      kpi = 'cpc', assetTypes = 'both', dailyBudget = 0,
      flightStart = null, flightEnd = null, flightHours = 0,
      overrideCountPerType = null, forceTwoPerType = false,
      thresholds = {}, stopRules = {}
    } = req.body;

    if (!accountId || !campaignId || !pageId) {
      return res.status(400).json({ error: 'accountId, campaignId, pageId are required' });
    }

    const mergedThresholds = { ...(policy.THRESHOLDS || {}), ...(thresholds || {}) };
    const mergedStopRules  = { ...(policy.STOP_RULES || {}), ...(stopRules || {}) };

    await db.read();
    const existing = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (existing) {
      Object.assign(existing, {
        pageId, accountId,
        link: link || existing.link || '',
        kpi, assetTypes,
        dailyBudget: Number(dailyBudget) || 0,
        flightStart, flightEnd, flightHours: Number(flightHours) || 0,
        overrideCountPerType, forceTwoPerType: !!forceTwoPerType,
        thresholds: mergedThresholds, stopRules: mergedStopRules,
        updatedAt: nowIso()
      });
    } else {
      db.data.smart_configs.push({
        id: `sc_${campaignId}`,
        accountId, campaignId, pageId,
        link: link || '',
        kpi, assetTypes,
        dailyBudget: Number(dailyBudget) || 0,
        flightStart, flightEnd, flightHours: Number(flightHours) || 0,
        overrideCountPerType, forceTwoPerType: !!forceTwoPerType,
        thresholds: mergedThresholds, stopRules: mergedStopRules,
        createdAt: nowIso(), updatedAt: nowIso(), lastRunAt: null,
        state: { adsets: {} }
      });
    }
    await db.write();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   RUN-ONCE (initial or plateau)
   ========================= */
router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();
    const userToken = getFbUserToken();
    if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

    const {
      accountId, campaignId, pageId: pageIdInBody = null,
      form = {}, answers = {}, url = '',
      mediaSelection = 'both',
      force = false, initial = false,
      dailyBudget = null, flightStart = null, flightEnd = null, flightHours = null,
      overrideCountPerType = null, forceTwoPerType = null,
      championPct: championPctIn = 0.70,
      dryRun = true
    } = req.body;

    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    await db.read();
    let cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) {
      const pageId = pageIdInBody || null;
      if (!pageId) return res.status(400).json({ error: 'Config not found. Provide pageId or call /smart/enable first.' });
      cfg = {
        id: `sc_${campaignId}`,
        accountId, campaignId, pageId,
        link: form?.url || url || '',
        kpi: 'cpc',
        assetTypes: (mediaSelection || 'both').toLowerCase(),
        dailyBudget: Number(dailyBudget) || 0,
        flightStart, flightEnd, flightHours: Number(flightHours) || 0,
        overrideCountPerType, forceTwoPerType: !!forceTwoPerType,
        thresholds: {}, stopRules: {}, createdAt: nowIso(), updatedAt: nowIso(), lastRunAt: null,
        state: { adsets: {} }
      };
      db.data.smart_configs.push(cfg);
      await db.write();
    }

    const analysis = await analyzer.analyzeCampaign({
      accountId, campaignId, userToken, kpi: cfg.kpi || 'cpc', stopRules: normalizeStopRules(cfg)
    });

    const variantPlan = decideVariantPlanFrom(cfg, {
      assetTypes: mediaSelection, dailyBudget, flightStart, flightEnd, flightHours, overrideCountPerType, forceTwoPerType
    });

    const plateauDetected = Object.values(analysis.plateauByAdset || {}).some(Boolean);
    const shouldForceInitial = !!force || !!initial;
    if (!plateauDetected && !shouldForceInitial) {
      return res.json({ success: true, message: 'No plateau detected (and not forced).', analysis, variantPlan });
    }

    // Generate challenger variants
    const creatives = await generator.generateVariants({
      form, answers, url,
      mediaSelection: (mediaSelection || cfg.assetTypes || 'both').toLowerCase(),
      variantPlan
    });

    // Determine champion ad set (fallback to fetching if empty)
    let adsetIds = Array.isArray(analysis.adsetIds) ? analysis.adsetIds.slice() : [];
    if (!adsetIds.length) {
      try {
        const adsetsResp = await axios.get(
          `https://graph.facebook.com/v18.0/${campaignId}/adsets`,
          { params: { access_token: userToken, fields: 'id', limit: 50 } }
        );
        adsetIds = (adsetsResp.data?.data || []).map(a => a.id);
      } catch {}
    }
    if (!adsetIds.length) return res.status(409).json({ error: 'No ad sets found for this campaign.' });

    const championAdsetId = adsetIds[0];
    let adsetIdsForNewCreatives = adsetIds;
    const championPct = Number(championPctIn || 0.70);
    const totalBudgetCents = Math.round((Number(dailyBudget ?? cfg.dailyBudget ?? 10)) * 100);

    // If plateau, create a dedicated challenger ad set and split budgets 70/30
    let budgetSplit = null;
    if (analysis.plateauByAdset[championAdsetId]) {
      const challengerAdsetId = await deployer.ensureChallengerAdsetClone({
        accountId,
        campaignId,
        sourceAdsetId: championAdsetId,
        userToken,
        nameSuffix: 'Challengers',
        dailyBudgetCents: Math.max(200, Math.round(totalBudgetCents * (1 - championPct)))
      });

      await deployer.splitBudgetBetweenChampionAndChallengers({
        championAdsetId,
        challengerAdsetId,
        totalBudgetCents,
        championPct,
        userToken
      });

      adsetIdsForNewCreatives = [challengerAdsetId];
      budgetSplit = { championAdsetId, challengerAdsetId, totalBudgetCents, championPct };
    }

    // On plateau: don't pause champion. On forced-initial: also don't pause.
    const losersByAdset = shouldForceInitial ? {} : (plateauDetected ? {} : analysis.losersByAdset);
    const winnersByAdset = shouldForceInitial ? {} : analysis.winnersByAdset;

    // Single deploy call — create challengers in the right ad set(s)
    const deployed = await deployer.deploy({
      accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || form?.url || url || 'https://your-smartmark-site.com',
      adsetIds: adsetIdsForNewCreatives,
      winnersByAdset,
      losersByAdset,
      creatives,
      userToken,
      dryRun: !!dryRun
    });

    // Persist run + creative history
    await db.read();
    const run = {
      id: `run_${Date.now()}`,
      campaignId, accountId, startedAt: nowIso(),
      mode: shouldForceInitial ? 'initial' : 'plateau',
      plateauDetected: plateauDetected || shouldForceInitial,
      variantPlan,
      createdAdsByAdset: deployed.createdAdsByAdset,
      pausedAdsByAdset: deployed.pausedAdsByAdset,
      ...(budgetSplit ? { budgetSplit } : {})
    };
    db.data.smart_runs.push(run);

    Object.entries(deployed.variantMapByAdset || {}).forEach(([adsetId, vmap]) => {
      Object.entries(vmap || {}).forEach(([variantId, adId]) => {
        db.data.creative_history.push({
          id: `ch_${adId}`, campaignId, adsetId, adId, variantId, createdAt: nowIso(),
          kind: (variantId || '').startsWith('img_') ? 'image' : 'video'
        });
      });
    });

    const cfgRef = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (cfgRef) { cfgRef.lastRunAt = nowIso(); cfgRef.updatedAt = nowIso(); }
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
      run, analysis, variantPlan,
      expectedPerType: { images: wantImages, videos: wantVideos },
      createdCountsPerAdset: createdCounts
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   STOP-RULES PERSIST
   ========================= */
router.post('/config/:campaignId/stop-rules', async (req, res) => {
  try {
    await ensureSmartTables();
    const { campaignId } = req.params;
    await db.read();
    const cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) return res.status(404).json({ error: 'Config not found. Call /smart/enable first.' });
    const inb = req.body || {};
    cfg.stopRules = {
      spendPerAdUSD: Number(inb.spendPerAdUSD ?? cfg.stopRules?.spendPerAdUSD ?? 0),
      impressionsPerAd: Number(inb.impressionsPerAd ?? cfg.stopRules?.impressionsPerAd ?? 0),
      clicksPerAd: Number(inb.clicksPerAd ?? cfg.stopRules?.clicksPerAd ?? 0),
      timeCapHours: Number(inb.timeCapHours ?? cfg.stopRules?.timeCapHours ?? 0),
    };
    cfg.updatedAt = nowIso();
    await db.write();
    res.json({ ok: true, stored: cfg.stopRules });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   STATUS
   ========================= */
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

/* =========================
   MANUAL SWEEP / COMMIT
   ========================= */
router.post('/sweep-now', async (_req, res) => {
  try {
    const jobs = require('../scheduler/jobs');
    if (!jobs || typeof jobs.sweep !== 'function') {
      return res.status(500).json({ error: 'jobs.sweep not available' });
    }
    await jobs.sweep();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/commit-now', async (req, res) => {
  try {
    await ensureSmartTables();
    const userToken = getFbUserToken();
    if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

    const { accountId, campaignId } = req.body || {};
    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    const analysis = await analyzer.analyzeCampaign({
      accountId, campaignId, userToken, kpi: 'cpc'
    });

    let losers = [];
    for (const adsetId of (analysis.adsetIds || [])) {
      const loserList = analysis.losersByAdset?.[adsetId] || [];
      if (loserList.length) losers.push(...loserList);
      else {
        const ids = analysis.adMapByAdset?.[adsetId] || [];
        if (ids.length > 1) losers.push(ids[ids.length - 1]);
      }
    }

    losers = Array.from(new Set(losers)).filter(Boolean);
    if (!losers.length) {
      return res.json({ success: true, message: 'No losers found to pause (need at least 2 ads per ad set).' });
    }

    await deployer.pauseAds({ adIds: losers, userToken });

    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      campaignId, accountId, startedAt: nowIso(),
      mode: 'stop_rules_commit', plateauDetected: true,
      variantPlan: { images: 0, videos: 0 },
      createdAdsByAdset: {}, pausedAdsByAdset: { '*': losers }
    });
    await db.write();

    res.json({ success: true, paused: losers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
