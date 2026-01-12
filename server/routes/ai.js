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

// --- Alias old segment preview URLs to the actual MP4 to avoid 404s ---
// Support BOTH legacy and new route shapes, regardless of where this router is mounted.
router.get(['/media/:idSeg', '/api/media/:idSeg'], (req, res, next) => {
  const m = String(req.params.idSeg || '').match(/^([a-f0-9-]+)-seg\.mp4$/i);
  if (!m) return next();
  const id = m[1];
  return res.redirect(302, `/api/media/${id}.mp4`);
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
  const heavy = /^\/(generate-image-from-prompt|generate-video-ad|generate-campaign-assets)\b/.test(req.path);
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

// --- FAST VIDEO PROFILE (≤ 75s wall time) — quick cuts + active subs ---
const { spawn } = require("child_process");

const FAST = {
  WIDTH: 960,          // match your non-FAST pipeline (960x540)
  HEIGHT: 540,
  FPS: 24,             // keeps encode light
  PRESET: "superfast",
  CRF: "30",           // slightly higher CRF => faster/smaller
  GOP: "48",
  AUDIO_BR: "112k",
  TIMEOUT_MS: 65000,   // kill ffmpeg if it lingers (65s)
};

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

function cleanupMany(paths) {
  try {
    (paths || []).filter(Boolean).forEach(safeUnlink);
  } catch {}
}




/**
 * Build the concat part of the filter (no transitions) and normalize each clip.
 * Input streams mapping:
 *   - Inputs 0..N-1: video clips
 *   - Input N: voice (audio)
 * Returns a filter string that:
 *   1) normalizes each clip to FAST.WIDTH x FAST.HEIGHT @ FAST.FPS with a fixed duration 'per'
 *   2) concatenates them to [vcat]
 */
function buildQuickCutConcatFilter({ clipCount, per }) {
  const norm = (i) =>
    `[${i}:v]scale=${FAST.WIDTH}:${FAST.HEIGHT}:force_original_aspect_ratio=increase,` +
    `crop=${FAST.WIDTH}:${FAST.HEIGHT},fps=${FAST.FPS},trim=duration=${per.toFixed(
      2
    )},setpts=PTS-STARTPTS[v${i}]`;

  const labels = Array.from({ length: clipCount }, (_, i) => `[v${i}]`).join("");
  const concat = `${labels}concat=n=${clipCount}:v=1:a=0[vcat]`;

  return Array.from({ length: clipCount }, (_, i) => norm(i)).concat(concat).join(";");
}

/** Run ffmpeg with a single pass graph:
 *  - normalize & concat N clips -> [vcat]
 *  - overlay word-timed drawtext subs over [vcat] -> [vsub]
 *  - map audio (voice), trim/pad to target duration
 */
function runFfmpegFastQuickCutsWithSubs({
  parts,
  voicePath,
  words,          // word timings for subs
  outPath,
  totalSec,
}) {
  return new Promise((resolve, reject) => {
    const clipCount = parts.length;
    const per = Math.max(4.8, (totalSec / clipCount)); // ~3 clips → ~6.1s each @18.5s total

    // 1) concat section (no transitions) -> [vcat]
    const concatSection = buildQuickCutConcatFilter({ clipCount, per });

    // 2) subs section over [vcat] -> [vsub]
    //    Reuse your existing appearance via buildWordTimedDrawtextFilter
    const { filter: subsSection, out: subOutLabel } = buildWordTimedDrawtextFilter(
      words,
      '[vcat]',
      FAST.WIDTH,
      FAST.HEIGHT
    );

    // 3) audio: trim/pad voice to totalSec -> [aout]
    const voiceIdx = clipCount; // after N video inputs, the voice is next input
    const audioSection = `[${voiceIdx}:a]atrim=duration=${totalSec.toFixed(
      2
    )},asetpts=PTS-STARTPTS[aout]`;

    // 4) full graph
    const filterComplex = [concatSection, subsSection, audioSection].join(";");

    const args = [
      "-y",
      "-nostdin",
      "-loglevel", "error",

      // inputs: N video clips + voice
      ...parts.flatMap((p) => ["-i", p]),
      "-i", voicePath,

      "-filter_complex", filterComplex,
      "-map", subOutLabel,
      "-map", "[aout]",

      "-c:v", "libx264",
      "-preset", FAST.PRESET,
      "-tune", "fastdecode,zerolatency",
      "-crf", FAST.CRF,
      "-g", FAST.GOP,
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",

      "-c:a", "aac",
      "-b:a", FAST.AUDIO_BR,

      "-t", totalSec.toFixed(2),  // hard bound
      outPath,
    ];

    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    const killer = setTimeout(() => { try { ff.kill("SIGKILL"); } catch {} }, FAST.TIMEOUT_MS);

    ff.stderr.on("data", (d) => (err += d.toString()));
    ff.on("close", (code) => {
      clearTimeout(killer);
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}\n${err}`));
    });
    ff.on("error", (e) => { clearTimeout(killer); reject(e); });
  });
}

/**
 * FAST variant (now with QUICK CUTS + ACTIVE SUBS)
 * - downloads 3 clips locally
 * - quick concat montage (no xfade)
 * - TTS audio mapped
 * - word-chunked drawtext subtitles (same look as your main path)
 * - keeps ~18–20s bound
 */
async function makeVideoVariantFast({ clipUrls = [], script = "", targetSec = 18.5 }) {
  if (!Array.isArray(clipUrls) || clipUrls.length < 3) {
    throw new Error("FAST: need ≥ 3 clip URLs");
  }

  // 0) clamp target
  const TOTAL = Math.max(18, Math.min(20, Number(targetSec) || 18.5));

  // 1) synth voice
  const tts = await synthTTS(script);
  const voicePath = tts.path;

  // 2) derive effective voice duration (respect slowdown) for better sub timing
  let voiceDur = await ffprobeDuration(voicePath);
  if (!Number.isFinite(voiceDur) || voiceDur <= 0) voiceDur = TOTAL - 2;
  const ATEMPO = Number.isFinite(TTS_SLOWDOWN) && TTS_SLOWDOWN > 0 ? TTS_SLOWDOWN : 1.0;
  const effVoice = voiceDur / ATEMPO;

  // 3) subtitle word timings from script text (no Whisper roundtrip)
  const subtitleWords = await getSubtitleWords(voicePath, script, effVoice, ATEMPO);

  // 4) download first three clips
  const locals = [];
  try {
    for (let i = 0; i < 3; i++) {
      locals.push(await downloadToTmp(clipUrls[i], ".mp4"));
    }
  } catch (e) {
    locals.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
    try { fs.unlinkSync(voicePath); } catch {}
    throw e;
  }

  // 5) compose with quick cuts + active subs
  const outPath = path.join(ensureGeneratedDir(), `${uuidv4()}.mp4`);
  try {
    await runFfmpegFastQuickCutsWithSubs({
      parts: locals,
      voicePath,
      words: subtitleWords,
      outPath,
      totalSec: TOTAL,
    });
  } finally {
    locals.forEach((p) => { try { fs.unlinkSync(p); } catch {} });
    try { fs.unlinkSync(voicePath); } catch {}
  }

  return { outPath, duration: TOTAL };
}



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
function chunkWordsFlexible(
  words = [],
  {
    maxChars = 24,   // visual width limiter
    maxDur   = 2.4,  // cap each tile’s on-screen time
  } = {}
) {
  const safe = (Array.isArray(words) ? words : [])
    .filter(
      (w) =>
        Number.isFinite(w.start) &&
        Number.isFinite(w.end) &&
        w.end > w.start &&
        String(w.word || '').trim()
    );

  const chunks = [];
  let cur = [];
  let curChars = 0;
  let curStart = null;

  const pushChunk = () => {
    if (!cur.length) return;
    const text = cur
      .map((w) => w.word)
      .join(' ')
      .replace(/\s+([.,!?;:])/g, '$1');
    const start = curStart;
    const end = cur[cur.length - 1].end;
    chunks.push({ start, end, text });
    cur = [];
    curChars = 0;
    curStart = null;
  };

  for (let i = 0; i < safe.length; i++) {
    const w = safe[i];
    const nextDur =
      curStart === null ? w.end - w.start : w.end - curStart;
    const nextChars =
      curChars + (curChars ? 1 : 0) + w.word.length; // +1 space

    // If adding this word would overflow visual/duration constraints, close current tile first
    if (cur.length && (nextChars > maxChars || nextDur > maxDur)) {
      pushChunk();
    }

    // Start new tile if empty
    if (!cur.length) {
      curStart = w.start;
    }

    cur.push(w);
    curChars = (curChars ? curChars + 1 : 0) + w.word.length; // +1 space
  }

  if (cur.length) pushChunk();

  // === TIMING CLEANUP ===
  // 1) Remove overlaps between tiles
  for (let i = 0; i < chunks.length - 1; i++) {
    const a = chunks[i];
    const b = chunks[i + 1];

    // if next starts before current ends, split the difference
    if (b.start < a.end) {
      const mid = (a.end + b.start) / 2;
      const newEnd = Math.max(a.start + 0.05, mid - 0.02);
      const newStartNext = newEnd + 0.02;
      a.end = newEnd;
      b.start = newStartNext;
    }
  }

  // 2) Avoid big gaps (> ~0.08s) by slightly stretching previous tile
  for (let i = 0; i < chunks.length - 1; i++) {
    const a = chunks[i];
    const b = chunks[i + 1];
    if (b.start > a.end + 0.08) {
      const newEnd = b.start - 0.02;
      if (newEnd > a.start) a.end = newEnd;
    }
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
    `Style: ${styleName},${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H55000000,0,0,0,0,100,100,0,0,3,3,0,2,40,40,${marginV},1`,
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

/** Multiply all word start/end times by a factor derived from the audio tempo.
 *  audioTempo = the atempo you use in ffmpeg (e.g. 0.92).
 *  ffmpeg atempo < 1.0 => slower audio => LONGER timings => factor = 1/audioTempo.
 */
function stretchWordTimings(words = [], audioTempo = 1.0) {
  if (!Array.isArray(words) || !Number.isFinite(audioTempo) || audioTempo <= 0) {
    return words || [];
  }
  const factor = 1 / audioTempo; // e.g. atempo 0.92 -> factor ≈ 1.087

  return words.map((w) => ({
    start: Math.max(0, (w.start ?? 0) * factor),
    end:   Math.max(0.01, (w.end ?? 0.01) * factor),
    word:  String(w.word || '').trim(),
  }));
}


// Build subtitle word timings purely from the script text
// so NO words are ever dropped (e.g., "At" in "At Test Bistro").
async function getSubtitleWords(voicePath, script, displayDurSec, _atempo = 1.0) {
  try {
    let dur;

    if (Number.isFinite(displayDurSec) && displayDurSec > 0) {
      // we already passed in the effective voice length (after slowdown)
      dur = displayDurSec;
    } else {
      // fall back to actual audio duration if needed
      dur = await ffprobeDuration(voicePath);
      if (!Number.isFinite(dur) || dur <= 0) dur = 14.0;
    }

    // Evenly distribute timing over the full script
    return wordsFromScript(script, dur);
  } catch (e) {
    console.warn('[subtitles] getSubtitleWords fallback:', e?.message || e);
    const dur =
      Number.isFinite(displayDurSec) && displayDurSec > 0
        ? displayDurSec
        : 14.0;
    return wordsFromScript(script, dur);
  }
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

  const r = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  temperature: 0.35,
  max_tokens: 220,
  messages: prompt
});
const text =
  r.choices?.[0]?.message?.content?.trim() ||
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
router.get(['/generated-latest', '/api/generated-latest'], (req, res) => {

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

/* === GPT: craftAdCopyFromAnswers === */
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
    // 🔒 NEW: no hallucinated promos
    "Do NOT invent offers, discounts, shipping, returns, guarantees, or inventory claims that were not clearly provided in the inputs.",
    "If the user did not mention shipping, returns, guarantees, or inventory, you must NOT mention them at all.",
    "If no explicit promo/discount is mentioned, keep the 'offer' short and generic or empty, but do not invent percentages or 'free' anything.",
  ].join(" ");

  const schema = {
    headline: "≤ 5 words, punchy, no punctuation unless needed",
    subline: "≤ 12 words, clarifies benefit for the audience",
    cta: "2–3 words action phrase (e.g., Get Quote, Shop Now)",
    offer: "Short promo if provided; else empty string",
    bullets: "3 short bullets; sentence fragments only",
    disclaimers: "One short line or empty string",
  };

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

  // scrub helper to remove any sneaky hallucinated promises
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

  // Normalization + scrub
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
  // If your craftAdCopyFromAnswers helper signature expects (.., openai) like we added earlier, keep the second arg:
  const copy = await craftAdCopyFromAnswers(
    { industry: industry || answers.industry, businessName: answers.businessName, brand, answers },
    openai
  );

  return {
    copy,          // <-- this is what staticads.js will prefer
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

    // Build a strict "copy" map — ONLY user-provided fields, no defaults.
    const copy = {
      brand:     answers.brand || answers.businessName || '',
      headline:  answers.posterHeadline || answers.headline || '',
      subhead:   answers.subhead || answers.tagline || answers.dateRange || '',
      valueLine: answers.valueLine || answers.offer || '',
      body:      answers.body || answers.bodyCopy || answers.adCopy || answers.copy || '',
      legal:     answers.legal || answers.disclaimers || '',
      cta:       answers.cta || ''
    };

    // Prefer a user-supplied image if provided.
    const photoUrl = answers.imageUrl || imageUrl || '';

    // Generate
    let out;
    if (/^flyer_a$/i.test(template)) {
      out = await renderTemplateA_FlyerPNG({ answers });
    } else {
      // STRICT: only use what the user typed. No defaults or auto text.
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

/* === STATIC IMAGE TEMPLATES (A: Flyer, B: Poster) =========================================
   Locked visual templates for static PNG ads.
   - Template A ("flyer_a"): teal header bar, diagonal split, left checklist, right bullets,
     coverage strip w/ location pin, bottom CTA + phone; rounded corners.
   - Template B ("poster_b"): full-bleed lifestyle photo, centered white card w/ stacked headline,
     save % / limited time line / small legal, white frame + shadow; optional seasonal accent.
   Wiring:
     call via POST /api/generate-static-ad { template: "flyer_a"|"poster_b", answers, imageUrl? }
     returns a PNG saved into /api/media, persisted to DB via saveAsset().
*/

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
  // “FALL FLOORING SALE!” style
  return `${_upperSafe(raw, 18)} SALE!`;
}
function _offerLine(answers={}) {
  // e.g., "Up to 30% Off" or fallback
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
function _seasonAccentLeaves() {
  // very light corner accent (optional)
  return `
  <g opacity="0.20">
    <path d="M60,70 C90,20 130,18 170,50 C140,52 120,72 110,96 C94,92 78,82 60,70 Z" fill="#F29F05"/>
    <path d="M170,50 C220,60 240,90 220,130 C210,100 190,80 160,78 C165,68 168,58 170,50 Z" fill="#E85D04"/>
  </g>`;
}

/* ---------------- Template A: Flyer (teal header, diagonal split) ---------------- */
async function renderTemplateA_FlyerPNG({ answers = {} }) {
  const W = 1200, H = 628, R = 28;

  // Palette & type
  const colors = {
    teal: '#0d3b66',       // header
    aqua: '#e6f3f8',       // light body panel
    accent: '#ffc857',     // accent
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

  // Build SVG
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
      <!-- Header bar -->
      <rect x="0" y="0" width="${W}" height="132" fill="${colors.teal}"/>
      <text x="36" y="86" font-family="Inter,Segoe UI,Arial" font-size="46" font-weight="800" fill="${colors.textLight}">
        ${escSVG2(headline)}
      </text>
      <text x="${W-36}" y="86" font-family="Inter,Segoe UI,Arial" font-size="32" font-weight="700" fill="${colors.textLight}" text-anchor="end">
        ${escSVG2(offerLine)}
      </text>

      <!-- Diagonal split panel -->
      <path d="M0,132 L${W},132 L${W},${H} L0,${H-90} Z" fill="url(#diag)"/>

      <!-- Left column: checklist -->
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

      <!-- Right column: services -->
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

      <!-- Coverage strip -->
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

      <!-- Bottom CTA row -->
      <g transform="translate(0, ${H-86})">
        <rect x="0" y="0" width="${W}" height="86" fill="${colors.teal}" />
        <rect x="0" y="-2" width="${W}" height="2" fill="rgba(0,0,0,0.12)"/>
        <!-- CTA pill -->
        <g transform="translate(${W-260}, 43)">
          ${btnSolidDark(0, 0, cta || 'CALL NOW', 26)}
        </g>
        <text x="36" y="54" font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="#ffffff">
          ${escSVG2(phone || 'Call Today')}
        </text>
      </g>
    </g>
  </svg>`;

  // Rasterize SVG straight to PNG
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

  // background photo
  const bgUrl = imageUrl || resolveTemplateUrl({ answers });
  const imgRes = await ax.get(bgUrl, { responseType: 'arraybuffer', timeout: 12000 });
  const bgBuf = await sharp(imgRes.data)
    .resize(W, H, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  // Strict = only user text; non-strict = legacy fallbacks
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

  // centered white card
  const CARD_W = 760, CARD_H = 400; // +20 to make room for body copy
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

    <!-- full-bleed bg + subtle vignette -->
    <use href="#bg"/>
    <radialGradient id="vig" cx="50%" cy="50%" r="70%">
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.55"/>
    </radialGradient>
    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#vig)" opacity="0.22"/>

    <!-- white frame -->
    <rect x="12" y="12" width="${W-24}" height="${H-24}" rx="${R}" fill="none" stroke="#ffffff" stroke-opacity="0.92" stroke-width="3"/>

    ${strict ? '' : _seasonAccentLeaves()}

    <!-- centered white card -->
    <g filter="url(#shadow)">
      <rect x="${cardX}" y="${cardY}" width="${CARD_W}" height="${CARD_H}" rx="18" fill="#ffffff"/>
    </g>

    <!-- brand (optional) -->
    ${_maybe(brand, `
    <text x="${CX}" y="${cardY + 58}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="22" font-weight="800" fill="#0f141a" opacity="0.85">
      ${escSVG(brand)}
    </text>`)}

    <!-- big headline -->
    ${_maybe(bigHeadline, `
    <text x="${CX}" y="${cardY + 130}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="54" font-weight="900" fill="#0f141a" letter-spacing="0.04em">
      ${escSVG(bigHeadline)}
    </text>`)}

    <!-- secondary line 1 -->
    ${_maybe(secondary1, `
    <text x="${CX}" y="${cardY + 180}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="26" font-weight="700" fill="#0f141a">
      ${escSVG(secondary1)}
    </text>`)}

    <!-- secondary line 2 -->
    ${_maybe(secondary2, `
    <text x="${CX}" y="${cardY + 214}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="28" font-weight="800" fill="#0d3b66">
      ${escSVG(secondary2)}
    </text>`)}

    <!-- body/ad copy -->
    ${_maybe(body, `
    <text x="${CX}" y="${cardY + 250}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="18" font-weight="600" fill="#6b7280" opacity="0.95">
      ${escSVG(body)}
    </text>`)}

        <!-- CTA (only if present) -->
    ${_maybe(cta, pillBtn(CX, cardY + CARD_H + 56, cta, 28))}


    <!-- legal -->
    ${_maybe(legal, `
    <text x="${CX}" y="${cardY + CARD_H - 18}" text-anchor="middle"
          font-family="Inter,Segoe UI,Arial" font-size="16" font-weight="600" fill="#4b5563" opacity="0.95">
      ${escSVG(legal)}
    </text>`)}
  </svg>`;

  // Rasterize to PNG
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
    .replace(/[\u2019']/g, '')      // normalize apostrophes
    .replace(/[^A-Z0-9 ]+/g, ' ')   // strip non-alphanumerics
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

/* ---------- required helpers for subline + SVG (UPDATED) ---------- */
function escRegExp(s = '') {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}


/* ------------------------------ UTILS: conditional SVG helpers ------------------------------ */
function _nonEmpty(s) { return !!String(s || '').trim(); }
function _maybe(line, svg) { return _nonEmpty(line) ? svg : ''; }

/* Optional seasonal garnish (disabled in strict flow) */
function _seasonAccentLeaves() { return ''; }

/* --- Color utils for contrast-safe text on chips/cards --- */
function _hexToRgb(hex = '') {
  const m = String(hex).replace('#', '').trim();
  if (m.length === 3) {
    const r = m[0] + m[0], g = m[1] + m[1], b = m[2] + m[2];
    return { r: parseInt(r, 16), g: parseInt(g, 16), b: parseInt(b, 16) };
  }
  if (m.length === 6) {
    return { r: parseInt(m.slice(0, 2), 16), g: parseInt(m.slice(2, 4), 16), b: parseInt(m.slice(4, 6), 16) };
  }
  return { r: 0, g: 0, b: 0 };
}
function _relLuminance(hex = '#000000') {
  const { r, g, b } = _hexToRgb(hex);
  const srgb = [r, g, b].map(v => v / 255);
  const lin = srgb.map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function contrastRatio(bg = '#000000', fg = '#ffffff') {
  const L1 = _relLuminance(bg);
  const L2 = _relLuminance(fg);
  const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
  return (hi + 0.05) / (lo + 0.05);
}
function pickTextColor(bg = '#000000') {
  // choose black or white for best contrast on bg
  const cBlack = contrastRatio(bg, '#000000');
  const cWhite = contrastRatio(bg, '#ffffff');
  return cBlack > cWhite ? '#000000' : '#ffffff';
}
function safeHex(hex = '', fallback = '#111111') {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(hex).trim()) ? hex : fallback;
}

/* --- CTA normalizers — NO DEFAULTS --- */
/* --- CTA normalizers — NO DEFAULTS (RENAMED to avoid duplicates) --- */
function normalizeCTA_noDefaults(s = '') {
  const base = String(s).replace(/\s+/g, ' ').trim();
  return base ? base.slice(0, 28).toUpperCase() : '';
}
function cleanCTA_noDefaults(s = '', brand = '') {
  let t = String(s || '');
  if (brand) t = t.replace(new RegExp(escRegExp(brand), 'i'), '');
  t = t.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return normalizeCTA_noDefaults(t); // returns '' when empty
}


/* --- Centering helpers for SVG text alignment (use with text-anchor="middle") --- */
function centerAnchorAttrs() {
  return { 'text-anchor': 'middle', 'dominant-baseline': 'middle' };
}

/* --- CTA pill (pure black, white text; same geometry) --- */
function pillBtn(cx, cy, label, fs = 34) {
 const txt = normalizeCTA_noDefaults(label || '');

  if (!txt) return ''; // do not draw when no CTA
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

/* ======================================================
   TEMPLATE A — PHOTO POSTER (industry-agnostic version)
   Structure: baked photo bg + centered white card + big
   headline + date range + value line + supporting lines.
   ====================================================== */
function svgPhotoPoster({
  W, H, baseImageDataURL,
  brandLogos = [], // [{href, x, y, w, h}]
  headline = 'BIG SALE',
  dateRange = '',
  valueLine = 'SAVE $500',
  supportTop = 'PLUS SPECIAL FINANCING*',
  supportMid = 'ON SELECT PRODUCTS',
  supportBot = 'SEE STORE FOR DETAILS',
  leafBadges = [], // [{href,x,y,w,h}] optional decorative
}) {
  const CARD_W = Math.round(W * 0.66);
  const CARD_H = Math.round(H * 0.26);
  const CARD_X = Math.round((W - CARD_W)/2);
  const CARD_Y = Math.round(H * 0.16);

  const VALUE_Y = Math.round(CARD_Y + CARD_H + H*0.12);
  const SUPPORT_Y1 = VALUE_Y + 56;
  const SUPPORT_Y2 = SUPPORT_Y1 + 34;
  const SUPPORT_Y3 = SUPPORT_Y2 + 28;

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <image id="bg" href="${baseImageDataURL}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  </defs>

  <!-- baked background -->
  <use href="#bg"/>

  <!-- outer soft card shadow -->
  <g opacity="0.35">
    <rect x="${CARD_X-8}" y="${CARD_Y-8}" width="${CARD_W+16}" height="${CARD_H+16}" rx="14" fill="#000000" />
  </g>

  <!-- white headline card -->
  <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="12" fill="#FFFFFF" />
  ${leafBadges.map(b=>`<image href="${b.href}" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" />`).join('')}

  <!-- tiny brand row (optional) -->
  ${brandLogos.map(l=>`<image href="${l.href}" x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" />`).join('')}

  <!-- headline -->
  <text x="${W/2}" y="${CARD_Y + CARD_H/2 - 8}" text-anchor="middle" dominant-baseline="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.065)}" font-weight="900" fill="#CC2C2C" letter-spacing="1.5">
    ${escSVG(headline.toUpperCase())}
  </text>

  <!-- date range -->
  <text x="${W/2}" y="${CARD_Y + CARD_H - 18}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.022)}" font-weight="700" fill="#BB4D3A" letter-spacing="1">
    ${escSVG(dateRange.toUpperCase())}
  </text>

  <!-- BIG value line over photo -->
  <text x="${W*0.14}" y="${VALUE_Y}" text-anchor="start"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.095)}" font-weight="900" fill="#FFFFFF" letter-spacing="1.5">
    ${escSVG(valueLine.toUpperCase())}
  </text>

  <!-- supporting lines -->
  <text x="${W/2}" y="${SUPPORT_Y1}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.034)}" font-weight="800" fill="#FFFFFF" letter-spacing="1">
    ${escSVG(supportTop.toUpperCase())}
  </text>
  <text x="${W/2}" y="${SUPPORT_Y2}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.024)}" font-weight="700" fill="#FFFFFF" letter-spacing="0.8">
    ${escSVG(supportMid.toUpperCase())}
  </text>
  <text x="${W/2}" y="${SUPPORT_Y3}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.018)}" font-weight="600" fill="#FFFFFF" letter-spacing="0.6">
    ${escSVG(supportBot.toUpperCase())}
  </text>

  <!-- tiny legal at bottom -->
  <text x="${W/2}" y="${H-18}" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.016)}" font-weight="500" fill="rgba(255,255,255,0.85)">
    *With approved credit. Ask for details.
  </text>
</svg>`;
}


/* ===================================================
   TEMPLATE B — ILLUSTRATED FLYER (industry-agnostic)
   Structure: dark top banner + diagonal split + ticks,
   services list, coverage line, and big phone CTA row.
   =================================================== */
function svgIllustratedFlyer({
  W, H, illustrationDataURL,
  headline = 'HOME CLEANING SERVICES',
  subHead = 'APARTMENT • HOME • OFFICE',
  leftChecks = ['ONE TIME','WEEKLY','BI-WEEKLY','MONTHLY'],
  rightServices = ['Kitchen','Bathrooms','Offices','Dusting','Mopping','Vacuuming'],
  coverage = 'Coverage area ~25 miles around city',
  callNow = 'CALL NOW!',
  phone = '1300-135-1616'
}) {
  const TOP_H = Math.round(H*0.28);

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <image id="illustr" href="${illustrationDataURL}" x="0" y="${TOP_H-10}" width="${W}" height="${H-TOP_H+10}" preserveAspectRatio="xMidYMid meet"/>
    <linearGradient id="btnGradient" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#ff8a00"/><stop offset="100%" stop-color="#ffb84d"/>
    </linearGradient>
  </defs>

  <!-- top banner -->
  <rect x="0" y="0" width="${W}" height="${TOP_H}" fill="#0C4A5B"/>
  <text x="${W/2}" y="${Math.round(TOP_H*0.46)}" text-anchor="middle"
        font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.072)}" font-weight="900" fill="#FFFFFF" letter-spacing="1.2">
    ${escSVG(headline.toUpperCase())}
  </text>
  <text x="${W/2}" y="${Math.round(TOP_H*0.78)}" text-anchor="middle"
        font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.028)}" font-weight="700" fill="#CDEBF2" letter-spacing="2.5">
    ${escSVG(subHead.toUpperCase())}
  </text>

  <!-- diagonal split bg -->
  <path d="M0 ${TOP_H} L ${W} ${Math.round(TOP_H*0.85)} L ${W} ${H} L 0 ${H} Z" fill="#E8F6FA"/>
  <use href="#illustr"/>

  <!-- left checks -->
  ${leftChecks.map((t,i)=>{
    const y = TOP_H + 70 + i*44;
    return `
      <circle cx="${Math.round(W*0.10)}" cy="${y}" r="10" fill="none" stroke="#11A37F" stroke-width="3"/>
      <path d="M ${Math.round(W*0.10)-6} ${y} l 4 4 l 7 -9" stroke="#11A37F" stroke-width="3" fill="none" />
      <text x="${Math.round(W*0.10)+26}" y="${y+6}" font-family="Poppins, Helvetica, Arial, sans-serif"
            font-size="${Math.round(H*0.028)}" font-weight="700" fill="#0B3B4A">${escSVG(t)}</text>`;
  }).join('')}

  <!-- right services -->
  <text x="${Math.round(W*0.58)}" y="${TOP_H + 52}" font-family="Poppins, Helvetica, Arial, sans-serif"
        font-size="${Math.round(H*0.032)}" font-weight="800" fill="#0B3B4A">Services Offered</text>
  ${rightServices.map((t,i)=>{
    const y = TOP_H + 88 + i*36;
    return `
      <circle cx="${Math.round(W*0.56)}" cy="${y-12}" r="5" fill="#11A37F"/>
      <text x="${Math.round(W*0.58)}" y="${y}" font-family="Poppins, Helvetica, Arial, sans-serif"
            font-size="${Math.round(H*0.026)}" font-weight="600" fill="#1C5A6B">${escSVG(t)}</text>`;
  }).join('')}

  <!-- coverage line -->
  <g opacity="0.85">
    <path d="M ${Math.round(W*0.08)} ${H-112} h 14" stroke="#F59E0B" stroke-width="4"/>
    <text x="${Math.round(W*0.12)}" y="${H-105}" font-family="Poppins, Helvetica, Arial, sans-serif"
          font-size="${Math.round(H*0.022)}" font-weight="600" fill="#1C5A6B">${escSVG(coverage)}</text>
  </g>

  <!-- call now row -->
  <rect x="${Math.round(W*0.06)}" y="${H-88}" width="${Math.round(W*0.88)}" height="58" rx="12" fill="url(#btnGradient)"/>
  <text x="${Math.round(W*0.12)}" y="${H-50}" text-anchor="start"
        font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.030)}" font-weight="900" fill="#1B2838">
    ${escSVG(callNow)}
  </text>
  <text x="${Math.round(W*0.50)}" y="${H-50}" text-anchor="start"
        font-family="Poppins, Helvetica, Arial, sans-serif" font-size="${Math.round(H*0.036)}" font-weight="900" fill="#1B2838">
    ${escSVG(phone)}
  </text>
</svg>`;
}

/* ==========================================================
   COMPOSERS — bake background + render SVG → raster → save
   ========================================================== */
async function composePhotoPoster({
  imageUrl,
  answers = {},
  dims = { W: 1080, H: 1080 },
}) {
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
}

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

/* Pexels video + photo fetchers */
/* Pexels videos with wide pool + seeded randomness + de-dupe */
async function fetchPexelsVideos(keyword, want = 8, seed = '') {
  if (!PEXELS_API_KEY) return [];
  const rng = mkRng32(seed || keyword || Date.now());
  const variants = buildKeywordVariants(keyword);
  // Randomly pick up to 3 different query variants and 2 random pages each
  const chosenQueries = shuffleInPlace([...variants], rng).slice(0, Math.min(3, variants.length));
  const pages = [1, 2, 3, 4, 5];
  const results = [];
  const seen = new Set();

  try {
    for (const q of chosenQueries) {
      const shuffledPages = shuffleInPlace([...pages], rng).slice(0, 2);
      for (const page of shuffledPages) {
        const r = await ax.get('https://api.pexels.com/videos/search', {
          headers: { Authorization: PEXELS_API_KEY },
          params: {
            query: q,
            per_page: 40,      // big page to widen pool
            page,              // random page => variety
            orientation: 'landscape',
          },
          timeout: 12000,
        }).catch(() => ({ data: {} }));
        const vids = Array.isArray(r.data?.videos) ? r.data.videos : [];
        for (const v of vids) {
          const id = v?.id;
          if (id == null || seen.has(id)) continue;
          const files = Array.isArray(v.video_files) ? v.video_files : [];
          // prefer >= 720p mp4, else any mp4 link
          const f =
            files.find((f) => /mp4/i.test(f.file_type || '') && (f.height || 0) >= 720) ||
            files.find((f) => /mp4/i.test(f.file_type || '')) ||
            files[0];
          if (f?.link) {
            seen.add(id);
            results.push({ url: f.link, id, dur: v.duration || 0 });
          }
        }
      }
    }
    // Shuffle the large pool, then take the top 'want'
    shuffleInPlace(results, rng);
    const pick = results.slice(0, Math.max(want, 8)); // keep a generous pool for later slicing
    console.log('[pexels] videos picked:', pick.length, 'kw=', keyword, 'seed=', seed);
    return pick;
  } catch (e) {
    console.warn('[pexels] video search fail:', e.message);
    return [];
  }
}


/* Pexels photos with seeded randomness + de-dupe */
async function fetchPexelsPhotos(keyword, want = 8, seed = '') {
  if (!PEXELS_API_KEY) return [];
  const rng = mkRng32(seed || keyword || Date.now());
  const variants = buildKeywordVariants(keyword);
  const chosenQueries = shuffleInPlace([...variants], rng).slice(0, Math.min(3, variants.length));
  const pages = [1, 2, 3, 4, 5];
  const results = [];
  const seen = new Set();

  try {
    for (const q of chosenQueries) {
      const shuffledPages = shuffleInPlace([...pages], rng).slice(0, 2);
      for (const page of shuffledPages) {
        const r = await ax.get('https://api.pexels.com/v1/search', {
          headers: { Authorization: PEXELS_API_KEY },
          params: { query: q, per_page: 40, page },
          timeout: 12000,
        }).catch(() => ({ data: {} }));
        const photos = Array.isArray(r.data?.photos) ? r.data.photos : [];
        for (const p of photos) {
          const id = p?.id;
          if (id == null || seen.has(id)) continue;
          const src = p?.src || {};
          const u = src.landscape || src.large2x || src.large || src.original;
          if (u) {
            seen.add(id);
            results.push({ url: u, id });
          }
        }
      }
    }
    shuffleInPlace(results, rng);
    return results.slice(0, Math.max(want, 12));
  } catch (e) {
    return [];
  }
}


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
    OUTLEN = Math.max(15, Math.min(20, effVoice + 2));

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

    // ---------- 4) Audio graph (voice + optional BGM) ----------
    const voiceIdx = segs.length;
    const audioInputs = ['-i', voicePath];
    let musicArgs = [];
    let musicIdx = null;

    if (musicPath) {
      musicArgs = ['-i', musicPath];
      musicIdx = voiceIdx + 1;
    }

    const voiceFilt = `[${voiceIdx}:a]atempo=${ATEMPO.toFixed(
      3
    )},aresample=48000[vo]`;

    const audioMix =
      musicIdx !== null
        ? `[${musicIdx}:a]volume=0.18[bgm];${voiceFilt};[bgm][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        : `${voiceFilt};[vo]anull[aout]`;

    // ---------- 5) Subtitles: SAME black box, but now word-timed ----------
    const { filter: subFilter, out: vOut } = buildWordTimedDrawtextFilter(
      subtitleWords,
      '[vcat]',
      W,
      H
    );

    const fc = [concatChain, subFilter, audioMix].join(';');

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
    OUTLEN = Math.max(18, Math.min(20, effVoice + 2));

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

    // ---------- 4) Audio graph ----------
    const voiceIdx = segs.length;
    const audioInputs = ['-i', voicePath];
    let musicArgs = [];
    let musicIdx = null;

    if (musicPath) {
      musicArgs = ['-i', musicPath];
      musicIdx = voiceIdx + 1;
    }

    const voiceFilt = `[${voiceIdx}:a]atempo=${ATEMPO.toFixed(
      3
    )},aresample=48000[vo]`;

    const audioMix =
      musicIdx !== null
        ? `[${musicIdx}:a]volume=0.18[bgm];${voiceFilt};[bgm][vo]amix=inputs=2:duration=first:dropout_transition=2[aout]`
        : `${voiceFilt};[vo]anull[aout]`;

    // ---------- 5) Subtitles: same black box, word-timed ----------
    const { filter: subFilter, out: vOut } = buildWordTimedDrawtextFilter(
      subtitleWords,
      '[vcat]',
      W,
      H
    );

    const fc = [concatChain, subFilter, audioMix].join(';');

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
      answers.businessName ||
      Date.now()
    );

    // One keyword for this request ONLY (prevents double-runs)
    const industry = (answers.industry || "").toLowerCase();
    let baseKeyword = "small business";
    if (industry.includes("restaurant") || industry.includes("food")) baseKeyword = "restaurant";
    else if (industry.includes("fashion") || industry.includes("clothing")) baseKeyword = "fashion";
    else if (industry.includes("beauty") || industry.includes("salon")) baseKeyword = "beauty salon";
    else if (industry.includes("coffee")) baseKeyword = "coffee";
    else if (industry.includes("electronics") || industry.includes("tech")) baseKeyword = "tech gadgets";

    const targetSec = Math.max(18, Math.min(20, Number(body.targetSeconds || 18.5)));

    // ---- script (single time) ----
    let script = (body.adCopy || "").trim();
    if (!script) script = await generateVideoScriptFromAnswers(answers);

    // ---- stock videos (single pool) ----
   let clips = await fetchPexelsVideos(baseKeyword, 8, `${seedBase}|${baseKeyword}`);
if (!clips.length) clips = await fetchPexelsVideos("product shopping", 8, `${seedBase}|fallback`);

    if (!clips.length) return res.status(500).json({ ok: false, error: "No stock clips found from Pexels." });

    // ---- fast toggle: ONLY one mode executes ----
    const FAST_MODE = String(body.fast ?? req.query.fast ?? process.env.SM_FAST_MODE ?? "0").trim() === "1";
const WANT_VARIANTS = Math.max(1, Math.min(2, Number(body.variants || req.query.variants || 2)));

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

  v1 = await makeVideoVariantFast({ clipUrls: urlsA, script, targetSec: targetSec });
  if (WANT_VARIANTS === 2) {
    v2 = await makeVideoVariantFast({ clipUrls: urlsB, script, targetSec: targetSec });
  }
} else {
  // (keep your existing standard path)
  v1 = await makeVideoVariant({ clips: planA, script, variant: 0, targetSec, tailPadSec: 2, musicPath: bgm });
  v2 = await makeVideoVariant({ clips: planB, script, variant: 1, targetSec, tailPadSec: 2, musicPath: bgm });
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
