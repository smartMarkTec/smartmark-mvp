/* eslint-disable */
import React, { useEffect, useState } from "react";
import { FaArrowRight, FaBolt, FaChartLine, FaCheckCircle, FaChevronDown } from "react-icons/fa";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const BG = "linear-gradient(180deg, #cfd3ff 0%, #e6e8ff 42%, #f4f5ff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#626b86";
const PURPLE = "#5d59ea";
const PURPLE_2 = "#7b72ff";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.88)";
const PANEL_STRONG = "rgba(255,255,255,0.94)";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER = "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";
const SHADOW = "0 18px 46px rgba(83, 77, 212, 0.14)";
const SOFT_SHADOW = "0 10px 28px rgba(83, 77, 212, 0.09)";

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

function CTAButton({ children, onClick, secondary = false }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none",
        border: secondary ? `1px solid ${BORDER}` : "none",
        background: secondary ? "rgba(255,255,255,0.82)" : hover ? BTN_HOVER : BTN,
        color: secondary ? TEXT : "#fff",
        borderRadius: 999,
        padding: "15px 24px",
        fontSize: 16,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: FONT,
        boxShadow: secondary ? "none" : "0 12px 28px rgba(93,89,234,0.20)",
        transition: "all 160ms ease",
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
        gap: 8,
        padding: "9px 14px",
        borderRadius: 999,
        border: `1px solid ${BORDER}`,
        background: "rgba(255,255,255,0.58)",
        color: PURPLE,
        fontWeight: 800,
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function MetricCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: "rgba(15, 20, 48, 0.96)",
        borderRadius: 22,
        padding: 22,
        minHeight: 150,
        boxShadow: "0 16px 34px rgba(15,20,48,0.14)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.66)",
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 14,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#fff",
          fontSize: 40,
          fontWeight: 800,
          lineHeight: 1,
          marginBottom: 14,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.74)",
          fontSize: 14,
          fontWeight: 700,
          lineHeight: 1.5,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function FAQItem({ item, open, onToggle }) {
  return (
    <div
      style={{
        background: PANEL_STRONG,
        border: `1px solid ${BORDER}`,
        borderRadius: 22,
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
          padding: "22px 22px",
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
            fontSize: 18,
            fontWeight: 800,
            lineHeight: 1.35,
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
          }}
        >
          <FaChevronDown />
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: "0 22px 22px",
            color: TEXT_SOFT,
            fontSize: 15,
            fontWeight: 600,
            lineHeight: 1.75,
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
  const [showDemoModal, setShowDemoModal] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const openDemoPopup = () => {
    setShowDemoModal(true);
  };

  const closeDemoPopup = () => {
    setShowDemoModal(false);
  };

  const handleDemoSubmit = (e) => {
    e.preventDefault();
    setShowDemoModal(false);
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
      <div style={{ position: "relative", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 10% 10%, rgba(123,114,255,0.18), transparent 28%), radial-gradient(circle at 86% 18%, rgba(93,89,234,0.16), transparent 26%), linear-gradient(125deg, rgba(255,255,255,0.16) 30%, rgba(123,114,255,0.10) 58%, rgba(93,89,234,0.12) 100%)",
          }}
        />

        <div
          style={{
            maxWidth: 1220,
            margin: "0 auto",
            padding: isMobile ? "18px 18px 72px" : "20px 26px 88px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
              marginBottom: isMobile ? 26 : 34,
              padding: "8px 4px",
            }}
          >
            <div
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: TEXT,
                letterSpacing: -1.1,
              }}
            >
              Smartemark
            </div>

            <div
              style={{
                display: "flex",
                gap: 12,
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
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 6px",
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
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 6px",
                }}
              >
                Login
              </button>

              <button
                onClick={scrollToFaq}
                style={{
                  background: "transparent",
                  border: "none",
                  color: TEXT_SOFT,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "10px 6px",
                }}
              >
                FAQ
              </button>

              <CTAButton onClick={openDemoPopup}>Launch Campaign</CTAButton>
            </div>
          </div>

          <section
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.68))",
              border: `1px solid ${BORDER}`,
              borderRadius: 36,
              overflow: "hidden",
              boxShadow: SHADOW,
            }}
          >
            <div
              style={{
                padding: isMobile ? "28px 22px 28px" : "44px 44px 44px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(390px, 0.9fr)",
                gap: isMobile ? 28 : 32,
                alignItems: "stretch",
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
                    margin: "22px 0 18px",
                    fontSize: isMobile ? 54 : 88,
                    lineHeight: isMobile ? 0.97 : 0.93,
                    letterSpacing: "-0.06em",
                    fontWeight: 700,
                    color: TEXT,
                    maxWidth: 700,
                  }}
                >
                  Launch ads
                  <br />
                  effortlessly
                </h1>

                <div
                  style={{
                    color: TEXT_SOFT,
                    fontSize: isMobile ? 18 : 20,
                    lineHeight: 1.7,
                    fontWeight: 500,
                    maxWidth: 760,
                    marginBottom: 24,
                  }}
                >
                  Smartemark takes in your business info, builds creatives, launches campaigns,
                  and manages performance — without an agency and without needing to learn Ads
                  Manager.
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    flexWrap: "wrap",
                    marginBottom: 28,
                  }}
                >
                  <CTAButton onClick={openDemoPopup}>
                    Get Started <FaArrowRight style={{ marginLeft: 8 }} />
                  </CTAButton>
                  <CTAButton onClick={openDemoPopup} secondary>
                    Launch Campaign
                  </CTAButton>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 12,
                    maxWidth: 760,
                  }}
                >
                  {[
                    "No agency or ad knowledge needed",
                    "AI takes in your business info and creates the ads",
                    "Launches through your connected Facebook account",
                    "Manages campaign performance and next steps",
                  ].map((item) => (
                    <div
                      key={item}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        color: TEXT,
                        fontWeight: 700,
                        fontSize: 16,
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ color: PURPLE }}>
                        <FaCheckCircle />
                      </span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>

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
                      "linear-gradient(140deg, rgba(255,255,255,0.80) 0%, rgba(245,246,255,0.88) 40%, rgba(141,134,255,0.18) 100%)",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 34,
                    padding: 20,
                    boxShadow: SOFT_SHADOW,
                  }}
                >
                  <div
                    style={{
                      background: PANEL_STRONG,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 28,
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
                            fontSize: 18,
                            fontWeight: 900,
                            marginBottom: 4,
                          }}
                        >
                          AI ad manager
                        </div>
                        <div
                          style={{
                            color: TEXT_SOFT,
                            fontSize: 14,
                            fontWeight: 700,
                          }}
                        >
                          Campaign automation in motion
                        </div>
                      </div>

                      <div
                        style={{
                          padding: "8px 12px",
                          borderRadius: 999,
                          background: "rgba(93,89,234,0.10)",
                          color: PURPLE,
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
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 18,
                          padding: 16,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                          Impressions
                        </div>
                        <div style={{ color: TEXT, fontWeight: 900, fontSize: 26, marginBottom: 8 }}>
                          11.9K
                        </div>
                        <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 12, lineHeight: 1.45 }}>
                          Campaign reach building
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 18,
                          padding: 16,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                          CTR
                        </div>
                        <div style={{ color: TEXT, fontWeight: 900, fontSize: 26, marginBottom: 8 }}>
                          0.89%
                        </div>
                        <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 12, lineHeight: 1.45 }}>
                          Signal for creative decisions
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 18,
                          padding: 16,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                          Clicks
                        </div>
                        <div style={{ color: TEXT, fontWeight: 900, fontSize: 26, marginBottom: 8 }}>
                          106
                        </div>
                        <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 12, lineHeight: 1.45 }}>
                          Traffic from active ads
                        </div>
                      </div>

                      <div
                        style={{
                          background: "#ffffff",
                          border: `1px solid ${BORDER}`,
                          borderRadius: 18,
                          padding: 16,
                        }}
                      >
                        <div style={{ color: "#7b849f", fontWeight: 800, fontSize: 12, marginBottom: 8 }}>
                          AI Status
                        </div>
                        <div style={{ color: TEXT, fontWeight: 900, fontSize: 26, marginBottom: 8 }}>
                          Monitoring
                        </div>
                        <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 12, lineHeight: 1.45 }}>
                          Watching for next move
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 16,
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <CTAButton onClick={openDemoPopup} secondary>
                        Start Now
                      </CTAButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              marginTop: 64,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 20,
              }}
            >
              <div>
                <SectionTag>
                  <FaChartLine />
                  How it works
                </SectionTag>
                <div
                  style={{
                    marginTop: 14,
                    color: TEXT,
                    fontSize: isMobile ? 40 : 62,
                    lineHeight: 0.98,
                    letterSpacing: "-0.055em",
                    fontWeight: 700,
                  }}
                >
                  From business info to managed ads
                </div>
              </div>

              <CTAButton onClick={openDemoPopup}>Get Started</CTAButton>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 18,
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
                  body: "Use your own ad account, keep control, and launch without getting buried in Meta’s usual complexity.",
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
                    background: PANEL_STRONG,
                    border: `1px solid ${BORDER}`,
                    borderRadius: 30,
                    padding: 22,
                    boxShadow: SOFT_SHADOW,
                    minHeight: 250,
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(93,89,234,0.10)",
                      color: PURPLE,
                      fontWeight: 900,
                      fontSize: 14,
                      marginBottom: 20,
                    }}
                  >
                    {item.n}
                  </div>

                  <div
                    style={{
                      color: TEXT,
                      fontWeight: 800,
                      fontSize: 24,
                      lineHeight: 1.1,
                      marginBottom: 12,
                    }}
                  >
                    {item.title}
                  </div>

                  <div
                    style={{
                      color: TEXT_SOFT,
                      fontWeight: 600,
                      fontSize: 15,
                      lineHeight: 1.75,
                    }}
                  >
                    {item.body}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            id="landing-faq"
            style={{
              marginTop: 72,
              paddingBottom: 30,
            }}
          >
            <div style={{ marginBottom: 18 }}>
              <SectionTag>FAQ</SectionTag>
            </div>

            <div
              style={{
                display: "grid",
                gap: 14,
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

          {showDemoModal && (
            <div
              onClick={closeDemoPopup}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9999,
                background: "rgba(12,16,36,0.42)",
                backdropFilter: "blur(6px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(520px, 94vw)",
                  background: "#ffffff",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 28,
                  boxShadow: SHADOW,
                  padding: 24,
                  display: "flex",
                  flexDirection: "column",
                  gap: 18,
                }}
              >
                <div>
                  <div
                    style={{
                      color: TEXT,
                      fontSize: 28,
                      fontWeight: 800,
                      lineHeight: 1.05,
                      letterSpacing: "-0.04em",
                      marginBottom: 8,
                    }}
                  >
                    Get started
                  </div>
                  <div
                    style={{
                      color: TEXT_SOFT,
                      fontSize: 15,
                      fontWeight: 600,
                      lineHeight: 1.65,
                    }}
                  >
                    Enter your info and continue to the demo flow.
                  </div>
                </div>

                <form
                  onSubmit={handleDemoSubmit}
                  style={{ display: "flex", flexDirection: "column", gap: 12 }}
                >
                  <input
                    type="text"
                    placeholder="Your name"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 16,
                      border: `1px solid ${BORDER}`,
                      outline: "none",
                      fontFamily: FONT,
                      fontSize: 15,
                      fontWeight: 600,
                      color: TEXT,
                      background: "#ffffff",
                    }}
                  />

                  <input
                    type="email"
                    placeholder="Email"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 16,
                      border: `1px solid ${BORDER}`,
                      outline: "none",
                      fontFamily: FONT,
                      fontSize: 15,
                      fontWeight: 600,
                      color: TEXT,
                      background: "#ffffff",
                    }}
                  />

                  <input
                    type="text"
                    placeholder="Business name"
                    required
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      borderRadius: 16,
                      border: `1px solid ${BORDER}`,
                      outline: "none",
                      fontFamily: FONT,
                      fontSize: 15,
                      fontWeight: 600,
                      color: TEXT,
                      background: "#ffffff",
                    }}
                  />

                  <div
                    style={{
                      display: "flex",
                      gap: 12,
                      justifyContent: "flex-end",
                      flexWrap: "wrap",
                      marginTop: 6,
                    }}
                  >
                    <CTAButton onClick={closeDemoPopup} secondary>
                      Cancel
                    </CTAButton>
                    <button
                      type="submit"
                      style={{
                        appearance: "none",
                        border: "none",
                        background: BTN,
                        color: "#fff",
                        borderRadius: 999,
                        padding: "15px 24px",
                        fontSize: 16,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: FONT,
                        boxShadow: "0 12px 28px rgba(93,89,234,0.20)",
                      }}
                    >
                      Continue
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}