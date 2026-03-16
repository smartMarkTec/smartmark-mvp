'use strict';

function buildPublicSummary({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const decision = String(latestDecision?.decision || '').trim();
  const actionType = String(latestAction?.actionType || latestDecision?.actionType || '').trim();
  const monitoringDecision = String(latestMonitoringDecision?.monitoringDecision || '').trim();

  let headline = 'Monitoring campaign performance';
  let subtext = 'Smartemark is watching campaign data and looking for the next opportunity to improve results.';
  let stage = 'monitoring';
  let tone = 'calm';

  if (diagnosis === 'billing_blocked') {
    headline = 'Resolving account issue';
    subtext = 'Smartemark is waiting for account billing to be restored so campaign delivery can continue.';
    stage = 'blocked';
    tone = 'attention';
  } else if (diagnosis === 'scheduled_not_started') {
    headline = 'Waiting for campaign start';
    subtext = 'Smartemark is standing by for the campaign start window so performance data can begin coming in.';
    stage = 'queued';
    tone = 'calm';
  } else if (monitoringDecision === 'delivery_blocked' || decision === 'restore_delivery' || actionType === 'unpause_campaign') {
    headline = 'Improving delivery';
    subtext = 'Smartemark is resolving a delivery issue so the campaign can begin learning and spending normally.';
    stage = 'delivery';
    tone = 'active';
  } else if (diagnosis === 'no_delivery' || decision === 'investigate_delivery' || actionType === 'check_delivery_status') {
    headline = 'Checking delivery';
    subtext = 'Smartemark is checking campaign delivery conditions before making any optimization changes.';
    stage = 'delivery';
    tone = 'active';
  } else if (diagnosis === 'low_ctr' || decision === 'refresh_copy' || actionType === 'update_primary_text') {
    headline = 'Refreshing ad messaging';
    subtext = 'Smartemark is improving ad messaging to increase response and strengthen campaign performance.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'weak_engagement') {
    headline = 'Strengthening ad response';
    subtext = 'Smartemark is preparing a stronger angle to improve early campaign engagement.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'creative_fatigue_risk') {
    headline = 'Refreshing campaign creative';
    subtext = 'Smartemark is preparing a fresh creative direction to keep campaign performance moving.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'post_click_conversion_gap') {
    headline = 'Improving conversion path';
    subtext = 'Smartemark is reviewing how to improve results after the click and strengthen campaign efficiency.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'healthy_early_signal') {
    headline = 'Monitoring performance';
    subtext = 'Smartemark is seeing healthy early signals and is continuing to monitor performance before making changes.';
    stage = 'monitoring';
    tone = 'positive';
  }

  return {
    headline,
    subtext,
    stage,
    tone,
    updatedAt: new Date().toISOString(),
    mode: 'public_marketer_summary_v1',
  };
}

module.exports = {
  buildPublicSummary,
};