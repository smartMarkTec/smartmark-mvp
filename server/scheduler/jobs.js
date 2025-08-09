// server/scheduler/jobs.js
// Simple interval-based scheduler (no external cron). Runs every 24h.

const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const analyzer = require('../smartCampaignEngine/analyzer');
const generator = require('../smartCampaignEngine/generator');
const deployer = require('../smartCampaignEngine/deployer');
const policy = require('../smartCampaignEngine/policy');

async function ensureSmartTables() {
  await db.read();
  db.data = db.data || {};
  db.data.smart_configs = db.data.smart_configs || [];
  db.data.smart_runs = db.data.smart_runs || [];
  await db.write();
}

async function runSmartForConfig(cfg) {
  const userToken = getFbUserToken();
  if (!userToken) return;

  const { accountId, campaignId } = cfg;

  const analysis = await analyzer.analyzeCampaign({
    accountId,
    campaignId,
    userToken,
    kpi: cfg.kpi || 'ctr'
  });

  const somePlateau = Object.values(analysis.plateauByAdset || {}).some(Boolean);
  if (!somePlateau) return;

  // Respect 72h between NEW ads per adset (soft via MIN_HOURS_BETWEEN_NEW_ADS); we check lastRunAt
  if (cfg.lastRunAt) {
    const hours = (Date.now() - new Date(cfg.lastRunAt).getTime()) / 36e5;
    if (hours < policy.LIMITS.MIN_HOURS_BETWEEN_NEW_ADS) return;
  }

  // Generate
  const creatives = await generator.generateTwoCreatives({
    form: {},
    answers: {},
    url: cfg.link || '',
    mediaSelection: 'both'
  });

  // Deploy
  const deployed = await deployer.deploy({
    accountId,
    pageId: cfg.pageId,
    campaignLink: cfg.link || 'https://your-smartmark-site.com',
    adsetIds: analysis.adsetIds,
    winnersByAdset: analysis.winnersByAdset,
    losersByAdset: analysis.losersByAdset,
    creatives,
    userToken
  });

  // Log + update
  await db.read();
  db.data.smart_runs.push({
    id: `run_${Date.now()}`,
    campaignId,
    accountId,
    startedAt: new Date().toISOString(),
    plateauDetected: true,
    createdAdsByAdset: deployed.createdAdsByAdset,
    pausedAdsByAdset: deployed.pausedAdsByAdset
  });
  const cfgRef = db.data.smart_configs.find(c => c.campaignId === campaignId);
  if (cfgRef) cfgRef.lastRunAt = new Date().toISOString();
  await db.write();
}

async function sweep() {
  try {
    await ensureSmartTables();
    const configs = db.data.smart_configs || [];
    for (const cfg of configs) {
      await runSmartForConfig(cfg);
    }
  } catch (e) {
    console.error('[SmartScheduler] sweep error:', e.message);
  }
}

function start() {
  // First run after 2 minutes, then every 24h
  setTimeout(sweep, 2 * 60 * 1000);
  setInterval(sweep, 24 * 60 * 60 * 1000);
}

module.exports = { start };
