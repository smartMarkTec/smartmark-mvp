// server/scheduler/jobs.js
// Interval-based scheduler with STOP-RULE winner commit + plateau-confirmed challengers.
// Honors per-campaign stopRules from smart_configs.

const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { policy, analyzer, generator, deployer } = require('../smartCampaignEngine');

async function ensureSmartTables() {
  await db.read();
  db.data ||= {};
  db.data.smart_configs ||= [];
  db.data.smart_runs ||= [];
  db.data.creative_history ||= [];
  await db.write();
}

const nowIso = () => new Date().toISOString();
const hoursBetween = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 36e5;

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
  return policy.decideVariantPlan({
    assetTypes,
    dailyBudget,
    flightHours,
    overrideCountPerType: cfg.overrideCountPerType || null
  });
}

// --- Tunables for automation behavior ---
const COOLDOWN_NEW_ADS_HOURS = policy?.LIMITS?.MIN_HOURS_BETWEEN_NEW_ADS || 72;
const MIN_HOURS_AFTER_WINNER_TO_CHECK_PLATEAU = 24;
const PLATEAU_CONFIRM_HOURS = 36;   // plateau must persist this long
const MIN_HOURS_LEFT_TO_SPAWN = 24; // must have this many hours left in flight

function ensureCfgState(cfg) {
  cfg.state ||= { adsets: {} };
  // cfg.state.adsets: { [adsetId]: { championAdId, winnerCommittedAt, plateauSince, lastSpawnAt } }
  return cfg.state;
}

function hasRecentSpawn(cfg) {
  if (!cfg.lastRunAt) return false;
  return hoursBetween(nowIso(), cfg.lastRunAt) < COOLDOWN_NEW_ADS_HOURS;
}

function timeLeftOk(cfg) {
  const hoursLeft = resolveFlightHours({
    startAt: cfg.flightStart,
    endAt: cfg.flightEnd,
    fallbackHours: cfg.flightHours || 0
  });
  return hoursLeft >= MIN_HOURS_LEFT_TO_SPAWN;
}

// ---- STOP RULE evaluation (uses per-campaign overrides if present)
function evaluateStopFlags({ windows, createdIso, stop }) {
  const r = windows?.recent || {};
  const s = stop || policy.STOP_RULES;
  const spendOk = (r.spend || 0) >= (s.spendPerAdUSD ?? s.MIN_SPEND_PER_AD ?? 0);
  const impOk   = (r.impressions || 0) >= (s.impressionsPerAd ?? s.MIN_IMPRESSIONS_PER_AD ?? 0);
  const clkOk   = (r.clicks || 0) >= (s.clicksPerAd ?? s.MIN_CLICKS_PER_AD ?? 0);

  let timeOk = false;
  const capHours = (s.timeCapHours ?? s.MAX_TEST_HOURS);
  if (capHours != null && isFinite(capHours) && createdIso) {
    timeOk = hoursBetween(nowIso(), createdIso) >= Number(capHours);
  }

  return { flags: { spend: spendOk, impressions: impOk, clicks: clkOk, time: timeOk },
           any: !!(spendOk || impOk || clkOk || timeOk) };
}

function adCpc(w) {
  const r = w?.recent || {};
  const clicks = Number(r.clicks || 0);
  const spend = Number(r.spend || 0);
  return clicks > 0 ? spend / clicks : Infinity;
}
function adCtr(w) { return Number(w?.recent?.ctr || 0); }

async function commitWinnerIfReady({ cfg, analysis, userToken }) {
  const results = { committed: false, champions: {} };
  const stop = cfg.stopRules && Object.keys(cfg.stopRules).length ? cfg.stopRules : policy.STOP_RULES;

  const state = ensureCfgState(cfg);

  for (const adsetId of analysis.adsetIds) {
    const ids = analysis.adMapByAdset[adsetId] || [];
    if (ids.length < 2) continue;

    const lane = state.adsets[adsetId] || {};
    if (lane.winnerCommittedAt) continue; // already committed in this ad set

    // recompute flags using *cfg.stopRules* against current ad windows
    const perAdFlags = ids.map((id) => {
      const w = analysis.adInsights[id];
      // analyzer didn’t return created_time; we treat time flag as false unless we have it
      const createdIso = null;
      return { id, ...evaluateStopFlags({ windows: w, createdIso, stop }) };
    });

    // Every ad must be "ready" (any flag true OR time flag true)
    const allReady =
      perAdFlags.length > 0 &&
      perAdFlags.every(a => a.any || a.flags.time === true);

    if (!allReady) continue;

    // Choose winner by lowest CPC (tie → higher CTR)
    let best = null;
    for (const id of ids) {
      const w = analysis.adInsights[id];
      const cpc = adCpc(w);
      const ctr = adCtr(w);
      if (!best || cpc < best.cpc - 1e-9 || (Math.abs(cpc - best.cpc) <= 1e-9 && ctr > best.ctr)) {
        best = { id, cpc, ctr };
      }
    }
    const championId = best?.id;
    if (!championId) continue;

    const losers = ids.filter(id => id !== championId);
    if (losers.length) {
      try { await deployer.pauseAds({ adIds: losers, userToken }); } catch {}
    }

    state.adsets[adsetId] = {
      ...(state.adsets[adsetId] || {}),
      championAdId: championId,
      winnerCommittedAt: nowIso(),
      plateauSince: null
    };
    cfg.state = state;

    results.committed = true;
    results.champions[adsetId] = championId;

    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      mode: 'stop_rules_commit',
      campaignId: cfg.campaignId,
      accountId: cfg.accountId,
      adsetId,
      committedAt: nowIso(),
      championAdId: championId,
      losers,
      thresholds: stop
    });
    await db.write();
  }

  if (results.committed) {
    await db.read();
    const ref = (db.data.smart_configs || []).find(c => c.campaignId === cfg.campaignId);
    if (ref) {
      ref.state = cfg.state;
      ref.updatedAt = nowIso();
      await db.write();
    }
  }
  return results;
}

async function spawnChallengersIfPlateau({ cfg, analysis, userToken }) {
  let spawned = false;
  const state = ensureCfgState(cfg);

  for (const adsetId of analysis.adsetIds) {
    const lane = state.adsets[adsetId] || {};
    if (!lane.winnerCommittedAt || !lane.championAdId) continue;

    if (hoursBetween(nowIso(), lane.winnerCommittedAt) < MIN_HOURS_AFTER_WINNER_TO_CHECK_PLATEAU) continue;

    const plateauNow = !!analysis.championPlateauByAdset[adsetId];
    if (!plateauNow) {
      if (lane.plateauSince) state.adsets[adsetId].plateauSince = null;
      continue;
    }

    if (!lane.plateauSince) {
      state.adsets[adsetId] = { ...lane, plateauSince: nowIso() };
      continue;
    }

    const plateauHours = hoursBetween(nowIso(), lane.plateauSince);
    if (plateauHours < PLATEAU_CONFIRM_HOURS) continue;

    if (!timeLeftOk(cfg)) continue;
    if (hasRecentSpawn(cfg)) continue;

    const variantPlan = decideVariantPlanFrom(cfg);

    const creatives = await generator.generateVariants({
      form: {},
      answers: {},
      url: cfg.link || '',
      mediaSelection: cfg.assetTypes || 'both',
      variantPlan
    });

    const deployed = await deployer.deploy({
      accountId: cfg.accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || 'https://your-smartmark-site.com',
      adsetIds: [adsetId],
      winnersByAdset: {},
      losersByAdset: {},
      creatives,
      userToken
    });

    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      mode: 'plateau_challengers',
      campaignId: cfg.campaignId,
      accountId: cfg.accountId,
      startedAt: nowIso(),
      adsetId,
      plateauSince: lane.plateauSince,
      variantPlan,
      createdAdsByAdset: deployed.createdAdsByAdset,
      pausedAdsByAdset: deployed.pausedAdsByAdset
    });

    const ref = (db.data.smart_configs || []).find(c => c.campaignId === cfg.campaignId);
    if (ref) {
      ref.state = {
        ...state,
        adsets: {
          ...state.adsets,
          [adsetId]: {
            ...(state.adsets[adsetId] || {}),
            plateauSince: null,
            lastSpawnAt: nowIso()
          }
        }
      };
      ref.lastRunAt = nowIso();
      ref.updatedAt = nowIso();
      await db.write();
    }

    spawned = true;
  }

  return { spawned };
}

async function runSmartForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return;

  const analysis = await analyzer.analyzeCampaign({
    accountId: cfg.accountId,
    campaignId: cfg.campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc'
  });

  await commitWinnerIfReady({ cfg, analysis, userToken });
  await spawnChallengersIfPlateau({ cfg, analysis, userToken });
}

async function sweep() {
  try {
    await ensureSmartTables();
    await db.read();
    const configs = db.data.smart_configs || [];
    for (const cfg of configs) {
      try {
        ensureCfgState(cfg);
        await runSmartForConfig(cfg);
      } catch (e) {
        console.error('[SmartScheduler] run error:', e?.message || e);
      }
    }
  } catch (e) {
    console.error('[SmartScheduler] sweep error:', e?.message || e);
  }
}

function start() {
  // First pass shortly after boot, then every 15 minutes (metrics polling only).
  setTimeout(sweep, 2 * 60 * 1000);
  setInterval(sweep, 15 * 60 * 1000);
}

module.exports = { start };
