require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');

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

// ====== PAUSE/UNPAUSE/CANCEL CAMPAIGN ROUTES ======
// These must come AFTER other /api/ routes
app.post('/api/campaign/:id/pause', async (req, res) => {
  // TODO: Integrate with Facebook/Meta API to pause
  // Replace this with your pause logic
  res.json({ success: true, message: `Campaign ${req.params.id} paused.` });
});
app.post('/api/campaign/:id/unpause', async (req, res) => {
  // TODO: Integrate with Facebook/Meta API to unpause
  // Replace this with your unpause logic
  res.json({ success: true, message: `Campaign ${req.params.id} unpaused.` });
});
app.post('/api/campaign/:id/cancel', async (req, res) => {
  // TODO: Integrate with Facebook/Meta API to cancel
  // Replace this with your cancel logic
  res.json({ success: true, message: `Campaign ${req.params.id} cancelled.` });
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
