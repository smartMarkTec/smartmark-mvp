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
    gap: 1.4rem;
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
  .smartmark-create-btn {
    display: inline-block;
    margin: 0 auto -0.2rem auto;
    background: #1ec885;
    color: #0f1418;
    border: none;
    border-radius: 999px;
    font-weight: 900;
    font-size: 1rem;
    padding: 0.6rem 1.2rem;
    cursor: pointer;
    box-shadow: 0 6px 18px rgba(30,200,133,0.28);
  }
  .smartmark-create-btn:focus { outline: 3px solid rgba(30,200,133,0.35); }
  @media (max-width: 600px) {
    .smartmark-login-form {
      min-width: unset;
      width: 96vw;
      padding: 1.2rem 0.8rem 1.6rem;
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

  // Always hydrate from latest localStorage on mount
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState(""); // Email is used server-side; keeping naming to avoid changing your backend contract
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
        credentials: "include", // ensure session cookie is set for multi-user separation
        body: JSON.stringify({
          username: username.trim(),
          password: password.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Persist last-used creds for autofill
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
        <button onClick={() => navigate("/")} className="smartmark-login-back-btn">
          ← Back
        </button>

        <form onSubmit={handleLogin} className="smartmark-login-form">
          {/* Centered “Create a campaign” */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              className="smartmark-create-btn"
              onClick={() => navigate("/form")}
            >
              Create a campaign
            </button>
          </div>

          <h2
            style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "2.1rem",
              textAlign: "center",
              marginBottom: "0.6rem",
              letterSpacing: "-0.5px",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            }}
          >
            Login
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
            <label style={{ color: "#dfe5e8", fontWeight: 700, fontSize: "0.95rem" }}>
              Username
            </label>
            <input
              type="text"
              name="username"
              placeholder="Username"
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

            <label style={{ color: "#dfe5e8", fontWeight: 700, fontSize: "0.95rem" }}>
              Email
            </label>
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
          </div>

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
                marginTop: "0.2rem",
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
