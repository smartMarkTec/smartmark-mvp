/* eslint-disable */
// src/pages/FormPage.js
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaSyncAlt, FaTimes, FaArrowUp, FaArrowLeft } from "react-icons/fa";
import { trackEvent } from "../analytics/gaEvents";


/* --------- Palette / fonts --------- */
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const DARK_BG = "linear-gradient(115deg, #efede8 0%, #ebe8e2 34%, #e8e6ef 68%, #dddaf0 100%)";
const SURFACE = "rgba(248,246,242,0.82)";
const TEAL = "#8f87ff";
const TEAL_SOFT = "rgba(143,135,255,0.14)";
const EDGE = "rgba(108,101,145,0.10)";
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

/* -------- Creative angle definitions (multi-ad test) -------- */
const CREATIVE_ANGLES = [
  { id: "offer",   label: "Offer Angle",       description: "Focus on special offer or promotion" },
  { id: "problem", label: "Problem Angle",      description: "Focus on customer pain point" },
  { id: "trust",   label: "Local Trust Angle",  description: "Focus on local expertise and trust" },
  { id: "urgency", label: "Urgency Angle",       description: "Focus on immediate action" },
];
function getAnglesForCount(n) {
  return CREATIVE_ANGLES.slice(0, Math.min(n, CREATIVE_ANGLES.length));
}

/* -------- Draft persistence -------- */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const FORM_DRAFT_KEY = "sm_form_draft_v3";
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v3";

/* -------- Image preview cache (24h) --------
   Goal: keep previews visible even if /generated files disappear after deploy/restart.
   We store Data URLs for the 2 images so the UI doesn't need to regenerate.
*/
const IMAGE_CACHE_KEY = "sm_image_cache_v1";
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ✅ Active run context (prevents old industry/copy bleeding across back/forward/OAuth)
const ACTIVE_CTX_KEY = "sm_active_ctx_v2";

/* -------- Per-user storage namespacing (prevents shared-browser mixing) -------- */
const USER_NS_KEY = "sm_user_ns_v1"; // stores username/email for namespacing

function getUserNS() {
  try {
    return (
      sessionStorage.getItem(USER_NS_KEY) ||
      localStorage.getItem(USER_NS_KEY) ||
      "anon"
    );
  } catch {
    return "anon";
  }
}

function setUserNS(v) {
  const s = String(v || "").trim() || "anon";
  try {
    sessionStorage.setItem(USER_NS_KEY, s);
    localStorage.setItem(USER_NS_KEY, s);
  } catch {}
}

// Namespaced key: u:<user>:<baseKey>
function nsKey(baseKey) {
  return `u:${getUserNS()}:${baseKey}`;
}

// LocalStorage wrappers (read falls back to legacy key once, write/remove is namespaced)
function lsGet(baseKey) {
  try {
    return localStorage.getItem(nsKey(baseKey)) ?? localStorage.getItem(baseKey);
  } catch {
    return null;
  }
}
function lsSet(baseKey, value) {
  try {
    localStorage.setItem(nsKey(baseKey), value);
  } catch {}
}
function lsRemove(baseKey) {
  try {
    localStorage.removeItem(nsKey(baseKey));
    // do NOT remove baseKey here — that could wipe another user on shared browser
  } catch {}
}

// SessionStorage wrappers
function ssGet(baseKey) {
  try {
    return sessionStorage.getItem(nsKey(baseKey)) ?? sessionStorage.getItem(baseKey);
  } catch {
    return null;
  }
}
function ssSet(baseKey, value) {
  try {
    sessionStorage.setItem(nsKey(baseKey), value);
  } catch {}
}
function ssRemove(baseKey) {
  try {
    sessionStorage.removeItem(nsKey(baseKey));
  } catch {}
}

// Appends ?adminClientId=<id> (or &adminClientId=<id>) to a path when in admin mode.
// Always use this instead of hardcoded "/form" or "/setup" strings in navigate calls.
function withAdminClientQuery(path, adminClientId) {
  if (!adminClientId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`;
}

function getActiveCtx() {
  return ssGet(ACTIVE_CTX_KEY) || lsGet(ACTIVE_CTX_KEY) || "";
}
function setActiveCtx(ctxKey) {
  const k = String(ctxKey || "").trim();
  if (!k) return;
  ssSet(ACTIVE_CTX_KEY, k);
  lsSet(ACTIVE_CTX_KEY, k); // survives OAuth reload
}

function buildCtxKey(a = {}) {
  const bn = String(a.businessName || "").trim().toLowerCase();
  const ind = String(a.industry || "").trim().toLowerCase();
  const url = String(a.url || "").trim().toLowerCase();
  return `${Date.now()}|${bn}|${ind}|${url}`;
}

/* ===== robust URL normalizer ===== */
function toAbsoluteMedia(u) {
  if (!u) return "";
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("/")) return s;
  if (s.startsWith("api/")) return "/" + s;
  if (s.startsWith("media/")) return "/api/" + s;
  return s;
}

/* -------- Image preview cache helpers (namespaced) -------- */
function loadImageCache(ctxKey = "") {
  try {
    const raw = lsGet(IMAGE_CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c?.savedAt) return null;
    if (Date.now() - Number(c.savedAt) > IMAGE_CACHE_TTL_MS) return null;
    if (ctxKey && c.ctxKey && String(c.ctxKey) !== String(ctxKey)) return null;
    return c;
  } catch {
    return null;
  }
}

function saveImageCache(payload) {
  try {
    lsSet(IMAGE_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

async function urlToDataUrl(url) {
  const absUrl = toAbsoluteMedia(url);
  if (!absUrl) throw new Error("no url");
  // Note: for same-origin /api/media this works fine.
  const res = await fetch(absUrl, { cache: "force-cache" });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = reject;
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function cacheImagesFor24h(ctxKey, urls) {
  const cleanUrls = (urls || []).filter(Boolean).slice(0, 2);
  if (!cleanUrls.length) return null;

  // If already cached for this ctx, keep it
  const existing = loadImageCache(ctxKey);
  if (existing?.dataUrls?.filter(Boolean)?.length) return existing;

  const dataUrls = await Promise.all(
    cleanUrls.map(async (u) => {
      try {
        return await urlToDataUrl(u);
      } catch {
        return null;
      }
    })
  );

  const payload = {
    ctxKey,
    urls: cleanUrls.map(toAbsoluteMedia),
    dataUrls, // preferred for preview + for passing to /setup + FB upload
    savedAt: Date.now(),
    expiresAt: Date.now() + IMAGE_CACHE_TTL_MS,
  };

  saveImageCache(payload);
  return payload;
}

// ✅ If saved creatives don't match activeCtx, purge them (NAMESPACED + global fallback cleanup)
function purgeCreativeDraftKeys() {
  try {
    lsRemove(CREATIVE_DRAFT_KEY);
    lsRemove("sm_setup_creatives_backup_v1");
    ssRemove("draft_form_creatives");
    ssRemove("draft_form_creatives_v2");
    // also clear a couple legacy direct keys (safe)
    try {
      sessionStorage.removeItem("draft_form_creatives");
      sessionStorage.removeItem("draft_form_creatives_v2");
    } catch {}
  } catch {}

  // Remove bare global keys that survive namespace-scoped lsRemove.
  // These are the primary source of stale draft creatives reappearing in CampaignSetup
  // when the user's namespace (SID) has changed between sessions.
  try { localStorage.removeItem(CREATIVE_DRAFT_KEY); } catch {}
  try { localStorage.removeItem(IMAGE_DRAFTS_KEY); } catch {}
  try { localStorage.removeItem("sm_setup_creatives_backup_v1"); } catch {}

  // Remove any stale SID-namespaced keys from old sessions (u:oldSid:draft_form_creatives_v3).
  // Safe to iterate here: we only remove exact suffix matches on draft/image-drafts keys.
  try {
    const draftSuffix = `:${CREATIVE_DRAFT_KEY}`;
    const imageSuffix = `:${IMAGE_DRAFTS_KEY}`;
    const backupSuffix = `:sm_setup_creatives_backup_v1`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.endsWith(draftSuffix) ||
        k.endsWith(imageSuffix) ||
        k.endsWith(backupSuffix)
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {}
}

function purgeLegacyDraftKeys() {
  try {
    // Remove old exact keys (non-namespaced)
    [
      "sm_form_draft_v2",
      "draft_form_creatives_v2",
      "sm_setup_creatives_backup_v1",
      "sm_active_ctx_v1",
    ].forEach((k) => {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {}
    });

    // Remove namespaced keys like: u:$willkan:sm_form_draft_v2
    const killSuffixes = [
      ":sm_form_draft_v2",
      ":draft_form_creatives_v2",
      ":sm_setup_creatives_backup_v1",
      ":sm_active_ctx_v1",
    ];

    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (killSuffixes.some((s) => key.endsWith(s))) localStorage.removeItem(key);
    }

    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      if (killSuffixes.some((s) => key.endsWith(s))) sessionStorage.removeItem(key);
    }
  } catch {}
}

// Creatives should stick around longer than the chat draft
const CREATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ✅ After a successful launch, CampaignSetup disables drafts so FormPage must stop restoring/persisting them.
// We check a few possible keys (covers legacy + namespaced).
const DRAFT_DISABLED_KEYS = [
  "sm_setup_draft_disabled_v1",
  "sm_draft_disabled_v1",
  "sm_setup_draft_disabled",
];

function isDraftDisabled() {
  try {
    const user = getUserNS();
    for (const k of DRAFT_DISABLED_KEYS) {
      const v1 = localStorage.getItem(`u:${user}:${k}`);
      const v2 = localStorage.getItem(k);
      const v3 = sessionStorage.getItem(`u:${user}:${k}`);
      const v4 = sessionStorage.getItem(k);
      const v = (v1 ?? v2 ?? v3 ?? v4 ?? "").toString().trim().toLowerCase();
      if (v === "1" || v === "true" || v === "yes") return true;
    }
  } catch {}
  return false;
}

// ✅ IMPORTANT: when starting a NEW run, re-enable draft saving (otherwise nothing persists)
function clearDraftDisabled() {
  try {
    const user = getUserNS();
    for (const k of DRAFT_DISABLED_KEYS) {
      try {
        localStorage.removeItem(`u:${user}:${k}`);
        sessionStorage.removeItem(`u:${user}:${k}`);
      } catch {}
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {}
    }
  } catch {}
}



/* -------- Image generation spend guard -------- */
const IMAGE_GEN_QUOTA_KEY = "sm_image_gen_quota_v1";
const IMAGE_GEN_WINDOW_MS = 24 * 60 * 60 * 1000;
// Plan-aware limit — updated from whoami on mount; defaults to 3 (Standard) until resolved
let IMAGE_GEN_MAX_RUNS_PER_WINDOW = 3;

function loadGenQuota() {
  try {
    const raw = lsGet(IMAGE_GEN_QUOTA_KEY);
    const now = Date.now();
    if (!raw) return { used: 0, resetAt: now + IMAGE_GEN_WINDOW_MS };
    const q = JSON.parse(raw);
    if (!q?.resetAt || now > q.resetAt) return { used: 0, resetAt: now + IMAGE_GEN_WINDOW_MS };
    return { used: Number(q.used || 0), resetAt: Number(q.resetAt) };
  } catch {
    const now = Date.now();
    return { used: 0, resetAt: now + IMAGE_GEN_WINDOW_MS };
  }
}
function saveGenQuota(q) {
  try {
    lsSet(IMAGE_GEN_QUOTA_KEY, JSON.stringify(q));
  } catch {}
}
function canRunImageGen() {
  const q = loadGenQuota();
  return q.used < IMAGE_GEN_MAX_RUNS_PER_WINDOW;
}
function bumpImageGenCount() {
  const q = loadGenQuota();
  const next = { ...q, used: (q.used || 0) + 1 };
  saveGenQuota(next);
  return next;
}
function quotaMessage() {
  const q = loadGenQuota();
  const remaining = Math.max(0, IMAGE_GEN_MAX_RUNS_PER_WINDOW - (q.used || 0));
  const totalMins = Math.max(1, Math.ceil((q.resetAt - Date.now()) / 60000));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  const resetStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
  return `Image generation limit reached for today. Remaining runs: ${remaining}. Try again in about ${resetStr}.`;
}

/* -------- Image copy edit store -------- */
const IMAGE_DRAFTS_KEY = "smartmark.imageDrafts.v1";
const ALLOWED_CTAS = [
  "Shop now",
  "Buy now",
  "Learn more",
  "Visit us",
  "Check us out",
  "Take a look",
  "Get started",
];

/* ===== image draft helpers (NAMESPACED) ===== */
function loadImageDrafts() {
  try {
    return JSON.parse(lsGet(IMAGE_DRAFTS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveImageDrafts(map) {
  try {
    lsSet(IMAGE_DRAFTS_KEY, JSON.stringify(map));
  } catch {}
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
  const match = ALLOWED_CTAS.find((c) => c.toLowerCase() === plain);
  const chosen = match || plain;
  return chosen.replace(/\b\w/g, (c) => c.toUpperCase());
}
function creativeIdFromUrl(url = "") {
  return `img:${url}`;
}

/* ===== small UI bits ===== */
function Dotty() {
  return (
    <span style={{ display: "inline-block", minWidth: 60, letterSpacing: 4 }}>
      <span className="dotty-dot" style={dotStyle(0)}>
        .
      </span>
      <span className="dotty-dot" style={dotStyle(1)}>
        .
      </span>
      <span className="dotty-dot" style={dotStyle(2)}>
        .
      </span>
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
  return {
    display: "inline-block",
    margin: "0 3px",
    fontSize: 36,
    color: TEAL,
    animationDelay: `${n * 0.13}s`,
  };
}

function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(10,12,15,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: "relative",
          background: SURFACE,
          borderRadius: 18,
          boxShadow: "0 0 40px #0008",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 2,
            background: "#23262a",
            color: "#fff",
            border: "none",
            borderRadius: 20,
            padding: 8,
            cursor: "pointer",
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
            fontFamily: AD_FONT,
          }}
        />
      </div>
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
        width: 34,
        height: 34,
        borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 0.85,
        zIndex: 3,
        willChange: "transform",
      }}
      aria-label={side === "left" ? "Previous" : "Next"}
      title={side === "left" ? "Previous" : "Next"}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        {side === "left" ? (
          <path
            d="M12.5 15L7.5 10L12.5 5"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M7.5 5L12.5 10L7.5 15"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

function Dots({ count, active, onClick }) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 8,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 8,
        zIndex: 3,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onClick(i)}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            border: "none",
            background: i === active ? TEAL : "rgba(255,255,255,0.55)",
            cursor: "pointer",
            opacity: i === active ? 1 : 0.7,
          }}
          aria-label={`Go to slide ${i + 1}`}
          title={`Slide ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ===== helpers ===== */
function derivePosterFieldsFromAnswers(a = {}, fallback = {}) {
  const safe = (s) => String(s || "").trim();

  const headline = a.headline || a.eventTitle || a.businessName || "";
  const promoLine = a.promoLine || a.subline || a.idealCustomer || "";
  const offer = a.offer || a.saveAmount || "";
  const secondary = a.secondary || a.financingLine || "";
  const adCopy = a.adCopy || a.details || "";
  const legal = a.legal || "";
  const backgroundUrl = a.backgroundUrl || fallback.backgroundUrl || "";

  return {
    headline: safe(headline).slice(0, 55),
    promoLine: safe(promoLine),
    offer: safe(offer),
    secondary: safe(secondary),
    adCopy: safe(adCopy),
    legal: safe(legal),
    backgroundUrl,
  };
}

const CONTROLLER_TIMEOUT_MS = 22000;
const IMAGE_FETCH_TIMEOUT_MS = 38000;

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
    try {
      await warmBackend();
    } catch {}
  }
  while (attempt < tries) {
    try {
      const res = await fetchWithTimeout(url, { mode: "cors", credentials: "omit", ...opts }, timeoutMs);
      if (!res.ok) {
        if ([429, 502, 503, 504].includes(res.status)) throw new Error(String(res.status));
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${res.statusText} ${text}`.trim());
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      const backoff = 400 * Math.pow(1.7, attempt) + Math.floor(Math.random() * 180);
      await new Promise((r) => setTimeout(r, backoff));
      attempt++;
    }
  }
  throw lastErr || new Error("request failed");
}

async function warmBackend() {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/test`, { mode: "cors", credentials: "omit" }, 5000);
    if (!res.ok) throw new Error(`warmup ${res.status}`);
    return true;
  } catch {
    try {
      await fetchWithTimeout(`${API_BASE}/test`, { mode: "cors", credentials: "omit" }, 5000);
    } catch {}
    return false;
  }
}

function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}
function isGenerateTrigger(input) {
  return /^(yes|y|i'?m ready|lets? do it|generate|go ahead|start|sure|ok)$/i.test(input.trim());
}

const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;
function stripUrls(s = "") {
  return (s || "").replace(URL_REGEX, "");
}
function extractFirstUrl(s = "") {
  const m = (s || "").match(URL_REGEX);
  return m ? m[0] : null;
}

function normalizeUrlForCopy(u) {
  let s = String(u || "").trim();
  if (!s || /^none$/i.test(s)) return "";
  if (/^www\./i.test(s)) s = `https://${s}`;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function formatPhoneDisplay(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return String(raw || "").trim(); // return as-is if format not recognized
}

function appendUrlToCopy(body, url) {
  const u = normalizeUrlForCopy(url);
  const b = String(body || "").trim();
  if (!u) return b;
  if (!b) return `Learn more: ${u}`;

  const bLow = b.toLowerCase();
  const uLow = u.toLowerCase();
  const rawLow = String(url || "").trim().toLowerCase();

  if (bLow.includes(uLow) || (rawLow && bLow.includes(rawLow))) return b;
  return `${b}\n\nLearn more: ${u}`;
}

function stripTrailingLearnMore(body = "") {
  return String(body || "")
    .replace(/\n*\s*learn more:\s*(https?:\/\/\S+)\s*$/i, "")
    .trim();
}

function extractTrailingLearnMoreUrl(body = "") {
  const m = String(body || "").match(/\n*\s*learn more:\s*(https?:\/\/\S+)\s*$/i);
  return m ? m[1] : "";
}

function prettyLink(u = "") {
  try {
    const x = new URL(normalizeUrlForCopy(u));
    const host = x.hostname.replace(/^www\./i, "");
    const path = (x.pathname || "/").replace(/\/$/, "");
    const shown = (host + (path && path !== "/" ? path : "")).slice(0, 48);
    return shown + ((host + path).length > 48 ? "…" : "");
  } catch {
    const s = String(u || "").trim();
    return s.length > 48 ? s.slice(0, 48) + "…" : s;
  }
}


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
  const reactionOnly =
    /^(wow|omg|thanks?|thank you|awesome|amazing|incredible|insane|crazy|cool|love it|love this)(\b|!|\.|$)/;
  const hasBang = t.includes("!");
  const veryShort = t.split(/\s+/).filter(Boolean).length <= 4;
  return (veryShort && reactionOnly.test(t)) || (veryShort && hasBang);
}
function isLikelySideChat(s, currentQ) {
  if (isLikelyQuestion(s) || isLikelySideStatement(s)) return true;
  const t = (s || "").trim();
  if (!currentQ) return false;

  if (currentQ.key === "url") {
    const isNoWebsite = /^(none|no|n\/a|nope|skip|don'?t have one|no website|not yet)$/i.test(t);
    if (isNoWebsite) return false;
    const hasUrl = !!extractFirstUrl(t);
    return !hasUrl && t.split(/\s+/).length > 3;
  }
  if (currentQ.key === "phone") {
    return t.length > 40;
  }
  if (currentQ.key === "hasOffer") {
    return !/^(yes|no|y|n)$/i.test(t);
  }
  if (currentQ.key === "city") {
    return t.length > 60;
  }
  if (currentQ.key === "state") {
    return t.length > 30;
  }
  if (currentQ.key === "industry" || currentQ.key === "businessName") {
    return t.length > 80;
  }
  return false;
}

/* --- GPT copy summarizer --- */
// angle: "offer" | "problem" | "trust" | "urgency" | "" (random)
async function summarizeAdCopy(answers, { regenerateToken = "", variant = "", angle = "" } = {}) {
  const url = `${API_BASE}/summarize-ad-copy`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, regenerateToken, variant, ...(angle ? { angle } : {}) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) throw new Error(`summarize failed ${res.status}`);
    return json.copy || {};
  } catch (e) {
    console.error("[SM][summarizeAdCopy:ERR]", e?.message || e);
    return {};
  }
}

function normalizeSmartCopy(raw = {}, answers = {}) {
  return {
    headline: String(raw?.headline || "").trim(),
    subline: String(raw?.subline || raw?.body || "").trim(),
    offer: String(raw?.offer || "").trim(),
    secondary: String(raw?.secondary || "").trim(),
    bullets: Array.isArray(raw?.bullets) ? raw.bullets : [],
    disclaimers: String(raw?.disclaimers || "").trim(),
    cta: String(raw?.cta || answers?.cta || "Learn more").trim(),
  };
}

function syncCreativesToDraftKeys({ ctxKey, imageUrls, headline, body, overlay, answers, mediaSelection, adminClientId }) {
  try {
   const imgs = (imageUrls || []).filter(Boolean).slice(0, 1).map(toAbsoluteMedia);
    const resolvedCtxKey = ctxKey || getActiveCtx();

    const payload = {
      ctxKey: resolvedCtxKey,
      images: imgs,
      headline: (headline || "").toString().trim().slice(0, 55),
      body: (body || "").toString().trim(),
      imageOverlayCTA: (overlay || "").toString().trim(),
      answers: answers && typeof answers === "object" ? answers : {},
      mediaSelection: mediaSelection || "image",
      ...(adminClientId ? { adminClientId } : {}),
      savedAt: Date.now(),
      expiresAt: Date.now() + CREATIVE_TTL_MS,
    };

    console.debug("[Creative Draft Saved]", { ctxKey: resolvedCtxKey, adminClientId: adminClientId || null, mediaSelection: payload.mediaSelection, imageUrls: imgs });

    if (adminClientId) {
      // Admin-client mode: persist under the client's own namespace.
      // Never writes to TheBoss's namespace or bare global keys.
      const clientNs = `adminClient:${adminClientId}`;
      localStorage.setItem(`u:${clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(payload));
      localStorage.setItem(`u:${clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(payload));
    } else {
      // Normal user mode: use the existing namespace-aware writers (keyed by getUserNS()).
      lsSet(CREATIVE_DRAFT_KEY, JSON.stringify(payload));
      lsSet("sm_setup_creatives_backup_v1", JSON.stringify(payload));
      ssSet("draft_form_creatives", JSON.stringify(payload));
    }
  } catch (e) {
    console.warn("syncCreativesToDraftKeys failed:", e);
  }
}

const INITIAL_CHAT = [
  { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign.` },
  { from: "gpt", text: "Are you ready to get started? (yes/no)" },
];

/* ========================= Main Component ========================= */
function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export default function FormPage() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const chatBoxRef = useRef();
  const inputRef = useRef();

  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sideChatCount, setSideChatCount] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [chatIsThinking, setChatIsThinking] = useState(false);
  const [typingMsg, setTypingMsg] = useState("");
  const [typingIdx, setTypingIdx] = useState(0);
  const [pendingFollowUp, setPendingFollowUp] = useState("");

  const [imageDataUrls, setImageDataUrls] = useState([]); // 2 items max
  const [imgFail, setImgFail] = useState({}); // {0:true,1:true}

  const [mediaType, setMediaType] = useState("image"); // "image" | "video"

  // Optional user-uploaded video ad
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(""); // server URL after upload
  const [uploadedVideoMeta, setUploadedVideoMeta] = useState(null); // { originalName, mimeType, size }
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadError, setVideoUploadError] = useState("");
  const videoInputRef = React.useRef(null);

  const [creativeSource, setCreativeSource] = useState(() => {
    // Pre-select creative mode when arriving from CampaignSetup 3-dot replace menu
    try {
      const v = new URLSearchParams(window.location.search).get("creativeMode") || "";
      if (["ai_image", "upload_photo", "upload_video"].includes(v)) return v;
    } catch {}
    return "ai_image";
  }); // "ai_image" | "upload_photo" | "upload_video"

  // Multi-ad creative test: how many distinct ad angles to generate (1–4, default 3)
  const [creativeTestCount, setCreativeTestCount] = useState(3);
  // Full creative set: [{id, angle, angleLabel, headline, body, cta, imageUrl, link, status}]
  const [creativeSet, setCreativeSet] = useState(null);

  // Stable ref that always holds the latest copy + image state — safe to read inside
  // visibilitychange / beforeunload handlers where React state closures are stale.
  const latestDraftRef = useRef({
    images: [], headline: "", body: "", cta: "", link: "",
    creativeSet: null, creativeTestCount: 1, answers: {},
  });
  const [awaitingAiImageConfirm, setAwaitingAiImageConfirm] = useState(false); // waiting for yes/no after "Generate AI Image" card click
  const [copyGenerated, setCopyGenerated] = useState(false); // true once copy-only generation ran for upload modes

  const [result, setResult] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [imageUrl, setImageUrl] = useState("");

  // Optional user-uploaded photo — scoped to this session only, never persisted
  const [userUploadedImage, setUserUploadedImage] = useState(null);
  const uploadInputRef = useRef(null);
  // "asis" = use the uploaded image directly as the creative
  // "ai"   = run the uploaded image through the AI design/overlay path
  const [uploadMode, setUploadMode] = useState("ai");

  const [regenLimit, setRegenLimit] = useState(IMAGE_GEN_MAX_RUNS_PER_WINDOW);
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalImg, setModalImg] = useState("");
  const [awaitingReady, setAwaitingReady] = useState(true);

  /* ---- Admin-client mode ---- */
  const adminClientId = useMemo(() => {
    try {
      return new URLSearchParams(location.search).get("adminClientId") || "";
    } catch { return ""; }
  }, [location.search]);

  // Optional creativeMode URL param — lets CampaignSetup 3-dot menu pre-select the mode
  const creativeModeFromUrl = useMemo(() => {
    try {
      const v = new URLSearchParams(location.search).get("creativeMode") || "";
      return ["ai_image", "upload_photo", "upload_video"].includes(v) ? v : "";
    } catch { return ""; }
  }, [location.search]);
  const [adminClientInfo, setAdminClientInfo] = useState(null);

  useEffect(() => {
    if (!adminClientId) return;
    // Persist target client id in a separate key so CampaignSetup can recover it
    // even if route state is lost (page refresh, etc.). Never overwrites normal session keys.
    try { localStorage.setItem("sm_admin_target_client_id", adminClientId); } catch {}
    const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    fetch(`/api/admin/clients/${encodeURIComponent(adminClientId)}`, {
      credentials: "include",
      headers: sid ? { "x-sm-sid": sid } : {},
    })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (j.ok && j.client) {
          setAdminClientInfo(j.client);
          const label = j.client.premiumIntake?.businessName || j.client.displayName || j.client.email || adminClientId;
          try { localStorage.setItem("sm_admin_target_client_label", label); } catch {}
        }
      })
      .catch(() => {});
  }, [adminClientId]);

  // When adminClientInfo loads (or changes), seed intakeUrlRef and editLink from
  // premiumIntake.websiteUrl — this is the authoritative URL for all generation.
  // Without this, answers.url from the stale campaign_contexts record would win.
  useEffect(() => {
    const piUrl = String(adminClientInfo?.premiumIntake?.websiteUrl || "").trim();
    if (!piUrl) return;
    intakeUrlRef.current = piUrl;
    // Only override editLink if it still holds the OLD URL (or is empty)
    // so we don't clobber a URL the user manually typed.
    const currentEdit = (editLink || "").trim().toLowerCase();
    const oldChatUrl = String(answers?.url || "").trim().toLowerCase();
    if (!currentEdit || currentEdit === oldChatUrl) {
      setEditLink(piUrl);
    }
  // eslint-disable-next-line
  }, [adminClientInfo?.premiumIntake?.websiteUrl]);

  /* In admin mode: when adminClientId changes from one client to another, reset all
     form state immediately so stale context from the previous client never bleeds through.
     Skips the first mount (prev is "") — only fires on a real client switch. */
  useEffect(() => {
    const prev = prevAdminClientIdRef.current;
    prevAdminClientIdRef.current = adminClientId;

    if (!adminClientId || !prev || prev === adminClientId) return;

    setAnswers({});
    setStep(0);
    setChatHistory(INITIAL_CHAT);
    setInput("");
    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
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
    setMediaType("image");
    setImageDataUrls([]);
    setImgFail({});
    setObjectiveStep("none");
    setSelectedObjective(null);
    setPendingObjective(null);
    setAiRecommendedObjective(null);
    draftRestoredRef.current = false;
    setContextStatus("loading");
  }, [adminClientId]);

  /* ---- Image copy editing state ---- */
  const [imageEditing, setImageEditing] = useState(false);

  const currentImageId = useMemo(() => {
    const url = imageUrls[activeImage] || "";
    return creativeIdFromUrl(url);
  }, [imageUrls, activeImage]);

  const [editHeadline, setEditHeadline] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editCTA, setEditCTA] = useState("");
  const [editLink, setEditLink] = useState("");
  // Stable ref that always holds the latest intake URL, readable from any stale closure.
  // React state closures inside setTimeout / chat handlers can be stale — this ref is not.
  const intakeUrlRef = useRef("");

  // Objective recommendation step
  // "none"       = not started
  // "choosing"   = cards shown, waiting for user to click one
  // "confirming" = user clicked a card, awaiting Confirm / Change Different
  // "chosen"     = objective confirmed, move to creative selection
  const [objectiveStep, setObjectiveStep] = useState("none");
  const [selectedObjective, setSelectedObjective] = useState(null);
  const [pendingObjective, setPendingObjective] = useState(null); // clicked but not confirmed
  const [aiRecommendedObjective, setAiRecommendedObjective] = useState(null);

  // True once the draft-restore useEffect finds valid saved data.
  // The async context-load useEffect checks this before hydrating so it
  // never overwrites an in-progress form session.
  const draftRestoredRef = useRef(false);

  // Tracks previous adminClientId so the change-reset effect can detect real changes.
  const prevAdminClientIdRef = useRef("");

  // "idle"    → normal old-intake flow (no saved context)
  // "loading" → async context fetch in progress (admin mode starts here to prevent flash)
  // "loaded"  → context was found and hydrated
  // "missing" → admin mode, client has no usable intake yet
  const [contextStatus, setContextStatus] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("adminClientId")
        ? "loading"
        : "idle";
    } catch { return "idle"; }
  });

  // When true, bypass missing-intake empty state and show the old chat intake
  const [manualFormMode, setManualFormMode] = useState(false);

  // Step 1 — user clicks a card: stage it for confirmation, do NOT finalize yet
  const handleClickObjective = (obj) => {
    setPendingObjective(obj);
    setObjectiveStep("confirming");
  };

  // Step 2 — user confirms: finalize selection, save, proceed
  const handleConfirmObjective = () => {
    const obj = pendingObjective;
    if (!obj) return;

    setSelectedObjective(obj);
    setObjectiveStep("chosen");
    setPendingObjective(null);

    const launchNote = obj.launchSupported
      ? "This objective supports direct campaign launch."
      : "This objective is available for planning. Website Traffic campaigns support live launch today.";

    deliverQuestion(
      `Great — **${obj.label}** confirmed as your campaign objective.\n\n${launchNote}\n\nHow would you like to create your ad creative?`
    );

    // Save under correct ownerKey — admin-client-safe, fire-and-forget
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      fetch("/api/campaign-context/save", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(sid ? { "x-sm-sid": sid } : {}),
        },
        body: JSON.stringify({
          ctxKey: getActiveCtx(),
          answers,
          selectedObjective: {
            label: obj.label,
            value: obj.value,
            reason: aiRecommendedObjective?.reason || "",
          },
          ...(adminClientId ? { adminClientId } : {}),
        }),
      }).catch(() => {});
    } catch {}
  };

  // Step 3 (optional) — user wants to pick a different objective
  const handleChangeObjective = () => {
    setPendingObjective(null);
    setObjectiveStep("choosing");
  };

  const abs = toAbsoluteMedia;

  /* Scroll chat to bottom */
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatHistory, chatIsThinking, typingMsg]);

  /* Re-focus the chat input whenever the disabled state clears */
  useEffect(() => {
    if (!chatIsThinking && !typingMsg && !loading) {
      inputRef.current?.focus();
    }
  }, [chatIsThinking, typingMsg, loading]);

  /* Typewriter animation: advance ~4 chars every 15ms */
  useEffect(() => {
    if (!typingMsg) return;
    if (typingIdx >= typingMsg.length) {
      // Done — commit to chatHistory, then fire any pending follow-up
      const finalText = typingMsg;
      const followUp = pendingFollowUp;
      setTypingMsg("");
      setTypingIdx(0);
      setPendingFollowUp("");
      setChatHistory((ch) => {
        const next = [...ch, { from: "gpt", text: finalText }];
        if (followUp) next.push({ from: "gpt", text: followUp });
        return next;
      });
      return;
    }
    const t = setTimeout(() => setTypingIdx((i) => Math.min(i + 4, typingMsg.length)), 15);
    return () => clearTimeout(t);
  }, [typingMsg, typingIdx, pendingFollowUp]);

/* Warm backend on mount + ✅ BFCache fix: always re-check drafts when page is shown */
useEffect(() => {
  warmBackend();

  const clearFormPreview = () => {
    try {
      // hard clear anything that can rehydrate a ghost preview
      purgeCreativeDraftKeys();
      lsRemove(IMAGE_CACHE_KEY);
      lsRemove(IMAGE_DRAFTS_KEY);
      lsRemove(FORM_DRAFT_KEY);
      ssRemove(ACTIVE_CTX_KEY);
      lsRemove(ACTIVE_CTX_KEY);
    } catch {}

    // reset UI state (preview/image only — do NOT reset awaitingReady here,
    // that is conversation state and must not be disrupted by a preview clear)
    setImageDataUrls([]);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
    setResult(null);
    setHasGenerated(false);
    setImgFail({});
    setImageEditing(false);
  };

  const shouldClearBecauseNoDrafts = () => {
    try {
      // If we just came back from CampaignSetup with images in route state,
      // treat that as "has current draft" — do not wipe
      if ((location.state?.imageUrls || []).filter(Boolean).length) return false;

      const rawForm = lsGet(FORM_DRAFT_KEY);
      const rawCreative =
        ssGet("draft_form_creatives") ||
        lsGet(CREATIVE_DRAFT_KEY) ||
        lsGet("sm_setup_creatives_backup_v1");

      // if nothing saved, FormPage must be clean
      if (!rawForm && !rawCreative) return true;

      // if drafts are disabled (campaign launched), FormPage must be clean
      if (isDraftDisabled()) return true;

      return false;
    } catch {
      return false;
    }
  };

  const recheck = () => {
    if (shouldClearBecauseNoDrafts()) clearFormPreview();
  };

  // Runs on normal mount
  recheck();

  // ✅ Runs when browser restores page from memory (back/forward cache)
  const onPageShow = () => recheck();
  window.addEventListener("pageshow", onPageShow);

  // ✅ Runs when tab becomes visible again
  const onVis = () => {
    if (document.visibilityState === "visible") recheck();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVis);
  };
}, []);


/* Set per-user namespace (prevents shared-browser mixing)
   ✅ Works on BOTH:
   - Vercel frontend with rewrites: /api/* -> Render
   - Render direct (no rewrite): /auth/*
*/
useEffect(() => {
  (async () => {
    const sid =
      (localStorage.getItem("sm_sid_v1") || "").trim() ||
      (() => {
        const s = `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        try {
          localStorage.setItem("sm_sid_v1", s);
        } catch {}
        return s;
      })();

    try {
      // ✅ Prefer same-origin rewrite first
      let res = await fetch(`/api/auth/whoami`, {
        method: "GET",
        credentials: "include",
        headers: { "x-sm-sid": sid },
        cache: "no-store",
      });

      // ✅ Only fallback if rewrite truly missing
      if (res.status === 404) {
        res = await fetch(`/auth/whoami`, {
          method: "GET",
          credentials: "include",
          headers: { "x-sm-sid": sid },
          cache: "no-store",
        });
      }

      if (res.ok) {
        const j = await res.json().catch(() => ({}));
        const u = j?.user?.username || j?.user?.email || sid || "anon";
        setUserNS(u);
        if (j?.maxImageRegens > 0) {
          IMAGE_GEN_MAX_RUNS_PER_WINDOW = j.maxImageRegens;
          setRegenLimit(j.maxImageRegens);
        }
        return;
      }

      // ✅ If not logged in, KEEP the sid namespace so drafts survive
      setUserNS(sid || "anon");
    } catch {
      // ✅ Never clear saved creatives just because whoami failed
      setUserNS(sid || "anon");
    }
  })();
}, []);
/* ✅ If a campaign was launched, FormPage must NEVER show old previews again.
   Run this as its own hook (NOT nested) */
useEffect(() => {
  const clearLaunchedRemnants = () => {
    if (!isDraftDisabled()) return;

    try {
      purgeCreativeDraftKeys();
      lsRemove(CREATIVE_DRAFT_KEY);
      lsRemove("sm_setup_creatives_backup_v1");
      ssRemove("draft_form_creatives");
      lsRemove(IMAGE_CACHE_KEY);
      lsRemove(IMAGE_DRAFTS_KEY);
      localStorage.removeItem("smartmark_last_image_url");
    } catch {}

    setResult(null);
    setImageUrls([]);
    setImageDataUrls([]);
    setImgFail({});
    setHasGenerated(false);
    setGenerating(false);
    setImageLoading(false);
    setActiveImage(0);
    setImageUrl("");
    setImageEditing(false);
    setEditHeadline("");
    setEditBody("");
    setEditCTA("");
    setEditLink("");
    setAwaitingReady(true);
  };

  clearLaunchedRemnants();

  const onPageShow = (e) => {
    if (e?.persisted) clearLaunchedRemnants();
  };
  const onVis = () => {
    if (document.visibilityState === "visible") clearLaunchedRemnants();
  };

  window.addEventListener("pageshow", onPageShow);
  document.addEventListener("visibilitychange", onVis);

  return () => {
    window.removeEventListener("pageshow", onPageShow);
    document.removeEventListener("visibilitychange", onVis);
  };
}, []);




/* Load cached image previews for current ctx (24h)
   ✅ BUT: if campaign was launched (drafts disabled), NEVER restore previews.
   ✅ Also: clear any cached previews so FormPage doesn't show "blank ad" remnants.
*/
useEffect(() => {
  try {
    // In admin-client mode, never restore image cache — admin sessions always load fresh from API.
    if (adminClientId) return;

    // If CampaignSetup marked drafts disabled after successful launch,
    // FormPage must be totally clean (no "in progress" remnants).
    if (isDraftDisabled()) {
      // wipe caches + drafts that can rehydrate a ghost preview
      purgeCreativeDraftKeys();
      try {
        lsRemove(IMAGE_CACHE_KEY);
        lsRemove(IMAGE_DRAFTS_KEY);
        lsRemove(FORM_DRAFT_KEY);
        ssRemove(ACTIVE_CTX_KEY);
        lsRemove(ACTIVE_CTX_KEY);
      } catch {}

      // reset UI preview state
      setImageDataUrls([]);
      setImageUrls([]);
      setActiveImage(0);
      setImageUrl("");
      setResult(null);
      setHasGenerated(false);
      setAwaitingReady(true);
      setImgFail({});
      setImageEditing(false);
      return;
    }

    // Normal behavior: restore cached previews for current ctx
    const ctx = getActiveCtx();
    const c = loadImageCache(ctx);

    if (c?.dataUrls?.length) {
      setImageDataUrls(c.dataUrls.filter(Boolean).slice(0, 2));
    }

    if (c?.urls?.length && (!imageUrls || imageUrls.length === 0)) {
      setImageUrls(c.urls.slice(0, 2));
    }
  } catch {}
  // eslint-disable-next-line
}, []);


  /* ✅ Restore draft: choose ctx FIRST from existing OR saved drafts (fixes OAuth/back bugs) */
  useEffect(() => {
    // In admin-client mode: restore the CLIENT-scoped creative draft, then return.
    // Never touch TheBoss's keys. Route state (imageUrls from CampaignSetup back-nav) is
    // checked FIRST so the user never loses the creative they just generated.
    if (adminClientId) {
      draftRestoredRef.current = false;
      try {
        // 1. Route state: CampaignSetup sends imageUrls when navigating back.
        //    After restoring images, ALSO read copy/headline/body from localStorage
        //    so the draft is fully restored, not just the image URL.
        const stateImgs = (location.state?.imageUrls || []).filter(Boolean);
        if (stateImgs.length && !isDraftDisabled()) {
          setImageUrls(stateImgs.slice(0, 2));
          setActiveImage(0);
          setImageUrl(stateImgs[0] || "");
          setHasGenerated(true);
          setAwaitingReady(false);
          draftRestoredRef.current = true;

          // Also restore headline/body/cta from route state (if CampaignSetup passed them)
          // or fall back to the localStorage draft for the same client.
          const stateHeadline = String(location.state?.headline || "").trim();
          const stateBody     = String(location.state?.body     || "").trim();
          const stateLink     = String(location.state?.link     || "").trim();
          if (stateHeadline || stateBody) {
            // Copy from CampaignSetup back-nav route state
            setResult((prev) => ({
              ...(prev || {}),
              headline: stateHeadline || prev?.headline || "",
              body:     stateBody     || prev?.body     || "",
            }));
            // Also set edit fields directly so they're available before result effect fires
            if (stateHeadline) setEditHeadline(stateHeadline);
            if (stateBody)     setEditBody(stripTrailingLearnMore(stateBody));
          } else {
            // No copy in route state — read from admin-client localStorage draft
            try {
              const _clientNs = `adminClient:${adminClientId}`;
              const rawDraft = localStorage.getItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`) ||
                               localStorage.getItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`);
              if (rawDraft) {
                const draftObj = JSON.parse(rawDraft);
                if (draftObj.headline || draftObj.body) {
                  setResult((prev) => ({
                    ...(prev || {}),
                    headline: draftObj.headline || prev?.headline || "",
                    body:     draftObj.body     || prev?.body     || "",
                  }));
                  // Set edit fields directly — eliminates timing dependency on result effect
                  if (draftObj.headline) setEditHeadline(draftObj.headline.slice(0, 55));
                  if (draftObj.body)     setEditBody(stripTrailingLearnMore(draftObj.body));
                  if (draftObj.imageOverlayCTA) setEditCTA(draftObj.imageOverlayCTA);
                  if (draftObj.link)     setEditLink(draftObj.link);
                }
              }
            } catch {}
          }
          if (stateLink) setEditLink(stateLink);

          console.debug("[DRAFT RESTORE]", {
            page: "FormPage", adminClientId, source: "routeState",
            imageCount: stateImgs.length, hasCopy: !!(stateHeadline || stateBody),
          });
          return;
        }
        // 2. Admin-client namespaced localStorage draft
        const clientNs = `adminClient:${adminClientId}`;
        const rawDraft =
          localStorage.getItem(`u:${clientNs}:${CREATIVE_DRAFT_KEY}`) ||
          localStorage.getItem(`u:${clientNs}:sm_setup_creatives_backup_v1`);
        if (rawDraft) {
          const draftObj = JSON.parse(rawDraft);
          const now = Date.now();
          const expiresAt = Number(draftObj.expiresAt);
          const ageOk =
            (Number.isFinite(expiresAt) && now <= expiresAt) ||
            (!draftObj.savedAt || now - draftObj.savedAt <= CREATIVE_TTL_MS);
          if (ageOk) {
            const imgs = Array.isArray(draftObj.images) ? draftObj.images.filter(Boolean) : [];
            if (imgs.length) {
              setImageUrls(imgs.slice(0, 2));
              setActiveImage(0);
              setImageUrl(imgs[0] || "");
              setHasGenerated(true);
              setAwaitingReady(false);
              if (draftObj.headline || draftObj.body) {
                setResult((prev) => ({
                  ...(prev || {}),
                  headline: draftObj.headline || prev?.headline || "",
                  body:     draftObj.body     || prev?.body     || "",
                }));
                // Set edit fields directly to avoid timing dependency on result effect
                if (draftObj.headline) setEditHeadline(draftObj.headline.slice(0, 55));
                if (draftObj.body)     setEditBody(stripTrailingLearnMore(draftObj.body));
                if (draftObj.imageOverlayCTA) setEditCTA(draftObj.imageOverlayCTA);
                if (draftObj.link)     setEditLink(draftObj.link);
              }
              if (draftObj.answers && typeof draftObj.answers === "object") {
                setAnswers((prev) => ({ ...prev, ...draftObj.answers }));
              }
              draftRestoredRef.current = true;
              console.debug("[CREATIVE PERSIST RESTORE]", {
                page: "FormPage", adminClientId, ctxKey: draftObj.ctxKey,
                source: "namespacedLocalStorage", imageCount: imgs.length,
              });
            }
          }
        }
      } catch {}
      return;
    }
    try {
      purgeLegacyDraftKeys();

      const existing = String(getActiveCtx() || "").trim();

      // Read raw drafts
      const rawForm = lsGet(FORM_DRAFT_KEY);
      const rawCreative =
        ssGet("draft_form_creatives") ||
        lsGet(CREATIVE_DRAFT_KEY) ||
        lsGet("sm_setup_creatives_backup_v1");

      // Parse form wrapper (if valid + not expired)
      let formWrap = null;
      if (rawForm) {
        try {
          const parsed = JSON.parse(rawForm || "{}");

          // ✅ If form draft has no ctxKey, it's legacy/unsafe: delete it and stop restore
          const parsedCtx = String(parsed?.ctxKey || "").trim();
          if (!parsedCtx) {
            try {
              lsRemove(FORM_DRAFT_KEY);
            } catch {}
            return;
          }

          const savedAt = Number(parsed?.savedAt || 0);
          const isExpired = savedAt && Date.now() - savedAt > DRAFT_TTL_MS;
          if (!isExpired) formWrap = parsed;
          else lsRemove(FORM_DRAFT_KEY);
        } catch {}
      }

      // Parse creative draft (if valid + not expired)
      let creativeObj = null;
      if (rawCreative) {
        try {
          const c = JSON.parse(rawCreative || "{}");
          if (c?.expiresAt && Date.now() > Number(c.expiresAt)) {
            // expired creatives should be purged
            purgeCreativeDraftKeys();
          } else {
            creativeObj = c;
          }
        } catch {}
      }

      // ✅ Decide active ctx WITHOUT minting a new one prematurely
      const ctxFromForm = String(formWrap?.ctxKey || formWrap?.data?.ctxKey || "").trim();
      const ctxFromCreative = String(creativeObj?.ctxKey || "").trim();
      const ctxCandidate = existing || ctxFromForm || ctxFromCreative || buildCtxKey({});
      setActiveCtx(ctxCandidate);

      const activeCtxNow = String(getActiveCtx() || ctxCandidate).trim();

      // ================= FORM restore (only if ctx matches) =================
      if (formWrap?.data) {
        const draftCtx = String(formWrap?.ctxKey || formWrap?.data?.ctxKey || "").trim();

        // If draft has ctxKey and it doesn't match active, ignore it (stale)
        if (draftCtx && activeCtxNow && draftCtx !== activeCtxNow) {
          // remove ONLY the stale form draft; do NOT nuke creatives for current ctx
          lsRemove(FORM_DRAFT_KEY);
        } else {
          const data = formWrap.data || {};
          draftRestoredRef.current = true; // block context-load from overwriting this session

          setAnswers(data.answers || {});
          setStep(data.step ?? 0);
          setChatHistory(
            Array.isArray(data.chatHistory) && data.chatHistory.length ? data.chatHistory : INITIAL_CHAT
          );
          setMediaType("image");

          const restoredImgs = Array.isArray(data.imageUrls) ? data.imageUrls.filter(Boolean) : [];
          setImageUrls(restoredImgs);
          setActiveImage(data.activeImage || 0);
          setAwaitingReady(data.awaitingReady ?? true);
          setInput(data.input || "");
          setSideChatCount(data.sideChatCount || 0);

          if (restoredImgs.length) {
            setResult(data.result || null);
            setHasGenerated(true);
            // Form draft restored with images — done.
            return;
          }

          // Form draft found but imageUrls was empty. Before giving up, try the
          // route state that CampaignSetup passes back on the ← Back button click.
          // This covers the case where the autosave fired before the image was set.
          if (!isDraftDisabled()) {
            const stateImgs = (location.state?.imageUrls || []).filter(Boolean);
            if (stateImgs.length) {
              setImageUrls(stateImgs.slice(0, 2));
              setActiveImage(0);
              setImageUrl(stateImgs[0] || "");
              setResult(data.result || null);
              setHasGenerated(true);
              setAwaitingReady(false);
              return;
            }
          }

          // Nothing usable — leave clean.
          setResult(null);
          setHasGenerated(false);
          return;
        }
      }

      // ================= CREATIVE fallback restore (ctx-gated) =================
      if (creativeObj) {
        // ✅ If a campaign was successfully launched, do NOT restore old creatives into a new "in progress" draft
        if (isDraftDisabled()) {
          purgeCreativeDraftKeys();
          try {
            lsRemove(IMAGE_CACHE_KEY);
            lsRemove(IMAGE_DRAFTS_KEY);
          } catch {}
          setResult(null);
          setImageUrls([]);
          setHasGenerated(false);
          setAwaitingReady(true);
          return;
        }

        const draftCtx = String(creativeObj?.ctxKey || "").trim();
        if (!draftCtx || (activeCtxNow && draftCtx !== activeCtxNow)) {
          // wrong ctx or legacy missing ctx => purge creatives only
          purgeCreativeDraftKeys();
          return;
        }

        const imgs = Array.isArray(creativeObj?.images)
          ? creativeObj.images.filter(Boolean).slice(0, 2)
          : [];

        if (imgs.length) {
          draftRestoredRef.current = true; // block context-load from overwriting this session
          setImageUrls(imgs);
          setActiveImage(0);
          setImageUrl(imgs[0] || "");
          setResult((prev) => ({
            ...(prev || {}),
            headline: String(creativeObj?.headline || prev?.headline || "").slice(0, 55),
            body: String(creativeObj?.body || prev?.body || "").trim(),
            image_overlay_text: String(
              creativeObj?.imageOverlayCTA || prev?.image_overlay_text || ""
            ).trim(),
          }));
          if (creativeObj?.answers && typeof creativeObj.answers === "object") setAnswers(creativeObj.answers);
          if (Array.isArray(creativeObj?.creativeSet) && creativeObj.creativeSet.length > 0) {
            setCreativeSet(creativeObj.creativeSet);
            if (creativeObj.creativeTestCount) setCreativeTestCount(creativeObj.creativeTestCount);
          }
          setHasGenerated(true);
          setAwaitingReady(false);
        } else {
          setResult(null);
          setHasGenerated(false);
        }
      }

    // Last resort: if we just returned from CampaignSetup with images in route state,
    // restore those images so the creative preview is visible again.
    try {
      const stateImgs = (location.state?.imageUrls || []).filter(Boolean);
      if (stateImgs.length && !isDraftDisabled()) {
        setImageUrls(stateImgs.slice(0, 2));
        setActiveImage(0);
        setImageUrl(stateImgs[0] || "");
        setHasGenerated(true);
        setAwaitingReady(false);
      }
    } catch {}

    } catch {}
    // eslint-disable-next-line
  }, []);

  /* ── Load saved campaign context on mount (skips intake when data exists) ── */
  useEffect(() => {
    const loadSavedContext = async () => {
      // If a valid draft was already restored, don't overwrite the in-progress session
      if (draftRestoredRef.current) {
        setContextStatus("idle");
        return;
      }

      // Read adminClientId directly from URL — avoids stale-closure on useMemo value
      let aclId = "";
      try {
        aclId = new URLSearchParams(window.location.search).get("adminClientId") || "";
      } catch {}

      try {
        const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
        const apiUrl = aclId
          ? `/api/campaign-context?adminClientId=${encodeURIComponent(aclId)}`
          : "/api/campaign-context";

        const res = await fetch(apiUrl, {
          credentials: "include",
          headers: sid ? { "x-sm-sid": sid } : {},
        });

        if (!res.ok) {
          setContextStatus(aclId ? "missing" : "idle");
          return;
        }

        const json = await res.json().catch(() => ({}));

        // No usable context — show missing-intake empty state for admin, old intake for normal users
        if (!json.ok || !json.context || (!json.context.businessName && !json.context.industry)) {
          setContextStatus(aclId ? "missing" : "idle");
          return;
        }

        // Safety guard: in admin mode, verify that the returned context actually belongs
        // to the selected client. If the server returns fields we added for this check,
        // validate them. A mismatch means we got someone else's data — refuse to hydrate.
        if (aclId && json.clientOwnerKey && json.contextOwnerKey) {
          if (json.clientOwnerKey !== json.contextOwnerKey) {
            console.warn("[FormPage] Admin context ownership mismatch!", {
              aclId,
              clientOwnerKey: json.clientOwnerKey,
              contextOwnerKey: json.contextOwnerKey,
            });
            setChatHistory([{
              from: "gpt",
              text: "⚠️ Campaign context mismatch detected. Please refresh or reopen this client.",
            }]);
            setContextStatus("missing");
            return;
          }
        }

        const ctx = json.context;

        // Map saved context fields to FormPage answers structure
        const hydratedAnswers = {
          url:           ctx.websiteUrl    || "",
          phone:         ctx.phoneNumber   || "",
          industry:      ctx.industry      || "",
          businessName:  ctx.businessName  || "",
          city:          ctx.city          || "",
          state:         ctx.state         || "",
          idealCustomer: ctx.idealCustomer || "",
          hasOffer:      ctx.offer ? "yes" : "",
          offer:         ctx.offer         || "",
          mainBenefit:   ctx.mainBenefit   || "",
          cta:           ctx.cta           || "Call now",
        };

        // Compute objective recommendation from the loaded answers
        const rec = recommendObjective(hydratedAnswers);

        // Restore a previously selected objective if one was saved
        const savedObj = ctx.selectedObjectiveValue
          ? (CAMPAIGN_OBJECTIVES.find((o) => o.value === ctx.selectedObjectiveValue) || null)
          : null;

        const ctxKey = ctx.ctxKey || buildCtxKey(hydratedAnswers);
        setActiveCtx(ctxKey);

        setAnswers(hydratedAnswers);
        intakeUrlRef.current = String(hydratedAnswers.url || "").trim(); // seed ref from context
        setStep(CONVO_QUESTIONS.length); // jump past all intake questions
        setAwaitingReady(false);
        setObjectiveStep(savedObj ? "chosen" : "choosing");
        setAiRecommendedObjective({
          ...rec,
          reason: ctx.objectiveRecommendationReason || rec.reason,
        });
        if (savedObj) setSelectedObjective(savedObj);

        const bizName = ctx.businessName || "your business";
        const areaStr = ctx.serviceArea || [ctx.city, ctx.state].filter(Boolean).join(", ");
        const isAdmin = !!aclId;

        const welcomeMsg = savedObj
          ? `I loaded the campaign details for **${bizName}**${areaStr ? ` in ${areaStr}` : ""}.\n\nYour selected objective is **${savedObj.label}**. Choose your creative format below to get started.`
          : `I loaded the campaign details for **${bizName}**${areaStr ? ` in ${areaStr}` : ""}.\n\nBased on what ${isAdmin ? "we have" : "you provided"}, I recommend the **${rec.label}** objective — ${rec.reason}\n\nSelect an objective below, or choose a different one.`;

        setChatHistory([{ from: "gpt", text: welcomeMsg }]);
        setContextStatus("loaded");
      } catch {
        setContextStatus(aclId ? "missing" : "idle");
      }
    };

    loadSavedContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminClientId]); // re-run whenever the selected admin client changes

useEffect(() => {
  const draft = currentImageId ? getImageDraftById(currentImageId) : null;

  const bodyRaw = (draft?.body ?? result?.body ?? answers?.details ?? answers?.adCopy ?? "").toString();
  const urlFromBody = extractTrailingLearnMoreUrl(bodyRaw);

  setEditHeadline((draft?.headline ?? result?.headline ?? "").slice(0, 55));
  setEditBody(stripTrailingLearnMore(bodyRaw));
  setEditCTA(normalizeOverlayCTA(draft?.overlay ?? result?.image_overlay_text ?? answers?.cta ?? ""));

  const u = (answers?.url || urlFromBody || "").toString().trim();
  setEditLink(u);
  intakeUrlRef.current = u; // keep ref in sync whenever effect fires
}, [currentImageId, result, answers]);


  /* Debounced autosave of image edits */
  useEffect(() => {
    if (!currentImageId) return;
    const t = setTimeout(() => {
      saveImageDraftById(currentImageId, {
        headline: (editHeadline || "").trim(),
        body: (editBody || "").trim(),
        overlay: normalizeOverlayCTA(editCTA || ""),
      });
    }, 400);
    return () => clearTimeout(t);
  }, [currentImageId, editHeadline, editBody, editCTA]);

  // ── Keep latestDraftRef current (safe for event handlers that outlive renders) ──
  useEffect(() => {
    latestDraftRef.current = {
      ...latestDraftRef.current,
      headline: editHeadline,
      body:     editBody,
      cta:      editCTA,
      link:     editLink,
    };
  }, [editHeadline, editBody, editCTA, editLink]);

  useEffect(() => {
    latestDraftRef.current = { ...latestDraftRef.current, images: imageUrls };
  }, [imageUrls]);

  useEffect(() => {
    latestDraftRef.current = { ...latestDraftRef.current, answers };
  }, [answers]);

  useEffect(() => {
    latestDraftRef.current = {
      ...latestDraftRef.current,
      creativeSet, creativeTestCount,
    };
  }, [creativeSet, creativeTestCount]);

  // ── Debounced save when copy fields change (admin-client only) ──────────────
  // Fires 500ms after any edit to headline/body/CTA/link so a quick tab-switch
  // after editing still persists the copy.
  useEffect(() => {
    if (!adminClientId || !imageUrls?.length) return;
    const t = setTimeout(() => {
      if (!isDraftDisabled()) {
        saveAdminClientDraftNow({
          images:       imageUrls,
          headline:     editHeadline,
          body:         editBody,
          overlay:      editCTA,
          link:         editLink,
          draftAnswers: answers,
          extraFields:  creativeSet?.length > 1 ? { creativeSet, creativeTestCount } : undefined,
        });
      }
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line
  }, [editHeadline, editBody, editCTA, editLink, adminClientId]);

  // ── visibilitychange: save immediately when user switches tabs / hides page ──
  // Uses latestDraftRef (not stale closure) so the saved data is always current.
  useEffect(() => {
    if (!adminClientId) return;
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      const d = latestDraftRef.current;
      if (!d.images?.length || isDraftDisabled()) return;
      try {
        const _clientNs = `adminClient:${adminClientId}`;
        const _ctxKey   = getActiveCtx() || "";
        const _draft = {
          ctxKey:          _ctxKey,
          adminClientId,
          images:          d.images.filter(Boolean).slice(0, 2),
          headline:        (d.headline || "").slice(0, 55),
          body:            d.body     || "",
          imageOverlayCTA: d.cta      || "",
          link:            d.link     || "",
          answers:         d.answers  || {},
          mediaSelection:  "image",
          savedAt:         Date.now(),
          expiresAt:       Date.now() + CREATIVE_TTL_MS,
          ...(Array.isArray(d.creativeSet) && d.creativeSet.length > 1
            ? { creativeSet: d.creativeSet, creativeTestCount: d.creativeTestCount }
            : {}),
        };
        localStorage.setItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(_draft));
        localStorage.setItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(_draft));
        console.debug("[DRAFT SAVE]", {
          page: "FormPage", adminClientId, trigger: "visibilitychange",
          imageCount: _draft.images.length, hasCopy: !!(d.headline || d.body),
        });
      } catch {}
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  // eslint-disable-next-line
  }, [adminClientId]);

  // ── beforeunload: save admin-client draft before tab closes / hard reload ───
  useEffect(() => {
    if (!adminClientId) return;
    const onUnload = () => {
      const d = latestDraftRef.current;
      if (!d.images?.length || isDraftDisabled()) return;
      try {
        const _clientNs = `adminClient:${adminClientId}`;
        const _ctxKey   = getActiveCtx() || "";
        const _draft = {
          ctxKey:          _ctxKey,
          adminClientId,
          images:          d.images.filter(Boolean).slice(0, 2),
          headline:        (d.headline || "").slice(0, 55),
          body:            d.body     || "",
          imageOverlayCTA: d.cta      || "",
          link:            d.link     || "",
          answers:         d.answers  || {},
          mediaSelection:  "image",
          savedAt:         Date.now(),
          expiresAt:       Date.now() + CREATIVE_TTL_MS,
          ...(Array.isArray(d.creativeSet) && d.creativeSet.length > 1
            ? { creativeSet: d.creativeSet, creativeTestCount: d.creativeTestCount }
            : {}),
        };
        localStorage.setItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(_draft));
        localStorage.setItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(_draft));
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  // eslint-disable-next-line
  }, [adminClientId]);

  const fallbackCopy = useMemo(() => {
    const ind = (answers?.industry || "").toString().trim().toLowerCase();

    // Industry-keyed marketer defaults — never raw user text, never "X Specials"
    if (/hvac|heating|cooling|air.?cond/.test(ind))
      return { headline: "Comfort You Can Count On", body: "Reliable service from local HVAC professionals. Book a visit today." };
    if (/plumb/.test(ind))
      return { headline: "Fast Local Plumbers", body: "Responsive service, quality work. Get in touch today." };
    if (/electr/.test(ind))
      return { headline: "Reliable Electrical Service", body: "Trusted local electricians for your home or business." };
    if (/roof/.test(ind))
      return { headline: "Protect Your Home from the Top", body: "Quality roofing from a team your neighbors already trust." };
    if (/landscap|lawn/.test(ind))
      return { headline: "Your Lawn, Our Expertise", body: "Curb appeal that stands out, every season. Get a free quote." };
    if (/clean|maid/.test(ind))
      return { headline: "Clean Home, Clear Mind", body: "Thorough, reliable cleaning for homes and businesses." };
    if (/market|advertis|agency/.test(ind))
      return { headline: "Marketing That Actually Works", body: "Campaigns built to bring in qualified customers, not just clicks." };
    if (/restaurant|food|cater/.test(ind))
      return { headline: "Great Food, Local Flavor", body: "Fresh, local, and ready for you. Come in or order today." };
    if (/dental|dent/.test(ind))
      return { headline: "Healthy Smiles Start Here", body: "Gentle, professional care for your whole family." };
    if (/auto|car|vehicle/.test(ind))
      return { headline: "Your Car in Good Hands", body: "Honest service from mechanics who take pride in their work." };
    if (/insur/.test(ind))
      return { headline: "Coverage You Can Count On", body: "Protect what matters most. Speak with an agent today." };
    if (/real.?estate|realt/.test(ind))
      return { headline: "Buy or Sell with Confidence", body: "Local real estate experts ready to guide you every step." };
    if (/fitness|gym|personal.?train/.test(ind))
      return { headline: "Reach Your Fitness Goals", body: "Real results, real progress. Start training today." };
    if (/pest/.test(ind))
      return { headline: "Keep Pests Out for Good", body: "Effective pest control for homes and businesses. Book today." };
    if (/salon|hair|beauty/.test(ind))
      return { headline: "Your Best Look Starts Here", body: "Professional styling you can count on, every visit." };
    if (/legal|law/.test(ind))
      return { headline: "Trusted Legal Help", body: "Clear advice, strong representation. Talk to us today." };

    return { headline: "Local Experts, Real Results", body: "See what's possible for your business. Learn more today." };
  }, [answers]);

  const displayHeadline = (editHeadline || result?.headline || fallbackCopy.headline || "")
    .toString()
    .trim()
    .slice(0, 55);

const rawBody = (editBody || result?.body || fallbackCopy.body || "").toString().trim();
const displayBody = stripTrailingLearnMore(rawBody);

// editLink is the user-visible/editable field — it must ALWAYS win for display.
// answers.url is the fallback when editLink is empty (e.g. page just loaded).
// extractTrailingLearnMoreUrl is last-resort from generated body text.
const displayLink = normalizeUrlForCopy(
  editLink ||
  (answers?.url || "").toString().trim() ||
  extractTrailingLearnMoreUrl(rawBody)
);



  const displayCTA = normalizeOverlayCTA(
    editCTA || result?.image_overlay_text || answers?.cta || "Learn more"
  );

  function hardResetChat() {
    if (!window.confirm("Reset the chat and clear saved progress for this form?")) return;
    try {
      lsRemove(FORM_DRAFT_KEY);
      lsRemove(CREATIVE_DRAFT_KEY);
      ssRemove("draft_form_creatives");

      lsRemove(IMAGE_DRAFTS_KEY);
      lsRemove(IMAGE_CACHE_KEY);

      // reset run ctx
      ssRemove(ACTIVE_CTX_KEY);
      lsRemove(ACTIVE_CTX_KEY);
    } catch {}
    setAnswers({});
    setStep(0);
    setChatHistory(INITIAL_CHAT);
    setInput("");
    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
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
    setMediaType("image");
    setImageDataUrls([]);
    setImgFail({});
  }

  function clearPreviewStateForNewBusiness() {
    try {
      lsRemove(CREATIVE_DRAFT_KEY);
      lsRemove("sm_setup_creatives_backup_v1");
      ssRemove("draft_form_creatives");
      // keep user namespace, just clear per-run preview
      try {
        localStorage.removeItem("smartmark_last_image_url");
      } catch {}
      lsRemove(IMAGE_CACHE_KEY);
    } catch {}
    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
    setHasGenerated(false);
    setImageEditing(false);
    setImageDataUrls([]);
    setImgFail({});
  }

    function clearCreativeStateForRegeneration() {
    try {
      purgeCreativeDraftKeys();
      lsRemove(IMAGE_CACHE_KEY);
      lsRemove(IMAGE_DRAFTS_KEY);

      try {
        localStorage.removeItem("smartmark_last_image_url");
        localStorage.removeItem("smartmark_last_video_url");
        localStorage.removeItem("smartmark_last_fb_video_id");
      } catch {}
    } catch {}

    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
    setHasGenerated(false);
    setImageEditing(false);
    setImageDataUrls([]);
    setImgFail({});
    setEditHeadline("");
    setEditBody("");
    setEditCTA("");
    setEditLink((answers?.url || "").toString().trim());
  }

/* Autosave */
useEffect(() => {
  const t = setTimeout(() => {
    // In admin-client mode: save the creative draft to the CLIENT namespace so
    // navigating back from CampaignSetup restores it. Never touch global/TheBoss keys.
    if (adminClientId) {
      if (imageUrls?.length && !isDraftDisabled()) {
        try {
          const _clientNs = `adminClient:${adminClientId}`;
          const _ctxKey = (typeof getActiveCtx === "function" ? getActiveCtx() : "") || "";
          const _adminDraft = {
            ctxKey: _ctxKey,
            adminClientId,
            images: imageUrls.filter(Boolean).slice(0, 2),
            headline: (editHeadline || result?.headline || "").slice(0, 55),
            body: editBody || result?.body || "",
            imageOverlayCTA: editCTA || "",
            answers: { ...(answers || {}), url: (editLink || answers?.url || "").trim() },
            mediaSelection: "image",
            savedAt: Date.now(),
            expiresAt: Date.now() + CREATIVE_TTL_MS,
          };
          localStorage.setItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(_adminDraft));
          localStorage.setItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(_adminDraft));
        } catch {}
      }
      return; // Never write to TheBoss/global keys
    }

    // ✅ If campaign was launched, FormPage must NOT keep writing drafts (this causes ghost previews)
    if (isDraftDisabled()) {
      try {
        // remove anything that can rehydrate previews
        lsRemove(FORM_DRAFT_KEY);
        purgeCreativeDraftKeys();
        lsRemove(IMAGE_CACHE_KEY);
        lsRemove(IMAGE_DRAFTS_KEY);
      } catch {}

      // clear UI state once (only if something is currently showing)
      if ((imageUrls && imageUrls.length) || result || hasGenerated) {
        setImageDataUrls([]);
        setImageUrls([]);
        setActiveImage(0);
        setImageUrl("");
        setResult(null);
        setHasGenerated(false);
        setAwaitingReady(true);
        setImgFail({});
        setImageEditing(false);
      }
      return;
    }

    const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
    const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
    const mergedBody = activeDraft?.body || result?.body || "";

    const payload = {
      ctxKey: getActiveCtx(),
      answers,
      step,
      chatHistory,
      mediaType: "image",
      result: { ...(result || {}), headline: mergedHeadline, body: mergedBody },
      imageUrls,
      activeImage,
      awaitingReady,
      input,
      sideChatCount,
      hasGenerated,
    };

    lsSet(
      FORM_DRAFT_KEY,
      JSON.stringify({
        savedAt: Date.now(),
        ctxKey: getActiveCtx(),
        data: payload,
      })
    );

    const imgs = imageUrls.slice(0, 2).map(abs);

    // ✅ DON'T overwrite creatives with empty images
    if (imgs.length) {
      const draftForSetup = {
        ctxKey: getActiveCtx(),
        images: imgs,
        headline: mergedHeadline,
        body: appendUrlToCopy(mergedBody, answers?.url),
        imageOverlayCTA: normalizeOverlayCTA(
          activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
        ),
        answers,
        mediaSelection: "image",
        savedAt: Date.now(),
        expiresAt: Date.now() + CREATIVE_TTL_MS,
      };

      lsSet(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
      lsSet("sm_setup_creatives_backup_v1", JSON.stringify(draftForSetup));
      ssSet("draft_form_creatives", JSON.stringify(draftForSetup));
    }
  }, 150);

  return () => clearTimeout(t);
}, [
  answers,
  step,
  chatHistory,
  mediaType,
  result,
  imageUrls,
  activeImage,
  awaitingReady,
  input,
  sideChatCount,
  hasGenerated,
  currentImageId,
  editHeadline,
  editBody,
  editCTA,
  abs,
]);


  /* Write latest draft before unload/navigation */
  useEffect(() => {
    const handler = () => {
      try {
        // In admin-client mode, never write drafts — admin context is server-managed.
        if (adminClientId) return;

        const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
        const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
        const mergedBody = activeDraft?.body || result?.body || "";
        const imgs = imageUrls.slice(0, 2).map(abs);

        // ✅ After launch, do NOT persist creatives (prevents "in progress" from reappearing)
        if (isDraftDisabled()) return;

        // ✅ DON'T overwrite creatives with empty images
        if (!imgs.length) return;

        const draftForSetup = {
          ctxKey: getActiveCtx(),
          images: imgs,
          headline: mergedHeadline,
          body: appendUrlToCopy(mergedBody, answers?.url),
          imageOverlayCTA: normalizeOverlayCTA(
            activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
          ),
          answers,
          mediaSelection: "image",
          savedAt: Date.now(),
          expiresAt: Date.now() + CREATIVE_TTL_MS,
        };

        lsSet(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
        lsSet("sm_setup_creatives_backup_v1", JSON.stringify(draftForSetup));
        ssSet("draft_form_creatives", JSON.stringify(draftForSetup));

      } catch {}
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [answers, imageUrls, activeImage, currentImageId, result, abs]);

  function handleImageClick(url) {
    setShowModal(true);
    setModalImg(url);
  }
  function handleModalClose() {
    setShowModal(false);
    setModalImg("");
  }

  /* ---- Ask OpenAI (side chat) — creative-aware ---- */
  async function askGPT(userText) {
    try {
      const history = chatHistory.slice(-8).map((m) => ({
        role: m.from === "gpt" ? "assistant" : "user",
        content: m.text,
      }));
      history.push({ role: "user", content: userText });

      // Include current campaign and creative state so the AI can reference the
      // uploaded image, headline, objective, etc. without saying "I can't view files."
      const campaignState = {
        adminClientId: adminClientId || null,
        businessName: answers?.businessName || null,
        objective: selectedObjective?.label || aiRecommendedObjective?.label || null,
        creativeSource,
        uploadedImageUrl: imageUrls[0] || userUploadedImage || null,
        headline: result?.headline || editHeadline || null,
        body: result?.body || editBody || null,
        offer: answers?.offer || answers?.saveAmount || null,
        service: answers?.service || answers?.mainServices || null,
        location: answers?.location || null,
        idealCustomer: answers?.idealCustomer || null,
        answers: answers || {},
      };

      const data = await fetchJsonWithRetry(
        `${API_BASE}/gpt-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText, history, campaignState }),
        },
        { tries: 3, warm: true }
      );
      return data?.reply || null;
    } catch (e) {
      console.warn("gpt-chat failed:", e.message);
      return null;
    }
  }

  /* ---- Generate ad copy from uploaded photo ---- */
  // Sends the actual image to the backend vision route so GPT-4o can SEE the photo
  // and write copy that matches what is visually in it.
  // Prefers server-hosted URL (imageUrls[0]) so OpenAI fetches it directly;
  // falls back to the data URL (userUploadedImage) if no server URL is available.
  async function handleGenerateCopyForUpload() {
    // Accept either: server URL after upload, or raw data URL before upload completes
    // Prefer userUploadedImage (data URL) — exact preview the user sees.
    // Fall back to the server-hosted URL if the data URL is not available.
    const imageToSend = userUploadedImage || imageUrls[0];
    if (!imageToSend) return;

    setLoading(true);
    const THINKING_MSG = "Analyzing your photo and writing matched ad copy…";
    setChatHistory((ch) => [...ch, { from: "gpt", text: THINKING_MSG }]);

    try {
      const r = await fetch(`${API_BASE}/generate-copy-for-uploaded-image`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: imageToSend,
          campaignState: {
            adminClientId: adminClientId || null,
            businessName: answers?.businessName || null,
            objective: selectedObjective?.label || aiRecommendedObjective?.label || null,
            offer: answers?.offer || answers?.saveAmount || null,
            service: answers?.service || answers?.mainServices || null,
            location: answers?.location || null,
            idealCustomer: answers?.idealCustomer || null,
          },
        }),
      });

      const data = await r.json().catch(() => ({}));

      if (r.ok && data.ok && (data.headline || data.body)) {
        const headline = (data.headline || "").slice(0, 55);
        const body     = data.body || "";

        setResult((prev) => ({ ...(prev || {}), headline, body }));
        setCopyGenerated(true);
        // Immediately persist copy with current images — copy is expensive, don't lose it
        saveAdminClientDraftNow({
          images: imageUrls, headline, body,
          overlay: normalizeOverlayCTA(answers?.cta || ""),
          draftAnswers: buildCurrentIntakeAnswers(),
        });

        const srcLabel = data.usedVision
          ? "based on your photo"
          : "based on your campaign details";
        const obsLine = data.imageObservation
          ? `\n\n*Photo: ${data.imageObservation}*`
          : "";
        const msg = `Here's your ad copy (${srcLabel}):\n\n**${headline}**\n\n${body}${obsLine}`;

        setChatHistory((ch) => [
          ...ch.filter((m) => m.text !== THINKING_MSG),
          { from: "gpt", text: msg },
        ]);
      } else {
        setChatHistory((ch) => [
          ...ch.filter((m) => m.text !== THINKING_MSG),
          { from: "gpt", text: "Copy generation failed. Please try again." },
        ]);
      }
    } catch (err) {
      console.error("[generateCopyForUpload]", err?.message || err);
      setChatHistory((ch) => [
        ...ch.filter((m) => m.text !== THINKING_MSG),
        { from: "gpt", text: "Copy generation failed. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSideChat(userText, followUpPrompt) {
    if (sideChatCount >= SIDE_CHAT_LIMIT) {
      if (followUpPrompt) setChatHistory((ch) => [...ch, { from: "gpt", text: followUpPrompt }]);
      return;
    }
    setSideChatCount((c) => c + 1);
    setChatIsThinking(true);
    const reply = await askGPT(userText);
    setChatIsThinking(false);
    if (reply) {
      if (followUpPrompt) setPendingFollowUp(followUpPrompt);
      setTypingIdx(0);
      setTypingMsg(reply);
    } else {
      if (followUpPrompt) setChatHistory((ch) => [...ch, { from: "gpt", text: followUpPrompt }]);
    }
  }

  /* Deliver an onboarding question with a brief thinking pause then typewriter reveal.
     Uses the same chatIsThinking + typingMsg path as GPT side-chat replies. */
  function deliverQuestion(text) {
    setChatIsThinking(true);
    setTimeout(() => {
      setChatIsThinking(false);
      setTypingIdx(0);
      setTypingMsg(text);
    }, 350);
  }

  async function handleUserInput(e) {
    e.preventDefault();
    if (loading || chatIsThinking || !!typingMsg) return;
    const value = (input || "").trim();
    if (!value) return;

    setChatHistory((ch) => [...ch, { from: "user", text: value }]);
    setInput("");

    // ── AI image generation confirmation gate ────────────────────────────────
    // Fires only after the user clicks "Generate AI Image" and before any other
    // input is processed. Upload photo/video paths are not affected.
    if (awaitingAiImageConfirm) {
      const isYes = /^(yes|yep|yeah|sure|ok|okay|generate|do it|go ahead|please|y)$/i.test(value);
      const isNo  = /^(no|nope|nah|don'?t|skip|not now|not yet|cancel|n)$/i.test(value);
      if (isYes) {
        setAwaitingAiImageConfirm(false);
        triggerAiImageGeneration();
        return;
      }
      if (isNo) {
        setAwaitingAiImageConfirm(false);
        setChatHistory((ch) => [...ch, { from: "gpt", text: "No problem. You can upload your own photo or video instead." }]);
        return;
      }
      // Unclear answer — re-ask
      setChatHistory((ch) => [...ch, { from: "gpt", text: 'Reply "yes" to generate an AI image, or "no" to use your own photo or video.' }]);
      return; // awaitingAiImageConfirm stays true
    }
    // ────────────────────────────────────────────────────────────────────────

    // awaitingReady only gates the intro — never once questions have started (step > 0)
    if (awaitingReady && step === 0) {
      if (
        /^(yes|yep|ready|start|go|let'?s (go|start)|ok|okay|yea|yeah|alright|i'?m ready|im ready|lets do it|sure)$/i.test(
          value
        )
      ) {
        setAwaitingReady(false);
        deliverQuestion(CONVO_QUESTIONS[0].question);
        setStep(0);
        return;
      } else if (/^(no|not yet|wait|hold on|nah|later)$/i.test(value)) {
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: "No problem! Just say 'ready' when you want to start." },
        ]);
        return;
      } else {
        setChatHistory((ch) => [...ch, { from: "gpt", text: "Please reply 'yes' when you're ready to start!" }]);
        return;
      }
    }

    const currentQ = CONVO_QUESTIONS[step];

    if (step >= CONVO_QUESTIONS.length) {
      // Intercept change-objective requests in any post-intake state
      const isChangeObjectiveRequest = /change.*objective|different.*objective|pick another.*objective|wrong.*objective|switch.*objective|re-?choose|re-?select.*objective|go back.*objective|another.*option/i.test(value);
      if (isChangeObjectiveRequest && (objectiveStep === "chosen" || objectiveStep === "confirming" || objectiveStep === "choosing")) {
        setPendingObjective(null);
        setObjectiveStep("choosing");
        setChatHistory((ch) => [...ch, { from: "gpt", text: "No problem — choose a different objective below." }]);
        return;
      }

      // In confirming state, handle plain inputs as side conversation
      if (objectiveStep === "confirming") {
        setChatHistory((ch) => [...ch, { from: "gpt", text: "Use the buttons below to confirm or change your objective selection." }]);
        return;
      }

      // Objective card panel is open — answer questions freely, only block generate triggers
      if (objectiveStep === "choosing") {
        if (isGenerateTrigger(value)) {
          setChatHistory((ch) => [
            ...ch,
            { from: "gpt", text: "Choose a campaign objective from the cards above first, then I'll get to work on your ads." },
          ]);
          return;
        }

        // Answer the question via GPT with objective context
        setChatIsThinking(true);
        (async () => {
          try {
            const recLabel = aiRecommendedObjective?.label || "Traffic";
            const recReason = aiRecommendedObjective?.reason || "";
            const bizName = answers?.businessName || "this business";
            const systemMsg = `You are a smart ad campaign assistant. The user has completed intake for ${bizName}. You have recommended the ${recLabel} campaign objective${recReason ? ` because: ${recReason}` : ""}. Available objectives: Traffic (launch-supported today), Leads, Awareness, Engagement, Sales, App Promotion (planning only). Answer the user's question helpfully in 2-4 sentences, then end with a short prompt to choose an objective from the cards shown.`;
            const history = [
              { role: "system", content: systemMsg },
              ...chatHistory.slice(-6).map((m) => ({
                role: m.from === "gpt" ? "assistant" : "user",
                content: m.text,
              })),
              { role: "user", content: value },
            ];
            const res = await fetch(`${API_BASE}/gpt-chat`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "omit",
              body: JSON.stringify({ message: value, history }),
            });
            const data = await res.json().catch(() => ({}));
            setChatIsThinking(false);
            if (data?.reply) {
              setTypingIdx(0);
              setTypingMsg(data.reply);
            } else {
              setChatHistory((ch) => [...ch, { from: "gpt", text: "Select an objective from the cards above to continue." }]);
            }
          } catch {
            setChatIsThinking(false);
            setChatHistory((ch) => [...ch, { from: "gpt", text: "Select an objective from the cards above to continue." }]);
          }
        })();
        return;
      }

      if (!hasGenerated && !copyGenerated && isGenerateTrigger(value)) {
        if (creativeSource === "ai_image") {
          // Generation is handled via triggerAiImageGeneration() — either called
          // directly from the confirm gate above (when user typed "yes" after the card
          // prompt) or from here when the user types a generate trigger phrase.
          triggerAiImageGeneration();
          return;
        }

        // Upload mode (upload_photo or upload_video): generate copy only, no image
        setLoading(true);
        setChatHistory((ch) => [...ch, { from: "gpt", text: "AI thinking..." }]);

        setTimeout(async () => {
          try {
            await warmBackend();
            const smartCopy = await summarizeAdCopy(answers || {});
            const aiHeadline = (smartCopy?.headline || "").slice(0, 55);
            const aiBody = smartCopy?.subline || smartCopy?.body || "";
            if (aiHeadline || aiBody) {
              setResult((prev) => ({ ...(prev || {}), headline: aiHeadline, body: aiBody }));
            }
            setCopyGenerated(true);
            const uploadPrompt = creativeSource === "upload_photo"
              ? "Your ad copy is ready! Upload your photo below to continue."
              : "Your ad copy is ready! Upload your video below to continue.";
            setChatHistory((ch) => [...ch, { from: "gpt", text: uploadPrompt }]);
          } catch (err) {
            console.error("copy generation failed:", err);
            setChatHistory((ch) => [...ch, { from: "gpt", text: "Copy generation failed. Please try again." }]);
          } finally {
            setLoading(false);
          }
        }, 80);

        return;
      }

      if (hasGenerated || copyGenerated) {
        await handleSideChat(value, null);
      } else if (contextStatus === "loaded") {
        // In the modern saved-context flow there is no yes/no gating —
        // generation starts via buttons, so just answer the question.
        await handleSideChat(value, null);
      } else {
        const readyPrompt = creativeSource === "ai_image"
          ? "Ready to generate your campaign? (yes/no)"
          : "Ready to generate your ad copy? Type 'yes' to continue.";
        await handleSideChat(value, readyPrompt);
      }
      return;
    }

    if (currentQ && isLikelySideChat(value, currentQ)) {
      await handleSideChat(value, `Ready for the next question?\n${currentQ.question}`);
      return;
    }

    if (currentQ) {
      // Defensive: if awaitingReady is somehow still true at this point, clear it now
      if (awaitingReady) setAwaitingReady(false);

      let answerToSave = value;
      if (currentQ.key === "url") {
        const isNoWebsite = /^(none|no|n\/a|nope|skip|don'?t have one|no website|not yet)$/i.test(value.trim());
        if (isNoWebsite) {
          answerToSave = "";
        } else {
          const firstUrl = extractFirstUrl(value);
          if (firstUrl) answerToSave = firstUrl;
        }

        // ✅ If URL changed from last run, reset previews so no stale industry/copy shows.
        const prevUrl = (answers?.url || "").toString().trim();
        const nextUrl = (answerToSave || "").toString().trim();
        if (prevUrl && nextUrl && prevUrl !== nextUrl) {
          clearPreviewStateForNewBusiness();
        }
      }

      if (currentQ.key === "phone") {
        // Allow "skip", "none", "no", "n/a" etc. to mean no phone
        const isSkip = /^(skip|none|no|n\/a|nope|not now|no thanks|no thank you)$/i.test(answerToSave.trim());
        if (isSkip) {
          answerToSave = "";
        } else {
          const cleaned = answerToSave.replace(/[^\d\s\-().+]/g, "").trim();
          if (cleaned) answerToSave = formatPhoneDisplay(cleaned);
        }
      }
      if (currentQ.key === "state") {
        // Normalize: accept full state names or abbreviations; store as 2-letter uppercase if recognizable
        const abbr = answerToSave.trim().toUpperCase().replace(/[^A-Z]/g, "");
        if (abbr.length === 2) answerToSave = abbr;
        else answerToSave = answerToSave.trim();
      }
      if (currentQ.key === "city") {
        answerToSave = answerToSave.trim();
      }

      const newAnswers = {
        ...answers,
        [currentQ.key]: answerToSave,
        ...(currentQ.key === "url" ? { noWebsite: !answerToSave ? "yes" : "no" } : {}),
      };
      setAnswers(newAnswers);

      let nextStep = step + 1;
      while (
        CONVO_QUESTIONS[nextStep] &&
        CONVO_QUESTIONS[nextStep].conditional &&
        newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !== CONVO_QUESTIONS[nextStep].conditional.value
      ) {
        nextStep += 1;
      }

      if (!CONVO_QUESTIONS[nextStep]) {
        // All intake questions answered — recommend an objective before ad generation
        const rec = recommendObjective(newAnswers);
        setAiRecommendedObjective(rec);
        setObjectiveStep("choosing");
        setStep(nextStep);
        deliverQuestion(
          `Great — I have everything I need to build your campaign.\n\nBased on your goal, I recommend the **${rec.label}** objective — ${rec.reason}\n\nSelect an objective below, or keep my recommendation.`
        );
        return;
      }

      setStep(nextStep);
      deliverQuestion(CONVO_QUESTIONS[nextStep].question);
    }
  }

// ── Immediate durable save for admin-client creative drafts ──────────────────
// Called immediately after any state change (upload, copy, or navigation) so the
// draft is never lost even if navigation happens before the 300ms autosave fires.
function saveAdminClientDraftNow({ images, headline, body, overlay, link, draftAnswers, extraFields }) {
  if (!adminClientId || !images?.length) return;
  try {
    const _clientNs = `adminClient:${adminClientId}`;
    const _ctxKey = getActiveCtx() || "";
    const _intakeA = buildCurrentIntakeAnswers ? buildCurrentIntakeAnswers() : (draftAnswers || answers || {});
    const _draft = {
      ctxKey:          _ctxKey,
      adminClientId,
      images:          images.filter(Boolean).slice(0, 2),
      headline:        (headline || "").slice(0, 55),
      body:            body || "",
      imageOverlayCTA: overlay || "",
      link:            link || _intakeA.url || "",
      answers:         draftAnswers || _intakeA,
      mediaSelection:  "image",
      savedAt:         Date.now(),
      expiresAt:       Date.now() + CREATIVE_TTL_MS,
      ...(extraFields || {}),
    };
    localStorage.setItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(_draft));
    localStorage.setItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(_draft));
    console.debug("[DRAFT SAVE]", {
      page: "FormPage", adminClientId, ctxKey: _ctxKey,
      source: creativeSource, imageCount: images.length,
      hasCopy: !!(body || headline), headline: (headline || "").slice(0, 30),
    });
    // Backend fire-and-forget — persists beyond localStorage
    try {
      const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      fetch("/api/campaign-context/save-creative-draft", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(_sid ? { "x-sm-sid": _sid } : {}) },
        body: JSON.stringify({ adminClientId, creativeDraft: _draft }),
      }).catch(() => {});
    } catch {}
  } catch {}
}
// ─────────────────────────────────────────────────────────────────────────────

// ── Single source-of-truth for the current intake URL and business context ──
// In admin-client mode, premiumIntake is authoritative — old chat conversation
// answers (answers.url = "Aspen93.godaddysites.com") must never override it.
// In normal mode, falls back through intakeUrlRef → editLink → answers.url.
function buildCurrentIntakeAnswers() {
  const piUrl = String(adminClientInfo?.premiumIntake?.websiteUrl || "").trim();
  const currentUrl = piUrl || intakeUrlRef.current || editLink || String(answers?.url || "").trim();
  return {
    ...(answers || {}),
    url:         currentUrl,
    websiteUrl:  currentUrl,
    businessName: String(adminClientInfo?.premiumIntake?.businessName || answers?.businessName || "").trim(),
    phone:        String(adminClientInfo?.premiumIntake?.mainPhone || adminClientInfo?.premiumIntake?.bestContactPhone || answers?.phone || "").trim(),
    industry:     String(adminClientInfo?.premiumIntake?.mainServices || answers?.industry || "").trim(),
    offer:        String(adminClientInfo?.premiumIntake?.currentSpecialOrOffer || answers?.offer || "").trim(),
    serviceArea:  String(adminClientInfo?.premiumIntake?.serviceArea || [answers?.city, answers?.state].filter(Boolean).join(", ") || "").trim(),
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// Generates N copy variants (one per angle) using the SAME shared image URL.
// Called after generatePosterBPair succeeds when creativeTestCount > 1.
// Each angle calls /api/summarize-ad-copy with a different angle hint.
async function generateAdCreativeSet(sharedImageUrl) {
  if (!sharedImageUrl) return;
  const count  = creativeTestCount;
  const angles = getAnglesForCount(count);
  const intakeA = buildCurrentIntakeAnswers();
  const ctxKey  = getActiveCtx() || "";

  const creatives = [];
  for (const angle of angles) {
    try {
      const copy = await summarizeAdCopy(intakeA, { angle: angle.id });
      creatives.push({
        id:          `c-${angle.id}-${Date.now()}`,
        angle:       angle.id,
        angleLabel:  angle.label,
        headline:    (copy?.headline || "").slice(0, 55),
        body:        copy?.subline || copy?.body || "",
        cta:         copy?.cta || intakeA.cta || "Learn more",
        imageUrl:    sharedImageUrl,
        link:        intakeA.url || "",
        mediaSelection: "image",
        status:      "draft",
      });
    } catch {}
  }

  if (creatives.length > 0) {
    setCreativeSet(creatives);
    // Persist immediately with full creative set
    saveAdminClientDraftNow({
      images:       [sharedImageUrl],
      headline:     creatives[0]?.headline || "",
      body:         creatives[0]?.body     || "",
      overlay:      normalizeOverlayCTA(creatives[0]?.cta || ""),
      draftAnswers: intakeA,
      extraFields:  { creativeSet: creatives, creativeTestCount: count },
    });
    console.debug("[DRAFT SAVE]", {
      page: "FormPage", adminClientId, ctxKey, source: "generateAdCreativeSet",
      imageCount: 1, creativeCount: creatives.length,
    });
  }
}

async function generatePosterBPair(runToken) {
  const tA = `${runToken}-A`;

  // buildCurrentIntakeAnswers() always uses premiumIntake.websiteUrl in admin-client mode.
  // intakeUrlRef.current breaks stale-closure problem (setTimeout / chat onSubmit).
  const answersForPair = buildCurrentIntakeAnswers();
  const smartCopy = await summarizeAdCopy(answersForPair);
  const aiHeadline = (smartCopy?.headline || "").slice(0, 55);
  const aiBody = smartCopy?.subline || smartCopy?.body || "";
  const aiCTA = smartCopy?.cta || answers?.cta || "";

  const urlA = await handleGenerateStaticAd("poster_b", smartCopy || null, {
    regenerateToken: tA,
    silent: true,
  });

  const urls = urlA ? [urlA] : [];

  if (urls[0]) {
    saveImageDraftById(creativeIdFromUrl(urls[0]), {
      headline: aiHeadline,
      body: aiBody,
      overlay: normalizeOverlayCTA(aiCTA),
    });
  }

  setImageUrls(urls);
  setActiveImage(0);
  setImageUrl(urls[0] || "");

  // Cache images as DataURLs so previews survive Render restarts (ephemeral filesystem)
  if (urls.length) {
    cacheImagesFor24h(getActiveCtx(), urls).catch(() => {});
  }

  // Persist immediately to admin-client namespace — do NOT wait for the 300ms autosave.
  // This guarantees the creative survives navigation before autosave fires.
  if (urls.length && adminClientId) {
    try {
      const _clientNs = `adminClient:${adminClientId}`;
      const _ctxKey = getActiveCtx() || "";
      const _intakeAnswers = buildCurrentIntakeAnswers();
      const _immediDraft = {
        ctxKey: _ctxKey,
        adminClientId,
        images: urls.filter(Boolean).slice(0, 2),
        headline: aiHeadline,
        body: aiBody,
        imageOverlayCTA: normalizeOverlayCTA(aiCTA),
        answers: _intakeAnswers,
        mediaSelection: "image",
        savedAt: Date.now(),
        expiresAt: Date.now() + CREATIVE_TTL_MS,
      };
      localStorage.setItem(`u:${_clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(_immediDraft));
      localStorage.setItem(`u:${_clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(_immediDraft));
      console.debug("[CREATIVE PERSIST SAVE]", {
        adminClientId, ctxKey: _ctxKey, imageCount: urls.length, selectedImageUrl: urls[0] || null,
      });
    } catch {}
  }

  // Surface AI copy immediately so displayHeadline / displayBody show it.
  if (aiHeadline || aiBody) {
    setResult((prev) => ({
      ...(prev || {}),
      headline: aiHeadline,
      body: aiBody,
    }));
  }

  return {
    urls,
    primary: {
      headline: aiHeadline,
      body: aiBody,
      overlay: normalizeOverlayCTA(aiCTA),
    },
  };
}

  function handleUploadChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result || null;
      setUserUploadedImage(dataUrl);
      // In upload_photo mode auto-upload to server immediately so Continue becomes available
      if (creativeSource === "upload_photo" && dataUrl) {
        handlePhotoCreative(dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  // "Use as-is" path: upload the DataURL straight to the media server, get a
  // real server URL, and put it into imageUrls just like an AI-generated image.
  // No AI processing — the user's photo becomes the creative as-is.
  async function handleUploadAsIs() {
    if (!userUploadedImage) return;
    // Clear draft-disabled flag so the autosave effect doesn't wipe this freshly
    // uploaded image when it fires (Bug 3: scroll/re-render after prior launch).
    clearDraftDisabled();
    setImageLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl: userUploadedImage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.urls?.[0]) {
        throw new Error(data.error || "Upload failed — please try again.");
      }
      const serverUrl = toAbsoluteMedia(data.urls[0]);
      setImageUrls([serverUrl]);
      setActiveImage(0);
      setImageUrl(serverUrl);
      setHasGenerated(true);
      // Cache as DataURL so the preview survives Render restarts
      cacheImagesFor24h(getActiveCtx(), [serverUrl]).catch(() => {});
      // Preserve whatever copy already exists from the conversation
      const draftId = creativeIdFromUrl(serverUrl);
      const _hlAS = (editHeadline || result?.headline || "").slice(0, 55);
      const _bdAS = editBody || result?.body || "";
      const _ovAS = normalizeOverlayCTA(editCTA || answers?.cta || "");
      saveImageDraftById(draftId, { headline: _hlAS, body: _bdAS, overlay: _ovAS });
      // Immediate durable save — preserves draft even if user navigates before autosave fires
      saveAdminClientDraftNow({ images: [serverUrl], headline: _hlAS, body: _bdAS, overlay: _ovAS, draftAnswers: buildCurrentIntakeAnswers() });
    } catch (err) {
      const msg = String(err?.message || "Photo upload failed.");
      setError(msg);
    } finally {
      setImageLoading(false);
    }
  }

  // Uploads a photo data URL directly to the media server and sets imageUrls + hasGenerated.
  // Used by upload_photo mode so handleUploadChange can auto-upload on file selection.
  async function handlePhotoCreative(dataUrl) {
    if (!dataUrl) return;
    // Clear draft-disabled flag so the autosave effect doesn't wipe this freshly
    // uploaded image when it fires (Bug 3: scroll/re-render after prior launch).
    clearDraftDisabled();
    setImageLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/media/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.urls?.[0]) {
        throw new Error(data.error || "Photo upload failed — please try again.");
      }
      const serverUrl = toAbsoluteMedia(data.urls[0]);
      setImageUrls([serverUrl]);
      setActiveImage(0);
      setImageUrl(serverUrl);
      setHasGenerated(true);
      cacheImagesFor24h(getActiveCtx(), [serverUrl]).catch(() => {});
      const draftId = creativeIdFromUrl(serverUrl);
      const _hlPC = (result?.headline || "").slice(0, 55);
      const _bdPC = result?.body || "";
      const _ovPC = normalizeOverlayCTA(answers?.cta || "");
      saveImageDraftById(draftId, { headline: _hlPC, body: _bdPC, overlay: _ovPC });
      // Immediate durable save
      saveAdminClientDraftNow({ images: [serverUrl], headline: _hlPC, body: _bdPC, overlay: _ovPC, draftAnswers: buildCurrentIntakeAnswers() });
    } catch (err) {
      setError(String(err?.message || "Photo upload failed."));
    } finally {
      setImageLoading(false);
    }
  }

  // Extracted generation logic so it can be called from the confirmation handler
  // and from the existing generate-trigger path without duplicating code.
  function triggerAiImageGeneration() {
    if (!canRunImageGen()) {
      const msg = quotaMessage();
      setError(msg);
      setChatHistory((ch) => [...ch, { from: "gpt", text: msg }]);
      return;
    }
    trackEvent("generate_creatives", { page: "form", action: "initial" });
    bumpImageGenCount();
    clearDraftDisabled();
    const nextCtx = buildCtxKey(answers || {});
    setActiveCtx(nextCtx);
    purgeCreativeDraftKeys();
    try { lsRemove(IMAGE_CACHE_KEY); lsRemove(IMAGE_DRAFTS_KEY); } catch {}
    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
    setHasGenerated(false);
    setImageEditing(false);
    setImageDataUrls([]);
    setImgFail({});
    setLoading(true);
    setGenerating(true);
    setChatHistory((ch) => [...ch, { from: "gpt", text: "AI thinking..." }]);
    const swapThinkingTimer = setTimeout(() => {
      setChatHistory((ch) => {
        const next = [...ch];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i]?.from === "gpt" && next[i]?.text === "AI thinking...") {
            next[i] = { ...next[i], text: "This could take about a minute — generating your previews…" };
            break;
          }
        }
        return next;
      });
    }, 700);
    setTimeout(async () => {
      const token = getRandomString();
      try { setImageUrls([]); setImageUrl(""); } catch {}
      try {
        await warmBackend();
        const _genResult = await generatePosterBPair(token);
        const _genImageUrl = _genResult?.urls?.[0] || "";
        // For multi-ad tests, generate different copy angles after the primary image is ready.
        // Fire-and-forget — doesn't block the UI from showing the primary creative.
        if (creativeTestCount > 1 && _genImageUrl) {
          generateAdCreativeSet(_genImageUrl).catch((e) => console.warn("[generateAdCreativeSet]", e?.message));
        }
        setChatHistory((ch) => [...ch, { from: "gpt", text: creativeTestCount > 1
          ? `Done! Generating ${creativeTestCount} ad angles for testing — one image, different copy per angle.`
          : "Done! Here are your ad previews. You can regenerate the image below." }]);
        setHasGenerated(true);
      } catch (err) {
        console.error("generation failed:", err);
        setError("Generation failed (server cold or busy). Try again in a few seconds.");
      } finally {
        clearTimeout(swapThinkingTimer);
        setGenerating(false);
        setLoading(false);
      }
    }, 80);
  }

  function handleCreativeSourceChange(newSource) {
    // Allow re-clicking "ai_image" even when already selected so the prompt re-appears.
    if (newSource === creativeSource && newSource !== "ai_image") return;

    setCreativeSource(newSource);

    if (newSource === "ai_image") {
      setMediaType("image");
      setCopyGenerated(false);
      // Prompt for confirmation — do not start generation immediately.
      setAwaitingAiImageConfirm(true);
      deliverQuestion("Do you want me to generate an AI image for this ad?");
    } else if (newSource === "upload_video") {
      setAwaitingAiImageConfirm(false);
      setUploadedVideoUrl("");
      setUploadedVideoMeta(null);
      setVideoUploadError("");
      setMediaType("video");
      setCopyGenerated(false);
    } else if (newSource === "upload_photo") {
      setAwaitingAiImageConfirm(false);
      setUploadedVideoUrl("");
      setUploadedVideoMeta(null);
      setVideoUploadError("");
      setMediaType("image");
      setCopyGenerated(false);
    }
  }

  async function handleVideoSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ALLOWED = ["video/mp4", "video/quicktime", "video/webm"];
    if (!ALLOWED.includes(file.type)) {
      setVideoUploadError("Unsupported file type. Please use MP4, MOV, or WEBM.");
      return;
    }
    const MAX_SIZE = 35 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setVideoUploadError(`File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 35 MB.`);
      return;
    }
    setVideoUploadError("");
    setVideoUploading(true);
    setUploadedVideoUrl("");
    setUploadedVideoMeta(null);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target.result);
        reader.onerror = () => reject(new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const r = await fetch(`${API_BASE}/upload-video-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, originalName: file.name }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Video upload failed.");
      setUploadedVideoUrl(j.videoUrl);
      setUploadedVideoMeta({ originalName: j.originalName, mimeType: j.mimeType, size: j.size });
      setMediaType("video");
      setHasGenerated(true); // unlock Continue
    } catch (err) {
      setVideoUploadError(err.message || "Video upload failed. Please try again.");
      setUploadedVideoUrl("");
      setMediaType("image");
    } finally {
      setVideoUploading(false);
    }
  }

  function handleRemoveVideo() {
    setUploadedVideoUrl("");
    setUploadedVideoMeta(null);
    setVideoUploadError("");
    setMediaType("image");
    // Restore hasGenerated based on whether images exist
    if (!imageUrls.length) setHasGenerated(false);
  }

  async function handleRegenerateImage() {
    if (!canRunImageGen()) {
      const msg = quotaMessage();
      setError(msg);
      alert(msg);
      return;
    }

    trackEvent("generate_creatives", {
      page: "form",
      action: "regenerate",
    });

    setImageLoading(true);
    setError("");

    try {
      // new regeneration run = new context
      const nextCtx = buildCtxKey(answers || {});
      setActiveCtx(nextCtx);

      // immediately clear current creative + any persisted setup drafts
      clearCreativeStateForRegeneration();

      bumpImageGenCount();
      await warmBackend();

      const token = getRandomString();
      await generatePosterBPair(token);

      setHasGenerated(true);
    } catch (e) {
      console.error("handleRegenerateImage failed:", e?.message || e);
      setError("Image regeneration failed. Please try again.");
    } finally {
      setImageLoading(false);
    }
  }


  // --- Static Ad Generator (UPDATED: no weird fallback bullets) ---
  async function handleGenerateStaticAd(
    template = "poster_b",
    assetsData = null,
    { regenerateToken = "", silent = false } = {}
  ) {
    // buildCurrentIntakeAnswers() is the single source of truth:
    //   - Admin-client: premiumIntake.websiteUrl always wins over stale answers.url
    //   - Normal mode: intakeUrlRef.current (breaks stale-closure) → editLink → answers.url
    const a = buildCurrentIntakeAnswers();
    const _genUrl = a.url;
    console.debug("[FORM GENERATE URL DEBUG]", {
      adminClientId,
      ctxKey: (typeof getActiveCtx === "function" ? getActiveCtx() : ""),
      answersUrl: answers?.url,
      editLink,
      intakeUrlRefCurrent: intakeUrlRef.current,
      premiumIntakeUrl: adminClientInfo?.premiumIntake?.websiteUrl || "(none)",
      finalUrlSentToGenerateStaticAd: _genUrl,
    });
    const fromAssets = assetsData && typeof assetsData === "object" ? assetsData : {};
    const fromResult = result || {};

    const baseBullets =
      (Array.isArray(fromAssets.bullets) && fromAssets.bullets.length
        ? fromAssets.bullets
        : Array.isArray(fromResult.bullets) && fromResult.bullets.length
        ? fromResult.bullets
        : []) || [];

    const craftedCopy = {
      headline: (fromAssets.headline || editHeadline || result?.headline || "").toString(),
      subline: (fromAssets.subline || editBody || result?.body || "").toString(),
      offer: (fromAssets.offer || a.offer || a.saveAmount || "").toString(),
      secondary: (fromAssets.secondary || "").toString(),
      bullets: baseBullets,
      disclaimers: (fromAssets.disclaimers || "").toString(),
      cta: (fromAssets.cta || displayCTA || a.cta || "").toString(),
    };

    const safeIndustry = (a.industry || "Local Services").toString().trim().slice(0, 60);
    const safeBiz = (a.businessName || "Your Business").toString().trim().slice(0, 60);
    const safeLocation = (
      [a.city, a.state].filter(Boolean).join(", ") ||
      a.location ||
      "Your City"
    ).toString().trim().slice(0, 60);

    const knobs = {
      size: "1080x1080",
      backgroundHint: safeIndustry,
      backgroundUrl: a.backgroundUrl || "",
    };

    const payload = {
      template,
      regenerateToken,
      inputs: {
        industry: safeIndustry,
        businessName: safeBiz,
        location: safeLocation,
      },
      knobs,
      copy: {
        headline: craftedCopy.headline,
        subline: craftedCopy.subline,
        offer: craftedCopy.offer,
        secondary: craftedCopy.secondary,
        bullets: craftedCopy.bullets,
        disclaimers: craftedCopy.disclaimers,
        cta: craftedCopy.cta,
      },
      // Explicit top-level url/website so backend defensive fix can read them
      // without digging into nested answers — avoids any stale nested value winning.
      url:     _genUrl,
      website: _genUrl,
      answers: {
        ...a,
        industry: safeIndustry,
        businessName: safeBiz,
        location: safeLocation,
        offer: a.offer || a.saveAmount || craftedCopy.offer || "",
        url:     _genUrl,
        websiteUrl: _genUrl,
        // User-uploaded photo — passed only when present; never persisted to draft
        ...(userUploadedImage ? { userImage: userUploadedImage } : {}),
      },
    };

    try {
      // Send session ID so the backend resolves the correct plan key and enforces
      // the right daily limit. Without credentials the backend sees every request
      // as a visitor (limit=1) while the UI shows the logged-in plan limit.
      const _genSid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const res = await fetch(`${API_BASE}/generate-static-ad`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(_genSid ? { "x-sm-sid": _genSid } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        const msg = data?.error || `Static ad generation failed (HTTP ${res.status})`;
        setError(msg);
        if (!silent) alert(msg);
        return "";
      }

      const png = toAbsoluteMedia(
        data.pngUrl || data.absoluteUrl || data.url || (data.filename ? `/api/media/${data.filename}` : "")
      );

      if (!png) {
        const msg = "Static ad returned without a URL.";
        setError(msg);
        if (!silent) alert(msg);
        return "";
      }

      if (!silent) {
        setChatHistory((ch) => [...ch, { from: "gpt", text: `Static ad generated with template "${template}".` }]);
      }

      return png;
    } catch (e) {
      console.error("[SM][static-ad:ERR]", e?.message || e);
      const msg = "Static ad failed. Please try again.";
      setError(msg);
      if (!silent) alert(msg);
      return "";
    }
  }

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
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          background:
            "linear-gradient(120deg, rgba(255,255,255,0.22) 10%, rgba(255,255,255,0.03) 34%, rgba(151,145,233,0.08) 62%, rgba(143,135,255,0.10) 100%)",
        }}
      />

         <div
        aria-hidden
        style={{
          position: "fixed",
          top: "-12vh",
          right: "-8vw",
          width: 640,
          height: 640,
          background: "radial-gradient(42% 42% at 50% 50%, rgba(156,149,243,0.14), transparent 72%)",
          filter: "blur(24px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
       <div style={{ width: "100%", maxWidth: 980, padding: "28px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <button
            onClick={() => {
              if (adminClientId) {
                try { localStorage.removeItem("sm_admin_target_client_id"); } catch {}
                try { localStorage.removeItem("sm_admin_target_client_label"); } catch {}
                navigate("/admin/clients");
              } else {
                navigate("/");
              }
            }}
            style={{
              background: "rgba(255,255,255,0.74)",
              color: adminClientId ? "#5d59ea" : "#4d4a5d",
              border: adminClientId ? "1px solid rgba(93,89,234,0.22)" : "1px solid rgba(80,72,120,0.10)",
              borderRadius: "1.2rem",
              padding: "11px 18px",
              fontWeight: 700,
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(66,54,120,0.10)",
              display: "flex",
              alignItems: "center",
              gap: 8,
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
            aria-label={adminClientId ? "Exit Client Mode" : "Back"}
          >
            <FaArrowLeft />
            {adminClientId ? "Admin Dashboard" : "Back"}
          </button>

          <button
            onClick={() => {
              if (adminClientId) {
                navigate(withAdminClientQuery("/setup", adminClientId), {
                  state: {
                    adminClientId,
                    adminClientBusinessName: adminClientInfo?.premiumIntake?.businessName || adminClientInfo?.displayName || adminClientInfo?.email || "",
                  },
                });
              } else {
                navigate("/setup");
              }
            }}
            style={{
              background: "#1a1a22",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "1.2rem",
              padding: "11px 18px",
              fontWeight: 800,
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
            aria-label="Dashboard"
          >
            Dashboard
          </button>
        </div>

        {adminClientId && (
          <div style={{
            margin: "14px auto 0",
            maxWidth: 980,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            background: "rgba(93,89,234,0.10)",
            border: "1px solid rgba(93,89,234,0.22)",
            borderRadius: 10,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 700,
            color: "#3d3a8a",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: "#5d59ea", color: "#fff", borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>Client Mode</span>
              <span>Creating ad for:</span>
              <span style={{ fontWeight: 800 }}>
                {adminClientInfo?.premiumIntake?.businessName || adminClientInfo?.displayName || adminClientInfo?.email || adminClientId}
              </span>
            </div>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "1.7rem" : "2.45rem",
              lineHeight: 1.15,
              letterSpacing: "-0.8px",
              color: "#1a1a22",
              textAlign: "center",
              fontWeight: 700,
            }}
          >
            Create your ad
          </h1>
        </div>
      </div>

      {/* Creative type picker moved to the preview panel header (compact pills below) */}

         <div
        style={{
          width: "100%",
          maxWidth: 760,
          marginTop: 20,
          marginBottom: 26,
          background: "rgba(248,246,242,0.78)",
          borderRadius: 28,
          border: `1px solid ${EDGE}`,
          boxShadow: "0 16px 42px rgba(66,54,120,0.10)",
          padding: isMobile ? "10px 10px 10px" : "16px 18px 14px 18px",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          zIndex: 1,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
             <div
          style={{
            color: "#7a728f",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 8,
            letterSpacing: 0.5,
            textAlign: "center",
          }}
        >
          AI Ad Manager
        </div>

            <div
          ref={chatBoxRef}
          className="chat-scroll"
          style={{
            width: "100%",
            minHeight: 180,
            maxHeight: 360,
            overflowY: "auto",
            marginBottom: 10,
            padding: "10px 12px",
            background: "rgba(250,248,244,0.52)",
            borderRadius: 16,
            border: `1px solid ${EDGE}`,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {/* ── Context loading state (admin mode: prevents "Are you ready?" flash) ── */}
          {contextStatus === "loading" ? (
            <div style={{ alignSelf: "flex-start", color: "#7a728f", fontWeight: 600, fontSize: 15, padding: "10px 4px" }}>
              Loading campaign details…
            </div>
          ) : contextStatus === "missing" && !manualFormMode ? (
            /* ── Missing intake empty state ── */
            <div style={{ padding: "8px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#1a1a2e" }}>
                Campaign intake needed
              </div>
              <div style={{ fontSize: 14, color: "#6b7785", lineHeight: 1.6 }}>
                We don't have enough campaign details for this client yet. Complete the intake first so Smartemark can recommend the right objective and generate stronger ads.
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                <button
                  onClick={() => {
                    const dest = adminClientId
                      ? `/premium-intake?adminClientId=${encodeURIComponent(adminClientId)}`
                      : "/premium-intake";
                    navigate(dest);
                  }}
                  style={{
                    background: "linear-gradient(135deg, #4c63ff 0%, #5f56eb 100%)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "13px 20px",
                    fontWeight: 800,
                    fontSize: 14,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  Open Intake Form
                </button>
                <button
                  onClick={() => {
                    setManualFormMode(true);
                    setContextStatus("idle");
                    setAwaitingReady(true);
                    setStep(0);
                    setChatHistory(INITIAL_CHAT);
                  }}
                  style={{
                    background: "transparent",
                    color: "#6b7785",
                    border: "1px solid #d4d8e0",
                    borderRadius: 12,
                    padding: "11px 20px",
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  Continue Manually
                </button>
              </div>
            </div>
          ) : (
            <>
              {chatHistory.slice(-40).map((msg, i) => {
                const isGPT = msg.from === "gpt";
                return (
                  <div
                    key={i}
                    style={{
                      alignSelf: isGPT ? "flex-start" : "flex-end",
                      color: isGPT ? "#262331" : "#1f1a2d",
                      background: isGPT ? "rgba(255,255,255,0.90)" : "rgba(233,228,255,0.94)",
                      border: `1px solid ${EDGE}`,
                      borderRadius: 14,
                      padding: "8px 12px",
                      maxWidth: "85%",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      boxShadow: "0 2px 8px rgba(66,54,120,0.05)",
                      fontWeight: 500,
                      fontSize: 13.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.text}
                  </div>
                );
              })}

              {/* Typewriter bubble — AI reply being revealed progressively */}
              {!!typingMsg && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    color: "#262331",
                    background: "rgba(255,255,255,0.90)",
                    border: `1px solid ${EDGE}`,
                    borderRadius: 14,
                    padding: "8px 12px",
                    maxWidth: "85%",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    boxShadow: "0 2px 8px rgba(66,54,120,0.05)",
                    fontWeight: 500,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  {typingMsg.slice(0, typingIdx)}
                  <span style={{ opacity: 0.4 }}>▍</span>
                </div>
              )}

              {/* Thinking bubble — shown while waiting for GPT response */}
              {chatIsThinking && !typingMsg && (
                <div
                  style={{
                    alignSelf: "flex-start",
                    color: "#7d7794",
                    background: "rgba(255,255,255,0.88)",
                    border: `1px solid ${EDGE}`,
                    borderRadius: 14,
                    padding: "7px 14px",
                    maxWidth: "85%",
                    boxShadow: "0 2px 8px rgba(66,54,120,0.05)",
                    fontWeight: 500,
                    fontSize: "1rem",
                    letterSpacing: "0.1em",
                  }}
                >
                  •••
                </div>
              )}
            </>
          )}
        </div>

        {/* ══ Objective / Creative inline panel ══════════════════════════════ */}
        {contextStatus !== "missing" && objectiveStep !== "none" && (
          <div style={{ width: "100%", padding: "8px 0 4px", fontFamily: MODERN_FONT }}>

            {/* ── choosing: show all 6 objective cards ── */}
            {objectiveStep === "choosing" && (
              <>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#8e87b0", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8, textAlign: "center" }}>
                  Choose your campaign objective
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 7 }}>
                  {CAMPAIGN_OBJECTIVES.map((obj) => {
                    const isRec = aiRecommendedObjective?.value === obj.value;
                    return (
                      <button
                        key={obj.value}
                        onClick={() => handleClickObjective(obj)}
                        style={{
                          position: "relative",
                          background: isRec ? "#f0efff" : "#f7f8fe",
                          border: isRec ? "2px solid #5d59ea" : "2px solid #e4e7ec",
                          borderRadius: 13,
                          padding: "10px 10px 9px 10px",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s",
                          fontFamily: MODERN_FONT,
                        }}
                      >
                        {isRec && (
                          <div style={{ position: "absolute", top: 6, right: 7, background: "#5d59ea", color: "#fff", fontSize: 8, fontWeight: 900, borderRadius: 5, padding: "2px 5px", letterSpacing: 0.4 }}>
                            AI PICK
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
                          <span style={{ fontSize: 16 }}>{obj.icon}</span>
                          <span style={{ fontWeight: 800, fontSize: 12.5, color: "#1a1a2e" }}>{obj.label}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "#6b7785", lineHeight: 1.38, marginBottom: 4 }}>{obj.description}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: obj.launchSupported ? "#2cb67d" : "#a8afc0" }}>
                          {obj.launchSupported ? "✓ Launch supported" : "Planning only"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* ── confirming: show the selected card + Confirm / Change buttons ── */}
            {objectiveStep === "confirming" && pendingObjective && (
              <div style={{ background: "#f4f2ff", border: "2px solid #5d59ea", borderRadius: 16, padding: "16px 18px" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5d59ea", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  Confirm objective
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 26 }}>{pendingObjective.icon}</span>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: "#1a1a2e" }}>{pendingObjective.label}</div>
                    <div style={{ fontSize: 12, color: "#6b7785", marginTop: 1 }}>{pendingObjective.description}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: pendingObjective.launchSupported ? "#2cb67d" : "#9aa6b2", marginBottom: 14 }}>
                  {pendingObjective.launchSupported ? "✓ Launch supported" : "Planning only"}
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={handleConfirmObjective}
                    style={{ flex: 1, minWidth: 130, background: "#5d59ea", color: "#fff", border: "none", borderRadius: 11, padding: "11px 16px", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: MODERN_FONT }}
                  >
                    Confirm Objective
                  </button>
                  <button
                    onClick={handleChangeObjective}
                    style={{ flex: 1, minWidth: 130, background: "#fff", color: "#5d59ea", border: "2px solid #5d59ea", borderRadius: 11, padding: "11px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: MODERN_FONT }}
                  >
                    Choose Different
                  </button>
                </div>
              </div>
            )}

            {/* ── chosen: show confirmed objective + Change button + creative format cards ── */}
            {objectiveStep === "chosen" && selectedObjective && (
              <>
                {/* Confirmed objective pill */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "#f0efff", border: "2px solid #5d59ea", borderRadius: 12, padding: "10px 14px", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{selectedObjective.icon}</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#8e87b0", textTransform: "uppercase", letterSpacing: 0.5 }}>Objective</div>
                      <div style={{ fontWeight: 800, fontSize: 13.5, color: "#1a1a2e" }}>{selectedObjective.label}</div>
                    </div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: selectedObjective.launchSupported ? "#2cb67d" : "#9aa6b2", marginLeft: 4 }}>
                      {selectedObjective.launchSupported ? "✓ Launch" : "Planning"}
                    </div>
                  </div>
                  <button
                    onClick={handleChangeObjective}
                    style={{ background: "none", color: "#5d59ea", border: "1.5px solid #5d59ea", borderRadius: 9, padding: "5px 12px", fontWeight: 700, fontSize: 11.5, cursor: "pointer", whiteSpace: "nowrap", fontFamily: MODERN_FONT }}
                  >
                    Change
                  </button>
                </div>

                {/* Creative format — compact pills now live in the preview panel header */}
              </>
            )}

          </div>
        )}

        {!loading && contextStatus !== "loading" && !(contextStatus === "missing" && !manualFormMode) && (
               <form
            onSubmit={handleUserInput}
            style={{
              width: "100%",
              display: "flex",
              gap: 10,
              alignItems: "center",
              background: "rgba(255,255,255,0.88)",
              border: `1px solid ${EDGE}`,
              borderRadius: 22,
              padding: 8,
              boxShadow: "0 8px 24px rgba(66,54,120,0.06)",
              opacity: chatIsThinking || !!typingMsg ? 0.6 : 1,
              transition: "opacity 0.2s",
            }}
          >
            <button
              type="button"
              onClick={hardResetChat}
              title="Reset chat"
              aria-label="Reset chat"
              style={{
                background: "transparent",
                color: "#7d7794",
                border: "none",
                borderRadius: 14,
                width: 44,
                height: 44,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "0 0 auto",
              }}
            >
              <FaSyncAlt />
            </button>

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || chatIsThinking || !!typingMsg}
              autoFocus
              placeholder="How can I help you today?"
              aria-label="Your answer"
              autoComplete="off"
              style={{
                flex: 1,
                padding: "14px 8px",
                borderRadius: 14,
                border: "none",
                outline: "none",
                fontSize: "1.05rem",
                fontWeight: 500,
                background: "transparent",
                color: "#24212f",
                boxShadow: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: "transparent",
                color: "#6f66f5",
                border: "none",
                borderRadius: 14,
                width: 44,
                height: 44,
                fontWeight: 900,
                fontSize: "1.1rem",
                cursor: "pointer",
                flex: "0 0 auto",
              }}
              disabled={loading || chatIsThinking || !!typingMsg}
              tabIndex={0}
              aria-label="Send"
            >
              <FaArrowUp />
            </button>
          </form>
        )}

        {loading && (
          <div style={{ color: "#15efb8", marginTop: 10, fontWeight: 700, textAlign: "center" }}>
            AI generating...
          </div>
        )}
        {error && <div style={{ color: "#f35e68", marginTop: 18, textAlign: "center" }}>{error}</div>}
      </div>

      {/* ── Ad count selector — how many creative angles to test ── */}
      {contextStatus === "loaded" && objectiveStep === "chosen" && (
        <div style={{ width: "100%", marginTop: 12, marginBottom: 4, padding: "10px 14px", background: "rgba(93,89,234,0.05)", borderRadius: 14, border: "1px solid rgba(93,89,234,0.12)" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#3a3648", marginBottom: 8 }}>
            How many ad creatives do you want to test?
          </div>
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {[1, 2, 3, 4].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCreativeTestCount(n)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: n === creativeTestCount ? "2px solid #5d59ea" : "1.5px solid #d8d4ed",
                  background: n === creativeTestCount ? "#5d59ea" : "rgba(255,255,255,0.8)",
                  color: n === creativeTestCount ? "#fff" : "#5a5270",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                {n} ad{n > 1 ? "s" : ""}
                {n === 3 ? " ✓" : ""}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#8b85a8", marginTop: 6, lineHeight: 1.5 }}>
            Smartemark will launch one campaign and one ad set, then test multiple ads inside it.
            {creativeTestCount > 2 && " With smaller budgets, 2–3 ads is usually better than 4."}
          </div>
        </div>
      )}

         {/* ── Compact creative format picker pills — replaces the large top cards ── */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 10, marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { id: "ai_image",     label: "✨ AI Image" },
            { id: "upload_photo", label: "📷 Upload Photo" },
            { id: "upload_video", label: "🎬 Upload Video" },
          ].map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => handleCreativeSourceChange(id)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                border: creativeSource === id ? "1.5px solid #6c63d4" : "1.5px solid #d8d4ed",
                background: creativeSource === id ? "#eeecff" : "rgba(255,255,255,0.82)",
                color: creativeSource === id ? "#4c3db0" : "#7b74c0",
                fontWeight: creativeSource === id ? 800 : 600,
                fontSize: 12,
                cursor: "pointer",
                transition: "all 0.12s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: isMobile ? 12 : 34, flexWrap: "wrap", width: "100%", paddingBottom: 8 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 13,
            boxShadow: "0 2px 24px #16242714",
            minWidth: isMobile ? "92vw" : 340,
            maxWidth: isMobile ? "96vw" : 390,
            flex: 1,
            marginBottom: 20,
            padding: "0px 0px 14px 0px",
            border: "1.5px solid #eaeaea",
            fontFamily: AD_FONT,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              background: "#f5f6fa",
              padding: "11px 20px",
              borderBottom: "1px solid #e0e4eb",
              fontWeight: 700,
              color: "#495a68",
              fontSize: 16,
              letterSpacing: 0.08,
            }}
          >
            {/* Hidden file input — always present so refs work in all modes */}
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: "none" }}
              onChange={handleUploadChange}
            />

            {creativeSource === "ai_image" ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                {/* Upload control — small optional photo for AI mode */}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {userUploadedImage ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <img
                        src={userUploadedImage}
                        alt="Your photo"
                        onClick={() => uploadInputRef.current?.click()}
                        title="Click to replace photo"
                        style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, border: "2px solid #8f87ff", cursor: "pointer", flexShrink: 0 }}
                      />
                      <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid #ddd8ed", flexShrink: 0 }}>
                        <button onClick={() => setUploadMode("asis")} title="Use your photo exactly as-is" style={{ background: uploadMode === "asis" ? "#6c63d4" : "rgba(255,255,255,0.85)", color: uploadMode === "asis" ? "#fff" : "#7b74c0", border: "none", padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Use as-is</button>
                        <button onClick={() => setUploadMode("ai")} title="AI design from your photo" style={{ background: uploadMode === "ai" ? "#6c63d4" : "rgba(255,255,255,0.85)", color: uploadMode === "ai" ? "#fff" : "#7b74c0", border: "none", padding: "4px 9px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>AI design</button>
                      </div>
                      <button onClick={() => { setUserUploadedImage(null); setUploadMode("ai"); }} title="Remove photo" style={{ background: "none", border: "none", cursor: "pointer", color: "#a09ab8", fontSize: 13, padding: 2, lineHeight: 1, flexShrink: 0 }}><FaTimes /></button>
                    </div>
                  ) : (
                    <button onClick={() => uploadInputRef.current?.click()} title="Add your own photo (optional)" style={{ background: "none", border: "1.5px dashed #c8c2d8", borderRadius: 7, padding: "4px 10px", fontSize: 12, color: "#9990b8", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span>Add photo
                    </button>
                  )}
                </div>
                <button
                  style={{ background: "none", color: "#5a5a6e", border: "1px solid rgba(0,0,0,0.13)", borderRadius: 8, fontWeight: 600, fontSize: "0.93rem", padding: "5px 14px", cursor: imageLoading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: imageLoading ? 0.5 : 1, whiteSpace: "nowrap" }}
                  onClick={userUploadedImage && uploadMode === "asis" ? handleUploadAsIs : handleRegenerateImage}
                  disabled={imageLoading}
                  title={userUploadedImage && uploadMode === "asis" ? "Use this photo as your ad creative" : "Regenerate Image Ad"}
                >
                  <FaSyncAlt style={{ fontSize: 13 }} />
                  {imageLoading || generating ? <Dotty /> : (userUploadedImage && uploadMode === "asis" ? "Use photo" : "Regenerate")}
                </button>
              </div>
            ) : creativeSource === "upload_photo" ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                {imageLoading ? (
                  <div style={{ fontSize: 13, color: "#7b74c0", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                    <Dotty /> Uploading photo...
                  </div>
                ) : (userUploadedImage || imageUrls[0]) ? (
                  // Show photo preview + Generate Copy as soon as EITHER the data URL or server URL exists.
                  // Prefer userUploadedImage for display (matches what the user sees) and for vision analysis.
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <img
                      src={userUploadedImage || imageUrls[0]}
                      alt="Your photo"
                      style={{ width: 38, height: 38, objectFit: "cover", borderRadius: 8, border: "2px solid #6c63d4" }}
                    />
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 13, color: "#4c3db0" }}>Photo selected</div>
                      <div style={{ fontSize: 11, color: "#7b74c0" }}>Ready to continue</div>
                    </div>
                    <button
                      onClick={handleGenerateCopyForUpload}
                      disabled={loading}
                      title="Generate ad copy matched to this photo"
                      style={{ background: "#eeecff", border: "1.5px solid #6c63d4", borderRadius: 7, padding: "4px 10px", fontSize: 12, color: "#4c3db0", fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
                    >
                      ✨ Generate Copy
                    </button>
                    <button onClick={() => uploadInputRef.current?.click()} style={{ background: "none", border: "1px solid #c8c2d8", borderRadius: 7, padding: "4px 10px", fontSize: 12, color: "#7b74c0", fontWeight: 600, cursor: "pointer" }}>Change</button>
                    <button onClick={() => { setUserUploadedImage(null); setImageUrls([]); setImageUrl(""); setHasGenerated(false); }} style={{ background: "none", border: "none", color: "#a09ab8", cursor: "pointer", fontSize: 15, padding: "0 4px", lineHeight: 1 }}>×</button>
                  </div>
                ) : (
                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    style={{ background: "#f0eeff", border: "2px dashed #8f87ff", borderRadius: 10, padding: "10px 18px", fontSize: 13, color: "#4c3db0", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ fontSize: 20 }}>📷</span>
                    Upload your photo
                    <span style={{ fontWeight: 500, color: "#7b74c0", fontSize: 11 }}>JPG, PNG, WEBP</span>
                  </button>
                )}
              </div>
            ) : (
              /* upload_video: just show a label — video section below is the main area */
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4c3db0" }}>
                🎬 Video ad creative
              </div>
            )}

            {/* Generation quota — only relevant for AI image mode */}
            {creativeSource === "ai_image" && (
              <div style={{ fontSize: 12, color: "#6b7785", fontWeight: 700, marginTop: 6 }}>
                {(() => {
                  const q = loadGenQuota();
                  const remaining = Math.max(0, regenLimit - (q.used || 0));
                  const totalMins = Math.max(1, Math.ceil((q.resetAt - Date.now()) / 60000));
                  const hrs = Math.floor(totalMins / 60);
                  const mins = totalMins % 60;
                  const resetStr = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                  return `Generations left today: ${remaining}/${regenLimit} (resets in ~${resetStr})`;
                })()}
              </div>
            )}

            {/* ── Video upload section — primary for upload_video, optional for ai_image, hidden for upload_photo ── */}
            {creativeSource !== "upload_photo" && (
              <div style={{ marginTop: 14, borderTop: creativeSource === "upload_video" ? "none" : "1px solid #e8e4f0", paddingTop: creativeSource === "upload_video" ? 0 : 14 }}>
                {/* Upload video label/description removed — intent is clear from the creative controls above */}

                <input
                  ref={videoInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  style={{ display: "none" }}
                  onChange={handleVideoSelect}
                />

                {uploadedVideoUrl ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8 }}>
                    <span style={{ fontSize: 18 }}>🎬</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{uploadedVideoMeta?.originalName || "video.mp4"}</div>
                      <div style={{ fontSize: 11, color: "#9990b8" }}>
                        {uploadedVideoMeta?.mimeType} · {uploadedVideoMeta?.size ? (uploadedVideoMeta.size / 1024 / 1024).toFixed(1) + " MB" : ""}
                        <span style={{ marginLeft: 6, color: "#059669", fontWeight: 700 }}>● Selected as creative</span>
                      </div>
                    </div>
                    <button onClick={() => videoInputRef.current?.click()} style={{ background: "none", border: "none", color: "#7b74c0", cursor: "pointer", fontSize: 11, fontWeight: 600, padding: "2px 6px" }}>Replace</button>
                    <button onClick={handleRemoveVideo} style={{ background: "none", border: "none", color: "#a09ab8", cursor: "pointer", fontSize: 15, padding: "0 4px", lineHeight: 1 }}>×</button>
                  </div>
                ) : videoUploading ? (
                  <div style={{ fontSize: 12, color: "#7b74c0", padding: "8px 12px", background: "#f5f3ff", border: "1px solid #ddd8ed", borderRadius: 8 }}>Uploading video…</div>
                ) : (
                  <button
                    onClick={() => videoInputRef.current?.click()}
                    style={{
                      background: creativeSource === "upload_video" ? "#f0eeff" : "none",
                      border: creativeSource === "upload_video" ? "2px dashed #8f87ff" : "1.5px dashed #c8c2d8",
                      borderRadius: creativeSource === "upload_video" ? 10 : 7,
                      padding: creativeSource === "upload_video" ? "10px 18px" : "6px 14px",
                      fontSize: creativeSource === "upload_video" ? 13 : 12,
                      color: creativeSource === "upload_video" ? "#4c3db0" : "#9990b8",
                      fontWeight: creativeSource === "upload_video" ? 700 : 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: creativeSource === "upload_video" ? 8 : 6,
                    }}
                  >
                    <span style={{ fontSize: creativeSource === "upload_video" ? 20 : 15 }}>🎬</span>
                    {creativeSource === "upload_video" ? "Upload your video" : "Upload video ad"}
                    {creativeSource === "upload_video" && <span style={{ fontWeight: 500, color: "#7b74c0", fontSize: 11 }}>MP4, MOV, WEBM</span>}
                  </button>
                )}

                {videoUploadError && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "6px 10px" }}>{videoUploadError}</div>
                )}

                <div style={{ marginTop: 5, fontSize: 11, color: "#b8b4cc" }}>MP4, MOV, or WEBM · max 35 MB</div>
              </div>
            )}
          </div>

          {/* Image preview area — hidden for upload_video (video is shown above) */}
          {creativeSource !== "upload_video" && (
          <div
            style={{
              background: "#222",
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 220,
            }}
          >
            {imageLoading ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : generating ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : imageUrls.length > 0 ? (
              <img
                src={(imageDataUrls[activeImage] || toAbsoluteMedia(imageUrls[activeImage] || "")) || ""}
                alt="Ad Preview"
                style={{ width: "100%", maxHeight: 340, objectFit: "contain", borderRadius: 0, cursor: "pointer", background: "#111" }}
                onClick={() => handleImageClick(imageDataUrls[activeImage] || imageUrls[activeImage])}
                onError={() => {
                  setImgFail((p) => ({ ...p, [activeImage]: true }));
                  const ctx = getActiveCtx();
                  const c = loadImageCache(ctx);
                  const cached = c?.dataUrls?.filter(Boolean).slice(0, 2) || [];
                  if (cached.length) setImageDataUrls(cached);
                }}
              />
            ) : userUploadedImage ? (
              <img
                src={userUploadedImage}
                alt="Your uploaded photo"
                style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 0, cursor: "pointer" }}
                onClick={() => handleImageClick(userUploadedImage)}
              />
            ) : (
              <div
                style={{
                  height: 220,
                  width: "100%",
                  background: "#e9ecef",
                  color: "#a9abb0",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: creativeSource === "upload_photo" ? 14 : 22,
                }}
              >
                {creativeSource === "upload_photo" ? "Upload your photo above to preview it here" : "Image goes here"}
              </div>
            )}
          </div>
          )}

          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {displayHeadline}
            </div>
            <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 6, minHeight: 18, whiteSpace: "pre-wrap" }}>
  {displayBody}
</div>

{displayLink ? (
  <div
    style={{
      marginTop: 6,
      fontSize: 13,
      fontWeight: 800,
      color: "#1b6fff",
      wordBreak: "break-word",
      lineHeight: 1.25,
    }}
  >
    Learn more:{" "}
    <a
      href={displayLink}
      target="_blank"
      rel="noreferrer"
      style={{ color: "#1b6fff", textDecoration: "none" }}
      title={displayLink}
    >
      {prettyLink(displayLink)}
    </a>
  </div>
) : null}

          </div>

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
              zIndex: 2,
            }}
            onClick={() => setImageEditing((v) => !v)}
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
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #e4e7ec", padding: "10px 12px", fontWeight: 700 }}
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
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #e4e7ec", padding: "10px 12px", fontWeight: 600 }}
                />
              </label>

              <label style={{ display: "block" }}>
  <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>Link URL</div>
  <input
    value={editLink}
    onChange={(e) => {
      const v = e.target.value;
      setEditLink(v);
      intakeUrlRef.current = v; // update ref immediately so stale closures get the new URL
      setAnswers((prev) => ({ ...(prev || {}), url: v })); // ✅ keeps launch link correct
    }}
    onBlur={() => {
      const v = (editLink || "").trim();
      setEditLink(v);
      intakeUrlRef.current = v;
      setAnswers((prev) => ({ ...(prev || {}), url: v }));
    }}
    placeholder="https://yourbusiness.com"
    style={{
      width: "100%",
      borderRadius: 10,
      border: "1px solid #e4e7ec",
      padding: "10px 12px",
      fontWeight: 700,
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
                  style={{ width: "100%", borderRadius: 10, border: "1px solid #e4e7ec", padding: "10px 12px", fontWeight: 700 }}
                />
              </label>
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 10,
          paddingBottom: 28,
          gap: 10,
        }}
      >
        <button
          disabled={false}
        style={{
  background: "#e9e4dc",
  color: "#3a3648",
  border: "none",
  borderRadius: 13,
  fontWeight: 900,
  fontSize: "1.08rem",
  padding: "16px 56px",
  marginBottom: 4,
  fontFamily: MODERN_FONT,
  boxShadow: "0 8px 22px rgba(90,82,120,0.08)",
  cursor: "pointer",
  transition: "background 0.18s, opacity 0.18s, transform 0.18s",
  opacity: 1,
  transform: "translateY(0)",
}}
          onClick={() => {
            const isVideoMode = mediaType === "video" && !!uploadedVideoUrl;

            if (creativeSource === "upload_photo" && !hasGenerated) {
              alert("Upload your photo first.");
              return;
            }
            if (creativeSource === "upload_video" && !isVideoMode) {
              alert("Upload your video first.");
              return;
            }
            if (creativeSource === "ai_image" && !hasGenerated && !isVideoMode) {
              alert("Generate your previews first. Type 'yes' in the chat.");
              return;
            }

            const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;

            const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
            const mergedBody = activeDraft?.body || result?.body || "";
            const mergedCTA = normalizeOverlayCTA(
              activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
            );

            // Ensure the URL the user SEES in editLink is the one that goes to setup.
            // editLink is authoritative — it's the user-visible edit field.
            // This prevents stale premiumIntake URLs from leaking into the launch.
            const _finalUrl = (editLink || answers?.url || "").trim();
            const answersForSetup = _finalUrl !== (answers?.url || "").trim()
              ? { ...answers, url: _finalUrl }
              : answers;

            console.debug("[FORM URL DEBUG]", {
              adminClientId,
              ctxKey: getActiveCtx?.(),
              answersUrl: answers?.url,
              editLink,
              resultLink: result?.link,
              finalPreviewLink: _finalUrl,
              setupPath: withAdminClientQuery("/setup", adminClientId),
            });

            const cached = (imageDataUrls || []).filter(Boolean).slice(0, 2);
            let imgA = (cached.length ? cached : imageUrls.map(abs)).slice(0, 1);

            // Fallback: if imageUrls was cleared by the autosave guard (Bug 2),
            // recover the images from the last saved creative draft in localStorage.
            if (!imgA.length) {
              try {
                const _fbKey = adminClientId
                  ? `u:adminClient:${adminClientId}:${CREATIVE_DRAFT_KEY}`
                  : null;
                const _fbRaw = _fbKey
                  ? localStorage.getItem(_fbKey)
                  : (ssGet("draft_form_creatives") || lsGet(CREATIVE_DRAFT_KEY) || lsGet("sm_setup_creatives_backup_v1"));
                if (_fbRaw) {
                  const _fbObj = JSON.parse(_fbRaw);
                  const _fbImgs = (Array.isArray(_fbObj?.images) ? _fbObj.images : []).filter(Boolean);
                  if (_fbImgs.length) {
                    imgA = _fbImgs.slice(0, 1);
                    console.debug("[creative] imgA recovered from saved draft:", imgA);
                  }
                }
              } catch {}
            }

            const ctxKey = getActiveCtx() || buildCtxKey(answers || {});
            setActiveCtx(ctxKey);

            if (isVideoMode) {
              // ── Video creative path ─────────────────────────────────────────
              try {
                const _vUrl = String(_finalUrl || answers?.url || "").trim();
                localStorage.setItem("sm_last_website_url_v1", _vUrl);
                if (adminClientId) localStorage.setItem(`u:adminClient:${adminClientId}:sm_last_website_url_v1`, _vUrl);
              } catch {}
              try {
                localStorage.setItem("smartmark_media_selection", "video");
                localStorage.setItem("smartmark_last_video_url", uploadedVideoUrl);
                localStorage.setItem("smartmark_last_video_meta", JSON.stringify(uploadedVideoMeta || {}));
                localStorage.removeItem("smartmark_last_image_url");
                localStorage.removeItem("smartmark_last_fb_video_id");
              } catch {}
              // Save campaign context before navigating (fire-and-forget)
              try {
                fetch("/api/campaign-context/save", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify({
                    ctxKey,
                    answers,
                    selectedObjective: selectedObjective || aiRecommendedObjective || null,
                    creativePreference: "upload_video",
                    ...(adminClientId ? { adminClientId } : {}),
                  }),
                }).catch(() => {});
              } catch {}

              navigate(withAdminClientQuery("/setup", adminClientId), {
                state: {
                  ctxKey,
                  mediaType: "video",
                  mediaSelection: "video",
                  videoUrl: uploadedVideoUrl,
                  videoMeta: uploadedVideoMeta || {},
                  imageUrls: [],
                  headline: mergedHeadline,
                  body: mergedBody,
                  imageOverlayCTA: mergedCTA,
                  answers: answersForSetup,
                  selectedObjective: selectedObjective || aiRecommendedObjective || null,
                  ...(adminClientId ? {
                    adminClientId,
                    adminClientBusinessName: adminClientInfo?.premiumIntake?.businessName || adminClientInfo?.displayName || adminClientInfo?.email || "",
                  } : {}),
                },
              });
              return;
            }

            // ── Image creative path (existing) ─────────────────────────────────
            const draftForSetup = {
  ctxKey,
  images: imgA,
  headline: mergedHeadline,
  body: appendUrlToCopy(mergedBody, answers?.url),
  imageOverlayCTA: mergedCTA,
  answers,
  mediaSelection: "image",
  savedAt: Date.now(),
  expiresAt: Date.now() + CREATIVE_TTL_MS,
  // Include the multi-creative set so CampaignSetup can restore all angles
  ...(creativeSet && creativeSet.length > 1 ? { creativeSet, creativeTestCount } : {}),
};


            if (adminClientId) {
              // Admin-client mode: persist under the client's isolated namespace.
              const clientNs = `adminClient:${adminClientId}`;
              localStorage.setItem(`u:${clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(draftForSetup));
              localStorage.setItem(`u:${clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(draftForSetup));
            } else {
              // Normal user mode: existing namespace-aware writers.
              ssSet("draft_form_creatives", JSON.stringify(draftForSetup));
              lsSet(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
              lsSet("sm_setup_creatives_backup_v1", JSON.stringify(draftForSetup));
            }

            // ✅ Write FORM_DRAFT_KEY synchronously before SPA navigation — the autosave
            // debounce gets cancelled on unmount and beforeunload doesn't fire for navigate(),
            // so the form draft (including imageUrls) must be committed here.
            try {
              const formPayload = {
                savedAt: Date.now(),
                ctxKey,
                data: {
                  ctxKey,
                  answers,
                  step,
                  chatHistory,
                  mediaType: "image",
                  result: result ? { ...result, headline: mergedHeadline, body: mergedBody } : null,
                  imageUrls: imageUrls.slice(0, 2),
                  activeImage,
                  awaitingReady,
                  input,
                  sideChatCount,
                  hasGenerated,
                },
              };
              lsSet(FORM_DRAFT_KEY, JSON.stringify(formPayload));
            } catch {}

            // Persist the website URL to a dedicated, TTL-free, non-purged key so CampaignSetup
            // can always find it — even after OAuth redirect, page reload, or post-launch draft purge.
            // Always writes (overwriting stale prior URL). In admin-client mode also writes to the
            // client-namespaced key so switching clients never bleeds one client's URL into another.
            try {
              const _urlToSave = String(answers?.url || "").trim();
              localStorage.setItem("sm_last_website_url_v1", _urlToSave);
              if (adminClientId) {
                localStorage.setItem(`u:adminClient:${adminClientId}:sm_last_website_url_v1`, _urlToSave);
              }
            } catch {}

            try {
              localStorage.setItem("smartmark_media_selection", "image");
              if (imgA[0]) localStorage.setItem("smartmark_last_image_url", imgA[0]);
              localStorage.removeItem("smartmark_last_video_url");
              localStorage.removeItem("smartmark_last_fb_video_id");
            } catch {}

            // Save campaign context before navigating (fire-and-forget)
            try {
              fetch("/api/campaign-context/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  ctxKey,
                  answers: answersForSetup,
                  selectedObjective: selectedObjective || aiRecommendedObjective || null,
                  creativePreference: "ai_image",
                  ...(adminClientId ? { adminClientId } : {}),
                }),
              }).catch(() => {});
            } catch {}

            console.debug("[Creative Draft Saved]", { ctxKey, adminClientId: adminClientId || null, mediaSelection: "image", imageUrls: imgA, finalUrl: _finalUrl });

            navigate(withAdminClientQuery("/setup", adminClientId), {
              state: {
                ctxKey,
                imageUrls: imgA,
                headline: mergedHeadline,
                body: mergedBody,
                imageOverlayCTA: mergedCTA,
                answers: answersForSetup,
                mediaSelection: "image",
                selectedObjective: selectedObjective || aiRecommendedObjective || null,
                // Pass multi-creative set if generated
                ...(creativeSet && creativeSet.length > 1 ? { creativeSet, creativeTestCount } : {}),
                ...(adminClientId ? {
                  adminClientId,
                  adminClientBusinessName: adminClientInfo?.premiumIntake?.businessName || adminClientInfo?.displayName || adminClientInfo?.email || "",
                } : {}),
              },
            });
          }}
          onMouseEnter={(e) => {
            const isVideoMode = mediaType === "video" && !!uploadedVideoUrl;
            const isReady = (creativeSource === "upload_photo" && hasGenerated) ||
                            (creativeSource === "upload_video" && isVideoMode) ||
                            (creativeSource === "ai_image" && (hasGenerated || isVideoMode));
            if (!isReady) return;
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
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
  { key: "url", question: "What's your website or landing page URL? (If you don't have one yet, just type 'none')" },
  { key: "phone", question: "What's a phone number people can use to reach you? (Optional — skip if you'd rather not include one)" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "city", question: "What city is your business based in?" },
  { key: "state", question: "What state? (e.g. TX, CA, FL)" },
  { key: "idealCustomer", question: "Who is your ideal customer? Describe them in one sentence." },
  { key: "hasOffer", question: "Do you have a special offer or promo right now? (yes/no)" },
  { key: "offer", question: "What is your offer or promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or service you want the ad to highlight?" },
  { key: "cta", question: "What do you want people to do after seeing this ad? (e.g. Call now, Schedule service, Request a quote, Book a demo, Visit website)" },
];

/* ===== Campaign objectives ===== */
const CAMPAIGN_OBJECTIVES = [
  {
    value: "OUTCOME_TRAFFIC",
    label: "Traffic",
    icon: "🌐",
    description: "Send people to your website or landing page.",
    launchSupported: true,
    planningSupported: true,
  },
  {
    value: "OUTCOME_LEADS",
    label: "Leads",
    icon: "📋",
    description: "Collect calls, forms, or interested prospects.",
    launchSupported: false,
    planningSupported: true,
  },
  {
    value: "OUTCOME_AWARENESS",
    label: "Awareness",
    icon: "📣",
    description: "Get more people familiar with the business.",
    launchSupported: false,
    planningSupported: true,
  },
  {
    value: "OUTCOME_ENGAGEMENT",
    label: "Engagement",
    icon: "💬",
    description: "Get messages, comments, or interactions.",
    launchSupported: false,
    planningSupported: true,
  },
  {
    value: "OUTCOME_SALES",
    label: "Sales",
    icon: "🛒",
    description: "Drive purchases or direct conversions.",
    launchSupported: false,
    planningSupported: true,
  },
  {
    value: "OUTCOME_APP_PROMOTION",
    label: "App Promotion",
    icon: "📱",
    description: "Promote app installs or app actions.",
    launchSupported: false,
    planningSupported: true,
  },
];

/* ===== Rule-based objective recommendation ===== */
function recommendObjective(answers = {}) {
  const cta = String(answers.cta || "").toLowerCase();
  const industry = String(answers.industry || "").toLowerCase();

  // Lead-focused CTAs
  if (/quote|estimate|consult|inquiry|contact|form|apply|sign.?up|free trial/i.test(cta)) {
    return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_LEADS"), reason: "Your CTA is lead-focused — collecting contact info fits best." };
  }

  // Sales / e-commerce
  if (/buy|shop|order|purchase|checkout|cart/i.test(cta) || /ecommerce|e-commerce|retail|store|shop/i.test(industry)) {
    return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_SALES"), reason: "Your CTA and industry point to direct sales." };
  }

  // App installs
  if (/app|download|install/i.test(cta) || /app|software|saas/i.test(industry)) {
    return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_APP_PROMOTION"), reason: "Your business or CTA suggests an app promotion campaign." };
  }

  // Engagement / social
  if (/follow|like|comment|share|message|dm/i.test(cta)) {
    return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_ENGAGEMENT"), reason: "Your CTA is engagement-focused." };
  }

  // Awareness / branding
  if (/learn more|awareness|brand|discover|introduce/i.test(cta)) {
    return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_AWARENESS"), reason: "Your CTA is awareness-oriented." };
  }

  // Default: Traffic (also the only launchSupported option)
  return { ...CAMPAIGN_OBJECTIVES.find((o) => o.value === "OUTCOME_TRAFFIC"), reason: "Driving traffic to your website is a strong default for most businesses." };
}
