'use strict';
/**
 * SmartMark AI routes — static ads with glassmorphism chips
 * Robust SVG for Sharp (no masks/clipPaths/<use>), guaranteed composition,
 * and relevant no-key image fallback for categories like COMICS/BOOKS.
 */

const express = require('express');
const router = express.Router();

/* ------------------------ CORS (ALWAYS first) ------------------------ */
router.use((req, res, next) => {
  const origin = req.headers.origin;
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
const heavyRoute = (req, res, next) => {
  if (!/^\/(generate-image-from-prompt|generate-video-ad|generate-campaign-assets)\b/.test(req.path)) {
    return next();
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  acquire().then(() => {
    res.on('finish', release);
    res.on('close', release);
    next();
  });
};
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
module.exports.ax = ax;

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const FormData = require('form-data');
const { OpenAI } = require('openai');
const { getFbUserToken } = require('../tokenStore');
const db = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';

/* ---------------------- Disk / tmp housekeeping --------------------- */
const GEN_DIR = '/tmp/generated';
function ensureGeneratedDir() { try { fs.mkdirSync(GEN_DIR, { recursive: true }); } catch {} return GEN_DIR; }
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

async function uploadVideoToAdAccount(
  adAccountId, userAccessToken, fileUrl,
  name = 'SmartMark Video', description = 'Generated by SmartMark'
) {
  const id = String(adAccountId || '').replace(/^act_/, '').replace(/\D/g, '');
  const url = `https://graph.facebook.com/v23.0/act_${id}/advideos`;
  const form = new FormData();
  form.append('file_url', fileUrl);
  form.append('name', name);
  form.append('description', description);
  const resp = await ax.post(url, form, {
    headers: form.getHeaders(),
    params: { access_token: userAccessToken },
    timeout: 15000,
  });
  return resp.data;
}

/* --------------------- Range-enabled media streamer --------------------- */
router.get('/media/:file', async (req, res) => {
  housekeeping();
  try {
    const file = String(req.params.file || '').replace(/[^a-zA-Z0-9._-]/g, '');
    const full = path.join(ensureGeneratedDir(), file);
    if (!fs.existsSync(full)) return res.status(404).end();

    const stat = fs.statSync(full);
    const ext = path.extname(full).toLowerCase();
    const type =
      ext === '.mp4' ? 'video/mp4' :
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.png' ? 'image/png' :
      ext === '.webp' ? 'image/webp' :
      ext === '.srt' ? 'text/plain; charset=utf-8' :
      'application/octet-stream';

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
function mediaPath(relativeFilename) { return `/api/media/${relativeFilename}`; }

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

/* ---------- CTA normalization + variants (single source of truth) ---------- */
const CTA_VARIANTS = [
  'LEARN MORE','SEE MORE','VIEW MORE','EXPLORE','DISCOVER',
  'SHOP NOW','BUY NOW','GET STARTED','TRY IT','SEE DETAILS',
  'SEE COLLECTION','BROWSE NOW','CHECK IT OUT','VISIT US','TAKE A LOOK','CHECK US OUT'
];
const ALLOWED_CTAS = new Set(CTA_VARIANTS);

function normalizeCTA(s='') {
  return String(s)
    .toUpperCase()
    .replace(/[’']/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function pickCtaVariant(seed='') {
  if (!seed) return 'LEARN MORE';
  let h = 0;
  for (let i=0;i<seed.length;i++) h=(h*31+seed.charCodeAt(i))>>>0;
  return CTA_VARIANTS[h % CTA_VARIANTS.length];
}
function cleanCTA(c, seed='') {
  const norm = normalizeCTA(c);
  if (norm && ALLOWED_CTAS.has(norm) && norm !== 'LEARN MORE') return norm;
  return pickCtaVariant(seed);
}

/* ---------- Coherent subline (7–9 words), GPT + seeded variance ---------- */
async function getCoherentSubline(answers = {}, category = 'generic', seed = '') {
  const STOP = new Set(['and','or','the','a','an','of','to','in','on','with','for','by','your','you','is','are','at']);
  const ENDSTOP = new Set(['and','with','for','to','of','in','on','at','by']);
  const sentenceCase = (s='') => { s = String(s).toLowerCase().replace(/\s+/g,' ').trim(); return s ? s[0].toUpperCase()+s.slice(1) : s; };
  const clean = (s='') => String(s)
    .replace(/https?:\/\/\S+/g,' ')
    .replace(/[^\w\s'-]/g,' ')
    .replace(/\b(best|premium|luxury|#1|guarantee|perfect|revolutionary|magic|cheap|fastest|ultimate|our|we)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();
  const trimEnd = (arr)=>{ while (arr.length && ENDSTOP.has(arr[arr.length-1])) arr.pop(); return arr; };
  const takeTerms = (src='', max=3) => {
    const words = clean(src).split(' ').filter(Boolean).filter(w=>!STOP.has(w));
    return words.slice(0, Math.max(1, Math.min(max, words.length)));
  };
  function ensure7to9(line='') {
    let words = clean(line).split(' ').filter(Boolean);
    const tails = [['every','day'],['made','simple'],['with','less','hassle'],['for','busy','days'],['built','to','last']];
    while (words.length > 9) words.pop();
    words = trimEnd(words);
    while (words.length < 7) {
      const t = tails[Math.floor(Math.random()*tails.length)];
      for (const w of t) if (words.length < 9) words.push(w);
      words = trimEnd(words);
    }
    return sentenceCase(words.join(' '));
  }
  function categoryFallback(cat='generic') {
    const MAP = {
      fashion: [
        'Modern fashion built for everyday wear',
        'Natural materials for everyday wear made simple',
        'Simple pieces built to last every day'
      ],
      books: ['New stories and classic runs to explore','Graphic novels and comics for quiet nights'],
      cosmetics: ['Gentle formulas for daily care and glow','A simple routine for better skin daily'],
      hair: ['Better hair care with less effort daily','Clean formulas for easy styling each day'],
      food: ['Great taste with less hassle every day','Fresh flavor made easy for busy nights'],
      pets: ['Everyday care for happy pets made simple','Simple treats your pet will love daily'],
      electronics: ['Reliable tech for everyday use and value','Simple design with solid performance daily'],
      home: ['Upgrade your space the simple practical way','Clean looks with everyday useful function'],
      coffee: ['Balanced flavor for better breaks each day','Smooth finish in every cup every day'],
      fitness: ['Made for daily training sessions that stick','Durable gear built for consistent workouts'],
      generic: ['Made for everyday use with less hassle','Simple design that is built to last']
    };
    const arr = MAP[cat] || MAP.generic;
    return arr[Math.floor(Math.random()*arr.length)];
  }

  // extract light facts
  const productTerms  = takeTerms(answers.productType || answers.topic || answers.title || '');
  const benefitTerms  = takeTerms(answers.mainBenefit || answers.description || '');
  const audienceTerms = takeTerms(answers.audience || answers.target || answers.customer || '', 2);
  const locationTerm  = takeTerms(answers.location || answers.city || answers.region || '', 1)[0] || '';

  // normalize for fashion to avoid “clothing quality …”
  let productHead = productTerms[0] || '';
  if ((category||'').toLowerCase() === 'fashion' && !/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear/i.test(productHead)) {
    productHead = 'fashion';
  }
  if (productHead === 'quality') productHead = 'products';

  // seed → variant cue (nudges different phrasings each image)
  const cues = [
    'use “built for”, everyday tone',
    'use “made for”, utility tone',
    'use “designed for”, comfort tone',
    'use “crafted for”, style tone'
  ];
  let cue = cues[Math.abs((seed||'').split('').reduce((h,c)=>((h*31 + c.charCodeAt(0))|0), 7)) % cues.length];

  // --- GPT compose (short + cheap; varied by seed) ---
  let line = '';
  try {
    const system = [
      "You are SmartMark's subline composer.",
      "Write ONE ad subline of 7–9 words, sentence case, plain language.",
      "Must be coherent English. No buzzwords. No domains.",
      "Do NOT end with: to, for, with, of, in, on, at, by."
    ].join(' ');
    const user = [
      `Category: ${category || 'generic'}. Cue: ${cue}.`,
      productHead ? `Product/topic: ${productHead}.` : '',
      benefitTerms.length ? `Main benefit: ${benefitTerms.join(' ')}.` : '',
      audienceTerms.length ? `Audience: ${audienceTerms.join(' ')}.` : '',
      locationTerm ? `Location: ${locationTerm}.` : '',
      `Variation seed: ${seed}.`,
      'Return ONLY the line.'
    ].join(' ');
    const r = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.35,          // a little higher for variety
      max_tokens: 24,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    line = (r.choices?.[0]?.message?.content || '').trim().replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g,'');
  } catch (e) {
    console.warn('getCoherentSubline GPT error:', e?.message);
  }

  if (!line) line = categoryFallback(category);
  if ((category||'').toLowerCase() === 'fashion' && /\bfashion\s+modern\b/i.test(line)) {
    line = 'Modern fashion built for everyday wear';
  }
  return ensure7to9(line);
}


/* ---------- required helpers for subline + SVG ---------- */
function escSVG(s='') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
// approximate serif width (for fitting)
function estWidthSerif(text, fs, letterSpacing = 0) {
  const t = String(text || ''), n = t.length || 1;
  return n * fs * 0.54 + Math.max(0, n - 1) * letterSpacing * fs;
}
// seeded RNG + picker (craftSubline uses these)
function _hash32(str = '') {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function _rng(seed = '') {
  let h = _hash32(String(seed));
  return function () {
    h = (h + 0x6D2B79F5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}
function _pick(rng, arr) {
  if (!arr || !arr.length) return '';
  return arr[Math.floor(rng() * arr.length)] ?? arr[0];
}

/* --- CTA pill (SVG-safe; no rgba() in stop-color) --- */
function pillBtn(cx, cy, label, fs = 34, glowColor = '255,255,255', glowOpacity = 0.30, midLum = 140) {
  const txt = normalizeCTA(label || 'LEARN MORE');
  const padX = 28;
  const estTextW = Math.round(txt.length * fs * 0.62);
  const estW = Math.max(132, Math.min(estTextW + padX * 2, Math.round(1200 * 0.92)));
  const estH = Math.max(46, fs + 18);
  const x = Math.round(cx - estW / 2), y = Math.round(cy - estH / 2), r = Math.round(estH / 2);
  const innerTextW = Math.max(92, estW - 40);

  const useDark = midLum >= 188;
  const textFill = useDark ? '#111111' : '#FFFFFF';
  const outline  = useDark ? '#FFFFFF' : '#000000';

  return `
    <g>
      <rect x="${x - 6}" y="${y - 6}" width="${estW + 12}" height="${estH + 12}" rx="${r + 6}"
            fill="rgb(${glowColor})" opacity="${glowOpacity}"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="rgba(255,255,255,0.10)"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${Math.max(10, Math.round(estH * 0.40))}" rx="${r}" fill="rgba(255,255,255,0.25)"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="none" stroke="rgba(0,0,0,0.28)" stroke-width="1" opacity="0.32"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle"
            lengthAdjust="spacingAndGlyphs" textLength="${innerTextW}"
            font-family="sans-serif" font-size="${fs}" font-weight="700"
            fill="${textFill}" text-rendering="geometricPrecision" xml:space="preserve"
            style="paint-order: stroke; stroke:${outline}; stroke-width:1.1; stroke-linejoin:round; letter-spacing:0.06em">
        ${escSVG(txt)}
      </text>
    </g>`;
}

/* === GLASS (real blur) + serif text — matches your screenshot === */

const SERIF = `'Times New Roman', Times, serif`;

/* CTA pill (kept subtle; unchanged API) */
function pillBtn(cx, cy, label, fs = 34, glowRGB = '255,255,255', glowOpacity = 0.30, midLum = 140) {
  const txt = normalizeCTA(label || 'LEARN MORE');
  const padX = 32;
  const estTextW = Math.round(txt.length * fs * 0.60);
  const estW = Math.max(182, Math.min(estTextW + padX * 2, 1000));
  const estH = Math.max(56, fs + 22);
  const x = Math.round(cx - estW / 2), y = Math.round(cy - estH / 2), r = Math.round(estH / 2);

  const useDark  = midLum >= 188;
  const textFill = useDark ? '#111' : '#fff';
  const outline  = useDark ? '#fff' : '#000';

  return `
  <g>
    <rect x="${x-8}" y="${y-8}" width="${estW+16}" height="${estH+16}" rx="${r+8}"
          fill="rgb(${glowRGB})" opacity="${glowOpacity*0.9}"/>
    <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}"
          fill="rgba(255,255,255,0.10)"/>
    <linearGradient id="pillHi" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.38"/>
      <stop offset="60%"  stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.00"/>
    </linearGradient>
    <rect x="${x}" y="${y}" width="${estW}" height="${Math.max(12, Math.round(estH*0.45))}" rx="${r}"
          fill="url(#pillHi)"/>
    <rect x="${x+0.5}" y="${y+0.5}" width="${estW-1}" height="${estH-1}" rx="${r-0.5}"
          fill="none" stroke="rgba(255,255,255,0.38)" stroke-width="1"/>
    <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}"
          fill="none" stroke="rgba(0,0,0,0.30)" stroke-width="1" opacity="0.45"/>
    <text x="${cx}" y="${y + estH/2}"
          text-anchor="middle" dominant-baseline="middle"
          font-family=${JSON.stringify(SERIF)} font-size="${fs}" font-weight="700"
          fill="${textFill}"
          style="paint-order: stroke; stroke:${outline}; stroke-width:1.15; letter-spacing:0.10em">
      ${escSVG(txt)}
    </text>
  </g>`;
}

/* === REAL-GLASS overlay — match purple reference (ultra-light rims, thin bars) === */
function svgOverlayCreative({ W, H, title, subline, cta, metrics, baseImage }) {
  const SAFE_PAD = 24;
  const maxW = W - SAFE_PAD * 2;
  const R = 18;

  // --- sizing helpers (serif tuned) ---
  const FUDGE = 1.18, MIN_INNER_GAP = 12;
  function measureSerifWidth(txt, fs, tracking = 0.06) {
    return Math.max(1, estWidthSerif(txt, fs, tracking) * FUDGE);
  }
  function settleBlock({ text, fsStart, fsMin, tracking, padXFactor, padYFactor }) {
    let fs = fsStart, padX, padY, textW, w, h;
    const recompute = () => {
      padX = Math.round(Math.max(26, fs * padXFactor));
      padY = Math.round(Math.max(10, fs * padYFactor));   // thinner bar height
      textW = measureSerifWidth(text, fs, tracking);
      w = textW + padX * 2 + MIN_INNER_GAP * 2;
      h = Math.max(48, fs + padY * 2);
    };
    recompute();
    while (w > maxW && fs > fsMin) { fs -= 2; recompute(); }
    const x = Math.round((W - Math.min(w, maxW)) / 2);
    return { fs, padX, padY, textW, w: Math.min(w, maxW), h, x };
  }

  // headline slightly smaller; subline slightly larger, bars thinner (like the purple ref)
  title = String(title || '').toUpperCase();
  const headline = settleBlock({
    text: title, fsStart: 74, fsMin: 34, tracking: 0.06, padXFactor: 0.66, padYFactor: 0.20
  });
  const hlCenterY = 148;
  const hlRectY   = Math.round(hlCenterY - headline.h/2);

  const sub = settleBlock({
    text: String(subline || ''), fsStart: 52, fsMin: 26, tracking: 0.03, padXFactor: 0.60, padYFactor: 0.18
  });
  // spacing matches your purple screenshot (headline → gap → subline)
  const subRectY   = Math.round(hlRectY + headline.h + 58);
  const subCenterY = subRectY + Math.round(sub.h/2);

  const ctaY = Math.round(subCenterY + sub.fs + 92);

  // palette from image
  const midLum = metrics?.midLum ?? 140;
  const avg    = metrics?.avgRGB || { r: 64, g: 64, b: 64 };
  const useDark     = midLum >= 188;
  const textFill    = useDark ? '#111111' : '#FFFFFF';
  const textOutline = useDark ? '#FFFFFF' : '#000000';
  const tintRGB     = `rgb(${avg.r},${avg.g},${avg.b})`;

  const chosenCTA = cleanCTA(cta, `${title}|${subline}`);

  // glass tuning to avoid "solid" look
  const CHIP_TINT = useDark ? 0.08 : 0.12;     // ↓ tint = more see-through
  const BLUR_H = 10, BLUR_S = 9;               // soft frosting
  const RIM_LIGHT = 0.18;                      // barely visible edge
  const RIM_DARK  = 0.12;                      // faint under-rim

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <image id="bg" href="${baseImage}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>

      <clipPath id="clipHl"><rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${headline.h}" rx="${R}"/></clipPath>
      <clipPath id="clipSub"><rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${sub.h}" rx="${R}"/></clipPath>

      <filter id="blurHl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${BLUR_H}"/></filter>
      <filter id="blurSub" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${BLUR_S}"/></filter>

      <!-- bright upper sheen + hairline specular like the purple ref -->
      <linearGradient id="chipHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="#FFFFFF" stop-opacity="0.78"/>
        <stop offset="58%"  stop-color="#FFFFFF" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0.00"/>
      </linearGradient>
      <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.60"/>
        <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
      </linearGradient>

      <radialGradient id="vig" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.85"/>
      </radialGradient>
    </defs>

    <!-- existing frame/vignette kept the same -->
    <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,0.14)"/>
    <g pointer-events="none">
      <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="24" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="8"/>
      <rect x="14" y="14" width="${W-28}" height="${H-28}" rx="20" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="2"/>
      <rect x="22" y="22" width="${W-44}" height="${H-44}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1"/>
    </g>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)" opacity="0.22"/>

    <!-- Headline chip -->
    <g clip-path="url(#clipHl)">
      <use href="#bg" filter="url(#blurHl)"/>
      <rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${headline.h}" rx="${R}"
            fill="${tintRGB}" opacity="${CHIP_TINT}"/>
      <rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${Math.max(12, Math.round(headline.h*0.42))}" rx="${R}"
            fill="url(#chipHi)" opacity="0.96"/>
      <!-- hairline specular strip -->
      <rect x="${headline.x+9}" y="${hlRectY+6}" width="${headline.w-18}" height="${Math.max(2, Math.round(headline.h*0.08))}" rx="${Math.max(2, Math.round(R*0.35))}"
            fill="url(#spec)" opacity="0.50"/>
    </g>
    <!-- ultra-light rim (nearly invisible) -->
    <rect x="${headline.x+0.5}" y="${hlRectY+0.5}" width="${headline.w-1}" height="${headline.h-1}" rx="${R-0.5}"
          fill="none" stroke="rgba(255,255,255,${RIM_LIGHT})" stroke-width="0.6"/>
    <rect x="${headline.x+1}" y="${hlRectY+1}" width="${headline.w-2}" height="${headline.h-2}" rx="${R-1}"
          fill="none" stroke="rgba(0,0,0,${RIM_DARK})" stroke-width="0.5" opacity="0.28"/>

    <!-- Headline text -->
    <text x="${W/2}" y="${hlRectY + Math.round(headline.h/2)}"
          text-anchor="middle" dominant-baseline="middle"
          font-family=${JSON.stringify(SERIF)} font-size="${headline.fs}" font-weight="700"
          fill="${textFill}" style="paint-order: stroke; stroke:${textOutline}; stroke-width:1.30; letter-spacing:0.10em">
      ${escSVG(title)}
    </text>

    <!-- Subline chip -->
    <g clip-path="url(#clipSub)">
      <use href="#bg" filter="url(#blurSub)"/>
      <rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${sub.h}" rx="${R}"
            fill="${tintRGB}" opacity="${CHIP_TINT}"/>
      <rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${Math.max(10, Math.round(sub.h*0.40))}" rx="${R}"
            fill="url(#chipHi)"/>
      <rect x="${sub.x+9}" y="${subRectY+6}" width="${sub.w-18}" height="${Math.max(2, Math.round(sub.h*0.08))}" rx="${Math.max(2, Math.round(R*0.35))}"
            fill="url(#spec)" opacity="0.50"/>
    </g>
    <rect x="${sub.x+0.5}" y="${subRectY+0.5}" width="${sub.w-1}" height="${sub.h-1}" rx="${R-0.5}"
          fill="none" stroke="rgba(255,255,255,${RIM_LIGHT})" stroke-width="0.6"/>
    <rect x="${sub.x+1}" y="${subRectY+1}" width="${sub.w-2}" height="${sub.h-2}" rx="${R-1}"
          fill="none" stroke="rgba(0,0,0,${RIM_DARK})" stroke-width="0.5" opacity="0.28"/>

    <!-- Subline text -->
    <text x="${W/2}" y="${subRectY + Math.round(sub.h/2)}"
          text-anchor="middle" dominant-baseline="middle"
          font-family=${JSON.stringify(SERIF)} font-size="${sub.fs}" font-weight="700"
          fill="${textFill}" style="paint-order: stroke; stroke:${textOutline}; stroke-width:1.00; letter-spacing:0.02em">
      ${escSVG(subline)}
    </text>

    ${pillBtn(W/2, ctaY, chosenCTA, 34, `${avg.r},${avg.g},${avg.b}`, 0.30, midLum)}
  </svg>`;
}



/* ---------- Subline crafting v3 (coherent 7–9 words from user inputs) ---------- */
function craftSubline(answers = {}, category = 'generic', seed = '') {
  // deterministic RNG
  function _hash32(str = '') { let h = 2166136261 >>> 0; for (let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
  function _rng(s=''){ let h=_hash32(s); return ()=>{ h=(h+0x6D2B79F5)>>>0; let t=Math.imul(h^(h>>>15),1|h); t^=t+Math.imul(t^(t>>>7),61|t); t=(t^(t>>>14))>>>0; return t/4294967296; }; }
  const rnd = _rng(`${seed}|${category}|${answers.businessName||''}|${answers.mainBenefit||''}|${answers.description||''}`);

  // helpers
  const sentenceCase = (s='') => { s=String(s).toLowerCase().replace(/\s+/g,' ').trim(); return s ? s[0].toUpperCase()+s.slice(1) : s; };
  const clean = (s='') => String(s)
    .replace(/https?:\/\/\S+/g,' ')
    .replace(/[^\w\s'-]/g,' ')
    .replace(/\b(best|premium|luxury|#1|guarantee|perfect|revolutionary|magic|cheap|fastest|ultimate|our|we)\b/gi,' ')
    .replace(/\s+/g,' ')
    .trim()
    .toLowerCase();

  const STOP = new Set(['and','or','the','a','an','of','to','in','on','with','for','by','your','you','is','are','at']);
  const ENDSTOP = new Set(['and','with','for','to','of','in','on','at','by']);
  const trimEnd = (arr)=>{ while(arr.length && ENDSTOP.has(arr[arr.length-1])) arr.pop(); return arr; };

  const takeTerms = (src='', max=3) => {
    const words = clean(src).split(' ').filter(Boolean).filter(w=>!STOP.has(w));
    return words.slice(0, Math.max(1, Math.min(max, words.length)));
  };

  // extract structured bits
  const productTerms = takeTerms(answers.productType || answers.topic || answers.title || '');
  const benefitTerms = takeTerms(answers.mainBenefit || answers.description || '');
  const audienceTerms= takeTerms(answers.audience || answers.target || answers.customer || '', 2);
  const diffTerms    = takeTerms(answers.differentiator || answers.whyUs || '', 3);
  const locationTerm = takeTerms(answers.location || answers.city || answers.region || '', 1)[0] || '';
  const timeClaimRaw = String(answers.timeClaim || answers.promise || '').match(/\b\d+\s*(minutes?|hours?|days?)\b/i);
  const timeClaim    = timeClaimRaw ? timeClaimRaw[0].toLowerCase() : '';

  // light domain hints (materials for fashion)
  const txtBlob = `${answers.description||''} ${answers.mainBenefit||''}`.toLowerCase();
  const materials = (txtBlob.match(/\b(cotton|linen|wool|leather|silk|denim|bamboo|hemp|cashmere)\b/g) || []);
  const material  = materials[0] || '';

  // normalize product head (avoid "clothing quality" style glitches)
  let productHead = productTerms[0] || '';
  if (category === 'fashion') {
    if (/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear/i.test(productHead)) productHead = productHead;
    else productHead = 'clothing';
  }
  if (productHead === 'quality') productHead = 'products';

  const benefitPhrase = benefitTerms.join(' ').replace(/\bquality\b/gi,'').trim();
  const audiencePhrase= audienceTerms.join(' ').trim();
  const diffPhrase    = diffTerms.join(' ').trim();

  // candidate templates
  const T = [
    () => (benefitPhrase && audiencePhrase) && `${benefitPhrase} for ${audiencePhrase} every day`,
    () => (benefitPhrase && locationTerm)  && `${benefitPhrase} for ${locationTerm} locals daily`,
    () => (productHead && benefitPhrase)   && `${benefitPhrase} built into ${productHead} essentials`,
    () => (productHead && material)        && `${material} ${productHead} for everyday wear`,
    () => (productHead && diffPhrase)      && `${productHead} with ${diffPhrase} for daily use`,
    () => (productHead && timeClaim)       && `${productHead} set up in just ${timeClaim}`,
    () =>  benefitPhrase                    && `${benefitPhrase} made simple for everyday use`,
    () =>  productHead                      && `${productHead} made simple for everyday wear`,
  ];

  let line = '';
  for (const f of T) { const c = f(); if (c && /\S/.test(c)) { line = c; break; } }

  if (!line) {
    const FALL = {
      fashion: [
        'Natural materials for everyday wear made simple',
        'Simple pieces built to last every day',
        'Comfortable fits with clean easy style'
      ],
      books: ['New stories and classic runs to explore','Graphic novels and comics for quiet nights'],
      cosmetics: ['Gentle formulas for daily care and glow','A simple routine for better skin daily'],
      hair: ['Better hair care with less effort daily','Clean formulas for easy styling each day'],
      food: ['Great taste with less hassle every day','Fresh flavor made easy for busy nights'],
      pets: ['Everyday care for happy pets made simple','Simple treats your pet will love daily'],
      electronics: ['Reliable tech for everyday use and value','Simple design with solid performance daily'],
      home: ['Upgrade your space the simple practical way','Clean looks with everyday useful function'],
      coffee: ['Balanced flavor for better breaks each day','Smooth finish in every cup every day'],
      fitness: ['Made for daily training sessions that stick','Durable gear built for consistent workouts'],
      generic: ['Made for everyday use with less hassle','Simple design that is built to last']
    }[category] || ['Made for everyday use with less hassle'];
    line = FALL[Math.floor(rnd() * FALL.length)];
  }

  // enforce 7–9 words
  let words = clean(line).split(' ').filter(Boolean);
  const tails = [
    ['every','day'],
    ['made','simple'],
    ['with','less','hassle'],
    ['for','busy','days'],
    ['built','to','last']
  ];
  while (words.length > 9) words.pop();
  words = trimEnd(words);
  while (words.length < 7) {
    const tail = tails[Math.floor(rnd()*tails.length)];
    for (const w of tail) if (words.length < 9) words.push(w);
    words = trimEnd(words);
  }

  return sentenceCase(words.join(' '));
}


/* ---------- Placement analysis ---------- */
async function analyzeImageForPlacement(imgBuf) {
  try {
    const W = 72, H = 72;
    const { data } = await sharp(imgBuf).resize(W, H, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let rSum=0,gSum=0,bSum=0, rTop=0,gTop=0,bTop=0,cTop=0, rMid=0,gMid=0,bMid=0,cMid=0;
    for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
      const i=(y*W+x)*3, r=data[i], g=data[i+1], b=data[i+2];
      rSum+=r; gSum+=g; bSum+=b;
      if (y < Math.floor(H*0.28)) { rTop+=r; gTop+=g; bTop+=b; cTop++; }
      if (y >= Math.floor(H*0.38) && y < Math.floor(H*0.62)) { rMid+=r; gMid+=g; bMid+=b; cMid++; }
    }
    const px=W*H, avgR=rSum/px, avgG=gSum/px, avgB=bSum/px;
    const lum=(r,g,b)=> Math.round(0.2126*r + 0.7152*g + 0.0722*b);
    return { topLum: lum(rTop/cTop,gTop/cTop,bTop/cTop), midLum: lum(rMid/cMid,gMid/cMid,bMid/cMid), avgRGB: { r:Math.round(avgR), g:Math.round(avgG), b:Math.round(avgB) } };
  } catch { return { topLum:150, midLum:140, avgRGB:{ r:64,g:64,b:64 } }; }
}

/* ---------- Overlay builder ---------- */
async function buildOverlayImage({
  imageUrl, headlineHint = '', ctaHint = '', seed = '',
  fallbackHeadline = 'SHOP', answers = {}, category = 'generic',
}) {
  const W = 1200, H = 628;

  const imgRes = await ax.get(imageUrl, { responseType: 'arraybuffer', timeout: 12000 });
  const baseBuf = await sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const analysis = await analyzeImageForPlacement(baseBuf);

  let title = cleanHeadline(headlineHint) || cleanHeadline(fallbackHeadline) || 'SHOP';
  if (!title.trim()) title = 'SHOP';
  const titleSeed = title || category || '';
  let cta = cleanCTA(ctaHint, titleSeed);
  if (!cta.trim()) cta = 'LEARN MORE';

  // Prefer GPT-coherent subline; fallback to local craftSubline
let subline = 'Made for everyday use with less hassle';
try {
  subline = await getCoherentSubline(answers, category);
} catch (e) {
  console.warn('getCoherentSubline failed, using local craftSubline:', e?.message);
  try { subline = craftSubline(answers, category, seed) || subline; } catch {}
}

  const base64 = `data:image/jpeg;base64,${baseBuf.toString('base64')}`;
const svg = Buffer.from(
  svgOverlayCreative({ W, H, title, subline, cta, metrics: analysis, baseImage: base64 }),
  'utf8'
);


  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;
  await sharp(baseBuf).composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(outDir, file));
  maybeGC();
  return { publicUrl: mediaPath(file), absoluteUrl: absolutePublicUrl(mediaPath(file)), filename: file };
}

/* -------------------- Health check -------------------- */
router.get('/test', (_req, res) => {
  res.status(200).json({ ok: true, t: Date.now() });
});

/* -------------------- Video endpoint placeholder -------------------- */
router.post('/generate-video-ad', heavyLimiter, async (_req, res) => {
  res.status(200).json({ ok: true, disabled: true, message: 'Video generation is disabled in this build.' });
});

/* --------------------- IMAGE: search + overlay (TWO variations) --------------------- */
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();

  try { if (typeof res.setTimeout === 'function') res.setTimeout(65000); if (typeof req.setTimeout === 'function') req.setTimeout(65000); } catch {}

  try {
    const { regenerateToken = '' } = req.body || {};
    const top       = req.body || {};
    const answers   = top.answers || top;
    const url       = answers.url || top.url || '';
    const industry  = answers.industry || top.industry || '';
    const category  = resolveCategory(answers || {});
    const keyword   = getImageKeyword(industry, url, answers);

    const compose = async (imgUrl, seed, meta = {}) => {
      try {
        const headlineHint = overlayTitleFromAnswers(answers, category);
        const ctaHint      = cleanCTA(answers?.cta || '');
        const { publicUrl, absoluteUrl } = await buildOverlayImage({
          imageUrl: imgUrl,
          headlineHint,
          ctaHint,
          seed,
          fallbackHeadline: headlineHint,
          answers,
          category,
        });
        await saveAsset({
          req, kind: 'image', url: publicUrl, absoluteUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, category, glass: true, ...meta },
        });
        return publicUrl;
      } catch (err) {
        // Frame-only fallback as last resort
        try {
          const W = 1200, H = 628;
          const imgRes = await ax.get(imgUrl, { responseType: 'arraybuffer', timeout: 12000 });
          const baseBuf = await sharp(imgRes.data).resize(W, H, { fit: 'cover' }).jpeg({ quality: 92 }).toBuffer();
          const frameSvg = Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="18" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="8"/>
            <rect x="14" y="14" width="${W-28}" height="${H-28}" rx="16" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
          </svg>`);
          const file = `${uuidv4()}.jpg`;
          await sharp(baseBuf).composite([{ input: frameSvg, top: 0, left: 0 }]).jpeg({ quality: 90 }).toFile(path.join(ensureGeneratedDir(), file));
          return mediaPath(file);
        } catch { throw err; }
      }
    };

    const urls = [], absUrls = [];

    if (PEXELS_API_KEY) {
      let photos = [];
      try {
        const r = await ax.get('https://api.pexels.com/v1/search', {
          headers: { Authorization: PEXELS_API_KEY },
          params:  { query: keyword, per_page: 12 },
          timeout: 12000,
        });
        photos = r.data?.photos || [];
      } catch {}

      if (!photos.length) throw new Error('pexels-empty');

      const seed = regenerateToken || answers?.businessName || keyword || Date.now();
      let idxHash = 0; for (const c of String(seed)) idxHash = (idxHash * 31 + c.charCodeAt(0)) >>> 0;
      const picks = [];
      for (let i = 0; i < photos.length && picks.length < 2; i++) {
        const idx = (idxHash + i * 7) % photos.length;
        if (!picks.includes(idx)) picks.push(idx);
      }
      for (let i = 0; i < picks.length; i++) {
        const img = photos[picks[i]];
        const baseUrl = img?.src?.original || img?.src?.large2x || img?.src?.large;
        const u = await compose(baseUrl, `${seed}_${i}`, { src: 'pexels', idx: picks[i] });
        urls.push(u); absUrls.push(absolutePublicUrl(u));
      }
    } else {
      // Unsplash Source API fallback — always compose overlays
      const q = encodeURIComponent(keyword || 'ecommerce products');
      for (let i = 0; i < 2; i++) {
        const sig = encodeURIComponent((regenerateToken || 'seed') + '_' + i);
        const baseUrl = `https://source.unsplash.com/1200x628/?${q}&sig=${sig}`;
        const u = await compose(baseUrl, `${regenerateToken || 'seed'}_${i}`, { src: 'unsplash-keyless', i });
        urls.push(u);
        absUrls.push(absolutePublicUrl(u));
      }
    }

    return res.json({
      imageUrl: urls[0],
      absoluteImageUrl: absUrls[0],
      keyword,
      totalResults: urls.length,
      usedIndex: 0,
      imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] })),
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
  try { const items = await listRecentForOwner(req); res.json({ items, ttlMs: ASSET_TTL_MS }); }
  catch { res.status(500).json({ error: 'Failed to load recent assets' }); }
});
router.get('/assets/recent', async (req, res) => {
  try { const items = await listRecentForOwner(req); res.json({ items, ttlMs: ASSET_TTL_MS }); }
  catch { res.status(500).json({ error: 'Failed to load recent assets' }); }
});
router.get('/recent-assets', async (req, res) => {
  try { const items = await listRecentForOwner(req); res.json({ items, ttlMs: ASSET_TTL_MS }); }
  catch { res.status(500).json({ error: 'Failed to load recent assets' }); }
});

router.post('/assets/clear', async (req, res) => {
  try {
    await ensureAssetsTable();
    const owner = ownerKeyFromReq(req);
    db.data.generated_assets = (db.data.generated_assets || []).filter((a) => a.owner !== owner);
    await db.write();
    housekeeping();
    res.json({ success: true });
  } catch { res.status(500).json({ error: 'Failed to clear assets' }); }
});

/* -------- Ensure CORS even on errors -------- */
router.use((err, req, res, _next) => {
  try {
    const origin = req.headers.origin;
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
