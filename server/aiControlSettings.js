'use strict';

/**
 * Central helper for AI control settings.
 *
 * If aiSettingsInitialized is not explicitly true, the campaign is treated as:
 *   aiAutopilotEnabled: false  — no automatic optimizer cycles
 *   aiApprovalRequired: true   — all AI actions require explicit user approval
 *
 * This means both new campaigns and legacy campaigns without an explicit
 * user setting cannot receive automatic optimizer changes. The user must
 * open the AI Settings panel and turn Autopilot ON before any automated
 * cycle can run.
 */
function getEffectiveAiControlSettings(state = {}) {
  const initialized = state.aiSettingsInitialized === true;
  return {
    aiSettingsInitialized: initialized,
    // Autopilot ON only if the user has explicitly enabled it
    aiAutopilotEnabled:    initialized ? (state.optimizationEnabled !== false) : false,
    // Approval Required ON by default; OFF only if the user explicitly set it to false
    aiApprovalRequired:    initialized ? (state.aiApprovalRequired !== false)  : true,
  };
}

module.exports = { getEffectiveAiControlSettings };
