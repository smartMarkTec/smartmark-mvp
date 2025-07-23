const express = require('express');
const router = express.Router();
const db = require('../db'); // Use LowDB database!
const { nanoid } = require('nanoid'); // Add this: npm install nanoid

// Save a campaign for a user (append to their campaign list)
router.post('/save-campaign', async (req, res) => {
  const { username, campaign } = req.body;
  if (!username || !campaign) return res.status(400).json({ error: 'Username and campaign required' });

  await db.read();
  db.data.campaigns ||= [];
  // Ensure max 2 campaigns per user
  const userCampaigns = db.data.campaigns.filter(c => c.username === username);
  if (userCampaigns.length >= 2) {
    return res.status(400).json({ error: 'Campaign limit reached (2 per user)' });
  }
  // Add ID if not present
  campaign.id = campaign.id || nanoid(12);

  // If aiAudience exists, store it as an object (or JSON string if needed)
  if (campaign.aiAudience && typeof campaign.aiAudience === 'string') {
    try {
      campaign.aiAudience = JSON.parse(campaign.aiAudience);
    } catch {
      // Keep as string if parsing fails
    }
  }

  db.data.campaigns.push({ username, ...campaign });
  await db.write();

  res.json({ status: 'ok', id: campaign.id });
});

// Get all campaigns for a user
router.get('/user-campaigns', async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ error: 'Username required' });

  await db.read();
  db.data.campaigns ||= [];
  const userCampaigns = db.data.campaigns.filter(c => c.username === username);
  res.json({ campaigns: userCampaigns });
});

// Get a single campaign by ID
router.get('/campaign/:id', async (req, res) => {
  const { id } = req.params;
  await db.read();
  db.data.campaigns ||= [];
  const campaign = db.data.campaigns.find(c => c.id === id);
  if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
  res.json({ campaign });
});

// Delete a campaign by ID
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
