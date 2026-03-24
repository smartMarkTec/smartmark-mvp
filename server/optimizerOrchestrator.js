'use strict';

const {
  findOptimizerCampaignStateByCampaignId,
} = require('./optimizerCampaignState');
const {
  syncCampaignMetricsToOptimizerState,
} = require('./optimizerMetricsSync');
const { buildDiagnosisAsync } = require('./optimizerDiagnosis');
const { buildDecisionAsync } = require('./optimizerDecision');
const { executeAction } = require('./optimizerAction');
const { buildMonitoring } = require('./optimizerMonitoring');

function normalizeActionType(value) {
  return String(value || '').trim();
}

function isNonExecutableActionType(actionType) {
  return [
    '',
    'none',
    'continue_monitoring',
    'run_diagnosis_first',
    'run_decision_first',
    'wait_for_start_time',
  ].includes(normalizeActionType(actionType));
}

async function safeReloadState(campaignId, label) {
  const state = await findOptimizerCampaignStateByCampaignId(String(campaignId || '').trim());
  if (!state) {
    throw new Error(`Optimizer state missing ${label}`);
  }
  return state;
}

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
  if (typeof persistDiagnosis !== 'function') {
    throw new Error('persistDiagnosis function is required');
  }
  if (typeof persistDecision !== 'function') {
    throw new Error('persistDecision function is required');
  }
  if (typeof persistAction !== 'function') {
    throw new Error('persistAction function is required');
  }
  if (typeof persistMonitoring !== 'function') {
    throw new Error('persistMonitoring function is required');
  }

  const normalizedCampaignId = String(campaignId).trim();
  const normalizedAccountId = String(accountId).replace(/^act_/, '').trim();
  const normalizedOwnerKey = String(ownerKey || '').trim();

  const cycle = {
    campaignId: normalizedCampaignId,
    accountId: normalizedAccountId,
    ownerKey: normalizedOwnerKey,
    startedAt: new Date().toISOString(),
    metricsSync: null,
    diagnosis: null,
    decisionBeforeAction: null,
    action: null,
    monitoring: null,
    decisionAfterMonitoring: null,
    secondAction: null,
    finishedAt: null,
    mode: 'full_cycle_v3_ai_diagnosis',
  };

  const syncResult = await syncCampaignMetricsToOptimizerState({
    userToken,
    campaignId: normalizedCampaignId,
    accountId: normalizedAccountId,
    ownerKey: normalizedOwnerKey,
  });

  cycle.metricsSync = syncResult?.snapshot || null;

  let state = await safeReloadState(normalizedCampaignId, 'after metrics sync');

  const creativesRecord = await loadCreativesRecord(
    normalizedCampaignId,
    normalizedAccountId
  );

  const diagnosis = await buildDiagnosisAsync({
    optimizerState: state,
    creativesRecord,
  });
  await persistDiagnosis(normalizedCampaignId, diagnosis);
  cycle.diagnosis = diagnosis;

  state = await safeReloadState(normalizedCampaignId, 'after diagnosis');

 const decisionBeforeAction = await buildDecisionAsync({
  optimizerState: state,
});
  await persistDecision(normalizedCampaignId, decisionBeforeAction);
  cycle.decisionBeforeAction = decisionBeforeAction;

  state = await safeReloadState(normalizedCampaignId, 'after first decision');

  const action = await executeAction({
    optimizerState: state,
    userToken,
  });
  await persistAction(normalizedCampaignId, action);
  cycle.action = action;

  state = await safeReloadState(normalizedCampaignId, 'after first action');

  const monitoring = buildMonitoring({
    optimizerState: state,
  });
  await persistMonitoring(normalizedCampaignId, monitoring);
  cycle.monitoring = monitoring;

  state = await safeReloadState(normalizedCampaignId, 'after monitoring');

 const decisionAfterMonitoring = await buildDecisionAsync({
  optimizerState: state,
});
  await persistDecision(normalizedCampaignId, decisionAfterMonitoring);
  cycle.decisionAfterMonitoring = decisionAfterMonitoring;

  state = await safeReloadState(normalizedCampaignId, 'after post-monitoring decision');

  const firstActionType = normalizeActionType(action?.actionType);
  const secondActionType = normalizeActionType(decisionAfterMonitoring?.actionType);

  const shouldRunSecondAction =
    !isNonExecutableActionType(secondActionType) &&
    secondActionType !== firstActionType;

  if (shouldRunSecondAction) {
    const secondAction = await executeAction({
      optimizerState: state,
      userToken,
    });

    await persistAction(normalizedCampaignId, secondAction);
    cycle.secondAction = secondAction;

    state = await safeReloadState(normalizedCampaignId, 'after second action');
  }

  cycle.finishedAt = new Date().toISOString();

  return {
    cycle,
    optimizerState: state,
  };
}

module.exports = {
  runFullOptimizerCycle,
};