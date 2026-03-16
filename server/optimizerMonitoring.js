'use strict';

function buildMonitoring({ optimizerState }) {
 const latestDiagnosis = optimizerState?.latestDiagnosis || null;
const latestDecision = optimizerState?.latestDecision || null;
const latestAction = optimizerState?.latestAction || null;
const metrics = optimizerState?.metricsSnapshot || {};
const manualOverride = !!optimizerState?.manualOverride;
const manualOverrideType = String(optimizerState?.manualOverrideType || '').trim();

if (manualOverride) {
  return {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    monitoringDecision: 'manual_override_active',
    status: 'blocked',
    reason: 'User manual override is active, so the optimizer should not mutate this campaign.',
    nextRecommendedStep: 'wait_for_user_to_clear_override',
    confidence: 0.99,
    supportingContext: {
      manualOverride: true,
      manualOverrideType,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

  if (!latestAction) {
    return {
      campaignId: String(optimizerState?.campaignId || '').trim(),
      monitoringDecision: 'no_action_to_monitor',
      status: 'idle',
      reason: 'No latestAction exists yet, so there is nothing to monitor.',
      nextRecommendedStep: 'run_action_first',
      confidence: 0.98,
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const decision = String(latestDecision?.decision || '').trim();
  const actionType = String(latestAction?.actionType || '').trim();

  let monitoringDecision = 'continue_monitoring';
  let status = 'stable';
  let reason = 'No critical follow-up condition detected.';
  let nextRecommendedStep = 'wait_for_next_cycle';
  let confidence = 0.7;

  const campaignStatus = String(
    latestAction?.actionResult?.campaign?.effectiveStatus ||
    latestAction?.actionResult?.campaign?.status ||
    ''
  ).trim().toUpperCase();

  if (actionType === 'check_delivery_status' && campaignStatus === 'PAUSED') {
    monitoringDecision = 'delivery_blocked';
    status = 'attention_needed';
    reason =
      'The action confirmed that the campaign is paused, so delivery cannot begin until it is re-enabled.';
    nextRecommendedStep = 'unpause_or_enable_campaign_before_optimization';
    confidence = 0.97;
  } else if (actionType === 'check_delivery_status' && campaignStatus === 'ACTIVE') {
    monitoringDecision = 'await_delivery_data';
    status = 'monitoring';
    reason =
      'The campaign appears active, so the next step is to wait for impressions/spend before changing creative or audience.';
    nextRecommendedStep = 'rerun_metrics_after_delivery_window';
    confidence = 0.88;
  } else if (diagnosis === 'no_delivery' && decision === 'investigate_delivery') {
    monitoringDecision = 'delivery_investigation_complete';
    status = 'monitoring';
    reason =
      'Diagnosis and decision were executed correctly. The next step depends on the campaign delivery state returned by Meta.';
    nextRecommendedStep = 'review_action_result';
    confidence = 0.82;
  }

  return {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    monitoringDecision,
    status,
    reason,
    nextRecommendedStep,
    confidence,
    supportingContext: {
      diagnosis,
      decision,
      actionType,
      spend: Number(metrics?.spend || 0),
      impressions: Number(metrics?.impressions || 0),
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

module.exports = {
  buildMonitoring,
};