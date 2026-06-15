// src/pages/OnboardingConnect.js
import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const FONT     = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BG       = "#f8fafc";
const CARD     = "#ffffff";
const GREEN    = "#16a34a";
const TEXT     = "#111827";
const TEXT_MUT = "#6b7280";
const BORDER   = "#e5e7eb";

const SM_SID_KEY = "sm_sid_v1";
const FB_CONN_KEY = "smartmark_fb_connected";

function ensureStoredSid() {
  try {
    let sid = (localStorage.getItem(SM_SID_KEY) || "").trim();
    if (sid) return sid;
    sid = `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SM_SID_KEY, sid);
    return sid;
  } catch {
    return `sm_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

export default function OnboardingConnect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search || "");
    if (params.get("facebook_connected") === "1") {
      setConnected(true);
      try {
        localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
      } catch {}
    }
  }, [location.search]);

  const handleConnectFacebook = () => {
    const sid = ensureStoredSid();
    const returnTo = `${window.location.origin}/onboarding?facebook_connected=1`;
    window.location.assign(
      `/auth/facebook?sm_sid=${encodeURIComponent(sid)}&return_to=${encodeURIComponent(returnTo)}`
    );
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        fontFamily: FONT,
        color: TEXT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: "40px 32px",
          boxShadow: "0 12px 40px rgba(15,23,42,0.06)",
          textAlign: "center",
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, color: TEXT, letterSpacing: "-0.5px", marginBottom: 24 }}>
          Smartemark
        </div>

        {connected ? (
          <>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#dcfce7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 18px",
              }}
            >
              <span style={{ color: GREEN, fontSize: 26, lineHeight: 1 }}>✓</span>
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
              Facebook connected successfully
            </h1>
            <p style={{ fontSize: 14, color: TEXT_MUT, lineHeight: 1.6, margin: "0 0 28px" }}>
              You can continue to your dashboard.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 10px" }}>
              Your account is almost ready
            </h1>
            <p style={{ fontSize: 14, color: TEXT_MUT, lineHeight: 1.6, margin: "0 0 8px" }}>
              Please connect your Facebook account so we can get your ads set up.
            </p>
            <p style={{ fontSize: 14, color: TEXT_MUT, lineHeight: 1.6, margin: "0 0 28px" }}>
              We'll collect the campaign details from you directly and help you through the setup.
            </p>
          </>
        )}

        <button
          onClick={handleConnectFacebook}
          style={{
            width: "100%",
            padding: "14px 24px",
            borderRadius: 10,
            border: "none",
            background: "#1877F2",
            color: "#ffffff",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: 12,
            fontFamily: FONT,
          }}
        >
          Connect Facebook
        </button>

        <button
          onClick={() => navigate("/setup")}
          style={{
            width: "100%",
            padding: "14px 24px",
            borderRadius: 10,
            border: `1px solid ${BORDER}`,
            background: "#ffffff",
            color: TEXT,
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: FONT,
          }}
        >
          Go to Dashboard
        </button>

        <div style={{ marginTop: 16, fontSize: 12, color: TEXT_MUT, lineHeight: 1.5 }}>
          You can always connect or manage Facebook from your dashboard.
        </div>
      </div>
    </div>
  );
}
