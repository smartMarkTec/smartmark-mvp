import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import smartmarkLogo from "../assets/smartemark-logo.png";
import { trackEvent } from "../analytics/gaEvents";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(160deg, #f5f6ff 0%, #f8f9fc 55%, #f0f2ff 100%)";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const PURPLE = "#5d59ea";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const plans = [
  {
    name: "Base",
    planKey: "base",
    price: "$249",
    cardTitle: "AI Campaign Manager",
    description:
      "For business owners who want to use Smartemark themselves to create, launch, and monitor Facebook/Instagram ads.",
    badge: null,
    featured: false,
    isDark: false,
    cta: "Get Base",
    features: [
      "AI creates ads",
      "AI writes headlines/captions",
      "AI launches campaigns",
      "AI monitors campaigns",
      "Basic AI optimization",
      "10 ad regenerations/day",
      "Upload custom photos/creatives",
      "Campaign dashboard",
      "Basic support",
    ],
  },
  {
    name: "Deluxe",
    planKey: "deluxe",
    price: "$495",
    cardTitle: "AI Campaign Manager + AI Assistant",
    description:
      "For business owners who want the Smartemark platform plus guided AI help with marketing decisions, offers, services, and campaign ideas.",
    badge: "Most Popular",
    featured: true,
    isDark: false,
    cta: "Get Deluxe",
    features: [
      "Everything in Base",
      "AI Marketing Assistant",
      "Ask campaign/marketing questions",
      "AI suggestions for ad angles",
      "AI help choosing services/specials to promote",
      "AI help deciding between marketing ideas",
      "20 ad regenerations/day",
      "AI Assistant usage refreshes throughout the day",
      "Advanced dashboard",
      "Priority support",
    ],
  },
  {
    name: "Premium",
    planKey: "premium",
    price: "$749",
    cardTitle: "Done-For-You AI Ad Management",
    description:
      "For business owners who want our team to manage the campaign for them through Smartemark.",
    badge: "Done For You",
    featured: false,
    isDark: true,
    cta: "Get Premium",
    features: [
      "Everything in Deluxe",
      "We create campaigns for you",
      "We launch campaigns through Smartemark",
      "We monitor campaign performance",
      "We make campaign adjustments",
      "Ad variations handled by our team as needed",
      "Creative/photo assets handled by our team as needed",
      "Meta Pixel setup",
      "Google Analytics setup/review",
      "Call tracking setup",
      "Conversion tracking setup",
      "Monthly performance review",
    ],
  },
];

const faqs = [
  {
    q: "Is Facebook ad spend included?",
    a: "No. Facebook/Instagram ad spend is separate. Smartemark is the platform and service fee. Most businesses start with around $150–$300/month in ad spend, depending on how aggressive they want to be.",
  },
  {
    q: "Do you guarantee calls?",
    a: "No marketing platform can guarantee exact call volume because results depend on the market, offer, budget, service area, and competition. Smartemark helps create, launch, monitor, and improve campaigns so the business has a stronger chance of getting results.",
  },
  {
    q: "What does Premium include?",
    a: "Premium is our done-for-you option. We help create, launch, monitor, and adjust campaigns through Smartemark. It can also include Meta Pixel setup, Google Analytics setup/review, call tracking setup, conversion tracking setup, and a monthly performance review.",
  },
  {
    q: "Do I need to know Facebook ads?",
    a: "No. Base lets you use the Smartemark AI platform yourself. Deluxe gives you extra AI guidance. Premium is best if you want us to handle most of the campaign work for you.",
  },
  {
    q: "Can I cancel?",
    a: "Yes. Smartemark is month-to-month with no long-term contract.",
  },
  {
    q: "What happens after I sign up?",
    a: "After signing up, you will create your account, connect the needed campaign information, and start setting up your first campaign. Premium customers may be guided through additional onboarding so we can collect the information needed to manage the campaign properly.",
  },
];

const Pricing = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loadingPlan, setLoadingPlan] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  useEffect(() => {
    try {
      trackEvent("view_pricing", { page: "pricing" });
    } catch {}
  }, []);

  const startCheckout = async (plan) => {
    if (!plan?.planKey) return;

    setLoadingPlan(plan.planKey);

    try {
      localStorage.setItem("sm_selected_plan", plan.planKey);

      try {
        trackEvent("pricing_cta_click", {
          page: "pricing",
          plan: plan.name,
          planKey: plan.planKey,
        });
      } catch {}

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan: plan.planKey }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok || !json?.url) {
        throw new Error(json?.error || "Could not start checkout. Please try again.");
      }

      window.location.assign(json.url);
    } catch (err) {
      console.error("Pricing -> checkout failed:", err);
      alert(err?.message || "Something went wrong. Please try again.");
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
      }}
    >
      <style>{`
        html, body, #root {
          margin: 0;
          padding: 0;
        }
        body {
          overscroll-behavior-y: auto;
        }
        * {
          box-sizing: border-box;
        }
        .sm-faq-row {
          border-bottom: 1px solid rgba(0,0,0,0.08);
        }
        .sm-faq-row:first-child {
          border-top: 1px solid rgba(0,0,0,0.08);
        }
        .sm-faq-btn:hover .sm-faq-icon {
          background: rgba(0,0,0,0.10) !important;
        }
        .sm-plan-btn:hover {
          opacity: 0.88 !important;
        }
      `}</style>

      {/* Soft background blobs */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "8%",
          right: "-6%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(93,89,234,0.07) 0%, transparent 70%)",
          filter: "blur(48px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <div
        aria-hidden
        style={{
          position: "fixed",
          bottom: "4%",
          left: "-6%",
          width: 560,
          height: 560,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(93,89,234,0.05) 0%, transparent 70%)",
          filter: "blur(48px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1180,
          margin: "0 auto",
          padding: isMobile ? "20px 16px 80px" : "28px 32px 100px",
        }}
      >
        {/* ── Nav ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: isMobile ? 40 : 64,
          }}
        >
          <button
            onClick={() => navigate("/")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "none",
              border: "none",
              padding: 0,
              color: TEXT,
              cursor: "pointer",
            }}
          >
            <div
              role="img"
              aria-label="Smartemark"
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                flexShrink: 0,
                backgroundImage: `url(${smartmarkLogo})`,
                backgroundSize: "256%",
                backgroundPosition: "51% 48%",
                backgroundRepeat: "no-repeat",
              }}
            />
            <span style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>Smartemark</span>
          </button>

          <button
            onClick={() => navigate("/login")}
            style={{
              padding: isMobile ? "8px 16px" : "9px 20px",
              fontSize: 14,
              color: "#fff",
              background: "#111827",
              border: "none",
              borderRadius: 8,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Login
          </button>
        </div>

        {/* ── Hero ── */}
        <h1
          style={{
            textAlign: "center",
            margin: "0 auto",
            marginBottom: isMobile ? 40 : 56,
            fontSize: isMobile ? "2.4rem" : "3.5rem",
            lineHeight: 1.08,
            fontWeight: 800,
            letterSpacing: isMobile ? "-0.6px" : "-1.2px",
            color: TEXT,
          }}
        >
          Pricing
        </h1>

        {/* ── Pricing cards ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
            gap: isMobile ? 16 : 24,
            alignItems: "stretch",
          }}
        >
          {plans.map((plan) => {
            const isLoading = loadingPlan === plan.planKey;
            const dark = plan.isDark;
            const cardText = dark ? "#f1f5f9" : TEXT;
            const cardTextSoft = dark ? "rgba(241,245,249,0.58)" : TEXT_SOFT;

            return (
              <div
                key={plan.planKey}
                style={{
                  position: "relative",
                  borderRadius: 20,
                  padding: isMobile ? "28px 22px 32px" : "36px 32px 40px",
                  background: dark ? "#0f172a" : "white",
                  border: dark
                    ? "1px solid rgba(255,255,255,0.06)"
                    : plan.featured
                    ? "2px solid rgba(93,89,234,0.32)"
                    : "1px solid rgba(0,0,0,0.08)",
                  boxShadow: dark
                    ? "0 12px 56px rgba(0,0,0,0.26)"
                    : plan.featured
                    ? "0 8px 44px rgba(93,89,234,0.12)"
                    : "0 2px 18px rgba(0,0,0,0.06)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Badge row — always reserves space to align cards */}
                <div style={{ marginBottom: 20, minHeight: 26 }}>
                  {plan.badge && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "4px 12px",
                        borderRadius: 999,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        ...(plan.featured
                          ? {
                              background: "rgba(93,89,234,0.10)",
                              color: PURPLE,
                              border: "1px solid rgba(93,89,234,0.18)",
                            }
                          : {
                              background: "rgba(234,179,8,0.12)",
                              color: "#d97706",
                              border: "1px solid rgba(217,119,6,0.18)",
                            }),
                      }}
                    >
                      {plan.badge}
                    </span>
                  )}
                </div>

                {/* Plan name */}
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: cardText,
                    letterSpacing: "-0.3px",
                    marginBottom: 4,
                  }}
                >
                  {plan.name}
                </div>

                {/* Card title */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: cardTextSoft,
                    marginBottom: 20,
                  }}
                >
                  {plan.cardTitle}
                </div>

                {/* Price */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 4,
                    marginBottom: 16,
                  }}
                >
                  <span
                    style={{
                      fontSize: isMobile ? 46 : 52,
                      lineHeight: 1,
                      fontWeight: 800,
                      color: cardText,
                      letterSpacing: "-2px",
                    }}
                  >
                    {plan.price}
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      color: cardTextSoft,
                      fontWeight: 500,
                      paddingBottom: 8,
                    }}
                  >
                    /mo
                  </span>
                </div>

                {/* Description */}
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.65,
                    color: cardTextSoft,
                    margin: "0 0 26px",
                    fontWeight: 400,
                    minHeight: isMobile ? "auto" : 64,
                  }}
                >
                  {plan.description}
                </p>

                {/* CTA button */}
                <button
                  type="button"
                  className="sm-plan-btn"
                  onClick={() => startCheckout(plan)}
                  disabled={!!loadingPlan}
                  style={{
                    width: "100%",
                    padding: "13px 16px",
                    borderRadius: 10,
                    border: dark
                      ? "none"
                      : "1.5px solid rgba(0,0,0,0.16)",
                    background: dark ? "white" : "#111827",
                    color: dark ? "#111827" : "white",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: loadingPlan ? "not-allowed" : "pointer",
                    opacity: loadingPlan && !isLoading ? 0.6 : 1,
                    transition: "opacity 0.15s",
                    marginBottom: 28,
                  }}
                >
                  {isLoading ? "Continuing…" : plan.cta}
                </button>

                {/* Divider */}
                <div
                  style={{
                    borderTop: dark
                      ? "1px solid rgba(255,255,255,0.09)"
                      : "1px solid rgba(0,0,0,0.07)",
                    marginBottom: 20,
                  }}
                />

                {/* Features */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: cardTextSoft,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                      marginBottom: 14,
                    }}
                  >
                    What's included
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {plan.features.map((feat) => (
                      <div
                        key={feat}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                        }}
                      >
                        <div
                          style={{
                            flexShrink: 0,
                            width: 18,
                            height: 18,
                            borderRadius: "50%",
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: dark
                              ? "rgba(255,255,255,0.12)"
                              : "rgba(93,89,234,0.10)",
                            color: dark ? "rgba(241,245,249,0.9)" : PURPLE,
                            fontSize: 10,
                            fontWeight: 900,
                          }}
                        >
                          ✓
                        </div>
                        <span
                          style={{
                            fontSize: 14,
                            color: cardText,
                            fontWeight: 400,
                            lineHeight: 1.5,
                          }}
                        >
                          {feat}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── FAQ ── */}
        <div
          style={{
            marginTop: isMobile ? 64 : 96,
            marginLeft: "auto",
            marginRight: "auto",
            maxWidth: 720,
          }}
        >
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <h2
              style={{
                margin: 0,
                fontSize: isMobile ? "1.6rem" : "1.95rem",
                fontWeight: 800,
                color: TEXT,
                letterSpacing: "-0.4px",
              }}
            >
              Frequently Asked Questions
            </h2>
          </div>

          <div>
            {faqs.map((faq, i) => (
              <div key={i} className="sm-faq-row">
                <button
                  className="sm-faq-btn"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "18px 0",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    gap: 14,
                    fontFamily: FONT,
                  }}
                >
                  <span
                    style={{
                      fontSize: isMobile ? 15 : 16,
                      fontWeight: 600,
                      color: TEXT,
                      lineHeight: 1.4,
                    }}
                  >
                    {faq.q}
                  </span>
                  <span
                    className="sm-faq-icon"
                    style={{
                      flexShrink: 0,
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                      lineHeight: 1,
                      color: TEXT_SOFT,
                      transition: "transform 0.2s ease",
                      transform: openFaq === i ? "rotate(45deg)" : "rotate(0deg)",
                    }}
                  >
                    +
                  </span>
                </button>

                {openFaq === i && (
                  <div
                    style={{
                      paddingBottom: 20,
                      fontSize: 15,
                      color: TEXT_SOFT,
                      lineHeight: 1.7,
                      fontWeight: 400,
                    }}
                  >
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
