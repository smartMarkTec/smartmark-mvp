// src/pages/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "/api";

// ✅ Match CampaignSetup.js (same-origin /api/auth -> Vercel rewrite -> Render /auth)
const AUTH_BASE = "/api/auth";


// ✅ sid fallback (matches CampaignSetup.js)
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

function ensureStoredSid() {
  let sid = getStoredSid();
  if (sid) return sid;

  sid = `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  setStoredSid(sid);
  return sid;
}

// Optional: normalize CashTag-style usernames
function normalizeUser(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  return s.startsWith("$") ? s : s; // keep as-is unless you want to force "$"
}


/* ---------------- Theme ---------------- */
const ACCENT = "#14e7b9";
const CARD_BG = "#34373de6";
const EDGE = "rgba(255,255,255,0.06)";
const FONT = "'Poppins','Inter','Segoe UI',Arial,sans-serif";

const styles = `
  .sm-login-wrap {
    min-height: 100vh;
    background: linear-gradient(135deg,#11161c 0%, #1a2026 100%);
    display:flex; align-items:center; justify-content:center;
    font-family:${FONT};
    position:relative; overflow:hidden; padding:24px;
  }
  .sm-login-glow {
    position:fixed; right:-12vw; top:-18vh; width:720px; height:720px;
    background: radial-gradient(40% 40% at 50% 50%, rgba(20,231,185,0.22), transparent 70%);
    filter: blur(20px); pointer-events:none; z-index:0;
  }
  .sm-login-card {
    position:relative; z-index:1;
    width: 100%; max-width: 520px;
    background:${CARD_BG};
    border: 1px solid ${EDGE};
    border-radius: 22px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.35);
    padding: 28px 26px;
    display:flex; flex-direction:column; gap:18px;
  }
  .sm-login-title {
    margin:0; font-size:2.1rem; line-height:1.2; font-weight:900;
    background: linear-gradient(90deg,#ffffff, ${ACCENT});
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    text-align:center;
  }
  .sm-input {
    width:100%; padding:14px 16px;
    background:#23262a; color:#fff; border-radius:12px;
    border:1px solid ${EDGE}; outline:none;
    font-size:1.05rem; font-weight:700;
    box-shadow: 0 1.5px 8px rgba(20,231,185,.22);
  }
  .sm-btn {
    width:100%; padding:14px 16px; border-radius:14px; border:none;
    background:${ACCENT}; color:#0e1519; font-weight:900; font-size:1.08rem;
    cursor:pointer; transition: transform .15s;
    box-shadow: 0 2px 16px rgba(12,196,190,0.25);
  }
  .sm-btn[disabled]{opacity:.7; cursor:not-allowed}
  .sm-btn:hover{transform:translateY(-2px)}
  .sm-topbar {
    position:fixed; top:18px; left:18px; right:18px; display:flex; justify-content:space-between; z-index:2;
  }
  .sm-topbar button {
    background:#202824e0; color:#fff; border:1px solid ${EDGE};
    border-radius: 1.1rem; padding:10px 18px; font-weight:800; letter-spacing:.6px;
    cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25)
  }
  .sm-err {
    color:#F87171; background:#232529; border-radius:10px; padding:.8rem;
    font-weight:700; text-align:center;
  }
`;

const USER_KEYS = [
  "smartmark_last_campaign_fields",
  "smartmark_last_budget",
  "smartmark_last_selected_account",
  "smartmark_last_selected_pageId",
  "smartmark_media_selection",
  "draft_form_creatives_v2",
  "sm_form_draft_v2",
  "draft_form_creatives" // sessionStorage key sometimes mirrored
];

const withUser = (u, key) => `u:${u}:${key}`;

function migrateToUserNamespace(user) {
  try {
    // Migrate known “app state” keys into this user’s namespace if not already there
    USER_KEYS.forEach((k) => {
      const existing = localStorage.getItem(withUser(user, k));
      if (existing !== null && existing !== undefined) return;

      const legacy = localStorage.getItem(k);
      if (legacy !== null && legacy !== undefined) {
        localStorage.setItem(withUser(user, k), legacy);
      }
    });

    // Migrate legacy creds into user scope (for autofill consistency)
    const un = localStorage.getItem("smartmark_login_username");
    const pw = localStorage.getItem("smartmark_login_password");
    if (un) localStorage.setItem(withUser(user, "smartmark_login_username"), un);
    if (pw) localStorage.setItem(withUser(user, "smartmark_login_password"), pw);
  } catch {}
}

function readUserScoped(user, key, fallbackKey = key) {
  try {
    if (user) {
      const v = localStorage.getItem(withUser(user, key));
      if (v !== null && v !== undefined) return v;
    }
    return localStorage.getItem(fallbackKey);
  } catch {
    return null;
  }
}

async function postJSONWithTimeout(url, body, ms = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);

  // ✅ ALWAYS send sid header (matches CampaignSetup authFetch)
  const sid = ensureStoredSid();

  const doFetch = async (u) => {
    const res = await fetch(u, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sm-sid": sid,
      },
      credentials: "include",
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const txt = await res.text();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      data = { raw: txt };
    }
    return { ok: res.ok, status: res.status, data };
  };

  try {
    // 1) Try the provided URL (usually /api/...)
    let out = await doFetch(url);

    // 2) If /api/* is missing (Render-direct / local without rewrites), fallback to non-/api
    if (out.status === 404 && typeof url === "string" && url.startsWith("/api/")) {
      out = await doFetch(url.replace(/^\/api/, ""));
    }

    return out;
  } finally {
    clearTimeout(t);
  }
}

function normalizeUsername(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  // strip leading $ only (do NOT force lowercase)
  return s.replace(/^\$/, "");
}



export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [passwordEmail, setPasswordEmail] = useState(""); // MVP: email used as password
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill:
  // 1) if sm_current_user exists, prefer that user’s scoped creds
  // 2) otherwise fallback to legacy global “last typed” creds (from CampaignSetup)
useEffect(() => {
  // ✅ ALWAYS prefer the last-typed global creds (CampaignSetup writes these)
  const globalU = (localStorage.getItem("smartmark_login_username") || "").trim();
  const globalP = (localStorage.getItem("smartmark_login_password") || "").trim();

  if (globalU || globalP) {
    setUsername(globalU);
    setPasswordEmail(globalP);
    return;
  }

  // fallback to user-scoped if globals not present
  const current = (localStorage.getItem("sm_current_user") || "").trim();

  const u = readUserScoped(current, "smartmark_login_username", "smartmark_login_username") || "";
  const p = readUserScoped(current, "smartmark_login_password", "smartmark_login_password") || "";

  setUsername(u);
  setPasswordEmail(p);
}, []);


  // MVP behavior:
  // - Try /auth/login
  // - If user doesn't exist yet, auto-create via /auth/register (no separate register button)
  // - Then navigate to /setup
const handleLogin = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError("");

  const uRaw = String(username || "").trim();
  const u = normalizeUsername(uRaw); // canonical (no leading $)
  const p = String(passwordEmail || "").trim(); // MVP: email used as password

  if (!u || !p) {
    setError("Please enter both fields.");
    setLoading(false);
    return;
  }

  try {
    // 1) Try login
    let out = await postJSONWithTimeout(
      `${AUTH_BASE}/login`,
      { username: u, password: p },
      15000
    );

    // 2) If login fails, try auto-register once (MVP)
    if (!out.ok || !out.data?.success) {
      const reg = await postJSONWithTimeout(
        `${AUTH_BASE}/register`,
        { username: u, email: p, password: p },
        15000
      );

      // If register succeeded -> treat as success
      if (reg.ok && reg.data?.success) {
        out = reg;
      } else {
        // If register didn’t succeed, retry login once (common if user already exists)
        out = await postJSONWithTimeout(
          `${AUTH_BASE}/login`,
          { username: u, password: p },
          15000
        );
      }
    }

    if (!out.ok || !out.data?.success) {
      const snippet = (out.data?.error || out.data?.raw || "").toString().slice(0, 220);
      throw new Error(snippet || `Login failed (HTTP ${out.status}).`);
    }

    // ✅ Persist "current user" + last-used creds (global keys CampaignSetup reads)
    try {
      localStorage.setItem("sm_current_user", u);
      localStorage.setItem("smartmark_login_username", u);
      localStorage.setItem("smartmark_login_password", p);

      // also user-scoped (optional but fine)
      localStorage.setItem(withUser(u, "smartmark_login_username"), u);
      localStorage.setItem(withUser(u, "smartmark_login_password"), p);
    } catch {}

    // migrate shared app state into user namespace (first login)
    migrateToUserNamespace(u);

    navigate("/setup");
  } catch (err) {
    const msg =
      err?.name === "AbortError"
        ? "Login timed out. Server didn’t respond."
        : err?.message || "Server error. Please try again.";
    setError(msg);
  } finally {
    setLoading(false);
  }
};


  return (
    <>
      <style>{styles}</style>
      <div className="sm-login-wrap">
        <div className="sm-login-glow" />
        <div className="sm-topbar">
          <button onClick={() => navigate("/")}>← Back</button>
          <div />
        </div>

        <form className="sm-login-card" onSubmit={handleLogin}>
          <h1 className="sm-login-title">Login</h1>

          <div>
            <label style={{ color: "#cfe9e2", fontWeight: 800, fontSize: ".95rem" }}>
              Username
            </label>
            <input
              className="sm-input"
              type="text"
              autoComplete="username"
              placeholder="Username"
              value={username}
             onChange={(e) => {
  const v = e.target.value;
  setUsername(v);
  setError("");

  // ✅ keep global "last typed" in sync (CampaignSetup + Prefill reads these)
  try {
    localStorage.setItem("smartmark_login_username", String(v || "").trim());
  } catch {}
}}

              required
            />
          </div>

          <div>
            <label style={{ color: "#cfe9e2", fontWeight: 800, fontSize: ".95rem" }}>
              Email (used as password)
            </label>
            <input
              className="sm-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={passwordEmail}
             onChange={(e) => {
  const v = e.target.value;
  setPasswordEmail(v);
  setError("");

  // ✅ keep global "last typed" in sync (CampaignSetup + Prefill reads these)
  try {
    localStorage.setItem("smartmark_login_password", String(v || "").trim());
  } catch {}
}}

              required
            />
          </div>

          {error && <div className="sm-err">{error}</div>}

          <button className="sm-btn" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </>
  );
}
