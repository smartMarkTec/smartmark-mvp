import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { trackEvent } from "../analytics/gaEvents";
import { trackLead } from "../utils/metaPixel";

const BOOKING_URL = "https://cal.com/william-knowles-wxottg/30min";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG = "linear-gradient(160deg, #f5f6ff 0%, #f8f9fc 55%, #f0f2ff 100%)";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const PURPLE = "#5d59ea";

const LS_MARKET = "sm_pricing_market";

const SERVICE_FEATURES = [
  "Facebook ad strategy",
  "Campaign setup",
  "Ad creation",
  "Testing different messages and angles",
  "Campaign launch",
  "Monitoring performance",
  "Adjustments based on what's working",
  "Clear updates/reporting",
];

const plans = [
  {
    name: "Base",
    planKey: "base",
    price: "$249",
    cardTitle: "AI Campaign Manager",
    description:
      "The AI runs the campaign, but you operate it from your dashboard.",
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
      "The AI runs the campaign, and you also get the AI Assistant to guide you with ideas, specials, ad angles, and campaign direction.",
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
      "The AI runs the campaign, but we operate it for you. We handle setup, tracking, monitoring, and reporting.",
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

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const Pricing = ({ pricingVariant: variantProp, customPlans, homeRoute }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [loadingPlan, setLoadingPlan] = useState("");
  const [openFaq, setOpenFaq] = useState(null);

  const activePlans = customPlans || plans;
  const activeVariant = variantProp || "normal";
  const activeHomeRoute = homeRoute || "/";

  // Resolve market from URL param → localStorage → default
  const rawMarket = searchParams.get("market");
  const market =
    rawMarket === "service" || rawMarket === "tech"
      ? rawMarket
      : (() => {
          try {
            const stored = localStorage.getItem(LS_MARKET);
            return stored === "service" || stored === "tech" ? stored : "service";
          } catch {
            return "service";
          }
        })();

  // Persist market to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LS_MARKET, market);
    } catch {}
  }, [market]);

  const switchMarket = (newMarket) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("market", newMarket);
        return next;
      },
      { replace: false }
    );
  };

  // The premium plan (used as the base for the service card)
  const premiumPlan =
    activePlans.find((p) => p.planKey === "premium") ||
    activePlans[activePlans.length - 1];

  useEffect(() => {
    try {
      trackEvent("view_pricing", {
        page: "pricing",
        pricingVariant: activeVariant,
        pricingMarket: market,
      });
    } catch {}
  }, [activeVariant, market]);

  const startCheckout = async (plan) => {
    if (!plan?.planKey) return;

    setLoadingPlan(plan.planKey);

    try {
      localStorage.setItem("sm_selected_plan", plan.planKey);
      localStorage.setItem("sm_pricing_variant", activeVariant);
      try {
        localStorage.setItem(LS_MARKET, market);
      } catch {}

      try {
        trackEvent("pricing_cta_click", {
          page: "pricing",
          plan: plan.name,
          planKey: plan.planKey,
          pricingVariant: activeVariant,
          pricingMarket: market,
        });
      } catch {}

      const res = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          plan: plan.planKey,
          pricingVariant: activeVariant,
          pricingMarket: market,
        }),
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
        @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400&display=swap');

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
        .sm-market-tab:hover {
          background: rgba(93,89,234,0.06) !important;
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

      {/* ── Sticky nav ── */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: "rgba(248,249,252,0.94)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(0,0,0,0.07)",
        }}
      >
        <div
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: isMobile ? "0 16px" : "0 32px",
            height: isMobile ? 54 : 62,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <button
            onClick={() => navigate(activeHomeRoute)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 20, color: TEXT, letterSpacing: -0.5 }}>
              Smartemark
            </span>
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={() => navigate("/login")}
              style={{
                padding: "7px 14px",
                fontSize: 14,
                color: TEXT_SOFT,
                background: "none",
                border: "none",
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Login
            </button>
            <a
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={trackLead}
              style={{
                padding: "8px 16px",
                fontSize: 14,
                color: "#fff",
                background: "#111827",
                borderRadius: 8,
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "none",
                fontFamily: FONT,
              }}
            >
              Book a Call
            </a>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div
        style={{
          position: "relative",
          zIndex: 2,
          maxWidth: 1180,
          margin: "0 auto",
          padding: isMobile ? "48px 16px 80px" : "64px 32px 100px",
        }}
      >

        {/* ── Hero ── */}
        <h1
          style={{
            textAlign: "center",
            margin: "0 auto",
            marginBottom: isMobile ? 32 : 40,
            fontFamily: "'Lora', Georgia, serif",
            fontSize: isMobile ? "2.6rem" : "4rem",
            lineHeight: 1.08,
            fontWeight: 400,
            letterSpacing: "0px",
            color: TEXT,
          }}
        >
          Pricing
        </h1>

        {/* ── Market tabs ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: isMobile ? 8 : 10,
            marginBottom: isMobile ? 40 : 52,
            flexWrap: "wrap",
          }}
        >
          {[
            { key: "service", label: "Service Businesses" },
            { key: "tech", label: "Online / Tech Businesses" },
          ].map(({ key, label }) => {
            const isActive = market === key;
            return (
              <button
                key={key}
                className="sm-market-tab"
                onClick={() => switchMarket(key)}
                style={{
                  padding: isMobile ? "9px 18px" : "10px 24px",
                  borderRadius: 999,
                  border: isActive
                    ? "none"
                    : "1.5px solid rgba(0,0,0,0.12)",
                  background: isActive ? PURPLE : "transparent",
                  color: isActive ? "#fff" : TEXT_SOFT,
                  fontSize: isMobile ? 13 : 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: FONT,
                  transition: "background 0.15s, color 0.15s",
                  letterSpacing: "-0.1px",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Service Businesses plan card ── */}
        {market === "service" && premiumPlan && (() => {
          const dark = true;
          const cardText = "#f1f5f9";
          const cardTextSoft = "rgba(241,245,249,0.58)";
          const isLoading = loadingPlan === premiumPlan.planKey;

          return (
            <div
              style={{
                maxWidth: 580,
                margin: "0 auto",
              }}
            >
              <div
                style={{
                  borderRadius: 20,
                  padding: isMobile ? "28px 22px 32px" : "40px 36px 44px",
                  background: "#0f172a",
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow: "0 12px 56px rgba(0,0,0,0.26)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* Badge */}
                <div style={{ marginBottom: 20, minHeight: 26 }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "4px 12px",
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      background: "rgba(234,179,8,0.12)",
                      color: "#d97706",
                      border: "1px solid rgba(217,119,6,0.18)",
                    }}
                  >
                    Done For You
                  </span>
                </div>

                {/* Plan name */}
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: cardText,
                    letterSpacing: "-0.3px",
                    marginBottom: 4,
                  }}
                >
                  Service Business Growth Plan
                </div>

                {/* Subtitle */}
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: cardTextSoft,
                    marginBottom: 20,
                  }}
                >
                  Done-for-you Facebook ads
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
                      fontSize: isMobile ? 46 : 56,
                      lineHeight: 1,
                      fontWeight: 800,
                      color: cardText,
                      letterSpacing: "-2px",
                    }}
                  >
                    {premiumPlan.price}
                  </span>
                  <span
                    style={{
                      fontSize: 15,
                      color: cardTextSoft,
                      fontWeight: 500,
                      paddingBottom: 10,
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
                  }}
                >
                  For HVAC, plumbing, electrical, and local service businesses,
                  this is our done-for-you Facebook ads service.
                </p>

                {/* CTA */}
                <button
                  type="button"
                  className="sm-plan-btn"
                  onClick={() => startCheckout(premiumPlan)}
                  disabled={!!loadingPlan}
                  style={{
                    width: "100%",
                    padding: "14px 16px",
                    borderRadius: 10,
                    border: "none",
                    background: "white",
                    color: "#111827",
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: loadingPlan ? "not-allowed" : "pointer",
                    opacity: loadingPlan && !isLoading ? 0.6 : 1,
                    transition: "opacity 0.15s",
                    marginBottom: 28,
                  }}
                >
                  {isLoading ? "Continuing…" : "Get Started"}
                </button>

                {/* Divider */}
                <div
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.09)",
                    marginBottom: 20,
                  }}
                />

                {/* Features label */}
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

                {/* Features */}
                <div style={{ display: "flex", flexDirection: "column", gap: 11, marginBottom: 24 }}>
                  {SERVICE_FEATURES.map((feat) => (
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
                          background: "rgba(255,255,255,0.12)",
                          color: "rgba(241,245,249,0.9)",
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

                {/* 3-day notice */}
                <div
                  style={{
                    padding: "14px 16px",
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 10,
                    fontSize: 13,
                    color: cardTextSoft,
                    lineHeight: 1.6,
                    fontStyle: "italic",
                  }}
                >
                  Once you sign up and we have access to your Facebook account
                  and campaign details, we can have your campaign up and running
                  within 3 days.
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Online / Tech Businesses — 3-plan grid ── */}
        {market === "tech" && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(3, minmax(0, 1fr))",
              gap: isMobile ? 16 : 24,
              alignItems: "stretch",
            }}
          >
            {activePlans.map((plan) => {
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
                  {/* Badge row */}
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
        )}

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
