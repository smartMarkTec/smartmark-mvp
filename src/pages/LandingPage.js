// src/pages/LandingPage.js
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import LANDING_PAGES from "../data/landingPages";

const FONT = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";

function PhoneIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.1 12.17 19.79 19.79 0 0 1 1 3.58 2 2 0 0 1 2.98 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0f2744"
      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  );
}

/* ─────────────────── Big orange call button ─────────────────── */
function CallBtn({ phone, label, size = "md", onClick }) {
  const big = size === "lg";
  return (
    <a
      href={`tel:${phone}`}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "#f97316", color: "#fff", fontFamily: FONT, fontWeight: 800,
        fontSize: big ? "1.1rem" : "0.9rem",
        padding: big ? "16px 34px" : "11px 22px",
        borderRadius: 6, textDecoration: "none",
        boxShadow: big ? "0 4px 20px rgba(249,115,22,0.45)" : "0 2px 10px rgba(249,115,22,0.35)",
        transition: "background 0.12s, transform 0.1s",
        whiteSpace: "nowrap", boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#ea6a05"; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "#f97316"; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <PhoneIcon size={big ? 20 : 15} />
      {label}
    </a>
  );
}

/* ─────────────────── Schedule / secondary button ─────────────────── */
function ScheduleBtn({ href, label, size = "md", onClick }) {
  const big = size === "lg";
  return (
    <a
      href={href}
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "transparent", color: "#fff", fontFamily: FONT, fontWeight: 700,
        fontSize: big ? "1.05rem" : "0.9rem",
        padding: big ? "15px 30px" : "10px 20px",
        borderRadius: 6, textDecoration: "none",
        border: "2px solid rgba(255,255,255,0.55)",
        transition: "border-color 0.12s, background 0.12s",
        whiteSpace: "nowrap", boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function LandingPage({ slug: slugProp }) {
  const params = useParams();
  const slug = slugProp || params.slug;
  const page = LANDING_PAGES[slug];

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  /* ── Branding: title, favicon, meta description ── */
  useEffect(() => {
    if (!page) return;

    const prevTitle = document.title;

    // Page title
    if (page.pageTitle) document.title = page.pageTitle;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    const prevDesc = metaDesc ? metaDesc.getAttribute("content") : null;
    if (page.metaDescription) {
      if (!metaDesc) {
        metaDesc = document.createElement("meta");
        metaDesc.setAttribute("name", "description");
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute("content", page.metaDescription);
    }

    // Favicon
    let faviconEl = document.querySelector('link[rel="icon"]');
    const prevFavicon = faviconEl ? faviconEl.getAttribute("href") : null;
    if (page.favicon) {
      if (!faviconEl) {
        faviconEl = document.createElement("link");
        faviconEl.setAttribute("rel", "icon");
        document.head.appendChild(faviconEl);
      }
      faviconEl.setAttribute("href", page.favicon);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
      if (faviconEl && prevFavicon !== null) faviconEl.setAttribute("href", prevFavicon);
    };
  }, [page]);

  /* ── Meta Pixel: load once, init + PageView on mount ── */
  useEffect(() => {
    if (!page?.metaPixelId) return;

    // Inject the fbq stub + script only once per page session
    if (!window.fbq) {
      const fbq = function() {
        fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
      };
      if (!window._fbq) window._fbq = fbq;
      fbq.push = fbq; fbq.loaded = true; fbq.version = "2.0"; fbq.queue = [];
      window.fbq = fbq;

      const script = document.createElement("script");
      script.id = "fb-pixel-script";
      script.async = true;
      script.src = "https://connect.facebook.net/en_US/fbevents.js";
      document.head.appendChild(script);
    }

    window.fbq("init", page.metaPixelId);
    window.fbq("track", "PageView");
  }, [page?.metaPixelId]);

  if (!page) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT, background: "#f4f6f9", padding: "0 20px", textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
        <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#111827", margin: "0 0 8px" }}>
          Landing page not found
        </h1>
        <p style={{ color: "#6b7280", fontSize: "0.9rem" }}>
          No page exists at <code>/lp/{slug}</code>.
        </p>
      </div>
    );
  }

  const track = (event, data = {}) => {
    if (window.fbq) window.fbq("track", event, data);
  };

  return (
    <div style={{ fontFamily: FONT, background: "#fff", minHeight: "100vh", overflowX: "hidden" }}>
      {/* Pixel noscript fallback */}
      {page.metaPixelId && (
        <noscript>
          <img height="1" width="1" style={{ display: "none" }} alt=""
            src={`https://www.facebook.com/tr?id=${page.metaPixelId}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}

      {/* ════════════ TOP BAR ════════════ */}
      <div style={{ background: "#0a1628", padding: "0 20px" }}>
        <div style={{
          maxWidth: 900, margin: "0 auto", height: 52,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {page.logo ? (
            <div style={{
              background: "#fff", borderRadius: 6, padding: "3px 8px",
              display: "flex", alignItems: "center", flexShrink: 1,
            }}>
              <img
                src={page.logo}
                alt={page.businessName}
                onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "inline"; }}
                style={{ height: 40, maxWidth: 180, objectFit: "contain", display: "block" }}
              />
              <span style={{ display: "none", color: "#0a1628", fontWeight: 700, fontSize: 14 }}>
                {page.businessName}
              </span>
            </div>
          ) : (
            <span style={{
              color: "#fff", fontWeight: 700, fontSize: 14,
              flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {page.businessName}
            </span>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a
              href={`tel:${page.phone}`}
              onClick={() => track("Contact", {
                content_name: "Aspen Call Button",
                business_name: page.businessName,
                phone: page.phone,
              })}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "#f97316", color: "#fff", fontFamily: FONT,
                fontWeight: 800, fontSize: 13, padding: "7px 14px", borderRadius: 5,
                textDecoration: "none", whiteSpace: "nowrap",
                transition: "background 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#ea6a05"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#f97316"; }}
            >
              <PhoneIcon size={12} />
              Call: {page.phoneDisplay}
            </a>
            <a
              href={page.mainWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 600,
                textDecoration: "none", padding: "6px 11px", borderRadius: 5,
                border: "1px solid rgba(255,255,255,0.2)", whiteSpace: "nowrap",
                transition: "color 0.12s, border-color 0.12s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.65)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
            >
              Home
            </a>
          </div>
        </div>
      </div>

      {/* ════════════ HERO ════════════ */}
      <div style={{
        background: "linear-gradient(160deg, #050e1a 0%, #0d1f3c 55%, #143055 100%)",
        padding: "64px 20px 72px",
        textAlign: "center",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{
            display: "inline-block",
            background: "rgba(249,115,22,0.15)",
            border: "1px solid rgba(249,115,22,0.4)",
            color: "#fb923c",
            fontSize: 11, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", padding: "4px 12px",
            borderRadius: 4, marginBottom: 20,
          }}>
            Houston, TX
          </div>

          <h1 style={{
            fontSize: "clamp(2rem, 7vw, 3rem)",
            fontWeight: 900, lineHeight: 1.1, letterSpacing: -0.5,
            color: "#fff", margin: "0 0 16px",
          }}>
            {page.headline}
          </h1>

          <p style={{
            fontSize: "clamp(0.95rem, 2.5vw, 1.1rem)",
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.65, margin: "0 0 32px",
          }}>
            {page.subheadline}
          </p>

          {/* Dual CTA — wraps on mobile */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <CallBtn
              phone={page.phone}
              label={page.primaryButtonText}
              size="lg"
              onClick={() => track("Contact", {
                content_name: "Aspen Call Button",
                business_name: page.businessName,
                phone: page.phone,
              })}
            />
            {page.scheduleUrl && (
              <ScheduleBtn
                href={page.scheduleUrl}
                label="Schedule Service"
                size="lg"
                onClick={() => track("Lead", {
                  content_name: "Aspen Schedule Service Button",
                  business_name: page.businessName,
                })}
              />
            )}
          </div>

          <div style={{ marginTop: 18, color: "rgba(255,255,255,0.35)", fontSize: 13 }}>
            {page.serviceArea}
          </div>
        </div>
      </div>

      {/* ════════════ OFFER ════════════ */}
      <div style={{ background: "#fff7ed", borderTop: "3px solid #f97316", padding: "36px 20px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#ea580c", marginBottom: 8 }}>
            Promotion
          </div>
          <div style={{ fontSize: "clamp(1.6rem, 5vw, 2rem)", fontWeight: 900, color: "#7c2d12", marginBottom: 12, lineHeight: 1.15 }}>
            $75 AC Tune-Up
          </div>
          <p style={{ fontSize: "0.97rem", color: "#92400e", lineHeight: 1.7, margin: "0 0 22px", maxWidth: 560 }}>
            {page.offer}
          </p>
          <CallBtn
            phone={page.phone}
            label={`Call: ${page.phoneDisplay}`}
            onClick={() => track("Contact", {
              content_name: "Aspen Call Button",
              business_name: page.businessName,
              phone: page.phone,
            })}
          />
        </div>
      </div>

      {/* ════════════ SERVICES ════════════ */}
      <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "40px 20px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.5rem)", fontWeight: 800, color: "#0f2744", margin: "0 0 24px" }}>
            Air Conditioning Services
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 10,
          }}>
            {page.services.map((svc, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#fff", border: "1px solid #e2e8f0",
                borderRadius: 6, padding: "12px 14px",
                fontSize: "0.9rem", fontWeight: 600, color: "#1e293b",
              }}>
                <CheckCircleIcon />
                {svc}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════ WHY CHOOSE US ════════════ */}
      <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "40px 20px" }}>
        <div style={{ maxWidth: 740, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.5rem)", fontWeight: 800, color: "#0f2744", margin: "0 0 24px" }}>
            Why Choose Aspen
          </h2>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 10,
          }}>
            {page.trustPoints.map((pt, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10,
                background: "#f8fafc", border: "1px solid #e2e8f0",
                borderRadius: 6, padding: "12px 14px",
                fontSize: "0.9rem", fontWeight: 600, color: "#1e293b",
              }}>
                <ShieldIcon />
                {pt}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ════════════ BOTTOM CTA ════════════ */}
      <div style={{
        background: "linear-gradient(160deg, #050e1a 0%, #0d1f3c 100%)",
        padding: "52px 20px 56px", textAlign: "center",
      }}>
        <div style={{ maxWidth: 500, margin: "0 auto" }}>
          <h2 style={{ fontSize: "clamp(1.4rem, 4.5vw, 1.9rem)", fontWeight: 900, color: "#fff", margin: "0 0 10px", lineHeight: 1.2 }}>
            Need AC service?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.95rem", margin: "0 0 26px", lineHeight: 1.6 }}>
            Call {page.businessName} to schedule service.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <CallBtn
              phone={page.phone}
              label={page.primaryButtonText}
              size="lg"
              onClick={() => track("Contact", {
                content_name: "Aspen Call Button",
                business_name: page.businessName,
                phone: page.phone,
              })}
            />
            {page.scheduleUrl && (
              <ScheduleBtn
                href={page.scheduleUrl}
                label="Schedule Service"
                size="lg"
                onClick={() => track("Lead", {
                  content_name: "Aspen Schedule Service Button",
                  business_name: page.businessName,
                })}
              />
            )}
          </div>
        </div>
      </div>

      {/* ════════════ FOOTER ════════════ */}
      <div style={{ background: "#040d1a", padding: "14px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
          {page.businessName} · {page.serviceArea}
          {page.mainWebsiteUrl && (
            <>
              {" · "}
              <a
                href={page.mainWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#475569", textDecoration: "underline" }}
              >
                Home
              </a>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
