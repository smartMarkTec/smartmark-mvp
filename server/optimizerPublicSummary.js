'use strict';

function pickActionItems({ diagnosis, decision, actionType, monitoringDecision, manualOverride }) {
  const items = [];

  if (manualOverride) {
    items.push('Respecting manual campaign control');
  }

  if (monitoringDecision === 'delivery_blocked') {
    items.push('Restoring campaign delivery');
  }

  if (decision === 'restore_delivery' || actionType === 'unpause_campaign') {
    items.push('Re-enabled campaign delivery');
  }

  if (decision === 'investigate_delivery' || actionType === 'check_delivery_status') {
    items.push('Checked campaign delivery status');
  }

  if (diagnosis === 'billing_blocked') {
    items.push('Paused optimization until billing is restored');
  }

  if (diagnosis === 'scheduled_not_started') {
    items.push('Waiting for scheduled campaign start');
  }

  if (
    diagnosis === 'low_ctr' ||
    decision === 'refresh_copy' ||
    actionType === 'update_primary_text' ||
    actionType === 'update_headline'
  ) {
    items.push('Preparing stronger ad messaging');
  }

  if (diagnosis === 'weak_engagement') {
    items.push('Reviewing early engagement quality');
  }

  if (diagnosis === 'creative_fatigue_risk') {
    items.push('Preparing a creative refresh');
  }

  if (diagnosis === 'post_click_conversion_gap') {
    items.push('Reviewing post-click conversion flow');
  }

  if (diagnosis === 'healthy_early_signal') {
    items.push('Tracking strong early performance signals');
  }

  if (
    !items.length &&
    (diagnosis || decision || actionType || monitoringDecision)
  ) {
    items.push('Monitoring campaign performance');
  }

  return Array.from(new Set(items)).slice(0, 3);
}

function buildPublicSummary({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const metricsSnapshot = optimizerState?.metricsSnapshot || {};

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const decision = String(latestDecision?.decision || '').trim();
  const actionType = String(latestAction?.actionType || latestDecision?.actionType || '').trim();
  const monitoringDecision = String(latestMonitoringDecision?.monitoringDecision || '').trim();

  const currentStatus = String(
    optimizerState?.currentStatus ||
      latestAction?.actionResult?.campaign?.effectiveStatus ||
      latestAction?.actionResult?.campaign?.status ||
      ''
  )
    .trim()
    .toUpperCase();

  const manualOverride = !!optimizerState?.manualOverride;
  const manualOverrideType = String(optimizerState?.manualOverrideType || '').trim();

  const impressions = Number(metricsSnapshot?.impressions || 0);
  const clicks = Number(metricsSnapshot?.clicks || 0);
  const spend = Number(metricsSnapshot?.spend || 0);
  const conversions = Number(metricsSnapshot?.conversions || 0);

  const hasAnyData = impressions > 0 || clicks > 0 || spend > 0 || conversions > 0;
  const hasEarlyData = impressions > 0 || clicks > 0 || spend > 0;

  let headline = 'Monitoring campaign performance';
  let subtext = 'Smartemark is watching campaign data and looking for the next opportunity to improve results.';
  let stage = 'monitoring';
  let tone = 'calm';

  if (manualOverride && (manualOverrideType === 'paused_by_user' || currentStatus === 'PAUSED')) {
    headline = 'Manual campaign control detected';
    subtext = 'Smartemark detected a manual campaign change and will respect your control while continuing to observe campaign state.';
    stage = 'manual_override';
    tone = 'calm';
  } else if (diagnosis === 'billing_blocked') {
    headline = 'Resolving account issue';
    subtext = 'Smartemark is waiting for account billing to be restored so campaign delivery can continue.';
    stage = 'blocked';
    tone = 'attention';
  } else if (diagnosis === 'scheduled_not_started') {
    headline = 'Waiting for campaign start';
    subtext = 'Smartemark is standing by for the campaign start window so performance data can begin coming in.';
    stage = 'launching';
    tone = 'calm';
  } else if (
    monitoringDecision === 'delivery_blocked' ||
    decision === 'restore_delivery' ||
    actionType === 'unpause_campaign'
  ) {
    headline = 'Restoring campaign delivery';
    subtext = 'Smartemark detected a delivery issue and is working to get the campaign serving normally again.';
    stage = 'delivery_blocked';
    tone = 'active';
  } else if (
    diagnosis === 'no_delivery' ||
    decision === 'investigate_delivery' ||
    actionType === 'check_delivery_status'
  ) {
    headline = 'Checking campaign delivery';
    subtext = 'Smartemark is inspecting delivery conditions before making broader optimization changes.';
    stage = 'monitoring';
    tone = 'active';
  } else if (
    diagnosis === 'low_ctr' ||
    decision === 'refresh_copy' ||
    actionType === 'update_primary_text' ||
    actionType === 'update_headline'
  ) {
    headline = 'Improving ad messaging';
    subtext = 'Smartemark is preparing stronger primary text and headline direction to improve response quality.';
    stage = 'improving';
    tone = 'active';
  } else if (diagnosis === 'weak_engagement') {
    headline = 'Strengthening campaign response';
    subtext = 'Smartemark is reviewing early engagement signals and preparing a stronger angle for better response.';
    stage = 'learning';
    tone = 'active';
  } else if (diagnosis === 'creative_fatigue_risk') {
    headline = 'Refreshing campaign creative';
    subtext = 'Smartemark is preparing a new creative direction to keep performance moving and reduce fatigue.';
    stage = 'improving';
    tone = 'active';
  } else if (diagnosis === 'post_click_conversion_gap') {
    headline = 'Improving conversion efficiency';
    subtext = 'Smartemark is reviewing performance after the click to improve overall campaign efficiency.';
    stage = 'improving';
    tone = 'active';
  } else if (diagnosis === 'healthy_early_signal') {
    headline = 'Learning from strong early signals';
    subtext = 'Smartemark is seeing encouraging early campaign data and is continuing to learn before making measured adjustments.';
    stage = 'learning';
    tone = 'positive';
  } else if (!hasAnyData && currentStatus === 'ACTIVE') {
    headline = 'Collecting early campaign signals';
    subtext = 'Smartemark is waiting for the first meaningful performance data before making optimization moves.';
    stage = 'waiting_for_data';
    tone = 'calm';
  } else if (hasEarlyData && !diagnosis && !decision && !actionType && !monitoringDecision) {
    headline = 'Monitoring live performance';
    subtext = 'Smartemark is tracking delivery, click quality, and spend efficiency as more campaign data comes in.';
    stage = 'learning';
    tone = 'calm';
  }

  const actions = pickActionItems({
    diagnosis,
    decision,
    actionType,
    monitoringDecision,
    manualOverride,
  });

  return {
    headline,
    subtext,
    stage,
    tone,
    actions,
    capabilities: {
      copyRefreshReady: true,
      headlineRefreshReady: true,
      creativeRefreshReady: true,
      budgetShiftReady: false,
      audienceRefinementReady: false,
      variantLaunchReady: false,
    },
    dataState: {
      hasAnyData,
      hasEarlyData,
      impressions,
      clicks,
      spend,
      conversions,
    },
    updatedAt: new Date().toISOString(),
    mode: 'public_marketer_summary_v2',
  };
}

module.exports = {
  buildPublicSummary,
};