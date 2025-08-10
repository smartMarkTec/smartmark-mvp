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

function resolveFlightHours({ startAt, endAt, fallbackHours = 0 }) {
  if (endAt) {
    const start = startAt || nowIso();
    const h = (new Date(endAt).getTime() - new Date(start).getTime()) / 36e5;
    return Math.max(0, Math.round(h));
  }
  return Math.max(0, Number(fallbackHours || 0));
}

function decideVariantPlanFrom(cfg = {}) {
  const assetTypes = cfg.assetTypes || 'both';
  const dailyBudget = Number(cfg.dailyBudget || 0);
  const flightHours = resolveFlightHours({
    startAt: cfg.flightStart,
    endAt: cfg.flightEnd,
    fallbackHours: cfg.flightHours || 0
  });
  return policy.decideVariantPlan({ assetTypes, dailyBudget, flightHours, overrideCountPerType: cfg.overrideCountPerType || null });
}

async function runSmartForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return;

  const { accountId, campaignId } = cfg;

  // Analyze
  const analysis = await analyzer.analyzeCampaign({
    accountId,
    campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc'
  });

  // Plateau signal (champion-level)
  const somePlateau = Object.values(analysis.championPlateauByAdset || {}).some(Boolean);
  if (!somePlateau) return;

  // Respect 72h between NEW ads per adset (soft via MIN_HOURS_BETWEEN_NEW_ADS); we check lastRunAt
  if (cfg.lastRunAt) {
    const hours = (Date.now() - new Date(cfg.lastRunAt).getTime()) / 36e5;
    if (hours < policy.LIMITS.MIN_HOURS_BETWEEN_NEW_ADS) return;
  }

  // Variant plan (1 or 2 per type based on guardrails)
  const variantPlan = decideVariantPlanFrom(cfg);

  // Generate challengers
  const creatives = await generator.generateVariants({
    form: {},
    answers: {},
    url: cfg.link || '',
    mediaSelection: cfg.assetTypes || 'both',
    variantPlan
  });

  // Deploy challengers + pause current losers
  const deployed = await deployer.deploy({
    accountId,
    pageId: cfg.pageId,
    campaignLink: cfg.link || 'https://your-smartmark-site.com',
    adsetIds: analysis.adsetIds,
    winnersByAdset: analysis.winnersByAdset,
    losersByAdset: analysis.losersByAdset,
    creatives,
    userToken
  });

  // Log + update
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

  // Archive variant↔adId
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

  const cfgRef = db.data.smart_configs.find(c => c.campaignId === campaignId);
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
  // First run after 2 minutes, then every 24h
  setTimeout(sweep, 2 * 60 * 1000);
  setInterval(sweep, 24 * 60 * 60 * 1000);
}

module.exports = { start };
