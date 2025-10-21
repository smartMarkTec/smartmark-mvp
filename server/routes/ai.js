'use strict';

/**
 * SmartMark AI routes — static ads with adaptive headline scrim + subhead chip + solid CTA
 * - Headline sits on a soft top gradient scrim (NO box)
 * - Subhead on a tight translucent chip (adaptive blur/opacity; language-sanitized)
 * - CTA pill with soft shadow and optical centering
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
      body = stripFashionIfNotApplicable(clean(parsed.body, 220), category);
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

/* ---------------------- IMAGE OVERLAYS (Option A layout) ---------------------- */
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

/* ---------- Image analysis for adaptive placement ---------- */
async function analyzeImageForPlacement(imgBuf) {
  try {
    const W = 96, H = 96; // downsample for stats
    const { data } = await sharp(imgBuf).resize(W, H, { fit: 'cover' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const px = W * H;
    // overall average
    let rSum = 0, gSum = 0, bSum = 0;
    for (let i = 0; i < data.length; i += 3) { rSum += data[i]; gSum += data[i + 1]; bSum += data[i + 2]; }
    const avgR = rSum / px, avgG = gSum / px, avgB = bSum / px;
    const lum = Math.round(0.2126*avgR + 0.7152*avgG + 0.0722*avgB);

    // band luminance (top and middle)
    const topRows = Math.floor(H * 0.33), midStart = Math.floor(H * 0.40), midRows = Math.floor(H * 0.20);
    function bandLum(y0, rows) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y0 + rows; y++) {
        for (let x = 0; x < W; x++) {
          const i = (y * W + x) * 3;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      const ar = r / n, ag = g / n, ab = b / n;
      return Math.round(0.2126*ar + 0.7152*ag + 0.0722*ab);
    }
    const topLum = bandLum(0, topRows);
    const midLum = bandLum(midStart, midRows);

    // crude texture = std dev of luminance in middle band
    let vals = [];
    for (let y = midStart; y < midStart + midRows; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const L = 0.2126*data[i] + 0.7152*data[i + 1] + 0.0722*data[i + 2];
        vals.push(L);
      }
    }
    const mean = vals.reduce((a,c)=>a+c,0) / vals.length;
    const variance = vals.reduce((a,c)=>a+(c-mean)*(c-mean),0) / vals.length;
    const texture = Math.sqrt(Math.max(variance, 0)); // ~0–70

    // choose a neutral dark for CTA shadows (not used for boxes anymore)
    const neutrals = ['#111827','#1f2937','#27272a','#374151','#3f3f46','#4b5563'];
    const idx = lum >= 185 ? 0 : lum >= 150 ? 1 : lum >= 120 ? 2 : lum >= 90 ? 3 : lum >= 60 ? 4 : 5;

    return { brandColor: neutrals[idx], metrics: { topLum, midLum, texture } };
  } catch {
    return { brandColor: '#1f2937', metrics: { topLum: 140, midLum: 140, texture: 28 } };
  }
}

/* ---------- Title case helper ---------- */
function toTitleCase(s) {
  return String(s || '').replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/* ---------- Language sanitizer for subheadline ---------- */
function normalizeSubline(text, category = 'generic') {
  let s = String(text || '').toLowerCase().trim();

  // Fix common awkward patterns
  s = s.replace(/\bour better made is\b/gi, 'better made');        // "Our better made is" → "Better made"
  s = s.replace(/\bis natural material(s)?\b/gi, 'uses natural materials');
  s = s.replace(/\bnatural material\b/gi, 'natural materials');
  s = s.replace(/\bevery day\b/gi, 'everyday');

  // If starts with 'our ' and reads weird, drop 'our'
  s = s.replace(/^our\s+(better|simple|clean|modern)\b/gi, (_m, w) => `${w}`);

  // Keep it short, positive, and noun/verb sensible
  const HARD_FALLBACKS = {
    fashion: ['Better materials, made to last', 'Everyday pieces, easy to wear'],
    cosmetics: ['Gentle formulas for daily care', 'Simple routine, better skin'],
    hair: ['Clean care for healthy hair', 'Easy styling, everyday'],
    food: ['Great taste, less hassle', 'Fresh flavor, easy meals'],
    pets: ['Simple treats, happy pets', 'Daily care made easy'],
    electronics: ['Reliable tech for daily use', 'Simple design, solid performance'],
    home: ['Upgrade your space with ease', 'Clean look, practical use'],
    coffee: ['Balanced flavor, smooth finish', 'Better coffee breaks'],
    fitness: ['Made for your workouts', 'Durable gear for training'],
    generic: ['Made for everyday use', 'Simple design, better value'],
  }[category] || ['Made for everyday use'];

  // If empty or nonsense, fallback
  if (!s || s.length < 8) return HARD_FALLBACKS[0];

  // Capitalize key nouns
  s = s.replace(/\b(quality|materials?|routine|performance|workouts?|training|style|coffee|flavor|design)\b/gi,
                (m)=>m.toLowerCase());

  // Trim to ~5–8 words
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 10) s = words.slice(0, 10).join(' ');
  if (words.length < 4 && HARD_FALLBACKS[1]) s = HARD_FALLBACKS[1];

  // Title Case final
  return toTitleCase(s);
}

/* ---------- SVG defs + Option A layout ---------- */
function svgDefs() {
  return `
    <defs>
      <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000" stop-opacity="0.26"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.00"/>
      </linearGradient>
      <filter id="btnShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2.4" stdDeviation="3.2" flood-color="#000" flood-opacity="0.45"/>
      </filter>
      <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.6"/>
      </filter>
    </defs>
  `;
}
const LIGHT = '#f5f7f9';

// CTA pill (optical centering improved)
const pillBtn = (x, y, text, fs = 30) => {
  fs = Math.max(24, Math.min(fs, 36));
  const w = Math.min(880, estWidth(text, fs) + 80);
  const h = 62;
  const x0 = x - w / 2;
  return `
    <g transform="translate(${x0}, ${y - Math.floor(h * 0.55)})" filter="url(#btnShadow)">
      <rect x="0" y="-18" width="${w}" height="${h}" rx="31" fill="#0b0d10dd"/>
      <rect x="0" y="-18" width="${w}" height="${Math.max(16, Math.floor(h*0.48))}" rx="31"
            fill="#ffffff" fill-opacity="0.08"/>
      <text x="${w / 2}" y="16" text-anchor="middle"
            font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
            font-size="${fs}" font-weight="900" fill="#ffffff" letter-spacing="1.0">
        ${escSVG(text)}
      </text>
    </g>`;
};

// Option A: Headline on scrim, subhead chip, solid CTA
function svgOverlayCreative({ W, H, title, subline, cta, metrics = { topLum: 140, midLum: 140, texture: 28 } }) {
  const defs = svgDefs();
  const extraDefs = `
    <defs>
      <filter id="chipBlurLow" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="chipBlurMed" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="chipBlurHigh" x="-25%" y="-25%" width="150%" height="150%"><feGaussianBlur stdDeviation="8"/></filter>
      <filter id="chipShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.2" stdDeviation="1.8" flood-color="#000" flood-opacity="0.22"/>
      </filter>
    </defs>
  `;

  const SAFE_PAD = 24;
  const maxW = W - SAFE_PAD * 2;

  // Adaptive top scrim opacity (headline region)
  // brighter top → stronger scrim
  const scrim = (() => {
    const { topLum } = metrics;
    if (topLum >= 190) return 0.32;
    if (topLum >= 160) return 0.28;
    if (topLum >= 130) return 0.24;
    return 0.18;
  })();

  // Headline sizing; enforce single line down to 32px
  let HL_FS = 62;
  let headlineFs = fitFont(title, maxW - 40, HL_FS, 32);
  const headlineMaxW = Math.min(maxW * 0.90, maxW - 40);

  // --- Subhead chip sizing (make text a bit bigger + chip slightly taller) ---
const SUB_FS = fitFont(subline, Math.min(W * 0.72, 900), 36, 22); // start bigger (36), cap width to 72%
const subTextW = estWidth(subline, SUB_FS);
const subPadX = 32;                                               // a touch tighter padding
const subW = Math.min(maxW * 0.75, subTextW + subPadX * 2);
const subH = Math.max(40, SUB_FS + 20);                           // was ~38 / +16 → a tad taller
const subX = Math.round((W - subW) / 2);

// Rhythm & positioning
const topBandH = 190;
const headlineY = 96 + headlineFs * 0.38;
const GAP_HL_TO_SUB = 32;
const subBaselineY = 96 + 20 + GAP_HL_TO_SUB + headlineFs;
const subRectY = Math.round(subBaselineY - SUB_FS * 0.86);


  // Chip adaptivity by texture
  const t = metrics.texture; // ~0–70
  let chipOpacity = 0.20;
  let chipBlurId = 'chipBlurLow';
  if (t > 35 && t <= 50) { chipOpacity = 0.24; chipBlurId = 'chipBlurMed'; }
  else if (t > 50)        { chipOpacity = 0.26; chipBlurId = 'chipBlurHigh'; }

  // If mid band very bright, raise chip opacity slightly
  if (metrics.midLum >= 185) chipOpacity = Math.min(chipOpacity + 0.02, 0.30);

  // CTA
  const GAP_SUB_TO_CTA = 60;
  const ctaY = Math.round(subBaselineY + SUB_FS + GAP_SUB_TO_CTA);

  // Corners
  const R = 6;

  // Build SVG
  return `${defs}${extraDefs}
    <!-- Adaptive top scrim -->
    <linearGradient id="dynTop" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="${scrim}"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.00"/>
    </linearGradient>
    <rect x="0" y="0" width="${W}" height="${topBandH}" fill="url(#dynTop)"/>

    <!-- Headline (no box) -->
    <text x="${W / 2}" y="${headlineY}" text-anchor="middle"
      font-family="Inter, Helvetica, Arial, DejaVu Sans, sans-serif"
      font-size="${headlineFs}" font-weight="1000" fill="#ffffff" letter-spacing="1.1"
      style="paint-order: stroke fill; stroke:#000; stroke-width:0.9; stroke-opacity:0.18">
      ${escSVG(title)}
    </text>

    <!-- Subhead chip -->
    <g filter="url(#chipShadow)">
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}"
            fill="#000000" fill-opacity="${chipOpacity}" />
      <!-- subtle frost -->
      <rect x="${subX}" y="${subRectY}" width="${subW}" height="${subH}" rx="${R}"
            fill="#ffffff" fill-opacity="0.10" filter="url(#${chipBlurId})"/>
    </g>
    <text x="${W / 2}" y="${subBaselineY}" text-anchor="middle"
      font-family="'Times New Roman', Times, serif"
      font-size="${SUB_FS}" font-weight="700" fill="#f5f7f9" letter-spacing="0.2"
      style="paint-order: stroke fill; stroke:#000; stroke-width:1.0; stroke-opacity:0.20">
      ${escSVG(subline)}
    </text>

    <!-- CTA pill -->
    ${pillBtn(W / 2, ctaY, cta, 30)}
  `;
}

/* ---------- Subline crafting (now sanitized) ---------- */
function craftSubline(answers = {}, category = 'generic') {
  const pick = (s) => String(s || '').replace(/[^\w\s\-']/g, '').trim().toLowerCase();
  const defaults = {
    fashion: ['Better materials, made to last','Everyday pieces, easy to wear'],
    cosmetics: ['Gentle formulas for daily care','Simple routine, better skin'],
    hair: ['Clean care for healthy hair','Easy styling, everyday'],
    food: ['Great taste, less hassle','Fresh flavor, easy meals'],
    pets: ['Simple treats, happy pets','Daily care made easy'],
    electronics: ['Reliable tech for daily use','Simple design, solid performance'],
    home: ['Upgrade your space with ease','Clean look, practical use'],
    coffee: ['Balanced flavor, smooth finish','Better coffee breaks'],
    fitness: ['Made for your workouts','Durable gear for training'],
    generic: ['Made for everyday use','Simple design, better value'],
  }[category] || ['Made for everyday use'];

  const candidates = [answers.mainBenefit, answers.description, answers.productType].map(pick).filter(Boolean);
  let line = candidates[0] || defaults[0];

  // Keep it to a sensible length before normalization
  const words = line.split(/\s+/).filter(Boolean);
  while (words.length > 10) words.pop();
  line = words.join(' ');

  // Sanitize awkward phrasing and Title Case it
  return normalizeSubline(line, category);
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
  const rawSubline = craftSubline(answers, category);
  const subline = rawSubline; // already Title Cased in normalizeSubline
  const cta = cleanCTA(ctaHint) || 'LEARN MORE';

  const overlaySVG = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgOverlayCreative({
      W, H, title, subline, cta, metrics: analysis.metrics,
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
          meta: { keyword, overlayText: ctaHint, headlineHint, category, layout: 'optionA', adaptive: true },
        });
        return publicUrl;
      } catch {
        await saveAsset({
          req, kind: 'image', url: baseUrl, absoluteUrl: baseUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, raw: true, category, layout: 'optionA', adaptive: false },
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
          meta: { category, keyword, placeholder: true, i, layout: 'optionA', adaptive: true },
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
        await saveAsset({ req, kind: 'image', url: publicUrl, absoluteUrl, meta: { category, keyword, placeholder: true, i, layout: 'optionA', adaptive: true } });
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
        await saveAsset({ req, kind: 'image', url: publicUrl, absoluteUrl, meta: { category, keyword, placeholder: true, i, layout: 'optionA', adaptive: true } });
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
