/* eslint-disable */
import { useEffect, useState } from "react";
import { FaBolt, FaChevronDown } from "react-icons/fa";

// ─── Update this to change the booking link site-wide ─────────────────────────
const BOOKING_URL = "https://cal.com/william-knowles-wxottg/30min";

const FONT         = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const BG           = "linear-gradient(160deg, #e8ecff 0%, #f0f2ff 40%, #f7f8ff 72%, #fbfbff 100%)";
const TEXT         = "#101426";
const TEXT_SOFT    = "#626b86";
const PURPLE       = "#5d59ea";
const BORDER       = "rgba(93, 89, 234, 0.12)";
const PANEL_STRONG = "rgba(255,255,255,0.96)";
const BTN          = "linear-gradient(135deg, #4c63ff 0%, #5f56eb 56%, #786dff 100%)";
const BTN_HOVER    = "linear-gradient(135deg, #4358f4 0%, #554ce4 56%, #6f63fc 100%)";
const SOFT_SHADOW  = "0 8px 24px rgba(83, 77, 212, 0.07)";

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

const AI_INSIGHT =
  "Campaign momentum is building. The second creative variant is outperforming the original — I've shifted budget toward the stronger ad and will continue monitoring lead cost over the next 48 hours.";

// ─── CTAButton ────────────────────────────────────────────────────────────────
function CTAButton({ children, onClick, small }) {
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
        padding: small ? "9px 18px" : "13px 28px",
        fontSize: small ? 14 : 15,
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

// ─── OutlineButton ────────────────────────────────────────────────────────────
function OutlineButton({ children, href }) {
  const [hover, setHover] = useState(false);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1.5px solid ${hover ? PURPLE : "rgba(93,89,234,0.45)"}`,
        background: hover ? "rgba(93,89,234,0.06)" : "transparent",
        color: PURPLE,
        borderRadius: 999,
        padding: "12px 26px",
        fontSize: 15,
        fontWeight: 700,
        fontFamily: FONT,
        letterSpacing: "-0.01em",
        transition: "all 160ms ease",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      {children}
    </a>
  );
}

// ─── SectionTag ───────────────────────────────────────────────────────────────
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

// ─── FAQItem ──────────────────────────────────────────────────────────────────
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
        <span style={{ color: TEXT, fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
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
        <div style={{ padding: "0 24px 22px", color: TEXT_SOFT, fontSize: 15, lineHeight: 1.8 }}>
          {item.a}
        </div>
      )}
    </div>
  );
}

// ─── MetricTile ───────────────────────────────────────────────────────────────
function MetricTile({ label, value, trend }) {
  return (
    <div style={{ background: "#ffffff", border: `1px solid ${BORDER}`, borderRadius: 16, padding: "14px 16px" }}>
      <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 11, marginBottom: 6, letterSpacing: "0.04em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ color: TEXT, fontWeight: 700, fontSize: 22, lineHeight: 1.1, marginBottom: trend ? 4 : 0 }}>
        {value}
      </div>
      {trend && (
        <div style={{ color: "#16a34a", fontWeight: 600, fontSize: 11 }}>{trend}</div>
      )}
    </div>
  );
}

// ─── Landing ──────────────────────────────────────────────────────────────────
export default function Landing() {
  const [isMobile, setIsMobile]     = useState(window.innerWidth <= 920);
  const [openFaq, setOpenFaq]       = useState(-1);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [scrolled, setScrolled]     = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 920);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    // Optimistic: if we have a stored sid + non-anon namespace, assume logged in immediately
    // so the Dashboard button renders without a flash on normal page loads.
    let storedSid = "";
    try {
      storedSid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const ns =
        sessionStorage.getItem("sm_user_ns_v1") ||
        localStorage.getItem("sm_user_ns_v1") ||
        "anon";
      if (storedSid && ns && ns !== "anon") setIsLoggedIn(true);
    } catch {}

    const url = storedSid
      ? `/auth/whoami?sm_sid=${encodeURIComponent(storedSid)}`
      : `/auth/whoami`;
    fetch(url, {
      credentials: "include",
      headers: storedSid ? { "x-sm-sid": storedSid } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setIsLoggedIn(!!(d?.success)))
      .catch(() => {});
  }, []);

  // Get Started → /pricing for new visitors; → /setup for logged-in users
  const handleCTA = () => {
    window.location.href = isLoggedIn ? "/setup" : "/pricing";
  };

  const scrollToFaq = () => {
    const el = document.getElementById("landing-faq");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: BG, fontFamily: FONT, color: TEXT }}>
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
        @keyframes smHeroFloat {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
      `}</style>

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          background: scrolled ? "rgba(232,236,255,0.97)" : "rgba(232,236,255,0.82)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: scrolled
            ? "1px solid rgba(93,89,234,0.10)"
            : "1px solid transparent",
          transition: "background 200ms ease, border-color 200ms ease",
        }}
      >
        <div
          style={{
            maxWidth: 1220,
            margin: "0 auto",
            padding: isMobile ? "0 18px" : "0 32px",
            height: isMobile ? 56 : 64,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <a href="/" style={{ fontSize: 20, fontWeight: 700, color: TEXT, letterSpacing: -0.5, textDecoration: "none" }}>
            Smartemark
          </a>

          <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
            {!isMobile && (
              <>
                <button onClick={() => (window.location.href = "/pricing")} style={navBtn}>
                  Pricing
                </button>
                {!isLoggedIn && (
                  <button onClick={() => (window.location.href = "/login")} style={navBtn}>
                    Login
                  </button>
                )}
                <button onClick={scrollToFaq} style={navBtn}>
                  FAQ
                </button>
              </>
            )}

            {isMobile && !isLoggedIn && (
              <button onClick={() => (window.location.href = "/login")} style={navBtn}>
                Login
              </button>
            )}

            {isLoggedIn ? (
              <button
                onClick={() => (window.location.href = "/setup")}
                style={{
                  background: "rgba(255,255,255,0.85)",
                  border: `1px solid ${BORDER}`,
                  color: PURPLE,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "8px 18px",
                  borderRadius: 999,
                  boxShadow: "0 3px 10px rgba(93,89,234,0.08)",
                  marginLeft: 4,
                }}
              >
                Dashboard
              </button>
            ) : (
              <div style={{ marginLeft: 4 }}>
                <CTAButton onClick={handleCTA} small>
                  Get Started
                </CTAButton>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero — overflow:hidden for animated blobs ────────────────────────── */}
      <div style={{ position: "relative", overflow: "hidden" }}>
        {/* Static base radials */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(circle at 12% 8%, rgba(100,88,255,0.07), transparent 34%), radial-gradient(circle at 88% 18%, rgba(80,90,240,0.06), transparent 32%)" }} />
        {/* Blobs — more vibrant than before */}
        <div style={{ position: "absolute", top: "-20%", left: "-12%", width: 760, height: 760, borderRadius: "50%", background: "radial-gradient(circle, rgba(100,88,255,0.22) 0%, transparent 68%)", filter: "blur(60px)", animation: "smDrift1 20s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "-12%", right: "-14%", width: 620, height: 620, borderRadius: "50%", background: "radial-gradient(circle, rgba(78,88,240,0.18) 0%, transparent 70%)", filter: "blur(68px)", animation: "smDrift2 27s ease-in-out infinite", pointerEvents: "none" }} />
        <div style={{ position: "absolute", top: "30%", left: "38%", width: 500, height: 500, borderRadius: "50%", background: "radial-gradient(circle, rgba(148,138,255,0.12) 0%, transparent 70%)", filter: "blur(76px)", animation: "smDrift3 34s ease-in-out infinite", pointerEvents: "none" }} />

        <div style={{ maxWidth: 1220, margin: "0 auto", padding: isMobile ? "40px 18px 72px" : "52px 32px 92px", position: "relative", zIndex: 1 }}>
          <section>
            {/* Hero card — slightly tinted so background blobs show through */}
            <div
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.84), rgba(228,226,255,0.74))",
                border: "1px solid rgba(123,114,255,0.20)",
                borderRadius: 32,
                overflow: "hidden",
                boxShadow: "0 28px 72px rgba(83,77,212,0.16), inset 0 1px 0 rgba(255,255,255,0.95)",
                position: "relative",
              }}
            >
              <div style={{ position: "absolute", top: 0, left: "6%", right: "6%", height: 1, background: "linear-gradient(90deg, transparent, rgba(123,114,255,0.42), transparent)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden", pointerEvents: "none" }}>
                <div style={{ position: "absolute", top: "-60%", left: 0, width: "35%", height: "220%", background: "linear-gradient(105deg, transparent 0%, rgba(255,255,255,0.09) 50%, transparent 100%)", animation: "smSheen 9s ease-in-out infinite" }} />
              </div>

              {/* Hero inner — 2-col on desktop, 1-col on mobile */}
              <div
                style={{
                  padding: isMobile ? "48px 26px 52px" : "80px 60px 80px",
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "1.1fr 0.9fr",
                  gap: isMobile ? 0 : 52,
                  alignItems: "center",
                  position: "relative",
                  zIndex: 1,
                }}
              >
                {/* Left: text content — left-aligned */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <SectionTag>
                    <FaBolt />
                    AI marketing automation
                  </SectionTag>

                  <h1
                    style={{
                      margin: "26px 0 20px",
                      fontSize: isMobile ? 44 : 68,
                      lineHeight: 1.03,
                      letterSpacing: "-0.05em",
                      fontWeight: 500,
                      color: TEXT,
                      maxWidth: 560,
                    }}
                  >
                    Launch ads
                    <br />
                    effortlessly
                  </h1>

                  <p
                    style={{
                      color: TEXT_SOFT,
                      fontSize: isMobile ? 17 : 18,
                      lineHeight: 1.8,
                      fontWeight: 400,
                      maxWidth: 480,
                      margin: "0 0 32px",
                    }}
                  >
                    Smartemark learns your business, generates your creatives, launches campaigns,
                    and manages campaign performance — without an agency and without ad experience.
                  </p>

                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <CTAButton onClick={handleCTA}>
                      {isLoggedIn ? "Open Dashboard" : "Get Started"}
                    </CTAButton>
                    {BOOKING_URL && (
                      <OutlineButton href={BOOKING_URL}>Book a Call</OutlineButton>
                    )}
                  </div>
                </div>

                {/* Right: mini campaign preview — desktop only */}
                {!isMobile && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      animation: "smHeroFloat 7s ease-in-out infinite",
                    }}
                  >
                    <div
                      style={{
                        background: "linear-gradient(145deg, rgba(255,255,255,0.97) 0%, rgba(242,241,255,0.98) 100%)",
                        border: "1px solid rgba(93,89,234,0.16)",
                        borderRadius: 26,
                        padding: 22,
                        boxShadow: "0 20px 56px rgba(83,77,212,0.18)",
                        width: "100%",
                        maxWidth: 310,
                        position: "relative",
                      }}
                    >
                      {/* Mini card header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div>
                          <div style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>Campaign Overview</div>
                          <div style={{ color: TEXT_SOFT, fontSize: 11, marginTop: 2 }}>Local Service Business</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(34,197,94,0.09)", borderRadius: 999, padding: "4px 10px" }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "smPulse 2.4s ease-in-out infinite", flexShrink: 0 }} />
                          <span style={{ color: "#16a34a", fontWeight: 700, fontSize: 11 }}>Live</span>
                        </div>
                      </div>

                      {/* 2 mini metrics */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
                        <div style={{ background: "#f8f9ff", border: "1px solid rgba(93,89,234,0.08)", borderRadius: 14, padding: "12px 13px" }}>
                          <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Leads</div>
                          <div style={{ color: TEXT, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>37</div>
                          <div style={{ color: "#16a34a", fontWeight: 600, fontSize: 11, marginTop: 3 }}>↑ this week</div>
                        </div>
                        <div style={{ background: "#f8f9ff", border: "1px solid rgba(93,89,234,0.08)", borderRadius: 14, padding: "12px 13px" }}>
                          <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 10, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 5 }}>Cost / Lead</div>
                          <div style={{ color: TEXT, fontWeight: 700, fontSize: 22, lineHeight: 1 }}>$14.80</div>
                        </div>
                      </div>

                      {/* Mini sparkline */}
                      <div style={{ background: "linear-gradient(135deg, #f5f6ff, #eef0ff)", borderRadius: 12, padding: "8px 12px 6px", marginBottom: 12 }}>
                        <div style={{ color: "#7b849f", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>CTR Trend</div>
                        <svg width="100%" height="28" viewBox="0 0 200 28" preserveAspectRatio="none" style={{ display: "block" }}>
                          <defs>
                            <linearGradient id="smMiniChartFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#5d59ea" stopOpacity="0.18" />
                              <stop offset="100%" stopColor="#5d59ea" stopOpacity="0" />
                            </linearGradient>
                          </defs>
                          <path d="M0,24 C50,20 80,14 110,10 C140,6 170,4 200,2" fill="none" stroke="#5d59ea" strokeWidth="1.8" strokeLinecap="round" />
                          <path d="M0,24 C50,20 80,14 110,10 C140,6 170,4 200,2 L200,28 L0,28 Z" fill="url(#smMiniChartFill)" />
                          <circle cx="200" cy="2" r="2.5" fill="#5d59ea" />
                        </svg>
                      </div>

                      {/* AI insight */}
                      <div style={{ background: "rgba(93,89,234,0.06)", borderRadius: 12, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                        <FaBolt style={{ color: PURPLE, fontSize: 11, marginTop: 1, flexShrink: 0 }} />
                        <span style={{ color: TEXT_SOFT, fontSize: 12, lineHeight: 1.5 }}>Testing a second creative angle to lower cost per lead.</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* ── Lower sections ───────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1220, margin: "0 auto", padding: isMobile ? "0 18px 80px" : "0 32px 100px" }}>

        {/* HOW IT WORKS */}
        <section style={{ marginTop: isMobile ? 64 : 88 }}>
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <div style={{ color: TEXT, fontSize: isMobile ? 32 : 42, lineHeight: 1.1, letterSpacing: "-0.04em", fontWeight: 500 }}>
              How it works
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, minmax(0, 1fr))", gap: 16, marginBottom: 40 }}>
            {[
              { n: "01", title: "Give business info", body: "Describe your business, offer, and goal. Smartemark takes in the information and turns it into a campaign plan." },
              { n: "02", title: "AI creates the ads", body: "The AI generates creatives, copy, and launch-ready assets so you do not have to build ads manually." },
              { n: "03", title: "Connect Facebook", body: "Use your own ad account, keep control, and launch without getting buried in Meta's usual complexity." },
              { n: "04", title: "Launch and manage", body: "The system launches campaigns, watches performance, and moves toward the next logical action like a digital marketer would." },
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
                <div style={{ width: 38, height: 38, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, rgba(93,89,234,0.13) 0%, rgba(123,114,255,0.07) 100%)", border: "1px solid rgba(93,89,234,0.10)", color: PURPLE, fontWeight: 600, fontSize: 13, marginBottom: 20, letterSpacing: "0.01em" }}>
                  {item.n}
                </div>
                <div style={{ color: TEXT, fontWeight: 600, fontSize: 18, lineHeight: 1.2, marginBottom: 12 }}>{item.title}</div>
                <div style={{ color: TEXT_SOFT, fontWeight: 400, fontSize: 14, lineHeight: 1.8 }}>{item.body}</div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center" }}>
            <CTAButton onClick={handleCTA}>
              {isLoggedIn ? "Open Dashboard" : "Get Started"}
            </CTAButton>
          </div>
        </section>

        {/* AI CAMPAIGN MANAGER — "AI Campaign Manager" badge removed per request */}
        <section style={{ marginTop: isMobile ? 72 : 96 }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ color: TEXT, fontSize: isMobile ? 30 : 40, lineHeight: 1.1, letterSpacing: "-0.04em", fontWeight: 500, marginBottom: 14 }}>
              Your campaigns, managed automatically
            </div>
            <p style={{ color: TEXT_SOFT, fontSize: isMobile ? 15 : 16, lineHeight: 1.7, maxWidth: 520, margin: "0 auto" }}>
              Smartemark monitors performance, tests new creative angles, and makes optimization decisions — so you never have to watch it yourself.
            </p>
          </div>

          <div
            style={{
              background: "linear-gradient(140deg, rgba(255,255,255,0.88) 0%, rgba(240,242,255,0.96) 50%, rgba(141,134,255,0.18) 100%)",
              border: "1px solid rgba(93,89,234,0.18)",
              borderRadius: 32,
              padding: isMobile ? 14 : 20,
              boxShadow: "0 14px 42px rgba(83,77,212,0.12), inset 0 1px 0 rgba(255,255,255,0.94)",
              position: "relative",
            }}
          >
            <div style={{ position: "absolute", top: 0, left: "10%", right: "10%", height: 1, background: "linear-gradient(90deg, transparent, rgba(123,114,255,0.28), transparent)", pointerEvents: "none" }} />
            <div
              style={{
                background: "linear-gradient(145deg, rgba(255,255,255,0.99) 0%, rgba(246,247,255,0.97) 100%)",
                border: "1px solid rgba(93,89,234,0.10)",
                borderRadius: 24,
                padding: isMobile ? 18 : 24,
              }}
            >
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <div style={{ color: TEXT, fontSize: 15, fontWeight: 700, marginBottom: 3 }}>AI ad manager</div>
                  <div style={{ color: TEXT_SOFT, fontSize: 13 }}>Campaign performance overview</div>
                </div>
                <div style={{ padding: "5px 11px 5px 8px", borderRadius: 999, background: "rgba(93,89,234,0.09)", color: PURPLE, fontWeight: 600, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0, animation: "smPulse 2.4s ease-in-out infinite" }} />
                  Live
                </div>
              </div>

              {/* Sparkline */}
              <div style={{ marginBottom: 16, borderRadius: 12, background: "linear-gradient(135deg, #f5f6ff 0%, #eef0ff 100%)", border: "1px solid rgba(93,89,234,0.08)", padding: "10px 14px 8px" }}>
                <div style={{ color: "#7b849f", fontWeight: 500, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
                  CTR trend — last 7 days
                </div>
                <svg width="100%" height="42" viewBox="0 0 280 42" preserveAspectRatio="none" style={{ display: "block" }}>
                  <defs>
                    <linearGradient id="smChartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5d59ea" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#5d59ea" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,36 C30,34 55,30 85,24 C115,18 135,14 165,10 C195,6 230,4 280,2" fill="none" stroke="#5d59ea" strokeWidth="2" strokeLinecap="round" />
                  <path d="M0,36 C30,34 55,30 85,24 C115,18 135,14 165,10 C195,6 230,4 280,2 L280,42 L0,42 Z" fill="url(#smChartFill)" />
                  <circle cx="280" cy="2" r="3" fill="#5d59ea" />
                </svg>
              </div>

              {/* 6-metric grid */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0,1fr))" : "repeat(3, minmax(0,1fr))", gap: 10, marginBottom: 16 }}>
                <MetricTile label="Impressions"  value="18.4K"  trend="↑ +12% this week" />
                <MetricTile label="Clicks"       value="642"    trend="↑ improving" />
                <MetricTile label="CTR"          value="3.49%"  />
                <MetricTile label="CPC"          value="$0.41"  trend="↓ cost dropping" />
                <MetricTile label="Leads"        value="37"     />
                <MetricTile label="Cost / Lead"  value="$14.80" />
              </div>

              {/* AI insight */}
              <div
                style={{
                  background: "linear-gradient(135deg, rgba(93,89,234,0.06) 0%, rgba(123,114,255,0.04) 100%)",
                  border: "1px solid rgba(93,89,234,0.13)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  gap: 12,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #5d59ea 0%, #786dff 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
                  <FaBolt style={{ color: "#fff", fontSize: 11 }} />
                </div>
                <div>
                  <div style={{ color: PURPLE, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
                    AI Manager Update
                  </div>
                  <div style={{ color: TEXT_SOFT, fontSize: 13, lineHeight: 1.65 }}>
                    {AI_INSIGHT}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOOK A CALL — vibrant purple gradient card */}
        {BOOKING_URL && (
          <section style={{ marginTop: isMobile ? 72 : 96 }}>
            <div
              style={{
                background: "linear-gradient(135deg, #3f52cc 0%, #5d59ea 52%, #7565f5 100%)",
                borderRadius: 32,
                padding: isMobile ? "52px 28px" : "68px 80px",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                boxShadow: "0 24px 64px rgba(63,82,204,0.30)",
              }}
            >
              {/* Decorative inner glows */}
              <div style={{ position: "absolute", top: "-35%", right: "-8%", width: 420, height: 420, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.14) 0%, transparent 65%)", pointerEvents: "none" }} />
              <div style={{ position: "absolute", bottom: "-28%", left: "-6%", width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 65%)", pointerEvents: "none" }} />
              {/* Top light line */}
              <div style={{ position: "absolute", top: 0, left: "12%", right: "12%", height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)", pointerEvents: "none" }} />

              <div style={{ position: "relative", zIndex: 1 }}>
                <div
                  style={{
                    color: "#ffffff",
                    fontSize: isMobile ? 28 : 38,
                    fontWeight: 600,
                    letterSpacing: "-0.04em",
                    lineHeight: 1.12,
                    marginBottom: 16,
                    maxWidth: 600,
                    margin: "0 auto 16px",
                  }}
                >
                  See how Smartemark could work for your business
                </div>
                <p
                  style={{
                    color: "rgba(255,255,255,0.80)",
                    fontSize: isMobile ? 15 : 17,
                    lineHeight: 1.75,
                    maxWidth: 500,
                    margin: "0 auto 36px",
                  }}
                >
                  Book a quick call and we'll walk through how Smartemark creates ads, launches campaigns, and helps manage performance for local businesses.
                </p>
                <a
                  href={BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    background: "rgba(255,255,255,0.97)",
                    color: "#4c63ff",
                    borderRadius: 999,
                    padding: "14px 34px",
                    fontSize: 16,
                    fontWeight: 700,
                    textDecoration: "none",
                    boxShadow: "0 8px 28px rgba(0,0,0,0.16)",
                    fontFamily: FONT,
                    letterSpacing: "-0.01em",
                    transition: "all 160ms ease",
                  }}
                >
                  Book a Call
                </a>
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section id="landing-faq" style={{ marginTop: isMobile ? 72 : 96, paddingBottom: 40 }}>
          <div style={{ marginBottom: 24 }}>
            <SectionTag>FAQ</SectionTag>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
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

        {/* Footer */}
        <div style={{ textAlign: "center", padding: "32px 0 8px", color: "#c4c9d4", fontSize: 12, fontWeight: 500 }}>
          <a href="mailto:support@smartemark.com" style={{ color: "#c4c9d4", textDecoration: "none" }}>
            support@smartemark.com
          </a>
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  background: "transparent",
  border: "none",
  color: TEXT_SOFT,
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  fontFamily: FONT,
  padding: "10px 14px",
};
