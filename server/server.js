// server/server.js
// --- GLOBAL ERROR HANDLERS (keep these at the very top!) ---

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
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-FB-AD-ACCOUNT-ID, X-SM-SID, Range'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* ----------------------------- SERVER SETTINGS ----------------------------- */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  try {
    if (typeof req.setTimeout === 'function') req.setTimeout(180000);
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
  try { fs.mkdirSync(generatedPath, { recursive: true }); } catch {}
  console.log('Serving /generated from:', generatedPath);
} else {
  generatedPath = path.join(__dirname, 'public/generated');
  try { fs.mkdirSync(generatedPath, { recursive: true }); } catch {}
  console.log('Serving /generated from:', generatedPath);
}
process.env.GENERATED_DIR = generatedPath;

// Serve generated files (static AI image ads)
const staticOpts = {
  maxAge: '1y',
  immutable: true,
  setHeaders(res, _filePath) {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length');
  }
};

app.use('/generated', express.static(generatedPath, staticOpts));
app.use('/api/media', express.static(generatedPath, staticOpts));
app.use('/media', express.static(generatedPath, staticOpts));

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
app.get('/api/test', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, ts: Date.now() });
});

/**
 * Lightweight copy-crafting route (optional, fine to keep)
 */
app.post('/api/craft-ad-copy', (req, res) => {
  try {
    const b = req.body || {};
    const a = b.answers || {};
    const industry = (b.industry || a.industry || 'Local Services').toString().toLowerCase();
    const businessName = (b.businessName || a.businessName || 'Your Brand').toString();

    const presets = {
      fashion: {
        headline: "Fresh Styles, Just Dropped",
        subline: "Seasonal picks curated for you",
        offer: "FREE SHIPPING",
        bullets: ["Easy returns", "New arrivals weekly"]
      },
      electronics: {
        headline: "Upgrade Your Tech",
        subline: "Trending gadgets & smart deals",
        offer: "UP TO 40% OFF",
        bullets: ["Laptops • Tablets • Audio", "0% APR Promo*"]
      },
      restaurant: {
        headline: "Taste What’s New",
        subline: "Fresh flavors this week",
        offer: "2 FOR $20",
        bullets: ["Order online • Pickup", "Local ingredients"]
      },
      flooring: {
        headline: "Fall Flooring Event",
        subline: "Make your home shine",
        offer: "SAVE UP TO $1000",
        bullets: ["Hardwood • Vinyl • Tile", "Free in-home estimates"]
      },
      default: {
        headline: "New Offers Inside",
        subline: "Quality you can count on",
        offer: "BIG SAVINGS",
        bullets: ["Trusted service", "Great reviews"]
      }
    };

    const p =
      presets[industry] ||
      (industry.includes('fashion') ? presets.fashion :
       industry.includes('floor') ? presets.flooring :
       industry.includes('restaurant') ? presets.restaurant :
       industry.includes('electr') ? presets.electronics :
       presets.default);

    const copy = {
      headline: p.headline,
      subline: p.subline,
      offer: p.offer,
      bullets: p.bullets,
      disclaimers: a.legal || "",
      cta: a.cta || "Shop Now",
      brand: { businessName }
    };

    res.json({ ok: true, copy });
  } catch (e) {
    console.error('craft-ad-copy error:', e);
    res.status(500).json({ ok: false, error: 'craft-ad-copy failed' });
  }
});

const authRoutes = require('./routes/auth');
app.use('/auth', authRoutes);

/* IMPORTANT: staticAds is your ONLY generation path now */
const staticAdsRoutes = require('./routes/staticAds');
app.use('/api', staticAdsRoutes);

/* (optional) legacy proxy alias — keep only if your frontend still calls /proxy-img */
const { proxyImgHandler, proxyHeadHandler } = require('./routes/staticAds');
app.get('/proxy-img', proxyImgHandler);
app.head('/proxy-img', proxyHeadHandler);

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

/* --------------------------------- HEALTH -------------------------------- */
app.get(['/healthz', '/api/health', '/health'], (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'OK', uptime: Math.round(process.uptime()), ts: Date.now() });
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
