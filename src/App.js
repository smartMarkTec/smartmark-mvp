// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";
import Confirmation from "./pages/Confirmation";
import PrivacyPolicy from "./pages/PrivacyPolicy";

/**
 * NOTE:
 * Auth guard has been DISABLED intentionally so you can
 * navigate directly to /setup (and other pages) without being
 * redirected to /login during development.
 *
 * Login still works and hits your backend normally.
 * When you're ready to re-enable protection, you can wrap the
 * routes you want with a guard again.
 */

function NotFound() {
  return (
    <div
      style={{
        color: "#fff",
        background: "#232529",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1>404 - Page Not Found</h1>
      <a href="/" style={{ color: "#1ec885", marginTop: 20, fontWeight: 700 }}>
        Go to Home
      </a>
    </div>
  );
}

function App() {
  const location = useLocation();

  // ✅ GA4 SPA pageview tracking
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.gtag) return;

    window.gtag("config", "G-XP146JNFE7", {
      page_path: location.pathname + location.search,
    });
  }, [location]);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<FormPage />} />
      <Route path="/setup" element={<CampaignSetup />} /> {/* no auth guard */}
      <Route path="/login" element={<Login />} />
      <Route path="/confirmation" element={<Confirmation />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
