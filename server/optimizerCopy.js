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

  const brief = optimizerState?.businessBrief || {};
  // businessContext holds raw onboarding form answers and is always saved at launch.
  // Use it as a fallback so campaigns launched before the businessBrief field-name
  // fixes were applied still get grounded copy without needing a re-launch.
  const ctx = optimizerState?.businessContext || {};

  const businessName = clean(brief.businessName || brief.brand || ctx.businessName);
  // brief.industry is the canonical key (added in the fix); brief.niche is the legacy key.
  const industry = clean(
    brief.industry || brief.businessType || brief.niche ||
    ctx.industry || ctx.businessType || niche
  );
  const offer = clean(brief.offer || brief.promo || ctx.offer);
  const mainBenefit = clean(
    brief.mainBenefit || brief.benefit || brief.details ||
    ctx.mainBenefit || ctx.benefit
  );
  const city = clean(brief.city || ctx.city);
  // brief.cta is the canonical key (added in the fix); brief.ctaStyle is the legacy key.
  const ctaFromBrief = clean(
    brief.cta || brief.ctaStyle ||
    ctx.cta || ctx.ctaStyle
  );
  const idealCustomer = clean(brief.idealCustomer || ctx.idealCustomer);
  // brief.originalPrimaryText is the canonical key; brief.originalBody is the legacy key.
  const originalBody = clean(
    brief.originalPrimaryText || brief.originalBody ||
    ctx.body || ctx.primaryText || ctx.adBody
  );

  // Safety guard: require at least businessName, industry, or originalBody.
  // Without one of these, the generator has no campaign context and produces
  // generic off-brand copy with no relation to the actual campaign.
  const hasUsableContext = !!(businessName || industry || originalBody);
  if (!hasUsableContext) {
    return {
      primaryText: null,
      angle: 'needs_context',
      needsContext: true,
      context: { campaignName, niche, impressions, clicks, ctr, diagnosis },
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp_v2',
    };
  }

  // Determine the refresh angle based on performance signals.
  let angle = 'clarity';
  if (diagnosis === 'low_ctr' || diagnosis === 'weak_engagement') angle = 'stronger_hook';
  if (monitoringDecision === 'await_delivery_data') angle = 'soft_refresh';

  const locationSuffix = city ? ` in ${city}` : '';
  const audienceNote = idealCustomer ? ` Ideal for ${idealCustomer}.` : '';
  const businessLabel = businessName || (industry ? `This ${industry.toLowerCase()} service` : '') || campaignName || 'this service';
  const benefitPhrase = mainBenefit || offer || null;

  // Resolve CTA: prefer the explicit brief/context value; fall back to extracting
  // the last short sentence of the original body (often the CTA line).
  let resolvedCta = ctaFromBrief;
  if (!resolvedCta && originalBody) {
    const sentences = originalBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    const last = sentences[sentences.length - 1] || '';
    if (last.length >= 5 && last.length <= 80) {
      resolvedCta = last;
    }
  }

  const ctaSuffix = resolvedCta ? ` ${resolvedCta}` : '';

  let primaryText = '';

  if (angle === 'stronger_hook') {
    // Lead with the core value proposition — benefit-first drives engagement.
    if (benefitPhrase && businessName) {
      primaryText = `${benefitPhrase}. ${businessName} makes it simple${locationSuffix}.${audienceNote}${ctaSuffix}`;
    } else if (businessName && industry) {
      primaryText = `The smarter way to handle ${industry.toLowerCase()}${locationSuffix}? ${businessName}.${audienceNote}${ctaSuffix}`;
    } else if (businessName) {
      primaryText = `${businessName} handles it for you${locationSuffix}.${audienceNote}${ctaSuffix}`;
    } else if (originalBody) {
      // Extract the first two sentences of the original as the challenger hook.
      const sentences = originalBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      primaryText = sentences.slice(0, 2).join(' ') + ctaSuffix;
    }
  } else if (angle === 'soft_refresh') {
    // Softer discovery angle — good when there is not yet enough data to act on.
    if (businessName) {
      primaryText = `Discover what ${businessName} can do for your business${locationSuffix}.${benefitPhrase ? ` ${benefitPhrase}.` : ''}${audienceNote}${ctaSuffix}`;
    } else if (originalBody) {
      const sentences = originalBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      primaryText = 'Discover more. ' + sentences.slice(0, 2).join(' ') + ctaSuffix;
    }
  } else {
    // clarity angle — clean, direct, grounded in original campaign positioning.
    if (businessName && benefitPhrase) {
      primaryText = `${businessName}: ${benefitPhrase}${locationSuffix}.${audienceNote}${ctaSuffix}`;
    } else if (businessName && industry) {
      primaryText = `${businessName} — your ${industry.toLowerCase()} solution${locationSuffix}.${audienceNote}${ctaSuffix}`;
    } else if (originalBody) {
      // Use the first two sentences of the original body as-is; append the CTA if missing.
      const sentences = originalBody.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
      const core = sentences.slice(0, 2).join(' ');
      primaryText = core + (resolvedCta && !core.includes(resolvedCta) ? ctaSuffix : '');
    } else {
      primaryText = `${businessLabel}${locationSuffix}.${audienceNote}${ctaSuffix}`;
    }
  }

  // Last-resort safety: if still empty, signal missing context rather than generating garbage.
  if (!primaryText) {
    return {
      primaryText: null,
      angle: 'needs_context',
      needsContext: true,
      context: { campaignName, niche, businessName, industry, impressions, clicks, ctr, diagnosis },
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp_v2',
    };
  }

  // Normalize whitespace and punctuation.
  primaryText = primaryText.replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();

  return {
    primaryText,
    angle,
    needsContext: false,
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
      originalBody,
    },
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp_v2',
  };
}

module.exports = {
  buildUpdatedPrimaryText,
};
