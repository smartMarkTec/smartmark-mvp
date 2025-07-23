require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
const app = express();

// ====== RELIABLE CORS (order: first) ======
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://smartmark-mvp.vercel.app';

app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors({
  origin: FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// If behind proxy (Render, Vercel, etc)
app.set('trust proxy', 1);

// ====== BODY PARSER ======
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ====== ROUTES ======
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

// Health check endpoint (for Render uptime)
app.get('/healthz', (req, res) => {
  res.send('OK');
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('SmartMark backend is running!');
});

// ====== CATCH-ALL 404 (OPTIONAL) ======
// app.use((req, res) => {
//   res.status(404).send('Not found');
// });

// ====== GLOBAL ERROR HANDLER ======
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ====== SERVER START ======
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});
