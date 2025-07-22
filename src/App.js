import React from "react";
import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";

function App() {
  return (
    <div className="min-h-screen bg-white text-black flex justify-center items-start p-2 sm:p-4">
      <div className="w-full max-w-md">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/form" element={<FormPage />} />
          <Route path="/setup" element={<CampaignSetup />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
