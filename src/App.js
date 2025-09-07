// src/App.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";
import Confirmation from "./pages/Confirmation";

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
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<FormPage />} />
      <Route path="/setup" element={<CampaignSetup />} /> {/* no auth guard */}
      <Route path="/login" element={<Login />} />
      <Route path="/confirmation" element={<Confirmation />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
