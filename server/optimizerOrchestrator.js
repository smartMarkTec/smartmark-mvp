'use strict';

const {
  findOptimizerCampaignStateByCampaignId,
  updateOptimizerCampaignState,
  appendAiHistoryEntry,
} = require('./optimizerCampaignState');
const {
  syncCampaignMetricsToOptimizerState,
} = require('./optimizerMetricsSync');
const { buildDiagnosisAsync } = require('./optimizerDiagnosis');
const { buildDecisionAsync } = require('./optimizerDecision');
const { executeAction } = require('./optimizerAction');
const { buildMonitoring } = require('./optimizerMonitoring');
const { shouldSkipOptimizationForCampaign } = require('./optimizerGuard');
const { buildDailyReport, shouldGenerateDailyReport } = require('./optimizerDailyReport');

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

  // Dry-run mode: diagnose and decide but skip all Facebook API actions.
  // Enable via env: SMARTEMARK_AI_OPERATOR_DRY_RUN=1
  const DRY_RUN = String(process.env.SMARTEMARK_AI_OPERATOR_DRY_RUN || '').trim() === '1';

  // Hard guard: never run a cycle on an archived or finished campaign.
  // Re-read from DB here so the check is always against the latest persisted state.
  const preCheckState = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);
  if (preCheckState) {
    const skipCheck = shouldSkipOptimizationForCampaign(preCheckState);
    if (skipCheck.skip) {
      console.log('[optimizer orchestrator] skipping archived/finished campaign:', {
        campaignId: normalizedCampaignId,
        reason: skipCheck.reason,
      });
      return {
        cycle: {
          campaignId: normalizedCampaignId,
          accountId: normalizedAccountId,
          ownerKey: normalizedOwnerKey,
          startedAt: new Date().toISOString(),
          skipped: true,
          reason: skipCheck.reason,
          finishedAt: new Date().toISOString(),
          mode: 'skipped_archived_or_finished',
          dryRun: DRY_RUN,
        },
        optimizerState: preCheckState,
      };
    }
  }

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
    mode: DRY_RUN ? 'full_cycle_v3_ai_diagnosis_dry_run' : 'full_cycle_v3_ai_diagnosis',
    dryRun: DRY_RUN,
  };

  let syncResult = null;
  try {
    syncResult = await syncCampaignMetricsToOptimizerState({
      userToken,
      campaignId: normalizedCampaignId,
      accountId: normalizedAccountId,
      ownerKey: normalizedOwnerKey,
    });

    // Reset consecutive failure counter on a successful sync.
    if (Number(preCheckState?.syncFailCount || 0) > 0) {
      updateOptimizerCampaignState(normalizedCampaignId, { syncFailCount: 0 }).catch(() => {});
    }
  } catch (syncErr) {
    // Safe log — never print config/params which may contain access_token.
    console.error('[optimizer orchestrator] metrics sync failed, continuing with cached state:', {
      campaignId: normalizedCampaignId,
      status: syncErr?.response?.status ?? null,
      metaError: syncErr?.response?.data?.error?.message ?? null,
      metaCode: syncErr?.response?.data?.error?.code ?? null,
      message: syncErr?.message || 'unknown',
    });

    // Increment consecutive failure counter so the scheduler can deprioritize/skip
    // campaigns that keep returning Meta 400s (stale/inaccessible campaigns).
    try {
      const curState = await findOptimizerCampaignStateByCampaignId(normalizedCampaignId);
      const newCount = Number(curState?.syncFailCount || 0) + 1;
      await updateOptimizerCampaignState(normalizedCampaignId, { syncFailCount: newCount });
    } catch {}
  }

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

  const action = DRY_RUN
    ? {
        actionType: 'dry_run_skipped',
        skipped: true,
        dryRun: true,
        plannedActionType: decisionBeforeAction?.actionType || 'unknown',
        reason: 'Dry-run mode active (SMARTEMARK_AI_OPERATOR_DRY_RUN=1). No Facebook API calls made.',
        generatedAt: new Date().toISOString(),
      }
    : await executeAction({ optimizerState: state, userToken });
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
  // Update state with the post-monitoring decision but do NOT add a second history entry.
  // One decision card per cycle is enough — the second call is for internal state routing only.
  await persistDecision(normalizedCampaignId, { ...decisionAfterMonitoring, _skipHistoryEntry: true });
  cycle.decisionAfterMonitoring = decisionAfterMonitoring;

  state = await safeReloadState(normalizedCampaignId, 'after post-monitoring decision');

  const firstActionType = normalizeActionType(action?.actionType);
  const secondActionType = normalizeActionType(decisionAfterMonitoring?.actionType);

  const shouldRunSecondAction =
    !isNonExecutableActionType(secondActionType) &&
    secondActionType !== firstActionType;

  if (shouldRunSecondAction) {
    const secondAction = DRY_RUN
      ? {
          actionType: 'dry_run_skipped',
          skipped: true,
          dryRun: true,
          plannedActionType: decisionAfterMonitoring?.actionType || 'unknown',
          reason: 'Dry-run mode active (SMARTEMARK_AI_OPERATOR_DRY_RUN=1). No Facebook API calls made.',
          generatedAt: new Date().toISOString(),
        }
      : await executeAction({ optimizerState: state, userToken });

    await persistAction(normalizedCampaignId, secondAction);
    cycle.secondAction = secondAction;

    state = await safeReloadState(normalizedCampaignId, 'after second action');
  }

  // Daily report: once per calendar day per campaign
  if (shouldGenerateDailyReport(state)) {
    const dailyReport = buildDailyReport(state);
    await appendAiHistoryEntry(normalizedCampaignId, dailyReport).catch(() => {});
    cycle.dailyReport = { generated: true, title: dailyReport.title };
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