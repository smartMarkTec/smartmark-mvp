// routes/campaigns.js
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// Make sure /models directory exists
const MODELS_DIR = path.join(__dirname, '../models');
if (!fs.existsSync(MODELS_DIR)) {
  fs.mkdirSync(MODELS_DIR);
}

// Simple file storage for MVP
const DB_PATH = path.join(MODELS_DIR, 'campaigns.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '{}');
    return JSON.parse(fs.readFileSync(DB_PATH));
  } catch (err) {
    console.error("Failed to load DB:", err);
    return {};
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Failed to save DB:", err);
  }
}

// Save campaign by user email
router.post('/save-campaign', (req, res) => {
  const { email, campaign } = req.body;
  if (!email || !campaign) return res.status(400).json({ error: 'Email and campaign required' });
  const db = loadDB();
  db[email] = campaign;
  saveDB(db);
  res.json({ status: 'ok' });
});

// Load campaign by user email
router.get('/load-campaign', (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const db = loadDB();
  res.json({ campaign: db[email] || null });
});

module.exports = router;
