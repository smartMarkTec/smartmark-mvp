import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartmark-logo.svg";
import { trackEvent } from "../analytics/gaEvents";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG_DARK = "#0b0f14";
const ACCENT = "#31e1ff";
const ACCENT_2 = "#7c4dff";
const BTN_BASE = "#0f6fff";
const BTN_BASE_HOVER = "#2e82ff";
const GLASS_BORDER = "rgba(255,255,255,0.08)";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 750);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return isMobile;
};

const plans = [
  {
    name: "Starter",
    price: "$39.99",
    subtitle: "For business owners getting started",
    badge: "Simple Start",
    accentGlow: "rgba(49,225,255,0.20)",
    cta: "Get Started",
    features: [
      "1 active business / core brand setup",
      "1 connected ad account",
      "Up to 2 campaign launches per month",
      "AI-generated ad copy and creatives",
      "Autonomous campaign launch",
      "Light autonomous optimization",
      "Basic creative refresh logic",
      "Basic campaign dashboard",
      "Standard support",
    ],
  },
  {
    name: "Pro",
    price: "$79.99",
    subtitle: "For businesses wanting stronger automation",
    badge: "Most Popular",
    accentGlow: "rgba(124,77,255,0.24)",
    featured: true,
    cta: "Choose Pro",
    features: [
      "Everything in Starter",
      "Up to 5 campaign launches per month",
      "Higher creative and variant generation capacity",
      "Stronger autonomous optimization cadence",
      "Automatic creative refresh as needed",
      "Broader test coverage",
      "More active campaign control",
      "Priority support",
    ],
  },
  {
    name: "Operator",
    price: "$149.99",
    subtitle: "For businesses wanting the deepest in-product system",
    badge: "Advanced",
    accentGlow: "rgba(49,225,255,0.16)",
    cta: "Choose Operator",
    features: [
      "Everything in Pro",
      "Up to 10 campaign launches per month",
      "Highest creative generation intensity",
      "Highest testing intensity",
      "Deepest autonomous optimization layer available in-product",
      "Memory / pattern retention over time as the operator system matures",
      "Highest support priority",
      "Earliest access to advanced operator capabilities",
    ],
  },
];

const comparisonRows = [
  ["Active business / core brand setup", "1", "1", "1"],
  ["Connected ad accounts", "1", "1", "1"],
  ["Campaign launches / month", "2", "5", "10"],
  ["AI ad copy + creatives", "Yes", "Yes", "Yes"],
  ["Autonomous launch", "Yes", "Yes", "Yes"],
  ["Optimization strength", "Light", "Stronger", "Deepest"],
  ["Creative refresh / test coverage", "Basic", "Broader", "Highest"],
  ["Support", "Standard", "Priority", "Highest priority"],
];

const Pricing = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  useEffect(() => {
    try {
      trackEvent("view_pricing", { page: "pricing" });
    } catch {}
  }, []);

  const glass = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: `1px solid ${GLASS_BORDER}`,
    boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
    backdropFilter: "blur(8px)",
  };

  const pageWrap = {
    minHeight: "100vh",
    minWidth: "100vw",
    background: BG_DARK,
    color: "#fff",
    fontFamily: FONT,
    position: "relative",
    overflowX: "hidden",
  };

  const openContact = (planName) => {
    try {
      trackEvent("pricing_cta_click", { page: "pricing", plan: planName });
    } catch {}

    navigate("/login");
  };

  return (
    <div style={pageWrap}>
      <style>{`
        html, body, #root { background: ${BG_DARK}; margin: 0; }
        @keyframes floatA { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-14px) } }
        @keyframes floatB { 0%,100% { transform: translateY(0) } 50% { transform: translateY(12px) } }
      `}</style>

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-18vh",
          right: "-10vw",
          width: isMobile ? 340 : 760,
          height: isMobile ? 340 : 760,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT}2f, transparent 72%)`,
          filter: "blur(18px)",
          animation: "floatA 18s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-22vh",
          left: "-12vw",
          width: isMobile ? 420 : 820,
          height: isMobile ? 420 : 820,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT_2}29, transparent 72%)`,
          filter: "blur(18px)",
          animation: "floatB 22s ease-in-out infinite",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1260,
          margin: "0 auto",
          padding: isMobile ? "22px 16px 60px" : "28px 28px 90px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? 14 : 18,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              ...glass,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "0.75rem 1rem",
              borderRadius: 999,
              color: "#eaf5ff",
              cursor: "pointer",
            }}
          >
            <img
              src={smartmarkLogo}
              alt="SmarteMark"
              style={{ width: 24, height: 24, borderRadius: 8, opacity: 0.92 }}
            />
            <span style={{ fontWeight: 800, fontSize: 14 }}>SmarteMark</span>
          </button>

          <button
            onClick={() => navigate("/login")}
            style={{
              padding: isMobile ? "0.8rem 1.3rem" : "0.9rem 1.7rem",
              fontSize: 15,
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
            Login
          </button>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: isMobile ? 42 : 62,
            marginBottom: isMobile ? 28 : 42,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "0.55rem 1rem",
              borderRadius: 999,
              marginBottom: 18,
              color: "#eaf5ff",
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: 0.3,
              ...glass,
            }}
          >
            Pricing
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "2.5rem" : "4.3rem",
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: isMobile ? "-0.8px" : "-1.2px",
              background: `linear-gradient(90deg, #ffffff, ${ACCENT} 50%, ${ACCENT_2})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textShadow: "0 10px 40px rgba(0,0,0,0.25)",
            }}
          >
            Simple pricing for effortless ads
          </h1>

          <p
            style={{
              maxWidth: 820,
              margin: "16px auto 0",
              color: "rgba(255,255,255,0.86)",
              fontSize: isMobile ? "1rem" : "1.15rem",
              lineHeight: 1.7,
              fontWeight: 500,
            }}
          >
            Choose the plan that fits your business. SmarteMark helps you generate ad creatives,
            launch campaigns, and automate optimization in one clean system.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? 18 : 24,
            alignItems: "stretch",
            marginTop: isMobile ? 20 : 34,
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.name}
              style={{
                ...glass,
                position: "relative",
                borderRadius: 24,
                padding: isMobile ? "1.2rem" : "1.45rem",
                overflow: "hidden",
                minHeight: isMobile ? "auto" : 640,
                transform: plan.featured && !isMobile ? "translateY(-10px)" : "none",
                boxShadow: plan.featured
                  ? "0 20px 60px rgba(124,77,255,0.22)"
                  : "0 10px 30px rgba(0,0,0,0.25)",
              }}
            >
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  top: -40,
                  right: -30,
                  width: 160,
                  height: 160,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${plan.accentGlow}, transparent 68%)`,
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  display: "inline-flex",
                  padding: "0.45rem 0.8rem",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  letterSpacing: 0.4,
                  color: plan.featured ? "#ffffff" : ACCENT,
                  background: plan.featured
                    ? "linear-gradient(90deg, #7c4dff, #0f6fff)"
                    : "rgba(49,225,255,0.08)",
                  border: plan.featured
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(49,225,255,0.18)",
                }}
              >
                {plan.badge}
              </div>

              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 900,
                    color: "#fff",
                    letterSpacing: "-0.6px",
                  }}
                >
                  {plan.name}
                </div>

                <div style={{ marginTop: 12, display: "flex", alignItems: "flex-end", gap: 6 }}>
                  <span
                    style={{
                      fontSize: isMobile ? 40 : 46,
                      lineHeight: 1,
                      fontWeight: 900,
                      color: "#fff",
                      letterSpacing: "-1px",
                    }}
                  >
                    {plan.price}
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      color: "rgba(255,255,255,0.72)",
                      fontWeight: 700,
                      paddingBottom: 7,
                    }}
                  >
                    / month
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    color: "rgba(255,255,255,0.82)",
                    fontSize: 15,
                    lineHeight: 1.6,
                    fontWeight: 500,
                    minHeight: 48,
                  }}
                >
                  {plan.subtitle}
                </div>
              </div>

              <button
                onClick={() => openContact(plan.name)}
                style={{
                  width: "100%",
                  marginTop: 22,
                  padding: "0.95rem 1.1rem",
                  borderRadius: 999,
                  border: "none",
                  background: plan.featured
                    ? "linear-gradient(90deg, #7c4dff, #0f6fff)"
                    : BTN_BASE,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 900,
                  cursor: "pointer",
                  boxShadow: plan.featured
                    ? "0 12px 34px rgba(124,77,255,0.30)"
                    : "0 10px 26px rgba(15,111,255,0.30)",
                  transition: "transform .15s ease, opacity .2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.opacity = "0.95";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.opacity = "1";
                }}
              >
                {plan.cta}
              </button>

              <div
                style={{
                  marginTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 18,
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    color: "#eaf5ff",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: 0.2,
                  }}
                >
                  What’s included
                </div>

                <div style={{ display: "grid", gap: 12 }}>
                  {plan.features.map((feature) => (
                    <div
                      key={feature}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 10,
                        color: "rgba(255,255,255,0.9)",
                        lineHeight: 1.55,
                        fontSize: 14.5,
                        fontWeight: 500,
                      }}
                    >
                      <div
                        style={{
                          minWidth: 20,
                          height: 20,
                          borderRadius: 999,
                          marginTop: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "rgba(49,225,255,0.12)",
                          color: ACCENT,
                          fontSize: 12,
                          fontWeight: 900,
                        }}
                      >
                        ✓
                      </div>
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: isMobile ? 28 : 42,
            borderRadius: 24,
            padding: isMobile ? "1rem" : "1.3rem",
            ...glass,
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 22 : 28,
              fontWeight: 900,
              marginBottom: 16,
              background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Plan comparison
          </div>

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 720,
                color: "#fff",
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "14px 12px",
                      color: "rgba(255,255,255,0.72)",
                      fontSize: 13,
                      fontWeight: 800,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Feature
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "14px 12px",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 900,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Starter
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "14px 12px",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 900,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Pro
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "14px 12px",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 900,
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    Operator
                  </th>
                </tr>
              </thead>

              <tbody>
                {comparisonRows.map((row) => (
                  <tr key={row[0]}>
                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        color: "rgba(255,255,255,0.88)",
                        fontSize: 14,
                        fontWeight: 600,
                      }}
                    >
                      {row[0]}
                    </td>
                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        textAlign: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#eaf5ff",
                      }}
                    >
                      {row[1]}
                    </td>
                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        textAlign: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#eaf5ff",
                      }}
                    >
                      {row[2]}
                    </td>
                    <td
                      style={{
                        padding: "14px 12px",
                        borderBottom: "1px solid rgba(255,255,255,0.06)",
                        textAlign: "center",
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#eaf5ff",
                      }}
                    >
                      {row[3]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div
          style={{
            marginTop: isMobile ? 28 : 40,
            textAlign: "center",
            borderRadius: 24,
            padding: isMobile ? "1.2rem 1rem" : "1.5rem 1.4rem",
            ...glass,
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 22 : 30,
              fontWeight: 900,
              lineHeight: 1.15,
              marginBottom: 10,
            }}
          >
            Smarter campaign execution, without agency friction
          </div>

          <div
            style={{
              maxWidth: 760,
              margin: "0 auto",
              color: "rgba(255,255,255,0.82)",
              fontSize: isMobile ? 15 : 16,
              lineHeight: 1.7,
              fontWeight: 500,
            }}
          >
            Start with the plan that matches your volume today. As SmarteMark grows, your business
            can move into more powerful automation, stronger optimization, and deeper operator
            capabilities.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;