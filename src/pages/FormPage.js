// src/pages/FormPage.js
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const DARK_GREEN = "#185431";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";

const getUserKey = (email, cashapp) =>
  `smartmark_user_${(email || "").trim().toLowerCase()}_${(cashapp || "").trim().toLowerCase()}`;

const FormPage = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    businessName: "",
    email: "",
    cashapp: "",
    url: "",
    campaignType: "Website Traffic"
  });

  // Pre-populate fields if the user already has data
  useEffect(() => {
    const lastEmail = localStorage.getItem("smartmark_last_email") || "";
    const lastCashapp = localStorage.getItem("smartmark_last_cashapp") || "";
    if (lastEmail && lastCashapp) {
      const saved = localStorage.getItem(getUserKey(lastEmail, lastCashapp));
      if (saved) setFields(JSON.parse(saved));
    }
  }, []);

  const handleSubmit = e => {
    e.preventDefault();
    const userKey = getUserKey(fields.email, fields.cashapp);

    // Save form under user-specific key
    localStorage.setItem(userKey, JSON.stringify(fields));
    localStorage.setItem("smartmark_last_email", fields.email);
    localStorage.setItem("smartmark_last_cashapp", fields.cashapp);
    localStorage.setItem("smartmark_current_user", userKey);

    navigate("/setup");
  };

  const handleChange = e => {
    setFields({ ...fields, [e.target.name]: e.target.value });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: "linear-gradient(135deg, #2b2e32 0%, #383c40 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: MODERN_FONT,
        position: "relative"
      }}
    >
      {/* Logo top right */}
      <div style={{
        position: "fixed",
        top: 30,
        right: 36,
        zIndex: 99
      }}>
        <SmartMarkLogoButton />
      </div>

      <form
        style={{
          background: "#34373de6",
          padding: "2.8rem 2.2rem",
          borderRadius: "2.1rem",
          boxShadow: "0 8px 40px 0 rgba(24,84,49,0.12)",
          display: "flex",
          flexDirection: "column",
          minWidth: 400,
          gap: "1.7rem",
        }}
        onSubmit={handleSubmit}
      >
        <h2
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "2.1rem",
            textAlign: "center",
            marginBottom: "1.4rem",
            letterSpacing: "-0.5px",
            fontFamily: MODERN_FONT,
          }}
        >
          Start Your Campaign
        </h2>
        <input
          type="text"
          name="businessName"
          placeholder="Business Name"
          value={fields.businessName}
          onChange={handleChange}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT,
          }}
        />
        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={fields.email}
          onChange={handleChange}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT,
          }}
        />
        <input
          type="text"
          name="cashapp"
          placeholder="CashApp Username"
          value={fields.cashapp}
          onChange={handleChange}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT,
          }}
        />
        <input
          type="url"
          name="url"
          placeholder="Your Website URL"
          value={fields.url}
          onChange={handleChange}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT,
          }}
        />
        <select
          name="campaignType"
          value={fields.campaignType}
          onChange={handleChange}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT,
            background: "#fff",
            color: "#2b2e32",
            fontWeight: 600,
            marginBottom: "0.2rem",
          }}
        >
          <option value="Website Traffic">Website Traffic</option>
        </select>
        <button
          type="submit"
          style={{
            padding: "1.1rem 0",
            borderRadius: "2.2rem",
            border: "none",
            background: DARK_GREEN,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.22rem",
            letterSpacing: "1.2px",
            cursor: "pointer",
            marginTop: "0.5rem",
            fontFamily: MODERN_FONT,
            boxShadow: "0 2px 16px 0 rgba(24,84,49,0.16)",
            transition: "background 0.18s",
          }}
          onMouseOver={e => (e.target.style.background = "#1e6a3e")}
          onMouseOut={e => (e.target.style.background = DARK_GREEN)}
        >
          Continue Setup
        </button>
      </form>
    </div>
  );
};

export default FormPage;
