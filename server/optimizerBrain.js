'use strict';

const OpenAI = require('openai');

const MODEL = process.env.OPTIMIZER_BRAIN_MODEL || 'gpt-4.1-mini';

function getClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is missing');
  }
  return new OpenAI({ apiKey });
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function clampConfidence(value, fallback = 0.75) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function normalizeAllowedValue(value, allowed, fallback) {
  const s = String(value || '').trim();
  return allowed.includes(s) ? s : fallback;
}

async function runOptimizerBrainDiagnosis({
  optimizerState,
  creativesRecord = null,
}) {
  const client = getClient();

  const allowedDiagnoses = [
    'billing_blocked',
    'scheduled_not_started',
    'no_delivery',
    'insufficient_data',
    'weak_engagement',
    'low_ctr',
    'post_click_conversion_gap',
    'creative_fatigue_risk',
    'high_cpc',
    'healthy_early_signal',
    'no_data',
  ];

  const allowedRecommendedActions = [
    'resolve_billing',
    'wait_for_start_time',
    'check_delivery_status',
    'continue_monitoring',
    'update_primary_text',
    'test_new_primary_text_or_headline',
    'test_offer_or_audience_angle',
    'prepare_fresh_creative_variant',
    'test_new_audience_or_creative',
  ];

  const systemPrompt = `
You are Smartemark's autonomous marketer diagnosis engine.

You must diagnose Meta ad campaign performance using the provided campaign state, metrics, recent actions, and creative context.

Return ONLY valid JSON with this exact shape:
{
  "diagnosis": "one of the allowed values",
  "likelyProblem": "string",
  "recommendedAction": "one of the allowed values",
  "reason": "string",
  "confidence": 0.0
}

Rules:
- Be conservative.
- Do not invent missing metrics.
- Prefer "continue_monitoring" when signal is too weak.
- If campaign is blocked, paused, or has zero delivery, diagnose delivery first.
- If CTR is weak after meaningful impressions, prefer low_ctr.
- If clicks exist but conversions are absent after meaningful click volume, consider post_click_conversion_gap.
- If frequency is elevated and performance is softening, consider creative_fatigue_risk.
- Confidence must be a number from 0 to 1.
- Output JSON only. No markdown.

Tone rules for the "reason" field:
- Write like a calm, professional marketing advisor — not a judge.
- Be constructive and forward-looking: describe what is happening and what the next focus is.
- Do not say things like "weak hook" or "not compelling enough" — instead say "the next focus is strengthening the hook" or "a messaging refresh could improve click response."
- Avoid language that makes the user feel the campaign is failing unless delivery is genuinely blocked.
- "Early", "still gathering signal", "watching for stronger patterns", and "next step" are good framings.
- Keep it concise: one to two sentences.
`.trim();

  const input = {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    campaignName: String(optimizerState?.campaignName || '').trim(),
    niche: String(optimizerState?.niche || '').trim(),
    currentStatus: String(optimizerState?.currentStatus || '').trim(),
    billingBlocked: !!optimizerState?.billingBlocked,
    manualOverride: !!optimizerState?.manualOverride,
    metricsSnapshot: optimizerState?.metricsSnapshot || {},
    latestAction: optimizerState?.latestAction || null,
    latestDecision: optimizerState?.latestDecision || null,
    latestMonitoringDecision: optimizerState?.latestMonitoringDecision || null,
    creativeContext: creativesRecord
      ? {
          mediaSelection: String(creativesRecord?.mediaSelection || '').trim(),
          imageCount: Array.isArray(creativesRecord?.images) ? creativesRecord.images.length : 0,
          videoCount: Array.isArray(creativesRecord?.videos) ? creativesRecord.videos.length : 0,
          status: String(creativesRecord?.status || '').trim(),
          name: String(creativesRecord?.name || '').trim(),
          headline: String(creativesRecord?.meta?.headline || '').trim(),
          body: String(creativesRecord?.meta?.body || '').trim(),
          link: String(creativesRecord?.meta?.link || '').trim(),
        }
      : null,
    allowedDiagnoses,
    allowedRecommendedActions,
  };

  const response = await client.responses.create({
    model: MODEL,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.2,
    max_output_tokens: 500,
  });

  const text = String(response.output_text || '').trim();
  const parsed = safeJsonParse(text);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Optimizer brain returned invalid JSON');
  }

  return {
    diagnosis: normalizeAllowedValue(parsed.diagnosis, allowedDiagnoses, 'no_data'),
    likelyProblem: String(parsed.likelyProblem || 'Campaign needs more evaluation.').trim(),
    recommendedAction: normalizeAllowedValue(
      parsed.recommendedAction,
      allowedRecommendedActions,
      'continue_monitoring'
    ),
    reason: String(parsed.reason || 'AI diagnosis did not provide a detailed reason.').trim(),
    confidence: clampConfidence(parsed.confidence, 0.75),
    generatedAt: new Date().toISOString(),
    mode: 'ai_brain_v1',
  };
}

async function runOptimizerBrainDecision({
  optimizerState,
}) {
  const client = getClient();

  const allowedDecisions = [
    'restore_delivery',
    'hold_after_copy_refresh',
    'hold_after_delivery_restore',
    'wait_for_start_window',
    'resolve_billing_block',
    'investigate_delivery',
    'hold_and_monitor',
    'launch_creative_test',
    'refresh_copy',
    'adjust_angle',
    'prepare_refresh',
    'test_two_creative_angles',
    'test_single_creative_angle',
    'insufficient_context',
  ];

  const allowedActionTypes = [
    'unpause_campaign',
    'continue_monitoring',
    'check_delivery_status',
    'update_primary_text',
    'generate_single_creative_variant',
    'generate_two_creative_variants',
    'run_diagnosis_first',
    'wait_for_start_time',
  ];

  const systemPrompt = `
You are Smartemark's autonomous marketer decision engine.

You receive campaign metrics, diagnosis, monitoring state, and recent action history.
Your job is to decide the next best marketer move.

Return ONLY valid JSON with this exact shape:
{
  "decision": "one of the allowed values",
  "actionType": "one of the allowed values",
  "priority": "low | medium | high",
  "reason": "string",
  "requiresHumanApproval": true,
  "confidence": 0.0
}

Rules:
- Be conservative.
- Prefer continue_monitoring when there is not enough trustworthy new signal.
- If delivery is blocked, prioritize restoring delivery.
- If copy was just refreshed, do not immediately refresh again.
- If weak engagement or fatigue suggest creative testing, choose one or two creative variants depending on how strong the evidence is.
- Action type must be from the allowed list.
- Confidence must be from 0 to 1.
- Output JSON only. No markdown.
`.trim();

  const input = {
    campaignId: String(optimizerState?.campaignId || '').trim(),
    campaignName: String(optimizerState?.campaignName || '').trim(),
    niche: String(optimizerState?.niche || '').trim(),
    currentStatus: String(optimizerState?.currentStatus || '').trim(),
    metricsSnapshot: optimizerState?.metricsSnapshot || {},
    latestDiagnosis: optimizerState?.latestDiagnosis || null,
    latestMonitoringDecision: optimizerState?.latestMonitoringDecision || null,
    latestAction: optimizerState?.latestAction || null,
    manualOverride: !!optimizerState?.manualOverride,
    allowedDecisions,
    allowedActionTypes,
  };

  const response = await client.responses.create({
    model: MODEL,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(input) },
    ],
    temperature: 0.2,
    max_output_tokens: 500,
  });

  const text = String(response.output_text || '').trim();
  const parsed = safeJsonParse(text);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Optimizer brain returned invalid JSON for decision');
  }

  const priorityRaw = String(parsed.priority || '').trim().toLowerCase();
  const priority = ['low', 'medium', 'high'].includes(priorityRaw)
    ? priorityRaw
    : 'medium';

  return {
    decision: normalizeAllowedValue(parsed.decision, allowedDecisions, 'hold_and_monitor'),
    actionType: normalizeAllowedValue(parsed.actionType, allowedActionTypes, 'continue_monitoring'),
    priority,
    reason: String(parsed.reason || 'AI decision did not provide a detailed reason.').trim(),
    requiresHumanApproval: true,
    confidence: clampConfidence(parsed.confidence, 0.75),
    generatedAt: new Date().toISOString(),
    mode: 'ai_brain_v1',
  };
}

module.exports = {
  runOptimizerBrainDiagnosis,
  runOptimizerBrainDecision,
};