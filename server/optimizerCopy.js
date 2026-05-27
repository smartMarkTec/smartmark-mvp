'use strict';

function clean(s) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
}

function buildUpdatedPrimaryText({ optimizerState = {}, latestDiagnosis = null, latestMonitoringDecision = null }) {
  const campaignName = clean(optimizerState?.campaignName);
  const niche = clean(optimizerState?.niche);
  const metrics = optimizerState?.metricsSnapshot || {};

  const impressions = Number(metrics.impressions || 0);
  const clicks = Number(metrics.clicks || 0);
  const ctr = Number(metrics.ctr || 0);

  const diagnosis = clean(latestDiagnosis?.diagnosis);
  const monitoringDecision = clean(latestMonitoringDecision?.monitoringDecision);

  // Use businessBrief to ground the refresh in the original campaign inputs.
  const brief = optimizerState?.businessBrief || {};
  const businessName = clean(brief.businessName || brief.brand);
  const industry = clean(brief.industry || brief.businessType || niche);
  const offer = clean(brief.offer || brief.promo);
  const mainBenefit = clean(brief.mainBenefit || brief.benefit || brief.details);
  const city = clean(brief.city);
  const ctaFromBrief = clean(brief.cta);
  const idealCustomer = clean(brief.idealCustomer);

  // Determine the refresh angle based on diagnosis and monitoring state.
  let angle = 'clarity';
  if (diagnosis === 'low_ctr' || diagnosis === 'weak_engagement') angle = 'stronger_hook';
  if (monitoringDecision === 'await_delivery_data') angle = 'soft_refresh';

  // Compose the most useful business reference available.
  const locationSuffix = city ? ` in ${city}` : '';
  const businessLabel = businessName || (industry ? `${industry} service` : '') || campaignName || 'our service';
  const benefitPhrase = mainBenefit || offer || 'quality service you can count on';
  const ctaPhrase = ctaFromBrief || 'Get a free quote today.';
  const audiencePhrase = idealCustomer ? ` for ${idealCustomer}` : '';

  let primaryText = '';

  if (angle === 'stronger_hook') {
    if (offer) {
      // Lead with the specific offer for highest relevance
      primaryText = `${offer}${locationSuffix}. ${benefitPhrase}${audiencePhrase}. ${ctaPhrase}`;
    } else if (city && businessName) {
      primaryText = `Looking for ${industry || 'reliable service'}${locationSuffix}? ${businessName} delivers ${benefitPhrase}. ${ctaPhrase}`;
    } else {
      primaryText = `${businessLabel} — ${benefitPhrase}${locationSuffix}. ${audiencePhrase ? `${audiencePhrase.trim()}. ` : ''}${ctaPhrase}`;
    }
  } else if (angle === 'soft_refresh') {
    primaryText = `Discover what makes ${businessLabel} the trusted choice${locationSuffix}. ${benefitPhrase}. ${ctaPhrase}`;
  } else {
    // clarity angle — clean, direct value statement
    primaryText = `${businessLabel}: ${benefitPhrase}${locationSuffix}. ${audiencePhrase ? `${audiencePhrase.trim()}. ` : ''}${ctaPhrase}`;
  }

  // Normalize whitespace
  primaryText = primaryText.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();

  return {
    primaryText,
    angle,
    context: {
      campaignName,
      niche,
      businessName,
      industry,
      offer,
      mainBenefit,
      city,
      impressions,
      clicks,
      ctr,
      diagnosis,
      monitoringDecision,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp_v2',
  };
}

module.exports = {
  buildUpdatedPrimaryText,
};