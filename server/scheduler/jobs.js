// server/scheduler/jobs.js
// Interval-based scheduler with STOP-RULE winner commit + plateau-confirmed challengers.
// Uses SmartCampaignEngine (policy, analyzer, generator, deployer) and LowDB.

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

function normalizeStopRules(cfg = {}) {
  const base = policy.STOP_RULES;
  const s = cfg.stopRules || {};
  return {
    MIN_SPEND_PER_AD: Number(s.spendPerAdUSD ?? base.MIN_SPEND_PER_AD),
    MIN_IMPRESSIONS_PER_AD: Number(s.impressionsPerAd ?? base.MIN_IMPRESSIONS_PER_AD),
    MIN_CLICKS_PER_AD: Number(s.clicksPerAd ?? base.MIN_CLICKS_PER_AD),
    MAX_TEST_HOURS: Number(s.timeCapHours ?? base.MAX_TEST_HOURS),
  };
}

// --- Tunables for automation behavior ---
const COOLDOWN_NEW_ADS_HOURS = policy?.LIMITS?.MIN_HOURS_BETWEEN_NEW_ADS || 72;
const MIN_HOURS_AFTER_WINNER_TO_CHECK_PLATEAU = 24;
const PLATEAU_CONFIRM_HOURS = 36;           // plateau must persist this long
const MIN_HOURS_LEFT_TO_SPAWN = 24;         // must have this many hours left in flight

// NEW: budget split + overlap
const CHALLENGER_BUDGET_PCT = 0.30;         // 30% challengers / 70% champion
const OVERLAP_HOURS = 18;                   // keep old and new champ both live this long before pausing old

function ensureCfgState(cfg) {
  cfg.state ||= { adsets: {} };
  // cfg.state.adsets: { [adsetId]: { championAdId, winnerCommittedAt, plateauSince, lastSpawnAt, challengerAdsetId?, pendingSwap? } }
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

async function commitWinnerIfReady({ cfg, analysis, userToken }) {
  // Winner commit now supports an OVERLAP window when the "best" changes.
  // - If no champion yet: pick winner, pause others.
  // - If best != champion: begin pendingSwap (keep both live). After OVERLAP_HOURS, pause old champion and commit new.
  const results = { committed: false, champions: {}, pending: false, completedSwaps: [] };

  for (const adsetId of analysis.adsetIds) {
    const ids = analysis.adMapByAdset[adsetId] || [];
    if (ids.length < 2) continue; // need at least 2 to "A/B"

    const state = ensureCfgState(cfg);
    const lane = state.adsets[adsetId] || {};
    const stopRules = normalizeStopRules(cfg);

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

    // Rank by CPC (tie -> CTR)
    let best = null;
    for (const id of ids) {
      const w = analysis.adInsights[id];
      const cpc = adCpc(w);
      const ctr = adCtr(w);
      if (!best) {
        best = { id, cpc, ctr };
      } else {
        if (cpc < best.cpc - 1e-9) best = { id, cpc, ctr };
        else if (Math.abs(cpc - best.cpc) <= 1e-9 && ctr > best.ctr) best = { id, cpc, ctr };
      }
    }
    const newBestId = best?.id;
    if (!newBestId) continue;

    const prevChampion = lane.championAdId || null;

    // If no champion yet → first commit (pause everyone else)
    if (!prevChampion) {
      const losers = ids.filter(id => id !== newBestId);
      if (losers.length) {
        try { await deployer.pauseAds({ adIds: losers, userToken }); } catch {}
      }
      state.adsets[adsetId] = {
        championAdId: newBestId,
        winnerCommittedAt: nowIso(),
        plateauSince: null,
        lastSpawnAt: lane.lastSpawnAt || null,
        challengerAdsetId: lane.challengerAdsetId || null,
        pendingSwap: null
      };

      // Log commit
      await db.read();
      db.data.smart_runs.push({
        id: `run_${Date.now()}`,
        mode: 'stop_rules_commit',
        campaignId: cfg.campaignId,
        accountId: cfg.accountId,
        adsetId,
        committedAt: nowIso(),
        championAdId: newBestId,
        losers,
        thresholds: policy.STOP_RULES
      });
      await db.write();

      results.committed = true;
      results.champions[adsetId] = newBestId;
      continue;
    }

    // A champion exists. Is the best the same?
    if (prevChampion === newBestId) {
      // If there is a pending swap but the same ID is still best, clear it.
      if (lane.pendingSwap) {
        state.adsets[adsetId] = { ...lane, pendingSwap: null };
      }
      continue;
    }

    // Best changed → handle overlap window
    // Start or progress a pendingSwap window
    if (!lane.pendingSwap || lane.pendingSwap.newChampionId !== newBestId) {
      // Start overlap: keep prevChampion live; pause other losers (except prevChampion & newBest)
      const losers = ids.filter(id => id !== prevChampion && id !== newBestId);
      if (losers.length) {
        try { await deployer.pauseAds({ adIds: losers, userToken }); } catch {}
      }
      state.adsets[adsetId] = {
        ...lane,
        pendingSwap: { newChampionId: newBestId, startedAt: nowIso() }
      };

      // Log start
      await db.read();
      db.data.smart_runs.push({
        id: `run_${Date.now()}`,
        mode: 'overlap_start',
        campaignId: cfg.campaignId,
        accountId: cfg.accountId,
        adsetId,
        startedAt: nowIso(),
        prevChampion,
        newChampionId: newBestId,
        overlapHours: OVERLAP_HOURS
      });
      await db.write();

      results.pending = true;
      continue;
    }

    // Pending exists for this newBestId — check if window elapsed
    const since = hoursBetween(nowIso(), lane.pendingSwap.startedAt);
    if (since >= OVERLAP_HOURS) {
      // Complete swap: pause old champion, keep new champ; clear pending
      try { await deployer.pauseAds({ adIds: [prevChampion], userToken }); } catch {}
      state.adsets[adsetId] = {
        ...lane,
        championAdId: newBestId,
        winnerCommittedAt: nowIso(),
        pendingSwap: null
      };

      await db.read();
      db.data.smart_runs.push({
        id: `run_${Date.now()}`,
        mode: 'overlap_complete',
        campaignId: cfg.campaignId,
        accountId: cfg.accountId,
        adsetId,
        completedAt: nowIso(),
        newChampionId: newBestId,
        paused: [prevChampion]
      });
      await db.write();

      results.committed = true;
      results.completedSwaps.push({ adsetId, newChampionId: newBestId, oldChampionId: prevChampion });
    } else {
      results.pending = true;
    }
  }

  if (results.committed || results.pending) {
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
  const totalBudgetCents = Math.max(200, Math.round(Number(cfg.dailyBudget || 0) * 100));
  const champPct = 1 - CHALLENGER_BUDGET_PCT;

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

    // ===== NEW: create a challenger ad set and deploy challengers there =====
    let challengerAdsetId = lane.challengerAdsetId || null;
    try {
      if (!challengerAdsetId) {
        const challengerBudgetCents = Math.max(100, Math.round(totalBudgetCents * CHALLENGER_BUDGET_PCT));
        challengerAdsetId = await deployer.ensureChallengerAdsetClone({
          accountId: cfg.accountId,
          campaignId: cfg.campaignId,
          sourceAdsetId: adsetId,
          userToken,
          nameSuffix: 'Challengers',
          dailyBudgetCents: challengerBudgetCents
        });
      }
    } catch (e) {
      console.warn('[SmartScheduler] challenger adset creation failed; fallback to same adset:', e?.message || e);
      challengerAdsetId = adsetId; // fallback
    }

    const deployAdsetIds = [challengerAdsetId || adsetId];

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
      adsetIds: deployAdsetIds,
      winnersByAdset: {},
      losersByAdset: {},
      creatives,
      userToken
    });

    // Budget split: 70% champion / 30% challengers IF we have two different ad sets
    if (challengerAdsetId && challengerAdsetId !== adsetId) {
      try {
        await deployer.splitBudgetBetweenChampionAndChallengers({
          championAdsetId: adsetId,
          challengerAdsetId,
          totalBudgetCents: totalBudgetCents,
          championPct: champPct,
          userToken
        });
      } catch (e) {
        console.warn('[SmartScheduler] budget split failed:', e?.message || e);
      }
    }

    // Log & update state
    await db.read();
    db.data.smart_runs.push({
      id: `run_${Date.now()}`,
      mode: 'plateau_challengers',
      campaignId: cfg.campaignId,
      accountId: cfg.accountId,
      startedAt: nowIso(),
      adsetId,
      challengerAdsetId: challengerAdsetId || null,
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
            lastSpawnAt: nowIso(),
            challengerAdsetId: challengerAdsetId || null
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

  // Analyze current performance (honor per-campaign stop rules)
  const analysis = await analyzer.analyzeCampaign({
    accountId: cfg.accountId,
    campaignId: cfg.campaignId,
    userToken,
    kpi: cfg.kpi || 'cpc',
    stopRules: normalizeStopRules(cfg)
  });

  // 1) Stop rules -> commit winner (pause losers, keep champion active) + overlap handling
  await commitWinnerIfReady({ cfg, analysis, userToken });

  // 2) Plateau confirmed -> spawn challengers (in cloned adset) + 70/30 split
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
  setInterval(sweep, 15 * 60 * 1000);         // every 15 min
}

module.exports = { start, sweep };
