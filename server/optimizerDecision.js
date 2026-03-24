'use strict';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDecision({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const linkClicks = toNumber(
    metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics.conversions, 0);
  const ctr = toNumber(metrics.ctr, 0);
  const frequency = toNumber(metrics.frequency, 0);

  if (latestMonitoringDecision) {
    const monitoringDecision = String(
      latestMonitoringDecision.monitoringDecision || ''
    ).trim();

    if (monitoringDecision === 'delivery_blocked') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'restore_delivery',
        actionType: 'unpause_campaign',
        priority: 'high',
        reason:
          'Monitoring indicates delivery is blocked by campaign status, so Smartemark should focus on restoring delivery before changing messaging or creative.',
        requiresHumanApproval: true,
        confidence: 0.98,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
        },
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp_v3',
      };
    }

    if (
      monitoringDecision === 'wait_for_post_refresh_signal' ||
      monitoringDecision === 'monitor_post_copy_refresh' ||
      monitoringDecision === 'watch_copy_refresh_result' ||
      monitoringDecision === 'continue_monitoring_after_copy_refresh'
    ) {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'hold_after_copy_refresh',
        actionType: 'continue_monitoring',
        priority: 'medium',
        reason:
          'Smartemark recently refreshed copy and should wait for fresh post-refresh signal before making another mutation.',
        requiresHumanApproval: true,
        confidence: 0.97,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          latestActionType: String(latestAction?.actionType || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
          ctr,
        },
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp_v3',
      };
    }

    if (monitoringDecision === 'watch_post_delivery_restore') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'hold_after_delivery_restore',
        actionType: 'continue_monitoring',
        priority: 'medium',
        reason:
          'Delivery was just restored, so Smartemark should collect new delivery signal before deciding on messaging or creative changes.',
        requiresHumanApproval: true,
        confidence: 0.95,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
        },
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp_v3',
      };
    }
  }

  if (!latestDiagnosis) {
    return {
      campaignId: String(optimizerState?.campaignId || '').trim(),
      decision: 'insufficient_context',
      actionType: 'run_diagnosis_first',
      priority: 'high',
      reason: 'No diagnosis exists yet, so Smartemark should diagnose before making an optimization decision.',
      requiresHumanApproval: true,
      confidence: 0.99,
      supportingContext: {
        diagnosis: '',
        spend,
        impressions,
        linkClicks,
        conversions,
      },
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp_v3',
    };
  }

  const diagnosis = String(latestDiagnosis.diagnosis || '').trim();
  const recommendedAction = String(latestDiagnosis.recommendedAction || '').trim();
  const lastActionType = String(latestAction?.actionType || '').trim();
  const lastActionStatus = String(latestAction?.status || '').trim();

  let decision = 'hold_and_monitor';
  let actionType = 'continue_monitoring';
  let priority = 'medium';
  let reason = 'The campaign should continue gathering signal before a stronger move.';
  let requiresHumanApproval = true;
  let confidence = 0.72;

  if (diagnosis === 'scheduled_not_started') {
    decision = 'wait_for_start_window';
    actionType = 'continue_monitoring';
    priority = 'medium';
    reason =
      'The campaign appears scheduled for a future start window, so Smartemark should wait rather than intervene.';
    confidence = 0.98;
  } else if (diagnosis === 'billing_blocked') {
    decision = 'resolve_billing_block';
    actionType = 'continue_monitoring';
    priority = 'high';
    reason =
      'Billing appears to be preventing delivery, so Smartemark should avoid optimization changes until payment issues are resolved.';
    confidence = 0.99;
  } else if (diagnosis === 'no_delivery') {
    decision = 'investigate_delivery';
    actionType = 'check_delivery_status';
    priority = 'high';
    reason =
      'The campaign is not producing impressions or spend, so the next move should be delivery inspection rather than creative optimization.';
    confidence = 0.96;
  } else if (diagnosis === 'insufficient_data') {
    decision = 'hold_and_monitor';
    actionType = 'continue_monitoring';
    priority = 'medium';
    reason =
      'Delivery has started, but signal is still too light for a reliable optimization move.';
    confidence = 0.9;
  } else if (diagnosis === 'weak_engagement') {
    decision = 'launch_creative_test';
    actionType = 'generate_two_creative_variants';
    priority = 'high';
    reason =
      'The campaign is getting delivery without strong click response, so Smartemark should test two fresh creative angles instead of only rewriting copy again.';
    confidence = 0.88;
  } else if (
    diagnosis === 'low_ctr' ||
    recommendedAction === 'update_primary_text'
  ) {
    if (lastActionType === 'update_primary_text' && lastActionStatus === 'completed') {
      decision = 'hold_after_copy_refresh';
      actionType = 'continue_monitoring';
      priority = 'medium';
      reason =
        'Copy refresh already happened, so Smartemark should wait for new CTR signal before making another change.';
      confidence = 0.96;
    } else {
      decision = 'refresh_copy';
      actionType = 'update_primary_text';
      priority = 'high';
      reason =
        'CTR is weak after meaningful delivery, so the next best move is to refresh primary text and improve click-through response.';
      confidence = 0.89;
    }
  } else if (diagnosis === 'post_click_conversion_gap') {
    decision = 'adjust_angle';
    actionType = 'generate_single_creative_variant';
    priority = 'high';
    reason =
      'Users are clicking but not converting, so Smartemark should test a sharper creative/offer angle next.';
    confidence = 0.82;
  } else if (diagnosis === 'creative_fatigue_risk') {
    decision = 'prepare_refresh';
    actionType = 'generate_two_creative_variants';
    priority = 'high';
    reason =
      'Performance suggests growing fatigue, so Smartemark should prepare two fresh creative variants for controlled A/B testing.';
    confidence = 0.84;
  } else if (diagnosis === 'high_cpc') {
    if (frequency >= 2.2 || impressions >= 800) {
      decision = 'test_two_creative_angles';
      actionType = 'generate_two_creative_variants';
      priority = 'medium';
      reason =
        'Traffic is coming in inefficiently and delivery is meaningful enough to justify testing two fresh creative directions.';
      confidence = 0.79;
    } else {
      decision = 'test_single_creative_angle';
      actionType = 'generate_single_creative_variant';
      priority = 'medium';
      reason =
        'Traffic is coming in inefficiently, so Smartemark should test one stronger creative angle next.';
      confidence = 0.76;
    }
  } else if (diagnosis === 'healthy_early_signal') {
    decision = 'hold_and_monitor';
    actionType = 'continue_monitoring';
    priority = 'low';
    reason =
      'The campaign is showing acceptable early response, so Smartemark should continue monitoring instead of changing it too quickly.';
    confidence = 0.8;
  }

  return {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    decision,
    actionType,
    priority,
    reason,
    requiresHumanApproval,
    confidence,
    supportingContext: {
      diagnosis,
      recommendedAction,
      lastActionType,
      lastActionStatus,
      spend,
      impressions,
      linkClicks,
      conversions,
      ctr,
      frequency,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp_v3',
  };
}

module.exports = {
  buildDecision,
};