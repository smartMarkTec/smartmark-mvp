/* eslint-disable */
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

// strip leading $ only (do NOT force lowercase)
function normalizeUsername(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  return s.replace(/^\$/, "");
}

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

const withUser = (u, key) => `u:${u}:${key}`;

// ✅ Safe no-op migration helper (prevents ReferenceError if missing)
function migrateToUserNamespace(user) {
  try {
    const u = String(user || "").trim();
    if (!u) return;

    const globalU = (localStorage.getItem("smartmark_login_username") || "").trim();
    const globalP = (localStorage.getItem("smartmark_login_password") || "").trim();

    if (globalU) localStorage.setItem(withUser(u, "smartmark_login_username"), globalU);
    if (globalP) localStorage.setItem(withUser(u, "smartmark_login_password"), globalP);
  } catch {}
}

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [passwordEmail, setPasswordEmail] = useState(""); // MVP: email used as password
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill always from “last typed” globals first
  useEffect(() => {
    const globalU = (localStorage.getItem("smartmark_login_username") || "").trim();
    const globalP = (localStorage.getItem("smartmark_login_password") || "").trim();

    if (globalU || globalP) {
      setUsername(globalU);
      setPasswordEmail(globalP);
      return;
    }

    // fallback (should rarely be used now)
    const current = (localStorage.getItem("sm_current_user") || "").trim();
    const u =
      (localStorage.getItem(withUser(current, "smartmark_login_username")) ||
        localStorage.getItem("smartmark_login_username") ||
        "").trim();
    const p =
      (localStorage.getItem(withUser(current, "smartmark_login_password")) ||
        localStorage.getItem("smartmark_login_password") ||
        "").trim();
    setUsername(u);
    setPasswordEmail(p);
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const uRaw = String(username || "").trim();
    const uTyped = normalizeUsername(uRaw); // typed username (no leading $)
    const p = String(passwordEmail || "").trim(); // email used as password

    if (!uTyped || !p) {
      setError("Please enter both fields.");
      setLoading(false);
      return;
    }

    const ek = emailKey(p);
    const map = readEmailUserMap();
    const mappedUser = String(map[ek] || "").trim(); // known-good backend username for this email (if any)

    // try a specific username
    const tryLogin = async (uTry) =>
      postJSONWithTimeout(`${AUTH_BASE}/login`, { username: uTry, password: p }, 15000);

    try {
      let successUser = "";
      let out = await tryLogin(uTyped);

      // If login fails, try register (MVP)
      if (!out.ok || !out.data?.success) {
        const reg = await postJSONWithTimeout(
          `${AUTH_BASE}/register`,
          { username: uTyped, email: p, password: p },
          15000
        );

        if (reg.ok && reg.data?.success) {
          successUser = uTyped;
          out = reg;
        } else {
          // If email already belongs to another username, try that mapped username
          if (mappedUser && mappedUser !== uTyped) {
            const out2 = await tryLogin(mappedUser);
            if (out2.ok && out2.data?.success) {
              successUser = mappedUser;
              out = out2;
            }
          }

          // last attempt: retry typed login once (covers race conditions)
          if (!successUser) {
            out = await tryLogin(uTyped);
            if (out.ok && out.data?.success) successUser = uTyped;
          }
        }
      } else {
        successUser = uTyped;
      }

      if (!out.ok || !out.data?.success || !successUser) {
        const snippet = (out.data?.error || out.data?.raw || "").toString().slice(0, 220);
        throw new Error(snippet || `Login failed (HTTP ${out.status}).`);
      }

      // ✅ Persist "current user" + last-used creds
      try {
        localStorage.setItem("sm_current_user", successUser);
        localStorage.setItem("smartmark_login_username", successUser); // canonical (no $)
        localStorage.setItem("smartmark_login_password", p);

        // also user-scoped (optional)
        localStorage.setItem(withUser(successUser, "smartmark_login_username"), successUser);
        localStorage.setItem(withUser(successUser, "smartmark_login_password"), p);
      } catch {}

      // ✅ Remember which backend-username works for this email forever
      try {
        map[ek] = successUser;
        writeEmailUserMap(map);
      } catch {}

      migrateToUserNamespace(successUser);

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
                // ✅ always store last typed (autofill) - canonical username (no $)
                try {
                  localStorage.setItem(
                    "smartmark_login_username",
                    normalizeUsername(String(v || "").trim())
                  );
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
                // ✅ always store last typed (autofill)
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
