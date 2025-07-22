require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
// If you're on Node 18+ you can use global fetch
// Otherwise, install node-fetch and use the line below
const fetch = require('node-fetch');

const app = express();

// ====== ENABLE CORS ======
app.use(cors({
  origin: 'https://smartmark-mvp.vercel.app',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ====== ROUTES ======
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

// ====== REAL PAUSE/UNPAUSE/CANCEL CAMPAIGN ROUTES ======
// These must come AFTER other /api/ routes

// NOTE: Replace this function to get the real user's Facebook access token
function getUserAccessToken(req) {
  // TODO: Get from req.session, DB, or OAuth flow
  // For testing, fallback to an env variable
  return req.headers['fb-access-token'] || process.env.FB_ACCESS_TOKEN;
}

// --- PAUSE CAMPAIGN ---
app.post('/api/campaign/:id/pause', async (req, res) => {
  const campaignId = req.params.id;
  const accessToken = getUserAccessToken(req);
  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "PAUSED",
          access_token: accessToken
        })
      }
    );
    const data = await fbRes.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ success: true, message: `Campaign ${campaignId} paused on Facebook.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- UNPAUSE CAMPAIGN ---
app.post('/api/campaign/:id/unpause', async (req, res) => {
  const campaignId = req.params.id;
  const accessToken = getUserAccessToken(req);
  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "ACTIVE",
          access_token: accessToken
        })
      }
    );
    const data = await fbRes.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ success: true, message: `Campaign ${campaignId} unpaused on Facebook.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// --- CANCEL CAMPAIGN ---
app.post('/api/campaign/:id/cancel', async (req, res) => {
  const campaignId = req.params.id;
  const accessToken = getUserAccessToken(req);
  try {
    const fbRes = await fetch(
      `https://graph.facebook.com/v19.0/${campaignId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "DELETED",
          access_token: accessToken
        })
      }
    );
    const data = await fbRes.json();
    if (data.error) throw new Error(data.error.message);
    res.json({ success: true, message: `Campaign ${campaignId} cancelled on Facebook.` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ====== ROOT ROUTE ======
app.get('/', (req, res) => {
  res.send('SmartMark backend is running!');
});

// ====== START SERVER ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});
