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
const sharp = require('sharp'); // needed for fallback image

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
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS not allowed from ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

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

/** ===== Local fallback image (no external DNS) ===== */
app.get('/__fallback/1200.jpg', async (req, res) => {
  try {
    const buf = await sharp({
      create: {
        width: 1200,
        height: 1200,
        channels: 3,
        background: { r: 30, g: 200, b: 133 }
      }
    })
      .jpeg({ quality: 82 })
      .toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  } catch (e) {
    res.status(500).send('fallback image error');
  }
});

// --- ROUTES ---
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

const gptChatRoutes = require('./routes/gpt');
app.use('/api', gptChatRoutes);

// Mount MOCK routes FIRST so they don't get swallowed by /smart router
const smartMockRoutes = require('./routes/smartMock');
app.use(smartMockRoutes);

const smartRoutes = require('./routes/smart');
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

// ---- Background scheduler intentionally disabled ----
// Timeframes are now controlled per-campaign from the UI (Campaign Duration).
// (If you ever need it again, re-enable ./scheduler/jobs start here.)

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});

module.exports = app;
