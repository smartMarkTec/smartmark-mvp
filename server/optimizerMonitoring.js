'use strict';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIsoMs(value) {
  const ms = new Date(String(value || '')).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function minutesSince(value) {
  const ms = parseIsoMs(value);
  if (!ms) return null;
  return Math.max(0, Math.floor((Date.now() - ms) / 60000));
}

function normalizeActionType(value) {
  return String(value || '').trim();
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function buildMonitoring({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const metrics = optimizerState?.metricsSnapshot || {};
  const pendingCreativeTest = optimizerState?.pendingCreativeTest || null;
  const manualOverride = !!optimizerState?.manualOverride;
  const manualOverrideType = String(optimizerState?.manualOverrideType || '').trim();

  const campaignId = String(optimizerState?.campaignId || '').trim();
  const spend = toNumber(metrics?.spend, 0);
  const impressions = toNumber(metrics?.impressions, 0);
  const clicks = toNumber(metrics?.clicks, 0);
  const linkClicks = toNumber(
    metrics?.linkClicks != null ? metrics?.linkClicks : metrics?.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics?.conversions, 0);
  const ctr = Number.isFinite(Number(metrics?.ctr)) ? Number(metrics.ctr) : 0;
  const frequency = Number.isFinite(Number(metrics?.frequency)) ? Number(metrics.frequency) : 0;

  if (manualOverride) {
    return {
      campaignId,
      monitoringDecision: 'manual_override_active',
      status: 'blocked',
      reason:
        'User manual override is active, so Smartemark should not mutate this campaign automatically.',
      nextRecommendedStep: 'wait_for_user_to_clear_override',
      confidence: 0.99,
      supportingContext: {
        manualOverride: true,
        manualOverrideType,
      },
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp_v3',
    };
  }

  if (!latestAction) {
    return {
      campaignId,
      monitoringDecision: 'no_action_to_monitor',
      status: 'idle',
      reason: 'No latestAction exists yet, so there is nothing to monitor.',
      nextRecommendedStep: 'run_action_first',
      confidence: 0.98,
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp_v3',
    };
  }

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const decision = String(latestDecision?.decision || '').trim();
  const actionType = normalizeActionType(latestAction?.actionType);
  const actionExecuted = !!latestAction?.executed;
  const actionStatus = String(latestAction?.status || '').trim();

  const campaignStatus = normalizeStatus(
    latestAction?.actionResult?.campaign?.effectiveStatus ||
      latestAction?.actionResult?.campaign?.status ||
      optimizerState?.currentStatus
  );

  const actionGeneratedAt =
    latestAction?.generatedAt ||
    latestAction?.actionResult?.executedAt ||
    latestAction?.actionResult?.mutatedAt ||
    latestAction?.actionResult?.testStartedAt ||
    '';
  const minutesAfterLatestAction = minutesSince(actionGeneratedAt);

  const pendingStatus = String(pendingCreativeTest?.status || '').trim().toLowerCase();
  const candidateAdIds = Array.isArray(pendingCreativeTest?.candidateAdIds)
    ? pendingCreativeTest.candidateAdIds.filter(Boolean)
    : [];
  const controlAdIds = Array.isArray(pendingCreativeTest?.controlAdIds)
    ? pendingCreativeTest.controlAdIds.filter(Boolean)
    : [];
  const launchedVariantCount = toNumber(
    pendingCreativeTest?.launchedVariantCount != null
      ? pendingCreativeTest.launchedVariantCount
      : candidateAdIds.length,
    candidateAdIds.length
  );

  let monitoringDecision = 'continue_monitoring';
  let status = 'stable';
  let reason = 'No critical follow-up condition detected.';
  let nextRecommendedStep = 'wait_for_next_cycle';
  let confidence = 0.72;

  if (pendingStatus === 'ready') {
    monitoringDecision = 'creative_variants_ready_for_launch';
    status = 'attention_needed';
    reason =
      'Smartemark has generated creative variants ready, so the next step is to promote them into Meta challenger ads.';
    nextRecommendedStep = 'promote_generated_creative_variants';
    confidence = 0.98;
  } else if (pendingStatus === 'live' || pendingStatus === 'staged') {
    const lowTestSignal =
      impressions < 1200 ||
      linkClicks < 20 ||
      spend < 12 ||
      (minutesAfterLatestAction != null && minutesAfterLatestAction < 45);

    if (lowTestSignal) {
      monitoringDecision = 'creative_test_collecting_data';
      status = 'monitoring';
      reason =
        'A creative test is active, but Smartemark should wait for more signal before declaring a winner or loser.';
      nextRecommendedStep = 'keep_monitoring_creative_test';
      confidence = 0.95;
    } else if (ctr < 0.8 && linkClicks >= 20) {
      monitoringDecision = 'creative_test_challenger_underperforming';
      status = 'attention_needed';
      reason =
        'There is enough post-launch signal to suspect the current creative test is underperforming and should be resolved soon.';
      nextRecommendedStep = 'evaluate_and_pause_loser';
      confidence = 0.84;
    } else if (ctr >= 1.2 || conversions >= 1) {
      monitoringDecision = 'creative_test_has_promising_signal';
      status = 'monitoring';
      reason =
        'The live creative test is showing encouraging signal, so Smartemark should prepare to evaluate a winner once enough data accumulates.';
      nextRecommendedStep = 'evaluate_winner_when_threshold_met';
      confidence = 0.82;
    } else {
      monitoringDecision = 'creative_test_in_progress';
      status = 'monitoring';
      reason =
        'A creative challenger is live, and Smartemark should continue observing the test until there is enough signal to judge the result.';
      nextRecommendedStep = 'keep_monitoring_creative_test';
      confidence = 0.88;
    }
  } else if (actionType === 'check_delivery_status' && campaignStatus === 'PAUSED') {
    monitoringDecision = 'delivery_blocked';
    status = 'attention_needed';
    reason =
      'The delivery check shows the campaign is paused, so it cannot spend until delivery is restored.';
    nextRecommendedStep = 'unpause_campaign_when_safe';
    confidence = 0.98;
  } else if (actionType === 'check_delivery_status' && campaignStatus === 'ACTIVE') {
    monitoringDecision = 'await_delivery_data';
    status = 'monitoring';
    reason =
      'The campaign appears active, so Smartemark should wait for fresh delivery data before making a stronger change.';
    nextRecommendedStep = 'rerun_metrics_after_delivery_window';
    confidence = 0.9;
  } else if (
    actionType === 'unpause_campaign' &&
    actionExecuted &&
    actionStatus === 'completed'
  ) {
    monitoringDecision = 'watch_post_delivery_restore';
    status = 'monitoring';
    reason =
      'Campaign delivery was restored, so Smartemark should now wait for fresh impressions and click data before deciding the next move.';
    nextRecommendedStep = 'collect_new_delivery_signal';
    confidence = 0.94;
  } else if (
    actionType === 'update_primary_text' &&
    actionExecuted &&
    actionStatus === 'completed'
  ) {
    const lowFreshSignal = impressions < 250 || linkClicks < 3;

    if (minutesAfterLatestAction != null && minutesAfterLatestAction < 60) {
      monitoringDecision = 'wait_for_post_refresh_signal';
      status = 'monitoring';
      reason =
        'Primary text was refreshed recently, so Smartemark should avoid another rewrite until new post-refresh data comes in.';
      nextRecommendedStep = 'collect_new_ctr_data';
      confidence = 0.97;
    } else if (lowFreshSignal) {
      monitoringDecision = 'monitor_post_copy_refresh';
      status = 'monitoring';
      reason =
        'Copy was refreshed, but there is still not enough fresh post-refresh signal to justify another mutation.';
      nextRecommendedStep = 'collect_new_ctr_data';
      confidence = 0.93;
    } else if (diagnosis === 'low_ctr' && ctr < 0.9) {
      monitoringDecision = 'watch_copy_refresh_result';
      status = 'monitoring';
      reason =
        'Copy refresh has been applied, and Smartemark should now watch whether CTR improves before making another messaging change.';
      nextRecommendedStep = 'compare_post_refresh_ctr';
      confidence = 0.88;
    } else {
      monitoringDecision = 'continue_monitoring_after_copy_refresh';
      status = 'monitoring';
      reason =
        'Copy refresh is complete, and the campaign should be observed for new performance signal before any further mutation.';
      nextRecommendedStep = 'wait_for_next_cycle';
      confidence = 0.84;
    }
  } else if (
    actionType === 'promote_generated_creative_variants' &&
    actionExecuted &&
    (actionStatus === 'completed' || actionStatus === 'completed_with_partial_errors')
  ) {
    monitoringDecision = 'creative_test_collecting_data';
    status = 'monitoring';
    reason =
      'Generated creative variants were promoted into Meta, so Smartemark should now collect test data before deciding a winner.';
    nextRecommendedStep = 'keep_monitoring_creative_test';
    confidence = 0.97;
  } else if (
    actionType === 'generate_single_creative_variant' ||
    actionType === 'generate_two_creative_variants'
  ) {
    monitoringDecision = 'creative_variants_ready_for_launch';
    status = 'attention_needed';
    reason =
      'Smartemark generated fresh creative variants, and the next step is to launch them into a live challenger test.';
    nextRecommendedStep = 'promote_generated_creative_variants';
    confidence = 0.96;
  } else if (
    diagnosis === 'no_delivery' &&
    decision === 'investigate_delivery'
  ) {
    monitoringDecision = 'delivery_investigation_complete';
    status = 'monitoring';
    reason =
      'Delivery investigation ran successfully. The next move depends on the campaign state and the next metrics sync.';
    nextRecommendedStep = 'review_action_result_and_resync';
    confidence = 0.82;
  } else if (diagnosis === 'healthy_early_signal') {
    monitoringDecision = 'hold_steady';
    status = 'stable';
    reason =
      'Current campaign signal looks healthy enough that Smartemark should continue observing rather than change it too early.';
    nextRecommendedStep = 'wait_for_next_cycle';
    confidence = 0.8;
  } else if (diagnosis === 'insufficient_data') {
    monitoringDecision = 'await_more_data';
    status = 'monitoring';
    reason =
      'There is still not enough reliable data to justify a stronger optimization move.';
    nextRecommendedStep = 'collect_more_delivery_signal';
    confidence = 0.9;
  }

  return {
    campaignId,
    monitoringDecision,
    status,
    reason,
    nextRecommendedStep,
    confidence,
    supportingContext: {
      diagnosis,
      decision,
      actionType,
      actionExecuted,
      actionStatus,
      minutesAfterLatestAction,
      spend,
      impressions,
      clicks,
      linkClicks,
      conversions,
      ctr,
      frequency,
      campaignStatus,
      pendingCreativeTestStatus: pendingStatus,
      candidateAdIds,
      controlAdIds,
      launchedVariantCount,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp_v3',
  };
}

module.exports = {
  buildMonitoring,
};