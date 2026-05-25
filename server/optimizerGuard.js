'use strict';

// Statuses that mean a campaign is definitively over — no optimizer should touch it.
const TERMINAL_STATUSES = new Set([
  'ARCHIVED',
  'DELETED',
  'COMPLETED',
  'CANCELLED',
  'ENDED',
]);

/**
 * Central guard used by the scheduler, orchestrator, and route handlers.
 * Returns { skip: true, reason } when the optimizer must not run another cycle.
 *
 * Checked in priority order so the most explicit signal wins.
 */
function shouldSkipOptimizationForCampaign(state) {
  if (!state || typeof state !== 'object') {
    return { skip: true, reason: 'invalid_state' };
  }

  // Explicit Smartemark archive flag (set by the /archive route).
  if (state.smArchived === true) {
    return { skip: true, reason: 'campaign_sm_archived' };
  }

  // Generic archive flag.
  if (state.archived === true) {
    return { skip: true, reason: 'campaign_archived' };
  }

  // Optimization explicitly disabled by any mechanism (archive, billing, admin).
  if (state.optimizationEnabled === false) {
    return { skip: true, reason: 'optimization_disabled' };
  }

  // Terminal currentStatus (kept current by metricsSync on every cycle).
  const currentStatus = String(state.currentStatus || '').trim().toUpperCase();
  if (currentStatus && TERMINAL_STATUSES.has(currentStatus)) {
    return { skip: true, reason: `campaign_status_${currentStatus.toLowerCase()}` };
  }

  // Terminal effectiveStatus if stored separately from currentStatus.
  const effectiveStatus = String(
    state.effectiveStatus || state.effective_status || ''
  ).trim().toUpperCase();
  if (effectiveStatus && TERMINAL_STATUSES.has(effectiveStatus)) {
    return { skip: true, reason: `campaign_effective_status_${effectiveStatus.toLowerCase()}` };
  }

  // Smartemark campaign duration marked complete.
  if (state.campaignDurationComplete === true || state.smDurationComplete === true) {
    return { skip: true, reason: 'campaign_duration_complete' };
  }

  // Facebook stop_time is in the past — campaign has ended at the Meta level.
  const stopTime = String(state.stopTime || state.stop_time || '').trim();
  if (stopTime) {
    const stopMs = new Date(stopTime).getTime();
    if (Number.isFinite(stopMs) && stopMs < Date.now()) {
      return { skip: true, reason: 'campaign_stop_time_passed' };
    }
  }

  return { skip: false, reason: null };
}

module.exports = { shouldSkipOptimizationForCampaign };
