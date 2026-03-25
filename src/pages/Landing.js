// src/pages/Landing.js
import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";
import { trackEvent } from "../analytics/gaEvents";





/** Tech palette */
const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG_DARK = "#0b0f14";
const ACCENT = "#31e1ff";
const ACCENT_2 = "#7c4dff";
const BTN_BASE = "#0f6fff";
const BTN_BASE_HOVER = "#2e82ff";
const GLASS_BORDER = "rgba(255,255,255,0.08)";

// Formspree endpoint
const EARLY_ACCESS_ENDPOINT = "https://formspree.io/f/mqeqaozw";

/* content */
const processSteps = [
  { icon: "🎯", title: "Answer a few questions" },
  { icon: "📝", title: "AI generates ad copy and creatives" },
  { icon: "✅", title: "Review and approve" },
  { icon: "🚀", title: "Launch" },
];

const faqList = [
 
  {
    question: "Do I need any ad experience or an agency?",
    answer:
      "Nope! SmarteMark automates campaign setup, creative creation, ad writing, and optimization. No marketing experience required. You can launch your first ad in minutes.",
  },
];

/* responsive helper */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 750);
  useEffect(() => {
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
    trackEvent("view_landing", { page: "landing" });
  }, []);

  // Early Access modal
  const [eaOpen, setEaOpen] = useState(false);
  const [eaName, setEaName] = useState("");
  const [eaEmail, setEaEmail] = useState("");
  const [eaSubmitted, setEaSubmitted] = useState(false);
  const [eaServerOk, setEaServerOk] = useState(false);

  const openEarlyAccess = (source = "cta") => {
    try {
      trackEvent("start_campaign", { page: "landing", mode: "early_access", source });
    } catch {}
    setEaSubmitted(false);
    setEaServerOk(false);
    setEaOpen(true);
  };

  const closeEarlyAccess = () => setEaOpen(false);

  useEffect(() => {
    if (!eaOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeEarlyAccess();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eaOpen]);

  const mailtoHref = `mailto:knowwilltech@gmail.com?subject=${encodeURIComponent(
    "SmartMark Early Access"
  )}&body=${encodeURIComponent(
    `Name: ${eaName.trim()}\nEmail: ${eaEmail.trim()}\n\nRequested Early Access from Landing page.`
  )}`;

  const submitEarlyAccess = async (e) => {
    e.preventDefault();
    if (!eaName.trim() || !eaEmail.trim()) return;

    let ok = false;

    try {
      const fd = new FormData();
      fd.append("name", eaName.trim());
      fd.append("email", eaEmail.trim());
      fd.append("source", "smartmark-landing");

      const res = await fetch(EARLY_ACCESS_ENDPOINT, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: fd,
      });

      ok = !!res.ok;
    } catch {}

    setEaServerOk(ok);
    setEaSubmitted(true);

    try {
      trackEvent("early_access_submit", { page: "landing", ok });
    } catch {}
  };

  const goToPricing = () => navigate("/pricing");

  const goToLogin = () => navigate("/login");

  const scrollToFaq = () => {
    const el = faqRef.current;
    if (!el) return;
    const top = window.scrollY + el.getBoundingClientRect().top - 12;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: "smooth" });



  /* sizing */
  const headerPadding = isMobile ? "16px" : "32px";
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
        minHeight: "100vh",
        minWidth: "100vw",
        background: BG_DARK,
        fontFamily: FONT,
        position: "relative",
        overflow: "visible",
        color: "#fff",
      }}
    >
      <style>{`
        html, body, #root { height: 100%; background: ${BG_DARK}; margin: 0; }
        html, body { scroll-behavior: smooth; }
        @keyframes floatA { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes floatB { 0%,100% { transform: translateY(0) } 50% { transform: translateY(12px) } }
        
        
      `}</style>

      {/* subtle tech gradients */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-20vh",
          right: "-10vw",
          width: isMobile ? 360 : 720,
          height: isMobile ? 360 : 720,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT}33, transparent 70%)`,
          filter: "blur(18px)",
          animation: "floatA 18s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-25vh",
          left: "-12vw",
          width: isMobile ? 420 : 800,
          height: isMobile ? 420 : 800,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT_2}2e, transparent 70%)`,
          filter: "blur(18px)",
          animation: "floatB 22s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      {/* Header */}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          justifyContent: isMobile ? "center" : "space-between",
          alignItems: "center",
          padding: `${isMobile ? 22 : 28}px ${headerPadding} 0`,
          gap: isMobile ? "0.9rem" : 0,
          position: "relative",
          zIndex: 2,
        }}
      >
   <div
  style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    width: isMobile ? "100%" : "auto",
    flexWrap: "wrap",
  }}
>
  <img
    src={smartmarkLogo}
    alt="SmarteMark"
    style={{
      height: 26,
      width: 26,
      borderRadius: 10,
      opacity: 0.92,
      flex: "0 0 auto",
    }}
  />

  <button
    onClick={scrollToFaq}
    style={{
      fontWeight: 700,
      fontSize: isMobile ? "0.94rem" : "0.95rem",
      color: "#e6faff",
      borderRadius: 999,
      padding: "0.5rem 1rem",
      cursor: "pointer",
      transition: "transform .15s ease",
      ...glass,
      width: isMobile ? "auto" : "auto",
    }}
    onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
    onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
  >
    FAQ
  </button>

  <button
    onClick={goToPricing}
    style={{
      fontWeight: 700,
      fontSize: isMobile ? "0.9rem" : "0.92rem",
      color: "rgba(255,255,255,0.78)",
      borderRadius: 999,
      padding: "0.48rem 0.95rem",
      cursor: "pointer",
      transition: "transform .15s ease, color .2s ease, border .2s ease",
      ...glass,
      border: "1px solid rgba(255,255,255,0.06)",
      background:
        "linear-gradient(180deg, rgba(255,255,255,0.025), rgba(255,255,255,0.015))",
      boxShadow: "0 8px 22px rgba(0,0,0,0.18)",
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.color = "#eaf5ff";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.color = "rgba(255,255,255,0.78)";
    }}
  >
    Pricing
  </button>
</div>

        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={goToLogin}
            style={{
              padding: isMobile ? "0.65rem 1.3rem" : "0.85rem 1.9rem",
              fontSize: isMobile ? "0.98rem" : "1.05rem",
              color: "#eaf5ff",
              borderRadius: 999,
              cursor: "pointer",
              transition: "transform .15s ease, background .2s ease",
              ...glass,
              border: `1px solid ${GLASS_BORDER}`,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            Login
          </button>

          <button
            onClick={() => openEarlyAccess("header_start_campaign")}
            style={{
              padding: isMobile ? "0.7rem 1.6rem" : "0.95rem 2.2rem",
              fontSize: isMobile ? "1.02rem" : "1.08rem",
              color: "#fff",
              background: BTN_BASE,
              border: "none",
              borderRadius: 999,
              fontWeight: 800,
              boxShadow: "0 10px 26px rgba(15,111,255,0.35)",
              cursor: "pointer",
              transition: "transform .15s ease, background .2s ease, box-shadow .2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BTN_BASE_HOVER;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 14px 36px rgba(15,111,255,0.45)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BTN_BASE;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 10px 26px rgba(15,111,255,0.35)";
            }}
          >
            Start Campaign
          </button>
        </div>
      </div>

      {/* Hero */}
      <div
        style={{
          minHeight: isMobile ? "48vh" : "78vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          textAlign: "center",
          gap: isMobile ? "1rem" : "1.6rem",
          padding: "0 18px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div style={{ height: isMobile ? 120 : 160 }} />

        <h1
          style={{
            fontFamily: FONT,
            fontSize: heroFont,
            fontWeight: 900,
            margin: 0,
            letterSpacing: isMobile ? "-0.5px" : "-1px",
            lineHeight: 1.06,
            background: `linear-gradient(90deg, #ffffff, ${ACCENT} 55%, ${ACCENT_2})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 10px 40px rgba(0,0,0,0.25)",
          }}
        >
          SmarteMark
        </h1>

        <h2
          style={{
            fontFamily: FONT,
            fontSize: heroSub,
            fontWeight: 600,
            margin: 0,
            opacity: 0.96,
            color: "#eaf5ff",
          }}
        >
          Effortless Ads in 5 Minutes
        </h2>

        <button
          onClick={() => openEarlyAccess("hero_launch_campaign")}
          style={{
            marginTop: isMobile ? "1.2rem" : "2rem",
            padding: ctaPad,
            fontSize: ctaSize,
            background: BTN_BASE,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontWeight: 900,
            letterSpacing: "0.8px",
            boxShadow: "0 16px 56px rgba(15,111,255,0.35)",
            cursor: "pointer",
            transition: "transform .15s ease, background .2s ease, box-shadow .2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.background = BTN_BASE_HOVER;
            e.currentTarget.style.boxShadow = "0 22px 68px rgba(15,111,255,0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.background = BTN_BASE;
            e.currentTarget.style.boxShadow = "0 16px 56px rgba(15,111,255,0.35)";
          }}
        >
          Launch Campaign
        </button>

   
      </div>

      {/* Process — graphic */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: isMobile ? "1.8rem 0 1.1rem" : "3rem 0 1.4rem",
        }}
      >
        <div
          style={{
            width: isMobile ? "92vw" : 1100,
            borderRadius: 18,
            padding: isMobile ? "1.1rem 0.9rem" : "1.6rem 1.4rem",
            ...glass,
          }}
        >
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
                    minHeight: 92,
                    textAlign: "center",
                    transition: "transform .15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
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

      {/* FAQ */}
      <div
        ref={faqRef}
        style={{
          width: "100%",
          padding: faqPad,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
        }}
      >


      <div style={{ height: 24 }} />

        <h2
          style={{
            fontWeight: 900,
            fontSize: faqTitle,
            margin: 0,
            marginBottom: isMobile ? "1.1rem" : "1.8rem",
            background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Frequently Asked Questions
        </h2>

        <div
          style={{
            width: isMobile ? "92vw" : 880,
            display: "grid",
            gridTemplateColumns: "1fr",
            gap: isMobile ? "0.9rem" : "1.1rem",
          }}
        >
          {faqList.map((item) => (
            <div
              key={item.question}
              style={{
                borderRadius: 14,
                padding: isMobile ? "1rem" : "1.1rem",
                transition: "transform .15s ease, box-shadow .2s ease",
                ...glass,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <div
                style={{
                  color: ACCENT,
                  fontWeight: 800,
                  marginBottom: 6,
                  fontSize: isMobile ? "1.02rem" : "1.08rem",
                }}
              >
                {item.question}
              </div>
              <div
                style={{
                  color: "rgba(255,255,255,0.96)",
                  fontWeight: 500,
                  lineHeight: 1.6,
                  fontSize: isMobile ? "0.98rem" : "1.02rem",
                }}
              >
                {item.answer}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={scrollToTop}
          style={{
            marginTop: "1.6rem",
            padding: "0.7rem 1.3rem",
            fontSize: "0.95rem",
            color: "#fff",
            background: "transparent",
            borderRadius: 999,
            cursor: "pointer",
            ...glass,
          }}
        >
          ↑ Back to top
        </button>
      </div>

            {/* Contact (barely visible, bottom-center) */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          padding: "6px 0 10px",
          opacity: 0.22, // barely visible
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(255,255,255,0.75)",
          letterSpacing: 0.2,
          userSelect: "none",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span>
          Contact:{" "}
          <a
            href="mailto:knowwilltech@gmail.com"
            style={{
              color: "rgba(255,255,255,0.75)",
              textDecoration: "none",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
              paddingBottom: 1,
            }}
          >
            knowwilltech@gmail.com
          </a>
        </span>
      </div>


      <div style={{ height: 24 }} />

      {/* Early Access Modal */}
      {eaOpen && (
        <div
          onClick={closeEarlyAccess}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "18px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isMobile ? "92vw" : 520,
              borderRadius: 16,
              padding: isMobile ? "1rem" : "1.15rem",
              position: "relative",
              ...glass,
            }}
          >
            <button
              onClick={closeEarlyAccess}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 34,
                height: 34,
                borderRadius: 999,
                border: `1px solid ${GLASS_BORDER}`,
                background: "rgba(255,255,255,0.06)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div style={{ fontWeight: 900, fontSize: isMobile ? 18 : 20, marginBottom: 8 }}>
              Early Access
            </div>

            <div style={{ color: "rgba(255,255,255,0.9)", lineHeight: 1.55, fontWeight: 600 }}>
              SmartMark is onboarding a limited number of users. Campaign launching is enabled after
              final platform approvals.
            </div>

            <div style={{ height: 10 }} />

            {!eaSubmitted ? (
              <form onSubmit={submitEarlyAccess} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    value={eaName}
                    onChange={(e) => setEaName(e.target.value)}
                    placeholder="Name"
                    style={{
                      width: "100%",
                      padding: "0.75rem 0.9rem",
                      borderRadius: 12,
                      border: `1px solid ${GLASS_BORDER}`,
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      outline: "none",
                      fontWeight: 700,
                    }}
                  />
                  <input
                    value={eaEmail}
                    onChange={(e) => setEaEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    style={{
                      width: "100%",
                      padding: "0.75rem 0.9rem",
                      borderRadius: 12,
                      border: `1px solid ${GLASS_BORDER}`,
                      background: "rgba(255,255,255,0.04)",
                      color: "#fff",
                      outline: "none",
                      fontWeight: 700,
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      marginTop: 4,
                      padding: isMobile ? "0.75rem 1.2rem" : "0.85rem 1.4rem",
                      fontSize: isMobile ? "1rem" : "1.05rem",
                      background: BTN_BASE,
                      color: "#fff",
                      border: "none",
                      borderRadius: 999,
                      fontWeight: 900,
                      boxShadow: "0 10px 26px rgba(15,111,255,0.35)",
                      cursor: "pointer",
                      transition: "transform .15s ease, background .2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.background = BTN_BASE_HOVER;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.background = BTN_BASE;
                    }}
                  >
                    Submit
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: "#eaf5ff" }}>
                  Thank you — we’ll reach out soon.
                </div>
                <div style={{ marginTop: 8, color: "rgba(255,255,255,0.88)", fontWeight: 600 }}>
                  {eaServerOk ? (
                    <>Your request was received.</>
                  ) : (
                    <>
                      If you want to ensure we get it, tap{" "}
                      <a
                        href={mailtoHref}
                        style={{
                          color: ACCENT,
                          fontWeight: 900,
                          textDecoration: "none",
                          borderBottom: `1px solid ${ACCENT}66`,
                        }}
                      >
                        send via email
                      </a>
                      .
                    </>
                  )}
                </div>

                <button
                  onClick={closeEarlyAccess}
                  style={{
                    marginTop: 12,
                    padding: "0.7rem 1.2rem",
                    fontSize: "0.98rem",
                    color: "#fff",
                    background: "transparent",
                    borderRadius: 999,
                    cursor: "pointer",
                    ...glass,
                  }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Landing;
