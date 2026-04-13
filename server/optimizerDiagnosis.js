'use strict';

const { runOptimizerBrainDiagnosis } = require('./optimizerBrain');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNullableNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeRatio(num, den) {
  const n = Number(num);
  const d = Number(den);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return n / d;
}

function pickPrimaryCreativeContext(creativesRecord) {
  if (!creativesRecord || typeof creativesRecord !== 'object') return null;

  const headline = String(creativesRecord?.meta?.headline || '').trim();
  const body = String(creativesRecord?.meta?.body || '').trim();
  const link = String(creativesRecord?.meta?.link || '').trim();

  return {
    mediaSelection: String(creativesRecord.mediaSelection || '').trim(),
    imageCount: Array.isArray(creativesRecord.images) ? creativesRecord.images.length : 0,
    videoCount: Array.isArray(creativesRecord.videos) ? creativesRecord.videos.length : 0,
    status: String(creativesRecord.status || '').trim(),
    name: String(creativesRecord.name || '').trim(),
    hasHeadline: !!headline,
    hasBody: !!body,
    hasLink: !!link,
  };
}

function deriveCtr(clicks, impressions, rawCtr) {
  const provided = Number(rawCtr);
  if (Number.isFinite(provided)) return provided;

  const ratio = safeRatio(clicks, impressions);
  return ratio == null ? 0 : ratio * 100;
}

function deriveCpc(spend, linkClicks, rawCpc) {
  const provided = Number(rawCpc);
  if (Number.isFinite(provided)) return provided;

  const ratio = safeRatio(spend, linkClicks);
  return ratio == null ? null : ratio;
}

function deriveFrequency(impressions, reach, rawFrequency) {
  const provided = Number(rawFrequency);
  if (Number.isFinite(provided)) return provided;

  const ratio = safeRatio(impressions, reach);
  return ratio == null ? null : ratio;
}

function deriveConversionRate(conversions, linkClicks, rawConversionRate) {
  const provided = Number(rawConversionRate);
  if (Number.isFinite(provided)) return provided;

  const ratio = safeRatio(conversions, linkClicks);
  return ratio == null ? null : ratio * 100;
}

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function buildFallbackDiagnosis({ optimizerState, creativesRecord = null }) {
  const metrics = optimizerState?.metricsSnapshot || {};

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const reach = toNumber(metrics.reach, 0);
  const clicks = toNumber(metrics.clicks, 0);
  const linkClicks = toNumber(
    metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics.conversions, 0);

  const ctr = deriveCtr(clicks || linkClicks, impressions, metrics.ctr);
  const cpc = deriveCpc(spend, linkClicks, metrics.cpc);
  const frequency = deriveFrequency(impressions, reach, metrics.frequency);
  const conversionRate = deriveConversionRate(
    conversions,
    linkClicks,
    metrics.conversionRate
  );

  const creativeContext = pickPrimaryCreativeContext(creativesRecord);

  const latestAction = optimizerState?.latestAction || null;
  const inspectedCampaign = latestAction?.actionResult?.campaign || null;

  const currentStatus = normalizeStatus(
    optimizerState?.currentStatus ||
      inspectedCampaign?.effectiveStatus ||
      inspectedCampaign?.status
  );

  const inspectedStartTime = String(
    inspectedCampaign?.startTime || optimizerState?.startTime || ''
  ).trim();

  const nowMs = Date.now();
  const startMs = inspectedStartTime ? new Date(inspectedStartTime).getTime() : NaN;
  const hasFutureStart = Number.isFinite(startMs) && startMs > nowMs;

  const hasAnyDelivery = impressions > 0 || spend > 0;
  const hasMeaningfulDelivery = impressions >= 250 || spend >= 5;
  const hasSomeClickSignal = clicks > 0 || linkClicks > 0;
  const hasMeaningfulClickSignal = linkClicks >= 3 || clicks >= 3;
  const looksPaused =
    currentStatus === 'PAUSED' ||
    currentStatus === 'ARCHIVED' ||
    currentStatus === 'DELETED';

  let diagnosis = 'no_data';
  let likelyProblem = 'Campaign has not generated enough data yet.';
  let recommendedAction = 'continue_monitoring';
  let reason =
    'Still gathering early delivery data. The system will begin forming a clear picture once impressions start coming in — typically within the first day or two.';
  let confidence = 0.88;

  if (optimizerState?.billingBlocked === true) {
    diagnosis = 'billing_blocked';
    likelyProblem = 'Campaign delivery is blocked by ad account billing or payment issues.';
    recommendedAction = 'resolve_billing';
    reason =
      'Delivery is currently paused due to a billing or payment issue on the ad account. Once that is resolved, the campaign can resume and the system will pick up monitoring from there.';
    confidence = 0.99;
  } else if (hasFutureStart && !hasAnyDelivery) {
    diagnosis = 'scheduled_not_started';
    likelyProblem = 'Campaign has a future start time and has not begun serving yet.';
    recommendedAction = 'wait_for_start_time';
    reason =
      'The campaign is scheduled to start in the future, so zero delivery right now is expected. The system will begin watching performance once it goes live.';
    confidence = 0.98;
  } else if (!hasAnyDelivery && looksPaused) {
    diagnosis = 'no_delivery';
    likelyProblem = 'Campaign is not delivering because it is paused or otherwise inactive.';
    recommendedAction = 'check_delivery_status';
    reason =
      'Delivery is currently paused. Once the campaign is reactivated, the system will resume monitoring and flag the next logical move.';
    confidence = 0.97;
  } else if (!hasAnyDelivery) {
    diagnosis = 'no_delivery';
    likelyProblem = 'Campaign is not serving impressions yet.';
    recommendedAction = 'check_delivery_status';
    reason =
      'No impressions or spend have registered yet — this is common in the early hours after launch while the ad goes through review and Facebook begins distributing it.';
    confidence = 0.95;
  } else if (impressions < 150 && spend < 3 && !hasSomeClickSignal) {
    diagnosis = 'insufficient_data';
    likelyProblem = 'Delivery has started, but there is not enough signal yet for a reliable optimization move.';
    recommendedAction = 'continue_monitoring';
    reason =
      'Early delivery has started — still gathering enough signal to form a reliable view. This is normal at this stage and the system will continue watching before suggesting any change.';
    confidence = 0.9;
  } else if (impressions >= 150 && !hasSomeClickSignal) {
    diagnosis = 'weak_engagement';
    likelyProblem = 'The campaign is getting delivery, but the message or creative is not generating clicks.';
    recommendedAction = 'test_new_primary_text_or_headline';
    reason =
      'The ad is reaching people but hasn\'t generated clicks yet after meaningful impressions. The next focus is testing a stronger hook or headline to improve early engagement.';
    confidence = 0.86;
  } else if (impressions >= 300 && ctr > 0 && ctr < 0.9) {
    diagnosis = 'low_ctr';
    likelyProblem = 'Click-through rate is below the range that suggests strong ad resonance.';
    recommendedAction = 'update_primary_text';
    reason =
      'Delivery is active and generating some click response. CTR is on the lower side — the system is watching closely and will flag when a messaging refresh could meaningfully improve performance.';
    confidence = 0.87;
  } else if (linkClicks >= 12 && conversions === 0) {
    diagnosis = 'post_click_conversion_gap';
    likelyProblem = 'Users are clicking, but the offer, landing page, or audience fit is not converting.';
    recommendedAction = 'test_offer_or_audience_angle';
    reason =
      'Traffic is coming in from the ad. The system is now watching post-click behavior — if conversions don\'t follow, a landing page or offer adjustment may be worth testing next.';
    confidence = 0.82;
  } else if (
    frequency != null &&
    frequency >= 2.5 &&
    impressions >= 800 &&
    ctr > 0 &&
    ctr < 1.2
  ) {
    diagnosis = 'creative_fatigue_risk';
    likelyProblem = 'Audience repetition is increasing while engagement efficiency softens.';
    recommendedAction = 'prepare_fresh_creative_variant';
    reason =
      'The audience has seen this ad regularly and engagement efficiency is starting to soften — a normal pattern after extended delivery. Preparing a fresh creative variant now is the right proactive move.';
    confidence = 0.78;
  } else if (linkClicks >= 3 && cpc != null && cpc > 3.5) {
    diagnosis = 'high_cpc';
    likelyProblem = 'Traffic is coming in, but cost per click is on the higher side.';
    recommendedAction = 'test_new_audience_or_creative';
    reason =
      'Clicks are coming in. Cost per click is elevated relative to typical benchmarks — the system is evaluating whether a creative or audience adjustment could bring efficiency up.';
    confidence = 0.75;
  } else if (
    hasMeaningfulDelivery &&
    ((ctr >= 1.0 && hasMeaningfulClickSignal) || conversions > 0)
  ) {
    diagnosis = 'healthy_early_signal';
    likelyProblem = 'No major performance problem is visible yet.';
    recommendedAction = 'continue_monitoring';
    reason =
      'Delivery and engagement are both in a healthy range for this stage. The system is monitoring closely and will flag the next action when the data justifies it.';
    confidence = 0.79;
  } else if (hasAnyDelivery && hasSomeClickSignal) {
    diagnosis = 'healthy_early_signal';
    likelyProblem = 'Early signal is present, but more data is still needed before major changes.';
    recommendedAction = 'continue_monitoring';
    reason =
      'Delivery and click response are both active. Still building enough signal for a confident optimization move — the system will continue watching and flag the right moment.';
    confidence = 0.72;
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
      cpc: toNullableNumber(cpc),
      frequency: toNullableNumber(frequency),
      conversions,
      conversionRate: toNullableNumber(conversionRate),
    },
    deliveryContext: {
      currentStatus,
      hasFutureStart,
      inspectedStartTime: inspectedStartTime || null,
      billingBlocked: optimizerState?.billingBlocked === true,
      hasAnyDelivery,
      hasMeaningfulDelivery,
      hasSomeClickSignal,
    },
    creativeContext,
    generatedAt: new Date().toISOString(),
    mode: 'fallback_rule_based_v1',
  };
}

function attachSharedContext({ base, optimizerState, creativesRecord }) {
  const metrics = optimizerState?.metricsSnapshot || {};
  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const reach = toNumber(metrics.reach, 0);
  const clicks = toNumber(metrics.clicks, 0);
  const linkClicks = toNumber(
    metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics.conversions, 0);

  const ctr = deriveCtr(clicks || linkClicks, impressions, metrics.ctr);
  const cpc = deriveCpc(spend, linkClicks, metrics.cpc);
  const frequency = deriveFrequency(impressions, reach, metrics.frequency);
  const conversionRate = deriveConversionRate(
    conversions,
    linkClicks,
    metrics.conversionRate
  );

  const latestAction = optimizerState?.latestAction || null;
  const inspectedCampaign = latestAction?.actionResult?.campaign || null;

  const currentStatus = normalizeStatus(
    optimizerState?.currentStatus ||
      inspectedCampaign?.effectiveStatus ||
      inspectedCampaign?.status
  );

  const inspectedStartTime = String(
    inspectedCampaign?.startTime || optimizerState?.startTime || ''
  ).trim();

  const nowMs = Date.now();
  const startMs = inspectedStartTime ? new Date(inspectedStartTime).getTime() : NaN;
  const hasFutureStart = Number.isFinite(startMs) && startMs > nowMs;
  const hasAnyDelivery = impressions > 0 || spend > 0;
  const hasMeaningfulDelivery = impressions >= 250 || spend >= 5;
  const hasSomeClickSignal = clicks > 0 || linkClicks > 0;

  return {
    ...base,
    campaignId: String(optimizerState?.campaignId || '').trim(),
    metricsSummary: {
      spend,
      impressions,
      reach,
      clicks,
      linkClicks,
      ctr: Number.isFinite(ctr) ? ctr : 0,
      cpc: toNullableNumber(cpc),
      frequency: toNullableNumber(frequency),
      conversions,
      conversionRate: toNullableNumber(conversionRate),
    },
    deliveryContext: {
      currentStatus,
      hasFutureStart,
      inspectedStartTime: inspectedStartTime || null,
      billingBlocked: optimizerState?.billingBlocked === true,
      hasAnyDelivery,
      hasMeaningfulDelivery,
      hasSomeClickSignal,
    },
    creativeContext: pickPrimaryCreativeContext(creativesRecord),
  };
}

function buildDiagnosis({ optimizerState, creativesRecord = null }) {
  const useAiBrain = String(process.env.OPTIMIZER_USE_AI_BRAIN || '1').trim() === '1';

  const fallback = buildFallbackDiagnosis({
    optimizerState,
    creativesRecord,
  });

  if (!useAiBrain) {
    return fallback;
  }

  return attachSharedContext({
    base: fallback,
    optimizerState,
    creativesRecord,
  });
}

async function buildDiagnosisAsync({ optimizerState, creativesRecord = null }) {
  const useAiBrain = String(process.env.OPTIMIZER_USE_AI_BRAIN || '1').trim() === '1';

  const fallback = buildFallbackDiagnosis({
    optimizerState,
    creativesRecord,
  });

  if (!useAiBrain) {
    return fallback;
  }

  try {
    const aiResult = await runOptimizerBrainDiagnosis({
      optimizerState,
      creativesRecord,
    });

    return attachSharedContext({
      base: aiResult,
      optimizerState,
      creativesRecord,
    });
  } catch (err) {
    return attachSharedContext({
      base: {
        ...fallback,
        reason: `${fallback.reason} AI fallback triggered: ${String(err?.message || 'unknown error')}`,
        mode: 'fallback_rule_based_v1',
      },
      optimizerState,
      creativesRecord,
    });
  }
}

module.exports = {
  buildDiagnosis,
  buildDiagnosisAsync,
};