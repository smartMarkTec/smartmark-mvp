'use strict';

/**
 * SmartMark AI routes — static ads with glassmorphism chips
 * - Headline with adaptive top scrim and micro-stroke
 * - Subtitle chip: ambient-tinted glass with inner highlight, adaptive blur/opacity, micro-noise
 * - CTA pill with soft shadow + inner highlight
 * - Exactly TWO image variations per generate
 * - Tight timeouts, memory discipline, and graceful fallbacks
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
  const resp = await axios.post(url, form, {
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
function getImageKeyword(industry = '', url = '') {
  const input = `${industry} ${url}`.toLowerCase();
  for (const row of IMAGE_KEYWORD_MAP)
    if (row.match.some((m) => input.includes(m))) return row.keyword;
  return industry || 'ecommerce';
}
function deriveTopicKeywords(answers = {}, url = '', fallback = 'shopping') {
  const industry = answers.industry || answers.productType || '';
  const base = getImageKeyword(industry, url) || industry || fallback;
  const extra = String(answers.description || answers.product || answers.mainBenefit || '').toLowerCase();
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
  const APPEND = (line) => (t.replace(/\s+/g, ' ').trim().replace(/[.]*\s*$/, '') + '. ' + line).trim();
  const req = {
    fitness: ['workout','training','gym','strength','wellness'],
    cosmetics: ['skin','makeup','beauty','serum','routine'],
    hair: ['hair','shampoo','conditioner','styling'],
    food: ['fresh','flavor','taste','meal','snack'],
    pets: ['pet','dog','cat','treat'],
    electronics: ['tech','device','gadget','performance'],
    home: ['home','kitchen','decor','space'],
    coffee: ['coffee','brew','roast','espresso'],
    fashion: ['style','outfit','fabric','fit'],
    generic: [],
  }[category] || [];
  if (!req.length || hasAny(req)) return t;
  const injection = {
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
    fashion: 'FASHION', fitness: 'TRAINING', cosmetics: 'BEAUTY', hair: 'HAIR CARE',
    food: 'FOOD', pets: 'PET CARE', electronics: 'TECH', home: 'HOME',
    coffee: 'COFFEE', generic: 'SHOP',
  }[category || 'generic'];
}
function overlayTitleFromAnswers(answers = {}, categoryOrTopic = '') {
  const category =
    categoryOrTopic &&
    /^(fashion|fitness|cosmetics|hair|food|pets|electronics|home|coffee|generic)$/i.test(categoryOrTopic)
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
      // Grammar guardrails for body (subtitle): simple normalization to avoid "is the best" repetition etc.
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

/* ---------------------- IMAGE OVERLAYS (glass chips) ---------------------- */
const PEXELS_IMG_BASE = 'https://api.pexels.com/v1/search';
function escSVG(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function estWidth(text, fs) { return (String(text || '').length || 1) * fs * 0.6; }
function fitFont(text, maxW, startFs, minFs = 26) { let fs = startFs; while (fs > minFs && estWidth(text, fs) > maxW) fs -= 2; return fs; }
const BANNED_TERMS = /\b(unisex|global|vibes?|forward|finds?|chic|bespoke|avant|couture)\b/i;
function cleanHeadline(h) {
  h = String(h || '').replace(/[^a-z0-9 &\-]/gi, ' ').replace(/\s+/g, ' ').trim();
  if (!h || BANNED_TERMS.test(h)) return '';
  const words = h.split(' ');
  if (words.length > 6) h = words.slice(0, 6).join(' ');
  return h.toUpperCase();
}
const ALLOWED_CTAS = ['SHOP NOW', 'LEARN MORE', 'GET STARTED', 'VISIT US', 'BUY NOW', 'TAKE A LOOK', 'CHECK US OUT'];
function cleanCTA(c) {
  let norm = String(c || '').toUpperCase().replace(/[\'’!]/g, '').replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  if (!ALLOWED_CTAS.includes(norm)) norm = 'LEARN MORE';
  return norm;
}
function pickSansFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSans.ttf'
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return null;
}
function pickSerifFontFile() {
  const candidates = [
    '/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf'
  ];
  for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch {} }
  return pickSansFontFile();
}

/* ---------- Photo metrics for adaptive layout & glass ---------- */
async function analyzeImageForPlacement(imgBuf) {
  try {
    const W = 72, H = 72;
    const { data } = await sharp(imgBuf).resize(W, H, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let rSum = 0, gSum = 0, bSum = 0;
    // top & mid bands ~ adaptive scrim/chip
    let rTop=0,gTop=0,bTop=0,cTop=0, rMid=0,gMid=0,bMid=0,cMid=0;
    let varSum = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        rSum += r; gSum += g; bSum += b;
        const lum = 0.2126*r + 0.7152*g + 0.0722*b;
        varSum += lum*lum;

        if (y < Math.floor(H * 0.28)) { rTop += r; gTop += g; bTop += b; cTop++; }
        if (y >= Math.floor(H * 0.38) && y < Math.floor(H * 0.62)) { rMid += r; gMid += g; bMid += b; cMid++; }
      }
    }

    const px = W*H;
    const avgR = rSum/px, avgG = gSum/px, avgB = bSum/px;
    const lumAll = Math.round(0.2126*avgR + 0.7152*avgG + 0.0722*avgB);
    const lumTop = Math.round(0.2126*(rTop/cTop) + 0.7152*(gTop/cTop) + 0.0722*(bTop/cTop));
    const lumMid = Math.round(0.2126*(rMid/cMid) + 0.7152*(gMid/cMid) + 0.0722*(bMid/cMid));
    // texture proxy: variance of luminance
    const meanLum = lumAll;
    // approximate variance = E[x^2] - mu^2
    const e2 = varSum/px;
    const variance = Math.max(0, e2 - meanLum*meanLum);
    const texture = Math.min(70, Math.sqrt(variance)/2); // 0..~70 scale

    // Neutral grayscale palette only for headline bar fallback
    const neutrals = ['#111827','#1f2937','#27272a','#374151','#3f3f46','#4b5563'];
    const idx = lumAll >= 185 ? 0 : lumAll >= 150 ? 1 : lumAll >= 120 ? 2 : lumAll >= 90 ? 3 : lumAll >= 60 ? 4 : 5;

    return {
      brandColor: neutrals[idx],
      topLum: lumTop,
      midLum: lumMid,
      texture,
      avgRGB: { r: Math.round(avgR), g: Math.round(avgG), b: Math.round(avgB) }
    };
  } catch {
    return { brandColor: '#1f2937', topLum: 150, midLum: 140, texture: 30, avgRGB: { r: 64, g: 64, b: 64 } };
  }
}

/* ---------- Title case helper for subheadline ---------- */
function toTitleCase(s) {
  return String(s || '').replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/* ---------- SVG defs + layout (glass, highlight, noise) ---------- */
function svgDefs(brandColor) {
  return `
    <defs>
      <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.34"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.00"/>
      </linearGradient>

      <!-- subtle white stroke around headline text -->
      <filter id="textStroke">
        <feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="dil"/>
        <feColorMatrix in="dil" type="matrix" values="
          0 0 0 0 1
          0 0 0 0 1
          0 0 0 0 1
          0 0 0 0.18 0" result="stroke"/>
        <feMerge>
          <feMergeNode in="stroke"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>

      <!-- CTA shadow -->
      <filter id="btnShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="#000" flood-opacity="0.35"/>
      </filter>

      <!-- Glass blur presets (applied to chip group) -->
      <filter id="chipBlurLow"  x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.0"/></filter>
      <filter id="chipBlurMed"  x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="1.6"/></filter>
      <filter id="chipBlurHigh" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>

      <!-- Inner highlight for glass (top gradient clipped in chip) -->
      <linearGradient id="chipInnerHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.14"/>
        <stop offset="45%" stop-color="#fff" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>

      <!-- Micro-noise for chip to avoid banding -->
      <filter id="chipNoise" x="-10%" y="-10%" width="120%" height="120%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="7" result="noise"/>
        <feColorMatrix type="matrix" values="
          0 0 0 0 0.5
          0 0 0 0 0.5
          0 0 0 0 0.5
          0 0 0 0.02 0" result="noiseTint"/>
        <feBlend in="SourceGraphic" in2="noiseTint" mode="normal"/>
      </filter>

      <!-- CTA inner highlight -->
      <linearGradient id="ctaHi" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.2"/>
        <stop offset="35%" stop-color="#fff" stop-opacity="0.06"/>
        <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
    </defs>
  `;
}

const LIGHT = '#f5f7f9';

// CTA pill with softer shadow; text nudged lower for true visual center
const pillBtn = (x, y, text, fs = 30) => {
  fs = Math.max(24, Math.min(fs, 36));
  const w = Math.min(880, estWidth(text, fs) + 80);
  const h = 62;
  const x0 = x - w / 2;
  return `
    <g transform="translate(${x0}, ${y - Math.floor(h * 0.55)})" filter="url(#btnShadow)">
      <rect x="0" y="-18" width="${w}" height="${h}" rx="31" fill="#0b0d10dd"/>
      <!-- was y="13"; drop a touch for better optical centering -->
      <text x="${w / 2}" y="16" text-anchor="middle"
            font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
            font-size="${fs}" font-weight="900" fill="#ffffff" letter-spacing="1.0">
        ${escSVG(text)}
      </text>
    </g>`;
};



/* --------- Glass overlay creative --------- */
function svgOverlayCreative({ W, H, title, subline, cta, brandColor, metrics }) {
  const defs = svgDefs(brandColor);
  const SAFE_PAD = 24;
  const maxW = W - SAFE_PAD * 2;

  // Headline sizing/placement
  const HL_FS_START = 68;
  let headlineFs = fitFont(title, Math.min(maxW * 0.92, maxW - 40), HL_FS_START, 32);

  // Adaptive top scrim opacity (headline region)
  const scrim = (() => {
    const topLum = metrics?.topLum ?? 150;
    if (topLum >= 190) return 0.36;
    if (topLum >= 160) return 0.30;
    if (topLum >= 130) return 0.26;
    return 0.20;
  })();

  // --- Subhead chip sizing (kept) + true vertical centering ---
  const SUB_FS = fitFont(subline, Math.min(W * 0.70, 860), 42, 26); // start 42px, min 26px
  const subTextW = estWidth(subline, SUB_FS);
  const subPadX = 40;
  const subW = Math.min(maxW * 0.75, subTextW + subPadX * 2);
  const subH = Math.max(48, SUB_FS + 24);
  const subX = Math.round((W - subW) / 2);

  // Rhythm
  const headlineY = 96 + headlineFs * 0.38;
  const GAP_HL_TO_SUB = 32;

  // Chip pos using center for perfect vertical centering
  const subRectY = Math.round(96 + 20 + GAP_HL_TO_SUB + headlineFs - subH / 2);
  const subCenterY = subRectY + Math.round(subH / 2);
  const subBaselineY = subCenterY;

  // Chip adaptivity (stronger glass look)
  const t = metrics?.texture ?? 30;
  const midLum = metrics?.midLum ?? 140;
  let chipOpacity = 0.26;                   // was 0.20 → slightly stronger base
  let chipBlurId = 'chipBlurLow';
  if (t > 35 && t <= 50) { chipOpacity = 0.30; chipBlurId = 'chipBlurMed'; }
  else if (t > 50)        { chipOpacity = 0.34; chipBlurId = 'chipBlurHigh'; }

  // If mid band very bright, raise chip opacity a bit more
  if (midLum >= 170) chipOpacity = Math.min(chipOpacity + 0.04, 0.40);
  if (midLum <= 90)  chipOpacity = Math.max(0.22, chipOpacity - 0.02);

  // Ambient tint from photo average color (very subtle)
  const avg = metrics?.avgRGB || { r: 64, g: 64, b: 64 };
  const tint = `rgba(${avg.r},${avg.g},${avg.b},0.08)`;

  // Lower CTA a bit more (no change to subtitle)
  const GAP_SUB_TO_CTA = 92;
  const ctaY = Math.round(subBaselineY + SUB_FS + GAP_SUB_TO_CTA);

  // Corners
  const R = 6;

  // ---- Subtitle contrast guard (UNCHANGED) ----
  const subTextFill      = midLum >= 175 ? '#111111' : '#ffffff';
  const subStrokeColor   = midLum >= 175 ? '#ffffff' : '#000000';
  const subStrokeOpacity = midLum >= 175 ? 0.35 : 0.55;
  const subLetterSpacing = 0.3;

  // Build
  return `${defs}
    <g opacity="${scrim}">
      <rect x="0" y="0" width="${W}" height="200" fill="url(#topShade)"/>
    </g>

    <!-- Headline -->
    <text x="${W / 2}" y="${headlineY}" text-anchor="middle"
      font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
      font-size="${headlineFs}" font-weight="1000" fill="#ffffff" letter-spacing="0.4"
      filter="url(#textStroke)">
      ${escSVG(title)}
    </text>

    <!-- Subtitle Glass Chip (more glassy: stronger blur + slight frost layer) -->
    <g filter="url(#${chipBlurId}) url(#chipNoise)">
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}"
        fill="${tint}" opacity="${chipOpacity}"/>
      <!-- subtle frost to boost separation without heaviness -->
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}"
        fill="#ffffff" opacity="0.06"/>
      <!-- inner highlight (top) -->
      <rect x="${subX + 1}" y="${subRectY + 1}" width="${subW - 2}" height="${Math.max(8, subH * 0.45)}" rx="${R - 1}"
        fill="url(#chipInnerHi)"/>
    </g>

    <!-- Subtitle text (style/centering UNCHANGED) -->
    <text x="${W / 2}" y="${subCenterY}" text-anchor="middle"
      dominant-baseline="middle" alignment-baseline="middle"
      font-family="'Times New Roman', Times, serif"
      font-size="${SUB_FS}" font-weight="700" fill="${subTextFill}" letter-spacing="${subLetterSpacing}"
      style="paint-order: stroke fill; stroke:${subStrokeColor}; stroke-width:1.2; stroke-opacity:${subStrokeOpacity}">
      ${escSVG(subline)}
    </text>

    ${pillBtn(W / 2, ctaY, cta, 32)}
  `;
}



/* ---------- Subline crafting (grammar-safe) ---------- */
function craftSubline(answers = {}, category = 'generic') {
  const clean = (s) =>
    String(s || '')
      .replace(/[^\w\s\-']/g, ' ')   // strip symbols
      .replace(/\s+/g, ' ')          // collapse spaces
      .trim()
      .toLowerCase();

  // Natural, short defaults written as noun/verb taglines
  const defaults = {
    fashion:      ['natural materials, made to last', 'everyday pieces built to last'],
    cosmetics:    ['gentle formulas for daily care', 'simple routine, better skin'],
    hair:         ['better hair care, less effort', 'clean formulas, easy styling'],
    food:         ['great taste with less hassle', 'fresh flavor, easy meals'],
    pets:         ['care for your pet daily', 'simple treats for happy pets'],
    electronics:  ['reliable everyday tech', 'simple design, solid performance'],
    home:         ['upgrade your space easily', 'clean looks, practical use'],
    coffee:       ['balanced flavor, smooth finish', 'better coffee breaks'],
    fitness:      ['made for daily training', 'durable gear for workouts'],
    generic:      ['made for everyday use', 'simple design, better value'],
  }[category] || ['made for everyday use'];

  // Candidate sources from the form
  const candidates = [
    clean(answers.mainBenefit),
    clean(answers.description),
    clean(answers.productType),
  ].filter(Boolean);

  // Start with the strongest signal or a category default
  let line = candidates[0] || defaults[0];

  // --- Grammar & wording normalizers ---
  // remove weird “quality of …” constructs
  line = line.replace(/\bquality of\b/gi, '').trim();

  // tone down “is/are the best”
  line = line.replace(/\bis the best\b/gi, 'is great')
             .replace(/\bare the best\b/gi, 'are great');

  // friendlier phrases
  line = line.replace(/\bbetter made\b/gi, 'made to last')
             .replace(/\bwell made\b/gi, 'made to last')
             .replace(/\bhigh quality\b/gi, 'great quality');

  // material(s)
  line = line.replace(/\bnatural material\b/gi, 'natural materials');

  // avoid “our … uses … materials” stiffness -> “made with … materials”
  line = line.replace(/\bour\b/gi, '').trim();
  line = line.replace(/\buses natural materials\b/gi, 'is made with natural materials');

  // collapse leftover doubles
  line = line.replace(/\b(\w+)\s+\1\b/gi, '$1').trim();

  // Token-level shaping: keep it concise (5–9 words)
  let words = line.split(/\s+/).filter(Boolean);

  // If the sentence begins with a dangling conjunction/article, trim it.
  while (words[0] && /^(and|or|but|the|a|an)$/.test(words[0])) words.shift();

  // Cap length
  if (words.length > 9) words = words.slice(0, 9);

  // If too short, pad with secondary signal or category fallback
  if (words.length < 5) {
    const filler = clean(candidates[1] || defaults[1] || '')
      .replace(/\bquality of\b/gi, '')
      .replace(/\bnatural material\b/gi, 'natural materials')
      .split(/\s+/)
      .filter(Boolean);
    while (words.length < 5 && filler.length) words.push(filler.shift());
  }

  // Final pass: remove terminal “and/with/of”
  while (words.length && /^(and|with|of)$/.test(words[words.length - 1])) words.pop();

  return words.join(' ');
}

/* ---------- Overlay builder ---------- */
async function buildOverlayImage({
  imageUrl, headlineHint = '', ctaHint = '', seed = '',
  fallbackHeadline = 'SHOP', answers = {}, category = 'generic',
}) {
  const W = 1200, H = 628;
  const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 9000 });
  const analysis = await analyzeImageForPlacement(imgRes.data);
  const base = sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3, withoutEnlargement: true })
    .removeAlpha();

  const title = cleanHeadline(headlineHint) || cleanHeadline(fallbackHeadline) || 'SHOP';
  const subline = toTitleCase(craftSubline(answers, category)); // Title Case applied here
  const cta = cleanCTA(ctaHint) || 'LEARN MORE';

  const overlaySVG = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgOverlayCreative({
      W, H, title, subline, cta, brandColor: analysis.brandColor, metrics: analysis,
    })}</svg>`
  );

  const outDir = ensureGeneratedDir();
  const file = `${uuidv4()}.jpg`;
  await base
    .composite([{ input: overlaySVG, top: 0, left: 0 }])
    .jpeg({ quality: 91, chromaSubsampling: '4:4:4', mozjpeg: true })
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
    if (!url || !/^https?:\/\//i.test(String(url))) return reject(new Error('Invalid clip URL'));
    const writer = fs.createWriteStream(dest);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true; writer.destroy();
      try { fs.unlinkSync(dest); } catch {}
      reject(new Error('Download timed out'));
    }, timeoutMs);
    axios({ url, method: 'GET', responseType: 'stream', timeout: timeoutMs })
      .then((resp) => {
        let bytes = 0;
        resp.data.on('data', (ch) => {
          bytes += ch.length;
          if (bytes > maxSizeMB * 1024 * 1024 && !timedOut) {
            timedOut = true; writer.destroy(); try { fs.unlinkSync(dest); } catch {}
            clearTimeout(timeout); reject(new Error('File too large'));
          }
        });
        resp.data.on('error', (err) => { clearTimeout(timeout); if (!timedOut) reject(err); });
        resp.data.pipe(writer);
        writer.on('finish', () => { clearTimeout(timeout); if (!timedOut) resolve(dest); });
        writer.on('error', (err) => { clearTimeout(timeout); try { fs.unlinkSync(dest); } catch {} if (!timedOut) reject(err); });
      })
      .catch((err) => { clearTimeout(timeout); try { fs.unlinkSync(dest); } catch {} reject(err); });
  });
}

/* -------------------- Video endpoint placeholder (unchanged) -------------------- */
router.post('/generate-video-ad', heavyLimiter, async (_req, res) => {
  res.status(501).json({ error: 'Video generation unchanged in this update.' });
});

/* --------------------- IMAGE: search + overlay (TWO variations) --------------------- */
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();
  try {
    if (typeof res.setTimeout === 'function') res.setTimeout(45000);
    if (typeof req.setTimeout === 'function') req.setTimeout(45000);
  } catch {}

  try {
    const { regenerateToken = '' } = req.body;
    const top = req.body || {};
    const answers = top.answers || top;
    const url = answers.url || top.url || '';
    const industry = answers.industry || top.industry || '';
    const category = resolveCategory(answers || {});
    const keyword = getImageKeyword(industry, url);

    const makeOne = async (baseUrl, seed) => {
      const headlineHint = overlayTitleFromAnswers(answers, category);
      const ctaHint = cleanCTA(answers?.cta || '');
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
          req, kind: 'image', url: publicUrl, absoluteUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, category, glass: true },
        });
        return publicUrl;
      } catch {
        await saveAsset({
          req, kind: 'image', url: baseUrl, absoluteUrl: baseUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, raw: true, category, glass: true },
        });
        return baseUrl;
      }
    };

    if (!PEXELS_API_KEY) {
      const urls = [], absUrls = [];
      for (let i = 0; i < 2; i++) {
        const { publicUrl, absoluteUrl } = await buildOverlayImage({
          imageUrl: 'https://picsum.photos/seed/smartmark' + i + '/1200/628',
          headlineHint: overlayTitleFromAnswers(answers, category),
          ctaHint: cleanCTA(answers?.cta || ''),
          seed: regenerateToken + '_' + i,
          fallbackHeadline: overlayTitleFromAnswers(answers, category),
          answers, category,
        });
        await saveAsset({
          req, kind: 'image', url: publicUrl, absoluteUrl,
          meta: { category, keyword, placeholder: true, i, glass: true },
        });
        urls.push(publicUrl); absUrls.push(absoluteUrl);
      }
      return res.json({
        imageUrl: urls[0],
        absoluteImageUrl: absUrls[0],
        keyword,
        totalResults: 2,
        usedIndex: 0,
        imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] || absolutePublicUrl(u) })),
      });
    }

    let photos = [];
    try {
      const r = await axios.get(PEXELS_IMG_BASE, {
        headers: { Authorization: PEXELS_API_KEY },
        params: { query: keyword, per_page: 8 },
        timeout: 2200,
      });
      photos = r.data.photos || [];
    } catch {
      const urls = [], absUrls = [];
      for (let i = 0; i < 2; i++) {
        const { publicUrl, absoluteUrl } = await buildOverlayImage({
          imageUrl: 'https://picsum.photos/seed/smartmark' + i + '/1200/628',
          headlineHint: overlayTitleFromAnswers(answers, category),
          ctaHint: cleanCTA(answers?.cta || ''),
          seed: regenerateToken + '_' + i,
          fallbackHeadline: overlayTitleFromAnswers(answers, category),
          answers, category,
        });
        await saveAsset({ req, kind: 'image', url: publicUrl, absoluteUrl, meta: { category, keyword, placeholder: true, i, glass: true } });
        urls.push(publicUrl); absUrls.push(absoluteUrl);
      }
      return res.json({
        imageUrl: urls[0],
        absoluteImageUrl: absUrls[0],
        keyword,
        totalResults: 2,
        usedIndex: 0,
        imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] })),
      });
    }

    if (!photos.length) {
      const urls = [], absUrls = [];
      for (let i = 0; i < 2; i++) {
        const { publicUrl, absoluteUrl } = await buildOverlayImage({
          imageUrl: 'https://picsum.photos/seed/smartmark' + i + '/1200/628',
          headlineHint: overlayTitleFromAnswers(answers, category),
          ctaHint: cleanCTA(answers?.cta || ''),
          seed: regenerateToken + '_' + i,
          fallbackHeadline: overlayTitleFromAnswers(answers, category),
          answers, category,
        });
        await saveAsset({ req, kind: 'image', url: publicUrl, absoluteUrl, meta: { category, keyword, placeholder: true, i, glass: true } });
        urls.push(publicUrl); absUrls.push(absoluteUrl);
      }
      return res.json({
        imageUrl: urls[0],
        absoluteImageUrl: absUrls[0],
        keyword,
        totalResults: 2,
        usedIndex: 0,
        imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] })),
      });
    }

    const seed = regenerateToken || answers?.businessName || keyword || Date.now();
    let idxHash = 0; for (const c of String(seed)) idxHash = (idxHash * 31 + c.charCodeAt(0)) >>> 0;

    const picks = [];
    for (let i = 0; i < photos.length && picks.length < 2; i++) {
      const idx = (idxHash + i * 7) % photos.length;
      if (!picks.includes(idx)) picks.push(idx);
    }

    const urls = [], absUrls = [];
    for (let pi = 0; pi < picks.length; pi++) {
      const img = photos[picks[pi]];
      const baseUrl = img.src.original || img.src.large2x || img.src.large;
      const u = await makeOne(baseUrl, seed + '_' + pi);
      urls.push(u); absUrls.push(absolutePublicUrl(u));
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
      imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] || absolutePublicUrl(u) })),
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
