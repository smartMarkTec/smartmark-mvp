'use strict';

function pickActionItems({
  diagnosis,
  decision,
  actionType,
  monitoringDecision,
  manualOverride,
  latestActionStatus,
}) {
  const items = [];

  if (manualOverride) {
    items.push('Respecting manual campaign control');
  }

  if (monitoringDecision === 'delivery_blocked') {
    items.push('Checking delivery conditions');
  }

  if (
    decision === 'restore_delivery' ||
    actionType === 'unpause_campaign' ||
    latestActionStatus === 'completed_unpause'
  ) {
    items.push('Improving campaign delivery');
  }

  if (decision === 'investigate_delivery' || actionType === 'check_delivery_status') {
    items.push('Checking delivery status');
  }

  if (diagnosis === 'billing_blocked') {
    items.push('Waiting for billing recovery');
  }

  if (diagnosis === 'scheduled_not_started') {
    items.push('Waiting for campaign start');
  }

  if (
    diagnosis === 'low_ctr' ||
    decision === 'refresh_copy' ||
    actionType === 'update_primary_text' ||
    actionType === 'test_new_primary_text_or_headline'
  ) {
    items.push('Refreshing ad messaging');
  }

  if (diagnosis === 'weak_engagement') {
    items.push('Strengthening ad response');
  }

  if (diagnosis === 'creative_fatigue_risk') {
    items.push('Preparing creative refresh');
  }

  if (diagnosis === 'post_click_conversion_gap') {
    items.push('Reviewing conversion response');
  }

  if (diagnosis === 'healthy_early_signal') {
    items.push('Monitoring strong early performance');
  }

  if (!items.length && (diagnosis || decision || actionType || monitoringDecision)) {
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
  const actionType = String(
    latestAction?.actionType || latestDecision?.actionType || ''
  ).trim();
  const monitoringDecision = String(
    latestMonitoringDecision?.monitoringDecision || ''
  ).trim();

  const currentStatus = String(
    optimizerState?.currentStatus ||
      latestAction?.actionResult?.campaign?.effectiveStatus ||
      latestAction?.actionResult?.campaign?.status ||
      ''
  )
    .trim()
    .toUpperCase();

  const latestActionStatus = String(latestAction?.status || '').trim();
  const latestActionExecuted = !!latestAction?.executed;

  const manualOverride = !!optimizerState?.manualOverride;
  const manualOverrideType = String(optimizerState?.manualOverrideType || '').trim();

  const impressions = Number(metricsSnapshot?.impressions || 0);
  const clicks = Number(metricsSnapshot?.clicks || 0);
  const spend = Number(metricsSnapshot?.spend || 0);
  const conversions = Number(metricsSnapshot?.conversions || 0);

  const hasAnyData = impressions > 0 || clicks > 0 || spend > 0 || conversions > 0;
  const hasEarlyData = impressions > 0 || clicks > 0 || spend > 0;

  let headline = 'Monitoring campaign performance';
  let subtext =
    'Smartemark is watching campaign data and looking for the next measured opportunity to improve results.';
  let stage = 'monitoring';
  let tone = 'calm';

  if (manualOverride && (manualOverrideType === 'paused_by_user' || currentStatus === 'PAUSED')) {
    headline = 'Manual campaign control detected';
    subtext =
      'Smartemark detected a manual campaign change and will respect your control while continuing to monitor campaign state.';
    stage = 'manual_override';
    tone = 'calm';
  } else if (diagnosis === 'billing_blocked') {
    headline = 'Resolving account issue';
    subtext =
      'Smartemark is waiting for account billing to be restored so campaign delivery can continue.';
    stage = 'blocked';
    tone = 'attention';
  } else if (diagnosis === 'scheduled_not_started') {
    headline = 'Waiting for campaign start';
    subtext =
      'Smartemark is standing by for the campaign start window so performance data can begin coming in.';
    stage = 'queued';
    tone = 'calm';
  } else if (
    actionType === 'unpause_campaign' &&
    latestActionExecuted &&
    latestActionStatus === 'completed'
  ) {
    headline = 'Improving campaign delivery';
    subtext =
      'Smartemark restored campaign delivery so the ad can resume gathering performance data.';
    stage = 'delivery';
    tone = 'active';
  } else if (
    monitoringDecision === 'delivery_blocked' ||
    decision === 'restore_delivery' ||
    actionType === 'unpause_campaign'
  ) {
    headline = 'Restoring campaign delivery';
    subtext =
      'Smartemark detected a delivery issue and is working to get the campaign serving normally again.';
    stage = 'delivery';
    tone = 'active';
  } else if (
    diagnosis === 'no_delivery' ||
    decision === 'investigate_delivery' ||
    actionType === 'check_delivery_status'
  ) {
    headline = 'Checking delivery conditions';
    subtext =
      'Smartemark is inspecting campaign delivery conditions before making broader optimization changes.';
    stage = 'delivery';
    tone = 'active';
  } else if (
    diagnosis === 'low_ctr' ||
    decision === 'refresh_copy' ||
    actionType === 'update_primary_text' ||
    actionType === 'test_new_primary_text_or_headline'
  ) {
    if (latestActionExecuted && latestActionStatus === 'completed') {
      headline = 'Refreshing ad messaging';
      subtext =
        'Smartemark updated campaign messaging to improve response quality and will now monitor the next results closely.';
    } else {
      headline = 'Refreshing ad messaging';
      subtext =
        'Smartemark is preparing stronger primary text and headline direction to improve response quality.';
    }
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'weak_engagement') {
    headline = 'Strengthening ad response';
    subtext =
      'Smartemark is reviewing early engagement quality and preparing a stronger messaging angle.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'creative_fatigue_risk') {
    headline = 'Preparing creative refresh';
    subtext =
      'Smartemark sees signs of creative fatigue and is preparing a fresh direction for the next phase.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'post_click_conversion_gap') {
    headline = 'Improving conversion efficiency';
    subtext =
      'Smartemark is reviewing performance after the click to improve overall campaign efficiency.';
    stage = 'optimizing';
    tone = 'active';
  } else if (diagnosis === 'healthy_early_signal') {
    headline = 'Monitoring strong early performance';
    subtext =
      'Smartemark is seeing encouraging early campaign data and is continuing to learn before making measured adjustments.';
    stage = 'monitoring';
    tone = 'positive';
  } else if (diagnosis === 'insufficient_data') {
    headline = 'Collecting stronger performance signals';
    subtext =
      'Smartemark has started receiving delivery data and is waiting for a more reliable signal before making changes.';
    stage = 'monitoring';
    tone = 'calm';
  } else if (!hasAnyData && currentStatus === 'ACTIVE') {
    headline = 'Collecting early campaign signals';
    subtext =
      'Smartemark is waiting for the first meaningful performance data before making optimization moves.';
    stage = 'monitoring';
    tone = 'calm';
  } else if (hasEarlyData && !diagnosis && !decision && !actionType && !monitoringDecision) {
    headline = 'Monitoring live performance';
    subtext =
      'Smartemark is tracking delivery, click quality, and spend efficiency as more campaign data comes in.';
    stage = 'monitoring';
    tone = 'calm';
  }

  const latestActionStatusTag =
    actionType === 'unpause_campaign' && latestActionExecuted && latestActionStatus === 'completed'
      ? 'completed_unpause'
      : latestActionStatus;

  const actions = pickActionItems({
    diagnosis,
    decision,
    actionType,
    monitoringDecision,
    manualOverride,
    latestActionStatus: latestActionStatusTag,
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
    mode: 'public_marketer_summary_v3',
  };
}

module.exports = {
  buildPublicSummary,
};