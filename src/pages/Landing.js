/* eslint-disable */
import React, { useEffect, useState } from "react";
import { FaBolt, FaChevronDown } from "react-icons/fa";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const BG = "linear-gradient(180deg, #edf0ff 0%, #f5f6ff 60%, #fafbff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#626b86";
const PURPLE = "#5d59ea";
const BORDER = "rgba(93, 89, 234, 0.12)";
const PANEL_STRONG = "rgba(255,255,255,0.96)";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER = "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";
const SOFT_SHADOW = "0 8px 24px rgba(83, 77, 212, 0.07)";

const FAQS = [
  {
    q: "Do I need ad experience?",
    a: "No. Smartemark is built for business owners who do not want to learn complicated ad software or hire an agency just to launch ads.",
  },
  {
    q: "What does Smartemark actually do?",
    a: "Smartemark takes in your business information, creates ad creatives, launches campaigns through your connected Facebook ad account, and manages campaign performance.",
  },
  {
    q: "Do I use my own Facebook ad account?",
    a: "Yes. You connect your own account so your campaigns run under your business while Smartemark handles the workflow.",
  },
  {
    q: "Is this an agency?",
    a: "No. Smartemark is AI marketing automation software designed to simplify launching and managing ads.",
  },
];

function CTAButton({ children, onClick }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none",
        border: "none",
        background: hover ? BTN_HOVER : BTN,
        color: "#fff",
        borderRadius: 999,
        padding: "13px 28px",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: FONT,
        boxShadow: "0 8px 22px rgba(93,89,234,0.18)",
        transition: "all 160ms ease",
        letterSpacing: "-0.01em",
      }}
    >
      {children}
    </button>
  );
}

function SectionTag({ children }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "7px 13px",
        borderRadius: 999,
        border: `1px solid ${BORDER}`,
        background: "rgba(255,255,255,0.65)",
        color: PURPLE,
        fontWeight: 500,
        fontSize: 12,
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </div>
  );
}

function FAQItem({ item, open, onToggle }) {
  return (
    <div
      style={{
        background: PANEL_STRONG,
        border: `1px solid ${BORDER}`,
        borderRadius: 20,
        overflow: "hidden",
        boxShadow: SOFT_SHADOW,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "22px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          textAlign: "left",
          fontFamily: FONT,
        }}
      >
        <span
          style={{
            color: TEXT,
            fontSize: 16,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {item.q}
        </span>

        <span
          style={{
            color: PURPLE,
            flex: "0 0 auto",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 180ms ease",
            opacity: 0.7,
          }}
        >
          <FaChevronDown />
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0 24px 22px",
            color: TEXT_SOFT,
            fontSize: 15,
            fontWeight: 400,
            lineHeight: 1.8,
          }}
        >
          {item.a}
        </div>
      )}
    </div>
  );
}

export default function Landing() {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 920);
  const [openFaq, setOpenFaq] = useState(-1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    try {
      const ns =
        sessionStorage.getItem("sm_user_ns_v1") ||
        localStorage.getItem("sm_user_ns_v1") ||
        "anon";
      setIsLoggedIn(!!ns && ns !== "anon");
    } catch {
      setIsLoggedIn(false);
    }
  }, []);

  const goToForm = () => {
    window.location.href = "/form";
  };

  const scrollToFaq = () => {
    const el = document.getElementById("landing-faq");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: BG,
        fontFamily: FONT,
        color: TEXT,
      }}
    >
      <style>{`
        @keyframes smDrift1 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33%       { transform: translate(38px, -30px) scale(1.06); }
          66%       { transform: translate(-20px, 18px) scale(0.97); }
        }
        @keyframes smDrift2 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          40%       { transform: translate(-46px, 28px) scale(1.04); }
          72%       { transform: translate(24px, -16px) scale(0.98); }
        }
        @keyframes smDrift3 {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          50%       { transform: translate(30px, 38px) scale(1.03); }
        }
        @keyframes smPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.42; transform: scale(0.82); }
        }
        @keyframes smSheen {
          0%   { transform: translateX(-120%) skewX(-12deg); }
          100% { transform: translateX(280%) skewX(-12deg); }
        }
      `}</style>
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Static base radials — kept faint since blobs carry the glow now */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 12% 8%, rgba(123,114,255,0.05), transparent 32%), radial-gradient(circle at 84% 16%, rgba(93,89,234,0.04), transparent 30%)",
          }}
        />

        {/* Animated ambient blobs */}
        <div
          style={{
            position: "absolute",
            top: "-18%",
            left: "-14%",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(118,108,255,0.17) 0%, transparent 68%)",
            filter: "blur(56px)",
            animation: "smDrift1 20s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "-10%",
            right: "-16%",
            width: 580,
            height: 580,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(78,88,240,0.13) 0%, transparent 70%)",
            filter: "blur(64px)",
            animation: "smDrift2 27s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "28%",
            left: "32%",
            width: 480,
            height: 480,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(148,138,255,0.09) 0%, transparent 70%)",
            filter: "blur(72px)",
            animation: "smDrift3 34s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            maxWidth: 1220,
            margin: "0 auto",
            padding: isMobile ? "18px 18px 80px" : "24px 32px 100px",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Nav */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              marginBottom: isMobile ? 32 : 52,
              padding: "6px 0",
            }}
          >
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: TEXT,
                letterSpacing: -0.6,
              }}
            >
              Smartemark
            </div>

            <div
              style={{
                display: "flex",
                gap: 4,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                onClick={() => (window.location.href = "/pricing")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: TEXT_SOFT,
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 14px",
                }}
              >
                Pricing
              </button>

              <button
                onClick={() => (window.location.href = "/login")}
                style={{
                  background: "transparent",
                  border: "none",
                  color: TEXT_SOFT,
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 14px",
                }}
              >
                Login
              </button>

              {isLoggedIn && (
                <button
                  onClick={() => (window.location.href = "/setup")}
                  style={{
                    background: "rgba(255,255,255,0.80)",
                    border: `1px solid ${BORDER}`,
                    color: PURPLE,
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: "pointer",
                    fontFamily: FONT,
                    padding: "9px 18px",
                    borderRadius: 999,
                    boxShadow: "0 3px 10px rgba(93,89,234,0.08)",
                  }}
                >
                  Dashboard
                </button>
              )}

              <button
                onClick={scrollToFaq}
                style={{
                  background: "transparent",
                  border: "none",
                  color: TEXT_SOFT,
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 14px",
                }}
              >
                FAQ
              </button>

              <CTAButton onClick={goToForm}>Launch Campaign</CTAButton>
            </div>
          </div>

          {/* Hero */}
          <section
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.90), rgba(255,255,255,0.76))",
              border: "1px solid rgba(123,114,255,0.18)",
              borderRadius: 32,
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(83,77,212,0.13), inset 0 1px 0 rgba(255,255,255,0.95)",
              position: "relative",
            }}
          >
            {/* Top-edge light line for glass depth */}
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "6%",
                right: "6%",
                height: 1,
                background: "linear-gradient(90deg, transparent, rgba(123,114,255,0.38), transparent)",
                pointerEvents: "none",
              }}
            />
            {/* Slow animated glass sheen */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: "-60%",
                  left: 0,
                  width: "35%",
                  height: "220%",
                  background:
                    "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 50%, transparent 100%)",
                  animation: "smSheen 9s ease-in-out infinite",
                }}
              />
            </div>
            <div
              style={{
                padding: isMobile ? "32px 24px 32px" : "60px 56px 60px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(380px, 0.9fr)",
                gap: isMobile ? 32 : 48,
                alignItems: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  minWidth: 0,
                }}
              >
                <SectionTag>
                  <FaBolt />
                  AI marketing automation
                </SectionTag>

                <h1
                  style={{
                    margin: "24px 0 20px",
                    fontSize: isMobile ? 44 : 68,
                    lineHeight: 1.04,
                    letterSpacing: "-0.05em",
                    fontWeight: 500,
                    color: TEXT,
                    maxWidth: 680,
                  }}
                >
                  Launch ads
                  <br />
                  effortlessly
                </h1>

                <div
                  style={{
                    color: TEXT_SOFT,
                    fontSize: isMobile ? 17 : 18,
                    lineHeight: 1.8,
                    fontWeight: 400,
                    maxWidth: 520,
                    marginBottom: 28,
                  }}
                >
                  Smartemark learns your business, generates your creatives, launches campaigns,
                  and manages campaign performance — without an agency and without ad experience.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    flexWrap: "wrap",
                    marginBottom: 8,
                  }}
                >
                  <CTAButton onClick={goToForm}>Launch Campaign</CTAButton>
                </div>
              </div>

              {/* Mock dashboard card */}
              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    background:
                      "linear-gradient(140deg, rgba(255,255,255,0.88) 0%, rgba(240,242,255,0.96) 50%, rgba(141,134,255,0.18) 100%)",
                    border: "1px solid rgba(93,89,234,0.18)",
                    borderRadius: 28,
                    padding: 16,
                    boxShadow: "0 14px 42px rgba(83,77,212,0.12), inset 0 1px 0 rgba(255,255,255,0.94)",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "10%",
                      right: "10%",
                      height: 1,
                      background:
                        "linear-gradient(90deg, transparent, rgba(123,114,255,0.28), transparent)",
                      pointerEvents: "none",
                    }}
                  />
                  <div
                    style={{
                      background:
                        "linear-gradient(145deg, rgba(255,255,255,0.99) 0%, rgba(246,247,255,0.97) 100%)",
                      border: "1px solid rgba(93,89,234,0.10)",
                      borderRadius: 22,
                      padding: 20,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        marginBottom: 18,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            color: TEXT,
                            fontSize: 15,
                            fontWeight: 700,
                            marginBottom: 3,
                          }}
                        >
                          AI ad manager
                        </div>
                        <div
                          style={{
                            color: TEXT_SOFT,
                            fontSize: 13,
                            fontWeight: 400,
                          }}
                        >
                          Campaign automation in motion
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "5px 11px 5px 8px",
                          borderRadius: 999,
                          background: "rgba(93,89,234,0.09)",
                          color: PURPLE,
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: "0.02em",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <div
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: "#22c55e",
                            flexShrink: 0,
                            animation: "smPulse 2.4s ease-in-out infinite",
                          }}
                        />
                        Live
                      </div>
                    </div>

                    {/* Mini sparkline chart */}
                    <div
                      style={{
                        marginBottom: 14,
                        borderRadius: 12,
                        background: "linear-gradient(135deg, #f5f6ff 0%, #eef0ff 100%)",
                        border: "1px solid rgba(93,89,234,0.08)",
                        padding: "10px 14px 8px",
                      }}
                    >
                      <div
                        style={{
                          color: "#7b849f",
                          fontWeight: 500,
                          fontSize: 10,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: 8,
                        }}
                      >
                        CTR trend — last 7 days
                      </div>
                      <svg
                        width="100%"
                        height="42"
                        viewBox="0 0 280 42"
                        preserveAspectRatio="none"
                        style={{ display: "block" }}
                      >
                        <defs>
                          <linearGradient id="smChartFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#5d59ea" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#5d59ea" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0,36 C30,34 55,30 85,24 C115,18 135,14 165,10 C195,6 230,4 280,2"
                          fill="none"
                          stroke="#5d59ea"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M0,36 C30,34 55,30 85,24 C115,18 135,14 165,10 C195,6 230,4 280,2 L280,42 L0,42 Z"
                          fill="url(#smChartFill)"
                        />
                        <circle cx="280" cy="2" r="3" fill="#5d59ea" />
                      </svg>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 16,
                          padding: 14,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 11, marginBottom: 8, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                          Impressions
                        </div>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 26, marginBottom: 2 }}>
                          34.2K
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 16,
                          padding: 14,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 11, marginBottom: 8, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                          CTR
                        </div>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 26, marginBottom: 2 }}>
                          4.3%
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 16,
                          padding: 14,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 11, marginBottom: 8, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                          Clicks
                        </div>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 26, marginBottom: 2 }}>
                          1,472
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 16,
                          padding: 14,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 11, marginBottom: 8, letterSpacing: "0.02em", textTransform: "uppercase" }}>
                          AI Status
                        </div>
                        <div style={{ color: TEXT, fontWeight: 600, fontSize: 20, marginBottom: 2 }}>
                          Optimizing
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 18,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <CTAButton onClick={goToForm}>Get Started</CTAButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* How it works */}
          <section
            style={{
              marginTop: 88,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                marginBottom: 36,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  color: TEXT,
                  fontSize: isMobile ? 32 : 42,
                  lineHeight: 1.1,
                  letterSpacing: "-0.04em",
                  fontWeight: 500,
                }}
              >
                How it works
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 16,
                marginBottom: 40,
              }}
            >
              {[
                {
                  n: "01",
                  title: "Give business info",
                  body: "Describe your business, offer, and goal. Smartemark takes in the information and turns it into a campaign plan.",
                },
                {
                  n: "02",
                  title: "AI creates the ads",
                  body: "The AI generates creatives, copy, and launch-ready assets so you do not have to build ads manually.",
                },
                {
                  n: "03",
                  title: "Connect Facebook",
                  body: "Use your own ad account, keep control, and launch without getting buried in Meta's usual complexity.",
                },
                {
                  n: "04",
                  title: "Launch and manage",
                  body: "The system launches campaigns, watches performance, and moves toward the next logical action like a digital marketer would.",
                },
              ].map((item) => (
                <div
                  key={item.n}
                  style={{
                    background: "linear-gradient(145deg, rgba(255,255,255,0.98) 0%, rgba(245,246,255,0.94) 100%)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 26,
                    padding: 24,
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "linear-gradient(135deg, rgba(93,89,234,0.13) 0%, rgba(123,114,255,0.07) 100%)",
                      border: "1px solid rgba(93,89,234,0.10)",
                      color: PURPLE,
                      fontWeight: 600,
                      fontSize: 13,
                      marginBottom: 20,
                      letterSpacing: "0.01em",
                    }}
                  >
                    {item.n}
                  </div>

                  <div
                    style={{
                      color: TEXT,
                      fontWeight: 600,
                      fontSize: 18,
                      lineHeight: 1.2,
                      marginBottom: 12,
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      color: TEXT_SOFT,
                      fontWeight: 400,
                      fontSize: 14,
                      lineHeight: 1.8,
                    }}
                  >
                    {item.body}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginTop: 8,
              }}
            >
              <CTAButton onClick={goToForm}>Get Started</CTAButton>
            </div>
          </section>

          {/* FAQ */}
          <section
            id="landing-faq"
            style={{
              marginTop: 96,
              paddingBottom: 40,
            }}
          >
            <div style={{ marginBottom: 24 }}>
              <SectionTag>FAQ</SectionTag>
            </div>

            <div
              style={{
                display: "grid",
                gap: 12,
              }}
            >
              {FAQS.map((item, idx) => (
                <FAQItem
                  key={item.q}
                  item={item}
                  open={openFaq === idx}
                  onToggle={() => setOpenFaq(openFaq === idx ? -1 : idx)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
