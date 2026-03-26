import React, { useRef, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";
import { trackEvent } from "../analytics/gaEvents";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const BG = "#d9dcff";
const BG_2 = "#eef1ff";
const SURFACE = "rgba(255,255,255,0.78)";
const SURFACE_SOFT = "rgba(255,255,255,0.62)";
const BORDER = "rgba(94, 99, 255, 0.14)";
const TEXT = "#151826";
const TEXT_SOFT = "#6b7280";

const PURPLE_DARK = "#6b63ff";
const PURPLE = "#8d86ff";
const PURPLE_LIGHT = "#c8c5ff";
const BLUE_SOFT = "#9fb4ff";
const BTN = "#4d6bff";
const BTN_HOVER = "#3f5cf0";

const EARLY_ACCESS_ENDPOINT = "https://formspree.io/f/mqeqaozw";

const processSteps = [
  { num: "01", title: "Business info" },
  { num: "02", title: "AI builds ads" },
  { num: "03", title: "Connect Facebook" },
  { num: "04", title: "Launch" },
];

const featureCards = [
  {
    title: "Simpler setup",
    body: "A cleaner flow than Ads Manager.",
  },
  {
    title: "AI creatives",
    body: "Copy and assets in one place.",
  },
  {
    title: "Live metrics",
    body: "Track campaigns inside Smartemark.",
  },
];

const faqList = [
  {
    question: "Do I need ad experience?",
    answer: "No. Smartemark is built to keep campaign setup simple.",
  },
  {
    question: "Does it help make the ads?",
    answer: "Yes. It helps generate copy and creative direction fast.",
  },
  {
    question: "Can I still control the launch?",
    answer: "Yes. You review the setup and decide when to launch.",
  },
  {
    question: "Who is it for?",
    answer: "Businesses that want a faster, cleaner way to run Facebook ads.",
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

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: `linear-gradient(180deg, ${BG} 0%, ${BG_2} 42%, #f5f6ff 100%)`,
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
          50% { transform: translateY(-14px) translateX(8px); }
        }

        @keyframes floatB {
          0%,100% { transform: translateY(0px) translateX(0px); }
          50% { transform: translateY(14px) translateX(-10px); }
        }
      `}</style>

      <div
        style={{
          position: "absolute",
          top: -120,
          right: -180,
          width: isMobile ? 320 : 620,
          height: isMobile ? 320 : 620,
          background: "radial-gradient(circle, rgba(107,99,255,0.26) 0%, rgba(107,99,255,0.08) 42%, transparent 72%)",
          filter: "blur(24px)",
          pointerEvents: "none",
          animation: "floatA 18s ease-in-out infinite",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 180,
          left: -160,
          width: isMobile ? 260 : 520,
          height: isMobile ? 260 : 520,
          background: "radial-gradient(circle, rgba(159,180,255,0.22) 0%, rgba(159,180,255,0.06) 42%, transparent 72%)",
          filter: "blur(26px)",
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
              background: SURFACE,
              backdropFilter: "blur(16px)",
              border: `1px solid ${BORDER}`,
              borderRadius: 22,
              padding: isMobile ? "14px" : "16px 20px",
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 12,
              boxShadow: "0 18px 40px rgba(88, 89, 202, 0.08)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <img
                src={smartmarkLogo}
                alt="Smartemark"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  flex: "0 0 auto",
                }}
              />
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.7 }}>
                Smartemark
              </div>
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
                  fontWeight: 700,
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
                  fontWeight: 700,
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
                  fontWeight: 700,
                  fontSize: 15,
                  cursor: "pointer",
                  padding: "10px 12px",
                }}
              >
                Login
              </button>

              <button
                onClick={() => openEarlyAccess("header_start_campaign")}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = BTN_HOVER;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = BTN;
                }}
                style={{
                  border: "none",
                  background: BTN,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 15,
                  borderRadius: 999,
                  padding: "13px 18px",
                  cursor: "pointer",
                  transition: "background .18s ease",
                  boxShadow: "0 12px 28px rgba(77,107,255,0.22)",
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
            paddingBottom: isMobile ? 46 : 58,
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "1.02fr 0.98fr",
              gap: isMobile ? 18 : 26,
              alignItems: "stretch",
              background: "linear-gradient(135deg, rgba(255,255,255,0.88), rgba(246,247,255,0.82))",
              border: `1px solid ${BORDER}`,
              borderRadius: 34,
              boxShadow: "0 22px 56px rgba(88, 89, 202, 0.10)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: isMobile ? "28px 20px 24px" : "50px 46px 44px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  alignSelf: "flex-start",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(107,99,255,0.08)",
                  color: PURPLE_DARK,
                  fontWeight: 700,
                  fontSize: 12,
                  border: `1px solid ${BORDER}`,
                }}
              >
                AI-powered ad workflow
              </div>

              <h1
                style={{
                  margin: 0,
                  fontSize: isMobile ? "2.9rem" : "4.7rem",
                  lineHeight: 0.98,
                  letterSpacing: isMobile ? "-1.8px" : "-3px",
                  fontWeight: 700,
                  color: "#111320",
                  maxWidth: 660,
                }}
              >
                Launch ads with a cleaner system
              </h1>

              <div
                style={{
                  fontSize: isMobile ? "1.02rem" : "1.22rem",
                  lineHeight: 1.7,
                  color: TEXT_SOFT,
                  maxWidth: 600,
                  fontWeight: 500,
                }}
              >
                Smartemark helps you go from business info to campaign launch in one modern flow.
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
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = BTN_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = BTN;
                  }}
                  style={{
                    border: "none",
                    background: BTN,
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 16,
                    borderRadius: 999,
                    padding: "15px 22px",
                    cursor: "pointer",
                    transition: "background .18s ease",
                    boxShadow: "0 14px 34px rgba(77,107,255,0.22)",
                  }}
                >
                  Get Started
                </button>

                <button
                  onClick={goToPricing}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: "rgba(255,255,255,0.72)",
                    color: TEXT,
                    fontWeight: 700,
                    fontSize: 16,
                    borderRadius: 999,
                    padding: "15px 22px",
                    cursor: "pointer",
                  }}
                >
                  Pricing
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
                {featureCards.map((item) => (
                  <div
                    key={item.title}
                    style={{
                      minWidth: isMobile ? "100%" : 150,
                      background: "rgba(255,255,255,0.66)",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 18,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#171923" }}>
                      {item.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: TEXT_SOFT,
                        marginTop: 5,
                        lineHeight: 1.5,
                      }}
                    >
                      {item.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                minHeight: isMobile ? 340 : 620,
                position: "relative",
                background:
                  "linear-gradient(145deg, #d4d6ff 0%, #cbc8ff 24%, #b4afff 46%, #9a92ff 68%, #ececff 100%)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(120deg, transparent 12%, rgba(255,255,255,0.74) 33%, rgba(255,255,255,0.12) 46%, transparent 61%)",
                  transform: "skewX(-16deg)",
                  left: "6%",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "linear-gradient(120deg, transparent 34%, rgba(255,255,255,0.52) 50%, rgba(149,141,255,0.26) 65%, transparent 78%)",
                  transform: "skewX(-18deg)",
                  left: "28%",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  top: isMobile ? 18 : 28,
                  right: isMobile ? 16 : 26,
                  left: isMobile ? 16 : 28,
                  background: "rgba(255,255,255,0.76)",
                  backdropFilter: "blur(12px)",
                  border: `1px solid rgba(255,255,255,0.45)`,
                  borderRadius: 24,
                  boxShadow: "0 18px 42px rgba(91,92,240,0.10)",
                  padding: isMobile ? 16 : 20,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>Smartemark</div>
                    <div style={{ fontSize: 12, color: TEXT_SOFT, marginTop: 4 }}>
                      Campaign workspace
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(107,99,255,0.10)",
                      color: PURPLE_DARK,
                      borderRadius: 999,
                      padding: "7px 10px",
                      fontWeight: 700,
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
                    marginBottom: 12,
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
                        background: "rgba(255,255,255,0.82)",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 16,
                        padding: "14px 12px",
                      }}
                    >
                      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SOFT }}>{label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{value}</div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: "rgba(255,255,255,0.62)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 18,
                    padding: 15,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>AI status</div>
                  <div
                    style={{
                      height: 10,
                      borderRadius: 999,
                      background: "rgba(107,99,255,0.12)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: "72%",
                        height: "100%",
                        borderRadius: 999,
                        background: "linear-gradient(90deg, #88a0ff, #8d86ff, #6b63ff)",
                      }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {["Copy", "Creatives", "Metrics"].map((chip) => (
                      <div
                        key={chip}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.7)",
                          border: `1px solid ${BORDER}`,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#42455a",
                        }}
                      >
                        {chip}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                style={{
                  position: "absolute",
                  left: isMobile ? 16 : 28,
                  right: isMobile ? 16 : "auto",
                  bottom: isMobile ? 18 : 28,
                  width: isMobile ? "auto" : 220,
                  background: "rgba(255,255,255,0.72)",
                  border: `1px solid rgba(255,255,255,0.45)`,
                  borderRadius: 20,
                  padding: 14,
                  boxShadow: "0 16px 34px rgba(91,92,240,0.10)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                  Ready to launch
                </div>
                <div style={{ fontSize: 12, color: TEXT_SOFT, lineHeight: 1.5 }}>
                  Facebook connected. Budget set. Ads ready.
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
            paddingBottom: isMobile ? 46 : 64,
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
                background: SURFACE_SOFT,
                border: `1px solid ${BORDER}`,
                borderRadius: 22,
                padding: "20px 18px",
                fontSize: isMobile ? 22 : 26,
                fontWeight: 700,
                lineHeight: 1.2,
                boxShadow: "0 14px 32px rgba(88, 89, 202, 0.06)",
              }}
            >
              A better way to present your product
            </div>

            {["Clean UI", "AI workflow", "Modern launch flow"].map((label) => (
              <div
                key={label}
                style={{
                  background: SURFACE_SOFT,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 22,
                  padding: "20px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  fontWeight: 700,
                  color: TEXT,
                  boxShadow: "0 14px 32px rgba(88, 89, 202, 0.06)",
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
            paddingBottom: isMobile ? 50 : 70,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 22 }}>
            <div
              style={{
                display: "inline-flex",
                padding: "8px 12px",
                borderRadius: 999,
                background: "rgba(107,99,255,0.08)",
                color: PURPLE_DARK,
                fontWeight: 700,
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                marginBottom: 14,
              }}
            >
              How it works
            </div>

            <div
              style={{
                fontSize: isMobile ? 30 : 44,
                fontWeight: 700,
                letterSpacing: -1.4,
              }}
            >
              Simple from start to finish
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
                key={item.num}
                style={{
                  background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(247,248,255,0.78))",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 24,
                  padding: "22px 20px",
                  minHeight: 200,
                  boxShadow: "0 18px 40px rgba(88, 89, 202, 0.08)",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    background: "rgba(107,99,255,0.08)",
                    color: PURPLE_DARK,
                    fontWeight: 700,
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 18,
                  }}
                >
                  {item.num}
                </div>
                <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.15 }}>
                  {item.title}
                </div>
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
            paddingBottom: isMobile ? 48 : 72,
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
                boxShadow: "0 20px 50px rgba(88, 89, 202, 0.08)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  padding: "8px 12px",
                  borderRadius: 999,
                  background: "rgba(107,99,255,0.08)",
                  color: PURPLE_DARK,
                  fontWeight: 700,
                  fontSize: 12,
                  border: `1px solid ${BORDER}`,
                  marginBottom: 14,
                }}
              >
                Why Smartemark
              </div>

              <div
                style={{
                  fontSize: isMobile ? 30 : 40,
                  fontWeight: 700,
                  lineHeight: 1.06,
                  letterSpacing: -1.3,
                }}
              >
                Cleaner. Faster. Easier to show.
              </div>

              <div
                style={{
                  marginTop: 14,
                  color: TEXT_SOFT,
                  fontSize: isMobile ? 15 : 17,
                  lineHeight: 1.75,
                }}
              >
                A landing page that feels more modern without being loud.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 14,
              }}
            >
              {[
                "Soft gradients",
                "Less text",
                "Longer page",
                "Better visuals",
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    background: "linear-gradient(180deg, rgba(255,255,255,0.88), rgba(247,248,255,0.78))",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 22,
                    padding: "24px 20px",
                    minHeight: 130,
                    display: "flex",
                    alignItems: "flex-end",
                    fontWeight: 700,
                    fontSize: 20,
                    boxShadow: "0 16px 34px rgba(88, 89, 202, 0.08)",
                  }}
                >
                  {item}
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
            paddingBottom: isMobile ? 52 : 74,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, rgba(93,88,255,0.96), rgba(141,134,255,0.96), rgba(200,197,255,0.92))",
              borderRadius: 32,
              padding: isMobile ? "28px 20px" : "42px 38px",
              color: "#fff",
              boxShadow: "0 24px 60px rgba(88, 89, 202, 0.20)",
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
                <div
                  style={{
                    fontSize: isMobile ? 30 : 42,
                    fontWeight: 700,
                    lineHeight: 1.06,
                    letterSpacing: -1.4,
                  }}
                >
                  Build trust before the demo even starts
                </div>
                <div
                  style={{
                    marginTop: 12,
                    color: "rgba(255,255,255,0.88)",
                    fontSize: isMobile ? 15 : 18,
                    lineHeight: 1.7,
                    maxWidth: 700,
                  }}
                >
                  A calmer page. Better color. More premium feel.
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
                    color: PURPLE_DARK,
                    fontWeight: 700,
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
                    border: "1px solid rgba(255,255,255,0.24)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#ffffff",
                    fontWeight: 700,
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
                background: "rgba(107,99,255,0.08)",
                color: PURPLE_DARK,
                fontWeight: 700,
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                marginBottom: 14,
              }}
            >
              FAQ
            </div>
            <div
              style={{
                fontSize: isMobile ? 30 : 42,
                fontWeight: 700,
                letterSpacing: -1.4,
              }}
            >
              Questions
            </div>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            {faqList.map((item) => (
              <div
                key={item.question}
                style={{
                  background: "rgba(255,255,255,0.84)",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 22,
                  padding: isMobile ? "18px 16px" : "20px 20px",
                  boxShadow: "0 14px 34px rgba(88, 89, 202, 0.06)",
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
                  {item.question}
                </div>
                <div style={{ color: TEXT_SOFT, lineHeight: 1.7, fontSize: 15 }}>
                  {item.answer}
                </div>
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
                fontWeight: 700,
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
              fontWeight: 600,
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
            background: "rgba(15, 23, 42, 0.44)",
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
              boxShadow: "0 28px 70px rgba(88, 89, 202, 0.18)",
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
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <div style={{ fontWeight: 700, fontSize: isMobile ? 22 : 24, marginBottom: 8 }}>
              Early Access
            </div>

            <div style={{ color: TEXT_SOFT, lineHeight: 1.7, fontWeight: 500 }}>
              Join the list and we’ll reach out.
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
                      fontWeight: 600,
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
                      fontWeight: 600,
                      fontSize: 15,
                    }}
                  />

                  <button
                    type="submit"
                    style={{
                      marginTop: 4,
                      padding: "0.9rem 1.2rem",
                      fontSize: "1rem",
                      background: BTN,
                      color: "#fff",
                      border: "none",
                      borderRadius: 999,
                      fontWeight: 700,
                      boxShadow: "0 14px 34px rgba(77,107,255,0.24)",
                      cursor: "pointer",
                    }}
                  >
                    Submit
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>
                  Thank you
                </div>
                <div style={{ marginTop: 8, color: TEXT_SOFT, fontWeight: 500, lineHeight: 1.7 }}>
                  {eaServerOk ? (
                    <>Your request was received.</>
                  ) : (
                    <>
                      To be safe, click{" "}
                      <a
                        href={mailtoHref}
                        style={{
                          color: PURPLE_DARK,
                          fontWeight: 700,
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
                    fontWeight: 700,
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