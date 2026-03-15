'use strict';

const {
  getAllOptimizerCampaignStates,
} = require('./optimizerCampaignState');
const { runFullOptimizerCycle } = require('./optimizerOrchestrator');

function hoursBetween(earlierIso, laterIso) {
  const a = new Date(earlierIso).getTime();
  const b = new Date(laterIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  return Math.abs(b - a) / (1000 * 60 * 60);
}

function isEligibleForCycle(state, nowIso, minHoursBetweenRuns = 1) {
  if (!state || typeof state !== 'object') return false;
  if (!state.optimizationEnabled) return false;
  if (!state.campaignId || !state.accountId || !state.ownerKey) return false;

  const lastRunAt =
    state?.latestMonitoringDecision?.generatedAt ||
    state?.latestAction?.generatedAt ||
    state?.latestDecision?.generatedAt ||
    state?.latestDiagnosis?.generatedAt ||
    state?.metricsSnapshot?.lastSyncedAt ||
    state?.updatedAt ||
    null;

  if (!lastRunAt) return true;

  const minGap = Number.isFinite(Number(minHoursBetweenRuns))
  ? Number(minHoursBetweenRuns)
  : 1;

return hoursBetween(lastRunAt, nowIso) >= minGap;
}

async function runScheduledOptimizerPass({
  getUserTokenForOwnerKey,
  loadCreativesRecord,
  persistDiagnosis,
  persistDecision,
  persistAction,
  persistMonitoring,
  minHoursBetweenRuns = 1,
  limit = 10,
}) {
  if (typeof getUserTokenForOwnerKey !== 'function') {
    throw new Error('getUserTokenForOwnerKey is required');
  }
  if (typeof loadCreativesRecord !== 'function') {
    throw new Error('loadCreativesRecord is required');
  }

  const nowIso = new Date().toISOString();
  const allStates = await getAllOptimizerCampaignStates();

  const eligible = allStates
    .filter((state) => isEligibleForCycle(state, nowIso, minHoursBetweenRuns))
    .slice(0, Number(limit || 10));

  const results = [];

  for (const state of eligible) {
    const ownerKey = String(state.ownerKey || '').trim();
    const userToken = getUserTokenForOwnerKey(ownerKey);

    if (!userToken) {
      results.push({
        campaignId: String(state.campaignId || '').trim(),
        accountId: String(state.accountId || '').trim(),
        ownerKey,
        ok: false,
        skipped: true,
        reason: 'No Facebook token available for ownerKey.',
      });
      continue;
    }

    try {
      const result = await runFullOptimizerCycle({
        campaignId: String(state.campaignId || '').trim(),
        accountId: String(state.accountId || '').trim(),
        ownerKey,
        userToken,
        loadCreativesRecord,
        persistDiagnosis,
        persistDecision,
        persistAction,
        persistMonitoring,
      });

      results.push({
        campaignId: String(state.campaignId || '').trim(),
        accountId: String(state.accountId || '').trim(),
        ownerKey,
        ok: true,
        skipped: false,
        cycle: result.cycle,
      });
    } catch (err) {
      results.push({
        campaignId: String(state.campaignId || '').trim(),
        accountId: String(state.accountId || '').trim(),
        ownerKey,
        ok: false,
        skipped: false,
        error: err?.message || 'Scheduled optimizer pass failed.',
      });
    }
  }

  return {
    startedAt: nowIso,
    checked: allStates.length,
    eligible: eligible.length,
    processed: results.length,
    results,
  };
}

module.exports = {
  isEligibleForCycle,
  runScheduledOptimizerPass,
};