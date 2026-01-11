// server/routes/smart.js
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
  db.data.campaign_creatives = db.data.campaign_creatives || [];

  // NEW: async job tracking (persisted)
  db.data.smart_run_jobs = db.data.smart_run_jobs || [];

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

// persist seed inputs (Typeform) so scheduler can always regenerate correctly
function mergeSeedIntoCfg(cfg, incoming = {}) {
  if (!cfg) return;
  const hasObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;

  const next = { ...(cfg.seed || {}) };
  if (hasObj(incoming.form)) next.form = incoming.form;
  if (hasObj(incoming.answers)) next.answers = incoming.answers;
  if (incoming.url) next.url = String(incoming.url);
  if (incoming.mediaSelection) next.mediaSelection = String(incoming.mediaSelection).toLowerCase();

  if (Object.keys(next).length > 0) {
    cfg.seed = next;
  }
}

// Count creatives even in dryRun so you can verify 2 images / 2 videos logic
function countCreatives(creatives) {
  const counts = { images: 0, videos: 0 };

  if (!creatives) return counts;

  // common shape: { images:[], videos:[] }
  if (typeof creatives === 'object' && !Array.isArray(creatives)) {
    if (Array.isArray(creatives.images)) counts.images += creatives.images.length;
    if (Array.isArray(creatives.videos)) counts.videos += creatives.videos.length;

    // sometimes variants live under "variants"
    if (Array.isArray(creatives.variants)) {
      for (const v of creatives.variants) {
        const kind = (v?.kind || v?.type || '').toLowerCase();
        const id = String(v?.id || v?.variantId || '');
        if (kind === 'image' || id.startsWith('img_')) counts.images += 1;
        else if (kind === 'video' || id.startsWith('vid_')) counts.videos += 1;
      }
    }
    return counts;
  }

  // array shape: [{kind:'image'|'video'}]
  if (Array.isArray(creatives)) {
    for (const v of creatives) {
      const kind = (v?.kind || v?.type || '').toLowerCase();
      const id = String(v?.id || v?.variantId || '');
      if (kind === 'image' || id.startsWith('img_')) counts.images += 1;
      else if (kind === 'video' || id.startsWith('vid_')) counts.videos += 1;
    }
  }

  return counts;
}

/* ----------------------- ASYNC JOB HELPERS ----------------------- */

function newRunId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createJobRecord({ runId, campaignId, accountId, payload }) {
  await db.read();
  db.data.smart_run_jobs = db.data.smart_run_jobs || [];
  const job = {
    id: runId,
    campaignId,
    accountId,
    state: 'queued', // queued | running | done | error
    createdAt: nowIso(),
    startedAt: null,
    finishedAt: null,
    payloadPreview: {
      simulate: !!payload.simulate,
      mediaSelection: payload.mediaSelection || payload.assetTypes || 'both',
      dryRun: !!payload.dryRun,
      overrideCountPerType: payload.overrideCountPerType || null,
      forceTwoPerType: !!payload.forceTwoPerType
    },
    result: null,
    error: null
  };
  db.data.smart_run_jobs.push(job);
  await db.write();
  return job;
}

async function updateJob(runId, patch) {
  await db.read();
  const job = (db.data.smart_run_jobs || []).find(j => j.id === runId);
  if (!job) return null;
  Object.assign(job, patch);
  await db.write();
  return job;
}

async function getJob(runId) {
  await db.read();
  return (db.data.smart_run_jobs || []).find(j => j.id === runId) || null;
}

// simple concurrency gate so Render doesn’t melt
let inFlight = 0;
const MAX_IN_FLIGHT = Number(process.env.SMART_RUN_CONCURRENCY || 1);
async function withConcurrency(fn) {
  while (inFlight >= MAX_IN_FLIGHT) {
    await new Promise(r => setTimeout(r, 250));
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
  }
}

/* ----------------------- TEST MOCK ENDPOINTS ----------------------- */
router.post('/mock-insights', async (req, res) => {
  const { adset = {}, ad = {} } = req.body || {};
  testing.setMockInsights({ adset, ad });
  res.json({ ok: true, counts: { adset: Object.keys(adset).length, ad: Object.keys(ad).length } });
});
router.post('/mock-insights/clear', async (_req, res) => {
  testing.clearMockInsights();
  res.json({ ok: true });
});

/* ----------------------- ENABLE SMART CONFIG ----------------------- */
router.post('/enable', async (req, res) => {
  try {
    await ensureSmartTables();
    const {
      accountId, campaignId, pageId, link,
      kpi = 'cpc', assetTypes = 'both', dailyBudget = 0,
      flightStart = null, flightEnd = null, flightHours = 0,
      overrideCountPerType = null, forceTwoPerType = false,
      thresholds = {}, stopRules = {},

      form = null,
      answers = null,
      url = ''
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
      existing.state = existing.state || { adsets: {} };

      mergeSeedIntoCfg(existing, {
        form: form && typeof form === 'object' ? form : null,
        answers: answers && typeof answers === 'object' ? answers : null,
        url: url || (form && form.url) || link || existing.link || '',
        mediaSelection: assetTypes
      });
    } else {
      const cfg = {
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
      };

      mergeSeedIntoCfg(cfg, {
        form: form && typeof form === 'object' ? form : null,
        answers: answers && typeof answers === 'object' ? answers : null,
        url: url || (form && form.url) || link || cfg.link || '',
        mediaSelection: assetTypes
      });

      db.data.smart_configs.push(cfg);
    }
    await db.write();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------ INTERNAL RUN LOGIC ------------------------ */
async function runSmartOnceInternal(reqBody) {
  await ensureSmartTables();

  const { simulate = false, simDay = 1 } = reqBody;

  const userToken = getFbUserToken();
  if (!simulate && !userToken) {
    const err = new Error('Not authenticated with Facebook');
    err.status = 401;
    throw err;
  }

  const {
    accountId, campaignId, form = {}, answers = {}, url = '',
    mediaSelection = 'both',
    force = false, initial = false,
    dailyBudget = null, flightStart = null, flightEnd = null, flightHours = null,
    overrideCountPerType = null, forceTwoPerType = null,
    championPct: championPctRaw = 0.70,

    // IMPORTANT: default dryRun is true for safety
    dryRun: dryRunRaw = true
  } = reqBody;

  if (!accountId || !campaignId) {
    const err = new Error('accountId and campaignId are required');
    err.status = 400;
    throw err;
  }

  // Hard safety: if NO_SPEND=1, ALWAYS dryRun
  const dryRun = (process.env.NO_SPEND === '1') ? true : !!dryRunRaw;

  await db.read();
  let cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);

  if (!cfg) {
    const pageId = reqBody.pageId || null;
    if (!pageId) {
      const err = new Error('Config not found. Provide pageId or call /smart/enable first.');
      err.status = 400;
      throw err;
    }
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

    mergeSeedIntoCfg(cfg, {
      form,
      answers,
      url: url || form?.url || cfg.link || '',
      mediaSelection: (mediaSelection || cfg.assetTypes || 'both').toLowerCase()
    });

    db.data.smart_configs.push(cfg);
    await db.write();
  } else {
    mergeSeedIntoCfg(cfg, {
      form,
      answers,
      url: url || form?.url || '',
      mediaSelection: (mediaSelection || cfg.assetTypes || 'both').toLowerCase()
    });

    cfg.updatedAt = nowIso();
    await db.write();
  }

  function buildSimAnalysis({ day = 1, campaignId }) {
    const adsetId = `SIM_ADSET_${campaignId}`;
    const adA = `SIM_AD_A_${campaignId}`;
    const adB = `SIM_AD_B_${campaignId}`;

    const plateau = day >= 8;

    const mk = (impressions, clicks, spend, frequency) => ({
      impressions, clicks, spend, frequency,
      ctr: impressions ? clicks / impressions : 0
    });

    const prior = mk(2200, 30, 14.0, 1.7);
    const recent = plateau ? mk(2200, 18, 14.5, 2.4) : mk(2200, 36, 14.5, 1.6);

    return {
      adsetIds: [adsetId],
      adMapByAdset: { [adsetId]: [adA, adB] },
      adsetInsights: {
        [adsetId]: {
          recent,
          prior,
          _ranges: {
            recentRange: { since: `SIM_DAY_${Math.max(1, day - 2)}`, until: `SIM_DAY_${day}` },
            priorRange: { since: `SIM_DAY_${Math.max(1, day - 5)}`, until: `SIM_DAY_${Math.max(1, day - 3)}` }
          }
        }
      },
      adInsights: {
        [adA]: { recent, prior, _ranges: {} },
        [adB]: { recent, prior, _ranges: {} }
      },
      plateauByAdset: { [adsetId]: plateau },
      winnersByAdset: { [adsetId]: [adA] },
      losersByAdset: { [adsetId]: [adB] },
      stopFlagsByAd: {
        [adA]: { flags: { spend: false, impressions: false, clicks: false, time: false }, any: false },
        [adB]: { flags: { spend: false, impressions: false, clicks: false, time: false }, any: false }
      },
      championByAdset: { [adsetId]: adA },
      championPlateauByAdset: { [adsetId]: plateau }
    };
  }

  const analysis = simulate
    ? buildSimAnalysis({ day: Number(simDay) || 1, campaignId })
    : await analyzer.analyzeCampaign({
        accountId, campaignId, userToken, kpi: cfg.kpi || 'cpc', stopRules: normalizeStopRules(cfg)
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

  if (simulate) {
    return {
      success: true,
      simulate: true,
      simDay: Number(simDay) || 1,
      plateauDetected,
      message: plateauDetected
        ? 'Plateau detected — would regenerate creatives now (SIM).'
        : 'No plateau detected (SIM).',
      analysis,
      variantPlan,
      plannedAction: plateauDetected
        ? { action: 'REGENERATE_CREATIVES', addNewVariants: { images: 2, videos: 0 } }
        : { action: 'NONE' }
    };
  }

  if (!plateauDetected && !shouldForceInitial) {
    return { success: true, message: 'No plateau detected (and not forced).', analysis, variantPlan };
  }

  // fallback to stored seed if caller did not send form/answers/url
  const seed = cfg.seed || {};
  const useForm = (form && typeof form === 'object' && Object.keys(form).length) ? form : (seed.form || {});
  const useAnswers = (answers && typeof answers === 'object' && Object.keys(answers).length) ? answers : (seed.answers || {});
  const useUrl = url || useForm?.url || seed.url || cfg.link || '';
  const useMedia = (mediaSelection || seed.mediaSelection || cfg.assetTypes || 'both').toLowerCase();

  const creatives = await generator.generateVariants({
    form: useForm,
    answers: useAnswers,
    url: useUrl,
    mediaSelection: useMedia,
    variantPlan
  });

  const generatedCounts = countCreatives(creatives);

  // Determine target ad sets from analysis (fallback: fetch)
  let adsetIds = Array.isArray(analysis.adsetIds) ? analysis.adsetIds.slice() : [];
  if (!adsetIds.length) {
    try {
      const adsetsResp = await axios.get(
        `https://graph.facebook.com/v23.0/${campaignId}/adsets`,
        { params: { access_token: userToken, fields: 'id,name,status,effective_status', limit: 50 } }
      );
      adsetIds = (adsetsResp.data?.data || []).map(a => a.id);
    } catch {}
  }
  if (!adsetIds.length) {
    const err = new Error('No ad sets found for this campaign.');
    err.status = 409;
    throw err;
  }

  // --------- REUSE GUARD + 70/30 BUDGET SPLIT ON PLATEAU ----------
  let adsetIdsForNewCreatives = adsetIds;
  let budgetSplit = null;

  if (plateauDetected && !shouldForceInitial) {
    const plateauAdsetIds = Object.entries(analysis.plateauByAdset || {})
      .filter(([, v]) => !!v)
      .map(([id]) => id);
    const championAdsetId = plateauAdsetIds[0] || adsetIds[0];

    const championPct = Math.max(0.05, Math.min(0.95, Number(championPctRaw || 0.7)));
    const totalBudgetCents = Math.max(100, Math.round((Number(dailyBudget ?? cfg.dailyBudget ?? 10)) * 100));

    cfg.state = cfg.state || { adsets: {} };
    cfg.state.adsets[championAdsetId] = cfg.state.adsets[championAdsetId] || {};
    let challengerAdsetId = cfg.state.adsets[championAdsetId].challengerAdsetId || null;

    if (challengerAdsetId) {
      try {
        await axios.get(`https://graph.facebook.com/v23.0/${challengerAdsetId}`, {
          params: { access_token: userToken, fields: 'id,status,effective_status' }
        });
      } catch {
        challengerAdsetId = null;
      }
    }

    if (!challengerAdsetId) {
      challengerAdsetId = await deployer.ensureChallengerAdsetClone({
        accountId,
        campaignId,
        sourceAdsetId: championAdsetId,
        userToken,
        nameSuffix: 'Challengers',
        dailyBudgetCents: Math.max(200, Math.round(totalBudgetCents * (1 - championPct)))
      });

      await db.read();
      const cfgRef = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
      if (cfgRef) {
        cfgRef.state = cfgRef.state || { adsets: {} };
        cfgRef.state.adsets[championAdsetId] = cfgRef.state.adsets[championAdsetId] || {};
        cfgRef.state.adsets[championAdsetId].challengerAdsetId = challengerAdsetId;
        cfgRef.updatedAt = nowIso();
        await db.write();
      }
    }

    try {
      await deployer.splitBudgetBetweenChampionAndChallengers({
        championAdsetId,
        challengerAdsetId,
        totalBudgetCents,
        championPct,
        userToken
      });
    } catch {}

    adsetIdsForNewCreatives = [challengerAdsetId];
    budgetSplit = { championAdsetId, challengerAdsetId, totalBudgetCents, championPct };
  }

  const losersByAdset = (plateauDetected && !shouldForceInitial) ? {} : analysis.losersByAdset;
  const winnersByAdset = shouldForceInitial ? {} : analysis.winnersByAdset;

  // Single deploy call (still runs in dryRun, but should NOT spend)
  const deployed = await deployer.deploy({
    accountId,
    pageId: cfg.pageId,
    campaignLink: cfg.link || useForm?.url || useUrl || 'https://your-smartmark-site.com',
    adsetIds: adsetIdsForNewCreatives,
    winnersByAdset,
    losersByAdset,
    creatives,
    userToken,
    dryRun: !!dryRun
  });

  await db.read();
  const run = {
    id: `run_${Date.now()}`,
    campaignId, accountId, startedAt: nowIso(),
    mode: plateauDetected && !shouldForceInitial ? 'plateau' : 'initial',
    plateauDetected: plateauDetected || shouldForceInitial,
    variantPlan,
    generatedCounts,
    createdAdsByAdset: deployed.createdAdsByAdset,
    pausedAdsByAdset: deployed.pausedAdsByAdset,
    ...(budgetSplit ? { budgetSplit } : {}),
    meta: { dryRun: !!dryRun }
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

  const cfgRef2 = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
  if (cfgRef2) { cfgRef2.lastRunAt = nowIso(); cfgRef2.updatedAt = nowIso(); }
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

  return {
    success: true,
    run,
    analysis,
    variantPlan,
    expectedPerType: { images: wantImages, videos: wantVideos },
    generatedCounts, // <<< this is what you verify in dryRun
    createdCountsPerAdset: createdCounts
  };
}

/* ---------------------------- RUN ONCE ---------------------------- */
/**
 * IMPORTANT:
 * - For real users (video/both), you MUST run async to avoid Render 504.
 * - Default: async=true unless simulate=true.
 */
router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();

    const simulate = !!req.body?.simulate;
    const wantAsync = simulate ? false : (req.body?.async !== false); // default true

    const { accountId, campaignId } = req.body || {};
    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    if (!wantAsync) {
      // synchronous (SIM, or you explicitly set async:false)
      const out = await withConcurrency(() => runSmartOnceInternal(req.body));
      return res.json(out);
    }

    // Async: create job record and return immediately (prevents 504)
    const runId = newRunId();
    await createJobRecord({ runId, campaignId, accountId, payload: req.body });

    // fire in background
    setImmediate(async () => {
      await updateJob(runId, { state: 'running', startedAt: nowIso() });

      try {
        const result = await withConcurrency(() => runSmartOnceInternal(req.body));
        await updateJob(runId, { state: 'done', finishedAt: nowIso(), result });
      } catch (e) {
        const status = e?.status || e?.response?.status || 500;
        const detail = e?.response?.data?.error || e?.response?.data || e?.message || 'run_failed';
        await updateJob(runId, {
          state: 'error',
          finishedAt: nowIso(),
          error: { status, detail }
        });
      }
    });

    return res.status(202).json({
      success: true,
      async: true,
      runId,
      next: `/smart/run-status/${runId}`
    });
  } catch (e) {
    const status = e?.response?.status || 500;
    const detail = e?.response?.data?.error || e?.response?.data || e?.message;
    return res.status(status).json({ error: 'run_once_failed', detail });
  }
});

/* ----------------------- RUN STATUS (ASYNC) ----------------------- */
router.get('/run-status/:runId', async (req, res) => {
  try {
    await ensureSmartTables();
    const { runId } = req.params;
    const job = await getJob(runId);
    if (!job) return res.status(404).json({ error: 'run_not_found' });

    // return minimal + result when done
    const out = {
      id: job.id,
      campaignId: job.campaignId,
      accountId: job.accountId,
      state: job.state,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      payloadPreview: job.payloadPreview
    };

    if (job.state === 'done') out.result = job.result;
    if (job.state === 'error') out.error = job.error;

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------- PERSIST STOP RULES ------------------------- */
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

/* ------------------------------ STATUS ------------------------------ */
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

/* ----------------------------- SWEEP NOW ----------------------------- */
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

/* ---------------------------- COMMIT NOW ---------------------------- */
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

    const eligibleAdsets = [];
    const losersToPause = [];

    for (const adsetId of (analysis.adsetIds || [])) {
      const adIds = analysis.adMapByAdset?.[adsetId] || [];
      if (!adIds.length) continue;

      const hasStop = adIds.some(id => analysis.stopFlagsByAd?.[id]?.any);
      if (!hasStop) continue;

      const loserList = analysis.losersByAdset?.[adsetId] || [];
      if (loserList.length) {
        losersToPause.push(...loserList);
        eligibleAdsets.push(adsetId);
      }
    }

    if (!losersToPause.length) {
      return res.json({
        success: true,
        message: 'No ad sets met stop rules yet. Nothing paused.',
        eligibleAdsets
      });
    }

    const uniqueLosers = Array.from(new Set(losersToPause)).filter(Boolean);
    await deployer.pauseAds({ adIds: uniqueLosers, userToken });

    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      campaignId, accountId, startedAt: nowIso(),
      mode: 'stop_rules_commit',
      plateauDetected: true,
      variantPlan: { images: 0, videos: 0 },
      createdAdsByAdset: {},
      pausedAdsByAdset: { '*': uniqueLosers },
      meta: { eligibleAdsets }
    });
    await db.write();

    res.json({ success: true, paused: uniqueLosers, eligibleAdsets });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
