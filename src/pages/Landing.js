/* eslint-disable */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowRight,
  FaBolt,
  FaBrain,
  FaBullseye,
  FaChartLine,
  FaCheckCircle,
  FaChevronDown,
  FaFacebookF,
  FaMagic,
  FaPlayCircle,
  FaRocket,
  FaShieldAlt,
  FaSlidersH,
} from "react-icons/fa";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";

const BG = "linear-gradient(180deg, #cfd5ff 0%, #e9ecff 40%, #f4f6ff 100%)";
const PANEL = "rgba(255,255,255,0.86)";
const PANEL_STRONG = "rgba(255,255,255,0.94)";
const BORDER = "rgba(92, 89, 236, 0.14)";
const TEXT = "#101426";
const TEXT_SOFT = "#5f6781";
const PURPLE = "#5b57e8";
const PURPLE_2 = "#7a70ff";
const PURPLE_3 = "#9088ff";
const DARK_PURPLE = "#29235c";
const BTN = "linear-gradient(135deg, #4c63ff 0%, #6257ee 55%, #7c6dff 100%)";
const BTN_HOVER = "linear-gradient(135deg, #4058f7 0%, #564ce6 55%, #7365ff 100%)";
const SHADOW = "0 18px 50px rgba(74, 71, 199, 0.16)";
const SOFT_SHADOW = "0 10px 30px rgba(74, 71, 199, 0.10)";

const FAQS = [
  {
    q: "Do I need ad experience?",
    a: "No. Smartemark is built for business owners who do not want to learn Ads Manager or hire an agency just to get started.",
  },
  {
    q: "What does the AI actually do?",
    a: "It takes in your business info, creates ad creatives and copy, launches your campaign, then monitors performance and manages next steps.",
  },
  {
    q: "Do I still connect my own Facebook account?",
    a: "Yes. You connect your own Meta ad account so campaigns launch under your business, not under an outside agency setup.",
  },
  {
    q: "Is this an agency?",
    a: "No. Smartemark is AI marketing automation software. The goal is to give you a cleaner, easier system without agency dependency.",
  },
];

const CAROUSEL_ITEMS = [
  {
    eyebrow: "01",
    title: "Give business info",
    body: "Describe your business, offer, and goal. Smartemark takes in the information and turns it into a campaign plan.",
    icon: <FaBrain />,
  },
  {
    eyebrow: "02",
    title: "AI creates the ads",
    body: "The AI generates creatives, copy, and launch-ready assets so you do not have to build ads manually.",
    icon: <FaMagic />,
  },
  {
    eyebrow: "03",
    title: "Connect Facebook",
    body: "Use your own ad account, keep control, and launch without getting buried in Meta’s usual complexity.",
    icon: <FaFacebookF />,
  },
  {
    eyebrow: "04",
    title: "Launch and manage",
    body: "The system launches campaigns, watches performance, and moves toward the next logical action like a digital marketer would.",
    icon: <FaChartLine />,
  },
];

const RESULT_CARDS = [
  { label: "Impressions", value: "11.9K", sub: "Campaign reach building" },
  { label: "CTR", value: "0.89%", sub: "Signal for creative decisions" },
  { label: "Clicks", value: "106", sub: "Traffic from active ads" },
  { label: "AI Status", value: "Monitoring", sub: "Watching for next move" },
];

function CTAButton({ children, onClick, secondary = false, fullWidth = false }) {
  const [hover, setHover] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        appearance: "none",
        border: secondary ? `1px solid ${BORDER}` : "none",
        background: secondary ? "rgba(255,255,255,0.78)" : hover ? BTN_HOVER : BTN,
        color: secondary ? TEXT : "#fff",
        borderRadius: 999,
        padding: "15px 24px",
        fontSize: 16,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: FONT,
        width: fullWidth ? "100%" : "auto",
        boxShadow: secondary ? "none" : "0 12px 28px rgba(91,87,232,0.24)",
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
        background: "rgba(255,255,255,0.56)",
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
        background: "rgba(10, 15, 35, 0.92)",
        borderRadius: 22,
        padding: 20,
        minHeight: 132,
        boxShadow: "0 14px 34px rgba(10,15,35,0.16)",
        border: "1px solid rgba(255,255,255,0.04)",
      }}
    >
      <div
        style={{
          color: "rgba(255,255,255,0.62)",
          fontSize: 12,
          fontWeight: 800,
          marginBottom: 12,
          textTransform: "uppercase",
          letterSpacing: 0.35,
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#ffffff",
          fontSize: 34,
          fontWeight: 800,
          lineHeight: 1.05,
          marginBottom: 12,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.72)",
          fontSize: 13,
          fontWeight: 700,
          lineHeight: 1.5,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function InfoCard({ icon, title, body }) {
  return (
    <div
      style={{
        background: PANEL_STRONG,
        border: `1px solid ${BORDER}`,
        borderRadius: 28,
        padding: 26,
        boxShadow: SOFT_SHADOW,
        minHeight: 220,
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, rgba(91,87,232,0.14), rgba(123,109,255,0.14))",
          color: PURPLE,
          fontSize: 18,
          marginBottom: 18,
        }}
      >
        {icon}
      </div>
      <div
        style={{
          color: TEXT,
          fontSize: 24,
          fontWeight: 800,
          lineHeight: 1.15,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: TEXT_SOFT,
          fontSize: 15,
          fontWeight: 600,
          lineHeight: 1.7,
        }}
      >
        {body}
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
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % CAROUSEL_ITEMS.length);
    }, 3500);
    return () => clearInterval(id);
  }, []);

  const activeCarousel = useMemo(() => CAROUSEL_ITEMS[carouselIndex], [carouselIndex]);

  const goToSetup = () => {
    navigate("/setup");
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
      <div
        style={{
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(circle at 12% 12%, rgba(123,109,255,0.18), transparent 28%), radial-gradient(circle at 85% 22%, rgba(91,87,232,0.20), transparent 26%), linear-gradient(125deg, rgba(255,255,255,0.18) 30%, rgba(124,109,255,0.14) 58%, rgba(91,87,232,0.20) 100%)",
          }}
        />

        <div
          style={{
            maxWidth: 1220,
            margin: "0 auto",
            padding: isMobile ? "18px 18px 70px" : "20px 26px 88px",
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
              <CTAButton onClick={goToSetup}>Launch Campaign</CTAButton>
            </div>
          </div>

          <section
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.80), rgba(255,255,255,0.66))",
              border: `1px solid ${BORDER}`,
              borderRadius: 36,
              overflow: "hidden",
              boxShadow: SHADOW,
              display: "grid",
              gridTemplateColumns: "1fr",
            }}
          >
            <div
              style={{
                padding: isMobile ? "28px 22px 28px" : "46px 46px 42px",
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1.1fr) minmax(360px, 0.9fr)",
                gap: isMobile ? 28 : 34,
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
                    fontSize: isMobile ? 54 : 86,
                    lineHeight: isMobile ? 0.98 : 0.95,
                    letterSpacing: "-0.055em",
                    fontWeight: 700,
                    color: TEXT,
                    maxWidth: 760,
                  }}
                >
                  Launch ads
                  <br />
                  effortlessly
                </h1>

                <div
                  style={{
                    color: TEXT_SOFT,
                    fontSize: isMobile ? 18 : 21,
                    lineHeight: 1.65,
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
                  <CTAButton onClick={goToSetup}>
                    Get Started <FaArrowRight style={{ marginLeft: 8 }} />
                  </CTAButton>
                  <CTAButton onClick={goToSetup} secondary>
                    Launch Campaign
                  </CTAButton>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    gap: 14,
                    maxWidth: 820,
                  }}
                >
                  <div
                    style={{
                      background: "rgba(255,255,255,0.72)",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 22,
                      padding: 18,
                    }}
                  >
                    <div style={{ color: PURPLE, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
                      No agency needed
                    </div>
                    <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 14, lineHeight: 1.65 }}>
                      Business owners can launch without hiring marketers or learning complicated ad tools.
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.72)",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 22,
                      padding: 18,
                    }}
                  >
                    <div style={{ color: PURPLE, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
                      AI creates and launches
                    </div>
                    <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 14, lineHeight: 1.65 }}>
                      Smartemark turns your input into creatives, copy, and launch-ready campaigns.
                    </div>
                  </div>

                  <div
                    style={{
                      background: "rgba(255,255,255,0.72)",
                      border: `1px solid ${BORDER}`,
                      borderRadius: 22,
                      padding: 18,
                    }}
                  >
                    <div style={{ color: PURPLE, fontWeight: 900, fontSize: 13, marginBottom: 8 }}>
                      Monitors next moves
                    </div>
                    <div style={{ color: TEXT_SOFT, fontWeight: 700, fontSize: 14, lineHeight: 1.65 }}>
                      It observes campaign performance and moves toward the next reasonable action.
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  justifyContent: "center",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    borderRadius: 32,
                    overflow: "hidden",
                    minHeight: isMobile ? 430 : 620,
                    border: `1px solid rgba(255,255,255,0.34)`,
                    background:
                      "linear-gradient(140deg, rgba(255,255,255,0.22) 0%, rgba(247,248,255,0.42) 32%, rgba(136,127,255,0.26) 72%, rgba(87,80,224,0.28) 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35)",
                    padding: 20,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background:
                        "linear-gradient(120deg, rgba(255,255,255,0.40) 20%, transparent 31%, rgba(124,109,255,0.18) 58%, rgba(84,77,224,0.20) 100%)",
                      pointerEvents: "none",
                    }}
                  />

                  <div
                    style={{
                      position: "relative",
                      zIndex: 1,
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        background: "rgba(255,255,255,0.82)",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 26,
                        padding: 22,
                        boxShadow: SOFT_SHADOW,
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
                            background: "rgba(91,87,232,0.12)",
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
                          marginBottom: 14,
                        }}
                      >
                        {RESULT_CARDS.map((item) => (
                          <div
                            key={item.label}
                            style={{
                              background: "#ffffff",
                              border: `1px solid ${BORDER}`,
                              borderRadius: 18,
                              padding: 16,
                            }}
                          >
                            <div
                              style={{
                                color: "#7b849f",
                                fontWeight: 800,
                                fontSize: 12,
                                marginBottom: 8,
                              }}
                            >
                              {item.label}
                            </div>
                            <div
                              style={{
                                color: TEXT,
                                fontWeight: 900,
                                fontSize: 28,
                                marginBottom: 8,
                                lineHeight: 1,
                              }}
                            >
                              {item.value}
                            </div>
                            <div
                              style={{
                                color: TEXT_SOFT,
                                fontWeight: 700,
                                fontSize: 12,
                                lineHeight: 1.45,
                              }}
                            >
                              {item.sub}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div
                        style={{
                          background: "linear-gradient(135deg, rgba(91,87,232,0.96), rgba(123,109,255,0.82))",
                          color: "#fff",
                          borderRadius: 20,
                          padding: 18,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 15,
                            fontWeight: 900,
                            marginBottom: 10,
                          }}
                        >
                          AI workflow
                        </div>

                        <div
                          style={{
                            height: 12,
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.24)",
                            overflow: "hidden",
                            marginBottom: 12,
                          }}
                        >
                          <div
                            style={{
                              width: `${28 + carouselIndex * 22}%`,
                              height: "100%",
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.88)",
                              transition: "width 320ms ease",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                            gap: 8,
                          }}
                        >
                          {CAROUSEL_ITEMS.map((item, idx) => (
                            <button
                              key={item.eyebrow}
                              onClick={() => setCarouselIndex(idx)}
                              style={{
                                border: "none",
                                cursor: "pointer",
                                fontFamily: FONT,
                                padding: "9px 8px",
                                borderRadius: 999,
                                background:
                                  idx === carouselIndex
                                    ? "rgba(255,255,255,0.24)"
                                    : "rgba(255,255,255,0.10)",
                                color: "#fff",
                                fontWeight: 800,
                                fontSize: 12,
                              }}
                            >
                              {item.eyebrow}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div
                      style={{
                        background: "rgba(255,255,255,0.80)",
                        border: `1px solid ${BORDER}`,
                        borderRadius: 24,
                        padding: 20,
                        boxShadow: SOFT_SHADOW,
                      }}
                    >
                      <div
                        style={{
                          color: TEXT,
                          fontWeight: 900,
                          fontSize: 18,
                          marginBottom: 8,
                        }}
                      >
                        {activeCarousel.title}
                      </div>
                      <div
                        style={{
                          color: TEXT_SOFT,
                          fontWeight: 700,
                          fontSize: 15,
                          lineHeight: 1.7,
                          marginBottom: 16,
                        }}
                      >
                        {activeCarousel.body}
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: 10,
                          flexWrap: "wrap",
                        }}
                      >
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 13px",
                            borderRadius: 999,
                            background: "rgba(91,87,232,0.08)",
                            color: PURPLE,
                            fontWeight: 800,
                            fontSize: 13,
                          }}
                        >
                          {activeCarousel.icon}
                          Step {activeCarousel.eyebrow}
                        </div>

                        <CTAButton onClick={goToSetup} secondary>
                          Start Now
                        </CTAButton>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            style={{
              marginTop: 30,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: 18,
            }}
          >
            <InfoCard
              icon={<FaRocket />}
              title="Built for simple launch"
              body="Business owners should be able to move from idea to live campaign without needing a marketer, media buyer, or complex agency workflow."
            />
            <InfoCard
              icon={<FaBullseye />}
              title="Focused on automation"
              body="The product is about AI automation, not just ad creation. Smartemark should think, launch, observe, and manage the campaign lifecycle."
            />
            <InfoCard
              icon={<FaShieldAlt />}
              title="Use your own account"
              body="You stay in control by connecting your own Facebook ad account while Smartemark handles the heavy lifting around campaign execution."
            />
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
                  <FaPlayCircle />
                  How it works
                </SectionTag>
                <div
                  style={{
                    marginTop: 14,
                    color: TEXT,
                    fontSize: isMobile ? 38 : 60,
                    lineHeight: 1,
                    letterSpacing: "-0.05em",
                    fontWeight: 700,
                  }}
                >
                  From business info to managed ads
                </div>
              </div>

              <CTAButton onClick={goToSetup}>Get Started</CTAButton>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))",
                gap: 18,
              }}
            >
              {CAROUSEL_ITEMS.map((item) => (
                <div
                  key={item.eyebrow}
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
                      background: "rgba(91,87,232,0.10)",
                      color: PURPLE,
                      fontWeight: 900,
                      fontSize: 14,
                      marginBottom: 20,
                    }}
                  >
                    {item.eyebrow}
                  </div>

                  <div
                    style={{
                      color: TEXT,
                      fontWeight: 800,
                      fontSize: 26,
                      lineHeight: 1.08,
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
            style={{
              marginTop: 64,
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 0.95fr) minmax(0, 1.05fr)",
              gap: 20,
            }}
          >
            <div
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.92), rgba(243,245,255,0.86))",
                border: `1px solid ${BORDER}`,
                borderRadius: 32,
                padding: isMobile ? 24 : 30,
                boxShadow: SHADOW,
              }}
            >
              <SectionTag>
                <FaSlidersH />
                What Smartemark does
              </SectionTag>

              <div
                style={{
                  marginTop: 18,
                  color: TEXT,
                  fontSize: isMobile ? 36 : 52,
                  lineHeight: 0.98,
                  fontWeight: 700,
                  letterSpacing: "-0.05em",
                  marginBottom: 18,
                }}
              >
                Cleaner launch.
                <br />
                Smarter management.
              </div>

              <div
                style={{
                  color: TEXT_SOFT,
                  fontSize: 16,
                  lineHeight: 1.8,
                  fontWeight: 600,
                  marginBottom: 22,
                  maxWidth: 620,
                }}
              >
                Smartemark is designed to act like a digital marketer in software form. It should
                understand your business, create the ads, launch the campaign, then keep watching
                for the next best move.
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                {[
                  "Takes in business info and campaign goals",
                  "Builds ad creatives and copy with AI",
                  "Launches directly through your connected Facebook account",
                  "Monitors performance and manages next steps",
                ].map((item) => (
                  <div
                    key={item}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      color: TEXT,
                      fontWeight: 700,
                      fontSize: 15,
                    }}
                  >
                    <span style={{ color: PURPLE }}>
                      <FaCheckCircle />
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <CTAButton onClick={goToSetup}>Launch Campaign</CTAButton>
                <CTAButton onClick={goToSetup} secondary>
                  Get Started
                </CTAButton>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))",
                gap: 16,
              }}
            >
              {RESULT_CARDS.map((card) => (
                <MetricCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  sub={card.sub}
                />
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
                color: TEXT,
                fontSize: isMobile ? 38 : 58,
                lineHeight: 1,
                letterSpacing: "-0.05em",
                fontWeight: 700,
                marginBottom: 20,
              }}
            >
              Questions before you launch
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
        </div>
      </div>
    </div>
  );
}