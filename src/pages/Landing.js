import React, { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const DARK_GREEN = "#185431";
const DARK_GREEN_HOVER = "#1e6a3e";
const LIGHTER_BG = "#232529";

const processSteps = [
  { icon: "🎯", title: "Answer a few questions" },
  { icon: "📝", title: "AI generates ad copy and creatives" },
  { icon: "✅", title: "Review and approve" },
  { icon: "🚀", title: "Launch" },
];

const faqList = [
  {
    question: "How much does each campaign cost?",
    answer:
      "Each campaign has a simple $45 setup fee plus 10% of your ad spend. No hidden fees. You pay only when you launch a campaign.",
  },
  {
    question: "Do I need any ad experience or an agency?",
    answer:
      "Nope! SmartMark automates campaign setup, creative creation, ad writing, and optimization. No marketing experience required. You can launch your first ad in minutes.",
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
  const scrollToFaq = () =>
    faqRef.current && faqRef.current.scrollIntoView({ behavior: "smooth" });

  // ---- Style helpers ----
  const headerPadding = isMobile ? "18px" : "36px";
  const heroFontSize = isMobile ? "2.35rem" : "4rem";
  const heroSubFontSize = isMobile ? "1.2rem" : "2.1rem";
  const launchBtnSize = isMobile ? "1.05rem" : "1.95rem";
  const launchBtnPadding = isMobile ? "0.85rem 1.8rem" : "1.25rem 3.4rem";
  const stepColDirection = isMobile ? "column" : "row";
  const stepGap = isMobile ? "0.85rem" : "2.6rem";
  const stepMinWidth = isMobile ? "auto" : 170;
  const stepMaxWidth = isMobile ? "100vw" : 230;
  const belowDiagramMargin = isMobile ? "0.8rem" : "1.6rem";
  const faqPad = isMobile ? "2.4rem 0 4.2rem 0" : "4.6rem 0 6rem 0";
  const faqFontSize = isMobile ? "1.4rem" : "2.2rem";
  const faqWidth = isMobile ? "92vw" : "880px";

  // Reusable surfaces
  const cardGlass = {
    background: "linear-gradient(180deg, #2a2e33cc, #23262acc)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    backdropFilter: "blur(8px)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: LIGHTER_BG,
        fontFamily: MODERN_FONT,
        position: "relative",
        overflow: "hidden",
        color: "#fff",
      }}
    >
      {/* Decorative gradients */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "-20% -10% auto auto",
          width: isMobile ? 380 : 680,
          height: isMobile ? 380 : 680,
          background:
            "radial-gradient(35% 35% at 60% 40%, rgba(46,217,147,0.22), rgba(46,217,147,0) 60%)",
          filter: "blur(10px)",
          animation: "floatUp 18s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: "auto auto -25% -10%",
          width: isMobile ? 420 : 760,
          height: isMobile ? 420 : 760,
          background:
            "radial-gradient(40% 40% at 40% 60%, rgba(127,213,255,0.18), rgba(127,213,255,0) 65%)",
          filter: "blur(12px)",
          animation: "floatDown 22s ease-in-out infinite",
        }}
      />

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
          marginTop: isMobile ? 14 : 26,
          zIndex: 10,
          gap: isMobile ? "1rem" : 0,
        }}
      >
        <button
          style={{
            fontWeight: 600,
            fontSize: isMobile ? "0.98rem" : "1rem",
            color: "rgba(255,255,255,0.75)",
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.04))",
            border: "1px solid rgba(255,255,255,0.12)",
            padding: "0.55rem 1.05rem",
            borderRadius: "999px",
            cursor: "pointer",
            transition: "all 0.2s",
            width: isMobile ? "86vw" : "auto",
            margin: isMobile ? "0 auto" : 0,
            letterSpacing: "0.3px",
            ...cardGlass,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.28)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
          }}
          onClick={scrollToFaq}
        >
          FAQ
        </button>
        <div style={{ display: "flex", gap: "0.8rem" }}>
          <button
            style={{
              padding: isMobile ? "0.65rem 1.3rem" : "0.85rem 1.9rem",
              fontSize: isMobile ? "0.98rem" : "1.06rem",
              background:
                "linear-gradient(180deg, rgba(24,84,49,0.0), rgba(24,84,49,0.0))",
              color: "#fff",
              border: `1.5px solid ${DARK_GREEN}`,
              borderRadius: "999px",
              fontWeight: 700,
              cursor: "pointer",
              letterSpacing: "0.6px",
              transition: "all 0.18s",
              ...cardGlass,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = DARK_GREEN;
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(180deg, rgba(24,84,49,0.0), rgba(24,84,49,0.0))";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            onClick={goToLogin}
          >
            Login
          </button>
          <button
            style={{
              padding: isMobile ? "0.7rem 1.6rem" : "0.95rem 2.2rem",
              fontSize: isMobile ? "1.02rem" : "1.08rem",
              background:
                "linear-gradient(180deg, #1c6a3f, #165434) /* base */",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "999px",
              fontWeight: 800,
              boxShadow:
                "0 10px 28px rgba(24,84,49,0.28), 0 2px 10px rgba(0,0,0,0.18)",
              cursor: "pointer",
              transition: "all 0.16s",
              letterSpacing: "0.9px",
              outline: "none",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(180deg, #227847, #1b5d39)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background =
                "linear-gradient(180deg, #1c6a3f, #165434)";
              e.currentTarget.style.transform = "translateY(0)";
            }}
            onClick={goToForm}
          >
            Start Campaign
          </button>
        </div>
      </div>

      {/* Centered Content */}
      <div
        style={{
          minHeight: isMobile ? "46vh" : "78vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          gap: isMobile ? "1.05rem" : "2.2rem",
          marginTop: isMobile ? "1.1rem" : 0,
          padding: "0 18px",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: MODERN_FONT,
            fontSize: heroFontSize,
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.06,
            letterSpacing: isMobile ? "-0.8px" : "-1.6px",
            background:
              "linear-gradient(90deg, #e9fff6 0%, #a7ffe1 40%, #7fd5ff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 10px 40px rgba(0,0,0,0.25)",
            animation: "shine 6s ease-in-out infinite",
          }}
        >
          SmartMark
        </h1>
        <h2
          style={{
            fontFamily: MODERN_FONT,
            fontSize: heroSubFontSize,
            fontWeight: 600,
            opacity: 0.94,
            margin: 0,
            lineHeight: 1.18,
            letterSpacing: isMobile ? "0" : "0.2px",
            color: "rgba(255,255,255,0.96)",
            textShadow: "0 6px 28px rgba(0,0,0,0.20)",
          }}
        >
          Effortless Ads in 5 Minutes
        </h2>

        {/* Main CTA */}
        <button
          style={{
            marginTop: isMobile ? "1.2rem" : "2.2rem",
            padding: launchBtnPadding,
            fontSize: launchBtnSize,
            background:
              "linear-gradient(180deg, #1d6e41, #165434) /* base */",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "999px",
            fontWeight: 900,
            letterSpacing: "1.2px",
            boxShadow:
              "0 16px 60px rgba(24,84,49,0.32), 0 3px 12px rgba(0,0,0,0.22)",
            cursor: "pointer",
            transition: "transform 0.15s, box-shadow 0.25s, background 0.2s",
            textShadow: "0 2px 8px rgba(0,0,0,0.25)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.background =
              "linear-gradient(180deg, #227847, #1b5d39)";
            e.currentTarget.style.boxShadow =
              "0 22px 70px rgba(30,106,62,0.38), 0 6px 16px rgba(0,0,0,0.26)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background =
              "linear-gradient(180deg, #1d6e41, #165434)";
            e.currentTarget.style.boxShadow =
              "0 16px 60px rgba(24,84,49,0.32), 0 3px 12px rgba(0,0,0,0.22)";
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
          padding: isMobile ? "2rem 0 1.1rem 0" : "3.4rem 0 1.6rem 0",
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: stepColDirection,
            alignItems: "center",
            justifyContent: "center",
            width: isMobile ? "94vw" : "1100px",
            minHeight: isMobile ? 154 : 210,
            borderRadius: "20px",
            padding: isMobile ? "1.2rem 0.9rem" : "2rem 1.6rem",
            gap: stepGap,
            ...cardGlass,
          }}
        >
          {processSteps.map((step, idx) => (
            <React.Fragment key={step.title}>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minWidth: stepMinWidth,
                  maxWidth: stepMaxWidth,
                  padding: isMobile ? "0.2rem 0.4rem" : "0.4rem 0.6rem",
                  transition: "transform 0.18s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.transform = "translateY(-2px)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.transform = "translateY(0)")
                }
              >
                <div
                  style={{
                    fontSize: isMobile ? "2rem" : "2.4rem",
                    marginBottom: "0.35rem",
                    textShadow: "0 6px 18px rgba(0,0,0,0.25)",
                  }}
                >
                  {step.icon}
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: isMobile ? "1.02rem" : "1.12rem",
                    letterSpacing: "0.2px",
                  }}
                >
                  {step.title}
                </div>
              </div>
              {idx !== processSteps.length - 1 && (
                <div
                  style={{
                    fontSize: isMobile ? "1.3rem" : "2rem",
                    color: "#32e897",
                    opacity: 0.9,
                    transform: isMobile ? "rotate(90deg)" : "none",
                    filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.24))",
                    margin: isMobile ? "0.1rem 0" : "0 0.25rem",
                  }}
                >
                  →
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Below diagram: tagline + Get Started */}
      <div
        style={{
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: belowDiagramMargin,
          gap: "0.9rem",
        }}
      >
        <div
          style={{
            color: "#8ff4cf",
            fontWeight: 700,
            fontSize: "1.05rem",
            letterSpacing: "0.4px",
            opacity: 0.96,
            textShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          Effortless. No experience needed.
        </div>
        <button
          style={{
            padding: isMobile ? "0.75rem 1.8rem" : "1.05rem 2.6rem",
            fontSize: isMobile ? "1.02rem" : "1.12rem",
            background: "linear-gradient(180deg, #1e6f42, #155033)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "999px",
            fontWeight: 800,
            letterSpacing: "0.9px",
            boxShadow:
              "0 10px 28px rgba(24,84,49,0.28), 0 2px 10px rgba(0,0,0,0.18)",
            cursor: "pointer",
            transition: "all 0.18s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.background =
              "linear-gradient(180deg, #227847, #1b5d39)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background =
              "linear-gradient(180deg, #1e6f42, #155033)";
          }}
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
          padding: faqPad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <h2
          style={{
            fontWeight: 900,
            fontSize: faqFontSize,
            marginBottom: isMobile ? "1.2rem" : "2.1rem",
            letterSpacing: "-0.5px",
            textShadow: "0 10px 30px rgba(0,0,0,0.25)",
            background:
              "linear-gradient(90deg, #e9fff6 0%, #a7ffe1 50%, #7fd5ff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Frequently Asked Questions
        </h2>
        <div
          style={{
            width: faqWidth,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: isMobile ? "1rem" : "1.2rem",
          }}
        >
          {faqList.map((item) => (
            <div
              key={item.question}
              style={{
                borderRadius: "16px",
                padding: isMobile ? "1rem 1rem" : "1.15rem 1.25rem",
                transition: "transform 0.18s, box-shadow 0.2s",
                ...cardGlass,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow =
                  "0 14px 36px rgba(0,0,0,0.28)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
              }}
            >
              <div
                style={{
                  color: "#7fffd4",
                  fontWeight: 800,
                  fontSize: isMobile ? "1.02rem" : "1.08rem",
                  marginBottom: "0.35rem",
                  letterSpacing: "0.1px",
                }}
              >
                {item.question}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.96)",
                  fontWeight: 500,
                  fontSize: isMobile ? "0.98rem" : "1.02rem",
                  lineHeight: 1.6,
                }}
              >
                {item.answer}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Local keyframes */}
      <style>{`
        @keyframes shine {
          0% { filter: drop-shadow(0 10px 40px rgba(0,0,0,0.25)); }
          50% { filter: drop-shadow(0 14px 56px rgba(0,0,0,0.32)); }
          100% { filter: drop-shadow(0 10px 40px rgba(0,0,0,0.25)); }
        }
        @keyframes floatUp {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(-18px); }
        }
        @keyframes floatDown {
          0%,100% { transform: translateY(0px); }
          50% { transform: translateY(14px); }
        }
      `}</style>
    </div>
  );
};

export default Landing;
