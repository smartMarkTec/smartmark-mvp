// server/routes/smart.js
'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');

const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer, testing } = require('../smartCampaignEngine');

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://smartmark-mvp.onrender.com';

/* ----------------------- DB TABLES ----------------------- */

async function ensureSmartTables() {
  await db.read();
  db.data = db.data || {};
  db.data.users = db.data.users || [];
  db.data.campaigns = db.data.campaigns || [];
  db.data.smart_configs = db.data.smart_configs || [];
  db.data.smart_runs = db.data.smart_runs || [];
  db.data.creative_history = db.data.creative_history || [];
  db.data.campaign_creatives = db.data.campaign_creatives || [];

  // async job tracking (persisted)
  db.data.smart_run_jobs = db.data.smart_run_jobs || [];

  await db.write();
}

function nowIso() {
  return new Date().toISOString();
}

/* ----------------------- POLICY HELPERS ----------------------- */

function resolveFlightHours({ startAt, endAt, fallbackHours = 0 }) {
  if (endAt) {
    const start = startAt || nowIso();
    const h = (new Date(endAt).getTime() - new Date(start).getTime()) / 36e5;
    return Math.max(0, Math.round(h));
  }
  return Math.max(0, Number(fallbackHours || 0));
}

/**
 * ✅ Scope change: STATIC IMAGE ADS ONLY.
 * We still accept assetTypes/mediaSelection for backwards compatibility,
 * but we force images-only behavior here.
 */
function decideVariantPlanFrom(cfg = {}, overrides = {}) {
  const forceTwoPerType = !!(overrides.forceTwoPerType ?? cfg.forceTwoPerType);
  if (forceTwoPerType) {
    return { images: 2 };
  }

  const overrideCountPerType = overrides.overrideCountPerType || cfg.overrideCountPerType || null;
  const dailyBudget = Number(overrides.dailyBudget ?? cfg.dailyBudget ?? 0);
  const flightHours = resolveFlightHours({
    startAt: overrides.flightStart || cfg.flightStart,
    endAt: overrides.flightEnd || cfg.flightEnd,
    fallbackHours: overrides.flightHours ?? cfg.flightHours ?? 0
  });

  // If caller provides overrideCountPerType, only respect "images" (ignore videos)
  if (overrideCountPerType && typeof overrideCountPerType === 'object') {
    return policy.decideVariantPlan({
      assetTypes: 'image',
      dailyBudget,
      flightHours,
      overrideCountPerType: { images: Number(overrideCountPerType.images || 0) }
    });
  }

  return policy.decideVariantPlan({
    assetTypes: 'image',
    dailyBudget,
    flightHours,
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
    MAX_TEST_HOURS: Number(s.timeCapHours ?? base.MAX_TEST_HOURS)
  };
}

// persist seed inputs so scheduler can always regenerate correctly
function mergeSeedIntoCfg(cfg, incoming = {}) {
  if (!cfg) return;
  const hasObj = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;

  const next = { ...(cfg.seed || {}) };
  if (hasObj(incoming.form)) next.form = incoming.form;
  if (hasObj(incoming.answers)) next.answers = incoming.answers;
  if (incoming.url) next.url = String(incoming.url);

  // ✅ Always persist images-only (ignore legacy mediaSelection)
  next.mediaSelection = 'image';

  if (Object.keys(next).length > 0) cfg.seed = next;
}

// Count creatives even in dryRun so you can verify 2 image variants logic
function countCreatives(creatives) {
  const counts = { images: 0 };
  if (!creatives) return counts;

  // object shape
  if (typeof creatives === 'object' && !Array.isArray(creatives)) {
    if (Array.isArray(creatives.images)) counts.images += creatives.images.length;

    if (Array.isArray(creatives.variants)) {
      for (const v of creatives.variants) {
        const kind = (v?.kind || v?.type || '').toLowerCase();
        const id = String(v?.id || v?.variantId || '');
        if (kind === 'image' || id.startsWith('img_')) counts.images += 1;
      }
    }
    return counts;
  }

  // array shape
  if (Array.isArray(creatives)) {
    for (const v of creatives) {
      const kind = (v?.kind || v?.type || '').toLowerCase();
      const id = String(v?.id || v?.variantId || '');
      if (kind === 'image' || id.startsWith('img_')) counts.images += 1;
    }
  }

  return counts;
}

/* ----------------------- ASYNC JOB HELPERS ----------------------- */

function newRunId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * In-memory fallback fixes occasional "run_not_found" immediately after returning runId
 * (e.g., during quick restarts or db races).
 */
const JOB_MEM = new Map();

function instanceTag() {
  // useful for debugging multi-instance behavior on Render
  return process.env.RENDER_INSTANCE_ID || `${process.pid}`;
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

    // ✅ Persist full payload so ANY instance can pick up and run the job later.
    payload,

    payloadPreview: {
      simulate: !!payload.simulate,
      creativeType: 'image',
      dryRun: !!payload.dryRun,
      overrideCountPerType: payload.overrideCountPerType || null,
      forceTwo: !!payload.forceTwoPerType
    },

    claimedBy: null,
    result: null,
    error: null
  };

  db.data.smart_run_jobs.push(job);
  await db.write();

  JOB_MEM.set(runId, job);
  return job;
}

async function updateJob(runId, patch) {
  await db.read();
  db.data.smart_run_jobs = db.data.smart_run_jobs || [];

  let job = (db.data.smart_run_jobs || []).find((j) => j.id === runId);

  // fallback: rebuild from memory if db lost it
  if (!job && JOB_MEM.has(runId)) {
    job = JOB_MEM.get(runId);
    db.data.smart_run_jobs.push(job);
  }

  if (!job) return null;

  Object.assign(job, patch);
  await db.write();

  JOB_MEM.set(runId, job);
  return job;
}

async function getJob(runId) {
  if (JOB_MEM.has(runId)) return JOB_MEM.get(runId);

  await db.read();
  const job = (db.data.smart_run_jobs || []).find((j) => j.id === runId) || null;
  if (job) JOB_MEM.set(runId, job);
  return job;
}

// simple concurrency gate so Render doesn’t melt
let inFlight = 0;
const MAX_IN_FLIGHT = Number(process.env.SMART_RUN_CONCURRENCY || 1);

async function withConcurrency(fn) {
  while (inFlight >= MAX_IN_FLIGHT) {
    await new Promise((r) => setTimeout(r, 250));
  }
  inFlight += 1;
  try {
    return await fn();
  } finally {
    inFlight -= 1;
  }
}

function withTimeout(promise, ms, label = 'timeout') {
  if (!ms || ms <= 0) return promise;
  let t = null;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => {
      const err = new Error(label);
      err.status = 504;
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (t) clearTimeout(t);
  });
}

/**
 * ✅ Critical fix for "queued forever" (multi-instance / restarts):
 * If a job is still queued when /run-status is called, the instance handling
 * that request can "kick" it and run it.
 */
async function kickJobIfQueued(runId) {
  const job = await getJob(runId);
  if (!job) return false;
  if (job.state !== 'queued') return false;
  if (!job.payload) return false;

  // Claim it
  const claimedBy = instanceTag();
  const claimed = await updateJob(runId, {
    state: 'running',
    startedAt: nowIso(),
    claimedBy
  });

  // If something changed (another instance claimed it), do nothing.
  if (!claimed || claimed.state !== 'running' || claimed.claimedBy !== claimedBy) return false;

  setImmediate(async () => {
    try {
      const payload = claimed.payload || job.payload;
      const result = await withConcurrency(() => runSmartOnceInternal(payload));
      await updateJob(runId, { state: 'done', finishedAt: nowIso(), result });
    } catch (e) {
      const status = e?.status || e?.response?.status || 500;
      const detail =
        e?.detail ||
        e?.response?.data?.error ||
        e?.response?.data ||
        e?.message ||
        'run_failed';

      await updateJob(runId, {
        state: 'error',
        finishedAt: nowIso(),
        error: { status, detail }
      });
    }
  });

  return true;
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
      accountId,
      campaignId,
      pageId,
      link,
      kpi = 'cpc',

      // ✅ static-only defaults
      assetTypes = 'image',

      dailyBudget = 0,
      flightStart = null,
      flightEnd = null,
      flightHours = 0,
      overrideCountPerType = null,
      forceTwoPerType = false,
      thresholds = {},
      stopRules = {},
      form = null,
      answers = null,
      url = ''
    } = req.body;

    if (!accountId || !campaignId || !pageId) {
      return res.status(400).json({ error: 'accountId, campaignId, pageId are required' });
    }

    const mergedThresholds = { ...(policy.THRESHOLDS || {}), ...(thresholds || {}) };
    const mergedStopRules = { ...(policy.STOP_RULES || {}), ...(stopRules || {}) };

    await db.read();
    const existing = (db.data.smart_configs || []).find((c) => c.campaignId === campaignId);

    if (existing) {
      existing.pageId = pageId;
      existing.accountId = accountId;
      existing.link = link || existing.link || '';
      existing.kpi = kpi;

      // ✅ force images-only
      existing.assetTypes = 'image';

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
        mediaSelection: 'image'
      });
    } else {
      const cfg = {
        id: `sc_${campaignId}`,
        accountId,
        campaignId,
        pageId,
        link: link || '',
        kpi,

        // ✅ force images-only
        assetTypes: 'image',

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
        lastRunAt: null,
        state: { adsets: {} }
      };

      mergeSeedIntoCfg(cfg, {
        form: form && typeof form === 'object' ? form : null,
        answers: answers && typeof answers === 'object' ? answers : null,
        url: url || (form && form.url) || link || cfg.link || '',
        mediaSelection: 'image'
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
    accountId,
    campaignId,
    pageId = null,

    form = {},
    answers = {},
    url = '',

    // ✅ legacy input accepted, ignored
    mediaSelection = 'image',

    force = false,
    initial = false,
    dailyBudget = null,
    flightStart = null,
    flightEnd = null,
    flightHours = null,
    overrideCountPerType = null,
    forceTwoPerType = null,
    championPct: championPctRaw = 0.7,

    // IMPORTANT: default dryRun is true for safety
    dryRun: dryRunRaw = true,

    debug: debugRaw = false
  } = reqBody;

  const debug = !!debugRaw;

  if (!accountId || !campaignId) {
    const err = new Error('accountId and campaignId are required');
    err.status = 400;
    throw err;
  }

  // "noSpend" should mean: keep things PAUSED, not "fake run"
  const noSpend = process.env.NO_SPEND === '1' || !!reqBody.noSpend;

  // Only force dryRun from explicit env flags (or request). NO_SPEND no longer forces dryRun.
  const envDryRun = process.env.SMART_DRY_RUN === '1' || process.env.DRY_RUN === '1';
  const dryRun = envDryRun ? true : !!dryRunRaw;

  await db.read();
  let cfg = (db.data.smart_configs || []).find((c) => c.campaignId === campaignId);

  if (!cfg) {
    if (!pageId) {
      const err = new Error('Config not found. Provide pageId or call /smart/enable first.');
      err.status = 400;
      throw err;
    }

    cfg = {
      id: `sc_${campaignId}`,
      accountId,
      campaignId,
      pageId,
      link: form?.url || url || '',
      kpi: 'cpc',

      // ✅ force images-only
      assetTypes: 'image',

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
      lastRunAt: null,
      state: { adsets: {} }
    };

    mergeSeedIntoCfg(cfg, {
      form,
      answers,
      url: url || form?.url || cfg.link || '',
      mediaSelection: 'image'
    });

    db.data.smart_configs.push(cfg);
    await db.write();
  } else {
    mergeSeedIntoCfg(cfg, {
      form,
      answers,
      url: url || form?.url || '',
      mediaSelection: 'image'
    });

    cfg.updatedAt = nowIso();
    if (pageId) cfg.pageId = pageId;

    // ✅ force images-only even if older cfg had "both"
    cfg.assetTypes = 'image';

    await db.write();
  }

  function buildSimAnalysis({ day = 1, campaignId }) {
    const adsetId = `SIM_ADSET_${campaignId}`;
    const adA = `SIM_AD_A_${campaignId}`;
    const adB = `SIM_AD_B_${campaignId}`;

    const plateau = day >= 8;

    const mk = (impressions, clicks, spend, frequency) => ({
      impressions,
      clicks,
      spend,
      frequency,
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
        accountId,
        campaignId,
        userToken,
        kpi: cfg.kpi || 'cpc',
        stopRules: normalizeStopRules(cfg)
      });

  const variantPlan = decideVariantPlanFrom(cfg, {
    // ignore mediaSelection/assetTypes now
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
      message: plateauDetected ? 'Plateau detected — would regenerate image creatives now (SIM).' : 'No plateau detected (SIM).',
      analysis,
      variantPlan,
      plannedAction: plateauDetected ? { action: 'REGENERATE_CREATIVES', addNewVariants: { images: 2 } } : { action: 'NONE' }
    };
  }

  if (!plateauDetected && !shouldForceInitial) {
    return { success: true, message: 'No plateau detected (and not forced).', analysis, variantPlan };
  }

  // fallback to stored seed if caller did not send form/answers/url
  const seed = cfg.seed || {};
  const useForm = form && typeof form === 'object' && Object.keys(form).length ? form : seed.form || {};
  const useAnswers = answers && typeof answers === 'object' && Object.keys(answers).length ? answers : seed.answers || {};
  const useUrl = url || useForm?.url || seed.url || cfg.link || '';

  // hard cap generation time so jobs do NOT sit "running" forever
  const GEN_MAX_MS = Number(process.env.SMART_GENERATION_MAX_MS || 12 * 60 * 1000); // 12 minutes default

  const creatives = await withTimeout(
    generator.generateVariants({
      form: useForm,
      answers: useAnswers,
      url: useUrl,
      mediaSelection: 'image', // ignored by generator; kept for compatibility
      variantPlan,
      debug
    }),
    GEN_MAX_MS,
    'generation_timeout'
  );

  const generatedCounts = countCreatives(creatives);

  const wantImages = Number(variantPlan.images || 0);

  // HARD FAIL: expected > 0 but got 0
  if (wantImages > 0 && generatedCounts.images === 0) {
    const err = new Error('generation_returned_zero_assets');
    err.status = 502;
    err.detail = {
      error: 'generation_returned_zero_assets',
      expectedPerType: { images: wantImages },
      generatedCounts,
      generatorErrors: Array.isArray(creatives?._errors) ? creatives._errors.slice(-25) : []
    };
    throw err;
  }

  // Determine target ad sets from analysis (fallback: fetch)
  let adsetIds = Array.isArray(analysis.adsetIds) ? analysis.adsetIds.slice() : [];
  if (!adsetIds.length) {
    try {
      const adsetsResp = await axios.get(`https://graph.facebook.com/v23.0/${campaignId}/adsets`, {
        params: { access_token: userToken, fields: 'id,name,status,effective_status', limit: 50 }
      });
      adsetIds = (adsetsResp.data?.data || []).map((a) => a.id);
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
    const totalBudgetCents = Math.max(100, Math.round(Number(dailyBudget ?? cfg.dailyBudget ?? 10) * 100));

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
      const cfgRef = (db.data.smart_configs || []).find((c) => c.campaignId === campaignId);
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

  // For forced/initial runs, DO NOT pause anything.
  // We want to "add" creatives for testing, not replace/kill the baseline ad.
  const initialLike = !!shouldForceInitial || !cfg.lastRunAt;

  const winnersByAdset = initialLike ? {} : analysis.winnersByAdset || {};
  const losersByAdset =
    plateauDetected && !shouldForceInitial ? {} : initialLike ? {} : analysis.losersByAdset || {};

  const deployed = await deployer.deploy({
    accountId,
    pageId: cfg.pageId,
    campaignLink: cfg.link || useForm?.url || useUrl || 'https://your-smartmark-site.com',
    adsetIds: adsetIdsForNewCreatives,
    winnersByAdset,
    losersByAdset,
    creatives,
    userToken,
    dryRun: !!dryRun,
    debug
  });

  // HARD FAIL if we generated assets but Facebook created 0 ads.
  let createdImageTotal = 0;
  Object.values(deployed?.variantMapByAdset || {}).forEach((vmap) => {
    Object.keys(vmap || {}).forEach((variantId) => {
      if (String(variantId).startsWith('img_')) createdImageTotal += 1;
    });
  });

  if (wantImages > 0 && createdImageTotal === 0) {
    const err = new Error('deploy_created_zero_image_ads');
    err.status = 502;
    err.detail = {
      wantImages,
      createdImageTotal,
      dryRun,
      noSpend,
      note: 'Generated images but created 0 image ads'
    };
    throw err;
  }

  await db.read();
  const run = {
    id: `run_${Date.now()}`,
    campaignId,
    accountId,
    startedAt: nowIso(),
    mode: plateauDetected && !shouldForceInitial ? 'plateau' : 'initial',
    plateauDetected: plateauDetected || shouldForceInitial,
    variantPlan,
    generatedCounts,
    createdAdsByAdset: deployed.createdAdsByAdset,
    pausedAdsByAdset: deployed.pausedAdsByAdset,
    ...(budgetSplit ? { budgetSplit } : {}),
    meta: { dryRun: !!dryRun, noSpend: !!noSpend, creativeType: 'image' }
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
        kind: 'image'
      });
    });
  });

  const cfgRef2 = (db.data.smart_configs || []).find((c) => c.campaignId === campaignId);
  if (cfgRef2) {
    cfgRef2.lastRunAt = nowIso();
    cfgRef2.updatedAt = nowIso();
  }
  await db.write();

  const createdCounts = Object.fromEntries(
    Object.entries(deployed.variantMapByAdset || {}).map(([adsetId, vmap]) => {
      const counts = { images: 0 };
      Object.keys(vmap || {}).forEach((vid) => {
        if (String(vid).startsWith('img_')) counts.images++;
      });
      return [adsetId, counts];
    })
  );

  return {
    success: true,
    run,
    analysis,
    variantPlan,
    expectedPerType: { images: wantImages },
    generatedCounts,
    createdCountsPerAdset: createdCounts
  };
}

/* ---------------------------- RUN ONCE ---------------------------- */

router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();

    const simulate = !!req.body?.simulate;
    const wantAsync = simulate ? false : req.body?.async !== false; // default true

    const { accountId, campaignId } = req.body || {};
    if (!accountId || !campaignId) {
      return res.status(400).json({ error: 'accountId and campaignId are required' });
    }

    if (!wantAsync) {
      const out = await withConcurrency(() => runSmartOnceInternal(req.body));
      return res.json(out);
    }

    const runId = newRunId();
    await createJobRecord({ runId, campaignId, accountId, payload: req.body });

    // Best-effort local kick (may not run if different instance serves /run-status)
    setImmediate(async () => {
      try {
        const job = await getJob(runId);
        if (!job || job.state !== 'queued') return;

        const claimedBy = instanceTag();
        const claimed = await updateJob(runId, {
          state: 'running',
          startedAt: nowIso(),
          claimedBy
        });

        if (!claimed || claimed.state !== 'running' || claimed.claimedBy !== claimedBy) return;

        const payload = claimed.payload || req.body;

        const result = await withConcurrency(() => runSmartOnceInternal(payload));
        await updateJob(runId, { state: 'done', finishedAt: nowIso(), result });
      } catch (e) {
        const status = e?.status || e?.response?.status || 500;
        const detail =
          e?.detail ||
          e?.response?.data?.error ||
          e?.response?.data ||
          e?.message ||
          'run_failed';

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

    let job = await getJob(runId);
    if (!job) return res.status(404).json({ error: 'run_not_found' });

    // ✅ If it's queued, kick it on THIS instance so it doesn't sit forever.
    if (job.state === 'queued') {
      await kickJobIfQueued(runId);
      job = await getJob(runId);
    }

    const out = {
      id: job.id,
      campaignId: job.campaignId,
      accountId: job.accountId,
      state: job.state,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      payloadPreview: job.payloadPreview,
      claimedBy: job.claimedBy || null
    };

    if (job.state === 'done') out.result = job.result;
    if (job.state === 'error') out.error = job.error;

    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/status/:campaignId', async (req, res) => {
  try {
    await ensureSmartTables();
    const { campaignId } = req.params;

    await db.read();
    const cfg = (db.data.smart_configs || []).find((c) => c.campaignId === campaignId);
    const runs = (db.data.smart_runs || []).filter((r) => r.campaignId === campaignId).slice(-10).reverse();

    res.json({ config: cfg || null, recentRuns: runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
