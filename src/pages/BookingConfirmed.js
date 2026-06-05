import React, { useEffect } from "react";
import { trackSchedule } from "../utils/metaPixel";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

export default function BookingConfirmed() {
  useEffect(() => {
    trackSchedule();
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f9fafb",
        fontFamily: FONT,
      }}
    >
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: "48px 40px",
          maxWidth: 420,
          textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}
      >
        <div style={{ fontSize: 36, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 10px" }}>
          Your demo is booked.
        </h1>
        <p style={{ fontSize: 14, color: "#6b7280", margin: 0, lineHeight: 1.6 }}>
          You'll receive a calendar invite shortly. We look forward to showing you Smartemark.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            marginTop: 28,
            padding: "10px 24px",
            background: "#5d59ea",
            color: "#fff",
            borderRadius: 8,
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Back to Home
        </a>
      </div>
    </div>
  );
}
