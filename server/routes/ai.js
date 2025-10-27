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
const ALLOWED_CTAS = ['SHOP NOW','LEARN MORE','GET STARTED','VISIT US','BUY NOW','TAKE A LOOK','CHECK US OUT'];
function cleanCTA(c) { let norm = String(c || '').toUpperCase().replace(/[\'’!]/g,'').replace(/[^A-Z0-9 ]/g,'').replace(/\s+/g,' ').trim(); if (!ALLOWED_CTAS.includes(norm)) norm='LEARN MORE'; return norm; }
const sentenceCase = (s='') => { s = String(s).toLowerCase().replace(/\s+/g,' ').trim(); return s ? s[0].toUpperCase()+s.slice(1) : s; };

/* --- CTA pill (fit text inside, always) --- */
function pillBtn(cx, cy, label, fs = 34, glow = 'rgba(255,255,255,0.35)', midLum = 140) {
  const padX = 28;
  const txt  = String(label || 'LEARN MORE').toUpperCase().replace(/[^\w ]/g, ' ').replace(/\s+/g, ' ').trim();
  const estW = Math.max(120, txt.length * fs * 0.55 + padX * 2);
  const estH = Math.max(46, fs + 18);
  const x = Math.round(cx - estW / 2), y = Math.round(cy - estH / 2), r = Math.round(estH / 2);
  const innerTextW = estW - 32;

  // Adaptive text color & outline based on background brightness
  const textFill = midLum >= 178 ? '#111111' : '#FFFFFF';
  const outline  = midLum >= 178 ? '#FFFFFF' : '#000000';
  const strokeW  = midLum >= 178 ? 0.9 : 0.9;
  const shadowOpacity = midLum >= 178 ? 0.25 : 0.35;

  return `
  <defs>
    <filter id="btnTextShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" flood-color="#000000" flood-opacity="${shadowOpacity}"/>
    </filter>
  </defs>
  <g>
    <filter id="btnShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="7" stdDeviation="10" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
    <g filter="url(#btnShadow)">
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/>
      <rect x="${x + 1}" y="${y + 1}" width="${estW - 2}" height="${Math.max(10, Math.round(estH * 0.40))}" rx="${Math.max(0, r - 1)}" fill="rgba(255,255,255,0.25)"/>
      <rect x="${x}" y="${y}" width="${estW}" height="${estH}" rx="${r}" fill="none" stroke="rgba(0,0,0,0.32)" stroke-width="1" opacity="0.32"/>
      <rect x="${x - 6}" y="${y - 6}" width="${estW + 12}" height="${estH + 12}" rx="${r + 6}" fill="${glow}" opacity="0.30"/>
      <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle"
            lengthAdjust="spacingAndGlyphs" textLength="${innerTextW}" filter="url(#btnTextShadow)"
            font-family="Inter, system-ui, -apple-system, Segoe UI, Roboto" font-size="${fs}" font-weight="700"
            fill="${textFill}" style="paint-order: stroke; stroke:${outline}; stroke-width:${strokeW}; stroke-opacity:0.8; letter-spacing:0.06em">
        ${escSVG(txt)}
      </text>
    </g>
  </g>`;
}

/* --- Glass overlay (adds back-shade + text shadow + adaptive text color) --- */
function svgOverlayCreative({ W, H, title, subline, cta, metrics, baseImage }) {
  const SAFE_PAD = 24, maxW = W - SAFE_PAD * 2;

  // headline sizing (min 34px)
  const HL_FS_START = 68, headlineFs = fitFont(title, Math.min(maxW * 0.92, maxW - 40), HL_FS_START, 34);
  const hlTextW = estWidthSerif(title, headlineFs, 0.10) + Math.round(headlineFs * 0.12);
  const hlW = Math.min(hlTextW + 44, maxW * 0.95);
  const hlH = Math.max(48, headlineFs + 12);
  const hlX = Math.round((W - hlW) / 2);
  const hlInnerTextW = Math.max(80, hlW - 36);

  const SUB_FS = fitFont(subline, Math.min(W * 0.84, maxW), 42, 26);
  const subTextW = estWidthSerif(subline, SUB_FS, 0.18);
  const subW = Math.min(subTextW + 32, maxW);
  const subH = Math.max(44, SUB_FS + 14);
  const subX = Math.round((W - subW) / 2);
  const subInnerTextW = Math.max(80, subW - 28);

  // positions
  const headlineCenterY = 126;
  const hlRectY = Math.round(headlineCenterY - hlH / 2);
  const GAP_HL_TO_SUB = 64;
  const subRectY = Math.round(hlRectY + hlH + GAP_HL_TO_SUB);
  const subCenterY = subRectY + Math.round(subH / 2);
  const ctaY = Math.round(subCenterY + SUB_FS + 86);

  // adaptive chips & colors
  const midLum = metrics?.midLum ?? 140;
  const avg = metrics?.avgRGB || { r:64,g:64,b:64 };

  let chipOpacityHead = 0.26; if (midLum >= 170) chipOpacityHead += 0.02; if (midLum <= 100) chipOpacityHead -= 0.02;
  chipOpacityHead = Math.max(0.24, Math.min(0.30, chipOpacityHead));
  const chipOpacitySub = Math.max(0.20, Math.min(0.26, chipOpacityHead - 0.02));
  const tintRGBA = `rgba(${avg.r},${avg.g},${avg.b},${(chipOpacityHead * 0.28).toFixed(2)})`;
  const vignetteOpacity = midLum >= 160 ? 0.14 : midLum >= 120 ? 0.18 : 0.22;
  const EDGE_STROKE = 0.20, R = 8;

  // Extra back-shade inside chips when background is bright
  const backShadeHead = midLum >= 170 ? 0.18 : midLum >= 150 ? 0.12 : 0.08;
  const backShadeSub  = Math.max(0, backShadeHead - 0.03);

  // Adaptive text colors & outlines
  const headTextFill = midLum >= 178 ? '#111111' : '#FFFFFF';
  const headOutline  = midLum >= 178 ? '#FFFFFF' : '#000000';
  const subTextFill  = midLum >= 178 ? '#111111' : '#FFFFFF';
  const subOutline   = midLum >= 178 ? '#FFFFFF' : '#000000';

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glassBlurHl"  x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="glassBlurSub" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
      <linearGradient id="chipInnerHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"   stop-color="rgba(255,255,255,0.22)"/>
        <stop offset="55%"  stop-color="rgba(255,255,255,0.04)"/>
        <stop offset="100%" stop-color="rgba(255,255,255,0.00)"/>
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
        <stop offset="100%" stop-color="rgba(0,0,0,1)"/>
      </radialGradient>
      <clipPath id="clipHl"><rect x="${hlX}" y="${hlRectY}" width="${hlW}" height="${hlH}" rx="${R}"/></clipPath>
      <clipPath id="clipSub"><rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}"/></clipPath>
      <filter id="textShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2.2" stdDeviation="2.6" flood-color="#000000" flood-opacity="${midLum >= 178 ? 0.22 : 0.35}"/>
      </filter>
    </defs>

    <!-- vignette + frame -->
    <g opacity="${vignetteOpacity}"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#vignette)"/></g>
    <g pointer-events="none">
      <rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="18" fill="none" stroke="#000" stroke-opacity="0.10" stroke-width="8"/>
      <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="16" fill="none" stroke="#fff" stroke-opacity="0.24" stroke-width="2"/>
    </g>

    <!-- Headline chip -->
    <g clip-path="url(#clipHl)">
      <image href="${escSVG(baseImage)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" filter="url(#glassBlurHl)"/>
      <rect x="${hlX}" y="${hlRectY}" width="${hlW}" height="${hlH}" rx="${R}" fill="rgba(0,0,0,${backShadeHead})"/>
      <rect x="${hlX}" y="${hlRectY}" width="${hlW}" height="${hlH}" rx="${R}" fill="${tintRGBA}" opacity="${(chipOpacityHead*0.82).toFixed(2)}"/>
      <rect x="${hlX+1}" y="${hlRectY+1}" width="${hlW-2}" height="${Math.max(12, Math.round(hlH*0.38))}" rx="${Math.max(0,R-1)}" fill="url(#chipInnerHi)"/>
      <rect x="${hlX+0.5}" y="${hlRectY+0.5}" width="${hlW-1}" height="${hlH-1}" rx="${R-0.5}" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="${EDGE_STROKE}"/>
    </g>

    <!-- Headline text -->
    <text x="${W/2}" y="${Math.round(hlRectY + hlH/2)}" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle"
          lengthAdjust="spacingAndGlyphs" textLength="${hlInnerTextW}" filter="url(#textShadow)"
          font-family="'Times New Roman', Times, serif" font-size="${headlineFs}" font-weight="700" fill="${headTextFill}"
          style="paint-order: stroke; stroke:${headOutline}; stroke-width:1.05; stroke-opacity:0.85; letter-spacing:0.08">
      ${escSVG(title)}
    </text>

    <!-- Subline chip -->
    <g clip-path="url(#clipSub)">
      <image href="${escSVG(baseImage)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" filter="url(#glassBlurSub)"/>
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}" fill="rgba(0,0,0,${backShadeSub})"/>
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}" fill="${tintRGBA}" opacity="${chipOpacitySub.toFixed(2)}"/>
      <rect x="${subX+1}" y="${subRectY+1}" width="${subW-2}" height="${Math.max(10, Math.round(subH*0.38))}" rx="${Math.max(0,R-1)}" fill="url(#chipInnerHi)"/>
      <rect x="${subX+0.5}" y="${subRectY+0.5}" width="${subW-1}" height="${subH-1}" rx="${R-0.5}" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="${EDGE_STROKE}"/>
    </g>

    <!-- Subline text -->
    <text x="${W/2}" y="${Math.round(subRectY + subH/2)}" text-anchor="middle" dominant-baseline="middle" alignment-baseline="middle"
          lengthAdjust="spacingAndGlyphs" textLength="${subInnerTextW}" filter="url(#textShadow)"
          font-family="'Times New Roman', Times, serif" font-size="${SUB_FS}" font-weight="700" fill="${subTextFill}"
          style="paint-order: stroke fill; stroke:${subOutline}; stroke-width:0.9; stroke-opacity:0.8; letter-spacing:0.16">
      ${escSVG(subline)}
    </text>

    ${pillBtn(W/2, ctaY, cta, 34, `rgba(${avg.r},${avg.g},${avg.b},0.30)`, midLum)}
  </svg>`;
}


/* ---------- Subline crafting (coherent, sentence-case, 7–9 words) ---------- */
function craftSubline(answers = {}, category = 'generic') {
  const clean = (s) => String(s || '').replace(/[^\w\s\-']/g,' ').replace(/\s+/g,' ').trim().toLowerCase();

  const TPL = {
    fashion:      ['made with natural materials for everyday wear','everyday pieces built to last','simple fits that are easy to wear'],
    books:        ['new stories and classic runs','comics and graphic novels to explore'],
    cosmetics:    ['gentle formulas for daily care','a simple routine for better skin'],
    hair:         ['better hair care with less effort','clean formulas for easy styling'],
    food:         ['great taste with less hassle','fresh flavor made easy'],
    pets:         ['everyday care for happy pets','simple treats your pet will love'],
    electronics:  ['reliable tech for everyday use','simple design with solid performance'],
    home:         ['upgrade your space the simple way','clean looks with practical use'],
    coffee:       ['balanced flavor for better breaks','smooth finish in every cup'],
    fitness:      ['made for daily training sessions','durable gear built for workouts'],
    generic:      ['made for everyday use','simple design with better value'],
  };

  const defaults = TPL[category] || TPL.generic;

  // try to use user benefit if it looks like a phrase with a verb/noun
  const cand = [answers.mainBenefit, answers.description, answers.productType, answers.topic].map(clean).filter(Boolean);
  let line = cand.find(s => /\b(made|built|designed|helps|fits|improves|keeps|protects|wear|train|read|brew)\b/.test(s)) || defaults[0];

  // hard grammar guards
  line = line
    .replace(/\bnatural material(s)?\b/g, 'natural materials')
    .replace(/\bfashion material is natural( everyday)?\b/g, 'made with natural materials')
    .replace(/\bour\b/g,'')
    .replace(/\bquality of\b/g,'')
    .replace(/\b(high|best)\s+quality\b/g, 'great quality')
    .replace(/\bwell made|better made\b/g, 'made to last')
    .replace(/\b\s+(and|with|of|to|for|in|on|at|by)\s*$/,'')
    .replace(/\s+/g,' ')
    .trim();

// enforce word count 7–9
let words = line.split(' ').filter(Boolean);
if (words.length > 9) words = words.slice(0, 9);
if (words.length < 7) {
  const fill = clean(defaults[1] || '').split(' ').filter(Boolean);
  while (words.length < 7 && fill.length) words.push(fill.shift());
}
return sentenceCase(words.join(' ')); // final sentence-case
}

/* ---------- Placement analysis (needed by buildOverlayImage) ---------- */
async function analyzeImageForPlacement(imgBuf) {
  try {
    const W = 72, H = 72;
    const { data } = await sharp(imgBuf)
      .resize(W, H, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let rSum = 0, gSum = 0, bSum = 0;
    let rTop = 0, gTop = 0, bTop = 0, cTop = 0;
    let rMid = 0, gMid = 0, bMid = 0, cMid = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        rSum += r; gSum += g; bSum += b;

        if (y < Math.floor(H * 0.28)) { rTop += r; gTop += g; bTop += b; cTop++; }
        if (y >= Math.floor(H * 0.38) && y < Math.floor(H * 0.62)) { rMid += r; gMid += g; bMid += b; cMid++; }
      }
    }

    const px = W * H;
    const avgR = rSum / px, avgG = gSum / px, avgB = bSum / px;
    const lum = (r, g, b) => Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);

    // guards: avoid divide-by-zero just in case
    cTop = Math.max(1, cTop);
    cMid = Math.max(1, cMid);

    const lumTop = lum(rTop / cTop, gTop / cTop, bTop / cTop);
    const lumMid = lum(rMid / cMid, gMid / cMid, bMid / cMid);

    return {
      topLum: lumTop,
      midLum: lumMid,
      avgRGB: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) }
    };
  } catch {
    // safe defaults
    return { topLum: 150, midLum: 140, avgRGB: { r: 64, g: 64, b: 64 } };
  }
}

/* ---------- Overlay builder (use coherent subline + inline base for blur) ---------- */
async function buildOverlayImage({
  imageUrl, headlineHint = '', ctaHint = '', seed = '',
  fallbackHeadline = 'SHOP', answers = {}, category = 'generic',
}) {
  const W = 1200, H = 628;

  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 12000 });
  const baseBuf = await sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
    .jpeg({ quality: 94, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const analysis = await analyzeImageForPlacement(baseBuf);

  let title = cleanHeadline(headlineHint) || cleanHeadline(fallbackHeadline) || 'SHOP';
  if (!title.trim()) title = 'SHOP';
  let cta = cleanCTA(ctaHint) || 'LEARN MORE';
  if (!cta.trim()) cta = 'LEARN MORE';
  const subline = craftSubline(answers, category); // already sentence-cased

  const base64 = `data:image/jpeg;base64,${baseBuf.toString('base64')}`;
  const svg = Buffer.from(
    svgOverlayCreative({ W, H, title, subline, cta, metrics: analysis, baseImage: base64 }),
    'utf8'
  );

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;

  await sharp(baseBuf)
    .composite([{ input: svg, top: 0, left: 0 }])
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(path.join(outDir, file));

  maybeGC();
  return { publicUrl: mediaPath(file), absoluteUrl: absolutePublicUrl(mediaPath(file)), filename: file };
}


/* -------------------- Video endpoint placeholder -------------------- */
router.post('/generate-video-ad', heavyLimiter, async (_req, res) => {
  res.status(200).json({ ok: true, disabled: true, message: 'Video generation is disabled in this build.' });
});

/* --------------------- IMAGE: search + overlay (TWO variations) --------------------- */
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();

  try { if (typeof res.setTimeout === 'function') res.setTimeout(65000); if (typeof req.setTimeout === 'function') req.setTimeout(65000); }
  catch {}

  try {
    const { regenerateToken = '' } = req.body || {};
    const top       = req.body || {};
    const answers   = top.answers || top;
    const url       = answers.url || top.url || '';
    const industry  = answers.industry || top.industry || '';
    const category  = resolveCategory(answers || {});
    const keyword   = getImageKeyword(industry, url, answers);

    const compose = async (imgUrl, seed, meta = {}) => {
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
      // Keyless, relevant fallback (Unsplash Source API)
      const q = encodeURIComponent(`${keyword},comic,books,graphic-novel`);
      for (let i = 0; i < 2; i++) {
        const baseUrl = `https://source.unsplash.com/1200x628/?${q}&sig=${encodeURIComponent((regenerateToken || 'seed') + '_' + i)}`;
        const u = await compose(baseUrl, `${regenerateToken || 'seed'}_${i}`, { src: 'unsplash-keyless', i });
        urls.push(u); absUrls.push(absolutePublicUrl(u));
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
