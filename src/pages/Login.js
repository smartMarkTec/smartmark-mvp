import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const DARK_GREEN = "#185431";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";

// Responsive CSS as before...
const loginStyles = ` ...same as you had above... `; // Keep your CSS here

const Login = () => {
  const navigate = useNavigate();

  // Local storage for "username" and "password"
  const [username, setUsername] = useState(localStorage.getItem("smartmark_login_username") || "");
  const [password, setPassword] = useState(localStorage.getItem("smartmark_login_password") || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setUsername(localStorage.getItem("smartmark_login_username") || "");
    setPassword(localStorage.getItem("smartmark_login_password") || "");
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BACKEND_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(), // MVP: password is just email
        }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("smartmark_login_username", username.trim());
        localStorage.setItem("smartmark_login_password", password.trim());
        localStorage.setItem("smartmark_last_email", password.trim());
        localStorage.setItem("smartmark_last_cashapp", username.trim());
        setError("");
        setLoading(false);
        navigate("/setup");
      } else {
        setError(data.error || "Login failed. Please check your details.");
        setLoading(false);
      }
    } catch (err) {
      setError("Server error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <>
      <style>{loginStyles}</style>
      <div className="smartmark-login-bg">
        <div className="smartmark-login-logo">
          <SmartMarkLogoButton />
        </div>
        {/* Back Button */}
        <button
          onClick={() => navigate("/")}
          className="smartmark-login-back-btn"
        >
          ← Back
        </button>
        <form
          onSubmit={handleLogin}
          className="smartmark-login-form"
        >
          <h2 style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "2.1rem",
            textAlign: "center",
            marginBottom: "1.4rem",
            letterSpacing: "-0.5px",
            fontFamily: "'Poppins', 'Times New Roman', Times, serif",
          }}>
            Login
          </h2>
          <input
            type="text"
            name="username"
            placeholder="CashApp Username"
            value={username}
            onChange={(e) => { setUsername(e.target.value); setError(""); }}
            required
            style={{
              padding: "1.1rem",
              borderRadius: "1.2rem",
              border: "none",
              fontSize: "1.15rem",
              outline: "none",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            }}
            autoComplete="username"
          />
          <input
            type="email"
            name="password"
            placeholder="Email Address"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(""); }}
            required
            style={{
              padding: "1.1rem",
              borderRadius: "1.2rem",
              border: "none",
              fontSize: "1.15rem",
              outline: "none",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            }}
            autoComplete="email"
          />
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
                fontFamily: "'Poppins', 'Times New Roman', Times, serif",
              }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "1.08rem 0",
              borderRadius: "2.2rem",
              border: "none",
              background: DARK_GREEN,
              color: "#fff",
              fontWeight: 700,
              fontSize: "1.21rem",
              letterSpacing: "1.2px",
              cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
              boxShadow: "0 2px 16px 0 rgba(24,84,49,0.16)",
              transition: "background 0.18s",
              marginTop: "0.6rem",
              opacity: loading ? 0.7 : 1,
            }}
            onMouseOver={(e) => { if (!loading) e.target.style.background = "#1e6a3e"; }}
            onMouseOut={(e) => { if (!loading) e.target.style.background = DARK_GREEN; }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </>
  );
};

export default Login;
