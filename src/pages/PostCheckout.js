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

  // phases: "loading" | "form" | "submitting"
  const [phase, setPhase] = useState("loading");

  const [sessionId, setSessionId] = useState("");
  const [planKey, setPlanKey] = useState("");
  const [checkoutEmail, setCheckoutEmail] = useState(""); // email from Stripe — source of truth

  const [mode, setMode] = useState("register"); // "register" | "login"

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [err, setErr] = useState("");
  const [mismatchWarning, setMismatchWarning] = useState(""); // Case C warning
  const [statusMsg, setStatusMsg] = useState("");

  // After register/login: sync the Stripe session to this account, then go to /setup.
  // Only called when the current browser session belongs to the checkout email account.
  const syncAndRedirect = useCallback(
    async (sid, targetPlanKey) => {
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

      // Check agreement acceptance — all paid plans must sign before proceeding
      try {
        const smSid = (localStorage.getItem(SM_SID_LS_KEY) || "").trim();
        const agreeRes = await fetch("/api/agreement/status", {
          credentials: "include",
          headers: smSid ? { "x-sm-sid": smSid } : {},
        });
        const agreeJson = await agreeRes.json().catch(() => ({}));
        if (agreeJson?.ok && !agreeJson?.signed && !agreeJson?.grandfathered) {
          navigate("/agreement", { replace: true });
          return;
        }
      } catch {}

      // Premium customers who have not completed intake go to /premium-intake first
      if (String(targetPlanKey || "").toLowerCase() === "premium") {
        try {
          const smSid = (localStorage.getItem(SM_SID_LS_KEY) || "").trim();
          const intakeRes = await fetch("/api/premium-intake/status", {
            credentials: "include",
            headers: smSid ? { "x-sm-sid": smSid } : {},
          });
          const intakeJson = await intakeRes.json().catch(() => ({}));
          if (intakeJson?.ok && !intakeJson?.submitted) {
            navigate("/premium-intake", { replace: true });
            return;
          }
        } catch {}
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
      navigate("/pricing", { replace: true });
      return;
    }

    setSessionId(sid);
    setPlanKey(plan);

    (async () => {
      // ── Step 1: ALWAYS fetch the Stripe checkout email first.
      //    It is the source of truth for which account this payment belongs to.
      let coEmail = "";
      try {
        const infoRes = await stripeFetch(
          `/checkout-session-info?session_id=${encodeURIComponent(sid)}`
        );
        const infoJson = await infoRes.json().catch(() => ({}));
        if (infoJson?.email) {
          coEmail = infoJson.email.trim().toLowerCase();
          setCheckoutEmail(coEmail);
          setEmail(coEmail); // pre-fill form
        }
      } catch {}

      // ── Step 2: Check who is currently logged in (if anyone).
      let loggedInEmail = "";
      try {
        const whoamiRes = await authFetch("/whoami");
        const whoamiJson = await whoamiRes.json().catch(() => ({}));
        if (whoamiRes.ok && whoamiJson?.success) {
          loggedInEmail = String(
            whoamiJson?.user?.email || whoamiJson?.user?.username || ""
          )
            .trim()
            .toLowerCase();
        }
      } catch {}

      // ── Step 3: Routing decision based on email comparison.

      if (loggedInEmail && coEmail && loggedInEmail === coEmail) {
        // CASE B — logged-in account email matches Stripe checkout email.
        // Safe to activate automatically.
        setStatusMsg("Activating your subscription…");
        await syncAndRedirect(sid, plan);
        return;
      }

      if (loggedInEmail && coEmail && loggedInEmail !== coEmail) {
        // CASE C — a DIFFERENT account is currently logged in.
        // Do NOT attach this payment to that account.
        // Show the form with a clear warning; pre-fill the checkout email.
        setMismatchWarning(
          `You are logged in as ${loggedInEmail}, but this payment was made with ${coEmail}. ` +
            `Create or log into the account for ${coEmail} to activate your subscription.`
        );
      }

      // CASE A (not logged in), CASE C (wrong account logged in),
      // CASE D (existing full account for checkout email),
      // CASE E (ghost user — webhook created record with empty passwordHash):
      //   → Always show the account creation/login form.
      setPhase("form");
    })();
  }, [syncAndRedirect]);

  // ── Register handler ────────────────────────────────────────────────────
  const handleRegister = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanName = fullName.trim();
    // Always use checkoutEmail if known — it is the account that must be created.
    const cleanEmail = checkoutEmail || email.trim().toLowerCase();
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
          // CASE D — full account exists, password didn't match → ask to log in
          setMode("login");
          setErr(
            "An account with this email already exists. Please log in instead."
          );
          setPhase("form");
          return;
        }
        throw new Error(registerJson?.error || "Could not create account.");
      }

      // Register succeeded (new account or ghost user completed)
      try {
        localStorage.setItem("sm_current_user", cleanEmail);
        localStorage.setItem("smartmark_login_username", cleanEmail);
      } catch {}

      await syncAndRedirect(sessionId, planKey);
    } catch (error) {
      setErr(error?.message || "Something went wrong. Please try again.");
      setPhase("form");
    }
  };

  // ── Login handler ───────────────────────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setErr("");

    // Always use checkoutEmail if known — must log in as the account that paid.
    const cleanEmail = checkoutEmail || email.trim().toLowerCase();
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
        throw new Error(
          loginJson?.error || "Login failed. Check your email and password."
        );
      }

      try {
        localStorage.setItem("sm_current_user", cleanEmail);
        localStorage.setItem("smartmark_login_username", cleanEmail);
      } catch {}

      await syncAndRedirect(sessionId, planKey);
    } catch (error) {
      setErr(error?.message || "Login failed.");
      setPhase("form");
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────────
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

  const inputReadOnly = {
    ...inputStyle,
    background: "#f0f0f6",
    color: TEXT_SOFT,
    cursor: "default",
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

  // ── Loading screen ───────────────────────────────────────────────────────
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
        <div style={{ textAlign: "center", color: TEXT, fontSize: 15 }}>
          {statusMsg || "Verifying payment…"}
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────
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
        {/* Green success badge */}
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
          style={{ fontSize: 22, fontWeight: 800, color: TEXT, margin: "0 0 6px" }}
        >
          Payment confirmed!
        </h1>

        <p
          style={{ fontSize: 14, color: TEXT_SOFT, margin: "0 0 20px", lineHeight: 1.5 }}
        >
          {planKey
            ? `You're subscribed to the ${PLAN_NAMES[planKey] || planKey} plan. `
            : ""}
          {mode === "register"
            ? "Create your account to finish setup."
            : "Log in to your existing account to continue."}
        </p>

        {/* Case C warning: wrong account is logged in */}
        {mismatchWarning && (
          <div
            style={{
              background: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 13,
              color: "#7a5800",
              marginBottom: 18,
              lineHeight: 1.5,
            }}
          >
            {mismatchWarning}
          </div>
        )}

        {/* Error message */}
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

        {/* Mode toggle: Create account / Log in */}
        <div
          style={{
            display: "flex",
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

        {/* ── REGISTER FORM ── */}
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
                style={checkoutEmail ? inputReadOnly : inputStyle}
                type="email"
                value={checkoutEmail || email}
                readOnly={!!checkoutEmail}
                onChange={checkoutEmail ? undefined : (e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={phase === "submitting"}
              />
              {checkoutEmail && (
                <div
                  style={{ fontSize: 11, color: "#1ec885", marginTop: 4, fontWeight: 600 }}
                >
                  From your Stripe checkout — this is the account that will be created
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
          /* ── LOGIN FORM ── */
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Email address</label>
              <input
                style={checkoutEmail ? inputReadOnly : inputStyle}
                type="email"
                value={checkoutEmail || email}
                readOnly={!!checkoutEmail}
                onChange={checkoutEmail ? undefined : (e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={phase === "submitting"}
              />
              {checkoutEmail && (
                <div
                  style={{ fontSize: 11, color: "#1ec885", marginTop: 4, fontWeight: 600 }}
                >
                  Log in as the account that made this payment
                </div>
              )}
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
          style={{ marginTop: 18, textAlign: "center", fontSize: 13, color: TEXT_SOFT }}
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
