'use strict';

function startOptimizerAutoRunner({ runScheduledPass }) {
  if (typeof runScheduledPass !== 'function') {
    throw new Error('runScheduledPass function is required');
  }

  const enabled = String(process.env.OPTIMIZER_AUTORUN_ENABLED || '').trim() === '1';
  if (!enabled) {
    console.log('[optimizer autorun] disabled');
    return { started: false };
  }

  const intervalMinutes = Number(process.env.OPTIMIZER_AUTORUN_INTERVAL_MINUTES || 60);
  const limit = Number(process.env.OPTIMIZER_AUTORUN_LIMIT || 10);
  const minHoursBetweenRuns = Number(process.env.OPTIMIZER_MIN_HOURS_BETWEEN_RUNS || 1);

  const intervalMs = Math.max(1, intervalMinutes) * 60 * 1000;

  let running = false;

  const tick = async () => {
    if (running) {
      console.log('[optimizer autorun] skipped tick because previous run is still active');
      return;
    }

    running = true;

    try {
      console.log('[optimizer autorun] tick started', {
        intervalMinutes,
        limit,
        minHoursBetweenRuns,
      });

      const result = await runScheduledPass({
        minHoursBetweenRuns,
        limit,
      });

      console.log('[optimizer autorun] tick completed', {
        checked: result?.checked ?? null,
        eligible: result?.eligible ?? null,
        processed: result?.processed ?? null,
      });
    } catch (err) {
      console.error('[optimizer autorun] tick failed', {
        message: err?.message || 'unknown error',
        stack: err?.stack || null,
      });
    } finally {
      running = false;
    }
  };

  console.log('[optimizer autorun] enabled', {
    intervalMinutes,
    limit,
    minHoursBetweenRuns,
  });

  setTimeout(() => {
    tick().catch(() => {});
  }, 5000);

  const timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);

  return {
    started: true,
    intervalMs,
    stop: () => clearInterval(timer),
  };
}

module.exports = {
  startOptimizerAutoRunner,
};