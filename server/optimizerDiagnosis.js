'use strict';

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function pickPrimaryCreativeContext(creativesRecord) {
  if (!creativesRecord || typeof creativesRecord !== 'object') return null;

  return {
    mediaSelection: String(creativesRecord.mediaSelection || '').trim(),
    imageCount: Array.isArray(creativesRecord.images) ? creativesRecord.images.length : 0,
    videoCount: Array.isArray(creativesRecord.videos) ? creativesRecord.videos.length : 0,
    status: String(creativesRecord.status || '').trim(),
    name: String(creativesRecord.name || '').trim(),
  };
}

function buildDiagnosis({
  optimizerState,
  creativesRecord = null,
}) {
  const metrics = optimizerState?.metricsSnapshot || {};

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const reach = toNumber(metrics.reach, 0);
  const clicks = toNumber(metrics.clicks, 0);
  const linkClicks = toNumber(metrics.linkClicks, 0);
  const ctr = Number(metrics.ctr);
  const cpc = metrics.cpc == null ? null : Number(metrics.cpc);
  const frequency = metrics.frequency == null ? null : Number(metrics.frequency);
  const conversions = toNumber(metrics.conversions, 0);
  const conversionRate =
    metrics.conversionRate == null ? null : Number(metrics.conversionRate);

  const creativeContext = pickPrimaryCreativeContext(creativesRecord);

  let diagnosis = 'no_data';
  let likelyProblem = 'Campaign has not generated meaningful delivery data yet.';
  let recommendedAction = 'wait_for_delivery';
  let reason =
    'There are no impressions, clicks, or spend signals strong enough yet to diagnose performance.';
  let confidence = 0.9;

   const latestAction = optimizerState?.latestAction || null;
  const inspectedCampaign = latestAction?.actionResult?.campaign || null;
  const inspectedEffectiveStatus = String(inspectedCampaign?.effectiveStatus || inspectedCampaign?.status || '').trim();
  const inspectedStartTime = String(inspectedCampaign?.startTime || '').trim();

  const currentStatus = String(optimizerState?.currentStatus || '').trim();
  const nowMs = Date.now();
  const startMs = inspectedStartTime ? new Date(inspectedStartTime).getTime() : NaN;
  const hasFutureStart = Number.isFinite(startMs) && startMs > nowMs;

  if (
    impressions === 0 &&
    spend === 0 &&
    hasFutureStart &&
    ['ACTIVE', 'PAUSED'].includes(inspectedEffectiveStatus || currentStatus)
  ) {
    diagnosis = 'scheduled_not_started';
    likelyProblem = 'Campaign is active but the scheduled start time has not arrived yet.';
    recommendedAction = 'wait_for_start_time';
    reason =
      'The campaign has zero delivery so far, but Meta reports a future start time, so this is likely a schedule timing issue rather than a creative or delivery failure.';
    confidence = 0.97;
  } else if (
    impressions === 0 &&
    spend === 0 &&
    optimizerState?.billingBlocked === true
  ) {
    diagnosis = 'billing_blocked';
    likelyProblem = 'Campaign delivery is blocked by ad account billing or payment issues.';
    recommendedAction = 'resolve_billing';
    reason =
      'Optimizer state indicates a billing/payment blockage, so the campaign cannot deliver until account funding or payment authorization is restored.';
    confidence = 0.98;
  } else if (impressions === 0 && spend === 0) {
    diagnosis = 'no_delivery';
    likelyProblem = 'Campaign is not delivering or has not started serving.';
    recommendedAction = 'check_delivery_status';
    reason =
      'Metrics show zero impressions and zero spend, which usually means the campaign has not entered delivery or has no served traffic yet.';
    confidence = 0.95;
  } else if (impressions > 0 && clicks === 0 && linkClicks === 0) {
    diagnosis = 'weak_engagement';
    likelyProblem = 'Creative or message is not earning clicks.';
    recommendedAction = 'test_new_primary_text_or_headline';
    reason =
      'Campaign has delivery but no click response, which suggests weak hook, message, or creative relevance.';
    confidence = 0.8;
   } else if (impressions >= 100 && clicks >= 1 && ctr > 0 && ctr < 1) {
    diagnosis = 'low_ctr';
    likelyProblem = 'Primary text hook is likely underperforming on click-through rate.';
    recommendedAction = 'update_primary_text';
    reason =
      'The campaign has started delivering and earning clicks, but CTR remains weak enough to justify a primary text refresh.';
    confidence = 0.84;
  } else if (linkClicks >= 10 && conversions === 0) {
    diagnosis = 'post_click_conversion_gap';
    likelyProblem = 'Users are clicking but not converting.';
    recommendedAction = 'test_offer_or_audience_angle';
    reason =
      'Traffic is being generated, but conversions are absent, which suggests a mismatch after the click or weak offer resonance.';
    confidence = 0.78;
  } else if (frequency != null && frequency >= 2.5 && ctr >= 0 && ctr < 1.0) {
    diagnosis = 'creative_fatigue_risk';
    likelyProblem = 'Audience may be seeing the same ad too often without strong engagement.';
    recommendedAction = 'prepare_fresh_creative_variant';
    reason =
      'Frequency is elevated while engagement remains weak, which can indicate fatigue or limited audience freshness.';
    confidence = 0.76;
  } else if (linkClicks > 0 && cpc != null && cpc > 3.5) {
    diagnosis = 'high_cpc';
    likelyProblem = 'Traffic is being acquired inefficiently.';
    recommendedAction = 'test_new_audience_or_creative';
    reason =
      'Clicks are occurring, but cost per click is high enough to suggest weak efficiency.';
    confidence = 0.72;
  } else if (linkClicks > 0 && conversions > 0) {
    diagnosis = 'healthy_early_signal';
    likelyProblem = 'No major problem detected yet.';
    recommendedAction = 'continue_monitoring';
    reason =
      'Campaign is producing traffic and conversion signals, so the current setup may still need more data before intervention.';
    confidence = 0.7;
  }

  return {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    diagnosis,
    likelyProblem,
    recommendedAction,
    reason,
    confidence,
    metricsSummary: {
      spend,
      impressions,
      reach,
      clicks,
      linkClicks,
      ctr: Number.isFinite(ctr) ? ctr : 0,
      cpc: Number.isFinite(cpc) ? cpc : null,
      frequency: Number.isFinite(frequency) ? frequency : null,
      conversions,
      conversionRate: Number.isFinite(conversionRate) ? conversionRate : null,
    },
    creativeContext,
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

module.exports = {
  buildDiagnosis,
};