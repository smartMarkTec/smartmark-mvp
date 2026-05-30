'use strict';

function buildDailyReport(optimizerState) {
  const metrics = optimizerState?.metricsSnapshot || {};
  const impressions = Number(metrics.impressions || 0);
  const clicks = Number(metrics.clicks || 0);
  const spend = Number(metrics.spend || 0);
  const ctr = Number(metrics.ctr || 0);
  const cpc = Number(metrics.cpc || 0);
  const conversions = Number(metrics.conversions || 0);
  const conversionTrackingConfirmed = !!optimizerState?.conversionTrackingConfirmed;

  const campaignName = String(optimizerState?.campaignName || 'this campaign').trim();
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestAction = optimizerState?.latestAction || null;
  const actionType = String(latestAction?.actionType || '').trim();

  const parts = [];
  if (impressions > 0) parts.push(`${impressions.toLocaleString()} impressions`);
  if (clicks > 0) parts.push(`${clicks} click${clicks === 1 ? '' : 's'}`);
  if (ctr > 0) parts.push(`${ctr.toFixed(2)}% CTR`);
  if (cpc > 0) parts.push(`$${cpc.toFixed(2)} CPC`);
  if (spend > 0) parts.push(`$${spend.toFixed(2)} spent`);
  const metricsLine = parts.length ? parts.join(', ') : 'no delivery data yet';

  const convLine =
    conversionTrackingConfirmed && conversions > 0
      ? ` ${conversions} conversion${conversions === 1 ? '' : 's'} recorded.`
      : '';

  const diagnosisType = String(latestDiagnosis?.diagnosis || '').trim();
  let observation = '';
  if (diagnosisType === 'billing_blocked') {
    observation = 'Delivery is currently paused due to a billing issue on the ad account.';
  } else if (diagnosisType === 'no_delivery') {
    observation = 'The campaign has not started delivering or is paused.';
  } else if (impressions === 0) {
    observation = 'No delivery data yet — still gathering early signals.';
  } else if (ctr > 0 && ctr < 0.8) {
    const _lastChange = String(optimizerState?.lastCopyChangeAt || optimizerState?.lastManualCopyEditAt || '').trim();
    const _hoursSince = _lastChange ? Math.max(0, (Date.now() - new Date(_lastChange).getTime()) / 3600000) : null;
    observation = (_hoursSince !== null && _hoursSince < 168)
      ? 'CTR remains below target after the recent copy update — Smartemark is evaluating whether a fresh creative angle is the next strategic test.'
      : 'CTR is on the lower side — Smartemark is monitoring whether the primary hook needs to be refreshed once more data comes in.';
  } else if (ctr >= 0.8 && ctr < 1.5) {
    observation = 'CTR is building toward a solid range. Delivery and early engagement look acceptable at this stage.';
  } else if (ctr >= 1.5) {
    observation = 'CTR is in a strong range. Delivery and engagement are both looking solid.';
  } else {
    observation = 'Delivery is active. Still gathering signal before forming a confident optimization view.';
  }

  let actionNote = '';
  if (actionType && actionType !== 'continue_monitoring' && actionType !== 'dry_run_skipped') {
    const isDryRun = !!latestAction?.dryRun;
    const actionLabel = actionType.replace(/_/g, ' ');
    actionNote = isDryRun
      ? ` Smartemark evaluated a possible action (${actionLabel}) but is holding off until the timing is right.`
      : ` Smartemark took action: ${actionLabel}.`;
  } else {
    actionNote =
      ' No major action was taken today — the campaign is still in the observation window.';
  }

  const summary = `Today, ${campaignName} delivered ${metricsLine}.${convLine} ${observation}${actionNote}`;

  return {
    type: 'daily_report',
    timestamp: new Date().toISOString(),
    title: 'Daily Campaign Report',
    summary,
    reason: latestDiagnosis?.reason || '',
    actionType: actionType || null,
    dryRun: false,
    source: 'daily_report_v1',
  };
}

function shouldGenerateDailyReport(optimizerState) {
  const history = Array.isArray(optimizerState?.aiHistory) ? optimizerState.aiHistory : [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();

  return !history.some((entry) => {
    if (entry.type !== 'daily_report') return false;
    const ts = entry.timestamp ? new Date(entry.timestamp).getTime() : 0;
    return ts >= todayStartMs;
  });
}

module.exports = { buildDailyReport, shouldGenerateDailyReport };
