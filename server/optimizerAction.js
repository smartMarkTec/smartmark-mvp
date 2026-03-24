'use strict';

const axios = require('axios');
const { buildUpdatedPrimaryText } = require('./optimizerCopy');

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeActionType(value) {
  return String(value || '').trim();
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
    mode: 'rule_based_mvp_v3',
    ...extra,
  };
}

async function fetchCampaignStatus({ campaignId, userToken }) {
  const response = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}`, {
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

  const adsRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/ads`, {
    params: {
      access_token: userToken,
      fields: 'id,name,creative{id,name,object_story_spec,effective_object_story_id}',
      limit: 10,
    },
  });

  const ads = Array.isArray(adsRes.data?.data) ? adsRes.data.data : [];
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
    `https://graph.facebook.com/v18.0/act_${accountId}/adcreatives`,
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
    `https://graph.facebook.com/v18.0/${ad.id}`,
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
    mode: 'rule_based_mvp_v3',
  };
}

function buildCreativeGenerationCapacityResult({
  optimizerState,
  actionType,
}) {
  const campaignId = String(optimizerState?.campaignId || '').trim();
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestDecision = optimizerState?.latestDecision || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;

  const plan = buildCreativeGenerationPlan({ optimizerState });

  const forcedVariantCount =
    actionType === 'generate_two_creative_variants'
      ? 2
      : actionType === 'generate_single_creative_variant'
      ? 1
      : plan.variantCount;

  return buildBaseSkippedResult({
    campaignId,
    actionType,
    status: 'creative_generation_ready_not_executed',
    reason:
      'Smartemark identified that fresh creatives should be generated, and the action layer now has the capacity to request this next.',
    extra: {
      actionResult: {
        productionSafeNow: false,
        generationReady: true,
        variantCount: forcedVariantCount,
        creativeGoal: plan.creativeGoal,
        generationReason: plan.reason,
        diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
        decision: String(latestDecision?.decision || '').trim(),
        monitoringDecision: String(
          latestMonitoringDecision?.monitoringDecision || ''
        ).trim(),
        nextSystemRequirement:
          'Wire this action into FormPage/image generation pipeline so AI can request 1 or 2 fresh variants dynamically.',
      },
    },
  });
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
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;

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
  const diagnosis = String(latestDiagnosis?.diagnosis || '').trim();
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
      mode: 'rule_based_mvp_v3',
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
      `https://graph.facebook.com/v18.0/${campaignId}`,
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
      mode: 'rule_based_mvp_v3',
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
    return buildCreativeGenerationCapacityResult({
      optimizerState,
      actionType,
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
    reason: `Action type "${actionType}" is not implemented yet in the MVP action executor.`,
  });
}

module.exports = {
  executeAction,
};