'use strict';

function buildUpdatedPrimaryText({ optimizerState = {}, latestDiagnosis = null, latestMonitoringDecision = null }) {
  const campaignName = String(optimizerState?.campaignName || '').trim();
  const niche = String(optimizerState?.niche || '').trim();
  const metrics = optimizerState?.metricsSnapshot || {};

  const impressions = Number(metrics.impressions || 0);
  const clicks = Number(metrics.clicks || 0);
  const ctr = Number(metrics.ctr || 0);

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const monitoringDecision = String(latestMonitoringDecision?.monitoringDecision || '').trim();

  // Pull grounding context from businessBrief if available — keeps the refresh
  // anchored to the original campaign intent rather than generic copy.
  const brief = optimizerState?.businessBrief || null;
  const businessName = String(brief?.businessName || '').trim();
  const offer = String(brief?.offer || '').trim();
  const originalHeadline = String(brief?.originalHeadline || '').trim();

  let angle = 'clarity';
  if (diagnosis === 'low_ctr') angle = 'stronger_hook';
  if (monitoringDecision === 'await_delivery_data') angle = 'soft_refresh';

  // Use the most specific label available: offer > businessName > niche > campaignName
  const businessLabel = offer || businessName || niche || campaignName || 'this offer';

  let primaryText = '';

  if (angle === 'stronger_hook') {
    if (originalHeadline) {
      primaryText = `Still considering it? ${businessLabel} — see why more people are choosing us. Get started today.`;
    } else {
      primaryText = `Still thinking about ${businessLabel}? See why people are choosing us for quality, convenience, and results. Get started today.`;
    }
  } else if (angle === 'soft_refresh') {
    primaryText = `Discover what makes ${businessLabel} worth trying. Simple, reliable, and built to deliver real value.`;
  } else {
    primaryText = `Looking for a better option for ${businessLabel}? We make it simple to get started and see results fast.`;
  }

  return {
    primaryText,
    angle,
    context: {
      campaignName,
      niche,
      businessName,
      offer,
      impressions,
      clicks,
      ctr,
      diagnosis,
      monitoringDecision,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

module.exports = {
  buildUpdatedPrimaryText,
};