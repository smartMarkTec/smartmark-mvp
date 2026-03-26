import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";
import { trackEvent } from "../analytics/gaEvents";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "#eef2ff";
const SURFACE = "#ffffff";
const SURFACE_ALT = "#f7f8ff";
const TEXT = "#111827";
const TEXT_SOFT = "#667085";
const BORDER = "#dbe4ff";
const ACCENT = "#5b5cf0";
const ACCENT_2 = "#8b5cf6";
const ACCENT_3 = "#4f8cff";
const BTN_BASE = "#4f6bff";
const BTN_BASE_HOVER = "#3e58eb";

const EARLY_ACCESS_ENDPOINT = "https://formspree.io/f/mqeqaozw";

const heroStats = [
  { value: "5 min", label: "to launch" },
  { value: "AI", label: "creative generation" },
  { value: "Live", label: "campaign metrics" },
];

const processSteps = [
  {
    step: "01",
    title: "Answer a few questions",
    body: "Tell Smartemark about the business, offer, and website.",
  },
  {
    step: "02",
    title: "Generate campaign assets",
    body: "AI prepares ad copy, angles, and visuals in minutes.",
  },
  {
    step: "03",
    title: "Connect Facebook and review",
    body: "Hook in your account, confirm settings, and approve the campaign.",
  },
  {
    step: "04",
    title: "Launch and monitor",
    body: "Track performance and keep optimization inside one clean dashboard.",
  },
];

const featureRows = [
  {
    title: "A simpler path than Ads Manager",
    body: "Smartemark is built for business owners who want results without getting buried in Meta’s interface.",
  },
  {
    title: "AI-generated copy and creatives",
    body: "From one business input, Smartemark builds launch-ready marketing assets fast.",
  },
  {
    title: "Facebook connection and live metrics",
    body: "Launch from one place and keep the campaign view clean, visual, and easy to explain in demos.",
  },
  {
    title: "Made for a real sales flow",
    body: "The product is designed so you can open it on a call, walk through it quickly, and close with confidence.",
  },
];

const benefitCards = [
  {
    title: "Built for speed",
    body: "Get from business info to campaign setup without the usual agency delay.",
  },
  {
    title: "Built for simplicity",
    body: "A cleaner interface for owners who do not want to learn complicated ad tools.",
  },
  {
    title: "Built for control",
    body: "Keep launch settings, billing, and campaign monitoring all in one flow.",
  },
];

const faqList = [
  {
    question: "Do I need ad experience?",
    answer:
      "No. Smartemark is built to reduce complexity and help you launch without needing to learn the full ad platform.",
  },
  {
    question: "Does Smartemark create the ad copy too?",
    answer:
      "Yes. It helps generate campaign copy and creative direction so you can move faster.",
  },
  {
    question: "Can I still control the campaign?",
    answer:
      "Yes. You still choose the business inputs, review the setup, and control launch decisions.",
  },
  {
    question: "Who is this best for?",
    answer:
      "It is best for businesses that want a faster, simpler way to launch Facebook ads without relying fully on an agency.",
  },
];

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
    const top = window.scrollY + el.getBoundingClientRect().top - 24;
    window.scrollTo({ top, behavior: "smooth" });
  };

  const sectionWrap = {
    width: "100%",
    display: "flex",
    justifyContent: "center",
    padding: isMobile ? "0 14px" : "0 24px",
    boxSizing: "border-box",
  };

  const cardShadow = "0 20px 60px rgba(91,92,240,0.10)";

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: `linear-gradient(180deg, ${BG} 0%, #f7f7ff 34%, #eef4ff 100%)`,
        fontFamily: FONT,
        color: TEXT,
        position: "relative",
        overflowX: "hidden",
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0;
          min-height: 100%;
          background: ${BG};
        }

        * {
          box-sizing: border-box;
        }

        @keyframes floatA {
          0%,100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(-18px) translateX(10px); }
        }

        @keyframes floatB {
          0%,100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(18px) translateX(-12px); }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          top: -140,
          right: -180,
          width: isMobile ? 340 : 620,
          height: isMobile ? 340 : 620,
          background: "radial-gradient(circle, rgba(91,92,240,0.22) 0%, rgba(91,92,240,0.05) 40%, transparent 72%)",
          filter: "blur(20px)",
          pointerEvents: "none",
          animation: "floatA 18s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 220,
          left: -150,
          width: isMobile ? 280 : 520,
          height: isMobile ? 280 : 520,
          background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, rgba(139,92,246,0.04) 42%, transparent 72%)",
          filter: "blur(22px)",
          pointerEvents: "none",
          animation: "floatB 20s ease-in-out infinite",
        }}
      />

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            padding: isMobile ? "18px 0 0" : "24px 0 0",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              background: "rgba(255,255,255,0.74)",
              backdropFilter: "blur(14px)",
              border: `1px solid ${BORDER}`,
              borderRadius: 22,
              padding: isMobile ? "14px 14px" : "16px 20px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 14,
              boxShadow: "0 12px 40px rgba(79,107,255,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                minWidth: 0,
              }}
            >
              <img
                src={smartmarkLogo}
                alt="SmarteMark"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  flex: "0 0 auto",
                }}
              />
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: -0.8 }}>Smartemark</div>
            </div>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: isMobile ? "space-between" : "flex-end",
                gap: 10,
              }}
            >
              <button
                onClick={scrollToFaq}
                style={{
                  border: "none",
                  background: "transparent",
                  color: TEXT_SOFT,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  padding: "10px 12px",
                }}
              >
                FAQ
              </button>

              <button
                onClick={goToPricing}
                style={{
                  border: "none",
                  background: "transparent",
                  color: TEXT_SOFT,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  padding: "10px 12px",
                }}
              >
                Pricing
              </button>

              <button
                onClick={goToLogin}
                style={{
                  border: "none",
                  background: "transparent",
                  color: TEXT,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  padding: "10px 12px",
                }}
              >
                Login
              </button>

              <button
                onClick={() => openEarlyAccess("header_start_campaign")}
                style={{
                  border: "none",
                  background: BTN_BASE,
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 15,
                  borderRadius: 999,
                  padding: "13px 18px",
                  cursor: "pointer",
                  boxShadow: "0 14px 34px rgba(79,107,255,0.24)",
                }}
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingTop: isMobile ? 30 : 34,
            paddingBottom: isMobile ? 44 : 54,
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1.08fr 0.92fr",
              gap: isMobile ? 20 : 28,
              alignItems: "stretch",
              background: "linear-gradient(135deg, rgba(255,255,255,0.94), rgba(247,248,255,0.94))",
              border: `1px solid ${BORDER}`,
              borderRadius: 34,
              boxShadow: cardShadow,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: isMobile ? "28px 20px 24px" : "52px 48px 46px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 18,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  color: ACCENT,
                  fontWeight: 900,
                  fontSize: 12,
                  border: `1px solid ${BORDER}`,
                }}
              >
                AI-powered campaign launch system
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? "2.8rem" : "5rem",
                  lineHeight: 0.98,
                  letterSpacing: isMobile ? "-1.5px" : "-3px",
                  fontWeight: 900,
                  color: "#0f172a",
                  maxWidth: 680,
                }}
              >
                Launch better Facebook ads without the usual mess
              </h1>

              <div
                style={{
                  fontSize: isMobile ? "1.05rem" : "1.35rem",
                  lineHeight: 1.6,
                  color: TEXT_SOFT,
                  maxWidth: 650,
                  fontWeight: 500,
                }}
              >
                Smartemark helps businesses move from idea to campaign faster with AI-generated copy,
                creative workflow, Facebook connection, and a cleaner launch experience.
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 4,
                }}
              >
                <button
                  onClick={() => openEarlyAccess("hero_get_started")}
                  style={{
                    border: "none",
                    background: BTN_BASE,
                    color: "#fff",
                    fontWeight: 900,
                    fontSize: 16,
                    borderRadius: 999,
                    padding: "15px 22px",
                    cursor: "pointer",
                    boxShadow: "0 14px 34px rgba(79,107,255,0.24)",
                  }}
                >
                  Get Started
                </button>

                <button
                  onClick={goToPricing}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: "#f3f4f6",
                    color: TEXT,
                    fontWeight: 800,
                    fontSize: 16,
                    borderRadius: 999,
                    padding: "15px 22px",
                    cursor: "pointer",
                  }}
                >
                  View Pricing
                </button>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  marginTop: 10,
                }}
              >
                {heroStats.map((item) => (
                  <div
                    key={item.label}
                    style={{
                      minWidth: 110,
                      background: "#ffffff",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#111827" }}>{item.value}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, marginTop: 4 }}>
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                minHeight: isMobile ? 320 : 620,
                position: "relative",
                background:
                  "linear-gradient(145deg, rgba(240,243,255,1) 0%, rgba(228,232,255,1) 38%, rgba(208,211,255,0.95) 60%, rgba(184,188,255,0.98) 100%)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(120deg, transparent 10%, rgba(255,255,255,0.78) 32%, rgba(255,255,255,0.16) 46%, transparent 60%)",
                  transform: "skewX(-16deg)",
                  left: "8%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(120deg, transparent 32%, rgba(255,255,255,0.58) 48%, rgba(121,93,255,0.18) 66%, transparent 78%)",
                  transform: "skewX(-18deg)",
                  left: "26%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: isMobile ? 20 : 34,
                  right: isMobile ? 16 : 28,
                  left: isMobile ? 16 : 34,
                  background: "rgba(255,255,255,0.82)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 24,
                  boxShadow: "0 16px 44px rgba(91,92,240,0.12)",
                  padding: isMobile ? 16 : 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 900 }}>Smartemark Dashboard</div>
                    <div style={{ fontSize: 13, color: TEXT_SOFT, marginTop: 4 }}>
                      Cleaner launch flow. Better presentation.
                    </div>
                  </div>
                  <div
                    style={{
                      background: "#eef2ff",
                      color: ACCENT,
                      borderRadius: 999,
                      padding: "7px 10px",
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    Live
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10,
                    marginBottom: 14,
                  }}
                >
                  {[
                    ["CTR", "2.8%"],
                    ["CPC", "$1.92"],
                    ["Spend", "$84"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      style={{
                        background: "#ffffff",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 16,
                        padding: "14px 12px",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 800, color: TEXT_SOFT }}>{label}</div>
                      <div style={{ fontSize: 19, fontWeight: 900, marginTop: 6 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: SURFACE_ALT,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 18,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 15 }}>AI campaign summary</div>
                  <div style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.6 }}>
                    Smartemark generated copy, connected the campaign flow, and keeps performance visible
                    inside a simpler workspace.
                  </div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "#e6eaff",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "72%",
                        height: "100%",
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${ACCENT_3}, ${ACCENT_2})`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  right: isMobile ? 18 : 34,
                  bottom: isMobile ? 18 : 30,
                  width: isMobile ? 180 : 220,
                  background: "rgba(255,255,255,0.85)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20,
                  padding: 14,
                  boxShadow: "0 18px 42px rgba(91,92,240,0.14)",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 8 }}>Launch status</div>
                <div style={{ fontSize: 12, color: TEXT_SOFT, lineHeight: 1.5 }}>
                  Copy ready. Budget set. Facebook connected. Campaign ready to launch.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingBottom: isMobile ? 24 : 40,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
              gap: 14,
            }}
          >
            <div
              style={{
                background: "rgba(255,255,255,0.72)",
                border: `1px solid ${BORDER}`,
                borderRadius: 20,
                padding: "20px 18px",
                fontSize: isMobile ? 20 : 24,
                fontWeight: 900,
                lineHeight: 1.2,
                boxShadow: "0 14px 36px rgba(91,92,240,0.06)",
              }}
            >
              Simpler campaign setup for real business owners
            </div>

            {["Meta-ready workflow", "AI-generated creatives", "Cleaner sales demos"].map((label) => (
              <div
                key={label}
                style={{
                  background: "rgba(255,255,255,0.72)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 20,
                  padding: "20px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontWeight: 900,
                  color: TEXT,
                  boxShadow: "0 14px 36px rgba(91,92,240,0.06)",
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingTop: isMobile ? 18 : 22,
            paddingBottom: isMobile ? 52 : 70,
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: 22,
            }}
          >
            <div
              style={{
                display: "inline-flex",
                padding: "8px 12px",
                borderRadius: 999,
                background: "#eef2ff",
                color: ACCENT,
                fontWeight: 900,
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                marginBottom: 14,
              }}
            >
              How it works
            </div>
            <div style={{ fontSize: isMobile ? 30 : 46, fontWeight: 900, letterSpacing: -1.4 }}>
              A clean flow from idea to launch
            </div>
            <div
              style={{
                marginTop: 10,
                color: TEXT_SOFT,
                fontSize: isMobile ? 15 : 18,
                lineHeight: 1.7,
                maxWidth: 760,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              The page is longer now on purpose so it feels more like a full product landing page, not a
              short placeholder.
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)",
              gap: 16,
            }}
          >
            {processSteps.map((item) => (
              <div
                key={item.step}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,255,0.96))",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 24,
                  padding: "22px 20px",
                  minHeight: 220,
                  boxShadow: "0 18px 42px rgba(91,92,240,0.08)",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: "#eef2ff",
                    color: ACCENT,
                    fontWeight: 900,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  {item.step}
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15, marginBottom: 10 }}>
                  {item.title}
                </div>
                <div style={{ color: TEXT_SOFT, fontSize: 15, lineHeight: 1.7 }}>{item.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingBottom: isMobile ? 48 : 70,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "0.95fr 1.05fr",
              gap: 18,
            }}
          >
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${BORDER}`,
                borderRadius: 28,
                padding: isMobile ? "24px 20px" : "30px 28px",
                boxShadow: cardShadow,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "#eef2ff",
                  color: ACCENT,
                  fontWeight: 900,
                  fontSize: 12,
                  border: `1px solid ${BORDER}`,
                  marginBottom: 14,
                }}
              >
                Why Smartemark
              </div>

              <div style={{ fontSize: isMobile ? 30 : 42, fontWeight: 900, lineHeight: 1.04, letterSpacing: -1.4 }}>
                Show a serious product in your demos
              </div>

              <div
                style={{
                  marginTop: 14,
                  color: TEXT_SOFT,
                  fontSize: isMobile ? 15 : 17,
                  lineHeight: 1.8,
                }}
              >
                This design direction feels more premium, more modern, and more trustworthy. It gives you a
                page that looks like a real SaaS company rather than a quick placeholder page.
              </div>

              <div
                style={{
                  marginTop: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {benefitCards.map((card) => (
                  <div
                    key={card.title}
                    style={{
                      background: SURFACE_ALT,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: "18px 16px",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>{card.title}</div>
                    <div style={{ color: TEXT_SOFT, lineHeight: 1.7, fontSize: 15 }}>{card.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 14,
              }}
            >
              {featureRows.map((row) => (
                <div
                  key={row.title}
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.96), rgba(247,248,255,0.96))",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 24,
                    padding: "24px 22px",
                    boxShadow: "0 18px 42px rgba(91,92,240,0.08)",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 22, marginBottom: 10, lineHeight: 1.15 }}>
                    {row.title}
                  </div>
                  <div style={{ color: TEXT_SOFT, fontSize: 15, lineHeight: 1.75 }}>{row.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingBottom: isMobile ? 52 : 72,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, rgba(79,107,255,0.96), rgba(139,92,246,0.96))",
              borderRadius: 32,
              padding: isMobile ? "28px 20px" : "42px 38px",
              color: "#fff",
              boxShadow: "0 22px 60px rgba(91,92,240,0.24)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr auto",
                gap: 18,
                alignItems: "center",
              }}
            >
              <div>
                <div style={{ fontSize: isMobile ? 30 : 44, fontWeight: 900, lineHeight: 1.04, letterSpacing: -1.4 }}>
                  Ready to show Smartemark with more confidence?
                </div>
                <div
                  style={{
                    marginTop: 12,
                    color: "rgba(255,255,255,0.88)",
                    fontSize: isMobile ? 15 : 18,
                    lineHeight: 1.7,
                    maxWidth: 720,
                  }}
                >
                  Give yourself a cleaner home page, a longer story, and a stronger first impression before
                  the user even reaches the product.
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  justifyContent: isMobile ? "flex-start" : "flex-end",
                }}
              >
                <button
                  onClick={() => openEarlyAccess("mid_page_cta")}
                  style={{
                    border: "none",
                    background: "#ffffff",
                    color: ACCENT,
                    fontWeight: 900,
                    fontSize: 15,
                    borderRadius: 999,
                    padding: "14px 20px",
                    cursor: "pointer",
                  }}
                >
                  Get Started
                </button>

                <button
                  onClick={goToLogin}
                  style={{
                    border: "1px solid rgba(255,255,255,0.22)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    fontWeight: 900,
                    fontSize: 15,
                    borderRadius: 999,
                    padding: "14px 20px",
                    cursor: "pointer",
                  }}
                >
                  Login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div ref={faqRef} style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 980,
            paddingBottom: isMobile ? 46 : 68,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div
              style={{
                display: "inline-flex",
                padding: "8px 12px",
                borderRadius: 999,
                background: "#eef2ff",
                color: ACCENT,
                fontWeight: 900,
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                marginBottom: 14,
              }}
            >
              FAQ
            </div>
            <div style={{ fontSize: isMobile ? 30 : 44, fontWeight: 900, letterSpacing: -1.4 }}>
              Frequently asked questions
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            {faqList.map((item) => (
              <div
                key={item.question}
                style={{
                  background: "rgba(255,255,255,0.9)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 22,
                  padding: isMobile ? "18px 16px" : "20px 20px",
                  boxShadow: "0 16px 42px rgba(91,92,240,0.06)",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>{item.question}</div>
                <div style={{ color: TEXT_SOFT, lineHeight: 1.75, fontSize: 15 }}>{item.answer}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 26,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              style={{
                border: `1px solid ${BORDER}`,
                background: "#ffffff",
                color: TEXT,
                fontWeight: 800,
                fontSize: 15,
                borderRadius: 999,
                padding: "13px 18px",
                cursor: "pointer",
              }}
            >
              Back to top
            </button>
          </div>
        </div>
      </div>

      <div style={sectionWrap}>
        <div
          style={{
            width: "100%",
            maxWidth: 1180,
            paddingBottom: 24,
          }}
        >
          <div
            style={{
              borderTop: `1px solid ${BORDER}`,
              paddingTop: 18,
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              gap: 10,
              color: TEXT_SOFT,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <div>Smartemark</div>
            <a
              href="mailto:knowwilltech@gmail.com"
              style={{
                color: TEXT_SOFT,
                textDecoration: "none",
              }}
            >
              knowwilltech@gmail.com
            </a>
          </div>
        </div>
      </div>

      {eaOpen && (
        <div
          onClick={closeEarlyAccess}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.50)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isMobile ? "94vw" : 520,
              borderRadius: 22,
              padding: isMobile ? "18px 16px" : "22px 20px",
              background: "#ffffff",
              border: `1px solid ${BORDER}`,
              boxShadow: "0 28px 70px rgba(91,92,240,0.18)",
              position: "relative",
            }}
          >
            <button
              onClick={closeEarlyAccess}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 34,
                height: 34,
                borderRadius: 999,
                border: `1px solid ${BORDER}`,
                background: "#f7f8ff",
                color: TEXT,
                cursor: "pointer",
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div style={{ fontWeight: 900, fontSize: isMobile ? 22 : 24, marginBottom: 8 }}>
              Early Access
            </div>

            <div style={{ color: TEXT_SOFT, lineHeight: 1.7, fontWeight: 600 }}>
              Smartemark is onboarding a limited number of users. Join the list and we’ll reach out.
            </div>

            <div style={{ height: 12 }} />

            {!eaSubmitted ? (
              <form onSubmit={submitEarlyAccess} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input
                    value={eaName}
                    onChange={(e) => setEaName(e.target.value)}
                    placeholder="Name"
                    style={{
                      width: "100%",
                      padding: "0.82rem 0.95rem",
                      borderRadius: 14,
                      border: `1px solid ${BORDER}`,
                      background: "#ffffff",
                      color: TEXT,
                      outline: "none",
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  />

                  <input
                    value={eaEmail}
                    onChange={(e) => setEaEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    style={{
                      width: "100%",
                      padding: "0.82rem 0.95rem",
                      borderRadius: 14,
                      border: `1px solid ${BORDER}`,
                      background: "#ffffff",
                      color: TEXT,
                      outline: "none",
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      marginTop: 4,
                      padding: "0.9rem 1.2rem",
                      fontSize: "1rem",
                      background: BTN_BASE,
                      color: "#fff",
                      border: "none",
                      borderRadius: 999,
                      fontWeight: 900,
                      boxShadow: "0 14px 34px rgba(79,107,255,0.24)",
                      cursor: "pointer",
                    }}
                  >
                    Submit
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: TEXT }}>
                  Thank you — we’ll reach out soon.
                </div>
                <div style={{ marginTop: 8, color: TEXT_SOFT, fontWeight: 600, lineHeight: 1.7 }}>
                  {eaServerOk ? (
                    <>Your request was received.</>
                  ) : (
                    <>
                      To be safe, click{" "}
                      <a
                        href={mailtoHref}
                        style={{
                          color: ACCENT,
                          fontWeight: 900,
                          textDecoration: "none",
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
                    color: TEXT,
                    background: "#f7f8ff",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontWeight: 800,
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