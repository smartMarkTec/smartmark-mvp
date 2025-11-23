'use strict';
/**
 * SmartMark AI routes — static ads with glassmorphism chips + video gen
 * - Video ads: 3–4 stock clips, crossfades, AI voiceover, optional BGM
 * - Word-by-word subtitle pop (ASS karaoke-style), timed to TTS duration
 * - Ensures total play ≥ (voice duration + 2s)
 * - Returns TWO video variants per request
 * - Image pipeline left intact
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
// Where we store generated images/videos
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
const child_process = require('child_process');
const { OpenAI } = require('openai');
const { getFbUserToken } = require('../tokenStore');
const db = require('../db');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PEXELS_API_KEY = process.env.PEXELS_API_KEY || '';
const BACKGROUND_MUSIC_URL = process.env.BACKGROUND_MUSIC_URL || ''; // optional
const OPENAI_TTS_MODEL = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
const OPENAI_TTS_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy';
// Slow the voice slightly for readability (0.85–1.00). 0.92 ≈ 8% slower.
const TTS_SLOWDOWN = Number(process.env.TTS_SLOWDOWN || 0.92);


/* ---------------------- FFmpeg + subtitle helpers ---------------------- */

function runFFmpeg(args, label = "ffmpeg") {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn("ffmpeg", ["-y", ...args], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("exit", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${label} exited ${code || "unknown"}`));
    });
  });
}

function runFFprobe(args) {
  return new Promise((resolve, reject) => {
    const proc = child_process.spawn("ffprobe", args, {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("exit", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited ${code}`));
      resolve(out);
    });
  });
}

async function getMediaDurationSeconds(filePath) {
  try {
    const raw = await runFFprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nk=1:nw=1",
      filePath,
    ]);
    const val = parseFloat(String(raw).trim());
    if (!isFinite(val) || val <= 0) throw new Error("bad duration");
    return val;
  } catch (e) {
    console.warn("[ffprobe] duration fail:", e.message);
    return null;
  }
}

/** Group word timings into 3–4 word chunks that stay tight to the VO */
/** Group word timings into 4–6 word chunks, no gaps, tight to VO */
function chunkWords(words = [], { minWords = 4, maxWords = 6, maxDur = 3.0 } = {}) {
  const safe = (Array.isArray(words) ? words : [])
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && (w.end > w.start))
    .map(w => ({ start: +w.start, end: +w.end, word: String(w.word || '').trim() }))
    .filter(w => w.word);

  const chunks = [];
  let cur = [];

  for (let i = 0; i < safe.length; i++) {
    cur.push(safe[i]);

    const have = cur.length;
    const dur  = cur[cur.length - 1].end - cur[0].start;
    const next = safe[i + 1];
    const nextWouldDur = next ? (next.end - cur[0].start) : 0;

    const tooMany   = have >= maxWords;
    const tooLong   = dur >= maxDur;
    const wouldLong = next ? (nextWouldDur > maxDur) : false;
    const lastWord  = i === safe.length - 1;

    if (tooMany || tooLong || wouldLong || (lastWord && have >= minWords)) {
      // ensure minimum count
      if (have < minWords && next) { cur.push(next); i++; }
      const text = cur.map(w => w.word).join(' ');
      chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, text });
      cur = [];
    }
  }

  // merge any leftover words (rare)
  if (cur.length) {
    const text = cur.map(w => w.word).join(' ');
    chunks.push({ start: cur[0].start, end: cur[cur.length - 1].end, text });
  }

  // make all chunks back-to-back with tiny overlap so there are ZERO gaps
  for (let i = 0; i < chunks.length - 1; i++) {
    const a = chunks[i], b = chunks[i + 1];
    if (b.start > a.end) a.end = Math.max(a.end, b.start - 0.01);
    // also clamp b.start so it never precedes a.start
    if (b.start < a.start) b.start = a.start + 0.01;
  }
  return chunks;
}


/** Build boxed, bottom-center ASS from 3–4 word chunks */
function buildAssChunks(words, opts = {}) {
  const {
    W = 960,
    H = 540,
    styleName = 'SmartSub',
    fontName = 'DejaVu Sans',
    fontSize = 46,
    marginV = 68,
    minWords = 3,
    maxWords = 4,
    maxDur = 2.2,       // seconds cap per tile
  } = opts;

  const fmt = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.round((t - Math.floor(t)) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  const tiles = chunkWords(words, { minWords, maxWords, maxDur });

  // ASS boxed style (opaque background; outline=2; shadow=0), bottom-center
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    // Primary=white, Outline=black, BackColour=semi-black, BorderStyle=3 (box), Alignment=2 (bottom-center)
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&HAA000000,0,0,0,0,100,100,0,0,3,2,0,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = tiles.map(t => {
    // strip braces that break ASS
    const txt = String(t.text).replace(/[{}]/g, '');
    // slight tracking for a clean look; keep it single line centered
    const assText = `{\\an2\\q2\\fsp2}${txt}`;
    return `Dialogue: 0,${fmt(Math.max(0, t.start - 0.02))},${fmt(t.end + 0.06)},${styleName},,0,0,${marginV},,${assText}`;
  });

  const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
  fs.writeFileSync(outPath, [...header, ...lines].join('\n'), 'utf8');
  return outPath;
}

/** Estimate single-line text width in “em” terms (same 0.54 coef you use elsewhere) */
function estWidthSerifAss(text, fs, letterSpacing = 0) {
  const t = String(text || ''), n = t.length || 1;
  return n * fs * 0.54 + Math.max(0, n - 1) * letterSpacing;
}

/**
 * Build flowing, one-line ASS subtitles with width & duration limits.
 * - No hard word cap; we pack words until width OR duration would overflow.
 * - Zero gaps between tiles; short tiles are extended/merged to avoid flicker.
 * - Always uses EVERY word in order (no drops).
 */
function buildAssFlow(words, opts = {}) {
  const {
    W = 960, H = 540,
    styleName = 'SmartSub',
 fontName = 'DejaVu Sans',
fontSize = 42,     // slightly smaller
marginV = 72,      // a hair lower from bottom edge

    // flow controls:
    maxDur = 2.8,      // hard cap per tile (s)
    minDur = 0.60,     // minimum on-screen time for any tile (s)
    maxWidthRatio = 0.86, // tile text must fit within this fraction of W
    letterSpacing = 0.02  // in “em” for width estimation only
  } = opts || {};

  const safe = (Array.isArray(words) ? words : [])
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start)
    .map(w => ({ start: +w.start, end: +w.end, word: String(w.word || '').trim() }))
    .filter(w => w.word);

  // Time formatter for ASS
  const fmt = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.round((t - Math.floor(t)) * 100);
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

 if (!safe.length) {
  const p = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H77000000,1,0,0,0,100,100,0.2,0,3,3,1,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');
  fs.writeFileSync(p, header + '\n', 'utf8');
  return p;
}


  const maxTextW = W * maxWidthRatio;
  const tiles = [];
  let cur = [];
  let curStart = safe[0].start;
  let curEnd = safe[0].end;
  let curText = '';

  const flush = (force = false) => {
    if (!cur.length) return;
    // finalize current tile
    tiles.push({
      start: curStart,
      end:   curEnd,
      text:  curText.trim()
    });
    cur = [];
  };

  for (let i = 0; i < safe.length; i++) {
    const w = safe[i];

    // propose adding word
    const nextText = (curText ? (curText + ' ' + w.word) : w.word);
    const nextEnd  = w.end;
    const durIfAdd = nextEnd - curStart;
    const widthIfAdd = estWidthSerifAss(nextText, fontSize, letterSpacing);

    const wouldOverflowDur   = durIfAdd > maxDur;
    const wouldOverflowWidth = widthIfAdd > maxTextW;

    if (!cur.length) {
      // start a fresh tile with current word even if it alone is wide; we still keep it (rare)
      cur.push(w);
      curText = w.word;
      curStart = w.start;
      curEnd = w.end;
      continue;
    }

    if (wouldOverflowDur || wouldOverflowWidth) {
      // flush the previous tile, start new from this word
      flush(true);
      cur.push(w);
      curText = w.word;
      curStart = w.start;
      curEnd = w.end;
    } else {
      // safe to add
      cur.push(w);
      curText = nextText;
      curEnd  = nextEnd;
    }
  }
  flush(true);

  // Normalize timings: zero gaps, enforce minDur, merge ultra-short tiles
  for (let i = 0; i < tiles.length - 1; i++) {
    const a = tiles[i], b = tiles[i + 1];
    // remove gaps
    if (b.start > a.end) a.end = Math.max(a.end, b.start - 0.01);
  }

  // Enforce minDur; if we can’t extend (because of next tile), merge forward
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    let dur = t.end - t.start;
    if (dur + 1e-6 < minDur) {
      // try extend into next tile boundary
      const next = tiles[i + 1];
      if (next) {
        const canExtendTo = Math.max(t.end, next.start - 0.02);
        if (canExtendTo - t.start >= minDur) {
          t.end = canExtendTo;
        } else {
          // merge into next
          next.start = t.start;
          next.text = (t.text + ' ' + next.text).replace(/\s+/g, ' ').trim();
          tiles.splice(i, 1);
          i -= 1;
        }
      }
    }
  }

  // ASS header + style (boxed, bottom-center)
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, ' +
      'Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
      'Alignment, MarginL, MarginR, MarginV, Encoding',
    // Primary=white, Outline=black, BackColour=semi-black, BorderStyle=3 (boxed), Alignment=2 (bottom-center)
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&HAA000000,0,0,0,0,100,100,0,0,3,2,0,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ];

  const lines = tiles.map(t => {
    const txt = String(t.text || '').replace(/[{}]/g, ''); // strip braces
    // bottom-center, slight tracking
    const assText = `{\\an2\\q2\\fsp2}${txt}`;
    return `Dialogue: 0,${fmt(t.start)},${fmt(t.end)},${styleName},,0,0,${marginV},,${assText}`;
  });

  const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
  fs.writeFileSync(outPath, [...header, ...lines].join('\n'), 'utf8');
  return outPath;
}


function wordsFromScript(script = '', totalSec = 14.0) {
  const clean = String(script || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  // Tokenize but KEEP punctuation tokens; merge % onto the number before it.
  const raw = clean.match(/[\w’'-]+|[%.,!?;:]/g) || [];
  // Merge "%" to previous token (e.g., "20" + "%" -> "20%")
  const tokens = [];
  for (const t of raw) {
    if (t === '%' && tokens.length) tokens[tokens.length - 1] = tokens[tokens.length - 1] + '%';
    else tokens.push(t);
  }
  // Distribute timings evenly across tokens (TTS pace is close enough for display)
  const n = Math.max(1, tokens.length);
  const step = totalSec / n;
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const s = Math.max(0, i * step);
    const e = Math.max(s + Math.min(step * 0.9, 0.6), (i + 1) * step); // keep overlap minimal
    out.push({ start: s, end: e, word: tokens[i] });
  }
  return out;
}

/** Flexible chunker: fills tiles up to maxChars or maxDur, never drops words */
function chunkWordsFlexible(words = [], {
  maxChars = 24,   // visual width limiter
  maxDur   = 2.4,  // cap each tile’s on-screen time
} = {}) {
  const safe = (Array.isArray(words) ? words : [])
    .filter(w => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start && String(w.word || '').trim());

  const chunks = [];
  let cur = [];
  let curChars = 0;
  let curStart = null;

  const pushChunk = () => {
    if (!cur.length) return;
    const text = cur.map(w => w.word).join(' ').replace(/\s+([.,!?;:])/g, '$1');
    const start = curStart;
    const end = cur[cur.length - 1].end;
    chunks.push({ start, end, text });
    cur = [];
    curChars = 0;
    curStart = null;
  };

  for (let i = 0; i < safe.length; i++) {
    const w = safe[i];
    const nextDur = (curStart === null ? (w.end - w.start) : (w.end - curStart));
    const nextChars = (curChars + (curChars ? 1 : 0) + w.word.length); // +1 for space

    // If adding this word would overflow visual/duration constraints, close current tile first
    if (cur.length && (nextChars > maxChars || nextDur > maxDur)) pushChunk();

    // Start new tile if empty
    if (!cur.length) { curStart = w.start; }

    cur.push(w);
    curChars = (curChars ? curChars + 1 : 0) + w.word.length; // +1 space
  }

  if (cur.length) pushChunk();

  // Make all chunks back-to-back with a tiny overlap so there are zero gaps
  for (let i = 0; i < chunks.length - 1; i++) {
    const a = chunks[i], b = chunks[i + 1];
    if (b.start > a.end) a.end = Math.max(a.end, b.start - 0.01);
    if (b.start < a.start) b.start = a.start + 0.01;
  }
  return chunks;
}
/** Build boxed bottom-center ASS from chunks (keeps punctuation & symbols)
 *  – smaller font, unbold text
 *  – translucent black box (&H77000000)
 *  – extra padding so text isn’t stuffed
 */
function buildAssFromChunks(chunks, {
  W = 960, H = 540,
  styleName = 'SmartSub',
  fontName = 'DejaVu Sans',
  fontSize = 34,       // ↓ smaller than before (was ~40–42)
  marginV = 76,        // a hair lower from bottom
} = {}) {
  const fmt = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.round((t - Math.floor(t)) * 100);
    return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
  };

  // ASS header:
  //  - PrimaryColour = white
  //  - BackColour = &H77000000  (77 alpha → translucent black)
  //  - BorderStyle = 3 (boxed)
  //  - Outline = 4 gives comfy padding inside the box
  //  - Bold = 0 (unbold)
  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    'WrapStyle: 2',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H77000000,0,0,0,0,100,100,0,0,3,4,1,2,40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  const lines = (chunks || []).map(t => {
    const txt = String(t.text || '').replace(/[{}]/g, ''); // strip ASS braces
    // \b0 = make sure it's not bold; \an2 bottom-center; \q2 smart line wrapping
    const assText = `{\\an2\\q2\\b0}${txt}`;
    return `Dialogue: 0,${fmt(t.start)},${fmt(t.end)},${styleName},,0,0,${marginV},,${assText}`;
  });

  const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
  fs.writeFileSync(outPath, [...header, ...lines].join('\n'), 'utf8');
  return outPath;
}

// ==== SUBTITLE STYLE (square, translucent box; un-bold; smaller) ====
function subtitleFilterSquare({
  fontPath   = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", // regular (not bold)
  fontSize   = 34,   // a bit smaller
  yPadding   = 42,   // distance from bottom
  boxBorder  = 18,   // padding around text; keeps text centered inside
  textAlpha  = 0.98, // white text opacity
  boxAlpha   = 0.35  // translucent black box
} = {}) {
  // square corners are default for drawtext box; no outline; slight shadow
  return [
    "format=yuv420p",
    `drawtext=fontfile='${fontPath}':fontsize=${fontSize}:line_spacing=2:`,
    `x=(w-text_w)/2:y=h-${yPadding}-text_h:`,
    `fontcolor=white@${textAlpha}:`,
    `box=1:boxcolor=black@${boxAlpha}:boxborderw=${boxBorder}:`,
    `shadowcolor=black@0.5:shadowx=0:shadowy=0:`,
    // keep your own dynamic text injection exactly as before; this is a safe placeholder:
    `text='%{eif\\:n\\:d\\:0}\\ '`
  ].join("");
}




/* ---------- Word-level transcription (OpenAI) with robust fallbacks ---------- */
/** Returns [{start:number, end:number, word:string}, ...] */
async function transcribeWords(voicePath) {
  try {
    const model =
      process.env.OPENAI_TRANSCRIBE_MODEL ||
      "whisper-1";

    // Prefer verbose JSON with words/segments if available
    const resp = await openai.audio.transcriptions.create({
      model,
      file: fs.createReadStream(voicePath),
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
      temperature: 0.0,
    });

    const data = resp;

    // 1) Use explicit word timings if present
    if (Array.isArray(data?.words) && data.words.length) {
      return data.words
        .filter((w) => Number.isFinite(w?.start) && Number.isFinite(w?.end) && w?.word)
        .map((w) => ({ start: +w.start, end: +w.end, word: String(w.word).trim() }))
        .filter((w) => w.end > w.start);
    }

    // 2) Interpolate inside segments
    const out = [];
    const segs = Array.isArray(data?.segments) ? data.segments : [];
    for (const s of segs) {
      const text = String(s?.text || "").trim();
      const st = +s?.start, et = +s?.end;
      if (!text || !isFinite(st) || !isFinite(et) || et <= st) continue;
      const words = text.replace(/\s+/g, " ").split(" ").filter(Boolean);
      if (!words.length) continue;
      const per = (et - st) / words.length;
      for (let i = 0; i < words.length; i++) {
        const ws = st + i * per;
        const we = i === words.length - 1 ? et : st + (i + 1) * per;
        out.push({ start: ws, end: we, word: words[i] });
      }
    }
    if (out.length) return out;

    // 3) Last resort: equal split across full duration
    const whole = (data?.text || "").trim();
    if (whole) {
      const words = whole.replace(/\s+/g, " ").split(" ").filter(Boolean);
      const dur = (await ffprobeDuration(voicePath)) || 14.0;
      const per = dur / Math.max(1, words.length);
      return words.map((w, i) => ({ start: i * per, end: (i + 1) * per, word: w }));
    }
  } catch (e) {
    console.warn("[transcribeWords] failed:", e?.message || e);
  }
  const dur = (await ffprobeDuration(voicePath)) || 14.0;
  return [{ start: 0, end: dur, word: "" }];
}

/* ---------- Build ASS word-by-word (one Dialogue per word) ---------- */
/** Writes a .ass file and returns its absolute path */
function buildAssKaraoke(words, opts = {}) {
  const {
    W = 960,
    H = 540,
    styleName = "SmartWord",
    fontName = "DejaVu Sans",
    fontSize = 42,
    marginV = 64, // distance from bottom
  } = opts || {};

  const safe = (Array.isArray(words) ? words : []).filter(
    (w) => Number.isFinite(w.start) && Number.isFinite(w.end)
  );

  const fmt = (t) => {
    if (!Number.isFinite(t) || t < 0) t = 0;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const cs = Math.round((t - Math.floor(t)) * 100);
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  // Header + style: bottom-center, white text, soft dark box behind each word
   const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H77000000,1,0,0,0,100,100,0.2,0,3,3,1,2,40,40,${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ].join("\n");


  // If we somehow have no timing data, emit an empty track
  if (!safe.length) {
    const p = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
    fs.writeFileSync(p, header + "\n", "utf8");
    return p;
  }

  // One Dialogue per word (no {\k}); only the current word is on screen
  const lines = [];
  for (const w of safe) {
    const start = Math.max(0, w.start - 0.02);
    const end   = Math.max(start + 0.10, w.end + 0.02);
    const txt   = String(w.word || "").replace(/[{}]/g, "").trim();
    if (!txt) continue;
    lines.push(`Dialogue: 0,${fmt(start)},${fmt(end)},${styleName},,0,0,${marginV},,${txt}`);
  }

  const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.ass`);
  fs.writeFileSync(outPath, header + "\n" + lines.join("\n"), "utf8");
  return outPath;
}


/** Escape a filesystem path for ffmpeg filter values */
function escapeFilterPath(p) {
  return String(p).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
}

/** Multiply all word start/end times by a factor (e.g., 1/0.92 when audio slowed to 0.92x). */
function stretchWordTimings(words = [], factor = 1.0) {
  if (!Array.isArray(words) || !Number.isFinite(factor) || factor <= 0) return words || [];
  return words.map(w => ({
    start: Math.max(0, (w.start ?? 0) / factor),
    end:   Math.max(0.01, (w.end   ?? 0.01) / factor),
    word:  String(w.word || ''),
  }));
}



/**
 * Build a modern, timed subtitles filter for ffmpeg.
 * - Splits the script into up to ~6 chunks
 * - Shows each chunk for a slice of the total duration
 * - White text, black outline, dark box, bottom-center
 */
function buildSubtitleFilter(script, totalDurationSec) {
  const clean = String(script || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    // just pass video through unchanged
    return "[0:v]scale=1280:-2,format=yuv420p[vout]";
  }

  // Split into sentences / chunks
  const sentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const parts = sentences.slice(0, 6); // up to 6 caption blocks
  const count = parts.length || 1;
  const total = Math.max(6, Math.min(40, totalDurationSec || 18)); // clamp 6–40s
  const chunk = total / count;

  let inLabel = "[0:v]";
  const filters = [];

  for (let i = 0; i < parts.length; i++) {
    // strip characters that break ffmpeg quoting
    const line = parts[i].replace(/[':\\]/g, "").trim();
    if (!line) continue;

    const start = i * chunk;
    const end = Math.min(total, (i + 1) * chunk + 0.25);
    const outLabel = i === parts.length - 1 ? "[vout]" : `[v${i + 1}]`;

    const f =
      `${inLabel}drawtext=` +
      `text='${line}':` +
      `fontcolor=white:` +
      `fontsize=40:` +
      `line_spacing=6:` +
      `bordercolor=black:` +
      `borderw=3:` +
      `box=1:` +
      `boxcolor=black@0.55:` +
      `boxborderw=12:` +
      `x=(w-text_w)/2:` +
      `y=h-140:` +
      `shadowcolor=black@0.8:` +
      `shadowx=0:` +
      `shadowy=0:` +
      `enable='between(t,${start.toFixed(2)},${end.toFixed(2)})'` +
      outLabel;

    filters.push(f);
    inLabel = outLabel;
  }

  if (!filters.length) {
    return "[0:v]scale=1280:-2,format=yuv420p[vout]";
  }
  return filters.join(";");
}

/**
 * Combine a silent montage + voiceover + timed drawtext subtitles (quick cuts).
 * - Trims final to targetSeconds
 * - No xfade here (you already concat’d segments upstream)
 */
async function addVoiceAndSubtitles({
  silentVideoPath,
  audioPath,
  script,
  outPath,
  targetSeconds = 18,
}) {
  const totalDur = Math.max(6, Math.min(40, targetSeconds || 18));

  // Normalize base video first → [v0]
  const pre = `[0:v]scale=960:540:force_original_aspect_ratio=increase,crop=960:540,format=yuv420p[v0]`;

  // Build safe drawtext overlay chain from [v0] → [vsub]
  const { filter: subF, out: vOut } = buildTimedDrawtextFilter(script, totalDur, '[v0]', 960, 540);

  const args = [
    '-i', silentVideoPath,
    '-i', audioPath,

    // filter graph: pre-normalize, then drawtext subtitles
    '-filter_complex', `${pre};${subF}`,
    '-map', vOut,
    '-map', '1:a:0',

    // codecs
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',

    // pad audio if short; hard trim output to targetSeconds
    '-af', `apad=pad_dur=${(totalDur + 0.5).toFixed(1)}`,
    '-t', totalDur.toFixed(2),

    // fast start for web playback
    '-movflags', '+faststart',
    outPath,
  ];

  await runFFmpeg(args, 'ffmpeg-subtitled');
}



async function buildSilentMontage(clipPaths, outPath, totalSeconds = 18) {
  const listPath = path.join(GENERATED_DIR, `${uuidv4()}-list.txt`);
  const listTxt = clipPaths
    .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, listTxt, "utf8");

  const trimDur = Math.max(6, Math.min(40, totalSeconds));

  const args = [
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-an",
    "-vf",
    `scale=1280:-2,format=yuv420p,trim=duration=${trimDur.toFixed(
      2
    )},setpts=PTS-STARTPTS`,
    outPath,
  ];

  await runFFmpeg(args, "ffmpeg-concat");
}

async function downloadClipToTmp(url, prefix = "clip") {
  const id = uuidv4();
  const outPath = path.join(GENERATED_DIR, `${prefix}-${id}.mp4`);
  const resp = await ax.get(url, {
    responseType: "arraybuffer",
    timeout: 25000,
  });
  fs.writeFileSync(outPath, Buffer.from(resp.data));
  return outPath;
}

async function generateVideoScriptFromAnswers(answers = {}) {
  const industry = (answers.industry || "local business").toString();
  const offer =
    (answers.offer || answers.mainBenefit || "a limited-time special").toString();
  const name = (answers.businessName || "your brand").toString();

  const prompt = [
    {
      role: "system",
      content:
        "You write short, punchy 18-second voiceover scripts for Facebook/Instagram video ads. " +
        "Use 35–45 words, 3–4 short sentences, present tense, speak directly to the viewer (using 'you'). " +
        "No hashtags, no emojis, no scene directions – just the spoken words.",
    },
    {
      role: "user",
      content:
        `Brand name: ${name}\n` +
        `Industry: ${industry}\n` +
        `Offer / main benefit: ${offer}\n\n` +
        "Write ONE 18-second voiceover script.",
    },
  ];

  const resp = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text =
    resp.output?.[0]?.content?.[0]?.text?.trim() ||
    `Discover ${name}. Enjoy ${offer}. Tap to learn more today.`;
  return text;
}

async function synthesizeVoiceToFile(text, outPath) {
  const speech = await openai.audio.speech.create({
    model: OPENAI_TTS_MODEL,
    voice: OPENAI_TTS_VOICE,
    input: text,
  });
  const buf = Buffer.from(await speech.arrayBuffer());
  fs.writeFileSync(outPath, buf);
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

/**
 * VIDEO_STITCH_BUILD
 * - Normalize inputs into a 3–5 clip plan totaling ~targetSeconds
 * - You pass in: { clipPaths: string[], targetSeconds: number }
 * - Returns: { selected: string[], durations: number[] }
 */
function buildStitchPlan({ clipPaths = [], targetSeconds = 17 }) {
  const CLEAN = (arr) => (arr || []).filter(Boolean);
  const clips = CLEAN(clipPaths);

  // Ensure we can always montage
  while (clips.length < 3 && clips.length > 0) clips.push(clips[clips.length - 1]);

  const maxClips = Math.min(5, Math.max(3, Math.min(clips.length, 5)));
  const selected = clips.slice(0, maxClips);

  const base = Math.max(6, Math.min(28, targetSeconds || 17));
  const parts = selected.length;
  const weights = selected.map((_, i) => (i === 0 || i === parts - 1) ? 1.2 : 1.0);
  const totalW = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map(w => (base * w) / totalW);

  const durations = raw.map(s => Math.max(2.2, Math.min(7.0, s)));
  return { selected, durations };
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
      ext === '.ass' ? 'text/plain; charset=utf-8' :
      'application/octet-stream';

    res.setHeader('Content-Type', type);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');

    const range = req.headers.range;
    if (range && ext === '.mp4') {
      const m = /bytes=(\d+)-(\d*)/.exec(range);
      let start = m ? parseInt(m[1], 10) : 0;
      let end = m && m[2] ? parseInt(m[2], 10) : stat.size - 1;

      // Clamp bad values so we don't spam 416s
      if (!Number.isFinite(start) || start < 0) start = 0;
      if (!Number.isFinite(end) || end >= stat.size) end = stat.size - 1;

      if (start >= stat.size) {
        return res.status(416).set('Content-Range', `bytes */${stat.size}`).end();
      }

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(full, { start, end }).pipe(res);
    } else {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(full).pipe(res);
    }
  } catch (e) {
    console.error('[media] stream error:', e);
    res.status(500).end();
  }
});

function mediaPath(relativeFilename) {
  return `/api/media/${relativeFilename}`;
}

/* ------------------ New: newest generated video helper ------------------ */
router.get('/generated-latest', (req, res) => {
  housekeeping();
  try {
    const dir = ensureGeneratedDir();
    let bestFile = null;
    let bestMtime = 0;

    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (!f.toLowerCase().endsWith('.mp4')) continue;
        const full = path.join(dir, f);
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        if (!st.isFile?.()) continue;
        if (st.mtimeMs > bestMtime) {
          bestMtime = st.mtimeMs;
          bestFile = f;
        }
      }
    } catch (e) {
      console.warn('[generated-latest] readdir failed:', e.message);
    }

    // Nothing ready yet — this is NOT an error, frontend will keep polling
    if (!bestFile) {
      return res.json({
        url: null,
        absoluteUrl: null,
        filename: null,
        type: null,
        ready: false,
      });
    }

    const url = mediaPath(bestFile);
    const base =
      process.env.PUBLIC_BASE_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      '';
    const absoluteUrl = base ? new URL(url, base).toString() : url;

    return res.json({
      url,
      absoluteUrl,
      filename: bestFile,
      type: 'video/mp4',
      ready: true,
    });
  } catch (e) {
    console.error('[generated-latest] error:', e);
    return res.status(500).json({
      error: 'internal_error',
      message: e.message || 'failed',
    });
  }
});

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

/* ---------- CTA normalization + variants ---------- */
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

/* ---------- Coherent subline (7–9 words) via GPT, with fallbacks ---------- */
async function getCoherentSubline(answers = {}, category = 'generic', seed = '') {
  function _hash32(str = '') { let h = 2166136261 >>> 0; for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619);} return h>>>0; }
  function _rng(s=''){ let h=_hash32(String(s||'')); return ()=>{ h=(h+0x6D2B79F5)>>>0; let t=Math.imul(h^(h>>>15),1|h); t^=t+Math.imul(t^(t>>>7),61|t); t=(t^(t>>>14))>>>0; return t/4294967296; }; }
  const rnd = _rng(seed || (Date.now()+':subline'));

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

  function polishTail(line='') {
    let s = clean(line);
    s = s.replace(/\b(\w+)\s+\1\b/g, '$1');
    s = s.replace(/\b(daily|always|now|today|tonight)\s*$/i, '');
    s = s.replace(/\b(wear|use|shop|enjoy|appreciate|love|choose)\s+daily\b$/i, '$1');
    s = s.replace(/\beveryday\s*$/i, '');
    s = s.replace(/\bfashion\s+(daily|always)\b$/i, 'fashion');
    s = s.replace(/\b(and|with|for|to|of|in|on|at|by)\s*$/i, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }
  function ensure7to9(line='') {
    let words = clean(line).split(' ').filter(Boolean);
    const safeTails = [['built','to','last'],['made','simple'],['for','busy','days']];
    while (words.length > 9) words.pop();
    words = trimEnd(words);
    while (words.length < 7) {
      const t = safeTails[Math.floor(rnd()*safeTails.length)];
      for (const w of t) if (words.length < 9) words.push(w);
      words = trimEnd(words);
    }
    return sentenceCase(words.join(' '));
  }

  const MAP = {
    fashion: ['Modern fashion built for everyday wear','Natural materials for everyday wear made simple','Simple pieces built to last every day'],
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

  const productTerms  = takeTerms(answers.productType || answers.topic || answers.title || '');
  const benefitTerms  = takeTerms(answers.mainBenefit || answers.description || '');
  const audienceTerms = takeTerms(answers.audience || answers.target || answers.customer || '', 2);
  const locationTerm  = takeTerms(answers.location || answers.city || answers.region || '', 1)[0] || '';

  let productHead = productTerms[0] || '';
  if ((category||'').toLowerCase() === 'fashion' && !/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear|clothing|fashion/i.test(productHead)) {
    productHead = 'fashion';
  }
  if (productHead === 'quality') productHead = 'products';

  const cues = ['use “built for”, everyday tone','use “made for”, utility tone','use “designed for”, comfort tone','use “crafted for”, style tone'];
  const cue = cues[Math.floor(rnd()*cues.length)];

  let line = '';
  try {
    const system = [
      "You are SmartMark's subline composer.",
      "Write ONE ad subline of 7–9 words, sentence case, plain language.",
      "Must be coherent English. No buzzwords. No domains.",
      "Avoid ending with fillers like: daily, always, now, today, tonight.",
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
      temperature: 0.40,
      max_tokens: 24,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
    });
    line = (r.choices?.[0]?.message?.content || '').trim().replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g,'');
  } catch {}

  if (!line) {
    const arr = MAP[category] || MAP.generic;
    line = arr[Math.floor(rnd()*arr.length)];
  }

  line = line.replace(/\bfashion modern\b/gi, 'modern fashion');
  line = polishTail(line);
  const wc = clean(line).split(' ').filter(Boolean).length;
  if (wc < 7) line = ensure7to9(line);
  line = polishTail(line);
  return sentenceCase(line);
}

/* ---------- required helpers for subline + SVG ---------- */
function escSVG2(s='') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}
function estWidthSerif2(text, fs, letterSpacing = 0) {
  const t = String(text || ''), n = t.length || 1;
  return n * fs * 0.54 + Math.max(0, n - 1) * letterSpacing * fs;
}
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
function safeUnlink(p) { try { fs.unlinkSync(p); } catch {} }
function cleanupMany(paths = []) { for (const p of paths) safeUnlink(p); }


/* --- CTA pill (pure black, white text; same geometry) --- */
function pillBtn(cx, cy, label, fs = 34, _glowRGB = '0,0,0', _glowOpacity = 0.28, _midLum = 140) {
  const txt = normalizeCTA(label || 'LEARN MORE');
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
        ${escSVG2(txt)}
      </text>
    </g>`;
}

/* === GLASS (real blur) + serif text — matches your screenshot === */

const SERIF = `'Times New Roman', Times, serif`;

/* ---------- SOLID BLACK CTA (modern rounded-square) ---------- */
function btnSolidDark(cx, cy, label, fs = 32) {
  const txt = normalizeCTA(label || 'LEARN MORE');
  const padX = 28;
  const estTextW = Math.round(txt.length * fs * 0.60);
  const w = Math.max(200, Math.min(estTextW + padX * 2, 980));
  const h = Math.max(56, fs + 22);
  const r = Math.min(14, Math.round(h * 0.22));
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);

  return `
    <g>
      <rect x="${x-2}" y="${y-2}" width="${w+4}" height="${h+4}" rx="${r+2}" fill="#000000" opacity="0.30"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#000000" opacity="0.92" />
      <rect x="${x+0.5}" y="${y+0.5}" width="${w-1}" height="${h-1}" rx="${r-1}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="1" />
      <text x="${cx}" y="${y + h/2}" text-anchor="middle" dominant-baseline="middle"
            font-family=${JSON.stringify(SERIF)} font-size="${fs}" font-weight="700"
            fill="#FFFFFF" style="letter-spacing:0.10em">${escSVG2(txt)}</text>
    </g>`;
}

/* === REAL-GLASS overlay — slightly smaller type, extended subline, solid CTA === */
function svgOverlayCreative({ W, H, title, subline, cta, metrics, baseImage }) {
  const SAFE_PAD = 24;
  const maxW = W - SAFE_PAD * 2;
  const R = 18;

  const FUDGE = 1.18, MIN_INNER_GAP = 12;
  function measureSerifWidth(txt, fs, tracking = 0.06) {
    return Math.max(1, estWidthSerif(txt, fs, tracking) * FUDGE);
  }
  function settleBlock({ text, fsStart, fsMin, tracking, padXFactor, padYFactor }) {
    let fs = fsStart, padX, padY, textW, w, h;
    const recompute = () => {
      padX = Math.round(Math.max(26, fs * padXFactor));
      padY = Math.round(Math.max(10, fs * padYFactor));
      textW = measureSerifWidth(text, fs, tracking);
      w = textW + padX * 2 + MIN_INNER_GAP * 2;
      h = Math.max(48, fs + padY * 2);
    };
    recompute();
    while (w > maxW && fs > fsMin) { fs -= 2; recompute(); }
    const x = Math.round((W - Math.min(w, maxW)) / 2);
    return { fs, padX, padY, textW, w: Math.min(w, maxW), h, x };
  }

  title = String(title || '').toUpperCase();
  const headline = settleBlock({
    text: title, fsStart: 72, fsMin: 34, tracking: 0.06, padXFactor: 0.66, padYFactor: 0.20
  });
  const hlCenterY = 148;
  const hlRectY   = Math.round(hlCenterY - headline.h/2);

  let sub = settleBlock({
    text: String(subline || ''), fsStart: 58, fsMin: 28, tracking: 0.03, padXFactor: 0.62, padYFactor: 0.20
  });
  const SUB_MIN_W = Math.round(maxW * 0.86);
  if (sub.w < SUB_MIN_W) { sub.w = SUB_MIN_W; sub.x = Math.round((W - sub.w) / 2); }
  const subRectY   = Math.round(hlRectY + headline.h + 58);
  const subCenterY = subRectY + Math.round(sub.h/2);

  const ctaY = Math.round(subCenterY + sub.fs + 92);

  const midLum = metrics?.midLum ?? 140;
  const avg    = metrics?.avgRGB || { r: 64, g: 64, b: 64 };
  const useDark     = midLum >= 188;
  const textFill    = useDark ? '#111111' : '#FFFFFF';
  const textOutline = useDark ? '#FFFFFF' : '#000000';
  const tintRGB     = `rgb(${avg.r},${avg.g},${avg.b})`;

  const chosenCTA = cleanCTA(cta, `${title}|${subline}`);

  const CHIP_TINT = useDark ? 0.08 : 0.12;
  const BLUR_H = 10, BLUR_S = 9;
  const RIM_LIGHT = 0.18;
  const RIM_DARK  = 0.12;

  return `
  <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <image id="bg" href="${baseImage}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
      <clipPath id="clipHl"><rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${headline.h}" rx="${R}"/></clipPath>
      <clipPath id="clipSub"><rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${sub.h}" rx="${R}"/></clipPath>
      <filter id="blurHl" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${BLUR_H}"/></filter>
      <filter id="blurSub" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${BLUR_S}"/></filter>
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

    <rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,0.10)"/>

    <g pointer-events="none">
      <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="24" fill="none" stroke="#000" stroke-opacity="0.14" stroke-width="8"/>
      <rect x="14" y="14" width="${W-28}" height="${H-28}" rx="20" fill="none" stroke="#fff" stroke-opacity="0.25" stroke-width="2"/>
      <rect x="22" y="22" width="${W-44}" height="${H-44}" rx="18" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1"/>
    </g>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)" opacity="0.22"/>

    <g clip-path="url(#clipHl)">
      <use href="#bg" filter="url(#blurHl)"/>
      <rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${headline.h}" rx="${R}"
            fill="${tintRGB}" opacity="${CHIP_TINT}"/>
      <rect x="${headline.x}" y="${hlRectY}" width="${headline.w}" height="${Math.max(12, Math.round(headline.h*0.42))}" rx="${R}"
            fill="url(#chipHi)" opacity="0.96"/>
      <rect x="${headline.x+9}" y="${hlRectY+6}" width="${headline.w-18}" height="${Math.max(2, Math.round(headline.h*0.08))}" rx="${Math.max(2, Math.round(R*0.35))}"
            fill="url(#spec)" opacity="0.50"/>
    </g>
    <rect x="${headline.x+0.5}" y="${hlRectY+0.5}" width="${headline.w-1}" height="${headline.h-1}" rx="${R-0.5}"
          fill="none" stroke="rgba(255,255,255,${RIM_LIGHT})" stroke-width="0.6"/>
    <rect x="${headline.x+1}" y="${hlRectY+1}" width="${headline.w-2}" height="${headline.h-2}" rx="${R-1}"
          fill="none" stroke="rgba(0,0,0,${RIM_DARK})" stroke-width="0.5" opacity="0.28"/>

    <text x="${W/2}" y="${hlRectY + Math.round(headline.h/2)}"
          text-anchor="middle" dominant-baseline="middle"
          font-family=${JSON.stringify(SERIF)} font-size="${headline.fs}" font-weight="700"
          fill="${useDark ? '#111' : '#fff'}" style="paint-order: stroke; stroke:${useDark ? '#fff' : '#000'}; stroke-width:1.30; letter-spacing:0.10em">
      ${escSVG2(title)}
    </text>

    <g clip-path="url(#clipSub)">
      <use href="#bg" filter="url(#blurSub)"/>
      <rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${sub.h}" rx="${R}"
            fill="${tintRGB}" opacity="${CHIP_TINT}"/>
      <rect x="${sub.x}" y="${subRectY}" width="${sub.w}" height="${Math.max(10, Math.round(sub.h*0.40))}" rx="${R}" fill="url(#chipHi)"/>
      <rect x="${sub.x+9}" y="${subRectY+6}" width="${sub.w-18}" height="${Math.max(2, Math.round(sub.h*0.08))}" rx="${Math.max(2, Math.round(R*0.35))}"
            fill="url(#spec)" opacity="0.50"/>
    </g>
    <rect x="${sub.x+0.5}" y="${subRectY+0.5}" width="${sub.w-1}" height="${sub.h-1}" rx="${R-0.5}"
          fill="none" stroke="rgba(255,255,255,${RIM_LIGHT})" stroke-width="0.6"/>
    <rect x="${sub.x+1}" y="${subRectY+1}" width="${sub.w-2}" height="${sub.h-2}" rx="${R-1}"
          fill="none" stroke="rgba(0,0,0,${RIM_DARK})" stroke-width="0.5" opacity="0.28"/>

    <text x="${W/2}" y="${subRectY + Math.round(sub.h/2)}"
          text-anchor="middle" dominant-baseline="middle"
          font-family=${JSON.stringify(SERIF)} font-size="${sub.fs}" font-weight="700"
          fill="${useDark ? '#111' : '#fff'}"
          style="paint-order: stroke; stroke:${useDark ? '#000' : '#fff'}; stroke-width:1.10; letter-spacing:0.03em">
      ${escSVG2(subline)}
    </text>

    ${btnSolidDark(W/2, Math.round(subCenterY + sub.fs + 92), cleanCTA('LEARN MORE'), 30)}
  </svg>`;
} // <-- corrected/closed brace


/* ---------- Local craftSubline (fallback) ---------- */
function craftSubline(answers = {}, category = 'generic', seed = '') {
  function _hash32(str = '') { let h = 2166136261 >>> 0; for (let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }
  function _rng(s=''){ let h=_hash32(s); return ()=>{ h=(h+0x6D2B79F5)>>>0; let t=Math.imul(h^(h>>>15),61|h); t^=t+Math.imul(t^(t>>>7),61|t); t=(t^(t>>>14))>>>0; return t/4294967296; }; }
  const rnd = _rng(`${seed}|${category}|${answers.businessName||''}|${answers.mainBenefit||''}|${answers.description||''}`);
  const sentenceCase = (s='') => { s=String(s).toLowerCase().replace(/\s+/g,' ').trim(); return s ? s[0].toUpperCase()+s.slice(1) : s; };
  const clean = (s='') => String(s).replace(/https?:\/\/\S+/g,' ').replace(/[^\w\s'-]/g,' ').replace(/\b(best|premium|luxury|#1|guarantee|perfect|revolutionary|magic|cheap|fastest|ultimate|our|we)\b/gi,' ').replace(/\s+/g,' ').trim().toLowerCase();
  const STOP = new Set(['and','or','the','a','an','of','to','in','on','with','for','by','your','you','is','are','at']);
  const ENDSTOP = new Set(['and','with','for','to','of','in','on','at','by']);
  const trimEnd = (arr)=>{ while(arr.length && ENDSTOP.has(arr[arr.length-1])) arr.pop(); return arr; };
  const takeTerms = (src='', max=3) => {
    const words = clean(src).split(' ').filter(Boolean).filter(w=>!STOP.has(w));
    return words.slice(0, Math.max(1, Math.min(max, words.length)));
  };

  const productTerms = takeTerms(answers.productType || answers.topic || answers.title || '');
  const benefitTerms = takeTerms(answers.mainBenefit || answers.description || '');
  const audienceTerms= takeTerms(answers.audience || answers.target || answers.customer || '', 2);
  const diffTerms    = takeTerms(answers.differentiator || answers.whyUs || '', 3);
  const locationTerm = takeTerms(answers.location || answers.city || answers.region || '', 1)[0] || '';
  const timeClaimRaw = String(answers.timeClaim || answers.promise || '').match(/\b\d+\s*(minutes?|hours?|days?)\b/i);
  const timeClaim    = timeClaimRaw ? timeClaimRaw[0].toLowerCase() : '';

  let productHead = productTerms[0] || '';
  if (category === 'fashion') {
    if (!/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear/i.test(productHead)) productHead = 'clothing';
  }
  if (productHead === 'quality') productHead = 'products';
  const benefitPhrase = benefitTerms.join(' ').replace(/\bquality\b/gi,'').trim();
  const audiencePhrase= audienceTerms.join(' ').trim();
  const diffPhrase    = diffTerms.join(' ').trim();

  const T = [
    () => (benefitPhrase && audiencePhrase) && `${benefitPhrase} for ${audiencePhrase} every day`,
    () => (benefitPhrase && locationTerm)  && `${benefitPhrase} for ${locationTerm} locals daily`,
    () => (productHead && benefitPhrase)   && `${benefitPhrase} built into ${productHead} essentials`,
    () => (productHead && diffPhrase)      && `${productHead} with ${diffPhrase} for daily use`,
    () => (productHead && timeClaim)       && `${productHead} set up in just ${timeClaim}`,
    () =>  benefitPhrase                    && `${benefitPhrase} made simple for everyday use`,
    () =>  productHead                      && `${productHead} made simple for everyday wear`,
  ];
  let line = '';
  for (const f of T) { const c = f(); if (c && /\S/.test(c)) { line = c; break; } }
  if (!line) {
    const FALL = {
      fashion: ['Natural materials for everyday wear made simple','Simple pieces built to last every day','Comfortable fits with clean easy style'],
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
  let words = clean(line).split(' ').filter(Boolean);
  const tails = [['every','day'],['made','simple'],['with','less','hassle'],['for','busy','days'],['built','to','last']];
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

  let subline = 'Made for everyday use with less hassle';
  try { subline = await getCoherentSubline(answers, category); }
  catch (e) { try { subline = craftSubline(answers, category, seed) || subline; } catch {} }

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
const { spawn } = require('child_process');
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
    const line = sentences[i].replace(/['\\:]/g, '').trim();
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
      `:fontsize=34` +                 // ↓ smaller font (was 38)
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




/* ================= end helpers ================= */

/* ============================ VIDEO GENERATION (3–4 clips, ~18s) ============================ */

/* Pexels video + photo fetchers */
async function fetchPexelsVideos(keyword, want = 8) {
  if (!PEXELS_API_KEY) return [];
  try {
    const r = await ax.get('https://api.pexels.com/videos/search', {
      headers: { Authorization: PEXELS_API_KEY },
      params: {
        query: keyword || 'product',
        per_page: Math.max(16, want * 3),
        orientation: 'landscape',
      },
      timeout: 12000,
    });
    const vids = r.data?.videos || [];
    const pick = [];
    for (const v of vids) {
      const files = Array.isArray(v.video_files) ? v.video_files : [];
      const f =
        files.find((f) => (f.height || 0) >= 720 && /mp4/i.test(f.file_type || '')) ||
        files.find((f) => f.link);
      if (f?.link) pick.push({ url: f.link, id: v.id, dur: v.duration || 0 });
      if (pick.length >= want) break;
    }
    console.log('[pexels] videos picked:', pick.length, 'kw=', keyword);
    return pick;
  } catch (e) {
    console.warn('[pexels] video search fail:', e.message);
    return [];
  }
}

async function fetchPexelsPhotos(keyword, want = 8) {
  if (!PEXELS_API_KEY) return [];
  try {
    const r = await ax.get('https://api.pexels.com/v1/search', {
      headers: { Authorization: PEXELS_API_KEY },
      params: {
        query: keyword || 'product',
        per_page: Math.max(16, want * 3),
      },
      timeout: 12000,
    });
    const photos = r.data?.photos || [];
    const pick = [];
    for (const p of photos) {
      const src = p?.src || {};
      const u = src.landscape || src.large2x || src.large || src.original;
      if (u) pick.push({ url: u, id: p.id });
      if (pick.length >= want) break;
    }
    return pick;
  } catch {
    return [];
  }
}

/** Ensure we have 3–4 clips (duplicate with different offsets if needed) */
function buildVirtualPlan(rawClips, variant = 0) {
  const uniq = Array.isArray(rawClips) ? rawClips.filter(Boolean) : [];
  const baseCount = uniq.length;
  if (!baseCount) {
    console.warn('[video] no Pexels clips available for virtual plan');
    return [];
  }
  const want = baseCount >= 4 ? 4 : Math.max(3, Math.min(4, baseCount));
  const out = [];
  for (let i = 0; i < want; i++) {
    const base = uniq[i % baseCount];
    out.push({ url: base.url, seed: `${variant}-${i}-${Date.now()}` });
  }
  return out;
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
// make this mutable so we can set it from the VO duration
let OUTLEN = Math.max(15, Math.min(20, Number(targetSec || 18.5)));

  const tmpToDelete = [];

  try {
    // --- Voiceover
    const { path: voicePath } = await synthTTS(script);
    tmpToDelete.push(voicePath);
    let voiceDur = await ffprobeDuration(voicePath);
    if (!Number.isFinite(voiceDur) || voiceDur <= 0) voiceDur = 14.0;

    // Optional slowdown for readability (e.g., TTS_SLOWDOWN=0.92)
    const ATEMPO = (Number.isFinite(TTS_SLOWDOWN) && TTS_SLOWDOWN > 0) ? TTS_SLOWDOWN : 1.0;

    // Effective spoken length after slowdown/speedup
const effVoice = voiceDur / ATEMPO;

// Final video should outlast VO by ~2s (clamped to 15–20s range)
OUTLEN = Math.max(15, Math.min(20, effVoice + 2));


    // --- Plan 3–4 segments (hard cuts only)
    const plan = buildVirtualPlan(clips || [], variant);
    if (!plan.length) throw new Error('No clips in plan');

    const perClip = Math.max(3.6, OUTLEN / plan.length);

    // Build normalized segments (crop, fps, length)
    const segs = [];
    for (let i = 0; i < plan.length; i++) {
      const srcUrl = plan[i].url;
      const tmpIn = await downloadToTmp(srcUrl, '.mp4'); tmpToDelete.push(tmpIn);

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
          '-y','-nostdin','-loglevel','error',
          ...(ss > 0 ? ['-ss', ss.toFixed(2)] : []),
          '-i', tmpIn,
          '-t', perClip.toFixed(2),
          '-vf', vf,
          '-an',
          '-c:v','libx264','-preset','veryfast','-crf','27',
          '-pix_fmt','yuv420p','-r', String(FPS),
          outSeg
        ],
        {},
        180000
      );

      segs.push(outSeg);
      safeUnlink(tmpIn);
    }

    // --- Concat to [vcat]
    const vInputs = segs.map((_, i) => `[${i}:v]`).join('');
    const vParts  = segs.flatMap((p) => ['-i', p]);
    const concatChain = `${vInputs}concat=n=${segs.length}:v=1:a=0[vcat]`;

    // --- Subtitles built from the ORIGINAL SCRIPT (no dropped words, keeps % and punctuation)
let displayDur = voiceDur;                   // measured TTS length
if (ATEMPO !== 1.0) displayDur = voiceDur / ATEMPO;

// Turn the exact script into timed tokens and flex-chunk → ASS
let words = wordsFromScript(script, displayDur);
const tiles = chunkWordsFlexible(words, {
  maxChars: 26,
  maxDur: 2.4,
});


const ass = buildAssFromChunks(tiles, {
  W, H,
  fontName: "DejaVu Sans",
  fontSize: 42,
  marginV: 72,
});

const escAss = escapeFilterPath(ass);


    // --- Audio graph (voice + optional bgm)
    const voiceIdx    = segs.length;
    const audioInputs = ['-i', voicePath];
    let musicArgs = [], musicIdx = null;
    if (musicPath) { musicArgs = ['-i', musicPath]; musicIdx = voiceIdx + 1; }

   const voiceFilt = `[${voiceIdx}:a]atempo=${ATEMPO.toFixed(3)},aresample=48000[vo]`;
const audioMix =
  musicIdx !== null
    // stop BGM when VO ends (quiet tail handled by video duration)
    ? `[${musicIdx}:a]volume=0.18[bgm];${voiceFilt};[bgm][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    : `${voiceFilt};[vo]anull[aout]`;




 const subs =
  `[vcat]subtitles='${escAss}':force_style=` +
  `'Fontname=DejaVu Sans,Fontsize=32,PrimaryColour=&H00FFFFFF,` +
  `OutlineColour=&H00000000,BackColour=&H55000000,BorderStyle=3,` +  // ~33% black
  `Outline=4,Shadow=0,Bold=0,Alignment=2,MarginV=84'[vsub]`;







    const fc = [concatChain, subs, audioMix].join(';');

    const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp4`);
    await execFile(
      'ffmpeg',
      [
        '-y','-nostdin','-loglevel','error',
        ...vParts,
        ...audioInputs,
        ...musicArgs,
        '-filter_complex', fc,
       '-map', '[vsub]',
'-map', '[aout]',
'-t', OUTLEN.toFixed(2),
// no -shortest: we want the video to outlast audio by ~2s
'-c:v','libx264','-preset','veryfast','-crf','26',

        '-pix_fmt','yuv420p','-r', String(FPS),
        '-c:a','aac','-b:a','128k',
        '-movflags','+faststart',
        outPath
      ],
      {},
      180000
    );

    // Clean up
    cleanupMany([...segs, voicePath, ass]);
    return { outPath, duration: OUTLEN };
  } catch (e) {
    cleanupMany(tmpToDelete);
    throw e;
  }
}

const subFilter = subtitleFilterSquare({
  fontSize: 34,   // tweak smaller/larger here
  boxAlpha: 0.35  // 0.25–0.40 looks great
});

// example: append AFTER your montage step
const filterComplex = [
  // ... your existing montage chain that outputs [vFinal] and your audio label e.g. [aMix]
  `[vFinal]${subFilter}[vOut]`
].join(";");



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
  const OUTLEN = Math.max(18, Math.min(20, Number(targetSec || 18.5)));
  const tmpToDelete = [];

  try {
    const { path: voicePath } = await synthTTS(script);
    tmpToDelete.push(voicePath);
    let voiceDur = await ffprobeDuration(voicePath);
    if (!Number.isFinite(voiceDur) || voiceDur <= 0) voiceDur = 14.0;
    const ATEMPO = (TTS_SLOWDOWN > 0 && TTS_SLOWDOWN < 1) ? TTS_SLOWDOWN : 1.0;


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
    const segs = [];
    for (let i = 0; i < chosen.length; i++) {
      const img = chosen[i];
      const outSeg = path.join(ensureGeneratedDir(), `${uuidv4()}-seg.mp4`);
      const vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`;
      await execFile(
        'ffmpeg',
        [
          '-y','-nostdin','-loglevel','error',
          '-loop','1','-t', perClip.toFixed(2), '-i', img,
          '-vf', vf,
          '-an',
          '-c:v','libx264','-preset','veryfast','-crf','27',
          '-pix_fmt','yuv420p','-r', String(FPS),
          outSeg
        ],
        {},
        180000
      );
      segs.push(outSeg);
    }

    const vInputs = segs.map((_, i) => `[${i}:v]`).join('');
    const vParts  = segs.flatMap((p) => ['-i', p]);
    const concatChain = `${vInputs}concat=n=${segs.length}:v=1:a=0[vcat]`;

// --- Subtitles built from the ORIGINAL SCRIPT (no dropped words, keeps % and punctuation)
let displayDur = voiceDur;                   // base on actual VO length
if (TTS_SLOWDOWN > 0 && TTS_SLOWDOWN < 1) {
  // atempo slows playback, so timeline duration increases
  displayDur = voiceDur / TTS_SLOWDOWN;
}

// Build exact word list from the script, then flex-chunk → ASS
let words = wordsFromScript(script, displayDur);
const tiles = chunkWordsFlexible(words, {
  maxChars: 24,   // visual width limiter (tweak 22–28 if you want)
  maxDur: 2.4,    // max on-screen time per tile
});

const ass = buildAssFromChunks(tiles, {
  W, H,
  fontName: "DejaVu Sans",
  fontSize: 42,  // slightly smaller
  marginV: 72,   // a hair lower from bottom
});

const escAss = escapeFilterPath(ass);

// --- Audio graph (voice + optional bgm)
const voiceIdx    = segs.length;
const audioInputs = ['-i', voicePath];
let musicArgs = [], musicIdx = null;
if (musicPath) { musicArgs = ['-i', musicPath]; musicIdx = voiceIdx + 1; }

const voiceFilt = `[${voiceIdx}:a]atempo=${ATEMPO.toFixed(3)},aresample=48000[vo]`;
const audioMix =
  musicIdx !== null
    // mix but end when VO ends; gives ~2s silent tail in final mux
    ? `[${musicIdx}:a]volume=0.18[bgm];${voiceFilt};[bgm][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    : `${voiceFilt};[vo]anull[aout]`;


// --- Burn ASS subs: [vcat]subtitles='file.ass' -> [vsub]
// --- Burn ASS subs: [vcat]subtitles='file.ass' -> [vsub]
const subs =
  `[vcat]subtitles='${escAss}':force_style=` +
  `'Fontname=DejaVu Sans,Fontsize=32,PrimaryColour=&H00FFFFFF,` +
  `OutlineColour=&H00000000,BackColour=&H99000000,BorderStyle=3,` +  // ~60% transparent black box
  `Outline=4,Shadow=0,Bold=0,Alignment=2,MarginV=72'[vsub]`;
    
  


const fc = [concatChain, subs, audioMix].join(';');

const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp4`);
await execFile(
  'ffmpeg',
  [
    '-y','-nostdin','-loglevel','error',
    ...vParts,
    ...audioInputs,
    ...musicArgs,
    '-filter_complex', fc,
    '-map', '[vsub]',
    '-map', '[aout]',
   '-t', OUTLEN.toFixed(2),
// no -shortest: we want video to outlast audio by ~2s
    '-c:v','libx264','-preset','veryfast','-crf','26',
    '-pix_fmt','yuv420p','-r', String(FPS),
    '-c:a','aac','-b:a','128k',
    '-movflags','+faststart',
    outPath
  ],
  {},
  180000
);

 // success cleanup
cleanupMany([...segs, voicePath, ass]);
return { outPath, duration: OUTLEN };
} catch (e) {
  // best-effort cleanup on failure too
  cleanupMany([...segs, voicePath, ass, ...tmpToDelete].filter(Boolean));
  throw e; // important so the caller/Express sees the failure
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
  const keyword = getImageKeyword(industry, url, answers);
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

  // Media
  let clips = await fetchPexelsVideos(keyword, 8);
  if (!clips.length) clips = await fetchPexelsVideos('product shopping', 8);

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
// Synchronous video generation: 3–4 Pexels clips + TTS + subtitles (~18s)
router.post("/generate-video-ad", async (req, res) => {
  try {
    const body = req.body || {};
    const answers = body.answers || {};
    const url = body.url || "";

    // keyword by industry (kept from your logic)
    const industry = (answers.industry || "").toLowerCase();
    let keyword = "small business";
    if (industry.includes("restaurant") || industry.includes("food")) keyword = "restaurant food";
    else if (industry.includes("fashion") || industry.includes("clothing")) keyword = "fashion model";
    else if (industry.includes("beauty") || industry.includes("salon")) keyword = "beauty spa";

    // 1) clips (needs PEXELS_API_KEY)
    let clips = await fetchPexelsVideos(keyword, 8);
    if (!clips.length) clips = await fetchPexelsVideos("product shopping", 8);
    if (!clips.length) return res.status(500).json({ ok:false, error:"No stock clips found from Pexels." });

    // 2) script
    const script = await generateVideoScriptFromAnswers(answers);

    // 3) optional BGM
    const bgm = await prepareBgm();

    // 4) build one ~18.5s variant with xfade + ASS karaoke (word-by-word)
    const v = await makeVideoVariant({
      clips,
      script,
      variant: 0,
      targetSec: 18.5,
      tailPadSec: 2,
      musicPath: bgm,
    });

    const rel = path.basename(v.outPath);
    const urlRel = `/api/media/${rel}`;
    const abs = absolutePublicUrl(urlRel);

    // persist to recent assets (so your pollers/dashboards can see it)
    await saveAsset({
      req,
      kind: 'video',
      url: urlRel,
      absoluteUrl: abs,
      meta: { variant: 0, keyword, hasSubtitles: true, targetSec: v.duration }
    });

    return res.json({ ok: true, url: urlRel, absoluteUrl: abs, filename: rel, script });
  } catch (err) {
    console.error("[generate-video-ad] error:", err);
    return res.status(500).json({ ok:false, error: err?.message || "Video generation failed" });
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




/* --------------------- IMAGE: search + overlay (TWO variations) --------------------- */
router.post('/generate-image-from-prompt', heavyLimiter, async (req, res) => {
  housekeeping();

  try {
    if (typeof res.setTimeout === 'function') res.setTimeout(65000);
    if (typeof req.setTimeout === 'function') req.setTimeout(65000);
  } catch {}

  try {
    const { regenerateToken = '' } = req.body || {};
    const top       = req.body || {};
    const answers   = top.answers || top;
    const url       = answers.url || top.url || '';
    const industry  = answers.industry || top.industry || '';
    const category  = resolveCategory(answers || {});
    const keyword   = getImageKeyword(industry, url, answers) || 'ecommerce products';

    // Compose one overlay image and persist it
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
          req, // NOTE: saveAsset expects an object with { req, kind, ... }
          kind: 'image',
          url: publicUrl,
          absoluteUrl,
          meta: { keyword, overlayText: ctaHint, headlineHint, category, glass: true, ...meta },
        });

        return publicUrl;
      } catch (err) {
        // Frame-only fallback
        try {
          const W = 1200, H = 628;
          const imgRes = await ax.get(imgUrl, { responseType: 'arraybuffer', timeout: 12000 });
          const baseBuf = await sharp(imgRes.data)
            .resize(W, H, { fit: 'cover' })
            .jpeg({ quality: 92 })
            .toBuffer();

          const frameSvg = Buffer.from(
            `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
              <rect x="10" y="10" width="${W-20}" height="${H-20}" rx="18" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="8"/>
              <rect x="14" y="14" width="${W-28}" height="${H-28}" rx="16" fill="none" stroke="rgba(255,255,255,0.24)" stroke-width="2"/>
            </svg>`
          );

          const file = `${uuidv4()}.jpg`;
          await sharp(baseBuf)
            .composite([{ input: frameSvg, top: 0, left: 0 }])
            .jpeg({ quality: 90 })
            .toFile(path.join(ensureGeneratedDir(), file));

          return mediaPath(file);
        } catch {
          throw err;
        }
      }
    };

    const urls = [];
    const absUrls = [];

    if (PEXELS_API_KEY) {
      let photos = [];
      try {
        const r = await ax.get('https://api.pexels.com/v1/search', {
          headers: { Authorization: PEXELS_API_KEY },
          params:  { query: keyword, per_page: 12 },
          timeout: 12000,
        });
        photos = Array.isArray(r.data?.photos) ? r.data.photos : [];
      } catch {
        photos = [];
      }

      if (!photos.length) throw new Error('pexels-empty');

      const seed = regenerateToken || answers?.businessName || keyword || Date.now();
      let idxHash = 0;
      for (const c of String(seed)) idxHash = (idxHash * 31 + c.charCodeAt(0)) >>> 0;

      const picks = new Set();
      for (let i = 0; i < photos.length && picks.size < 2; i++) {
        const idx = (idxHash + i * 7) % photos.length;
        picks.add(idx);
      }

      for (const idx of picks) {
        const img = photos[idx];
        const baseUrl = img?.src?.original || img?.src?.large2x || img?.src?.large;
        if (!baseUrl) continue;
        const u = await compose(baseUrl, `${seed}_${idx}`, { src: 'pexels', idx });
        urls.push(u);
        absUrls.push(absolutePublicUrl(u));
      }
    } else {
      const q = encodeURIComponent(keyword || 'ecommerce products');
      for (let i = 0; i < 2; i++) {
        const sig = encodeURIComponent((regenerateToken || 'seed') + '_' + i);
        const baseUrl = `https://source.unsplash.com/1200x628/?${q}&sig=${sig}`;
        const u = await compose(baseUrl, `${regenerateToken || 'seed'}_${i}`, { src: 'unsplash-keyless', index: i });
        urls.push(u);
        absUrls.push(absolutePublicUrl(u));
      }
    }

    // Nothing produced? Return 204 so the client can retry gracefully.
    if (!urls.length) return res.status(204).end();

    return res.json({
      imageUrl: urls[0] || '',
      absoluteImageUrl: absUrls[0] || '',
      keyword,
      totalResults: urls.length,
      usedIndex: 0,
      imageVariations: urls.map((u, idx) => ({ url: u, absoluteUrl: absUrls[idx] || absolutePublicUrl(u) })),
    });

  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch stock image', detail: String(e?.message || e) });
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
