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

// ----------- Responsive Helper ------------
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 750);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};
// ------------------------------------------

const Landing = () => {
  const navigate = useNavigate();
  const faqRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    localStorage.removeItem("smartmark_form_fields");
    localStorage.removeItem("smartmark_campaign_setup_budget");
  }, []);

  const goToForm = () => navigate("/form");
  const goToLogin = () => navigate("/login");
  const scrollToFaq = () => faqRef.current && faqRef.current.scrollIntoView({ behavior: "smooth" });

  // ---- Style helpers ----
  const headerPadding = isMobile ? "18px" : "36px";
  const heroFontSize = isMobile ? "2.1rem" : "3.7rem";
  const heroSubFontSize = isMobile ? "1.18rem" : "2.2rem";
  const launchBtnSize = isMobile ? "1.05rem" : "2.0rem";
  const launchBtnPadding = isMobile ? "0.75rem 1.6rem" : "1.35rem 3.8rem";
  const stepColDirection = isMobile ? "column" : "row";
  const stepGap = isMobile ? "0.7rem" : "2.7rem";
  const stepMinWidth = isMobile ? "auto" : 170;
  const stepMaxWidth = isMobile ? "100vw" : 220;
  const belowDiagramMargin = isMobile ? "0.7rem" : "1.5rem";
  const faqPad = isMobile ? "2.2rem 0 4rem 0" : "4.4rem 0 6rem 0";
  const faqFontSize = isMobile ? "1.37rem" : "2.2rem";
  const faqWidth = isMobile ? "99vw" : "94vw";

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
          flexDirection: isMobile ? "column" : "row",
          justifyContent: isMobile ? "center" : "space-between",
          alignItems: "center",
          paddingLeft: headerPadding,
          paddingRight: headerPadding,
          marginTop: isMobile ? 12 : 30,
          zIndex: 10,
          background: "transparent",
          gap: isMobile ? "1.3rem" : 0,
        }}
      >
        <button
          style={{
            fontWeight: 500,
            fontSize: isMobile ? "1.05rem" : "1.02rem",
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
            width: isMobile ? "80vw" : "auto",
            margin: isMobile ? "0 auto" : 0,
            display: "block",
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
              padding: isMobile ? "0.65rem 1.3rem" : "0.88rem 2.2rem",
              fontSize: isMobile ? "1.01rem" : "1.18rem",
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
              padding: isMobile ? "0.7rem 1.6rem" : "0.88rem 2.5rem",
              fontSize: isMobile ? "1.07rem" : "1.22rem",
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
          minHeight: isMobile ? "44vh" : "80vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: isMobile ? "1.1rem" : "2.5rem",
          marginTop: isMobile ? "1.4rem" : 0,
        }}
      >
        <h1
          style={{
            fontFamily: MODERN_FONT,
            fontSize: heroFontSize,
            fontWeight: 800,
            color: "#fff",
            textAlign: "center",
            margin: isMobile ? "0 0 0 3vw" : "0 0 0 15px",
            letterSpacing: isMobile ? "-1.1px" : "-2px",
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
            fontSize: heroSubFontSize,
            fontWeight: 600,
            color: "#fff",
            textAlign: "center",
            margin: 0,
            letterSpacing: isMobile ? "-0.3px" : "-1px",
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
            marginTop: isMobile ? "1.15rem" : "2.7rem",
            marginLeft: isMobile ? "3vw" : "22px",
            padding: launchBtnPadding,
            fontSize: launchBtnSize,
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
          padding: isMobile ? "2.1rem 0 1.1rem 0" : "3.7rem 0 1.7rem 0",
          borderTop: "1px solid #222b",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: stepColDirection,
            alignItems: "center",
            justifyContent: "center",
            width: isMobile ? "98vw" : "90vw",
            maxWidth: 1100,
            minHeight: isMobile ? 150 : 210,
            background: "rgba(24,84,49,0.11)",
            borderRadius: "2.2rem",
            boxShadow: "0 6px 44px 0 #122e1b18",
            padding: isMobile ? "1.3rem 0.7rem" : "2.1rem 1.8rem",
            gap: stepGap,
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
                  minWidth: stepMinWidth,
                  maxWidth: stepMaxWidth,
                  marginLeft: step.title === "Launch" && !isMobile ? "-46px" : 0,
                }}
              >
                <div
                  style={{
                    fontSize: isMobile ? "2.1rem" : "2.7rem",
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
                    fontSize: isMobile ? "1.03rem" : "1.13rem",
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
                    fontSize: isMobile ? "1.3rem" : "2.1rem",
                    color: "#32e897",
                    margin: isMobile ? "0.2rem 0" : "0 0.4rem",
                    marginBottom: isMobile ? "0" : "-0.14rem",
                    transform: isMobile ? "rotate(90deg)" : "none",
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
          marginTop: belowDiagramMargin,
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
            padding: isMobile ? "0.7rem 1.7rem" : "1.11rem 2.9rem",
            fontSize: isMobile ? "1.07rem" : "1.22rem",
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
          padding: faqPad,
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
            fontSize: faqFontSize,
            marginBottom: isMobile ? "1.35rem" : "2.3rem",
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
            width: faqWidth,
            maxWidth: 600,
            display: "flex",
            flexDirection: "column",
            gap: isMobile ? "1.3rem" : "2.5rem",
          }}
        >
          {faqList.map((item, idx) => (
            <div
              key={item.question}
              style={{
                background: "rgba(25,84,49,0.11)",
                borderRadius: "1.4rem",
                padding: isMobile ? "0.8rem 1rem" : "1.2rem 1.6rem",
                boxShadow: "0 2px 14px 0 #122e1b10",
                border: "1px solid #1ec88511",
              }}
            >
              <div
                style={{
                  color: "#2ed993",
                  fontWeight: 700,
                  fontSize: isMobile ? "1.09rem" : "1.18rem",
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
                  fontSize: isMobile ? "1.01rem" : "1.1rem",
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
