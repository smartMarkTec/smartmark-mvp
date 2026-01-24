/* eslint-disable */
// src/pages/CampaignSetup.js
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown } from "react-icons/fa";
import { trackEvent } from "../analytics/gaEvents";


/* ===================== AUTH ORIGIN (UPDATED) ===================== */
// ✅ Start OAuth + auth calls on YOUR APP ORIGIN so state/cookies stay consistent.
// Your Vercel rewrites should proxy /auth/* (and /api/*) to Render.
const MEDIA_ORIGIN = "https://smartmark-mvp.onrender.com";
const APP_ORIGIN = window.location.origin;

// ✅ Use relative paths for auth so the browser stays on the same origin (fixes Invalid OAuth state)
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
  const rel = `${p.startsWith("/") ? p : `/${p}`}`;

  const doFetch = (base) =>
    fetch(`${base}${rel}`, {
      ...opts,
      headers,
      credentials: "include",
    });

  // ✅ Preferred: /auth/*
  let res = await doFetch(AUTH_BASE_PRIMARY);

  // ✅ Fallback: /api/auth/* (only if /auth is missing)
  if (res.status === 404) {
    res = await doFetch(AUTH_BASE_FALLBACK);
  }

  return res;


}


/* ======================= Visual Theme (Landing-style tech palette) ======================= */
const MODERN_FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const DARK_BG = "#0b0f14"; // landing BG
const ACCENT = "#31e1ff"; // electric cyan
const ACCENT_2 = "#7c4dff"; // violet
const BTN_BASE = "#0f6fff"; // brand blue
const BTN_BASE_HOVER = "#2e82ff";

const GLOW_A = "rgba(49,225,255,0.22)";
const GLOW_B = "rgba(124,77,255,0.18)";

// aliases used in UI sections
const GLOW_TEAL = GLOW_A;
const ACCENT_ALT = ACCENT; // keep legacy refs working

const CARD_BG = "rgba(20, 24, 31, 0.78)";
const EDGE_BG = "rgba(255,255,255,0.06)";
const PANEL_BG = "rgba(18, 22, 28, 0.72)";

const INPUT_BG = "rgba(255,255,255,0.04)";
const INPUT_BORDER = "rgba(255,255,255,0.08)";

const TEXT_MAIN = "#ffffff";
const TEXT_DIM = "#eaf5ff";
const TEXT_MUTED = "rgba(255,255,255,0.72)";
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

  // ✅ NEW: retry state (fixes “connect → one transient fail → stuck forever”)
  const [retryCount, setRetryCount] = useState(0);
  const [retryNonce, setRetryNonce] = useState(0);

  // Normalize + dedupe
  const normalized = useMemo(() => {
    const arr = (items || []).map(toAbsoluteMedia).filter(Boolean);
    const seen = new Set();
    return arr.filter((u) => (seen.has(u) ? false : (seen.add(u), true)));
  }, [items]);

  // Reset state when list changes
  useEffect(() => {
    if (idx >= normalized.length) setIdx(0);
    setBroken(false);
    setLoaded(false);
    setRetryCount(0);
    setRetryNonce(0);
  }, [normalized]); // eslint-disable-line

  // If idx changes, we’re loading a new image
  useEffect(() => {
    setBroken(false);
    setLoaded(false);
    setRetryCount(0);
    setRetryNonce(0);
  }, [idx]);

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

  const base = normalized[idx];

  // ✅ cache-bust for retries (forces browser to re-request)
  const current = useMemo(() => {
    if (!base) return "";
    if (!retryNonce) return base;
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}smcb=${retryNonce}`;
  }, [base, retryNonce]);

  const go = (d) => setIdx((p) => (p + d + normalized.length) % normalized.length);

  // ✅ auto-retry a few times if we hit a transient failure (Render cold start etc.)
  useEffect(() => {
    if (!broken) return;
    if (retryCount >= 3) return;

    const delay = 350 + retryCount * 450; // small backoff
    const t = setTimeout(() => {
      setBroken(false);
      setLoaded(false);
      setRetryCount((c) => c + 1);
      setRetryNonce(Date.now());
    }, delay);

    return () => clearTimeout(t);
  }, [broken, retryCount]);

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
      {/* Loading skeleton */}
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
            background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
            zIndex: 1,
          }}
        >
          Loading image…
        </div>
      )}

      {/* Error state (after retries exhausted) */}
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
            background: "linear-gradient(180deg, rgba(255,60,60,0.08), rgba(255,255,255,0.02))",
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

      {/* Image */}
      {!broken && (
        <img
          key={current} // force reload when URL/nonce changes
          src={current}
          alt="Ad"
          style={{
            width: "100%",
            maxHeight: height,
            height,
            objectFit: "contain",
            display: "block",
            background: "#0f1418",
          }}
          onClick={() => onFullscreen && onFullscreen(base)}
          onLoad={() => setLoaded(true)}
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



/* ---------- Minimal metrics row ---------- */
function MetricsRow({ metrics }) {
  const cards = useMemo(() => {
    const m = metrics || {};
    const impressions = m.impressions ?? "--";
    const clicks = m.clicks ?? "--";
    const ctr = m.ctr ?? "--";
    const cpc = m.spend && m.clicks ? `$${(Number(m.spend) / Number(m.clicks)).toFixed(2)}` : "--";
    return [
      { key: "impressions", label: "Impressions", value: impressions },
      { key: "clicks", label: "Clicks", value: clicks },
      { key: "ctr", label: "CTR", value: ctr },
      { key: "cpc", label: "CPC", value: cpc },
    ];
  }, [metrics]);

  const cardStyle = {
    minWidth: 160,
    background: "#1e252a",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#eafff6",
    borderRadius: 14,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          padding: "6px 2px",
          scrollSnapType: "x proximity",
          scrollbarWidth: "none",
        }}
      >
        {cards.map((c) => (
          <div key={c.key} style={{ ...cardStyle, scrollSnapAlign: "start" }}>
            <div style={{ fontSize: 12, color: TEXT_MUTED, fontWeight: 900, letterSpacing: 0.3 }}>{c.label}</div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
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

 const [feePaid, setFeePaid] = useState(() => {
  try {
    // 1) session-global (survives resolvedUser changes in same tab/session)
    if (sessionStorage.getItem(SS_FEE_PAID_GLOBAL_KEY) === "1") return true;

    // 2) user-scoped
    if (localStorage.getItem(withUser(resolvedUser, FEE_PAID_KEY)) === "1") return true;

    // 3) legacy/global safety (optional but helps on refresh)
    if (localStorage.getItem(FEE_PAID_KEY) === "1") return true;

    return false;
  } catch {
    return false;
  }
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
  const [loginPass, setLoginPass] = useState(() => lsGet(resolvedUser, "smartmark_login_password") || "");
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState({ ok: false, msg: "" });

useEffect(() => {
  const v = String(loginUser || "").trim();
  if (!v) return; // ✅ don't overwrite with blank
  lsSet(resolvedUser, "smartmark_login_username", v, true);
}, [loginUser, resolvedUser]);

useEffect(() => {
  const v = String(loginPass || "").trim();
  if (!v) return; // ✅ don't overwrite with blank
  lsSet(resolvedUser, "smartmark_login_password", v, true);
}, [loginPass, resolvedUser]);


function normalizeUsername(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // ✅ strip leading $ only, do NOT force lowercase
  return s.replace(/^\$/, "");
}





const handleLogin = async () => {
  const uRaw = String(loginUser || "").trim();
  const uTyped = normalizeUsername(uRaw);
  const p = String(loginPass || "").trim();

  if (!uTyped || !p) {
    setAuthStatus({ ok: false, msg: "Enter CashTag + email." });
    return false;
  }

  const ek = emailKey(p);
  const map = readEmailUserMap();
  const mappedUser = String(map[ek] || "").trim();

  const tryLogin = async (uTry) => {
    const r = await authFetch(`/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uTry, password: p }),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };

  const tryRegister = async (uTry) => {
    const r = await authFetch(`/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: uTry, email: p, password: p }),
    });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };

  setAuthLoading(true);
  setAuthStatus({ ok: false, msg: "Logging in..." });

  try {
    let successUser = "";

    // 1) login with typed username
    let out = await tryLogin(uTyped);
    if (out.r.ok && out.j?.success) {
      successUser = uTyped;
    } else {
      // 2) try auto-register
      const reg = await tryRegister(uTyped);
      if (reg.r.ok && reg.j?.success) {
        successUser = uTyped;
      } else {
        // 3) if email is already tied to another username, login with mapped username
        if (mappedUser && mappedUser !== uTyped) {
          const out2 = await tryLogin(mappedUser);
          if (out2.r.ok && out2.j?.success) {
            successUser = mappedUser;
          }
        }

        // 4) last retry typed login
        if (!successUser) {
          out = await tryLogin(uTyped);
          if (out.r.ok && out.j?.success) successUser = uTyped;
        }
      }
    }

    if (!successUser) {
      const msg = out?.j?.error || "Login failed";
      throw new Error(msg);
    }

    try {
      localStorage.setItem("sm_current_user", successUser);
      localStorage.setItem("smartmark_login_username", successUser); // canonical (no $)
      localStorage.setItem("smartmark_login_password", p);
    } catch {}

    // ✅ store mapping (email -> working backend username)
    try {
      map[ek] = successUser;
      writeEmailUserMap(map);
    } catch {}

    setAuthStatus({ ok: true, msg: "Logged in ✅" });
    return true;
  } catch (e) {
    setAuthStatus({ ok: false, msg: e?.message || "Login failed" });
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

  const isExpired = (time) => !time || (Date.now() - Number(time) > FB_CONN_MAX_AGE);

  const retryDelays = [600, 1400, 2600]; // handles Render cold starts / transient errors

  const validate = async (attempt = 0) => {
    const savedRaw = localStorage.getItem(FB_CONN_KEY);
    const saved = safeParse(savedRaw);

    if (!saved?.connected) return;

    if (isExpired(saved.time)) {
      localStorage.removeItem(FB_CONN_KEY);
      if (!cancelled) setFbConnected(false);
      return;
    }

    // ✅ optimistic: keep UI connected while validating
    if (!cancelled) setFbConnected(true);

    try {
      const r = await authFetch(`/facebook/adaccounts`);

      if (r.ok) {
        if (!cancelled) {
          setFbConnected(true);
          touchFbConn(); // refresh timestamp
        }
        return;
      }

      // ✅ ONLY clear saved connection on real auth failure
      if (r.status === 401 || r.status === 403) {
        localStorage.removeItem(FB_CONN_KEY);
        if (!cancelled) setFbConnected(false);
        return;
      }

      // transient non-auth failure — retry, do NOT wipe connection
      if (attempt < retryDelays.length) {
        setTimeout(() => validate(attempt + 1), retryDelays[attempt]);
      } else {
        if (!cancelled) setFbConnected(true);
      }
    } catch {
      // network/cold start — retry, do NOT wipe connection
      if (attempt < retryDelays.length) {
        setTimeout(() => validate(attempt + 1), retryDelays[attempt]);
      } else {
        if (!cancelled) setFbConnected(true);
      }
    }
  };

  validate(0);

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
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setCampaignStatus] = useState("ACTIVE");
  const [campaignCount, setCampaignCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

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
    try {
      const raw =
        sessionStorage.getItem(SS_DRAFT_KEY(resolvedUser)) ||
        sessionStorage.getItem("draft_form_creatives") ||
        lsGet(resolvedUser, CREATIVE_DRAFT_KEY) ||
        localStorage.getItem("sm_setup_creatives_backup_v1");

      if (raw) baseDraft = JSON.parse(raw || "null");
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

    // 2) Fallback: last 2 from imageDrafts (only if draft object didn’t hydrate)
    const fallbackUrls = getLatestDraftImageUrlsFromImageDrafts();
    if (fallbackUrls && fallbackUrls.length) {
      const ctx = (baseDraft && String(baseDraft?.ctxKey || "").trim()) || (getActiveCtx(resolvedUser) || "").trim();
      setDraftFromImages(fallbackUrls, ctx);
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
    return isYMD(existing) ? existing : todayYMD;
  });

  const [endDate, setEndDate] = useState(() => {
    const existing = ymd(form?.endDate);
    if (isYMD(existing)) return existing;
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
  } catch {}
  try {
    sessionStorage.removeItem("draft_form_creatives");
  } catch {}
  try {
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, CREATIVE_DRAFT_KEY));
    localStorage.removeItem(CREATIVE_DRAFT_KEY);
  } catch {}
  try {
    if (resolvedUser) localStorage.removeItem(withUser(resolvedUser, FORM_DRAFT_KEY));
    localStorage.removeItem(FORM_DRAFT_KEY);
  } catch {}

  // ✅ clear backup + inflight so it can't resurrect
  try {
    localStorage.removeItem(LS_BACKUP_KEY(resolvedUser));
    localStorage.removeItem(SETUP_CREATIVE_BACKUP_KEY);
    localStorage.removeItem(LS_INFLIGHT_KEY(resolvedUser));
  } catch {}

  // ✅ kill UI immediately
  setDraftCreatives({ images: [], mediaSelection: "image" });

  // ✅ IMPORTANT: if UI was focused on the draft, detach it
  setExpandedId((prev) => (prev === "__DRAFT__" ? null : prev));
  setSelectedCampaignId((prev) => (prev === "__DRAFT__" ? "" : prev));
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
  }, [fbConnected]);

  useEffect(() => {
    if (!fbConnected) return;

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
  }, [fbConnected]);

  useEffect(() => {
    if (!selectedAccount) return;
    const acctId = String(selectedAccount).trim();

    authFetch(`/facebook/adaccount/${acctId}/campaigns`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data || [];
        const activeCount = list.filter(
          (c) => (c.status || c.effective_status) === "ACTIVE" || (c.status || c.effective_status) === "PAUSED"
        ).length;
        setCampaignCount(activeCount);
      })
      .catch(() => {});
  }, [selectedAccount]);

  useEffect(() => {
    if (!fbConnected || !selectedAccount) return;
    const acctId = String(selectedAccount).trim();

    authFetch(`/facebook/adaccount/${acctId}/campaigns`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const list = data && data.data ? data.data.slice(0, 2) : [];
        setCampaigns(list);

        const hasDraft = !!(draftCreatives?.images && draftCreatives.images.length);

        if (!selectedCampaignId && list.length > 0 && !hasDraft) {
          setSelectedCampaignId(list[0].id);
          setExpandedId(list[0].id);
        }
      })
      .catch(() => {});
  }, [fbConnected, selectedAccount, launched, draftCreatives?.images, selectedCampaignId]);

  /* ===================== after FB connect, attach draft images into selected campaign creatives map ===================== */
  useEffect(() => {
    if (!cameFromFbConnect) return;
    if (!fbConnected) return;
    if (!selectedAccount) return;

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

    authFetch(`/facebook/adaccount/${acctId}/campaign/${expandedId}/metrics`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        const row = Array.isArray(data?.data) && data.data[0] ? data.data[0] : {};
        const normalized = {
          impressions: row.impressions ? String(row.impressions) : "--",
          clicks: row.clicks ? String(row.clicks) : "--",
          ctr: row.ctr ? String(row.ctr) : "--",
          spend: row.spend ? Number(row.spend) : undefined,
        };
        setMetricsMap((m) => ({ ...m, [expandedId]: normalized }));
      })
      .catch(() => setMetricsMap((m) => ({ ...m, [expandedId]: { impressions: "--", clicks: "--", ctr: "--" } })));
  }, [expandedId, selectedAccount]);

  // Persist
  useEffect(() => {
    lsSet(resolvedUser, "smartmark_last_campaign_fields", JSON.stringify({ ...form, startDate, endDate }));
  }, [form, startDate, endDate]);
  useEffect(() => {
    lsSet(resolvedUser, "smartmark_last_budget", budget);
  }, [budget]);

useEffect(() => {
  if (feePaid) return; // ✅ don't wipe once it's paid
  try {
    localStorage.removeItem(withUser(resolvedUser, FEE_PAID_KEY));
  } catch {}
  // feePaid already false here, no need to set again
}, [budget, resolvedUser, feePaid]);


useEffect(() => {
  const v = selectedAccount ? String(selectedAccount).replace(/^act_/, "") : "";
  lsSet(resolvedUser, "smartmark_last_selected_account", v, true); // ✅ alsoLegacy
}, [selectedAccount, resolvedUser]);

useEffect(() => {
  lsSet(resolvedUser, "smartmark_last_selected_pageId", selectedPageId, true); // ✅ alsoLegacy
}, [selectedPageId, resolvedUser]);


  const handlePauseUnpause = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = String(selectedAccount).trim();

    setLoading(true);
    try {
      if (isPaused) {
        const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/unpause`, {
          method: "POST",
        });
        if (!r.ok) throw new Error("Unpause failed");
        setCampaignStatus("ACTIVE");
        setIsPaused(false);
      } else {
        const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/pause`, {
          method: "POST",
        });
        if (!r.ok) throw new Error("Pause failed");
        setCampaignStatus("PAUSED");
        setIsPaused(true);
      }
    } catch {
      alert("Could not update campaign status.");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedAccount) return;

    const acctId = String(selectedAccount).trim();
    const idToDelete = String(selectedCampaignId || "").trim();

    if (!idToDelete || idToDelete === "__DRAFT__") {
      handleClearDraft();
      alert("Draft discarded.");
      return;
    }

    if (!window.confirm("Delete this campaign? (It will be archived in Facebook)")) return;

    setLoading(true);
    try {
      const r = await authFetch(`/facebook/adaccount/${acctId}/campaign/${idToDelete}/cancel`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "Archive failed");

      // ✅ remove creatives map entry immediately
      try {
        const map = readCreativeMap(resolvedUser, acctId);
        if (map && map[idToDelete]) {
          delete map[idToDelete];
          writeCreativeMap(resolvedUser, acctId, map);
        }
      } catch {}

      // ✅ remove from UI list immediately
      setCampaigns((prev) => (Array.isArray(prev) ? prev.filter((c) => c?.id !== idToDelete) : prev));

      // ✅ clear selection/expanded so no stale "in progress" hangs around
      setSelectedCampaignId("");
      setExpandedId(null);

      // ✅ clear metrics for that id
      setMetricsMap((m) => {
        const { [idToDelete]: _, ...rest } = m || {};
        return rest;
      });

      setCampaignStatus("ARCHIVED");
      setLaunched(false);
      setLaunchResult(null);

      // ✅ refresh campaigns from backend
      try {
        const rr = await authFetch(`/facebook/adaccount/${acctId}/campaigns`);
        const data = await rr.json().catch(() => ({}));
        const list = data && data.data ? data.data.slice(0, 2) : [];
        setCampaigns(list);
      } catch {}

      alert("Campaign deleted.");
    } catch (e) {
      alert("Could not delete campaign: " + (e?.message || ""));
    }
    setLoading(false);
  };

  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    navigate("/form");
  };

  const canLaunch = !!(fbConnected && selectedAccount && selectedPageId && budget && !isNaN(parseFloat(budget)) && parseFloat(budget) >= 3 && feePaid);

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

 const handlePayFee = () => {
  window.open(CASHAPP_URL, "_blank", "noopener,noreferrer");
  try {
    // ✅ per-user
    localStorage.setItem(withUser(resolvedUser, FEE_PAID_KEY), "1");
    // ✅ legacy/global (so refresh still sees it)
    localStorage.setItem(FEE_PAID_KEY, "1");
  } catch {}

  try {
    // ✅ session-global (so resolvedUser changes don't break the UI)
    sessionStorage.setItem(SS_FEE_PAID_GLOBAL_KEY, "1");
  } catch {}

  setFeePaid(true);
};


  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = String(selectedAccount).trim();
      const safeBudget = Math.max(3, Number(budget) || 0);

      const { startISO, endISO } = capTwoWeeksISO(
        startDate ? new Date(`${startDate}T09:00:00`).toISOString() : null,
        endDate ? new Date(`${endDate}T18:00:00`).toISOString() : null
      );

      // ✅ ensure websiteUrl is defined in THIS scope (fixes ReferenceError)
const websiteUrl = (
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

// ✅ ensure finalHeadline/finalBody exist in THIS scope (fixes ReferenceError)
const finalHeadline = (
  form?.headline ||
  form?.adHeadline ||
  previewCopy?.headline ||
  headline ||               // from location.state
  ""
).toString().trim();

const finalBody = (
  form?.primaryText ||
  form?.body ||
  previewCopy?.body ||
  body ||                   // from location.state
  ""
).toString().trim();


// ✅ LAUNCH IMAGES MUST be REAL, PUBLIC Render /api/media URLs (Meta must fetch them)
const isRenderMediaUrl = (u) => {
  const s = String(u || "").trim();
  return s.startsWith(`${MEDIA_ORIGIN}/api/media/`);
};

const forceHostOnRenderMedia = async (candidates) => {
  // 1) normalize everything
  const norm = (candidates || []).map(toAbsoluteMedia).filter(Boolean);

  // 2) if any are data:image, upload them to Render media
  const uploaded = await ensureFetchableUrls(norm, 2); // uploads data:image -> /api/media
  const final = (uploaded || []).map(toAbsoluteMedia).filter(Boolean);

  // 3) HARD REQUIRE: only Render /api/media URLs may go to FB
  return final.filter(isRenderMediaUrl).slice(0, 2);
};

let candidateImgs = [];

// A) If user selected a real campaign, use saved creatives first
if (selectedCampaignId && selectedCampaignId !== "__DRAFT__") {
  try {
    const saved = getSavedCreatives(selectedCampaignId);
    if (Array.isArray(saved?.images)) candidateImgs = candidateImgs.concat(saved.images.slice(0, 2));
  } catch {}
}

// B) Draft creatives (what user just generated)
if (Array.isArray(draftCreatives?.images) && draftCreatives.images.length) {
  candidateImgs = candidateImgs.concat(draftCreatives.images.slice(0, 2));
}

// C) Nav state from FormPage
if (Array.isArray(navImageUrls) && navImageUrls.length) {
  candidateImgs = candidateImgs.concat(navImageUrls.slice(0, 2));
}

// D) Cached/backup fetchable urls (OAuth safe)
try {
  candidateImgs = candidateImgs
    .concat(loadFetchableImagesBackup(resolvedUser) || [])
    .concat(getCachedFetchableImages(resolvedUser) || []);
} catch {}

// E) Last resort: imageDrafts registry
try {
  candidateImgs = candidateImgs.concat(getLatestDraftImageUrlsFromImageDrafts() || []);
} catch {}

let filteredImages = await forceHostOnRenderMedia(candidateImgs);

// ✅ last-ditch retry
if (!filteredImages.length) {
  try {
    filteredImages = await forceHostOnRenderMedia(draftCreatives?.images || []);
  } catch {}
}

if (!filteredImages.length) {
  throw new Error("No launchable images. Please regenerate creatives (images must be hosted on Render /api/media).");
}

// ✅ Keep fetchable backup fresh so OAuth/refresh never breaks launch
try {
  saveFetchableImagesBackup(resolvedUser, filteredImages);
} catch {}




const payload = {
  form: { ...form, url: websiteUrl, websiteUrl },

  budget: safeBudget,
  campaignType: form?.campaignType || "Website Traffic",
  pageId: selectedPageId,
  websiteUrl,

  aiAudience: form?.aiAudience || answers?.aiAudience || "",
  adCopy: finalHeadline + (finalBody ? `\n\n${finalBody}` : ""),
  answers: answers || {},

  mediaSelection: "image",

  imageVariants: filteredImages,
  imageUrls: filteredImages,
  images: filteredImages,

  flightStart: startISO,
  flightEnd: endISO,

  overrideCountPerType: { images: Math.min(2, filteredImages.length) },
};


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
    if (!selectedAccount)
      return { images: [], mediaSelection: "image", meta: { headline: "", body: "", link: "" } };
    const acctKey = String(selectedAccount || "").replace(/^act_/, "");
    const map = readCreativeMap(resolvedUser, acctKey);

    const didPurge = purgeExpiredCreative(map, campaignId);
    if (didPurge) writeCreativeMap(resolvedUser, acctKey, map);

    const saved = map[campaignId] || null;
    if (!saved) return { images: [], mediaSelection: "image", meta: { headline: "", body: "", link: "" } };

    return {
      images: (saved.images || []).map(toAbsoluteMedia).filter(Boolean),
      mediaSelection: "image",
      meta: {
        headline: String(saved?.meta?.headline || "").trim(),
        body: String(saved?.meta?.body || "").trim(),
        link: String(saved?.meta?.link || "").trim(),
      },
    };
  };

  const hasDraft = draftCreatives.images && draftCreatives.images.length;

  const rightPaneCampaigns = [
    ...campaigns.map((c) => ({ ...c, __isDraft: false })),
    ...(hasDraft ? [{ id: "__DRAFT__", name: form.campaignName || "Untitled", __isDraft: true }] : []),
  ].slice(0, 2 + (hasDraft ? 1 : 0));

  /* ================================ UI ================================ */
  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: DARK_BG,
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
            onClick={() => navigate("/form")}
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
          marginTop: isMobile ? 56 : 64,
          gap: isMobile ? 28 : 52,
          padding: isMobile ? "0 4vw 40px" : "0 36px 48px",
          minHeight: "92vh",
          position: "relative",
          zIndex: 1,
        }}
      >
        <main
          style={{
            background: EDGE_BG,
            border: `1px solid ${INPUT_BORDER}`,
            borderRadius: "22px",
            boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
            padding: isMobile ? "24px 16px" : "32px 26px",
            minWidth: isMobile ? "98vw" : 520,
            maxWidth: isMobile ? "100vw" : 600,
            flex: "0 1 590px",
            display: "flex",
            flexDirection: "column",
            gap: "22px",
            alignItems: "center",
            marginBottom: isMobile ? 24 : 0,
            minHeight: "600px",
          }}
        >
<button
  onClick={async () => {
    trackEvent("connect_facebook", { page: "setup" });

    // ✅ always persist creds before redirect (so login always works)
    try {
      const u = String(loginUser || "").trim();
      const p = String(loginPass || "").trim();
      if (u) localStorage.setItem("smartmark_login_username", u.replace(/^\$/, "")); // canonical username
      if (p) localStorage.setItem("smartmark_login_password", p);
    } catch {}

    const qs = new URLSearchParams(location.search || "");
    const ctxFromState = (location.state?.ctxKey ? String(location.state.ctxKey) : "").trim();
    const ctxFromUrl = (qs.get("ctxKey") || "").trim();
    const active = (getActiveCtx(resolvedUser) || "").trim();
    const safeCtx = ctxFromState || ctxFromUrl || active || `${Date.now()}|||setup`;

    setActiveCtx(safeCtx, resolvedUser);

    // ✅ mark inflight so we can restore after OAuth
    try {
      const payload = JSON.stringify({ t: Date.now(), ctxKey: safeCtx });

      // ✅ primary
      localStorage.setItem(LS_INFLIGHT_KEY(resolvedUser), payload);

      // ✅ fallback namespaces so OAuth return can still find it
      localStorage.setItem(LS_INFLIGHT_KEY("anon"), payload);
      localStorage.setItem(FB_CONNECT_INFLIGHT_KEY, payload);
    } catch {}

    // ✅ save preview copy for after redirect
    try {
      saveSetupPreviewBackup(resolvedUser, {
        headline: String(headline || previewCopy?.headline || "").trim(),
        body: String(body || previewCopy?.body || "").trim(),
        link: String(inferredLink || previewCopy?.link || "").trim(),
        ctxKey: safeCtx,
      });
    } catch {}

    // ✅ save FETCHABLE images for after redirect
    try {
      const imgs = resolveFetchableDraftImages({
        user: resolvedUser,
        draftImages: Array.isArray(draftCreatives?.images) ? draftCreatives.images : [],
        navImages: Array.isArray(navImageUrls) ? navImageUrls : [],
      });

      // ✅ If any are data:image, upload them to Render so we have real /api/media URLs
      let fetchables = [];
      try {
        fetchables = await ensureFetchableUrls(imgs, 2); // uploads data:image -> /api/media
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

    // ✅ Start OAuth on SAME-ORIGIN so session cookies land on your app domain
    window.location.assign(`${AUTH_BASE_PRIMARY}/facebook?return_to=${encodeURIComponent(returnTo)}`);
  }}
  style={{
    padding: "14px 22px",
    borderRadius: "14px",
    border: "none",
    background: fbConnected ? `linear-gradient(90deg, ${BTN_BASE}, ${ACCENT_2})` : "#1877F2",
    color: WHITE,
    fontWeight: 900,
    fontSize: "1.08rem",
    boxShadow: "0 2px 12px rgba(24,119,242,0.35)",
    letterSpacing: "0.4px",
    cursor: "pointer",
    width: "100%",
    maxWidth: 420,
    transition: "transform 0.15s",
  }}
  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
  onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
>
  {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
</button>


          <button
            onClick={openFbPaymentPopup}
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "12px 16px",
              borderRadius: "14px",
              border: "none",
              background: "#2f7a5d",
              color: WHITE,
              fontWeight: 900,
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(12,63,46,0.5)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            Add Payment Method
          </button>

          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ color: WHITE, fontWeight: 800, fontSize: "1.02rem" }}>Campaign Name</label>
            <div
              style={{
                background: INPUT_BG,
                borderRadius: 12,
                padding: "10px 12px",
                border: `1px solid ${INPUT_BORDER}`,
              }}
            >
              <input
                type="text"
                value={form.campaignName || ""}
                onChange={(e) => setForm({ ...form, campaignName: e.target.value })}
                placeholder="Type a name..."
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  color: TEXT_DIM,
                  fontSize: "1.02rem",
                  fontWeight: 800,
                }}
              />
            </div>
          </div>

          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: WHITE, fontWeight: 900, fontSize: "1.02rem" }}>Campaign Duration</div>

            <div
              style={{
                ...GLASS,
                borderRadius: 14,
                padding: "12px 12px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ color: TEXT_MUTED, fontWeight: 800, fontSize: "0.9rem" }}>From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    background: INPUT_BG,
                    borderRadius: 12,
                    padding: "10px 12px",
                    border: `1px solid ${INPUT_BORDER}`,
                    width: "100%",
                    color: TEXT_DIM,
                    fontSize: "0.98rem",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ color: TEXT_MUTED, fontWeight: 800, fontSize: "0.9rem" }}>To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(clampEndForStart(startDate, e.target.value))}
                  style={{
                    background: INPUT_BG,
                    borderRadius: 12,
                    padding: "10px 12px",
                    border: `1px solid ${INPUT_BORDER}`,
                    width: "100%",
                    color: TEXT_DIM,
                    fontSize: "0.98rem",
                    fontWeight: 800,
                    outline: "none",
                  }}
                />
              </div>
            </div>

            <div style={{ color: TEXT_MUTED, fontWeight: 700, fontSize: "0.9rem" }}>Max duration is 14 days. End will auto-adjust if needed.</div>
          </div>

          {/* ==================== BUDGET + SMARTMARK FEE (ONLY ONE BLOCK) ==================== */}
          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ color: WHITE, fontWeight: 800, fontSize: "1.02rem" }}>Daily Budget ($)</label>

            <div style={{ background: INPUT_BG, borderRadius: 12, padding: "10px 12px", border: `1px solid ${INPUT_BORDER}` }}>
              <input
                type="number"
                placeholder="Enter daily budget (minimum $3/day)"
                min={3}
                step={1}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  width: "100%",
                  color: TEXT_DIM,
                  fontSize: "1.02rem",
                  fontWeight: 800,
                }}
              />
            </div>

            <div style={{ color: "#b7f5c2", fontWeight: 800 }}>
              SmartMark Fee: <span style={{ color: ACCENT_ALT }}>${fee.toFixed(2)}</span>
            </div>

            {(() => {
              const n = Number(budget);
              const show = Number.isFinite(n) && n >= 3;
              if (!show) return null;

              return (
                <div
                  style={{
                    marginTop: 6,
                    borderRadius: 16,
                    padding: "14px 14px",
                    ...GLASS,
                    color: WHITE,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#bdfdf0", textAlign: "center" }}>Pay SmartMark Fee to Launch</div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <input
                      type="text"
                      value={loginUser}
                     onChange={(e) => {
  const v = e.target.value;
  setLoginUser(v);

  // ✅ keep global last-typed username canonical (no $)
  try {
    const t = String(v || "").trim();
    if (t) localStorage.setItem("smartmark_login_username", t.replace(/^\$/, ""));
  } catch {}
}}

                      placeholder="$CashTag"
                      style={{
                        background: INPUT_BG,
                        borderRadius: 12,
                        padding: "10px 12px",
                        border: `1px solid ${INPUT_BORDER}`,
                        width: "100%",
                        color: TEXT_DIM,
                        fontSize: "1.02rem",
                        fontWeight: 800,
                        outline: "none",
                      }}
                    />

                  <input
  type="email"
  value={loginPass}
  onChange={(e) => {
    const v = e.target.value;
    setLoginPass(v);

    // ✅ ALSO write to the global keys that Login.js reads
    try {
      const t = String(v || "").trim();
      if (t) localStorage.setItem("smartmark_login_password", t);
    } catch {}
  }}
  placeholder="Email"
  autoComplete="email"
  style={{
    background: INPUT_BG,
    borderRadius: 12,
    padding: "10px 12px",
    border: `1px solid ${INPUT_BORDER}`,
    width: "100%",
    color: TEXT_DIM,
    fontSize: "1.02rem",
    fontWeight: 800,
    outline: "none",
  }}
/>


                    {!!authStatus.msg && (
                      <div style={{ color: TEXT_MUTED, fontWeight: 800, fontSize: 12, textAlign: "center" }}>
                        {authStatus.msg}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "center" }}>
         <button
  type="button"
onClick={() => {
  trackEvent("setup_fee_click", { page: "setup" });
  handlePayFee();
}}



  style={{
    background: feePaid ? `linear-gradient(90deg, ${ACCENT}, ${ACCENT_2})` : BTN_BASE,
    color: WHITE,
    boxShadow: "0 12px 30px rgba(15,111,255,0.25)",
    border: "none",
    borderRadius: 12,
    fontWeight: 900,
    padding: "10px 18px",
    cursor: "pointer",
    minWidth: 170,
  }}
>
  Setup Fee
</button>

                  </div>
                </div>
              );
            })()}
          </div>

         <button
  onClick={() => {
    trackEvent("launch_campaign", { page: "setup" });
    handleLaunch();
  }}
  disabled={loading || campaignCount >= 2 || !canLaunch}
  style={{
    background: campaignCount >= 2 || !canLaunch ? "#8b8d90" : ACCENT,
    color: "#0f1418",
    border: "none",
    borderRadius: 14,
    fontWeight: 900,
    fontSize: "1.02rem",
    padding: "14px 36px",
    marginTop: 6,
    boxShadow: "0 2px 16px rgba(12,196,190,0.25)",
    cursor: loading || campaignCount >= 2 || !canLaunch ? "not-allowed" : "pointer",
    opacity: loading || campaignCount >= 2 || !canLaunch ? 0.6 : 1,
    transition: "transform 0.15s",
  }}
>
  {campaignCount >= 2 ? "Limit Reached" : "Launch Campaign"}
</button>


          {launched && launchResult && (
            <div
              style={{
                color: "#1eea78",
                fontWeight: 900,
                marginTop: "0.8rem",
                fontSize: "0.98rem",
                textShadow: "0 2px 8px #0a893622",
              }}
            >
              Campaign launched! ID: {launchResult.campaignId || "--"}
            </div>
          )}
        </main>

        {/* RIGHT PANE */}
        <aside
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: isMobile ? "center" : "flex-start",
            width: isMobile ? "100vw" : "100%",
            marginTop: isMobile ? 8 : 0,
            gap: "1.6rem",
            minWidth: isMobile ? "100vw" : 400,
            maxWidth: 560,
          }}
        >
          <div
            style={{
              background: CARD_BG,
              borderRadius: "18px",
              padding: isMobile ? "22px 16px" : "24px 22px 26px",
              color: TEXT_MAIN,
              width: isMobile ? "97vw" : "100%",
              maxWidth: "99vw",
              border: `1px solid ${INPUT_BORDER}`,
              boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
              minHeight: "600px",
            }}
          >
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: "1.08rem", fontWeight: 900, color: WHITE, letterSpacing: 0.3 }}>Active Campaigns</div>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button onClick={() => {}} disabled={true} style={{ display: "none" }} />
                <button
                  onClick={handlePauseUnpause}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: isPaused ? "#22dd7f" : "#ffd966",
                    color: "#0f1418",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 20,
                    width: 36,
                    height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }}
                  title={isPaused ? "Play" : "Pause"}
                >
                  {isPaused ? <FaPlay /> : <FaPause />}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: "#f44336",
                    color: WHITE,
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 18,
                    width: 36,
                    height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                  }}
                  title="Delete"
                >
                  <FaTrash />
                </button>
                {campaigns.length < 2 && (
                  <button
                    onClick={handleNewCampaign}
                    style={{
                      background: ACCENT_ALT,
                      color: WHITE,
                      border: "none",
                      borderRadius: 10,
                      fontWeight: 900,
                      fontSize: 20,
                      width: 36,
                      height: 36,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
                    }}
                    title="New Campaign"
                  >
                    <FaPlus />
                  </button>
                )}
              </div>
            </div>

            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
              {rightPaneCampaigns.map((c) => {
                const isDraft = !!c.__isDraft;
                const id = c.id;
                const isOpen = expandedId === id;
                const name = isDraft ? form.campaignName || "Untitled" : c.name || "Campaign";
               const websiteUrlPreview = (
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


                const creatives = isDraft
                  ? {
                      ...draftCreatives,
                      meta: {
                        headline: String(headline || "").trim(),
                        body: String(body || "").trim(),
                        link: websiteUrlPreview || "https://your-smartmark-site.com",
                      },
                    }
                  : getSavedCreatives(id);

                return (
                  <div
                    key={id}
                    style={{
                      width: "100%",
                      background: PANEL_BG,
                      borderRadius: "12px",
                      padding: "8px",
                      border: `1px solid ${INPUT_BORDER}`,
                      boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div
                      onClick={() => {
                        setExpandedId(isOpen ? null : id);
                        if (!isDraft) setSelectedCampaignId(id);
                      }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        padding: "8px 10px",
                        borderRadius: 10,
                        background: "#161c21",
                        border: `1px solid ${INPUT_BORDER}`,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, color: WHITE, fontWeight: 900 }}>
                        <FaChevronDown style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s" }} />
                        <span>{name}</span>
                        {isDraft && (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "#2d5b45",
                              color: "#aef4da",
                              fontSize: 11,
                              fontWeight: 900,
                              letterSpacing: 0.5,
                            }}
                          >
                            IN&nbsp;PROGRESS
                          </span>
                        )}
                      </div>

                     {isDraft ? (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();

      // ✅ hard-disable + hard-purge so draft can’t resurrect from any storage path
      try {
        setDraftDisabled(resolvedUser, true);
      } catch {}

      try {
        purgeDraftStorages(resolvedUser);
      } catch {}
      try {
        purgeDraftArtifactsEverywhere();
      } catch {}

      try {
        // kill OAuth inflight + backups (common resurrection paths)
        localStorage.removeItem(LS_INFLIGHT_KEY(resolvedUser));
        localStorage.removeItem(LS_INFLIGHT_KEY("anon"));
        localStorage.removeItem(FB_CONNECT_INFLIGHT_KEY);

        localStorage.removeItem(LS_BACKUP_KEY(resolvedUser));
        localStorage.removeItem(SETUP_CREATIVE_BACKUP_KEY);

        localStorage.removeItem(LS_FETCHABLE_KEY(resolvedUser));
        localStorage.removeItem(SETUP_FETCHABLE_IMAGES_KEY);

        localStorage.removeItem(LS_PREVIEW_KEY(resolvedUser));
        localStorage.removeItem(SETUP_PREVIEW_BACKUP_KEY);

        localStorage.removeItem("sm_image_cache_v1");
        localStorage.removeItem("u:anon:sm_image_cache_v1");
        localStorage.removeItem("smartmark.imageDrafts.v1");
      } catch {}

      // keep your existing clear function too
      try {
        handleClearDraft();
      } catch {}

      // ✅ force UI to detach immediately
      setDraftCreatives({ images: [], mediaSelection: "image" });
      setExpandedId(null);
      setSelectedCampaignId("");
    }}
    title="Discard draft"
    aria-label="Discard draft"
    style={{
      background: "#5b2d2d",
      color: "#ffecec",
      border: "none",
      borderRadius: 10,
      fontWeight: 900,
      width: 28,
      height: 28,
      lineHeight: "28px",
      textAlign: "center",
      cursor: "pointer",
      boxShadow: "0 1px 6px rgba(0,0,0,0.25)",
    }}
  >
    ×
  </button>
) : (
  <div style={{ color: "#89f0cc", fontSize: 12, fontWeight: 900 }}>
    {c.status || c.effective_status || "ACTIVE"}
  </div>
)}

                    </div>

                    {isOpen && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                        {!isDraft && (
                          <div style={{ width: "100%" }}>
                            <MetricsRow metrics={metricsMap[id]} />
                          </div>
                        )}

                        <div
                          style={{
                            width: "100%",
                            background: "#14191e",
                            borderRadius: "12px",
                            padding: "10px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                            border: `1px solid ${INPUT_BORDER}`,
                          }}
                        >
                          <div style={{ color: TEXT_MAIN, fontWeight: 900, fontSize: "1rem", marginBottom: 2 }}>Creatives</div>

                          <div style={{ borderRadius: 16, overflow: "hidden", ...GLASS }}>
                            <div
                              style={{
                                padding: "10px 12px",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                color: TEXT_DIM,
                                fontWeight: 900,
                                fontSize: "0.95rem",
                                borderBottom: `1px solid ${INPUT_BORDER}`,
                                background: "rgba(255,255,255,0.03)",
                              }}
                            >
                              <span>Images</span>
                            </div>

                            <div style={{ padding: 10 }}>
                              <ImageCarousel
                                items={creatives.images}
                                height={CREATIVE_HEIGHT}
                                onFullscreen={(url) => {
                                  setModalImg(url);
                                  setShowImageModal(true);
                                }}
                              />

                              <PreviewCard headline={creatives?.meta?.headline || previewCopy?.headline} body={creatives?.meta?.body || previewCopy?.body} link={creatives?.meta?.link || previewCopy?.link} />
                            </div>
                          </div>

                          {(!creatives.images || creatives.images.length === 0) && (
                            <div style={{ color: TEXT_MUTED, fontWeight: 800, padding: "8px 4px" }}>No creatives saved for this campaign yet.</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div
              style={{
                width: "100%",
                marginTop: 8,
                background: "#14191e",
                borderRadius: "12px",
                padding: "12px",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                border: `1px solid ${INPUT_BORDER}`,
              }}
            >
              <div>
                <div style={{ fontWeight: 900, fontSize: "0.98rem", color: WHITE }}>Ad Account</div>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    fontSize: "1rem",
                    width: "100%",
                    outline: "none",
                    border: `1px solid ${INPUT_BORDER}`,
                    background: "#1a2025",
                    color: TEXT_DIM,
                    marginTop: 6,
                    fontWeight: 800,
                  }}
                >
                  <option value="">Select an ad account</option>
                  {adAccounts.map((ac) => {
                    const v = String(ac.id || "").replace(/^act_/, "");
                    return (
                      <option key={ac.id} value={v}>
                        {ac.name ? `${ac.name} (${v})` : v}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 900, fontSize: "0.98rem", color: WHITE }}>Facebook Page</div>
                <select
                  value={selectedPageId}
                  onChange={(e) => setSelectedPageId(e.target.value)}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    fontSize: "1rem",
                    width: "100%",
                    outline: "none",
                    border: `1px solid ${INPUT_BORDER}`,
                    background: "#1a2025",
                    color: TEXT_DIM,
                    marginTop: 6,
                    fontWeight: 800,
                  }}
                >
                  <option value="">Select a page</option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <ImageModal open={showImageModal} imageUrl={modalImg} onClose={() => setShowImageModal(false)} />
        </aside>
      </div>
    </div>
  );
};

export default CampaignSetup;
