import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const DARK_GREEN = "#185431";

const Login = () => {
  const navigate = useNavigate();

  const savedUsername = localStorage.getItem("smartmark_login_username") || "";
  const savedPassword = localStorage.getItem("smartmark_login_password") || "";

  const [username, setUsername] = useState(savedUsername);
  const [password, setPassword] = useState(savedPassword);
  const [error, setError] = useState("");

  useEffect(() => {
    setUsername(savedUsername);
    setPassword(savedPassword);
  }, [savedUsername, savedPassword]);

  const handleLogin = (e) => {
    e.preventDefault();

    if (
      username.trim() === savedUsername.trim() &&
      password.trim() === savedPassword.trim() &&
      username.length > 0 &&
      password.length > 0
    ) {
      setError("");
      navigate("/setup");
    } else {
      setError("Username or email does not match what you signed up with. Please try again.");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #232529 0%, #34373d 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Poppins', 'Times New Roman', Times, serif",
        padding: "1.5rem", // Add padding for mobile
      }}
    >
      {/* Logo */}
      <div
        style={{
          position: "fixed",
          top: 16,
          right: 18,
          zIndex: 99,
        }}
      >
        <SmartMarkLogoButton />
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "fixed",
          top: 16,
          left: 18,
          background: "rgba(52,55,61,0.82)",
          color: "#fff",
          border: "none",
          borderRadius: "1.1rem",
          padding: "0.55rem 1.1rem",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "0.8px",
          cursor: "pointer",
          boxShadow: "0 2px 12px 0 rgba(24,84,49,0.09)",
          zIndex: 20,
          transition: "background 0.18s",
          fontFamily: "'Poppins', 'Times New Roman', Times, serif",
        }}
      >
        ← Back
      </button>

      <form
        onSubmit={handleLogin}
        style={{
          background: "#34373de6",
          padding: "2rem 1.2rem",
          borderRadius: "1.2rem",
          boxShadow: "0 8px 40px 0 rgba(24,84,49,0.12)",
          display: "flex",
          flexDirection: "column",
          width: "100%",
          maxWidth: 350,
          gap: "1.1rem",
        }}
      >
        <h2
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.7rem",
            textAlign: "center",
            marginBottom: "1rem",
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
            padding: "0.9rem",
            borderRadius: "1rem",
            border: "none",
            fontSize: "1rem",
            outline: "none",
            fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            width: "100%",
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
            padding: "0.9rem",
            borderRadius: "1rem",
            border: "none",
            fontSize: "1rem",
            outline: "none",
            fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            width: "100%",
          }}
          autoComplete="email"
        />
        {error && (
          <div
            style={{
              color: "#F87171",
              background: "#232529",
              borderRadius: "0.7rem",
              padding: "0.7rem 0.8rem",
              fontWeight: 600,
              fontSize: "0.97rem",
              textAlign: "center",
              marginTop: "-0.6rem",
              fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            }}
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          style={{
            padding: "0.9rem 0",
            borderRadius: "2rem",
            border: "none",
            background: DARK_GREEN,
            color: "#fff",
            fontWeight: 700,
            fontSize: "1.08rem",
            letterSpacing: "1.1px",
            cursor: "pointer",
            fontFamily: "'Poppins', 'Times New Roman', Times, serif",
            boxShadow: "0 2px 16px 0 rgba(24,84,49,0.16)",
            transition: "background 0.18s",
            marginTop: "0.2rem",
          }}
          onMouseOver={(e) => (e.target.style.background = "#1e6a3e")}
          onMouseOut={(e) => (e.target.style.background = DARK_GREEN)}
        >
          Login
        </button>
      </form>
    </div>
  );
};

export default Login;
