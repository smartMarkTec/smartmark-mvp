'use strict';

const axios = require('axios');

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