'use strict';

const { runOptimizerBrainDecision } = require('./optimizerBrain');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function hasPendingGeneratedCreativeReady(optimizerState) {
  const pending = optimizerState?.pendingCreativeTest || null;
  const latestAction = optimizerState?.latestAction?.actionResult || null;

  const pendingUrls = Array.isArray(pending?.imageUrls) ? pending.imageUrls : [];
  const latestUrls = Array.isArray(latestAction?.imageUrls) ? latestAction.imageUrls : [];

  const pendingStatus = String(pending?.status || '').trim().toLowerCase();

  const promotionReady =
    pendingStatus === 'ready' ||
    latestAction?.pendingPromotionReady === true ||
    latestAction?.generationReady === true;

  return promotionReady && (pendingUrls.length > 0 || latestUrls.length > 0);
}

function hasLiveCreativeTest(optimizerState) {
  const pending = optimizerState?.pendingCreativeTest || null;
  const pendingStatus = String(pending?.status || '').trim().toLowerCase();

  const controlAdIds = Array.isArray(pending?.controlAdIds)
    ? pending.controlAdIds.filter(Boolean)
    : [];

  const candidateAdIds = Array.isArray(pending?.candidateAdIds)
    ? pending.candidateAdIds.filter(Boolean)
    : [];

  return (
    (pendingStatus === 'live' || pendingStatus === 'staged') &&
    controlAdIds.length > 0 &&
    candidateAdIds.length > 0
  );
}

// Diagnoses for which Standard tier may propose a creative/copy test.
const STANDARD_TESTABLE_DIAGNOSES = new Set([
  'low_ctr',
  'weak_engagement',
  'post_click_conversion_gap',
]);

// Hours the campaign must have been running before Standard tier can propose a test.
const STANDARD_MIN_DATA_HOURS = 48;
// Minimum impressions for Standard tier before any test is proposed.
const STANDARD_MIN_IMPRESSIONS = 500;
// Minimum spend ($) for Standard tier before any test is proposed.
const STANDARD_MIN_SPEND = 5;
// Days Standard tier must wait after a test resolves before proposing the next one.
const STANDARD_COOLDOWN_DAYS = 5;

function isStandardTier(optimizerState) {
  const raw = String(
    optimizerState?.planKey ||
    optimizerState?.subscriptionPlan ||
    optimizerState?.billing?.planKey ||
    ''
  ).trim().toLowerCase();
  return raw === 'starter' || raw === 'standard' || raw === '';
}

function standardTestGatePassed(optimizerState, diagnosis) {
  if (!isStandardTier(optimizerState)) return true; // Pro/Operator: no additional gate
  if (!STANDARD_TESTABLE_DIAGNOSES.has(diagnosis)) return false;

  const metrics = optimizerState?.metricsSnapshot || {};
  const impressions = toNumber(metrics.impressions, 0);
  const spend = toNumber(metrics.spend, 0);

  if (impressions < STANDARD_MIN_IMPRESSIONS || spend < STANDARD_MIN_SPEND) return false;

  // Check campaign age: createdAt on the optimizer state or latestAction
  const createdAt = String(optimizerState?.createdAt || '').trim();
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    if (ageHours < STANDARD_MIN_DATA_HOURS) return false;
  }

  return true;
}

function standardCooldownActive(optimizerState) {
  if (!isStandardTier(optimizerState)) return false;

  // Look for the most recent resolved test in latestAction
  const latestAction = optimizerState?.latestAction || null;
  const actionType = String(latestAction?.actionType || '').trim();
  const resolvedAt = String(
    latestAction?.resolvedAt || latestAction?.completedAt || latestAction?.generatedAt || ''
  ).trim();

  const isResolvedTest =
    actionType === 'pause_losing_creative_variant' ||
    actionType === 'declare_creative_winner';

  if (!isResolvedTest || !resolvedAt) return false;

  const cooldownMs = STANDARD_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(resolvedAt).getTime() < cooldownMs;
}

function buildFallbackDecision({ optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  const spend = toNumber(metrics.spend, 0);
  const impressions = toNumber(metrics.impressions, 0);
  const linkClicks = toNumber(
    metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
    0
  );
  const conversions = toNumber(metrics.conversions, 0);
  const ctr = toNumber(metrics.ctr, 0);
  const frequency = toNumber(metrics.frequency, 0);
  const pendingCreativeReady = hasPendingGeneratedCreativeReady(optimizerState);
  const liveCreativeTest = hasLiveCreativeTest(optimizerState);

  if (latestMonitoringDecision) {
    const monitoringDecision = String(
      latestMonitoringDecision.monitoringDecision || ''
    ).trim();

    if (monitoringDecision === 'delivery_blocked') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'restore_delivery',
        actionType: 'unpause_campaign',
        priority: 'high',
        reason:
          'Monitoring indicates delivery is blocked by campaign status, so Smartemark should focus on restoring delivery before changing messaging or creative.',
        requiresHumanApproval: true,
        confidence: 0.98,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
        },
        generatedAt: new Date().toISOString(),
        mode: 'fallback_rule_based_v1',
      };
    }

    if (
      monitoringDecision === 'wait_for_post_refresh_signal' ||
      monitoringDecision === 'monitor_post_copy_refresh' ||
      monitoringDecision === 'watch_copy_refresh_result' ||
      monitoringDecision === 'continue_monitoring_after_copy_refresh'
    ) {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'hold_after_copy_refresh',
        actionType: 'continue_monitoring',
        priority: 'medium',
        reason:
          'Smartemark recently refreshed copy and should wait for fresh post-refresh signal before making another mutation.',
        requiresHumanApproval: true,
        confidence: 0.97,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          latestActionType: String(latestAction?.actionType || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
          ctr,
        },
        generatedAt: new Date().toISOString(),
        mode: 'fallback_rule_based_v1',
      };
    }

    if (monitoringDecision === 'watch_post_delivery_restore') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'hold_after_delivery_restore',
        actionType: 'continue_monitoring',
        priority: 'medium',
        reason:
          'Delivery was just restored, so Smartemark should collect new delivery signal before deciding on messaging or creative changes.',
        requiresHumanApproval: true,
        confidence: 0.95,
        supportingContext: {
          monitoringDecision,
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          spend,
          impressions,
          linkClicks,
          conversions,
        },
        generatedAt: new Date().toISOString(),
        mode: 'fallback_rule_based_v1',
      };
    }
  }

  if (pendingCreativeReady) {
    return {
      campaignId: String(optimizerState?.campaignId || '').trim(),
      decision: 'promote_generated_creatives',
      actionType: 'promote_generated_creative_variants',
      priority: 'high',
      reason:
        'Smartemark already has generated creative variants ready, so the next move is to promote them into Meta challenger ads for testing.',
      requiresHumanApproval: true,
      confidence: 0.93,
      actionMeta: {
        challengerStatus: 'ACTIVE',
        creativeGoal: 'launch_ab_creative_test',
      },
      supportingContext: {
        diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
        spend,
        impressions,
        linkClicks,
        conversions,
        ctr,
        frequency,
      },
      generatedAt: new Date().toISOString(),
      mode: 'fallback_rule_based_v1',
    };
  }

  if (liveCreativeTest && latestMonitoringDecision) {
    const monitoringDecision = String(
      latestMonitoringDecision.monitoringDecision || ''
    ).trim();

    const pending = optimizerState?.pendingCreativeTest || null;
    const controlAdIds = Array.isArray(pending?.controlAdIds)
      ? pending.controlAdIds.filter(Boolean).map((v) => String(v).trim())
      : [];
    const candidateAdIds = Array.isArray(pending?.candidateAdIds)
      ? pending.candidateAdIds.filter(Boolean).map((v) => String(v).trim())
      : [];

    if (monitoringDecision === 'creative_test_challenger_underperforming') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'resolve_creative_test_keep_control',
        actionType: 'pause_losing_creative_variant',
        priority: 'high',
        reason:
          'The live creative test suggests the challenger is underperforming, so Smartemark should keep the control ad live and pause the losing challenger ads.',
        requiresHumanApproval: true,
        confidence: 0.86,
        actionMeta: {
          winnerAdId: controlAdIds[0] || '',
          loserAdIds: candidateAdIds,
        },
        supportingContext: {
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          monitoringDecision,
          spend,
          impressions,
          linkClicks,
          conversions,
          ctr,
          frequency,
          controlAdIds,
          candidateAdIds,
        },
        generatedAt: new Date().toISOString(),
        mode: 'fallback_rule_based_v1',
      };
    }

    if (monitoringDecision === 'creative_test_has_promising_signal') {
      return {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'resolve_creative_test_keep_challenger',
        actionType: 'pause_losing_creative_variant',
        priority: 'high',
        reason:
          'The live creative test shows promising challenger signal, so Smartemark should keep the challenger live and pause the losing control ad.',
        requiresHumanApproval: true,
        confidence: 0.8,
        actionMeta: {
          winnerAdId: candidateAdIds[0] || '',
          loserAdIds: controlAdIds,
        },
        supportingContext: {
          diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
          monitoringDecision,
          spend,
          impressions,
          linkClicks,
          conversions,
          ctr,
          frequency,
          controlAdIds,
          candidateAdIds,
        },
        generatedAt: new Date().toISOString(),
        mode: 'fallback_rule_based_v1',
      };
    }
  }

  if (!latestDiagnosis) {
    return {
      campaignId: String(optimizerState?.campaignId || '').trim(),
      decision: 'insufficient_context',
      actionType: 'run_diagnosis_first',
      priority: 'high',
      reason: 'No diagnosis exists yet, so Smartemark should diagnose before making an optimization decision.',
      requiresHumanApproval: true,
      confidence: 0.99,
      supportingContext: {
        diagnosis: '',
        spend,
        impressions,
        linkClicks,
        conversions,
      },
      generatedAt: new Date().toISOString(),
      mode: 'fallback_rule_based_v1',
    };
  }

  const diagnosis = String(latestDiagnosis.diagnosis || '').trim();
  const recommendedAction = String(latestDiagnosis.recommendedAction || '').trim();
  const lastActionType = String(latestAction?.actionType || '').trim();
  const lastActionStatus = String(latestAction?.status || '').trim();

  let decision = 'hold_and_monitor';
  let actionType = 'continue_monitoring';
  let priority = 'medium';
  let reason = 'The campaign should continue gathering signal before a stronger move.';
  let requiresHumanApproval = true;
  let confidence = 0.72;

  if (diagnosis === 'scheduled_not_started') {
    decision = 'wait_for_start_window';
    actionType = 'continue_monitoring';
    priority = 'medium';
    reason =
      'The campaign appears scheduled for a future start window, so Smartemark should wait rather than intervene.';
    confidence = 0.98;
  } else if (diagnosis === 'billing_blocked') {
    decision = 'resolve_billing_block';
    actionType = 'continue_monitoring';
    priority = 'high';
    reason =
      'Billing appears to be preventing delivery, so Smartemark should avoid optimization changes until payment issues are resolved.';
    confidence = 0.99;
  } else if (diagnosis === 'no_delivery') {
    decision = 'investigate_delivery';
    actionType = 'check_delivery_status';
    priority = 'high';
    reason =
      'The campaign is not producing impressions or spend, so the next move should be delivery inspection rather than creative optimization.';
    confidence = 0.96;
  } else if (diagnosis === 'insufficient_data') {
    decision = 'hold_and_monitor';
    actionType = 'continue_monitoring';
    priority = 'medium';
    reason =
      'Delivery has started, but signal is still too light for a reliable optimization move.';
    confidence = 0.9;
  } else if (diagnosis === 'weak_engagement') {
    if (!standardTestGatePassed(optimizerState, diagnosis) || standardCooldownActive(optimizerState)) {
      decision = 'hold_and_monitor';
      actionType = 'continue_monitoring';
      priority = 'medium';
      reason =
        'Engagement is low, but not enough data has accumulated yet for a confident test — the system will continue watching and flag the right moment.';
      confidence = 0.82;
    } else {
      decision = 'launch_creative_test';
      actionType = isStandardTier(optimizerState)
        ? 'generate_single_creative_variant'
        : 'generate_two_creative_variants';
      priority = 'high';
      reason =
        'The campaign is getting delivery without strong click response, so Smartemark should test a fresh creative angle instead of only rewriting copy again.';
      confidence = 0.88;
    }
  } else if (
    diagnosis === 'low_ctr' ||
    recommendedAction === 'update_primary_text'
  ) {
    if (lastActionType === 'update_primary_text' && lastActionStatus === 'completed') {
      decision = 'hold_after_copy_refresh';
      actionType = 'continue_monitoring';
      priority = 'medium';
      reason =
        'Copy refresh already happened, so Smartemark should wait for new CTR signal before making another change.';
      confidence = 0.96;
    } else if (!standardTestGatePassed(optimizerState, 'low_ctr') || standardCooldownActive(optimizerState)) {
      decision = 'hold_and_monitor';
      actionType = 'continue_monitoring';
      priority = 'medium';
      reason =
        'CTR is on the lower side, but the system needs more data before suggesting a change — watching for a clearer pattern before acting.';
      confidence = 0.8;
    } else {
      decision = 'refresh_copy';
      actionType = 'update_primary_text';
      priority = 'high';
      reason =
        'CTR is weak after meaningful delivery, so the next best move is to refresh primary text and improve click-through response.';
      confidence = 0.89;
    }
  } else if (diagnosis === 'post_click_conversion_gap') {
    if (!standardTestGatePassed(optimizerState, diagnosis) || standardCooldownActive(optimizerState)) {
      decision = 'hold_and_monitor';
      actionType = 'continue_monitoring';
      priority = 'medium';
      reason =
        'Clicks are coming in but conversions are still light — the system is gathering more data before proposing a landing page or offer angle test.';
      confidence = 0.78;
    } else {
      decision = 'adjust_angle';
      actionType = 'generate_single_creative_variant';
      priority = 'high';
      reason =
        'Users are clicking but not converting, so Smartemark should test a sharper creative/offer angle next.';
      confidence = 0.82;
    }
  } else if (diagnosis === 'creative_fatigue_risk') {
    decision = 'prepare_refresh';
    actionType = 'generate_two_creative_variants';
    priority = 'high';
    reason =
      'Performance suggests growing fatigue, so Smartemark should prepare two fresh creative variants for controlled A/B testing.';
    confidence = 0.84;
  } else if (diagnosis === 'high_cpc') {
    if (frequency >= 2.2 || impressions >= 800) {
      decision = 'test_two_creative_angles';
      actionType = 'generate_two_creative_variants';
      priority = 'medium';
      reason =
        'Traffic is coming in inefficiently and delivery is meaningful enough to justify testing two fresh creative directions.';
      confidence = 0.79;
    } else {
      decision = 'test_single_creative_angle';
      actionType = 'generate_single_creative_variant';
      priority = 'medium';
      reason =
        'Traffic is coming in inefficiently, so Smartemark should test one stronger creative angle next.';
      confidence = 0.76;
    }
  } else if (diagnosis === 'healthy_early_signal') {
    decision = 'hold_and_monitor';
    actionType = 'continue_monitoring';
    priority = 'low';
    reason =
      'The campaign is showing acceptable early response, so Smartemark should continue monitoring instead of changing it too quickly.';
    confidence = 0.8;
  }

  return {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    decision,
    actionType,
    priority,
    reason,
    requiresHumanApproval,
    confidence,
    supportingContext: {
      diagnosis,
      recommendedAction,
      lastActionType,
      lastActionStatus,
      spend,
      impressions,
      linkClicks,
      conversions,
      ctr,
      frequency,
    },
    generatedAt: new Date().toISOString(),
    mode: 'fallback_rule_based_v1',
  };
}

function attachDecisionContext({ base, optimizerState }) {
  const latestDiagnosis = optimizerState?.latestDiagnosis || null;
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;
  const latestAction = optimizerState?.latestAction || null;
  const metrics = optimizerState?.metricsSnapshot || {};

  return {
    ...base,
    campaignId: String(optimizerState?.campaignId || '').trim(),
    supportingContext: {
      diagnosis: String(latestDiagnosis?.diagnosis || '').trim(),
      recommendedAction: String(latestDiagnosis?.recommendedAction || '').trim(),
      lastActionType: String(latestAction?.actionType || '').trim(),
      lastActionStatus: String(latestAction?.status || '').trim(),
      monitoringDecision: String(
        latestMonitoringDecision?.monitoringDecision || ''
      ).trim(),
      spend: toNumber(metrics.spend, 0),
      impressions: toNumber(metrics.impressions, 0),
      linkClicks: toNumber(
        metrics.linkClicks != null ? metrics.linkClicks : metrics.uniqueClicks,
        0
      ),
      conversions: toNumber(metrics.conversions, 0),
      ctr: toNumber(metrics.ctr, 0),
      frequency: toNumber(metrics.frequency, 0),
    },
  };
}

function buildDecision({ optimizerState }) {
  return buildFallbackDecision({ optimizerState });
}

async function buildDecisionAsync({ optimizerState }) {
  const pendingCreativeReady = hasPendingGeneratedCreativeReady(optimizerState);
  const liveCreativeTest = hasLiveCreativeTest(optimizerState);
  const latestMonitoringDecision = optimizerState?.latestMonitoringDecision || null;

  if (pendingCreativeReady) {
    return attachDecisionContext({
      base: {
        campaignId: String(optimizerState?.campaignId || '').trim(),
        decision: 'promote_generated_creatives',
        actionType: 'promote_generated_creative_variants',
        priority: 'high',
        reason:
          'Smartemark already has generated creative variants ready, so the next move is to promote them into Meta challenger ads for testing.',
        requiresHumanApproval: true,
        confidence: 0.95,
        actionMeta: {
          challengerStatus: 'ACTIVE',
          creativeGoal: 'launch_ab_creative_test',
        },
        generatedAt: new Date().toISOString(),
        mode: 'state_priority_v1',
      },
      optimizerState,
    });
  }

  if (liveCreativeTest) {
    const monitoringDecision = String(
      latestMonitoringDecision?.monitoringDecision || ''
    ).trim();

    const pending = optimizerState?.pendingCreativeTest || null;
    const controlAdIds = Array.isArray(pending?.controlAdIds)
      ? pending.controlAdIds.filter(Boolean).map((v) => String(v).trim())
      : [];
    const candidateAdIds = Array.isArray(pending?.candidateAdIds)
      ? pending.candidateAdIds.filter(Boolean).map((v) => String(v).trim())
      : [];

    if (monitoringDecision === 'creative_test_challenger_underperforming') {
      return attachDecisionContext({
        base: {
          campaignId: String(optimizerState?.campaignId || '').trim(),
          decision: 'resolve_creative_test_keep_control',
          actionType: 'pause_losing_creative_variant',
          priority: 'high',
          reason:
            'The live creative test suggests the challenger is underperforming, so Smartemark should keep the control ad live and pause the losing challenger ads.',
          requiresHumanApproval: true,
          confidence: 0.86,
          actionMeta: {
            winnerAdId: controlAdIds[0] || '',
            loserAdIds: candidateAdIds,
          },
          generatedAt: new Date().toISOString(),
          mode: 'state_priority_v2',
        },
        optimizerState,
      });
    }

    if (monitoringDecision === 'creative_test_has_promising_signal') {
      return attachDecisionContext({
        base: {
          campaignId: String(optimizerState?.campaignId || '').trim(),
          decision: 'resolve_creative_test_keep_challenger',
          actionType: 'pause_losing_creative_variant',
          priority: 'high',
          reason:
            'The live creative test shows promising challenger signal, so Smartemark should keep the challenger live and pause the losing control ad.',
          requiresHumanApproval: true,
          confidence: 0.8,
          actionMeta: {
            winnerAdId: candidateAdIds[0] || '',
            loserAdIds: controlAdIds,
          },
          generatedAt: new Date().toISOString(),
          mode: 'state_priority_v2',
        },
        optimizerState,
      });
    }

    if (monitoringDecision === 'creative_test_force_resolution') {
      const keepControl = controlAdIds[0] || '';
      const keepChallenger = candidateAdIds[0] || '';

      const winnerAdId = keepChallenger || keepControl || '';
      const loserAdIds = winnerAdId
        ? [...controlAdIds, ...candidateAdIds].filter((id) => id !== winnerAdId)
        : [];

      return attachDecisionContext({
        base: {
          campaignId: String(optimizerState?.campaignId || '').trim(),
          decision: keepChallenger
            ? 'force_resolve_keep_best_challenger'
            : 'force_resolve_keep_control',
          actionType: 'pause_losing_creative_variant',
          priority: 'high',
          reason:
            'The creative test has been open long enough or has enough signal that Smartemark should stop waiting, keep one winner, and pause the remaining loser ads.',
          requiresHumanApproval: true,
          confidence: 0.88,
          actionMeta: {
            winnerAdId,
            loserAdIds,
          },
          generatedAt: new Date().toISOString(),
          mode: 'state_priority_v2',
        },
        optimizerState,
      });
    }
  }

  try {
    const aiDecision = await runOptimizerBrainDecision({
      optimizerState,
    });

    if (aiDecision && typeof aiDecision === 'object') {
      return attachDecisionContext({
        base: aiDecision,
        optimizerState,
      });
    }
  } catch (err) {
    console.warn('[optimizer decision] ai brain failed, using fallback:', err?.message || err);
  }

  return buildFallbackDecision({ optimizerState });
}
module.exports = {
  buildDecision,
  buildDecisionAsync,
};