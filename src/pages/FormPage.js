import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const DARK_GREEN = "#185431";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";

const DEFAULT_AUDIENCE = {
  location: "US",
  ageRange: "18-65",
  interests: "Business, Restaurants"
};

const validateFields = (fields) => {
  if (!fields.businessName) return "Business name is required.";
  if (!fields.email || !fields.email.includes("@")) return "Valid email required.";
  if (!fields.cashapp) return "CashApp Username required.";
  if (!fields.url || !/^https?:\/\/.+\..+/.test(fields.url)) return "Valid website URL required.";
  return "";
};

const FormPage = () => {
  const navigate = useNavigate();
  const [fields, setFields] = useState({
    businessName: "",
    email: "",
    cashapp: "",
    url: "",
    campaignType: "Website Traffic"
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // AI audience detection
  const [aiAudience, setAiAudience] = useState(null);
  const [audienceProgress, setAudienceProgress] = useState([]);
  const [audienceLoading, setAudienceLoading] = useState(false);

  // Prefill from last session
  useEffect(() => {
    const lastEmail = localStorage.getItem("smartmark_last_email") || "";
    const lastCashapp = localStorage.getItem("smartmark_last_cashapp") || "";
    if (lastEmail && lastCashapp) {
      setFields((prev) => ({
        ...prev,
        email: lastEmail,
        cashapp: lastCashapp
      }));
    }
  }, []);

  const handleChange = (e) => {
    setFields({ ...fields, [e.target.name]: e.target.value });
    setError("");
    // Reset audience if editing url
    if (e.target.name === "url") {
      setAiAudience(null);
      setAudienceProgress([]);
    }
  };

  // AI audience fetch
  const detectAudience = async (websiteUrl) => {
    if (!websiteUrl || websiteUrl.length < 7) return;
    setAudienceLoading(true);
    setAiAudience(null);
    setAudienceProgress(["AI searching..."]);
    try {
      const res = await fetch(`${BACKEND_URL}/api/detect-audience`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl })
      });
      const data = await res.json();

      if (!data.audience) {
        setAudienceProgress(["Could not detect audience. Using default targeting."]);
        setAiAudience(DEFAULT_AUDIENCE);
        setAudienceLoading(false);
        return;
      }

      let parsed;
      if (typeof data.audience === "object") {
        parsed = data.audience;
      } else {
        try {
          parsed = JSON.parse(data.audience);
        } catch {
          setAudienceProgress([
            typeof data.audience === "string"
              ? data.audience
              : JSON.stringify(data.audience)
          ]);
          setAiAudience(DEFAULT_AUDIENCE);
          setAudienceLoading(false);
          return;
        }
      }

      // Defensive fallback: Must include all keys, no empties/nulls!
      const safeAudience = {
        location: parsed.location || "US",
        ageRange: /^\d{2}-\d{2}$/.test(parsed.ageRange || "") ? parsed.ageRange : "18-65",
        interests: parsed.interests && parsed.interests.length > 0
          ? parsed.interests
          : "Business, Restaurants"
      };
      setAiAudience(safeAudience);

      // Animate progress
      const steps = [
        `Brand name found: ${parsed.brandName || "N/A"}`,
        `Demographic found: ${parsed.demographic || "N/A"}`,
        `Age range found: ${safeAudience.ageRange}`,
        `Location found: ${safeAudience.location}`,
        `Interests found: ${safeAudience.interests}`,
        "AI finished!"
      ];
      setAudienceProgress(["AI searching..."]);
      let idx = 0;
      const interval = setInterval(() => {
        setAudienceProgress((prev) => [...prev, steps[idx]]);
        idx++;
        if (idx >= steps.length) clearInterval(interval);
      }, 800);
    } catch {
      setAudienceProgress(["Could not detect audience. Using default targeting."]);
      setAiAudience(DEFAULT_AUDIENCE);
    }
    setAudienceLoading(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Validate
    const errMsg = validateFields(fields);
    if (errMsg) {
      setError(errMsg);
      setLoading(false);
      return;
    }

    try {
      // Register user
      const signupRes = await fetch(`${BACKEND_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fields.cashapp,
          email: fields.email,
          cashtag: fields.cashapp,
          password: fields.email // MVP: password is email
        })
      });
      const signupData = await signupRes.json();
      if (!signupData.success && !String(signupData.error).includes("exists")) {
        setError(signupData.error || "Signup failed.");
        setLoading(false);
        return;
      }

      // Save campaign for this user
      const aiToSave = aiAudience
        ? JSON.stringify(aiAudience)
        : JSON.stringify(DEFAULT_AUDIENCE);

      const saveRes = await fetch(`${BACKEND_URL}/api/save-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: fields.cashapp,
          campaign: {
            ...fields,
            aiAudience: aiToSave,
            createdAt: new Date().toISOString()
          }
        })
      });
      const saveData = await saveRes.json();
      if (saveData.status !== "ok") {
        setError("Failed to save campaign.");
        setLoading(false);
        return;
      }

      // Store credentials for autologin
      localStorage.setItem("smartmark_login_username", fields.cashapp);
      localStorage.setItem("smartmark_login_password", fields.email);
      localStorage.setItem("smartmark_last_email", fields.email);
      localStorage.setItem("smartmark_last_cashapp", fields.cashapp);
      // Save latest fields for pre-filling on next step
      localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify(fields));
      localStorage.setItem("smartmark_last_ai_audience", aiToSave);

      setLoading(false);
      navigate("/setup");
    } catch (err) {
      setError("Server error. Please try again.");
      setLoading(false);
    }
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
      <div
        style={{
          position: "fixed",
          top: 30,
          right: 36,
          zIndex: 99
        }}
      >
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
          gap: "1.7rem"
        }}
        onSubmit={handleSubmit}
        autoComplete="off"
      >
        <h2
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "2.1rem",
            textAlign: "center",
            marginBottom: "1.4rem",
            letterSpacing: "-0.5px",
            fontFamily: MODERN_FONT
          }}
        >
          Start Your Campaign
        </h2>
        {/* Login Link Above First Field */}
        <div style={{
          fontSize: "0.89rem",
          color: "#e2e2e2",
          marginBottom: "0.23rem",
          marginLeft: "0.18rem"
        }}>
          already have an account?{" "}
          <span
            style={{
              color: "#33bbff",
              textDecoration: "underline",
              cursor: "pointer",
              fontWeight: 600
            }}
            onClick={() => navigate("/login")}
          >
            Login here 
          </span>
        </div>
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
            fontFamily: MODERN_FONT
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
            fontFamily: MODERN_FONT
          }}
        />
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
            fontFamily: MODERN_FONT
          }}
        />
        <input
          type="url"
          name="url"
          placeholder="Your Website URL"
          value={fields.url}
          onChange={handleChange}
          onBlur={(e) => {
            if (e.target.value && e.target.value.length > 7) {
              detectAudience(e.target.value);
            }
          }}
          required
          style={{
            padding: "1.1rem",
            borderRadius: "1.2rem",
            border: "none",
            fontSize: "1.15rem",
            outline: "none",
            fontFamily: MODERN_FONT
          }}
        />
        {/* AI Audience detection display */}
        {audienceProgress.length > 0 && (
          <div
            style={{
              background: "#222c22",
              color: "#e0ffe7",
              fontWeight: 600,
              borderRadius: "1rem",
              padding: "1rem",
              marginBottom: "0.8rem",
              fontFamily: MODERN_FONT,
              fontSize: "1.01rem"
            }}
          >
            <div style={{ marginBottom: 6 }}>
              <span role="img" aria-label="AI">🤖</span>{" "}
              <b>AI Progress:</b>
            </div>
            <div>
              {audienceProgress.map((line, i) => (
                <div key={i}>
                  {typeof line === "string"
                    ? line
                    : JSON.stringify(line)}
                </div>
              ))}
            </div>
          </div>
        )}
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
            marginBottom: "0.2rem"
          }}
        >
          <option value="Website Traffic">Website Traffic</option>
        </select>
        {error && (
          <div
            style={{
              color: "#F87171",
              background: "#232529",
              borderRadius: "0.7rem",
              padding: "0.8rem 0.8rem",
              fontWeight: 600,
              fontSize: "1.01rem",
              textAlign: "center",
              marginTop: "-0.8rem",
              fontFamily: MODERN_FONT
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "1.1rem 0",
            borderRadius: "2.2rem",
            border: "none",
            background: DARK_GREEN,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.22rem",
            letterSpacing: "1.2px",
            cursor: loading ? "not-allowed" : "pointer",
            marginTop: "0.5rem",
            fontFamily: MODERN_FONT,
            boxShadow: "0 2px 16px 0 rgba(24,84,49,0.16)",
            transition: "background 0.18s",
            opacity: loading ? 0.7 : 1
          }}
          onMouseOver={e => {
            if (!loading) e.target.style.background = "#1e6a3e";
          }}
          onMouseOut={e => {
            if (!loading) e.target.style.background = DARK_GREEN;
          }}
        >
          {loading ? "Submitting..." : "Continue Setup"}
        </button>
      </form>
    </div>
  );
};

export default FormPage;
