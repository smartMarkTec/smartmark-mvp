import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(180deg, #bcc3fb 0%, #d6dbff 38%, #ecefff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#66708b";
const PURPLE = "#5d59ea";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.92)";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";

const SM_SID_LS_KEY = "sm_sid_v1";

function ensureStoredSid() {
  try {
    let sid = (localStorage.getItem(SM_SID_LS_KEY) || "").trim();
    if (sid) return sid;
    sid = `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SM_SID_LS_KEY, sid);
    return sid;
  } catch {
    return `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

async function authFetch(path, opts = {}) {
  const sid = ensureStoredSid();
  const headers = { ...(opts.headers || {}), "x-sm-sid": sid };
  const rel = String(path || "").startsWith("/") ? String(path) : `/${path}`;
  const doFetch = (base) =>
    fetch(`${base}${rel}`, { ...opts, headers, credentials: "include" });
  let res = await doFetch("/auth");
  if (res.status === 404) res = await doFetch("/api/auth");
  return res;
}

async function stripeFetch(path, opts = {}) {
  const sid = ensureStoredSid();
  const headers = { ...(opts.headers || {}), "x-sm-sid": sid };
  return fetch(`/api/stripe${path}`, { ...opts, headers, credentials: "include" });
}

const PLAN_NAMES = { starter: "Starter", pro: "Pro", operator: "Operator" };

export default function PostCheckout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [phase, setPhase] = useState("loading");
  // phases: "loading" | "form" | "submitting" | "done" | "invalid"

  const [sessionId, setSessionId] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState("");

  const [mode, setMode] = useState("register"); // "register" | "login"

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [err, setErr] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const syncAndRedirect = useCallback(
    async (sid) => {
      try {
        const res = await stripeFetch("/sync-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: sid }),
        });
        const json = await res.json().catch(() => ({}));
        const newSid = String(json?.newSid || "").trim();
        if (newSid) {
          try {
            localStorage.setItem(SM_SID_LS_KEY, newSid);
          } catch {}
        }
      } catch (e) {
        console.warn("[post-checkout] sync failed:", e?.message);
      }
      navigate("/setup", { replace: true });
    },
    [navigate]
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    const sid = params.get("session_id") || "";
    const plan = (params.get("plan") || "").toLowerCase();

    if (!sid) {
      // No session ID — bad URL, send to pricing
      navigate("/pricing", { replace: true });
      return;
    }

    setSessionId(sid);
    setPlanKey(plan);

    (async () => {
      // 1. Check if already logged in
      try {
        const whoamiRes = await authFetch("/whoami");
        const whoamiJson = await whoamiRes.json().catch(() => ({}));
        if (whoamiRes.ok && whoamiJson?.success) {
          setStatusMsg("Activating your subscription…");
          await syncAndRedirect(sid);
          return;
        }
      } catch {}

      // 2. Get checkout email for pre-fill (best-effort)
      try {
        const infoRes = await stripeFetch(
          `/checkout-session-info?session_id=${encodeURIComponent(sid)}`
        );
        const infoJson = await infoRes.json().catch(() => ({}));
        if (infoJson?.email) {
          setCheckoutEmail(infoJson.email);
          setEmail(infoJson.email);
        }
      } catch {}

      setPhase("form");
    })();
  }, [syncAndRedirect]);

  const handleRegister = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;
    const cleanConfirm = confirmPassword;

    if (!cleanName || !cleanEmail || !cleanPass || !cleanConfirm) {
      setErr("Fill out all fields.");
      return;
    }
    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setErr("Enter a valid email address.");
      return;
    }
    if (cleanPass.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (cleanPass !== cleanConfirm) {
      setErr("Passwords do not match.");
      return;
    }

    setPhase("submitting");

    try {
      const registerRes = await authFetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPass,
          fullName: cleanName,
          name: cleanName,
        }),
      });

      const registerJson = await registerRes.json().catch(() => ({}));

      if (!registerRes.ok && !registerJson?.success) {
        if (registerJson?.code === "ACCOUNT_EXISTS_PASSWORD_MISMATCH") {
          setMode("login");
          setErr(
            "An account with this email already exists. Please log in instead."
          );
          setPhase("form");
          return;
        }
        throw new Error(registerJson?.error || "Could not create account.");
      }

      try {
        localStorage.setItem("sm_current_user", cleanEmail);
        localStorage.setItem("smartmark_login_username", cleanEmail);
      } catch {}

      await syncAndRedirect(sessionId);
    } catch (error) {
      setErr(error?.message || "Something went wrong. Please try again.");
      setPhase("form");
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanEmail = email.trim().toLowerCase();
    const cleanPass = password;

    if (!cleanEmail || !cleanPass) {
      setErr("Fill out all fields.");
      return;
    }

    setPhase("submitting");

    try {
      const loginRes = await authFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: cleanEmail, password: cleanPass }),
      });

      const loginJson = await loginRes.json().catch(() => ({}));

      if (!loginRes.ok || !loginJson?.success) {
        throw new Error(loginJson?.error || "Login failed. Check your email and password.");
      }

      try {
        localStorage.setItem("sm_current_user", cleanEmail);
        localStorage.setItem("smartmark_login_username", cleanEmail);
      } catch {}

      await syncAndRedirect(sessionId);
    } catch (error) {
      setErr(error?.message || "Login failed.");
      setPhase("form");
    }
  };

  const inputStyle = {
    width: "100%",
    padding: "11px 14px",
    borderRadius: 10,
    border: `1.5px solid ${BORDER}`,
    background: "#fff",
    color: TEXT,
    fontFamily: FONT,
    fontSize: 15,
    outline: "none",
    boxSizing: "border-box",
  };

  const labelStyle = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: TEXT_SOFT,
    marginBottom: 5,
    fontFamily: FONT,
  };

  const btnStyle = {
    width: "100%",
    padding: "13px 0",
    borderRadius: 10,
    border: "none",
    background: BTN,
    color: "#fff",
    fontFamily: FONT,
    fontSize: 16,
    fontWeight: 700,
    cursor: phase === "submitting" ? "not-allowed" : "pointer",
    opacity: phase === "submitting" ? 0.7 : 1,
    marginTop: 8,
  };

  // ── Loading / redirect-in-progress ──────────────────────────────────────
  if (phase === "loading") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: BG,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: FONT,
        }}
      >
        <div style={{ textAlign: "center", color: TEXT }}>
          {statusMsg || "Verifying payment…"}
        </div>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 24,
          padding: "40px 36px",
          boxShadow: "0 18px 46px rgba(83,77,212,0.12)",
        }}
      >
        {/* Success badge */}
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "linear-gradient(135deg,#1ec885,#17b576)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <span style={{ color: "#fff", fontSize: 26, lineHeight: 1 }}>✓</span>
        </div>

        <h1
          style={{
            fontSize: 22,
            fontWeight: 800,
            color: TEXT,
            margin: "0 0 6px",
          }}
        >
          Payment confirmed!
        </h1>

        <p
          style={{
            fontSize: 14,
            color: TEXT_SOFT,
            margin: "0 0 28px",
            lineHeight: 1.5,
          }}
        >
          {planKey
            ? `You're subscribed to the ${PLAN_NAMES[planKey] || planKey} plan. `
            : ""}
          {mode === "register"
            ? "Create your account to get started."
            : "Log in to your existing account to continue."}
        </p>

        {err && (
          <div
            style={{
              background: "#fff0f0",
              border: "1px solid #f5c0c0",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#c0392b",
              marginBottom: 18,
            }}
          >
            {err}
          </div>
        )}

        {/* Mode toggle */}
        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 24,
            borderRadius: 10,
            border: `1.5px solid ${BORDER}`,
            overflow: "hidden",
          }}
        >
          {["register", "login"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setErr("");
                setPassword("");
                setConfirmPassword("");
              }}
              style={{
                flex: 1,
                padding: "9px 0",
                border: "none",
                background: mode === m ? PURPLE : "transparent",
                color: mode === m ? "#fff" : TEXT_SOFT,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {m === "register" ? "Create account" : "Log in"}
            </button>
          ))}
        </div>

        {mode === "register" ? (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Full name</label>
              <input
                style={inputStyle}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                autoComplete="name"
                disabled={phase === "submitting"}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email address</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={phase === "submitting"}
              />
              {checkoutEmail && email === checkoutEmail && (
                <div
                  style={{
                    fontSize: 11,
                    color: "#1ec885",
                    marginTop: 4,
                    fontWeight: 600,
                  }}
                >
                  Pre-filled from your checkout
                </div>
              )}
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Create password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                autoComplete="new-password"
                disabled={phase === "submitting"}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Confirm password</label>
              <input
                style={inputStyle}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                autoComplete="new-password"
                disabled={phase === "submitting"}
              />
            </div>

            <button type="submit" style={btnStyle} disabled={phase === "submitting"}>
              {phase === "submitting" ? "Creating account…" : "Create account & continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email address</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={phase === "submitting"}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                disabled={phase === "submitting"}
              />
            </div>

            <button type="submit" style={btnStyle} disabled={phase === "submitting"}>
              {phase === "submitting" ? "Logging in…" : "Log in & continue"}
            </button>
          </form>
        )}

        <div
          style={{
            marginTop: 18,
            textAlign: "center",
            fontSize: 13,
            color: TEXT_SOFT,
          }}
        >
          <a
            href="/pricing"
            style={{ color: PURPLE, textDecoration: "none", fontWeight: 600 }}
          >
            ← Back to pricing
          </a>
        </div>
      </div>
    </div>
  );
}
