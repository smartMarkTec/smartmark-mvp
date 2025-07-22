import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login"; // <--- ADD THIS LINE

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/form" element={<FormPage />} />
      <Route path="/setup" element={<CampaignSetup />} />
      <Route path="/login" element={<Login />} /> {/* <--- ADD THIS LINE */}
    </Routes>
  );
}

export default App;
