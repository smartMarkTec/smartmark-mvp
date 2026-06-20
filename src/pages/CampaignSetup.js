/* eslint-disable */
// src/pages/CampaignSetup.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import InlineAdAgent from "./InlineAdAgent";
import {
  FaPause,
  FaPlay,
  FaTrash,
  FaPlus,
  FaChevronDown,
  FaBolt,
  FaSearch,
  FaChartLine,
  FaShieldAlt,
  FaRegClock,
  FaEllipsisV,
  FaRobot,
  FaLock,
  FaUsers,
  FaCog,
} from "react-icons/fa";
import { trackEvent } from "../analytics/gaEvents";


/* ===================== AUTH ORIGIN (UPDATED) ===================== */
// ✅ Start OAuth + auth calls on YOUR APP ORIGIN so state/cookies stay consistent.
// Your Vercel rewrites should proxy /auth/* (and /api/*) to Render.
// ===================== ORIGINS (CORS-SAFE) =====================
//
// ✅ Browser/UI should always use SAME-ORIGIN /api/media/* so Vercel rewrites proxy to Render.
// This avoids CORS when loading images + uploading data URLs.
//
// ✅ Meta (Facebook) must receive ABSOLUTE Render URLs so FB can fetch the images.
//
const RENDER_MEDIA_ORIGIN = "https://smartmark-mvp.onrender.com";
const APP_ORIGIN = window.location.origin;

// Browser/UI media base (SAME ORIGIN via proxy)
const MEDIA_ORIGIN = APP_ORIGIN;

// Auth bases
const AUTH_BASE_PRIMARY = "/auth";
const AUTH_BASE_FALLBACK = "/api/auth";

// ✅ sid fallback for when cookies are blocked / flaky
const SM_SID_LS_KEY = "sm_sid_v1";

function getStoredSid() {
  try {
    return (localStorage.getItem(SM_SID_LS_KEY) || "").trim();
  } catch {
    return "";
  }
}
function setStoredSid(sid) {
  try {
    const s = String(sid || "").trim();
    if (s) localStorage.setItem(SM_SID_LS_KEY, s);
  } catch {}
}

// ✅ ALWAYS ensure we have a stable sid (so drafts/creatives use same namespace)
function ensureStoredSid() {
  let sid = getStoredSid();
  if (sid) return sid;

  sid = `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  setStoredSid(sid);
  return sid;
}

async function authFetch(path, opts = {}) {
  const sid = ensureStoredSid();
  const headers = { ...(opts.headers || {}) };
  headers["x-sm-sid"] = sid;

  const p = String(path || "");
  const rel0 = p.startsWith("/") ? p : `/${p}`;

  const appendSid = (rel) => {
    try {
      const u = new URL(rel, window.location.origin);
      if (!u.searchParams.get("sm_sid")) u.searchParams.set("sm_sid", sid);
      if (!u.searchParams.get("sid")) u.searchParams.set("sid", sid);
      return `${u.pathname}${u.search}`;
    } catch {
      const joiner = rel.includes("?") ? "&" : "?";
      return `${rel}${joiner}sm_sid=${encodeURIComponent(sid)}&sid=${encodeURIComponent(sid)}`;
    }
  };

  const rel = appendSid(rel0);

  const doFetch = (base) =>
    fetch(`${base}${rel}`, {
      ...opts,
      headers,
      credentials: "include",
      cache: "no-store",
    });

  let res = await doFetch(AUTH_BASE_PRIMARY);

  if (res.status === 404) {
    res = await doFetch(AUTH_BASE_FALLBACK);
  }

  return res;
}
async function stripeFetch(path, opts = {}) {
  const sid = ensureStoredSid();
  const headers = { ...(opts.headers || {}) };
  headers["x-sm-sid"] = sid;

  const rel = String(path || "").startsWith("/") ? String(path) : `/${path}`;

  return fetch(rel, {
    ...opts,
    headers,
    credentials: "include",
  });
}


// Appends ?adminClientId=<id> to a path when in admin mode.
// Use this for every navigate("/form") and navigate("/setup") call so admin context
// is preserved in the URL — FormPage reads adminClientId from the URL only.
function withAdminClientQuery(path, adminClientId) {
  if (!adminClientId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}adminClientId=${encodeURIComponent(adminClientId)}`;
}

/* ======================= Visual Theme (Landing-style tech palette) ======================= */
const MODERN_FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const DARK_BG = "linear-gradient(180deg, #d6dbff 0%, #edf1ff 42%, #f7f8ff 100%)";
const ACCENT = "#5b57e8";
const ACCENT_2 = "#7b6dff";
const BTN_BASE = "#5650e6";
const BTN_BASE_HOVER = "#473fd6";

const GLOW_A = "rgba(91,87,232,0.16)";
const GLOW_B = "rgba(123,109,255,0.12)";

const GLOW_TEAL = GLOW_A;
const ACCENT_ALT = ACCENT;

const CARD_BG = "rgba(255,255,255,0.88)";
const EDGE_BG = "rgba(110,102,255,0.16)";
const PANEL_BG = "rgba(247,248,255,0.92)";

const INPUT_BG = "#ffffff";
const INPUT_BORDER = "rgba(110,102,255,0.16)";

const TEXT_MAIN = "#141827";
const TEXT_DIM = "#384152";
const TEXT_MUTED = "#667085";
const WHITE = "#ffffff";
/* “glass” helper like landing */
const GLASS = {
  background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
  border: `1px solid ${INPUT_BORDER}`,
  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
  backdropFilter: "blur(8px)",
};

const CREATIVE_HEIGHT = 150;

const CASHAPP_TAG = "$SmarteMark";
const CASHAPP_URL = "https://cash.app/" + CASHAPP_TAG.replace("$", "");
const FEE_PAID_KEY = "sm_fee_paid_v1";
const ADMIN_BYPASS_USERNAME = "TheBoss";

const PLAN_UI = {
  starter: {
    key: "starter",
    label: "Standard",
    sub: "Basic A/B testing",
    detail: "2 campaigns • 1 business • 1 ad account",
  },
  pro: {
    key: "pro",
    label: "Pro",
    sub: "Enhanced A/B testing",
    detail: "6 campaigns • 2 businesses • 2 ad accounts",
  },
  operator: {
    key: "operator",
    label: "Operator",
    sub: "Operator-grade A/B testing",
    detail: "10 campaigns • 3 businesses • 3 ad accounts",
  },
};
// billing access now comes fully from Stripe billing status

/* ======================= (unchanged business constants) ======================= */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v3";

// ✅ Active run context (prevents old creatives bleeding across back/forward/OAuth)
const ACTIVE_CTX_KEY = "sm_active_ctx_v2";
const ACTIVE_CTX_KEY_LEGACY = "sm_active_ctx_v1";
const CREATIVE_DRAFT_KEY_LEGACY = "draft_form_creatives_v2";

const SM_DEBUG_KEY = "sm_debug_log_v1";

function smLog(tag, data = {}) {
  try {
    const entry = { t: new Date().toISOString(), tag, data };
    console.log("[SMDBG]", tag, data);

    const raw = localStorage.getItem(SM_DEBUG_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    while (arr.length > 200) arr.shift();
    localStorage.setItem(SM_DEBUG_KEY, JSON.stringify(arr));
  } catch {}
}

function smDumpDraftSnapshot({ FORM_DRAFT_KEY, CREATIVE_DRAFT_KEY, FB_CONNECT_INFLIGHT_KEY, ACTIVE_CTX_KEY }) {
  const snap = {};
  try {
    snap.activeCtx_ss = sessionStorage.getItem(ACTIVE_CTX_KEY) || "";
    snap.activeCtx_ls = localStorage.getItem(ACTIVE_CTX_KEY) || "";

    snap.formDraft = localStorage.getItem(FORM_DRAFT_KEY) || null;
    snap.creativeDraft = localStorage.getItem(CREATIVE_DRAFT_KEY) || null;
    snap.creativeBackup = localStorage.getItem("sm_setup_creatives_backup_v1") || null;
    snap.creativeSession = sessionStorage.getItem("draft_form_creatives") || null;
    snap.inflight = localStorage.getItem(FB_CONNECT_INFLIGHT_KEY) || null;

    const pickCtx = (raw) => {
      try {
        return (JSON.parse(raw || "{}")?.ctxKey || JSON.parse(raw || "{}")?.data?.ctxKey || "") + "";
      } catch {
        return "";
      }
    };

    snap.ctx_form = snap.formDraft ? pickCtx(snap.formDraft) : "";
    snap.ctx_creative = snap.creativeDraft ? pickCtx(snap.creativeDraft) : "";
    snap.ctx_backup = snap.creativeBackup ? pickCtx(snap.creativeBackup) : "";
    snap.ctx_session = snap.creativeSession ? pickCtx(snap.creativeSession) : "";
    snap.ctx_inflight = snap.inflight ? pickCtx(snap.inflight) : "";

    snap.len = {
      form: snap.formDraft ? snap.formDraft.length : 0,
      creative: snap.creativeDraft ? snap.creativeDraft.length : 0,
      backup: snap.creativeBackup ? snap.creativeBackup.length : 0,
      session: snap.creativeSession ? snap.creativeSession.length : 0,
      inflight: snap.inflight ? snap.inflight.length : 0,
    };
  } catch {}
  return snap;
}

// ✅ Draft disable flag (set after successful launch) — prevents resurrecting "Untitled / IN PROGRESS"
const DRAFT_DISABLED_KEYS = [
  "sm_setup_draft_disabled_v1",
  "sm_draft_disabled_v1",
  "sm_setup_draft_disabled",
];

function getUserNSQuick() {
  try {
    return (
      sessionStorage.getItem("sm_user_ns_v1") ||
      localStorage.getItem("sm_user_ns_v1") ||
      "anon"
    );
  } catch {
    return "anon";
  }
}

function isDraftDisabledLegacy() {
  try {
    const u = getUserNSQuick();
    for (const k of DRAFT_DISABLED_KEYS) {
      const v =
        localStorage.getItem(`u:${u}:${k}`) ||
        sessionStorage.getItem(`u:${u}:${k}`) ||
        localStorage.getItem(k) ||
        sessionStorage.getItem(k) ||
        "";
      const s = String(v).trim().toLowerCase();
      if (s === "1" || s === "true" || s === "yes") return true;
    }
  } catch {}
  return false;
}


function purgeDraftArtifactsEverywhere() {
  try {
    const u = getUserNSQuick();
    const keys = [
      // form + creative draft keys
      "sm_form_draft_v3",
      "draft_form_creatives_v3",
      "sm_setup_creatives_backup_v1",
      "draft_form_creatives",
      // image cache/drafts used for preview restore
      "sm_image_cache_v1",
      "smartmark.imageDrafts.v1",
      // active ctx
      "sm_active_ctx_v2",
    ];

    for (const k of keys) {
      try {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
      } catch {}

      try {
        localStorage.removeItem(`u:${u}:${k}`);
        sessionStorage.removeItem(`u:${u}:${k}`);
      } catch {}
    }
  } catch {}
}


/* ======================= hard backup so creatives survive FB redirect ======================= */
const SETUP_CREATIVE_BACKUP_KEY = "sm_setup_creatives_backup_v1";

/* ======================= NEW: backup preview copy so it survives FB redirect ======================= */
const SETUP_PREVIEW_BACKUP_KEY = "sm_setup_preview_backup_v1";
const withUser = (u, key) => `u:${u}:${key}`;
const LS_PREVIEW_KEY = (u) => (u ? withUser(u, SETUP_PREVIEW_BACKUP_KEY) : SETUP_PREVIEW_BACKUP_KEY);

function saveSetupPreviewBackup(user, previewObj) {
  try {
    const keyUser = LS_PREVIEW_KEY(user);

    // read existing (user key OR legacy)
    let prev = null;
    try {
      const rawPrev = localStorage.getItem(keyUser) || localStorage.getItem(SETUP_PREVIEW_BACKUP_KEY);
      prev = rawPrev ? JSON.parse(rawPrev) : null;
    } catch {
      prev = null;
    }

    // MERGE: never overwrite good values with blanks
    const next = {
      headline: String(previewObj?.headline ?? "").trim() || String(prev?.headline ?? "").trim() || "",
      body: String(previewObj?.body ?? "").trim() || String(prev?.body ?? "").trim() || "",
      link: String(previewObj?.link ?? "").trim() || String(prev?.link ?? "").trim() || "",
      ctxKey: String(previewObj?.ctxKey ?? "").trim() || String(prev?.ctxKey ?? "").trim() || "",
      savedAt: Date.now(),
    };

    localStorage.setItem(keyUser, JSON.stringify(next));
    localStorage.setItem(SETUP_PREVIEW_BACKUP_KEY, JSON.stringify(next)); // legacy safety
  } catch {}
}

function loadSetupPreviewBackup(user) {
  try {
    const raw =
      localStorage.getItem(LS_PREVIEW_KEY(user)) ||
      localStorage.getItem(SETUP_PREVIEW_BACKUP_KEY);

    if (!raw) return null;

    const p = JSON.parse(raw);
    const ageOk = !p.savedAt || Date.now() - p.savedAt <= DRAFT_TTL_MS;
    if (!ageOk) return null;

    return {
      headline: String(p.headline || "").trim(),
      body: String(p.body || "").trim(),
      link: String(p.link || "").trim(),
      ctxKey: String(p.ctxKey || "").trim(),
      savedAt: p.savedAt,
    };
  } catch {
    return null;
  }
}

function clampText(s, max = 220) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

function displayLink(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  return s.length > 48 ? s.slice(0, 47) + "…" : s;
}

/* ======================= NEW: backup FETCHABLE image URLs for OAuth ======================= */
const SETUP_FETCHABLE_IMAGES_KEY = "sm_setup_fetchable_images_v1";
const LS_FETCHABLE_KEY = (u) => (u ? withUser(u, SETUP_FETCHABLE_IMAGES_KEY) : SETUP_FETCHABLE_IMAGES_KEY);

function saveFetchableImagesBackup(user, urls) {
  try {
    const clean = (Array.isArray(urls) ? urls : [])
      .map(toAbsoluteMedia)
      .filter((u) => u && !/^data:image\//i.test(u))
      .slice(0, 2);

    const payload = { urls: clean, savedAt: Date.now() };

    // ✅ save under current user namespace
    localStorage.setItem(LS_FETCHABLE_KEY(user), JSON.stringify(payload));

    // ✅ ALSO save under sid namespace so login/namespace switches never break launch
    const sid = getStoredSid();
    if (sid && sid !== user) {
      localStorage.setItem(LS_FETCHABLE_KEY(sid), JSON.stringify(payload));
    }

    // ✅ legacy safety
    localStorage.setItem(SETUP_FETCHABLE_IMAGES_KEY, JSON.stringify(payload));
  } catch {}
}

function loadFetchableImagesBackup(user) {
  try {
    const sid = getStoredSid();

    // ✅ IMPORTANT: check user → sid → legacy
    const raw =
      localStorage.getItem(LS_FETCHABLE_KEY(user)) ||
      (sid ? localStorage.getItem(LS_FETCHABLE_KEY(sid)) : null) ||
      localStorage.getItem(SETUP_FETCHABLE_IMAGES_KEY);

    if (!raw) return [];

    const p = JSON.parse(raw);
    const ageOk = !p.savedAt || Date.now() - p.savedAt <= DRAFT_TTL_MS;
    if (!ageOk) return [];

    return (Array.isArray(p.urls) ? p.urls : [])
      .map(toAbsoluteMedia)
      .filter((u) => u && !/^data:image\//i.test(u))
      .slice(0, 2);
  } catch {
    return [];
  }
}


function getCachedFetchableImages(user) {
  try {
    const sid = getStoredSid();

    // ✅ IMPORTANT: check user → sid → anon → legacy
    const raw =
      (user ? localStorage.getItem(withUser(user, "sm_image_cache_v1")) : null) ||
      (sid ? localStorage.getItem(withUser(sid, "sm_image_cache_v1")) : null) ||
      localStorage.getItem("u:anon:sm_image_cache_v1") ||
      localStorage.getItem("sm_image_cache_v1");

    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const urls = Array.isArray(parsed?.urls) ? parsed.urls : [];

    return urls
      .map(toAbsoluteMedia)
      .filter((u) => u && !/^data:image\//i.test(u))
      .slice(0, 2);
  } catch {
    return [];
  }
}



function resolveFetchableDraftImages({ user, draftImages, navImages }) {
  const candidate = (Array.isArray(draftImages) && draftImages.length ? draftImages : (navImages || [])).slice(0, 2);

  // ✅ MUST use user-scoped cache (your Fix 1 created per-user storage)
  const cached = getCachedFetchableImages(user);

  return candidate
    .map((img, i) => {
      const s = String(img || "").trim();
      if (!s) return "";
if (/^data:image\//i.test(s)) return cached[i] || s; // keep data URL if no cached fetchable

      return toAbsoluteMedia(s);
    })
    .filter(Boolean)
    .slice(0, 2);
}


/* ---------- Preview card (copy lives UNDER the image, contained) ---------- */
function PreviewCard({ headline, body, link }) {
  const h = clampText(headline, 90);
  const b = clampText(body, 190);
  const l = displayLink(link);

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: 14,
        padding: "12px 12px",
        ...GLASS,
      }}
    >
      <div style={{ fontWeight: 900, color: TEXT_MAIN, fontSize: 15, marginBottom: 6 }}>Preview</div>

      <div style={{ color: ACCENT, fontWeight: 900, fontSize: 16, lineHeight: 1.25 }}>{h || "—"}</div>

      <div style={{ marginTop: 6, color: TEXT_DIM, fontWeight: 600, lineHeight: 1.45, fontSize: 13 }}>
        {b || "—"}
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ color: TEXT_MUTED, fontWeight: 900, fontSize: 12 }}>Link:</div>
        <div
          title={String(link || "")}
          style={{
            flex: 1,
            color: ACCENT,
            fontWeight: 800,
            fontSize: 12,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {l || "—"}
        </div>
      </div>
    </div>
  );
}

/* flag to detect FB redirect flow and force re-hydration */
const FB_CONNECT_INFLIGHT_KEY = "sm_fb_connect_inflight_v1";
const PENDING_LAUNCH_KEY = "sm_pending_launch_v1";

/* creatives persist until campaign duration ends */
const DEFAULT_CAMPAIGN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/* Responsive helper */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

/* FB connection flag */
const FB_CONN_KEY = "smartmark_fb_connected";
// keep the “connected” UI flag around ~60 days (token validity can be ~60 days / sometimes “Never” depending on token type)
const FB_CONN_MAX_AGE = 60 * 24 * 60 * 60 * 1000;


/* ---- per-user session keys (prevents same-browser multi-user bleed) ---- */
const SS_DRAFT_KEY = (u) => (u ? `u:${u}:draft_form_creatives` : "draft_form_creatives");
const SS_ACTIVE_CTX_KEY = (u) => (u ? `u:${u}:${ACTIVE_CTX_KEY}` : ACTIVE_CTX_KEY);

// ✅ Prevent draft from re-hydrating after a successful launch
const SS_DRAFT_DISABLED_KEY = (u) => (u ? `u:${u}:sm_draft_disabled_v1` : "sm_draft_disabled_v1");
// ✅ GLOBAL flag so draft stays disabled even if resolvedUser changes after login
const SS_DRAFT_DISABLED_GLOBAL_KEY = "sm_draft_disabled_global_v1";
const SS_FEE_PAID_GLOBAL_KEY = "sm_fee_paid_global_v1";

function isDraftDisabled(user) {
  try {
    // if globally disabled, never rehydrate a draft
    if (sessionStorage.getItem(SS_DRAFT_DISABLED_GLOBAL_KEY) === "1") return true;

    return sessionStorage.getItem(SS_DRAFT_DISABLED_KEY(user)) === "1";
  } catch {
    return false;
  }
}

function setDraftDisabled(user, on) {
  try {
    if (on) {
      sessionStorage.setItem(SS_DRAFT_DISABLED_KEY(user), "1");
      sessionStorage.setItem(SS_DRAFT_DISABLED_GLOBAL_KEY, "1"); // ✅ global persist
    } else {
      sessionStorage.removeItem(SS_DRAFT_DISABLED_KEY(user));
      sessionStorage.removeItem(SS_DRAFT_DISABLED_GLOBAL_KEY); // ✅ allow draft again (only when you explicitly want)
    }
  } catch {}
}


// Local keys that should also be per-user
const LS_INFLIGHT_KEY = (u) => (u ? withUser(u, FB_CONNECT_INFLIGHT_KEY) : FB_CONNECT_INFLIGHT_KEY);
const LS_BACKUP_KEY = (u) => (u ? withUser(u, SETUP_CREATIVE_BACKUP_KEY) : SETUP_CREATIVE_BACKUP_KEY);

function getUserFromStorage() {
  try {
    // ✅ Only treat sm_current_user as "logged in user"
    // DO NOT fall back to smartmark_login_username, because typing would swap namespaces.
    return (localStorage.getItem("sm_current_user") || "").trim();
  } catch {
    return "";
  }
}


function lsGet(user, key) {
  try {
    // 1) user-scoped
    if (user) {
      const v = localStorage.getItem(withUser(user, key));
      if (v !== null && v !== undefined) return v;
    }

    // 2) anon fallback (critical for creative transfer when user not set on FormPage)
    const anon = localStorage.getItem(withUser("anon", key));
    if (anon !== null && anon !== undefined) return anon;

    // 2b) FormPage SID namespace fallback.
    // FormPage calls setUserNS(sid) when whoami resolves as not-logged-in,
    // so drafts land under u:<sid>:key rather than u:anon:key.
    // This lets CampaignSetup find those drafts after a Stripe/OAuth redirect
    // clears sessionStorage and resolvedUser becomes a username.
    const ns = (localStorage.getItem("sm_user_ns_v1") || "").trim();
    if (ns && ns !== "anon" && ns !== user) {
      const nsVal = localStorage.getItem(withUser(ns, key));
      if (nsVal !== null && nsVal !== undefined) return nsVal;
    }

    // 3) legacy/global
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}


function lsSet(user, key, value, alsoLegacy = false) {
  try {
    if (user) localStorage.setItem(withUser(user, key), value);
    if (alsoLegacy) localStorage.setItem(key, value);
  } catch {}
}

/* ---- creatives map now scoped per-user ---- */
const CREATIVE_MAP_KEY = (user, actId) =>
  user
    ? withUser(user, `sm_creatives_map_${String(actId || "").replace(/^act_/, "")}`)
    : `sm_creatives_map_${String(actId || "").replace(/^act_/, "")}`;

const readCreativeMap = (user, actId) => {
  try {
    const k = CREATIVE_MAP_KEY(user, actId);
    const raw = localStorage.getItem(k);
    if (raw) return JSON.parse(raw || "{}") || {};
    const legacyKey = `sm_creatives_map_${String(actId || "").replace(/^act_/, "")}`;
    const legacy = localStorage.getItem(legacyKey);
    if (user && legacy) {
      localStorage.setItem(k, legacy);
      return JSON.parse(legacy || "{}") || {};
    }
    return {};
  } catch {
    return {};
  }
};

const writeCreativeMap = (user, actId, map) => {
  try {
    localStorage.setItem(CREATIVE_MAP_KEY(user, actId), JSON.stringify(map || {}));
  } catch {}
};

const CAMPAIGN_SETTINGS_KEY = (user) =>
  user ? withUser(user, "sm_campaign_settings_v1") : "sm_campaign_settings_v1";

function readCampaignSettingsMap(user) {
  try {
    const raw =
      localStorage.getItem(CAMPAIGN_SETTINGS_KEY(user)) ||
      localStorage.getItem("sm_campaign_settings_v1");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCampaignSettingsMap(user, map) {
  try {
    localStorage.setItem(CAMPAIGN_SETTINGS_KEY(user), JSON.stringify(map || {}));
  } catch {}
}

/* ------------------ expire logic (persist only until campaign duration ends) ------------------ */
function isExpiredSavedCreative(saved) {
  if (!saved) return true;
  const now = Date.now();

  if (saved.expiresAt && Number.isFinite(Number(saved.expiresAt))) {
    return now > Number(saved.expiresAt);
  }

  const base = Number(saved.time) || now;
  return now > base + DEFAULT_CAMPAIGN_TTL_MS;
}

function purgeExpiredCreative(map, campaignId) {
  if (!map || !campaignId) return false;
  const saved = map[campaignId];
  if (!saved) return false;
  if (!isExpiredSavedCreative(saved)) return false;
  delete map[campaignId];
  return true;
}

function saveSetupCreativeBackup(user, draftObj) {
  try {
    const payload = { ...(draftObj || {}), savedAt: Date.now() };
    localStorage.setItem(LS_BACKUP_KEY(user), JSON.stringify(payload));
    localStorage.setItem(SETUP_CREATIVE_BACKUP_KEY, JSON.stringify(payload)); // legacy safety
  } catch {}
}

function loadSetupCreativeBackup(user) {
  try {
    const raw = localStorage.getItem(LS_BACKUP_KEY(user)) || localStorage.getItem(SETUP_CREATIVE_BACKUP_KEY);
    if (!raw) return null;

    const draft = JSON.parse(raw);
    const ageOk = !draft.savedAt || Date.now() - draft.savedAt <= DRAFT_TTL_MS;
    if (!ageOk) return null;

    return draft;
  } catch {
    return null;
  }
}

function getActiveCtx(user) {
  const kSS = SS_ACTIVE_CTX_KEY(user);

  const v2 =
    (sessionStorage.getItem(kSS) ||
      (user ? localStorage.getItem(withUser(user, ACTIVE_CTX_KEY)) : null) ||
      localStorage.getItem(ACTIVE_CTX_KEY) ||
      "").trim();

  if (v2) return v2;

  const v1 =
    (sessionStorage.getItem(ACTIVE_CTX_KEY_LEGACY) ||
      (user ? localStorage.getItem(withUser(user, ACTIVE_CTX_KEY_LEGACY)) : null) ||
      localStorage.getItem(ACTIVE_CTX_KEY_LEGACY) ||
      "").trim();

  if (v1) {
    setActiveCtx(v1, user);
    return v1;
  }

  return "";
}

function setActiveCtx(ctxKey, user) {
  const k = String(ctxKey || "").trim();
  if (!k) return;

  const kSS = SS_ACTIVE_CTX_KEY(user);

  try {
    sessionStorage.setItem(kSS, k);
  } catch {}
  try {
    if (user) localStorage.setItem(withUser(user, ACTIVE_CTX_KEY), k);
    localStorage.setItem(ACTIVE_CTX_KEY, k);
  } catch {}
}

function isDraftForActiveCtx(draftObj, user) {
  const active = getActiveCtx(user);
  const dk = (draftObj && draftObj.ctxKey ? String(draftObj.ctxKey) : "").trim();
  if (!active) return true;
  if (!dk) return false;
  return dk === active;
}

function purgeDraftStorages(user) {
  try {
    sessionStorage.removeItem(SS_DRAFT_KEY(user));
  } catch {}
  try {
    sessionStorage.removeItem("draft_form_creatives");
  } catch {}
  try {
    if (user) localStorage.removeItem(withUser(user, CREATIVE_DRAFT_KEY));
    localStorage.removeItem(CREATIVE_DRAFT_KEY);
    localStorage.removeItem("sm_setup_creatives_backup_v1");
  } catch {}
}

function getLatestDraftImageUrlsFromImageDrafts() {
  try {
    const raw = localStorage.getItem("smartmark.imageDrafts.v1");
    if (!raw) return [];
    const obj = JSON.parse(raw);

    const items = Object.entries(obj)
      .filter(([k, v]) => k.startsWith("img:") && v && v._updatedAt)
      .sort((a, b) => (a[1]._updatedAt || 0) - (b[1]._updatedAt || 0));

    const urls = items
      .slice(-2)
      .map(([k]) => k.replace(/^img:/, ""))
      .map((u) => {
  const s = String(u || "").trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;

  // ✅ FIX: bare filenames should be treated as /api/media/*
  if (!s.startsWith("/") && /\.(png|jpg|jpeg|webp)$/i.test(s)) {
    return `${MEDIA_ORIGIN}/api/media/${s}`;
  }

  if (s.startsWith("/api/media/")) return APP_ORIGIN + s;
  if (s.startsWith("/")) return MEDIA_ORIGIN + s;

  return MEDIA_ORIGIN + "/" + s;
})

      .filter(Boolean);

    return urls;
  } catch {
    return [];
  }
}

const FORM_DRAFT_KEY = "sm_form_draft_v3";

function persistDraftCreativesNow(user, draftCreatives) {
  try {
    const imgs = Array.isArray(draftCreatives?.images)
      ? draftCreatives.images.map(toAbsoluteMedia).filter(Boolean).slice(0, 2)
      : [];

    if (!imgs.length) return;

    const payload = {
      ...(draftCreatives || {}),
      images: imgs,
      ctxKey: (draftCreatives && draftCreatives.ctxKey) || getActiveCtx(user) || "",
      mediaSelection: "image",
      savedAt: Date.now(),
    };

    // ✅ primary (user / sid scoped)
    sessionStorage.setItem(SS_DRAFT_KEY(user), JSON.stringify(payload));

    // ✅ CRITICAL: legacy/global bridge so hydrate still works after user/ns changes
    // (your hydration code checks this key, but you weren’t writing it)
    sessionStorage.setItem("draft_form_creatives", JSON.stringify(payload));

    // ✅ local persistence
    if (user) localStorage.setItem(withUser(user, CREATIVE_DRAFT_KEY), JSON.stringify(payload));
    localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));

    saveSetupCreativeBackup(user, payload);
  } catch {}
}


/* ======================= NEW: attach draft creatives into active campaign slot after FB connect ======================= */
function attachDraftToCampaignIfEmpty({ user, acctId, campaignId, draftImages, expiresAt, name }) {
  try {
    if (!acctId || !campaignId) return false;

    const map = readCreativeMap(user, acctId);

    const purged = purgeExpiredCreative(map, campaignId);
    if (purged) writeCreativeMap(user, acctId, map);

    if (map[campaignId] && Array.isArray(map[campaignId].images) && map[campaignId].images.length) {
      return false;
    }

    map[campaignId] = {
      images: (draftImages || []).slice(0, 2),
      mediaSelection: "image",
      time: Date.now(),
      expiresAt: expiresAt || Date.now() + DEFAULT_CAMPAIGN_TTL_MS,
      name: name || "Untitled",
    };

    writeCreativeMap(user, acctId, map);
    return true;
  } catch {
    return false;
  }
}

function buildPendingLaunchPayload({
  selectedPlan,
  budget,
  startDate,
  endDate,
  selectedAccount,
  selectedPageId,
  form,
  answers,
  headline,
  body,
  inferredLink,
  previewCopy,
  draftCreatives,
  navImageUrls,
}) {
  return {
    selectedPlan,
    budget,
    startDate,
    endDate,
    selectedAccount,
    selectedPageId,
    form,
    answers,
    headline,
    body,
    inferredLink,
    previewCopy,
    draftCreatives,
    navImageUrls,
    savedAt: Date.now(),
  };
}

function savePendingLaunch(payload) {
  try {
    localStorage.setItem(PENDING_LAUNCH_KEY, JSON.stringify(payload));
  } catch {}
}

function loadPendingLaunch() {
  try {
    const raw = localStorage.getItem(PENDING_LAUNCH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingLaunch() {
  try {
    localStorage.removeItem(PENDING_LAUNCH_KEY);
  } catch {}
}

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = 25;
  const total = parsed + fee;
  return { fee, total };
};

function toAbsoluteMedia(u) {
  if (!u) return "";
  const s0 = String(u).trim();
  if (!s0) return "";

  // ✅ allow data:image previews (they may exist in cache)
  if (/^data:image\//i.test(s0)) return s0;

  // reject unusable schemes
  if (/^(blob:|file:|about:)/i.test(s0)) return "";

  // Split off query/hash so filename detection works even after cache-busting
  const [basePart, suffixPart = ""] = s0.split(/(?=[?#])/); // keeps ?/# in suffix
  const base = basePart.trim();
  const suffix = suffixPart || "";

  // ✅ absolute URL:
  // if it’s a /api/media URL, ALWAYS force Render origin (smartemark.com does NOT serve /api/media)
  if (/^https?:\/\//i.test(base)) {
    try {
      const url = new URL(base + suffix);
      const idx = url.pathname.indexOf("/api/media/");
      if (idx >= 0) {
        const path = url.pathname.slice(idx);
        return MEDIA_ORIGIN + path + (url.search || "");
      }
      return url.toString();
    } catch {
      return base + suffix;
    }
  }

  // ✅ bare filenames like "static-....png" (WITH or WITHOUT ?smcb=) must be served from /api/media on Render
  if (!base.startsWith("/") && /\.(png|jpg|jpeg|webp)$/i.test(base)) {
    return `${MEDIA_ORIGIN}/api/media/${base}${suffix}`;
  }

  // ✅ relative media paths must go to Render too
  if (base.startsWith("/api/media/")) return MEDIA_ORIGIN + base + suffix;
  if (base.startsWith("api/media/")) return `${MEDIA_ORIGIN}/${base}${suffix}`;

  // other relative paths -> Render
  if (base.startsWith("/")) return MEDIA_ORIGIN + base + suffix;

  return MEDIA_ORIGIN + "/" + base + suffix;
}

function isDataImage(u) {
  return /^data:image\//i.test(String(u || "").trim());
}

async function uploadDataUrlsToMedia(dataUrls = []) {
  const clean = (Array.isArray(dataUrls) ? dataUrls : [])
    .map((x) => String(x || "").trim())
    .filter(isDataImage)
    .slice(0, 2);

  if (!clean.length) return [];

  const r = await fetch(`${MEDIA_ORIGIN}/api/media/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrls: clean }),
  });

  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j?.urls) {
    throw new Error(j?.error || `Upload failed (HTTP ${r.status})`);
  }

  return (j.urls || []).map(toAbsoluteMedia).filter(Boolean).slice(0, 2);
}




function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  const src = toAbsoluteMedia(imageUrl);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1005,
        background: "rgba(10,14,17,0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "88vw",
          maxHeight: "88vh",
          borderRadius: 18,
          background: "#12171b",
          padding: 0,
          boxShadow: "0 10px 60px #000c",
        }}
      >
        <img
          src={src || ""}
          alt="Full-screen"
          style={{
            maxWidth: "84vw",
            maxHeight: "80vh",
            display: "block",
            borderRadius: 14,
            background: "#0f1215",
          }}
        />
        <button
          style={{
            position: "absolute",
            top: 12,
            right: 18,
            background: "#1b242a",
            border: "1px solid rgba(255,255,255,0.06)",
            color: WHITE,
            borderRadius: 11,
            padding: "9px 17px",
            fontWeight: 800,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 1px 6px #14e7b933",
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ---- helpers for Image carousel ---- */
const navBtn = (dir) => ({
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  [dir < 0 ? "left" : "right"]: 8,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "none",
  borderRadius: 10,
  width: 28,
  height: 28,
  fontSize: 16,
  fontWeight: 900,
  cursor: "pointer",
  zIndex: 2,
});
const badge = {
  position: "absolute",
  bottom: 6,
  right: 6,
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  borderRadius: 8,
  padding: "2px 6px",
  fontSize: 11,
  fontWeight: 900,
  zIndex: 2,
};

function ImageCarousel({ items = [], onFullscreen, height = 220 }) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [readyMap, setReadyMap] = useState({});

  const [retryCount, setRetryCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  const normalized = useMemo(() => {
    const arr = (items || []).map(toAbsoluteMedia).filter(Boolean);
    const seen = new Set();
    return arr.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  }, [items]);

  const base = normalized[idx] || "";

  const current = useMemo(() => {
    if (!base) return "";
    if (!retryNonce) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}smcb=${retryNonce}`;
  }, [base, retryNonce]);

  const go = (d) => {
    if (!normalized.length) return;
    setIdx((p) => (p + d + normalized.length) % normalized.length);
  };

  useEffect(() => {
    let cancelled = false;

    try {
      (normalized || []).forEach((u) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (cancelled) return;
          setReadyMap((prev) => ({ ...prev, [u]: true }));
        };
        img.onerror = () => {};
        img.src = u;
      });
    } catch {}

    return () => {
      cancelled = true;
    };
  }, [normalized]);

  useEffect(() => {
    if (idx >= normalized.length) setIdx(0);
    setBroken(false);
    setRetryCount(0);
    setRetryNonce(0);

    const currentBase =
      normalized[Math.min(idx, Math.max(normalized.length - 1, 0))] || "";
    setLoaded(!!readyMap[currentBase]);
  }, [idx, normalized, readyMap]);

  useEffect(() => {
    const currentBase = normalized[idx] || "";
    setBroken(false);
    setRetryCount(0);
    setRetryNonce(0);
    setLoaded(!!readyMap[currentBase]);
  }, [idx, normalized, readyMap]);

  useEffect(() => {
    if (!broken) return;
    if (retryCount >= 3) return;

    const delay = 350 + retryCount * 450;
    const t = setTimeout(() => {
      setBroken(false);
      setLoaded(false);
      setRetryCount((c) => c + 1);
      setRetryNonce(Date.now());
    }, delay);

    return () => clearTimeout(t);
  }, [broken, retryCount]);

  if (!normalized.length) {
    return (
      <div
        style={{
          height,
          width: "100%",
          background: "#0f1418",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        No Images
      </div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        background: "#0f1418",
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {!broken && !loaded && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.55)",
            fontWeight: 800,
            fontSize: 13,
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            zIndex: 1,
          }}
        >
          Loading image…
        </div>
      )}

      {broken && retryCount >= 3 && (
        <div
          style={{
            height,
            width: "100%",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.62)",
            fontWeight: 900,
            fontSize: 13,
            background:
              "linear-gradient(180deg, rgba(255,60,60,0.08), rgba(255,255,255,0.02))",
          }}
        >
          <div>Image failed to load</div>
          <button
            type="button"
            onClick={() => {
              setBroken(false);
              setLoaded(false);
              setRetryCount(0);
              setRetryNonce(Date.now());
            }}
            style={{
              background: "#1b242a",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 10,
              padding: "8px 14px",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!broken && (
        <img
          key={current}
          src={current}
          alt="Ad"
          loading="eager"
          decoding="async"
          fetchPriority="high"
          style={{
            width: "100%",
            maxHeight: height,
            height,
            objectFit: "contain",
            display: "block",
            background: "#0f1418",
            opacity: loaded ? 1 : 0.01,
            transition: "opacity 180ms ease",
          }}
          onClick={() => onFullscreen && onFullscreen(base)}
          onLoad={() => {
            setReadyMap((prev) => ({ ...prev, [base]: true }));
            setLoaded(true);
          }}
          onError={() => setBroken(true)}
          draggable={false}
        />
      )}

      {normalized.length > 1 && (
        <>
          <button onClick={() => go(-1)} style={navBtn(-1)} aria-label="Prev">
            ‹
          </button>
          <button onClick={() => go(1)} style={navBtn(1)} aria-label="Next">
            ›
          </button>
          <div style={badge}>
            {idx + 1}/{normalized.length}
          </div>
        </>
      )}
    </div>
  );
}

function CreativeThumbGrid({ items = [], labels = [], onOpen, height = 170 }) {
  const normalized = useMemo(() => {
    const arr = (items || []).map(toAbsoluteMedia).filter(Boolean);
    const seen = new Set();
    return arr.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  }, [items]);

  if (!normalized.length) {
    return (
      <div
        style={{
          height,
          width: "100%",
          background: "#0f1418",
          color: "rgba(255,255,255,0.55)",
          fontWeight: 800,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 15,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        No images
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: normalized.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr",
        gap: 12,
      }}
    >
      {normalized.map((url, idx) => (
        <button
          key={`${url}-${idx}`}
          type="button"
          onClick={() => onOpen && onOpen(url)}
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.045), rgba(255,255,255,0.02))",
            border: "1px solid rgba(255,255,255,0.07)",
            borderRadius: 16,
            padding: 10,
            cursor: "pointer",
            textAlign: "left",
            boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
          }}
        >
          <div
            style={{
              width: "100%",
              height,
              borderRadius: 12,
              overflow: "hidden",
              background: "#0f1418",
              border: "1px solid rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <img
              src={url}
              alt={labels[idx] || `Creative ${idx + 1}`}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
                background: "#0f1418",
              }}
              draggable={false}
            />
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div
              style={{
                color: "#ffffff",
                fontWeight: 900,
                fontSize: 13,
                lineHeight: 1.2,
              }}
            >
              {labels[idx] || `Creative ${idx + 1}`}
            </div>

            <div
              style={{
                color: "rgba(255,255,255,0.62)",
                fontWeight: 800,
                fontSize: 11,
                whiteSpace: "nowrap",
              }}
            >
              Tap to expand
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}



/* ---------- Minimal metrics row ---------- */
function MetricsRow({ metrics, optimizerState, showConversions }) {
  const isMobile = useIsMobile();
  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalized = useMemo(() => {
    const m = metrics || {};
    // Full snapshot from optimizer state (has CPM, linkClicks, conversions, etc.)
    const snap = optimizerState?.metricsSnapshot || {};

    const impressions = safeNum(m.impressions, 0);
    const clicks = safeNum(m.clicks, 0);
    const spend = safeNum(m.spend, 0);
    const ctrNum =
      m.ctr !== undefined && m.ctr !== null && m.ctr !== ""
        ? safeNum(m.ctr, 0)
        : impressions > 0
        ? (clicks / impressions) * 100
        : 0;
    const cpcNum = clicks > 0 ? spend / clicks : safeNum(snap.cpc, 0);
    const cpmNum = safeNum(snap.cpm, impressions > 0 ? (spend * 1000) / impressions : 0);
    const linkClicks = safeNum(snap.linkClicks, clicks);
    const hasDelivery = impressions > 0 || clicks > 0 || spend > 0;

    const conversions = safeNum(snap.conversions, 0);
    const conversionRate = conversions > 0 && linkClicks > 0
      ? (conversions / linkClicks) * 100
      : safeNum(snap.conversionRate, 0);
    const costPerConv = conversions > 0 && spend > 0
      ? spend / conversions
      : safeNum(snap.costPerConversion, 0);

    return {
      spend: spend > 0 ? `$${spend.toFixed(2)}` : "$0.00",
      impressions: impressions.toLocaleString(),
      clicks: linkClicks > 0 ? linkClicks.toLocaleString() : clicks.toLocaleString(),
      ctr: `${ctrNum.toFixed(2)}%`,
      cpc: `$${cpcNum.toFixed(2)}`,
      cpm: cpmNum > 0 ? `$${cpmNum.toFixed(2)}` : "$0.00",
      hasDelivery,
      conversions,
      conversionRate,
      costPerConv,
    };
  }, [metrics, optimizerState]);

  const baseCards = [
    { key: "spend",       label: "Spend",      value: normalized.spend },
    { key: "impressions", label: "Impressions", value: normalized.impressions },
    { key: "clicks",      label: "Link Clicks", value: normalized.clicks },
    { key: "ctr",         label: "CTR",         value: normalized.ctr },
    { key: "cpc",         label: "CPC",         value: normalized.cpc },
    { key: "cpm",         label: "CPM",         value: normalized.cpm },
  ];

  const conversionCards = showConversions
    ? [
        {
          key: "conversions",
          label: "Conversions",
          value: normalized.conversions > 0 ? String(normalized.conversions) : "0",
          sub: normalized.conversions === 0 ? "No conversions yet" : undefined,
          isPremium: true,
        },
        {
          key: "conv-rate",
          label: "Conv Rate",
          value: normalized.conversions > 0 && normalized.conversionRate > 0
            ? `${Number(normalized.conversionRate).toFixed(2)}%`
            : "—",
          sub: "Conversions / link clicks",
          isPremium: true,
        },
        {
          key: "cost-per-conv",
          label: "Cost / Conv",
          value: normalized.conversions > 0 && normalized.costPerConv > 0
            ? `$${Number(normalized.costPerConv).toFixed(2)}`
            : "—",
          sub: normalized.conversions === 0 ? "No conversions yet" : "Spend / conversions",
          isPremium: true,
        },
      ]
    : [];

  const cards = [...baseCards, ...conversionCards];

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          marginBottom: 14,
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        {normalized.hasDelivery && (
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#22c55e",
              flexShrink: 0,
            }}
          />
        )}
        <div
          style={{
            color: normalized.hasDelivery ? "#16a34a" : "#94a3b8",
            fontWeight: 600,
            fontSize: 12,
          }}
        >
          {normalized.hasDelivery ? "Delivery data received" : "No delivery data yet"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(3, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.key}
            style={{
              background: c.isPremium
                ? "linear-gradient(145deg, #f5f3ff 0%, #ede9fe 100%)"
                : "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
              border: c.isPremium
                ? "1px solid rgba(109,40,217,0.18)"
                : "1px solid rgba(93,89,234,0.12)",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 6,
              boxShadow: "0 4px 14px rgba(91,87,232,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: c.isPremium ? "#7c3aed" : "#94a3b8",
                fontWeight: 600,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              {c.label}
            </div>

            <div
              style={{
                fontSize: 20,
                fontWeight: 700,
                lineHeight: 1.1,
                color: "#111827",
              }}
            >
              {c.value}
            </div>

            {c.sub && (
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.3 }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function marketerIconForStage(stage) {
  const s = String(stage || "").trim().toLowerCase();
  if (s === "delivery") return FaSearch;
  if (s === "optimizing") return FaBolt;
  if (s === "blocked") return FaShieldAlt;
  if (s === "queued") return FaRegClock;
  return FaChartLine;
}

function marketerToneStyles(tone) {
  const t = String(tone || "").trim().toLowerCase();

  if (t === "attention") {
    return {
      iconBg: "rgba(255, 184, 77, 0.14)",
      iconColor: "#ffd27a",
      border: "rgba(255,255,255,0.06)",
    };
  }

  if (t === "positive") {
    return {
      iconBg: "rgba(96, 224, 168, 0.14)",
      iconColor: "#8ff0c2",
      border: "rgba(255,255,255,0.06)",
    };
  }

  return {
    iconBg: "rgba(49,225,255,0.14)",
    iconColor: "#7ee7ff",
    border: "rgba(255,255,255,0.06)",
  };
}

function timeAgoShort(ts) {
  const n = new Date(ts || "").getTime();
  if (!n) return "Just now";

  const diffMs = Math.max(0, Date.now() - n);
  const mins = Math.floor(diffMs / 60000);
  const hrs = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}
function getCampaignDisplayStatus(campaign) {
  if (campaign?.smArchived) return "Archived";
  const fb = String(campaign?.effective_status || campaign?.status || "").toUpperCase();
  if (fb === "ARCHIVED") return "Archived";
  if (fb === "DELETED") return "Deleted";
  if (fb === "COMPLETED") return "Finished";
  const stopTime = campaign?.stop_time;
  if (stopTime) {
    const stopMs = new Date(stopTime).getTime();
    if (Number.isFinite(stopMs) && stopMs < Date.now()) return "Finished";
  }
  if (fb === "PAUSED") return "Paused";
  return "Active";
}

// A campaign is "effectively archived" if Smartemark marked it archived OR if Meta's
// own status is ARCHIVED/DELETED (e.g. archived directly on Meta without going through
// the Smartemark archive flow, so smArchived may still be false in our DB).
function isEffectivelyArchived(campaign) {
  if (campaign?.smArchived) return true;
  const s = String(campaign?.effective_status || campaign?.status || "").toUpperCase();
  return s === "ARCHIVED" || s === "DELETED";
}

// A campaign is "useful current" (shown in the active dropdown) if:
//  - not hidden, not effectively archived
//  - AND if PAUSED: only show when we have no metrics yet (might be new) OR when there's actual delivery.
//    PAUSED + loaded metrics that are all-zero = failed/test launch clutter → hide from active view.
//    Users can still find and hide these via the campaign menu once we show them in neither list.
function isUsefulCurrentCampaign(campaign, metricsSnap) {
  if (!campaign) return false;
  if (isEffectivelyArchived(campaign) || campaign.hiddenFromHistory) return false;

  const status = String(campaign.status || campaign.effective_status || "").toUpperCase();
  const name   = String(campaign.name || "").trim();

  const isGenericName = name === "Campaign" || name === "" || name === "Unnamed campaign";
  const trulyLive = status === "ACTIVE" || status === "IN_PROCESS" || status === "WITH_ISSUES";

  // Empty/unknown status = stub with no real Meta data → always clutter if generic name.
  // The admin campaigns endpoint no longer defaults to 'ACTIVE', so empty = truly unknown.
  if (isGenericName && status === "") return false;

  // Generic-named PAUSED stubs → always clutter
  if (isGenericName && status === "PAUSED") return false;

  // Generic-named stub with a live-looking status but zero delivery → not really live.
  // Real active campaigns always accumulate impressions/spend; zero means it never ran.
  if (isGenericName && trulyLive && metricsSnap != null) {
    const imp = Number(metricsSnap.impressions || 0);
    const sp  = Number(metricsSnap.spend      || 0);
    const cl  = Number(metricsSnap.clicks     || metricsSnap.linkClicks || 0);
    if (imp === 0 && sp === 0 && cl === 0) return false;
  }

  // PAUSED campaigns:
  // - If launched through Smartemark (launchComplete=true) → ALWAYS show. The user
  //   paused a real campaign; it must remain selectable in the dropdown.
  // - If not Smartemark-launched AND has a real non-generic name → show (might be an
  //   external campaign the user imported or a campaign from an older session).
  // - ONLY hide when: no launchComplete + generic name + zero delivery (stale test stub).
  if (status === "PAUSED") {
    if (campaign.launchComplete) return true; // always keep Smartemark-launched paused campaigns
    if (!isGenericName) return true;          // non-generic name → always keep
    // Generic name + no launchComplete → apply zero-delivery clutter check
    if (metricsSnap != null) {
      const imp = Number(metricsSnap.impressions || 0);
      const sp  = Number(metricsSnap.spend      || 0);
      const cl  = Number(metricsSnap.clicks     || metricsSnap.linkClicks || 0);
      if (imp === 0 && sp === 0 && cl === 0) return false;
    }
  }

  return true;
}

function summarizeOptimizerEntry(kind, payload) {
  if (!payload || typeof payload !== "object") return null;

  const generatedAt = String(payload.generatedAt || payload.updatedAt || "").trim();

  if (kind === "diagnosis") {
    return {
      kind: "Diagnosis",
      title:
        String(payload.primaryFinding || "").trim() ||
        "Reviewed campaign performance",
      detail:
        String(payload.summary || "").trim() ||
        String(payload.reason || "").trim() ||
        "",
      generatedAt,
    };
  }

  if (kind === "decision") {
    const actionType = String(payload.actionType || "").trim();
    return {
      kind: "Decision",
      title: actionType
        ? actionType.replace(/_/g, " ")
        : "Chose the next move",
      detail:
        String(payload.reason || "").trim() ||
        String(payload.summary || "").trim() ||
        "",
      generatedAt,
    };
  }

  if (kind === "action") {
    const actionType = String(payload.actionType || "").trim();
    const isDryRun = !!payload.dryRun;
    const plannedActionType = String(payload.plannedActionType || "").trim();
    const displayType = isDryRun && plannedActionType ? plannedActionType : actionType;
    return {
      kind: "Action",
      title: displayType ? displayType.replace(/_/g, " ") : "Updated campaign state",
      detail:
        String(payload.summary || "").trim() ||
        String(payload.reason || "").trim() ||
        String(payload.status || "").trim() ||
        "",
      dryRun: isDryRun,
      skipped: !!payload.skipped,
      generatedAt,
    };
  }

  if (kind === "monitoring") {
    return {
      kind: "Monitoring",
      title:
        String(payload.monitoringDecision || "").trim() ||
        "Checked live delivery",
      detail:
        String(payload.reason || "").trim() ||
        String(payload.summary || "").trim() ||
        "",
      generatedAt,
    };
  }

  return null;
}

function buildOptimizerHistoryItems(optimizerState) {
  return [
    summarizeOptimizerEntry("diagnosis", optimizerState?.latestDiagnosis),
    summarizeOptimizerEntry("decision", optimizerState?.latestDecision),
    summarizeOptimizerEntry("action", optimizerState?.latestAction),
    summarizeOptimizerEntry("monitoring", optimizerState?.latestMonitoringDecision),
  ]
    .filter(Boolean)
    .map((item, idx) => ({
      ...item,
      id: `${item.kind}-${item.generatedAt || idx}`,
      ts: item.generatedAt ? new Date(item.generatedAt).getTime() : 0,
      timeLabel: item.generatedAt ? timeAgoShort(item.generatedAt) : "recent",
    }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 4);
}

function MarketerActionsCard({ summary, optimizerState, metrics, onViewABTest }) {
  const safeSummary = summary || getFallbackPublicSummary();
  const _aiHistoryRaw = Array.isArray(optimizerState?.aiHistory) ? optimizerState.aiHistory : [];
  const history = _aiHistoryRaw.length > 0
    ? _aiHistoryRaw
        .slice()
        .sort((a, b) =>
          (b.timestamp ? new Date(b.timestamp).getTime() : 0) -
          (a.timestamp ? new Date(a.timestamp).getTime() : 0)
        )
        .slice(0, 50)
        .map((entry, idx) => ({
          id: entry.id || `${entry.type || 'entry'}-${idx}`,
          rawType: entry.type || 'monitoring',
          kind:
            entry.type === 'diagnosis' ? 'Diagnosis'
            : entry.type === 'decision' ? 'Decision'
            : entry.type === 'action'
              ? (entry.executed === true && !entry.skipped && !entry.dryRun ? 'Action Made' : 'Action')
            : entry.type === 'daily_report' ? 'Daily Report'
            : 'Monitoring',
          title: entry.title || String(entry.actionType || entry.type || 'Update').replace(/_/g, ' '),
          detail: entry.reason || entry.summary || '',
          dryRun: !!entry.dryRun,
          skipped: !!entry.skipped,
          generatedAt: entry.timestamp || '',
          ts: entry.timestamp ? new Date(entry.timestamp).getTime() : 0,
          timeLabel: entry.timestamp ? timeAgoShort(entry.timestamp) : 'recent',
        }))
    : buildOptimizerHistoryItems(optimizerState);
  const latest = history[0] || null;
  const [showHistory, setShowHistory] = useState(false);
  const [histTab, setHistTab] = useState("all");
  const filteredHistory =
    histTab === "observations" ? history.filter((e) => e.rawType === "diagnosis" || e.rawType === "monitoring")
    : histTab === "daily"      ? history.filter((e) => e.rawType === "daily_report")
    : histTab === "actions"    ? history.filter((e) => e.rawType === "action" || e.rawType === "decision")
    : history;

  const pending = optimizerState?.pendingCreativeTest || null;
  const pendingStatus = String(pending?.status || "").trim().toLowerCase();
  const isTesting = pendingStatus === "live" || pendingStatus === "ready" || pendingStatus === "staged";

  const hasRealSummary = optimizerState?.publicSummary?.headline || latest;
  const hasMetrics =
    metrics &&
    (Number(metrics.impressions) > 0 ||
      Number(metrics.clicks) > 0 ||
      Number(metrics.spend) > 0);

  const headline = isTesting
    ? "Creative test in progress"
    : hasRealSummary
    ? latest?.title || safeSummary?.headline
    : hasMetrics
    ? "Monitoring live performance"
    : "Gathering delivery data";

  // The AI `reason` from the optimizer brain is genuine GPT-written text grounded in real metrics.
  const aiReason = optimizerState?.latestDiagnosis?.reason || null;

  const detail = isTesting
    ? "Smartemark is running a controlled creative test with a limited number of ads and waiting for enough data before choosing a winner."
    : hasRealSummary && (aiReason || latest?.detail || safeSummary?.subtext)
    ? aiReason || latest?.detail || safeSummary?.subtext
    : hasMetrics
    ? `Delivery is active. Watching for a stable pattern in CTR and CPC before recommending a change.`
    : "Smartemark is collecting early delivery signals. The AI will begin analyzing once there is enough data — typically after a day or two of impressions.";

  return (
    <div
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          borderRadius: 18,
          padding: "20px 22px",
          background: "linear-gradient(160deg, #ffffff 0%, #f5f6ff 55%, #eef0ff 100%)",
          boxShadow: "0 12px 36px rgba(91,87,232,0.10), inset 0 1px 0 rgba(255,255,255,0.95)",
          border: "1px solid rgba(93,89,234,0.14)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle top edge highlight */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "8%",
            right: "8%",
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(93,89,234,0.28), transparent)",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontWeight: 600,
                fontSize: 11,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
                color: "#94a3b8",
                marginBottom: 7,
              }}
            >
              AI Ad Manager
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                lineHeight: 1.35,
                color: "#111827",
              }}
            >
              {headline}
            </div>
          </div>

          <div
            style={{
              padding: "6px 12px",
              borderRadius: 999,
              background: "linear-gradient(135deg, #eef2ff 0%, #e4e8ff 100%)",
              border: "1px solid rgba(93,89,234,0.18)",
              color: "#4f46e5",
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {isTesting ? "A/B Testing" : "Monitoring"}
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(135deg, #f7f8ff 0%, #f0f2ff 100%)",
            border: "1px solid rgba(93,89,234,0.09)",
            borderRadius: 12,
            padding: "13px 15px",
            fontSize: 14,
            lineHeight: 1.7,
            color: "#374151",
            fontWeight: 400,
          }}
        >
          {detail}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              color: "#94a3b8",
              fontWeight: 500,
              fontSize: 12,
            }}
          >
            {(() => {
              const ts = optimizerState?.latestDiagnosis?.generatedAt || null;
              return ts ? `Analyzed ${timeAgoShort(ts)}` : "Monitoring campaign";
            })()}
          </div>
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(true)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#6366f1",
                fontWeight: 600,
                fontSize: 12,
                padding: "4px 0",
                fontFamily: "inherit",
              }}
            >
              View AI history →
            </button>
          )}
        </div>
      </div>

      {showHistory && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setShowHistory(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 20,
              padding: "24px 24px 20px",
              maxWidth: 500,
              width: "100%",
              maxHeight: "calc(100vh - 80px)",
              overflowY: "auto",
              boxShadow: "0 24px 72px rgba(0,0,0,0.20)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, color: "#111827" }}>AI Activity Log</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>Saved optimizer cycle history</div>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                style={{ background: "rgba(0,0,0,0.06)", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#6b7280", fontFamily: "inherit", flexShrink: 0 }}
              >×</button>
            </div>

            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {[
                { key: "all", label: "All" },
                { key: "observations", label: "Observations" },
                { key: "daily", label: "Daily Reports" },
                { key: "actions", label: "Actions" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setHistTab(t.key)}
                  style={{
                    background: histTab === t.key ? "#ede9fe" : "#f8fafc",
                    border: `1px solid ${histTab === t.key ? "#c4b5fd" : "#e5e7eb"}`,
                    color: histTab === t.key ? "#5b21b6" : "#6b7280",
                    borderRadius: 999, padding: "4px 12px", fontSize: 11,
                    fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {filteredHistory.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 14, padding: "20px 0", textAlign: "center" }}>
                {histTab === "daily"
                  ? "No daily reports yet. Reports are generated once per day during the scheduled optimizer cycle."
                  : histTab === "actions"
                  ? "No actions logged yet. Actions appear when the AI Operator takes or evaluates a campaign move."
                  : histTab === "observations"
                  ? "No observations logged yet. Activity will appear after the first optimizer cycle runs."
                  : "No AI activity logged yet. Activity will appear after the first optimizer cycle runs."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {filteredHistory.map((item) => {
                  const kindColors = {
                    Diagnosis:       { bg: "#f5f3ff", border: "#e9d5ff", badge: "#7c3aed" },
                    Decision:        { bg: "#eff6ff", border: "#bfdbfe", badge: "#1d4ed8" },
                    "Action Made":   { bg: "#f0fdf4", border: "#86efac", badge: "#15803d" },
                    Action:          item.dryRun
                      ? { bg: "#fffbeb", border: "#fde68a", badge: "#b45309" }
                      : { bg: "#f1f5f9", border: "#cbd5e1", badge: "#64748b" },
                    "Daily Report":  { bg: "#f0fdf4", border: "#bbf7d0", badge: "#16a34a" },
                    Monitoring:      { bg: "#f8fafc", border: "#e2e8f0", badge: "#475569" },
                  };
                  const c = kindColors[item.kind] || kindColors.Monitoring;
                  return (
                    <div key={item.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: item.detail ? 8 : 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ background: c.badge, color: "#fff", borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "3px 9px", letterSpacing: "0.03em", textTransform: "uppercase" }}>
                            {item.kind}
                          </span>
                          {item.dryRun && (
                            <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 999, fontSize: 10, fontWeight: 600, padding: "3px 9px" }}>
                              Dry run
                            </span>
                          )}
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1f2937", textTransform: "capitalize" }}>
                            {item.title}
                          </span>
                        </div>
                        <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500, flexShrink: 0 }}>
                          {item.timeLabel}
                        </span>
                      </div>
                      {item.detail ? (
                        <div style={{ fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{item.detail}</div>
                      ) : null}
                      {(item.kind === "Action Made" || item.kind === "Action") &&
                        (String(item.rawType || "").includes("action")) &&
                        (String(item.title || "").toLowerCase().includes("creative") ||
                         String(item.title || "").toLowerCase().includes("variant") ||
                         String(item.title || "").toLowerCase().includes("challenger") ||
                         String(item.title || "").toLowerCase().includes("promote")) && (
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                            Open the A/B Test tab to compare the original ad against the AI challenger.
                          </div>
                          {typeof onViewABTest === "function" && (
                            <button
                              type="button"
                              onClick={onViewABTest}
                              style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}
                            >
                              View A/B Test →
                            </button>
                          )}
                        </div>
                      )}
                      {item.dryRun && (
                        <div style={{ fontSize: 11, color: "#92400e", fontWeight: 500, marginTop: 6, fontStyle: "italic" }}>
                          Dry run — no live campaign change made
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 16, fontSize: 11, color: "#d1d5db", textAlign: "center" }}>
              {_aiHistoryRaw.length > 0
                ? `Showing ${filteredHistory.length} of ${_aiHistoryRaw.length} logged entries.`
                : "History builds as the optimizer cycle runs. Daily reports are generated once per day."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PendingCreativeTestCard({
  optimizerCreativeState,
  originalImages = [],
  onOpenImage,
}) {
  const [showModal, setShowModal] = useState(false);

  const generatedCreatives = Array.isArray(optimizerCreativeState?.generatedCreatives)
    ? optimizerCreativeState.generatedCreatives
    : [];

  const pending = optimizerCreativeState?.pendingCreativeTest || null;

  const currentImages = (originalImages || []).map(toAbsoluteMedia).filter(Boolean);
  const aiImages = generatedCreatives.map((x) => x.url).map(toAbsoluteMedia).filter(Boolean);

  if (!currentImages.length && !aiImages.length) return null;

  const status = String(pending?.status || "generated").trim().toLowerCase();

  const statusLabel =
    status === "live"
      ? "A/B testing in progress"
      : status === "ready"
      ? "AI preparing next move"
      : status === "resolved"
      ? "Latest test resolved"
      : "Creative monitoring";

  return (
    <>
      <div
        style={{
          width: "100%",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                color: "#0f172a",
                fontWeight: 900,
                fontSize: 18,
                lineHeight: 1.2,
                marginBottom: 4,
              }}
            >
              Creative Activity
            </div>
            <div
              style={{
                color: "#64748b",
                fontWeight: 700,
                fontSize: 13,
                lineHeight: 1.5,
              }}
            >
              Smartemark keeps your ad visuals here and updates this area when AI starts testing.
            </div>
          </div>

          <div
            style={{
              padding: "7px 11px",
              borderRadius: 999,
              background: "#eef2ff",
              color: "#4f46e5",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {statusLabel}
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13, lineHeight: 1.6 }}>
            {status === "live"
              ? "AI is actively comparing creative performance."
              : status === "ready"
              ? "AI has a new creative direction ready."
              : "Your current campaign visuals are stored here."}
          </div>

          <button
            type="button"
            onClick={() => setShowModal(true)}
            style={{
              background: "#f8fafc",
              color: "#0f172a",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 900,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            View creatives
          </button>
        </div>
      </div>

      {showModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1008,
            background: "rgba(15,23,42,0.40)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(980px, 96vw)",
              maxHeight: "88vh",
              overflowY: "auto",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 22,
              boxShadow: "0 30px 80px rgba(15,23,42,0.18)",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 22 }}>
                  Creative Library
                </div>
                <div
                  style={{
                    color: "#64748b",
                    fontWeight: 700,
                    fontSize: 13,
                    marginTop: 4,
                  }}
                >
                  Current visuals and any AI updates for this campaign.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: "#f8fafc",
                  color: "#0f172a",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "9px 14px",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {!!currentImages.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 15 }}>
                  Current Creatives
                </div>
                <CreativeThumbGrid
                  items={currentImages}
                  labels={currentImages.map((_, idx) =>
                    currentImages.length === 1 ? "Creative" : `Creative ${idx + 1}`
                  )}
                  onOpen={(url) => onOpenImage && onOpenImage(url)}
                  height={190}
                />
              </div>
            )}

            {!!aiImages.length && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 15 }}>
                  AI Updates
                </div>
                <CreativeThumbGrid
                  items={aiImages}
                  labels={aiImages.map((_, idx) => `AI Creative ${idx + 1}`)}
                  onOpen={(url) => onOpenImage && onOpenImage(url)}
                  height={190}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
/* ======================================================================= */
/* ============================== MAIN =================================== */
/* ======================================================================= */



function dataUrlToBlob(dataUrl) {
  const s = String(dataUrl || "");
  const match = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadImageToMedia(dataUrl, idx = 0) {
  const blob = dataUrlToBlob(dataUrl);
  if (!blob) return "";

  const ext = blob.type.includes("png") ? "png" : blob.type.includes("webp") ? "webp" : "jpg";
  const filename = `launch-${Date.now()}-${idx}.${ext}`;

  const fd = new FormData();
  // Most multer setups expect "file"
  fd.append("file", blob, filename);

  const endpoints = [
    `${MEDIA_ORIGIN}/api/media/upload`,
    `${MEDIA_ORIGIN}/api/media`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, { method: "POST", body: fd });
      const text = await r.text().catch(() => "");
      if (!r.ok) continue;

      // Try JSON first
      let j = null;
      try { j = text ? JSON.parse(text) : null; } catch { j = null; }

      // Common response shapes
      const candidate =
        (j && (j.url || j.path || j.location || j.fileUrl)) ||
        (j && j.data && (j.data.url || j.data.path)) ||
        "";

      // If backend returns "/api/media/xxx.png" in plain text
      const fromText =
        String(text || "").match(/\/api\/media\/[^\s"'<>]+/i)?.[0] || "";

      const finalPath = candidate || fromText;
      if (!finalPath) continue;

      return toAbsoluteMedia(finalPath);
    } catch {
      // try next endpoint
    }
  }

  return "";
}

async function ensureFetchableUrls(candidates, max = 2) {
  const dedupe = (arr) => {
    const seen = new Set();
    const out = [];
    for (const u of arr || []) {
      const s = String(u || "").trim();
      if (!s) continue;
      if (seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  };

  const arr = dedupe(candidates)
    .map((u) => String(u || "").trim())
    .filter(Boolean);

  const fetchable0 = [];
  const dataUrls = [];

  for (const u of arr) {
    if (isDataImage(u)) {
      dataUrls.push(u);
    } else {
      const abs = toAbsoluteMedia(u);
      if (abs && !isDataImage(abs)) fetchable0.push(abs);
    }
  }

  // ✅ CRITICAL CHANGE:
  // If we have data:image creatives, ALWAYS upload them first and prefer them.
  // This prevents stale cached fetchable URLs from "winning" and causing 404s.
  let fetchable = [];

  if (dataUrls.length) {
    try {
      const uploaded = await uploadDataUrlsToMedia(dataUrls.slice(0, max));
      fetchable = dedupe(fetchable.concat(uploaded));
    } catch {
      // if upload fails, we'll fall back to any existing fetchables below
    }
  }

  // Fill remaining slots with existing fetchable URLs (if needed)
  if (fetchable.length < max) {
    fetchable = dedupe(fetchable.concat(fetchable0)).slice(0, max);
  }

  return fetchable
    .map(toAbsoluteMedia)
    .filter((u) => u && !isDataImage(u) && !/^blob:/i.test(u))
    .slice(0, max);
}

function getPublicSummaryFromOptimizerState(optimizerState) {
  const ps = optimizerState?.publicSummary || null;
  if (!ps) return null;

  return {
    headline: String(ps.headline || "").trim(),
    subtext: String(ps.subtext || "").trim(),
    stage: String(ps.stage || "").trim(),
    tone: String(ps.tone || "").trim(),
    actions: Array.isArray(ps.actions)
      ? ps.actions.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 3)
      : [],
    updatedAt: String(ps.updatedAt || "").trim(),
    mode: String(ps.mode || "").trim(),
  };
}

function getFallbackPublicSummary() {
  return {
    headline: "Continue monitoring",
    subtext:
      "Smartemark is reviewing delivery, click volume, and creative performance before making the next move.",
    stage: "monitoring",
    tone: "calm",
    actions: [],
    updatedAt: new Date().toISOString(),
    mode: "public_marketer_summary_fallback_v1",
  };
}

function getOptimizerCreativeStateFromOptimizerState(optimizerState) {
  const generatedCreatives = Array.isArray(optimizerState?.generatedCreatives)
    ? optimizerState.generatedCreatives
        .map((x) => ({
          id: String(x?.id || "").trim(),
          url: toAbsoluteMedia(x?.url || x?.imageUrl || ""),
          headline: String(x?.headline || "").trim(),
          body: String(x?.body || "").trim(),
          status: String(x?.status || "generated").trim(),
          sourceActionType: String(x?.sourceActionType || "").trim(),
          goal: String(x?.goal || "").trim(),
          createdAt: String(x?.createdAt || "").trim(),
        }))
        .filter((x) => x.url)
    : [];

  const pendingCreativeTest =
    optimizerState?.pendingCreativeTest &&
    typeof optimizerState.pendingCreativeTest === "object"
      ? {
          status: String(optimizerState.pendingCreativeTest.status || "").trim(),
          sourceActionType: String(
            optimizerState.pendingCreativeTest.sourceActionType || ""
          ).trim(),
          variantCount: Number(optimizerState.pendingCreativeTest.variantCount || 0),
          creativeGoal: String(
            optimizerState.pendingCreativeTest.creativeGoal || ""
          ).trim(),
          generatedAt: String(
            optimizerState.pendingCreativeTest.generatedAt || ""
          ).trim(),
        }
      : null;

  return {
    generatedCreatives,
    pendingCreativeTest,
  };
}



// ─────────────────────────────────────────────────────────────────────────────
// Creative A/B Test Panel
// Shows original ad vs AI challenger when a pendingCreativeTest exists.
// ─────────────────────────────────────────────────────────────────────────────
function CreativeABTestPanel({ optimizerState, campaignId, accountId, adminClientId, isMobile, campaignCreatives, campaignName, onChallengerRemoved }) {
  const [testMetrics, setTestMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsError, setMetricsError] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [removeSuccess, setRemoveSuccess] = useState(false);

  const pending = optimizerState?.pendingCreativeTest || null;
  const pendingStatus = String(pending?.status || "").trim().toLowerCase();
  const isLive = pendingStatus === "live";
  const isStaged = pendingStatus === "staged";
  const isReady = pendingStatus === "ready";

  const controlAdIds = Array.isArray(pending?.controlAdIds) ? pending.controlAdIds.filter(Boolean) : [];
  const candidateAdIds = Array.isArray(pending?.candidateAdIds) ? pending.candidateAdIds.filter(Boolean) : [];
  const hasLiveAds = (isLive || isStaged) && (controlAdIds.length > 0 || candidateAdIds.length > 0);

  useEffect(() => {
    if (!hasLiveAds || !campaignId) return;
    let cancelled = false;
    setMetricsLoading(true);
    setMetricsError(null);
    const url = adminClientId
      ? `/api/admin/clients/${encodeURIComponent(adminClientId)}/creative-test-metrics?campaignId=${encodeURIComponent(campaignId)}`
      : `/auth/facebook/adaccount/act_${encodeURIComponent(accountId || "")}/campaign/${encodeURIComponent(campaignId)}/creative-test-metrics`;
    fetch(url, { credentials: "include" })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => {
        if (!cancelled) {
          if (j.ok) setTestMetrics(j);
          else setMetricsError(j.error || "Could not load per-ad metrics.");
        }
      })
      .catch((e) => { if (!cancelled) setMetricsError(e.message); })
      .finally(() => { if (!cancelled) setMetricsLoading(false); });
    return () => { cancelled = true; };
  }, [hasLiveAds, campaignId, accountId, adminClientId]);

  const controlBody = String(
    optimizerState?.currentPrimaryText ||
    optimizerState?.businessBrief?.originalPrimaryText ||
    optimizerState?.businessBrief?.originalBody ||
    optimizerState?.latestCreativeMeta?.body ||
    campaignCreatives?.meta?.body || ""
  ).trim();

  const controlHeadline = String(
    optimizerState?.currentHeadline ||
    optimizerState?.businessBrief?.headline ||
    campaignCreatives?.meta?.headline || ""
  ).trim();

  const controlImageUrl = toAbsoluteMedia(campaignCreatives?.images?.[0] || "");
  const challengerImageUrl = toAbsoluteMedia(
    (Array.isArray(pending?.imageUrls) ? pending.imageUrls[0] : "") || ""
  );

  const creativeGoal = String(pending?.creativeGoal || "").trim();
  const generationReason = String(pending?.generationReason || "").trim();
  const startedAt = String(pending?.startedAt || "").trim();

  const originalMetrics = testMetrics?.original || null;
  const challengerMetrics = testMetrics?.challenger || null;
  const currentWinner = optimizerState?.currentWinner || testMetrics?.currentWinner || null;

  const getConclusion = () => {
    if (currentWinner) {
      return { text: `Winner selected: ${currentWinner === "challenger" ? "AI challenger" : "Original ad"}`, color: "#16a34a" };
    }
    if (!pending) return { text: "No test active.", color: "#475569" };
    if (isReady || (!isLive && !isStaged)) {
      return { text: "Test pending launch — challenger creative is ready but not yet live in Meta.", color: "#b45309" };
    }
    const oImpr = Number(originalMetrics?.impressions || 0);
    const cImpr = Number(challengerMetrics?.impressions || 0);
    const oCtr = Number(originalMetrics?.ctr || 0);
    const cCtr = Number(challengerMetrics?.ctr || 0);
    if (oImpr < 500 || cImpr < 500) {
      return { text: `Waiting for more data — need 500+ impressions per ad to compare. (Original: ${oImpr.toLocaleString()}, Challenger: ${cImpr.toLocaleString()})`, color: "#475569" };
    }
    if (cCtr >= oCtr * 1.2) {
      return { text: `Challenger currently leading — AI creative CTR (${cCtr.toFixed(2)}%) is ahead of original (${oCtr.toFixed(2)}%).`, color: "#1d4ed8" };
    }
    if (oCtr >= cCtr * 1.2) {
      return { text: `Original currently leading — original CTR (${oCtr.toFixed(2)}%) is ahead of challenger (${cCtr.toFixed(2)}%).`, color: "#475569" };
    }
    return { text: "Performance is close — gathering more signal before calling a direction.", color: "#475569" };
  };
  const conclusion = getConclusion();

  const fmt = (v) => (v != null ? Number(v).toLocaleString() : "—");
  const fmtCtr = (v) => (v != null ? `${Number(v).toFixed(2)}%` : "—");
  const fmtMoney = (v) => (v != null ? `$${Number(v).toFixed(2)}` : "—");

  const MetricRow = ({ label, value }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{value}</span>
    </div>
  );

  const AdCard = ({ title, badge, accentColor, imageUrl, headline, body, metrics, adIds, isPlaceholder, placeholderNote }) => (
    <div style={{
      background: "#fff",
      border: `1px solid ${accentColor}`,
      borderRadius: 16,
      padding: 18,
      flex: 1,
      minWidth: 0,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{title}</span>
        {badge && (
          <span style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, borderRadius: 999, fontSize: 10, fontWeight: 700, padding: "2px 8px" }}>
            {badge.label}
          </span>
        )}
      </div>

      {imageUrl ? (
        <img src={imageUrl} alt={`${title} creative`} style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 10, border: "1px solid #e2e8f0" }} />
      ) : (
        <div style={{ height: 100, background: "#f8fafc", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12, border: "1px dashed #e2e8f0" }}>
          {isPlaceholder ? "Creative pending" : "No image stored"}
        </div>
      )}

      {headline && <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", lineHeight: 1.4 }}>{headline}</div>}
      {body && <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.55, maxHeight: 72, overflow: "hidden" }}>{body}</div>}
      {placeholderNote && (
        <div style={{ fontSize: 12, color: "#64748b", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 10px", lineHeight: 1.5 }}>
          {placeholderNote}
        </div>
      )}

      {metricsLoading && <div style={{ fontSize: 12, color: "#94a3b8" }}>Loading metrics…</div>}
      {!metricsLoading && metrics && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <MetricRow label="Impressions" value={fmt(metrics.impressions)} />
          <MetricRow label="Clicks" value={fmt(metrics.clicks)} />
          <MetricRow label="CTR" value={fmtCtr(metrics.ctr)} />
          <MetricRow label="Spend" value={fmtMoney(metrics.spend)} />
          <MetricRow label="CPC" value={fmtMoney(metrics.cpc)} />
          {metrics.conversions > 0 && <MetricRow label="Conversions" value={fmt(metrics.conversions)} />}
          {metrics.status && <MetricRow label="Status" value={metrics.status} />}
        </div>
      )}
      {!metricsLoading && !metrics && hasLiveAds && !metricsError && (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>No per-ad metrics returned from Meta yet.</div>
      )}

      {adIds && adIds.length > 0 && (
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: "auto", paddingTop: 4 }}>Ad ID: {adIds[0]}</div>
      )}
    </div>
  );

  const handleRemoveChallenger = async () => {
    if (!campaignId) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const r = await fetch("/api/ad-agent/remove-challenger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ campaignId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) {
        setRemoveError(j.error || "Could not remove challenger. Try again.");
      } else {
        setRemoveSuccess(true);
        setRemoveConfirm(false);
        if (onChallengerRemoved) onChallengerRemoved();
      }
    } catch (e) {
      setRemoveError(e.message || "Network error.");
    } finally {
      setRemoving(false);
    }
  };

  const panelTitle = campaignName ? `Creative A/B Test for ${campaignName}` : "A/B Test";

  if (!campaignId || campaignId === "__DRAFT__") {
    return (
      <div style={{ padding: isMobile ? 16 : 0, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ color: "#111827", fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>{panelTitle}</div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 40, textAlign: "center", color: "#64748b", fontSize: 14, fontWeight: 600 }}>
          Select a campaign to view A/B test data.
        </div>
      </div>
    );
  }

  if (!pending) {
    return (
      <div style={{ padding: isMobile ? 16 : 0, display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>{panelTitle}</div>
          <div style={{ color: "#667085", fontWeight: 600, fontSize: 14, lineHeight: 1.6 }}>
            Original ad vs AI challenger performance.
          </div>
        </div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 18, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>🧪</div>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0f172a", marginBottom: 8 }}>No A/B test active yet</div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.7, maxWidth: 420, margin: "0 auto" }}>
            When Smartemark creates a challenger creative, it will appear here. You'll see the original and AI-generated ad side-by-side with live impressions, CTR, spend, and CPC so you can judge whether the optimizer is improving performance.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? 16 : 0, display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 22, lineHeight: 1.1 }}>{panelTitle}</div>
          <span style={{
            background: isLive ? "#dcfce7" : isStaged ? "#fef9c3" : "#f1f5f9",
            color: isLive ? "#16a34a" : isStaged ? "#b45309" : "#475569",
            border: `1px solid ${isLive ? "#bbf7d0" : isStaged ? "#fde68a" : "#e2e8f0"}`,
            borderRadius: 999, fontSize: 11, fontWeight: 700, padding: "3px 10px",
          }}>
            {isLive ? "Live" : isStaged ? "Staged (paused)" : isReady ? "Ready to launch" : "Pending"}
          </span>
        </div>
        <div style={{ color: "#667085", fontWeight: 600, fontSize: 14, lineHeight: 1.5 }}>
          Original ad vs AI challenger{startedAt ? ` · Test started ${new Date(startedAt).toLocaleDateString()}` : ""}
        </div>
        {(generationReason || creativeGoal) && (
          <div style={{ background: "#f5f3ff", border: "1px solid #e9d5ff", borderRadius: 10, padding: "8px 14px", fontSize: 12, color: "#7c3aed", fontWeight: 600, display: "inline-block", alignSelf: "flex-start" }}>
            Why this test: {generationReason || creativeGoal}
          </div>
        )}
      </div>

      {/* Two-card layout */}
      <div style={{ display: "flex", gap: 16, flexDirection: isMobile ? "column" : "row", alignItems: "flex-start" }}>
        <AdCard
          title="Original Ad"
          badge={null}
          accentColor="rgba(93,89,234,0.16)"
          imageUrl={testMetrics?.original?.thumbnailUrl ? toAbsoluteMedia(testMetrics.original.thumbnailUrl) : controlImageUrl}
          headline={testMetrics?.original?.headline || controlHeadline}
          body={testMetrics?.original?.body || controlBody}
          metrics={originalMetrics}
          adIds={controlAdIds}
          isPlaceholder={false}
        />
        <AdCard
          title="AI Challenger"
          badge={{ label: "AI Generated", bg: "#f0fdf4", color: "#16a34a", border: "#bbf7d0" }}
          accentColor="rgba(22,163,74,0.18)"
          imageUrl={testMetrics?.challenger?.thumbnailUrl ? toAbsoluteMedia(testMetrics.challenger.thumbnailUrl) : challengerImageUrl}
          headline={testMetrics?.challenger?.headline || controlHeadline}
          body={testMetrics?.challenger?.body || (controlBody ? "Same messaging as original — challenger tests a new visual." : "")}
          metrics={challengerMetrics}
          adIds={candidateAdIds}
          isPlaceholder={isReady}
          placeholderNote={isReady ? "Challenger creative is staged and ready. It will be promoted to Meta on the next optimizer cycle." : null}
        />
      </div>

      {/* Metrics error */}
      {metricsError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "10px 14px", fontSize: 12, color: "#dc2626" }}>
          Could not load per-ad metrics: {metricsError}
        </div>
      )}

      {/* Conclusion */}
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: "16px 20px" }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: "#64748b", marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>Conclusion</div>
        <div style={{ fontWeight: 700, fontSize: 15, color: conclusion.color, lineHeight: 1.5 }}>{conclusion.text}</div>
        {hasLiveAds && (
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, lineHeight: 1.6 }}>
            Smartemark compares CTR and spend efficiency after 500+ impressions per ad before recommending a winner. Winner declaration is automatic once clear signal emerges.
          </div>
        )}
      </div>

      {/* Budget note */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#1d4ed8", lineHeight: 1.6 }}>
        <strong>Budget sharing:</strong> Budget is shared inside the same ad set. Meta may give more delivery to the ad it predicts will perform better. Smartemark compares performance after enough impressions accumulate before declaring a winner.
      </div>

      {/* Remove Challenger */}
      {!removeSuccess && (
        <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
          {!removeConfirm ? (
            <button
              onClick={() => setRemoveConfirm(true)}
              style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#dc2626", fontWeight: 700, cursor: "pointer" }}
            >
              Remove Challenger
            </button>
          ) : (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: "#dc2626" }}>Remove AI Challenger?</div>
              <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.6 }}>
                This will pause the AI challenger ad on Meta and clear the current test. Your original ad stays live and untouched. You can ask the Ad Agent to generate a new challenger any time.
              </div>
              {removeError && (
                <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 600 }}>{removeError}</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={handleRemoveChallenger}
                  disabled={removing}
                  style={{ background: "#dc2626", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 12, color: "#fff", fontWeight: 700, cursor: removing ? "not-allowed" : "pointer", opacity: removing ? 0.7 : 1 }}
                >
                  {removing ? "Removing…" : "Yes, Remove"}
                </button>
                <button
                  onClick={() => { setRemoveConfirm(false); setRemoveError(null); }}
                  disabled={removing}
                  style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 12, color: "#475569", fontWeight: 600, cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {removeSuccess && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#16a34a", fontWeight: 700 }}>
          AI challenger removed. Your original ad is the only active ad. Ask the Ad Agent to generate a new challenger when ready.
        </div>
      )}
    </div>
  );
}

const CampaignSetup = () => {

// ✅ HOTFIX: rewrite ANY /api/auth/* or /auth/* calls to SAME-ORIGIN /auth/*
// (covers string URLs, Request objects, and absolute URLs)
useEffect(() => {
  const origFetch = window.fetch;

  window.fetch = (input, init) => {
    try {
      const rawUrl = typeof input === "string" ? input : (input?.url || "");
      if (rawUrl) {
        const u = new URL(rawUrl, window.location.origin);

        const isAppOrigin = u.origin === window.location.origin;
        const isAuthPath =
          /^\/api\/auth\//i.test(u.pathname) || /^\/auth\//i.test(u.pathname);

        if (isAppOrigin && isAuthPath) {
          const rel =
            /^\/api\/auth\//i.test(u.pathname)
              ? `/auth${u.pathname.replace(/^\/api\/auth/i, "")}${u.search || ""}`
              : `/auth${u.pathname.replace(/^\/auth/i, "")}${u.search || ""}`;

          return origFetch(rel, { ...(init || {}), credentials: "include" });
        }
      }
    } catch {}

    return origFetch(input, init);
  };

  return () => {
    window.fetch = origFetch;
  };
  // eslint-disable-next-line
}, []);




  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const onErr = (e) =>
      smLog("window.error", {
        message: e?.message,
        src: e?.filename,
        line: e?.lineno,
        col: e?.colno,
      });

    const onRej = (e) => smLog("unhandledrejection", { reason: String(e?.reason || "") });

    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);

    smLog("setup.mount", { href: window.location.href, state: location.state || null });
    console.debug("[SETUP ADMIN DEBUG]", {
      search: location.search,
      adminClientId: new URLSearchParams(location.search || "").get("adminClientId") || "",
      stateAdminClientId: location.state?.adminClientId || "",
      ctxKey: location.state?.ctxKey || "",
      answersUrl: location.state?.answers?.url || "",
    });
    smLog(
      "setup.mount.snapshot",
      smDumpDraftSnapshot({
        FORM_DRAFT_KEY,
        CREATIVE_DRAFT_KEY,
        FB_CONNECT_INFLIGHT_KEY,
        ACTIVE_CTX_KEY,
      })
    );

    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
    };
    // eslint-disable-next-line
  }, []);

  // ✅ Bootstrap ctxKey early (on first render + on OAuth return)
  // Also open AI Agent tab if ?tab=ai-agent is in the URL
  useEffect(() => {
    const qs = new URLSearchParams(location.search || "");
    const ctxFromState = (location.state?.ctxKey ? String(location.state.ctxKey) : "").trim();
    const ctxFromUrl = (qs.get("ctxKey") || "").trim();

    const user = getUserFromStorage();
    const active = (getActiveCtx(user) || "").trim();

    if (ctxFromState) setActiveCtx(ctxFromState, user);
    else if (ctxFromUrl) setActiveCtx(ctxFromUrl, user);
    else if (!active) setActiveCtx(`${Date.now()}|||setup`, user);

    // Open AI Agent tab when ?tab=ai-agent is present in URL
    const tabParam = (qs.get("tab") || "").trim().toLowerCase();
    if (tabParam === "ai-agent") setSetupTab("ai-agent");
  }, [location.search]);

// ✅ If a campaign was launched successfully, never show leftover "Untitled / IN PROGRESS"
useEffect(() => {
  if (!isDraftDisabledLegacy()) return;

  // wipe any remaining draft artifacts so they can't rehydrate
  purgeDraftArtifactsEverywhere();

  // hard-reset the draft UI immediately (no dependency on setCampaigns existing)
  setDraftCreatives({ images: [], mediaSelection: "image" });

  // if UI was still pointing at draft, detach it
  setExpandedId((prev) => (prev === "__DRAFT__" ? null : prev));
  setSelectedCampaignId((prev) => (prev === "__DRAFT__" ? "" : prev));
}, []);



 // ✅ use username if available, otherwise fall back to sid so storage keys stay consistent
const stableSid = useMemo(() => ensureStoredSid(), []);
const resolvedUser = useMemo(() => getUserFromStorage() || stableSid, [stableSid]);


  const [form, setForm] = useState(() => {
    try {
      return JSON.parse(lsGet(resolvedUser, "smartmark_last_campaign_fields") || "{}") || {};
    } catch {
      return {};
    }
  });

  const copyCashTag = async () => {
    try {
      await navigator.clipboard.writeText(CASHAPP_TAG);
      alert(`Copied: ${CASHAPP_TAG}`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = CASHAPP_TAG;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      alert(`Copied: ${CASHAPP_TAG}`);
    }
  };

  const [budget, setBudget] = useState(() => lsGet(resolvedUser, "smartmark_last_budget") || "");

const [selectedPlan, setSelectedPlan] = useState(() => {
  return (
    String(location.state?.selectedPlan || "").trim().toLowerCase() ||
    String(localStorage.getItem("sm_selected_plan") || "").trim().toLowerCase() ||
    "starter"
  );
});

useEffect(() => {
  const nextPlan =
    String(location.state?.selectedPlan || "").trim().toLowerCase() ||
    String(localStorage.getItem("sm_selected_plan") || "").trim().toLowerCase() ||
    "starter";

  setSelectedPlan(nextPlan);
  localStorage.setItem("sm_selected_plan", nextPlan);

  if (location.state?.loginUser) {
    setLoginUser(String(location.state.loginUser || "").trim().toLowerCase());
  }

  if (location.state?.loginPass) {
    setLoginPass(String(location.state.loginPass || ""));
  }
  // eslint-disable-next-line
}, [location.state]);

const [billingLoading, setBillingLoading] = useState(false);
const [billingInfo, setBillingInfo] = useState({
  checked: false,
  hasAccess: false,
  planKey: "",
  status: "",
  email: "",
  username: "",
  monthlyPrice: 0,
});

// ✅ Email -> backend-username map (so changing username field never breaks login)
const EMAIL_USER_MAP_KEY = "sm_email_user_map_v1";

function emailKey(e) {
  return String(e || "").trim().toLowerCase();
}

function readEmailUserMap() {
  try {
    const raw = localStorage.getItem(EMAIL_USER_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeEmailUserMap(map) {
  try {
    localStorage.setItem(EMAIL_USER_MAP_KEY, JSON.stringify(map || {}));
  } catch {}
}



  /* ===================== LOGIN (simple + works) ===================== */
  const [loginUser, setLoginUser] = useState(() => lsGet(resolvedUser, "smartmark_login_username") || "");
  const [loginPass, setLoginPass] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState({ ok: false, msg: "" });


useEffect(() => {
  const v = String(loginUser || "").trim();
  if (!v) return; // ✅ don't overwrite with blank
  lsSet(resolvedUser, "smartmark_login_username", v, true);
}, [loginUser, resolvedUser]);



function normalizeUsername(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // ✅ strip leading $ only, do NOT force lowercase
  return s.replace(/^\$/, "");
}




const handleLogin = async () => {
  const email = String(loginUser || "").trim().toLowerCase();
  const password = String(loginPass || "").trim();

  if (!email || !password) {
    setAuthStatus({ ok: false, msg: "Enter email + password." });
    return false;
  }

  const postAuth = async (path) => {
    const r = await authFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: email,
        email,
        password,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };

  setAuthLoading(true);
  setAuthStatus({ ok: false, msg: "Logging in..." });

  try {
    // ✅ LOGIN ONLY. Do not silently register on failed login.
    const out = await postAuth(`/login`);

    if (!out.r.ok || !out.j?.success) {
      throw new Error(out.j?.error || "Invalid email or password.");
    }

    const successUser = String(out.j?.user?.username || email).trim();

    try {
      localStorage.setItem("sm_current_user", successUser);
      localStorage.setItem("smartmark_login_username", email);
    } catch {}

    setAuthStatus({ ok: true, msg: "Logged in ✅" });
    return true;
  } catch (e) {
    setAuthStatus({
      ok: false,
      msg: e?.message || "Invalid email or password.",
    });
    return false;
  } finally {
    setAuthLoading(false);
  }
};


  // IMPORTANT: normalize stored account ID — digits only, no "act_" prefix.
  // When a logged-in user is known, only read their own namespaced key.
  // Never fall back to the bare (non-namespaced) key for logged-in users:
  // that key may hold a value from a previous user or admin-client session.
  const [selectedAccount, setSelectedAccount] = useState(() => {
    const loggedInUser = getUserFromStorage();
    if (loggedInUser) {
      const v = (localStorage.getItem(withUser(loggedInUser, "smartmark_last_selected_account")) || "").trim();
      return String(v).replace(/^act_/, "");
    }
    // Anonymous session: safe to use full lsGet with legacy fallbacks
    const v = (lsGet(resolvedUser, "smartmark_last_selected_account") || "").trim();
    return String(v).replace(/^act_/, "");
  });

  const [selectedPageId, setSelectedPageId] = useState(() => {
    const loggedInUser = getUserFromStorage();
    if (loggedInUser) {
      return localStorage.getItem(withUser(loggedInUser, "smartmark_last_selected_pageId")) || "";
    }
    return lsGet(resolvedUser, "smartmark_last_selected_pageId") || "";
  });

  const [fbConnected, setFbConnected] = useState(() => {
    const conn = localStorage.getItem(FB_CONN_KEY);
    if (conn) {
      const { connected, time } = JSON.parse(conn);
      if (connected && Date.now() - time < FB_CONN_MAX_AGE) return true;
      localStorage.removeItem(FB_CONN_KEY);
      return false;
    }
    return false;
  });

  const [cameFromFbConnect, setCameFromFbConnect] = useState(false);

  const touchFbConn = () => {
    try {
      localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
    } catch {}
  };

useEffect(() => {
  let cancelled = false;

  const safeParse = (raw) => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const saved = safeParse(localStorage.getItem(FB_CONN_KEY));

  if (!saved?.connected) return;

  const expired = !saved.time || (Date.now() - Number(saved.time) > FB_CONN_MAX_AGE);

  if (expired) {
    localStorage.removeItem(FB_CONN_KEY);
    if (!cancelled) setFbConnected(false);
    return;
  }

  // ✅ ONLY set connected based on stored flag (no early fetch = no draft race)
  if (!cancelled) setFbConnected(true);

  return () => {
    cancelled = true;
  };
}, []);

// Server-side FB token verification.
// Rules (in priority order):
//   1. Only set fbConnected → false when the server EXPLICITLY returns
//      { tokenPresent: true, expired: true } — i.e. a token exists but is past
//      its expiry timestamp. Any other non-connected response is treated as
//      "inconclusive" and the local connected state is preserved.
//   2. A fetch failure, empty response, or { connected: false } without
//      tokenPresent:true+expired:true MUST NOT disconnect the user.
//   3. If the server says connected:true, repair localStorage and confirm
//      the connected state.
useEffect(() => {
  let cancelled = false;

  // Only show "checking" banner if we don't already know we're connected locally.
  // This prevents the "Connected → Checking → Connected" flicker for returning users.
  if (!fbConnected) setFbConnectionStatus("checking");

  console.debug("[FB Context]", { adminClientId, resolvedUser, fbSelectionScope });

  authFetch('/facebook/status')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (cancelled) return;

      console.debug('[FB Status]', data);

      if (!data) {
        // Non-ok HTTP response or parse failure — treat as inconclusive, never disconnect.
        if (!cancelled) setFbConnectionStatus(fbConnected ? "connected" : "error");
        return;
      }

      // ── Definitively expired: server found the token AND it is past expiresAt ──
      if (data.tokenPresent === true && data.expired === true) {
        try { localStorage.removeItem(FB_CONN_KEY); } catch {}
        if (!cancelled) {
          setFbConnected(false);
          setFbExpired(true);
          setFbConnectionStatus("expired");
        }
        return;
      }

      // ── Server confirms token is valid ──
      if (data.connected === true) {
        try {
          const raw = localStorage.getItem(FB_CONN_KEY);
          if (!raw) localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
        } catch {}
        if (!cancelled) {
          setFbExpired(false);
          setFbConnectionStatus("connected");
          setFbConnected(true);
        }
        return;
      }

      // ── Server definitively says no token for this ownerKey ──
      // tokenPresent:false + !error means the db was read and no token was found.
      // This clears stale FB_CONN_KEY flags that were set by a previous admin-client
      // connection (e.g. TheBoss connected Max's account, then opened clean /setup).
      if (data.tokenPresent === false && !data.error) {
        try { localStorage.removeItem(FB_CONN_KEY); } catch {}
        if (!cancelled) {
          setFbConnected(false);
          setFbExpired(false);
          setFbConnectionStatus("not_connected");
          console.debug("[FB State Cleared - wrong context]", {
            reason: "server returned tokenPresent:false — no token for this ownerKey",
            adminClientId,
            selectedAccount,
            selectedPageId,
          });
        }
        return;
      }

      // ── Inconclusive (server error, transient network, etc.) — keep current state ──
      if (!cancelled) {
        if (fbConnected) {
          setFbConnectionStatus("connected");
        } else {
          setFbConnectionStatus("not_connected");
        }
      }
    })
    .catch(() => {
      // Network error / fetch failure — never disconnect on this.
      if (!cancelled) {
        console.debug('[FB Status] fetch error — keeping existing state');
        setFbConnectionStatus(fbConnected ? "connected" : "error");
      }
    });

  return () => { cancelled = true; };
  // eslint-disable-next-line
}, []);



  const [adAccounts, setAdAccounts] = useState([]);
  const [fbExpired, setFbExpired] = useState(false);
  // "checking" | "connected" | "expired" | "not_connected" | "error"
  // Initialised to "connected" when localStorage already says connected so the
  // first render never shows "Checking…" for a returning user.
  const [facebookConnectionStatus, setFbConnectionStatus] = useState(() => {
    try {
      const raw = localStorage.getItem(FB_CONN_KEY);
      if (!raw) return "not_connected";
      const { connected, time } = JSON.parse(raw);
      if (connected && time && Date.now() - Number(time) < FB_CONN_MAX_AGE) return "connected";
    } catch {}
    return "not_connected";
  });
  const [metaDraft, setMetaDraft] = useState(null);
  const [draftCreatingState, setDraftCreatingState] = useState(null);
  const [draftError, setDraftError] = useState(null);

  const defaultStart = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    return d;
  }, []);

  const [pages, setPages] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metricsMap, setMetricsMap] = useState({});
  const [publicSummaryMap, setPublicSummaryMap] = useState({});
  const [campaignCreativesMap, setCampaignCreativesMap] = useState({});
  const [optimizerCreativeMap, setOptimizerCreativeMap] = useState({});
  const [optimizerStateMap, setOptimizerStateMap] = useState({});
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setCampaignStatus] = useState("ACTIVE");
  const [campaignCount, setCampaignCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [setupTab, setSetupTab] = useState("connect");
  const [campaignSubtab, setCampaignSubtab] = useState("overview");

  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

  const [showCampaignMenu, setShowCampaignMenu] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  // null | campaignId — when set, the 3-dot menu shows an inline "Delete / Stop Campaign" confirm
  const [archiveMetaConfirmId, setArchiveMetaConfirmId] = useState(null);
  // AI Control Settings panel
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiSettings, setAiSettings] = useState({
    aiAutopilotEnabled:    false,  // safe default: OFF
    aiApprovalRequired:    true,   // safe default: ON
    aiSettingsInitialized: false,  // false = user has never explicitly saved settings
  });
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [copyEditMode, setCopyEditMode] = useState(false);
  const [copyEditPrimaryText, setCopyEditPrimaryText] = useState("");
  const [copyEditHeadline, setCopyEditHeadline] = useState("");
  const [copyEditLoading, setCopyEditLoading] = useState(false);
  const [copyEditError, setCopyEditError] = useState(null);
  // 3-dot creative replace menu
  const [creativeMenuOpen, setCreativeMenuOpen] = useState(false);
  // null | { action: "ai_image"|"upload_photo"|"upload_video", confirmed: false }
  const [creativeReplaceConfirm, setCreativeReplaceConfirm] = useState(null);
  // Facebook disconnect
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
const [pendingLaunchAfterCheckout, setPendingLaunchAfterCheckout] = useState(false);
  const [campaignSettingsMap, setCampaignSettingsMap] = useState(() =>
    readCampaignSettingsMap(resolvedUser)
  );
  const [editCampaignForm, setEditCampaignForm] = useState({
    budget: "",
    startDate: "",
    endDate: "",
  });
  const [includeInstagram, setIncludeInstagram] = useState(false);
  // Top-level state for expanded creative card in Creatives tab multi-card section.
  // Must live here — cannot be inside an IIFE/conditional render (Rules of Hooks).
  const [expandedCreativeCardIdx, setExpandedCreativeCardIdx] = useState(null);

  const [draftCreatives, setDraftCreatives] = useState({
    images: [],
    mediaSelection: "image",
    creativeSet: null,      // [{id, angle, angleLabel, headline, body, cta, imageUrl, link, status}]
    creativeTestCount: 1,
  });

  const state = location.state || {};

  // adminClientId: URL query param is the ONLY authority for client mode.
  // Route state must never be used to enter admin-client mode — it is too easy for
  // stale state to survive navigation and silently keep TheBoss in the wrong context.
  // If the URL is clean (/setup with no ?adminClientId=), this is always TheBoss normal mode.
  const adminClientId = useMemo(() => {
    try {
      return new URLSearchParams(location.search || "").get("adminClientId") || "";
    } catch {
      return "";
    }
  }, [location.search]);

  // Route state may carry supplemental client data (business name, images, etc.)
  // but ONLY trust it when it belongs to the same client the URL identifies.
  const routeStateAdminClientId = String(state.adminClientId || "").trim();
  const routeStateMatchesClient = !!(adminClientId && routeStateAdminClientId === adminClientId);

  // adminClientBusinessName: matching route state → localStorage label
  const adminClientBusinessName = (() => {
    if (routeStateMatchesClient) {
      const fromState = String(state.adminClientBusinessName || "").trim();
      if (fromState) return fromState;
    }
    try { return localStorage.getItem("sm_admin_target_client_label") || ""; } catch {}
    return "";
  })();

  // Stable scope key for per-client localStorage isolation.
  // In admin-client mode selections are namespaced under the client email,
  // never under TheBoss's own user namespace.
  const fbSelectionScope = adminClientId ? `adminClient:${adminClientId}` : resolvedUser;

  // Clears admin client session mode and returns to the admin client list.
  // Also scrubs localStorage keys that may have been written with client data while in client mode,
  // and resets React state so the TheBoss dashboard is clean on next render.
  // Never touches sm_sid_v1 or any normal user session key.
  const exitClientMode = React.useCallback(() => {
    // Raise the guard BEFORE any state clears so the save effect can't race
    // and write the client's account/page under TheBoss's ownerKey.
    isExitingAdminClientModeRef.current = true;
    console.debug("[Exit Client Mode] clearing FB client state");

    // Remove admin mode markers
    try { localStorage.removeItem("sm_admin_target_client_id"); } catch {}
    try { localStorage.removeItem("sm_admin_target_client_label"); } catch {}

    // Remove localStorage keys that may carry client's ad account / page data.
    // Clears both the global (legacy) and TheBoss's user-scoped variants so the
    // TheBoss dashboard doesn't re-hydrate with the last client's account on next mount.
    try {
      localStorage.removeItem("smartmark_last_selected_account");
      localStorage.removeItem("smartmark_last_selected_pageId");
      localStorage.removeItem(FB_CONN_KEY);
      if (resolvedUser) {
        localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_account"));
        localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_pageId"));
      }
    } catch {}

    // Reset ALL React state so the current render is clean before navigation.
    // Covers direct state AND every derived data map populated by admin-client mode.
    setFbConnected(false);
    setAdAccounts([]);
    setPages([]);
    setSelectedAccount("");
    setSelectedPageId("");
    setCampaigns([]);
    setSelectedCampaignId("");
    setExpandedId(null);
    setAdminClientInfo(null);
    // Derived maps — must be cleared so TheBoss dashboard never shows client metrics/creatives
    setMetricsMap({});
    setOptimizerStateMap({});
    setCampaignCreativesMap({});
    setPublicSummaryMap({});
    setOptimizerCreativeMap({});
    setCampaignCount(0);
    // Creative/copy state — clear so client draft never bleeds into TheBoss normal view
    setDraftCreatives({ images: [], mediaSelection: "image" });
    setPreviewCopy({ headline: "", body: "", link: "" });
    // FB status — reset so TheBoss status re-verifies from server on next /setup load
    setFbConnectionStatus("not_connected");

    console.debug('[CampaignSetup] exitClientMode — all client-derived state cleared');
    navigate("/admin/clients");
  }, [navigate, resolvedUser]);

  // Full client detail record fetched server-side for the Account tab and badge label.
  const [adminClientInfo, setAdminClientInfo] = React.useState(null);

  const navImageUrls = Array.isArray(state.imageUrls)
    ? state.imageUrls
    : Array.isArray(state.imageVariants)
    ? state.imageVariants
    : Array.isArray(state.images)
    ? state.images
    : Array.isArray(state.urls)
    ? state.urls
    : [];

  const navVideoUrl = String(state.videoUrl || "").trim();
  const navVideoMeta = state.videoMeta || null;
  const isVideoCreative = (String(state.mediaType || state.mediaSelection || "").toLowerCase() === "video") && !!navVideoUrl;

  const headline = state.headline || "";
  const body = state.body || "";
  const answers = state.answers || {};

  // When answers came from FormPage route state (any key populated), trust answers.url
  // as the single source of truth. Only fall back to form/localStorage values when
  // route state was lost — those may be stale data from a previous client or session.
  const _answersFromState = Object.keys(answers || {}).length > 0;
  const inferredLink = _answersFromState
    ? (answers?.url || answers?.websiteUrl || answers?.website || answers?.link || "")
        .toString().trim()
    : (
        state.websiteUrl ||
        form?.websiteUrl ||
        form?.website ||
        answers?.url ||
        answers?.websiteUrl ||
        answers?.link ||
        ""
      ).toString().trim();

  const [previewCopy, setPreviewCopy] = useState(() => {
    const fromState = {
      headline: headline || "",
      body: body || "",
      link: inferredLink || "",
    };
    if (fromState.headline || fromState.body || fromState.link) return fromState;

    const b = loadSetupPreviewBackup(resolvedUser);
    return b
      ? { headline: b.headline || "", body: b.body || "", link: b.link || "" }
      : { headline: "", body: "", link: "" };
  });

  useEffect(() => {
    const has = !!(previewCopy?.headline || previewCopy?.body || previewCopy?.link);
    if (!has) return;
    saveSetupPreviewBackup(resolvedUser, previewCopy);
    // eslint-disable-next-line
  }, [previewCopy?.headline, previewCopy?.body, previewCopy?.link, resolvedUser]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("facebook_connected") === "1") {
      const b = loadSetupPreviewBackup(resolvedUser);
      if (b) setPreviewCopy({ headline: b.headline || "", body: b.body || "", link: b.link || "" });
    }
    // eslint-disable-next-line
  }, [location.search, resolvedUser]);

  useEffect(() => {
    if (isDraftDisabled(resolvedUser)) return;

    // In admin-client mode, never auto-restore draft from nav state or storage.
    // The admin is managing a live client campaign — the __DRAFT__ slot must not
    // appear after a pause/delete/archive action or any other control action.
    if (adminClientId) return;

    // if already hydrated, do nothing
    if (draftCreatives?.images?.length) return;

    const setDraftFromImages = (imgs, ctxKeyFromDraft = "") => {
      const norm = (imgs || []).slice(0, 2).map(toAbsoluteMedia).filter(Boolean);
      if (!norm.length) return false;

      // ensure ctxKey stays consistent
      const active = (getActiveCtx(resolvedUser) || "").trim();
      if (!active && ctxKeyFromDraft) setActiveCtx(ctxKeyFromDraft, resolvedUser);

      const payload = {
        ctxKey: ctxKeyFromDraft || active || "",
        images: norm,
        mediaSelection: "image",
        savedAt: Date.now(),
      };

      setDraftCreatives({ images: norm, mediaSelection: "image" });
      setSelectedCampaignId("__DRAFT__");
      setExpandedId("__DRAFT__");
      

      // persist for reliability across redirects/refresh
      try {
        sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(payload));
        if (resolvedUser) localStorage.setItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY), JSON.stringify(payload));
        localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));
        saveSetupCreativeBackup(resolvedUser, payload);
      } catch {}

      return true;
    };

    // 1) Try load the actual draft object (session/user/anon/backup)
    let baseDraft = null;
    let baseDraftExisted = false; // track whether any draft obj was found, even if ctx-mismatched
    try {
      const raw =
        sessionStorage.getItem(SS_DRAFT_KEY(resolvedUser)) ||
        sessionStorage.getItem("draft_form_creatives") ||
        lsGet(resolvedUser, CREATIVE_DRAFT_KEY) ||
        localStorage.getItem("sm_setup_creatives_backup_v1");

      if (raw) {
        baseDraft = JSON.parse(raw || "null");
        baseDraftExisted = !!baseDraft;
      }
    } catch {
      baseDraft = null;
    }

    if (baseDraft) {
      const ctx = String(baseDraft?.ctxKey || "").trim();
      if (isDraftForActiveCtx(baseDraft, resolvedUser)) {
        const imgs = Array.isArray(baseDraft?.images) ? baseDraft.images : [];
        // ✅ CRITICAL: use the draft’s images FIRST (this is what was broken)
        if (setDraftFromImages(imgs, ctx)) return;
      }
    }

    // 2) Fallback: use navImageUrls from route state (freshly passed at navigate() call-site).
    // These are always current for this run — prefer them over imageDrafts which are not ctxKey-gated.
    // Only when no draft object was found at all (baseDraftExisted = false prevents ghost-creative bleed).
    if (!baseDraftExisted) {
      const ctx = (getActiveCtx(resolvedUser) || "").trim();
      if (Array.isArray(navImageUrls) && navImageUrls.length) {
        setDraftFromImages(navImageUrls, ctx);
      }
    }
  }, [resolvedUser, draftCreatives?.images?.length]);


  /* ===================== CAMPAIGN DURATION (simple date range) ===================== */

  const isYMD = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "").trim());
  const ymd = (val) => String(val || "").trim().slice(0, 10);

  const todayYMD = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${da}`;
  }, []);

  const plusDaysYMD = (baseYMD, days) => {
    try {
      const b = isYMD(baseYMD) ? baseYMD : todayYMD;
      const d = new Date(`${b}T00:00:00`);
      d.setDate(d.getDate() + Number(days || 0));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const da = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    } catch {
      return todayYMD;
    }
  };

  const [startDate, setStartDate] = useState(() => {
    const existing = ymd(form?.startDate);
    // Only restore saved start date if it is today or in the future
    if (isYMD(existing) && new Date(`${existing}T23:59:59`).getTime() > Date.now()) return existing;
    return todayYMD;
  });

  const [endDate, setEndDate] = useState(() => {
    const existing = ymd(form?.endDate);
    // Only restore saved end date if it is strictly in the future
    if (isYMD(existing) && new Date(`${existing}T23:59:59`).getTime() > Date.now()) return existing;
    const base = isYMD(ymd(form?.startDate)) ? ymd(form?.startDate) : todayYMD;
    return plusDaysYMD(base, 3);
  });

  const clampEndForStart = (startYMD, endYMD) => {
    try {
      const s = isYMD(startYMD) ? startYMD : todayYMD;
      const start = new Date(`${s}T00:00:00`);

      let end = isYMD(endYMD) ? new Date(`${endYMD}T00:00:00`) : null;
      const maxEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

      if (!end || isNaN(end.getTime()) || end <= start) {
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      }
      if (end > maxEnd) end = maxEnd;

      const y = end.getFullYear();
      const m = String(end.getMonth() + 1).padStart(2, "0");
      const da = String(end.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    } catch {
      return plusDaysYMD(todayYMD, 3);
    }
  };

  useEffect(() => {
    setEndDate((prev) => clampEndForStart(startDate, prev));
    // eslint-disable-next-line
  }, [startDate]);

/* ===================== DRAFT RE-HYDRATION ===================== */
useEffect(() => {
  // ✅ BLOCK 2 FIX:
  // If draft is disabled (meaning user successfully launched),
  // NEVER rehydrate draftCreatives from any storage/backup.
  if (isDraftDisabled(resolvedUser)) {
    try {
      purgeDraftStorages(resolvedUser);
    } catch {}
    try {
      purgeDraftArtifactsEverywhere();
    } catch {}

    setDraftCreatives({ images: [], mediaSelection: "image" });

    // if UI was still pointing at draft, detach it
    setExpandedId((prev) => (prev === "__DRAFT__" ? null : prev));
    setSelectedCampaignId((prev) => (prev === "__DRAFT__" ? "" : prev));
    return;
  }

  // ── Admin-client mode: read creative draft (localStorage first, then backend).
  // Never touches TheBoss's draft keys.
  if (adminClientId) {
    const clientNs = `adminClient:${adminClientId}`;
    const rawClient =
      localStorage.getItem(`u:${clientNs}:${CREATIVE_DRAFT_KEY}`) ||
      localStorage.getItem(`u:${clientNs}:sm_setup_creatives_backup_v1`);
    if (rawClient) {
      try {
        const obj = JSON.parse(rawClient);
        const now = Date.now();
        const expiresAt = Number(obj.expiresAt);
        const ageOk =
          (Number.isFinite(expiresAt) && now <= expiresAt) ||
          (!obj.savedAt || now - obj.savedAt <= DEFAULT_CAMPAIGN_TTL_MS);
        if (ageOk) {
          const ok = applyDraft(obj);
          if (ok) {
            console.debug("[DRAFT RESTORE]", {
              page: "CampaignSetup", adminClientId, source: "namespacedLocalStorage",
              imageCount: obj.images?.length || 0, hasCopy: !!(obj.headline || obj.body),
              selectedCampaignId: "__DRAFT__",
            });
          }
        }
      } catch {}
    } else {
      // localStorage miss — try backend (covers dashboard navigation / device change)
      const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      fetch(`/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`, {
        credentials: "include",
        headers: _sid ? { "x-sm-sid": _sid } : {},
      })
        .then((r) => r.json().catch(() => ({})))
        .then((j) => {
          if (j.ok && j.creativeDraft) {
            const obj = j.creativeDraft;
            const ok = applyDraft(obj);
            if (ok) {
              // Seed localStorage so subsequent loads don't need the backend
              try {
                localStorage.setItem(`u:${clientNs}:${CREATIVE_DRAFT_KEY}`, JSON.stringify(obj));
                localStorage.setItem(`u:${clientNs}:sm_setup_creatives_backup_v1`, JSON.stringify(obj));
              } catch {}
              console.debug("[DRAFT RESTORE]", {
                page: "CampaignSetup", adminClientId, source: "backend",
                imageCount: obj.images?.length || 0, hasCopy: !!(obj.headline || obj.body),
                selectedCampaignId: "__DRAFT__",
              });
            }
          }
        })
        .catch(() => {});
    }
    return; // Do NOT read TheBoss's draft keys in admin-client mode
  }
  // ─────────────────────────────────────────────────────────────────────

  const lastFields = lsGet(resolvedUser, "smartmark_last_campaign_fields");
  if (lastFields) {
    const f = JSON.parse(lastFields);
    setForm(f);
    const sd = String(f.startDate || "").slice(0, 10);
    const ed = String(f.endDate || "").slice(0, 10);

    if (sd) setStartDate(sd);
    if (ed) setEndDate(clampEndForStart(sd || startDate, ed));
  }

  const applyDraft = (draftObj) => {
    // Reject drafts that belong to a different client context.
    // In admin mode: only accept drafts whose adminClientId matches the current client.
    // In normal mode: reject any draft that has an adminClientId field.
    const draftClientId = String(draftObj?.adminClientId || "").trim();
    if (draftClientId !== (adminClientId || "")) {
      console.debug("[Creative Draft Rejected - wrong client]", {
        currentAdminClientId: adminClientId || null,
        draftAdminClientId: draftClientId || null,
        ctxKey: draftObj?.ctxKey || null,
      });
      return false;
    }

    // In admin-client mode, the namespace key (u:adminClient:${adminClientId}:...) already
    // provides isolation — skip the ctxKey check to avoid timing races between the
    // ctxKey setup effect and this draft restore effect on CampaignSetup mount.
    if (!adminClientId && !isDraftForActiveCtx(draftObj, resolvedUser)) return false;

    const imgs = Array.isArray(draftObj.images) ? draftObj.images.slice(0, 2) : [];
    const norm = imgs.map(toAbsoluteMedia).filter(Boolean);
    if (!norm.length) return false;

    console.debug("[CREATIVE PERSIST RESTORE]", {
      page: "CampaignSetup",
      adminClientId: adminClientId || null,
      draftAdminClientId: draftObj.adminClientId || null,
      ctxKey: draftObj.ctxKey || null,
      mediaSelection: draftObj.mediaSelection || "image",
      imageUrls: norm,
    });

    // Restore multi-creative set if present in the draft
    const restoredSet = Array.isArray(draftObj.creativeSet) && draftObj.creativeSet.length > 1
      ? draftObj.creativeSet
      : null;

    setDraftCreatives({
      images: norm,
      mediaSelection: draftObj.mediaSelection || "image",
      creativeSet: restoredSet,
      creativeTestCount: restoredSet ? (draftObj.creativeTestCount || restoredSet.length) : 1,
    });

    setSelectedCampaignId("__DRAFT__");
    setExpandedId("__DRAFT__");
    setSetupTab("creatives");
    return true;
  };

  const inflight = (() => {
    try {
      const v = localStorage.getItem(LS_INFLIGHT_KEY(resolvedUser));
      if (!v) return false;
      const parsed = JSON.parse(v);
      return parsed?.t && Date.now() - Number(parsed.t) < 10 * 60 * 1000;
    } catch {
      return false;
    }
  })();

  try {
    const sess = sessionStorage.getItem(SS_DRAFT_KEY(resolvedUser));
    if (sess) {
      const sObj = JSON.parse(sess);
      const ok = applyDraft(sObj);
      if (ok) {
        saveSetupCreativeBackup(resolvedUser, sObj);
        return;
      }
    }

    const raw =
      lsGet(resolvedUser, CREATIVE_DRAFT_KEY) ||
      lsGet(resolvedUser, CREATIVE_DRAFT_KEY_LEGACY) ||
      localStorage.getItem(CREATIVE_DRAFT_KEY_LEGACY);

    if (raw) {
      const draft = JSON.parse(raw);

      const now = Date.now();
      const expiresAt = Number(draft.expiresAt);
      const ageOk =
        (Number.isFinite(expiresAt) && now <= expiresAt) ||
        (!draft.savedAt || now - draft.savedAt <= DEFAULT_CAMPAIGN_TTL_MS);

      if (ageOk) {
        const ok = applyDraft(draft);
        if (ok) {
          saveSetupCreativeBackup(resolvedUser, draft);
          return;
        }
      }
    }

    if (inflight) {
      const backup = loadSetupCreativeBackup(resolvedUser);
      if (backup) {
        const ok = applyDraft(backup);
        if (ok) {
          sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(backup));
          return;
        }
      }
    }

    const backup = loadSetupCreativeBackup(resolvedUser);
    if (backup) {
      const ok = applyDraft(backup);
      if (ok) {
        sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(backup));
        return;
      }
    }
  } catch {}
}, []);


  useEffect(() => {
    const hasDraft = draftCreatives.images && draftCreatives.images.length;
    if (!hasDraft) return;
    try {
      const payload = { ...draftCreatives, ctxKey: getActiveCtx(resolvedUser) || "", savedAt: Date.now() };
      sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(payload));

      if (resolvedUser) {
        localStorage.setItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY), JSON.stringify(payload));
      } else {
        localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));
      }
      saveSetupCreativeBackup(resolvedUser, payload);
    } catch {}
  }, [draftCreatives, resolvedUser]);

const handleClearDraft = () => {
  try {
    sessionStorage.removeItem(SS_DRAFT_KEY(resolvedUser));
    sessionStorage.removeItem("draft_form_creatives");
    sessionStorage.removeItem("draft_form_creatives_v2");
    sessionStorage.removeItem("draft_form_creatives_v3");
  } catch {}

  try {
    if (resolvedUser) {
      localStorage.removeItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY));
      localStorage.removeItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY_LEGACY));
      localStorage.removeItem(withUser(resolvedUser, FORM_DRAFT_KEY));
      localStorage.removeItem(withUser(resolvedUser, ACTIVE_CTX_KEY));
    }
    localStorage.removeItem(CREATIVE_DRAFT_KEY);
    localStorage.removeItem(CREATIVE_DRAFT_KEY_LEGACY);
    localStorage.removeItem(FORM_DRAFT_KEY);
    localStorage.removeItem(ACTIVE_CTX_KEY);
  } catch {}

  try {
    localStorage.removeItem(LS_BACKUP_KEY(resolvedUser));
    localStorage.removeItem(SETUP_CREATIVE_BACKUP_KEY);
    localStorage.removeItem(LS_INFLIGHT_KEY(resolvedUser));
    localStorage.removeItem(FB_CONNECT_INFLIGHT_KEY);
    localStorage.removeItem(SETUP_PREVIEW_BACKUP_KEY);
    localStorage.removeItem(SETUP_FETCHABLE_IMAGES_KEY);
    localStorage.removeItem("smartmark.imageDrafts.v1");
    localStorage.removeItem("sm_image_cache_v1");
    localStorage.removeItem("u:anon:sm_image_cache_v1");
    if (resolvedUser) {
      localStorage.removeItem(LS_PREVIEW_KEY(resolvedUser));
      localStorage.removeItem(LS_FETCHABLE_KEY(resolvedUser));
    }
  } catch {}

  setDraftDisabled(resolvedUser, false);
  setDraftCreatives({ images: [], mediaSelection: "image" });
  setPreviewCopy({ headline: "", body: "", link: "" });
  setForm((prev) => ({
    ...prev,
    campaignName: "",
  }));
  setExpandedId(null);
  setSelectedCampaignId("");
  setShowCampaignMenu(false);
  setSetupTab("campaign");
};

useEffect(() => {
  const params = new URLSearchParams(location.search);
  if (params.get("facebook_connected") !== "1") return;

  smLog(
    "oauth.return.before",
    smDumpDraftSnapshot({
      FORM_DRAFT_KEY,
      CREATIVE_DRAFT_KEY,
      FB_CONNECT_INFLIGHT_KEY,
      ACTIVE_CTX_KEY,
    })
  );

  // ✅ keep sid stable if backend sends one
  try {
    const sid = (params.get("sm_sid") || params.get("sid") || "").trim();
    if (sid) setStoredSid(sid);
  } catch {}

  // ✅ restore ctxKey from inflight (try user + anon + legacy)
  try {
    const raw =
      localStorage.getItem(LS_INFLIGHT_KEY(resolvedUser)) ||
      localStorage.getItem(LS_INFLIGHT_KEY("anon")) ||
      localStorage.getItem(FB_CONNECT_INFLIGHT_KEY);

    const inflight = raw ? JSON.parse(raw) : null;
    const k = (inflight?.ctxKey ? String(inflight.ctxKey) : "").trim();
    if (k) setActiveCtx(k, resolvedUser);
  } catch {}

  // ✅ allow draft to re-hydrate after redirect (critical)
  if (!(isDraftDisabled(resolvedUser) || isDraftDisabledLegacy())) {
  setDraftDisabled(resolvedUser, false);
}


  setFbConnected(true);
  setCameFromFbConnect(true);

  // In admin-client mode the token was stored under the CLIENT's ownerKey,
  // not the admin session. The client's data must come from the admin wrapper
  // endpoint that reads the client's token — not from the session-level routes.
  const returnedAdminClientId = (params.get("adminClientId") || adminClientId || "").trim();

  // ✅ FORCE refresh accounts/pages after OAuth
  (async () => {
    if (returnedAdminClientId) {
      // Admin-client mode: reload client FB info from admin wrapper route
      const enc = encodeURIComponent(returnedAdminClientId);
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const headers = sid ? { "x-sm-sid": sid } : {};
      try {
        const r = await fetch(`/api/admin/clients/${enc}/facebook-info`, {
          credentials: "include",
          headers,
        });
        if (r.ok) {
          const j = await r.json().catch(() => ({}));
          if (j.ok) {
            const accts = Array.isArray(j.adAccounts) ? j.adAccounts : [];
            const pgs = Array.isArray(j.pages) ? j.pages : [];
            setFbConnected(!!j.fbConnected);
            setAdAccounts(accts);
            setPages(pgs);
            touchFbConn();
            if (accts.length) setSelectedAccount(String(accts[0].id || "").replace(/^act_/, ""));
            if (pgs.length) setSelectedPageId(String(pgs[0].id || ""));
          }
        }
      } catch {}
      return; // Do not fall through to session-level routes in admin mode
    }

    // Normal self-connect: use session-level routes
    try {
      const r = await authFetch(`/facebook/adaccounts`);
      if (r.ok) {
        const json = await r.json().catch(() => ({}));
        const list = json.data || [];
        setAdAccounts(list);
        touchFbConn();
        const first = list?.[0]?.id ? String(list[0].id).replace(/^act_/, "") : "";
        setSelectedAccount((prev) => (prev ? prev : first));
      }
    } catch {}

    try {
      const r = await authFetch(`/facebook/pages`);
      if (r.ok) {
        const json = await r.json().catch(() => ({}));
        const list = json.data || [];
        setPages(list);
        touchFbConn();
        const first = list?.[0]?.id ? String(list[0].id) : "";
        setSelectedPageId((prev) => (prev ? prev : first));
      }
    } catch {}
  })();


  // ✅ restore preview copy (prevents link/headline/body flipping to placeholder)
  try {
    const b = loadSetupPreviewBackup(resolvedUser);
    if (b) setPreviewCopy({ headline: b.headline || "", body: b.body || "", link: b.link || "" });
  } catch {}

  // ✅ FORCE restore images from the FETCHABLE backup first (this is what fixes the post-connect 404)
  let imgs = [];
  try {
    const fetchable = loadFetchableImagesBackup(resolvedUser); // already absolute + safe
    if (Array.isArray(fetchable) && fetchable.length) {
      imgs = fetchable.slice(0, 2).map(toAbsoluteMedia).filter(Boolean);
    }
  } catch {}

  // fallback to existing draft sources if fetchable backup missing
  if (!imgs.length) {
    let best = null;
    try {
      const raw =
        sessionStorage.getItem(SS_DRAFT_KEY(resolvedUser)) ||
        sessionStorage.getItem("draft_form_creatives") ||
        lsGet(resolvedUser, CREATIVE_DRAFT_KEY) ||
        localStorage.getItem(CREATIVE_DRAFT_KEY) ||
        null;

      if (raw) best = JSON.parse(raw || "null");
    } catch {
      best = null;
    }

    if (!best) best = loadSetupCreativeBackup(resolvedUser);

    imgs = (Array.isArray(best?.images) ? best.images : [])
      .slice(0, 2)
      .map(toAbsoluteMedia)
      .filter(Boolean);
  }

  if (imgs.length) {
    const patched = {
      ctxKey: String(getActiveCtx(resolvedUser) || "").trim(),
      images: imgs,
      mediaSelection: "image",
      savedAt: Date.now(),
    };

    try {
      sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(patched));
      localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(patched));
      if (resolvedUser) localStorage.setItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY), JSON.stringify(patched));
      saveSetupCreativeBackup(resolvedUser, patched);
      saveFetchableImagesBackup(resolvedUser, imgs); // keep it fresh
    } catch {}

    setDraftCreatives({ images: imgs, mediaSelection: "image" });
    setExpandedId("__DRAFT__");
    setSelectedCampaignId("__DRAFT__");
  }

  // keep connected flag fresh
  try {
    localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
  } catch {}

  // cleanup inflight marker (user + anon + legacy)
  try {
    localStorage.removeItem(LS_INFLIGHT_KEY(resolvedUser));
    localStorage.removeItem(LS_INFLIGHT_KEY("anon"));
    localStorage.removeItem(FB_CONNECT_INFLIGHT_KEY);
  } catch {}

  smLog(
    "oauth.return.after",
    smDumpDraftSnapshot({
      FORM_DRAFT_KEY,
      CREATIVE_DRAFT_KEY,
      FB_CONNECT_INFLIGHT_KEY,
      ACTIVE_CTX_KEY,
    })
  );

  // strip query params after restore
  window.history.replaceState({}, document.title, "/setup");
}, [location.search, resolvedUser]);




  useEffect(() => {
    if (fbConnected) {
      try {
        localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
      } catch {}
    }
  }, [fbConnected]);

  useEffect(() => {
  const currentUser = getUserFromStorage();
  if (!currentUser) return;
  refreshBillingStatus();
  // eslint-disable-next-line
}, [resolvedUser]);

useEffect(() => {
  const params = new URLSearchParams(location.search || "");
  if (params.get("checkout") !== "success") return;

  (async () => {
    const sessionId = String(params.get("session_id") || "").trim();

    try {
      if (sessionId) {
        const syncRes = await stripeFetch(`/api/stripe/sync-checkout-session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        const syncJson = await syncRes.json().catch(() => ({}));
        const newSid = String(syncJson?.newSid || "").trim();
        if (newSid) {
          try { localStorage.setItem(SM_SID_LS_KEY, newSid); } catch {}
        }
      }

      const ok = await refreshBillingStatus();
      const pending = loadPendingLaunch();

      if (!ok) return;

      if (!pending) {
        clearPendingLaunch();
        setShowPlanModal(false);
        setPendingLaunchAfterCheckout(false);
        localStorage.removeItem("sm_selected_plan");
        localStorage.removeItem("sm_founder_offer");
        setSetupTab("campaign");
        return;
      }

      if (pending.selectedPlan) {
        setSelectedPlan(String(pending.selectedPlan).trim().toLowerCase());
      }

      if (pending.budget !== undefined && pending.budget !== null) {
        setBudget(String(pending.budget));
      }

      if (pending.startDate) {
        const sd = String(pending.startDate).slice(0, 10);
        // Only restore if date is today or future; otherwise leave default (todayYMD)
        if (new Date(`${sd}T23:59:59`).getTime() > Date.now()) setStartDate(sd);
      }
      if (pending.endDate) {
        const ed = String(pending.endDate).slice(0, 10);
        // Only restore if date is strictly in the future
        if (new Date(`${ed}T23:59:59`).getTime() > Date.now()) setEndDate(ed);
      }

      if (pending.selectedAccount) {
        setSelectedAccount(String(pending.selectedAccount).replace(/^act_/, ""));
      }

      if (pending.selectedPageId) {
        setSelectedPageId(String(pending.selectedPageId));
      }

      if (pending.form && typeof pending.form === "object") {
        setForm((prev) => ({ ...prev, ...pending.form }));
      }

      if (pending.previewCopy && typeof pending.previewCopy === "object") {
        setPreviewCopy({
          headline: String(pending.previewCopy.headline || ""),
          body: String(pending.previewCopy.body || ""),
          link: String(pending.previewCopy.link || ""),
        });
      }

      const pendingImages = Array.isArray(pending?.draftCreatives?.images)
        ? pending.draftCreatives.images.map(toAbsoluteMedia).filter(Boolean).slice(0, 2)
        : Array.isArray(pending?.navImageUrls)
        ? pending.navImageUrls.map(toAbsoluteMedia).filter(Boolean).slice(0, 2)
        : [];

      if (pendingImages.length) {
        const payload = {
          ctxKey: getActiveCtx(resolvedUser) || "",
          images: pendingImages,
          mediaSelection: "image",
          savedAt: Date.now(),
        };

        setDraftDisabled(resolvedUser, false);
        setDraftCreatives({ images: pendingImages, mediaSelection: "image" });
        setSelectedCampaignId("__DRAFT__");
        setExpandedId("__DRAFT__");

        try {
          sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(payload));
          sessionStorage.setItem("draft_form_creatives", JSON.stringify(payload));
          if (resolvedUser) {
            localStorage.setItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY), JSON.stringify(payload));
          }
          localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));
          saveSetupCreativeBackup(resolvedUser, payload);
          saveFetchableImagesBackup(resolvedUser, pendingImages);
        } catch {}
      }

      clearPendingLaunch();
      setShowPlanModal(false);
      setPendingLaunchAfterCheckout(false);
      localStorage.removeItem("sm_selected_plan");
      localStorage.removeItem("sm_founder_offer");
      setSetupTab("campaign");
    } catch (e) {
      console.error("[setup] checkout sync failed", e);
    } finally {
      localStorage.removeItem("sm_selected_plan");
      localStorage.removeItem("sm_founder_offer");

      const clean = new URL(window.location.href);
      clean.searchParams.delete("checkout");
      clean.searchParams.delete("session_id");
      clean.searchParams.delete("launch_intent");
      clean.searchParams.delete("plan");
      clean.searchParams.delete("founder");
      window.history.replaceState({}, document.title, clean.pathname + clean.search);
    }
  })();
  // eslint-disable-next-line
}, [location.search, resolvedUser]);

useEffect(() => {
  const params = new URLSearchParams(location.search || "");
  if (params.get("billing_cancelled") !== "1") return;

  setShowPlanModal(false);
  setPendingLaunchAfterCheckout(false);

  const clean = new URL(window.location.href);
  clean.searchParams.delete("billing_cancelled");
  clean.searchParams.delete("plan");
  window.history.replaceState({}, document.title, clean.pathname + clean.search);
}, [location.search]);

  useEffect(() => {
    const imgs = (Array.isArray(navImageUrls) ? navImageUrls : [])
      .filter(Boolean)
      .slice(0, 2)
      .map(toAbsoluteMedia)
      .filter(Boolean);

    if (!imgs.length) return;

   if (!(isDraftDisabled(resolvedUser) || isDraftDisabledLegacy())) {
  setDraftDisabled(resolvedUser, false);
}


    setDraftCreatives({ images: imgs, mediaSelection: "image" });
    setSelectedCampaignId("__DRAFT__");
    setExpandedId("__DRAFT__");

    try {
      const payload = {
        ctxKey: getActiveCtx(resolvedUser) || "",
        images: imgs,
        mediaSelection: "image",
        savedAt: Date.now(),
      };

      saveSetupCreativeBackup(resolvedUser, payload);
      sessionStorage.setItem(SS_DRAFT_KEY(resolvedUser), JSON.stringify(payload));
      if (resolvedUser) localStorage.setItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY), JSON.stringify(payload));
      localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(payload));
    } catch {}
  }, [navImageUrls, resolvedUser]);

  // ✅ FB adaccounts/pages — normal user path only (not admin-client mode)
 useEffect(() => {
  if (adminClientId) return; // admin-client mode: accounts come from /api/admin/clients/:id/facebook-info
  if (!fbConnected) return;
  if (adAccounts.length > 0) return;

  authFetch(`/facebook/adaccounts`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((json) => {
      const list = json.data || [];
      setAdAccounts(list);
      touchFbConn();

      if (!selectedAccount && list.length) {
        const first = String(list[0].id || "").trim();
        setSelectedAccount(first.replace(/^act_/, ""));
      }
    })
    .catch(() => {});
  // eslint-disable-next-line
}, [fbConnected, adAccounts.length]);

 useEffect(() => {
  if (adminClientId) return; // admin-client mode: pages come from /api/admin/clients/:id/facebook-info
  if (!fbConnected) return;
  if (pages.length > 0) return;

  authFetch(`/facebook/pages`)
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((json) => {
      const list = json.data || [];
      setPages(list);
      touchFbConn();

      if (!selectedPageId && list.length) {
        setSelectedPageId(String(list[0].id || ""));
      }
    })
    .catch(() => {});
  // eslint-disable-next-line
}, [fbConnected, pages.length]);

// Load saved selection from server — authoritative fallback when localStorage is empty.
// Works in both normal mode (resolves to the user's ownerKey) and admin-client mode
// (passes adminClientId so the backend resolves to the client's ownerKey).
// A missing or failed response NEVER disconnects FB.
useEffect(() => {
  if (!fbConnected) return;
  console.debug("[Setup Selection Restore]", {
    resolvedUser, adminClientId, fbSelectionScope, selectedAccount, selectedPageId,
  });
  const sid = getStoredSid();
  const headers = sid ? { 'x-sm-sid': sid } : {};
  const qs = adminClientId ? `?adminClientId=${encodeURIComponent(adminClientId)}` : '';
  fetch(`/api/facebook/selection${qs}`, { credentials: 'include', headers })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      console.debug('[FB Selection]', data);
      if (!data?.ok) return;
      if (data.adAccountId) setSelectedAccount((prev) => prev || String(data.adAccountId).replace(/^act_/, ''));
      if (data.pageId) setSelectedPageId((prev) => prev || String(data.pageId));
    })
    .catch(() => {});
  // eslint-disable-next-line
}, [fbConnected, adminClientId]);

  // ✅ Admin-client mode: when the selected client changes, immediately clear any stale
  // FB/account state from the previous client, then load fresh data for the new client.
  // Uses admin wrapper routes — no client token is exposed to the frontend.
  useEffect(() => {
  if (!adminClientId) return;

  // Clear stale state from previous client before fetching new client data.
  setAdAccounts([]);
  setPages([]);
  setSelectedAccount("");
  setSelectedPageId("");
  setCampaigns([]);
  setFbConnected(false);
  setAdminClientInfo(null);

  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  const headers = sid ? { "x-sm-sid": sid } : {};
  const enc = encodeURIComponent(adminClientId);

  // Fetch FB connection, ad accounts, and pages for this client.
  fetch(`/api/admin/clients/${enc}/facebook-info`, { credentials: "include", headers })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => {
      if (!j.ok) return;
      const accts = Array.isArray(j.adAccounts) ? j.adAccounts : [];
      const pgs   = Array.isArray(j.pages) ? j.pages : [];
      setFbConnected(!!j.fbConnected);
      setAdAccounts(accts);
      setPages(pgs);
      // Always use client's first account/page — never fall back to admin's saved selection.
      if (accts.length) setSelectedAccount(String(accts[0].id || "").replace(/^act_/, ""));
      if (pgs.length)   setSelectedPageId(String(pgs[0].id || ""));
    })
    .catch(() => {});

  // Fetch full client details for the Account tab display.
  fetch(`/api/admin/clients/${enc}`, { credentials: "include", headers })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => { if (j.ok && j.client) setAdminClientInfo(j.client); })
    .catch(() => {});

  // Load the selected client's complete campaign history, including stored metrics
  // and optimizer state. The server bundles everything from campaign_creatives +
  // optimizer_campaign_state scoped to the client's ownerKey — no admin data leaks.
  fetch(`/api/admin/clients/${enc}/campaigns`, { credentials: "include", headers })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => {
      if (!j.ok || !Array.isArray(j.campaigns)) return;
      const list = j.campaigns;
      setCampaigns(list);

      // Populate metricsMap, optimizerStateMap, and campaignCreativesMap from the bundled data
      // so the dashboard shows the same metrics and creatives the client sees — without
      // calling per-campaign endpoints (which would 403 since they check ownerKey ownership).
      const newMetrics = {};
      const newOptStates = {};
      const newCreatives = {};
      for (const c of list) {
        if (!c.id) continue;

        // Creative data — only populate when real content exists so campaigns without
        // stored creatives don't pollute the map with empty entries that mask the
        // "no creative" fallback.
        const hasCreative = (c.images?.length > 0) || c.meta?.headline || c.meta?.body;
        if (hasCreative) {
          newCreatives[c.id] = {
            images:         (c.images || []).filter(Boolean),
            mediaSelection: c.mediaSelection || "image",
            meta: {
              headline: String(c.meta?.headline || "").trim(),
              body:     String(c.meta?.body     || "").trim(),
              link:     String(c.meta?.link     || "").trim(),
            },
          };
        }

        // Metrics + optimizer state
        const snap = c.optimizerState?.metricsSnapshot;
        if (snap && Object.keys(snap).length > 0) {
          newMetrics[c.id] = {
            impressions: Number(snap.impressions) || 0,
            clicks:      Number(snap.linkClicks || snap.clicks) || 0,
            ctr:         Number(snap.ctr)   || 0,
            spend:       Number(snap.spend) || 0,
          };
        }
        if (c.optimizerState) {
          newOptStates[c.id] = {
            campaignId:         c.id,
            campaignName:       c.name,
            currentStatus:      c.status,
            smArchived:         !!c.smArchived,
            metricsSnapshot:    snap || {},
            publicSummary:      c.optimizerState.publicSummary      || null,
            latestDiagnosis:    c.optimizerState.latestDiagnosis    || null,
            latestAction:       c.optimizerState.latestAction       || null,
            latestDecision:     c.optimizerState.latestDecision     || null,
            pendingCreativeTest: c.optimizerState.pendingCreativeTest || null,
            currentWinner:      c.optimizerState.currentWinner      || null,
            activeTestType:     c.optimizerState.activeTestType      || '',
          };
        }
      }
      setCampaignCreativesMap((prev) => ({ ...prev, ...newCreatives }));
      setMetricsMap((prev)            => ({ ...prev, ...newMetrics  }));
      setOptimizerStateMap((prev)     => ({ ...prev, ...newOptStates }));

      // Campaign count (active / paused only — archived excluded)
      const activeCount = list.filter(
        (c) => !c.smArchived && ["ACTIVE", "PAUSED"].includes(String(c.status || "").toUpperCase())
      ).length;
      setCampaignCount(activeCount);

      // Auto-select first non-archived campaign
      const firstActive = list.find((c) => !c.smArchived);
      const firstId = String(firstActive?.id || list[0]?.id || "").trim();
      if (firstId) {
        setSelectedCampaignId(firstId);
        setExpandedId(firstId);
      }
    })
    .catch(() => {});
  // eslint-disable-next-line
}, [adminClientId]);

// ── Admin-client metrics fetch: if the selected campaign has no stored metrics,
// try to fetch them from Meta via the admin route using the client's token.
// Uses a ref-gate so we only attempt once per campaign per session (avoids loops).
const _adminMetricsFetchedRef = React.useRef(new Set());
useEffect(() => {
  if (!adminClientId || !selectedCampaignId || selectedCampaignId === "__DRAFT__") return;
  if (_adminMetricsFetchedRef.current.has(selectedCampaignId)) return;

  // Skip fetch if metrics already loaded
  const existingSnap = optimizerStateMap[selectedCampaignId]?.metricsSnapshot;
  const existingMap  = metricsMap[selectedCampaignId];
  const already = (existingSnap && (Number(existingSnap.impressions||0) > 0 || Number(existingSnap.spend||0) > 0)) ||
                  (existingMap  && (Number(existingMap.impressions||0)  > 0 || Number(existingMap.spend||0)  > 0));
  if (already) { _adminMetricsFetchedRef.current.add(selectedCampaignId); return; }

  _adminMetricsFetchedRef.current.add(selectedCampaignId);
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  const headers = sid ? { "x-sm-sid": sid } : {};
  const enc = encodeURIComponent(adminClientId);

  fetch(`/api/admin/clients/${enc}/campaign/${selectedCampaignId}/metrics`, { credentials: "include", headers })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => {
      if (!j.ok) return;
      const m = j.metricsSnapshot || j.metrics || {};
      if (!m || Object.keys(m).length === 0) return;
      setMetricsMap((prev) => ({
        ...prev,
        [selectedCampaignId]: {
          impressions: Number(m.impressions) || 0,
          clicks:      Number(m.linkClicks || m.clicks) || 0,
          ctr:         Number(m.ctr)   || 0,
          spend:       Number(m.spend) || 0,
        },
      }));
      setOptimizerStateMap((prev) => ({
        ...prev,
        [selectedCampaignId]: {
          ...(prev[selectedCampaignId] || {}),
          metricsSnapshot: m,
        },
      }));
    })
    .catch(() => {});
  // eslint-disable-next-line
}, [adminClientId, selectedCampaignId]);

// Reset campaign subtab to overview when selection changes
useEffect(() => { setCampaignSubtab("overview"); }, [selectedCampaignId]);

// Load AI settings when campaign selection or account changes
useEffect(() => {
  if (!selectedCampaignId || selectedCampaignId === "__DRAFT__" || !selectedAccount) return;
  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  loadAiSettings(selectedCampaignId, acctId);
  // eslint-disable-next-line
}, [selectedCampaignId, selectedAccount, adminClientId]);

// ── Admin-client exit guard: wipe ALL client-derived maps the instant adminClientId
// transitions from a non-empty value to "". This fires even if exitClientMode had
// batching issues, and provides a second line of defence against the 403.
const _prevAdminClientIdRef = React.useRef(adminClientId);
// True during the brief window when exitClientMode fires but React state batches
// haven't committed yet. The server-save effect checks this to skip any stale write.
const isExitingAdminClientModeRef = React.useRef(false);
// Stores freshly-verified Meta statuses from campaign control actions.
// Prevents stale DB data from overwriting a verified PAUSED/ACTIVE for 60 s.
// Shape: { [campaignId]: { status, expiresAt, metaConfirmed, verifiedAt } }
const recentStatusOverridesRef = React.useRef({});

useEffect(() => {
  const prev = _prevAdminClientIdRef.current;
  _prevAdminClientIdRef.current = adminClientId;
  if (prev && !adminClientId) {
    console.debug('[CampaignSetup] adminClientId cleared — wiping all client-derived maps');
    isExitingAdminClientModeRef.current = false; // state is now stable, reset guard
    setMetricsMap({});
    setOptimizerStateMap({});
    setCampaignCreativesMap({});
    setPublicSummaryMap({});
    setOptimizerCreativeMap({});
    setAdAccounts([]);
    setPages([]);
    setSelectedAccount("");
    setSelectedPageId("");
    setCampaigns([]);
    setSelectedCampaignId("");
    setExpandedId(null);
    setFbConnected(false);
    setCampaignCount(0);
  }
}, [adminClientId]);



useEffect(() => {
  if (adminClientId) return; // admin-client mode: campaign list uses admin wrapper; skip normal user endpoint
  if (!fbConnected || !selectedAccount) return;

  const acctId = String(selectedAccount).trim();
  const hasDraft = !!(draftCreatives?.images && draftCreatives.images.length);
  let cancelled = false;

  authFetch(`/facebook/adaccount/${acctId}/campaigns`)
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then(async (data) => {
      const fullList = Array.isArray(data) ? data : data?.data || [];
      const list = fullList;

      if (cancelled) return;

      setCampaigns(list);

      const activeCount = fullList.filter((c) =>
        !c.smArchived &&
        ["ACTIVE", "PAUSED"].includes(
          String(c.status || c.effective_status || "").toUpperCase()
        )
      ).length;
      setCampaignCount(activeCount);

      const firstLiveId = String(list?.[0]?.id || "").trim();

      // If we just came from FormPage with generated images, always show draft first.
      // location.state.imageUrls signals "fresh from FormPage with creative ready".
      const _incomingImages = Array.isArray(location.state?.imageUrls) &&
        location.state.imageUrls.filter(Boolean).length > 0;

      // hasDraftInStorage: check localStorage for a saved admin-client draft even if
      // the async applyDraft hasn't set React state yet (race with campaigns loading).
      const _hasDraftInStorage = adminClientId ? (() => {
        try {
          const ns = `adminClient:${adminClientId}`;
          const raw = localStorage.getItem(`u:${ns}:${CREATIVE_DRAFT_KEY}`);
          if (!raw) return false;
          const obj = JSON.parse(raw);
          return Array.isArray(obj?.images) && obj.images.filter(Boolean).length > 0;
        } catch { return false; }
      })() : false;

      // hasDraftOrIncoming: treat incoming route images and saved localStorage draft
      // the same as a fully-restored draft to prevent live campaign from overriding.
      const hasDraftOrIncoming = hasDraft || _incomingImages || _hasDraftInStorage;

      if (_incomingImages) {
        // Fresh navigation from FormPage with creative — force draft view immediately.
        // Do NOT let the first live campaign override the draft the user just created.
        setSelectedCampaignId("__DRAFT__");
        setExpandedId("__DRAFT__");
      } else if (firstLiveId) {
        const currentSelected = String(selectedCampaignId || "").trim();
        const currentExpanded = String(expandedId || "").trim();

        const selectedStillExists = list.some(
          (c) => String(c?.id || "").trim() === currentSelected
        );
        const expandedStillExists = list.some(
          (c) => String(c?.id || "").trim() === currentExpanded
        );

        if (
          !hasDraftOrIncoming &&
          (!currentSelected ||
            currentSelected === "__DRAFT__" ||
            !selectedStillExists)
        ) {
          setSelectedCampaignId(firstLiveId);
        }

        if (
          !hasDraftOrIncoming &&
          (!currentExpanded ||
            currentExpanded === "__DRAFT__" ||
            !expandedStillExists)
        ) {
          setExpandedId(firstLiveId);
        }
      }

      // ── Stale-draft reconciliation ──────────────────────────────────────────
      // If the loaded campaigns list contains a live campaign with the same name
      // as the current draft, the draft was already launched — clear it so the
      // real campaign is shown instead of a phantom "(Draft)" entry.
      // Primary protection against the admin-client post-launch page-reload bug.
      if (hasDraft) {
        const _draftName = String(form?.campaignName || "").trim().toLowerCase();
        if (_draftName) {
          const _matchingLive = list.find((c) => {
            if (c.smArchived || c.hiddenFromHistory) return false;
            const _cName = String(c.name || "").trim().toLowerCase();
            const _cSt   = String(c.status || c.effective_status || "").toUpperCase();
            const _isLive = c.launchComplete === true ||
              ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"].includes(_cSt);
            return _isLive && _cName === _draftName;
          });
          if (_matchingLive) {
            console.debug("[draft-reconciliation] clearing stale draft — live campaign found:", _matchingLive.id, _matchingLive.name);
            setDraftCreatives({ images: [], mediaSelection: "image" });
            setDraftDisabled(resolvedUser, true);
            try { purgeDraftStorages(resolvedUser); } catch {}
            if (adminClientId) {
              try { localStorage.removeItem(`u:adminClient:${adminClientId}:${CREATIVE_DRAFT_KEY}`); } catch {}
              try { localStorage.removeItem(`u:adminClient:${adminClientId}:sm_setup_creatives_backup_v1`); } catch {}
            }
            setSelectedCampaignId(_matchingLive.id);
            setExpandedId(_matchingLive.id);
          }
        }
      }
      // ───────────────────────────────────────────────────────────────────────

      // ✅ preload live creatives from backend so they show on incognito / other browsers
      await Promise.all(
        list.map(async (c) => {
          const campaignId = String(c?.id || "").trim();
          if (!campaignId) return;

          try {
            const creativesRes = await authFetch(
              `/facebook/adaccount/${acctId}/campaign/${campaignId}/creatives`
            );

            if (!creativesRes.ok || cancelled) return;

            const creativeData = await creativesRes.json().catch(() => ({}));
            const imgs = (Array.isArray(creativeData?.images) ? creativeData.images : [])
              .map(toAbsoluteMedia)
              .filter(Boolean)
              .slice(0, 2);

            const nextMeta = {
              headline: String(creativeData?.meta?.headline || "").trim(),
              body: String(creativeData?.meta?.body || "").trim(),
              link: String(creativeData?.meta?.link || "").trim(),
            };

            setCampaignCreativesMap((prev) => ({
              ...prev,
              [campaignId]: {
                images: imgs,
                mediaSelection: "image",
                meta: nextMeta,
              },
            }));

            const existingMap = readCreativeMap(resolvedUser, acctId);
            const prevSaved = existingMap[campaignId] || {};

            existingMap[campaignId] = {
              ...prevSaved,
              images: imgs,
              mediaSelection: "image",
              time: Date.now(),
              expiresAt:
                prevSaved?.expiresAt ||
                Date.now() + DEFAULT_CAMPAIGN_TTL_MS,
              name: prevSaved?.name || c?.name || "Untitled",
              meta: nextMeta,
            };

            writeCreativeMap(resolvedUser, acctId, existingMap);

            if (imgs.length) {
              saveFetchableImagesBackup(resolvedUser, imgs);
            }
          } catch {}
        })
      );
    })
    .catch(() => {});

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line
}, [fbConnected, selectedAccount, launched, draftCreatives?.images?.length, resolvedUser]);

  /* ===================== after FB connect, attach draft images into selected campaign creatives map ===================== */
  useEffect(() => {
    if (!cameFromFbConnect) return;
    if (!fbConnected) return;
    if (!selectedAccount) return;
    // Never attach draft creatives to a campaign after a successful launch
    if (isDraftDisabled(resolvedUser) || isDraftDisabledLegacy()) {
      setCameFromFbConnect(false);
      return;
    }

    const draftImages = (draftCreatives?.images || []).slice(0, 2).map(toAbsoluteMedia).filter(Boolean);
    if (!draftImages.length) {
      setCameFromFbConnect(false);
      return;
    }

    const targetCampaignId =
      (selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? selectedCampaignId : "") ||
      (Array.isArray(campaigns) && campaigns[0]?.id ? campaigns[0].id : "");

    if (!targetCampaignId) return;

    const acctId = String(selectedAccount).trim();

    const endMillis =
      endDate && !isNaN(new Date(`${endDate}T18:00:00`).getTime())
        ? new Date(`${endDate}T18:00:00`).getTime()
        : Date.now() + DEFAULT_CAMPAIGN_TTL_MS;

    attachDraftToCampaignIfEmpty({
      user: resolvedUser,
      acctId,
      campaignId: targetCampaignId,
      draftImages,
      expiresAt: endMillis,
      name: form?.campaignName || "Untitled",
    });

    setExpandedId(targetCampaignId);
    setSelectedCampaignId(targetCampaignId);

    setCameFromFbConnect(false);
  }, [
    cameFromFbConnect,
    fbConnected,
    selectedAccount,
    selectedCampaignId,
    campaigns,
    draftCreatives?.images,
    endDate,
    form?.campaignName,
    resolvedUser,
  ]);

useEffect(() => {
  // Hard guards — never call normal user optimizer/metrics endpoints in admin-client mode.
  // adminClientId IS in the dep array so this re-evaluates on every admin-mode transition.
  if (adminClientId) {
    console.debug('[CampaignSetup] metrics effect skipped — admin-client mode active', { adminClientId, expandedId });
    return;
  }
  if (!expandedId || !selectedAccount || expandedId === "__DRAFT__") return;

  // Safety net: if we have loaded adAccounts but selectedAccount doesn't match any of them,
  // this account belongs to a different session (e.g. stale localStorage from client mode).
  // Skip rather than calling endpoints that would 403.
  if (
    adAccounts.length > 0 &&
    !adAccounts.some(
      (a) => String(a?.id || "").replace(/^act_/, "") === String(selectedAccount || "")
    )
  ) {
    console.debug('[CampaignSetup] metrics effect skipped — selectedAccount not in adAccounts (stale?)', { selectedAccount });
    return;
  }

  const acctId = String(selectedAccount).trim();
  const campaignId = String(expandedId).trim();
  let cancelled = false;

  const loadCreativesOnce = async () => {
    try {
      const creativesRes = await authFetch(
        `/facebook/adaccount/${acctId}/campaign/${campaignId}/creatives`
      );

      if (!creativesRes.ok || cancelled) return;

      const data = await creativesRes.json().catch(() => ({}));

      const imgs = (Array.isArray(data?.images) ? data.images : [])
        .map(toAbsoluteMedia)
        .filter(Boolean)
        .slice(0, 2);

      const existingMap = readCreativeMap(resolvedUser, acctId);
      const prev = existingMap[campaignId] || {};

      // Only use campaign-specific meta — never bleed draft context (previewCopy/inferredLink)
      const nextHeadline = String(
        data?.meta?.headline ||
          prev?.meta?.headline ||
          ""
      ).trim();

      const nextBody = String(
        data?.meta?.body ||
          prev?.meta?.body ||
          ""
      ).trim();

      const nextLink = String(
        data?.meta?.link ||
          prev?.meta?.link ||
          ""
      ).trim();

      const nextImages =
        imgs.length > 0
          ? imgs
          : (Array.isArray(prev?.images) ? prev.images : [])
              .map(toAbsoluteMedia)
              .filter(Boolean)
              .slice(0, 2);

      setCampaignCreativesMap((m) => ({
        ...m,
        [campaignId]: {
          images: nextImages,
          mediaSelection: "image",
          meta: {
            headline: nextHeadline,
            body: nextBody,
            link: nextLink,
          },
        },
      }));

      existingMap[campaignId] = {
        ...prev,
        images: nextImages,
        mediaSelection: "image",
        time: Date.now(),
        expiresAt:
          prev?.expiresAt ||
          (endDate && !isNaN(new Date(`${endDate}T18:00:00`).getTime())
            ? new Date(`${endDate}T18:00:00`).getTime()
            : Date.now() + DEFAULT_CAMPAIGN_TTL_MS),
        name: prev?.name || data?.name || "Untitled",
        meta: {
          headline: nextHeadline,
          body: nextBody,
          link: nextLink,
        },
      };

      writeCreativeMap(resolvedUser, acctId, existingMap);
      if (nextImages.length) {
        saveFetchableImagesBackup(resolvedUser, nextImages);
      }
    } catch (err) {
      console.error("Failed to load creatives:", err);
    }
  };

  const pollLightweightData = async () => {
    try {
      const [metricsRes, summaryRes] = await Promise.allSettled([
        authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/metrics`),
        authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/optimizer-state`),
      ]);

      if (
        !cancelled &&
        metricsRes.status === "fulfilled" &&
        metricsRes.value?.ok
      ) {
        const data = await metricsRes.value.json().catch(() => ({}));
        const row = Array.isArray(data?.data) && data.data[0] ? data.data[0] : {};

        const impressions = Number(row?.impressions);
        const clicks = Number(row?.clicks);
        const spend = Number(row?.spend);
        const ctr = Number(row?.ctr);

        setMetricsMap((m) => ({
          ...m,
          [campaignId]: {
            impressions: Number.isFinite(impressions) ? impressions : 0,
            clicks: Number.isFinite(clicks) ? clicks : 0,
            ctr:
              Number.isFinite(ctr)
                ? ctr
                : Number.isFinite(impressions) &&
                  impressions > 0 &&
                  Number.isFinite(clicks)
                ? (clicks / impressions) * 100
                : 0,
            spend: Number.isFinite(spend) ? spend : 0,
          },
        }));
      }

if (
  !cancelled &&
  summaryRes.status === "fulfilled" &&
  summaryRes.value?.ok
) {
  const data = await summaryRes.value.json().catch(() => ({}));
  const optimizerState = data?.optimizerState || null;

  setOptimizerStateMap((m) => ({
    ...m,
    [campaignId]: optimizerState,
  }));

  const summary =
    getPublicSummaryFromOptimizerState(optimizerState) ||
    getFallbackPublicSummary();

  setPublicSummaryMap((m) => ({
    ...m,
    [campaignId]: summary,
  }));

  const optimizerCreativeState =
    getOptimizerCreativeStateFromOptimizerState(optimizerState);

  setOptimizerCreativeMap((m) => ({
    ...m,
    [campaignId]: optimizerCreativeState,
  }));


}
    } catch (err) {
      console.error("Failed to refresh campaign panel:", err);
    }
  };

  loadCreativesOnce();
  pollLightweightData();

  const interval = setInterval(pollLightweightData, 60000);

  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}, [
  adminClientId,       // re-check guard on every admin-mode transition
  adAccounts.length,   // re-check account-validation safety net
  expandedId,
  selectedAccount,
  resolvedUser,
  endDate,
  previewCopy?.headline,
  previewCopy?.body,
  previewCopy?.link,
  inferredLink,
]);
  // Persist
  useEffect(() => {
    lsSet(resolvedUser, "smartmark_last_campaign_fields", JSON.stringify({ ...form, startDate, endDate }));
  }, [form, startDate, endDate]);
  useEffect(() => {
    lsSet(resolvedUser, "smartmark_last_budget", budget);
  }, [budget]);

useEffect(() => {
  // no-op now; billing is controlled by Stripe subscription status
}, [budget, resolvedUser]);


useEffect(() => {
  const normalizedSelectedAccount = String(selectedAccount || "").replace(/^act_/, "").trim();
  const availableAccountIds = (adAccounts || [])
    .map((a) => String(a?.id || "").replace(/^act_/, "").trim())
    .filter(Boolean);

  const hasValidConnectedAccount =
    !!fbConnected &&
    !!normalizedSelectedAccount &&
    availableAccountIds.includes(normalizedSelectedAccount);

  if (adminClientId) {
    // Admin-client mode: persist under the client's own scope key, never under TheBoss.
    if (hasValidConnectedAccount) {
      lsSet(`adminClient:${adminClientId}`, "smartmark_last_selected_account", normalizedSelectedAccount, false);
    }
    return; // Never touch TheBoss's localStorage keys in admin-client mode
  }

  // Normal user mode — write ONLY to the user-namespaced key, never the bare key.
  if (hasValidConnectedAccount) {
    lsSet(resolvedUser, "smartmark_last_selected_account", normalizedSelectedAccount, false);
    return;
  }

  try {
    localStorage.removeItem("smartmark_last_selected_account");
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_account"));
  } catch {}
}, [adminClientId, selectedAccount, adAccounts, fbConnected, resolvedUser]);

useEffect(() => {
  const normalizedSelectedPageId = String(selectedPageId || "").trim();
  const availablePageIds = (pages || [])
    .map((p) => String(p?.id || "").trim())
    .filter(Boolean);

  const hasValidConnectedPage =
    !!fbConnected &&
    !!normalizedSelectedPageId &&
    availablePageIds.includes(normalizedSelectedPageId);

  if (adminClientId) {
    // Admin-client mode: persist under the client's own scope key, never under TheBoss.
    if (hasValidConnectedPage) {
      lsSet(`adminClient:${adminClientId}`, "smartmark_last_selected_pageId", normalizedSelectedPageId, false);
    }
    return; // Never touch TheBoss's localStorage keys in admin-client mode
  }

  // Normal user mode — write ONLY to the user-namespaced key, never the bare key.
  if (hasValidConnectedPage) {
    lsSet(resolvedUser, "smartmark_last_selected_pageId", normalizedSelectedPageId, false);
    return;
  }

  try {
    localStorage.removeItem("smartmark_last_selected_pageId");
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_pageId"));
  } catch {}
}, [adminClientId, selectedPageId, pages, fbConnected, resolvedUser]);

// Persist selection to server so it survives cross-device / cross-browser refreshes.
// In admin-client mode: passes adminClientId in the body so the backend saves under
// the CLIENT's ownerKey, not TheBoss's.
// Guard: only saves when the selected account is confirmed in the current adAccounts
// list — this prevents a race-condition where adminClientId clears before fbConnected
// does, which would otherwise save the client's account under TheBoss's ownerKey.
useEffect(() => {
  // Hard stop during exit — prevents the stale client selection from being written
  // under TheBoss's ownerKey while React batches haven't committed yet.
  if (isExitingAdminClientModeRef.current) {
    console.debug("[FB Save Guard] skipped stale client save", { adminClientId, selectedAccount });
    return;
  }
  if (!fbConnected || !selectedAccount) return;

  const normalizedAccount = String(selectedAccount).replace(/^act_/, '').trim();
  const availableIds = (adAccounts || [])
    .map((a) => String(a?.id || '').replace(/^act_/, '').trim())
    .filter(Boolean);

  // If the account is not in the current list, we're mid-transition — skip.
  if (!availableIds.includes(normalizedAccount)) return;

  const scope = adminClientId ? `adminClient:${adminClientId}` : resolvedUser;
  console.debug('[FB Selection Scope]', { adminClientId, scope, selectedAccount, selectedPageId });
  console.log('[FB Selection API] saving for ownerKey:', adminClientId ? `user:${adminClientId}` : `user:${resolvedUser || '(sid)'}`);

  const sid = getStoredSid();
  const headers = { 'Content-Type': 'application/json' };
  if (sid) headers['x-sm-sid'] = sid;
  const accountName = (adAccounts.find((a) => String(a.id).replace(/^act_/, '') === selectedAccount) || {}).name || '';
  const pageName = (pages.find((p) => String(p.id) === selectedPageId) || {}).name || '';
  fetch('/api/facebook/selection', {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify({
      adAccountId: selectedAccount,
      pageId: selectedPageId || '',
      adAccountName: accountName,
      pageName,
      ...(adminClientId ? { adminClientId } : {}),
    }),
  }).catch(() => {});
  // eslint-disable-next-line
}, [selectedAccount, selectedPageId, fbConnected, adminClientId, adAccounts.length]);

// ── Selection guards ────────────────────────────────────────────────────────
// After accounts/pages load, clear any selectedAccount/selectedPageId that
// is not in the currently loaded list. This is the last line of defence
// against a stale selection surviving login cleanup or a context switch.
useEffect(() => {
  if (adminClientId) return; // admin-client uses its own clear-on-switch logic
  if (!adAccounts.length) return; // list not loaded yet — don't clear prematurely
  if (!selectedAccount) return;
  const available = adAccounts.map((a) => String(a.id || "").replace(/^act_/, "").trim()).filter(Boolean);
  if (!available.includes(String(selectedAccount).replace(/^act_/, "").trim())) {
    console.debug("[Setup Selection Guard] cleared stale account", { selectedAccount, available });
    setSelectedAccount("");
  }
  // eslint-disable-next-line
}, [adAccounts, adminClientId]);

useEffect(() => {
  if (adminClientId) return;
  if (!pages.length) return;
  if (!selectedPageId) return;
  const available = pages.map((p) => String(p.id || "").trim()).filter(Boolean);
  if (!available.includes(String(selectedPageId).trim())) {
    console.debug("[Setup Selection Guard] cleared stale page", { selectedPageId, available });
    setSelectedPageId("");
  }
  // eslint-disable-next-line
}, [pages, adminClientId]);
// ────────────────────────────────────────────────────────────────────────────

// Disconnect Facebook for the current context only.
// In normal mode: clears TheBoss's token. In admin-client mode: clears the client's token.
// Never touches other clients or TheBoss when disconnecting a client.
const handleFbDisconnect = async () => {
  setDisconnecting(true);
  try {
    const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const headers = { "Content-Type": "application/json" };
    if (sid) headers["x-sm-sid"] = sid;
    const r = await fetch("/auth/facebook/disconnect", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(adminClientId ? { adminClientId } : {}),
    });
    if (!r.ok) throw new Error("Disconnect failed");

    // Clear only the current context's FB state
    setFbConnected(false);
    setFbConnectionStatus("not_connected");
    setFbExpired(false);
    setAdAccounts([]);
    setPages([]);
    setSelectedAccount("");
    setSelectedPageId("");
    try { localStorage.removeItem(FB_CONN_KEY); } catch {}
    if (!adminClientId) {
      // TheBoss normal mode — clear TheBoss's localStorage selection keys only
      try {
        localStorage.removeItem("smartmark_last_selected_account");
        localStorage.removeItem("smartmark_last_selected_pageId");
        if (resolvedUser) {
          localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_account"));
          localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_pageId"));
        }
      } catch {}
    }
    // Admin-client mode: client keys live under u:adminClient:* which is already isolated
    setShowDisconnectConfirm(false);
  } catch {
    alert("Disconnect failed. Please try again.");
  } finally {
    setDisconnecting(false);
  }
};


// Re-fetches the admin-client campaign list after any campaign control action.
// statusOverrides: plain object snapshot from recentStatusOverridesRef.current —
// ensures a fresh verified PAUSED status is never overwritten by a stale DB ACTIVE.
// currentSelectedId: the currently selected campaign ID — logged for debugging but NOT
// auto-changed here; the selection is preserved because the dropdown options now include
// PAUSED campaigns (fixed in isUsefulCurrentCampaign).
function refreshAdminCampaigns(adminClientId, setCampaigns, setMetricsMap, setOptimizerStateMap, setCampaignCreativesMap, statusOverrides, currentSelectedId) {
  if (!adminClientId) return Promise.resolve();
  const enc = encodeURIComponent(adminClientId);
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  const headers = sid ? { "x-sm-sid": sid } : {};
  console.debug("[campaign-control-refresh]", { adminClientId });
  return fetch(`/api/admin/clients/${enc}/campaigns`, { credentials: "include", headers })
    .then((r) => r.json().catch(() => ({})))
    .then((j) => {
      if (!j.ok || !Array.isArray(j.campaigns)) return;
      const now = Date.now();
      // Apply fresh status overrides so a stale DB response never reverts a
      // just-verified pause/unpause that came back from Meta seconds ago.
      const list = j.campaigns.map((c) => {
        const ov = statusOverrides?.[c.id];
        if (ov && now < ov.expiresAt) {
          return {
            ...c,
            status: ov.status,
            effective_status: ov.status,
            currentStatus: ov.status,
          };
        }
        return c;
      });
      // Log whether the current selection is preserved
      if (currentSelectedId && currentSelectedId !== "__DRAFT__") {
        const found = list.find((c) => String(c.id) === String(currentSelectedId));
        console.debug("[campaign-selection-preserve]", {
          selectedCampaignId: currentSelectedId,
          existsInRefreshedList: !!found,
          status: found ? String(found.status || found.effective_status || "") : "—",
          kept: !!found,
          reason: found ? "campaign found in refreshed list" : "campaign not in refreshed list",
        });
      }
      setCampaigns(list);
      const newMetrics = {}, newOptStates = {}, newCreatives = {};
      for (const c of list) {
        if (!c.id) continue;
        if (c.metrics) newMetrics[c.id] = c.metrics;
        if (c.optimizerState) newOptStates[c.id] = c.optimizerState;
        const hasCreative = (c.images?.length > 0) || c.meta?.headline || c.meta?.body;
        if (hasCreative) {
          newCreatives[c.id] = {
            images: (c.images || []).filter(Boolean),
            mediaSelection: c.mediaSelection || "image",
            meta: { headline: c.meta?.headline || "", body: c.meta?.body || "", link: c.meta?.link || "" },
          };
        }
      }
      if (Object.keys(newMetrics).length) setMetricsMap((m) => ({ ...m, ...newMetrics }));
      if (Object.keys(newOptStates).length) setOptimizerStateMap((m) => ({ ...m, ...newOptStates }));
      if (Object.keys(newCreatives).length) setCampaignCreativesMap((m) => ({ ...m, ...newCreatives }));
    })
    .catch(() => {});
}

// Helper: fetch wrapper for admin-client campaign control routes.
// Uses the dedicated /api/admin/clients/:id/campaign/:id/:action endpoint
// which always resolves the CLIENT's FB token, never TheBoss's.
async function adminCampaignControlFetch(adminClientId, campaignId, action, accountId) {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  const headers = { "Content-Type": "application/json" };
  if (sid) headers["x-sm-sid"] = sid;
  const url = `/api/admin/clients/${encodeURIComponent(adminClientId)}/campaign/${encodeURIComponent(campaignId)}/${action}`;
  console.log("[campaign-control]", { action, adminClientId, campaignId, accountId, url });
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ accountId }),
  });
}

const handlePauseUnpauseCampaign = async (campaignId, currentlyPaused) => {
  if (!campaignId || !selectedAccount || campaignId === "__DRAFT__") return;

  const acctId = String(selectedAccount).trim();
  const action = currentlyPaused ? "unpause" : "pause";

  setLoading(true);
  try {
    // Admin-client mode: use dedicated admin route that resolves the CLIENT's FB token.
    // Normal mode: use existing authFetch which resolves from TheBoss's session.
    const r = adminClientId
      ? await adminCampaignControlFetch(adminClientId, campaignId, action, acctId)
      : await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/${action}`, { method: "POST" });

    if (!r.ok) throw new Error(`${action} failed`);

    // Use Meta-verified status from backend response (effectiveStatus > metaStatus > fallback)
    const data = await r.json().catch(() => ({}));
    const verifiedStatus = (data.effectiveStatus || data.metaStatus || (currentlyPaused ? "ACTIVE" : "PAUSED")).toUpperCase();
    const metaConfirmed = !!(data.effectiveStatus || data.metaStatus);
    const lastCheckedAt = data.lastStatusCheckedAt || new Date().toISOString();

    // Store override so a stale DB refresh won't revert the verified status for 60 s
    recentStatusOverridesRef.current[campaignId] = {
      status: verifiedStatus,
      metaConfirmed,
      verifiedAt: lastCheckedAt,
      expiresAt: Date.now() + 60000,
    };

    // Apply to local campaigns list immediately
    setCampaigns((prev) =>
      Array.isArray(prev)
        ? prev.map((c) =>
            c?.id === campaignId
              ? { ...c, status: verifiedStatus, effective_status: verifiedStatus, currentStatus: verifiedStatus }
              : c
          )
        : prev
    );

    if (selectedCampaignId === campaignId) {
      setCampaignStatus(verifiedStatus);
      setIsPaused(verifiedStatus === "PAUSED");
    }

    console.debug("[campaign-control-ui-success]", { action, campaignId, adminClientId, verifiedStatus, metaConfirmed });
    console.debug("[campaign-control-local-status]", { campaignId, status: verifiedStatus, metaConfirmed });

    // Re-fetch campaigns — pass overrides so stale DB response can't revert the verified status
    if (adminClientId) {
      await refreshAdminCampaigns(adminClientId, setCampaigns, setMetricsMap, setOptimizerStateMap, setCampaignCreativesMap, recentStatusOverridesRef.current, selectedCampaignId);
    }
  } catch {
    alert("Could not update campaign status.");
  }
  setLoading(false);
};

const handleArchiveCampaign = async (campaignId) => {
  if (!campaignId || campaignId === "__DRAFT__" || !selectedAccount) return;
  // Defense-in-depth: this function's admin-client branch calls the Meta "cancel" route,
  // which is NOT Smartemark-only. Block it unconditionally even if the button is hidden.
  // Admin-client campaigns must use handleStopArchiveOnMeta instead.
  if (adminClientId) {
    alert("Use Delete / Stop Campaign for admin-managed campaigns.");
    return;
  }
  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  setLoading(true);
  try {
    const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/archive`, { method: "PATCH" });
    if (!r.ok) throw new Error("Archive failed");
    setCampaigns((prev) =>
      Array.isArray(prev)
        ? prev.map((c) => (c?.id === campaignId ? { ...c, smArchived: true, currentStatus: "ARCHIVED" } : c))
        : prev
    );
    setShowCampaignMenu(false);
    if (selectedCampaignId === campaignId) {
      const nextActive = (campaigns || []).find((c) => c.id !== campaignId && !c.smArchived);
      // Never fall back to __DRAFT__ — pick another live campaign or clear selection
      setSelectedCampaignId(nextActive?.id || "");
      setExpandedId(nextActive?.id || null);
    }
    console.debug("[campaign-control-ui-success]", { action: "archive", campaignId });
  } catch {
    alert("Could not archive campaign.");
  }
  setLoading(false);
};

const handleUnarchiveCampaign = async (campaignId) => {
  if (!campaignId || campaignId === "__DRAFT__" || !selectedAccount) return;
  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  setLoading(true);
  try {
    const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/unarchive`, {
      method: "PATCH",
    });
    if (!r.ok) throw new Error("Unarchive failed");
    setCampaigns((prev) =>
      Array.isArray(prev)
        ? prev.map((c) => (c?.id === campaignId ? { ...c, smArchived: false } : c))
        : prev
    );
    setShowCampaignMenu(false);
  } catch {
    alert("Could not unarchive campaign.");
  }
  setLoading(false);
};

const handleHideFromHistory = async (campaignId) => {
  if (!campaignId || campaignId === "__DRAFT__") return;

  // Remove from ALL frontend state maps immediately — the goal is instant UI cleanup.
  // Backend call follows; if it fails we show a warning but do not reinsert the campaign.
  setCampaigns((prev) =>
    Array.isArray(prev) ? prev.filter((c) => c.id !== campaignId) : prev
  );
  setMetricsMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
  setOptimizerStateMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
  setCampaignCreativesMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
  setPublicSummaryMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
  setOptimizerCreativeMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
  setShowCampaignMenu(false);
  setShowArchived(false);

  const remaining = (campaigns || []).filter(
    (c) => c.id !== campaignId && !c.smArchived && !c.hiddenFromHistory
  );
  setSelectedCampaignId(remaining[0]?.id || "");
  setExpandedId(remaining[0]?.id || null);

  // Persist to backend — does NOT call Meta. Only sets local hiddenFromHistory flag.
  setLoading(true);
  try {
    let r;
    if (adminClientId) {
      const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      r = await fetch(
        `/api/admin/clients/${encodeURIComponent(adminClientId)}/campaign/${campaignId}/hide-history`,
        { method: "PATCH", credentials: "include", headers: _sid ? { "x-sm-sid": _sid } : {} }
      );
    } else {
      if (!selectedAccount) { setLoading(false); return; }
      const acctId = String(selectedAccount).trim().replace(/^act_/, "");
      r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/hide-history`, {
        method: "PATCH",
      });
    }
    if (!r.ok) {
      // Campaign removed from UI. Backend failed — on next reload it may reappear.
      // Non-critical: the DB record can be cleaned up manually via the cleanup endpoint.
      console.warn("[Smartemark] hide-history backend failed for", campaignId, "— removed from UI only");
    }
  } catch {
    console.warn("[Smartemark] hide-history request error for", campaignId);
  }
  setLoading(false);
};

// ── AI Control Settings ────────────────────────────────────────────────────
const loadAiSettings = async (campaignId, acctId) => {
  if (!campaignId || campaignId === "__DRAFT__") return;
  try {
    let r;
    if (adminClientId) {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      r = await fetch(
        `/api/admin/clients/${encodeURIComponent(adminClientId)}/campaign/${encodeURIComponent(campaignId)}/ai-settings`,
        { credentials: "include", headers: sid ? { "x-sm-sid": sid } : {} }
      );
    } else {
      r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/ai-settings`);
    }
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      setAiSettings({
        aiSettingsInitialized: d.aiSettingsInitialized === true,
        aiAutopilotEnabled:    d.aiAutopilotEnabled === true,
        aiApprovalRequired:    d.aiApprovalRequired !== false,
      });
    }
  } catch {}
};

const saveAiSettings = async (patch) => {
  if (!selectedCampaignId || selectedCampaignId === "__DRAFT__" || !selectedAccount) return;
  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  const next = { ...aiSettings, ...patch };
  setAiSettings(next);
  setAiSettingsSaving(true);
  try {
    let r;
    if (adminClientId) {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      r = await fetch(
        `/api/admin/clients/${encodeURIComponent(adminClientId)}/campaign/${encodeURIComponent(selectedCampaignId)}/ai-settings`,
        {
          method: "PATCH", credentials: "include",
          headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
          body: JSON.stringify(next),
        }
      );
    } else {
      r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
    }
    if (!r.ok) throw new Error("Save failed");
  } catch {
    // Non-critical — settings are already shown in local state
  }
  setAiSettingsSaving(false);
};
// ──────────────────────────────────────────────────────────────────────────

// Stops the campaign on Meta (ARCHIVED or PAUSED), pauses all adsets/ads, then removes
// it from the Smartemark active list. This is the only safe way to guarantee no further
// Meta spend. Distinct from handleHideFromHistory which is Smartemark-only.
const handleStopArchiveOnMeta = async (campaignId) => {
  if (!campaignId || campaignId === "__DRAFT__" || !selectedAccount) return;
  setArchiveMetaConfirmId(null);
  setShowCampaignMenu(false);
  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  setLoading(true);
  try {
    let r;
    if (adminClientId) {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const headers = { "Content-Type": "application/json" };
      if (sid) headers["x-sm-sid"] = sid;
      r = await fetch(
        `/api/admin/clients/${encodeURIComponent(adminClientId)}/campaign/${encodeURIComponent(campaignId)}/archive-meta`,
        { method: "POST", credentials: "include", headers, body: JSON.stringify({ accountId: acctId }) }
      );
    } else {
      r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/archive-meta`, {
        method: "POST",
      });
    }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Failed to stop campaign on Meta");

    // Remove from all frontend state maps
    setCampaigns((prev) =>
      Array.isArray(prev) ? prev.filter((c) => c.id !== campaignId) : prev
    );
    setMetricsMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
    setOptimizerStateMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
    setCampaignCreativesMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
    setPublicSummaryMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });
    setOptimizerCreativeMap((prev) => { const { [campaignId]: _, ...rest } = prev || {}; return rest; });

    // Select next non-archived campaign — never fall back to __DRAFT__
    const remaining = (campaigns || []).filter(
      (c) => c.id !== campaignId && !c.smArchived && !c.hiddenFromHistory
    );
    setSelectedCampaignId(remaining[0]?.id || "");
    setExpandedId(remaining[0]?.id || null);

    console.debug("[campaign-control-ui-success]", { action: "archive-meta", campaignId, adminClientId, metaStatus: data.metaStatus });
    alert("Campaign stopped on Meta and archived in Smartemark.");
  } catch (e) {
    alert("Could not stop campaign on Meta: " + (e?.message || ""));
  }
  setLoading(false);
};

const handleSaveCopyEdit = async () => {
  const trimmedText = String(copyEditPrimaryText || "").trim();
  if (!trimmedText) {
    setCopyEditError("Primary text cannot be blank.");
    return;
  }
  if (!selectedCampaignId || selectedCampaignId === "__DRAFT__" || !selectedAccount) return;

  const acctId = String(selectedAccount).trim().replace(/^act_/, "");
  setCopyEditLoading(true);
  setCopyEditError(null);

  try {
    const r = await authFetch(
      `/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/copy`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryText: trimmedText,
          headline: String(copyEditHeadline || "").trim() || undefined,
          // In admin-client mode pass ownerKey so backend uses client token, not TheBoss's.
          ...(adminClientId ? { ownerKey: `user:${adminClientId}` } : {}),
        }),
      }
    );

    const data = await r.json().catch(() => ({}));

    // Backend returns ok:true + metaUpdateFailed:true when Smartemark saved the copy
    // but the live Meta ad could not be updated (e.g. token resolved to wrong context).
    if (data?.metaUpdateFailed) {
      const updatedText = String(data?.updatedPrimaryText || trimmedText).trim();
      setOptimizerStateMap((prev) => ({
        ...prev,
        [selectedCampaignId]: { ...(prev[selectedCampaignId] || {}), currentPrimaryText: updatedText },
      }));
      setCopyEditMode(false);
      alert(data.message || "Copy saved in Smartemark. Apply-to-live-ad support will be added separately.");
      return;
    }

    if (!r.ok) throw new Error(data?.error || `Copy update failed (HTTP ${r.status})`);

    // Immediately update the optimizer state map so the UI reflects the new copy
    // without waiting for the next optimizer-state poll.
    const updatedText = String(data?.updatedPrimaryText || trimmedText).trim();
    setOptimizerStateMap((prev) => ({
      ...prev,
      [selectedCampaignId]: {
        ...(prev[selectedCampaignId] || {}),
        currentPrimaryText: updatedText,
      },
    }));

    setCopyEditMode(false);
  } catch (err) {
    setCopyEditError(err.message || "Copy update failed. Please try again.");
  } finally {
    setCopyEditLoading(false);
  }
};

const handleDeleteCampaign = async (campaignId) => {
  const idToDelete = String(campaignId || "").trim();

  if (!idToDelete || idToDelete === "__DRAFT__") {
    // Safety: if any live campaign in the current list has the same name as the
    // current draft, the draft was already launched — deleting it locally would
    // hide the campaign from Smartemark while it continues spending on Meta.
    const _safeDraftName = String(form?.campaignName || "").trim().toLowerCase();
    if (_safeDraftName && Array.isArray(campaigns) && campaigns.length > 0) {
      const _hasLaunchedMatch = campaigns.some((c) => {
        if (c.smArchived || c.hiddenFromHistory) return false;
        const _cName = String(c.name || "").trim().toLowerCase();
        const _cSt   = String(c.status || c.effective_status || "").toUpperCase();
        const _isLive = c.launchComplete === true ||
          ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"].includes(_cSt);
        return _isLive && _cName === _safeDraftName;
      });
      if (_hasLaunchedMatch) {
        alert("This campaign has launched on Meta. Use Delete / Stop Campaign to stop it safely.");
        return;
      }
    }
  handleClearDraft();
  purgeDraftArtifactsEverywhere();
  setDraftDisabled(resolvedUser, true);
  setSelectedCampaignId("");
  setExpandedId(null);
  setShowCampaignMenu(false);
  return;
}

  // Defense-in-depth: in admin-client mode this function would call the Meta "cancel"
  // route via adminCampaignControlFetch. That must never happen — use Stop & Archive on Meta.
  if (adminClientId) {
    alert("Use Delete / Stop Campaign for admin-managed campaigns.");
    return;
  }

  if (!selectedAccount) {
    alert("No ad account selected.");
    return;
  }

  const acctId = String(selectedAccount).trim().replace(/^act_/, "");

  if (!window.confirm("Delete this campaign?")) return;

  setLoading(true);
  try {
    const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${idToDelete}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) {
      throw new Error(j?.error || j?.message || "Delete failed");
    }

    try {
      const map = readCreativeMap(resolvedUser, acctId);
      if (map && map[idToDelete]) {
        delete map[idToDelete];
        writeCreativeMap(resolvedUser, acctId, map);
      }
    } catch {}

    const nextCampaigns = Array.isArray(campaigns)
      ? campaigns.filter((c) => String(c?.id || "") !== idToDelete)
      : [];

    setCampaigns(nextCampaigns);

    setMetricsMap((m) => {
      const { [idToDelete]: removed, ...rest } = m || {};
      return rest;
    });

    setPublicSummaryMap((m) => {
      const { [idToDelete]: removed, ...rest } = m || {};
      return rest;
    });

    setOptimizerCreativeMap((m) => {
      const { [idToDelete]: removed, ...rest } = m || {};
      return rest;
    });

    setOptimizerStateMap((m) => {
      const { [idToDelete]: removed, ...rest } = m || {};
      return rest;
    });

    setCampaignCreativesMap((m) => {
      const { [idToDelete]: removed, ...rest } = m || {};
      return rest;
    });

    // Pick next active (non-archived) campaign — never fall back to __DRAFT__
    const nextActive = nextCampaigns.find((c) => !c.smArchived && String(c.id || "").trim());
    const fallbackId = nextActive?.id ? String(nextActive.id).trim() : "";

    console.debug("[campaign-control-selection-after-cancel]", {
      deletedCampaignId: idToDelete,
      nextSelectedCampaignId: fallbackId || "(none)",
    });

    if (selectedCampaignId === idToDelete) {
      setSelectedCampaignId(fallbackId || "");
    }

    if (expandedId === idToDelete) {
      setExpandedId(fallbackId || null);
    }

    setShowCampaignMenu(false);
    setCampaignStatus("ARCHIVED");
    setLaunched(false);
    setLaunchResult(null);

    alert("Campaign canceled and removed from active list.");
  } catch (e) {
    alert("Could not delete campaign: " + (e?.message || ""));
  } finally {
    setLoading(false);
  }
};

  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    // Clear all stale form/creative/image-cache/ctxKey state so FormPage starts completely fresh
    purgeDraftArtifactsEverywhere();
    // Re-enable draft saving for the new campaign (may have been disabled after a prior launch)
    setDraftDisabled(resolvedUser, false);
    // Mint a fresh ctxKey so FormPage's restore logic never matches the old campaign's draft
    const freshCtx = `${Date.now()}|new||`;
    setActiveCtx(freshCtx, resolvedUser);
    navigate(withAdminClientQuery("/form", adminClientId));
  };

const adminActive = true;

 const canLaunch = !!(
  fbConnected &&
  selectedAccount &&
  selectedPageId &&
  budget &&
  !isNaN(parseFloat(budget)) &&
  parseFloat(budget) >= 3
);

  function capTwoWeeksISO(startISO, endISO) {
    try {
      if (!startISO && !endISO) return { startISO: null, endISO: null };
      const start = startISO ? new Date(startISO) : new Date();
      let end = endISO ? new Date(endISO) : null;
      const maxEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (!end) end = maxEnd;
      if (end > maxEnd) end = maxEnd;
      if (end <= start) end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    } catch {
      return { startISO: null, endISO: null };
    }
  }

 const refreshBillingStatus = async () => {
  try {
    setBillingLoading(true);

   const r = await stripeFetch(`/api/stripe/billing-status`, {
  method: "GET",
});

    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j?.ok) {
      setBillingInfo({
        checked: true,
        hasAccess: false,
        planKey: "",
        status: "",
        email: "",
        username: "",
      });
      return false;
    }

    const resolvedPlanKey = String(j?.billing?.planKey || "").trim();
    console.log("[SM] billing-status received:", {
      planKey: resolvedPlanKey || "(empty)",
      hasAccess: j?.billing?.hasAccess,
      status: j?.billing?.status,
      subId: j?.billing?.stripeSubscriptionId
        ? `…${String(j.billing.stripeSubscriptionId).slice(-8)}`
        : "(none)",
    });

    setBillingInfo({
      checked: true,
      hasAccess: !!j?.billing?.hasAccess,
      planKey: resolvedPlanKey,
      status: String(j?.billing?.status || "").trim(),
      email: String(j?.user?.email || "").trim(),
      username: String(j?.user?.username || "").trim(),
      monthlyPrice: Number(j?.billing?.monthlyPrice || 0),
    });

    return !!j?.billing?.hasAccess;
  } catch {
    setBillingInfo({
      checked: true,
      hasAccess: false,
      planKey: "",
      status: "",
      email: "",
      username: "",
    });
    return false;
  } finally {
    setBillingLoading(false);
  }
};

const handleSubscribeToPlan = async () => {
  if (!selectedPlan) {
    alert("Please choose a plan.");
    return;
  }

  setBillingLoading(true);

  try {
    const currentEmail =
      String(localStorage.getItem("sm_current_user") || "").trim().toLowerCase() ||
      String(loginUser || "").trim().toLowerCase();

    const loggedInUser = getUserFromStorage();
    const endpoint = loggedInUser
      ? `/api/stripe/create-checkout-session-auth`
      : `/api/stripe/create-checkout-session`;

    const bodyPayload = loggedInUser
      ? {
          plan: selectedPlan,
          launchIntent: "1",
        }
      : {
          plan: selectedPlan,
          email: /\S+@\S+\.\S+/.test(currentEmail) ? currentEmail : undefined,
          launchIntent: "1",
        };

    const res = await stripeFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(json?.error || "Could not open checkout.");
    }

    if (!json?.url) {
      throw new Error("Stripe checkout URL missing.");
    }

    window.location.assign(json.url);
  } catch (err) {
    alert(err?.message || "Could not open checkout.");
  } finally {
    setBillingLoading(false);
  }
};

const handleCancelPlan = async () => {
  const yes = window.confirm("Cancel your plan now? This will stop future recurring payments.");
  if (!yes) return;

  try {
    setBillingLoading(true);

    const res = await stripeFetch(`/api/stripe/cancel-subscription`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Could not cancel subscription.");
    }

    await refreshBillingStatus();
    alert("Your plan has been canceled.");
  } catch (err) {
    alert(err?.message || "Could not cancel subscription.");
  } finally {
    setBillingLoading(false);
  }
};

const handleUpgradePlan = async (nextPlanKey) => {
  try {
    setBillingLoading(true);

    const res = await stripeFetch(`/api/stripe/change-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: nextPlanKey }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error || "Could not update plan.");
    }

    await refreshBillingStatus();
    alert(`Plan updated to ${json?.planName || nextPlanKey}.`);
  } catch (err) {
    alert(err?.message || "Could not update plan.");
  } finally {
    setBillingLoading(false);
  }
};

function isValidHttpUrl(u) {
  try {
    const x = new URL(String(u || "").trim());
    return x.protocol === "http:" || x.protocol === "https:";
  } catch {
    return false;
  }
}

// Creates a PAUSED campaign/adset/ad on Meta for review before committing to a live launch.
const handleCreateDraft = async () => {
  if (!fbConnected || !selectedAccount || !selectedPageId) return;
  setDraftCreatingState("creating");
  setDraftError(null);

  try {
    const imageUrls = Array.isArray(draftCreatives?.images) ? draftCreatives.images : [];
    const rawImage = imageUrls[0] || "";
    // Convert relative/same-origin URLs to absolute Render URLs so Meta can fetch them
    const imageUrl = rawImage && !/^data:/i.test(rawImage)
      ? rawImage.replace(/^\//, `${RENDER_MEDIA_ORIGIN}/`)
      : "";

    const sid = getStoredSid();
    const headers = { "Content-Type": "application/json" };
    if (sid) headers["x-sm-sid"] = sid;

    const r = await fetch("/api/facebook/create-draft", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        adAccountId: selectedAccount,
        pageId: selectedPageId,
        imageUrl: imageUrl || "",
        primaryText: previewCopy?.body || body || "",
        headline: previewCopy?.headline || headline || "",
        destinationUrl: previewCopy?.link || inferredLink || "",
        dailyBudget: parseFloat(budget) || 5,
        campaignName: form.campaignName || previewCopy?.headline || "Draft Review",
        adminClientId: adminClientId || "",
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "Draft creation failed");

    setMetaDraft(data.draft);
    setDraftCreatingState(null);
  } catch (err) {
    setDraftError(String(err?.message || "Draft creation failed"));
    setDraftCreatingState(null);
  }
};

// Activates the already-created PAUSED draft — transitions it to a live campaign.
const handleLaunchDraft = async () => {
  if (!metaDraft?.id) return;
  setDraftCreatingState("launching");
  setDraftError(null);

  try {
    const sid = getStoredSid();
    const headers = { "Content-Type": "application/json" };
    if (sid) headers["x-sm-sid"] = sid;

    const r = await fetch("/api/facebook/launch-draft", {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify({
        draftId: metaDraft.id,
        adminClientId: adminClientId || "",
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error(data.error || "Launch failed");

    setMetaDraft(data.draft);
    setDraftCreatingState(null);
    setLaunched(true);
    setLaunchResult(data);
  } catch (err) {
    setDraftError(String(err?.message || "Launch failed"));
    setDraftCreatingState(null);
  }
};

const handleLaunch = async () => {
  if (!billingInfo?.hasAccess) {
    const loggedInUser = getUserFromStorage();

    savePendingLaunch(
      buildPendingLaunchPayload({
        selectedPlan,
        budget,
        startDate,
        endDate,
        selectedAccount,
        selectedPageId,
        form,
        answers,
        headline,
        body,
        inferredLink,
        previewCopy,
        draftCreatives,
        navImageUrls,
      })
    );

    if (!loggedInUser) {
      navigate("/signup", {
        state: {
          selectedPlan,
          fromSetup: true,
          launchIntent: true,
          returnTo: "/setup",
        },
      });
      return;
    }

    setPendingLaunchAfterCheckout(true);
    setShowPlanModal(true);
    return;
  }

  // Pre-launch date guard: if the end date is already in the past, block before hitting the API
  if (endDate && new Date(`${endDate}T23:59:59`).getTime() <= Date.now()) {
    alert("Your campaign dates have expired. Please choose a future end date and try again.");
    return;
  }

  setLoading(true);
    try {
const acctId = String(selectedAccount || "").trim().replace(/^act_/, "");
const pageId = String(selectedPageId || "").trim();
const safeBudget = Math.max(3, Number(budget) || 0);

const { startISO, endISO } = capTwoWeeksISO(
  startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null,
  endDate ? new Date(`${endDate}T18:00:00`).toISOString() : null
);

const websiteUrl = (() => {
  // When answers came from the current FormPage session (any key populated), treat
  // answers.url as the single authoritative URL. If the user left it blank, stay blank —
  // do NOT silently substitute stale form/localStorage values from another session or client.
  if (_answersFromState) {
    let raw = String(answers?.url || answers?.websiteUrl || answers?.website || answers?.link || "").trim();
    if (!raw) return ""; // user intentionally left URL blank — honor it
    raw = raw.replace(/\s+/g, "");
    if (raw.startsWith("//")) raw = "https:" + raw;
    if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
    console.debug("[URL] from answers (route state):", raw);
    return raw;
  }

  // Route state was lost (page refresh, direct navigation): use full fallback chain.
  let raw = (
    form?.websiteUrl ||
    form?.website ||
    inferredLink ||
    previewCopy?.link ||
    ""
  ).toString().trim();

  // Mobile fallback: FORM_DRAFT_KEY may have the URL when route state is gone.
  if (!raw) {
    try {
      const draftRaw = lsGet(resolvedUser, FORM_DRAFT_KEY) || localStorage.getItem(FORM_DRAFT_KEY);
      if (draftRaw) {
        const saved = JSON.parse(draftRaw);
        raw = String(
          saved?.data?.answers?.website ||
          saved?.data?.answers?.websiteUrl ||
          saved?.data?.answers?.url ||
          saved?.data?.answers?.link ||
          ""
        ).trim();
      }
    } catch {}
  }

  if (!raw) {
    // Last-resort persistent key — client-namespaced in admin-client mode.
    try {
      if (adminClientId) {
        raw = String(localStorage.getItem(`u:adminClient:${adminClientId}:sm_last_website_url_v1`) || "").trim();
      }
      if (!raw) {
        raw = String(localStorage.getItem("sm_last_website_url_v1") || "").trim();
      }
    } catch {}
  }

  if (!raw) return "";
  raw = raw.replace(/\s+/g, "");
  if (raw.startsWith("//")) raw = "https:" + raw;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
  console.debug("[URL] from fallback chain (route state lost):", raw);
  return raw;
})();

const finalHeadline = (
  form?.headline ||
  form?.adHeadline ||
  previewCopy?.headline ||
  headline ||
  ""
).toString().trim();

const finalBody = (
  form?.primaryText ||
  form?.body ||
  previewCopy?.body ||
  body ||
  ""
).toString().trim();

if (!acctId) throw new Error("Please select a Facebook ad account.");
if (!pageId) throw new Error("Please select a Facebook page.");

const isNoWebsite = String(answers?.noWebsite || '').trim().toLowerCase() === 'yes';
// Fallback: if answers came from stale/missing route state (mobile refresh, BFCache restore),
// try reading phone from the saved FORM_DRAFT_KEY so phone-only launch still works.
const launchPhoneRaw = (() => {
  const fromAnswers = String(answers?.phone || form?.phone || '').trim();
  if (fromAnswers) return fromAnswers;
  try {
    const raw = lsGet(resolvedUser, FORM_DRAFT_KEY) || localStorage.getItem(FORM_DRAFT_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      return String(saved?.data?.answers?.phone || '').trim();
    }
  } catch {}
  return '';
})();
const launchPhone = launchPhoneRaw;
// websiteUrl is already .toString().trim()'d above — empty string means no website was entered
const websiteBlank = !websiteUrl;

if (!isValidHttpUrl(websiteUrl)) {
  if (!websiteBlank) {
    // User typed something but it's not a valid URL — always require correction
    throw new Error("Please enter a valid website URL starting with http:// or https://");
  } else if (launchPhone) {
    // No website entered + phone present → phone-only launch
    // Robust to stale/missing noWebsite flag: we derive intent from actual inputs
  } else {
    // No website and no phone — cannot launch
    throw new Error("No website on file. Please add a phone number — we'll launch a call-focused ad for you.");
  }
}

const isRenderMediaUrl = (u) => {
  const s = String(u || "").trim();
  return s.startsWith(`${RENDER_MEDIA_ORIGIN}/api/media/`);
};

const forceHostOnRenderMedia = async (candidates) => {
  const norm = (candidates || []).map(toAbsoluteMedia).filter(Boolean);
  const uploaded = await ensureFetchableUrls(norm, 2);

  const final = (uploaded || [])
    .map((u) => {
      const s = String(u || "").trim();
      if (!s) return "";

      // force frontend-hosted /api/media URLs onto Render host
      if (s.startsWith(`${APP_ORIGIN}/api/media/`)) {
        return s.replace(APP_ORIGIN, RENDER_MEDIA_ORIGIN);
      }

      if (s.startsWith(`/api/media/`)) {
        return `${RENDER_MEDIA_ORIGIN}${s}`;
      }

      return s;
    })
    .filter(Boolean);

  return final.filter(isRenderMediaUrl).slice(0, 2);
};

let filteredImages = [];

if (!isVideoCreative) {
  let candidateImgs = [];

  // Draft images take exclusive priority: if the user has a draft, never blend in
  // a different campaign's saved creatives — that's what causes campaign 1 to leak
  // into campaign 2. The global backups (fetchable/cache/imageDrafts) are also
  // gated here because they're not campaign-specific and can carry stale images.
  const hasDraftImages = Array.isArray(draftCreatives?.images) && draftCreatives.images.length > 0;

  if (hasDraftImages) {
    candidateImgs = candidateImgs.concat(draftCreatives.images.slice(0, 2));
    if (Array.isArray(navImageUrls) && navImageUrls.length) {
      candidateImgs = candidateImgs.concat(navImageUrls.slice(0, 2));
    }
  } else {
    // No draft → fall back to saved creatives for the selected campaign (re-launch path)
    if (selectedCampaignId && selectedCampaignId !== "__DRAFT__") {
      try {
        const saved = getSavedCreatives(selectedCampaignId);
        if (Array.isArray(saved?.images)) {
          candidateImgs = candidateImgs.concat(saved.images.slice(0, 2));
        }
      } catch {}
    }
    if (Array.isArray(navImageUrls) && navImageUrls.length) {
      candidateImgs = candidateImgs.concat(navImageUrls.slice(0, 2));
    }
    try {
      candidateImgs = candidateImgs
        .concat(loadFetchableImagesBackup(resolvedUser) || [])
        .concat(getCachedFetchableImages(resolvedUser) || []);
    } catch {}
    try {
      candidateImgs = candidateImgs.concat(getLatestDraftImageUrlsFromImageDrafts() || []);
    } catch {}
  }

  filteredImages = await forceHostOnRenderMedia(candidateImgs);

  if (!filteredImages.length) {
    try {
      filteredImages = await forceHostOnRenderMedia(draftCreatives?.images || []);
    } catch {}
  }

  if (!filteredImages.length) {
    throw new Error("No launchable images. Please regenerate creatives (images must be hosted on Render /api/media).");
  }

  try {
    saveFetchableImagesBackup(resolvedUser, filteredImages);
  } catch {}
}

const payload = {
  form: {
    ...form,
    url: websiteUrl,
    websiteUrl,
  },

  budget: safeBudget,
  campaignType: String(form?.campaignType || "Website Traffic").trim(),
  pageId,
  websiteUrl,

  aiAudience: String(form?.aiAudience || answers?.aiAudience || "").trim(),
  adCopy: [finalHeadline, finalBody].filter(Boolean).join("\n\n"),
  // Merge launchPhone back into answers so backend always has it, even when route state was lost
  answers: { ...(answers || {}), phone: launchPhone || (answers?.phone || '') },

  mediaSelection: isVideoCreative ? "video" : "image",
  mediaType: isVideoCreative ? "video" : "image",
  ...(isVideoCreative
    ? { videoUrl: navVideoUrl, imageVariants: [], imageUrls: [], images: [] }
    : { imageVariants: filteredImages, imageUrls: filteredImages, images: filteredImages }),

  flightStart: startISO,
  flightEnd: endISO,

  // Instagram: only sent for website users. Backend enforces no-Instagram for CALL_NOW path.
  // Gate on both flag AND actual websiteUrl being present — robust to stale noWebsite flag.
  includeInstagram: !isNoWebsite && !websiteBlank && includeInstagram,

  overrideCountPerType: {
    images: isVideoCreative ? 0 : Math.min(2, filteredImages.length),
  },

  // Multi-creative angle test: send per-ad copy so backend creates one ad per angle
  // with distinct headline/body. Only included when a creativeSet exists.
  ...(draftCreatives.creativeSet && draftCreatives.creativeSet.length > 1 && !isVideoCreative
    ? {
        creativeSet: draftCreatives.creativeSet,
        adCopySet: draftCreatives.creativeSet.map((c) => ({
          localCreativeId: c.id,
          angle:           c.angle,
          angleLabel:      c.angleLabel,
          headline:        c.headline || "",
          body:            c.body     || "",
          cta:             c.cta      || "",
          imageUrl:        c.imageUrl || filteredImages[0] || "",
        })),
        overrideCountPerType: {
          images: Math.min(draftCreatives.creativeSet.length, 4),
        },
      }
    : {}),
};

console.log("[SM][launch payload]", {
  acctId,
  pageId,
  websiteUrl,
  websiteBlank,
  isNoWebsite,
  launchPhone,
  answersNoWebsite: answers?.noWebsite,
  statePresent: !!(location.state && Object.keys(location.state).length),
  filteredImages,
  payload,
});

console.log("[LAUNCH][creative-payload]", {
  ctxKey: String(location.state?.ctxKey || "").trim() || "(not in state)",
  headline: finalHeadline.slice(0, 80) || "(empty)",
  primaryTextPreview: finalBody.slice(0, 120) || "(empty)",
  businessName: String(form?.businessName || answers?.businessName || "").trim() || "(empty)",
  businessType: String(form?.businessType || answers?.businessType || answers?.industry || "").trim() || "(empty — may produce generic copy)",
  service: String(answers?.mainBenefit || answers?.service || "").trim() || "(empty)",
  promotion: String(answers?.offer || answers?.saveAmount || "").trim() || "(empty)",
  imageCount: filteredImages.length,
  usingDraftCreatives: !!(location.state?.imageUrls?.length),
  answersHasIndustry: !!(answers?.industry || answers?.businessType),
});

      const isAdminLaunch = !!adminClientId;
      const adminSid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const res = isAdminLaunch
        ? await fetch(`/api/admin/clients/${encodeURIComponent(adminClientId)}/launch-campaign`, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              ...(adminSid ? { "x-sm-sid": adminSid } : {}),
            },
            body: JSON.stringify({ adAccountId: acctId, ...payload }),
          })
        : await authFetch(`/facebook/adaccount/${acctId}/launch-campaign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

      const rawText = await res.text().catch(() => "");
      let json = null;
      try {
        json = rawText ? JSON.parse(rawText) : null;
      } catch {
        json = null;
      }

      if (!res.ok) {
        // Extract the most specific message the backend provided.
        // json.error is sometimes the backend's generic fallback ("Failed to launch campaign.")
        // while json.detail holds the real cause — either a plain string or a Meta error object.
        const GENERIC_BE = 'Failed to launch campaign.';
        const errStr = typeof json?.error === 'string' ? json.error.trim() : '';
        let msg = '';
        if (errStr && errStr !== GENERIC_BE) {
          // Backend gave a specific error string (e.g. plan limit, date, validation).
          msg = errStr;
        } else {
          // Fall through to detail, which carries the real error for 500-class failures.
          const d = json?.detail;
          if (typeof d === 'string' && d.trim()) {
            msg = d.trim();
          } else if (d && typeof d === 'object') {
            msg = String(d?.error?.message || d?.message || '').trim();
          }
          // If detail was also empty, use the generic string rather than nothing.
          if (!msg) msg = errStr;
        }
        if (!msg) msg = String(json?.message || '').trim() || rawText?.slice(0, 400) || `HTTP ${res.status}`;
        // Detect Meta date-related rejections and surface a human-readable message.
        if (/end date.*past|past.*end date|time_stop|date.*expir|End Date Is In the Past/i.test(msg)) {
          throw new Error("Your campaign dates have expired. Please choose a future end date and try again.");
        }
        throw new Error(msg);
      }

      json = json || {};

      const map = readCreativeMap(resolvedUser, acctId);
      if (json.campaignId) {
        const expiresAt =
          endISO && !isNaN(new Date(endISO).getTime()) ? new Date(endISO).getTime() : Date.now() + DEFAULT_CAMPAIGN_TTL_MS;

        map[json.campaignId] = {
          images: filteredImages,
          mediaSelection: "image",
          time: Date.now(),
          expiresAt,
          name: form.campaignName || "Untitled",
          // Persist adset ID so post-launch edits (budget/date) can target the correct Meta entity.
          adsetId: String(Array.isArray(json.adSetIds) ? json.adSetIds[0] || "" : ""),
          meta: {
            headline: String(finalHeadline || "").trim(),
            body: String(finalBody || "").trim(),
            link:
              String(websiteUrl || "").trim() ||
              String(previewCopy?.link || inferredLink || "").trim() ||
              "https://your-smartmark-site.com",
          },
        };
        writeCreativeMap(resolvedUser, acctId, map);

        // Seed campaignSettingsMap with original values at launch time so the
        // per-campaign details panel can always show original vs current.
        setCampaignSettingsMap((prev) => ({
          ...prev,
          [json.campaignId]: {
            ...prev[json.campaignId],
            originalBudget: String(budget || "").trim(),
            originalEndDate: String(endDate || "").trim(),
            originalStartDate: String(startDate || "").trim(),
            budget: String(budget || "").trim(),
            endDate: String(endDate || "").trim(),
            startDate: String(startDate || "").trim(),
          },
        }));
      }

         // ✅ After successful launch: prevent "in progress" from coming back
      setDraftDisabled(resolvedUser, true);

      try {
        // 1) remove ALL draft storages used by Setup/Form
        purgeDraftStorages(resolvedUser);

        // In admin-client mode the draft is stored under the admin-client namespace,
        // which purgeDraftStorages does not touch. Clear it explicitly so it cannot
        // be restored on the next page load and re-mask the live campaign as a draft.
        if (adminClientId) {
          try { localStorage.removeItem(`u:adminClient:${adminClientId}:${CREATIVE_DRAFT_KEY}`); } catch {}
          try { localStorage.removeItem(`u:adminClient:${adminClientId}:sm_setup_creatives_backup_v1`); } catch {}
          try { localStorage.removeItem(`u:adminClient:${adminClientId}:draft_form_creatives`); } catch {}
        }

        // also clear legacy creative draft keys (extra safety)
        try {
          if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY_LEGACY));
        } catch {}
        try {
          localStorage.removeItem(CREATIVE_DRAFT_KEY_LEGACY);
        } catch {}

        // remove setup backups + inflight marker
        localStorage.removeItem(LS_BACKUP_KEY(resolvedUser));
        localStorage.removeItem(SETUP_CREATIVE_BACKUP_KEY);
        localStorage.removeItem(LS_INFLIGHT_KEY(resolvedUser));

        // 2) IMPORTANT: remove the caches that re-create a draft after launch
        //    - imageDrafts fallback
        //    - fetchable image cache fallback
        const launched = (filteredImages || []).map((u) => String(u || "").trim()).filter(Boolean);

        // prune smartmark.imageDrafts.v1 (remove entries that match launched images)
        try {
          const raw = localStorage.getItem("smartmark.imageDrafts.v1");
          if (raw) {
            const obj = JSON.parse(raw || "{}") || {};
            const keys = Object.keys(obj || {});
            const launchedFileNames = launched
              .map((u) => {
                try {
                  const url = new URL(u);
                  return (url.pathname.split("/").pop() || "").trim();
                } catch {
                  return (String(u).split("/").pop() || "").trim();
                }
              })
              .filter(Boolean);

            let changed = false;

            for (const k of keys) {
              if (!k.startsWith("img:")) continue;
              const imgKey = k.slice(4); // after "img:"
              const hit =
                launched.includes(imgKey) ||
                launched.some((u) => imgKey.includes(u)) ||
                launchedFileNames.some((fn) => imgKey.includes(fn));
              if (hit) {
                delete obj[k];
                changed = true;
              }
            }

            if (changed) {
              const left = Object.keys(obj || {}).length;
              if (!left) localStorage.removeItem("smartmark.imageDrafts.v1");
              else localStorage.setItem("smartmark.imageDrafts.v1", JSON.stringify(obj));
            }
          }
        } catch {}

        // clear fetchable cache so data:image -> cached url can't resurrect an old draft
        try {
          localStorage.removeItem("sm_image_cache_v1");
          localStorage.removeItem("u:anon:sm_image_cache_v1");
        } catch {}
      } catch {}


      setDraftCreatives({ images: [], mediaSelection: "image" });
      if (expandedId === "__DRAFT__") setExpandedId(null);
      if (selectedCampaignId === "__DRAFT__") setSelectedCampaignId("");

      setLaunched(true);
      setLaunchResult(json);

      const launchedId = json.campaignId || "";
      setSelectedCampaignId(launchedId);
      setExpandedId(launchedId);

      // Immediately upsert the launched campaign into local campaigns state so it
      // appears in the dropdown without waiting for a manual refresh.
      if (launchedId) {
        const newCampaignRecord = {
          id: launchedId,
          campaignId: launchedId,
          metaCampaignId: launchedId,
          name: json.campaignName || form.campaignName || "Campaign",
          status: "ACTIVE",
          effective_status: "ACTIVE",
          currentStatus: "ACTIVE",
          accountId: String(json.accountId || selectedAccount || "").replace(/^act_/, ""),
          ownerKey: json.ownerKey || "",
          launchComplete: true,
          createdAt: new Date().toISOString(),
          images: json.imageUrls || [],
          meta: { headline: json.headline || "", body: json.body || "", link: "" },
          mediaSelection: "image",
        };
        setCampaigns((prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const idx = list.findIndex((c) => String(c.id) === launchedId);
          if (idx !== -1) {
            const updated = [...list];
            updated[idx] = { ...list[idx], ...newCampaignRecord };
            return updated;
          }
          return [newCampaignRecord, ...list];
        });
        // Refresh from server to get full data once
        if (adminClientId) {
          refreshAdminCampaigns(adminClientId, setCampaigns, setMetricsMap, setOptimizerStateMap, setCampaignCreativesMap, recentStatusOverridesRef.current, launchedId);
        }
      }

      try {
        if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_budget"));
        if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_campaign_fields"));
        localStorage.removeItem("smartmark_last_budget");
        localStorage.removeItem("smartmark_last_campaign_fields");
      } catch {}

      setBudget("");
      setForm((prev) => ({ ...prev, campaignName: "" }));

      try {
        const d0 = new Date();
        const y = d0.getFullYear();
        const m = String(d0.getMonth() + 1).padStart(2, "0");
        const da = String(d0.getDate()).padStart(2, "0");
        const startYYYYMMDD = `${y}-${m}-${da}`;
        const endYYYYMMDD = plusDaysYMD(startYYYYMMDD, 3);
        setStartDate(startYYYYMMDD);
        setEndDate(endYYYYMMDD);
      } catch {}

      setTimeout(() => setLaunched(false), 1500);
    } catch (err) {
      alert("Launch failed:\n\n" + (err.message || "Unknown error. Please try again."));
      console.error("[SM][launch error]", err);
    }
    setLoading(false);
  };

  const openFbPaymentPopup = () => {
    if (!selectedAccount) {
      alert("Please select an ad account first.");
      return;
    }
    const fbPaymentUrl = `https://business.facebook.com/ads/manager/account_settings/account_billing/?act=${selectedAccount}`;
    const width = 540;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      fbPaymentUrl,
      "Add Payment Method",
      `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars`
    );
    if (!popup) {
      alert("Popup blocked! Please allow popups for this site.");
      return;
    }
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        alert("Payment method window closed. If you added a card, you're good to go!");
      }
    }, 500);
  };

  const { fee } = calculateFees(budget);

const getSavedCreatives = (campaignId) => {
  const runtime = campaignCreativesMap[campaignId] || null;

  if (runtime) {
    return {
      images: (runtime.images || []).map(toAbsoluteMedia).filter(Boolean).slice(0, 2),
      mediaType: runtime.mediaType || "image",
      mediaSelection: runtime.mediaSelection || "image",
      videos: runtime.videos || [],
      meta: {
        headline: String(runtime?.meta?.headline || "").trim(),
        body: String(runtime?.meta?.body || "").trim(),
        link: String(runtime?.meta?.link || "").trim(),
      },
    };
  }

  if (!selectedAccount) {
    return { images: [], mediaType: "image", mediaSelection: "image", videos: [], meta: { headline: "", body: "", link: "" } };
  }

  const acctKey = String(selectedAccount || "").replace(/^act_/, "");
  const map = readCreativeMap(resolvedUser, acctKey);

  const didPurge = purgeExpiredCreative(map, campaignId);
  if (didPurge) writeCreativeMap(resolvedUser, acctKey, map);

  const saved = map[campaignId] || null;
  if (!saved) {
    return { images: [], mediaType: "image", mediaSelection: "image", videos: [], meta: { headline: "", body: "", link: "" } };
  }

  const images = (saved.images || [])
    .map(toAbsoluteMedia)
    .filter(Boolean)
    .slice(0, 2);

  return {
    images,
    mediaType: saved.mediaType || "image",
    mediaSelection: saved.mediaSelection || "image",
    videos: saved.videos || [],
    meta: {
      headline: String(saved?.meta?.headline || "").trim(),
      body: String(saved?.meta?.body || "").trim(),
      link: String(saved?.meta?.link || "").trim(),
    },
  };
};

  const hasDraft = draftCreatives.images && draftCreatives.images.length;

  const selectedLiveCampaign =
    selectedCampaignId && selectedCampaignId !== "__DRAFT__"
      ? campaigns.find((c) => String(c?.id) === String(selectedCampaignId)) || null
      : null;

const selectedCampaignCreatives =
  selectedCampaignId === "__DRAFT__" && (hasDraft || isVideoCreative)
    ? {
        images: draftCreatives?.images || [],
        mediaType: isVideoCreative ? "video" : "image",
        mediaSelection: isVideoCreative ? "video" : "image",
        videos: isVideoCreative ? [navVideoUrl] : [],
        meta: {
          headline: String(previewCopy?.headline || headline || "").trim(),
          body: String(previewCopy?.body || body || "").trim(),
          link: String(previewCopy?.link || inferredLink || "").trim(),
        },
      }
    : selectedCampaignId && selectedCampaignId !== "__DRAFT__"
    ? getSavedCreatives(selectedCampaignId)
    : { images: [], mediaType: "image", mediaSelection: "image", videos: [], meta: { headline: "", body: "", link: "" } };

   const selectedOptimizerCreativeState =
    selectedCampaignId && selectedCampaignId !== "__DRAFT__"
      ? optimizerCreativeMap[selectedCampaignId] || null
      : null;

      const selectedOptimizerState =
  selectedCampaignId && selectedCampaignId !== "__DRAFT__"
    ? optimizerStateMap[selectedCampaignId] || null
    : null;

  const selectedOptimizerSummary =
    selectedCampaignId && selectedCampaignId !== "__DRAFT__"
      ? publicSummaryMap[selectedCampaignId] || getFallbackPublicSummary()
      : getFallbackPublicSummary();



  const selectedCampaignSettings =
    selectedCampaignId && selectedCampaignId !== "__DRAFT__"
      ? campaignSettingsMap[selectedCampaignId] || {}
      : {};

  const displayedCampaignSettings =
    selectedCampaignId && selectedCampaignId !== "__DRAFT__"
      ? {
          budget: String(selectedCampaignSettings?.budget || "—").trim(),
          startDate: String(selectedCampaignSettings?.startDate || "—").trim(),
          endDate: String(selectedCampaignSettings?.endDate || "—").trim(),
        }
      : {
          budget: String(budget || "—").trim(),
          startDate: String(startDate || "—").trim(),
          endDate: String(endDate || "—").trim(),
        };

  useEffect(() => {
    writeCampaignSettingsMap(resolvedUser, campaignSettingsMap);
  }, [resolvedUser, campaignSettingsMap]);

  const generateCampaignReport = () => {
    const m = metricsMap[selectedCampaignId] || {};
    const snap = selectedOptimizerState?.metricsSnapshot || {};
    const impressions = Number(m.impressions || 0);
    const clicks = Number(m.clicks || 0);
    const spend = Number(m.spend || 0);
    const ctrNum = m.ctr !== undefined && m.ctr !== null && m.ctr !== ""
      ? Number(m.ctr || 0)
      : impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpcNum = clicks > 0 ? spend / clicks : Number(snap.cpc || 0);
    const cpmNum = Number(snap.cpm || (impressions > 0 ? (spend * 1000) / impressions : 0));
    const linkClicks = Number(snap.linkClicks || clicks);
    const conversions = Number(snap.conversions || 0);
    const reach = Number(snap.reach || 0);

    const campaignName = selectedLiveCampaign?.name || "Campaign";
    const budget = displayedCampaignSettings.budget || "—";
    const startDate = displayedCampaignSettings.startDate || "—";
    const endDate = displayedCampaignSettings.endDate || "—";
    const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const diagnosis = selectedOptimizerState?.latestDiagnosis?.diagnosis || "";
    const diagnosisReason = selectedOptimizerState?.latestDiagnosis?.reason || "";
    const diagnosisRecommendation = selectedOptimizerState?.latestDiagnosis?.recommendedAction || "";
    const latestAction = selectedOptimizerState?.latestAction || null;
    const pendingTest = selectedOptimizerState?.pendingCreativeTest || null;

    const summary = selectedOptimizerSummary || {};
    const summaryHeadline = summary.headline || "";
    const summarySubtext = summary.subtext || "";

    const aiHistoryRaw = Array.isArray(selectedOptimizerState?.aiHistory) ? selectedOptimizerState.aiHistory : [];
    const recentActions = aiHistoryRaw.filter(h => h?.type === "action" || h?.actionType).slice(-5).reverse();
    const recentDiagnoses = aiHistoryRaw.filter(h => h?.type === "diagnosis" || h?.diagnosis).slice(-3).reverse();

    const testStatus = pendingTest
      ? String(pendingTest.status || "").toLowerCase()
      : null;
    const testGoal = pendingTest?.creativeGoal || pendingTest?.goal || "";
    const testVariants = Number(pendingTest?.variantCount || 0);

    const rows = (arr, label) => arr.length > 0
      ? arr.map(r => {
          const ts = r.generatedAt || r.createdAt || r.timestamp || "";
          const dateStr = ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
          const text = r.summary || r.actionType || r.diagnosis || r.label || JSON.stringify(r).slice(0, 120);
          return `<tr><td style="color:#6b7280;font-size:12px;white-space:nowrap;padding:4px 8px 4px 0">${dateStr}</td><td style="font-size:13px;padding:4px 0">${text}</td></tr>`;
        }).join("")
      : `<tr><td colspan="2" style="color:#9ca3af;font-size:13px;padding:4px 0">No ${label} recorded yet.</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Campaign Report — ${campaignName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fff; color: #111827; max-width: 780px; margin: 0 auto; padding: 40px 32px; }
  h1 { font-size: 26px; font-weight: 800; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 32px; }
  h2 { font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #374151; border-bottom: 1px solid #e5e7eb; padding-bottom: 6px; margin: 28px 0 12px; }
  .metrics-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 8px; }
  .metric-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; }
  .metric-label { font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
  .metric-value { font-size: 22px; font-weight: 800; color: #111827; }
  .diagnosis-box { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 14px 16px; margin-bottom: 8px; }
  .diagnosis-label { font-size: 11px; font-weight: 700; color: #059669; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
  .summary-box { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 14px 16px; }
  .ab-box { background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 10px; padding: 14px 16px; }
  table { width: 100%; border-collapse: collapse; }
  p { margin: 4px 0 8px; font-size: 14px; line-height: 1.6; }
  .footer { margin-top: 48px; border-top: 1px solid #e5e7eb; padding-top: 16px; font-size: 11px; color: #9ca3af; }
  @media print { body { padding: 20px 16px; } button { display: none; } }
</style>
</head>
<body>
<button onclick="window.print()" style="float:right;background:#10b981;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;margin-top:4px">Print / Save PDF</button>
<h1>${campaignName}</h1>
<div class="meta">Report generated ${reportDate} &nbsp;·&nbsp; Budget: ${budget} &nbsp;·&nbsp; Start: ${startDate} &nbsp;·&nbsp; End: ${endDate}</div>

<h2>Performance Metrics</h2>
<div class="metrics-grid">
  <div class="metric-card"><div class="metric-label">Spend</div><div class="metric-value">$${spend.toFixed(2)}</div></div>
  <div class="metric-card"><div class="metric-label">Impressions</div><div class="metric-value">${impressions.toLocaleString()}</div></div>
  <div class="metric-card"><div class="metric-label">Link Clicks</div><div class="metric-value">${(linkClicks > 0 ? linkClicks : clicks).toLocaleString()}</div></div>
  <div class="metric-card"><div class="metric-label">CTR</div><div class="metric-value">${ctrNum.toFixed(2)}%</div></div>
  <div class="metric-card"><div class="metric-label">CPC</div><div class="metric-value">$${cpcNum.toFixed(2)}</div></div>
  <div class="metric-card"><div class="metric-label">CPM</div><div class="metric-value">${cpmNum > 0 ? "$" + cpmNum.toFixed(2) : "$0.00"}</div></div>
  ${reach > 0 ? `<div class="metric-card"><div class="metric-label">Reach</div><div class="metric-value">${reach.toLocaleString()}</div></div>` : ""}
  ${conversions > 0 ? `<div class="metric-card"><div class="metric-label">Conversions</div><div class="metric-value">${conversions}</div></div>` : ""}
</div>

${summaryHeadline || summarySubtext ? `
<h2>AI Summary</h2>
<div class="summary-box">
  ${summaryHeadline ? `<p style="font-weight:700;font-size:15px;margin-bottom:6px">${summaryHeadline}</p>` : ""}
  ${summarySubtext ? `<p>${summarySubtext}</p>` : ""}
</div>` : ""}

${diagnosis || diagnosisReason ? `
<h2>AI Diagnosis</h2>
<div class="diagnosis-box">
  <div class="diagnosis-label">Current Assessment</div>
  ${diagnosis ? `<p style="font-weight:600">${diagnosis}</p>` : ""}
  ${diagnosisReason ? `<p>${diagnosisReason}</p>` : ""}
  ${diagnosisRecommendation ? `<p><strong>Recommended next step:</strong> ${diagnosisRecommendation}</p>` : ""}
</div>` : ""}

${latestAction ? `
<h2>Latest AI Action</h2>
<p><strong>${latestAction.actionType || "Action taken"}</strong>${latestAction.status ? " — " + latestAction.status : ""}${latestAction.executed ? " (executed)" : ""}</p>` : ""}

${recentActions.length > 0 ? `
<h2>Recent Actions Taken</h2>
<table>${rows(recentActions, "actions")}</table>` : ""}

${recentDiagnoses.length > 0 ? `
<h2>Recent AI Observations</h2>
<table>${rows(recentDiagnoses, "observations")}</table>` : ""}

${pendingTest ? `
<h2>A/B Test Status</h2>
<div class="ab-box">
  <p><strong>Status:</strong> ${testStatus ? testStatus.charAt(0).toUpperCase() + testStatus.slice(1) : "Unknown"}</p>
  ${testGoal ? `<p><strong>Goal:</strong> ${testGoal}</p>` : ""}
  ${testVariants > 0 ? `<p><strong>Variants:</strong> ${testVariants}</p>` : ""}
</div>` : ""}

<div class="footer">Generated by Smartemark AI &nbsp;·&nbsp; ${reportDate}</div>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const openEditCurrentCampaign = () => {
    if (!selectedLiveCampaign) return;

    const id = String(selectedLiveCampaign.id || "").trim();
    const saved = campaignSettingsMap[id] || {};

    setEditCampaignForm({
      budget: String(saved?.budget || "").trim(),
      startDate: String(saved?.startDate || "").trim(),
      endDate: String(saved?.endDate || "").trim(),
    });

    setShowCampaignMenu(false);
    setShowEditCampaignModal(true);
  };

  const saveCurrentCampaignSettings = async () => {
    if (!selectedLiveCampaign) return;

    const id = String(selectedLiveCampaign.id || "").trim();
    const acctId = String(selectedAccount || "").trim().replace(/^act_/, "");

    // Retrieve the stored adset ID for this campaign (written at launch time).
    const creativeMapEntry = readCreativeMap(resolvedUser, acctId)[id] || {};
    const adsetId = String(creativeMapEntry.adsetId || "").trim();

    // Persist to local state first so the UI reflects the change immediately.
    setCampaignSettingsMap((prev) => ({
      ...prev,
      [id]: {
        budget: String(editCampaignForm?.budget || "").trim(),
        startDate: String(editCampaignForm?.startDate || "").trim(),
        endDate: String(editCampaignForm?.endDate || "").trim(),
      },
    }));

    setShowEditCampaignModal(false);

    if (!adsetId) {
      // No adset ID on record — likely a campaign launched before this feature.
      // Local state is already updated; we cannot sync to Meta without the adset ID.
      console.warn("[CampaignSetup] No adset ID on record for campaign", id, "— cannot sync to Meta.");
      return;
    }

    // Build the update payload — only include fields the user actually filled in.
    const updateBody = { adsetId };

    const budgetVal = Number(editCampaignForm?.budget || 0);
    if (budgetVal > 0) updateBody.daily_budget = budgetVal;

    const endDateVal = String(editCampaignForm?.endDate || "").trim();
    if (endDateVal) {
      try {
        const d = new Date(`${endDateVal}T18:00:00`);
        if (!isNaN(d.getTime())) updateBody.end_time = d.toISOString();
      } catch {}
    }

    if (!updateBody.daily_budget && !updateBody.end_time) return; // nothing to sync

    try {
      setLoading(true);
      const res = await authFetch(`/facebook/adaccount/${acctId}/update-adset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateBody),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = json?.error || `HTTP ${res.status}`;
        alert(`Could not update campaign on Facebook: ${msg}`);
      } else {
        console.log("[CampaignSetup] ad set updated on Meta", json);
      }
    } catch (err) {
      alert(`Could not update campaign on Facebook: ${err?.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };
  /* ================================ UI ================================ */
  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: typeof DARK_BG === "string" ? DARK_BG : "#eef2ff",
        fontFamily: MODERN_FONT,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "-18vh",
          right: "-12vw",
          width: 720,
          height: 720,
          background: `radial-gradient(40% 40% at 50% 50%, ${GLOW_TEAL}, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div style={{ width: "100%", maxWidth: 1180, padding: "22px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <button
            onClick={() => navigate(withAdminClientQuery("/form", adminClientId), {
              state: {
                imageUrls: Array.isArray(draftCreatives?.images) ? draftCreatives.images.filter(Boolean) : [],
                // Pass copy fields so FormPage can restore the full creative without a localStorage read
                headline: previewCopy?.headline || "",
                body:     previewCopy?.body     || "",
                link:     previewCopy?.link      || "",
                ctxKey: getActiveCtx(resolvedUser) || "",
                ...(adminClientId ? { adminClientId } : {}),
              },
            })}
            style={{
              background: "#202824e0",
              color: WHITE,
              border: `1px solid ${INPUT_BORDER}`,
              borderRadius: "1.1rem",
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: "1rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
            }}
          >
            ← Back
          </button>

          {adminClientId && (
            <button
              onClick={exitClientMode}
              style={{
                background: "#5d59ea",
                color: WHITE,
                border: "1px solid rgba(93,89,234,0.5)",
                borderRadius: "1.1rem",
                padding: "10px 18px",
                fontWeight: 800,
                fontSize: "1rem",
                letterSpacing: "0.6px",
                cursor: "pointer",
                boxShadow: "0 2px 10px rgba(93,89,234,0.3)",
              }}
            >
              Admin Dashboard
            </button>
          )}

          <button
            onClick={() => navigate("/")}
            style={{
              background: "#232828",
              color: WHITE,
              border: `1px solid ${INPUT_BORDER}`,
              borderRadius: "1.1rem",
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: "1rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
            }}
          >
            Home
          </button>
        </div>

        {adminClientId && (
          <div style={{
            margin: "14px auto 0",
            maxWidth: 1180,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
            background: "rgba(93,89,234,0.14)",
            border: "1px solid rgba(93,89,234,0.28)",
            borderRadius: 10,
            padding: "9px 16px",
            fontSize: 13,
            fontWeight: 700,
            color: "#c7c5ff",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: "#5d59ea", color: "#fff", borderRadius: 6, padding: "2px 9px", fontSize: 11, fontWeight: 800, letterSpacing: 0.5 }}>Client Mode</span>
              <span>Managing:</span>
              <span style={{ fontWeight: 800, color: "#fff" }}>
                {adminClientBusinessName || adminClientId}
              </span>
            </div>
            <button
              onClick={exitClientMode}
              style={{
                background: "rgba(255,255,255,0.10)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: 7,
                padding: "4px 12px",
                color: "#c7c5ff",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
                letterSpacing: 0.3,
              }}
            >
              Exit Client Mode
            </button>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.15rem",
              lineHeight: 1.2,
              letterSpacing: "-0.4px",
              fontWeight: 900,
              background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textAlign: "center",
            }}
          >
            Campaign Setup
          </h1>
        </div>
      </div>

      <div
        style={{
          width: "100vw",
          maxWidth: "1550px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "flex-start",
          justifyContent: "center",
          marginTop: isMobile ? 42 : 64,
          gap: isMobile ? 16 : 52,
          padding: isMobile ? "0 3vw 28px" : "0 36px 48px",
          minHeight: "92vh",
          position: "relative",
          zIndex: 1,
        }}
      >
     <main
  style={{
      background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(247,248,255,0.82))",
    border: "1px solid rgba(110,102,255,0.14)",
    borderRadius: "28px",
    boxShadow: "0 22px 56px rgba(88, 89, 202, 0.10)",
    padding: isMobile ? "0" : "0",
    minWidth: isMobile ? "98vw" : 760,
    maxWidth: "1280px",
    width: "100%",
    flex: "1 1 auto",
    display: "flex",
    flexDirection: isMobile ? "column" : "row",
    gap: 0,
    alignItems: "stretch",
    marginBottom: isMobile ? 24 : 0,
    overflow: "hidden",
  }}
>
  <div
    style={{
      width: isMobile ? "100%" : 220,
      minWidth: isMobile ? "100%" : 220,
      background: "linear-gradient(180deg, #ffffff 0%, #f7f8ff 100%)",
      borderRight: isMobile ? "none" : "1px solid rgba(93,89,234,0.10)",
      borderBottom: isMobile ? "1px solid rgba(93,89,234,0.10)" : "none",
      padding: isMobile ? "10px 12px" : "18px 14px",
      display: "flex",
      flexDirection: isMobile ? "row" : "column",
      gap: isMobile ? 6 : 10,
    }}
  >
  {[
  {
    key: "connect",
    step: "01",
    title: "Connect Facebook",
    subtitle: "Ad account details",
  },
  {
    key: "ai-agent",
    step: "AI",
    title: "AI Ad Agent",
    subtitle: "Create & test creatives",
  },
  {
    key: "creatives",
    step: "02",
    title: "Creatives",
    subtitle: "Ad visuals and AI updates",
  },
  {
    key: "campaign",
    step: "03",
    title: "Campaign",
    subtitle: "Metrics, launch, management",
  },
  {
    key: "account",
    step: "04",
    title: "Account",
    subtitle: "Plan and email",
  },
].map((item) => {
      const active = setupTab === item.key;
      const isAbTab = item.key === "abtest";
      const abTestPending = isAbTab && !!selectedOptimizerState?.pendingCreativeTest;
      const abTestLive = isAbTab && ["live", "staged"].includes(String(selectedOptimizerState?.pendingCreativeTest?.status || "").toLowerCase());
      return (
        <button
          key={item.key}
          type="button"
          onClick={() => setSetupTab(item.key)}
          style={{
            flex: isMobile ? 1 : "unset",
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "center" : "flex-start",
            gap: isMobile ? 0 : 12,
            width: "100%",
            textAlign: "left",
            borderRadius: 14,
            padding: isMobile ? "10px 4px" : "12px 12px",
            border: active
              ? "1px solid rgba(93,89,234,0.22)"
              : abTestPending
              ? "1px solid rgba(22,163,74,0.22)"
              : "1px solid transparent",
            background: active
              ? "linear-gradient(120deg, #eef2ff 0%, #e4e8ff 100%)"
              : abTestPending && !active
              ? "rgba(240,253,244,0.6)"
              : "transparent",
            cursor: "pointer",
            transition: "all 180ms ease",
          }}
        >
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                width: 32,
                height: 32,
                minWidth: 32,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: active
                  ? "linear-gradient(135deg, #5b57e8 0%, #6b66ff 100%)"
                  : abTestPending
                  ? "linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)"
                  : "linear-gradient(135deg, #f1f5f9 0%, #e9ebf2 100%)",
                color: active ? "#ffffff" : abTestPending ? "#16a34a" : "#475569",
                fontWeight: 900,
                fontSize: 11,
                boxShadow: active ? "0 2px 8px rgba(91,87,232,0.28)" : "none",
              }}
            >
              {item.step}
            </div>
            {abTestLive && (
              <span style={{
                position: "absolute",
                top: -3,
                right: -3,
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#16a34a",
                border: "2px solid #fff",
                display: "block",
              }} />
            )}
          </div>

          {!isMobile && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: "#0f172a",
                  fontWeight: 900,
                  fontSize: 14,
                  lineHeight: 1.2,
                  marginBottom: 2,
                }}
              >
                {item.title}
              </div>
              <div
                style={{
                  color: abTestLive ? "#16a34a" : abTestPending ? "#b45309" : "#64748b",
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1.3,
                }}
              >
                {abTestLive ? "Live test running" : abTestPending ? "Challenger ready" : item.subtitle}
              </div>
            </div>
          )}
        </button>
      );
    })}

    {/* Duplicate "Ad Agent" button removed — AI Ad Agent is now the tab in the tabs array above */}
    {false && (() => {
      const pk = String(billingInfo?.planKey || selectedPlan || "").trim().toLowerCase();
      const locked = !pk || pk === "base" || pk === "starter" || pk === "standard";
      return (
        <button
          type="button"
          title={locked ? "Upgrade to use Ad Agent" : "Ad Agent — AI marketing assistant"}
          onClick={() => {
            // Open inline — no fullscreen navigation needed
            setSetupTab("ai-agent");
          }}
          style={{
            flex: isMobile ? 1 : "unset",
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "center" : "flex-start",
            gap: isMobile ? 0 : 12,
            width: "100%",
            textAlign: "left",
            borderRadius: 14,
            padding: isMobile ? "10px 4px" : "12px 12px",
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            opacity: locked ? 0.5 : 1,
            marginTop: isMobile ? 0 : 8,
            transition: "all 180ms ease",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #f1f5f9 0%, #e9ebf2 100%)",
              color: locked ? "#94a3b8" : "#5d59ea",
              fontSize: 14,
              position: "relative",
            }}
          >
            <FaRobot />
            {locked && (
              <div
                style={{
                  position: "absolute",
                  bottom: -3,
                  right: -3,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <FaLock style={{ fontSize: 7, color: "#94a3b8" }} />
              </div>
            )}
          </div>
          {!isMobile && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  color: locked ? "#94a3b8" : "#0f172a",
                  fontWeight: 900,
                  fontSize: 14,
                  lineHeight: 1.2,
                  marginBottom: 2,
                }}
              >
                Ad Agent
              </div>
              <div
                style={{
                  color: locked ? "#cbd5e1" : "#64748b",
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1.3,
                }}
              >
                {locked ? "Upgrade to access" : "AI marketing assistant"}
              </div>
            </div>
          )}
        </button>
      );
    })()}

    {/* ── Clients sidebar item (TheBoss/admin only, hidden while managing a client) ── */}
    {(() => {
      if (billingInfo?.username !== "TheBoss") return null;
      if (adminClientId) return null; // in client session mode, hide admin nav
      return (
        <button
          type="button"
          title="Admin — Client Management"
          onClick={() => navigate("/admin/clients")}
          style={{
            flex: isMobile ? 1 : "unset",
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "center" : "flex-start",
            gap: isMobile ? 0 : 12,
            width: "100%",
            textAlign: "left",
            borderRadius: 14,
            padding: isMobile ? "10px 4px" : "12px 12px",
            border: "1px solid transparent",
            background: "transparent",
            cursor: "pointer",
            marginTop: isMobile ? 0 : 6,
            transition: "all 180ms ease",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #f1f5f9 0%, #e9ebf2 100%)",
              color: "#5d59ea",
              fontSize: 14,
            }}
          >
            <FaUsers />
          </div>
          {!isMobile && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 14, lineHeight: 1.2, marginBottom: 2 }}>
                Clients
              </div>
              <div style={{ color: "#64748b", fontWeight: 700, fontSize: 11, lineHeight: 1.3 }}>
                Admin · Client management
              </div>
            </div>
          )}
        </button>
      );
    })()}
  </div>

  <div
    style={{
      flex: 1,
      background: "linear-gradient(180deg, #f7f8ff 0%, #f8fafc 55%, #f9fbff 100%)",
      padding: isMobile ? "14px" : "24px",
      display: "flex",
      flexDirection: "column",
      gap: isMobile ? 14 : 18,
      minHeight: isMobile ? 0 : 720,
    }}
  >
    {setupTab === "connect" && (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
            Connect Facebook
          </div>
          <div style={{ color: "#64748b", fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
            Link your Facebook Ads account so Smartemark can launch, monitor, and optimize campaigns.
          </div>
        </div>

        <div
          style={{
            background: "linear-gradient(150deg, #ffffff 0%, #f7f8ff 60%, #f0f3ff 100%)",
            border: "1px solid rgba(93,89,234,0.13)",
            borderRadius: 20,
            padding: isMobile ? 18 : 28,
            display: "flex",
            flexDirection: "column",
            gap: 22,
            minHeight: 520,
            justifyContent: "center",
            alignItems: "center",
            boxShadow: "0 8px 32px rgba(91,87,232,0.07)",
          }}
        >
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 22,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #eef2ff 0%, #dde3ff 100%)",
              border: "1px solid rgba(93,89,234,0.18)",
              color: "#4f46e5",
              fontSize: 30,
              fontWeight: 900,
              boxShadow: "0 6px 22px rgba(93,89,234,0.16)",
            }}
          >
            f
          </div>

          <div style={{ textAlign: "center", maxWidth: 560 }}>
            <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 28, marginBottom: 8 }}>
              {facebookConnectionStatus === "checking"
                ? "Checking Facebook connection…"
                : facebookConnectionStatus === "expired"
                ? "Facebook connection expired — reconnect"
                : facebookConnectionStatus === "error"
                ? "Facebook connection check failed — try refreshing"
                : fbConnected
                ? "Facebook Ads Connected"
                : "Connect your ad account"}
            </div>
            <div style={{ color: "#64748b", fontWeight: 700, fontSize: 15, lineHeight: 1.7 }}>
              {facebookConnectionStatus === "checking"
                ? "Verifying your Meta connection…"
                : facebookConnectionStatus === "expired"
                ? "Your Facebook token has expired. Click below to reconnect and restore access."
                : facebookConnectionStatus === "error"
                ? "A temporary network issue prevented the connection check. Your local connection state has been preserved."
                : fbConnected
                ? "Your Meta connection is active. Smartemark can now read campaign data, monitor performance, and manage optimization decisions."
                : "Start here first. Once connected, you’ll be able to review creatives and finish campaign setup."}
            </div>
          </div>

          <button
            onClick={async () => {
              trackEvent("connect_facebook", { page: "setup" });

              try {
                const u = String(loginUser || "").trim();
                if (u) localStorage.setItem("smartmark_login_username", u.replace(/^\$/, ""));
              } catch {}

              const qs = new URLSearchParams(location.search || "");
              const ctxFromState = (location.state?.ctxKey ? String(location.state.ctxKey) : "").trim();
              const ctxFromUrl = (qs.get("ctxKey") || "").trim();
              const active = (getActiveCtx(resolvedUser) || "").trim();
              const safeCtx = ctxFromState || ctxFromUrl || active || `${Date.now()}|||setup`;

              setActiveCtx(safeCtx, resolvedUser);

              try {
                const payload = JSON.stringify({ t: Date.now(), ctxKey: safeCtx });
                localStorage.setItem(LS_INFLIGHT_KEY(resolvedUser), payload);
                localStorage.setItem(LS_INFLIGHT_KEY("anon"), payload);
                localStorage.setItem(FB_CONNECT_INFLIGHT_KEY, payload);
              } catch {}

              try {
                saveSetupPreviewBackup(resolvedUser, {
                  headline: String(headline || previewCopy?.headline || "").trim(),
                  body: String(body || previewCopy?.body || "").trim(),
                  link: String(inferredLink || previewCopy?.link || "").trim(),
                  ctxKey: safeCtx,
                });
              } catch {}

              // Refresh the dedicated persistent website URL key before OAuth redirect.
              // This key survives the redirect unlike route state and has no TTL unlike the preview backup.
              try {
                const siteUrl = String(inferredLink || previewCopy?.link || "").trim();
                if (siteUrl) localStorage.setItem("sm_last_website_url_v1", siteUrl);
              } catch {}

              try {
                const imgs = resolveFetchableDraftImages({
                  user: resolvedUser,
                  draftImages: Array.isArray(draftCreatives?.images) ? draftCreatives.images : [],
                  navImages: Array.isArray(navImageUrls) ? navImageUrls : [],
                });

                let fetchables = [];
                try {
                  fetchables = await ensureFetchableUrls(imgs, 2);
                } catch {
                  fetchables = imgs || [];
                }

                saveFetchableImagesBackup(resolvedUser, fetchables);

                if (fetchables.length) {
                  persistDraftCreativesNow(resolvedUser, {
                    ctxKey: safeCtx,
                    images: fetchables,
                    mediaSelection: "image",
                    expiresAt: Date.now() + DEFAULT_CAMPAIGN_TTL_MS,
                  });
                }
              } catch {}

              // In admin-client mode, embed the clientId in the return URL and the
              // OAuth start URL so the callback knows whose token to store.
              const adminClientParam = adminClientId
                ? `&adminClientId=${encodeURIComponent(adminClientId)}`
                : "";

              const returnTo =
                window.location.origin +
                "/setup" +
                `?ctxKey=${encodeURIComponent(safeCtx)}&facebook_connected=1${adminClientParam}`;

              const sid = ensureStoredSid();
              window.location.assign(
                `/auth/facebook?sm_sid=${encodeURIComponent(sid)}&return_to=${encodeURIComponent(returnTo)}${adminClientParam}`
              );
            }}
            style={{
              padding: "14px 24px",
              borderRadius: 14,
              border: "none",
              background: fbConnected
                ? "linear-gradient(90deg, #4f46e5, #6366f1)"
                : "#1877F2",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: "1rem",
              cursor: "pointer",
              minWidth: 260,
              boxShadow: "0 10px 24px rgba(79,70,229,0.18)",
            }}
          >
            {facebookConnectionStatus === "checking"
              ? "Checking…"
              : facebookConnectionStatus === "expired" || fbExpired
              ? "Reconnect Facebook"
              : fbConnected
              ? "Facebook Ads Connected"
              : "Connect Facebook Ads"}
          </button>

          {/* ── Disconnect button + confirmation ── */}
          {fbConnected && (
            <div style={{ width: "100%", maxWidth: 680 }}>
              {!showDisconnectConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDisconnectConfirm(true)}
                  style={{
                    background: "none",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    padding: "7px 14px",
                    color: "#b91c1c",
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  Disconnect Facebook
                </button>
              ) : (
                <div style={{
                  background: "#fff1f2",
                  border: "1px solid #fecaca",
                  borderRadius: 12,
                  padding: "12px 16px",
                  fontSize: 13,
                }}>
                  <div style={{ fontWeight: 700, color: "#7f1d1d", marginBottom: 8 }}>
                    {adminClientId
                      ? `Disconnect Facebook for this client only? This will remove the saved Facebook connection for ${adminClientBusinessName || adminClientId} and will not affect other clients.`
                      : "Disconnect Facebook from this Smartemark account? This will remove the saved Facebook connection for this account only."}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => setShowDisconnectConfirm(false)}
                      style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#7f1d1d", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleFbDisconnect}
                      disabled={disconnecting}
                      style={{ background: "#b91c1c", border: "none", borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: disconnecting ? "not-allowed" : "pointer", opacity: disconnecting ? 0.7 : 1 }}
                    >
                      {disconnecting ? "Disconnecting…" : "Yes, Disconnect"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Account + Page dropdowns ── */}
          {fbConnected && (
            <div style={{ width: "100%", maxWidth: 680, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Ad Account dropdown */}
              <div
                style={{
                  background: "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
                  border: "1px solid rgba(93,89,234,0.12)",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 4px 14px rgba(91,87,232,0.06)",
                }}
              >
                <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 11, marginBottom: 8 }}>
                  AD ACCOUNT ({adAccounts.length} found)
                </div>
                {adAccounts.length > 0 ? (
                  <select
                    value={selectedAccount}
                    onChange={(e) => setSelectedAccount(String(e.target.value).replace(/^act_/, ""))}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(93,89,234,0.2)",
                      background: "#f7f8ff",
                      color: "#0f172a",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    {adAccounts.map((a) => {
                      const id = String(a.id || "").replace(/^act_/, "");
                      // account_status is used by the normal /facebook/adaccounts route;
                      // status is used by the /api/admin/clients/:id/facebook-info route.
                      const status = Number(a.account_status ?? a.status);
                      const statusLabel = status === 1 ? "" : status === 2 ? " ⚠ Disabled" : status === 3 ? " ⚠ Unsettled" : status > 0 ? " ⚠ Not Active" : "";
                      return (
                        <option key={id} value={id}>
                          {a.name ? `${a.name} (${id})${statusLabel}` : `ID: ${id}${statusLabel}`}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>
                    {selectedAccount ? `Account ID: ${selectedAccount}` : "Loading ad accounts…"}
                  </div>
                )}
                {/* Payment method warning */}
                {(() => {
                  const acct = adAccounts.find((a) => String(a.id).replace(/^act_/, "") === selectedAccount);
                  if (!acct) return null;
                  const status = Number(acct.account_status ?? acct.status);
                  if (status === 1 || status === 0) return null;
                  return (
                    <div style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#fffbeb",
                      border: "1px solid #fcd34d",
                      color: "#92400e",
                      fontWeight: 700,
                      fontSize: 12,
                    }}>
                      ⚠ Payment method needed before launch — this ad account is not active (status {status}).
                    </div>
                  );
                })()}
              </div>

              {/* Page dropdown */}
              <div
                style={{
                  background: "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
                  border: "1px solid rgba(93,89,234,0.12)",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 4px 14px rgba(91,87,232,0.06)",
                }}
              >
                <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 11, marginBottom: 8 }}>
                  FACEBOOK PAGE ({pages.length} found)
                </div>
                {pages.length > 0 ? (
                  <select
                    value={selectedPageId}
                    onChange={(e) => setSelectedPageId(String(e.target.value))}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(93,89,234,0.2)",
                      background: "#f7f8ff",
                      color: "#0f172a",
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name ? `${p.name} (${p.id})` : `Page ID: ${p.id}`}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>
                    {selectedPageId ? `Page ID: ${selectedPageId}` : "Loading pages…"}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </>
    )}

  {setupTab === "creatives" && (
  <>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
        Creatives
      </div>
      <div style={{ color: "#64748b", fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
        Current visuals, copy, and AI creative activity for this campaign.
      </div>
    </div>

    <div
      style={{
        background: "linear-gradient(150deg, #ffffff 0%, #f7f8ff 70%, #f0f3ff 100%)",
        border: "1px solid rgba(93,89,234,0.12)",
        borderRadius: 20,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        minHeight: 520,
        boxShadow: "0 8px 32px rgba(91,87,232,0.07)",
      }}
    >
      {selectedCampaignId ? (
        <>
          {(() => {
            const creativeMeta = selectedCampaignCreatives?.meta || {};
            // Prefer optimizer-state currentPrimaryText/currentHeadline (set by AI or manual
            // Smartemark edit) over the creative record, which is refreshed from live Meta on
            // every /creatives fetch and is now always the latest source of truth.
            const aiCurrentPrimaryText =
              selectedOptimizerState?.currentPrimaryText ||
              selectedOptimizerState?.latestAction?.actionResult?.updatedPrimaryText ||
              null;
            const aiCurrentHeadline =
              selectedOptimizerState?.currentHeadline ||
              null;
            const images = (selectedCampaignCreatives?.images || []).slice(0, 2);
            const creativeIsVideo = (selectedCampaignCreatives?.mediaType || selectedCampaignCreatives?.mediaSelection || "image") === "video";
            const creativeVideoUrl = creativeIsVideo
              ? (isDraftView ? navVideoUrl : String(selectedCampaignCreatives?.videos?.[0] || "").trim())
              : "";
            const pending =
              selectedCampaignId !== "__DRAFT__"
                ? optimizerCreativeMap[selectedCampaignId || ""]?.pendingCreativeTest || null
                : null;

            const pendingStatus = String(pending?.status || "").trim().toLowerCase();
            const isTesting =
              pendingStatus === "live" ||
              pendingStatus === "ready" ||
              pendingStatus === "staged";

            const isDraftView = selectedCampaignId === "__DRAFT__";

            return (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 18, marginBottom: 4 }}>
                      {isDraftView ? "Draft Creatives" : "Campaign Creatives"}
                    </div>
                    <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>
                      {isDraftView
                        ? "These creatives were transferred from FormPage and are ready for launch."
                        : "Smartemark stores the current visuals and copy here."}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div
                        style={{
                          padding: "7px 11px",
                          borderRadius: 999,
                          background: "#eef2ff",
                          color: "#4f46e5",
                          fontWeight: 900,
                          fontSize: 12,
                        }}
                      >
                        {isDraftView ? "Draft Ready" : isTesting ? "A/B Testing" : "Monitoring"}
                      </div>

                      {/* ── 3-dot creative replace menu ── */}
                      <div style={{ position: "relative" }}>
                        <button
                          type="button"
                          title="Creative options"
                          onClick={() => { setCreativeMenuOpen((v) => !v); setCreativeReplaceConfirm(null); }}
                          style={{
                            background: "none",
                            border: "1px solid #dbe4ff",
                            borderRadius: 8,
                            padding: "5px 8px",
                            color: "#4f46e5",
                            fontSize: 14,
                            cursor: "pointer",
                            lineHeight: 1,
                          }}
                        >
                          <FaEllipsisV />
                        </button>

                        {creativeMenuOpen && (
                          <div
                            style={{
                              position: "absolute",
                              right: 0,
                              top: "110%",
                              background: "#ffffff",
                              border: "1px solid #dbe4ff",
                              borderRadius: 12,
                              boxShadow: "0 8px 24px rgba(79,70,229,0.12)",
                              padding: "6px 0",
                              zIndex: 200,
                              minWidth: 190,
                            }}
                          >
                            {[
                              { key: "ai_image",     label: "✨ Replace with AI Image" },
                              { key: "upload_photo", label: "📷 Upload New Photo" },
                              { key: "upload_video", label: "🎬 Upload New Video" },
                            ].map(({ key, label }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setCreativeMenuOpen(false);
                                  setCreativeReplaceConfirm({ action: key });
                                }}
                                style={{
                                  width: "100%",
                                  display: "block",
                                  textAlign: "left",
                                  padding: "8px 16px",
                                  background: "none",
                                  border: "none",
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: "#111827",
                                  cursor: "pointer",
                                }}
                              >
                                {label}
                              </button>
                            ))}
                            <div style={{ borderTop: "1px solid #f0f0f8", margin: "4px 0" }} />
                            <button
                              type="button"
                              onClick={() => {
                                setCreativeMenuOpen(false);
                                setCopyEditPrimaryText(
                                  aiCurrentPrimaryText || creativeMeta?.body || previewCopy?.body || body || ""
                                );
                                setCopyEditHeadline(
                                  creativeMeta?.headline || previewCopy?.headline || headline || ""
                                );
                                setCopyEditError(null);
                                setCopyEditMode(true);
                              }}
                              style={{
                                width: "100%",
                                display: "block",
                                textAlign: "left",
                                padding: "8px 16px",
                                background: "none",
                                border: "none",
                                fontSize: 13,
                                fontWeight: 600,
                                color: "#111827",
                                cursor: "pointer",
                              }}
                            >
                              ✏️ Edit Copy
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Creative replace confirmation panel */}
                    {creativeReplaceConfirm && (
                      <div style={{
                        background: "#fffbeb",
                        border: "1px solid #fcd34d",
                        borderRadius: 10,
                        padding: "10px 14px",
                        fontSize: 12,
                        maxWidth: 240,
                        textAlign: "right",
                      }}>
                        <div style={{ fontWeight: 700, color: "#78350f", marginBottom: 6 }}>
                          {selectedLiveCampaign && !isDraftView
                            ? "This campaign is currently running. Replacing the creative may affect live ads. Continue?"
                            : "Replace this creative?"}
                        </div>
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            onClick={() => setCreativeReplaceConfirm(null)}
                            style={{ background: "none", border: "1px solid #d4a000", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 600, color: "#78350f", cursor: "pointer" }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const action = creativeReplaceConfirm.action;
                              setCreativeReplaceConfirm(null);
                              if (selectedLiveCampaign && !isDraftView) {
                                alert("Creative replacement saved in Smartemark. Apply-to-live-ad support will be added separately.");
                              }
                              navigate(
                                withAdminClientQuery(`/form?creativeMode=${encodeURIComponent(action)}`, adminClientId),
                                { state: adminClientId ? { adminClientId } : undefined }
                              );
                            }}
                            style={{ background: "#4f46e5", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#fff", cursor: "pointer" }}
                          >
                            Continue
                          </button>
                        </div>
                      </div>
                    )}

                    {isDraftView && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCampaign("__DRAFT__")}
                        style={{
                          background: "#fff1f2",
                          border: "1px solid #ffd6d6",
                          borderRadius: 8,
                          padding: "5px 10px",
                          color: "#b42318",
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Clear draft creatives
                      </button>
                    )}

                    {/* Multi-creative set cards — shown in draft view when a creativeSet exists */}
                    {isDraftView && draftCreatives.creativeSet && draftCreatives.creativeSet.length > 1 && (
                      <div style={{ width: "100%", marginTop: 16 }}>
                        <div style={{ fontWeight: 800, fontSize: 13, color: "#334155", marginBottom: 8 }}>
                          {draftCreatives.creativeSet.length}-Ad Creative Test Plan
                        </div>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {draftCreatives.creativeSet.map((c, idx) => (
                            <div
                              key={c.id || idx}
                              onClick={() => setExpandedCreativeCardIdx(expandedCreativeCardIdx === idx ? null : idx)}
                              style={{
                                flex: "1 1 200px",
                                minWidth: 160,
                                maxWidth: 260,
                                background: "#fff",
                                border: expandedCreativeCardIdx === idx ? "2px solid #5d59ea" : "1px solid #dbe4ff",
                                borderRadius: 14,
                                padding: "10px 12px",
                                cursor: "pointer",
                                boxShadow: "0 2px 8px rgba(93,89,234,0.08)",
                                transition: "border 0.15s",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                                <span style={{ background: "#eef2ff", color: "#4f46e5", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
                                  {c.angleLabel || c.angle || `Ad ${idx + 1}`}
                                </span>
                              </div>
                              {c.imageUrl && (
                                <img
                                  src={toAbsoluteMedia(c.imageUrl)}
                                  alt="creative"
                                  style={{ width: "100%", borderRadius: 8, aspectRatio: "1/1", objectFit: "cover", marginBottom: 6 }}
                                  onError={(e) => { e.target.style.display = "none"; }}
                                />
                              )}
                              <div style={{ fontWeight: 800, fontSize: 13, color: "#0f172a", marginBottom: 3, lineHeight: 1.3 }}>
                                {c.headline || "(no headline)"}
                              </div>
                              {expandedCreativeCardIdx === idx && (
                                <>
                                  <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, marginBottom: 4 }}>
                                    {c.body || ""}
                                  </div>
                                  <div style={{ fontSize: 11, color: "#4f46e5", fontWeight: 700 }}>
                                    CTA: {c.cta || "Learn more"}
                                  </div>
                                  <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 4 }}>
                                    Status: {c.status || "draft"}
                                  </div>
                                </>
                              )}
                              {expandedCreativeCardIdx !== idx && (
                                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                                  {(c.body || "").slice(0, 60)}{c.body?.length > 60 ? "…" : ""}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8, fontWeight: 600 }}>
                          Launch creates 1 campaign · 1 ad set · {draftCreatives.creativeSet.length} ads — one per angle
                        </div>
                        <div style={{
                          marginTop: 12, padding: "10px 14px",
                          background: "#f8fafc", border: "1px solid #e2e8f0",
                          borderRadius: 10, fontSize: 12, color: "#64748b", fontStyle: "italic",
                        }}>
                          Ad-level metrics will appear after delivery data is available.
                        </div>
                      </div>
                    )}
                    {!isDraftView && !selectedLiveCampaign?.smArchived && (
                      <button
                        type="button"
                        onClick={() => {
                          setCopyEditPrimaryText(
                            aiCurrentPrimaryText ||
                            creativeMeta?.body ||
                            previewCopy?.body ||
                            body ||
                            ""
                          );
                          setCopyEditHeadline(
                            creativeMeta?.headline ||
                            previewCopy?.headline ||
                            headline ||
                            ""
                          );
                          setCopyEditError(null);
                          setCopyEditMode(true);
                        }}
                        style={{
                          background: "#fff",
                          border: "1px solid #dbe4ff",
                          borderRadius: 8,
                          padding: "5px 10px",
                          color: "#4f46e5",
                          fontWeight: 700,
                          fontSize: 11,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Edit copy
                      </button>
                    )}
                  </div>
                </div>

                {creativeIsVideo && creativeVideoUrl ? (
                  <div
                    style={{
                      border: "1px solid rgba(93,89,234,0.12)",
                      borderRadius: 18,
                      overflow: "hidden",
                      background: "#f8fafc",
                      boxShadow: "0 4px 16px rgba(91,87,232,0.07)",
                    }}
                  >
                    <div style={{ background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <video
                        src={toAbsoluteMedia(creativeVideoUrl)}
                        controls
                        style={{ width: "100%", maxHeight: 340, display: "block", background: "#0f172a" }}
                      />
                    </div>
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ background: "#eef2ff", color: "#4f46e5", fontWeight: 800, fontSize: 11, borderRadius: 6, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.4 }}>Video Creative</span>
                        {navVideoMeta?.originalName && (
                          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600 }}>{navVideoMeta.originalName}</span>
                        )}
                      </div>
                      <div>
                        <div style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Primary Copy</div>
                        <div style={{ color: "#111827", fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
                          {String(aiCurrentPrimaryText || creativeMeta?.body || previewCopy?.body || body || "No copy available yet.").trim()}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Headline</div>
                        <div style={{ color: "#111827", fontWeight: 800, fontSize: 14, lineHeight: 1.5 }}>
                          {String(aiCurrentHeadline || creativeMeta?.headline || previewCopy?.headline || headline || "No headline available yet.").trim()}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : images.length ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: images.length > 1 ? "repeat(2, minmax(0, 1fr))" : "1fr",
                      gap: 16,
                    }}
                  >
                    {images.map((img, idx) => (
                      <div
                        key={`${img}-${idx}`}
                        style={{
                          border: "1px solid rgba(93,89,234,0.12)",
                          borderRadius: 18,
                          overflow: "hidden",
                          background: "#f8fafc",
                          boxShadow: "0 4px 16px rgba(91,87,232,0.07)",
                        }}
                      >
                        <div
                          style={{
                            background: "#0f172a",
                            minHeight: 280,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setModalImg(img);
                            setShowImageModal(true);
                          }}
                        >
                          <img
                            src={toAbsoluteMedia(img)}
                            alt={`Creative ${idx + 1}`}
                            style={{
                              width: "100%",
                              height: 280,
                              objectFit: "contain",
                              display: "block",
                              background: "#0f172a",
                            }}
                          />
                        </div>

                        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <div
                              style={{
                                color: "#98a2b3",
                                fontWeight: 800,
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                                marginBottom: 6,
                              }}
                            >
                              Primary Copy
                            </div>
                            <div
                              style={{
                                color: "#111827",
                                fontWeight: 700,
                                fontSize: 14,
                                lineHeight: 1.6,
                              }}
                            >
                              {String(aiCurrentPrimaryText || creativeMeta?.body || previewCopy?.body || body || "No copy available yet.").trim()}
                            </div>
                          </div>

                          <div>
                            <div
                              style={{
                                color: "#98a2b3",
                                fontWeight: 800,
                                fontSize: 11,
                                textTransform: "uppercase",
                                letterSpacing: 0.4,
                                marginBottom: 6,
                              }}
                            >
                              Headline
                            </div>
                            <div
                              style={{
                                color: "#111827",
                                fontWeight: 800,
                                fontSize: 14,
                                lineHeight: 1.5,
                              }}
                            >
                              {String(aiCurrentHeadline || creativeMeta?.headline || previewCopy?.headline || headline || "No headline available yet.").trim()}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    style={{
                      border: "1px dashed #dbe4ff",
                      borderRadius: 16,
                      padding: 18,
                      background: "#f8fafc",
                      color: "#64748b",
                      fontWeight: 700,
                      fontSize: 14,
                    }}
                  >
                    No creatives available yet.
                  </div>
                )}

                {copyEditMode && !isDraftView && (
                  <div
                    style={{
                      border: "1px solid #dbe4ff",
                      borderRadius: 16,
                      padding: 18,
                      background: "#fff",
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                    }}
                  >
                    <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 15 }}>
                      Edit Campaign Copy
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 12,
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                        }}
                      >
                        Primary Text
                      </div>
                      <textarea
                        value={copyEditPrimaryText}
                        onChange={(e) => setCopyEditPrimaryText(e.target.value)}
                        maxLength={2000}
                        rows={5}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "1px solid #dbe4ff",
                          borderRadius: 8,
                          fontSize: 13,
                          fontFamily: "inherit",
                          lineHeight: 1.6,
                          resize: "vertical",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                      <div
                        style={{
                          color: "#94a3b8",
                          fontSize: 11,
                          fontWeight: 600,
                          marginTop: 3,
                          textAlign: "right",
                        }}
                      >
                        {String(copyEditPrimaryText || "").length}/2000
                      </div>
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 12,
                          marginBottom: 6,
                          textTransform: "uppercase",
                          letterSpacing: 0.4,
                        }}
                      >
                        Headline <span style={{ fontWeight: 500, color: "#94a3b8" }}>(optional)</span>
                      </div>
                      <input
                        type="text"
                        value={copyEditHeadline}
                        onChange={(e) => setCopyEditHeadline(e.target.value)}
                        maxLength={255}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          border: "1px solid #dbe4ff",
                          borderRadius: 8,
                          fontSize: 13,
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                          outline: "none",
                        }}
                      />
                    </div>

                    {copyEditError && (
                      <div
                        style={{
                          color: "#b42318",
                          fontWeight: 700,
                          fontSize: 13,
                          background: "#fff1f2",
                          border: "1px solid #ffd6d6",
                          borderRadius: 8,
                          padding: "8px 12px",
                        }}
                      >
                        {copyEditError}
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={handleSaveCopyEdit}
                        disabled={copyEditLoading || !String(copyEditPrimaryText || "").trim()}
                        style={{
                          background:
                            copyEditLoading || !String(copyEditPrimaryText || "").trim()
                              ? "#a5b4fc"
                              : "#4f46e5",
                          border: "none",
                          borderRadius: 8,
                          padding: "9px 18px",
                          color: "#fff",
                          fontWeight: 900,
                          fontSize: 13,
                          cursor:
                            copyEditLoading || !String(copyEditPrimaryText || "").trim()
                              ? "default"
                              : "pointer",
                        }}
                      >
                        {copyEditLoading ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCopyEditMode(false);
                          setCopyEditError(null);
                        }}
                        disabled={copyEditLoading}
                        style={{
                          background: "#f1f5f9",
                          border: "1px solid #dbe4ff",
                          borderRadius: 8,
                          padding: "9px 18px",
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: copyEditLoading ? "default" : "pointer",
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                <div
                  style={{
                    border: "1px solid rgba(93,89,234,0.10)",
                    borderRadius: 16,
                    padding: 16,
                    background: "linear-gradient(135deg, #f7f8ff 0%, #eef0ff 100%)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ color: "#111827", fontWeight: 900, fontSize: 15 }}>
                    AI Overview
                  </div>
                  <div
                    style={{
                      color: "#64748b",
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.6,
                    }}
                  >
                    {isDraftView
                      ? "These draft creatives came from your FormPage flow and should appear here automatically before launch."
                      : isTesting
                      ? "Smartemark is running a limited creative test and comparing performance before picking a winner. It will not keep creating more ads unless the data clearly justifies another round."
                      : "Smartemark is monitoring the current ads and will only create a new test when the campaign data shows a real need for it."}
                  </div>
                </div>
              </>
            );
          })()}
        </>
      ) : (
        <div
          style={{
            border: "1px dashed #dbe4ff",
            borderRadius: 16,
            padding: 18,
            background: "#f8fafc",
            color: "#64748b",
            fontWeight: 700,
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          Select a campaign or draft to view creatives here.
        </div>
      )}
    </div>
  </>
)}

    {setupTab === "campaign" && (
      <>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
            Campaign
          </div>
          <div style={{ color: "#667085", fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
            Metrics, AI updates, billing, and launch controls.
          </div>
        </div>

         <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "linear-gradient(160deg, #ffffff 0%, #f7f8ff 50%, #f0f3ff 100%)",
              border: "1px solid rgba(93,89,234,0.14)",
              borderRadius: 22,
              padding: 22,
              display: "flex",
              flexDirection: "column",
              gap: 18,
              minHeight: 620,
              boxShadow: "0 16px 48px rgba(91,87,232,0.10), inset 0 1px 0 rgba(255,255,255,0.95)",
            }}
          >
           <div
  style={{
    display: "flex",
    flexDirection: "column",
    gap: 12,
  }}
>
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      flexWrap: "wrap",
    }}
  >
    <div>
      <div
        style={{
          color: "#111827",
          fontWeight: 900,
          fontSize: 18,
          marginBottom: 6,
        }}
      >
        Active Campaign
      </div>
      <div
        style={{
          color: "#667085",
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1.5,
        }}
      >
        Select a draft or live campaign to manage.
      </div>
    </div>

    {/* ── Status strip + Refresh ── */}
    {selectedLiveCampaign && (() => {
      const rawSt = String(selectedLiveCampaign.status || selectedLiveCampaign.effective_status || "").toUpperCase();
      const stColor = rawSt === "ACTIVE" ? "#16a34a" : rawSt === "PAUSED" ? "#d97706" : rawSt === "ARCHIVED" ? "#6b7280" : "#9ca3af";
      const metaLabel = rawSt || "UNKNOWN";
      const metrics = metricsMap[selectedLiveCampaign.id] || {};
      const hasImpressions = Number(metrics.impressions) > 0;
      const statusMsg = rawSt === "ACTIVE" && !hasImpressions
        ? "Campaign is active. Meta may still be reviewing or learning before delivery starts."
        : null;
      const ov = recentStatusOverridesRef.current[selectedLiveCampaign.id];
      const freshOverride = ov && Date.now() < ov.expiresAt;
      const metaConfirmed = freshOverride && ov.metaConfirmed;
      // "Launched" when launchComplete=true OR campaign has a real Meta status —
      // a PAUSED campaign is still a launched campaign, never a "Draft".
      const _smRawSt = String(selectedLiveCampaign.status || selectedLiveCampaign.effective_status || "").toUpperCase();
      const _smHasRealStatus = ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"].includes(_smRawSt);
      const smStatus = selectedLiveCampaign.smArchived
        ? "Archived"
        : (selectedLiveCampaign.launchComplete || _smHasRealStatus)
        ? "Launched"
        : "Draft";
      // Warn if Smartemark has archived the campaign but Meta status suggests it could still spend
      const smArchivedButMetaLive = selectedLiveCampaign.smArchived &&
        ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"].includes(rawSt);
      const lastChecked = freshOverride ? ov.verifiedAt : selectedLiveCampaign.lastStatusCheckedAt;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: stColor, display: "inline-block" }} />
            <span style={{ fontWeight: 800, fontSize: 12, color: stColor }}>Meta: {metaLabel}</span>
            {metaConfirmed && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", background: "#dcfce7", borderRadius: 4, padding: "1px 6px" }}>
                confirmed
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>
            Smartemark: {smStatus}
          </span>
          {selectedLiveCampaign.id && (
            <span style={{ fontSize: 11, color: "#cbd5e1", fontWeight: 600 }}>
              ID: {selectedLiveCampaign.id}
            </span>
          )}
          {lastChecked && (
            <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 500 }}>
              Last checked: {new Date(lastChecked).toLocaleTimeString()}
            </span>
          )}
          {statusMsg && (
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{statusMsg}</span>
          )}
          {smArchivedButMetaLive && (
            <span style={{ fontSize: 11, color: "#b45309", fontWeight: 700, background: "#fef3c7", borderRadius: 4, padding: "2px 8px" }}>
              Hidden from Smartemark only. This may still exist in Meta Ads Manager.
            </span>
          )}
          {adminClientId && (
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await refreshAdminCampaigns(adminClientId, setCampaigns, setMetricsMap, setOptimizerStateMap, setCampaignCreativesMap, recentStatusOverridesRef.current, selectedCampaignId);
                setLoading(false);
              }}
              disabled={loading}
              style={{ background: "none", border: "1px solid #dbe4ff", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "#4f46e5", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1 }}
            >
              ↻ Refresh Status
            </button>
          )}
        </div>
      );
    })()}

    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
     {selectedCampaignId === "__DRAFT__" && (
  <button
    type="button"
    onClick={() => handleDeleteCampaign("__DRAFT__")}
    title="Remove Draft"
    style={{
      width: 34,
      height: 34,
      borderRadius: 10,
      border: "1px solid #ffd6d6",
      background: "#fff1f2",
      color: "#b42318",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
    }}
  >
    <FaTrash />
  </button>
)}

      <button
        type="button"
        onClick={handleNewCampaign}
        title="New Campaign"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: "1px solid #dbe4ff",
          background: "#eef2ff",
          color: "#5b5cf0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <FaPlus />
      </button>
    </div>
  </div>

  <div style={{ position: "relative", display: "flex", gap: 10, alignItems: "center" }}>
    <select
      value={selectedCampaignId}
      onChange={(e) => {
        setSelectedCampaignId(e.target.value);
        setExpandedId(e.target.value);
        setShowCampaignMenu(false);
        setShowCampaignDetails(false);
      }}
      style={{
        padding: "12px 14px",
        borderRadius: 12,
        fontSize: 14,
        width: "100%",
        border: "1px solid #dbe4ff",
        background: "#ffffff",
        color: "#111827",
        fontWeight: 800,
        outline: "none",
        appearance: "auto",
      }}
    >
      <option value="">Select a campaign</option>
      {!showArchived && hasDraft && (
        <option value="__DRAFT__">
          {(form.campaignName || "Untitled")} (Draft)
        </option>
      )}
      {(showArchived
        ? campaigns.filter((c) => isEffectivelyArchived(c) && !c.hiddenFromHistory)
        : campaigns.filter((c) => {
            const snap = optimizerStateMap[c.id]?.metricsSnapshot || metricsMap[c.id] || null;
            return isUsefulCurrentCampaign(c, snap);
          })
      ).map((c) => {
        const ds = getCampaignDisplayStatus(c);
        return (
          <option key={c.id} value={c.id}>
            {c.name || "Campaign"}{ds !== "Active" ? ` (${ds})` : ""}
          </option>
        );
      })}
    </select>

    {selectedLiveCampaign && (() => {
        // Only show the pause/unpause icon for campaigns with a KNOWN live Meta status.
        // Empty/default status (from old DB stubs) must never trigger a Meta /pause call.
        const _rawSt = String(selectedLiveCampaign.status || selectedLiveCampaign.effective_status || "").toUpperCase();
        const _knownLive = ["ACTIVE", "PAUSED", "IN_PROCESS", "WITH_ISSUES"].includes(_rawSt);
        if (!_knownLive) return false;
        if (!["Active", "Paused"].includes(getCampaignDisplayStatus(selectedLiveCampaign))) return false;
        // Also skip for generic/clutter campaigns (they would call /pause on a non-existent Meta object)
        const _snap = (optimizerStateMap[selectedLiveCampaign?.id]?.metricsSnapshot) ||
                      (metricsMap[selectedLiveCampaign?.id] || null);
        return isUsefulCurrentCampaign(selectedLiveCampaign, _snap);
      })() && (
      <button
        type="button"
        onClick={() => {
          const currentStatus = String(
            selectedLiveCampaign?.status || selectedLiveCampaign?.effective_status || "ACTIVE"
          ).toUpperCase();
          const currentlyPaused = currentStatus === "PAUSED";
          handlePauseUnpauseCampaign(selectedLiveCampaign.id, currentlyPaused);
        }}
        disabled={loading}
        title={
          String(selectedLiveCampaign?.status || selectedLiveCampaign?.effective_status || "ACTIVE").toUpperCase() === "PAUSED"
            ? "Unpause"
            : "Pause"
        }
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: "1px solid #dbe4ff",
          background:
            String(selectedLiveCampaign?.status || selectedLiveCampaign?.effective_status || "ACTIVE").toUpperCase() === "PAUSED"
              ? "#dcfce7"
              : "#fef3c7",
          color: "#111827",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.6 : 1,
          flex: "0 0 auto",
        }}
      >
        {String(selectedLiveCampaign?.status || selectedLiveCampaign?.effective_status || "ACTIVE").toUpperCase() === "PAUSED" ? (
          <FaPlay />
        ) : (
          <FaPause />
        )}
      </button>
    )}

    <button
      type="button"
      onClick={() => setShowCampaignMenu((v) => !v)}
      title="Campaign actions"
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        border: "1px solid #dbe4ff",
        background: "#ffffff",
        color: "#111827",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        flex: "0 0 auto",
      }}
    >
      <FaEllipsisV />
    </button>

    {selectedLiveCampaign && (
      <button
        type="button"
        onClick={() => { setShowAiSettings((v) => !v); setShowCampaignMenu(false); }}
        title="AI Control Settings"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: showAiSettings ? "1px solid #818cf8" : "1px solid #dbe4ff",
          background: showAiSettings ? "#eef2ff" : "#ffffff",
          color: showAiSettings ? "#5b5cf0" : "#6b7280",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flex: "0 0 auto",
        }}
      >
        <FaCog />
      </button>
    )}

    {showCampaignMenu && (
      <div
        style={{
          position: "absolute",
          top: 46,
          right: 0,
          minWidth: 190,
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          boxShadow: "0 18px 40px rgba(15,23,42,0.12)",
          padding: 8,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {selectedLiveCampaign && (
          <>
            <button
              type="button"
              onClick={() => { setShowCampaignMenu(false); setShowCampaignDetails((v) => !v); }}
              style={{ background: "#ffffff", color: "#111827", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Campaign details
            </button>
            <button
              type="button"
              onClick={openEditCurrentCampaign}
              style={{ background: "#ffffff", color: "#111827", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Edit budget + duration
            </button>
          </>
        )}

        {isEffectivelyArchived(selectedLiveCampaign) ? (
          <>
            <button
              type="button"
              onClick={() => handleUnarchiveCampaign(selectedLiveCampaign.id)}
              style={{ background: "#ffffff", color: "#374151", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Unarchive campaign
            </button>
            <button
              type="button"
              onClick={() => handleHideFromHistory(selectedLiveCampaign.id)}
              style={{ background: "#ffffff", color: "#b42318", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Hide from Smartemark only
            </button>
            <button
              type="button"
              onClick={() => {
                const firstActive = campaigns.find((c) => !isEffectivelyArchived(c) && !c.hiddenFromHistory);
                setShowArchived(false);
                setSelectedCampaignId(firstActive?.id || "");
                setExpandedId(firstActive?.id || null);
                setShowCampaignMenu(false);
              }}
              style={{ background: "#ffffff", color: "#6366f1", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              ← Back to active campaigns
            </button>
          </>
        ) : selectedLiveCampaign ? (
          <>
            {/* "Archive in Smartemark only" has no admin-client DB-only path —
                in admin-client mode the cancel route would hit Meta.
                Only show this in normal-user mode where /archive PATCH is DB-only. */}
            {!adminClientId && (
              <button
                type="button"
                onClick={() => handleArchiveCampaign(selectedLiveCampaign.id)}
                style={{ background: "#ffffff", color: "#374151", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                Archive in Smartemark only
              </button>
            )}
            {archiveMetaConfirmId === selectedLiveCampaign.id ? (
              <div style={{ padding: "10px 12px", background: "#fff7ed", borderRadius: 10, border: "1px solid #fed7aa" }}>
                <div style={{ fontSize: 12, color: "#92400e", fontWeight: 700, marginBottom: 8 }}>
                  This will stop this campaign from running on Meta. Meta treats deleted campaigns as archived, so it will be removed from your active campaign list and should no longer spend. This is different from hiding it from Smartemark only.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => handleStopArchiveOnMeta(selectedLiveCampaign.id)}
                    style={{ background: "#b91c1c", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 7, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                  >
                    Confirm stop
                  </button>
                  <button
                    type="button"
                    onClick={() => setArchiveMetaConfirmId(null)}
                    style={{ background: "#f3f4f6", color: "#374151", border: "none", padding: "6px 14px", borderRadius: 7, fontWeight: 800, fontSize: 12, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setArchiveMetaConfirmId(selectedLiveCampaign.id)}
                style={{ background: "#ffffff", color: "#b91c1c", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                Delete / Stop Campaign
              </button>
            )}
            {campaigns.some((c) => isEffectivelyArchived(c) && !c.hiddenFromHistory) && (
              <button
                type="button"
                onClick={() => {
                  const firstArchived = campaigns.find((c) => isEffectivelyArchived(c) && !c.hiddenFromHistory);
                  setShowArchived(true);
                  setSelectedCampaignId(firstArchived?.id || "");
                  setExpandedId(firstArchived?.id || null);
                  setShowCampaignMenu(false);
                }}
                style={{ background: "#ffffff", color: "#6366f1", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                View archived campaigns
              </button>
            )}
          </>
        ) : campaigns.some((c) => isEffectivelyArchived(c) && !c.hiddenFromHistory) ? (
          <button
            type="button"
            onClick={() => {
              const firstArchived = campaigns.find((c) => isEffectivelyArchived(c) && !c.hiddenFromHistory);
              setShowArchived(true);
              setSelectedCampaignId(firstArchived?.id || "");
              setExpandedId(firstArchived?.id || null);
              setShowCampaignMenu(false);
            }}
            style={{ background: "#ffffff", color: "#6366f1", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
          >
            View archived campaigns
          </button>
        ) : (
          <div style={{ padding: "10px 12px", color: "#9ca3af", fontSize: 13 }}>No campaign selected</div>
        )}

        {selectedLiveCampaign && (() => {
          const _st   = String(selectedLiveCampaign.status || selectedLiveCampaign.effective_status || "").toUpperCase();
          const _snap = optimizerStateMap[selectedLiveCampaign?.id]?.metricsSnapshot ||
                        metricsMap[selectedLiveCampaign?.id] || null;
          // Truly live = known live Meta status + not archived + passes the useful-campaign check.
          // Generic/stub/zero-delivery campaigns fail isUsefulCurrentCampaign → not treated as live.
          const _isTrulyLive = ["ACTIVE", "IN_PROCESS", "WITH_ISSUES"].includes(_st) &&
                               !selectedLiveCampaign.smArchived &&
                               isUsefulCurrentCampaign(selectedLiveCampaign, _snap);
          // In admin-client mode "Delete / Stop Campaign" (above) is the authoritative stop action.
          // "Cancel live campaign" would also hit Meta via the cancel route — suppress it so the
          // only Meta-touching actions in admin-client mode are Pause, Unpause, and Delete / Stop Campaign.
          if (_isTrulyLive && !adminClientId) {
            return (
              <button
                type="button"
                onClick={() => { setShowCampaignMenu(false); handleDeleteCampaign(selectedLiveCampaign.id); }}
                style={{ background: "#ffffff", color: "#b42318", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
              >
                Cancel live campaign
              </button>
            );
          }
          // Non-live (PAUSED, FINISHED, generic stubs, etc.) — hide locally only, never call Meta
          return (
            <button
              type="button"
              onClick={() => handleHideFromHistory(selectedLiveCampaign.id)}
              style={{ background: "#ffffff", color: "#b42318", border: "none", textAlign: "left", padding: "10px 12px", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer" }}
            >
              Hide from Smartemark only — does not stop Meta ads
            </button>
          );
        })()}

      </div>
    )}
  </div>
</div>

{/* ── AI Control Settings Panel ─────────────────────────────────────────── */}
{showAiSettings && selectedLiveCampaign && (
  <div style={{
    background: "#fff",
    border: "1px solid #e0e7ff",
    borderRadius: 14,
    padding: "18px 20px",
    marginTop: 8,
    boxShadow: "0 4px 16px rgba(91,92,240,0.08)",
  }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <div>
        <div style={{ fontWeight: 800, fontSize: 14, color: "#111827" }}>AI Control Settings</div>
        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
          {adminClientId ? `Managing: ${adminClientId}` : "This campaign"}
        </div>
      </div>
      {aiSettingsSaving && (
        <span style={{ fontSize: 11, color: "#9ca3af" }}>Saving…</span>
      )}
    </div>

    {/* Autopilot toggle */}
    <div style={{ background: "#f9fafb", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111827", marginBottom: 2 }}>Autopilot</div>
          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            {aiSettings.aiAutopilotEnabled
              ? "AI marketer is active"
              : "Manual mode — AI can suggest, but cannot act automatically"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
            When enabled, Smartemark can automatically monitor, test, and optimize this campaign.
          </div>
        </div>
        <button
          type="button"
          onClick={() => saveAiSettings({ aiAutopilotEnabled: !aiSettings.aiAutopilotEnabled })}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: "none",
            background: aiSettings.aiAutopilotEnabled ? "#5b5cf0" : "#d1d5db",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute",
            top: 3,
            left: aiSettings.aiAutopilotEnabled ? 22 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }} />
        </button>
      </div>
    </div>

    {/* Require Approval toggle */}
    <div style={{ background: "#f9fafb", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111827", marginBottom: 2 }}>Require Approval</div>
          <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
            {aiSettings.aiApprovalRequired
              ? "Approval required before Meta changes"
              : aiSettings.aiAutopilotEnabled
                ? "AI can apply approved autopilot actions automatically"
                : "Manual mode — confirmation always required"}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4, lineHeight: 1.5 }}>
            AI must ask before applying campaign changes to Meta.
          </div>
        </div>
        <button
          type="button"
          onClick={() => saveAiSettings({ aiApprovalRequired: !aiSettings.aiApprovalRequired })}
          style={{
            width: 44,
            height: 24,
            borderRadius: 12,
            border: "none",
            background: aiSettings.aiApprovalRequired ? "#5b5cf0" : "#d1d5db",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            transition: "background 0.2s",
          }}
        >
          <span style={{
            position: "absolute",
            top: 3,
            left: aiSettings.aiApprovalRequired ? 22 : 3,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }} />
        </button>
      </div>
    </div>

    {!aiSettings.aiSettingsInitialized && (
      <div style={{
        fontSize: 12, color: "#92400e", fontWeight: 600, lineHeight: 1.6,
        background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8,
        padding: "8px 12px", marginBottom: 10,
      }}>
        Safe default active — AI will not make automatic changes until Autopilot is turned on.
      </div>
    )}
    <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.6, borderTop: "1px solid #f3f4f6", paddingTop: 10 }}>
      Manual mode does not stop existing Meta ads. Use Pause or Delete / Stop Campaign to stop spend.
    </div>
  </div>
)}

{showCampaignDetails && selectedLiveCampaign && (() => {
  const detId = String(selectedLiveCampaign.id || "").trim();
  const det = campaignSettingsMap[detId] || {};
  const fmtBudget = (v) => v && v !== "—" ? `$${v}/day` : "—";
  const fmtDate = (v) => v && v !== "—" ? v : "—";
  const rows = [
    { label: "Budget", value: fmtBudget(det.budget) },
    { label: "Start date", value: fmtDate(det.startDate) },
    { label: "End date", value: fmtDate(det.endDate) },
  ];
  return (
    <div
      style={{
        background: "#f7f9ff",
        border: "1px solid #dbe4ff",
        borderRadius: 14,
        padding: "14px 18px",
        marginTop: 8,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ color: "#111827", fontWeight: 900, fontSize: 13, marginBottom: 2 }}>
        Campaign Details
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map(({ label, value }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#98a2b3", fontWeight: 700, fontSize: 11 }}>{label}</span>
            <span style={{ color: "#111827", fontWeight: 800, fontSize: 13 }}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
})()}

           {selectedCampaignId ? (
  <>
    {selectedCampaignId !== "__DRAFT__" ? (
      <>
        {/* Campaign subtab bar */}
        <div style={{ display: "flex", gap: 4, paddingBottom: 12, borderBottom: "1px solid #e5e7eb", marginBottom: 4 }}>
          {[
            { key: "overview", label: "Overview" },
            { key: "actions", label: "AI Actions" },
            { key: "abtest", label: "A/B Test" },
          ].map((st) => {
            const isActive = campaignSubtab === st.key;
            const hasDot = st.key === "abtest" && !!selectedOptimizerState?.pendingCreativeTest;
            return (
              <button
                key={st.key}
                type="button"
                onClick={() => setCampaignSubtab(st.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  background: isActive ? "#5b5cf0" : "#f1f5f9",
                  color: isActive ? "#ffffff" : "#475569",
                  border: "none",
                  borderRadius: 8,
                  padding: "6px 14px",
                  fontSize: 12,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {st.label}
                {hasDot && (
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: isActive ? "rgba(255,255,255,0.7)" : "#16a34a", display: "inline-block", flexShrink: 0 }} />
                )}
              </button>
            );
          })}
        </div>

        {campaignSubtab === "actions" && (
          <MarketerActionsCard
            summary={selectedOptimizerSummary}
            optimizerState={selectedOptimizerState}
            metrics={metricsMap[selectedCampaignId]}
            onViewABTest={() => setCampaignSubtab("abtest")}
          />
        )}

        {campaignSubtab === "abtest" && (
          <CreativeABTestPanel
            optimizerState={selectedOptimizerState}
            campaignId={selectedCampaignId}
            accountId={selectedAccount}
            adminClientId={adminClientId}
            isMobile={isMobile}
            campaignCreatives={selectedCampaignCreatives}
            campaignName={selectedLiveCampaign?.name || ""}
            onChallengerRemoved={() => {
              setOptimizerStateMap((prev) => ({
                ...prev,
                [selectedCampaignId]: {
                  ...(prev[selectedCampaignId] || {}),
                  pendingCreativeTest: null,
                },
              }));
            }}
          />
        )}

        {campaignSubtab === "overview" && (
        <div
          style={{
            padding: "2px 0",
          }}
        >
          {(() => {
            const pk = String(
              adminClientId
                ? adminClientInfo?.planKey || ""
                : billingInfo?.planKey || ""
            ).trim().toLowerCase();
            const isAdminUser = String(billingInfo?.username || "").trim() === ADMIN_BYPASS_USERNAME;
            const showPremium = pk === "premium" || pk === "operator" || isAdminUser;
            return (
              <>
                <MetricsRow
                  metrics={metricsMap[selectedCampaignId]}
                  optimizerState={selectedOptimizerState}
                  showConversions={showPremium}
                />
                {showPremium && (() => {
                  const _snap = selectedOptimizerState?.metricsSnapshot || {};
                  const _convConfirmed = !!selectedOptimizerState?.conversionTrackingConfirmed;
                  const _convCount = Number(_snap.conversions || 0);
                  const _hasRawActions = Array.isArray(_snap.rawActions) && _snap.rawActions.length > 0;
                  const _hasDelivery = Number(_snap.impressions || 0) > 0;

                  const _trackingValue = _convConfirmed
                    ? "Conversion tracking detected"
                    : _hasRawActions
                    ? "Pixel active, no conversions yet"
                    : _hasDelivery
                    ? "Not confirmed yet"
                    : "Waiting for delivery";
                  const _trackingOk = _convConfirmed;

                  const _trackingRows = [
                    {
                      label: "Conversion tracking",
                      value: _trackingValue,
                      ok: _trackingOk,
                    },
                    ...((_convConfirmed || _convCount > 0) ? [{
                      label: "Conversions recorded",
                      value: _convCount > 0 ? `${_convCount.toLocaleString()} total` : "None yet",
                      ok: _convCount > 0,
                    }] : []),
                    ...(_hasRawActions ? [{
                      label: "Ad activity events",
                      value: "Active",
                      ok: true,
                    }] : []),
                  ];

                  return (
                    <div
                      style={{
                        marginTop: 12,
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        padding: "14px 16px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: "#6b7280",
                          letterSpacing: "0.07em",
                          textTransform: "uppercase",
                          marginBottom: 10,
                        }}
                      >
                        Tracking Setup
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {_trackingRows.map((row) => (
                          <div key={row.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{row.label}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: row.ok ? "#059669" : "#9ca3af" }}>{row.value}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <button
                  onClick={generateCampaignReport}
                  style={{
                    marginTop: 16,
                    width: "100%",
                    background: "#f9fafb",
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "11px 16px",
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#374151",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 7,
                    letterSpacing: "0.01em",
                  }}
                >
                  <span style={{ fontSize: 15 }}>📄</span> Print Report
                </button>
              </>
            );
          })()}
        </div>
        )}
      </>
    ) : (
      <>
        <div
          style={{
            background: "#f7f9ff",
            border: "1px solid #dbe4ff",
            borderRadius: 16,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 16 }}>
            Draft Campaign
          </div>
          <div style={{ color: "#667085", fontWeight: 700, fontSize: 13, lineHeight: 1.5 }}>
            This campaign is ready to review and launch.
          </div>
        </div>

        <div
          style={{
            background: "#ffffff",
            border: "1px solid #dbe4ff",
            borderRadius: 22,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            marginTop: 2,
          }}
        >
          <div>
            <div style={{ color: "#111827", fontWeight: 900, fontSize: 18, marginBottom: 0 }}>
              New Campaign
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Campaign Name</label>
            <input
              type="text"
              value={form.campaignName}
              onChange={(e) => setForm((prev) => ({ ...prev, campaignName: e.target.value }))}
              placeholder="Campaign name"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #dbe4ff",
                background: "#ffffff",
                color: "#111827",
                fontWeight: 700,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>



          <div
            style={{
              border: "1px solid #dbe4ff",
              borderRadius: 14,
              padding: 14,
              background: "#f7f9ff",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
              }}
            >
              <div style={{ color: "#111827", fontWeight: 900, fontSize: 14 }}>
                Facebook Billing
              </div>
              <button
                type="button"
                onClick={openFbPaymentPopup}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 10px",
                  background: "#5b5cf0",
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Open Billing
              </button>
            </div>

            <div style={{ color: "#667085", fontWeight: 700, fontSize: 12, lineHeight: 1.5 }}>
              {billingLoading
                ? "Checking billing status..."
                : billingInfo?.hasAccess
                ? "Facebook billing is ready."
                : "Billing will be completed before launch."}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Daily Budget</label>
            <input
              type="number"
              min="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Enter daily budget"
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #dbe4ff",
                background: "#ffffff",
                color: "#111827",
                fontWeight: 700,
                fontSize: 14,
                outline: "none",
              }}
            />
            <span style={{ color: "#98a2b3", fontSize: 11, fontWeight: 500 }}>This is your daily Facebook ad spend.</span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #dbe4ff",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 700,
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #dbe4ff",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 700,
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Instagram placement toggle — website users only */}
          {String(answers?.noWebsite || "").toLowerCase() !== "yes" && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #dbe4ff",
                background: "#f7f9ff",
                cursor: "pointer",
              }}
              onClick={() => setIncludeInstagram((v) => !v)}
            >
              <input
                type="checkbox"
                checked={includeInstagram}
                onChange={(e) => setIncludeInstagram(e.target.checked)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#5b5cf0" }}
              />
              <div>
                <div style={{ color: "#111827", fontWeight: 800, fontSize: 13 }}>
                  Also run on Instagram
                </div>
                <div style={{ color: "#667085", fontWeight: 600, fontSize: 11, marginTop: 2 }}>
                  Requires an Instagram account linked to your Facebook Page.
                </div>
              </div>
            </div>
          )}

          {!getUserFromStorage() && (
            <div
              style={{
                border: "1px solid #dbe4ff",
                borderRadius: 14,
                padding: 14,
                background: "#f7f9ff",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ color: "#111827", fontWeight: 900, fontSize: 14 }}>
                Create your account first
              </div>

              <div
                style={{
                  color: "#667085",
                  fontWeight: 700,
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                Before launching, create your Smartemark account and continue with your selected plan.
              </div>

              <button
                type="button"
                onClick={() =>
                  navigate("/signup", {
                    state: {
                      selectedPlan,
                      fromSetup: true,
                    },
                  })
                }
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "#5b5cf0",
                  color: "#ffffff",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Create Account
              </button>

              <button
                type="button"
                onClick={() => navigate("/login")}
                style={{
                  width: "100%",
                  borderRadius: 12,
                  padding: "12px 14px",
                  background: "#ffffff",
                  color: "#111827",
                  border: "1px solid #dbe4ff",
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                I already have an account
              </button>
            </div>
          )}

          {/* ── Draft / Review flow ── */}
          {fbConnected && selectedAccount && selectedPageId && !metaDraft?.status && metaDraft?.status !== "launched" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {draftError && (
                <div style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  background: "#fff1f2",
                  border: "1px solid #ffd6d6",
                  color: "#b42318",
                  fontWeight: 700,
                  fontSize: 13,
                }}>
                  {draftError}
                </div>
              )}
              <button
                type="button"
                onClick={handleCreateDraft}
                disabled={draftCreatingState === "creating" || !budget || isNaN(parseFloat(budget)) || parseFloat(budget) < 3}
                style={{
                  width: "100%",
                  border: "1px solid #dbe4ff",
                  borderRadius: 14,
                  padding: "13px 16px",
                  background: draftCreatingState === "creating" ? "#e0e7ff" : "#eef2ff",
                  color: "#4f46e5",
                  fontWeight: 900,
                  fontSize: 14,
                  cursor: draftCreatingState === "creating" ? "not-allowed" : "pointer",
                }}
              >
                {draftCreatingState === "creating" ? "Creating draft in Meta…" : "Create Draft for Review"}
              </button>
              <div style={{ color: "#94a3b8", fontWeight: 600, fontSize: 12, textAlign: "center" }}>
                Creates a paused campaign in your Meta Ads Manager so you can review before going live.
              </div>
            </div>
          )}

          {/* Draft review panel (shown after draft is created) */}
          {metaDraft && metaDraft.status === "draft_review" && (
            <div style={{
              border: "1px solid #dbe4ff",
              borderRadius: 14,
              padding: 18,
              background: "#f7f9ff",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div style={{ color: "#111827", fontWeight: 900, fontSize: 15 }}>Draft Created for Review</div>
                <div style={{ padding: "4px 10px", borderRadius: 999, background: "#fef9c3", color: "#854d0e", fontWeight: 800, fontSize: 11 }}>
                  PAUSED — NOT LIVE
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {[
                  ["Ad Account", metaDraft.adAccountId],
                  ["Page ID", metaDraft.pageId],
                  ["Campaign ID", metaDraft.metaCampaignId],
                  ["Ad Set ID", metaDraft.metaAdSetId],
                  ["Ad ID", metaDraft.metaAdId],
                  ["Status", "PAUSED — ready for review"],
                ].map(([label, val]) => (
                  <div key={label}>
                    <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 10 }}>{label}</div>
                    <div style={{ color: "#111827", fontWeight: 700, fontSize: 12, wordBreak: "break-all" }}>{val || "—"}</div>
                  </div>
                ))}
              </div>

              {metaDraft.metaManagerUrl && (
                <a
                  href={metaDraft.metaManagerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "block",
                    textAlign: "center",
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "#ffffff",
                    border: "1px solid #dbe4ff",
                    color: "#4f46e5",
                    fontWeight: 800,
                    fontSize: 13,
                    textDecoration: "none",
                  }}
                >
                  Open in Meta Ads Manager ↗
                </a>
              )}

              {draftError && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "#fff1f2", border: "1px solid #ffd6d6", color: "#b42318", fontWeight: 700, fontSize: 12 }}>
                  {draftError}
                </div>
              )}
            </div>
          )}

          <button
            onClick={
              metaDraft?.status === "draft_review"
                ? handleLaunchDraft
                : handleLaunch
            }
            disabled={
              loading ||
              draftCreatingState === "launching" ||
              !(
                fbConnected &&
                selectedAccount &&
                selectedPageId &&
                budget &&
                !isNaN(parseFloat(budget)) &&
                parseFloat(budget) >= 3
              )
            }
            style={{
              width: "100%",
              border: "none",
              borderRadius: 14,
              padding: "14px 16px",
              background:
                loading ||
                draftCreatingState === "launching" ||
                !(
                  fbConnected &&
                  selectedAccount &&
                  selectedPageId &&
                  budget &&
                  !isNaN(parseFloat(budget)) &&
                  parseFloat(budget) >= 3
                )
                  ? "#b8c2ff"
                  : "#5b5cf0",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 15,
              cursor:
                loading ||
                draftCreatingState === "launching" ||
                !(
                  fbConnected &&
                  selectedAccount &&
                  selectedPageId &&
                  budget &&
                  !isNaN(parseFloat(budget)) &&
                  parseFloat(budget) >= 3
                )
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {draftCreatingState === "launching"
              ? "Activating…"
              : loading
              ? "Working..."
              : metaDraft?.status === "draft_review"
              ? "Launch Campaign"
              : "Launch Campaign"}
          </button>
        </div>
      </>
    )}
  </>
) : (
  <>
    <div
      style={{
        color: "#667085",
        fontWeight: 700,
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      Select a campaign to view metrics and AI updates, or hit the plus button to start a new one.
    </div>

    <div
      style={{
        background: "#ffffff",
        border: "1px solid #dbe4ff",
        borderRadius: 22,
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        marginTop: 2,
      }}
    >
      <div>
        <div style={{ color: "#111827", fontWeight: 900, fontSize: 18, marginBottom: 0 }}>
          New Campaign
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Campaign Name</label>
        <input
          type="text"
          value={form.campaignName}
          onChange={(e) => setForm((prev) => ({ ...prev, campaignName: e.target.value }))}
          placeholder="Campaign name"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #dbe4ff",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 700,
            fontSize: 14,
            outline: "none",
          }}
        />
      </div>

      <div
        style={{
          border: "1px solid #dbe4ff",
          borderRadius: 14,
          padding: 14,
          background: "#f7f9ff",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
          }}
        >
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 14 }}>
            Facebook Billing
          </div>
          <button
            type="button"
            onClick={openFbPaymentPopup}
            style={{
              border: "none",
              borderRadius: 10,
              padding: "8px 10px",
              background: "#5b5cf0",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Open Billing
          </button>
        </div>

        <div style={{ color: "#667085", fontWeight: 700, fontSize: 12, lineHeight: 1.5 }}>
          {billingLoading
            ? "Checking billing status..."
            : billingInfo?.hasAccess
            ? "Facebook billing is ready."
            : "Billing will be completed before launch."}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Daily Budget</label>
        <input
          type="number"
          min="1"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Enter daily budget"
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #dbe4ff",
            background: "#ffffff",
            color: "#111827",
            fontWeight: 700,
            fontSize: 14,
            outline: "none",
          }}
        />
        <span style={{ color: "#98a2b3", fontSize: 11, fontWeight: 500 }}>This is your daily Facebook ad spend.</span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #dbe4ff",
              background: "#ffffff",
              color: "#111827",
              fontWeight: 700,
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #dbe4ff",
              background: "#ffffff",
              color: "#111827",
              fontWeight: 700,
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>
      </div>

      {!getUserFromStorage() && (
        <div
          style={{
            border: "1px solid #dbe4ff",
            borderRadius: 14,
            padding: 14,
            background: "#f7f9ff",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ color: "#111827", fontWeight: 900, fontSize: 14 }}>
            Create your account first
          </div>

          <div
            style={{
              color: "#667085",
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            Before launching, create your Smartemark account and continue with your selected plan.
          </div>

          <button
            type="button"
            onClick={() =>
              navigate("/signup", {
                state: {
                  selectedPlan,
                  fromSetup: true,
                },
              })
            }
            style={{
              width: "100%",
              border: "none",
              borderRadius: 12,
              padding: "12px 14px",
              background: "#5b5cf0",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Create Account
          </button>

          <button
            type="button"
            onClick={() => navigate("/login")}
            style={{
              width: "100%",
              borderRadius: 12,
              padding: "12px 14px",
              background: "#ffffff",
              color: "#111827",
              border: "1px solid #dbe4ff",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            I already have an account
          </button>
        </div>
      )}

      <button
        onClick={handleLaunch}
        disabled={
          loading ||
          !(
            fbConnected &&
            selectedAccount &&
            selectedPageId &&
            budget &&
            !isNaN(parseFloat(budget)) &&
            parseFloat(budget) >= 3
          )
        }
        style={{
          width: "100%",
          border: "none",
          borderRadius: 14,
          padding: "14px 16px",
          background:
            loading ||
            !(
              fbConnected &&
              selectedAccount &&
              selectedPageId &&
              budget &&
              !isNaN(parseFloat(budget)) &&
              parseFloat(budget) >= 3
            )
              ? "#b8c2ff"
              : "#5b5cf0",
          color: "#ffffff",
          fontWeight: 900,
          fontSize: 15,
          cursor:
            loading ||
            !(
              fbConnected &&
              selectedAccount &&
              selectedPageId &&
              budget &&
              !isNaN(parseFloat(budget)) &&
              parseFloat(budget) >= 3
            )
              ? "not-allowed"
              : "pointer",
        }}
      >
        {loading ? "Working..." : "Launch Campaign"}
      </button>
    </div>
  </>
)}
          </div>
        </div>
      </>
    )}

{/* ── AI Agent tab ── */}
{setupTab === "ai-agent" && (
  <InlineAdAgent
    adminClientId={adminClientId}
    adminClientInfo={adminClientInfo}
    selectedCampaignId={selectedCampaignId}
    onCreativesGenerated={({ images, creativeSet, creativeTestCount }) => {
      setDraftCreatives({
        images: images.filter(Boolean),
        mediaSelection: "image",
        creativeSet,
        creativeTestCount,
      });
      setSelectedCampaignId("__DRAFT__");
      setExpandedId("__DRAFT__");
    }}
    onGoToCreatives={() => setSetupTab("creatives")}
    onGoToCampaign={() => setSetupTab("campaign")}
    billingInfo={billingInfo}
  />
)}

{setupTab === "account" && (
  <>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: "#111827", fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
        Account
      </div>
      <div style={{ color: "#667085", fontWeight: 500, fontSize: 14, lineHeight: 1.6 }}>
        {adminClientId ? "Managing client account" : "Plan and account details."}
      </div>
    </div>

    {/* ── Admin-client mode: show selected client's info, not TheBoss ── */}
    {adminClientId ? (
      <div
        style={{
          background: "linear-gradient(150deg, #ffffff 0%, #f7f8ff 70%, #f0f3ff 100%)",
          border: "1px solid rgba(93,89,234,0.12)",
          borderRadius: 20,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 8px 32px rgba(91,87,232,0.07)",
        }}
      >
        <div style={{ background: "rgba(93,89,234,0.08)", border: "1px solid rgba(93,89,234,0.18)", borderRadius: 10, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#5d59ea", letterSpacing: 0.3 }}>
          Client Mode — managing: {adminClientBusinessName || adminClientId}
        </div>

        {([
          { label: "Email",    value: adminClientInfo?.email || adminClientId },
          { label: "Business", value: adminClientInfo?.premiumIntake?.businessName || adminClientInfo?.displayName || "—" },
          { label: "Plan",     value: adminClientInfo?.planKey || "—" },
          { label: "Facebook", value: adminClientInfo?.fbConnected ? "Connected" : "Not connected" },
          { label: "Ad Account", value: selectedAccount ? `act_${selectedAccount}` : (adAccounts.length ? adAccounts.map(a => a.name || a.id).join(", ") : "—") },
          { label: "Facebook Page", value: selectedPageId || (pages.length ? pages.map(p => p.name || p.id).join(", ") : "—") },
        ]).map(({ label, value }) => (
          <div key={label} style={{ border: "1px solid rgba(93,89,234,0.10)", borderRadius: 14, padding: 16, background: "linear-gradient(135deg, #f7f8ff 0%, #eef0ff 100%)" }}>
            <div style={{ color: "#98a2b3", fontWeight: 700, fontSize: 11, marginBottom: 6 }}>{label}</div>
            <div style={{ color: "#111827", fontWeight: 500, fontSize: 15, lineHeight: 1.5 }}>{value}</div>
          </div>
        ))}

        <button
          onClick={exitClientMode}
          style={{ alignSelf: "flex-start", border: "1px solid rgba(93,89,234,0.28)", borderRadius: 10, padding: "10px 18px", background: "rgba(93,89,234,0.08)", color: "#5d59ea", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
        >
          Exit Client Mode → Admin Dashboard
        </button>
      </div>
    ) : (

    <div
      style={{
        background: "linear-gradient(150deg, #ffffff 0%, #f7f8ff 70%, #f0f3ff 100%)",
        border: "1px solid rgba(93,89,234,0.12)",
        borderRadius: 20,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        minHeight: 520,
        boxShadow: "0 8px 32px rgba(91,87,232,0.07)",
      }}
    >
      <div
        style={{
          border: "1px solid rgba(93,89,234,0.10)",
          borderRadius: 14,
          padding: 16,
          background: "linear-gradient(135deg, #f7f8ff 0%, #eef0ff 100%)",
        }}
      >
        <div style={{ color: "#98a2b3", fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
          Email
        </div>
        <div style={{ color: "#111827", fontWeight: 500, fontSize: 16, lineHeight: 1.5 }}>
          {billingInfo?.email || String(loginUser || "").trim() || "No email found"}
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(93,89,234,0.10)",
          borderRadius: 14,
          padding: 16,
          background: "linear-gradient(135deg, #f7f8ff 0%, #eef0ff 100%)",
        }}
      >
        <div style={{ color: "#98a2b3", fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
          Current Plan
        </div>
        <div style={{ color: "#111827", fontWeight: 500, fontSize: 16, lineHeight: 1.5 }}>
          {billingInfo?.planKey
            ? (PLAN_UI[String(billingInfo.planKey).trim().toLowerCase()]?.label ||
               String(billingInfo.planKey)) +
              (billingInfo.monthlyPrice > 0
                ? ` — $${billingInfo.monthlyPrice.toLocaleString()}/month`
                : "")
            : "No active plan"}
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(93,89,234,0.10)",
          borderRadius: 14,
          padding: 16,
          background: "linear-gradient(135deg, #f7f8ff 0%, #eef0ff 100%)",
        }}
      >
        <div style={{ color: "#98a2b3", fontWeight: 700, fontSize: 11, marginBottom: 6 }}>
          Status
        </div>
        <div style={{ color: "#111827", fontWeight: 500, fontSize: 16, lineHeight: 1.5 }}>
          {billingLoading ? "Checking..." : billingInfo?.hasAccess ? "Active" : "No active plan"}
        </div>
      </div>

      {!billingInfo?.hasAccess && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ color: "#111827", fontWeight: 500, fontSize: 15, lineHeight: 1.5 }}>
            Choose a plan to unlock campaign launching and account features.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() =>
                navigate("/pricing", {
                  state: {
                    fromSetup: true,
                    returnTo: "/setup",
                  },
                })
              }
              style={{
                border: "none",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#5b5cf0",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              View Plans
            </button>
          </div>
        </div>
      )}

      {!!billingInfo?.hasAccess && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 16,
            background: "#ffffff",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ color: "#111827", fontWeight: 600, fontSize: 15 }}>
            Manage Plan
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {String(billingInfo?.planKey || "").trim().toLowerCase() === "starter" && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpgradePlan("pro")}
                  style={{
                    border: "none",
                    borderRadius: 10,
                    padding: "10px 14px",
                    background: "#5b5cf0",
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Upgrade to Pro
                </button>

                <button
                  type="button"
                  onClick={() => handleUpgradePlan("operator")}
                  style={{
                    border: "1px solid #dbe4ff",
                    borderRadius: 10,
                    padding: "10px 14px",
                    background: "#eef2ff",
                    color: "#3b3fd9",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Upgrade to Operator
                </button>
              </>
            )}

            {String(billingInfo?.planKey || "").trim().toLowerCase() === "pro" && (
              <button
                type="button"
                onClick={() => handleUpgradePlan("operator")}
                style={{
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 14px",
                  background: "#5b5cf0",
                  color: "#ffffff",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Upgrade to Operator
              </button>
            )}

            <button
              type="button"
              onClick={handleCancelPlan}
              style={{
                border: "1px solid #ffd6d6",
                borderRadius: 10,
                padding: "10px 14px",
                background: "#fff1f2",
                color: "#b42318",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Cancel Plan
            </button>
          </div>
        </div>
      )}
    </div>
    )} {/* end adminClientId ternary */}
  </>
)}
  </div>
</main>



          {showEditCampaignModal && selectedLiveCampaign && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1007,
            background: "rgba(15,23,42,0.35)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setShowEditCampaignModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(520px, 94vw)",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 24,
              padding: 22,
              boxShadow: "0 30px 80px rgba(15,23,42,0.18)",
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <div>
              <div style={{ color: "#111827", fontWeight: 900, fontSize: 22, marginBottom: 6 }}>
                Edit Campaign
              </div>
              <div style={{ color: "#667085", fontWeight: 700, fontSize: 13, lineHeight: 1.6 }}>
                Save budget and duration for this campaign only.
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Budget</label>
              <input
                type="number"
                value={editCampaignForm.budget}
                onChange={(e) =>
                  setEditCampaignForm((prev) => ({ ...prev, budget: e.target.value }))
                }
                placeholder="Budget"
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #dbe4ff",
                  background: "#ffffff",
                  color: "#111827",
                  fontWeight: 700,
                  fontSize: 14,
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Start Date</label>
                <input
                  type="date"
                  value={editCampaignForm.startDate}
                  onChange={(e) =>
                    setEditCampaignForm((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #dbe4ff",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>End Date</label>
                <input
                  type="date"
                  value={editCampaignForm.endDate}
                  onChange={(e) =>
                    setEditCampaignForm((prev) => ({ ...prev, endDate: e.target.value }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px solid #dbe4ff",
                    background: "#ffffff",
                    color: "#111827",
                    fontWeight: 700,
                    fontSize: 14,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                type="button"
                onClick={() => setShowEditCampaignModal(false)}
                style={{
                  background: "#f8fafc",
                  color: "#111827",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={saveCurrentCampaignSettings}
                style={{
                  background: "#5b5cf0",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 14px",
                  fontWeight: 900,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showPlanModal && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 1010,
      background: "rgba(15,23,42,0.40)",
      backdropFilter: "blur(6px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    }}
    onClick={() => setShowPlanModal(false)}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: "min(760px, 96vw)",
        background: "#ffffff",
        border: "1px solid #e5e7eb",
        borderRadius: 24,
        padding: 24,
        boxShadow: "0 30px 80px rgba(15,23,42,0.18)",
        display: "flex",
        flexDirection: "column",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ color: "#111827", fontWeight: 900, fontSize: 24 }}>
          Choose a plan to launch
        </div>
        <div style={{ color: "#667085", fontWeight: 700, fontSize: 14, lineHeight: 1.6 }}>
          Complete billing, return to setup, and Smartemark will finish the launch automatically.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
          gap: 14,
        }}
      >
        {Object.values(PLAN_UI).map((plan) => {
          const active = selectedPlan === plan.key;
          return (
            <button
              key={plan.key}
              type="button"
              onClick={() => setSelectedPlan(plan.key)}
              style={{
                textAlign: "left",
                borderRadius: 18,
                padding: 16,
                border: active ? "2px solid #5b5cf0" : "1px solid #e5e7eb",
                background: active ? "#eef2ff" : "#ffffff",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ color: "#111827", fontWeight: 900, fontSize: 18 }}>
                {plan.label}
              </div>
              <div style={{ color: "#4f46e5", fontWeight: 800, fontSize: 13 }}>
                {plan.sub}
              </div>
              <div style={{ color: "#667085", fontWeight: 700, fontSize: 12, lineHeight: 1.5 }}>
                {plan.detail}
              </div>
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button
          type="button"
          onClick={() => setShowPlanModal(false)}
          style={{
            background: "#f8fafc",
            color: "#111827",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: "11px 14px",
            fontWeight: 900,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={handleSubscribeToPlan}
          disabled={billingLoading}
          style={{
            background: billingLoading ? "#b8c2ff" : "#5b5cf0",
            color: "#ffffff",
            border: "none",
            borderRadius: 12,
            padding: "11px 16px",
            fontWeight: 900,
            fontSize: 13,
            cursor: billingLoading ? "not-allowed" : "pointer",
          }}
        >
          {billingLoading ? "Opening checkout..." : "Continue to Stripe"}
        </button>
      </div>
    </div>
  </div>
)}

<ImageModal
  open={showImageModal}
  imageUrl={modalImg}
  onClose={() => setShowImageModal(false)}
/>

    </div>
  </div>
);
};

export default CampaignSetup;
