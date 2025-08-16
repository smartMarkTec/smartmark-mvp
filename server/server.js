// server/server.js
// --- GLOBAL ERROR HANDLERS (keep these at the very top!) ---
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

require('dotenv').config({ path: './.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// --- Allowed origins (fill FRONTEND_URL in .env for Render/Vercel) ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://smartmark-mvp.vercel.app',
  'http://localhost:3000'
].filter(Boolean);

// --- CORS (credentials + dynamic origin reflection) ---
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman/local scripts
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS not allowed from ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

// Apply to all routes + make preflight use the SAME options
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Echo ACAO per-request so credentials work (and add Vary for caches/CDNs)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  next();
});


app.set('trust proxy', 1);

// --- Body parsing (no cookies) ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Serve generated images & videos for AI overlays ---
let generatedPath;
if (process.env.RENDER) {
  generatedPath = '/tmp/generated';
  console.log('Serving /generated from:', generatedPath);
} else {
  generatedPath = path.join(__dirname, 'public/generated');
  try { fs.mkdirSync(generatedPath, { recursive: true }); } catch {}
  console.log('Serving /generated from:', generatedPath);
}
app.use('/generated', express.static(generatedPath));

// --- ROUTES ---
const authRoutes = require('./routes/auth');      // -> server/routes/auth.js
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');          // -> server/routes/ai.js
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns'); // -> server/routes/campaigns.js
app.use('/api', campaignRoutes);

const gptChatRoutes = require('./routes/gpt');    // -> server/routes/gpt.js
app.use('/api', gptChatRoutes);

// Smart engine orchestration routes
const smartRoutes = require('./routes/smart');    // -> server/routes/smart.js
app.use('/smart', smartRoutes);

// --- Health check ---
app.get('/healthz', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// --- Root ---
app.get('/', (req, res) => {
  res.json({ status: 'SmartMark backend running', time: new Date().toISOString() });
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler (must be last) ---
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

// ---- Start background scheduler (SmartCampaign automation) ----
try {
  const scheduler = require('./scheduler/jobs'); // -> server/scheduler/jobs.js
  if (scheduler && typeof scheduler.start === 'function') {
    scheduler.start();
    console.log('✅ Smart scheduler started');
  } else {
    console.warn('⚠️  Smart scheduler not started: start() not found');
  }
} catch (e) {
  console.warn('⚠️  Failed to load/start scheduler:', e?.message || e);
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});

module.exports = app;
