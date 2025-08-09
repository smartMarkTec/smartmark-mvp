// server/smartCampaignEngine/policy/index.js
// Guardrails + plateau rules (no budget changes; rotate creatives only)

module.exports = {
  // When to inspect performance windows
  WINDOWS: {
    RECENT_DAYS: 3,      // last 3 days
    PRIOR_DAYS: 3        // 3 days prior to that
  },

  // Plateau detection thresholds (conservative)
  THRESHOLDS: {
    MIN_IMPRESSIONS: 1500,    // need enough volume
    CTR_DROP_PCT: 0.20,       // >=20% drop vs. prior window
    FREQ_MAX: 2.0,            // frequency above this = fatigue risk
    MIN_SPEND: 5              // avoid acting on $1 noise
  },

  // Safety limits
  LIMITS: {
    MAX_NEW_ADS_PER_RUN_PER_ADSET: 2,
    MIN_HOURS_BETWEEN_RUNS: 24,
    MIN_HOURS_BETWEEN_NEW_ADS: 72
  },

  // Decide whether the current window is plateauing vs. prior
  isPlateau({ recent, prior, thresholds }) {
    const t = thresholds || this.THRESHOLDS;

    const safeNum = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const rImp = safeNum(recent.impressions);
    const pImp = safeNum(prior.impressions);
    const rSpend = safeNum(recent.spend);
    const rCtr = safeNum(recent.ctr);
    const pCtr = safeNum(prior.ctr);
    const rFreq = safeNum(recent.frequency);

    if (rImp < t.MIN_IMPRESSIONS) return false;
    if (rSpend < t.MIN_SPEND) return false;

    const ctrDrop = (pCtr > 0) ? (pCtr - rCtr) / pCtr : 0;
    if (ctrDrop >= t.CTR_DROP_PCT) return true;
    if (rFreq >= t.FREQ_MAX) return true;

    return false;
  }
};
