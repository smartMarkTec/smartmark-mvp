// server/server.js
// --- GLOBAL ERROR HANDLERS (keep these at the very top!) ---

if (!process.env.NODE_OPTIONS) {
  process.env.NODE_OPTIONS = "--max-old-space-size=1024"; // try 1024 or 2048
}

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
const sharp = require('sharp');

const app = express();

// --- Allowed origins ---
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://smartmark-mvp.vercel.app',
  'http://localhost:3000'
].filter(Boolean);

// --- CORS ---
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS not allowed from ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-FB-AD-ACCOUNT-ID'],
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

// --- Serve generated assets for AI overlays ---
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
app.use('/generated', express.static(generatedPath));

/** ===== Local fallback image ===== */
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

/* =========================
   BYPASS LOGIN (DEV ONLY)
   =========================
   If AUTH_BYPASS=1 is set in env, we short-circuit /auth/login
   to immediately return success and set a simple session cookie.
   This lets you test the UI and curls while the real auth handler
   is hanging. Remove or set AUTH_BYPASS=0 to disable.
*/
app.post('/auth/login', (req, res, next) => {
  if (process.env.AUTH_BYPASS === '1') {
    const username = (req.body && String(req.body.username || 'guest').trim()) || 'guest';
    const email = (req.body && String(req.body.password || '').trim()) || '';
    const sid = `dev-${Buffer.from(username).toString('hex')}`;

    // You don't need cookie-parser to SET cookies
    res.cookie('sm_sid', sid, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true, // Render is HTTPS; fine to keep secure=true
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      user: { username, email },
      bypass: true
    });
  }
  // fall through to the real /auth router
  return next();
});

// OPTIONAL: guard against any handler that “hangs” > 20s
app.use((req, res, next) => {
  res.setTimeout(20000, () => {
    try {
      res.status(504).json({ error: 'Gateway Timeout', route: req.originalUrl });
    } catch {}
  });
  next();
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

// Mount MOCK routes FIRST
const smartMockRoutes = require('./routes/smartMock');
app.use(smartMockRoutes);

const smartRoutes = require('./routes/smart');
app.use('/smart', smartRoutes);

// --- Health check ---
app.get('/healthz', (_req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// --- Root ---
app.get('/', (_req, res) => {
  res.json({ status: 'SmartMark backend running', time: new Date().toISOString() });
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// --- Global error handler ---
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server started on http://localhost:${PORT}`);
});

module.exports = app;
