// src/pages/Login.js
import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BACKEND_URL = "https://smartmark-mvp.onrender.com";

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
];
const withUser = (u, key) => `u:${u}:${key}`;
function migrateToUserNamespace(user) {
  try {
    USER_KEYS.forEach((k) => {
      const v = localStorage.getItem(withUser(user, k));
      if (v !== null && v !== undefined) return;
      const legacy = localStorage.getItem(k);
      if (legacy !== null && legacy !== undefined) {
        localStorage.setItem(withUser(user, k), legacy);
      }
    });

    const un = localStorage.getItem("smartmark_login_username");
    const pw = localStorage.getItem("smartmark_login_password");
    if (un) localStorage.setItem(withUser(user, "smartmark_login_username"), un);
    if (pw) localStorage.setItem(withUser(user, "smartmark_login_password"), pw);
  } catch {}
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // your app uses "Email" as password
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill from last used values (prefer user namespace if we know current user)
  useEffect(() => {
    const u0 = localStorage.getItem("sm_current_user") || "";
    const u = (u0 || "").trim();
    const un =
      (u ? localStorage.getItem(withUser(u, "smartmark_login_username")) : null) ||
      localStorage.getItem("smartmark_login_username") ||
      "";
    const pw =
      (u ? localStorage.getItem(withUser(u, "smartmark_login_password")) : null) ||
      localStorage.getItem("smartmark_login_password") ||
      "";
    setUsername(un);
    setPassword(pw);
  }, []);

  async function postJSONWithTimeout(url, body, ms = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // ✅ REQUIRED so sm_sid cookie is set cross-site
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let data;
      const txt = await res.text();
      try {
        data = JSON.parse(txt);
      } catch {
        data = { raw: txt };
      }
      return { ok: res.ok, status: res.status, data };
    } finally {
      clearTimeout(t);
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const u = username.trim();
    const p = password.trim();
    if (!u || !p) {
      setError("Please enter both fields.");
      setLoading(false);
      return;
    }

    try {
      const { ok, status, data } = await postJSONWithTimeout(
        `${BACKEND_URL}/auth/login`,
        { username: u, password: p },
        15000
      );

      if (!ok || !data?.success) {
        const snippet = (data?.error || data?.raw || "").toString().slice(0, 200);
        throw new Error(snippet || `Login failed (HTTP ${status}).`);
      }

      // Persist user + autofill
      localStorage.setItem("sm_current_user", u);
      localStorage.setItem("smartmark_login_username", u);
      localStorage.setItem("smartmark_login_password", p);

      // Also store in user namespace
      try {
        localStorage.setItem(withUser(u, "smartmark_login_username"), u);
        localStorage.setItem(withUser(u, "smartmark_login_password"), p);
      } catch {}

      migrateToUserNamespace(u);

      // redirect support (?return=/setup)
      const params = new URLSearchParams(location.search);
      const ret = params.get("return") || "/setup";
      navigate(ret);
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
                setUsername(e.target.value);
                setError("");
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
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
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
