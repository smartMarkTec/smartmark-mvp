// server/scheduler/jobs.js
// Interval-based scheduler with STOP-RULE winner commit + plateau-confirmed challengers.
// Uses SmartCampaignEngine (policy, analyzer, generator, deployer) and LowDB.

const axios = require('axios');                    // <-- add
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

const FB_API_VER = 'v23.0';                        // <-- add
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
const PLATEAU_CONFIRM_HOURS = 36;           // plateau must persist this long
const MIN_HOURS_LEFT_TO_SPAWN = 24;         // must have this many hours left in flight

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

function adCpc(w) {
  const r = w?.recent || {};
  const clicks = Number(r.clicks || 0);
  const spend = Number(r.spend || 0);
  return clicks > 0 ? spend / clicks : Infinity;
}
function adCtr(w) {
  return Number(w?.recent?.ctr || 0);
}

// Pause helper (direct Graph call)
async function pauseAdsDirect({ adIds, userToken }) {
  for (const id of adIds) {
    try {
      await axios.post(
        `https://graph.facebook.com/${FB_API_VER}/${id}`,
        { status: 'PAUSED' },
        { params: { access_token: userToken } }
      );
    } catch (e) {
      console.warn('Pause failed for', id, e?.response?.data?.error?.message || e.message);
    }
  }
}

async function commitWinnerIfReady({ cfg, analysis, userToken }) {
  // We commit winners per ad set when each active test ad has *some* stop flag triggered,
  // OR the time cap flag is true for each ad (so tests can't drag forever).
  const results = { committed: false, champions: {} };

  for (const adsetId of analysis.adsetIds) {
    const ids = analysis.adMapByAdset[adsetId] || [];
    if (ids.length < 2) continue; // need at least 2 to "A/B"

    const state = ensureCfgState(cfg);
    const lane = state.adsets[adsetId] || {};
    if (lane.winnerCommittedAt) continue; // already committed a winner here

    // Gather stop flags for all ads in this ad set
    const perAdFlags = ids.map((id) => ({
      id,
      flags: analysis.stopFlagsByAd[id]?.flags || {},
      any: !!analysis.stopFlagsByAd[id]?.any
    }));

    // Are *all* ads "ready" to judge? (any stop flag or time flag)
    const allReady =
      perAdFlags.length > 0 &&
      perAdFlags.every(a => a.any || a.flags.time === true);

    if (!allReady) continue;

    // Pick winner by lowest CPC (tie → higher CTR)
    let best = null;
    for (const id of ids) {
      const w = analysis.adInsights[id];
      const cpc = adCpc(w);
      const ctr = adCtr(w);
      if (!best) best = { id, cpc, ctr };
      else if (cpc < best.cpc - 1e-9) best = { id, cpc, ctr };
      else if (Math.abs(cpc - best.cpc) <= 1e-9 && ctr > best.ctr) best = { id, cpc, ctr };
    }
    const championId = best?.id;
    if (!championId) continue;

    // Losers = everyone else → pause them
    const losers = ids.filter(id => id !== championId);
    if (losers.length) {
      await pauseAdsDirect({ adIds: losers, userToken });
    }

    // Persist champion into config state
    state.adsets[adsetId] = {
      ...(state.adsets[adsetId] || {}),
      championAdId: championId,
      winnerCommittedAt: nowIso(),
      plateauSince: null
    };
    cfg.state = state;
    results.committed = true;
    results.champions[adsetId] = championId;

    // Log a "stop_rules" run
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
      thresholds: policy.STOP_RULES
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
  // Only after a winner is committed AND enough time passed AND plateau is confirmed.
  let spawned = false;

  const state = ensureCfgState(cfg);

  for (const adsetId of analysis.adsetIds) {
    const lane = state.adsets[adsetId] || {};
    if (!lane.winnerCommittedAt || !lane.championAdId) continue;

    // Require champion to be "mature" for at least 24h before considering plateau
    if (hoursBetween(nowIso(), lane.winnerCommittedAt) < MIN_HOURS_AFTER_WINNER_TO_CHECK_PLATEAU) continue;

    // Plateau signal from analyzer
    const plateauNow = !!analysis.championPlateauByAdset[adsetId];
    if (!plateauNow) {
      // clear any partial plateau window
      if (lane.plateauSince) {
        state.adsets[adsetId].plateauSince = null;
      }
      continue;
    }

    // Start plateau window if not present
    if (!lane.plateauSince) {
      state.adsets[adsetId] = { ...lane, plateauSince: nowIso() };
      continue;
    }

    // Confirm plateau duration
    const plateauHours = hoursBetween(nowIso(), lane.plateauSince);
    if (plateauHours < PLATEAU_CONFIRM_HOURS) continue;

    // Guards: time left & global cooldown
    if (!timeLeftOk(cfg)) continue;
    if (hasRecentSpawn(cfg)) continue;

    // Decide how many variants
    const variantPlan = decideVariantPlanFrom(cfg);

    // Generate challengers (match original assetTypes)
    const creatives = await generator.generateVariants({
      form: {},
      answers: {},
      url: cfg.link || '',
      mediaSelection: cfg.assetTypes || 'both',
      variantPlan
    });

    // Deploy challengers. IMPORTANT: don't pause champion on plateau spawn.
    const deployed = await deployer.deploy({
      accountId: cfg.accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || 'https://your-smartmark-site.com',
      adsetIds: [adsetId],
      winnersByAdset: {},   // keep current champion
      losersByAdset: {},    // do not pause anyone at spawn
      creatives,
      userToken
    });

    // Log & update state
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
            plateauSince: null,        // reset plateau window after spawn
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

  // Analyze current performance
  const analysis = await analyzer.analyzeCampaign({
    accountId: cfg.accountId,
    campaignId: cfg.campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc'
  });

  // 1) Stop rules -> commit winner (pause losers, keep champion active)
  await commitWinnerIfReady({ cfg, analysis, userToken });

  // 2) Plateau confirmed -> spawn challengers
  await spawnChallengersIfPlateau({ cfg, analysis, userToken });
}

async function sweep() {
  try {
    await ensureSmartTables();
    await db.read();
    const configs = db.data.smart_configs || [];
    for (const cfg of configs) {
      try {
        // Ensure state object exists
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
  // First pass shortly after boot, then every 15 minutes (metrics-only polling).
  setTimeout(sweep, 2 * 60 * 1000);           // 2 min after boot
  setInterval(sweep, 15 * 60 * 1000);         // every 15 min, no creative churn without plateau confirmation
}

module.exports = { start };
