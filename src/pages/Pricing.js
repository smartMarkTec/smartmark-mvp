import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartemark-logo.png";
import { trackEvent } from "../analytics/gaEvents";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(180deg, #bcc3fb 0%, #d6dbff 38%, #ecefff 100%)";
const TEXT = "#101426";
const TEXT_SOFT = "#66708b";
const PURPLE = "#5d59ea";
const BLUE = "#4c63ff";
const BLUE_HOVER = "#4058f4";
const BORDER = "rgba(93, 89, 234, 0.13)";
const PANEL = "rgba(255,255,255,0.80)";
const SHADOW = "0 18px 46px rgba(83, 77, 212, 0.12)";
const SOFT_SHADOW = "0 10px 28px rgba(83, 77, 212, 0.08)";

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
    name: "Standard",
    planKey: "starter",
    price: "$99",
    subtitle:
      "A simple, powerful way to launch and manage ads with real AI help.",
    badge: "Standard",
    accentGlow: "rgba(76,99,255,0.16)",
    cta: "Get Started",
    features: [
      "2 campaigns per month",
      "1 business",
      "1 connected ad account",
      "AI-generated ad copy",
      "AI-generated creatives",
      "Fast campaign launch",
      "AI campaign monitoring",
      "AI strategizing",
      "Core AI optimization",
      "Basic A/B testing",
      "Standard support",
    ],
  },
  {
    name: "Pro",
    planKey: "pro",
    price: "$149",
    subtitle:
      "For businesses that want stronger strategy, more testing, and more active optimization.",
    badge: "Most Popular",
    accentGlow: "rgba(123,114,255,0.18)",
    featured: true,
    cta: "Choose Pro",
    features: [
      "Everything in Standard",
      "6 campaigns per month",
      "2 businesses",
      "2 connected ad accounts",
      "More creative variations per campaign",
      "Enhanced A/B testing",
      "Advanced AI strategizing",
      "Deeper campaign research",
      "Stronger AI optimization",
      "Automatic creative refresh when needed",
      "Priority support",
    ],
  },
  {
    name: "Operator",
    planKey: "operator",
    price: "$249",
    subtitle:
      "For businesses that want the deepest Smartemark automation layer and strongest in-product system.",
    badge: "Advanced",
    accentGlow: "rgba(93,89,234,0.14)",
    cta: "Choose Operator",
    features: [
      "Everything in Pro",
      "10 campaigns per month",
      "3 businesses",
      "3 connected ad accounts",
      "Highest number of creative variations",
      "Advanced A/B testing",
      "Deepest campaign research",
      "Operator-grade AI strategizing",
      "Operator-grade AI optimization",
      "More frequent creative refreshes",
      "Highest priority support",
    ],
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loadingPlan, setLoadingPlan] = useState("");

  useEffect(() => {
    try {
      trackEvent("view_pricing", { page: "pricing" });
    } catch {}
  }, []);

  const glass = {
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.84), rgba(255,255,255,0.74))",
    border: `1px solid ${BORDER}`,
    boxShadow: SHADOW,
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
  };

  const startCheckout = (plan) => {
    if (!plan?.planKey) return;

    try {
      setLoadingPlan(plan.planKey);
      localStorage.setItem("sm_selected_plan", plan.planKey);

      try {
        trackEvent("pricing_cta_click", {
          page: "pricing",
          plan: plan.name,
          planKey: plan.planKey,
        });
      } catch {}

      navigate("/signup", {
        state: {
          selectedPlan: plan.planKey,
          selectedPlanName: plan.name,
          fromPricing: true,
        },
      });
    } catch (err) {
      console.error("Pricing -> signup redirect failed:", err);
      alert("Something went wrong. Please try again.");
      setLoadingPlan("");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: BG,
        color: TEXT,
        fontFamily: FONT,
        position: "relative",
        overflowX: "hidden",
        overflowY: "visible",
      }}
    >
      <style>{`
        html, body, #root {
          background: ${BG};
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
          inset: 0,
          backgroundImage: `
            linear-gradient(rgba(93, 89, 234, 0.045) 1px, transparent 1px),
            linear-gradient(90deg, rgba(93, 89, 234, 0.045) 1px, transparent 1px)
          `,
          backgroundSize: isMobile ? "36px 36px" : "52px 52px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.10))",
          WebkitMaskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.10))",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-16vh",
          right: "-8vw",
          width: isMobile ? 260 : 520,
          height: isMobile ? 260 : 520,
          background:
            "radial-gradient(40% 40% at 50% 50%, rgba(123,114,255,0.20), transparent 72%)",
          filter: "blur(30px)",
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
          background:
            "radial-gradient(40% 40% at 50% 50%, rgba(76,99,255,0.16), transparent 72%)",
          filter: "blur(32px)",
          pointerEvents: "none",
        }}
      />

      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "18%",
          left: "50%",
          transform: "translateX(-50%)",
          width: isMobile ? "88%" : "76%",
          height: isMobile ? 180 : 240,
          borderRadius: 999,
          background:
            "linear-gradient(90deg, rgba(76,99,255,0.06), rgba(123,114,255,0.10), rgba(76,99,255,0.04))",
          filter: "blur(38px)",
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
              color: TEXT,
              cursor: "pointer",
            }}
          >
            <img
              src={smartmarkLogo}
              alt="Smartemark"
              style={{ width: 24, height: 24, borderRadius: 8, opacity: 0.95 }}
            />
            <span style={{ fontWeight: 800, fontSize: 14 }}>Smartemark</span>
          </button>

          <button
            onClick={() => navigate("/login")}
            style={{
              padding: isMobile ? "0.8rem 1.3rem" : "0.9rem 1.7rem",
              fontSize: 15,
              color: "#fff",
              background: BLUE,
              border: "none",
              borderRadius: 999,
              fontWeight: 800,
              boxShadow: "0 10px 26px rgba(76,99,255,0.24)",
              cursor: "pointer",
              transition:
                "transform .15s ease, background .2s ease, box-shadow .2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = BLUE_HOVER;
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow =
                "0 14px 36px rgba(76,99,255,0.32)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = BLUE;
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 10px 26px rgba(76,99,255,0.24)";
            }}
          >
            Login
          </button>
        </div>

        <div
          style={{
            textAlign: "center",
            marginBottom: isMobile ? 28 : 42,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "0.5rem 0.9rem",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 0.4,
              color: PURPLE,
              background: "rgba(255,255,255,0.62)",
              border: `1px solid ${BORDER}`,
              marginBottom: 18,
            }}
          >
            Smartemark Pricing
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? "2.35rem" : "3.55rem",
              lineHeight: 1.04,
              fontWeight: 900,
              letterSpacing: isMobile ? "-0.7px" : "-1.1px",
              color: TEXT,
            }}
          >
            Choose your plan
          </h1>

          <div
            style={{
              maxWidth: 760,
              margin: "14px auto 0",
              color: TEXT_SOFT,
              fontSize: isMobile ? 15 : 17,
              lineHeight: 1.7,
              fontWeight: 500,
            }}
          >
            Simple pricing for businesses that want AI-powered campaign launch
            and management without agency friction.
          </div>
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
          {plans.map((plan) => {
            const isLoading = loadingPlan === plan.planKey;

            return (
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
                    ? "0 18px 50px rgba(123,114,255,0.14)"
                    : SOFT_SHADOW,
                  border: plan.featured
                    ? "1px solid rgba(123,114,255,0.24)"
                    : `1px solid ${BORDER}`,
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
                    color: plan.featured ? "#fff" : PURPLE,
                    background: plan.featured
                      ? "linear-gradient(90deg, #5f56eb, #786dff)"
                      : "rgba(93,89,234,0.08)",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  {plan.badge}
                </div>

                <div style={{ marginTop: 18 }}>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 900,
                      color: TEXT,
                      letterSpacing: "-0.6px",
                    }}
                  >
                    {plan.name}
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: isMobile ? 40 : 46,
                        lineHeight: 1,
                        fontWeight: 900,
                        color: TEXT,
                        letterSpacing: "-1px",
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      style={{
                        fontSize: 15,
                        color: TEXT_SOFT,
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
                      color: TEXT_SOFT,
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
                  type="button"
                  onClick={() => startCheckout(plan)}
                  disabled={!!loadingPlan}
                  style={{
                    width: "100%",
                    marginTop: 24,
                    padding: "0.95rem 1.1rem",
                    borderRadius: 999,
                    border: "none",
                    background: "#4c63ff",
                    color: "#ffffff",
                    fontSize: 15,
                    fontWeight: 900,
                    cursor: loadingPlan ? "not-allowed" : "pointer",
                    opacity: loadingPlan && !isLoading ? 0.75 : 1,
                    boxShadow: "0 12px 28px rgba(76,99,255,0.22)",
                  }}
                >
                  {isLoading ? "Continuing..." : plan.cta}
                </button>

                <div
                  style={{
                    marginTop: 24,
                    borderTop: "1px solid rgba(16,20,38,0.08)",
                    paddingTop: 18,
                  }}
                >
                  <div
                    style={{
                      marginBottom: 12,
                      color: TEXT,
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
                          color: TEXT,
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
                            background: "rgba(93,89,234,0.10)",
                            color: PURPLE,
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
            );
          })}
        </div>

        <div
        
        >
     
        
      
        </div>
      </div>
    </div>
  );
};

export default Pricing;