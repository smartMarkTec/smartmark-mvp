import React, { useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";
import { trackEvent } from "../analytics/gaEvents";

// ✅ Put your uploaded mp4 into: src/assets/
// Example filename: smartmark-walkthrough.mp4
import walkthroughVideo from "../assets/smartmark-walkthrough.mp4";

/** Tech palette */
const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG_DARK = "#0b0f14"; // deep navy
const ACCENT = "#31e1ff"; // electric cyan
const ACCENT_2 = "#7c4dff"; // violet
const BTN_BASE = "#0f6fff"; // brand blue
const BTN_BASE_HOVER = "#2e82ff";
const GLASS_BORDER = "rgba(255,255,255,0.08)";

// Formspree endpoint (sends submissions to the email configured in your Formspree form)
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
    question: "How much does each campaign cost?",
    answer:
      "Each campaign has a simple $25 setup fee. No hidden fees. You pay only when you launch a campaign.",
  },
  {
    question: "Do I need any ad experience or an agency?",
    answer:
      "Nope! SmarteMark automates campaign setup, creative creation, ad writing, and optimization. No marketing experience required. You can launch your first ad in minutes.",
  },
];

/* responsive helper */
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
    trackEvent("view_landing", { page: "landing" });
  }, []);

  // Early Access modal
  const [eaOpen, setEaOpen] = React.useState(false);
  const [eaName, setEaName] = React.useState("");
  const [eaEmail, setEaEmail] = React.useState("");
  const [eaSubmitted, setEaSubmitted] = React.useState(false);
  const [eaServerOk, setEaServerOk] = React.useState(false);

  // Walkthrough video modal
  const [videoOpen, setVideoOpen] = React.useState(false);

  const openEarlyAccess = (source = "cta") => {
    try {
      trackEvent("start_campaign", { page: "landing", mode: "early_access", source });
    } catch {}
    setEaSubmitted(false);
    setEaServerOk(false);
    setEaOpen(true);
  };

  const closeEarlyAccess = () => setEaOpen(false);

  const openVideo = (source = "video_card") => {
    try {
      trackEvent("open_walkthrough_video", { page: "landing", source });
    } catch {}
    setVideoOpen(true);
  };

  const closeVideo = () => setVideoOpen(false);

  React.useEffect(() => {
    if (!eaOpen && !videoOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (videoOpen) closeVideo();
        if (eaOpen) closeEarlyAccess();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [eaOpen, videoOpen]);

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

  const goToLogin = () => navigate("/login");

  /* smooth scroll */
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
          padding: `18px ${headerPadding} 0`,
          gap: isMobile ? "0.9rem" : 0,
          position: "relative",
          zIndex: 2,
        }}
      >
        {/* Left: small logo + FAQ */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            width: isMobile ? "100%" : "auto",
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
              fontSize: isMobile ? "0.98rem" : "1rem",
              color: "#e6faff",
              borderRadius: 999,
              padding: "0.55rem 1.1rem",
              cursor: "pointer",
              transition: "transform .15s ease",
              ...glass,
              width: isMobile ? "86vw" : "auto",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          >
            FAQ
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
              background: "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
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
          justifyContent: "center",
          textAlign: "center",
          gap: isMobile ? "1rem" : "1.6rem",
          padding: "0 18px",
          position: "relative",
          zIndex: 1,
        }}
      >
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

        {/* ✅ Small clickable walkthrough video card (between button and graphic) */}
        <div
          onClick={() => openVideo("hero_between_cta_and_graphic")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") openVideo("hero_between_cta_and_graphic");
          }}
          style={{
            marginTop: isMobile ? "0.9rem" : "1.05rem",
            width: isMobile ? "86vw" : 360,
            borderRadius: 16,
            overflow: "hidden",
            cursor: "pointer",
            position: "relative",
            ...glass,
          }}
        >
          <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9" }}>
            <video
              src={walkthroughVideo}
              muted
              playsInline
              preload="metadata"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
                opacity: 0.92,
              }}
            />
            {/* play overlay */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.35))",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 999,
                  border: `1px solid ${GLASS_BORDER}`,
                  background: "rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
                  backdropFilter: "blur(8px)",
                }}
              >
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderTop: "10px solid transparent",
                    borderBottom: "10px solid transparent",
                    borderLeft: `16px solid ${ACCENT}`,
                    marginLeft: 4,
                    filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.35))",
                  }}
                />
              </div>
            </div>
          </div>

          <div
            style={{
              padding: "0.65rem 0.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ textAlign: "left" }}>
              <div style={{ fontWeight: 900, fontSize: 14, color: "#eaf5ff" }}>
                Watch the 10-min walkthrough
              </div>
              <div style={{ fontWeight: 700, fontSize: 12, opacity: 0.85 }}>
                Click to open video
              </div>
            </div>
            <div
              style={{
                fontWeight: 900,
                fontSize: 12,
                color: ACCENT,
                borderBottom: `1px solid ${ACCENT}55`,
                paddingBottom: 1,
                userSelect: "none",
              }}
            >
              Play
            </div>
          </div>
        </div>
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

      {/* Sub-CTA */}
      <div
        style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0.8rem",
          paddingBottom: "1.4rem",
        }}
      >
        <div style={{ color: "#bfeeff", fontWeight: 700 }}>
          Effortless. No marketing experience needed.
        </div>
        <button
          onClick={() => openEarlyAccess("subcta_get_started")}
          style={{
            padding: isMobile ? "0.75rem 1.8rem" : "1rem 2.4rem",
            fontSize: isMobile ? "1rem" : "1.1rem",
            background: BTN_BASE,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            fontWeight: 800,
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
          Get Started
        </button>
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
          opacity: 0.22,
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

      {/* Walkthrough Video Modal */}
      {videoOpen && (
        <div
          onClick={closeVideo}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.72)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "18px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isMobile ? "94vw" : 920,
              borderRadius: 16,
              overflow: "hidden",
              position: "relative",
              ...glass,
            }}
          >
            <button
              onClick={closeVideo}
              aria-label="Close video"
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                width: 34,
                height: 34,
                borderRadius: 999,
                border: `1px solid ${GLASS_BORDER}`,
                background: "rgba(0,0,0,0.35)",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                lineHeight: 1,
                zIndex: 2,
              }}
            >
              ×
            </button>

            <div style={{ width: "100%", background: "rgba(0,0,0,0.25)" }}>
              <video
                src={walkthroughVideo}
                controls
                autoPlay
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  maxHeight: isMobile ? "70vh" : "75vh",
                }}
              />
            </div>

            <div style={{ padding: "0.75rem 0.9rem", display: "flex", justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900, color: "#eaf5ff" }}>SmartMark Walkthrough</div>
              <div style={{ fontWeight: 700, opacity: 0.85 }}>Press Esc to close</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  );
};

export default Landing;
