import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const BACKEND_URL = "https://smartmark-mvp.onrender.com";

/* ------------------------------------------------
   Theme (aligned with FormPage/CampaignSetup vibe)
------------------------------------------------- */
const ACCENT = "#14e7b9";
const CARD_BG = "#34373de6";
const EDGE = "rgba(255,255,255,0.06)";
const FONT = "'Poppins','Inter','Segoe UI',Arial,sans-serif";

const styles = `
  .sm-login-wrap {
    min-height: 100vh;
    background: linear-gradient(135deg,#11161c 0%, #1a2026 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    font-family:${FONT};
    position:relative; overflow:hidden; padding:24px;
    gap: 16px;
  }
  .sm-login-glow {
    position:fixed; right:-12vw; top:-18vh; width:720px; height:720px;
    background: radial-gradient(40% 40% at 50% 50%, rgba(20,231,185,0.22), transparent 70%);
    filter: blur(20px); pointer-events:none; z-index:0;
  }
  .sm-topbar {
    position:fixed; top:18px; left:18px; right:18px; display:flex; justify-content:space-between; z-index:2;
  }
  .sm-topbar button {
    background:#202824e0; color:#fff; border:1px solid ${EDGE};
    border-radius: 1.1rem; padding:10px 18px; font-weight:800; letter-spacing:.6px;
    cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25)
  }
  .sm-create-row {
    position:relative; z-index:1; width:100%; display:flex; justify-content:center;
  }
  .sm-create-btn {
    display:inline-block; background:${ACCENT}; color:#0e1519; border:none;
    border-radius:999px; font-weight:900; font-size:1rem; padding:10px 18px;
    cursor:pointer; box-shadow:0 6px 18px rgba(12,196,190,0.28);
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
  .sm-label {
    color:#cfe9e2; font-weight:800; font-size:.95rem; margin-bottom:6px; display:block;
  }
  .sm-btn {
    width:100%; padding:14px 16px; border-radius:14px; border:none;
    background:${ACCENT}; color:#0e1519; font-weight:900; font-size:1.08rem;
    cursor:pointer; transition: transform .15s;
    box-shadow: 0 2px 16px rgba(12,196,190,0.25);
  }
  .sm-btn[disabled]{opacity:.7; cursor:not-allowed}
  .sm-btn:hover{transform:translateY(-2px)}
  .sm-err {
    color:#F87171; background:#232529; border-radius:10px; padding:.8rem;
    font-weight:700; text-align:center;
  }
`;

/* ---------------------- helpers ---------------------- */
const USER_KEYS = [
  "smartmark_last_campaign_fields",
  "smartmark_last_budget",
  "smartmark_last_selected_account",
  "smartmark_last_selected_pageId",
  "smartmark_media_selection"
];
const withUser = (u, key) => `u:${u}:${key}`;
function migrateToUserNamespace(user) {
  try {
    USER_KEYS.forEach((k) => {
      const v = localStorage.getItem(withUser(user, k));
      if (v !== null && v !== undefined) return; // already migrated
      const legacy = localStorage.getItem(k);
      if (legacy !== null && legacy !== undefined) {
        localStorage.setItem(withUser(user, k), legacy);
      }
    });
    // also keep login autofill per user
    const un = localStorage.getItem("smartmark_login_username");
    const pw = localStorage.getItem("smartmark_login_password");
    if (un) localStorage.setItem(withUser(user, "smartmark_login_username"), un);
    if (pw) localStorage.setItem(withUser(user, "smartmark_login_password"), pw);
  } catch {}
}

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // Email (field name kept for backend contract)
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Prefill from last used values (CampaignSetup writes these)
  useEffect(() => {
    setUsername(localStorage.getItem("smartmark_login_username") || "");
    setPassword(localStorage.getItem("smartmark_login_password") || "");
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Login failed");
      }

      // Persist current user & autofill
      const u = username.trim();
      localStorage.setItem("sm_current_user", u);
      localStorage.setItem("smartmark_login_username", u);
      localStorage.setItem("smartmark_login_password", password.trim());

      // Migrate legacy per-user state → namespaced keys
      migrateToUserNamespace(u);

      setLoading(false);
      navigate("/setup"); // load their existing stuff
    } catch (err) {
      setLoading(false);
      setError(err.message || "Server error. Please try again.");
    }
  };

  return (
    <>
      <style>{styles}</style>
      <div className="sm-login-wrap">
        <div className="sm-login-glow" />
        <div className="sm-topbar">
          <button onClick={() => navigate("/")}>← Back</button>
          <div style={{ marginRight: 6 }}>
            <SmartMarkLogoButton />
          </div>
        </div>

        {/* Centered Create button (outside the login box per your request) */}
        <div className="sm-create-row">
          <button className="sm-create-btn" onClick={() => navigate("/form")}>
            Create a campaign
          </button>
        </div>

        {/* Login box: title + two fields only */}
        <form className="sm-login-card" onSubmit={handleLogin}>
          <h1 className="sm-login-title">Login</h1>

          <div>
            <label className="sm-label">Username</label>
            <input
              className="sm-input"
              type="text"
              autoComplete="username"
              placeholder="Username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              required
            />
          </div>

          <div>
            <label className="sm-label">Email</label>
            <input
              className="sm-input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(""); }}
              required
            />
          </div>

          {error && <div className="sm-err">{error}</div>}

          <button className="sm-btn" type="submit" disabled={loading}>
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
      </div>
    </>
  );
}
