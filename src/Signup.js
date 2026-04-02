import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import smartmarkLogo from "./assets/smartmark-logo.svg";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(180deg, #bcc3fb 0%, #d6dbff 38%, #ecefff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#66708b";
const PURPLE = "#5d59ea";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.90)";
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

const Signup = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const selectedPlan = useMemo(
    () =>
      String(
        location.state?.selectedPlan ||
          localStorage.getItem("sm_selected_plan") ||
          "starter"
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

  const plan = PLAN_META[selectedPlan] || PLAN_META.starter;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanName = String(fullName || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "");
    const cleanConfirm = String(confirmPassword || "");

    if (!cleanName || !cleanEmail || !cleanPassword || !cleanConfirm) {
      setErr("Fill out all fields.");
      return;
    }

    if (!/\S+@\S+\.\S+/.test(cleanEmail)) {
      setErr("Enter a valid email.");
      return;
    }

    if (cleanPassword.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    if (cleanPassword !== cleanConfirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const registerRes = await authFetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: cleanEmail,
          email: cleanEmail,
          password: cleanPassword,
          fullName: cleanName,
          name: cleanName,
        }),
      });

      const registerJson = await registerRes.json().catch(() => ({}));

      if (!registerRes.ok && !registerJson?.success) {
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
          throw new Error(
            registerJson?.error ||
              loginJson?.error ||
              "Could not create account."
          );
        }
      }

      localStorage.setItem("sm_current_user", cleanEmail);
      localStorage.setItem("smartmark_login_username", cleanEmail);
      localStorage.setItem("smartmark_login_password", cleanPassword);
      localStorage.setItem("sm_signup_full_name", cleanName);
      localStorage.setItem("sm_signup_email", cleanEmail);
      localStorage.setItem("sm_selected_plan", selectedPlan);
      localStorage.setItem("sm_founder_offer", founder ? "true" : "false");

      const checkoutUrl = await createCheckoutSession({
        plan: selectedPlan,
        founder,
        email: cleanEmail,
        fullName: cleanName,
      });

      window.location.assign(checkoutUrl);
    } catch (error) {
      setErr(error?.message || "Could not create account.");
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
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 28,
          boxShadow: SHADOW,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "linear-gradient(180deg, #2d2d8f 0%, #3133a6 100%)",
            color: "#ffffff",
            padding: "34px 28px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minHeight: 720,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <img
              src={smartmarkLogo}
              alt="Smartemark"
              style={{ width: 42, height: 42, borderRadius: 12 }}
            />
            <div style={{ fontSize: 28, fontWeight: 900 }}>Smartemark</div>
          </div>

          <div>
            <div
              style={{
                fontSize: 44,
                lineHeight: 1.05,
                fontWeight: 900,
                marginBottom: 14,
              }}
            >
              Create your account
            </div>
            <div
              style={{
                color: "rgba(255,255,255,0.86)",
                fontSize: 18,
                lineHeight: 1.7,
                maxWidth: 420,
              }}
            >
              Set up your Smartemark account, then continue to secure billing.
            </div>
          </div>

          <div
            style={{
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 900,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: "rgba(255,255,255,0.72)",
                marginBottom: 8,
              }}
            >
              Selected plan
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 4 }}>
              {plan.name}
            </div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.86)" }}>
              {plan.price}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "42px 40px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginBottom: 26,
            }}
          >
            <button
              onClick={() =>
                navigate("/login", {
                  state: {
                    selectedPlan,
                    founder,
                  },
                })
              }
              style={{
                background: "transparent",
                border: "none",
                color: PURPLE,
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Already have an account? Log in
            </button>
          </div>

          <div style={{ fontSize: 42, fontWeight: 900, marginBottom: 10 }}>
            Start your account
          </div>
          <div
            style={{
              color: TEXT_SOFT,
              fontSize: 16,
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            Create your Smartemark login, then continue to payment.
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Full name"
              style={inputStyle}
            />

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              style={inputStyle}
            />

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create password"
              style={inputStyle}
            />

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
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
                marginTop: 8,
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
              {loading ? "Continuing..." : "Create Account & Continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

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

export default Signup;