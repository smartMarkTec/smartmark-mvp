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
  .sm-login-sub {
    margin-top:-6px; color:#bdfdf0; text-align:center; font-weight:700; opacity:.9;
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
  .sm-signup {
    margin-top:-2px; color:#bfc1c4; text-align:right; font-weight:600;
  }
  .sm-signup a { color:#1ec885; cursor:pointer; text-decoration:underline; }
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
  const [password, setPassword] = useState(""); // email field (demo)
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

        <form className="sm-login-card" onSubmit={handleLogin}>
          <h1 className="sm-login-title">Welcome back</h1>
          <div className="sm-login-sub">Log in to manage your campaigns</div>

          <div className="sm-signup">
            Don&apos;t have an account?{" "}
            <a onClick={() => navigate("/form")}>Create a campaign</a>
          </div>

          <div>
            <label style={{ color: "#cfe9e2", fontWeight: 800, fontSize: ".95rem" }}>
              CashApp Username
            </label>
            <input
              className="sm-input"
              type="text"
              autoComplete="username"
              placeholder="CashApp Username"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(""); }}
              required
            />
          </div>

          <div>
            <label style={{ color: "#cfe9e2", fontWeight: 800, fontSize: ".95rem" }}>
              Email Address
            </label>
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

          <div style={{ textAlign:"center", color:"#8cefdc", fontWeight:700 }}>
            or <a style={{ color:"#bdfdf0", textDecoration:"underline", cursor:"pointer" }} onClick={() => navigate("/form")}>Start a new campaign</a>
          </div>
        </form>
      </div>
    </>
  );
}
