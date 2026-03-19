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
    subtitle: "A clean starting point for business owners who want simple campaign automation without extra complexity.",
    badge: "Starter",
    accentGlow: "rgba(49,225,255,0.18)",
    cta: "Get Started",
    features: [
      "1 active business setup",
      "1 connected ad account",
      "Up to 2 campaign launches per month",
      "AI-generated ad copy and creatives",
      "Autonomous campaign launch",
      "Basic optimization and creative refresh",
      "Core campaign dashboard",
      "Standard support",
    ],
  },
  {
    name: "Pro",
    price: "$79.99",
    subtitle: "Built for businesses that want more launches, more creative testing, and stronger automation performance.",
    badge: "Most Popular",
    accentGlow: "rgba(124,77,255,0.22)",
    featured: true,
    cta: "Choose Pro",
    features: [
      "Everything in Starter",
      "Up to 5 campaign launches per month",
      "More creative and variant generation",
      "Stronger autonomous optimization cadence",
      "Automatic creative refresh as needed",
      "Broader testing coverage",
      "More active campaign control",
      "Priority support",
    ],
  },
  {
    name: "Operator",
    price: "$149.99",
    subtitle: "For businesses that want the deepest automation layer, the highest campaign capacity, and the strongest in-product system.",
    badge: "Advanced",
    accentGlow: "rgba(49,225,255,0.14)",
    cta: "Choose Operator",
    features: [
      "Everything in Pro",
      "Up to 10 campaign launches per month",
      "Highest creative generation capacity",
      "Highest testing intensity",
      "Deepest autonomous optimization layer",
      "Pattern memory as operator capabilities expand",
      "Earliest access to advanced features",
      "Highest priority support",
    ],
  },
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
    boxShadow: "0 10px 30px rgba(0,0,0,0.22)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
  };

  const openContact = (planName) => {
    try {
      trackEvent("pricing_cta_click", { page: "pricing", plan: planName });
    } catch {}
    navigate("/login");
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: BG_DARK,
        color: "#fff",
        fontFamily: FONT,
        position: "relative",
        overflowX: "hidden",
        overflowY: "visible",
      }}
    >
      <style>{`
        html, body, #root {
          background: ${BG_DARK};
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
          overflow-x: hidden;
        }

        body {
          overscroll-behavior-y: auto;
        }

        * {
          box-sizing: border-box;
        }
      `}</style>

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-16vh",
          right: "-8vw",
          width: isMobile ? 280 : 560,
          height: isMobile ? 280 : 560,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT}22, transparent 72%)`,
          filter: "blur(28px)",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-18vh",
          left: "-10vw",
          width: isMobile ? 320 : 620,
          height: isMobile ? 320 : 620,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT_2}1e, transparent 72%)`,
          filter: "blur(30px)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1220,
          margin: "0 auto",
          padding: isMobile ? "22px 16px 70px" : "28px 28px 100px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: isMobile ? 14 : 18,
            marginBottom: isMobile ? 34 : 56,
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
            marginBottom: isMobile ? 24 : 38,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "2.2rem" : "3.4rem",
              lineHeight: 1.06,
              fontWeight: 900,
              letterSpacing: isMobile ? "-0.6px" : "-1px",
              color: "#ffffff",
            }}
          >
            Pricing
          </h1>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? 18 : 24,
            alignItems: "stretch",
            marginTop: isMobile ? 16 : 24,
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
                minHeight: "auto",
                boxShadow: plan.featured
                  ? "0 18px 50px rgba(124,77,255,0.18)"
                  : "0 10px 28px rgba(0,0,0,0.22)",
                border: plan.featured
                  ? "1px solid rgba(124,77,255,0.28)"
                  : `1px solid ${GLASS_BORDER}`,
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
                    marginTop: 14,
                    color: "rgba(255,255,255,0.84)",
                    fontSize: 15,
                    lineHeight: 1.65,
                    fontWeight: 500,
                    minHeight: isMobile ? "auto" : 72,
                  }}
                >
                  {plan.subtitle}
                </div>
              </div>

              <button
                onClick={() => openContact(plan.name)}
                style={{
                  width: "100%",
                  marginTop: 24,
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
                    ? "0 12px 34px rgba(124,77,255,0.28)"
                    : "0 10px 26px rgba(15,111,255,0.28)",
                  transition: "transform .15s ease, opacity .2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.opacity = "0.96";
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
                  marginTop: 24,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  paddingTop: 18,
                }}
              >
                <div
                  style={{
                    marginBottom: 12,
                    color: "#ffffff",
                    fontWeight: 800,
                    fontSize: 14,
                    letterSpacing: 0.2,
                  }}
                >
                  Included in this plan
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
            marginTop: isMobile ? 28 : 40,
            textAlign: "center",
            borderRadius: 24,
            padding: isMobile ? "1.2rem 1rem" : "1.5rem 1.4rem",
            ...glass,
          }}
        >
          <div
            style={{
              fontSize: isMobile ? 22 : 28,
              fontWeight: 900,
              lineHeight: 1.15,
              marginBottom: 10,
              color: "#ffffff",
            }}
          >
            Smarter campaign execution without agency friction
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
            Choose the plan that matches your business today. As your needs grow, you can move into
            more campaign volume, deeper optimization, and stronger automation.
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;