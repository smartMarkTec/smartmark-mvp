require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://smartmark-mvp.vercel.app',
  'http://localhost:3000'
];

// CORS setup
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow REST tools, local scripts
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS not allowed from this origin: ' + origin), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());

app.set('trust proxy', 1);

// Parse JSON and urlencoded payloads
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// -------- Serve generated images for AI overlays --------
app.use('/generated', express.static(path.join(__dirname, '../public/generated')));

const authRoutes = require('../routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('../routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('../routes/campaigns');
app.use('/api', campaignRoutes);

// Health check
app.get('/healthz', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// Root
app.get('/', (req, res) => {
  res.json({ status: 'SmartMark backend running', time: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Improved global error handler (must be last)
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err?.stack || err);
  if (res.headersSent) return next(err);
  res.setHeader('Content-Type', 'application/json');
  res.status(500).json({
    error: 'Internal server error',
    detail: err?.message || 'Unknown error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err?.stack })
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});

module.exports = app;
