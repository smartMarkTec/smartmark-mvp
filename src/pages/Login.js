/* eslint-disable */
// src/pages/Login.js
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(180deg, #bcc3fb 0%, #d6dbff 38%, #ecefff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#66708b";
const PURPLE = "#5d59ea";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.92)";
const SHADOW = "0 18px 46px rgba(83, 77, 212, 0.12)";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER =
  "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";

const PLAN_META = {
  starter: { name: "Starter", price: "$99/mo" },
  pro: { name: "Pro", price: "$149/mo" },
  operator: { name: "Operator", price: "$249/mo" },
};

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

async function authFetch(path, opts = {}) {
  const sid = ensureStoredSid();
  const headers = { ...(opts.headers || {}), "x-sm-sid": sid };
  const rel = String(path || "").startsWith("/") ? String(path) : `/${path}`;

  const doFetch = (base) =>
    fetch(`${base}${rel}`, {
      ...opts,
      headers,
      credentials: "include",
    });

  let res = await doFetch("/auth");
  if (res.status === 404) {
    res = await doFetch("/api/auth");
  }
  return res;
}

async function createCheckoutSession({ plan, founder = false, email, fullName }) {
  const res = await fetch("/api/stripe/create-checkout-session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sm-sid": ensureStoredSid(),
    },
    credentials: "include",
    body: JSON.stringify({
      plan,
      founder,
      email,
      username: email,
      fullName,
    }),
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
  try {
    return JSON.parse(localStorage.getItem("sm_email_user_map_v1") || "{}");
  } catch {
    return {};
  }
}

function writeEmailUserMap(map) {
  try {
    localStorage.setItem("sm_email_user_map_v1", JSON.stringify(map || {}));
  } catch {}
}

async function getBillingStatus() {
  const res = await fetch("/api/stripe/billing-status", {
    method: "GET",
    headers: {
      "x-sm-sid": ensureStoredSid(),
    },
    credentials: "include",
  });

  const json = await res.json().catch(() => ({}));

  if (!res.ok) return { ok: false, billing: null, user: null };
  return json;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedPlan = useMemo(
    () =>
      String(
        location.state?.selectedPlan ||
          localStorage.getItem("sm_selected_plan") ||
          ""
      )
        .trim()
        .toLowerCase(),
    [location.state]
  );

  const founder = false;
  const [identifier, setIdentifier] = useState(
    localStorage.getItem("smartmark_login_username") ||
      localStorage.getItem("sm_signup_email") ||
      ""
  );
  const [password, setPassword] = useState(
    localStorage.getItem("smartmark_login_password") || ""
  );
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanIdentifier = normalizeIdentifier(identifier);
    const cleanPassword = String(password || "");

    if (!cleanIdentifier || !cleanPassword) {
      setErr("Enter your email or username and password.");
      return;
    }

    setLoading(true);

    try {
      const storedEmail = String(
        localStorage.getItem("sm_signup_email") || ""
      ).trim().toLowerCase();

      const emailUserMap = readEmailUserMap();

      const candidates = [
        cleanIdentifier,
        cleanIdentifier.toLowerCase(),
        looksLikeEmail(cleanIdentifier)
          ? String(emailUserMap[cleanIdentifier.toLowerCase()] || "").trim()
          : "",
        looksLikeEmail(cleanIdentifier)
          ? cleanIdentifier.toLowerCase()
          : "",
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
          body: JSON.stringify({
            username: candidate,
            password: cleanPassword,
          }),
        });

        const json = await loginRes.json().catch(() => ({}));

        if (loginRes.ok && json?.success) {
          loginJson = json;
          matchedIdentifier = candidate;
          break;
        }
      }

      if (!loginJson?.success) {
        throw new Error("Invalid login credentials.");
      }

      const backendUsername = normalizeIdentifier(
        loginJson?.user?.username || matchedIdentifier || cleanIdentifier
      );
      const backendEmail = String(
        loginJson?.user?.email || cleanIdentifier || ""
      ).trim().toLowerCase();

      localStorage.setItem("sm_current_user", backendUsername);
      localStorage.setItem("smartmark_login_username", backendEmail || backendUsername);
      localStorage.setItem("smartmark_login_password", cleanPassword);

      if (backendEmail) {
        const nextMap = {
          ...readEmailUserMap(),
          [backendEmail]: backendUsername,
        };
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

        const storedName =
          localStorage.getItem("sm_signup_full_name") ||
          localStorage.getItem("sm_full_name") ||
          "";

        const checkoutUrl = await createCheckoutSession({
          plan: selectedPlan,
          founder: false,
          email: checkoutEmail,
          fullName: storedName,
        });

        window.location.assign(checkoutUrl);
        return;
      }

      navigate("/setup");
    } catch (error) {
      setErr(error?.message || "Could not log in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: BG,
        color: TEXT,
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 28,
          boxShadow: SHADOW,
          padding: "22px 32px 38px",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <button onClick={() => navigate("/")} style={linkBtn}>
            Home
          </button>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 900,
              marginBottom: 16,
              letterSpacing: "-0.02em",
            }}
          >
            Smartemark
          </div>

          <div
            style={{
              fontSize: 42,
              lineHeight: 1.05,
              fontWeight: 900,
              marginBottom: 10,
            }}
          >
            Log in
          </div>

          <div
            style={{
              color: TEXT_SOFT,
              fontSize: 16,
              lineHeight: 1.65,
            }}
          >
                        Enter your Smartemark email or username and password.
          </div>
        </div>

        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input
            type="text"
            autoComplete="username"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setErr("");
            }}
            placeholder="Email or username"
            style={inputStyle}
          />

          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErr("");
            }}
            placeholder="Password"
            style={inputStyle}
          />

          {err ? (
            <div
              style={{
                color: "#b42318",
                fontWeight: 800,
                fontSize: 14,
              }}
            >
              {err}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "1rem 1.1rem",
              borderRadius: 14,
              border: "none",
              background: BTN,
              color: "#ffffff",
              fontSize: 16,
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.background = BTN_HOVER;
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.background = BTN;
            }}
          >
            {loading ? "Logging In..." : "Log In"}
          </button>
        </form>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "flex-start",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            onClick={() =>
              navigate("/signup", {
                state: {
                  selectedPlan,
                  founder: false,
                },
              })
            }
            style={linkBtn}
          >
            Need an account? Sign up
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "1rem 1rem",
  borderRadius: 14,
  border: "1px solid rgba(93, 89, 234, 0.16)",
  background: "#f7f8fe",
  color: "#101426",
  fontSize: 16,
  fontWeight: 600,
  outline: "none",
};

const linkBtn = {
  background: "transparent",
  border: "none",
  color: "#5d59ea",
  fontWeight: 800,
  fontSize: 15,
  cursor: "pointer",
  padding: 0,
};