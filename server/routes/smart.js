// server/routes/smart.js
// SmartCampaign API: enable, run-once, status.
// Uses LowDB (your existing db) and the engine modules.

const express = require('express');
const router = express.Router();
const db = require('../db'); // your LowDB instance
const { getFbUserToken, setFbUserToken } = require('../tokenStore');
const analyzer = require('../smartCampaignEngine/analyzer');
const generator = require('../smartCampaignEngine/generator');
const deployer = require('../smartCampaignEngine/deployer');
const policy = require('../smartCampaignEngine/policy');

// ---- DB helpers / migrations ----
async function ensureSmartTables() {
  await db.read();
  db.data = db.data || {};
  db.data.users = db.data.users || [];
  db.data.campaigns = db.data.campaigns || [];
  db.data.smart_configs = db.data.smart_configs || [];
  db.data.smart_runs = db.data.smart_runs || [];
  db.data.creative_history = db.data.creative_history || [];
  await db.write();
}

function nowIso() { return new Date().toISOString(); }

// Enable Smart management for a campaign (no UI toggle shown to user; this is internal)
router.post('/enable', async (req, res) => {
  try {
    await ensureSmartTables();
    const { accountId, campaignId, pageId, link, kpi = 'ctr' } = req.body;
    if (!accountId || !campaignId || !pageId) {
      return res.status(400).json({ error: 'accountId, campaignId, pageId are required' });
    }
    const existing = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (existing) {
      existing.pageId = pageId;
      existing.link = link || existing.link || '';
      existing.kpi = kpi;
      existing.updatedAt = nowIso();
    } else {
      db.data.smart_configs.push({
        id: `sc_${campaignId}`,
        accountId,
        campaignId,
        pageId,
        link: link || '',
        kpi,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastRunAt: null
      });
    }
    await db.write();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manually trigger a single Smart run for a campaign
router.post('/run-once', async (req, res) => {
  try {
    await ensureSmartTables();
    const userToken = getFbUserToken();
    if (!userToken) return res.status(401).json({ error: 'Not authenticated with Facebook' });

    const { accountId, campaignId, form = {}, answers = {}, url = '', mediaSelection = 'both' } = req.body;
    const cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    if (!cfg) return res.status(400).json({ error: 'Smart config not found. Call /smart/enable first.' });

    // Analyze
    const analysis = await analyzer.analyzeCampaign({
      accountId,
      campaignId,
      userToken,
      kpi: cfg.kpi || 'ctr'
    });

    // Check plateau (any adset)
    const somePlateau = Object.values(analysis.plateauByAdset || {}).some(Boolean);
    if (!somePlateau) {
      return res.json({ success: true, message: 'No plateau detected', analysis });
    }

    // Generate 2 new creatives
    const creatives = await generator.generateTwoCreatives({ form, answers, url, mediaSelection });

    // Deploy to each adset
    const deployed = await deployer.deploy({
      accountId,
      pageId: cfg.pageId,
      campaignLink: cfg.link || form?.url || url || 'https://your-smartmark-site.com',
      adsetIds: analysis.adsetIds,
      winnersByAdset: analysis.winnersByAdset,
      losersByAdset: analysis.losersByAdset,
      creatives,
      userToken
    });

    // Log run
    const run = {
      id: `run_${Date.now()}`,
      campaignId,
      accountId,
      startedAt: nowIso(),
      plateauDetected: true,
      createdAdsByAdset: deployed.createdAdsByAdset,
      pausedAdsByAdset: deployed.pausedAdsByAdset
    };
    db.data.smart_runs.push(run);
    cfg.lastRunAt = nowIso();
    await db.write();

    res.json({ success: true, run, analysis });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Status for a campaign
router.get('/status/:campaignId', async (req, res) => {
  try {
    await ensureSmartTables();
    const { campaignId } = req.params;
    const cfg = (db.data.smart_configs || []).find(c => c.campaignId === campaignId);
    const runs = (db.data.smart_runs || []).filter(r => r.campaignId === campaignId).slice(-5).reverse();
    res.json({ config: cfg || null, recentRuns: runs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
