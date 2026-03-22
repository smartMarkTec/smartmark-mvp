'use strict';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDecision({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const linkClicks = toNumber(
    metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics.conversions, 0);

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
        mode: 'rule_based_mvp_v2',
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
      mode: 'rule_based_mvp_v2',
    };
  }

  const diagnosis = String(latestDiagnosis.diagnosis || '').trim();
  const recommendedAction = String(latestDiagnosis.recommendedAction || '').trim();

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
    decision = 'refresh_message';
    actionType = 'test_new_primary_text_or_headline';
    priority = 'high';
    reason =
      'The campaign is getting delivery without click response, so Smartemark should improve the hook or messaging before making broader structural changes.';
    confidence = 0.87;
  } else if (
    diagnosis === 'low_ctr' ||
    recommendedAction === 'update_primary_text'
  ) {
    decision = 'refresh_copy';
    actionType = 'update_primary_text';
    priority = 'high';
    reason =
      'CTR is weak after meaningful delivery, so the next best move is to refresh primary text and improve click-through response.';
    confidence = 0.89;
  } else if (diagnosis === 'post_click_conversion_gap') {
    decision = 'adjust_angle';
    actionType = 'test_offer_or_audience_angle';
    priority = 'high';
    reason =
      'Users are clicking but not converting, so Smartemark should shift the offer framing, angle, or audience hypothesis next.';
    confidence = 0.82;
  } else if (diagnosis === 'creative_fatigue_risk') {
    decision = 'prepare_refresh';
    actionType = 'prepare_fresh_creative_variant';
    priority = 'medium';
    reason =
      'Performance suggests growing fatigue, so Smartemark should prepare a creative refresh instead of forcing the current asset longer.';
    confidence = 0.78;
  } else if (diagnosis === 'high_cpc') {
    decision = 'improve_efficiency';
    actionType = 'test_new_audience_or_creative';
    priority = 'medium';
    reason =
      'Traffic is coming in inefficiently, so Smartemark should look for a stronger creative or audience path.';
    confidence = 0.76;
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
      spend,
      impressions,
      linkClicks,
      conversions,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp_v2',
  };
}

module.exports = {
  buildDecision,
};