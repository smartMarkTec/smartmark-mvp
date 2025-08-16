// server/scheduler/jobs.js
// Interval-based scheduler: scans smart configs daily (and initial delay) to spawn challengers on plateau.
// Uses combined SmartCampaignEngine and LowDB.

const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer } = require('../smartCampaignEngine');

async function ensureSmartTables() {
  await db.read();
  db.data = db.data || {};
  db.data.smart_configs = db.data.smart_configs || [];
  db.data.smart_runs = db.data.smart_runs || [];
  db.data.creative_history = db.data.creative_history || [];
  await db.write();
}

function nowIso() { return new Date().toISOString(); }

function hoursSince(iso) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

function resolveFlightHours({ startAt, endAt, fallbackHours = 0 }) {
  if (endAt) {
    const start = startAt || nowIso();
    const h = (new Date(endAt).getTime() - new Date(start).getTime()) / 36e5;
    return Math.max(0, Math.round(h));
  }
  return Math.max(0, Number(fallbackHours || 0));
}

/**
 * Decide variant plan (1 vs 2 per type) for scheduled runs.
 * - honors cfg.forceTwoPerType (always 2-per-selected-type)
 * - honors cfg.overrideCountPerType when provided
 * - otherwise uses guardrails in policy.decideVariantPlan
 */
function decideVariantPlanFrom(cfg = {}) {
  const assetTypes = String(cfg.assetTypes || 'both').toLowerCase();
  const wantsImage = assetTypes === 'image' || assetTypes === 'both';
  const wantsVideo = assetTypes === 'video' || assetTypes === 'both';

  if (cfg.forceTwoPerType) {
    return { images: wantsImage ? 2 : 0, videos: wantsVideo ? 2 : 0 };
  }

  const dailyBudget = Number(cfg.dailyBudget || 0);
  const flightHours = resolveFlightHours({
    startAt: cfg.flightStart,
    endAt: cfg.flightEnd,
    fallbackHours: cfg.flightHours || 0
  });

  return policy.decideVariantPlan({
    assetTypes,
    dailyBudget,
    flightHours,
    overrideCountPerType: cfg.overrideCountPerType || null
  });
}

async function runSmartForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return; // not logged in with FB

  const { accountId, campaignId } = cfg || {};
  if (!accountId || !campaignId || !cfg.pageId) return;

  // Rate limit: avoid hammering. Respect both scheduler cadence and "new ads" spacing.
  if (hoursSince(cfg.lastRunAt) < Math.min(
    policy.LIMITS.MIN_HOURS_BETWEEN_RUNS || 24,
    policy.LIMITS.MIN_HOURS_BETWEEN_NEW_ADS || 72
  )) {
    return;
  }

  // 1) Analyze current performance
  let analysis;
  try {
    analysis = await analyzer.analyzeCampaign({
      accountId,
      campaignId,
      userToken,
      kpi: cfg.kpi || 'cpc'
    });
  } catch (e) {
    console.error('[SmartScheduler] analyze error:', e?.response?.data?.error?.message || e.message);
    return;
  }

  // 2) Plateau signal (champion-level); if none, skip
  const somePlateau = Object.values(analysis.championPlateauByAdset || {}).some(Boolean);
  if (!somePlateau) return;

  // 3) Decide how many challengers (guardrails or forced)
  const variantPlan = decideVariantPlanFrom(cfg);

  // 4) Generate challengers
  let creatives = [];
  try {
    creatives = await generator.generateVariants({
      form: {},
      answers: {},
      url: cfg.link || '',
      mediaSelection: cfg.assetTypes || 'both',
      variantPlan
    });
  } catch (e) {
    console.error('[SmartScheduler] generateVariants error:', e.message);
    return;
  }
  if (!creatives.length) return;

  // 5) Deploy challengers (into same ad sets) + pause current losers
  let deployed;
  try {
    deployed = await deployer.deploy({
      accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || 'https://your-smartmark-site.com',
      adsetIds: analysis.adsetIds,
      winnersByAdset: analysis.winnersByAdset,
      losersByAdset: analysis.losersByAdset, // deployer will pause these
      creatives,
      userToken
    });
  } catch (e) {
    console.error('[SmartScheduler] deploy error:', e?.response?.data?.error?.message || e.message);
    return;
  }

  // 6) Persist run + creative mappings
  await db.read();
  db.data.smart_runs.push({
    id: `run_${Date.now()}`,
    campaignId,
    accountId,
    startedAt: nowIso(),
    plateauDetected: true,
    variantPlan,
    createdAdsByAdset: deployed.createdAdsByAdset,
    pausedAdsByAdset: deployed.pausedAdsByAdset
  });

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

  // Update lastRunAt
  const cfgRef = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
  if (cfgRef) cfgRef.lastRunAt = nowIso();
  await db.write();
}

async function sweep() {
  try {
    await ensureSmartTables();
    await db.read();
    const configs = db.data.smart_configs || [];
    for (const cfg of configs) {
      try {
        await runSmartForConfig(cfg);
      } catch (e) {
        console.error('[SmartScheduler] run error:', e.message);
      }
    }
  } catch (e) {
    console.error('[SmartScheduler] sweep error:', e.message);
  }
}

function start() {
  // First run after ~2 minutes (give time for campaigns to start), then every 24h
  setTimeout(sweep, 2 * 60 * 1000);
  setInterval(sweep, 24 * 60 * 60 * 1000);
}

module.exports = { start };
