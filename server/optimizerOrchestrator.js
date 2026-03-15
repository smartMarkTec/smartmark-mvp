'use strict';

const {
  findOptimizerCampaignStateByCampaignId,
} = require('./optimizerCampaignState');
const {
  syncCampaignMetricsToOptimizerState,
} = require('./optimizerMetricsSync');
const { buildDiagnosis } = require('./optimizerDiagnosis');
const { buildDecision } = require('./optimizerDecision');
const { executeAction } = require('./optimizerAction');
const { buildMonitoring } = require('./optimizerMonitoring');

async function runFullOptimizerCycle({
  campaignId,
  accountId,
  ownerKey,
  userToken,
  loadCreativesRecord,
  persistDiagnosis,
  persistDecision,
  persistAction,
  persistMonitoring,
}) {
  if (!campaignId) throw new Error('campaignId is required');
  if (!accountId) throw new Error('accountId is required');
  if (!userToken) throw new Error('userToken is required');
  if (typeof loadCreativesRecord !== 'function') {
    throw new Error('loadCreativesRecord function is required');
  }

  const cycle = {
    campaignId: String(campaignId).trim(),
    accountId: String(accountId).replace(/^act_/, '').trim(),
    ownerKey: String(ownerKey || '').trim(),
    startedAt: new Date().toISOString(),
    metricsSync: null,
    diagnosis: null,
    decisionBeforeAction: null,
    action: null,
    monitoring: null,
    decisionAfterMonitoring: null,
    finishedAt: null,
  };

  const syncResult = await syncCampaignMetricsToOptimizerState({
    userToken,
    campaignId: cycle.campaignId,
    accountId: cycle.accountId,
    ownerKey: cycle.ownerKey,
  });

  cycle.metricsSync = syncResult.snapshot;

  let state = await findOptimizerCampaignStateByCampaignId(cycle.campaignId);
  if (!state) throw new Error('Optimizer state missing after metrics sync');

  const creativesRecord = await loadCreativesRecord(cycle.campaignId, cycle.accountId);

  const diagnosis = buildDiagnosis({
    optimizerState: state,
    creativesRecord,
  });
  state = await persistDiagnosis(cycle.campaignId, diagnosis);
  cycle.diagnosis = diagnosis;

  const decisionBeforeAction = buildDecision({
    optimizerState: state,
  });
  state = await persistDecision(cycle.campaignId, decisionBeforeAction);
  cycle.decisionBeforeAction = decisionBeforeAction;

  const action = await executeAction({
    optimizerState: state,
    userToken,
  });
  state = await persistAction(cycle.campaignId, action);
  cycle.action = action;

  const monitoring = buildMonitoring({
    optimizerState: state,
  });
  state = await persistMonitoring(cycle.campaignId, monitoring);
  cycle.monitoring = monitoring;

  const refreshedState = await findOptimizerCampaignStateByCampaignId(cycle.campaignId);
  if (!refreshedState) throw new Error('Optimizer state missing after monitoring');

  const decisionAfterMonitoring = buildDecision({
    optimizerState: refreshedState,
  });
  state = await persistDecision(cycle.campaignId, decisionAfterMonitoring);
  cycle.decisionAfterMonitoring = decisionAfterMonitoring;

  cycle.finishedAt = new Date().toISOString();

  return {
    cycle,
    optimizerState: state,
  };
}

module.exports = {
  runFullOptimizerCycle,
};