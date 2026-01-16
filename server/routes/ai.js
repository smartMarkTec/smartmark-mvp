'use strict';
/**
 * SmartMark AI routes — static ads (images only)
 * - Static image generation pipelines
 * - Image templates + copy generation
 */

const express = require('express');
const router = express.Router();

/* ------------------------ CORS (ALWAYS first) ------------------------ */
router.use((req, res, next) => {
  const origin = req.headers && req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-FB-AD-ACCOUNT-ID, X-SM-SID'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ---------------- Memory discipline + concurrency gate --------------- */
const sharp = require('sharp');
try {
  sharp.cache({ memory: 16, files: 0, items: 0 });
  sharp.concurrency(1);
} catch {}

const GEN_LIMIT = Number(process.env.GEN_CONCURRENCY || 1);
let active = 0;
const waiters = [];

function acquire() {
  return new Promise((resolve) => {
    const tryGo = () => {
      if (active < GEN_LIMIT) { active += 1; resolve(); }
      else { waiters.push(tryGo); }
    };
    tryGo();
  });
}
function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) setImmediate(next);
}

// Gate only the heavy generation routes; always release on finish/close
function heavyRoute(req, res, next) {
  const heavy = /^\/(generate-image-from-prompt|generate-campaign-assets|generate-static-ad)\b/.test(req.path);
  if (!heavy) return next();
  if (req.method === 'OPTIONS') return res.sendStatus(204);

  acquire().then(() => {
    let released = false;
    const done = () => { if (!released) { released = true; release(); } };
    res.once('finish', done);
    res.once('close', done);
    next();
  });
}
router.use(heavyRoute);

/* ------------------------ Security & rate limit ---------------------- */
const { secureHeaders, basicRateLimit } = require('../middleware/security');
router.use(secureHeaders());
router.use(basicRateLimit({ windowMs: 15 * 60 * 1000, max: 120 }));
const heavyLimiter = basicRateLimit({ windowMs: 5 * 60 * 1000, max: 60 });

/* ------------------------------ Deps -------------------------------- */
const axios = require('axios');
const https = require('https');
const http  = require('http');

const ax = axios.create({
  timeout: 15000,
  httpAgent:  new http.Agent({  keepAlive: true, maxSockets: 25 }),
  httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 25 }),
  maxRedirects: 3,
  transitional: { clarifyTimeoutError: true }
});
router.ax = ax;

const fs = require('fs');
async function cleanupMany(paths = []) {
  const fsp = fs.promises;
  await Promise.all(
    (paths || [])
      .filter(Boolean)
      .map((p) => fsp.unlink(p).catch(() => null))
  );
}

const path = require('path');
// Where we store generated images
const GENERATED_DIR =
  process.env.GENERATED_DIR ||
  path.join(require('os').tmpdir(), 'generated');

// Make sure the folder exists
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// ---- Unify temp/output dirs so every feature uses the SAME place ----
const GEN_DIR = GENERATED_DIR;
function ensureGeneratedDir() {
  try { fs.mkdirSync(GEN_DIR, { recursive: true }); } catch {}
  return GEN_DIR;
}

const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const { getFbUserToken } = require('../tokenStore');
const db = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/* ---------- Template Compatibility Shim (non-overwriting) ---------- */
(() => {
  const G = (typeof globalThis !== 'undefined') ? globalThis : global;

  // escSVG2 alias (your code calls escSVG2; many files already have escSVG)
  if (typeof G.escSVG2 === 'undefined') {
    G.escSVG2 = (s) => {
      if (typeof G.escSVG === 'function') return G.escSVG(s);
      // minimal escape if escSVG isn't present
      return String(s || '')
        .replace(/&/g,'&amp;')
        .replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;');
    };
  }

  // CTA normalizer used by _ctaNormFromAnswers
  if (typeof G.cleanCTA === 'undefined') {
    G.cleanCTA = (ctaRaw = '', context = '') => {
      let c = String(ctaRaw || '').trim().toUpperCase();
      if (!c) {
        const ctx = String(context || '').toUpperCase();
        if (/\b(CALL|PHONE|QUOTE)\b/.test(ctx)) c = 'CALL NOW';
        else if (/\b(BOOK|RESERVE|APPOINT)\b/.test(ctx)) c = 'BOOK NOW';
        else if (/\b(FOOD|RESTAURANT|ORDER)\b/.test(ctx)) c = 'ORDER NOW';
        else c = 'LEARN MORE';
      }
      c = c.replace(/\s+/g, ' ').trim();
      if (c.length > 18) c = c.slice(0, 18);
      return c;
    };
  }

  // Solid dark CTA pill that your SVG calls via btnSolidDark(...)
  if (typeof G.btnSolidDark === 'undefined') {
    G.btnSolidDark = (cx = 0, cy = 0, label = 'LEARN MORE', fs = 28) => {
      const padX = Math.round(fs * 0.8);
      const padY = Math.round(fs * 0.55);
      const text = (typeof G.escSVG2 === 'function' ? G.escSVG2 : (x=>String(x||'')))(String(label || '').toUpperCase());
      const textW = Math.ceil(text.length * (fs * 0.6)); // rough, consistent
      const w = textW + padX * 2;
      const h = fs + padY * 2;
      const rx = Math.round(h / 2);
      const x = Math.round(cx - w / 2);
      const y = Math.round(cy - h / 2);
      const tx = x + Math.round(w / 2);
      const ty = y + Math.round(h / 2) + Math.round(fs * 0.35);
      return `
        <g>
          <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="#0d3b66"/>
          <text x="${tx}" y="${ty}" text-anchor="middle"
                font-family="Inter,Segoe UI,Arial" font-size="${fs}"
                font-weight="800" fill="#ffffff" letter-spacing="0.04em">${text}</text>
        </g>
      `;
    };
  }

  // ensureGeneratedDir used by PNG writers (safe: local requires inside)
  if (typeof G.ensureGeneratedDir === 'undefined') {
    G.ensureGeneratedDir = () => {
      const fs = require('fs');
      const path = require('path');
      const outDir = path.join(process.cwd(), 'generated');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      return outDir;
    };
  }

  // absolutePublicUrl used to return absolute URLs
  if (typeof G.absolutePublicUrl === 'undefined') {
    G.absolutePublicUrl = (rel = '') => {
      const base =
        process.env.BASE_URL ||
        process.env.VERCEL_URL ||
        process.env.RENDER_EXTERNAL_URL ||
        '';
      if (!base) return rel; // fallback to relative if unknown
      const norm = base.startsWith('http') ? base : `https://${base}`;
      return `${norm.replace(/\/+$/,'')}${rel.startsWith('/') ? '' : '/'}${rel}`;
    };
  }
})();

function safeUnlink(p) {
  try {
    if (!p) return;
    require("fs").unlink(p, () => {});
  } catch {}
}

function cleanupManyLegacy(paths) {
  try {
    (paths || []).filter(Boolean).forEach(safeUnlink);
  } catch {}
}

/* ---------------------- Disk / tmp housekeeping --------------------- */
function dirStats(p) {
  try {
    const files = fs.readdirSync(p).map((f) => ({ f, full: path.join(p, f) }))
      .filter((x) => fs.existsSync(x.full) && fs.statSync(x.full).isFile())
      .map((x) => ({ ...x, st: fs.statSync(x.full) }))
      .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
    const bytes = files.reduce((n, x) => n + x.st.size, 0);
    return { files, bytes };
  } catch { return { files: [], bytes: 0 }; }
}

const MAX_TMP_BYTES = Number(process.env.MAX_TMP_BYTES || 300 * 1024 * 1024);
function sweepTmpDirHardCap() {
  ensureGeneratedDir();
  const { files, bytes } = dirStats(GEN_DIR);
  let cur = bytes;
  for (const x of files) {
    if (cur <= MAX_TMP_BYTES) break;
    try { fs.unlinkSync(x.full); } catch {}
    cur -= x.st.size;
  }
}
function sweepTmpByAge(ttlMs) {
  ensureGeneratedDir();
  const now = Date.now();
  for (const f of fs.readdirSync(GEN_DIR) || []) {
    const full = path.join(GEN_DIR, f);
    try {
      const st = fs.statSync(full);
      if (st.isFile() && now - st.mtimeMs > ttlMs) fs.unlinkSync(full);
    } catch {}
  }
}
function housekeeping() {
  try {
    sweepTmpByAge(Number(process.env.ASSET_TTL_MS || 2 * 60 * 60 * 1000));
    sweepTmpDirHardCap();
  } catch {}
}
function maybeGC() { if (global.gc) { try { global.gc(); } catch {} } }

/* -------------------------- Public base URL ------------------------- */
function publicBase() {
  return (
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com'
  );
}
function absolutePublicUrl(relativePath) {
  if (!relativePath) return '';
  if (/^https?:\/\//i.test(relativePath)) return relativePath;
  return `${publicBase()}${relativePath}`;
}

/* ------------------------------ Helpers ----------------------------- */
router.get('/test', (_req, res) => res.json({ msg: 'AI route is working!' }));

function getUserToken(req) {
  const auth = req?.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req?.session?.fbUserAccessToken) return req.session.fbUserAccessToken;
  if (req?.body?.userAccessToken) return req.body.userAccessToken;
  return getFbUserToken() || null;
}

// Pick a drawtext-capable font that exists on Render/Debian or fall back.
function pickFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  // last resort: omit fontfile (may still work locally)
  return '';
}

/* ---------- IMAGE TEMPLATE RESOLVER (no more Pexels for images) ---------- */
/**
 * You can point these to local files, S3, or CDN. Examples:
 *  - Local file served by /api/media: absolutePublicUrl('/api/media/yourfile.jpg')
 *  - External CDN/URL: 'https://cdn.example.com/templates/fashion-01.jpg'
 */
const TEMPLATE_MAP = {
  generic: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Generic+Template',
  fashion: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Fashion',
  fitness: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Fitness',
  cosmetics: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Beauty',
  hair: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Hair+Care',
  food: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Food',
  pets: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Pets',
  electronics: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Tech',
  home: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Home',
  coffee: 'https://dummyimage.com/1200x628/1b1f24/ffffff&text=Coffee',
};

/**
 * Priority:
 *  1) body.imageUrl
 *  2) answers.imageUrl
 *  3) body.templateKey (matches TEMPLATE_MAP key)
 *  4) answers.industry/category → TEMPLATE_MAP
 *  5) TEMPLATE_MAP.generic
 */
function resolveTemplateUrl({ body = {}, answers = {} } = {}) {
  const direct = (body.imageUrl || answers.imageUrl || '').trim();
  if (direct) return direct;

  const keyRaw = (body.templateKey || answers.templateKey || '').trim().toLowerCase();
  if (keyRaw && TEMPLATE_MAP[keyRaw]) return TEMPLATE_MAP[keyRaw];

  const cat = resolveCategory(answers || {}) || 'generic';
  if (TEMPLATE_MAP[cat]) return TEMPLATE_MAP[cat];

  return TEMPLATE_MAP.generic;
}

/* --------------------- Range-enabled media streamer --------------------- */
router.get(['/media/:file', '/api/media/:file'], async (req, res) => {
  housekeeping();
  try {
    const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const full = path.join(ensureGeneratedDir(), file);
    if (!fs.existsSync(full)) return res.status(404).end();

    const stat = fs.statSync(full);
    const ext = path.extname(full).toLowerCase();
    const type =
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' :
      ext === '.srt' ? 'text/plain; charset=utf-8' :
      ext === '.ass' ? 'text/plain; charset=utf-8' :
      'application/octet-stream';

    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    // (Images: no partial-range special casing required)
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(full).pipe(res);
  } catch (e) {
    console.error('[media] stream error:', e);
    res.status(500).end();
  }
});

function mediaPath(relativeFilename) {
  return `/api/media/${relativeFilename}`;
}

/* ---------- Persist generated assets (24h TTL) ---------- */
const ASSET_TTL_MS = Number(process.env.ASSET_TTL_MS || 24 * 60 * 60 * 1000);
function ownerKeyFromReq(req) {
  const cookieSid = req?.cookies?.sm_sid;
  const headerSid = req?.headers?.['x-sm-sid'];
  const auth = req?.headers?.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  return cookieSid || headerSid || bearer || `ip:${req.ip}`;
}
async function ensureAssetsTable() {
  await db.read();
  db.data = db.data || {};
  db.data.generated_assets = db.data.generated_assets || [];
  await db.write();
}
async function purgeExpiredAssets() {
  await ensureAssetsTable();
  const now = Date.now();
  const before = db.data.generated_assets.length;
  db.data.generated_assets = db.data.generated_assets.filter((a) => (a.expiresAt || 0) > now);
  if (db.data.generated_assets.length !== before) await db.write();
}
async function saveAsset({ req, kind, url, absoluteUrl, meta = {} }) {
  await ensureAssetsTable();
  await purgeExpiredAssets();
  const owner = ownerKeyFromReq(req);
  const now = Date.now();
  const rec = {
    id: uuidv4(), owner, kind, url, absoluteUrl, meta,
    createdAt: now, expiresAt: now + ASSET_TTL_MS,
  };
  db.data.generated_assets.push(rec);
  const mine = db.data.generated_assets
    .filter((a) => a.owner === owner)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (mine.length > 50) {
    const keepIds = new Set(mine.slice(0, 50).map((a) => a.id));
    db.data.generated_assets = db.data.generated_assets.filter(
      (a) => a.owner !== owner || keepIds.has(a.id)
    );
  }
  await db.write();
  housekeeping();
  return rec;
}

/* ---------- Topic/category & keywords ---------- */
const IMAGE_KEYWORD_MAP = [
  { match: ['comic','comics','manga','graphic','graphic novel','book','books','bookstore'], keyword: 'comic books graphic novels' },
  { match: ['protein','supplement','muscle','fitness','gym','workout'], keyword: 'gym workout' },
  { match: ['clothing','fashion','apparel','accessory','athleisure'], keyword: 'fashion model' },
  { match: ['makeup','cosmetic','skincare'], keyword: 'makeup application' },
  { match: ['hair','shampoo','conditioner','styling'], keyword: 'hair care' },
  { match: ['food','pizza','burger','meal','snack','kitchen'], keyword: 'delicious food' },
  { match: ['baby','kids','toys'], keyword: 'happy children' },
  { match: ['pet','dog','cat'], keyword: 'pet dog cat' },
  { match: ['electronics','phone','laptop','tech','gadget'], keyword: 'tech gadgets' },
  { match: ['home','decor','furniture','bedroom','bath'], keyword: 'modern home' },
  { match: ['coffee','cafe','espresso'], keyword: 'coffee shop' },
];
function getImageKeyword(industry = '', url = '', answers = {}) {
  const fields = [
    industry, url, answers.productType, answers.description,
    answers.mainBenefit, answers.topic, answers.category
  ].filter(Boolean).join(' ').toLowerCase();
  for (const row of IMAGE_KEYWORD_MAP)
    if (row.match.some((m) => fields.includes(m))) return row.keyword;
  if (/\bcomic|manga|graphic\s*novel|book(s)?\b/.test(fields)) return 'comic book store';
  return industry || 'ecommerce products';
}

function resolveCategory(answers = {}) {
  const txt = `${answers.industry || ''} ${answers.productType || ''} ${answers.description || ''} ${answers.topic || ''}`.toLowerCase();
  if (/comic|comics|manga|graphic\s*novel|bookstore|book(s)?/.test(txt)) return 'books';
  if (/fashion|apparel|clothing|athleisure|outfit|wardrobe/.test(txt)) return 'fashion';
  if (/fitness|gym|workout|trainer|supplement|protein|yoga|crossfit|wellness/.test(txt)) return 'fitness';
  if (/makeup|cosmetic|skincare|beauty|serum|lipstick|foundation/.test(txt)) return 'cosmetics';
  if (/hair|shampoo|conditioner|styling/.test(txt)) return 'hair';
  if (/food|snack|meal|restaurant|pizza|burger|drink|beverage|kitchen/.test(txt)) return 'food';
  if (/pet|dog|cat|petcare|treats/.test(txt)) return 'pets';
  if (/electronics|phone|laptop|tech|gadget|device|camera/.test(txt)) return 'electronics';
  if (/home|decor|kitchen|furniture|bedroom|bath/.test(txt)) return 'home';
  if (/coffee|café|espresso|latte|roast/.test(txt)) return 'coffee';
  return 'generic';
}

const FASHION_TERMS = /\b(style|styles|outfit|outfits|wardrobe|pieces|fits?|colors?|sizes?)\b/gi;
function stripFashionIfNotApplicable(text, category) {
  if (category === 'fashion') return String(text || '');
  return String(text || '').replace(FASHION_TERMS, () => 'options');
}
function enforceCategoryPresence(text, category) {
  text = String(text || '');
  const hasAny = (arr) => arr.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(text));
  const APPEND = (line) => (text.replace(/\s+/g, ' ').trim().replace(/[.]*\s*$/, '') + '. ' + line).trim();
  const req = {
    books: ['book','comic','manga','story','read'],
    fitness: ['workout','training','gym','strength','wellness'],
    cosmetics: ['skin','makeup','beauty','serum','routine'],
    hair: ['hair','shampoo','conditioner','styling'],
    food: ['fresh','flavor','taste','meal','snack'],
    pets: ['pet','dog','cat','treat'],
    electronics: ['tech','device','gadget','performance'],
    home: ['home','kitchen','decor','space'],
    coffee: ['coffee','brew','roast','espresso'],
    fashion: ['style','outfit','fabric','fit'],
  }[category] || [];
  if (!req.length || hasAny(req)) return text;
  const injection = {
    books: 'Explore stories, comics, and graphic novels.',
    fitness: 'Designed for your workout and training.',
    cosmetics: 'Made to fit into your beauty routine.',
    hair: 'Helps you care for and style your hair.',
    food: 'Made for great taste and an easy experience.',
    pets: 'Made for everyday pet care with less hassle.',
    electronics: 'Built for reliable performance.',
    home: 'A simple way to upgrade your space.',
    coffee: 'Balanced flavor for a better coffee break.',
    fashion: 'Find a look that works for you.',
    generic: 'Easy to get started.',
  }[category];
  return APPEND(injection);
}
function cleanFinalText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s([.!?,])/g, '$1')
    .replace(/(?:https?:\/\/)?(?:www\.)?[a-z0-9\-]+\.[a-z]{2,}(?:\/\S*)?/gi, '')
    .replace(/\b(dot|com|net|org|io|co)\b/gi, '')
    .trim();
}
function categoryLabelForOverlay(category) {
  return {
    books: 'BOOKS', fashion: 'FASHION', fitness: 'TRAINING', cosmetics: 'BEAUTY', hair: 'HAIR CARE',
    food: 'FOOD', pets: 'PET CARE', electronics: 'TECH', home: 'HOME',
    coffee: 'COFFEE', generic: 'SHOP',
  }[category || 'generic'];
}
function overlayTitleFromAnswers(answers = {}, categoryOrTopic = '') {
  const category =
    categoryOrTopic &&
    /^(books|fashion|fitness|cosmetics|hair|food|pets|electronics|home|coffee|generic)$/i.test(categoryOrTopic)
      ? String(categoryOrTopic).toLowerCase()
      : null;
  const brand = (answers.businessName || '').trim().toUpperCase();
  const topic = (answers.topic || answers.productType || '').trim().toUpperCase();
  if (brand) {
    const label = category ? categoryLabelForOverlay(category) : (topic || 'SHOP');
    const words = brand.split(/\s+/);
    return (words.length === 1 ? `${brand} ${label}` : brand).slice(0, 30);
  }
  if (topic) return topic.slice(0, 30);
  if (category) return categoryLabelForOverlay(category);
  return 'SHOP';
}

/* ------------------------ Training context ------------------------ */
const DATA_DIR = path.join(__dirname, '../data');
const ALLOWED_EXT = new Set(['.txt', '.md', '.markdown', '.json']);
const MAX_FILE_MB = 1.5;
const MAX_TOTAL_CHARS = 45000;
function loadTrainingContext() {
  if (!fs.existsSync(DATA_DIR)) return '';
  const files = fs.readdirSync(DATA_DIR)
    .map((f) => path.join(__dirname, '../data', f))
    .filter((full) => {
      const ext = path.extname(full).toLowerCase();
      try {
        const st = fs.statSync(full);
        return st.isFile() && ALLOWED_EXT.has(ext) && st.size <= MAX_FILE_MB * 1024 * 1024;
      } catch { return false; }
    });
  let ctx = '';
  for (const f of files) {
    try {
      const ext = path.extname(f).toLowerCase();
      let text = fs.readFileSync(f, 'utf8');
      if (ext === '.json') { try { text = JSON.stringify(JSON.parse(text)); } catch {} }
      if (!text.trim()) continue;
      const block = `\n\n### SOURCE: ${path.basename(f)}\n${text}\n`;
      if (ctx.length + block.length <= MAX_TOTAL_CHARS) ctx += block;
    } catch {}
  }
  return ctx.trim();
}
let customContext = loadTrainingContext();

/* ---------------------------- Scrape ---------------------------- */
async function getWebsiteText(url) {
  try {
    const clean = String(url || '').trim();
    if (!clean || !/^https?:\/\//i.test(clean)) throw new Error('Invalid URL');
    const { data, headers } = await axios.get(clean, {
      timeout: 6500, maxRedirects: 3, validateStatus: (s) => s < 400,
    });
    if (!headers['content-type']?.includes('text/html')) throw new Error('Not HTML');
    const body = String(data)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (body.length < 200 || /cloudflare|access denied|429/i.test(body)) throw new Error('blocked/short');
    return body.slice(0, 3000);
  } catch { return ''; }
}

/* --------------------------- Ad Copy --------------------------- */
router.post('/generate-ad-copy', async (req, res) => {
  const { description = '', businessName = '', url = '', answers = {} } = req.body;
  if (!description && !businessName && !url && !answers?.industry) {
    return res.status(400).json({ error: 'Please provide at least a description.' });
  }
  const category = resolveCategory(answers || {});
  const forbidFashionLine =
    category === 'fashion' ? '' : `- Do NOT mention clothing terms like styles, fits, colors, sizes, outfits, wardrobe.`;

  let prompt = `You are an expert direct-response ad copywriter for e-commerce/online businesses.
${customContext ? `TRAINING CONTEXT:\n${customContext}\n\n` : ''}Write short ad copy for a static social ad.
- Keep it neutral and accurate; avoid assumptions about shipping, returns, guarantees, or inventory.
- Keep it specific to the industry/category: ${category}.
${forbidFashionLine}
- Hook → value → simple CTA (from: “Shop now”, “Buy now”, “Learn more”, “Visit us”, “Check us out”, “Take a look”, “Get started”).
- Do NOT mention a website or domain.
Output ONLY the ad copy text.`;
  if (description) prompt += `\nBusiness Description: ${description}`;
  if (businessName) prompt += `\nBusiness Name: ${businessName}`;
  if (answers?.industry) prompt += `\nIndustry: ${answers.industry}`;
  if (url) prompt += `\nWebsite (for context only): ${url}`;

  try {
    const TIMEOUT_MS = 5000;
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('assets-timeout')), ms))]);

    const r = await withTimeout(
      openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.35,
      }),
      TIMEOUT_MS
    );

    let script = r.choices?.[0]?.message?.content?.trim() || '';
    const categoryFixed = resolveCategory(answers || {});
    script = stripFashionIfNotApplicable(script, categoryFixed);
    script = enforceCategoryPresence(script, categoryFixed);
    script = cleanFinalText(script);
    res.json({ adCopy: script });
  } catch {
    res.json({ adCopy: 'A simple way to get started with less hassle and more value. Learn more.' });
  }
});

/* ------------------- Campaign assets (headline/body/cta) ------------------- */
router.post('/generate-campaign-assets', async (req, res) => {
  try {
    const { answers = {}, url = '' } = req.body;
    const category = resolveCategory(answers || {});
    const brandFromUrl = (u = '') => {
      try {
        const h = new URL(u).hostname.replace(/^www\./, '');
        const base = h.split('.')[0] || 'Your Brand';
        return base.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      } catch { return 'Your Brand'; }
    };
    const brand = (answers.businessName && String(answers.businessName).trim()) || brandFromUrl(url);
    const industry = (answers.industry && String(answers.industry).trim()) || '';
    const mainBenefit = (answers.mainBenefit && String(answers.mainBenefit).trim()) || '';
    const offer = (answers.offer && String(answers.offer).trim()) || '';

    let websiteText = '';
    try { if (url && /^https?:\/\//i.test(url)) websiteText = await getWebsiteText(url); } catch {}

    const forbidFashionLine =
      category === 'fashion' ? '' : `- Do NOT mention clothing terms like styles, fits, colors, sizes, outfits, wardrobe.`;

const prompt = `
${customContext ? `TRAINING CONTEXT:\n${customContext}\n\n` : ''}You are a senior direct-response copywriter.

Return JSON ONLY:
{
  "headline": "max 55 characters",
  "body": "18-30 words",
  "image_overlay_text": "2-4 words in ALL CAPS"
}

Rules:
- NEVER quote the user's wording verbatim; always paraphrase.
- Keep it specific to the category: ${category}.
${forbidFashionLine}
- Neutral and accurate. Do NOT invent shipping, returns, guarantees, pricing, discounts, or inventory.
- No emojis. No hashtags. No website/domain.

Context:
Brand: ${brand}
Industry: ${industry || '[general]'}
Main benefit: ${mainBenefit || '[unspecified]'}
Offer (verbatim user input, if any): ${offer || '[none]'}
Website text (context only): """${(websiteText || '').slice(0, 1200)}"""
`.trim();


    const TIMEOUT_MS = 5000;
    const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('assets-timeout')), ms))]);

    let r = null;
    try {
      r = await withTimeout(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 220,
          temperature: 0.35,
        }),
        TIMEOUT_MS
      );
    } catch {}

    let headline = '', body = '', overlay = '';
    try {
      const raw = r?.choices?.[0]?.message?.content?.trim() || '{}';
      const jsonStr = (raw.match(/\{[\s\S]*\}/) || [raw])[0];
      const parsed = JSON.parse(jsonStr);
      const clean = (s, max = 200) => cleanFinalText(String(s || '')).slice(0, max);
      headline = clean(parsed.headline, 55);
      let bodyRaw = clean(parsed.body, 220)
        .replace(/\bhigh quality quality\b/gi, 'high quality')
        .replace(/\bthe best quality\b/gi, 'great quality')
        .replace(/\bour better made\b/gi, 'better made');
      body = stripFashionIfNotApplicable(bodyRaw, category);
      overlay = clean(parsed.image_overlay_text, 28);
    } catch {
      headline = `${brand}: New Products`;
      body = 'Explore useful products designed for daily use, with a focus on simplicity and value. See what works best for you.';
      overlay = 'LEARN MORE';
    }

    headline = headline.replace(/["<>]/g, '').slice(0, 55);
    body = body.replace(/["<>]/g, '').trim();
    overlay = (overlay || 'LEARN MORE').toUpperCase();

    return res.json({ headline, body, image_overlay_text: overlay });
  } catch {
    return res.json({
      headline: 'New Products Just In',
      body: 'Explore everyday products designed for simplicity and value. See what’s new and find what works for you.',
      image_overlay_text: 'LEARN MORE',
    });
  }
});

/* === GPT: craftAdCopyFromAnswers === */
async function craftAdCopyFromAnswers({ industry, businessName, brand = {}, answers = {} }, openai) {
  const brandName = businessName || answers.businessName || "Your Business";
  const details = {
    industry: (industry || answers.industry || "").toString(),
    city: answers.city || answers.location || "",
    valueProps: answers.valueProps || answers.benefits || answers.features || "",
    offer: answers.offer || "",
    tone: answers.tone || "confident, benefit-first, concise",
    audience: answers.audience || "",
  };

  const sys = [
    "You write on-ad copy for a static social ad.",
    "Never quote user text verbatim; always paraphrase.",
    "Keep it short, bold, and skimmable. No hashtags. No emojis.",
    "Conform to the JSON schema exactly. Do not add extra keys.",
    "Do NOT invent offers, discounts, shipping, returns, guarantees, or inventory claims that were not clearly provided in the inputs.",
    "If the user did not mention shipping, returns, guarantees, or inventory, you must NOT mention them at all.",
    "If no explicit promo/discount is mentioned, keep the 'offer' short and generic or empty, but do not invent percentages or 'free' anything.",
  ].join(" ");

  const userPrompt = `
Brand: ${brandName}
Industry: ${details.industry}
City/Area: ${details.city}
Audience: ${details.audience}
Value Props: ${details.valueProps}
Offer (verbatim from user, if any): ${details.offer}
Tone: ${details.tone}

Rules:
- Stay strictly within the information above.
- Do NOT add 'free shipping', 'fast shipping', 'money-back guarantee', 'lifetime warranty', 'limited inventory', or any similar promises unless they appear in the Offer line above.

Write ad copy that fits the schema below. Do NOT copy user phrases ≥3 words. Paraphrase everything.

Return JSON only:
{
  "headline": "...",
  "subline": "...",
  "cta": "...",
  "offer": "...",
  "bullets": ["...", "...", "..."],
  "disclaimers": "..."
}
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-5.1",
    temperature: 0.7,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const scrubAssumptive = (s = "") => {
    let out = String(s || "");
    const banned = [
      /free shipping/gi,
      /fast shipping/gi,
      /two[-\s]?day shipping/gi,
      /same[-\s]?day shipping/gi,
      /money[-\s]?back guarantee/gi,
      /risk[-\s]?free/gi,
      /guaranteed results?/gi,
      /lifetime warranty/gi,
      /always in stock/gi,
      /limited inventory/gi,
      /ships? today/gi,
      /free returns?/gi,
      /hassle[-\s]?free returns?/gi,
    ];
    for (const re of banned) out = out.replace(re, "");
    return out.replace(/\s+/g, " ").trim();
  };

  let parsed;
  try {
    parsed = JSON.parse(resp.choices[0].message.content);
  } catch {
    parsed = {
      headline: "Quality You Can See",
      subline: "Premium results, fast turnaround",
      cta: "Get Quote",
      offer: details.offer || "",
      bullets: ["Expert service", "Honest pricing", "Local & trusted"],
      disclaimers: "",
    };
  }

  if (!Array.isArray(parsed.bullets)) parsed.bullets = [];

  parsed.headline     = scrubAssumptive(parsed.headline || "");
  parsed.subline      = scrubAssumptive(parsed.subline || "");
  parsed.cta          = scrubAssumptive(parsed.cta || "");
  parsed.offer        = scrubAssumptive(parsed.offer || details.offer || "");
  parsed.disclaimers  = scrubAssumptive(parsed.disclaimers || "");
  parsed.bullets      = parsed.bullets.map(b => scrubAssumptive(b || "")).filter(Boolean).slice(0, 3);

  return parsed;
}

/* === buildStaticAdPayload (uses crafted copy) === */
async function buildStaticAdPayload({ answers = {}, brand = {}, industry = "" }) {
  const copy = await craftAdCopyFromAnswers(
    { industry: industry || answers.industry, businessName: answers.businessName, brand, answers },
    openai
  );

  return {
    copy,
    brand,
    meta: { industry: industry || answers.industry || "" }
  };
}

/* === ROUTE: /api/generate-static-ad (templates: flyer_a, poster_b) ======================= */
router.post('/generate-static-ad', async (req, res) => {
  try {
    const { template = '', answers = {}, imageUrl = '' } = req.body || {};
    if (!template || !/^(flyer_a|poster_b)$/i.test(template)) {
      return res.status(400).json({
        error: 'invalid_template',
        message: 'Use template: flyer_a or poster_b'
      });
    }

  // Generate real ad copy (headline + body) instead of pasting user text
let generated = null;
try {
  generated = await craftAdCopyFromAnswers(
    {
      industry: answers.industry || "",
      businessName: answers.businessName || answers.brand || "",
      brand: {},
      answers
    },
    openai
  );
} catch {}

const copy = {
  brand: answers.businessName || answers.brand || "",
  headline: (generated?.headline || "").trim(),
  subhead: (generated?.subline || "").trim(),
  valueLine: (generated?.offer || (generated?.bullets || []).slice(0, 2).join(" • ") || "").trim(),
  body: ((generated?.bullets || []).slice(0, 3).join(" • ") || generated?.subline || "").trim(),
  legal: (generated?.disclaimers || "").trim(),
  cta: (generated?.cta || answers.cta || "LEARN MORE").trim()
};


    // Prefer a user-supplied image if provided.
    const photoUrl = answers.imageUrl || imageUrl || '';

    // Generate
    let out;
    if (/^flyer_a$/i.test(template)) {
      out = await renderTemplateA_FlyerPNG({ answers });
    } else {
      out = await renderTemplateB_PosterPNG({
        answers,
        imageUrl: photoUrl,
        strict: true,
        copy
      });
    }

    // Persist so your carousel picks it up first
    const rec = await saveAsset({
      req,
      kind: 'image',
      url: out.publicUrl,
      absoluteUrl: out.absoluteUrl,
      meta: {
        template: template.toLowerCase(),
        businessName: answers?.businessName || '',
        industry: answers?.industry || '',
        phone: answers?.phone || answers?.phoneNumber || ''
      }
    });

    return res.json({
      ok: true,
      url: out.publicUrl,
      absoluteUrl: out.absoluteUrl,
      filename: out.filename,
      type: 'image/png',
      asset: { id: rec.id, createdAt: rec.createdAt },
      ready: true
    });
  } catch (e) {
    console.error('[generate-static-ad] error:', e?.message || e);
    return res.status(500).json({ error: 'internal_error', message: e?.message || 'failed' });
  }
});

/* ---------------------- IMAGE OVERLAYS (fit-to-box + coherent copy) ---------------------- */
function escSVG(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function estWidthSerif(text, fs, letterSpacing = 0) { const t = String(text || ''), n = t.length || 1; return n * fs * 0.54 + Math.max(0, n - 1) * letterSpacing; }
function fitFont(text, maxW, startFs, minFs = 26) { let fs = startFs; while (fs > minFs && estWidthSerif(text, fs, 0.1) > maxW) fs -= 2; return fs; }
const BANNED_TERMS = /\b(unisex|global|vibes?|forward|finds?|chic|bespoke|avant|couture)\b/i;
function cleanHeadline(h) {
  h = String(h || '').replace(/[^a-z0-9 &\-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!h || BANNED_TERMS.test(h)) return '';
  const words = h.split(' '); if (words.length > 6) h = words.slice(0, 6).join(' ');
  return h.toUpperCase();
}
const sentenceCase = (s='') => { s = String(s).toLowerCase().replace(/\s+/g,' ').trim(); return s ? s[0].toUpperCase()+s.slice(1) : s; };

/* === STATIC IMAGE TEMPLATES (A: Flyer, B: Poster) ========================================= */

function _normPhone(p='') {
  const s = String(p).replace(/[^\d]/g,'');
  if (s.length === 11 && s.startsWith('1')) return `(${s.slice(1,4)}) ${s.slice(4,7)}-${s.slice(7)}`;
  if (s.length === 10) return `(${s.slice(0,3)}) ${s.slice(3,6)}-${s.slice(6)}`;
  if (!p) return '';
  return String(p).replace(/\s+/g,' ').trim();
}
function _titleCaps(s='') {
  s = String(s).trim();
  if (!s) return '';
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function _upperSafe(s='', max=42) {
  return String(s).replace(/\s+/g,' ').trim().toUpperCase().slice(0, max);
}
function _fallback(val, fallback) {
  const s = String(val || '').trim();
  return s ? s : fallback;
}
function _listFromAnswers(answers={}, keys=[], fallbackList=[]) {
  const got = [];
  for (const k of keys) {
    const v = answers[k];
    if (Array.isArray(v)) got.push(...v);
    else if (typeof v === 'string' && v.trim()) got.push(v.trim());
  }
  const uniq = Array.from(new Set(got.map(x => String(x).trim()).filter(Boolean)));
  return uniq.length ? uniq : fallbackList;
}
function _ctaNormFromAnswers(answers={}) {
  return cleanCTA(answers?.cta || '', answers?.businessName || answers?.industry || '');
}
function _industryLabel(answers={}) {
  const raw = String(answers.industry || answers.category || '').trim();
  if (!raw) return 'SALE';
  return `${_upperSafe(raw, 18)} SALE!`;
}
function _offerLine(answers={}) {
  const offer = String(answers.offer || answers.mainBenefit || '').trim();
  if (offer) return _titleCaps(offer).replace(/\s+/g,' ').slice(0, 36);
  return 'Limited Time Offer';
}
function _legalLine(answers={}) {
  return String(answers.disclaimers || answers.legal || '*OAC. Limited time.').slice(0, 80);
}
function _cityLine(answers={}) {
  const city = answers.location || answers.city || answers.region || '';
  return _titleCaps(city).slice(0, 22);
}
function _brandText(answers={}) {
  return _titleCaps(answers.businessName || 'Your Brand').slice(0, 28);
}
function _savePercentFromText(s='') {
  const m = String(s).match(/\b(\d{1,2})\s*%/);
  return m ? `${m[1]}%` : '';
}

/* ---------------- Template A: Flyer (teal header, diagonal split) ---------------- */
async function renderTemplateA_FlyerPNG({ answers = {} }) {
  const W = 1200, H = 628, R = 28;

  const colors = {
    teal: '#0d3b66',
    aqua: '#e6f3f8',
    accent: '#ffc857',
    textDark: '#0f141a',
    textLight: '#ffffff',
    pinRed: '#e63946',
    grid: '#d8e2eb'
  };
  const brand = _brandText(answers);
  const headline = _fallback(answers.title, brand);
  const offerLine = _offerLine(answers);
  const city = _cityLine(answers);
  const phone = _normPhone(answers.phone || answers.phoneNumber || '');
  const cta = _ctaNormFromAnswers(answers) || 'CALL NOW';

  const leftList = _listFromAnswers(
    answers,
    ['frequencies','scheduling','scheduleOptions'],
    ['One-Time', 'Weekly', 'Bi-Weekly', 'Monthly']
  );
  const rightList = _listFromAnswers(
    answers,
    ['services','serviceList','offerings'],
    ['Deep Clean', 'Standard Clean', 'Move-In/Out', 'Windows', 'Carpet']
  );

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <clipPath id="card"><rect x="0" y="0" width="${W}" height="${H}" rx="${R}"/></clipPath>
      <linearGradient id="diag" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffffff"/>
        <stop offset="100%" stop-color="${colors.aqua}"/>
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="${W}" height="${H}" rx="${R}" fill="#ffffff" />
    <g clip-path="url(#card)">
      <rect x="0" y="0" width="${W}" height="132" fill="${colors.teal}"/>
      <text x="36" y="86" font-family="Inter,Segoe UI,Arial" font-size="46" font-weight="800" fill="${colors.textLight}">
        ${escSVG2(headline)}
      </text>
      <text x="${W-36}" y="86" font-family="Inter,Segoe UI,Arial" font-size="32" font-weight="700" fill="${colors.textLight}" text-anchor="end">
        ${escSVG2(offerLine)}
      </text>

      <path d="M0,132 L${W},132 L${W},${H} L0,${H-90} Z" fill="url(#diag)"/>

      <g transform="translate(48, 190)">
        <text x="0" y="0" font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="${colors.textDark}">
          ${escSVG2('Plans')}
        </text>
        ${leftList.map((t, i) => `
          <g transform="translate(0, ${34 + i*42})">
            <circle cx="12" cy="12" r="12" fill="${colors.teal}"/>
            <path d="M7,12 l5,5 l10,-12" fill="none" stroke="#fff" stroke-width="3"/>
            <text x="36" y="16" font-family="Inter,Segoe UI,Arial" font-size="24" font-weight="600" fill="${colors.textDark}">
              ${escSVG2(t)}
            </text>
          </g>
        `).join('')}
      </g>

      <g transform="translate(${W-520}, 190)">
        <text x="0" y="0" font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="${colors.textDark}">
          ${escSVG2('Services Offered')}
        </text>
        ${rightList.map((t, i) => `
          <g transform="translate(0, ${34 + i*40})">
            <rect x="0" y="2" width="10" height="10" fill="${colors.accent}" rx="2"/>
            <text x="22" y="16" font-family="Inter,Segoe UI,Arial" font-size="24" font-weight="600" fill="${colors.textDark}">
              ${escSVG2(t)}
            </text>
          </g>
        `).join('')}
      </g>

      <g transform="translate(0, ${H-160})">
        <rect x="0" y="0" width="${W}" height="70" fill="#ffffff" />
        <rect x="0" y="70" width="${W}" height="2" fill="${colors.grid}"/>
        <g transform="translate(36, 18)">
          <circle cx="12" cy="12" r="12" fill="${colors.pinRed}"/>
          <path d="M12,6 C8,6 6,9 6,12 c0,5 6,10 6,10 s6,-5 6,-10 c0,-3 -2,-6 -6,-6 z" fill="#fff" opacity="0.9"/>
          <text x="36" y="18" font-family="Inter,Segoe UI,Arial" font-size="24" font-weight="700" fill="${colors.textDark}">
            ${escSVG2(city || 'Local Coverage')}
          </text>
        </g>
      </g>

      <g transform="translate(0, ${H-86})">
        <rect x="0" y="0" width="${W}" height="86" fill="${colors.teal}" />
        <rect x="0" y="-2" width="${W}" height="2" fill="rgba(0,0,0,0.12)"/>
        <g transform="translate(${W-260}, 43)">
          ${btnSolidDark(0, 0, cta || 'CALL NOW', 26)}
        </g>
        <text x="36" y="54" font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="#ffffff">
          ${escSVG2(phone || 'Call Today')}
        </text>
      </g>
    </g>
  </svg>`;

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.png`;
  await sharp(Buffer.from(svg, 'utf8'), { density: 180 })
    .png()
    .toFile(path.join(outDir, file));
  return { publicUrl: `/api/media/${file}`, absoluteUrl: absolutePublicUrl(`/api/media/${file}`), filename: file };
}

/* ---------------- Template B: Poster (photo bg + centered white card) --------------- */
async function renderTemplateB_PosterPNG({ answers = {}, imageUrl = '', strict = false, copy = {} }) {
  const W = 1200, H = 628, R = 28;

  const bgUrl = imageUrl || resolveTemplateUrl({ answers });
  const imgRes = await ax.get(bgUrl, { responseType: 'arraybuffer', timeout: 12000 });
  const bgBuf = await sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const brand = strict ? (copy.brand || '') : _brandText(answers);
  const cta   = strict ? cleanCTA(copy.cta || '', brand)
                       : (_ctaNormFromAnswers(answers) || '');

  const savePct     = _savePercentFromText(answers.offer || '');
  const bigHeadline = strict ? _upperSafe(copy.headline || copy.posterHeadline || '', 34)
                             : _upperSafe(answers?.posterHeadline || _industryLabel(answers), 34);

  const secondary1  = strict ? (copy.subhead || copy.dateRange || '')
                             : _fallback(answers?.dateRange || 'Limited Time', 'Limited Time');

  const secondary2  = strict ? (copy.valueLine || copy.offer || '')
                             : (savePct ? `Save up to ${savePct}` : _offerLine(answers));

  const legal       = strict ? (copy.legal || '') : _legalLine(answers);
  const body        = strict ? (copy.body || '')  : (answers.body || '');

  const CARD_W = 760, CARD_H = 400;
  const CX = Math.round(W/2), CY = Math.round(H/2) + 8;
  const cardX = Math.round(CX - CARD_W/2), cardY = Math.round(CY - CARD_H/2);

  const svg = `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <image id="bg" href="data:image/jpeg;base64,${bgBuf.toString('base64')}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.28"/>
      </filter>
    </defs>

    <use href="#bg"/>
    <radialGradient id="vig" cx="50%" cy="50%" r="70%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)" opacity="0.22"/>

    <rect x="12" y="12" width="${W-24}" height="${H-24}" rx="${R}" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="3"/>

    <g filter="url(#shadow)">
      <rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="18" fill="#ffffff"/>
    </g>

    ${_maybe(brand, `
    <text x="${CX}" y="${cardY + 58}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="22" font-weight="800" fill="#0f141a" opacity="0.85">
      ${escSVG(brand)}
    </text>`)}

    ${_maybe(bigHeadline, `
    <text x="${CX}" y="${cardY + 130}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="54" font-weight="900" fill="#0f141a" letter-spacing="0.04em">
      ${escSVG(bigHeadline)}
    </text>`)}

    ${_maybe(secondary1, `
    <text x="${CX}" y="${cardY + 180}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="26" font-weight="700" fill="#0f141a">
      ${escSVG(secondary1)}
    </text>`)}

    ${_maybe(secondary2, `
    <text x="${CX}" y="${cardY + 214}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="#0d3b66">
      ${escSVG(secondary2)}
    </text>`)}

    ${_maybe(body, `
    <text x="${CX}" y="${cardY + 250}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="18" font-weight="600" fill="#6b7280" opacity="0.95">
      ${escSVG(body)}
    </text>`)}

    ${_maybe(cta, pillBtn(CX, cardY + CARD_H + 56, cta, 28))}

    ${_maybe(legal, `
    <text x="${CX}" y="${cardY + CARD_H - 18}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="16" font-weight="600" fill="#4b5563" opacity="0.95">
      ${escSVG(legal)}
    </text>`)}
  </svg>`;

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.png`;
  await sharp(Buffer.from(svg, 'utf8'), { density: 180 })
    .png()
    .toFile(path.join(outDir, file));

  return {
    publicUrl: `/api/media/${file}`,
    absoluteUrl: absolutePublicUrl(`/api/media/${file}`),
    filename: file
  };
}

/* ---------- CTA normalization + variants (single source of truth) ---------- */
const CTA = Object.freeze({
  VARIANTS: [
    'LEARN MORE','SEE MORE','VIEW MORE','EXPLORE','DISCOVER',
    'SHOP NOW','BUY NOW','GET STARTED','TRY IT','SEE DETAILS',
    'SEE COLLECTION','BROWSE NOW','CHECK IT OUT','VISIT US','TAKE A LOOK','CHECK US OUT'
  ]
});

const ALLOWED_CTAS = new Set(CTA.VARIANTS);

function normalizeCTA(s = '') {
  return String(s)
    .toUpperCase()
    .replace(/[\u2019']/g, '')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickCtaVariant(seed = '') {
  if (!seed) return 'LEARN MORE';
  let h = 0 >>> 0;
  for (let i = 0; i < seed.length; i++) h = ((h * 31) + seed.charCodeAt(i)) >>> 0;
  return CTA.VARIANTS[h % CTA.VARIANTS.length];
}

function cleanCTA(c, seed = '') {
  const norm = normalizeCTA(c);
  if (norm && ALLOWED_CTAS.has(norm) && norm !== 'LEARN MORE') return norm;
  return pickCtaVariant(seed);
}

/* ---------- required helpers for subline + SVG (UPDATED) ---------- */
function escRegExp(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------ UTILS: conditional SVG helpers ------------------------------ */
function _nonEmpty(s) { return !!String(s || '').trim(); }
function _maybe(line, svg) { return _nonEmpty(line) ? svg : ''; }

/* Optional seasonal garnish (disabled in strict flow) */
function _seasonAccentLeaves() { return ''; }

/* --- CTA normalizers — NO DEFAULTS (RENAMED to avoid duplicates) --- */
function normalizeCTA_noDefaults(s = '') {
  const base = String(s).replace(/\s+/g, ' ').trim();
  return base ? base.slice(0, 28).toUpperCase() : '';
}
function cleanCTA_noDefaults(s = '', brand = '') {
  let t = String(s || '');
  if (brand) t = t.replace(new RegExp(escRegExp(brand), 'i'), '');
  t = t.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalizeCTA_noDefaults(t);
}

/* --- CTA pill (pure black, white text; same geometry) --- */
function pillBtn(cx, cy, label, fs = 34) {
  const txt = normalizeCTA_noDefaults(label || '');
  if (!txt) return '';
  const padX = 32;
  const estTextW = Math.round(txt.length * fs * 0.60);
  const estW = Math.max(182, Math.min(estTextW + padX * 2, 1000));
  const estH = Math.max(56, fs + 22);
  const x = Math.round(cx - estW / 2), y = Math.round(cy - estH / 2), r = Math.round(estH / 2);

  return `
    <g>
      <rect x="${x-8}" y="${y-8}" width="${estW+16}" height="${estH+16}" rx="${r+8}" fill="rgb(0,0,0)" opacity="0.25"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="#000000" opacity="0.92"/>
      <linearGradient id="btnHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.18"/>
        <stop offset="65%"  stop-color="#FFFFFF" stop-opacity="0.00"/>
      </linearGradient>
      <rect x="${x}" y="${y}" width="${estW}" height="${Math.max(12, Math.round(estH*0.42))}" rx="${r}" fill="url(#btnHi)"/>
      <rect x="${x+0.5}" y="${y+0.5}" width="${estW-1}" height="${estH-1}" rx="${r-0.5}" fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="none" stroke="rgba(0,0,0,0.55)" stroke-width="1" opacity="0.55"/>
      <text x="${cx}" y="${y + estH/2}"
            text-anchor="middle" dominant-baseline="middle"
            font-family='Times New Roman, Times, serif' font-size="${fs}" font-weight="700"
            fill="#FFFFFF"
            style="paint-order: stroke; stroke:#000; stroke-width:0.8; letter-spacing:0.10em">
        ${escSVG(txt)}
      </text>
    </g>`;
}

/* =========================================
   IMAGE NORMALIZATION (bake as background)
   ========================================= */
async function loadAndCover(imageUrl, W, H) {
  const res = await ax.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 });
  const buf = await sharp(res.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const meta = await sharp(buf).metadata();
  return { baseBuf: buf, W: meta.width || W, H: meta.height || H };
}

/* ==========================================================
   COMPOSERS — bake background + render SVG → raster → save
   ========================================================== */
async function composePhotoPoster({
  imageUrl,
  answers = {},
  dims = { W: 1080, H: 1080 },
}) {
  // ... your remaining image-only code continues below (not included in your paste)
}

  const { W, H } = dims;
  const { baseBuf } = await loadAndCover(imageUrl, W, H);
  const base64 = `data:image/jpeg;base64,${baseBuf.toString('base64')}`;

  const title = (answers.headline || answers.promoTitle || answers.offerTitle || 'Fall Sale').toString();
  const dateRange = (answers.dateRange || answers.eventDates || '').toString();
  const valueLine = (answers.valueLine || answers.savings || answers.offer || 'Save $1000').toString();
  const supportTop = (answers.supportTop || 'Plus special financing*').toString();
  const supportMid = (answers.supportMid || answers.supportingLine || 'On select products').toString();
  const supportBot = (answers.supportBot || 'See store for details').toString();

  const svg = svgPhotoPoster({
    W, H, baseImageDataURL: base64,
    headline: title,
    dateRange: dateRange,
    valueLine: valueLine,
    supportTop: supportTop,
    supportMid: supportMid,
    supportBot: supportBot,
    brandLogos: [] /* pass brand marks here if you have them */,
    leafBadges: [] /* decorative elements optional */
  });

  const overlayPng = await sharp(Buffer.from(svg)).png().toBuffer();

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;
  await sharp(baseBuf)
    .composite([{ input: overlayPng, left: 0, top: 0 }])
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(outDir, file));

  const rel = mediaPath(file);
  return { publicUrl: rel, absoluteUrl: absolutePublicUrl(rel), filename: file };


async function composeIllustratedFlyer({
  illustrationUrl,
  answers = {},
  dims = { W: 1200, H: 628 },
}) {
  const { W, H } = dims;
  const { baseBuf } = await loadAndCover(illustrationUrl, W, H - Math.round(H*0.28) + 10);
  const illBase64 = `data:image/jpeg;base64,${baseBuf.toString('base64')}`;

  const headline = (answers.headline || `${(answers.industry||'Home')} Services`).toString();
  const subHead  = (answers.subHead  || (answers.tags ? answers.tags.join(' • ') : 'APARTMENT • HOME • OFFICE')).toString();
  const checks   = Array.isArray(answers.checks) ? answers.checks : ['ONE TIME','WEEKLY','BI-WEEKLY','MONTHLY'];
  const services = Array.isArray(answers.services) ? answers.services : (answers.features || ['Kitchen','Bathrooms','Offices','Dusting','Mopping','Vacuuming']);
  const coverage = (answers.coverage || `Coverage area ~25 miles around ${answers.city || 'your area'}`).toString();
  const phone    = (answers.phone || '1300-135-1616').toString();

  const svg = svgIllustratedFlyer({
    W, H, illustrationDataURL: illBase64,
    headline, subHead,
    leftChecks: checks.slice(0,4),
    rightServices: services.slice(0,6),
    coverage,
    callNow: (answers.callNow || 'CALL NOW!').toString(),
    phone
  });

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;
  await sharp(Buffer.from(svg))
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(outDir, file));

  const rel = mediaPath(file);
  return { publicUrl: rel, absoluteUrl: absolutePublicUrl(rel), filename: file };
}




/* -------------------- Health check + memory debug -------------------- */
router.get('/test2', (_req, res) => {
  res.status(200).json({ ok: true, t: Date.now() });
});

router.get('/debug/mem', (_req, res) => {
  const mu = process.memoryUsage();
  const toMb = (x) => Math.round((x / 1024 / 1024) * 10) / 10;

  res.status(200).json({
    rss: mu.rss,
    heapTotal: mu.heapTotal,
    heapUsed: mu.heapUsed,
    external: mu.external,
    arrayBuffers: mu.arrayBuffers,
    rssMb: toMb(mu.rss),
    heapUsedMb: toMb(mu.heapUsed),
    nodeVersion: process.version,
    genConcurrency: process.env.GEN_CONCURRENCY || '1',
    videoQueueConcurrency: process.env.VIDEO_QUEUE_CONCURRENCY || '1',
  });
});


/* =================== CORE VIDEO HELPERS (low-mem, stream-to-disk) =================== */
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

/** Exec a binary without buffering stdout (prevents big memory spikes on Render) */
async function execFile(bin, args = [], opts = {}, hardKillMs = 180000) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, {
      stdio: ['ignore', 'ignore', 'inherit'],
      env: process.env,
      ...opts,
    });
    const killer = setTimeout(() => {
      try { p.kill('SIGKILL'); } catch {}
    }, hardKillMs);
    p.on('error', (e) => { clearTimeout(killer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(killer);
      code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`));
    });
  });
}

/** Stream any URL straight to /tmp (no big buffers) */
async function downloadToTmp(url, ext = '') {
  ensureGeneratedDir();
  const out = path.join(GEN_DIR, `${uuidv4()}${ext || ''}`);
  const res = await ax.get(url, {
    responseType: 'stream',
    timeout: 20000,
    maxRedirects: 4,
  });
  await streamPipeline(res.data, fs.createWriteStream(out, { flags: 'w' }));
  return out;
}

// --- TTS (returns { path, ok }) ---
async function synthTTS(text = '') {
  const speechPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp3`);
  try {
    const resp = await openai.audio.speech.create({
      model: OPENAI_TTS_MODEL,
      voice: OPENAI_TTS_VOICE,
      input: String(text || '').slice(0, 800),
      format: 'mp3',
    });
    const buf = Buffer.from(await resp.arrayBuffer());
    await fs.promises.writeFile(speechPath, buf);
    return { path: speechPath, ok: true };
  } catch (e) {
    console.warn('[tts] OpenAI TTS failed, using low-volume tone fallback:', e?.message || e);
    const fallback = path.join(ensureGeneratedDir(), `${uuidv4()}-tone.mp3`);
    await execFile(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'sine=frequency=400:duration=19:sample_rate=48000',
        '-filter:a', 'volume=0.12',
        '-c:a', 'mp3',
        fallback,
      ],
      {},
      20000
    );
    return { path: fallback, ok: false };
  }
}

/** Optional BGM (returns '' if missing or download fails) */
async function prepareBgm() {
  if (!BACKGROUND_MUSIC_URL) return '';
  try {
    return await downloadToTmp(BACKGROUND_MUSIC_URL, '.mp3');
  } catch {
    return '';
  }
}

/** ffprobe duration (sec) - tolerant version */
async function ffprobeDuration(filePath = '') {
  try {
    if (!filePath || !fs.existsSync(filePath)) return 0;
    const outTxt = path.join(GEN_DIR, `${uuidv4()}.dur.txt`);
    const fd = fs.openSync(outTxt, 'w');
    try {
      await new Promise((resolve) => {
        const p = spawn(
          'ffprobe',
          [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=nw=1:nk=1',
            filePath,
          ],
          { stdio: ['ignore', fd, 'inherit'] }
        );
        p.on('error', () => resolve());
        p.on('close', () => resolve());
      });
      const txt = await fs.promises.readFile(outTxt, 'utf8').catch(() => '0');
      const d = parseFloat(String(txt).trim());
      return Number.isFinite(d) ? d : 0;
    } finally {
      try { fs.closeSync(fd); } catch {}
      try { fs.unlinkSync(outTxt); } catch {}
    }
  } catch {
    return 0;
  }
}

/** Build burger-style timed drawtext subtitles (chunked sentences) — smaller font + slightly translucent box */
function buildTimedDrawtextFilter(script, totalSec = 18, inLabel = '[v0]', W = 960, H = 540) {
  const clean = String(script || '').replace(/\s+/g, ' ').trim();
  if (!clean) return { filter: `${inLabel}format=yuv420p[vsub]`, out: '[vsub]' };

  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 6);

  const count = sentences.length || 1;
  const total = Math.max(6, Math.min(40, totalSec));
  const chunk = total / count;

  const fontfile = pickFontFile();
  const fontfileArg = fontfile ? `:fontfile=${fontfile.replace(/:/g, '\\:')}` : '';

  const pad = 28;
  const floorY = Math.max(90, Math.round(H * 0.18));

  let inL = inLabel;
  const parts = [];

  for (let i = 0; i < sentences.length; i++) {
        let line = sentences[i].trim();
    line = line.replace(/[']/g, '');
    line = line.replace(/[\r\n]/g, ' ');
    line = line.replace(/%/g, '\\%');

    if (!line) continue;

    const start = (i * chunk).toFixed(2);
    const end   = Math.min(total, (i + 1) * chunk + 0.25).toFixed(2);
    const outL  = i === sentences.length - 1 ? '[vsub]' : `[v${i+100}]`;

    // escape commas in expressions with \,
    const xExpr = `max(${pad}\\, min((w-text_w)/2\\, w-${pad}-text_w))`;
    const yExpr = `min(h-${floorY}\\, h-text_h-36)`;

    parts.push(
      `${inL}drawtext=` +
      `text='${line}'` +
      `${fontfileArg}` +
      `:fontcolor=white` +
      `:fontsize=32` +                 // ↓ smaller font (was 38)
      `:line_spacing=6` +
      `:borderw=0` +
      `:box=1` +
      `:boxcolor=black@0.70` +         // ↓ almost solid, slightly see-through (was 0.82)
      `:boxborderw=12` +               // a touch lighter frame (was 14)
      `:x=${xExpr}` +
      `:y=${yExpr}` +
      `:shadowcolor=black@0.9` +
      `:shadowx=0` +
      `:shadowy=0` +
      `:enable='between(t,${start},${end})'` +
      outL
    );
    inL = outL;
  }

  if (!parts.length) return { filter: `${inLabel}format=yuv420p[vsub]`, out: '[vsub]' };
  return { filter: parts.join(';'), out: '[vsub]' };
}

// Build black-box drawtext subtitles using word timings (chunks from words)
function buildWordTimedDrawtextFilter(words, inLabel = '[v0]', W = 960, H = 540) {
  const tiles = chunkWordsFlexible(words, {
    maxChars: 26,
    maxDur: 2.6,
  });

  if (!tiles.length) {
    return { filter: `${inLabel}format=yuv420p[vsub]`, out: '[vsub]' };
  }

  const fontfile = pickFontFile();
  const fontfileArg = fontfile
    ? `:fontfile=${fontfile.replace(/:/g, '\\:')}`
    : '';

  const pad = 28;
  const floorY = Math.max(90, Math.round(H * 0.18));

  let inL = inLabel;
  const parts = [];

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];

    // 1) Clean text for drawtext and keep symbols safe
    let line = String(t.text || '')
      .replace(/['\\:]/g, '')   // remove quotes, backslash, colon
      .trim();

    if (!line) continue;

    // 2) Handle percentages so ffmpeg never chokes -> "20 percent"
    line = line.replace(/%/g, ' percent');

    // 3) Slight lead so subs appear just before the audio,
    //    but SHIFT the whole tile, so no overlap between tiles.
    const LEAD = 0.06; // ~60 ms ahead of the voice
    const startNum = Math.max(0, (t.start || 0) - LEAD);
    const endNum   = Math.max(startNum + 0.10, (t.end || 0) - LEAD);

    const start = startNum.toFixed(2);
    const end   = endNum.toFixed(2);

    const outL = i === tiles.length - 1 ? '[vsub]' : `[v${i + 200}]`;

    const xExpr = `max(${pad}\\, min((w-text_w)/2\\, w-${pad}-text_w))`;
    const yExpr = `min(h-${floorY}\\, h-text_h-36)`;

    parts.push(
      `${inL}drawtext=` +
        `text='${line}'` +
        `${fontfileArg}` +
        `:fontcolor=white` +
        `:fontsize=20` +          // font size = 24 (as you wanted)
        `:line_spacing=6` +
        `:borderw=0` +
        `:box=1` +
        `:boxcolor=black@0.70` +
        `:boxborderw=12` +
        `:x=${xExpr}` +
        `:y=${yExpr}` +
        `:shadowcolor=black@0.9` +
        `:shadowx=0` +
        `:shadowy=0` +
        `:enable='between(t,${start},${end})'` +
        outL
    );

    inL = outL;
  }

  if (!parts.length) {
    return { filter: `${inLabel}format=yuv420p[vsub]`, out: '[vsub]' };
  }
  return { filter: parts.join(';'), out: '[vsub]' };
}





/* ================= end helpers ================= */

// --- Variety helpers (seeded RNG + keyword variants + shuffle) ---
function mkRng32(seed = '') {
  // fast, deterministic 32-bit RNG based on seed
  let h = 2166136261 >>> 0;
  const s = String(seed || Date.now());
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5; h >>>= 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function buildKeywordVariants(base = '') {
  const k = String(base || '').trim().toLowerCase();
  if (!k) return ['product shopping', 'small business', 'store broll', 'customers shopping'];
  // lightweight expansions per common categories
  if (/\b(restaurant|food|bistro|cafe|coffee|pizza|burger)\b/.test(k)) {
    return [
      'restaurant b-roll', 'chef cooking', 'plating food closeup', 'diners at table',
      'restaurant kitchen action', 'pouring coffee', 'serving dishes', 'restaurant ambience'
    ];
  }
  if (/\b(fashion|clothing|apparel|boutique)\b/.test(k)) {
    return [
      'fashion model walk', 'clothes rack boutique', 'trying outfits mirror', 'streetwear b-roll',
      'studio fashion shoot', 'closeup fabric', 'boutique shopping'
    ];
  }
  if (/\b(beauty|salon|spa|cosmetic|skincare|makeup)\b/.test(k)) {
    return [
      'makeup application closeup', 'skincare routine', 'beauty salon b-roll', 'hair salon styling',
      'spa relaxation', 'cosmetics flat lay'
    ];
  }
  if (/\b(fitness|gym|workout|trainer)\b/.test(k)) {
    return [
      'gym workout b-roll', 'weightlifting closeup', 'treadmill runners', 'crossfit training',
      'yoga class', 'stretching routine'
    ];
  }
  if (/\b(tech|electronics|phone|laptop|gadget)\b/.test(k)) {
    return [
      'tech gadgets closeup', 'typing laptop b-roll', 'smartphone usage', 'electronics store',
      'coding on laptop', 'unboxing tech'
    ];
  }
  if (/\b(coffee)\b/.test(k)) {
    return [
      'pour over coffee', 'barista latte art', 'coffee shop ambience', 'espresso shot closeup'
    ];
  }
  // generic expansions
  return [
    k, `${k} b-roll`, `${k} closeup`, `${k} people`, `${k} lifestyle`,
    'product shopping', 'customers shopping', 'small business b-roll'
  ];
}


/* ============================ VIDEO GENERATION (3–4 clips, ~18s) ============================ */

/* ============================ VIDEO GENERATION (3–4 clips, ~18s) ============================ */

/* --------- Industry -> query intelligence (HIGH ACCURACY) --------- */

function normText(s = '') {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr || []) {
    const k = String(x || '').trim().toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(String(x).trim());
  }
  return out;
}

function tokensFromUrl(u = '') {
  try {
    const url = new URL(u);
    const host = (url.hostname || '').replace(/^www\./, '');
    const base = host.split('.').slice(0, -1).join('.') || host.split('.')[0] || '';
    const path = (url.pathname || '').replace(/[-_]/g, ' ').replace(/\//g, ' ');
    return normText(`${base} ${path}`).split(' ').filter(Boolean).slice(0, 12);
  } catch {
    return [];
  }
}

/**
 * Canonicalize industry strings into known buckets.
 * Covers common cases + still works for ANY custom industry text.
 */
function canonicalIndustry(industry = '') {
  const t = normText(industry);
  if (!t) return '';

  // HARD matches first
  if (/\bhvac\b|\bheating\b|\bcooling\b|\bair cond|ac repair|\bfurnace\b/.test(t)) return 'hvac';
  if (/\bflorist\b|\bflower\b|\bbouquet\b|\bfloral\b/.test(t)) return 'florist';
  if (/\bmakeup\b|\bcosmetic\b|\bbeauty\b|\bskincare\b|\blash\b|\bnail\b/.test(t)) return 'beauty';
  if (/\bdentist\b|\bdental\b|\borthodont\b|\bbraces\b/.test(t)) return 'dental';
  if (/\bplumb\b|\bdrain\b|\bsewer\b|\bleak\b/.test(t)) return 'plumbing';
  if (/\belectric\b|\belectrician\b|\bwiring\b|\bbreaker\b/.test(t)) return 'electrician';
  if (/\blandscap\b|\blawn\b|\bmow\b|\bturf\b|\bgarden\b/.test(t)) return 'landscaping';
  if (/\bauto\b|\bmechanic\b|\bcar\b|\btruck\b|\btires?\b|\boil change\b/.test(t)) return 'auto repair';
  if (/\breal estate\b|\brealtor\b|\bproperty\b|\bmortgage\b/.test(t)) return 'real estate';
  if (/\brestaurant\b|\bfood\b|\bcafe\b|\bbakery\b|\bpizza\b|\bcatering\b/.test(t)) return 'restaurant';
  if (/\bgym\b|\bfitness\b|\bworkout\b|\btrainer\b/.test(t)) return 'fitness';
  if (/\bsalon\b|\bbarber\b|\bhair\b|\bfade\b/.test(t)) return 'hair salon';
  if (/\bphotograph\b|\bphoto\b|\bwedding\b|\bportrait\b/.test(t)) return 'photography';
  if (/\bclean\b|\bmaid\b|\bjanitor\b|\bhousekeeping\b/.test(t)) return 'cleaning';
  if (/\broof\b|\broofing\b|\bgutter\b/.test(t)) return 'roofing';
  if (/\bpest\b|\btermite\b|\bextermin\b/.test(t)) return 'pest control';
  if (/\binsurance\b/.test(t)) return 'insurance';
  if (/\blaw\b|\battorney\b|\blawyer\b|\blegal\b/.test(t)) return 'law firm';
  if (/\bpet\b|\bveterinar\b|\bgroom\b|\bdog\b|\bcat\b/.test(t)) return 'pet';
  if (/\bspa\b|\bmassage\b|\bwellness\b/.test(t)) return 'spa';
  if (/\bconstruction\b|\bcontractor\b|\bremodel\b|\brenovat\b/.test(t)) return 'construction';
  if (/\bretail\b|\becommerce\b|\bonline store\b|\bshop\b/.test(t)) return 'retail';

  // default: return original (still used for query)
  return t;
}

function industryQueryPack(canon = '', rawIndustry = '', url = '') {
  const raw = String(rawIndustry || '').trim();
  const urlTokens = tokensFromUrl(url);

  // synonym packs (tight + specific)
  const packs = {
    'hvac': [
      'HVAC technician',
      'air conditioner repair',
      'AC maintenance',
      'heating and cooling service',
      'furnace repair',
      'thermostat installation'
    ],
    'florist': [
      'flower shop',
      'florist arranging bouquet',
      'floral arrangement',
      'wedding bouquet',
      'fresh flowers bouquet',
      'flower delivery'
    ],
    'beauty': [
      'makeup artist applying makeup',
      'cosmetics product close up',
      'beauty salon makeup',
      'skincare routine',
      'lipstick mascara',
      'makeup tutorial'
    ],
    'dental': [
      'dentist office',
      'dental cleaning',
      'orthodontist braces',
      'dental clinic',
      'teeth whitening'
    ],
    'plumbing': [
      'plumber fixing sink',
      'plumbing repair',
      'drain cleaning',
      'pipe leak repair'
    ],
    'electrician': [
      'electrician wiring',
      'electrical panel repair',
      'installing light fixture',
      'electrician at work'
    ],
    'landscaping': [
      'landscaping service',
      'lawn mowing',
      'gardener trimming hedge',
      'garden design'
    ],
    'auto repair': [
      'auto mechanic repairing car',
      'car service garage',
      'oil change',
      'tire shop'
    ],
    'restaurant': [
      'restaurant kitchen cooking',
      'chef plating food',
      'food close up',
      'cafe barista',
      'restaurant dining'
    ],
    'hair salon': [
      'barber haircut fade',
      'hair salon styling',
      'blow dry styling',
      'barbershop clipper'
    ],
    'cleaning': [
      'house cleaning service',
      'cleaner wiping counter',
      'janitorial cleaning',
      'maid cleaning home'
    ],
    'real estate': [
      'real estate agent showing house',
      'home tour',
      'sold sign house',
      'property viewing'
    ],
    'fitness': [
      'gym workout',
      'personal trainer coaching',
      'lifting weights',
      'fitness class'
    ],
    'photography': [
      'photographer taking photos',
      'wedding photographer',
      'portrait photoshoot'
    ],
    'roofing': [
      'roof repair',
      'roofing contractor',
      'installing shingles'
    ],
    'pest control': [
      'pest control technician',
      'exterminator spraying',
      'termite inspection'
    ],
    'law firm': [
      'lawyer office meeting',
      'attorney consultation',
      'legal documents'
    ],
    'insurance': [
      'insurance agent meeting',
      'insurance paperwork',
      'customer signing documents'
    ],
    'pet': [
      'veterinary clinic',
      'dog grooming',
      'pet care',
      'vet examining dog'
    ],
    'spa': [
      'spa massage',
      'facial treatment',
      'wellness spa'
    ],
    'construction': [
      'construction worker building',
      'home remodeling',
      'contractor working',
      'renovation tools'
    ],
    'retail': [
      'shopping store',
      'product showcase',
      'online shopping',
      'customer unboxing'
    ],
  };

  // Build high-accuracy ordered query list:
  const base = [];
  if (raw) base.push(raw);
  if (canon && canon !== normText(raw)) base.push(canon);

  const pack = packs[canon] || [];
  const urlHint = urlTokens.length ? urlTokens.slice(0, 4).join(' ') : '';

  // Tier 1: exact industry phrase (most relevant)
  const tier1 = base.filter(Boolean).map((x) => x.slice(0, 70));

  // Tier 2: curated synonyms for known buckets
  const tier2 = pack;

  // Tier 3: combine industry + “service / technician / product” and url hints (helps custom industries)
  const t = normText(raw || canon);
  const tCore = t.split(' ').slice(0, 3).join(' ');
  const tier3 = uniq([
    tCore ? `${tCore} service` : '',
    tCore ? `${tCore} business` : '',
    tCore ? `${tCore} professional` : '',
    urlHint ? `${tCore} ${urlHint}`.trim() : '',
  ]).filter(Boolean);

  return uniq([...tier1, ...tier2, ...tier3]).slice(0, 12);
}

/** Very light guardrails to avoid obvious wrong verticals */
function looksUnrelatedToIndustry(videoObj, canon = '') {
  const hay = normText(
    [
      videoObj?.url,
      videoObj?.image,
      videoObj?.user?.name,
      ...(Array.isArray(videoObj?.tags) ? videoObj.tags.map((t) => t?.title || t?.name) : []),
    ].join(' ')
  );

  // If user asked HVAC, avoid cars/fashion/etc (common mismatch)
  if (canon === 'hvac') {
    if (/\bcar\b|\bauto\b|\bmakeup\b|\bfashion\b|\bflower\b|\brestaurant\b/.test(hay)) return true;
  }
  if (canon === 'florist') {
    if (/\bcar\b|\bauto\b|\bhvac\b|\bconstruction\b|\brestaurant\b/.test(hay)) return true;
  }
  if (canon === 'beauty') {
    if (/\bhvac\b|\bplumb\b|\belectric\b|\bcar\b|\bauto\b|\bflower\b/.test(hay)) return true;
  }
  return false;
}

async function pexelsVideoSearch(query, page = 1) {
  try {
    return await ax.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: PEXELS_API_KEY },
      params: {
        query,
        per_page: 40,
        page,
        orientation: 'landscape',
      },
      timeout: 12000,
    });
  } catch (e) {
    const status = e?.response?.status;
    const msg = e?.response?.data || e?.message;
    console.warn('[pexels] video search error:', { query, page, status, msg });
    return { data: {} };
  }
}


async function pexelsPhotoSearch(query, page = 1) {
  return ax.get('https://api.pexels.com/v1/search', {
    headers: { Authorization: PEXELS_API_KEY },
    params: { query, per_page: 40, page },
    timeout: 12000,
  }).catch(() => ({ data: {} }));
}

/* Pexels videos (HIGH RELEVANCE FIRST, then variety) */
// ================== REPLACE fetchPexelsVideos + fetchPexelsPhotos WITH THIS ==================

async function fetchPexelsVideos(keywordOrQueries, want = 8, seed = '', urlHint = '', industryRaw = '') {
  if (!PEXELS_API_KEY) {
    console.warn('[pexels] missing PEXELS_API_KEY');
    return [];
  }

  const rng = mkRng32(seed || String(keywordOrQueries) || Date.now());

  // Accept either a string keyword OR an array of queries (prevents accidental breakage)
  const isArray = Array.isArray(keywordOrQueries);
  const targetIndustry = String(industryRaw || (isArray ? (keywordOrQueries[0] || '') : (keywordOrQueries || ''))).trim();
  const canon = canonicalIndustry(targetIndustry);

  const queries = isArray
    ? uniq(keywordOrQueries.map(x => String(x || '').trim()).filter(Boolean)).slice(0, 12)
    : industryQueryPack(canon, targetIndustry, urlHint);

  const results = [];
  const seen = new Set();

  try {
    for (const q of queries) {
      for (const page of [1, 2]) {
        const r = await pexelsVideoSearch(q, page);
        const vids = Array.isArray(r.data?.videos) ? r.data.videos : [];

        // Helpful debug
        if (!vids.length) console.warn('[pexels] empty videos:', { q, page, canon, targetIndustry });

        for (const v of vids) {
          const id = v?.id;
          if (id == null || seen.has(id)) continue;

          if (looksUnrelatedToIndustry(v, canon)) continue;

          const files = Array.isArray(v.video_files) ? v.video_files : [];
          const f =
            files.find((f) => /mp4/i.test(f.file_type || '') && (f.height || 0) >= 720) ||
            files.find((f) => /mp4/i.test(f.file_type || '')) ||
            files[0];

          if (f?.link) {
            seen.add(id);
            results.push({ url: f.link, id, dur: v.duration || 0 });
          }
          if (results.length >= Math.max(want * 4, 24)) break;
        }

        if (results.length >= Math.max(want * 4, 24)) break;
      }
      if (results.length >= Math.max(want * 4, 24)) break;
    }

    // LAST resort that still won’t bleed into another vertical:
    // only use neutral “small business” if EVERYTHING fails (prevents total 500)
    if (!results.length) {
      console.warn('[pexels] zero results after queries; using neutral last resort:', { canon, targetIndustry });
      for (const page of [1, 2]) {
        const r = await pexelsVideoSearch('small business', page);
        const vids = Array.isArray(r.data?.videos) ? r.data.videos : [];
        for (const v of vids) {
          const id = v?.id;
          if (id == null || seen.has(id)) continue;

          const files = Array.isArray(v.video_files) ? v.video_files : [];
          const f =
            files.find((f) => /mp4/i.test(f.file_type || '') && (f.height || 0) >= 720) ||
            files.find((f) => /mp4/i.test(f.file_type || '')) ||
            files[0];

          if (f?.link) {
            seen.add(id);
            results.push({ url: f.link, id, dur: v.duration || 0 });
          }
          if (results.length >= Math.max(want * 2, 12)) break;
        }
        if (results.length >= Math.max(want * 2, 12)) break;
      }
    }

    shuffleInPlace(results, rng);
    const pick = results.slice(0, Math.max(want, 8));

    console.log('[pexels] videos picked:', pick.length, { canon, targetIndustry, queries: queries.slice(0, 5) });
    return pick;
  } catch (e) {
    console.warn('[pexels] video search fail:', e?.message || e);
    return [];
  }
}


async function fetchPexelsPhotos(keyword, want = 8, seed = '', urlHint = '', industryRaw = '') {
  if (!PEXELS_API_KEY) return [];
  const rng = mkRng32(seed || keyword || Date.now());

  const targetIndustry = (industryRaw || keyword || '').toString();
  const canon = canonicalIndustry(targetIndustry);
  const queries = industryQueryPack(canon, targetIndustry, urlHint);

  const results = [];
  const seen = new Set();

  try {
    for (const q of queries) {
      for (const page of [1, 2]) {
        const r = await pexelsPhotoSearch(q, page);
        const photos = Array.isArray(r.data?.photos) ? r.data.photos : [];

        for (const p of photos) {
          const id = p?.id;
          if (id == null || seen.has(id)) continue;

          const src = p?.src || {};
          const u = src.landscape || src.large2x || src.large || src.original;
          if (!u) continue;

          seen.add(id);
          results.push({ url: u, id });
          if (results.length >= Math.max(want * 4, 32)) break;
        }

        if (results.length >= Math.max(want * 4, 32)) break;
      }
      if (results.length >= Math.max(want * 4, 32)) break;
    }

    shuffleInPlace(results, rng);
    return results.slice(0, Math.max(want, 12));
  } catch (e) {
    return [];
  }
}
// =============================================================================================

/** Ensure 3–4 clips with random order/choices per seed */
function buildVirtualPlan(rawClips, variant = 0, seed = '') {
  const clips = Array.isArray(rawClips)
    ? rawClips.filter((c) => c && c.url)
    : [];

  if (!clips.length) {
    console.warn('[video] no Pexels clips available for virtual plan');
    return [];
  }

  // Shuffle + slice so each run picks a different subset/order
  const rng = mkRng32(`${seed}|v${variant}|${clips.length}`);
  const pool = shuffleInPlace([...clips], rng);

  const wantCount = pool.length >= 4 ? 4 : Math.max(3, Math.min(4, pool.length));
  const pick = pool.slice(0, wantCount);

  // Return a normalized plan (url + optional trim hints)
  return pick.map((c, i) => {
    const dur = Number(c.dur || 0);
    // aim ~18–20s total; per-clip target
    const per = 18.5 / wantCount;

    // If we know duration, randomize a safe start offset
    const clipDur = dur > 0 ? dur : per;
    const useDur = Math.max(3.5, Math.min(per, clipDur));
    const maxStart = Math.max(0, clipDur - useDur - 0.15);
    const start = maxStart > 0 ? (rng() * maxStart) : 0;

    return {
      url: c.url,
      id: c.id ?? `${variant}-${i}`,
      dur: dur || 0,
      // optional hints for downstream trim
      trimStart: +start.toFixed(2),
      trimDur: +useDur.toFixed(2),
    };
  });
}


/** Compose stitched video with VO, optional bgm, ASS subs (flow, width-aware) */
async function makeVideoVariant({
  clips,
  script,
  variant = 0,
  targetSec = 18.5,
  tailPadSec = 1.6,
  musicPath = '',
}) {
  const W = 960, H = 540, FPS = 30;
  let OUTLEN = Math.max(15, Math.min(20, Number(targetSec || 18.5)));

  const tmpToDelete = [];
  const segs = [];
  let voicePath = '';

  try {
    // ---------- 1) TTS ----------
    const tts = await synthTTS(script);
    voicePath = tts.path;
    tmpToDelete.push(voicePath);

    let voiceDur = await ffprobeDuration(voicePath);
    if (!Number.isFinite(voiceDur) || voiceDur <= 0) voiceDur = 14.0;

    const ATEMPO =
      Number.isFinite(TTS_SLOWDOWN) && TTS_SLOWDOWN > 0 ? TTS_SLOWDOWN : 1.0;

    // effective VO duration after slowdown (atempo < 1 => longer)
    const effVoice = voiceDur / ATEMPO;
const PAD = Math.max(0, Number(tailPadSec || 0));
OUTLEN = Math.max(18, Math.min(21, effVoice + PAD));


    // ---------- 1b) Build subtitle word timings (synced to audio) ----------
    const subtitleWords = await getSubtitleWords(
      voicePath,
      script,
      effVoice,
      ATEMPO
    );

    // ---------- 2) Build 3–4 normalized segments ----------
    const plan = buildVirtualPlan(clips || [], variant);
    if (!plan.length) throw new Error('No clips in plan');

    const perClip = Math.max(3.6, OUTLEN / plan.length);

    for (let i = 0; i < plan.length; i++) {
      const srcUrl = plan[i].url;
      const tmpIn = await downloadToTmp(srcUrl, '.mp4');
      tmpToDelete.push(tmpIn);

      let ss = 0;
      try {
        const d = await ffprobeDuration(tmpIn);
        const headroom = Math.max(0, d - perClip - 0.6);
        const frac = (i + 1 + variant * 0.37) / (plan.length + 1);
        ss = Math.max(0, Math.min(headroom, headroom * frac));
      } catch {}

      const outSeg = path.join(ensureGeneratedDir(), `${uuidv4()}-seg.mp4`);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`;

      await execFile(
        'ffmpeg',
        [
          '-y',
          '-nostdin',
          '-loglevel',
          'error',
          ...(ss > 0 ? ['-ss', ss.toFixed(2)] : []),
          '-i',
          tmpIn,
          '-t',
          perClip.toFixed(2),
          '-vf',
          vf,
          '-an',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '27',
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(FPS),
          outSeg,
        ],
        {},
        180000
      );

      segs.push(outSeg);
      safeUnlink(tmpIn);
    }

   // ---------- 3) Concat segments -> [vcat] ----------
const vInputs = segs.map((_, i) => `[${i}:v]`).join('');
const vParts = segs.flatMap((p) => ['-i', p]);
const concatChain = `${vInputs}concat=n=${segs.length}:v=1:a=0[vcat]`;

// ✅ NEW: pad video tail so visuals continue after voice ends
const padChain =
  PAD > 0
    ? `[vcat]tpad=stop_mode=clone:stop_duration=${PAD.toFixed(2)}[vpad]`
    : `[vcat]null[vpad]`;




    // ---------- 5) Subtitles: SAME black box, but now word-timed ----------
 const { filter: subFilter, out: vOut } = buildWordTimedDrawtextFilter(
  subtitleWords,
  '[vpad]',
  W,
  H
);


    const fc = [concatChain, padChain, subFilter, audioMix].join(';');


    const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp4`);
    await execFile(
      'ffmpeg',
      [
        '-y',
        '-nostdin',
        '-loglevel',
        'error',
        ...vParts,
        ...audioInputs,
        ...musicArgs,
        '-filter_complex',
        fc,
        '-map',
        vOut, // <- drawtext output
        '-map',
        '[aout]',
        '-t',
        OUTLEN.toFixed(2),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(FPS),
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outPath,
      ],
      {},
      180000
    );

    await cleanupMany([...segs, voicePath]);

    return { outPath, duration: OUTLEN };
  } catch (e) {
   await cleanupMany([...segs, voicePath, ...tmpToDelete].filter(Boolean));

    throw e;
  }
}


/** Photo slideshow fallback (3–4 segments) with word-synced ASS karaoke */
async function makeSlideshowVariantFromPhotos({
  photos,
  script,
  variant = 0,
  targetSec = 18.5,
  tailPadSec = 1.6,
  musicPath = '',
}) {
  const W = 960, H = 540, FPS = 30;
  let OUTLEN = Math.max(18, Math.min(20, Number(targetSec || 18.5)));

  const tmpToDelete = [];
  const segs = [];
  let voicePath = '';

  try {
    // ---------- 1) TTS ----------
    const tts = await synthTTS(script);
    voicePath = tts.path;
    tmpToDelete.push(voicePath);

    let voiceDur = await ffprobeDuration(voicePath);
    if (!Number.isFinite(voiceDur) || voiceDur <= 0) voiceDur = 14.0;

    const ATEMPO =
      Number.isFinite(TTS_SLOWDOWN) && TTS_SLOWDOWN > 0 ? TTS_SLOWDOWN : 1.0;

    const effVoice = voiceDur / ATEMPO;
  const PAD = Math.max(0, Number(tailPadSec || 0)); // <-- USE tailPadSec
OUTLEN = Math.max(18, Math.min(21, effVoice + PAD));




    // ---------- 1b) Subtitle words (synced to audio) ----------
    const subtitleWords = await getSubtitleWords(
      voicePath,
      script,
      effVoice,
      ATEMPO
    );

    // ---------- 2) Choose 3–4 photos ----------
    const need = Math.max(3, Math.min(4, photos.length || 3));
    const chosen = [];
    for (let i = 0; i < need; i++) {
      const c = photos[(i + variant) % photos.length];
      if (c?.url) {
        const img = await downloadToTmp(c.url, '.jpg');
        tmpToDelete.push(img);
        chosen.push(img);
      }
    }
    if (!chosen.length) throw new Error('No stock photos available');

    const perClip = Math.max(3.6, OUTLEN / chosen.length);

    for (let i = 0; i < chosen.length; i++) {
      const img = chosen[i];
      const outSeg = path.join(ensureGeneratedDir(), `${uuidv4()}-seg.mp4`);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`;

      await execFile(
        'ffmpeg',
        [
          '-y',
          '-nostdin',
          '-loglevel',
          'error',
          '-loop',
          '1',
          '-t',
          perClip.toFixed(2),
          '-i',
          img,
          '-vf',
          vf,
          '-an',
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '27',
          '-pix_fmt',
          'yuv420p',
          '-r',
          String(FPS),
          outSeg,
        ],
        {},
        180000
      );
      segs.push(outSeg);
    }

   // ---------- 3) Concat segments -> [vcat] ----------
const vInputs = segs.map((_, i) => `[${i}:v]`).join('');
const vParts = segs.flatMap((p) => ['-i', p]);
const concatChain = `${vInputs}concat=n=${segs.length}:v=1:a=0[vcat]`;

// ✅ NEW: pad video tail so visuals continue after voice ends
const padChain =
  PAD > 0
    ? `[vcat]tpad=stop_mode=clone:stop_duration=${PAD.toFixed(2)}[vpad]`
    : `[vcat]null[vpad]`;


 // ---------- 4) Audio graph (voice + optional BGM that ALWAYS lasts full OUTLEN) ----------
const voiceIdx = segs.length;
const audioInputs = ['-i', voicePath];
let musicArgs = [];
let musicIdx = null;

if (musicPath) {
  // IMPORTANT: loop the music forever so it can cover the entire OUTLEN
  musicArgs = ['-stream_loop', '-1', '-i', musicPath];
  musicIdx = voiceIdx + 1;
}

const voiceFilt = `[${voiceIdx}:a]atempo=${ATEMPO.toFixed(3)},aresample=48000[vo]`;

const audioMix =
  musicIdx !== null
    ? `[${musicIdx}:a]aresample=48000,atrim=0:${OUTLEN.toFixed(2)},volume=0.18[bgm];` +
      `${voiceFilt};` +
      `[bgm][vo]amix=inputs=2:duration=longest:dropout_transition=2[aout]`
    : `${voiceFilt};[vo]anull[aout]`;


    // ---------- 5) Subtitles: same black box, word-timed ----------
 const { filter: subFilter, out: vOut } = buildWordTimedDrawtextFilter(
  subtitleWords,
  '[vpad]',
  W,
  H
);


    const fc = [concatChain, padChain, subFilter, audioMix].join(';');


    const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp4`);
    await execFile(
      'ffmpeg',
      [
        '-y',
        '-nostdin',
        '-loglevel',
        'error',
        ...vParts,
        ...audioInputs,
        ...musicArgs,
        '-filter_complex',
        fc,
        '-map',
        vOut,
        '-map',
        '[aout]',
        '-t',
        OUTLEN.toFixed(2),
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '26',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(FPS),
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outPath,
      ],
      {},
      180000
    );

    await cleanupMany([...segs, voicePath, ...tmpToDelete]);

    return { outPath, duration: OUTLEN };
  } catch (e) {
    await cleanupMany([...segs, voicePath, ...tmpToDelete].filter(Boolean));

    throw e;
  }
}


/* ===================== BACKGROUND VIDEO QUEUE ===================== */
const VIDEO_QUEUE_CONC = Number(process.env.VIDEO_QUEUE_CONCURRENCY || 1);
let videoQueue = [];
let videoWorking = 0;

async function runVideoJob(job) {
  const { reqLike, top } = job;
  const answers = top.answers || top;
  const url = answers.url || top.url || '';
  const industry = answers.industry || top.industry || '';
 const category = resolveCategory(answers || {});

// ✅ STRICT industry source (never let getVideoKeyword drive stock video)
const rawIndustry = String(answers.industry || top.industry || industry || '').trim();

// Use answers + url to help when user puts something vague, but STILL industry-locked
const inferText = normText([
  rawIndustry,
  answers.businessName,
  answers.offer,
  answers.mainBenefit,
  answers.service,
  answers.services,
  answers.product,
  answers.description,
  answers.prompt,
  url
].filter(Boolean).join(' '));

// If industry blank/vague, infer a tight phrase from their inputs (still stays in that vertical)
const inferredIndustry = rawIndustry || (inferText.split(' ').slice(0, 5).join(' ') || 'local business');
const canon = canonicalIndustry(inferredIndustry);

// ✅ keyword becomes the actual industry phrase we want videos for
const keyword = inferredIndustry;

const targetSec = Math.max(18, Math.min(20, Number(top.targetSeconds || 18.5)));

// Script
let script = (top.adCopy || '').trim();
if (!script) {
  try {
    const prompt = `Write only the exact words for a spoken ad script (~46–65 words, 14–16s) for category "${category}". Hook → value → simple CTA. Neutral; no website.`;
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
      temperature: 0.35,
    });
    script = cleanFinalText(r.choices?.[0]?.message?.content || '');
    script = enforceCategoryPresence(stripFashionIfNotApplicable(script, category), category);
  } catch {
    script = 'A simple way to get started with less hassle and more value. Learn more.';
  }
}

// ---- Media (STRICT industry; NO generic fallbacks like "product shopping") ----
let clips = await fetchPexelsVideos(
  keyword,
  12,
  `${Date.now()}|${canon}|p1`,
  url,
  inferredIndustry
);

// Page/seed retry (still industry-locked)
if (!clips.length) {
  clips = await fetchPexelsVideos(
    keyword,
    12,
    `${Date.now()}|${canon}|p2`,
    url,
    inferredIndustry
  );
}

// Last resort: safer “industry service” variant (still industry-locked)
if (!clips.length) {
  clips = await fetchPexelsVideos(
    `${keyword} service`,
    10,
    `${Date.now()}|${canon}|svc`,
    url,
    inferredIndustry
  );
}

  const bgm = await prepareBgm();
  let v1, v2;

  if (clips.length) {
    v1 = await makeVideoVariant({
      clips,
      script,
      variant: 0,
      targetSec,
      tailPadSec: 2,
      musicPath: bgm,
    });
    v2 = await makeVideoVariant({
      clips,
      script,
      variant: 1,
      targetSec,
      tailPadSec: 2,
      musicPath: bgm,
    });
  } else {
    let photos = await fetchPexelsPhotos(keyword, 10);
    if (!photos.length) photos = await fetchPexelsPhotos('product shopping', 10);
    if (!photos.length) throw new Error('No stock media available');
    v1 = await makeSlideshowVariantFromPhotos({
      photos,
      script,
      variant: 0,
      targetSec,
      tailPadSec: 2,
      musicPath: bgm,
    });
    v2 = await makeSlideshowVariantFromPhotos({
      photos,
      script,
      variant: 1,
      targetSec,
      tailPadSec: 2,
      musicPath: bgm,
    });
  }

  // Persist two variants
  const rel1 = path.basename(v1.outPath);
  const rel2 = path.basename(v2.outPath);
  const url1 = mediaPath(rel1);
  const url2 = mediaPath(rel2);
  const abs1 = absolutePublicUrl(url1);
  const abs2 = absolutePublicUrl(url2);

  await saveAsset({
    req: reqLike,
    kind: 'video',
    url: url1,
    absoluteUrl: abs1,
    meta: { variant: 0, category, keyword, hasSubtitles: true, targetSec: v1.duration },
  });
  await saveAsset({
    req: reqLike,
    kind: 'video',
    url: url2,
    absoluteUrl: abs2,
    meta: { variant: 1, category, keyword, hasSubtitles: true, targetSec: v2.duration },
  });

  console.log('[video] ready:', url1, url2);
}

async function pumpVideoQueue() {
  while (videoWorking < VIDEO_QUEUE_CONC && videoQueue.length) {
    const job = videoQueue.shift();
    videoWorking += 1;
    runVideoJob(job)
      .catch((e) => console.error('[video] failed:', e?.message || e))
      .finally(() => {
        videoWorking = Math.max(0, videoWorking - 1);
        setImmediate(pumpVideoQueue);
      });
  }
}

/* TRIGGER + POLL */
// Synchronous video generation: produce TWO variants (~18–20s) in one call (ONLY TWO)
router.post("/generate-video-ad", async (req, res) => {
  try {
    // long-running safety (Render cold start)
    try {
      if (typeof res.setTimeout === "function") res.setTimeout(180000);
      if (typeof req.setTimeout === "function") req.setTimeout(180000);
    } catch {}

    const body     = req.body || {};
    const answers  = body.answers || {};
    const url      = body.url || "";
   const seedBase = String(
  body.regenerateToken ||
  answers.regenerateToken ||
  Date.now()
);


// One keyword for this request ONLY (precise video query)
const industry = (answers.industry || "").toString();   // ✅ define industry (used later)
const baseKeyword = getVideoKeyword(industry, url, answers);


    const targetSec = Math.max(18, Math.min(20, Number(body.targetSeconds || 18.5)));

    // ---- script (single time) ----
    let script = (body.adCopy || "").trim();
    if (!script) script = await generateVideoScriptFromAnswers(answers);

    // ---- stock videos (single pool) ----
const rawIndustry = String(answers.industry || '').trim();
const inferText = normText([
  rawIndustry,
  answers.businessName,
  answers.offer,
  answers.mainBenefit,
  answers.service,
  answers.services,
  answers.product,
  answers.description,
  answers.prompt,
  url
].filter(Boolean).join(' '));

const inferredIndustry = rawIndustry || (inferText.split(' ').slice(0, 5).join(' ') || 'local business');
const canon = canonicalIndustry(inferredIndustry);

// ✅ STRICT: search always locked to inferredIndustry
// ---- stock videos (single pool) ----
console.log('[regen] /generate-video-ad', {
  industry: answers?.industry,
  inferredIndustry,
  canon,
  seedBase,
  url
});

let clips = await fetchPexelsVideos(
  inferredIndustry,
  12,
  `${seedBase}|${canon}|p1`,
  url,
  inferredIndustry
);


// still locked, no generic vertical fallbacks
if (!clips.length) {
  clips = await fetchPexelsVideos(
    inferredIndustry,
    12,
    `${seedBase}|${canon}|p2`,
    url,
    inferredIndustry
  );
}

// last resort, still locked
if (!clips.length) {
  clips = await fetchPexelsVideos(
    `${inferredIndustry} service`,
    10,
    `${seedBase}|${canon}|svc`,
    url,
    inferredIndustry
  );
}

    if (!clips.length) return res.status(500).json({ ok: false, error: "No stock clips found from Pexels." });

    // ---- fast toggle: ONLY one mode executes ----
    const FAST_MODE = String(body.fast ?? req.query.fast ?? process.env.SM_FAST_MODE ?? "0").trim() === "1";
const WANT_VARIANTS = 2; // ALWAYS generate two videos


    // Build two deterministic clip plans (A/B) from the SAME pool
    const planA = buildVirtualPlan(clips, 0, `${seedBase}|A`);
    const planB = buildVirtualPlan(clips, 1, `${seedBase}|B`);
    if (!planA.length || !planB.length) return res.status(500).json({ ok: false, error: "No clips in plan." });

    const bgm = await prepareBgm();

// ---- RENDER EXACTLY TWO VARIANTS ----
let v1, v2;

if (FAST_MODE) {
  const urlsA = planA.map(p => p.url).slice(0, 4);
  const urlsB = planB.map(p => p.url).slice(0, 4);

  v1 = await makeVideoVariantFast({ clipUrls: urlsA, script, targetSec, industry, tailSeconds: 3 });
  v2 = await makeVideoVariantFast({ clipUrls: urlsB, script, targetSec, industry, tailSeconds: 3 });
} else {
  v1 = await makeVideoVariant({ clips: planA, script, variant: 0, targetSec, tailPadSec: 3, musicPath: bgm });
  v2 = await makeVideoVariant({ clips: planB, script, variant: 1, targetSec, tailPadSec: 3, musicPath: bgm });
}



    // ---- save exactly two assets ----
    const rel1 = path.basename(v1.outPath);
    const rel2 = path.basename(v2.outPath);
    const url1 = mediaPath(rel1);
    const url2 = mediaPath(rel2);
    const abs1 = absolutePublicUrl(url1);
    const abs2 = absolutePublicUrl(url2);

    const category = resolveCategory(answers || {});
    await saveAsset({
      req,
      kind: "video",
      url: url1,
      absoluteUrl: abs1,
      meta: { variant: 0, category, keyword: baseKeyword, hasSubtitles: true, targetSec: v1.duration, fast: FAST_MODE ? 1 : 0 },
    });
    await saveAsset({
      req,
      kind: "video",
      url: url2,
      absoluteUrl: abs2,
      meta: { variant: 1, category, keyword: baseKeyword, hasSubtitles: true, targetSec: v2.duration, fast: FAST_MODE ? 1 : 0 },
    });

    console.log("[video] ready (A/B):", url1, url2);

    return res.json({
      ok: true,
      videos: [
        { url: url1, absoluteUrl: abs1, variant: "A", fast: FAST_MODE ? 1 : 0 },
        { url: url2, absoluteUrl: abs2, variant: "B", fast: FAST_MODE ? 1 : 0 },
      ],
    });
  } catch (e) {
    console.error("[/generate-video-ad] error:", e?.message || e);
    return res.status(500).json({ ok: false, error: e.message || "failed" });
  }
});

/* === Route: POST /api/craft-ad-copy === */
router.post("/api/craft-ad-copy", async (req, res) => {
  try {
    const { industry, businessName, brand, answers } = req.body || {};
    const copy = await craftAdCopyFromAnswers({ industry, businessName, brand, answers }, openai);
    res.json({ ok: true, copy });
  } catch (err) {
    console.error("[craft-ad-copy] error:", err);
    res.status(500).json({ ok: false, error: "COPY_GENERATION_FAILED" });
  }
});




// -----------------------------------------------------------------------
// NEW: /api/generated-videos?limit=2 — return the most recent N video assets
// -----------------------------------------------------------------------
router.get('/generated-videos', async (req, res) => {
  try {
    await purgeExpiredAssets();
    const owner = ownerKeyFromReq(req);
    const limit = Math.max(1, Math.min(6, parseInt(req.query.limit, 10) || 2));

    const vids = (db.data?.generated_assets || [])
      .filter((a) => a.owner === owner && a.kind === 'video')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limit)
      .map((v) => ({
        url: v.url,
        absoluteUrl: v.absoluteUrl || absolutePublicUrl(v.url),
        meta: v.meta || {},
        createdAt: v.createdAt,
      }));

    if (!vids.length) return res.status(204).end();

    const origin = req.headers && req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.json({ ok: true, items: vids });
  } catch (e) {
    console.error('generated-videos error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'GEN_VIDEOS_FAIL' });
  }
});

/* ========================== END DROP-IN VIDEO SECTION ========================== */

// --- DROP-IN: composeOverlay (place above /generate-image-from-prompt route) ---
async function composeOverlay({ imageUrl, title, subline, cta, answers = {}, category = 'generic', seed = '' }) {
  const cat = (category || resolveCategory?.(answers) || 'generic').toLowerCase();
  const posterish = ['fashion','fitness','cosmetics','hair','food','pets','electronics','home','coffee','generic'];
  const flyerish  = ['services','cleaning','plumbing','moving','repair','home services'];

  const wantPoster = posterish.includes(cat) || (!flyerish.includes(cat) && !answers.services);

  if (wantPoster) {
    return await composePhotoPoster({
      imageUrl,
      answers: {
        ...answers,
        headline: title || overlayTitleFromAnswers?.(answers, category),
        valueLine: subline || await getCoherentSubline?.(answers, category, seed),
        supportTop: cta || cleanCTA(answers?.cta || '', answers?.businessName || ''),
      },
      dims: { W: 1200, H: 628 },
    });
  } else {
    return await composeIllustratedFlyer({
      illustrationUrl: imageUrl,
      answers: {
        ...answers,
        headline: title || overlayTitleFromAnswers?.(answers, category),
        subHead: subline || await getCoherentSubline?.(answers, category, seed),
        callNow: cta || cleanCTA(answers?.cta || '', answers?.businessName || ''),
      },
      dims: { W: 1200, H: 628 },
    });
  }
}



// --------------------- IMAGE: template + overlay (TWO variations, NO PEXELS) ---------------------
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();
  try {
    if (typeof res.setTimeout === 'function') res.setTimeout(65000);
    if (typeof req.setTimeout === 'function') req.setTimeout(65000);
  } catch {}

  try {
    const top      = req.body || {};
    const answers  = top.answers || top;
    const category = resolveCategory(answers || {}) || 'generic';

    // 1) pick base image strictly from provided URL / template key / category (NO PEXELS)
    const baseImageUrl = resolveTemplateUrl({ body: top, answers });

    // 2) headline + CTA
    const headlineHint = overlayTitleFromAnswers(answers, category);
    const ctaHint      = cleanCTA(answers?.cta || '', headlineHint || (answers?.businessName || ''));

    // 3) build two variations using the SAME base image but different seeds (subline varies)
    const makeOne = async (seedSuffix) => {
      const { publicUrl, absoluteUrl } = await composeOverlay({
        imageUrl: baseImageUrl,
        title: headlineHint,
        subline: '', // let getCoherentSubline/craftSubline generate from answers
        cta: ctaHint,
        answers,
        category,
        seed: (answers?.businessName || category || 'generic') + ':' + seedSuffix,
      });
      // persist
      await saveAsset({
        req,
        kind: 'image',
        url: publicUrl,
        absoluteUrl,
        meta: { category, base: baseImageUrl, headlineHint, cta: ctaHint, template: true },
      });
      return { url: publicUrl, absoluteUrl };
    };

    const vA = await makeOne('A');
    const vB = await makeOne('B');

    return res.json({
      ok: true,
      items: [
        { ...vA, variant: 'A', templateBase: baseImageUrl },
        { ...vB, variant: 'B', templateBase: baseImageUrl },
      ],
    });
  } catch (e) {
    console.error('[generate-image-from-prompt:no-pexels] error:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'IMAGE_GEN_FAIL', message: e.message || 'failed' });
  }
});


/* ------------------------- RECENT (24h window) ------------------------- */
async function listRecentForOwner(req) {
  await purgeExpiredAssets();
  const owner = ownerKeyFromReq(req);
  return (db.data.generated_assets || [])
    .filter((a) => a.owner === owner)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50);
}

router.get('/recent', async (req, res) => {
  try {
    const items = await listRecentForOwner(req);
    res.json({ items, ttlMs: ASSET_TTL_MS });
  } catch {
    res.status(500).json({ error: 'Failed to load recent assets' });
  }
});

router.get('/assets/recent', async (req, res) => {
  try {
    const items = await listRecentForOwner(req);
    res.json({ items, ttlMs: ASSET_TTL_MS });
  } catch {
    res.status(500).json({ error: 'Failed to load recent assets' });
  }
});

router.get('/recent-assets', async (req, res) => {
  try {
    const items = await listRecentForOwner(req);
    res.json({ items, ttlMs: ASSET_TTL_MS });
  } catch {
    res.status(500).json({ error: 'Failed to load recent assets' });
  }
});

router.post('/assets/clear', async (req, res) => {
  try {
    await ensureAssetsTable();
    const owner = ownerKeyFromReq(req);
    db.data.generated_assets = (db.data.generated_assets || []).filter((a) => a.owner !== owner);
    await db.write();
    housekeeping();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear assets' });
  }
});

// -----------------------------------------------------------------------


/* -------- Ensure CORS even on errors -------- */
router.use((err, req, res, _next) => {
  try {
    const origin = req.headers && req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Vary', 'Origin');
    }
  } catch {}
  const code = err?.status || 500;
  res.status(code).json({ error: err?.message || 'Server error' });
});



module.exports = router;
