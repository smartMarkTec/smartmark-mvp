/* eslint-disable */
// src/pages/CampaignSetup.js
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
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
function MetricsRow({ metrics }) {
  const isMobile = useIsMobile();
  const safeNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const normalized = useMemo(() => {
    const m = metrics || {};

    const impressions = safeNum(m.impressions, 0);
    const clicks = safeNum(m.clicks, 0);
    const spend = safeNum(m.spend, 0);
    const ctrNum =
      m.ctr !== undefined && m.ctr !== null && m.ctr !== ""
        ? safeNum(m.ctr, 0)
        : impressions > 0
        ? (clicks / impressions) * 100
        : 0;

    const cpcNum = clicks > 0 ? spend / clicks : 0;
    const hasDelivery = impressions > 0 || clicks > 0 || spend > 0;

    return {
      impressions: impressions.toLocaleString(),
      clicks: clicks.toLocaleString(),
      ctr: `${ctrNum.toFixed(2)}%`,
      cpc: `$${cpcNum.toFixed(2)}`,
      hasDelivery,
    };
  }, [metrics]);

  const cards = [
    { key: "impressions", label: "Impressions", value: normalized.impressions },
    { key: "clicks", label: "Clicks", value: normalized.clicks },
    { key: "ctr", label: "CTR", value: normalized.ctr },
    { key: "cpc", label: "CPC", value: normalized.cpc },
  ];

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
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        {cards.map((c) => (
          <div
            key={c.key}
            style={{
              background: "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
              border: "1px solid rgba(93,89,234,0.12)",
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              boxShadow: "0 4px 14px rgba(91,87,232,0.07)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "#94a3b8",
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
    return {
      kind: "Action",
      title: actionType
        ? actionType.replace(/_/g, " ")
        : "Updated campaign state",
      detail:
        String(payload.summary || "").trim() ||
        String(payload.reason || "").trim() ||
        String(payload.status || "").trim() ||
        "",
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

function MarketerActionsCard({ summary, optimizerState, metrics }) {
  const safeSummary = summary || getFallbackPublicSummary();
  const history = buildOptimizerHistoryItems(optimizerState);
  const latest = history[0] || null;

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
              const ts =
                optimizerState?.latestDiagnosis?.generatedAt ||
                safeSummary?.updatedAt ||
                null;
              return ts ? `Analyzed ${timeAgoShort(ts)}` : "Monitoring campaign";
            })()}
          </div>
        </div>
      </div>
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
  useEffect(() => {
    const qs = new URLSearchParams(location.search || "");
    const ctxFromState = (location.state?.ctxKey ? String(location.state.ctxKey) : "").trim();
    const ctxFromUrl = (qs.get("ctxKey") || "").trim();

    const user = getUserFromStorage();
    const active = (getActiveCtx(user) || "").trim();

    if (ctxFromState) return setActiveCtx(ctxFromState, user);
    if (ctxFromUrl) return setActiveCtx(ctxFromUrl, user);
    if (!active) setActiveCtx(`${Date.now()}|||setup`, user);
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


  // IMPORTANT: normalize stored account ID to "act_..."
  const [selectedAccount, setSelectedAccount] = useState(() => {
    const v = (lsGet(resolvedUser, "smartmark_last_selected_account") || "").trim();
    if (!v) return "";
    return String(v).replace(/^act_/, ""); // store digits only
  });

  const [selectedPageId, setSelectedPageId] = useState(() => lsGet(resolvedUser, "smartmark_last_selected_pageId") || "");

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



  const [adAccounts, setAdAccounts] = useState([]);

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
  // Tracks last time we fired run-diagnosis per campaignId so we never call it more than ~hourly
  const diagnosisLastCalledRef = useRef({});
  // Tracks whether the previous poll for a campaignId had real metrics — used to detect
  // the exact moment metrics first appear so we can diagnose immediately.
  const prevActivityRef = useRef({});
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setCampaignStatus] = useState("ACTIVE");
  const [campaignCount, setCampaignCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [setupTab, setSetupTab] = useState("connect");

  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

  const [showCampaignMenu, setShowCampaignMenu] = useState(false);
  const [showCampaignDetails, setShowCampaignDetails] = useState(false);
  const [showEditCampaignModal, setShowEditCampaignModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
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

  const [draftCreatives, setDraftCreatives] = useState({
    images: [],
    mediaSelection: "image",
  });

  const state = location.state || {};
  const navImageUrls = Array.isArray(state.imageUrls)
    ? state.imageUrls
    : Array.isArray(state.imageVariants)
    ? state.imageVariants
    : Array.isArray(state.images)
    ? state.images
    : Array.isArray(state.urls)
    ? state.urls
    : [];

  const headline = state.headline || "";
  const body = state.body || "";
  const answers = state.answers || {};

  const inferredLink = (
    state.websiteUrl ||
    form?.websiteUrl ||
    form?.website ||
    answers?.websiteUrl ||
    answers?.website ||
    answers?.url ||
    answers?.link ||
    ""
  )
    .toString()
    .trim();

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
    if (!isDraftForActiveCtx(draftObj, resolvedUser)) return false;

    const imgs = Array.isArray(draftObj.images) ? draftObj.images.slice(0, 2) : [];
    const norm = imgs.map(toAbsoluteMedia).filter(Boolean);
    if (!norm.length) return false;

    setDraftCreatives({
      images: norm,
      mediaSelection: "image",
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

  // ✅ FORCE refresh accounts/pages after OAuth so dropdowns auto-fill even if fbConnected was already true
  (async () => {
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

  // ✅ FB adaccounts/pages/campaigns/metrics now ALL use authFetch (sid + cookies)
 useEffect(() => {
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



useEffect(() => {
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
        ["ACTIVE", "PAUSED"].includes(
          String(c.status || c.effective_status || "").toUpperCase()
        )
      ).length;
      setCampaignCount(activeCount);

      const firstLiveId = String(list?.[0]?.id || "").trim();

      // always prefer a real live campaign after reconnect / relaunch
      if (firstLiveId) {
        const currentSelected = String(selectedCampaignId || "").trim();
        const currentExpanded = String(expandedId || "").trim();

        const selectedStillExists = list.some(
          (c) => String(c?.id || "").trim() === currentSelected
        );
        const expandedStillExists = list.some(
          (c) => String(c?.id || "").trim() === currentExpanded
        );

        if (
          !hasDraft &&
          (!currentSelected ||
            currentSelected === "__DRAFT__" ||
            !selectedStillExists)
        ) {
          setSelectedCampaignId(firstLiveId);
        }

        if (
          !hasDraft &&
          (!currentExpanded ||
            currentExpanded === "__DRAFT__" ||
            !expandedStillExists)
        ) {
          setExpandedId(firstLiveId);
        }
      }

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
  if (!expandedId || !selectedAccount || expandedId === "__DRAFT__") return;

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
    // Hoisted so the diagnosis block can read live metrics even if metricsRes and summaryRes
    // are processed in separate branches (optimizer-state has no reliable metricsSnapshot).
    let liveImpressions = 0;
    let liveSpend = 0;
    let liveClicks = 0;
    let liveCtr = 0;

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

        // Capture for diagnosis check below
        liveImpressions = Number.isFinite(impressions) ? impressions : 0;
        liveSpend = Number.isFinite(spend) ? spend : 0;
        liveClicks = Number.isFinite(clicks) ? clicks : 0;
        liveCtr = Number.isFinite(ctr) ? ctr : 0;

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

  // ── AI Observation refresh ─────────────────────────────────────────────
  // Two-tier timing:
  //   FRESHNESS_TTL  — how old the existing DB diagnosis must be before we consider it stale
  //                    (short: 15 min, so a new session quickly gets a current diagnosis)
  //   SESSION_THROTTLE — how long we wait before re-firing within the same page session
  //                      (long: 50 min, prevents spam after the first run)
  //
  // Immediate trigger: if this poll is the FIRST one in this session that shows real metrics
  // (prevActivityRef was false), bypass the freshness gate so the user sees AI text quickly.
  const FRESHNESS_TTL_MS    = 15 * 60 * 1000; // existing diagnosis considered stale after 15 min
  const SESSION_THROTTLE_MS = 50 * 60 * 1000; // don't re-fire more than once per 50 min/session

  // Use live metrics from the /metrics endpoint (hoisted above).
  const hasRealActivity = liveSpend > 0 || liveImpressions >= 50;

  // Detect moment metrics first appear in this session so we can diagnose immediately.
  const prevHadActivity = prevActivityRef.current[campaignId] || false;
  const metricsJustAppeared = hasRealActivity && !prevHadActivity;
  prevActivityRef.current[campaignId] = hasRealActivity;

  const existingDiagnosisTs = optimizerState?.latestDiagnosis?.generatedAt
    ? new Date(optimizerState.latestDiagnosis.generatedAt).getTime()
    : 0;
  const diagnosisFresh = existingDiagnosisTs && Date.now() - existingDiagnosisTs < FRESHNESS_TTL_MS;
  const sessionLastCalled = diagnosisLastCalledRef.current[campaignId] || 0;
  const calledRecentlyThisSession = Date.now() - sessionLastCalled < SESSION_THROTTLE_MS;

  // Fire when:
  //   • real metrics exist
  //   • AND (metrics just appeared this session  OR  existing diagnosis is stale)
  //   • AND we haven't already fired this session recently
  if (!cancelled && hasRealActivity && (metricsJustAppeared || !diagnosisFresh) && !calledRecentlyThisSession) {
    diagnosisLastCalledRef.current[campaignId] = Date.now();
    // Fire async — do not block the poll loop
    authFetch(
      `/facebook/adaccount/${acctId}/campaign/${campaignId}/run-diagnosis`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Pass the live metrics the UI already polled from Facebook.
          // Backend will overlay these onto state.metricsSnapshot if the DB copy is empty,
          // so the AI diagnosis is grounded in the same numbers the user sees.
          clientMetrics: {
            impressions: liveImpressions,
            spend: liveSpend,
            clicks: liveClicks,
            ctr: liveCtr,
          },
        }),
      }
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.optimizerState || cancelled) return;
        const freshState = d.optimizerState;
        setOptimizerStateMap((m) => ({ ...m, [campaignId]: freshState }));
        setPublicSummaryMap((m) => ({
          ...m,
          [campaignId]: getPublicSummaryFromOptimizerState(freshState) || getFallbackPublicSummary(),
        }));
      })
      .catch(() => {});
  }
  // ──────────────────────────────────────────────────────────────────────
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

  if (hasValidConnectedAccount) {
    lsSet(resolvedUser, "smartmark_last_selected_account", normalizedSelectedAccount, true);
    return;
  }

  try {
    localStorage.removeItem("smartmark_last_selected_account");
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_account"));
  } catch {}
}, [selectedAccount, adAccounts, fbConnected, resolvedUser]);

useEffect(() => {
  const normalizedSelectedPageId = String(selectedPageId || "").trim();
  const availablePageIds = (pages || [])
    .map((p) => String(p?.id || "").trim())
    .filter(Boolean);

  const hasValidConnectedPage =
    !!fbConnected &&
    !!normalizedSelectedPageId &&
    availablePageIds.includes(normalizedSelectedPageId);

  if (hasValidConnectedPage) {
    lsSet(resolvedUser, "smartmark_last_selected_pageId", normalizedSelectedPageId, true);
    return;
  }

  try {
    localStorage.removeItem("smartmark_last_selected_pageId");
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, "smartmark_last_selected_pageId"));
  } catch {}
}, [selectedPageId, pages, fbConnected, resolvedUser]);


const handlePauseUnpauseCampaign = async (campaignId, currentlyPaused) => {
  if (!campaignId || !selectedAccount || campaignId === "__DRAFT__") return;

  const acctId = String(selectedAccount).trim();
  const action = currentlyPaused ? "unpause" : "pause";

  setLoading(true);
  try {
    const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${campaignId}/${action}`, {
      method: "POST",
    });

    if (!r.ok) throw new Error(`${action} failed`);

    const nextStatus = currentlyPaused ? "ACTIVE" : "PAUSED";

    setCampaigns((prev) =>
      Array.isArray(prev)
        ? prev.map((c) =>
            c?.id === campaignId
              ? { ...c, status: nextStatus, effective_status: nextStatus }
              : c
          )
        : prev
    );

    if (selectedCampaignId === campaignId) {
      setCampaignStatus(nextStatus);
      setIsPaused(!currentlyPaused);
    }
  } catch {
    alert("Could not update campaign status.");
  }
  setLoading(false);
};

const handleDeleteCampaign = async (campaignId) => {
  const idToDelete = String(campaignId || "").trim();

  if (!idToDelete || idToDelete === "__DRAFT__") {
  handleClearDraft();
  purgeDraftArtifactsEverywhere();
  setDraftDisabled(resolvedUser, true);
  setSelectedCampaignId("");
  setExpandedId(null);
  setShowCampaignMenu(false);
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

    const fallbackId = String(nextCampaigns?.[0]?.id || "").trim();

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

    alert("Campaign deleted.");
  } catch (e) {
    alert("Could not delete campaign: " + (e?.message || ""));
  } finally {
    setLoading(false);
  }
};

  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    navigate("/form");
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

    setBillingInfo({
      checked: true,
      hasAccess: !!j?.billing?.hasAccess,
      planKey: String(j?.billing?.planKey || "").trim(),
      status: String(j?.billing?.status || "").trim(),
      email: String(j?.user?.email || "").trim(),
      username: String(j?.user?.username || "").trim(),
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
  let raw = (
    form?.websiteUrl ||
    form?.website ||
    answers?.websiteUrl ||
    answers?.website ||
    answers?.url ||
    answers?.link ||
    inferredLink ||
    previewCopy?.link ||
    ""
  ).toString().trim();

  // Mobile fallback: if navigation state was lost (answers = {}), the website URL
  // might only exist in FORM_DRAFT_KEY — the same key launchPhoneRaw reads from.
  // Read both symmetrically so a website launch doesn't fall through to phone-only.
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
    // Last-resort: dedicated persistent key written by FormPage before navigation and refreshed
    // before OAuth redirect. No TTL, not purged post-launch — survives all route-state and TTL failures.
    try { raw = String(localStorage.getItem("sm_last_website_url_v1") || "").trim(); } catch {}
  }

  if (!raw) return "";
  raw = raw.replace(/\s+/g, "");
  if (raw.startsWith("//")) raw = "https:" + raw;
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;
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

let filteredImages = await forceHostOnRenderMedia(candidateImgs);

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

  mediaSelection: "image",
  imageVariants: filteredImages,
  imageUrls: filteredImages,
  images: filteredImages,

  flightStart: startISO,
  flightEnd: endISO,

  // Instagram: only sent for website users. Backend enforces no-Instagram for CALL_NOW path.
  // Gate on both flag AND actual websiteUrl being present — robust to stale noWebsite flag.
  includeInstagram: !isNoWebsite && !websiteBlank && includeInstagram,

  overrideCountPerType: {
    images: Math.min(2, filteredImages.length),
  },
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

      const res = await authFetch(`/facebook/adaccount/${acctId}/launch-campaign`, {
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
        const msg = (json && (json.error || json.detail || json.message)) || rawText?.slice(0, 400) || `HTTP ${res.status}`;
        // Detect Meta date-related rejections and surface a human-readable message
        if (/end date.*past|past.*end date|time_stop|date.*expir|End Date Is In the Past/i.test(msg)) {
          throw new Error("Your campaign dates have expired. Please choose a future end date and try again.");
        }
        throw new Error(`FB Launch Error (${res.status}): ${msg}`);
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
      alert("Failed to launch campaign: " + (err.message || ""));
      console.error(err);
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
      mediaSelection: "image",
      meta: {
        headline: String(runtime?.meta?.headline || "").trim(),
        body: String(runtime?.meta?.body || "").trim(),
        link: String(runtime?.meta?.link || "").trim(),
      },
    };
  }

  if (!selectedAccount) {
    return { images: [], mediaSelection: "image", meta: { headline: "", body: "", link: "" } };
  }

  const acctKey = String(selectedAccount || "").replace(/^act_/, "");
  const map = readCreativeMap(resolvedUser, acctKey);

  const didPurge = purgeExpiredCreative(map, campaignId);
  if (didPurge) writeCreativeMap(resolvedUser, acctKey, map);

  const saved = map[campaignId] || null;
  if (!saved) {
    return { images: [], mediaSelection: "image", meta: { headline: "", body: "", link: "" } };
  }

  const images = (saved.images || [])
    .map(toAbsoluteMedia)
    .filter(Boolean)
    .slice(0, 2);

  return {
    images,
    mediaSelection: "image",
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
  selectedCampaignId === "__DRAFT__" && hasDraft
    ? {
        images: draftCreatives?.images || [],
        mediaSelection: "image",
        meta: {
          headline: String(previewCopy?.headline || headline || "").trim(),
          body: String(previewCopy?.body || body || "").trim(),
          link: String(previewCopy?.link || inferredLink || "").trim(),
        },
      }
    : selectedCampaignId && selectedCampaignId !== "__DRAFT__"
    ? getSavedCreatives(selectedCampaignId)
    : { images: [], mediaSelection: "image", meta: { headline: "", body: "", link: "" } };

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
            onClick={() => navigate("/form", {
              state: {
                imageUrls: Array.isArray(draftCreatives?.images) ? draftCreatives.images.filter(Boolean) : [],
                ctxKey: getActiveCtx(resolvedUser) || "",
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
            border: active ? "1px solid rgba(93,89,234,0.22)" : "1px solid transparent",
            background: active
              ? "linear-gradient(120deg, #eef2ff 0%, #e4e8ff 100%)"
              : "transparent",
            cursor: "pointer",
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
              background: active
                ? "linear-gradient(135deg, #5b57e8 0%, #6b66ff 100%)"
                : "linear-gradient(135deg, #f1f5f9 0%, #e9ebf2 100%)",
              color: active ? "#ffffff" : "#475569",
              fontWeight: 900,
              fontSize: 11,
              boxShadow: active ? "0 2px 8px rgba(91,87,232,0.28)" : "none",
            }}
          >
            {item.step}
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
                  color: "#64748b",
                  fontWeight: 700,
                  fontSize: 11,
                  lineHeight: 1.3,
                }}
              >
                {item.subtitle}
              </div>
            </div>
          )}
        </button>
      );
    })}
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
              {fbConnected ? "Facebook Ads Connected" : "Connect your ad account"}
            </div>
            <div style={{ color: "#64748b", fontWeight: 700, fontSize: 15, lineHeight: 1.7 }}>
              {fbConnected
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

              const returnTo =
                window.location.origin +
                "/setup" +
                `?ctxKey=${encodeURIComponent(safeCtx)}&facebook_connected=1`;

              const sid = ensureStoredSid();
              window.location.assign(`/auth/facebook?sm_sid=${encodeURIComponent(sid)}&return_to=${encodeURIComponent(returnTo)}`);
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
            {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
          </button>

          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
              gap: 14,
              maxWidth: 680,
            }}
          >
            <div
              style={{
                background: "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
                border: "1px solid rgba(93,89,234,0.12)",
                borderRadius: 16,
                padding: 18,
                boxShadow: "0 4px 14px rgba(91,87,232,0.06)",
              }}
            >
              <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 11, marginBottom: 6 }}>
                Ad Accounts
              </div>
              <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 24, marginBottom: 10 }}>
                {adAccounts.length}
              </div>
              <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>
                {selectedAccount ? `Selected: ${selectedAccount}` : "Choose your ad account in the Campaign tab"}
              </div>
            </div>

            <div
              style={{
                background: "linear-gradient(145deg, #ffffff 0%, #f7f8ff 100%)",
                border: "1px solid rgba(93,89,234,0.12)",
                borderRadius: 16,
                padding: 18,
                boxShadow: "0 4px 14px rgba(91,87,232,0.06)",
              }}
            >
              <div style={{ color: "#94a3b8", fontWeight: 800, fontSize: 11, marginBottom: 6 }}>
                Facebook Pages
              </div>
              <div style={{ color: "#0f172a", fontWeight: 900, fontSize: 24, marginBottom: 10 }}>
                {pages.length}
              </div>
              <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>
                {selectedPageId ? "Page selected" : "Select a page in the Campaign tab"}
              </div>
            </div>
          </div>
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
            const images = (selectedCampaignCreatives?.images || []).slice(0, 2);
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
                  </div>
                </div>

                {images.length ? (
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
                              {String(creativeMeta?.body || previewCopy?.body || body || "No copy available yet.").trim()}
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
                              {String(creativeMeta?.headline || previewCopy?.headline || headline || "No headline available yet.").trim()}
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
      {hasDraft && (
        <option value="__DRAFT__">
          {(form.campaignName || "Untitled")} (Draft)
        </option>
      )}
      {campaigns.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name || "Campaign"}
        </option>
      ))}
    </select>

    {selectedLiveCampaign && (
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

    {selectedLiveCampaign && (
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
    )}

    {showCampaignMenu && selectedLiveCampaign && (
      <div
        style={{
          position: "absolute",
          top: 46,
          right: 0,
          minWidth: 170,
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
        <button
          type="button"
          onClick={() => {
            setShowCampaignMenu(false);
            setShowCampaignDetails((v) => !v);
          }}
          style={{
            background: "#ffffff",
            color: "#111827",
            border: "none",
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Campaign details
        </button>

        <button
          type="button"
          onClick={openEditCurrentCampaign}
          style={{
            background: "#ffffff",
            color: "#111827",
            border: "none",
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Edit budget + duration
        </button>

        <button
          type="button"
          onClick={() => {
            setShowCampaignMenu(false);
            handleDeleteCampaign(selectedLiveCampaign.id);
          }}
          style={{
            background: "#ffffff",
            color: "#b42318",
            border: "none",
            textAlign: "left",
            padding: "10px 12px",
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Delete campaign
        </button>
      </div>
    )}
  </div>
</div>

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
        <MarketerActionsCard
          summary={selectedOptimizerSummary}
          optimizerState={selectedOptimizerState}
          metrics={metricsMap[selectedCampaignId]}
        />

        <div
          style={{
            padding: "2px 0",
          }}
        >
          <MetricsRow metrics={metricsMap[selectedCampaignId]} />
        </div>
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
            <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Budget</label>
            <input
              type="number"
              min="1"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="Enter budget"
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
        <label style={{ color: "#98a2b3", fontWeight: 800, fontSize: 11 }}>Budget</label>
        <input
          type="number"
          min="1"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Enter budget"
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

{setupTab === "account" && (
  <>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ color: "#111827", fontWeight: 900, fontSize: 28, lineHeight: 1.1 }}>
        Account
      </div>
      <div style={{ color: "#667085", fontWeight: 500, fontSize: 14, lineHeight: 1.6 }}>
        Plan and account details.
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
            ? PLAN_UI[String(billingInfo.planKey).trim().toLowerCase()]?.label ||
              String(billingInfo.planKey)
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
