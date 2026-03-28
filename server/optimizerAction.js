'use strict';

const axios = require('axios');
const { buildUpdatedPrimaryText } = require('./optimizerCopy');

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v18.0';

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeActionType(value) {
  return String(value || '').trim();
}

function getInternalApiBase() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com'
  ).replace(/\/+$/, '');
}

function getGraphBase() {
  return `https://graph.facebook.com/${GRAPH_VERSION}`;
}

function shouldBlockMutationForManualOverride(actionType) {
  return [
    'unpause_campaign',
    'update_primary_text',
    'update_headline',
    'duplicate_ad',
    'prepare_fresh_creative_variant',
    'generate_single_creative_variant',
    'generate_two_creative_variants',
    'test_new_audience_or_creative',
    'test_offer_or_audience_angle',
    'test_new_primary_text_or_headline',
    'promote_generated_creative_variants',
    'launch_generated_creative_test',
    'pause_losing_creative_variant',
    'declare_creative_winner',
  ].includes(normalizeActionType(actionType));
}

function buildBaseSkippedResult({
  campaignId,
  actionType,
  status,
  reason,
  extra = {},
}) {
  return {
    campaignId,
    executed: false,
    status,
    actionType: normalizeActionType(actionType) || 'none',
    reason,
    generatedAt: new Date().toISOString(),
    mode: 'ai_directed_marketer_v1',
    ...extra,
  };
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function dedupeStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((v) => String(v || '').trim()).filter(Boolean))];
}

function getActionConfig(optimizerState) {
  const latestDecision = optimizerState?.latestDecision || null;

  return (
    latestDecision?.actionConfig ||
    latestDecision?.actionMeta ||
    latestDecision?.actionPayload ||
    latestDecision?.executionPlan ||
    {}
  );
}
function getPendingGeneratedCreativeState(optimizerState) {
  const latestAction = optimizerState?.latestAction?.actionResult || null;
  const statePending = optimizerState?.pendingCreativeTest || null;

  const stateUrls = Array.isArray(statePending?.imageUrls) ? statePending.imageUrls : [];
  const actionUrls = Array.isArray(latestAction?.imageUrls) ? latestAction.imageUrls : [];
  const actionSourceUrls = Array.isArray(latestAction?.sourceGeneratedCreatives)
    ? latestAction.sourceGeneratedCreatives
    : [];

  const urls = dedupeStrings([...stateUrls, ...actionUrls, ...actionSourceUrls]);

  if (!urls.length && !statePending && !latestAction) return null;

  return {
    creativeGoal:
      String(statePending?.creativeGoal || latestAction?.creativeGoal || '').trim() ||
      'launch_ab_creative_test',
    generationReason:
      String(statePending?.generationReason || latestAction?.generationReason || '').trim(),
    imageUrls: urls,
    generationPrompt:
      String(statePending?.generationPrompt || latestAction?.generationPrompt || '').trim(),
    generatorResponse:
      statePending?.generatorResponse || latestAction?.generatorResponse || null,
    generatedVariantCount: safeNumber(
      statePending?.generatedVariantCount || latestAction?.generatedVariantCount || urls.length,
      urls.length
    ),
    status: String(
      statePending?.status ||
      latestAction?.pendingCreativeTest?.status ||
      latestAction?.promotionStatus ||
      ''
    ).trim(),
    startedAt: String(
      statePending?.startedAt ||
      statePending?.generatedAt ||
      latestAction?.testStartedAt ||
      latestAction?.generatedAt ||
      ''
    ).trim(),
    controlAdIds: dedupeStrings(statePending?.controlAdIds || latestAction?.controlAdIds || []),
    candidateAdIds: dedupeStrings(statePending?.candidateAdIds || latestAction?.candidateAdIds || []),
    launchedVariantCount: safeNumber(
      statePending?.launchedVariantCount || latestAction?.launchedVariantCount || 0,
      0
    ),
    winnerAdId: String(statePending?.winnerAdId || latestAction?.winnerAdId || '').trim(),
    winnerType: String(statePending?.winnerType || latestAction?.winnerType || '').trim(),
  };
}

function hoursSinceIso(iso) {
  const ts = new Date(String(iso || '').trim()).getTime();
  if (!Number.isFinite(ts)) return Infinity;
  return Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
}

function getCreativeTestGuard(optimizerState) {
  const pending = optimizerState?.pendingCreativeTest || null;
  const pendingState = getPendingGeneratedCreativeState(optimizerState);
  const latestMonitoringDecision = String(
    optimizerState?.latestMonitoringDecision?.monitoringDecision || ''
  ).trim();

  const status = String(
    pending?.status || pendingState?.status || ''
  ).trim().toLowerCase();

  const candidateAdIds = dedupeStrings(
    []
      .concat(pending?.candidateAdIds || [])
      .concat(pendingState?.candidateAdIds || [])
  );

  const controlAdIds = dedupeStrings(
    []
      .concat(pending?.controlAdIds || [])
      .concat(pendingState?.controlAdIds || [])
  );

  const imageUrls = dedupeStrings(
    []
      .concat(pending?.imageUrls || [])
      .concat(pendingState?.imageUrls || [])
  );

  const unresolvedLiveLike =
    ['ready', 'live', 'staged'].includes(status) &&
    latestMonitoringDecision !== 'creative_test_resolved';

  const startedAt = String(
    pending?.startedAt ||
    pending?.generatedAt ||
    pendingState?.startedAt ||
    optimizerState?.latestAction?.generatedAt ||
    ''
  ).trim();

  const hoursOpen = hoursSinceIso(startedAt);

  return {
    status,
    unresolvedLiveLike,
    candidateAdIds,
    controlAdIds,
    imageUrls,
    startedAt,
    hoursOpen,
    hasWinner: !!String(pending?.winnerAdId || pendingState?.winnerAdId || '').trim(),
  };
}

function shouldBlockNewCreativeRound(optimizerState, minCreativeTestHours = 72) {
  const guard = getCreativeTestGuard(optimizerState);

  if (!guard.unresolvedLiveLike) {
    return { blocked: false, reason: '', guard };
  }

  if (guard.hoursOpen < minCreativeTestHours) {
    return {
      blocked: true,
      reason:
        `A creative test is already ${guard.status || 'active'} and has only been open for ${guard.hoursOpen.toFixed(1)} hours. Smartemark should observe the current test before generating another challenger round.`,
      guard,
    };
  }

  return {
    blocked: true,
    reason:
      `A prior creative test is still unresolved (${guard.status || 'active'}). Smartemark should resolve or retire it before opening a new challenger round.`,
    guard,
  };
}

async function fetchCampaignStatus({ campaignId, userToken }) {
  const response = await axios.get(`${getGraphBase()}/${campaignId}`, {
    params: {
      access_token: userToken,
      fields: 'id,name,status,effective_status,configured_status,objective,start_time',
    },
  });

  const campaign = response.data || {};

  return {
    id: String(campaign.id || '').trim(),
    name: String(campaign.name || '').trim(),
    status: String(campaign.status || '').trim(),
    effectiveStatus: String(campaign.effective_status || '').trim(),
    configuredStatus: String(campaign.configured_status || '').trim(),
    objective: String(campaign.objective || '').trim(),
    startTime: String(campaign.start_time || '').trim(),
  };
}

function buildCreativeGenerationPlan({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
  const decision = String(latestDecision?.decision || '').trim();
  const ctr = Number(metrics?.ctr || 0);
  const frequency = Number(metrics?.frequency || 0);
  const impressions = Number(metrics?.impressions || 0);

  let variantCount = 1;
  let reason =
    'Smartemark wants a fresh creative direction, but a single replacement concept is enough for the next step.';
  let creativeGoal = 'refresh_visual_hook';

  if (
    diagnosis === 'creative_fatigue_risk' ||
    decision === 'prepare_refresh' ||
    (frequency >= 2.5 && impressions >= 800)
  ) {
    variantCount = 2;
    creativeGoal = 'launch_ab_creative_test';
    reason =
      'Smartemark sees signs of fatigue or unclear creative strength, so two fresh variants should be generated for controlled testing.';
  } else if (
    diagnosis === 'weak_engagement' ||
    diagnosis === 'high_cpc' ||
    decision === 'improve_efficiency'
  ) {
    variantCount = 2;
    creativeGoal = 'test_two_fresh_angles';
    reason =
      'Smartemark wants to test two different visual directions because response quality is weak enough to justify creative comparison.';
  } else if (diagnosis === 'low_ctr' && ctr < 0.9) {
    variantCount = 1;
    creativeGoal = 'support_copy_refresh_with_new_visual';
    reason =
      'Low CTR is present, but Smartemark can start with one stronger replacement visual before escalating to a broader A/B test.';
  }

  return {
    variantCount,
    creativeGoal,
    reason,
  };
}

function inferBusinessContext(optimizerState) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  const currentCopy =
    String(latestAction?.actionResult?.updatedPrimaryText || '').trim() ||
    String(latestAction?.actionResult?.previousPrimaryText || '').trim() ||
    String(optimizerState?.latestCreativeMeta?.body || '').trim() ||
    '';

  const campaignName = String(optimizerState?.campaignName || '').trim() || 'Smartemark Campaign';
  const niche = String(optimizerState?.niche || '').trim();

  return {
    campaignName,
    niche,
    diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
    decision: String(latestDecision?.decision || '').trim(),
    currentCopy,
    ctr: Number(metrics?.ctr || 0),
    impressions: Number(metrics?.impressions || 0),
    clicks: Number(metrics?.clicks || 0),
    spend: Number(metrics?.spend || 0),
    frequency: Number(metrics?.frequency || 0),
  };
}

function buildCreativePromptContext({ optimizerState, variantCount, creativeGoal }) {
  const ctx = inferBusinessContext(optimizerState);

  const businessType = ctx.niche || 'local business';
  const hookDirection =
    creativeGoal === 'launch_ab_creative_test'
      ? 'Create distinct visual angles that feel different enough for an A/B test.'
      : creativeGoal === 'test_two_fresh_angles'
      ? 'Create stronger, clearer ad concepts with sharper visual hooks.'
      : creativeGoal === 'support_copy_refresh_with_new_visual'
      ? 'Create a cleaner, more compelling visual that supports the refreshed ad copy.'
      : 'Create a stronger visual hook for performance improvement.';

  const prompt = [
    `Business type: ${businessType}.`,
    `Campaign name: ${ctx.campaignName}.`,
    `Diagnosis: ${ctx.diagnosis || 'performance improvement needed'}.`,
    `Decision: ${ctx.decision || 'refresh creative'}.`,
    ctx.currentCopy ? `Current ad copy: ${ctx.currentCopy}` : '',
    `Goal: ${creativeGoal}.`,
    hookDirection,
    `Generate ${variantCount} static ad creative ${variantCount === 1 ? 'concept' : 'concepts'} suitable for Meta ads.`,
    'Make the image clean, modern, attention-grabbing, and conversion-oriented.',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    prompt,
    businessType,
  };
}

async function fetchCampaignAds({ campaignId, userToken, limit = 50 }) {
  const res = await axios.get(`${getGraphBase()}/${campaignId}/ads`, {
    params: {
      access_token: userToken,
      fields: [
        'id',
        'name',
        'status',
        'effective_status',
        'adset_id',
        'campaign_id',
        'tracking_specs',
        'creative{id,name,object_story_spec,effective_object_story_id}',
      ].join(','),
      limit,
    },
  });

  return Array.isArray(res.data?.data) ? res.data.data : [];
}

function pickControlAd(ads) {
  const candidates = (Array.isArray(ads) ? ads : []).filter(
    (ad) =>
      ad &&
      ad.id &&
      ad.adset_id &&
      ad.creative &&
      ad.creative.id &&
      ad.creative.object_story_spec &&
      (
        ad.creative.object_story_spec.link_data ||
        ad.creative.object_story_spec.photo_data
      )
  );

  const nonAiChallengers = candidates.filter((ad) => {
    const name = String(ad?.name || '').toLowerCase();
    return !name.includes('ai challenger');
  });

  const basePool = nonAiChallengers.length ? nonAiChallengers : candidates;

  const active = basePool.find((ad) =>
    ['ACTIVE'].includes(normalizeStatus(ad.effective_status || ad.status))
  );

  return active || basePool[0] || null;
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function getDestinationLink(objectStorySpec) {
  const linkData = objectStorySpec?.link_data || null;
  if (linkData?.link) return String(linkData.link).trim();
  return '';
}

function buildChallengerObjectStorySpec({ controlAd, imageHash, imageUrl, variantLabel }) {
  const baseSpec = clone(controlAd?.creative?.object_story_spec || {});
  if (!baseSpec || typeof baseSpec !== 'object') {
    throw new Error('Control ad is missing object_story_spec');
  }

  if (baseSpec.link_data) {
    const linkData = baseSpec.link_data || {};
    return {
      ...baseSpec,
      link_data: {
        ...linkData,
        image_hash: imageHash,
      },
    };
  }

  if (baseSpec.photo_data) {
    const photoData = baseSpec.photo_data || {};
    const link = String(photoData.link || '').trim() || getDestinationLink(baseSpec);

    return {
      ...baseSpec,
      photo_data: {
        ...photoData,
        image_hash: imageHash,
        ...(link ? { link } : {}),
        ...(photoData.caption ? { caption: photoData.caption } : {}),
      },
    };
  }

  throw new Error(
    `Unsupported control ad story spec for promotion. Variant ${variantLabel} needs link_data or photo_data.`
  );
}

async function downloadImageAsBase64(url) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: 25 * 1024 * 1024,
  });

  const contentType = String(res.headers?.['content-type'] || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    throw new Error(`Generated asset is not an image: ${url}`);
  }

  return Buffer.from(res.data).toString('base64');
}

async function uploadAdImage({ accountId, userToken, imageUrl, variantLabel }) {
  const bytes = await downloadImageAsBase64(imageUrl);

  const payload = {
    bytes,
    name: `smartemark_${variantLabel}_${Date.now()}`,
  };

  const res = await axios.post(`${getGraphBase()}/act_${accountId}/adimages`, payload, {
    params: { access_token: userToken },
    timeout: 120000,
    maxBodyLength: 30 * 1024 * 1024,
  });

  const images = res.data?.images || {};
  const firstImage = Object.values(images)[0] || {};
  const imageHash = String(firstImage.hash || '').trim();

  if (!imageHash) {
    throw new Error(`Meta image upload did not return an image hash for ${variantLabel}`);
  }

  return {
    imageHash,
    uploadResponse: res.data || null,
  };
}

async function createAdCreativeFromVariant({
  accountId,
  userToken,
  controlAd,
  imageHash,
  imageUrl,
  variantIndex,
  variantLabel,
  aiDecisionSummary,
}) {
  const objectStorySpec = buildChallengerObjectStorySpec({
    controlAd,
    imageHash,
    imageUrl,
    variantLabel,
  });

  const creativeName = [
    'Smartemark AI Challenger',
    variantLabel,
    aiDecisionSummary ? `- ${aiDecisionSummary}` : '',
    new Date().toISOString(),
  ]
    .filter(Boolean)
    .join(' ');

  const payload = {
    name: creativeName.slice(0, 255),
    object_story_spec: JSON.stringify(objectStorySpec),
  };

  const res = await axios.post(`${getGraphBase()}/act_${accountId}/adcreatives`, payload, {
    params: { access_token: userToken },
  });

  const creativeId = String(res.data?.id || '').trim();
  if (!creativeId) {
    throw new Error(`Meta did not return a creative id for ${variantLabel}`);
  }

  return {
    creativeId,
    objectStorySpec,
    creativeCreateResponse: res.data || null,
  };
}

async function createChallengerAd({
  accountId,
  userToken,
  controlAd,
  creativeId,
  variantLabel,
  launchStatus,
}) {
  const payload = {
    name: `${String(controlAd?.name || 'Smartemark Control').trim()} | AI Challenger ${variantLabel}`.slice(0, 255),
    adset_id: String(controlAd?.adset_id || '').trim(),
    creative: JSON.stringify({ creative_id: creativeId }),
    status: launchStatus,
  };

  if (!payload.adset_id) {
    throw new Error(`Control ad missing adset_id for ${variantLabel}`);
  }

  const res = await axios.post(`${getGraphBase()}/act_${accountId}/ads`, payload, {
    params: { access_token: userToken },
  });

  const adId = String(res.data?.id || '').trim();
  if (!adId) {
    throw new Error(`Meta did not return an ad id for ${variantLabel}`);
  }

  return {
    adId,
    adCreateResponse: res.data || null,
  };
}

async function executePrimaryTextRefresh({
  optimizerState,
  userToken,
}) {
  const campaignId = String(optimizerState.campaignId || '').trim();
  const accountId = String(optimizerState.accountId || '').replace(/^act_/, '').trim();

  const copyResult = buildUpdatedPrimaryText({
    optimizerState,
    latestDiagnosis: optimizerState.latestDiagnosis || null,
    latestMonitoringDecision: optimizerState.latestMonitoringDecision || null,
  });

  const ads = await fetchCampaignAds({ campaignId, userToken, limit: 20 });
  const ad = ads.find(
    (item) =>
      item &&
      item.id &&
      item.creative &&
      item.creative.id &&
      item.creative.object_story_spec &&
      item.creative.object_story_spec.link_data
  );

  if (!ad) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'update_primary_text',
      status: 'no_editable_ad_found',
      reason:
        'No editable ad with object_story_spec.link_data was found for primary text refresh.',
    });
  }

  const creative = ad.creative || {};
  const objectStorySpec = creative.object_story_spec || {};
  const linkData = objectStorySpec.link_data || {};
  const previousPrimaryText = String(linkData.message || '').trim();

  const newObjectStorySpec = {
    ...objectStorySpec,
    link_data: {
      ...linkData,
      message: copyResult.primaryText,
    },
  };

  const creativeCreateRes = await axios.post(
    `${getGraphBase()}/act_${accountId}/adcreatives`,
    {
      name: `Smartemark Copy Refresh ${new Date().toISOString()}`,
      object_story_spec: JSON.stringify(newObjectStorySpec),
    },
    {
      params: {
        access_token: userToken,
      },
    }
  );

  const newCreativeId = String(creativeCreateRes.data?.id || '').trim();

  if (!newCreativeId) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'update_primary_text',
      status: 'creative_create_failed',
      reason: 'Meta did not return a new creative id for the primary text refresh.',
      extra: {
        actionResult: {
          adId: String(ad.id || '').trim(),
          previousCreativeId: String(creative.id || '').trim(),
          attemptedPrimaryText: copyResult.primaryText,
        },
      },
    });
  }

  const adUpdateRes = await axios.post(
    `${getGraphBase()}/${ad.id}`,
    {
      creative: JSON.stringify({ creative_id: newCreativeId }),
    },
    {
      params: {
        access_token: userToken,
      },
    }
  );

  return {
    campaignId,
    executed: true,
    status: 'completed',
    actionType: 'update_primary_text',
    actionResult: {
      mutationType: 'update_primary_text',
      adId: String(ad.id || '').trim(),
      adName: String(ad.name || '').trim(),
      previousCreativeId: String(creative.id || '').trim(),
      newCreativeId,
      previousPrimaryText,
      updatedPrimaryText: copyResult.primaryText,
      angle: copyResult.angle,
      context: copyResult.context,
      creativeCreateResponse: creativeCreateRes.data || null,
      adUpdateResponse: adUpdateRes.data || null,
    },
    reason:
      'Created a replacement ad creative with refreshed primary text and updated the ad to use it.',
    generatedAt: new Date().toISOString(),
    mode: 'ai_directed_marketer_v1',
  };
}

async function executeCreativeGeneration({
  optimizerState,
  actionType,
}) {
  const campaignId = String(optimizerState?.campaignId || '').trim();
  const plan = buildCreativeGenerationPlan({ optimizerState });
  const actionConfig = getActionConfig(optimizerState);

  const minCreativeTestHours =
    safeNumber(
      actionConfig?.minCreativeTestHours,
      safeNumber(process.env.SMARTEMARK_MIN_CREATIVE_TEST_HOURS, 72)
    ) || 72;

  const guardCheck = shouldBlockNewCreativeRound(optimizerState, minCreativeTestHours);

  if (guardCheck.blocked) {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'blocked_by_active_creative_test',
      reason: guardCheck.reason,
      extra: {
        actionResult: {
          mutationType: 'generate_creative_variants',
          guard: {
            status: guardCheck.guard.status,
            hoursOpen: guardCheck.guard.hoursOpen,
            candidateAdIds: guardCheck.guard.candidateAdIds,
            controlAdIds: guardCheck.guard.controlAdIds,
            imageUrls: guardCheck.guard.imageUrls,
            startedAt: guardCheck.guard.startedAt,
            minCreativeTestHours,
          },
        },
      },
    });
  }

  const variantCount =
    safeNumber(actionConfig?.variantCount, 0) > 0
      ? safeNumber(actionConfig.variantCount, 0)
      : actionType === 'generate_two_creative_variants'
      ? 2
      : actionType === 'generate_single_creative_variant'
      ? 1
      : plan.variantCount;

  const creativeGoal =
    String(actionConfig?.creativeGoal || '').trim() || plan.creativeGoal;

  const { prompt, businessType } = buildCreativePromptContext({
    optimizerState,
    variantCount,
    creativeGoal,
  });

  const apiBase = getInternalApiBase();

  const requestBody = {
    prompt,
    businessType,
    styleTemplate: String(actionConfig?.styleTemplate || 'poster_b').trim(),
    count: variantCount,
  };

  const response = await axios.post(
    `${apiBase}/api/generate-static-ad`,
    requestBody,
    {
      timeout: 120000,
      maxBodyLength: 20 * 1024 * 1024,
      maxContentLength: 20 * 1024 * 1024,
    }
  );

  const data = response.data || {};
  const imageUrls = Array.isArray(data?.imageUrls)
    ? data.imageUrls.filter(Boolean).slice(0, variantCount)
    : Array.isArray(data?.imageVariants)
    ? data.imageVariants.filter(Boolean).slice(0, variantCount)
    : [];

  if (!imageUrls.length) {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'creative_generation_failed',
      reason:
        'Smartemark called the image generation pipeline, but no image URLs were returned.',
      extra: {
        actionResult: {
          generationReady: true,
          creativeGoal,
          requestedVariantCount: variantCount,
          requestBody,
          rawResponse: data,
        },
      },
    });
  }

  return {
    campaignId,
    executed: true,
    status: 'completed',
    actionType,
    actionResult: {
      mutationType: 'generate_creative_variants',
      generationReady: true,
      pendingPromotionReady: true,
      creativeGoal,
      generationReason: plan.reason,
      requestedVariantCount: variantCount,
      generatedVariantCount: imageUrls.length,
      imageUrls,
      generationPrompt: prompt,
      generatorResponse: data,
      promotionIntent:
        String(actionConfig?.promotionIntent || '').trim() || 'launch_generated_creative_test',
      nextSystemRequirement:
        'Generated variants are ready for AI-driven Meta promotion into challenger ads.',
    },
    reason:
      imageUrls.length >= 2
        ? 'Generated fresh creative variants for AI-directed challenger testing.'
        : 'Generated one fresh replacement creative variant.',
    generatedAt: new Date().toISOString(),
    mode: 'ai_directed_marketer_v1',
  };
}

async function executeCreativePromotion({
  optimizerState,
  userToken,
}) {
  const campaignId = String(optimizerState?.campaignId || '').trim();
  const accountId = String(optimizerState?.accountId || '').replace(/^act_/, '').trim();
  const actionConfig = getActionConfig(optimizerState);
  const pending = getPendingGeneratedCreativeState(optimizerState);

  const minCreativeTestHours =
    safeNumber(
      actionConfig?.minCreativeTestHours,
      safeNumber(process.env.SMARTEMARK_MIN_CREATIVE_TEST_HOURS, 72)
    ) || 72;

  const guard = getCreativeTestGuard(optimizerState);

  if (
    guard.unresolvedLiveLike &&
    (
      guard.candidateAdIds.length > 0 ||
      (['live', 'staged'].includes(guard.status) && guard.controlAdIds.length > 0)
    )
  ) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'promote_generated_creative_variants',
      status: 'blocked_by_existing_creative_test',
      reason:
        `A creative test is already ${guard.status || 'active'}. Smartemark must monitor or resolve the current test before promoting another creative round.`,
      extra: {
        actionResult: {
          mutationType: 'promote_generated_creative_variants',
          guard: {
            status: guard.status,
            hoursOpen: guard.hoursOpen,
            candidateAdIds: guard.candidateAdIds,
            controlAdIds: guard.controlAdIds,
            imageUrls: guard.imageUrls,
            startedAt: guard.startedAt,
            minCreativeTestHours,
          },
        },
      },
    });
  }

  if (!accountId) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'promote_generated_creative_variants',
      status: 'missing_account_id',
      reason: 'Optimizer state is missing accountId, so Meta promotion cannot run.',
    });
  }

  if (!pending?.imageUrls?.length) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'promote_generated_creative_variants',
      status: 'no_generated_variants_available',
      reason:
        'There are no generated creative variants ready to promote into Meta challenger ads.',
      extra: {
        actionResult: {
          mutationType: 'promote_generated_creative_variants',
          guard: {
            status: guard.status,
            candidateAdIds: guard.candidateAdIds,
            controlAdIds: guard.controlAdIds,
            imageUrls: guard.imageUrls,
          },
        },
      },
    });
  }

  const campaign = await fetchCampaignStatus({ campaignId, userToken });
  const ads = await fetchCampaignAds({ campaignId, userToken, limit: 50 });
  const controlAd = pickControlAd(ads);

  if (!controlAd) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'promote_generated_creative_variants',
      status: 'no_control_ad_found',
      reason:
        'Smartemark could not find a control ad with a reusable object_story_spec for challenger promotion.',
      extra: {
          actionResult: {
            campaign,
            scannedAdCount: ads.length,
          },
      },
    });
  }

  const desiredLiveStatus = normalizeStatus(
    actionConfig?.challengerStatus ||
    actionConfig?.launchStatus ||
    (safeNumber(actionConfig?.activateImmediately, 0) ? 'ACTIVE' : 'PAUSED') ||
    'PAUSED'
  );

  const launchStatus = desiredLiveStatus === 'ACTIVE' ? 'ACTIVE' : 'PAUSED';
  const aiDecisionSummary = String(
    optimizerState?.latestDecision?.decision || optimizerState?.latestDiagnosis?.diagnosis || ''
  ).trim();

  const variantResults = [];
  const errors = [];

  for (let i = 0; i < pending.imageUrls.length; i += 1) {
    const imageUrl = String(pending.imageUrls[i] || '').trim();
    if (!imageUrl) continue;

    const variantIndex = i + 1;
    const variantLabel = `v${variantIndex}`;

    try {
      const upload = await uploadAdImage({
        accountId,
        userToken,
        imageUrl,
        variantLabel,
      });

      const creative = await createAdCreativeFromVariant({
        accountId,
        userToken,
        controlAd,
        imageHash: upload.imageHash,
        imageUrl,
        variantIndex,
        variantLabel,
        aiDecisionSummary,
      });

      const ad = await createChallengerAd({
        accountId,
        userToken,
        controlAd,
        creativeId: creative.creativeId,
        variantLabel,
        launchStatus,
      });

      variantResults.push({
        variantIndex,
        variantLabel,
        sourceImageUrl: imageUrl,
        imageHash: upload.imageHash,
        creativeId: creative.creativeId,
        adId: ad.adId,
        status: launchStatus,
        uploadResponse: upload.uploadResponse,
        creativeCreateResponse: creative.creativeCreateResponse,
        adCreateResponse: ad.adCreateResponse,
      });
    } catch (err) {
      errors.push({
        variantIndex,
        variantLabel,
        sourceImageUrl: imageUrl,
        error: err?.response?.data || err?.message || String(err),
      });
    }
  }

  if (!variantResults.length) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'promote_generated_creative_variants',
      status: 'promotion_failed',
      reason:
        'Smartemark attempted to promote generated variants, but none were successfully created as Meta challenger ads.',
      extra: {
        actionResult: {
          mutationType: 'promote_generated_creative_variants',
          campaign,
          controlAdId: String(controlAd?.id || '').trim(),
          attemptedVariantCount: pending.imageUrls.length,
          errors,
        },
      },
    });
  }

  const controlAdIds = dedupeStrings([String(controlAd.id || '').trim()]);
  const candidateAdIds = dedupeStrings(variantResults.map((v) => v.adId));
  const creativeIds = dedupeStrings(variantResults.map((v) => v.creativeId));
  const imageHashes = dedupeStrings(variantResults.map((v) => v.imageHash));

  return {
    campaignId,
    executed: true,
    status: errors.length ? 'completed_with_partial_errors' : 'completed',
    actionType: 'promote_generated_creative_variants',
    actionResult: {
      mutationType: 'promote_generated_creative_variants',
      livePromotionReady: true,
      promotionStatus: launchStatus === 'ACTIVE' ? 'live' : 'staged',
      creativeGoal: pending.creativeGoal,
      generationReason: pending.generationReason,
      generationPrompt: pending.generationPrompt,
      campaign,
      controlAd: {
        id: String(controlAd?.id || '').trim(),
        name: String(controlAd?.name || '').trim(),
        adsetId: String(controlAd?.adset_id || '').trim(),
        creativeId: String(controlAd?.creative?.id || '').trim(),
        effectiveStatus: String(controlAd?.effective_status || controlAd?.status || '').trim(),
      },
      controlAdIds,
      candidateAdIds,
      metaCreativeIds: creativeIds,
      metaImageHashes: imageHashes,
      sourceGeneratedCreatives: pending.imageUrls,
      variants: variantResults,
      errors,
      testStartedAt: new Date().toISOString(),
      pendingCreativeTest: {
        status: launchStatus === 'ACTIVE' ? 'live' : 'staged',
        creativeGoal: pending.creativeGoal,
        generationReason: pending.generationReason,
        generatedVariantCount: pending.generatedVariantCount,
        imageUrls: pending.imageUrls,
        controlAdIds,
        candidateAdIds,
        metaCreativeIds: creativeIds,
        metaImageHashes: imageHashes,
        launchedVariantCount: variantResults.length,
        launchStatus,
        startedAt: new Date().toISOString(),
      },
    },
    reason:
      launchStatus === 'ACTIVE'
        ? 'Promoted AI-generated creative variants into live Meta challenger ads.'
        : 'Promoted AI-generated creative variants into staged Meta challenger ads ready for activation.',
    generatedAt: new Date().toISOString(),
    mode: 'ai_directed_marketer_v1',
  };
}

async function executePauseLosingCreativeVariant({
  optimizerState,
  userToken,
}) {
  const campaignId = String(optimizerState?.campaignId || '').trim();
  const actionConfig = getActionConfig(optimizerState);
  const pendingCreativeTest = optimizerState?.pendingCreativeTest || null;

  const controlAdIds = Array.isArray(pendingCreativeTest?.controlAdIds)
    ? pendingCreativeTest.controlAdIds.filter(Boolean).map((v) => String(v).trim())
    : [];

  const candidateAdIds = Array.isArray(pendingCreativeTest?.candidateAdIds)
    ? pendingCreativeTest.candidateAdIds.filter(Boolean).map((v) => String(v).trim())
    : [];

  const allKnownAdIds = dedupeStrings([...controlAdIds, ...candidateAdIds]);

  const explicitLoserAdIds = dedupeStrings(
    []
      .concat(actionConfig?.loserAdIds || [])
      .concat(actionConfig?.pauseAdIds || [])
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );

  const explicitWinnerAdId = String(
    actionConfig?.winnerAdId ||
    actionConfig?.winningAdId ||
    actionConfig?.keepAdId ||
    ''
  ).trim();

  let loserAdIds = explicitLoserAdIds;

  if (!loserAdIds.length && explicitWinnerAdId) {
    loserAdIds = allKnownAdIds.filter((id) => id !== explicitWinnerAdId);
  }

  if (!loserAdIds.length) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'pause_losing_creative_variant',
      status: 'missing_loser_selection',
      reason:
        'Smartemark did not receive loser ad ids or a winner ad id, so it cannot safely resolve the creative test yet.',
      extra: {
        actionResult: {
          mutationType: 'pause_losing_creative_variant',
          controlAdIds,
          candidateAdIds,
          knownAdIds: allKnownAdIds,
        },
      },
    });
  }

  const pauseResults = [];
  const errors = [];

  for (const adId of loserAdIds) {
    try {
      const writeRes = await axios.post(
        `${getGraphBase()}/${adId}`,
        { status: 'PAUSED' },
        {
          params: {
            access_token: userToken,
          },
        }
      );

      pauseResults.push({
        adId,
        paused: true,
        writeResponse: writeRes.data || null,
      });
    } catch (err) {
      errors.push({
        adId,
        error: err?.response?.data || err?.message || String(err),
      });
    }
  }

  if (!pauseResults.length) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'pause_losing_creative_variant',
      status: 'pause_failed',
      reason:
        'Smartemark attempted to pause the losing creative variants, but none of the pause mutations succeeded.',
      extra: {
        actionResult: {
          mutationType: 'pause_losing_creative_variant',
          loserAdIds,
          winnerAdId: explicitWinnerAdId || null,
          errors,
        },
      },
    });
  }

  const survivingCandidateAdIds = candidateAdIds.filter((id) => !loserAdIds.includes(id));
  const survivingControlAdIds = controlAdIds.filter((id) => !loserAdIds.includes(id));

  const resolvedWinnerAdId =
    explicitWinnerAdId ||
    survivingCandidateAdIds[0] ||
    survivingControlAdIds[0] ||
    '';

  const winnerType = controlAdIds.includes(resolvedWinnerAdId)
    ? 'control'
    : candidateAdIds.includes(resolvedWinnerAdId)
    ? 'challenger'
    : '';

  return {
    campaignId,
    executed: true,
    status: errors.length ? 'completed_with_partial_errors' : 'completed',
    actionType: 'pause_losing_creative_variant',
    actionResult: {
      mutationType: 'pause_losing_creative_variant',
      pausedLoserAdIds: loserAdIds,
      winnerAdId: resolvedWinnerAdId || null,
      winnerType: winnerType || null,
      controlAdIds,
      candidateAdIds,
      survivingControlAdIds,
      survivingCandidateAdIds,
      pauseResults,
      errors,
      resolvedAt: new Date().toISOString(),
      pendingCreativeTest: {
        ...(pendingCreativeTest || {}),
        status: 'resolved',
        winnerAdId: resolvedWinnerAdId || null,
        winnerType: winnerType || null,
        pausedLoserAdIds: loserAdIds,
        resolvedAt: new Date().toISOString(),
      },
    },
    reason:
      resolvedWinnerAdId
        ? 'Paused the losing creative variant(s) and resolved the live creative test.'
        : 'Paused the selected losing creative variant(s).',
    generatedAt: new Date().toISOString(),
    mode: 'ai_directed_marketer_v1',
  };
}

async function executeAction({
  optimizerState,
  userToken,
}) {
  if (!optimizerState || typeof optimizerState !== 'object') {
    throw new Error('optimizerState is required');
  }

  if (!userToken) {
    throw new Error('userToken is required');
  }

  const campaignId = String(optimizerState.campaignId || '').trim();
  const latestDecision = optimizerState?.latestDecision || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;

  const manualOverride = !!optimizerState.manualOverride;
  const manualOverrideType = String(optimizerState.manualOverrideType || '').trim();

  if (!campaignId) {
    throw new Error('campaignId is required on optimizerState');
  }

  if (!latestDecision) {
    return buildBaseSkippedResult({
      campaignId,
      actionType: 'none',
      status: 'skipped',
      reason: 'No latestDecision exists yet.',
    });
  }

  const actionType = normalizeActionType(latestDecision.actionType);
  const monitoringDecision = String(
    latestMonitoringDecision?.monitoringDecision || ''
  ).trim();

  if (manualOverride && shouldBlockMutationForManualOverride(actionType)) {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'blocked_by_manual_override',
      reason:
        'Campaign mutation was blocked because the user manually overrode campaign state.',
      extra: {
        actionResult: {
          manualOverride: true,
          manualOverrideType,
        },
      },
    });
  }

  if (actionType === 'continue_monitoring') {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'monitoring_only',
      reason:
        'Current decision is to continue monitoring because the campaign does not yet justify a mutation.',
    });
  }

  if (actionType === 'wait_for_start_time') {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'waiting_for_start_time',
      reason:
        'Campaign appears scheduled for a future start time, so no mutation should be executed yet.',
    });
  }

  if (actionType === 'check_delivery_status') {
    const campaign = await fetchCampaignStatus({ campaignId, userToken });

    return {
      campaignId,
      executed: true,
      status: 'completed',
      actionType,
      actionResult: {
        inspectionType: 'campaign_status_check',
        campaign,
      },
      reason:
        'Checked campaign delivery status from Meta before attempting optimization changes.',
      generatedAt: new Date().toISOString(),
      mode: 'ai_directed_marketer_v1',
    };
  }

  if (actionType === 'unpause_campaign') {
    const currentCampaign = await fetchCampaignStatus({ campaignId, userToken });
    const effective = normalizeStatus(
      currentCampaign.effectiveStatus || currentCampaign.status
    );

    if (effective === 'ACTIVE') {
      return buildBaseSkippedResult({
        campaignId,
        actionType,
        status: 'already_active',
        reason: 'Campaign is already active, so no unpause mutation was needed.',
        extra: {
          actionResult: {
            mutationType: 'campaign_unpause',
            campaign: currentCampaign,
          },
        },
      });
    }

    const writeRes = await axios.post(
      `${getGraphBase()}/${campaignId}`,
      { status: 'ACTIVE' },
      { params: { access_token: userToken } }
    );

    const verifiedCampaign = await fetchCampaignStatus({ campaignId, userToken });

    return {
      campaignId,
      executed: true,
      status: 'completed',
      actionType,
      actionResult: {
        mutationType: 'campaign_unpause',
        writeResponse: writeRes.data || null,
        campaign: verifiedCampaign,
      },
      reason:
        'Campaign was unpaused because delivery conditions indicated status-based blockage.',
      generatedAt: new Date().toISOString(),
      mode: 'ai_directed_marketer_v1',
    };
  }

  if (
    actionType === 'update_primary_text' ||
    actionType === 'test_new_primary_text_or_headline'
  ) {
    return await executePrimaryTextRefresh({
      optimizerState,
      userToken,
    });
  }

  if (
    actionType === 'prepare_fresh_creative_variant' ||
    actionType === 'generate_single_creative_variant' ||
    actionType === 'generate_two_creative_variants' ||
    actionType === 'test_new_audience_or_creative' ||
    actionType === 'test_offer_or_audience_angle'
  ) {
    return await executeCreativeGeneration({
      optimizerState,
      actionType,
    });
  }

  if (
    actionType === 'promote_generated_creative_variants' ||
    actionType === 'launch_generated_creative_test'
  ) {
    return await executeCreativePromotion({
      optimizerState,
      userToken,
    });
  }

  if (
    actionType === 'pause_losing_creative_variant' ||
    actionType === 'declare_creative_winner'
  ) {
    return await executePauseLosingCreativeVariant({
      optimizerState,
      userToken,
    });
  }

  if (monitoringDecision === 'delivery_blocked') {
    return buildBaseSkippedResult({
      campaignId,
      actionType,
      status: 'ready_for_followup_action',
      reason:
        'Monitoring indicates delivery is blocked. The next recommended executable action is unpause_campaign when appropriate.',
    });
  }

  return buildBaseSkippedResult({
    campaignId,
    actionType,
    status: 'not_implemented',
    reason: `Action type "${actionType}" is not implemented yet in the action executor.`,
  });
}

module.exports = {
  executeAction,
};