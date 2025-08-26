// src/App.js
import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";
import Confirmation from "./pages/Confirmation";

function NotFound() {
  return (
    <div style={{
      color: "#fff",
      background: "#232529",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <h1>404 - Page Not Found</h1>
      <a href="/" style={{ color: "#1ec885", marginTop: 20, fontWeight: 700 }}>Go to Home</a>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<FormPage />} />
      <Route path="/setup" element={<CampaignSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/confirmation" element={<Confirmation />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
