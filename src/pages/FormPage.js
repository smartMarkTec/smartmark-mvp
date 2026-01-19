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
const FORM_DRAFT_KEY = "sm_form_draft_v3";
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v3";

/* -------- Image preview cache (24h) --------
   Goal: keep previews visible even if /generated files disappear after deploy/restart.
   We store Data URLs for the 2 images so the UI doesn't need to regenerate.
*/
const IMAGE_CACHE_KEY = "sm_image_cache_v1";
const IMAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function loadImageCache(ctxKey = "") {
  try {
    const raw = localStorage.getItem(IMAGE_CACHE_KEY);
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
    localStorage.setItem(IMAGE_CACHE_KEY, JSON.stringify(payload));
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
      try { return await urlToDataUrl(u); } catch { return null; }
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



// ✅ Active run context (prevents old industry/copy bleeding across back/forward/OAuth)
const ACTIVE_CTX_KEY = "sm_active_ctx_v2";


function getActiveCtx() {
  return (
    sessionStorage.getItem(ACTIVE_CTX_KEY) ||
    localStorage.getItem(ACTIVE_CTX_KEY) ||
    ""
  );
}
function setActiveCtx(ctxKey) {
  const k = String(ctxKey || "").trim();
  if (!k) return;
  try {
    sessionStorage.setItem(ACTIVE_CTX_KEY, k);
    localStorage.setItem(ACTIVE_CTX_KEY, k); // survives OAuth reload
  } catch {}
}
function buildCtxKey(a = {}) {
  const bn = String(a.businessName || "").trim().toLowerCase();
  const ind = String(a.industry || "").trim().toLowerCase();
  const url = String(a.url || "").trim().toLowerCase();
  return `${Date.now()}|${bn}|${ind}|${url}`;
}

// ✅ If saved creatives don't match activeCtx, purge them
function purgeCreativeDraftKeys() {
  try {
    localStorage.removeItem(CREATIVE_DRAFT_KEY);
    localStorage.removeItem("sm_setup_creatives_backup_v1");
    sessionStorage.removeItem("draft_form_creatives");
    sessionStorage.removeItem("draft_form_creatives_v2");
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
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
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

/* -------- Image generation spend guard -------- */
const IMAGE_GEN_QUOTA_KEY = "sm_image_gen_quota_v1";
const IMAGE_GEN_WINDOW_MS = 24 * 60 * 60 * 1000;
// TEMP TESTING: disable gen limit
const IMAGE_GEN_MAX_RUNS_PER_WINDOW = 9999;

function loadGenQuota() {
  try {
    const raw = localStorage.getItem(IMAGE_GEN_QUOTA_KEY);
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
    localStorage.setItem(IMAGE_GEN_QUOTA_KEY, JSON.stringify(q));
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
  const mins = Math.max(1, Math.ceil((q.resetAt - Date.now()) / 60000));
  return `Image generation limit reached for today. Remaining runs: ${remaining}. Try again in about ${mins} minutes.`;
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

/* ===== image draft helpers ===== */
function loadImageDrafts() {
  try {
    return JSON.parse(localStorage.getItem(IMAGE_DRAFTS_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveImageDrafts(map) {
  try {
    localStorage.setItem(IMAGE_DRAFTS_KEY, JSON.stringify(map));
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
        zIndex: 9999,
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

/* --- GPT copy summarizer --- */
async function summarizeAdCopy(answers, { regenerateToken = "", variant = "" } = {}) {
  const url = `${API_BASE}/summarize-ad-copy`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, regenerateToken, variant }),
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

function syncCreativesToDraftKeys({ ctxKey, imageUrls, headline, body, overlay, answers, mediaSelection }) {
  try {
    const imgs = (imageUrls || []).filter(Boolean).slice(0, 2).map(toAbsoluteMedia);

    const payload = {
      ctxKey: ctxKey || getActiveCtx(),
      images: imgs,
      headline: (headline || "").toString().trim().slice(0, 55),
      body: (body || "").toString().trim(),
      imageOverlayCTA: (overlay || "").toString().trim(),
      answers: answers && typeof answers === "object" ? answers : {},
      mediaSelection: mediaSelection || "image",
      savedAt: Date.now(),
      expiresAt: Date.now() + CREATIVE_TTL_MS, // ✅ persist for a while
    };

    localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));

    localStorage.setItem("sm_setup_creatives_backup_v1", JSON.stringify(payload));
    sessionStorage.setItem("draft_form_creatives", JSON.stringify(payload));
  } catch (e) {
    console.warn("syncCreativesToDraftKeys failed:", e);
  }
}

const INITIAL_CHAT = [
  { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign.` },
  { from: "gpt", text: "Are you ready to get started? (yes/no)" },
];

/* ========================= Main Component ========================= */
export default function FormPage() {
  const navigate = useNavigate();
  const chatBoxRef = useRef();

  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [chatHistory, setChatHistory] = useState(INITIAL_CHAT);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sideChatCount, setSideChatCount] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);
    const [imageDataUrls, setImageDataUrls] = useState([]); // 2 items max
  const [imgFail, setImgFail] = useState({}); // {0:true,1:true}


  // Video removed: force image-only
  const [mediaType, setMediaType] = useState("image");

  const [result, setResult] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [imageUrl, setImageUrl] = useState("");

  const [imageLoading, setImageLoading] = useState(false);
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

  const abs = toAbsoluteMedia;

  /* Scroll chat to bottom */
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatHistory]);

  /* Warm backend on mount */
  useEffect(() => {
    warmBackend();
  }, []);

  /* ✅ Restore draft: choose ctx FIRST from existing OR saved drafts (fixes OAuth/back bugs) */
  useEffect(() => {
    try {
            purgeLegacyDraftKeys();

      const existing = String(getActiveCtx() || "").trim();


        useEffect(() => {
    try {
      const ctx = getActiveCtx();
      const c = loadImageCache(ctx);
      if (c?.dataUrls?.length) setImageDataUrls(c.dataUrls.filter(Boolean).slice(0, 2));
    } catch {}
  }, []);

      // Read raw drafts
      const rawForm = localStorage.getItem(FORM_DRAFT_KEY);
      const rawCreative =
        sessionStorage.getItem("draft_form_creatives") ||
        localStorage.getItem(CREATIVE_DRAFT_KEY) ||
        localStorage.getItem("sm_setup_creatives_backup_v1");

      // Parse form wrapper (if valid + not expired)
      let formWrap = null;
      if (rawForm) {
        try {
          const parsed = JSON.parse(rawForm || "{}");
          // ✅ If form draft has no ctxKey, it's legacy/unsafe: delete it and stop restore
const parsedCtx = String(parsed?.ctxKey || "").trim();
if (!parsedCtx) {
  try { localStorage.removeItem(FORM_DRAFT_KEY); } catch {}
  return;
}

          const savedAt = Number(parsed?.savedAt || 0);
          const isExpired = savedAt && Date.now() - savedAt > DRAFT_TTL_MS;
          if (!isExpired) formWrap = parsed;
          else localStorage.removeItem(FORM_DRAFT_KEY);
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
          localStorage.removeItem(FORM_DRAFT_KEY);
        } else {
          const data = formWrap.data || {};

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
          } else {
            setResult(null);
            setHasGenerated(false);
          }

          // If we successfully restored FORM state, we're done.
          return;
        }
      }

      // ================= CREATIVE fallback restore (ctx-gated) =================
      if (creativeObj) {
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
          setHasGenerated(true);
          setAwaitingReady(false);
        } else {
          setResult(null);
          setHasGenerated(false);
        }
      }
    } catch {}
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const draft = currentImageId ? getImageDraftById(currentImageId) : null;
    setEditHeadline((draft?.headline ?? result?.headline ?? "").slice(0, 55));
    setEditBody(draft?.body ?? result?.body ?? answers?.details ?? answers?.adCopy ?? "");
    setEditCTA(normalizeOverlayCTA(draft?.overlay ?? result?.image_overlay_text ?? answers?.cta ?? ""));
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

  const fallbackCopy = useMemo(() => {
    const biz = (answers?.businessName || "Your Business").toString().trim();
    const industry = (answers?.industry || "").toString().trim();
    const offer = (answers?.offer || "").toString().trim();

    const headline =
      offer
        ? offer.slice(0, 55)
        : industry
        ? `${industry} Specials`.slice(0, 55)
        : `${biz} Specials`.slice(0, 55);

    const body = offer
      ? `Limited-time offer from ${biz}. Tap to learn more.`
      : `Discover what ${biz} can do for you. Tap to learn more.`;

    return { headline, body };
  }, [answers]);

  const displayHeadline = (editHeadline || result?.headline || fallbackCopy.headline || "")
    .toString()
    .trim()
    .slice(0, 55);

  const displayBody = (editBody || result?.body || fallbackCopy.body || "").toString().trim();

  const displayCTA = normalizeOverlayCTA(
    editCTA || result?.image_overlay_text || answers?.cta || "Learn more"
  );

  function hardResetChat() {
    if (!window.confirm("Reset the chat and clear saved progress for this form?")) return;
    try {
      localStorage.removeItem(FORM_DRAFT_KEY);
      localStorage.removeItem(CREATIVE_DRAFT_KEY);
      sessionStorage.removeItem("draft_form_creatives");
      localStorage.removeItem(IMAGE_DRAFTS_KEY);
      localStorage.removeItem(IMAGE_GEN_QUOTA_KEY); // helpful during testing
      // keep ACTIVE_CTX_KEY? no, reset run
      sessionStorage.removeItem(ACTIVE_CTX_KEY);
      localStorage.removeItem(ACTIVE_CTX_KEY);
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
  }

  function clearPreviewStateForNewBusiness() {
    try {
      localStorage.removeItem(CREATIVE_DRAFT_KEY);
      localStorage.removeItem("sm_setup_creatives_backup_v1");
      sessionStorage.removeItem("draft_form_creatives");
      localStorage.removeItem("smartmark_last_image_url");
    } catch {}
    setResult(null);
    setImageUrls([]);
    setActiveImage(0);
    setImageUrl("");
    setHasGenerated(false);
    setImageEditing(false);
  }

  /* Autosave */
  useEffect(() => {
    const t = setTimeout(() => {
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

      localStorage.setItem(
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
          body: mergedBody,
          imageOverlayCTA: normalizeOverlayCTA(
            activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
          ),
          answers,
          mediaSelection: "image",
          savedAt: Date.now(),
          expiresAt: Date.now() + CREATIVE_TTL_MS,
        };

        localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
        localStorage.setItem("sm_setup_creatives_backup_v1", JSON.stringify(draftForSetup));
        sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
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
        const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
        const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
        const mergedBody = activeDraft?.body || result?.body || "";
        const imgs = imageUrls.slice(0, 2).map(abs);

        // ✅ DON'T overwrite creatives with empty images
        if (!imgs.length) return;

        const draftForSetup = {
          ctxKey: getActiveCtx(),
          images: imgs,
          headline: mergedHeadline,
          body: mergedBody,
          imageOverlayCTA: normalizeOverlayCTA(
            activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
          ),
          answers,
          mediaSelection: "image",
          savedAt: Date.now(),
          expiresAt: Date.now() + CREATIVE_TTL_MS,
        };

        localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
        localStorage.setItem("sm_setup_creatives_backup_v1", JSON.stringify(draftForSetup));
        sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
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

  /* ---- Ask OpenAI (side chat) ---- */
  async function askGPT(userText) {
    try {
      const history = chatHistory.slice(-8).map((m) => ({
        role: m.from === "gpt" ? "assistant" : "user",
        content: m.text,
      }));
      history.push({ role: "user", content: userText });

      const data = await fetchJsonWithRetry(
        `${API_BASE}/gpt-chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userText, history }),
        },
        { tries: 3, warm: true }
      );
      return data?.reply || null;
    } catch (e) {
      console.warn("gpt-chat failed:", e.message);
      return null;
    }
  }

  async function handleSideChat(userText, followUpPrompt) {
    if (sideChatCount >= SIDE_CHAT_LIMIT) {
      if (followUpPrompt) setChatHistory((ch) => [...ch, { from: "gpt", text: followUpPrompt }]);
      return;
    }
    setSideChatCount((c) => c + 1);
    const reply = await askGPT(userText);
    if (reply) setChatHistory((ch) => [...ch, { from: "gpt", text: reply }]);
    if (followUpPrompt) setChatHistory((ch) => [...ch, { from: "gpt", text: followUpPrompt }]);
  }

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
        setChatHistory((ch) => [...ch, { from: "gpt", text: CONVO_QUESTIONS[0].question }]);
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
      if (!hasGenerated && isGenerateTrigger(value)) {
        if (!canRunImageGen()) {
          const msg = quotaMessage();
          setError(msg);
          setChatHistory((ch) => [...ch, { from: "gpt", text: msg }]);
          return;
        }

        bumpImageGenCount();

        // ✅ NEW RUN: mint ctxKey + purge any old creative drafts immediately
        const nextCtx = buildCtxKey(answers || {});
        setActiveCtx(nextCtx);
        purgeCreativeDraftKeys();

        // ✅ Reset preview state so nothing stale can show
        setResult(null);
        setImageUrls([]);
        setActiveImage(0);
        setImageUrl("");
        setHasGenerated(false);
        setImageEditing(false);

        setLoading(true);
        setGenerating(true);

        setChatHistory((ch) => [...ch, { from: "gpt", text: "AI thinking..." }]);

        const swapThinkingTimer = setTimeout(() => {
          setChatHistory((ch) => {
            const next = [...ch];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i]?.from === "gpt" && next[i]?.text === "AI thinking...") {
                next[i] = {
                  ...next[i],
                  text: "This could take about a minute — generating your previews…",
                };
                break;
              }
            }
            return next;
          });
        }, 700);

        setTimeout(async () => {
          const token = getRandomString();
          try {
            setImageUrls([]);
            setImageUrl("");
          } catch {}

          try {
            await warmBackend();
            await generatePosterBPair(token);

            setChatHistory((ch) => [
              ...ch,
              { from: "gpt", text: "Done! Here are your ad previews. You can regenerate the image below." },
            ]);
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

        return;
      }

      if (hasGenerated) {
        await handleSideChat(value, null);
      } else {
        await handleSideChat(value, "Ready to generate your campaign? (yes/no)");
      }
      return;
    }

    if (currentQ && isLikelySideChat(value, currentQ)) {
      await handleSideChat(value, `Ready for the next question?\n${currentQ.question}`);
      return;
    }

    if (currentQ) {
      let answerToSave = value;
      if (currentQ.key === "url") {
        const firstUrl = extractFirstUrl(value);
        if (firstUrl) answerToSave = firstUrl;

        // ✅ If URL changed from last run, reset previews so no stale industry/copy shows.
        const prevUrl = (answers?.url || "").toString().trim();
        const nextUrl = (answerToSave || "").toString().trim();
        if (prevUrl && nextUrl && prevUrl !== nextUrl) {
          clearPreviewStateForNewBusiness();
        }
      }

      const newAnswers = { ...answers, [currentQ.key]: answerToSave };
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
        setChatHistory((ch) => [
          ...ch,
          { from: "gpt", text: "Are you ready for me to generate your campaign? (yes/no)" },
        ]);
        setStep(nextStep);
        return;
      }

      setStep(nextStep);
      setChatHistory((ch) => [...ch, { from: "gpt", text: CONVO_QUESTIONS[nextStep].question }]);
    }
  }

  async function generatePosterBPair(runToken) {
    const tA = `${runToken}-A`;
    const tB = `${runToken}-B`;

    const rawA = await summarizeAdCopy(answers, { regenerateToken: tA, variant: "A" });
    const rawB = await summarizeAdCopy(answers, { regenerateToken: tB, variant: "B" });

    let copyA = normalizeSmartCopy(rawA, answers);
    let copyB = normalizeSmartCopy(rawB, answers);

    const same =
      (copyA.headline || "").toLowerCase() === (copyB.headline || "").toLowerCase() &&
      (copyA.subline || "").toLowerCase() === (copyB.subline || "").toLowerCase();

    if (same) {
      const rawB2 = await summarizeAdCopy(answers, { regenerateToken: `${tB}-2`, variant: "B2" });
      copyB = normalizeSmartCopy(rawB2, answers);
    }

    const [urlA, urlB] = await Promise.all([
      handleGenerateStaticAd("poster_b", copyA, { regenerateToken: tA, silent: true }),
      handleGenerateStaticAd("poster_b", copyB, { regenerateToken: tB, silent: true }),
    ]);

    let urls = [urlA, urlB].filter(Boolean).slice(0, 2);

    if (urls.length === 1) {
      try {
        const missingToken = `${runToken}-B-retry`;
        const rawBRetry = await summarizeAdCopy(answers, { regenerateToken: missingToken, variant: "B_RETRY" });
        const copyBRetry = normalizeSmartCopy(rawBRetry, answers);
        const urlRetry = await handleGenerateStaticAd("poster_b", copyBRetry, {
          regenerateToken: missingToken,
          silent: true,
        });
        if (urlRetry) urls = [urls[0], urlRetry];
      } catch {}
    }

    if (urls.length === 1) urls = [urls[0], urls[0]];
    if (urls.length === 0) urls = [];

    if (urls[0]) {
      saveImageDraftById(creativeIdFromUrl(urls[0]), {
        headline: (copyA.headline || "").slice(0, 55),
        body: copyA.subline || "",
        overlay: normalizeOverlayCTA(copyA.cta || answers?.cta || ""),
      });
    }
    if (urls[1]) {
      saveImageDraftById(creativeIdFromUrl(urls[1]), {
        headline: (copyB.headline || "").slice(0, 55),
        body: copyB.subline || "",
        overlay: normalizeOverlayCTA(copyB.cta || answers?.cta || ""),
      });
    }

    setImageUrls(urls);
    setActiveImage(0);
    setImageUrl(urls[0] || "");

        // Cache previews for 24h (so they don't go blank after deploy/restart)
    try {
      const ctx = getActiveCtx();
      const c = await cacheImagesFor24h(ctx, urls);
      const cached = c?.dataUrls?.filter(Boolean).slice(0, 2) || [];
      if (cached.length) setImageDataUrls(cached);
    } catch {}


    setResult({
      headline: copyA.headline,
      body: copyA.subline,
      offer: copyA.offer,
      bullets: copyA.bullets,
      disclaimers: copyA.disclaimers,
      image_overlay_text: normalizeOverlayCTA(copyA.cta || answers?.cta || ""),
    });

    const ctxKey = getActiveCtx();

    syncCreativesToDraftKeys({
      ctxKey,
      imageUrls: urls,
      headline: copyA.headline,
      body: copyA.subline,
      overlay: normalizeOverlayCTA(copyA.cta || answers?.cta || ""),
      answers,
      mediaSelection: "image",
    });

    return urls;
  }

  async function handleRegenerateImage() {
    if (!canRunImageGen()) {
      const msg = quotaMessage();
      setError(msg);
      alert(msg);
      return;
    }

    setImageLoading(true);
    try {
      bumpImageGenCount();
      await warmBackend();
      const token = getRandomString();
      await generatePosterBPair(token);
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
    const a = answers || {};
    const fromAssets = assetsData && typeof assetsData === "object" ? assetsData : {};
    const fromResult = result || {};

    const baseBullets =
      (Array.isArray(fromAssets.bullets) && fromAssets.bullets.length
        ? fromAssets.bullets
        : Array.isArray(fromResult.bullets) && fromResult.bullets.length
        ? fromResult.bullets
        : []) || [];

    const craftedCopy = {
      headline: (fromAssets.headline || displayHeadline || a.mainBenefit || a.businessName || "").toString(),
      subline: (fromAssets.subline || displayBody || a.details || a.mainBenefit || "").toString(),
      offer: (fromAssets.offer || a.offer || a.saveAmount || "").toString(),
      secondary: (fromAssets.secondary || "").toString(),
      bullets: baseBullets,
      disclaimers: (fromAssets.disclaimers || "").toString(),
      cta: (fromAssets.cta || displayCTA || a.cta || "").toString(),
    };

    if (!Array.isArray(craftedCopy.bullets) || !craftedCopy.bullets.length) {
      const ind = (a.industry || "services").toString().trim().toLowerCase();
      if (ind.includes("fashion")) {
        craftedCopy.bullets = ["New arrivals weekly", "Everyday fits", "Easy returns"];
      } else if (ind.includes("restaurant") || ind.includes("food")) {
        craftedCopy.bullets = ["Fresh ingredients", "Fast pickup", "Local favorites"];
      } else {
        craftedCopy.bullets = ["Clear offer", "Clean design", "Strong call to action"];
      }
    }

    const safeIndustry = (a.industry || "Local Services").toString().trim().slice(0, 60);
    const safeBiz = (a.businessName || "Your Business").toString().trim().slice(0, 60);
    const safeLocation = (a.location || "Your City").toString().trim().slice(0, 60);

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
      answers: {
        ...a,
        industry: safeIndustry,
        businessName: safeBiz,
        location: safeLocation,
        offer: a.offer || a.saveAmount || craftedCopy.offer || "",
      },
    };

    try {
      const res = await fetch(`${API_BASE}/generate-static-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
          top: "-15vh",
          right: "-10vw",
          width: 640,
          height: 640,
          background: "radial-gradient(40% 40% at 50% 50%, rgba(20,231,185,0.22), transparent 70%)",
          filter: "blur(18px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

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
              gap: 8,
            }}
            aria-label="Back"
          >
            <FaArrowLeft />
            Back
          </button>
        </div>

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
          zIndex: 1,
        }}
      >
        <div
          style={{
            color: "#9dffe9",
            fontSize: 15,
            fontWeight: 900,
            marginBottom: 10,
            letterSpacing: 1.6,
            textTransform: "uppercase",
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
            gap: 10,
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
                  boxShadow: isGPT ? "none" : `0 2px 12px ${TEAL_SOFT}`,
                }}
              >
                {msg.text}
              </div>
            );
          })}
        </div>

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
                justifyContent: "center",
              }}
            >
              <FaSyncAlt />
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
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
                boxShadow: `0 1.5px 8px ${TEAL_SOFT}`,
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
                height: 48,
              }}
              disabled={loading}
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

      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 4, marginBottom: 10 }}>
        <div style={{ color: "#bdfdf0", fontWeight: 900, letterSpacing: 0.6, opacity: 0.9 }}>Ad Previews</div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 34, flexWrap: "wrap", width: "100%", paddingBottom: 8 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 13,
            boxShadow: "0 2px 24px #16242714",
            minWidth: 340,
            maxWidth: 390,
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
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 12,
    }}
  >
    <span>
      Sponsored · <span style={{ color: "#12cbb8" }}>SmartMark</span>
    </span>

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
        gap: 7,
      }}
      onClick={handleRegenerateImage}
      disabled={imageLoading}
      title="Regenerate Image Ad"
    >
      <FaSyncAlt style={{ fontSize: 16 }} />
      {imageLoading || generating ? <Dotty /> : "Regenerate"}
    </button>
  </div>

  {/* ✅ put this OUTSIDE the button */}
  <div style={{ fontSize: 12, color: "#6b7785", fontWeight: 700, marginTop: 6 }}>
    {(() => {
      const q = loadGenQuota();
      const remaining = Math.max(0, IMAGE_GEN_MAX_RUNS_PER_WINDOW - (q.used || 0));
      const mins = Math.max(1, Math.ceil((q.resetAt - Date.now()) / 60000));
      return `Generations left today: ${remaining}/${IMAGE_GEN_MAX_RUNS_PER_WINDOW} (resets in ~${mins} min)`;
    })()}
  </div>
</div>


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
            {imageLoading || generating ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : imageUrls.length > 0 ? (
              <>
             <img
  src={(imageDataUrls[activeImage] || toAbsoluteMedia(imageUrls[activeImage] || "")) || ""}
  alt="Ad Preview"
  style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 0, cursor: "pointer" }}
  onClick={() => handleImageClick(imageDataUrls[activeImage] || imageUrls[activeImage])}
  onError={() => {
    // If the hosted URL died (deploy/restart), try to use cached Data URL.
    setImgFail((p) => ({ ...p, [activeImage]: true }));
    const ctx = getActiveCtx();
    const c = loadImageCache(ctx);
    const cached = c?.dataUrls?.filter(Boolean).slice(0, 2) || [];
    if (cached.length) setImageDataUrls(cached);
  }}
/>

                <Arrow
                  side="left"
                  onClick={() => setActiveImage((activeImage + imageUrls.length - 1) % imageUrls.length)}
                  disabled={imageUrls.length <= 1}
                />
                <Arrow
                  side="right"
                  onClick={() => setActiveImage((activeImage + 1) % imageUrls.length)}
                  disabled={imageUrls.length <= 1}
                />
                <Dots count={imageUrls.length} active={activeImage} onClick={setActiveImage} />
              </>
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
                  fontSize: 22,
                }}
              >
                Image goes here
              </div>
            )}
          </div>

          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {displayHeadline}
            </div>
            <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 3, minHeight: 18 }}>
              {displayBody}
            </div>
          </div>

          <div style={{ padding: "8px 18px", marginTop: 2 }}>
            <button
              style={{
                background: "#14e7b9",
                color: "#181b20",
                fontWeight: 700,
                border: "none",
                borderRadius: 9,
                padding: "8px 20px",
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              {displayCTA}
            </button>
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
            transition: "background 0.18s, opacity 0.18s, transform 0.18s",
            opacity: 1,
            transform: "translateY(0)",
          }}
          onClick={() => {
            if (!hasGenerated) {
              alert("Generate your previews first. Type 'yes' in the chat.");
              return;
            }

            const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;

            const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
            const mergedBody = activeDraft?.body || result?.body || "";
            const mergedCTA = normalizeOverlayCTA(
              activeDraft?.overlay || result?.image_overlay_text || answers?.cta || ""
            );

           const cached = (imageDataUrls || []).filter(Boolean).slice(0, 2);
const imgA = cached.length ? cached : imageUrls.map(abs).slice(0, 2);


            const ctxKey = getActiveCtx() || buildCtxKey(answers || {});
            setActiveCtx(ctxKey);

            const draftForSetup = {
              ctxKey,
              images: imgA,
              headline: mergedHeadline,
              body: mergedBody,
              imageOverlayCTA: mergedCTA,
              answers,
              mediaSelection: "image",
              savedAt: Date.now(),
              expiresAt: Date.now() + CREATIVE_TTL_MS,
            };

            sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
            localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
            localStorage.setItem("smartmark_media_selection", "image");

            if (imgA[0]) localStorage.setItem("smartmark_last_image_url", imgA[0]);
            localStorage.removeItem("smartmark_last_video_url");
            localStorage.removeItem("smartmark_last_fb_video_id");

            navigate("/setup", {
              state: {
                ctxKey,
                imageUrls: imgA,
                headline: mergedHeadline,
                body: mergedBody,
                imageOverlayCTA: mergedCTA,
                answers,
                mediaSelection: "image",
              },
            });
          }}
          onMouseEnter={(e) => {
            if (!hasGenerated) return;
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
  { key: "url", question: "What's your website URL?" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "idealCustomer", question: "Describe your ideal customer in one sentence." },
  { key: "hasOffer", question: "Do you have a special offer or promo? (yes/no)" },
  { key: "offer", question: "What is your offer/promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or transformation you promise?" },
];
