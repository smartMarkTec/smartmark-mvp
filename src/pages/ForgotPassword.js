// src/pages/ForgotPassword.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(180deg, #bcc3fb 0%, #d6dbff 38%, #ecefff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#66708b";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.92)";
const SHADOW = "0 18px 46px rgba(83, 77, 212, 0.12)";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER = "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";

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
  boxSizing: "border-box",
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

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    const cleanEmail = String(email || "").trim().toLowerCase();
    if (!cleanEmail || !/\S+@\S+\.\S+/.test(cleanEmail)) {
      setErr("Enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: cleanEmail }),
      });
      // Always show success — prevents enumeration on the frontend too.
      setSent(true);
    } catch {
      setSent(true); // still show success on network error
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
          maxWidth: 480,
          background: PANEL,
          border: `1px solid ${BORDER}`,
          borderRadius: 28,
          boxShadow: SHADOW,
          padding: "28px 32px 38px",
        }}
      >
        <div style={{ marginBottom: 18 }}>
          <button onClick={() => navigate("/login")} style={linkBtn}>
            Back to login
          </button>
        </div>

        <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 8 }}>
          Smartemark
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 900,
            lineHeight: 1.05,
            marginBottom: 10,
          }}
        >
          Forgot password
        </div>

        {sent ? (
          <div>
            <div
              style={{
                color: TEXT_SOFT,
                fontSize: 16,
                lineHeight: 1.65,
                marginBottom: 24,
              }}
            >
              If an account exists for that email, a reset link has been sent.
              Check your inbox (and spam folder).
            </div>
            <button
              onClick={() => navigate("/login")}
              style={{
                width: "100%",
                padding: "1rem 1.1rem",
                borderRadius: 14,
                border: "none",
                background: BTN,
                color: "#ffffff",
                fontSize: 16,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Back to login
            </button>
          </div>
        ) : (
          <>
            <div
              style={{
                color: TEXT_SOFT,
                fontSize: 16,
                lineHeight: 1.65,
                marginBottom: 24,
              }}
            >
              Enter your account email and we'll send you a reset link.
            </div>

            <form
              onSubmit={handleSubmit}
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

              {err ? (
                <div style={{ color: "#b42318", fontWeight: 800, fontSize: 14 }}>
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
                {loading ? "Sending..." : "Send reset link"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
