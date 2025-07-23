require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
const app = express();

// ***** CORS MUST BE FIRST, BEFORE ALL MIDDLEWARE AND ROUTES *****
app.use(cors({
  origin: 'https://smartmark-mvp.vercel.app', // Your frontend URL
  credentials: true,
}));

// Body parsers must come after CORS but before routes
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== ROUTES (order matters!) =====
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

// Health check endpoint (optional, useful for Render)
app.get('/healthz', (req, res) => {
  res.send('OK');
});

// Simple root endpoint
app.get('/', (req, res) => {
  res.send('SmartMark backend is running!');
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});
