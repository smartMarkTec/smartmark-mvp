// src/pages/ResetPassword.js
import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

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

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    return String(params.get("token") || "").trim();
  }, [location.search]);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  if (!token) {
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
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            Invalid or missing reset link.
          </div>
          <button onClick={() => navigate("/forgot-password")} style={linkBtn}>
            Request a new one
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Could not reset password.");
      }

      setDone(true);
    } catch (error) {
      setErr(error?.message || "Could not reset password.");
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
          Reset password
        </div>

        {done ? (
          <div>
            <div
              style={{
                color: TEXT_SOFT,
                fontSize: 16,
                lineHeight: 1.65,
                marginBottom: 24,
              }}
            >
              Your password has been updated. You can now log in with your new
              password.
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
              Go to login
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
              Enter your new password below.
            </div>

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErr("");
                }}
                placeholder="New password"
                style={inputStyle}
              />

              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErr("");
                }}
                placeholder="Confirm new password"
                style={inputStyle}
              />

              {err ? (
                <div
                  style={{ color: "#b42318", fontWeight: 800, fontSize: 14 }}
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
                {loading ? "Resetting..." : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
