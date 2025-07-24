import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const DARK_GREEN = "#185431";
const BACKEND_URL = "https://smartmark-mvp.onrender.com"; // Set to your deployed backend

// Responsive CSS
const loginStyles = `
  .smartmark-login-bg {
    min-height: 100vh;
    background: linear-gradient(135deg, #232529 0%, #34373d 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: 'Poppins', 'Times New Roman', Times, serif;
  }
  .smartmark-login-form {
    background: #34373de6;
    padding: 2.8rem 2.2rem;
    border-radius: 2.1rem;
    box-shadow: 0 8px 40px 0 rgba(24,84,49,0.12);
    display: flex;
    flex-direction: column;
    min-width: 340px;
    gap: 1.7rem;
    border: none;
  }
  .smartmark-login-logo {
    position: fixed;
    top: 30px;
    right: 36px;
    z-index: 99;
  }
  .smartmark-login-back-btn {
    position: fixed;
    top: 32px;
    left: 72px;
    background: rgba(52,55,61,0.82);
    color: #fff;
    border: none;
    border-radius: 1.1rem;
    padding: 0.65rem 1.6rem;
    font-weight: 700;
    font-size: 1rem;
    letter-spacing: 0.8px;
    cursor: pointer;
    box-shadow: 0 2px 12px 0 rgba(24,84,49,0.09);
    z-index: 20;
    transition: background 0.18s;
    font-family: 'Poppins', 'Times New Roman', Times, serif;
  }
  @media (max-width: 600px) {
    .smartmark-login-form {
      min-width: unset;
      width: 96vw;
      padding: 1.2rem 0.4rem;
      border-radius: 1.1rem;
    }
    .smartmark-login-bg {
      padding: 0 0.5rem;
    }
    .smartmark-login-logo {
      top: 14px;
      right: 10px;
    }
    .smartmark-login-back-btn {
      top: 18px;
      left: 10px;
      font-size: 0.97rem;
      padding: 0.5rem 1.05rem;
    }
  }
`;

const Login = () => {
  const navigate = useNavigate();

  // Improved: Always use the most up-to-date localStorage on mount, not on first render only
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Always check fresh values on mount
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
          password: password.trim()
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Save most recent user login info for autofill
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
          {/* The only addition: sign up prompt */}
          <div style={{ marginBottom: "-1.0rem", fontSize: "0.97rem", color: "#bfc1c4", textAlign: "right", fontWeight: 500 }}>
            Don&apos;t have an account?{" "}
            <span
              style={{ color: "#1ec885", cursor: "pointer", textDecoration: "underline" }}
              onClick={() => navigate("/form")}
              tabIndex={0}
              role="button"
            >
              Click here
            </span>
          </div>
          <h2
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "2.1rem",
              textAlign: "center",
              marginBottom: "1.4rem",
              letterSpacing: "-0.5px",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            }}
          >
            Login
          </h2>
          <input
            type="text"
            name="username"
            placeholder="CashApp Username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError("");
            }}
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
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
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
            onMouseOver={(e) => {
              if (!loading) e.target.style.background = "#1e6a3e";
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.background = DARK_GREEN;
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </>
  );
};

export default Login;
