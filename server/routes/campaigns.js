const express = require('express');
const router = express.Router();
const db = require('../db'); // LowDB
const { nanoid } = require('nanoid');

const DEFAULT_AUDIENCE = {
  location: "US",
  ageRange: "18-65",
  interests: "Business, Restaurants"
};

// ======= SAVE CAMPAIGN =======
router.post('/save-campaign', async (req, res) => {
  const { username, campaign } = req.body;
  if (!username || !campaign) return res.status(400).json({ error: 'Username and campaign required' });

  await db.read();
  db.data.campaigns ||= [];

  // Enforce campaign limit per user
  const userCampaigns = db.data.campaigns.filter(c => c.username === username);
  if (userCampaigns.length >= 2) {
    return res.status(400).json({ error: 'Campaign limit reached (2 per user)' });
  }

  // Add ID if not present
  campaign.id = campaign.id || nanoid(12);

  // ============ AI AUDIENCE STRUCTURE DEFENSE ============
  // Accepts stringified JSON, parsed object, or null/undefined
  let aiAudience = campaign.aiAudience;

  // Defensive: always store as a full valid object, never null/undefined/empty
  if (typeof aiAudience === 'string') {
    try {
      aiAudience = JSON.parse(aiAudience);
    } catch {
      aiAudience = { ...DEFAULT_AUDIENCE };
    }
  } else if (typeof aiAudience !== 'object' || !aiAudience) {
    aiAudience = { ...DEFAULT_AUDIENCE };
  }

  // Enforce safe fields for targeting
  aiAudience = {
    location: typeof aiAudience.location === "string" && aiAudience.location.length > 0
      ? aiAudience.location.toUpperCase()
      : "US",
    ageRange: /^\d{2}-\d{2}$/.test(aiAudience.ageRange || "") ? aiAudience.ageRange : "18-65",
    interests: aiAudience.interests && String(aiAudience.interests).length > 0
      ? aiAudience.interests
      : "Business, Restaurants"
  };

  campaign.aiAudience = aiAudience;

  db.data.campaigns.push({ username, ...campaign });
  await db.write();

  res.json({ status: 'ok', id: campaign.id });
});

// ======= GET ALL USER CAMPAIGNS =======
router.get('/user-campaigns', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username required' });

  await db.read();
  db.data.campaigns ||= [];
  const userCampaigns = db.data.campaigns.filter(c => c.username === username);
  res.json({ campaigns: userCampaigns });
});

// ======= GET A SINGLE CAMPAIGN BY ID =======
router.get('/campaign/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  db.data.campaigns ||= [];
  const campaign = db.data.campaigns.find(c => c.id === id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ campaign });
});

// ======= DELETE CAMPAIGN BY ID =======
router.delete('/campaign/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  db.data.campaigns ||= [];
  const idx = db.data.campaigns.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Campaign not found' });
  db.data.campaigns.splice(idx, 1);
  await db.write();
  res.json({ status: 'deleted' });
});

module.exports = router;
