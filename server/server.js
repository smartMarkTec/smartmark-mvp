// server/server.js
// --- GLOBAL ERROR HANDLERS (keep these at the very top!) ---

// Keep Node's V8 heap under the Render free 512MB ceiling.
// You can override with env MAX_HEAP_MB (e.g. 320 or 384).
const MAX_HEAP_MB = Number(process.env.MAX_HEAP_MB || 320);
if (!process.env.NODE_OPTIONS || !/max-old-space-size/.test(process.env.NODE_OPTIONS)) {
  process.env.NODE_OPTIONS = `--max-old-space-size=${MAX_HEAP_MB}`;
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

require('dotenv').config({ path: './.env' });

const cookieParser = require('cookie-parser');
const express = require('express');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Optional deps
let compression = null;
try { compression = require('compression'); } catch (e) {
  console.warn('[server] compression not installed; continuing without it');
}
let morgan = null;
try { morgan = require('morgan'); } catch (e) {
  console.warn('[server] morgan not installed; continuing without request logging');
}

const app = express();

/* ----------------------------- BULLETPROOF CORS ----------------------------- */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin); // reflect caller
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-FB-AD-ACCOUNT-ID, X-SM-SID');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // media can be embedded
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* ----------------------------- SERVER SETTINGS ----------------------------- */
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Prevent long image jobs from being killed by idle timeouts
app.use((req, res, next) => {
  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(180000); // 3 min
    if (typeof res.setTimeout === 'function') res.setTimeout(180000);
  } catch {}
  next();
});

if (compression) app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
if (morgan) app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

/* ----------------------- STATIC: GENERATED ASSETS ----------------------- */
let generatedPath;
if (process.env.RENDER) {
  generatedPath = '/tmp/generated';
  console.log('Serving /generated from:', generatedPath);
} else {
  generatedPath = path.join(__dirname, 'public/generated');
  try { fs.mkdirSync(generatedPath, { recursive: true }); } catch {}
  console.log('Serving /generated from:', generatedPath);
}
process.env.GENERATED_DIR = generatedPath;

app.use('/generated', express.static(generatedPath, {
  maxAge: '1d',
  immutable: true,
  setHeaders(res) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
  }
}));

/** Local fallback image for testing */
app.get('/__fallback/1200.jpg', async (_req, res) => {
  try {
    const buf = await sharp({
      create: { width: 1200, height: 1200, channels: 3, background: { r: 30, g: 200, b: 133 } }
    }).jpeg({ quality: 82 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.end(buf);
  } catch {
    res.status(500).send('fallback image error');
  }
});

// Guard against handlers that “hang”
app.use((req, res, next) => {
  res.setTimeout(180000, () => {
    try {
      res.status(504).json({ error: 'Gateway Timeout', route: req.originalUrl });
    } catch {}
  });
  next();
});

/* --------------------------------- ROUTES --------------------------------- */
const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

const aiRoutes = require('./routes/ai');
app.use('/api', aiRoutes);

const campaignRoutes = require('./routes/campaigns');
app.use('/api', campaignRoutes);

const gptChatRoutes = require('./routes/gpt');
app.use('/api', gptChatRoutes);

// Simple ping that echoes headers (debug CORS quickly)
app.all('/api/ping', (req, res) => {
  res.json({
    ok: true,
    method: req.method,
    headers: req.headers,
    rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    time: Date.now()
  });
});

// Mount MOCK routes FIRST
const smartMockRoutes = require('./routes/smartMock');
app.use(smartMockRoutes);

const smartRoutes = require('./routes/smart');
app.use('/smart', smartRoutes);

/* --------------------------------- HEALTH -------------------------------- */
app.get(['/healthz', '/api/health', '/health'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'OK', uptime: process.uptime(), ts: Date.now() });
});

/* ---------------------------------- ROOT --------------------------------- */
app.get('/', (_req, res) => {
  res.json({ status: 'SmartMark backend running', time: new Date().toISOString() });
});

/* ---------------------------------- 404 ---------------------------------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/* -------------------------- GLOBAL ERROR HANDLER -------------------------- */
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err?.stack || err);
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  if (res.headersSent) return next(err);
  res.setHeader('Content-Type', 'application/json');
  res.status(500).json({
    error: 'Internal server error',
    detail: err?.message || 'Unknown error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err?.stack })
  });
});

/* --------------------------------- START --------------------------------- */
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server started on http://0.0.0.0:${PORT} (heap<=${MAX_HEAP_MB}MB)`);
});

module.exports = app;
