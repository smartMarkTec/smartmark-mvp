import React, { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const DARK_GREEN = "#185431";
const DARK_GREEN_HOVER = "#1e6a3e";
const LIGHTER_BG = "#232529";

const processSteps = [
  { icon: "🎯", title: "Set campaign objective" },
  { icon: "📝", title: "AI generates ad copy and images" },
  { icon: "✅", title: "Review and approve" },
  { icon: "🚀", title: "Launch" },
];

const faqList = [
  {
    question: "How much does each campaign cost?",
    answer: "Each campaign has a simple $45 setup fee plus 10% of your ad spend. No hidden fees. You pay only when you launch a campaign.",
  },
  {
    question: "Do I need any ad experience or an agency?",
    answer: "Nope! SmartMark automates campaign setup, ad writing, and optimization—no marketing experience required. You can launch your first ad in minutes.",
  },
];

const Landing = () => {
  const navigate = useNavigate();
  const faqRef = useRef(null);

  useEffect(() => {
    localStorage.removeItem("smartmark_form_fields");
    localStorage.removeItem("smartmark_campaign_setup_budget");
  }, []);

  const goToForm = () => navigate("/form");
  const goToLogin = () => navigate("/login");
  const scrollToFaq = () => faqRef.current && faqRef.current.scrollIntoView({ behavior: "smooth" });

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: LIGHTER_BG,
        fontFamily: MODERN_FONT,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          position: "relative",
          width: "100vw",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingLeft: 36,
          paddingRight: 36,
          marginTop: 30,
          zIndex: 10,
          background: "transparent",
        }}
      >
        <button
          style={{
            fontWeight: 500,
            fontSize: "1.02rem",
            color: "rgba(255,255,255,0.43)",
            background: "none",
            border: "none",
            padding: "0.5rem 1.15rem",
            borderRadius: "1.2rem",
            cursor: "pointer",
            transition: "color 0.2s, background 0.2s",
            opacity: 0.73,
            outline: "none",
            userSelect: "none",
          }}
          onMouseOver={e => {
            e.target.style.color = "#fff";
            e.target.style.background = "rgba(60,255,150,0.13)";
            e.target.style.opacity = 1;
          }}
          onMouseOut={e => {
            e.target.style.color = "rgba(255,255,255,0.43)";
            e.target.style.background = "none";
            e.target.style.opacity = 0.73;
          }}
          onClick={scrollToFaq}
        >
          FAQ
        </button>
        <div style={{ display: "flex", gap: "1.25rem" }}>
          <button
            style={{
              padding: "0.88rem 2.2rem",
              fontSize: "1.18rem",
              background: "none",
              color: "#fff",
              border: `2px solid ${DARK_GREEN}`,
              borderRadius: "2.1rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: MODERN_FONT,
              letterSpacing: "1px",
              marginRight: 8,
              transition: "background 0.18s, color 0.18s",
            }}
            onMouseOver={e => {
              e.target.style.background = DARK_GREEN;
              e.target.style.color = "#fff";
            }}
            onMouseOut={e => {
              e.target.style.background = "none";
              e.target.style.color = "#fff";
            }}
            onClick={goToLogin}
          >
            Login
          </button>
          <button
            style={{
              padding: "0.88rem 2.5rem",
              fontSize: "1.22rem",
              background: DARK_GREEN,
              color: "#fff",
              border: "none",
              borderRadius: "2.1rem",
              fontWeight: 700,
              boxShadow: "0 2px 18px 0 rgba(24,84,49,0.21), 0 2px 8px 0 rgba(44,44,44,0.08)",
              cursor: "pointer",
              transition: "background 0.16s, box-shadow 0.2s, color 0.2s",
              fontFamily: MODERN_FONT,
              outline: "none",
              letterSpacing: "1.2px",
              userSelect: "none",
            }}
            onMouseOver={e => (e.target.style.background = DARK_GREEN_HOVER)}
            onMouseOut={e => (e.target.style.background = DARK_GREEN)}
            onClick={goToForm}
          >
            Start Campaign
          </button>
        </div>
      </div>

      {/* Centered Content */}
      <div
        style={{
          minHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: "2.5rem",
        }}
      >
        <h1
          style={{
            fontFamily: MODERN_FONT,
            fontSize: "3.7rem",
            fontWeight: 800,
            color: "#fff",
            textAlign: "center",
            margin: "0 0 0 15px", // move slightly right
            letterSpacing: "-2px",
            lineHeight: 1.12,
            textShadow: "0 2px 16px #12151833",
            userSelect: "none",
          }}
        >
          SmartMark
        </h1>
        <h2
          style={{
            fontFamily: MODERN_FONT,
            fontSize: "2.2rem",
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            margin: 0,
            letterSpacing: "-1px",
            lineHeight: 1.13,
            textShadow: "0 2px 16px #12151855",
            userSelect: "none",
            opacity: 0.88,
          }}
        >
          Effortless Ads in 5 Minutes
        </h2>
        {/* Main "Launch Campaign" Button */}
        <button
          style={{
            marginTop: "2.7rem",
            marginLeft: "22px",
            padding: "1.35rem 3.8rem",
            fontSize: "2.0rem",
            fontFamily: MODERN_FONT,
            background: DARK_GREEN,
            color: "#fff",
            border: "none",
            borderRadius: "2.5rem",
            fontWeight: 800,
            boxShadow: "0 8px 48px 0 rgba(24,84,49,0.24), 0 2px 12px 0 rgba(44,44,44,0.08)",
            cursor: "pointer",
            transition: "background 0.16s, box-shadow 0.2s, color 0.2s",
            outline: "none",
            letterSpacing: "1.5px",
            textShadow: "0 1px 6px #12392144",
          }}
          onMouseOver={e => {
            e.target.style.background = DARK_GREEN_HOVER;
            e.target.style.boxShadow =
              "0 10px 56px 0 rgba(30,106,62,0.31), 0 4px 16px 0 rgba(44,44,44,0.11)";
            e.target.style.textShadow =
              "0 2px 12px #12392199";
          }}
          onMouseOut={e => {
            e.target.style.background = DARK_GREEN;
            e.target.style.boxShadow =
              "0 8px 48px 0 rgba(24,84,49,0.24), 0 2px 12px 0 rgba(44,44,44,0.08)";
            e.target.style.textShadow =
              "0 1px 6px #12392144";
          }}
          onClick={goToForm}
        >
          Launch Campaign
        </button>
      </div>

      {/* Step-by-step Graph Section */}
      <div
        style={{
          width: "100vw",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#2b2e32",
          padding: "3.7rem 0 1.7rem 0",
          borderTop: "1px solid #222b",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            width: "90vw",
            maxWidth: 1100,
            minHeight: 210,
            background: "rgba(24,84,49,0.11)",
            borderRadius: "2.2rem",
            boxShadow: "0 6px 44px 0 #122e1b18",
            padding: "2.1rem 1.8rem",
            gap: "2.7rem",
          }}
        >
          {/* Steps with arrows between */}
          {processSteps.map((step, idx) => (
            <React.Fragment key={step.title}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: 170,
                  maxWidth: 220,
                  // Bring launch closer to previous
                  ...(step.title === "Launch"
                    ? { marginLeft: "-46px" } // adjust this value for "slight" closeness
                    : {}),
                }}
              >
                <div
                  style={{
                    fontSize: "2.7rem",
                    background: "linear-gradient(135deg, #3be09d 35%, #7fd5ff 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    marginBottom: step.title === "Launch" ? "0.30rem" : "0.5rem",
                    fontFamily: MODERN_FONT,
                  }}
                >
                  {step.icon}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "1.13rem",
                    color: "#fff",
                    marginBottom: "0.18rem",
                    fontFamily: MODERN_FONT,
                    textAlign: "center",
                  }}
                >
                  {step.title}
                </div>
              </div>
              {idx !== processSteps.length - 1 && (
                <div
                  style={{
                    fontSize: "2.1rem",
                    color: "#32e897",
                    margin: "0 0.4rem",
                    marginBottom: "-0.14rem",
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Below diagram: Effortless... + Get Started button */}
      <div
        style={{
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: "1.5rem",
        }}
      >
        <div
          style={{
            color: "#1ec885",
            fontWeight: 700,
            fontFamily: MODERN_FONT,
            fontSize: "1.12rem",
            textAlign: "center",
            letterSpacing: "0.2px",
            opacity: 0.92,
            marginBottom: "1.5rem",
          }}
        >
          Effortless. No experience needed.
        </div>
        <button
          style={{
            padding: "1.11rem 2.9rem",
            fontSize: "1.22rem",
            background: DARK_GREEN,
            color: "#fff",
            border: "none",
            borderRadius: "2.1rem",
            fontWeight: 700,
            boxShadow: "0 2px 18px 0 rgba(24,84,49,0.21), 0 2px 8px 0 rgba(44,44,44,0.08)",
            cursor: "pointer",
            transition: "background 0.16s, box-shadow 0.2s, color 0.2s",
            fontFamily: MODERN_FONT,
            outline: "none",
            letterSpacing: "1.2px",
            userSelect: "none",
          }}
          onMouseOver={e => (e.target.style.background = DARK_GREEN_HOVER)}
          onMouseOut={e => (e.target.style.background = DARK_GREEN)}
          onClick={goToForm}
        >
          Get Started
        </button>
      </div>

      {/* FAQ Section */}
      <div
        ref={faqRef}
        style={{
          width: "100vw",
          background: "#232529",
          padding: "4.4rem 0 6rem 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h2
          style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: "2.2rem",
            marginBottom: "2.3rem",
            letterSpacing: "-1px",
            textShadow: "0 2px 16px #12151822",
            userSelect: "none",
            fontFamily: MODERN_FONT,
          }}
        >
          Frequently Asked Questions
        </h2>
        <div
          style={{
            width: "94vw",
            maxWidth: 600,
            display: "flex",
            flexDirection: "column",
            gap: "2.5rem",
          }}
        >
          {faqList.map((item, idx) => (
            <div
              key={item.question}
              style={{
                background: "rgba(25,84,49,0.11)",
                borderRadius: "1.4rem",
                padding: "1.2rem 1.6rem",
                boxShadow: "0 2px 14px 0 #122e1b10",
                border: "1px solid #1ec88511",
              }}
            >
              <div
                style={{
                  color: "#2ed993",
                  fontWeight: 700,
                  fontSize: "1.18rem",
                  marginBottom: "0.4rem",
                  letterSpacing: "-0.7px",
                  fontFamily: MODERN_FONT,
                }}
              >
                {item.question}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.97)",
                  fontWeight: 400,
                  fontSize: "1.1rem",
                  lineHeight: 1.57,
                  marginBottom: 0,
                  fontFamily: MODERN_FONT,
                }}
              >
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Landing;
