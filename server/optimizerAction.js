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

  if (actionType === 'unpause_campaign') {
    const writeRes = await axios.post(
      `https://graph.facebook.com/v18.0/${campaignId}`,
      { status: 'ACTIVE' },
      { params: { access_token: userToken } }
    );

    if (manualOverride && actionType === 'unpause_campaign') {
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