// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";
import Signup from "./Signup";
import Confirmation from "./pages/Confirmation";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

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
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/form" element={<FormPage />} />
      <Route path="/setup" element={<CampaignSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/confirmation" element={<Confirmation />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;