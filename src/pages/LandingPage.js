// src/pages/LandingPage.js
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import LANDING_PAGES from "../data/landingPages";

/* ── Palette ── */
const C = {
  bg:        "#f5f7fa",
  white:     "#ffffff",
  hero:      "#0f2744",        // dark navy hero
  heroText:  "#ffffff",
  callBtn:   "#f97316",        // vivid orange — maximum CTA visibility
  callHover: "#ea6a05",
  webBtn:    "#ffffff",
  webBorder: "#d1d5db",
  webText:   "#374151",
  accent:    "#0ea5e9",        // sky blue for section accents
  headingDark: "#111827",
  bodyText:  "#374151",
  muted:     "#6b7280",
  offerBg:   "#fff7ed",
  offerBorder: "#fed7aa",
  offerText: "#9a3412",
  trustBg:   "#f0fdf4",
  trustBorder: "#bbf7d0",
  trustCheck: "#16a34a",
  divider:   "#e5e7eb",
  footerBg:  "#111827",
  footerText: "#9ca3af",
};

const FONT = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";

/* ── Shared section wrapper ── */
function Section({ children, style = {} }) {
  return (
    <section style={{ width: "100%", padding: "52px 0", ...style }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>
        {children}
      </div>
    </section>
  );
}

/* ── Call-to-action button ── */
function CallBtn({ phone, label, big = false }) {
  return (
    <a
      href={`tel:${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        background: C.callBtn,
        color: "#fff",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: big ? "1.2rem" : "1.05rem",
        padding: big ? "18px 36px" : "15px 28px",
        borderRadius: big ? 16 : 13,
        textDecoration: "none",
        boxShadow: "0 6px 22px rgba(249,115,22,0.38)",
        transition: "background 0.15s, transform 0.12s, box-shadow 0.15s",
        letterSpacing: 0.1,
        width: "100%",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = C.callHover;
        e.currentTarget.style.transform = "translateY(-1px)";
        e.currentTarget.style.boxShadow = "0 10px 28px rgba(249,115,22,0.44)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = C.callBtn;
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 6px 22px rgba(249,115,22,0.38)";
      }}
    >
      <PhoneIcon size={big ? 22 : 18} />
      {label}
    </a>
  );
}

function WebBtn({ url, label }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: C.webBtn,
        color: C.webText,
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: "1rem",
        padding: "14px 28px",
        borderRadius: 13,
        textDecoration: "none",
        border: `1.5px solid ${C.webBorder}`,
        transition: "border-color 0.15s, background 0.15s",
        width: "100%",
        justifyContent: "center",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#9ca3af";
        e.currentTarget.style.background = "#f9fafb";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = C.webBorder;
        e.currentTarget.style.background = C.webBtn;
      }}
    >
      <ExternalIcon size={16} />
      {label}
    </a>
  );
}

/* ── Inline SVG icons (no dependency) ── */
function PhoneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.1 12.17 19.79 19.79 0 0 1 1 3.58 2 2 0 0 1 2.98 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}
function CheckIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function ExternalIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/>
      <line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  );
}
function WrenchIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
}
function MapPinIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

/* ── Section label ── */
function SectionLabel({ color = C.accent, children }) {
  return (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 7,
      background: color === C.accent ? "#e0f2fe" : "#f0fdf4",
      color,
      fontFamily: FONT,
      fontWeight: 700,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      padding: "5px 13px",
      borderRadius: 20,
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { slug } = useParams();
  const page = LANDING_PAGES[slug];

  /* ── Meta Pixel injection (page-level, only when configured) ── */
  useEffect(() => {
    if (!page?.metaPixelId) return;
    // TODO: inject pixel when metaPixelId is set
    // Skipped in v1 to avoid any risk of polluting the global fbq queue.
  }, [page?.metaPixelId]);

  /* ── Scroll to top on mount ── */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  /* ── 404 state ── */
  if (!page) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: C.bg,
        fontFamily: FONT,
        padding: "0 20px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🔍</div>
        <h1 style={{ fontSize: "1.6rem", fontWeight: 800, color: C.headingDark, marginBottom: 8 }}>
          Landing page not found
        </h1>
        <p style={{ color: C.muted, fontSize: "1rem" }}>
          The page at <code>/lp/{slug}</code> doesn't exist.
        </p>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, fontFamily: FONT, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ════════════ 1. HERO ════════════ */}
      <div style={{
        background: C.hero,
        color: C.heroText,
        padding: "0",
      }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 20px 52px" }}>

          {/* Business name */}
          <div style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
            marginBottom: 20,
          }}>
            {page.businessName}
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(1.9rem, 6vw, 2.7rem)",
            fontWeight: 900,
            lineHeight: 1.18,
            letterSpacing: -0.5,
            color: "#fff",
            margin: "0 0 14px",
          }}>
            {page.headline}
          </h1>

          {/* Subheadline */}
          <p style={{
            fontSize: "1.05rem",
            fontWeight: 400,
            color: "rgba(255,255,255,0.78)",
            lineHeight: 1.6,
            margin: "0 0 34px",
            maxWidth: 500,
          }}>
            {page.subheadline}
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
            <CallBtn phone={page.phone} label={page.primaryButtonText} big />
            <WebBtn url={page.mainWebsiteUrl} label={page.secondaryButtonText} />
          </div>

          {/* Service area pill */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginTop: 28,
            color: "rgba(255,255,255,0.55)",
            fontSize: 13,
            fontWeight: 500,
          }}>
            <MapPinIcon size={14} />
            {page.serviceArea}
          </div>
        </div>
      </div>

      {/* ════════════ 2. OFFER BOX ════════════ */}
      <Section style={{ padding: "36px 0 0" }}>
        <div style={{
          background: C.offerBg,
          border: `2px solid ${C.offerBorder}`,
          borderRadius: 18,
          padding: "24px 26px",
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
        }}>
          <div style={{ fontSize: 32, flexShrink: 0, marginTop: 2 }}>🎯</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: C.offerText, marginBottom: 6 }}>
              Current Offer
            </div>
            <div style={{ fontSize: "1rem", color: "#7c2d12", lineHeight: 1.55 }}>
              {page.offer}
            </div>
            <div style={{ marginTop: 16 }}>
              <CallBtn phone={page.phone} label={`Call to Book: ${page.phoneDisplay}`} />
            </div>
          </div>
        </div>
      </Section>

      {/* ════════════ 3. SERVICES ════════════ */}
      <Section>
        <SectionLabel>
          <WrenchIcon size={14} /> Services
        </SectionLabel>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 800, color: C.headingDark, margin: "0 0 22px", lineHeight: 1.25 }}>
          What We Do
        </h2>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {page.services.map((svc, i) => (
            <div
              key={i}
              style={{
                background: C.white,
                border: `1.5px solid ${C.divider}`,
                borderRadius: 13,
                padding: "14px 18px",
                fontWeight: 600,
                fontSize: "0.95rem",
                color: C.headingDark,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ color: C.accent, flexShrink: 0 }}>
                <CheckIcon size={16} />
              </span>
              {svc}
            </div>
          ))}
        </div>
      </Section>

      {/* ════════════ 4. TRUST POINTS ════════════ */}
      <Section style={{ paddingTop: 0 }}>
        <div style={{
          background: C.trustBg,
          border: `1.5px solid ${C.trustBorder}`,
          borderRadius: 18,
          padding: "28px 26px",
        }}>
          <SectionLabel color={C.trustCheck}>
            <CheckIcon size={13} /> Why Choose Us
          </SectionLabel>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {page.trustPoints.map((pt, i) => (
              <li
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  fontSize: "0.975rem",
                  color: C.headingDark,
                  fontWeight: 500,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ color: C.trustCheck, flexShrink: 0, marginTop: 1 }}>
                  <CheckIcon size={17} />
                </span>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* ════════════ 5. SERVICE AREA ════════════ */}
      <Section style={{ paddingTop: 0 }}>
        <div style={{
          background: C.white,
          border: `1.5px solid ${C.divider}`,
          borderRadius: 18,
          padding: "26px 26px",
          display: "flex",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
        }}>
          <div style={{ fontSize: 34, flexShrink: 0 }}>📍</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: "1rem", color: C.headingDark, marginBottom: 4 }}>
              Service Area
            </div>
            <div style={{ fontSize: "0.97rem", color: C.bodyText }}>
              {page.serviceArea}
            </div>
          </div>
        </div>
      </Section>

      {/* ════════════ 6. FINAL CTA ════════════ */}
      <div style={{
        background: C.hero,
        padding: "52px 0",
      }}>
        <div style={{ maxWidth: 540, margin: "0 auto", padding: "0 20px", textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 16 }}>📞</div>
          <h2 style={{ fontSize: "clamp(1.5rem, 5vw, 2rem)", fontWeight: 900, color: "#fff", margin: "0 0 10px", lineHeight: 1.22 }}>
            Ready to Book?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.68)", fontSize: "1rem", margin: "0 0 30px", lineHeight: 1.6 }}>
            Call us now — we'll get you scheduled fast.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380, margin: "0 auto" }}>
            <CallBtn phone={page.phone} label={page.primaryButtonText} big />
            <WebBtn url={page.mainWebsiteUrl} label={page.secondaryButtonText} />
          </div>
        </div>
      </div>

      {/* ════════════ FOOTER ════════════ */}
      <div style={{
        background: C.footerBg,
        padding: "22px 20px",
        textAlign: "center",
      }}>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.footerText, lineHeight: 1.6 }}>
          {page.businessName} · {page.serviceArea}
          <br />
          <a
            href={page.mainWebsiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: C.footerText, textDecoration: "underline" }}
          >
            {page.mainWebsiteUrl}
          </a>
        </div>
      </div>

    </div>
  );
}
