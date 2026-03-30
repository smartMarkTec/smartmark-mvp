/* eslint-disable */
// src/pages/Login.js
import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";

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

  const founder = useMemo(() => {
    const raw =
      location.state?.founder ??
      localStorage.getItem("sm_founder_offer") ??
      "false";

    if (typeof raw === "boolean") return raw;
    const normalized = String(raw).trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }, [location.state]);

  const plan = PLAN_META[selectedPlan] || null;

  const [email, setEmail] = useState(
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

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");

    if (!cleanEmail || !cleanPassword) {
      setErr("Enter your email and password.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setErr("Enter a valid email.");
      return;
    }

    setLoading(true);

    try {
      const loginRes = await authFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanEmail,
          password: cleanPassword,
        }),
      });

      const loginJson = await loginRes.json().catch(() => ({}));

      if (!loginRes.ok || !loginJson?.success) {
        throw new Error(loginJson?.error || "Invalid email or password.");
      }

      localStorage.setItem("sm_current_user", cleanEmail);
      localStorage.setItem("smartmark_login_username", cleanEmail);
      localStorage.setItem("smartmark_login_password", cleanPassword);

      const storedName =
        localStorage.getItem("sm_signup_full_name") ||
        localStorage.getItem("sm_full_name") ||
        "";

      if (selectedPlan && PLAN_META[selectedPlan]) {
        localStorage.setItem("sm_selected_plan", selectedPlan);
        localStorage.setItem("sm_founder_offer", founder ? "true" : "false");

        const checkoutUrl = await createCheckoutSession({
          plan: selectedPlan,
          founder,
          email: cleanEmail,
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
          padding: "34px 32px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <img
            src={smartmarkLogo}
            alt="Smartemark"
            style={{ width: 42, height: 42, borderRadius: 12 }}
          />
          <div style={{ fontSize: 28, fontWeight: 900 }}>Smartemark</div>
        </div>

        <div style={{ marginBottom: 22 }}>
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
            {plan
              ? `Enter your account details to continue with the ${plan.name} plan.`
              : "Enter your Smartemark email and password."}
          </div>
        </div>

        {plan ? (
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 16,
              background: "rgba(93, 89, 234, 0.06)",
              border: "1px solid rgba(93, 89, 234, 0.12)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: PURPLE,
                marginBottom: 6,
              }}
            >
              Selected plan
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 2 }}>
              {plan.name}
            </div>
            <div style={{ fontSize: 15, color: TEXT_SOFT }}>{plan.price}</div>
          </div>
        ) : null}

        <form
          onSubmit={handleLogin}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErr("");
            }}
            placeholder="Email address"
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
            justifyContent: "space-between",
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
                  founder,
                },
              })
            }
            style={linkBtn}
          >
            Need an account? Sign up
          </button>

          <button
            onClick={() => navigate("/")}
            style={linkBtn}
          >
            Back to home
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