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
    'There is not enough trustworthy delivery data yet to diagnose campaign performance confidently.';
  let confidence = 0.88;

  if (optimizerState?.billingBlocked === true) {
    diagnosis = 'billing_blocked';
    likelyProblem = 'Campaign delivery is blocked by ad account billing or payment issues.';
    recommendedAction = 'resolve_billing';
    reason =
      'Optimizer state indicates a billing or payment block, so no creative or messaging change should happen until delivery is restored.';
    confidence = 0.99;
  } else if (hasFutureStart && !hasAnyDelivery) {
    diagnosis = 'scheduled_not_started';
    likelyProblem = 'Campaign has a future start time and has not begun serving yet.';
    recommendedAction = 'wait_for_start_time';
    reason =
      'The scheduled start time appears to be in the future, so zero delivery is expected right now.';
    confidence = 0.98;
  } else if (!hasAnyDelivery && looksPaused) {
    diagnosis = 'no_delivery';
    likelyProblem = 'Campaign is not delivering because it is paused or otherwise inactive.';
    recommendedAction = 'check_delivery_status';
    reason =
      'There is zero spend and zero impressions, and the campaign status appears inactive, so delivery conditions should be checked before optimizing messaging.';
    confidence = 0.97;
  } else if (!hasAnyDelivery) {
    diagnosis = 'no_delivery';
    likelyProblem = 'Campaign is not serving impressions yet.';
    recommendedAction = 'check_delivery_status';
    reason =
      'Metrics show zero impressions and zero spend, which usually means the campaign has not entered delivery or is blocked from serving.';
    confidence = 0.95;
  } else if (impressions < 150 && spend < 3 && !hasSomeClickSignal) {
    diagnosis = 'insufficient_data';
    likelyProblem = 'Delivery has started, but there is not enough signal yet for a reliable optimization move.';
    recommendedAction = 'continue_monitoring';
    reason =
      'The campaign has only light early delivery so far, so changing creative or messaging now would be premature.';
    confidence = 0.9;
  } else if (impressions >= 150 && !hasSomeClickSignal) {
    diagnosis = 'weak_engagement';
    likelyProblem = 'The campaign is getting delivery, but the message or creative is not generating clicks.';
    recommendedAction = 'test_new_primary_text_or_headline';
    reason =
      'The ad is being shown, but click response is absent after meaningful delivery, which usually points to a weak hook, message, or creative.';
    confidence = 0.86;
  } else if (impressions >= 300 && ctr > 0 && ctr < 0.9) {
    diagnosis = 'low_ctr';
    likelyProblem = 'Click-through rate is weak enough to justify a messaging refresh.';
    recommendedAction = 'update_primary_text';
    reason =
      'The campaign is delivering and getting some click signal, but CTR remains under the threshold that suggests healthy ad response.';
    confidence = 0.87;
  } else if (linkClicks >= 12 && conversions === 0) {
    diagnosis = 'post_click_conversion_gap';
    likelyProblem = 'Users are clicking, but the offer, landing page, or audience fit is not converting.';
    recommendedAction = 'test_offer_or_audience_angle';
    reason =
      'The campaign is able to generate traffic, but post-click conversion response is absent after meaningful click volume.';
    confidence = 0.82;
  } else if (
    frequency != null &&
    frequency >= 2.5 &&
    impressions >= 800 &&
    ctr > 0 &&
    ctr < 1.2
  ) {
    diagnosis = 'creative_fatigue_risk';
    likelyProblem = 'Audience repetition may be increasing while engagement quality softens.';
    recommendedAction = 'prepare_fresh_creative_variant';
    reason =
      'Frequency is elevated and response efficiency looks weaker, which can indicate early creative fatigue rather than pure delivery failure.';
    confidence = 0.78;
  } else if (linkClicks >= 3 && cpc != null && cpc > 3.5) {
    diagnosis = 'high_cpc';
    likelyProblem = 'Traffic is coming in, but cost efficiency is weak.';
    recommendedAction = 'test_new_audience_or_creative';
    reason =
      'Clicks are happening, but cost per click is elevated enough to suggest inefficient creative resonance or audience fit.';
    confidence = 0.75;
  } else if (
    hasMeaningfulDelivery &&
    ((ctr >= 1.0 && hasMeaningfulClickSignal) || conversions > 0)
  ) {
    diagnosis = 'healthy_early_signal';
    likelyProblem = 'No major performance problem is visible yet.';
    recommendedAction = 'continue_monitoring';
    reason =
      'The campaign is showing acceptable delivery and response for this stage, so immediate intervention would be premature.';
    confidence = 0.79;
  } else if (hasAnyDelivery && hasSomeClickSignal) {
    diagnosis = 'healthy_early_signal';
    likelyProblem = 'Early signal is present, but more data is still needed before major changes.';
    recommendedAction = 'continue_monitoring';
    reason =
      'The campaign has begun generating delivery and click response, and the current signal does not yet justify a stronger intervention.';
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