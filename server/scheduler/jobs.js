// server/scheduler/jobs.js
// Interval-based scheduler: enforces stop rules frequently and spawns challengers on plateau.
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

/**
 * Decide A/B winner using CPC as primary, CTR as tie-breaker.
 * @param {Object} adIds array of ad ids
 * @param {Object} adInsights map adId -> { recent:{cpc,ctr} }
 * @returns { winnerId, losers[] }
 */
function chooseWinnerByCpcCtr(adIds, adInsights) {
  const rows = adIds.map(id => {
    const w = adInsights[id] || {};
    const r = w.recent || {};
    const cpc = (typeof r.cpc === 'number' && isFinite(r.cpc)) ? r.cpc : null;
    const ctr = (typeof r.ctr === 'number' && isFinite(r.ctr)) ? r.ctr : null;
    return { id, cpc, ctr };
  });

  // Sort by CPC asc (nulls to end); tie -> CTR desc
  rows.sort((a, b) => {
    const an = (a.cpc === null), bn = (b.cpc === null);
    if (an && bn) {
      // both null CPC → compare CTR
      const actr = a.ctr ?? -Infinity, bctr = b.ctr ?? -Infinity;
      return bctr - actr;
    }
    if (an) return 1;
    if (bn) return -1;
    if (a.cpc !== b.cpc) return a.cpc - b.cpc;
    // tie CPC → CTR desc
    const actr = a.ctr ?? -Infinity, bctr = b.ctr ?? -Infinity;
    return bctr - actr;
  });

  const winnerId = rows[0]?.id || null;
  const losers = rows.slice(1).map(r => r.id);
  return { winnerId, losers };
}

/**
 * Enforce stop rules: when any ad in an ad set hits a stop rule, pause the non-winners.
 */
async function enforceStopRulesForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return;

  const { accountId, campaignId } = cfg;
  const analysis = await analyzer.analyzeCampaign({
    accountId,
    campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc'
  });

  const pausedByAdset = {};
  let anyCommitted = false;

  for (const adsetId of (analysis.adsetIds || [])) {
    const ids = analysis.adMapByAdset[adsetId] || [];
    if (ids.length < 2) continue; // need at least two to pick a winner

    // did ANY ad meet a stop rule?
    const stopHit = ids.some(id => analysis.stopFlagsByAd?.[id]?.any);
    if (!stopHit) continue;

    const { winnerId, losers } = chooseWinnerByCpcCtr(ids, analysis.adInsights);
    if (!winnerId || losers.length === 0) continue;

    await deployer.pauseAds({ adIds: losers, userToken });
    pausedByAdset[adsetId] = losers;
    anyCommitted = true;
  }

  if (anyCommitted) {
    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      campaignId,
      accountId,
      startedAt: nowIso(),
      mode: 'stop_rules',
      message: 'Committed winner by stop rules (paused losers)',
      pausedAdsByAdset: pausedByAdset
    });

    const cfgRef = db.data.smart_configs.find(c => c.campaignId === campaignId);
    if (cfgRef) {
      cfgRef.lastStopRunAt = nowIso();
      cfgRef.updatedAt = nowIso();
    }
    await db.write();
  }
}

/**
 * Plateau flow (unchanged): spawn challengers if champion plateau is detected
 */
async function runPlateauFlowForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return;

  const { accountId, campaignId } = cfg;

  const analysis = await analyzer.analyzeCampaign({
    accountId,
    campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc'
  });

  const somePlateau = Object.values(analysis.championPlateauByAdset || {}).some(Boolean);
  if (!somePlateau) return;

  // throttle new ads by 72h
  if (cfg.lastRunAt) {
    const hours = (Date.now() - new Date(cfg.lastRunAt).getTime()) / 36e5;
    if (hours < policy.LIMITS.MIN_HOURS_BETWEEN_NEW_ADS) return;
  }

  const variantPlan = decideVariantPlanFrom(cfg);
  const creatives = await generator.generateVariants({
    form: {},
    answers: {},
    url: cfg.link || '',
    mediaSelection: cfg.assetTypes || 'both',
    variantPlan
  });

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

  await db.read();
  db.data.smart_runs.push({
    id: `run_${Date.now()}`,
    campaignId,
    accountId,
    startedAt: nowIso(),
    mode: 'plateau',
    plateauDetected: true,
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
        // 1) Commit winners quickly when stop rules hit
        await enforceStopRulesForConfig(cfg);
        // 2) Less frequent: plateau challenger flow
        await runPlateauFlowForConfig(cfg);
      } catch (e) {
        console.error('[SmartScheduler] run error:', e.message);
      }
    }
  } catch (e) {
    console.error('[SmartScheduler] sweep error:', e.message);
  }
}

function start() {
  // Kick off soon after boot
  setTimeout(sweep, 2 * 60 * 1000);
  // Check stop rules & plateau frequently
  setInterval(sweep, 15 * 60 * 1000); // every 15 minutes
}

module.exports = { start };
