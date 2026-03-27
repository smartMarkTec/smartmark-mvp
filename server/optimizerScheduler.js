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

function getPendingCreativeStatus(state) {
  return String(state?.pendingCreativeTest?.status || '').trim().toLowerCase();
}

function hasLiveCreativeTest(state) {
  const pendingStatus = getPendingCreativeStatus(state);

  const controlAdIds = Array.isArray(state?.pendingCreativeTest?.controlAdIds)
    ? state.pendingCreativeTest.controlAdIds.filter(Boolean)
    : [];

  const candidateAdIds = Array.isArray(state?.pendingCreativeTest?.candidateAdIds)
    ? state.pendingCreativeTest.candidateAdIds.filter(Boolean)
    : [];

  return (
    (pendingStatus === 'live' || pendingStatus === 'staged') &&
    controlAdIds.length > 0 &&
    candidateAdIds.length > 0
  );
}

function hasReadyCreativePromotion(state) {
  const pendingStatus = getPendingCreativeStatus(state);
  const imageUrls = Array.isArray(state?.pendingCreativeTest?.imageUrls)
    ? state.pendingCreativeTest.imageUrls.filter(Boolean)
    : [];

  return pendingStatus === 'ready' && imageUrls.length > 0;
}

function hasResolvedCreativeTest(state) {
  return getPendingCreativeStatus(state) === 'resolved';
}

function getLastRunAt(state) {
  return (
    state?.latestMonitoringDecision?.generatedAt ||
    state?.latestAction?.generatedAt ||
    state?.latestDecision?.generatedAt ||
    state?.latestDiagnosis?.generatedAt ||
    state?.metricsSnapshot?.lastSyncedAt ||
    state?.updatedAt ||
    null
  );
}

function getEffectiveMinGapHours(state, minHoursBetweenRuns = 1) {
  const configuredGap = Number.isFinite(Number(minHoursBetweenRuns))
    ? Number(minHoursBetweenRuns)
    : 1;

  if (hasReadyCreativePromotion(state)) {
    return 0;
  }

  if (hasLiveCreativeTest(state)) {
    return Math.min(configuredGap, 0.25);
  }

  return configuredGap;
}

function getEligibilityReason(state, nowIso, minHoursBetweenRuns = 1) {
  if (!state || typeof state !== 'object') {
    return { eligible: false, reason: 'invalid_state' };
  }

  if (!state.optimizationEnabled) {
    return { eligible: false, reason: 'optimization_disabled' };
  }

  if (state.billingBlocked) {
    return { eligible: false, reason: 'billing_blocked' };
  }

  if (state.manualOverride) {
    return { eligible: false, reason: 'manual_override_active' };
  }

  if (!state.campaignId || !state.accountId || !state.ownerKey) {
    return { eligible: false, reason: 'missing_identity_fields' };
  }

  const lastRunAt = getLastRunAt(state);
  const minGap = getEffectiveMinGapHours(state, minHoursBetweenRuns);

  if (!lastRunAt) {
    return { eligible: true, reason: 'no_previous_run' };
  }

  const elapsed = hoursBetween(lastRunAt, nowIso);

  if (elapsed >= minGap) {
    if (hasReadyCreativePromotion(state)) {
      return { eligible: true, reason: 'ready_for_promotion' };
    }

    if (hasLiveCreativeTest(state)) {
      return { eligible: true, reason: 'live_test_needs_monitoring' };
    }

    if (hasResolvedCreativeTest(state)) {
      return { eligible: true, reason: 'resolved_test_followup' };
    }

    return { eligible: true, reason: 'normal_cycle_due' };
  }

  return {
    eligible: false,
    reason: hasLiveCreativeTest(state)
      ? 'live_test_waiting_for_gap'
      : hasReadyCreativePromotion(state)
      ? 'ready_test_waiting_for_gap'
      : 'min_gap_not_reached',
  };
}

function isEligibleForCycle(state, nowIso, minHoursBetweenRuns = 1) {
  return getEligibilityReason(state, nowIso, minHoursBetweenRuns).eligible;
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

  const scoredStates = allStates
    .map((state) => {
      const eligibility = getEligibilityReason(state, nowIso, minHoursBetweenRuns);

      let priority = 0;
      if (hasReadyCreativePromotion(state)) priority = 300;
      else if (hasLiveCreativeTest(state)) priority = 200;
      else if (hasResolvedCreativeTest(state)) priority = 120;
      else priority = 50;

      return {
        state,
        ...eligibility,
        priority,
      };
    })
    .filter((item) => item.eligible)
    .sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;

      const aUpdated = new Date(
        a.state?.updatedAt ||
        a.state?.latestMonitoringDecision?.generatedAt ||
        a.state?.latestAction?.generatedAt ||
        0
      ).getTime();

      const bUpdated = new Date(
        b.state?.updatedAt ||
        b.state?.latestMonitoringDecision?.generatedAt ||
        b.state?.latestAction?.generatedAt ||
        0
      ).getTime();

      return aUpdated - bUpdated;
    })
    .slice(0, Number(limit || 10));

  const results = [];

  for (const item of scoredStates) {
    const state = item.state;
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
        eligibilityReason: item.reason,
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
        eligibilityReason: item.reason,
        cycle: result.cycle,
      });
    } catch (err) {
      results.push({
        campaignId: String(state.campaignId || '').trim(),
        accountId: String(state.accountId || '').trim(),
        ownerKey,
        ok: false,
        skipped: false,
        eligibilityReason: item.reason,
        error: err?.message || 'Scheduled optimizer pass failed.',
      });
    }
  }

  return {
    startedAt: nowIso,
    checked: allStates.length,
    eligible: scoredStates.length,
    processed: results.length,
    results,
  };
}

module.exports = {
  isEligibleForCycle,
  runScheduledOptimizerPass,
};