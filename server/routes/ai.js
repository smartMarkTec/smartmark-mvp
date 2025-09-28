'use strict';

/**
 * SmartMark AI routes – improved 2025-09-24
 * - Removes random SALE badge unless explicitly requested
 * - Better headline/subtitle centering + spacing
 * - Modern pane (glass/gradient), consistent typography
 * - Sharper images (no enlargement, 4:4:4, mozjpeg, lanczos3)
 * - Faster Pexels queries + graceful fallbacks & caching
 * - Cleaner captions: sans font, bigger, centered baseline, consistent box
 */

const express = require('express');
const router = express.Router();

/* ---------------- Memory discipline for Sharp + concurrency gate ---------------- */
const sharp = require('sharp');

// Keep Sharp tiny: small cache and single-threaded work inside libvips
try {
  sharp.cache({ memory: 16, files: 0, items: 0 }); // ~16MB process cache, no file cache
  sharp.concurrency(1);
} catch {}

// Simple semaphore: allow only N heavy jobs at once (default 1)
const GEN_LIMIT = Number(process.env.GEN_CONCURRENCY || 1);
let active = 0;
const waiters = [];

function acquire() {
  return new Promise((resolve) => {
    const tryGo = () => {
      if (active < GEN_LIMIT) {
        active += 1;
        resolve();
      } else {
        waiters.push(tryGo);
      }
    };
    tryGo();
  });
}
function release() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) setImmediate(next);
}

// Middleware: serialize only the generator routes
const heavyRoute = (req, res, next) => {
  if (!/^\/(generate-image-from-prompt|generate-video-ad|generate-campaign-assets)\b/.test(req.path)) {
    return next();
  }
  acquire().then(() => {
    res.on('finish', release);
    res.on('close', release);
    next();
  });
};
router.use(heavyRoute);

/* ------------------------ CORS (router-level, defensive) ------------------------ */
const ALLOW_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://smartmark-mvp.vercel.app',
  process.env.FRONTEND_URL,
  process.env.FRONTEND_ORIGIN
].filter(Boolean));

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOW_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, X-FB-AD-ACCOUNT-ID, X-SM-SID'
  );
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ------------- Security & Rate-Limiting ------------- */
const { secureHeaders, basicRateLimit } = require('../middleware/security');
router.use(secureHeaders());
router.use(basicRateLimit({ windowMs: 15 * 60 * 1000, max: 120 })); // general routes
const heavyLimiter = basicRateLimit({ windowMs: 60 * 60 * 1000, max: 20 }); // use per heavy route

/* ------------------------------ Deps ------------------------------ */
// NOTE: do NOT re-require 'sharp' here; it’s already configured above.
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const { spawn } = require('child_process');
const { OpenAI } = require('openai');
const { getFbUserToken } = require('../tokenStore');
const db = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';

/* -------- Disk guard -------- */
const GEN_DIR = '/tmp/generated';
function ensureGeneratedDir() {
  try {
    fs.mkdirSync(GEN_DIR, { recursive: true });
  } catch {}
  return GEN_DIR;
}
function dirStats(p) {
  try {
    const files = fs
      .readdirSync(p)
      .map((f) => ({ f, full: path.join(p, f) }))
      .filter((x) => fs.existsSync(x.full) && fs.statSync(x.full).isFile())
      .map((x) => ({ ...x, st: fs.statSync(x.full) }))
      .sort((a, b) => a.st.mtimeMs - b.st.mtimeMs);
    const bytes = files.reduce((n, x) => n + x.st.size, 0);
    return { files, bytes };
  } catch {
    return { files: [], bytes: 0 };
  }
}
const MAX_TMP_BYTES = Number(process.env.MAX_TMP_BYTES || 300 * 1024 * 1024);
function sweepTmpDirHardCap() {
  ensureGeneratedDir();
  const { files, bytes } = dirStats(GEN_DIR);
  let cur = bytes;
  for (const x of files) {
    if (cur <= MAX_TMP_BYTES) break;
    try {
      fs.unlinkSync(x.full);
    } catch {}
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

/* --------------------------- Helpers --------------------------- */
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
function getUserToken(req) {
  const auth = req?.headers?.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req?.session?.fbUserAccessToken) return req.session.fbUserAccessToken;
  if (req?.body?.userAccessToken) return req.body.userAccessToken;
  return getFbUserToken() || null;
}
async function uploadVideoToAdAccount(
  adAccountId,
  userAccessToken,
  fileUrl,
  name = 'SmartMark Video',
  description = 'Generated by SmartMark'
) {
  const id = String(adAccountId || '').replace(/^act_/, '').replace(/\D/g, '');
  const url = `https://graph.facebook.com/v23.0/act_${id}/advideos`;
  const form = new FormData();
  form.append('file_url', fileUrl);
  form.append('name', name);
  form.append('description', description);
  const resp = await axios.post(url, form, {
    headers: form.getHeaders(),
    params: { access_token: userAccessToken },
  });
  return resp.data;
}

/* --------------------- Range-enabled streamer --------------------- */
router.get('/media/:file', async (req, res) => {
  housekeeping();
  try {
    const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const full = path.join(ensureGeneratedDir(), file);
    if (!fs.existsSync(full)) return res.status(404).end();

    const stat = fs.statSync(full);
    const ext = path.extname(full).toLowerCase();
    const type =
      ext === '.mp4'
        ? 'video/mp4'
        : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.png'
        ? 'image/png'
        : ext === '.srt'
        ? 'text/plain; charset=utf-8'
        : 'application/octet-stream';

    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    const range = req.headers.range;
    if (range && ext === '.mp4') {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;
      if (start >= stat.size)
        return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(full, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(full).pipe(res);
    }
  } catch {
    res.status(500).end();
  }
});
function mediaPath(relativeFilename) {
  return `/api/media/${relativeFilename}`;
}
function maybeGC() {
  if (global.gc) {
    try {
      global.gc();
    } catch {}
  }
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
  db.data.generated_assets = db.data.generated_assets.filter(
    (a) => (a.expiresAt || 0) > now
  );
  if (db.data.generated_assets.length !== before) await db.write();
}
async function saveAsset({ req, kind, url, absoluteUrl, meta = {} }) {
  await ensureAssetsTable();
  await purgeExpiredAssets();
  const owner = ownerKeyFromReq(req);
  const now = Date.now();
  const rec = {
    id: uuidv4(),
    owner,
    kind,
    url,
    absoluteUrl,
    meta,
    createdAt: now,
    expiresAt: now + ASSET_TTL_MS,
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
async function getRecentImageForOwner(req) {
  await purgeExpiredAssets();
  const owner = ownerKeyFromReq(req);
  const img = (db.data.generated_assets || [])
    .filter((a) => a.owner === owner && a.kind === 'image')
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return img ? img.absoluteUrl || absolutePublicUrl(img.url) : null;
}

/* ---------- Topic/category ---------- */
const IMAGE_KEYWORD_MAP = [
  { match: ['protein', 'supplement', 'muscle', 'fitness', 'gym', 'workout'], keyword: 'gym workout' },
  { match: ['clothing', 'fashion', 'apparel', 'accessory', 'athleisure'], keyword: 'fashion model' },
  { match: ['makeup', 'cosmetic', 'skincare'], keyword: 'makeup application' },
  { match: ['hair', 'shampoo', 'conditioner', 'styling'], keyword: 'hair care' },
  { match: ['food', 'pizza', 'burger', 'meal', 'snack', 'kitchen'], keyword: 'delicious food' },
  { match: ['baby', 'kids', 'toys'], keyword: 'happy children' },
  { match: ['pet', 'dog', 'cat'], keyword: 'pet dog cat' },
  { match: ['electronics', 'phone', 'laptop', 'tech', 'gadget'], keyword: 'tech gadgets' },
  { match: ['home', 'decor', 'furniture', 'bedroom', 'bath'], keyword: 'modern home' },
  { match: ['coffee', 'cafe', 'espresso'], keyword: 'coffee shop' },
];
function getImageKeyword(industry = '', url = '') {
  const input = `${industry} ${url}`.toLowerCase();
  for (const row of IMAGE_KEYWORD_MAP)
    if (row.match.some((m) => input.includes(m))) return row.keyword;
  return industry || 'ecommerce';
}
function deriveTopicKeywords(answers = {}, url = '', fallback = 'shopping') {
  const industry = answers.industry || answers.productType || '';
  const base = getImageKeyword(industry, url) || industry || fallback;
  const extra = String(
    answers.description || answers.product || answers.mainBenefit || ''
  ).toLowerCase();
  if (extra.includes('coffee')) return 'coffee shop';
  if (/(protein|fitness|gym|workout|trainer)/.test(extra)) return 'gym workout';
  if (/(makeup|skincare|cosmetic)/.test(extra)) return 'makeup application';
  if (/hair/.test(extra)) return 'hair care';
  if (/(pet|dog|cat)/.test(extra)) return 'pet dog cat';
  if (/(electronics|phone|laptop)/.test(extra)) return 'tech gadgets';
  return base || fallback;
}
function resolveCategory(answers = {}) {
  const txt = `${answers.industry || ''} ${answers.productType || ''} ${answers.description || ''}`.toLowerCase();
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
  const t = String(text || '');
  const hasAny = (arr) => arr.some((w) => new RegExp(`\\b${w}\\b`, 'i').test(t));
  const APPEND = (line) =>
    (t.replace(/\s+/g, ' ').trim().replace(/[.]*\s*$/, '') + '. ' + line).trim();
  const req =
    {
      fitness: ['workout', 'training', 'gym', 'strength', 'wellness'],
      cosmetics: ['skin', 'makeup', 'beauty', 'serum', 'routine'],
      hair: ['hair', 'shampoo', 'conditioner', 'styling'],
      food: ['fresh', 'flavor', 'taste', 'meal', 'snack'],
      pets: ['pet', 'dog', 'cat', 'treat'],
      electronics: ['tech', 'device', 'gadget', 'performance'],
      home: ['home', 'kitchen', 'decor', 'space'],
      coffee: ['coffee', 'brew', 'roast', 'espresso'],
      fashion: ['style', 'outfit', 'fabric', 'fit'],
      generic: [],
    }[category] || [];
  if (!req.length || hasAny(req)) return t;
  const injection =
    {
      fitness: 'Designed for your workout and training.',
      cosmetics: 'Made to fit into your beauty routine.',
      hair: 'Helps you care for and style your hair.',
      food: 'Made for great taste and an easy experience.',
      pets: 'Made for everyday pet care with less hassle.',
      electronics: 'Built for reliable performance.',
      home: 'A simple way to upgrade your space.',
      coffee: 'Balanced flavor for a better coffee break.',
      fashion: 'Find a look that works for you.',
      generic: 'Easy to use and simple to get started.',
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
    fashion: 'FASHION',
    fitness: 'TRAINING',
    cosmetics: 'BEAUTY',
    hair: 'HAIR CARE',
    food: 'FOOD',
    pets: 'PET CARE',
    electronics: 'TECH',
    home: 'HOME',
    coffee: 'COFFEE',
    generic: 'SHOP',
  }[category || 'generic'];
}
function overlayTitleFromAnswers(answers = {}, categoryOrTopic = '') {
  const category =
    categoryOrTopic &&
    /^(fashion|fitness|cosmetics|hair|food|pets|electronics|home|coffee|generic)$/i.test(
      categoryOrTopic
    )
      ? String(categoryOrTopic).toLowerCase()
      : null;
  const brand = (answers.businessName || '').trim().toUpperCase();
  if (brand) {
    const label = category ? categoryLabelForOverlay(category) : 'SHOP';
    const words = brand.split(/\s+/);
    return (words.length === 1 ? `${brand} ${label}` : brand).slice(0, 30);
  }
  if (category) return categoryLabelForOverlay(category);
  return String(categoryOrTopic || 'SHOP').toUpperCase().slice(0, 24);
}

/* ------------------------ Training context ------------------------ */
const DATA_DIR = path.join(__dirname, '../data');
const ALLOWED_EXT = new Set(['.txt', '.md', '.markdown', '.json']);
const MAX_FILE_MB = 1.5;
const MAX_TOTAL_CHARS = 45000;
function loadTrainingContext() {
  if (!fs.existsSync(DATA_DIR)) return '';
  const files = fs
    .readdirSync(DATA_DIR)
    .map((f) => path.join(__dirname, '../data', f))
    .filter((full) => {
      const ext = path.extname(full).toLowerCase();
      try {
        const st = fs.statSync(full);
        return st.isFile() && ALLOWED_EXT.has(ext) && st.size <= MAX_FILE_MB * 1024 * 1024;
      } catch {
        return false;
      }
    });
  let ctx = '';
  for (const f of files) {
    try {
      const ext = path.extname(f).toLowerCase();
      let text = fs.readFileSync(f, 'utf8');
      if (ext === '.json') {
        try {
          text = JSON.stringify(JSON.parse(text));
        } catch {}
      }
      if (!text.trim()) continue;
      const block = `\n\n### SOURCE: ${path.basename(f)}\n${text}\n`;
      if (ctx.length + block.length <= MAX_TOTAL_CHARS) ctx += block;
    } catch {}
  }
  return ctx.trim();
}
let customContext = loadTrainingContext();

/* ---------------------------- Scrape ---------------------------- */
router.get('/test', (_req, res) => res.json({ msg: 'AI route is working!' }));
async function getWebsiteText(url) {
  try {
    const clean = String(url || '').trim();
    if (!clean || !/^https?:\/\//i.test(clean)) throw new Error('Invalid URL');
    const { data, headers } = await axios.get(clean, {
      timeout: 7000,
      maxRedirects: 3,
      validateStatus: (s) => s < 400,
    });
    if (!headers['content-type']?.includes('text/html')) throw new Error('Not HTML');
    const body = String(data)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (body.length < 200 || /cloudflare|access denied|429/i.test(body))
      throw new Error('blocked/short');
    return body.slice(0, 3500);
  } catch {
    return '';
  }
}

/* --------------------------- Ad Copy --------------------------- */
router.post('/generate-ad-copy', async (req, res) => {
  const { description = '', businessName = '', url = '', answers = {} } = req.body;
  if (!description && !businessName && !url && !answers?.industry) {
    return res.status(400).json({ error: 'Please provide at least a description.' });
  }
  const category = resolveCategory(answers || {});
  const forbidFashionLine =
    category === 'fashion'
      ? ''
      : `- Do NOT mention clothing terms like styles, fits, colors, sizes, outfits, wardrobe.`;
  let prompt = `You are an expert direct-response ad copywriter for e-commerce/online businesses.
${customContext ? `TRAINING CONTEXT:\n${customContext}\n\n` : ''}Write only the exact words for a spoken video ad script (about 46–72 words ≈ 15–17 seconds).
- Keep it neutral and accurate; avoid assumptions about shipping, returns, guarantees, or inventory.
- Keep it specific to the industry/category: ${category}.
${forbidFashionLine}
- Hook → value → simple CTA (from: “Shop now”, “Buy now”, “Learn more”, “Visit us”, “Check us out”, “Take a look”, “Get started”).
- Do NOT mention a website or domain.
Output ONLY the script text.`;
  if (description) prompt += `\nBusiness Description: ${description}`;
  if (businessName) prompt += `\nBusiness Name: ${businessName}`;
  if (answers?.industry) prompt += `\nIndustry: ${answers.industry}`;
  if (url) prompt += `\nWebsite (for context only): ${url}`;

  try {
    const r = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.35,
    });
    let script = r.choices?.[0]?.message?.content?.trim() || '';
    const categoryFixed = resolveCategory(answers || {});
    script = stripFashionIfNotApplicable(script, categoryFixed);
    script = enforceCategoryPresence(script, categoryFixed);
    script = cleanFinalText(script);
    res.json({ adCopy: script });
  } catch {
    res.status(500).json({ error: 'Failed to generate ad copy' });
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
      } catch {
        return 'Your Brand';
      }
    };
    const brand =
      (answers.businessName && String(answers.businessName).trim()) || brandFromUrl(url);
    const industry = (answers.industry && String(answers.industry).trim()) || '';
    const mainBenefit = (answers.mainBenefit && String(answers.mainBenefit).trim()) || '';
    const offer = (answers.offer && String(answers.offer).trim()) || '';

    let websiteText = '';
    try {
      if (url && /^https?:\/\//i.test(url)) websiteText = await getWebsiteText(url);
    } catch {}

    const forbidFashionLine =
      category === 'fashion'
        ? ''
        : `- Do NOT mention clothing terms like styles, fits, colors, sizes, outfits, wardrobe.`;

    const prompt = `
${customContext ? `TRAINING CONTEXT:\n${customContext}\n\n` : ''}You are a senior direct-response copywriter for e-commerce.
Write JSON ONLY:

{
  "headline": "max 55 characters, plain and neutral (no assumptions)",
  "body": "18-30 words, friendly and value-focused, neutral claims only, no emojis/hashtags",
  "image_overlay_text": "4 words max, simple CTA in ALL CAPS"
}

Rules:
- Keep copy specific to the category: ${category}.
${forbidFashionLine}
- Never include a website or domain.
Context:
Brand: ${brand}
Industry: ${industry || '[general ecommerce]'}
Main benefit: ${mainBenefit || '[unspecified]'}
Offer: ${offer || '[none]'}
Website text (may be empty): """${(websiteText || '').slice(0, 1200)}"""`.trim();

    let headline = '',
      body = '',
      overlay = '';
    try {
      const r = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 220,
        temperature: 0.35,
      });
      const raw = r.choices?.[0]?.message?.content?.trim() || '{}';
      const jsonStr = (raw.match(/\{[\s\S]*\}/) || [raw])[0];
      const parsed = JSON.parse(jsonStr);

      const clean = (s, max = 200) => cleanFinalText(String(s || '')).slice(0, max);
      headline = clean(parsed.headline, 55);
      body = stripFashionIfNotApplicable(clean(parsed.body, 220), category);
      overlay = clean(parsed.image_overlay_text, 28);
    } catch {
      headline = `${brand}: New Products`;
      body =
        'Explore useful products designed for daily use, with a focus on simplicity and value. See what works best for you.';
      overlay = 'LEARN MORE';
    }

    headline = headline.replace(/["<>]/g, '').slice(0, 55);
    body = body.replace(/["<>]/g, '').trim();
    overlay = pickFromAllowedCTAs(answers).toUpperCase();

    return res.json({ headline, body, image_overlay_text: overlay });
  } catch {
    return res.json({
      headline: 'New Products Just In',
      body:
        'Explore everyday products designed for simplicity and value. See what’s new and find what works for you.',
      image_overlay_text: 'LEARN MORE',
    });
  }
});

/* ---------------------- Image overlays ---------------------- */
const PEXELS_IMG_BASE = 'https://api.pexels.com/v1/search';
function escSVG(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function estWidth(text, fs) {
  return (String(text || '').length || 1) * fs * 0.6;
}
function fitFont(text, maxW, startFs, minFs = 26) {
  let fs = startFs;
  while (fs > minFs && estWidth(text, fs) > maxW) fs -= 2;
  return fs;
}
function splitTwoLines(text, maxW, startFs) {
  const words = String(text || '')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= 2) return { lines: [text], fs: fitFont(text, maxW, startFs) };
  for (let cut = Math.ceil(words.length / 2); cut < words.length - 1; cut++) {
    const a = words.slice(0, cut).join(' ');
    const b = words.slice(cut).join(' ');
    let fs = startFs;
    fs = Math.min(fitFont(a, maxW, fs), fitFont(b, maxW, fs));
    if (estWidth(a, fs) <= maxW && estWidth(b, fs) <= maxW) return { lines: [a, b], fs };
  }
  return { lines: [text], fs: fitFont(text, maxW, startFs) };
}
const BANNED_TERMS = /\b(unisex|global|vibes?|forward|finds?|chic|bespoke|avant|couture)\b/i;
function cleanHeadline(h) {
  h = String(h || '').replace(/[^a-z0-9 &\-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!h || BANNED_TERMS.test(h)) return '';
  const words = h.split(' ');
  if (words.length > 6) h = words.slice(0, 6).join(' ');
  return h.toUpperCase();
}
const ALLOWED_CTAS = [
  'SHOP NOW!',
  'BUY NOW!',
  'CHECK US OUT!',
  'VISIT US!',
  'TAKE A LOOK!',
  'LEARN MORE!',
  'GET STARTED!',
];
function pickFromAllowedCTAs(answers = {}, seed = '') {
  const t = String(answers?.cta || '').trim();
  if (t) {
    const norm = t
      .toUpperCase()
      .replace(/[\'’]/g, '')
      .replace(/[^A-Z0-9 !?]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const withBang = /!$/.test(norm) ? norm : `${norm}!`;
    if (ALLOWED_CTAS.includes(withBang)) return withBang;
  }
  let h = 0;
  for (const c of String(seed || Date.now())) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ALLOWED_CTAS[h % ALLOWED_CTAS.length];
}
function cleanCTA(c) {
  const norm = String(c || '')
    .toUpperCase()
    .replace(/[\'’]/g, '')
    .replace(/[^A-Z0-9 !?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const withBang = /!$/.test(norm) ? norm : norm ? `${norm}!` : '';
  return ALLOWED_CTAS.includes(withBang) ? withBang : 'LEARN MORE!';
}
function pickSansFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return null;
}
async function analyzeImageForPlacement(imgBuf) {
  try {
    const W = 72,
      H = 72;
    const { data } = await sharp(imgBuf)
      .resize(W, H, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let left = 0,
      right = 0,
      top = 0,
      bottom = 0,
      rSum = 0,
      gSum = 0,
      bSum = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const r = data[i],
          g = data[i + 1],
          b = data[i + 2];
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        if (x < W / 2) left += l;
        else right += l;
        if (y < H / 2) top += l;
        else bottom += l;
        rSum += r;
        gSum += g;
        bSum += b;
      }
    }
    const darkerSide = left < right ? 'left' : 'right';
    const darkerBand = top < bottom ? 'top' : 'bottom';
    const avg = {
      r: Math.round(rSum / (W * H)),
      g: Math.round(gSum / (W * H)),
      b: Math.round(bSum / (W * H)),
    };
    const palette = ['#E63946', '#2B6CB0', '#2F855A', '#6B46C1', '#E98A15', '#D61C4E'];
    const idx = ((avg.r > avg.g) + (avg.g > avg.b) * 2 + (avg.r > avg.b) * 3) % palette.length;
    const brandColor = palette[idx];
    const diffLR = Math.abs(left - right) / (W * H);
    return { darkerSide, darkerBand, brandColor, diffLR };
  } catch {
    return { darkerSide: 'left', darkerBand: 'top', brandColor: '#E63946', diffLR: 0.0 };
  }
}
function svgDefs(brandColor) {
  return `
    <defs>
      <linearGradient id="gShadeV" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000A"/><stop offset="100%" stop-color="#0000"/>
      </linearGradient>
      <linearGradient id="gShadeHLeft" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="#000B"/><stop offset="100%" stop-color="#0000"/>
      </linearGradient>
      <linearGradient id="panelGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.90"/>
        <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.65"/>
      </linearGradient>
      <filter id="glass" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="0.6" result="blur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.9"/>
        </feComponentTransfer>
      </filter>
      <pattern id="dots" x="0" y="0" width="18" height="18" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1.6" fill="#ffffff22"/>
      </pattern>
    </defs>
  `;
}
const LIGHT = '#f5f7f9';

/* ---------- NEW: subline crafting (short, safe) ---------- */
function craftSubline(answers = {}, category = 'generic') {
  const pick = (s) => String(s || '').replace(/[^\w\s\-']/g, '').trim();
  const candidates = [
    pick(answers.mainBenefit),
    pick(answers.description),
    pick(answers.productType),
    {
      fashion: 'your quality of fashion',
      cosmetics: 'your quality of beauty',
      hair: 'better hair care',
      food: 'great taste, less hassle',
      pets: 'care for your pet',
      electronics: 'reliable everyday tech',
      home: 'upgrade your space',
      coffee: 'better coffee breaks',
      fitness: 'made for your workouts',
      generic: 'made for everyday use',
    }[category] || 'made for everyday use',
  ].filter(Boolean);

  let line = candidates[0] || candidates[candidates.length - 1];
  line = line.toLowerCase();
  const words = line.split(/\s+/).filter(Boolean).slice(0, 7);
  if (words.length < 4 && candidates[1]) {
    const more = String(candidates[1]).toLowerCase().split(/\s+/).filter(Boolean);
    while (words.length < 5 && more.length) words.push(more.shift());
  }
  return words.join(' ');
}

/* ---------- CTA pill ---------- */
const pillBtn = (x, y, text, fs = 28) => {
  fs = Math.max(22, Math.min(fs, 34));
  const w = Math.min(860, estWidth(text, fs) + 60);
  const h = 56;
  const x0 = x - w / 2;
  return `
    <g transform="translate(${x0}, ${y - Math.floor(h * 0.55)})">
      <rect x="0" y="-16" width="${w}" height="${h}" rx="28" fill="#0b0d10dd"/>
      <text x="${w / 2}" y="13" text-anchor="middle"
            font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
            font-size="${fs}" font-weight="900" fill="#ffffff" letter-spacing="1.0">
        ${escSVG(text)}
      </text>
    </g>`;
};

/* ---- flag: only show SALE badge when user mentions an offer ---- */
function wantsSaleBadge(answers = {}) {
  const t = `${answers.offer || ''} ${answers.description || ''}`.toLowerCase();
  return /(sale|% off|percent off|discount|save|clearance|deal)/i.test(t);
}

/* ---------- Templated SVG with guaranteed spacing ---------- */
function svgOverlayCreative({
  W,
  H,
  title,
  subline,
  cta,
  prefer = 'left',
  preferBand = 'top',
  brandColor = '#E63946',
  choose = 3,
  sale = false,
}) {
  const defs = svgDefs(brandColor);

  const SAFE_PAD = 24;
  const PANEL_W = 560;
  const PANEL_PAD = 34;
  const TITLE_MAX_W = (W) => W - 2 * (SAFE_PAD + PANEL_PAD);
  const SUB_FS_BASE = 32;
  const TITLE_FS_CAP = 66;

  const fitTitle = (maxW) => {
    const first = splitTwoLines(title, maxW, TITLE_FS_CAP);
    return { lines: first.lines, fs: first.fs };
  };
  const fitSub = (maxW) => {
    const fs = fitFont(subline, maxW, SUB_FS_BASE, 22);
    return { fs };
  };

  if (choose === 1) {
    const bandH = 252;
    const maxW = TITLE_MAX_W(W);
    const t = fitTitle(maxW);
    const s = fitSub(maxW);
    const yTitle = 128;
    const ySub = yTitle + t.fs * t.lines.length + 30;
    const yCTA = ySub + s.fs + 44;

    return `${defs}
      <rect x="0" y="0" width="${W}" height="${bandH}" fill="url(#gShadeV)" />
      <text x="${W / 2}" y="${yTitle}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${t.fs}" font-weight="1000" fill="${LIGHT}" letter-spacing="1.4">
        <tspan x="${W / 2}" dy="0">${escSVG(t.lines[0])}</tspan>
        ${t.lines[1] ? `<tspan x="${W / 2}" dy="${t.fs * 1.05}">${escSVG(t.lines[1])}</tspan>` : ''}
      </text>
      <text x="${W / 2}" y="${ySub}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${s.fs}" font-weight="700" fill="${LIGHT}" letter-spacing="0.6">
        ${escSVG(subline)}
      </text>
      ${pillBtn(W / 2, yCTA, cta, 30)}
    `;
  }

  const x0 = prefer === 'left' ? SAFE_PAD : W - PANEL_W - SAFE_PAD;
  const cx = x0 + PANEL_W / 2;
  const textW = PANEL_W - 2 * PANEL_PAD;
  const t3 = fitTitle(textW);
  const s3 = fitSub(textW);

  if (choose === 3) {
    const yTitle = 180;
    const ySub = yTitle + t3.fs * t3.lines.length + 22;
    const yCTA = ySub + s3.fs + 44;

    return `${defs}
      <g filter="url(#glass)">
        <rect x="${x0}" y="${SAFE_PAD}" width="${PANEL_W}" height="${H - 2 * SAFE_PAD}" rx="28" fill="url(#panelGrad)"/>
      </g>
      <rect x="${x0}" y="${SAFE_PAD}" width="${PANEL_W}" height="${H - 2 * SAFE_PAD}" rx="28" fill="url(#dots)"/>
      <text x="${cx}" y="${yTitle}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${t3.fs}" font-weight="1000" fill="#ffffff" letter-spacing="1.2">
        <tspan x="${cx}" dy="0">${escSVG(t3.lines[0])}</tspan>
        ${t3.lines[1] ? `<tspan x="${cx}" dy="${t3.fs * 1.05}">${escSVG(t3.lines[1])}</tspan>` : ''}
      </text>
      <text x="${cx}" y="${ySub}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${s3.fs}" font-weight="700" fill="#ffffff" letter-spacing="0.6">
        ${escSVG(subline)}
      </text>
      ${pillBtn(cx, yCTA, cta, 28)}
    `;
  }

  if (choose === 6) {
    const yBase = preferBand === 'top' ? 140 : H - 140 - t3.fs * t3.lines.length;
    const ySub = yBase + t3.fs * t3.lines.length + 24;
    const yCTA = ySub + s3.fs + 40;
    const anchorX =
      prefer === 'left'
        ? SAFE_PAD + PANEL_PAD + textW / 2
        : W - SAFE_PAD - PANEL_PAD - textW / 2;

    return `${defs}
      <rect x="${prefer === 'left' ? 0 : W - PANEL_W}" y="0" width="${PANEL_W}" height="${H}" fill="url(#gShadeHLeft)"/>
      <text x="${anchorX}" y="${yBase}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${t3.fs}" font-weight="1000" fill="#f2f5f6" letter-spacing="1.2">
        <tspan x="${anchorX}" dy="0">${escSVG(t3.lines[0])}</tspan>
        ${t3.lines[1] ? `<tspan x="${anchorX}" dy="${t3.fs * 1.05}">${escSVG(t3.lines[1])}</tspan>` : ''}
      </text>
      <text x="${anchorX}" y="${ySub}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${s3.fs}" font-weight="700" fill="#f2f5f6" letter-spacing="0.6">
        ${escSVG(subline)}
      </text>
      ${pillBtn(anchorX, yCTA, cta, 26)}
    `;
  }

  if (choose === 4) {
    const ribbonH = 170;
    const angle = prefer === 'left' ? -10 : 10;
    const xMid = W / 2;
    const yMid = H * 0.28;
    const t = fitTitle(W - 240);
    const yCTA = H * 0.74;

    return `${defs}
      <g transform="translate(${xMid},${yMid}) rotate(${angle})">
        <rect x="${-W / 2}" y="${-ribbonH / 2}" width="${W}" height="${ribbonH}" fill="${brandColor}" opacity="0.92" />
        <rect x="${-W / 2}" y="${-ribbonH / 2}" width="${W}" height="${ribbonH}" fill="url(#dots)" />
        <text x="0" y="-10" text-anchor="middle"
          font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
          font-size="${t.fs}" font-weight="1000" fill="#ffffff" letter-spacing="1.4">
          <tspan x="0" dy="0">${escSVG(t.lines[0])}</tspan>
          ${t.lines[1] ? `<tspan x="0" dy="${t.fs * 1.05}">${escSVG(t.lines[1])}</tspan>` : ''}
        </text>
      </g>
      ${pillBtn(W / 2, yCTA, cta, 30)}
    `;
  }

  if (choose === 5 && sale) {
    const fit5 = fitTitle(W - 160);
    const sub = fitSub(W - 160);
    const yTitle = H * 0.76;
    const ySub = yTitle + fit5.fs * fit5.lines.length + 20;
    const yCTA = ySub + sub.fs + 36;

    return `${defs}
      <rect x="0" y="0" width="${W}" height="${H}" fill="url(#gShadeHLeft)"/>
      <g transform="translate(${prefer === 'left' ? 120 : W - 120}, ${H * 0.18})">
        <circle r="78" fill="#00000055"></circle>
        <circle r="74" fill="${brandColor}" opacity="0.95"></circle>
        <circle r="74" fill="url(#dots)"></circle>
        <text x="0" y="10" text-anchor="middle"
          font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
          font-size="28" font-weight="900" fill="#fff">SALE</text>
      </g>
      <text x="${W / 2}" y="${yTitle}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${fit5.fs}" font-weight="1000" fill="${LIGHT}" letter-spacing="1.2">
        <tspan x="${W / 2}" dy="0">${escSVG(fit5.lines[0])}</tspan>
        ${fit5.lines[1] ? `<tspan x="${W / 2}" dy="${fit5.fs * 1.05}">${escSVG(fit5.lines[1])}</tspan>` : ''}
      </text>
      <text x="${W / 2}" y="${ySub}" text-anchor="middle"
        font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
        font-size="${sub.fs}" font-weight="700" fill="${LIGHT}" letter-spacing="0.6">
        ${escSVG(subline)}
      </text>
      ${pillBtn(W / 2, yCTA, cta, 28)}
    `;
  }

  return svgOverlayCreative({
    W,
    H,
    title,
    subline,
    cta,
    prefer,
    preferBand,
    brandColor,
    choose: 3,
    sale,
  });
}

/* ---------- Updated builder (sharper, no enlargement) ---------- */
async function buildOverlayImage({
  imageUrl,
  headlineHint = '',
  ctaHint = '',
  seed = '',
  fallbackHeadline = 'SHOP',
  answers = {},
  category = 'generic',
}) {
  const W = 1200,
    H = 628;
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 11000 });
  const analysis = await analyzeImageForPlacement(imgRes.data);
  const base = sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
    .removeAlpha();
  const title = cleanHeadline(headlineHint) || cleanHeadline(fallbackHeadline) || 'SHOP';
  const subline = craftSubline(answers, category);
  const cta = cleanCTA(ctaHint) || 'LEARN MORE!';
  let h = 0;
  for (const c of String(seed || Date.now())) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const sale = wantsSaleBadge(answers);
  const choices = analysis.diffLR > 40 ? [3, 1, 6, 4, sale ? 5 : 1] : [1, 3, 6, 4, sale ? 5 : 3];
  const tpl = choices[h % choices.length];
  const overlaySVG = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgOverlayCreative({
      W,
      H,
      title,
      subline,
      cta,
      prefer: analysis.darkerSide,
      preferBand: analysis.darkerBand,
      brandColor: analysis.brandColor,
      choose: tpl,
      sale,
    })}</svg>`
  );
  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;
  await base
    .composite([{ input: overlaySVG, top: 0, left: 0 }])
    .jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(outDir, file));
  maybeGC();
  return {
    publicUrl: mediaPath(file),
    absoluteUrl: absolutePublicUrl(mediaPath(file)),
    filename: file,
  };
}

/* ------------------------------- Utils ------------------------------- */
async function downloadFileWithTimeout(url, dest, timeoutMs = 16000, maxSizeMB = 15) {
  return new Promise((resolve, reject) => {
    if (!url || !/^https?:\/\//i.test(String(url)))
      return reject(new Error('Invalid clip URL'));
    const writer = fs.createWriteStream(dest);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      writer.destroy();
      try {
        fs.unlinkSync(dest);
      } catch {}
      reject(new Error('Download timed out'));
    }, timeoutMs);
    axios({ url, method: 'GET', responseType: 'stream', timeout: timeoutMs })
      .then((resp) => {
        let bytes = 0;
        resp.data.on('data', (ch) => {
          bytes += ch.length;
          if (bytes > maxSizeMB * 1024 * 1024 && !timedOut) {
            timedOut = true;
            writer.destroy();
            try {
              fs.unlinkSync(dest);
            } catch {}
            clearTimeout(timeout);
            reject(new Error('File too large'));
          }
        });
        resp.data.on('error', (err) => {
          clearTimeout(timeout);
          if (!timedOut) reject(err);
        });
        resp.data.pipe(writer);
        writer.on('finish', () => {
          clearTimeout(timeout);
          if (!timedOut) resolve(dest);
        });
        writer.on('error', (err) => {
          clearTimeout(timeout);
          try {
            fs.unlinkSync(dest);
          } catch {}
          if (!timedOut) reject(err);
        });
      })
      .catch((err) => {
        clearTimeout(timeout);
        try {
          fs.unlinkSync(dest);
        } catch {}
        reject(err);
      });
  });
}

/* -------------------- Video constants -------------------- */
const V_W = 1080;
const V_H = 1080;
const FPS = 30;

function pickSerifFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {}
  }
  return pickSansFontFile();
}
function safeFFText(t) {
  return String(t || '')
    .replace(/[\'’]/g, '')
    .replace(/[\n\r]/g, ' ')
    .replace(/[:]/g, ' ')
    .replace(/[\\"]/g, '')
    .replace(/(?:https?:\/\/)?(?:www\.)?[a-z0-9\-]+\.[a-z]{2,}(?:\/\S*)?/gi, '')
    .replace(/\b(dot|com|net|org|io|co)\b/gi, '')
    .replace(/[^A-Za-z0-9 !?\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 40);
}

/* ---- Captions ---- */
function splitForCaptions(text) {
  let parts = String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .split(/(?<=[.?!])\s+/)
    .filter(Boolean);
  if (parts.length < 3) {
    const more = String(text).split(/,\s+/).filter((s) => s.length > 12);
    parts = parts.concat(more).slice(0, 5);
  }
  if (parts.length > 5) {
    const merged = [];
    for (const p of parts) {
      if (!merged.length) merged.push(p);
      else if (merged[merged.length - 1].length < 40) merged[merged.length - 1] += ' ' + p;
      else merged.push(p);
      if (merged.length === 5) break;
    }
    parts = merged;
  }
  return parts.map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean);
}
function secsToSrt(ts) {
  const h = Math.floor(ts / 3600);
  const m = Math.floor((ts % 3600) / 60);
  const s = Math.floor(ts % 60);
  const ms = Math.floor((ts - Math.floor(ts)) * 1000);
  const pad = (n, l = 2) => `${n}`.padStart(l, '0');
  const pad3 = (n) => `${n}`.padStart(3, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad3(ms)}`;
}
function buildCaptionDrawtexts(script, duration, fontParam, workId = 'w') {
  const outDir = ensureGeneratedDir();
  const files = [];
  const WINDOW_START = 0.35,
    TAIL = 0.8;
  const endWindow = Math.max(WINDOW_START + 1.2, duration - TAIL);
  const total = Math.max(1.2, endWindow - WINDOW_START);
  const segs = splitForCaptions(script);
  if (!segs.length) return { filter: '', files: [], srtPath: '' };

  const lens = segs.map((s) => Math.max(12, Math.min(90, s.length)));
  const sum = lens.reduce((a, b) => a + b, 0);
  let t = WINDOW_START;
  const pieces = [];
  const baseStyle =
    "fontcolor=white@0.99:borderw=2:bordercolor=black@0.85:shadowx=1:shadowy=1:shadowcolor=black@0.7:box=1:boxcolor=0x000000@0.50:boxborderw=28:fontsize=34:x='(w-tw)/2':y='h*0.82'";
  const srtLines = [];

  for (let i = 0; i < segs.length; i++) {
    const dur = Math.max(1.2, (lens[i] / sum) * total);
    const start = t;
    const stop = Math.min(endWindow, t + dur);
    t = stop + 0.05;
    const tf = path.join(outDir, `cap_${workId}_${i}.txt`);
    try {
      fs.writeFileSync(tf, segs[i]);
      files.push(tf);
    } catch {}
    pieces.push(
      `drawtext=${fontParam}textfile='${tf}':reload=0:${baseStyle}:enable='between(t,${start.toFixed(
        2
      )},${stop.toFixed(2)})'`
    );
    srtLines.push(`${i + 1}\n${secsToSrt(start)} --> ${secsToSrt(stop)}\n${segs[i]}\n`);
    if (t >= endWindow) break;
  }
  const srtPath = path.join(outDir, `sub_${workId}.srt`);
  try {
    fs.writeFileSync(srtPath, srtLines.join('\n'));
  } catch {}
  return { filter: pieces.join(','), files, srtPath };
}

/* -------------------- Still video -------------------- */
async function composeStillVideo({
  imageUrl,
  duration,
  ttsPath = null,
  musicPath = null,
  brandLine = 'YOUR BRAND!',
  ctaText = 'LEARN MORE!',
  scriptText = '',
}) {
  housekeeping();
  const outDir = ensureGeneratedDir();
  const id = uuidv4();
  const outFile = `${id}.mp4`;
  const outPath = path.join(outDir, outFile);

  let finalImageUrl = imageUrl || 'https://picsum.photos/seed/smartmark/1200/1200';
  try {
    await axios.get(finalImageUrl, { timeout: 5000 });
  } catch {
    finalImageUrl = 'https://singlecolorimage.com/get/2b2f33/1200x1200';
  }

  let imgFile = null;
  try {
    imgFile = path.join(outDir, `${id}.jpg`);
    const imgRes = await axios.get(finalImageUrl, {
      responseType: 'arraybuffer',
      timeout: 9000,
    });
    const sharped = await sharp(imgRes.data)
      .resize(1200, 1200, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 93, chromaSubsampling: '4:4:4', mozjpeg: true })
      .toBuffer();
    fs.writeFileSync(imgFile, sharped);
  } catch {
    imgFile = null;
  }

  const sansFile = pickSansFontFile();
  const serifFile = pickSerifFontFile();
  const fontParamSans = sansFile ? `fontfile='${sansFile}':` : `font='Arial':`;
  const fontParamSerif = serifFile ? `fontfile='${serifFile}':` : `font='Arial Black':`;
  const txtCommon =
    'fontcolor=white@0.99:borderw=2:bordercolor=black@0.88:shadowx=1:shadowy=1:shadowcolor=black@0.75';

  const brand = safeFFText(brandLine);
  const cta = safeFFText(ctaText);

  const TAIL = 0.8;

  const args = ['-y'];
  if (imgFile) {
    args.push('-loop', '1', '-t', duration.toFixed(2), '-i', imgFile);
  } else {
    args.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', `color=c=0x101318:s=${V_W}x${V_H}`);
  }

  if (ttsPath) args.push('-i', ttsPath);
  if (musicPath) args.push('-i', musicPath);
  args.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');

  const baseVideo = imgFile
    ? `[0:v]scale='if(gte(iw/ih,1),${V_W},-2)':'if(gte(iw/ih,1),-2,${V_H})':flags=lanczos,` +
      `pad=${V_W}:${V_H}:((${V_W}-iw)/2):(${V_H}-ih)/2,setsar=1,format=yuv420p,` +
      `zoompan=z='min(zoom+0.00022,1.018)':d=${Math.floor(FPS * duration)}:x='(iw-iw/zoom)/2':y='(ih-ih/zoom)/2',fps=${FPS}[cv]`
    : `[0:v]fps=${FPS},format=yuv420p[cv]`;

  const brandIntro = `drawtext=${fontParamSans}text='${brand}':${txtCommon}:fontsize=46:x='(w-tw)/2':y='h*0.10':enable='between(t,0.2,3.1)'`;
  const ctaOutro = `drawtext=${fontParamSans}text='${cta}':${txtCommon}:box=1:boxcolor=0x0b0d10@0.82:boxborderw=22:fontsize=58:x='(w-tw)/2':y='(h*0.50-20)':enable='gte(t,${(
    duration - TAIL
  ).toFixed(2)})'`;
  const subsBuild = buildCaptionDrawtexts(scriptText, duration, fontParamSerif, id);
  let fc = `${baseVideo};[cv]${brandIntro}${subsBuild.filter ? ',' + subsBuild.filter : ''},${ctaOutro},format=yuv420p[v]`;

  const mixInputs = [];
  let aIdx = 1;
  if (ttsPath) {
    mixInputs.push(`${aIdx}:a`);
    aIdx++;
  }
  if (musicPath) {
    mixInputs.push(`${aIdx}:a`);
    aIdx++;
  }
  mixInputs.push(`${aIdx}:a`);
  fc += `;${mixInputs
    .map((m, i) => `[${m}]aresample=48000${i === 1 ? ',volume=0.18' : ''}[a${i}]`)
    .join(';')};${mixInputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${
    mixInputs.length
  }:duration=longest:normalize=1[mix]`;

  args.push(
    '-filter_complex',
    fc,
    '-map',
    '[v]',
    '-map',
    '[mix]',
    '-t',
    duration.toFixed(2),
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    '5200k',
    '-maxrate',
    '6800k',
    '-bufsize',
    '13600k',
    '-g',
    String(FPS * 2),
    '-keyint_min',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-shortest',
    '-avoid_negative_ts',
    'make_zero',
    '-max_muxing_queue_size',
    '1024',
    '-loglevel',
    'error',
    outPath
  );

  await runSpawn('ffmpeg', args, { killAfter: 90000, killMsg: 'still-video timeout' });

  try {
    if (imgFile) fs.unlinkSync(imgFile);
  } catch {}
  try {
    for (const f of subsBuild.files || []) fs.unlinkSync(f);
  } catch {}
  return {
    publicUrl: mediaPath(outFile),
    absoluteUrl: absolutePublicUrl(mediaPath(outFile)),
    subtitlesUrl: subsBuild.srtPath
      ? absolutePublicUrl(mediaPath(path.basename(subsBuild.srtPath)))
      : '',
  };
}

/* -------------------- Title card (fallback) -------------------- */
async function composeTitleCardVideo({
  duration,
  ttsPath = null,
  musicPath = null,
  brandLine = 'YOUR BRAND!',
  ctaText = 'LEARN MORE!',
  scriptText = '',
}) {
  housekeeping();
  const outDir = ensureGeneratedDir();
  const id = uuidv4();
  const outFile = `${id}.mp4`;
  const outPath = path.join(outDir, outFile);

  const sansFile = pickSansFontFile();
  const serifFile = pickSerifFontFile();
  const fontParamSans = sansFile ? `fontfile='${sansFile}':` : `font='Arial':`;
  const fontParamSerif = serifFile ? `fontfile='${serifFile}':` : `font='Arial Black':`;
  const txtCommon =
    'fontcolor=white@0.99:borderw=2:bordercolor=black@0.88:shadowx=1:shadowy=1:shadowcolor=black@0.75';

  const brand = safeFFText(brandLine);
  const cta = safeFFText(ctaText);
  const TAIL = 0.8;

  const args = ['-y', '-f', 'lavfi', '-t', duration.toFixed(2), '-i', `color=c=0x101318:s=${V_W}x${V_H}`];
  if (ttsPath) args.push('-i', ttsPath);
  if (musicPath) args.push('-i', musicPath);
  args.push('-f', 'lavfi', '-t', duration.toFixed(2), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');

  const intro = `drawtext=${fontParamSans}text='${brand}':${txtCommon}:fontsize=58:x='(w-tw)/2':y='(h*0.36-88)':enable='between(t,0.3,${(
    duration - TAIL - 0.6
  ).toFixed(2)})'`;
  const ctaFx = `drawtext=${fontParamSans}text='${cta}':${txtCommon}:box=1:boxcolor=0x0b0d10@0.82:boxborderw=22:fontsize=58:x='(w-tw)/2':y='(h*0.50)':enable='gte(t,${(
    duration - TAIL
  ).toFixed(2)})'`;
  const subsBuild = buildCaptionDrawtexts(scriptText, duration, fontParamSerif, id);
  let fc = `[0:v]fps=${FPS},format=yuv420p,${intro}${subsBuild.filter ? ',' + subsBuild.filter : ''},${ctaFx},format=yuv420p[v]`;

  const mixInputs = [];
  let aIdx = 1;
  if (ttsPath) {
    mixInputs.push(`${aIdx}:a`);
    aIdx++;
  }
  if (musicPath) {
    mixInputs.push(`${aIdx}:a`);
    aIdx++;
  }
  mixInputs.push(`${aIdx}:a`);
  fc += `;${mixInputs
    .map((m, i) => `[${m}]aresample=48000${i === 1 ? ',volume=0.18' : ''}[b${i}]`)
    .join(';')};${mixInputs.map((_, i) => `[b${i}]`).join('')}amix=inputs=${
    mixInputs.length
  }:duration=longest:normalize=1[mix]`;

  args.push(
    '-filter_complex',
    fc,
    '-map',
    '[v]',
    '-map',
    '[mix]',
    '-t',
    duration.toFixed(2),
    '-r',
    String(FPS),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '21',
    '-pix_fmt',
    'yuv420p',
    '-b:v',
    '5200k',
    '-maxrate',
    '6800k',
    '-bufsize',
    '13600k',
    '-g',
    String(FPS * 2),
    '-keyint_min',
    String(FPS),
    '-c:a',
    'aac',
    '-b:a',
    '160k',
    '-ar',
    '48000',
    '-movflags',
    '+faststart',
    '-avoid_negative_ts',
    'make_zero',
    '-shortest',
    '-max_muxing_queue_size',
    '1024',
    '-loglevel',
    'error',
    outPath
  );

  await runSpawn('ffmpeg', args, { killAfter: 80000, killMsg: 'title-card timeout' });
  try {
    for (const f of subsBuild.files || []) fs.unlinkSync(f);
  } catch {}
  return {
    publicUrl: mediaPath(outFile),
    absoluteUrl: absolutePublicUrl(mediaPath(outFile)),
    subtitlesUrl: subsBuild.srtPath
      ? absolutePublicUrl(mediaPath(path.basename(subsBuild.srtPath)))
      : '',
  };
}

/* -------------------------- Spawn helpers -------------------------- */
function runSpawn(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'], ...opts });
    let killed = false;
    const killTimer = opts.killAfter
      ? setTimeout(() => {
          killed = true;
          try {
            child.kill('SIGKILL');
          } catch {}
          reject(new Error(opts.killMsg || 'process timeout'));
        }, opts.killAfter)
      : null;
    child.on('error', (err) => {
      if (killTimer) clearTimeout(killTimer);
      reject(err);
    });
    child.on('close', (code) => {
      if (killTimer) clearTimeout(killTimer);
      if (killed) return;
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}
async function probeDuration(file, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nokey=1:noprint_wrappers=1', file],
      { stdio: ['ignore', 'pipe,', 'ignore'] }
    );
    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve(0);
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      if (out.length < 64) out += d.toString('utf8');
    });
    child.on('close', () => {
      clearTimeout(timer);
      const s = parseFloat(out.trim());
      resolve(isNaN(s) ? 0 : s);
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(0);
    });
  });
}

/* ------------------------------- VIDEO ------------------------------- */
router.post('/generate-video-ad', heavyLimiter, async (req, res) => {
  housekeeping();
  try {
    if (typeof res.setTimeout === 'function') res.setTimeout(180000);
    if (typeof req.setTimeout === 'function') req.setTimeout(180000);
  } catch {}
  res.setHeader('Content-Type', 'application/json');

  try {
    const { url = '', answers = {}, regenerateToken = '' } = req.body;
    const token = getUserToken(req);

    const category = resolveCategory(answers || {});
    const topic = deriveTopicKeywords(answers, url, 'ecommerce');
    const brandBase =
      (answers?.businessName && String(answers.businessName).trim()) ||
      overlayTitleFromAnswers(answers, category);
    let brandForVideo = (brandBase || 'Your Brand')
      .toUpperCase()
      .replace(/[^A-Z0-9 \-]/g, '')
      .trim();
    if (!/!$/.test(brandForVideo)) brandForVideo += '!';
    const ctaText = pickFromAllowedCTAs(
      answers,
      regenerateToken || answers?.businessName || topic
    );

    const BUDGET_MS = Number(process.env.AD_GEN_BUDGET_MS || 65000);
    const startTs = Date.now();
    const timeLeft = () => Math.max(0, BUDGET_MS - (Date.now() - startTs));

    const forbidFashionLine =
      category === 'fashion'
        ? ''
        : `- Do NOT mention clothing terms like styles, fits, colors, sizes, outfits, wardrobe.`;
    const buildPrompt = (lo, hi) =>
      `Write a simple, neutral spoken ad script for an e-commerce/online business in the "${category}" category, about ${topic}.
- About ${lo}-${hi} words.
- Keep it specific to the category, and accurate. ${forbidFashionLine}
- Avoid assumptions (no promises about shipping, returns, guarantees, or inventory).
- Do not include a website or domain.
- Use the CTA phrase exactly once at the end: "${ctaText}".
- Structure: brief hook → value/what to expect → CTA.
Output ONLY the script text.`;
    async function makeTTS(scriptText) {
      const tmpDir = ensureGeneratedDir();
      const file = path.join(tmpDir, `${uuidv4()}.mp3`);
      const ttsRes = await openai.audio.speech.create({
        model: 'tts-1',
        voice: 'alloy',
        input: scriptText,
      });
      const buf = Buffer.from(await ttsRes.arrayBuffer());
      fs.writeFileSync(file, buf);
      return file;
    }

    let script = '';
    let ttsPath = '';
    let voDur = 0;
    const targets = [
      [58, 72],
      [70, 84],
    ];
    for (let attempt = 0; attempt < targets.length; attempt++) {
      try {
        const [low, high] = targets[attempt];
        const r = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: buildPrompt(low, high) }],
          max_tokens: 320,
          temperature: 0.35,
        });
        script = r.choices?.[0]?.message?.content?.trim() || '';
      } catch {
        script = script || `A simple way to support your goals with less hassle. ${ctaText}`;
      }
      script = stripFashionIfNotApplicable(script, category);
      script = enforceCategoryPresence(script, category);
      script = cleanFinalText(script);
      const plainList = [
        'SHOP NOW',
        'BUY NOW',
        'CHECK US OUT',
        'VISIT US',
        'TAKE A LOOK',
        'LEARN MORE',
        'GET STARTED',
      ];
      const re = new RegExp(`\\b(?:${plainList.join('|')})\\b[.!?]*`, 'gi');
      script = script.replace(re, '').trim();
      if (!/[.!?]$/.test(script)) script += '.';
      script += ' ' + ctaText;

      try {
        if (ttsPath) {
          try {
            fs.unlinkSync(ttsPath);
          } catch {}
        }
        ttsPath = await makeTTS(script);
        voDur = await probeDuration(ttsPath);
        if (voDur >= 14.4) break;
      } catch {
        ttsPath = null;
        voDur = 0;
        break;
      }
    }

    const TAIL = 0.8;
    const finalDur = Math.max(16.0, Math.min((voDur || 14.4) + TAIL, 30.0));

    let musicPath = null;

    const ensureImageForStill = async () => {
      let imageUrl = null;
      if (PEXELS_API_KEY && timeLeft() > 6000) {
        try {
          const keyword = getImageKeyword(answers.industry || '', url) || topic;
          const p = await axios.get(PEXELS_IMG_BASE, {
            headers: { Authorization: PEXELS_API_KEY },
            params: { query: keyword, per_page: 18 },
            timeout: Math.max(2500, Math.min(5000, timeLeft() - 1500)),
          });
          const photos = p.data?.photos || [];
          if (photos.length) {
            const pick = photos[0];
            imageUrl = pick.src.original || pick.src.large2x || pick.src.large || null;
          }
        } catch {}
      }
      if (!imageUrl) imageUrl = await getRecentImageForOwner(req);
      if (!imageUrl) imageUrl = 'https://picsum.photos/seed/smartmark/1200/1200';
      return imageUrl;
    };

    const imageUrl = await ensureImageForStill();
    const still = await composeStillVideo({
      imageUrl,
      duration: finalDur,
      ttsPath,
      musicPath,
      brandLine: brandForVideo,
      ctaText,
      scriptText: script,
    });

    const variations = [
      { url: still.publicUrl, absoluteUrl: still.absoluteUrl, subtitlesUrl: still.subtitlesUrl },
    ];

    let fbVideoId = null;
    try {
      if (variations[0] && req.body.fbAdAccountId && token) {
        const up = await uploadVideoToAdAccount(
          req.body.fbAdAccountId,
          token,
          variations[0].absoluteUrl,
          'SmartMark Generated Video',
          'Generated by SmartMark'
        );
        fbVideoId = up?.id || null;
      }
    } catch {}

    try {
      if (ttsPath) fs.unlinkSync(ttsPath);
    } catch {}
    maybeGC();

    const first = variations[0];

    return res.json({
      videoUrl: first.url,
      absoluteVideoUrl: first.absoluteUrl,
      subtitlesUrl: first.subtitlesUrl,
      fbVideoId,
      script,
      ctaText,
      voice: ttsPath ? 'alloy' : null,
      hasMusic: false,
      video: {
        url: first.url,
        script,
        overlayText: ctaText,
        voice: ttsPath ? 'alloy' : null,
        hasMusic: false,
        subtitlesUrl: first.subtitlesUrl,
      },
      videoVariations: variations.map((v) => ({
        url: v.url,
        absoluteUrl: v.absoluteUrl,
        subtitlesUrl: v.subtitlesUrl,
      })),
    });
  } catch (err) {
    if (!res.headersSent)
      return res
        .status(500)
        .json({ error: 'Failed to generate video ad', detail: err?.message || 'Unknown error' });
  }
});

/* --------------------- IMAGE: search + overlay (3 variations) --------------------- */
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();
  try {
    if (typeof res.setTimeout === 'function') res.setTimeout(60000);
    if (typeof req.setTimeout === 'function') req.setTimeout(60000);
  } catch {}
  try {
    const { regenerateToken = '' } = req.body;
    const top = req.body || {};
    const answers = top.answers || top;
    const url = answers.url || top.url || '';
    const industry = answers.industry || top.industry || '';
    const category = resolveCategory(answers || {});
    const keyword = getImageKeyword(industry, url);

    const sale = wantsSaleBadge(answers);

    const makeOne = async (baseUrl, seed) => {
      const headlineHint = overlayTitleFromAnswers(answers, category);
      const ctaHint = pickFromAllowedCTAs(answers, seed);
      try {
        const { publicUrl, absoluteUrl } = await buildOverlayImage({
          imageUrl: baseUrl,
          headlineHint,
          ctaHint,
          seed,
          fallbackHeadline: headlineHint,
          answers,
          category,
        });
        await saveAsset({
          req,
          kind: 'image',
          url: publicUrl,
          absoluteUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, category, sale },
        });
        return publicUrl;
      } catch {
        await saveAsset({
          req,
          kind: 'image',
          url: baseUrl,
          absoluteUrl: baseUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, raw: true, category, sale },
        });
        return baseUrl;
      }
    };

    if (!PEXELS_API_KEY) {
  const urls = [];
  const absUrls = [];
  for (let i = 0; i < 3; i++) {
    const { publicUrl, absoluteUrl } = await buildOverlayImage({
      imageUrl: 'https://picsum.photos/seed/smartmark' + i + '/1200/628',
      headlineHint: overlayTitleFromAnswers(answers, category),
      ctaHint: pickFromAllowedCTAs(answers, regenerateToken + '_' + i),
      seed: regenerateToken + '_' + i,
      fallbackHeadline: overlayTitleFromAnswers(answers, category),
      answers,
      category,
    });
    await saveAsset({
      req,
      kind: 'image',
      url: publicUrl,
      absoluteUrl,
      meta: { category, keyword, placeholder: true, i, sale },
    });
    urls.push(publicUrl);
    absUrls.push(absoluteUrl);
  }
  return res.json({
    imageUrl: urls[0],
    absoluteImageUrl: absUrls[0],
    keyword,
    totalResults: 3,
    usedIndex: 0,
    imageVariations: urls.map((u, idx) => ({
      url: u,
      absoluteUrl: absUrls[idx] || absolutePublicUrl(u),
    })),
  });
}

let photos = [];
try {
  const r = await axios.get(PEXELS_IMG_BASE, {
    headers: { Authorization: PEXELS_API_KEY },
    params: { query: keyword, per_page: 18 },
    timeout: 5000,
  });
  photos = r.data.photos || [];
} catch {
  return res.status(500).json({ error: 'Image search failed' });
}
if (!photos.length) return res.status(404).json({ error: 'No images found.' });

const seed = regenerateToken || answers?.businessName || keyword || Date.now();
let idxHash = 0;
for (const c of String(seed)) idxHash = (idxHash * 31 + c.charCodeAt(0)) >>> 0;

const picks = [];
for (let i = 0; i < photos.length && picks.length < 3; i++) {
  const idx = (idxHash + i * 7) % photos.length;
  if (!picks.includes(idx)) picks.push(idx);
}

const urls = [];
const absUrls = [];
for (let pi = 0; pi < picks.length; pi++) {
  const img = photos[picks[pi]];
  const baseUrl = img.src.original || img.src.large2x || img.src.large;
  const u = await makeOne(baseUrl, seed + '_' + pi); // returns public URL
  urls.push(u);
  absUrls.push(absolutePublicUrl(u));
}

const img0 = photos[picks[0]];
return res.json({
  imageUrl: urls[0],
  absoluteImageUrl: absUrls[0],
  photographer: img0?.photographer,
  pexelsUrl: img0?.url,
  keyword,
  totalResults: photos.length,
  usedIndex: picks[0],
  imageVariations: urls.map((u, idx) => ({
    url: u,
    absoluteUrl: absUrls[idx] || absolutePublicUrl(u),
  })),
});

} catch (e) {
  res.status(500).json({ error: 'Failed to fetch stock image', detail: e.message });
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
    db.data.generated_assets = (db.data.generated_assets || []).filter(
      (a) => a.owner !== owner
    );
    await db.write();
    housekeeping();
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to clear assets' });
  }
});

/* -------- Ensure CORS even on errors -------- */
router.use((err, req, res, _next) => {
  try {
    const origin = req.headers.origin;
    if (origin && ALLOW_ORIGINS.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Vary', 'Origin');
  } catch {}
  const code = err?.status || 500;
  res.status(code).json({ error: err?.message || 'Server error' });
});

module.exports = router;
