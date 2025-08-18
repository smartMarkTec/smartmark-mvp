// server/routes/smart.js
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer, testing } = require('../smartCampaignEngine');

// ----------------------
// helpers
// ----------------------
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
  if (overrideCountPerType && typeof overrideCountPerType === 'object') {
    return policy.decideVariantPlan({
      assetTypes,
      dailyBudget: Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0),
      flightHours: resolveFlightHours({
        startAt: overrides.flightStart || cfg.flightStart,
        endAt: overrides.flightEnd || cfg.flightEnd,
        fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
      }),
      overrideCountPerType
    });
  }

  return policy.decideVariantPlan({
    assetTypes,
    dailyBudget: Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0),
    flightHours: resolveFlightHours({
      startAt: overrides.flightStart || cfg.flightStart,
      endAt: overrides.flightEnd || cfg.flightEnd,
      fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
    }),
    overrideCountPerType: null
  });
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

// ----------------------
// TEST MOCK ENDPOINTS (local helpers; you also have /smart/mock/* in smartMock.js)
// ----------------------
router.post('/mock-insights', async (req, res) => {
  try {
    const { adset = {}, ad = {} } = req.body || {};
    testing.setMockInsights({ adset, ad });
    res.json({ ok: true, counts: { adset: Object.keys(adset).length, ad: Object.keys(ad).length } });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to set mocks' });
  }
});

router.post('/mock-insights/clear', async (_req, res) => {
  try {
    testing.clearMockInsights();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to clear mocks' });
  }
});

// ----------------------
// Enable Smart config
// ----------------------
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
      existing.forceTwoPerType = !!forceTwoPerType;
      existing.thresholds = mergedThresholds;
      existing.stopRules = mergedStopRules;
      existing.updatedAt = nowIso();
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

// ----------------------
// Run once (initial or plateau)
// ----------------------
router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();
    const userToken = getFbUserToken();
    if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

    const {
      accountId, campaignId, form = {}, answers = {}, url = '',
      mediaSelection = 'both',
      force = false, initial = false,
      dailyBudget = null, flightStart = null, flightEnd = null, flightHours = null,
      overrideCountPerType = null, forceTwoPerType = null,
      championPct: bodyChampionPct = null,
      dryRun = true
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

    // Generate challenger creatives
    const creatives = await generator.generateVariants({
      form, answers, url, mediaSelection: (mediaSelection || cfg.assetTypes || 'both').toLowerCase(), variantPlan
    });

    // Determine target adsets (default: existing adsets in campaign)
    let targetAdsetIds = Array.isArray(analysis.adsetIds) ? analysis.adsetIds.slice() : [];
    if (!targetAdsetIds.length) {
      try {
        const adsetsResp = await axios.get(
          `https://graph.facebook.com/v18.0/${campaignId}/adsets`,
          { params: { access_token: userToken, fields: 'id,name,status,effective_status', limit: 50 } }
        );
        targetAdsetIds = (adsetsResp.data?.data || []).map(a => a.id);
      } catch {}
    }
    if (!targetAdsetIds.length) return res.status(409).json({ error: 'No ad sets found for this campaign.' });

    // Choose the adset that actually has a champion if possible
    let championAdsetId = targetAdsetIds[0];
    for (const asid of targetAdsetIds) {
      if (analysis.championByAdset?.[asid]) { championAdsetId = asid; break; }
    }

    // Plateau branch → clone adset for challengers and split budget (champion vs challengers)
    let adsetIdsForNewCreatives = targetAdsetIds;
    let budgetSplit = null;
    const championPct = Number(bodyChampionPct ?? 0.70);
    const totalBudgetCents = Math.round((Number(dailyBudget ?? cfg.dailyBudget ?? 10)) * 100);

    if (analysis.plateauByAdset?.[championAdsetId] && !shouldForceInitial) {
      // 1) clone challenger ad set
      let challengerAdsetId;
      try {
        challengerAdsetId = await deployer.ensureChallengerAdsetClone({
          accountId,
          campaignId,
          sourceAdsetId: championAdsetId,
          userToken,                                       // FIX: use real token
          nameSuffix: 'Challengers',
          dailyBudgetCents: Math.max(200, Math.round(totalBudgetCents * (1 - championPct)))
        });
      } catch (e) {
        return res.status(400).json({
          error: 'adset_clone_failed',
          detail: e.response?.data?.error || e.response?.data || e.message
        });
      }

      // 2) split budget 70/30 across champion/challenger ad sets
      try {
        await deployer.splitBudgetBetweenChampionAndChallengers({
          championAdsetId,
          challengerAdsetId,
          totalBudgetCents,
          championPct,
          userToken                                       // FIX: use real token
        });
      } catch (e) {
        return res.status(400).json({
          error: 'budget_split_failed',
          detail: e.response?.data?.error || e.response?.data || e.message
        });
      }

      // 3) create challengers only in the challenger ad set
      adsetIdsForNewCreatives = [challengerAdsetId];
      budgetSplit = { championAdsetId, challengerAdsetId, totalBudgetCents, championPct };
    }

    // Decide who to pause:
    // - initial (forced): pause nobody
    // - plateau: do NOT pause champion; let losers only be paused when not in plateau flow
    const losersByAdset =
      shouldForceInitial ? {} :
      (analysis.plateauByAdset?.[championAdsetId] ? {} : (analysis.losersByAdset || {}));
    const winnersByAdset = shouldForceInitial ? {} : (analysis.winnersByAdset || {});

    // Single deploy call
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

    // Summary of what we expected vs created
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

// ----------------------
// Persist stop rules
// ----------------------
router.post('/config/:campaignId/stop-rules', async (req, res) => {
  try {
    await ensureSmartTables();
    const { campaignId } = req.params;
    const inb = req.body || {};
    await db.read();
    const cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) return res.status(404).json({ error: 'Config not found. Call /smart/enable first.' });
    const next = {
      spendPerAdUSD: Number(inb.spendPerAdUSD ?? cfg.stopRules?.spendPerAdUSD ?? 0),
      impressionsPerAd: Number(inb.impressionsPerAd ?? cfg.stopRules?.impressionsPerAd ?? 0),
      clicksPerAd: Number(inb.clicksPerAd ?? cfg.stopRules?.clicksPerAd ?? 0),
      timeCapHours: Number(inb.timeCapHours ?? cfg.stopRules?.timeCapHours ?? 0),
    };
    cfg.stopRules = next;
    cfg.updatedAt = nowIso();
    await db.write();
    res.json({ ok: true, stored: cfg.stopRules });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----------------------
// Status
// ----------------------
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

// ----------------------
// Scheduler controls (optional)
// ----------------------
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
