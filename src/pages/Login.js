/* eslint-disable */
// src/pages/Login.js
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const FONT     = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG       = "radial-gradient(ellipse at 50% 0%, rgba(93,89,234,0.07) 0%, transparent 60%), linear-gradient(180deg, #f5f6ff 0%, #fafbff 100%)";
const TEXT     = "#101426";
const TEXT_SOFT = "#66708b";
const BORDER   = "rgba(93, 89, 234, 0.13)";
const BTN      = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER = "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";

const PLAN_META = {
  starter:  { name: "Starter",  price: "$99/mo"  },
  pro:      { name: "Pro",      price: "$149/mo" },
  operator: { name: "Operator", price: "$249/mo" },
};

const SM_SID_LS_KEY = "sm_sid_v1";

function getStoredSid() {
  try { return (localStorage.getItem(SM_SID_LS_KEY) || "").trim(); }
  catch { return ""; }
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

async function createCheckoutSession({ plan }) {
  const pricingVariant = (() => { try { return localStorage.getItem("sm_pricing_variant") || "normal"; } catch { return "normal"; } })();
  const pricingMarket = (() => { try { return localStorage.getItem("sm_pricing_market") || "tech"; } catch { return "tech"; } })();
  const res = await fetch("/api/stripe/create-checkout-session-auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-sm-sid": ensureStoredSid() },
    credentials: "include",
    body: JSON.stringify({ plan, launchIntent: "1", pricingVariant, pricingMarket }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok || !json?.url) {
    throw new Error(json?.error || "Could not start checkout.");
  }
  return json.url;
}

function looksLikeEmail(value) {
  return /\S+@\S+\.\S+/.test(String(value || "").trim());
}

function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/^\$/, "");
}

function readEmailUserMap() {
  try { return JSON.parse(localStorage.getItem("sm_email_user_map_v1") || "{}"); }
  catch { return {}; }
}

function writeEmailUserMap(map) {
  try { localStorage.setItem("sm_email_user_map_v1", JSON.stringify(map || {})); }
  catch {}
}

async function getBillingStatus() {
  const res = await fetch("/api/stripe/billing-status", {
    method: "GET",
    headers: { "x-sm-sid": ensureStoredSid() },
    credentials: "include",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, billing: null, user: null };
  return json;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const isGrowthVariant =
    localStorage.getItem("sm_pricing_variant") === "high_ticket_test";

  const selectedPlan = useMemo(
    () =>
      String(
        location.state?.selectedPlan ||
          localStorage.getItem("sm_selected_plan") ||
          ""
      ).trim().toLowerCase(),
    [location.state]
  );

  const [identifier, setIdentifier] = useState(
    localStorage.getItem("smartmark_login_username") ||
      localStorage.getItem("sm_signup_email") ||
      ""
  );
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  // ── handleLogin — auth logic unchanged ──────────────────────────────────────
  const handleLogin = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanIdentifier = normalizeIdentifier(identifier);
    const cleanPassword   = String(password || "");

    if (!cleanIdentifier || !cleanPassword) {
      setErr("Enter your email or username and password.");
      return;
    }

    setLoading(true);

    try {
      const storedEmail = String(localStorage.getItem("sm_signup_email") || "").trim().toLowerCase();
      const emailUserMap = readEmailUserMap();

      const candidates = [
        cleanIdentifier,
        cleanIdentifier.toLowerCase(),
        looksLikeEmail(cleanIdentifier)
          ? String(emailUserMap[cleanIdentifier.toLowerCase()] || "").trim()
          : "",
        looksLikeEmail(cleanIdentifier) ? cleanIdentifier.toLowerCase() : "",
        storedEmail && looksLikeEmail(cleanIdentifier) ? storedEmail : "",
      ]
        .map((x) => normalizeIdentifier(x))
        .filter(Boolean)
        .filter((v, i, arr) => arr.indexOf(v) === i);

      let loginJson = null;
      let matchedIdentifier = "";

      for (const candidate of candidates) {
        const loginRes = await authFetch("/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: candidate, password: cleanPassword }),
        });
        const json = await loginRes.json().catch(() => ({}));
        if (loginRes.ok && json?.success) {
          loginJson = json;
          matchedIdentifier = candidate;
          break;
        }
      }

      if (!loginJson?.success) {
        throw new Error("Invalid login credentials. This usually means the account was created earlier with a different password.");
      }

      const backendUsername = normalizeIdentifier(
        loginJson?.user?.username || matchedIdentifier || cleanIdentifier
      );
      const backendEmail = String(loginJson?.user?.email || cleanIdentifier || "").trim().toLowerCase();

      localStorage.setItem("sm_current_user", backendUsername);

      // ── Namespace + stale-key cleanup on every login ──────────────────────────
      // Update sm_user_ns_v1 so lsGet's SID-namespace fallback points to this
      // user, not a previous anonymous/admin-client session's SID.
      try {
        localStorage.setItem("sm_user_ns_v1", backendUsername);
        sessionStorage.setItem("sm_user_ns_v1", backendUsername);
      } catch {}

      // Clear non-namespaced (bare) Facebook selection keys. These can contain
      // values from any previous user/session because lsSet writes to them with
      // alsoLegacy=true. Per-user keys (u:<username>:...) and admin-client
      // keys (u:adminClient:<id>:...) are intentionally NOT removed.
      // The server /api/facebook/selection is the authoritative source on /setup.
      try {
        localStorage.removeItem("smartmark_last_selected_account");
        localStorage.removeItem("smartmark_last_selected_pageId");
        // Clear the shared FB connected flag so it re-verifies from the server on
        // /setup mount. If this user has a valid token the status check re-sets it.
        localStorage.removeItem("smartmark_fb_connected");
      } catch {}

      console.debug("[Login] namespace set", backendUsername);
      // ─────────────────────────────────────────────────────────────────────────

      localStorage.setItem("smartmark_login_username", backendEmail || backendUsername);

      if (backendEmail) {
        const nextMap = { ...readEmailUserMap(), [backendEmail]: backendUsername };
        writeEmailUserMap(nextMap);
        localStorage.setItem("sm_signup_email", backendEmail);
      }

      const billingStatus = await getBillingStatus();
      const alreadyHasAccess = !!billingStatus?.billing?.hasAccess;

      if (alreadyHasAccess) {
        localStorage.removeItem("sm_selected_plan");
        localStorage.removeItem("sm_founder_offer");
        navigate("/setup");
        return;
      }

      if (selectedPlan && PLAN_META[selectedPlan]) {
        localStorage.setItem("sm_selected_plan", selectedPlan);
        const checkoutEmail =
          backendEmail ||
          (looksLikeEmail(cleanIdentifier) ? cleanIdentifier.toLowerCase() : "");
        if (!checkoutEmail) {
          throw new Error("Please use an email-based account to continue to checkout.");
        }
        const checkoutUrl = await createCheckoutSession({ plan: selectedPlan });
        window.location.assign(checkoutUrl);
        return;
      }

      navigate(isGrowthVariant ? "/growth-pricing" : "/setup");
    } catch (error) {
      setErr(error?.message || "Could not log in.");
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", width: "100%", background: BG, fontFamily: FONT, color: TEXT }}>

      {/* Top bar — Smartemark wordmark */}
      <div style={{ padding: "20px 28px" }}>
        <a href={isGrowthVariant ? "/growth" : "/"} style={{ fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: -0.5, textDecoration: "none" }}>
          Smartemark
        </a>
      </div>

      {/* Centered card */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 16px 56px",
          minHeight: "calc(100vh - 64px)",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 420,
            background: "#ffffff",
            border: "1px solid rgba(93,89,234,0.10)",
            borderRadius: 24,
            boxShadow: "0 24px 64px rgba(83,77,212,0.09), 0 4px 16px rgba(0,0,0,0.04)",
            padding: "40px 36px 36px",
          }}
        >
          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ margin: "0 0 8px", fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: TEXT, lineHeight: 1.15 }}>
              Welcome back
            </h1>
            <p style={{ margin: 0, color: TEXT_SOFT, fontSize: 15, lineHeight: 1.5 }}>
              Sign in to your Smartemark account.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <input
              type="text"
              autoComplete="username"
              value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setErr(""); }}
              placeholder="Email or username"
              style={inputStyle}
            />

            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErr(""); }}
              placeholder="Password"
              style={inputStyle}
            />

            {err && (
              <div style={{ color: "#b42318", fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = BTN_HOVER; }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = BTN; }}
              style={{
                width: "100%",
                marginTop: 4,
                padding: "14px",
                borderRadius: 12,
                border: "none",
                background: BTN,
                color: "#ffffff",
                fontSize: 16,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.72 : 1,
                fontFamily: FONT,
                letterSpacing: "-0.01em",
                transition: "background 160ms ease",
              }}
            >
              {loading ? "Logging in…" : "Log in"}
            </button>
          </form>

          {/* Bottom links */}
          <div
            style={{
              marginTop: 20,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <button
              onClick={() => navigate("/signup", { state: { selectedPlan, founder: false } })}
              style={linkBtn}
            >
              Create an account
            </button>
            <button onClick={() => navigate("/forgot-password")} style={linkBtn}>
              Forgot password?
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 10,
  border: "1px solid rgba(93,89,234,0.16)",
  background: "#f8f9ff",
  color: "#101426",
  fontSize: 15,
  fontWeight: 500,
  outline: "none",
  fontFamily: "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif",
  boxSizing: "border-box",
};

const linkBtn = {
  background: "transparent",
  border: "none",
  color: "#5d59ea",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  padding: 0,
  fontFamily: "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif",
};
