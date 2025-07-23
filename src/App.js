import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import FormPage from "./pages/FormPage";
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";

// You can expand with a NotFound page if you wish
// import NotFound from "./pages/NotFound";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/form" element={<FormPage />} />
        <Route path="/setup" element={<CampaignSetup />} />
        <Route path="/login" element={<Login />} />
        {/* 
        <Route path="*" element={<NotFound />} /> 
        */}
      </Routes>
    </Router>
  );
}

export default App;
