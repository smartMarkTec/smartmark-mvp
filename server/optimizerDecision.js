'use strict';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function buildDecision({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const metrics = optimizerState?.metricsSnapshot || {};

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
          'Monitoring confirmed the campaign is paused, so the next best move is to unpause it before any creative or audience optimization.',
        requiresHumanApproval: true,
        confidence: 0.98,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          spend: toNumber(metrics.spend, 0),
          impressions: toNumber(metrics.impressions, 0),
          linkClicks: toNumber(metrics.linkClicks, 0),
          conversions: toNumber(metrics.conversions, 0),
        },
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp',
      };
    }
  }

  if (!latestDiagnosis) {
    return {
      campaignId: String(optimizerState?.campaignId || '').trim(),
      decision: 'insufficient_context',
      actionType: 'run_diagnosis_first',
      priority: 'high',
      reason: 'No diagnosis exists yet, so a decision would be premature.',
      requiresHumanApproval: true,
      confidence: 0.98,
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const linkClicks = toNumber(metrics.linkClicks, 0);
  const conversions = toNumber(metrics.conversions, 0);
  const diagnosis = String(latestDiagnosis.diagnosis || '').trim();

  let decision = 'wait';
  let actionType = 'continue_monitoring';
  let priority = 'medium';
  let reason = 'Campaign needs more signal before intervention.';
  let requiresHumanApproval = true;
  let confidence = 0.7;

  if (diagnosis === 'no_delivery') {
    decision = 'investigate_delivery';
    actionType = 'check_delivery_status';
    priority = 'high';
    reason =
      'The campaign has zero impressions and zero spend, so the correct next step is to inspect delivery status before changing creative or audience.';
    requiresHumanApproval = true;
    confidence = 0.95;
  } else if (diagnosis === 'weak_engagement') {
    decision = 'refresh_message';
    actionType = 'test_new_primary_text_or_headline';
    priority = 'high';
    reason =
      'The campaign is getting delivery but not clicks, so the next best move is a messaging test rather than a structural change.';
    requiresHumanApproval = true;
    confidence = 0.84;
  } else if (diagnosis === 'low_ctr') {
    decision = 'launch_creative_test';
    actionType = 'test_new_creative_or_primary_text';
    priority = 'high';
    reason =
      'CTR is weak despite enough impressions, so a new creative/message variant is the most appropriate next move.';
    requiresHumanApproval = true;
    confidence = 0.85;
  } else if (diagnosis === 'post_click_conversion_gap') {
    decision = 'adjust_angle';
    actionType = 'test_offer_or_audience_angle';
    priority = 'high';
    reason =
      'Traffic exists without conversion response, so the next move is to change the angle, offer framing, or audience hypothesis.';
    requiresHumanApproval = true;
    confidence = 0.8;
  } else if (diagnosis === 'creative_fatigue_risk') {
    decision = 'prepare_refresh';
    actionType = 'prepare_fresh_creative_variant';
    priority = 'medium';
    reason =
      'Frequency is elevated while engagement is weakening, so Smartemark should prepare a creative refresh rather than keep scaling the current asset.';
    requiresHumanApproval = true;
    confidence = 0.76;
  } else if (diagnosis === 'high_cpc') {
    decision = 'improve_efficiency';
    actionType = 'test_new_audience_or_creative';
    priority = 'medium';
    reason =
      'The campaign is generating traffic inefficiently, so the next best move is to test a new audience or creative path.';
    requiresHumanApproval = true;
    confidence = 0.74;
  } else if (diagnosis === 'healthy_early_signal') {
    decision = 'hold_and_monitor';
    actionType = 'continue_monitoring';
    priority = 'low';
    reason =
      'The campaign is showing acceptable early signals, so immediate optimization may be unnecessary.';
    requiresHumanApproval = true;
    confidence = 0.72;
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
      spend,
      impressions,
      linkClicks,
      conversions,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

module.exports = {
  buildDecision,
};