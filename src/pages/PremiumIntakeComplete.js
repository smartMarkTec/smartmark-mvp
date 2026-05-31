/* eslint-disable */
// src/pages/PremiumIntakeComplete.js
import React from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const PURPLE = "#5d59ea";

export default function PremiumIntakeComplete() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f9fc",
        fontFamily: FONT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 480 }}>
        {/* Checkmark icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(16,185,129,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            fontSize: 28,
          }}
        >
          ✓
        </div>

        <div
          style={{
            display: "inline-block",
            background: "rgba(93,89,234,0.08)",
            color: PURPLE,
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 12px",
            borderRadius: 999,
            marginBottom: 16,
            letterSpacing: 0.4,
          }}
        >
          Smartemark Premium
        </div>

        <h1
          style={{
            margin: "0 0 14px",
            fontSize: "1.7rem",
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1.2,
          }}
        >
          We received your setup information.
        </h1>

        <p style={{ margin: "0 0 10px", color: TEXT_SOFT, fontSize: 16, lineHeight: 1.7 }}>
          Thanks — our team will review it and contact you if anything else is needed.
        </p>

        <p style={{ margin: "0 0 32px", color: TEXT_SOFT, fontSize: 15, lineHeight: 1.65 }}>
          In the meantime, connect your Facebook ad account from the Setup section so we
          can access your account when it's time to launch.
        </p>

        <button
          onClick={() => navigate("/setup")}
          style={{
            padding: "13px 32px",
            background: "#111827",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontWeight: 700,
            fontSize: 16,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Continue to Setup
        </button>
      </div>
    </div>
  );
}
