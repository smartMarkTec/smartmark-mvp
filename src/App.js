import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";

function NotFound() {
  return (
    <div style={{ color: "#fff", background: "#232529", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <h1>404 - Page Not Found</h1>
      <a href="/" style={{ color: "#1ec885", marginTop: 20, fontWeight: 700 }}>Go to Home</a>
    </div>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/form" element={<FormPage />} />
        <Route path="/setup" element={<CampaignSetup />} />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />   {/* CATCH-ALL */}
      </Routes>
    </Router>
  );
}

export default App;
