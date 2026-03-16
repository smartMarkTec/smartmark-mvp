'use strict';

const axios = require('axios');
const { buildUpdatedPrimaryText } = require('./optimizerCopy');

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
const latestDecision = optimizerState.latestDecision || null;
const latestMonitoringDecision = optimizerState.latestMonitoringDecision || null;
const manualOverride = !!optimizerState.manualOverride;
const manualOverrideType = String(optimizerState.manualOverrideType || '').trim();

  if (!campaignId) {
    throw new Error('campaignId is required on optimizerState');
  }

  if (!latestDecision) {
    return {
      campaignId,
      executed: false,
      actionType: 'none',
      status: 'skipped',
      reason: 'No latestDecision exists yet.',
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  const actionType = String(latestDecision.actionType || '').trim();

    if (
    manualOverride &&
    ['unpause_campaign', 'update_primary_text', 'update_headline', 'duplicate_ad'].includes(actionType)
  ) {
    return {
      campaignId,
      executed: false,
      status: 'blocked_by_manual_override',
      actionType,
      reason:
        'Campaign mutation was blocked because the user manually overrode campaign state.',
      actionResult: {
        manualOverride: true,
        manualOverrideType,
      },
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  if (actionType === 'check_delivery_status') {
    const response = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}`, {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,configured_status,objective,start_time',
      },
    });

    const campaign = response.data || {};

    return {
      campaignId,
      executed: true,
      status: 'completed',
      actionType,
      actionResult: {
        inspectionType: 'campaign_status_check',
        campaign: {
          id: String(campaign.id || '').trim(),
          name: String(campaign.name || '').trim(),
          status: String(campaign.status || '').trim(),
          effectiveStatus: String(campaign.effective_status || '').trim(),
          configuredStatus: String(campaign.configured_status || '').trim(),
          objective: String(campaign.objective || '').trim(),
          startTime: String(campaign.start_time || '').trim(),
        },
      },
      reason:
        'Checked campaign delivery status from Meta before attempting optimization changes.',
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  if (actionType === 'update_primary_text') {
    const copyResult = buildUpdatedPrimaryText({
      optimizerState,
      latestDiagnosis: optimizerState.latestDiagnosis || null,
      latestMonitoringDecision: optimizerState.latestMonitoringDecision || null,
    });

    const adsRes = await axios.get(
      `https://graph.facebook.com/v18.0/${campaignId}/ads`,
      {
        params: {
          access_token: userToken,
          fields: 'id,name,creative{id,name,object_story_spec,effective_object_story_id}',
          limit: 10,
        },
      }
    );

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
      return {
        campaignId,
        executed: false,
        status: 'no_editable_ad_found',
        actionType,
        reason:
          'No ad with editable object_story_spec.link_data was found for primary text mutation.',
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp',
      };
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

    const newCreativePayload = {
      name: `Smartemark Copy Refresh ${new Date().toISOString()}`,
      object_story_spec: JSON.stringify(newObjectStorySpec),
    };

    const creativeCreateRes = await axios.post(
      `https://graph.facebook.com/v18.0/act_${optimizerState.accountId}/adcreatives`,
      newCreativePayload,
      {
        params: {
          access_token: userToken,
        },
      }
    );

    const newCreativeId = String(creativeCreateRes.data?.id || '').trim();

    if (!newCreativeId) {
      return {
        campaignId,
        executed: false,
        status: 'creative_create_failed',
        actionType,
        reason: 'Meta did not return a new creative id for the primary text refresh.',
        actionResult: {
          adId: String(ad.id || '').trim(),
          previousCreativeId: String(creative.id || '').trim(),
          attemptedPrimaryText: copyResult.primaryText,
        },
        generatedAt: new Date().toISOString(),
        mode: 'rule_based_mvp',
      };
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
      actionType,
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
      mode: 'rule_based_mvp',
    };
  }

  if (actionType === 'unpause_campaign') {
    const writeRes = await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ACTIVE' },
      { params: { access_token: userToken } }
    );


    const verifyRes = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}`, {
      params: {
        access_token: userToken,
        fields: 'id,name,status,effective_status,configured_status,objective,start_time',
      },
    });

    const campaign = verifyRes.data || {};

    return {
      campaignId,
      executed: true,
      status: 'completed',
      actionType,
      actionResult: {
        mutationType: 'campaign_unpause',
        writeResponse: writeRes.data || null,
        campaign: {
          id: String(campaign.id || '').trim(),
          name: String(campaign.name || '').trim(),
          status: String(campaign.status || '').trim(),
          effectiveStatus: String(campaign.effective_status || '').trim(),
          configuredStatus: String(campaign.configured_status || '').trim(),
          objective: String(campaign.objective || '').trim(),
          startTime: String(campaign.start_time || '').trim(),
        },
      },
      reason:
        'Campaign was unpaused because monitoring identified delivery as blocked by paused status.',
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  if (
    latestMonitoringDecision &&
    String(latestMonitoringDecision.monitoringDecision || '').trim() === 'delivery_blocked'
  ) {
    return {
      campaignId,
      executed: false,
      status: 'ready_for_followup_action',
      actionType,
      reason:
        'Monitoring indicates delivery is blocked. The next recommended mutation is to set decision/actionType to "unpause_campaign".',
      generatedAt: new Date().toISOString(),
      mode: 'rule_based_mvp',
    };
  }

  return {
    campaignId,
    executed: false,
    status: 'not_implemented',
    actionType,
    reason: `Action type "${actionType}" is not implemented yet in the MVP action executor.`,
    generatedAt: new Date().toISOString(),
    mode: 'rule_based_mvp',
  };
}

module.exports = {
  executeAction,
};