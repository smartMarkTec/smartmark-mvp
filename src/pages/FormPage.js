/* eslint-disable */
// src/pages/FormPage.js
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FaSyncAlt, FaTimes, FaArrowUp, FaArrowLeft } from "react-icons/fa";

/* --------- Palette / fonts --------- */
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const DARK_BG = "#11161c";
const SURFACE = "#1b2026";
const TEAL = "#14e7b9";
const TEAL_SOFT = "rgba(20,231,185,0.22)";
const EDGE = "rgba(255,255,255,0.06)";

const SIDE_CHAT_LIMIT = 5;

/* -------- Backend endpoints (proxy through Vercel) -------- */
const USE_LOCAL_BACKEND = false;

// IMPORTANT: keep PROD_BACKEND blank so everything is same-origin.
const PROD_BACKEND = "";

// For asset paths returned as relative (e.g., /api/media/..), keep this empty string.
// Your Vercel rewrite forwards /api/* to Render.
const BACKEND_URL = USE_LOCAL_BACKEND ? "" : PROD_BACKEND;

// Always call the API via same-origin /api to avoid CORS, even on 5xx edge responses.
const API_BASE = USE_LOCAL_BACKEND ? "/api" : "/api";

const WARMUP_URL = `${API_BASE}/test`;

/* -------- Draft persistence -------- */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const FORM_DRAFT_KEY = "sm_form_draft_v2";
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v2";

/* -------- Image copy edit store -------- */
const IMAGE_DRAFTS_KEY = "smartmark.imageDrafts.v1";
const ALLOWED_CTAS = [
  "Shop now", "Buy now", "Learn more", "Visit us", "Check us out",
  "Take a look", "Get started"
];

/* ===== image draft helpers ===== */
function loadImageDrafts() {
  try { return JSON.parse(localStorage.getItem(IMAGE_DRAFTS_KEY) || "{}"); } catch { return {}; }
}
function saveImageDrafts(map) {
  try { localStorage.setItem(IMAGE_DRAFTS_KEY, JSON.stringify(map)); } catch {}
}
function getImageDraftById(id) {
  const all = loadImageDrafts();
  return all[id] || null;
}
function saveImageDraftById(id, patch) {
  const all = loadImageDrafts();
  const next = { ...(all[id] || {}), ...patch, _updatedAt: Date.now() };
  all[id] = next;
  saveImageDrafts(all);
  return next;
}
function normalizeOverlayCTA(s = "") {
  const raw = String(s).trim();
  if (!raw) return ""; // no default CTA
  const plain = raw.replace(/[!?.]+$/g, "").toLowerCase();
  const match = ALLOWED_CTAS.find(c => c.toLowerCase() === plain);
  const chosen = match || plain;
  return chosen.replace(/\b\w/g, c => c.toUpperCase());
}

function creativeIdFromUrl(url = "") {
  return `img:${url}`;
}

/* ===== small UI bits ===== */
function Dotty() {
  return (
    <span style={{ display: "inline-block", minWidth: 60, letterSpacing: 4 }}>
      <span className="dotty-dot" style={dotStyle(0)}>.</span>
      <span className="dotty-dot" style={dotStyle(1)}>.</span>
      <span className="dotty-dot" style={dotStyle(2)}>.</span>
      <style>
        {`
        @keyframes bounceDot {
          0% { transform: translateY(0);}
          30% { transform: translateY(-7px);}
          60% { transform: translateY(0);}
        }
        .dotty-dot { display:inline-block; animation:bounceDot 1.2s infinite; }
        .dotty-dot:nth-child(2) { animation-delay: .15s; }
        .dotty-dot:nth-child(3) { animation-delay: .3s; }
        `}
      </style>
    </span>
  );
}
function dotStyle(n) {
  return { display: "inline-block", margin: "0 3px", fontSize: 36, color: TEAL, animationDelay: `${n * 0.13}s` };
}

function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(10,12,15,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
    }}>
      <div style={{ position: "relative", background: SURFACE, borderRadius: 18, boxShadow: "0 0 40px #0008" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 2,
            background: "#23262a", color: "#fff", border: "none",
            borderRadius: 20, padding: 8, cursor: "pointer"
          }}
        >
          <FaTimes size={20} />
        </button>
        <img
          src={toAbsoluteMedia(imageUrl)}
          alt="Full Ad"
          style={{
            display: "block",
            maxWidth: "90vw",
            maxHeight: "82vh",
            borderRadius: 16,
            background: "#222",
            margin: "40px 28px 28px",
            boxShadow: "0 8px 38px #000b",
            fontFamily: AD_FONT
          }}
        />
      </div>
    </div>
  );
}

function MediaTypeToggle({ mediaType, setMediaType }) {
  const choices = [
    { key: "image", label: "Image" },
    { key: "both", label: "Both" },
    { key: "video", label: "Video" }
  ];
  return (
    <div style={{
      display: "flex", gap: 16, justifyContent: "center", alignItems: "center",
      margin: "18px 0 8px 0"
    }}>
      {choices.map((choice) => (
        <button
          key={choice.key}
          onClick={() => setMediaType(choice.key)}
          style={{
            fontWeight: 900,
            fontSize: "1.06rem",
            padding: "10px 24px",
            borderRadius: 12,
            border: `1px solid ${EDGE}`,
            background: mediaType === choice.key ? TEAL : "#23292c",
            color: mediaType === choice.key ? "#0e1418" : "#bcfff6",
            cursor: "pointer",
            boxShadow: mediaType === choice.key ? `0 2px 18px ${TEAL_SOFT}` : "none",
            transform: mediaType === choice.key ? "scale(1.06)" : "scale(1)",
            transition: "all 0.15s",
            outline: mediaType === choice.key ? `3px solid ${TEAL_SOFT}` : "none",
            willChange: "transform"
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function Arrow({ side = "left", onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "absolute",
        top: "50%",
        [side]: 10,
        transform: "translateY(-50%)",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        border: "none",
        width: 34, height: 34, borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.45 : 0.85, zIndex: 3, willChange: "transform"
      }}
      aria-label={side === "left" ? "Previous" : "Next"}
      title={side === "left" ? "Previous" : "Next"}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        {side === "left" ? (
          <path d="M12.5 15L7.5 10L12.5 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M7.5 5L12.5 10L7.5 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

function Dots({ count, active, onClick }) {
  return (
    <div style={{
      position: "absolute", bottom: 8, left: 0, right: 0,
      display: "flex", justifyContent: "center", alignItems: "center",
      gap: 8, zIndex: 3
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onClick(i)}
          style={{
            width: 8, height: 8, borderRadius: "50%",
            border: "none",
            background: i === active ? TEAL : "rgba(255,255,255,0.55)",
            cursor: "pointer", opacity: i === active ? 1 : 0.7
          }}
          aria-label={`Go to slide ${i + 1}`}
          title={`Slide ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* --- Abort-safe fetch helpers --- */
const _controllers = new Map(); // key -> AbortController

function abortKey(key) {
  const c = _controllers.get(key);
  if (c) { try { c.abort(); } catch {} }
  _controllers.delete(key);
}

function newControllerFor(key) {
  // cancel any previous of same kind
  abortKey(key);
  const c = new AbortController();
  _controllers.set(key, c);
  return c;
}

// legacy helper (still here in case something else uses it)
async function fetchJSON(url, { key = "GEN", timeoutMs = 15000, opts = {} } = {}) {
  const c = newControllerFor(key);
  const t = setTimeout(() => { try { c.abort(); } catch {} }, timeoutMs);
  try {
    const res = await fetch(url, { signal: c.signal, ...opts });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(t);
  }
}

/* NEW: single-attempt JSON fetch that *respects* abort keys for big video jobs */
async function fetchJsonOnceWithAbortKey(
  url,
  fetchOpts = {},
  { key = "GEN", timeoutMs } = {}
) {
  const ms = typeof timeoutMs === "number" && timeoutMs > 0 ? timeoutMs : 20000; // tighter per-call default
  const controller = newControllerFor(key);
  const timer = setTimeout(() => { try { controller.abort(); } catch {} }, ms);

  try {
    const res = await fetch(url, { ...fetchOpts, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
    }
    return await res.json().catch(() => ({}));
  } finally {
    clearTimeout(timer);
  }
}

/* Call when unmounting or when starting a brand new run */
function abortAllVideoFetches() {
  for (const [key, c] of _controllers.entries()) {
    try { c.abort(); } catch {}
  }
  _controllers.clear();
}


/* ===== helpers ===== */

/* ===== derivePosterFieldsFromAnswers ===== */

function derivePosterFieldsFromAnswers(a = {}, fallback = {}) {
  const ind = (a.industry || "").toString();

  const headline =
    a.headline ||
    a.eventTitle ||
    (a.mainBenefit ? a.mainBenefit : "") ||
    (a.offer ? "Limited-Time Offer" : `${ind || "Your"} Brand`).toString();

  const tc = (s) => String(s || "").trim().replace(/\b\w/g, c => c.toUpperCase());

  const promoLine =
    a.promoLine ||
    a.subline ||
    (a.idealCustomer ? tc(a.idealCustomer.slice(0, 30)) : "") ||
    "LIMITED TIME ONLY";

  const offer =
    a.offer ||
    a.saveAmount ||
    a.cta ||
    (fallback.saveAmount || "BIG SAVINGS");

  const secondary =
    a.secondary ||
    a.financingLine ||
    "";

  const adCopy =
    a.adCopy ||
    a.details ||
    a.mainBenefit ||
    "";

  const legal = a.legal || "";
  const backgroundUrl = a.backgroundUrl || "";

  return {
    headline: String(headline || "").slice(0, 55),
    promoLine: String(promoLine || ""),
    offer: String(offer || ""),
    secondary: String(secondary || ""),
    adCopy: String(adCopy || ""),
    legal: String(legal || ""),
    backgroundUrl
  };
}


const CONTROLLER_TIMEOUT_MS = 22000;         // single-call guard
const IMAGE_FETCH_TIMEOUT_MS = 38000;        // image job (retry-safe)
const VIDEO_FETCH_TIMEOUT_MS = 56000;        // per-variant POST /generate-video-ad
const GENERATION_HARD_CAP_MS = 100000;       // global cap per run (~1m40s)
const VIDEO_TARGET_SECONDS = 19;             // server still targets ~19s
const USE_FAST_MODE = true;

const FORCE_HARD_CUTS = true;                // straight cuts (no xfade)
const FORCE_SUBTITLES = true;                // on (burn if possible)



function fetchWithTimeout(url, opts = {}, ms = CONTROLLER_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  const final = { ...opts, signal: controller.signal };
  return fetch(url, final).finally(() => clearTimeout(t));
}

async function fetchJsonWithRetry(
  url,
  opts = {},
  { tries = 3, warm = false, timeoutMs = CONTROLLER_TIMEOUT_MS } = {}
) {
  let attempt = 0;
  let lastErr = null;
  if (warm) {
    try { await warmBackend(); } catch {}
  }
  while (attempt < tries) {
    try {
      const res = await fetchWithTimeout(
        url,
        { mode: "cors", credentials: "omit", ...opts },
        timeoutMs
      );
      if (!res.ok) {
        // Cold start / throttling -> retry only when it makes sense
        if ([429, 502, 503, 504].includes(res.status)) {
          throw new Error(String(res.status));
        }
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      // modest backoff so total stays under our hard cap
      const backoff = 400 * Math.pow(1.7, attempt) + Math.floor(Math.random() * 180);
      await new Promise(r => setTimeout(r, backoff));
      attempt++;
    }
  }
  throw lastErr || new Error("request failed");
}

async function warmBackend() {
  // Quick warmup so first hit isn't slow; don't block too long
  try {
    const res = await fetchWithTimeout(`${API_BASE}/test`, { mode: "cors", credentials: "omit" }, 5000);
    if (!res.ok) throw new Error(`warmup ${res.status}`);
    return true;
  } catch {
    // one short retry
    try { await fetchWithTimeout(`${API_BASE}/test`, { mode: "cors", credentials: "omit" }, 5000); } catch {}
    return false;
  }
}



function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}
function isGenerateTrigger(input) {
  return /^(yes|y|i'?m ready|lets? do it|generate|go ahead|start|sure|ok)$/i.test(input.trim());
}
async function safeJson(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  try { return await res.json(); } catch { throw new Error("Bad JSON"); }
}

const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;
function stripUrls(s = "") { return (s || "").replace(URL_REGEX, ""); }
function extractFirstUrl(s = "") { const m = (s || "").match(URL_REGEX); return m ? m[0] : null; }
function isLikelyQuestion(s) {
  const t = (s || "").trim().toLowerCase();
  if (extractFirstUrl(t) && t === extractFirstUrl(t)?.toLowerCase()) return false;
  const textWithoutUrls = stripUrls(t);
  const hasQMark = textWithoutUrls.includes("?");
  const startsWithQword = /^(who|what|why|how|when|where|which|can|do|does|is|are|should|help)\b/.test(t);
  return hasQMark || startsWithQword;
}
function isLikelySideStatement(s) {
  const t = (s || "").trim().toLowerCase();
  const sentimental = /(wow|amazing|awesome|incredible|insane|crazy|cool|great|impressive|unbelievable|never seen|i have never|this is (amazing|awesome|great|insane|incredible)|love (this|it)|thank(s)?|omg)\b/;
  const hasBang = t.includes("!");
  return sentimental.test(t) || hasBang;
}
function isLikelySideChat(s, currentQ) {
  if (isLikelyQuestion(s) || isLikelySideStatement(s)) return true;
  const t = (s || "").trim();
  if (!currentQ) return false;

  if (currentQ.key === "url") {
    const hasUrl = !!extractFirstUrl(t);
    return !hasUrl && t.split(/\s+/).length > 3;
  }
  if (currentQ.key === "hasOffer") {
    return !/^(yes|no|y|n)$/i.test(t);
  }
  if (currentQ.key === "industry" || currentQ.key === "businessName") {
    return t.length > 80;
  }
  return false;
}

/* === buildImagePrompt (images) — UPDATED === */
function buildImagePrompt(answers = {}, overlay = {}) {
  const parts = [];

  const industry = (answers.industry || "local services").toString().trim();
  const biz = (answers.businessName || "").toString().trim();
  const benefit = (answers.mainBenefit || "").toString().trim();
  const offer = (answers.offer || "").toString().trim();
  const audience = (answers.idealCustomer || "").toString().trim();

  if (industry) parts.push(`Industry: ${industry}`);
  if (biz) parts.push(`Brand: ${biz}`);
  if (benefit) parts.push(`Main benefit: ${benefit}`);
  if (offer) parts.push(`Offer: ${offer}`);
  if (audience) parts.push(`Audience: ${audience}`);

  // Nudge toward your overlay copy so the image fits your text
  if (overlay?.headline) parts.push(`Headline theme: ${overlay.headline}`);
  if (overlay?.cta) parts.push(`CTA: ${overlay.cta}`);

  // Photo guidance
  parts.push("Style: clean commercial photo, centered subject, negative space for text, uncluttered background");

  return parts.filter(Boolean).join(" | ");
}




/* ===== robust URL normalizer (works for /api/media and absolute URLs) ===== */
function toAbsoluteMedia(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;        // already absolute
  if (s.startsWith("/")) return s;               // same-origin absolute path
  if (s.startsWith("api/")) return "/" + s;      // "api/media/x" -> "/api/media/x"
  if (s.startsWith("media/")) return "/api/" + s;// "media/x" -> "/api/media/x"
  return s; // last resort
}

/* Route any external IMAGE url through our server proxy to avoid CORS */
function proxyImg(u = "") {
  if (!u) return "";
  const s = String(u).trim();
  // Already same-origin or already proxied
  if (s.startsWith("/")) return s;
  if (s.startsWith(`${API_BASE}/proxy-img?u=`)) return s;
  if (/^https?:\/\//i.test(s)) {
    return `${API_BASE}/proxy-img?u=${encodeURIComponent(s)}`;
  }
  // relative like "media/x" (server will serve it), leave as-is but normalize later
  return s;
}

/* --- headRangeWarm: self-contained, no shared controllers --- */
async function headRangeWarm(label, url) {
  if (!url) return false;
  const finalUrl = toAbsoluteMedia(url);
  try {
    const c1 = new AbortController();
    await fetch(finalUrl, { method: "HEAD", signal: c1.signal });

    const c2 = new AbortController();
    const r = await fetch(finalUrl, {
      method: "GET",
      headers: { Range: "bytes=0-1023" },
      signal: c2.signal,
    });
    if (!r.ok) throw new Error(`RANGE ${r.status}`);
    return true;
  } catch (e) {
    console.warn(`headRangeWarm(${label}) failed:`, e?.message || e);
    return false;
  }
}

/* ---------- IMAGE helpers (prefer baked variations) ---------- */
const parseImageResults = (data) => {
  const out = [];

  const push = (u0) => {
    if (!u0) return;
    const raw = typeof u0 === "string" ? u0 : (u0?.absoluteUrl || u0?.url || u0?.filename);
    if (!raw) return;
    // If it’s absolute http(s), send through our proxy to avoid CORS in <img/> and warmers
    const maybeProxied = /^https?:\/\//i.test(raw) ? proxyImg(raw) : raw;
    // Normalize to same-origin (/api/media/.. etc.)
    out.push(toAbsoluteMedia(maybeProxied.startsWith("/api/") ? maybeProxied : maybeProxied));
  };

  if (Array.isArray(data?.imageVariations)) {
    for (const v of data.imageVariations) push(v);
  }
  if (Array.isArray(data?.images)) {
    for (const u0 of data.images) push(u0);
  }
  if (out.length === 0) {
    push(data?.absoluteImageUrl || data?.imageUrl || data?.url || data?.filename);
  }

  const uniq = Array.from(new Set(out));
  return uniq.slice(0, 2);
};


async function fetchImagesOnce(token, answersParam, overlay = {}, prompt = "") {
  const fallbackA = proxyImg(`https://picsum.photos/seed/sm-${encodeURIComponent(token)}-A/1200/628`);
const fallbackB = proxyImg(`https://picsum.photos/seed/sm-${encodeURIComponent(token)}-B/1200/628`);


  try {
    await warmBackend();

    const payload = {
      answers: answersParam || {},
      regenerateToken: token,
      // Strong guidance so backend doesn’t choose a random category
      prompt: prompt || buildImagePrompt(answersParam, overlay),

      // Ask backend to actually COMPOSE the overlay onto the image it returns
      composeOverlay: 1,
      overlayHeadline: overlay?.headline || "",
      overlayBody: overlay?.body || "",
      overlayCTA: overlay?.cta || "",

      // Optional hints many servers accept (ignored safely if unknown)
      count: 2,
      width: 1200,
      height: 628,
      styleHint: "photo",           // keep as 'photo' (you can switch to 'illustration' later)
      negative: "busy cluttered background, low-contrast, text cut-off"
    };

    const data = await fetchJsonWithRetry(
      `${API_BASE}/generate-image-from-prompt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      },
      { tries: 3, warm: true, timeoutMs: IMAGE_FETCH_TIMEOUT_MS }
    ).catch(() => ({}));

    let urls = parseImageResults(data);
    if (urls.length === 1) urls = [urls[0], fallbackB];
    if (urls.length === 0) urls = [fallbackA, fallbackB];

    await Promise.allSettled(urls.map((u, i) => headRangeWarm(`IMG${i}`, u)));
    return urls;
  } catch (e) {
    console.warn("image fetch failed:", e?.message || e);
    return [fallbackA, fallbackB];
  }
}


/* ===== poll latest video (fallback) ===== */
async function pollLatestVideo({ tries = 5, delayMs = 900 } = {}) {
  for (let i = 0; i < tries; i++) {
    try {
      const latest = await fetchJsonWithRetry(
        `${API_BASE}/generated-latest`,
        { method: "GET" },
        { tries: 1, warm: false, timeoutMs: 6000 }
      );

      // Accept multiple shapes
      let u =
        latest?.absoluteUrl ||
        latest?.url ||
        (latest?.filename ? `/api/media/${latest.filename}` : "");
      if (!u && Array.isArray(latest?.variants) && latest.variants.length) {
        // pick first usable variant
        const v0 = latest.variants.find(v => v?.absoluteUrl || v?.url || v?.filename);
        if (v0) u = v0.absoluteUrl || v0.url || (v0.filename ? `/api/media/${v0.filename}` : "");
      }

      if (u && /\.mp4(\?|$)/i.test(u)) {
        const finalUrl = toAbsoluteMedia(u);
        try { await headRangeWarm("LATEST", finalUrl); } catch {}
        return {
          url: finalUrl,
          script: latest?.script || "",
          fbVideoId: latest?.fbVideoId || null,
        };
      }
    } catch { /* ignore and retry */ }

    await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

/* ----- Grace finalize: after we stop waiting, try to recover finished video(s) ----- */
async function finalizeGracePeriod({ maxMs = FINALIZE_GRACE_POLL_MS } = {}) {
  const started = Date.now();
  let best = null;

  while (Date.now() - started < maxMs) {
    try {
      const latest = await pollLatestVideo({ tries: 1, delayMs: 500 });
      if (latest && latest.url) {
        // Try warming and attach as a single-item list if we currently have none
        try { await headRangeWarm("GRACE", latest.url); } catch {}
        best = latest;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 700));
  }

  if (best && best.url) {
    // If we already have two, keep them; otherwise seed with this recovered one.
    setVideoItems((prev) => {
      if (Array.isArray(prev) && prev.length) return prev;
      return [{ url: best.url, script: best.script || "", fbVideoId: best.fbVideoId || null }];
    });
    setActiveVideo(0);
    setVideoUrl(best.url);
    setVideoScript(best.script || "");
  }
}



/* ---------- VIDEO helpers: direct sync calls to /generate-video-ad (A/B or single-call pair) ---------- */

// Try a single-call request that returns BOTH variants in one response.
// If backend doesn't support it, we fall back to the two-call (A/B) method.
async function fetchVideoPairSingleCall(token, answers, result, timeoutMs = VIDEO_FETCH_TIMEOUT_MS) {
  const triggerKey = `VIDEO_PAIR_${token}`;

  try {
    await warmBackend();

    const data = await fetchJsonOnceWithAbortKey(
      `${API_BASE}/generate-video-ad`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: answers?.url || "",
          answers: { ...answers, targetSeconds: VIDEO_TARGET_SECONDS },
          regenerateToken: token,

          // Hints — backend can safely ignore unknown fields
          fast: USE_FAST_MODE ? 1 : 0,
          targetSeconds: VIDEO_TARGET_SECONDS,
          hardCuts: FORCE_HARD_CUTS ? 1 : 0,
          xfade: 0,
          subtitles: FORCE_SUBTITLES ? 1 : 0,
          burnSubtitles: 1,

          // NEW: tell backend we only want a single call that returns exactly two
          expectPair: 1
        }),
      },
      { key: triggerKey, timeoutMs }
    );

    // Normalize two returned videos if available
    let pair = [];
    if (Array.isArray(data?.videos) && data.videos.length) {
      pair = data.videos
        .map(v => {
          let u = v?.absoluteUrl || v?.url || (v?.filename ? `/api/media/${v.filename}` : "");
          if (!u) return null;
          const captionsVtt =
            v?.captionsVtt ||
            v?.vtt ||
            v?.captionsUrl ||
            (v?.captionsFilename ? `/api/media/${v.captionsFilename}` : "");
          return {
            url: toAbsoluteMedia(u),
            script: v?.script || data?.script || "",
            fbVideoId: v?.fbVideoId || null,
            captionsVtt: captionsVtt ? toAbsoluteMedia(captionsVtt) : null
          };
        })
        .filter(Boolean)
        .slice(0, 2);
    } else {
      // Some servers return a single object; normalize if so
      const maybeSingle =
        data?.absoluteUrl || data?.url || (data?.filename ? `/api/media/${data.filename}` : "");
      if (maybeSingle) {
        pair = [{
          url: toAbsoluteMedia(maybeSingle),
          script: data?.script || "",
          fbVideoId: data?.fbVideoId || null,
          captionsVtt: data?.captionsVtt ? toAbsoluteMedia(data.captionsVtt) : null
        }];
      }
    }

    // Warm whatever URLs we have so the <video> starts instantly
    await Promise.allSettled(pair.map((p, i) => headRangeWarm(i === 0 ? "A" : "B", p?.url)));

    // Return up to two videos from the single call (no more)
    return pair.slice(0, 2);
  } catch (e) {
    // If we timeout/abort or server can't do pair, fall through to A/B path
    if (e?.name !== "AbortError") console.warn("fetchVideoPairSingleCall fallback:", e?.message || e);
    return [];
  }
}

// Old single-variant call remains for fallback
async function fetchVideoOnce(
  token,
  answers,
  result,
  BACKEND_URL_UNUSED,
  variant = "A",
  timeoutMs = VIDEO_FETCH_TIMEOUT_MS
) {
  const triggerKey = `VIDEO_${variant}_${token}`;

  try {
    await warmBackend();

    const data = await fetchJsonOnceWithAbortKey(
      `${API_BASE}/generate-video-ad`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: answers?.url || "",
          answers: { ...answers, targetSeconds: VIDEO_TARGET_SECONDS },
          regenerateToken: token,
          abVariant: variant,

          // SPEED + STYLE HINTS
          fast: USE_FAST_MODE ? 1 : 0,
          targetSeconds: VIDEO_TARGET_SECONDS,
          hardCuts: FORCE_HARD_CUTS ? 1 : 0,
          xfade: 0,
          subtitles: FORCE_SUBTITLES ? 1 : 0,
          burnSubtitles: 1
        }),
      },
      { key: triggerKey, timeoutMs }
    );

    let u =
      data?.url ||
      data?.videoUrl ||
      data?.absoluteUrl ||
      (data?.filename ? `/api/media/${data.filename}` : "");

    if (!u && Array.isArray(data?.variants) && data.variants.length) {
      const pick = data.variants.find(v => v?.absoluteUrl || v?.url || v?.filename);
      if (pick) u = pick.absoluteUrl || pick.url || (pick.filename ? `/api/media/${pick.filename}` : "");
    }
    if (!u) throw new Error("No video URL in response");

    const captionsVtt =
      data?.captionsVtt ||
      data?.vtt ||
      data?.captionsUrl ||
      (data?.captionsFilename ? `/api/media/${data.captionsFilename}` : "");

    const finalUrl = toAbsoluteMedia(u);
    try { await headRangeWarm(variant, finalUrl); } catch {}

    return {
      url: finalUrl,
      script:
        data?.script ||
        data?.narration ||
        (result?.body ? `Narration: ${result.body}` : ""),
      fbVideoId: data?.fbVideoId || null,
      captionsVtt: captionsVtt ? toAbsoluteMedia(captionsVtt) : null
    };
  } catch (e) {
    // Try to recover from a completed job
    try {
      const recovered = await pollLatestVideo({ tries: 5, delayMs: 900 });
      if (recovered?.url) return recovered;
    } catch {}
    if (e?.name === "AbortError") {
      console.debug(`fetchVideoOnce(${variant}) aborted (superseded)`);
    } else {
      console.error(`fetchVideoOnce(${variant}) failed:`, e);
    }
    return { url: "", script: "", fbVideoId: null, captionsVtt: null };
  }
}

// Public entry: returns EXACTLY up to two videos.
// 1) Try single-call pair (preferred — guarantees we never spawn 4)
// 2) If not supported, fall back to A & B (two separate calls)
//    and still clamp to two.
async function fetchVideoPair(token, answers, result, BACKEND_URL_UNUSED) {
  // First attempt: single-call pair
  const pair = await fetchVideoPairSingleCall(token, answers, result, VIDEO_FETCH_TIMEOUT_MS);
  if (pair.length >= 2) {
    // De-dup (defensive) and clamp to two
    const seen = new Set();
    const dedup = [];
    for (const v of pair) {
      if (v?.url && !seen.has(v.url)) { seen.add(v.url); dedup.push(v); }
      if (dedup.length === 2) break;
    }
    return dedup;
  }

  // Fallback path: explicit A/B (still returns at most two)
  const [a, b] = await Promise.allSettled([
    fetchVideoOnce(`${token}-A`, answers, result, null, "A", VIDEO_FETCH_TIMEOUT_MS),
    fetchVideoOnce(`${token}-B`, answers, result, null, "B", VIDEO_FETCH_TIMEOUT_MS),
  ]);

  const vids = [];
  const pushIfGood = (x) => { if (x && x.url) vids.push(x); };

  if (a.status === "fulfilled") pushIfGood(a.value);
  if (b.status === "fulfilled") pushIfGood(b.value);

  // de-dup + clamp to two
  const dedup = [];
  const seen = new Set();
  for (const v of vids) {
    if (v?.url && !seen.has(v.url)) { seen.add(v.url); dedup.push(v); }
    if (dedup.length === 2) break;
  }

  return dedup;
}


/* ========================= Main Component ========================= */
export default function FormPage() {
  const navigate = useNavigate();
  const chatBoxRef = useRef();

  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [chatHistory, setChatHistory] = useState([
    { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign.` },
    { from: "gpt", text: "Are you ready to get started? (yes/no)" }
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sideChatCount, setSideChatCount] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);

  const [mediaType, setMediaType] = useState("both");
  const [result, setResult] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [videoItems, setVideoItems] = useState([]);
  const [activeVideo, setActiveVideo] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoScript, setVideoScript] = useState("");

  const [imageLoading, setImageLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalImg, setModalImg] = useState("");
  const [awaitingReady, setAwaitingReady] = useState(true);

  /* ---- Image copy editing state ---- */
  const [imageEditing, setImageEditing] = useState(false);

  const currentImageId = useMemo(() => {
    const url = imageUrls[activeImage] || "";
    return creativeIdFromUrl(url);
  }, [imageUrls, activeImage]);

  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCTA, setEditCTA] = useState("");

  /* Use the robust absolute converter everywhere */
  const abs = toAbsoluteMedia;

  /* Scroll chat to bottom */
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatHistory]);

  /* Warm backend on mount */
  useEffect(() => { warmBackend(); }, []);

  /* Restore draft */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) return;
      const { savedAt, data } = JSON.parse(raw);
      if (savedAt && Date.now() - savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(FORM_DRAFT_KEY);
        localStorage.removeItem(CREATIVE_DRAFT_KEY);
        return;
      }
      if (data) {
        setAnswers(data.answers || {});
        setStep(data.step ?? 0);
        setChatHistory(Array.isArray(data.chatHistory) && data.chatHistory.length ? data.chatHistory : chatHistory);
        setMediaType(data.mediaType || "both");
        setResult(data.result || null);
        setImageUrls(data.imageUrls || []);
        setVideoItems(data.videoItems || []);
        setActiveImage(data.activeImage || 0);
        setActiveVideo(data.activeVideo || 0);
        setAwaitingReady(data.awaitingReady ?? true);
        setInput(data.input || "");
        setSideChatCount(data.sideChatCount || 0);
        setHasGenerated(!!data.hasGenerated);
      }
    } catch {}
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
  const draft = currentImageId ? getImageDraftById(currentImageId) : null;
  setEditHeadline((draft?.headline ?? result?.headline ?? "").slice(0, 55));
  setEditBody(draft?.body ?? result?.body ?? answers?.details ?? answers?.adCopy ?? answers?.mainBenefit ?? "");
  setEditCTA(normalizeOverlayCTA(draft?.overlay ?? result?.image_overlay_text ?? answers?.cta ?? ""));
}, [currentImageId, result, answers]);


 /* Debounced autosave of image edits */
useEffect(() => {
  if (!currentImageId) return;
  const t = setTimeout(() => {
    saveImageDraftById(currentImageId, {
      headline: (editHeadline || "").trim(),
      body: (editBody || "").trim(),
      overlay: normalizeOverlayCTA(editCTA || "")
    });
  }, 400);
  return () => clearTimeout(t);
}, [currentImageId, editHeadline, editBody, editCTA]);


  const displayHeadline = (
  editHeadline ||
  result?.headline ||
  answers?.mainBenefit ||
  answers?.businessName ||
  ""
).slice(0, 55);

  const displayBody =
  (editBody || result?.body || answers?.details || answers?.adCopy || answers?.mainBenefit || "").trim();

  const displayCTA = normalizeOverlayCTA(
  editCTA || result?.image_overlay_text || answers?.cta || ""
);


  /* Hard reset chat + draft */
  function hardResetChat() {
    if (!window.confirm("Reset the chat and clear saved progress for this form?")) return;
    try {
      localStorage.removeItem(FORM_DRAFT_KEY);
      localStorage.removeItem(CREATIVE_DRAFT_KEY);
      sessionStorage.removeItem("draft_form_creatives");
      localStorage.removeItem(IMAGE_DRAFTS_KEY);
    } catch {}
    setAnswers({});
    setStep(0);
    setChatHistory([
      { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign.` },
      { from: "gpt", text: "Are you ready to get started? (yes/no)" }
    ]);
    setInput("");
    setResult(null);
    setImageUrls([]);
    setVideoItems([]);
    setActiveImage(0);
    setActiveVideo(0);
    setImageUrl("");
    setVideoUrl("");
    setVideoScript("");
    setAwaitingReady(true);
    setError("");
    setGenerating(false);
    setLoading(false);
    setSideChatCount(0);
    setHasGenerated(false);
    setImageEditing(false);
    setEditHeadline("");
    setEditBody("");
    setEditCTA("");
  }

  /* Autosave whole session + creatives (throttled) */
  useEffect(() => {
    const t = setTimeout(() => {
      const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
      const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
      const mergedBody = activeDraft?.body || result?.body || "";

      const payload = {
        answers, step, chatHistory, mediaType, result: {
          ...(result || {}),
          headline: mergedHeadline,
          body: mergedBody
        },
        imageUrls, videoItems, activeImage, activeVideo,
        awaitingReady, input, sideChatCount, hasGenerated
      };
      localStorage.setItem(
        FORM_DRAFT_KEY,
        JSON.stringify({ savedAt: Date.now(), data: payload })
      );

      let imgs = imageUrls.slice(0, 2).map(abs);
      let vids = videoItems.map(v => v?.url).filter(Boolean).slice(0, 2).map(abs);
      let fbIds = videoItems.map(v => v?.fbVideoId).filter(Boolean).slice(0, 2);

      if (mediaType === "image") { vids = []; fbIds = []; }
      if (mediaType === "video") { imgs = []; }

      const draftForSetup = {
        images: imgs,
        videos: vids,
        fbVideoIds: fbIds,
        headline: mergedHeadline,
        body: mergedBody,
        imageOverlayCTA: normalizeOverlayCTA(activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""),
        videoScript: (videoItems[activeVideo]?.script || ""),
        answers,
        mediaSelection: mediaType,
        savedAt: Date.now()
      };

      localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
      sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
    }, 150);

    return () => clearTimeout(t);
  }, [
    answers, step, chatHistory, mediaType, result,
    imageUrls, videoItems, activeImage, activeVideo,
    awaitingReady, input, sideChatCount, hasGenerated,
    currentImageId, editHeadline, editBody, editCTA
  ]);

  function handleImageClick(url) { setShowModal(true); setModalImg(url); }
  function handleModalClose() { setShowModal(false); setModalImg(""); }

  /* ---- Ask OpenAI (side chat / FAQs) ---- */
  async function askGPT(userText) {
    try {
      const history = chatHistory.slice(-8).map(m => ({
        role: m.from === "gpt" ? "assistant" : "user",
        content: m.text
      }));
      history.push({ role: "user", content: userText });

      const data = await fetchJsonWithRetry(`${API_BASE}/gpt-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history })
      }, { tries: 3, warm: true });
      return data?.reply || null;
    } catch (e) {
      console.warn("gpt-chat failed:", e.message);
      return null;
    }
  }

  async function handleSideChat(userText, followUpPrompt) {
    if (sideChatCount >= SIDE_CHAT_LIMIT) {
      if (followUpPrompt) setChatHistory(ch => [...ch, { from: "gpt", text: followUpPrompt }]);
      return;
    }
    setSideChatCount(c => c + 1);
    const reply = await askGPT(userText);
    if (reply) setChatHistory(ch => [...ch, { from: "gpt", text: reply }]);
    if (followUpPrompt) setChatHistory(ch => [...ch, { from: "gpt", text: followUpPrompt }]);
  }

  /* ---- Chat flow ---- */
  async function handleUserInput(e) {
    e.preventDefault();
    if (loading) return;
    const value = (input || "").trim();
    if (!value) return;

    setChatHistory((ch) => [...ch, { from: "user", text: value }]);
    setInput("");

    if (awaitingReady) {
      if (
        /^(yes|yep|ready|start|go|let'?s (go|start)|ok|okay|yea|yeah|alright|i'?m ready|im ready|lets do it|sure)$/i.test(
          value
        )
      ) {
        setAwaitingReady(false);
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: CONVO_QUESTIONS[0].question },
        ]);
        setStep(0);
        return;
      } else if (/^(no|not yet|wait|hold on|nah|later)$/i.test(value)) {
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: "No problem! Just say 'ready' when you want to start." },
        ]);
        return;
      } else {
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: "Please reply 'yes' when you're ready to start!" },
        ]);
        return;
      }
    }

    const currentQ = CONVO_QUESTIONS[step];

    if (step >= CONVO_QUESTIONS.length) {
      if (!hasGenerated && isGenerateTrigger(value)) {
        setLoading(true);
        setGenerating(true);
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: "AI generating..." },
        ]);

        // inside handleUserInput, where you currently start generation:
setTimeout(async () => {
  const token = getRandomString();

  // Abort any stale in-flight jobs first
  abortAllVideoFetches();

  // Global hard cap
  const hardCap = setTimeout(() => {
    console.warn("Hard cap reached; aborting video fetches");
    abortAllVideoFetches();
    setGenerating(false);
    setLoading(false);
    setError("Taking too long. Please try again (we limit generation to ~100 seconds).");
  }, GENERATION_HARD_CAP_MS);

  // clear old previews
  try { setVideoItems([]); } catch {}
  try { setVideoUrl(""); setVideoScript(""); } catch {}
  try { setImageUrls([]); setImageUrl(""); } catch {}

  try {
    await warmBackend();

    // Kick off copy, images, and A/B videos in parallel
    const assetsPromise = fetchJsonWithRetry(
      `${API_BASE}/generate-campaign-assets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      },
      { tries: 1, timeoutMs: 12000 }
    ).catch(() => ({}));

const imagesPromise = (async () => {
  // Use answers-first mapping so the image matches what the user typed
  const poster = derivePosterFieldsFromAnswers(answers, { saveAmount: "BIG SAVINGS" });
const overlay = {
  headline: (displayHeadline || poster.headline || "").slice(0, 55),
  body: displayBody || poster.adCopy || "",
  cta: normalizeOverlayCTA(displayCTA || answers?.cta || "")
};

  const prompt = buildImagePrompt(answers, overlay);

  const imgs = await fetchImagesOnce(token, answers, overlay, prompt);
  setImageUrls(imgs || []);
  setActiveImage(0);
  setImageUrl((imgs && imgs[0]) || "");
})();



    const videosPromise = (async () => {
      const vs = await fetchVideoPair(token, answers, null, null);
      // warm (no throw on fail)
      await Promise.allSettled([
        headRangeWarm("VA", vs?.[0]?.url),
        headRangeWarm("VB", vs?.[1]?.url),
      ]);
      try {
        setVideoItems(vs || []);
        setActiveVideo(0);
        setVideoUrl(vs?.[0]?.url || "");
        setVideoScript(vs?.[0]?.script || "");
      } catch {}
    })();

    // ****** NEW: also generate a static PNG using your template (poster_b or flyer_a) ******
    const staticPromise = (async () => {
      await handleGenerateStaticAd("poster_b"); // change to "flyer_a" if you prefer that first
    })();
    // **************************************************************************************

    // Apply copy when it’s back (don’t block media)
    const data = await assetsPromise;
    setResult({
      headline: data?.headline || "",
      body: data?.body || "",
      image_overlay_text: data?.image_overlay_text || "",
    });

    // Consider generation “done” as soon as at least one media set finishes
    await Promise.any([imagesPromise, videosPromise, staticPromise]).catch(() => {});
    await Promise.allSettled([imagesPromise, videosPromise, staticPromise]);

    setChatHistory((ch) => [
      ...ch,
      { from: "gpt", text: "Done! Here are your ad previews. You can regenerate the image or video below." },
    ]);
    setHasGenerated(true);
  } catch (err) {
    console.error("generation failed:", err);
    setError("Generation failed (server cold or busy). Try again in a few seconds.");
  } finally {
    clearTimeout(hardCap);
    setGenerating(false);
    setLoading(false);
  }
}, 80);




        return;
      }

      if (hasGenerated) {
        await handleSideChat(value, null);
      } else {
        await handleSideChat(
          value,
          "Ready to generate your campaign? (yes/no)"
        );
      }
      return;
    }

    if (currentQ && isLikelySideChat(value, currentQ)) {
      await handleSideChat(
        value,
        `Ready for the next question?\n${currentQ.question}`
      );
      return;
    }

    if (currentQ) {
      let answerToSave = value;
      if (currentQ.key === "url") {
        const firstUrl = extractFirstUrl(value);
        if (firstUrl) answerToSave = firstUrl;
      }

      const newAnswers = { ...answers, [currentQ.key]: answerToSave };
      setAnswers(newAnswers);

      let nextStep = step + 1;
      while (
        CONVO_QUESTIONS[nextStep] &&
        CONVO_QUESTIONS[nextStep].conditional &&
        newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !==
          CONVO_QUESTIONS[nextStep].conditional.value
      ) {
        nextStep += 1;
      }

      if (!CONVO_QUESTIONS[nextStep]) {
        setChatHistory((ch) => [
          ...ch,
          {
            from: "gpt",
            text: "Are you ready for me to generate your campaign? (yes/no)",
          },
        ]);
        setStep(nextStep);
        return;
      }

      setStep(nextStep);
      setChatHistory((ch) => [
        ...ch,
        { from: "gpt", text: CONVO_QUESTIONS[nextStep].question },
      ]);
    }
  }

  // Cancel any in-flight fetches when component unmounts (or route changes)
  useEffect(() => {
    return () => {
      abortAllVideoFetches();
    };
  }, []);

  /* Regenerations (sequential with warmup/backoff) */
async function handleRegenerateImage() {
  setImageLoading(true);
  try {
    await warmBackend();

    const poster = derivePosterFieldsFromAnswers(answers, { saveAmount: "BIG SAVINGS" });
    const overlay = {
  headline: (displayHeadline || poster.headline || "").slice(0, 55),
  body: displayBody || poster.adCopy || "",
  cta: normalizeOverlayCTA(displayCTA || answers?.cta || "")
};

    const prompt = buildImagePrompt(answers, overlay);

    const imgs = await fetchImagesOnce(getRandomString(), answers, overlay, prompt);
    setImageUrls(imgs);
    setActiveImage(0);
    setImageUrl(imgs[0] || "");
  } finally {
    setImageLoading(false);
  }
}


async function handleRegenerateVideo() {
  setVideoLoading(true);
  abortAllVideoFetches();
  try { setVideoItems([]); setVideoUrl(""); setVideoScript(""); } catch {}

  const hardCap = setTimeout(() => {
    console.warn("Hard cap reached; aborting regen video fetches");
    abortAllVideoFetches();
    setVideoLoading(false);
    setError("Video regeneration took too long. Try again.");
  }, GENERATION_HARD_CAP_MS);

  try {
    await warmBackend();
    const token = getRandomString();

    const vids = await fetchVideoPair(token, answers, result, null);

    await Promise.allSettled([
      headRangeWarm("VA", vids?.[0]?.url),
      headRangeWarm("VB", vids?.[1]?.url),
    ]);

    try {
      setVideoItems(vids || []);
      setActiveVideo(0);
      setVideoUrl(vids?.[0]?.url || "");
      setVideoScript(vids?.[0]?.script || "");
    } catch {}
  } catch (e) {
    console.error("regenerate video failed:", e?.message || e);
    setError("Video regeneration failed. Please try again.");
  } finally {
    clearTimeout(hardCap);
    setVideoLoading(false);
  }
}

// --- Static Ad Generator (Templates A/B) — REPLACE ENTIRE BLOCK ---
async function handleGenerateStaticAd(template = "poster_b") {
  const a = answers || {};

  // 0) Ask backend to craft paraphrased ad copy (no verbatim echo)
  let craftedCopy = null;
  try {
    const craftRes = await fetch(`${API_BASE}/craft-ad-copy`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industry: (a.industry || "Local Services").toString(),
        businessName: (a.businessName || "Your Business").toString(),
        brand: a.brand || {},
        answers: a
      })
    });
    const craftJson = await craftRes.json().catch(() => ({}));
    if (craftRes.ok && craftJson?.ok && craftJson.copy) {
      craftedCopy = craftJson.copy;
    }
  } catch (e) {
    console.warn("craft-ad-copy failed, will proceed with defaults:", e);
  }

  // Overlay text to display (from edits or crafted copy)
  const display = {
    headline: (displayHeadline || craftedCopy?.headline || "").slice(0, 55),
    body: displayBody || craftedCopy?.subline || "",
    cta: normalizeOverlayCTA(displayCTA || craftedCopy?.cta || a?.cta || "")
  };

  // Build a reasonable mapping for Poster B from the chat answers (will be overridden by copy)
  const poster = derivePosterFieldsFromAnswers(a, { saveAmount: "BIG SAVINGS" });

  // Common inputs every template can use
  const common = {
    industry: (a.industry || "Local Services").toString(),
    businessName: (a.businessName || "Your Business").toString(),
    website: (a.url || "").toString(),
    location: a.city ? `${a.city}${a.state ? ", " + a.state : ""}` : (a.location || "Your City"),
    offer: (a.offer || "").toString(),
    mainBenefit: (a.mainBenefit || "").toString(),
    idealCustomer: (a.idealCustomer || "").toString(),
    phone: (a.phone || "(210) 555-0147").toString(),

    // Also send the visible overlay values for Flyer-A
    headline: display.headline,
    subline: display.body,
    cta: display.cta
  };

  // Knobs (template-specific)
  const knobs = template === "flyer_a"
    ? {
        size: "1080x1080",
        palette: {
          header: "#0d3b66",
          body: "#dff3f4",
          accent: "#ff8b4a",
          textOnDark: "#ffffff",
          textOnLight: "#2b3a44"
        },
        lists: {
          left: (a.frequencyList || ["One Time", "Weekly", "Bi-Weekly", "Monthly"]),
          right: (a.servicesList || ["Kitchen", "Bathrooms", "Offices", "Dusting", "Mopping", "Vacuuming"])
        },
        coverage: (a.coverage || "Coverage area 25 Miles around your city").toString(),
        showIcons: true,
        headerSplitDiagonal: true,
        roundedOuter: true
      }
    : {
        size: "1080x1080",
        frame: { outerWhite: true, softShadow: true },
        card: { widthPct: 70, heightPct: 55, shadow: true },

        // Prefer crafted copy FIRST for Poster-B fields
        eventTitle: (craftedCopy?.headline || poster.headline || `${common.industry} EVENT`).slice(0, 55),
        dateRange: (craftedCopy?.subline || poster.promoLine || "LIMITED TIME ONLY").slice(0, 60),
        saveAmount: (craftedCopy?.offer || poster.offer || "BIG SAVINGS").slice(0, 40),

        // We generally keep financing empty unless the business supplied a real one
        financingLine: poster.secondary || "",

        // Qualifiers become bullets/subline from crafted copy (joined)
        qualifiers: (craftedCopy
          ? [craftedCopy.subline, ...(Array.isArray(craftedCopy.bullets) ? craftedCopy.bullets : [])]
              .filter(Boolean)
              .join(" • ")
              .slice(0, 120)
          : (poster.adCopy || "")
        ),
        legal: (craftedCopy?.disclaimers || poster.legal || "").slice(0, 160),

        seasonalLeaves: true,
        backgroundHint: common.industry,
        backgroundUrl: poster.backgroundUrl || ""
      };

  // IMPORTANT: include raw user *answers* for context, but also include the crafted copy
  const payload = {
    template,
    inputs: common,
    knobs,
    copy: craftedCopy || null, // <— NEW: backend will prefer this over answers
    answers: {
      ...a,
      // Keep these for legacy fallback, but Poster-B will ignore them if copy exists
      headline: poster.headline,
      promoLine: poster.promoLine,
      offer: poster.offer,
      secondary: poster.secondary,
      adCopy: poster.adCopy,
      legal: poster.legal,
      backgroundUrl: poster.backgroundUrl
    }
  };

  try {
    const res = await fetch(`${API_BASE}/generate-static-ad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      const msg = data?.error || `Static ad generation failed (HTTP ${res.status})`;
      setError(msg);
      alert(msg);
      return;
    }

    const png = toAbsoluteMedia(data.pngUrl || data.absoluteUrl || data.url || data.filename || "");
    if (!png) {
      setError("Static ad returned without a URL.");
      alert("Static ad returned without a URL.");
      return;
    }

    setImageUrls([png, ...imageUrls.slice(0, 1)]);
    setActiveImage(0);
    setImageUrl(png);
    setMediaType(prev => (prev === "video" ? "both" : prev));

    setChatHistory(ch => [
      ...ch,
      { from: "gpt", text: `Static ad generated with template "${template}".` }
    ]);
  } catch (e) {
    console.error("Static ad error:", e);
    setError("Static ad failed. Please try again.");
    alert("Static ad failed. Please try again.");
  }
}





  /* ---------------------- Render ---------------------- */
  return (
    <div
      style={{
        background: DARK_BG,
        minHeight: "100vh",
        fontFamily: MODERN_FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* global smooth scroll & subtle glow */}
      <style>{`
        html, body { scroll-behavior: smooth; }
        .chat-scroll::-webkit-scrollbar { width: 8px; }
        .chat-scroll::-webkit-scrollbar-thumb { background: #2a3138; border-radius: 8px; }
        .chat-scroll::-webkit-scrollbar-track { background: #14181d; }
      `}</style>
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "-15vh",
          right: "-10vw",
          width: 640,
          height: 640,
          background: "radial-gradient(40% 40% at 50% 50%, rgba(20,231,185,0.22), transparent 70%)",
          filter: "blur(18px)",
          pointerEvents: "none",
          zIndex: 0
        }}
      />

      {/* Top row */}
      <div style={{ width: "100%", maxWidth: 980, padding: "24px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "#202824e0",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: "1.1rem",
              padding: "10px 18px",
              fontWeight: 700,
              fontSize: "1rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px 0 rgba(0,0,0,0.25)",
              display: "flex",
              alignItems: "center",
              gap: 8
            }}
            aria-label="Back"
          >
            <FaArrowLeft />
            Back
          </button>
        </div>

        {/* Centered title */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.25rem",
              lineHeight: 1.2,
              letterSpacing: "-0.5px",
              color: "#e9feff",
              textAlign: "center",
              fontWeight: 900,
            }}
          >
            Create your ad
          </h1>
        </div>
      </div>

      {/* Chat panel */}
      <div
        style={{
          width: "100%",
          maxWidth: 780,
          marginTop: 18,
          marginBottom: 22,
          background: SURFACE,
          borderRadius: 18,
          border: `1px solid ${EDGE}`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          padding: "28px 28px 22px 28px",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          zIndex: 1
        }}
      >
        <div style={{ color: "#9dffe9", fontSize: 15, fontWeight: 900, marginBottom: 10, letterSpacing: 1.6, textTransform: "uppercase", textAlign: "center" }}>
          AI Ad Manager
        </div>

        {/* history */}
        <div
          ref={chatBoxRef}
          className="chat-scroll"
          style={{
            width: "100%",
            minHeight: 240,
            maxHeight: 480,
            overflowY: "auto",
            marginBottom: 16,
            padding: 16,
            background: "#151a1f",
            borderRadius: 12,
            border: `1px solid ${EDGE}`,
            display: "flex",
            flexDirection: "column",
            gap: 10
          }}
        >
          {chatHistory.slice(-40).map((msg, i) => {
            const isGPT = msg.from === "gpt";
            return (
              <div
                key={i}
                style={{
                  alignSelf: isGPT ? "flex-start" : "flex-end",
                  color: isGPT ? "#d6fff8" : "#0e1519",
                  background: isGPT ? "#0f151a" : TEAL,
                  border: isGPT ? `1px solid ${EDGE}` : "none",
                  borderRadius: isGPT ? "14px 16px 16px 8px" : "16px 12px 8px 16px",
                  padding: "10px 14px",
                  maxWidth: "85%",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  boxShadow: isGPT ? "none" : `0 2px 12px ${TEAL_SOFT}`
                }}
              >
                {msg.text}
              </div>
            );
          })}
        </div>

        {/* prompt bar */}
        {!loading && (
          <form onSubmit={handleUserInput} style={{ width: "100%", display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={hardResetChat}
              title="Reset chat"
              aria-label="Reset chat"
              style={{
                background: "#23262a",
                color: "#9cefdc",
                border: `1px solid ${EDGE}`,
                borderRadius: 12,
                padding: "0 14px",
                height: 48,
                cursor: "pointer",
                boxShadow: `0 1.5px 8px ${TEAL_SOFT}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <FaSyncAlt />
            </button>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              autoFocus
              placeholder="Your answer…"
              aria-label="Your answer"
              autoComplete="off"
              style={{
                flex: 1,
                padding: "14px 18px",
                borderRadius: 12,
                border: `1px solid ${EDGE}`,
                outline: "none",
                fontSize: "1.05rem",
                fontWeight: 700,
                background: "#23262a",
                color: "#fff",
                boxShadow: `0 1.5px 8px ${TEAL_SOFT}`
              }}
            />
            <button
              type="submit"
              style={{
                background: TEAL,
                color: "#0e1519",
                border: "none",
                borderRadius: 12,
                fontWeight: 900,
                fontSize: "1.2rem",
                padding: "0 18px",
                cursor: "pointer",
                height: 48
              }}
              disabled={loading}
              tabIndex={0}
              aria-label="Send"
            >
              <FaArrowUp />
            </button>
          </form>
        )}

        {loading && <div style={{ color: "#15efb8", marginTop: 10, fontWeight: 700, textAlign: "center" }}>AI generating...</div>}
        {error && <div style={{ color: "#f35e68", marginTop: 18, textAlign: "center" }}>{error}</div>}
      </div>

      {/* MediaType Toggle */}
      <MediaTypeToggle mediaType={mediaType} setMediaType={setMediaType} />

      {/* Ad Previews label */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 4, marginBottom: 10 }}>
        <div style={{ color: "#bdfdf0", fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>
          Ad Previews
        </div>
      </div>

      {/* ---- Ad Preview Cards ---- */}
      <div style={{ display: "flex", justifyContent: "center", gap: 34, flexWrap: "wrap", width: "100%", paddingBottom: 8 }}>
        {/* IMAGE CARD */}
        <div style={{
          background: "#fff",
          borderRadius: 13,
          boxShadow: "0 2px 24px #16242714",
          minWidth: 340,
          maxWidth: 390,
          flex: mediaType === "video" ? 0 : 1,
          marginBottom: 20,
          padding: "0px 0px 14px 0px",
          border: "1.5px solid #eaeaea",
          fontFamily: AD_FONT,
          display: mediaType === "video" ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            background: "#f5f6fa",
            padding: "11px 20px",
            borderBottom: "1px solid #e0e4eb",
            fontWeight: 700,
            color: "#495a68",
            fontSize: 16,
            letterSpacing: 0.08,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>Sponsored · <span style={{ color: "#12cbb8" }}>SmartMark</span></span>
            <button
              style={{
                background: "#1ad6b7",
                color: "#222",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.01rem",
                padding: "6px 20px",
                cursor: imageLoading ? "not-allowed" : "pointer",
                marginLeft: 8,
                boxShadow: "0 2px 7px #19e5b733",
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
              onClick={handleRegenerateImage}
              disabled={imageLoading}
              title="Regenerate Image Ad"
            >
              <FaSyncAlt style={{ fontSize: 16 }} />
              {imageLoading || generating ? <Dotty /> : "Regenerate"}
            </button>
          </div>

          {/* Carousel body */}
          <div style={{ background: "#222", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220 }}>
            {imageLoading || generating ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : imageUrls.length > 0 ? (
              <>
                <img
                  src={toAbsoluteMedia(imageUrls[activeImage] || "")}
                  alt="Ad Preview"
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 0,
                    cursor: "pointer"
                  }}
                  onClick={() => handleImageClick(imageUrls[activeImage])}
                />
                <Arrow side="left" onClick={() => setActiveImage((activeImage + imageUrls.length - 1) % imageUrls.length)} disabled={imageUrls.length <= 1} />
                <Arrow side="right" onClick={() => setActiveImage((activeImage + 1) % imageUrls.length)} disabled={imageUrls.length <= 1} />
                <Dots count={imageUrls.length} active={activeImage} onClick={setActiveImage} />
              </>
            ) : (
              <div style={{
                height: 220,
                width: "100%",
                background: "#e9ecef",
                color: "#a9abb0",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22
              }}>Image goes here</div>
            )}
          </div>

          {/* Copy block */}
          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {displayHeadline}
            </div>
            <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 3, minHeight: 18 }}>
              {displayBody}
            </div>
          </div>
          <div style={{ padding: "8px 18px", marginTop: 2 }}>
            <button style={{
              background: "#14e7b9",
              color: "#181b20",
              fontWeight: 700,
              border: "none",
              borderRadius: 9,
              padding: "8px 20px",
              fontSize: 15,
              cursor: "pointer"
            }}>{displayCTA}</button>
          </div>

          {/* Image Edit toggle + fields */}
          <button
            style={{
              position: "absolute",
              bottom: 10,
              right: 18,
              background: "#f3f6f7",
              color: "#12cbb8",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "1.05rem",
              padding: "5px 14px",
              cursor: "pointer",
              boxShadow: "0 1px 3px #2bcbb828",
              display: "flex",
              alignItems: "center",
              gap: 5,
              zIndex: 2
            }}
            onClick={() => setImageEditing(v => !v)}
          >
            {imageEditing ? "Done" : "Edit"}
          </button>

          {imageEditing && (
            <div style={{ padding: "10px 18px 4px 18px", display: "grid", gap: 10 }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>Headline (max 55 chars)</div>
                <input
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value.slice(0, 55))}
                  onBlur={() => saveImageDraftById(currentImageId, { headline: (editHeadline || "").trim() })}
                  placeholder="Headline"
                  maxLength={55}
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 700
                  }}
                />
                <div style={{ fontSize: 11, color: "#9aa6b2", marginTop: 4 }}>{editHeadline.length}/55</div>
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>Body (18–30 words)</div>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onBlur={() => saveImageDraftById(currentImageId, { body: (editBody || "").trim() })}
                  rows={3}
                  placeholder="Body copy"
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 600
                  }}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>CTA (e.g., Shop now, Learn more)</div>
                <input
                  value={editCTA}
                  onChange={(e) => setEditCTA(e.target.value)}
                  onBlur={() => setEditCTA(normalizeOverlayCTA(editCTA))}
                  placeholder="CTA"
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 700
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* VIDEO CARD */}
        <div style={{
          background: "#fff",
          borderRadius: 13,
          boxShadow: "0 2px 24px #16242714",
          minWidth: 340,
          maxWidth: 390,
          flex: mediaType === "image" ? 0 : 1,
          marginBottom: 20,
          padding: "0px 0px 14px 0px",
          border: "1.5px solid #eaeaea",
          fontFamily: AD_FONT,
          display: mediaType === "image" ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            background: "#f5f6fa",
            padding: "11px 20px",
            borderBottom: "1px solid #e0e4eb",
            fontWeight: 700,
            color: "#495a68",
            fontSize: 16,
            letterSpacing: 0.08,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>Sponsored · <span style={{ color: "#12cbb8" }}>SmartMark</span></span>
            <button
              style={{
                background: "#1ad6b7",
                color: "#222",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.01rem",
                padding: "6px 20px",
                cursor: videoLoading ? "not-allowed" : "pointer",
                marginLeft: 8,
                boxShadow: "0 2px 7px #19e5b733",
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
              onClick={handleRegenerateVideo}
              disabled={videoLoading}
              title="Regenerate Video Ad"
            >
              <FaSyncAlt style={{ fontSize: 16 }} />
              {videoLoading || generating ? <Dotty /> : "Regenerate"}
            </button>
          </div>

      {/* Carousel body */}
<div style={{ background: "#222", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220 }}>
  {videoLoading || generating ? (
    <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Dotty />
    </div>
  ) : videoItems.length > 0 ? (
    <>
      <video
        key={`${videoItems[activeVideo]?.url || "video"}-${activeVideo}`}
        src={toAbsoluteMedia(videoItems[activeVideo]?.url || "")}
        controls
        playsInline
        muted
        preload="metadata"
        style={{ width: "100%", maxHeight: 220, borderRadius: 0, background: "#111" }}
      >
        {/* If backend provided a sidecar VTT (when not burned-in), attach it */}
        {videoItems[activeVideo]?.captionsVtt && (
          <track
            src={toAbsoluteMedia(videoItems[activeVideo].captionsVtt)}
            kind="captions"
            srcLang="en"
            label="English"
            default
          />
        )}
      </video>

      <Arrow side="left" onClick={() => {
        const next = (activeVideo + videoItems.length - 1) % videoItems.length;
        setActiveVideo(next);
        setVideoUrl(videoItems[next]?.url || "");
        setVideoScript(videoItems[next]?.script || "");
      }} disabled={videoItems.length <= 1} />
      <Arrow side="right" onClick={() => {
        const next = (activeVideo + 1) % videoItems.length;
        setActiveVideo(next);
        setVideoUrl(videoItems[next]?.url || "");
        setVideoScript(videoItems[next]?.script || "");
      }} disabled={videoItems.length <= 1} />
      <Dots count={videoItems.length} active={activeVideo} onClick={(i) => {
        setActiveVideo(i);
        setVideoUrl(videoItems[i]?.url || "");
        setVideoScript(videoItems[i]?.script || "");
      }} />
    </>
  ) : (
    <div style={{
      height: 220,
      width: "100%",
      background: "#e9ecef",
      color: "#a9abb0",
      fontWeight: 700,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: 22
    }}>Video goes here</div>
  )}
</div>


          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {result?.headline || "Welcome New Customers Instantly!"}
            </div>
            {videoItems.length > 0 && (videoItems[activeVideo]?.script || videoScript) && (
              <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 3, minHeight: 18 }}>
                <b>Script:</b> {videoItems[activeVideo]?.script || videoScript}
              </div>
            )}
          </div>
          <div style={{ padding: "8px 18px", marginTop: 2 }}>
            <button style={{
              background: "#14e7b9",
              color: "#181b20",
              fontWeight: 700,
              border: "none",
              borderRadius: 9,
              padding: "8px 20px",
              fontSize: 15,
              cursor: "pointer"
            }}>Learn More</button>
          </div>
        </div>
      </div>

      {/* Continue */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 10, paddingBottom: 28 }}>
        <button
          style={{
            background: TEAL,
            color: "#0e1519",
            border: "none",
            borderRadius: 13,
            fontWeight: 900,
            fontSize: "1.08rem",
            padding: "16px 56px",
            marginBottom: 4,
            fontFamily: MODERN_FONT,
            boxShadow: `0 2px 16px ${TEAL_SOFT}`,
            cursor: "pointer",
            transition: "background 0.18s"
          }}
          onClick={() => {
            const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
            const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
            const mergedBody = activeDraft?.body || result?.body || "";
            const mergedCTA = normalizeOverlayCTA(activeDraft?.overlay || result?.image_overlay_text || answers?.cta || "");


            let imgA = imageUrls.map(abs).slice(0, 2);
            let vidA = videoItems.map(v => abs(v.url)).slice(0, 2);
            let fbIds = videoItems.map(v => v.fbVideoId).filter(Boolean).slice(0, 2);

            if (mediaType === "image") { vidA = []; fbIds = []; }
            if (mediaType === "video") { imgA = []; }

            const draftForSetup = {
              images: imgA,
              videos: vidA,
              fbVideoIds: fbIds,
              headline: mergedHeadline,
              body: mergedBody,
              imageOverlayCTA: mergedCTA,
              videoScript: videoItems[0]?.script || videoScript || "",
              answers,
              mediaSelection: mediaType,
              savedAt: Date.now()
            };

            sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
            localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
            localStorage.setItem("smartmark_media_selection", mediaType);

            if (imgA[0]) localStorage.setItem("smartmark_last_image_url", imgA[0]);
            if (vidA[0]) localStorage.setItem("smartmark_last_video_url", vidA[0]);
            if (fbIds[0]) localStorage.setItem("smartmark_last_fb_video_id", String(fbIds[0]));

            navigate("/setup", {
              state: {
                imageUrls: imgA,
                videoUrls: vidA,
                fbVideoIds: fbIds,
                headline: mergedHeadline,
                body: mergedBody,
                imageOverlayCTA: mergedCTA,
                videoScript: videoItems[0]?.script || videoScript,
                answers,
                mediaSelection: mediaType
              }
            });
          }}
        >
          Continue
        </button>
      </div>

      <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />
    </div>
  );
}

/* ===== Conversation questions ===== */
const CONVO_QUESTIONS = [
  { key: "url", question: "What's your website URL?" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "idealCustomer", question: "Describe your ideal customer in one sentence." },
  { key: "hasOffer", question: "Do you have a special offer or promo? (yes/no)" },
  { key: "offer", question: "What is your offer/promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or transformation you promise?" }
];
