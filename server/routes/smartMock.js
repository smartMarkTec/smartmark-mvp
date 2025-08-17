'use strict';

const express = require('express');
const router = express.Router();

const engine = require('../smartCampaignEngine'); // resolves to index.js

router.use(express.json());

// Upsert mock insights for adsets/ads used by the analyzer
router.post('/smart/mock/insights', (req, res) => {
  try {
    const { adset = {}, ad = {} } = req.body || {};
    if (!engine.testing || !engine.testing.setMockInsights) {
      return res.status(500).json({ error: 'Testing hooks not available' });
    }
    engine.testing.setMockInsights({ adset, ad });
    return res.json({ ok: true, counts: { adset: Object.keys(adset).length, ad: Object.keys(ad).length } });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to set mocks' });
  }
});

// Optional: clear all mocks
router.post('/smart/mock/clear', (_req, res) => {
  try {
    if (!engine.testing || !engine.testing.clearMockInsights) {
      return res.status(500).json({ error: 'Testing hooks not available' });
    }
    engine.testing.clearMockInsights();
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Failed to clear mocks' });
  }
});

module.exports = router;
