import React, { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/** Tech palette */
const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG_DARK = "#0b0f14";
const ACCENT = "#31e1ff";
const ACCENT_2 = "#7c4dff";
const BTN = "#0f6fff";
const BTN_H = "#2e82ff";
const GLASS_BORDER = "rgba(255,255,255,0.08)";

/* content */
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

const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 750);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

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

  const scrollToFaq = () => {
    const el = faqRef.current;
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 12;
    window.scrollTo({ top, behavior: "smooth" });
  };
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });

  /* sizes */
  const headerPad = isMobile ? "16px" : "32px";
  const heroFont = isMobile ? "2.5rem" : "4.2rem";
  const heroSub = isMobile ? "1.15rem" : "2rem";
  const ctaPad = isMobile ? "0.9rem 1.8rem" : "1.1rem 2.6rem";
  const ctaSize = isMobile ? "1.05rem" : "1.25rem";
  const faqPad = isMobile ? "2.2rem 0 4rem" : "4rem 0 6rem";
  const faqTitle = isMobile ? "1.4rem" : "2.1rem";

  const glass = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: `1px solid ${GLASS_BORDER}`,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    backdropFilter: "blur(8px)",
  };

  return (
    <div
      style={{
        minHeight: "100svh",              // fill viewport height reliably
        width: "100%",
        background: BG_DARK,
        fontFamily: FONT,
        position: "relative",
        color: "#fff",
        overflowX: "hidden",
      }}
    >
      {/* global fixes: background + full-height roots (kills white bottom) */}
      <style>{`
        html, body, #root { height: 100%; background: ${BG_DARK}; margin: 0; }
        html, body { scroll-behavior: smooth; }
        @keyframes floatA { 0%,100%{ transform: translateY(0)} 50%{ transform: translateY(-14px)} }
        @keyframes floatB { 0%,100%{ transform: translateY(0)} 50%{ transform: translateY(12px)} }
      `}</style>

      {/* ambient gradients */}
      <div aria-hidden style={{
        position: "absolute", top: "-20vh", right: "-10vw",
        width: isMobile ? 360 : 720, height: isMobile ? 360 : 720,
        background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT}33, transparent 70%)`,
        filter: "blur(18px)", animation: "floatA 18s ease-in-out infinite", pointerEvents: "none"
      }}/>
      <div aria-hidden style={{
        position: "absolute", bottom: "-25vh", left: "-12vw",
        width: isMobile ? 420 : 800, height: isMobile ? 420 : 800,
        background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT_2}2e, transparent 70%)`,
        filter: "blur(18px)", animation: "floatB 22s ease-in-out infinite", pointerEvents: "none"
      }}/>

      {/* Header */}
      <div style={{
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        justifyContent: isMobile ? "center" : "space-between",
        alignItems: "center",
        padding: `18px ${headerPad} 0`,
        gap: isMobile ? "0.9rem" : 0,
        position: "relative", zIndex: 2
      }}>
        <button onClick={scrollToFaq} style={{
          fontWeight: 700, fontSize: isMobile ? "0.98rem" : "1rem",
          color: "#e6faff", borderRadius: 999, padding: "0.55rem 1.1rem",
          cursor: "pointer", transition: "transform .15s ease",
          ...glass, width: isMobile ? "86vw" : "auto"
        }}
        onMouseEnter={(e)=>e.currentTarget.style.transform="translateY(-2px)"}
        onMouseLeave={(e)=>e.currentTarget.style.transform="translateY(0)"}>
          FAQ
        </button>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={goToLogin} style={{
            padding: isMobile ? "0.65rem 1.3rem" : "0.85rem 1.9rem",
            fontSize: isMobile ? "0.98rem" : "1.05rem",
            color: "#eaf5ff", borderRadius: 999, cursor: "pointer",
            transition: "transform .15s ease, background .2s ease",
            ...glass
          }}
          onMouseEnter={(e)=>e.currentTarget.style.transform="translateY(-2px)"}
          onMouseLeave={(e)=>e.currentTarget.style.transform="translateY(0)"}>
            Login
          </button>

          <button onClick={goToForm} style={{
            padding: isMobile ? "0.7rem 1.6rem" : "0.95rem 2.2rem",
            fontSize: isMobile ? "1.02rem" : "1.08rem",
            color: "#fff", background: BTN, border: "none",
            borderRadius: 999, fontWeight: 800,
            boxShadow: "0 10px 26px rgba(15,111,255,0.35)",
            cursor: "pointer",
            transition: "transform .15s ease, background .2s ease, box-shadow .2s ease"
          }}
          onMouseEnter={(e)=>{e.currentTarget.style.background=BTN_H;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 14px 36px rgba(15,111,255,0.45)";}}
          onMouseLeave={(e)=>{e.currentTarget.style.background=BTN;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 10px 26px rgba(15,111,255,0.35)";}}>
            Start Campaign
          </button>
        </div>
      </div>

      {/* Hero */}
      <div style={{
        minHeight: isMobile ? "48vh" : "78vh",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        textAlign: "center", gap: isMobile ? "1rem" : "1.6rem", padding: "0 18px",
        position: "relative", zIndex: 1
      }}>
        <h1 style={{
          fontFamily: FONT, fontSize: heroFont, fontWeight: 900, margin: 0,
          letterSpacing: isMobile ? "-0.5px" : "-1px", lineHeight: 1.06,
          background: `linear-gradient(90deg, #ffffff, ${ACCENT} 55%, ${ACCENT_2})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textShadow: "0 10px 40px rgba(0,0,0,0.25)"
        }}>SmartMark</h1>

        <h2 style={{ fontFamily: FONT, fontSize: heroSub, fontWeight: 600, margin: 0, opacity: 0.96, color: "#eaf5ff" }}>
          Effortless Ads in 5 Minutes
        </h2>

        <button onClick={goToForm} style={{
          marginTop: isMobile ? "1.2rem" : "2rem",
          padding: ctaPad, fontSize: ctaSize, background: BTN, color: "#fff",
          border: "none", borderRadius: 999, fontWeight: 900, letterSpacing: "0.8px",
          boxShadow: "0 16px 56px rgba(15,111,255,0.35)", cursor: "pointer",
          transition: "transform .15s ease, background .2s ease, box-shadow .2s ease"
        }}
        onMouseEnter={(e)=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.background=BTN_H;e.currentTarget.style.boxShadow="0 22px 68px rgba(15,111,255,0.45)";}}
        onMouseLeave={(e)=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.background=BTN;e.currentTarget.style.boxShadow="0 16px 56px rgba(15,111,255,0.35)";}}>
          Launch Campaign
        </button>
      </div>

      {/* Process (emoji perfectly centered over labels; arrows lined up) */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: isMobile ? "1.8rem 0 1.1rem" : "3rem 0 1.4rem" }}>
        <div
          style={{
            width: isMobile ? "92vw" : 1100,
            borderRadius: 18,
            padding: isMobile ? "1.1rem 0.9rem" : "1.4rem 1.2rem",
            ...glass,
          }}
        >
          {/* Grid: step | arrow | step | arrow ... (keeps perfect alignment) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(7, 1fr)",
              alignItems: "center",
              gap: isMobile ? "1rem" : "0.5rem",
            }}
          >
            {processSteps.map((s, i) => (
              <React.Fragment key={s.title}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    minHeight: 92,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 44,
                      height: 44,
                      fontSize: 28,
                      lineHeight: 1,
                    }}
                  >
                    {s.icon}
                  </span>
                  <span
                    style={{
                      marginTop: 8,
                      maxWidth: 220,
                      fontWeight: 800,
                      fontSize: isMobile ? 16 : 17,
                      lineHeight: 1.25,
                    }}
                  >
                    {s.title}
                  </span>
                </div>

                {/* arrow cell except after last step */}
                {i !== processSteps.length - 1 && !isMobile && (
                  <div
                    aria-hidden
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "1.6rem",
                      color: ACCENT,
                    }}
                  >
                    →
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-CTA */}
      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.8rem", paddingBottom: "1.4rem" }}>
        <div style={{ color: "#bfeeff", fontWeight: 700 }}>Effortless. No experience needed.</div>
        <button onClick={goToForm} style={{
          padding: isMobile ? "0.75rem 1.8rem" : "1rem 2.4rem",
          fontSize: isMobile ? "1rem" : "1.1rem",
          background: BTN, color: "#fff", border: "none",
          borderRadius: 999, fontWeight: 800,
          boxShadow: "0 10px 26px rgba(15,111,255,0.35)", cursor: "pointer",
          transition: "transform .15s ease, background .2s ease"
        }}
        onMouseEnter={(e)=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.background=BTN_H;}}
        onMouseLeave={(e)=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.background=BTN;}}>
          Get Started
        </button>
      </div>

      {/* FAQ */}
      <div ref={faqRef} style={{ width: "100%", padding: faqPad, display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
        <h2 style={{
          fontWeight: 900, fontSize: faqTitle, margin: 0, marginBottom: isMobile ? "1.1rem" : "1.8rem",
          background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
        }}>
          Frequently Asked Questions
        </h2>

        <div style={{ width: isMobile ? "92vw" : 880, display: "grid", gridTemplateColumns: "1fr", gap: isMobile ? "0.9rem" : "1.1rem" }}>
          {faqList.map((item) => (
            <div key={item.question} style={{ borderRadius: 14, padding: isMobile ? "1rem" : "1.1rem", ...glass }}>
              <div style={{ color: ACCENT, fontWeight: 800, marginBottom: 6, fontSize: isMobile ? "1.02rem" : "1.08rem" }}>
                {item.question}
              </div>
              <div style={{ color: "rgba(255,255,255,0.96)", fontWeight: 500, lineHeight: 1.6, fontSize: isMobile ? "0.98rem" : "1.02rem" }}>
                {item.answer}
              </div>
            </div>
          ))}
        </div>

        <button onClick={scrollToTop} style={{
          marginTop: "1.6rem", padding: "0.7rem 1.3rem", fontSize: "0.95rem",
          color: "#fff", background: "transparent", borderRadius: 999, cursor: "pointer", ...glass
        }}>
          ↑ Back to top
        </button>
      </div>

      {/* tiny footer spacer so we never reveal white below gradients */}
      <div style={{ height: 24 }} />
    </div>
  );
};

export default Landing;
