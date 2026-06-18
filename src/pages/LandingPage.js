// src/pages/LandingPage.js
import React, { useEffect } from "react";
import { useParams } from "react-router-dom";
import LANDING_PAGES from "../data/landingPages";

const FONT = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";

const C = {
  navy:      "#0f2744",
  navyLight: "#1a3a5c",
  white:     "#ffffff",
  bg:        "#f4f6f9",
  callBtn:   "#f97316",
  callHover: "#ea6a05",
  heading:   "#111827",
  body:      "#374151",
  muted:     "#6b7280",
  border:    "#e5e7eb",
  offerBg:   "#fff7ed",
  offerBdr:  "#fcd9a8",
  offerText: "#92400e",
  greenBg:   "#f0fdf4",
  greenBdr:  "#bbf7d0",
  green:     "#15803d",
  accentBg:  "#eff6ff",
  accentBdr: "#bfdbfe",
  accent:    "#1d4ed8",
  footerBg:  "#0f2744",
  footerTxt: "#94a3b8",
};

/* ── Small inline SVGs ── */
function PhoneIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.1 12.17 19.79 19.79 0 0 1 1 3.58 2 2 0 0 1 2.98 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}
function CheckIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function PinIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

/* ── Reusable call button ── */
function CallBtn({ phone, label, big = false }) {
  return (
    <a
      href={`tel:${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        background: C.callBtn,
        color: "#fff",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: big ? "1.1rem" : "0.97rem",
        padding: big ? "16px 32px" : "13px 24px",
        borderRadius: 12,
        textDecoration: "none",
        boxShadow: "0 4px 18px rgba(249,115,22,0.35)",
        transition: "background 0.14s, transform 0.1s",
        letterSpacing: 0.05,
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = C.callHover;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = C.callBtn;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <PhoneIcon size={big ? 20 : 16} />
      {label}
    </a>
  );
}

/* ═══════════════════════════════════════════════════════ */
export default function LandingPage() {
  const { slug } = useParams();
  const page = LANDING_PAGES[slug];

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  /* ── TODO: inject Meta Pixel when page.metaPixelId is set ── */

  /* ── 404 ── */
  if (!page) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT,
        background: C.bg,
        padding: "0 20px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 48, marginBottom: 14 }}>🔍</div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: C.heading, margin: "0 0 8px" }}>
          Landing page not found
        </h1>
        <p style={{ color: C.muted, fontSize: "0.95rem" }}>
          No page exists at <code>/lp/{slug}</code>.
        </p>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: FONT, background: C.bg, minHeight: "100vh", overflowX: "hidden" }}>

      {/* ── TOP BAR ── */}
      <div style={{
        background: C.navy,
        borderBottom: `1px solid ${C.navyLight}`,
        padding: "0 20px",
      }}>
        <div style={{
          maxWidth: 720,
          margin: "0 auto",
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 0.1 }}>
            {page.businessName}
          </span>
          <a
            href={page.mainWebsiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              padding: "5px 12px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "color 0.13s, border-color 0.13s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
          >
            Home
          </a>
        </div>
      </div>

      {/* ── HERO ── */}
      <div style={{ background: C.navy, padding: "44px 20px 50px" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>
            {page.businessName}
          </div>
          <h1 style={{
            fontSize: "clamp(1.8rem, 6vw, 2.6rem)",
            fontWeight: 900,
            lineHeight: 1.16,
            letterSpacing: -0.4,
            color: "#fff",
            margin: "0 0 12px",
          }}>
            {page.headline}
          </h1>
          <p style={{
            fontSize: "1rem",
            color: "rgba(255,255,255,0.72)",
            lineHeight: 1.6,
            margin: "0 0 28px",
            maxWidth: 480,
          }}>
            {page.subheadline}
          </p>
          <div style={{ maxWidth: 360 }}>
            <CallBtn phone={page.phone} label={page.primaryButtonText} big />
          </div>
          <div style={{
            marginTop: 18,
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            color: "rgba(255,255,255,0.48)",
            fontSize: 12,
            fontWeight: 500,
          }}>
            <PinIcon />
            {page.serviceArea}
          </div>
        </div>
      </div>

      {/* ── OFFER ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            background: C.offerBg,
            border: `1.5px solid ${C.offerBdr}`,
            borderRadius: 14,
            padding: "20px 22px",
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            <div style={{ fontSize: 26, flexShrink: 0 }}>🎯</div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: C.offerText, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                Current Offer
              </div>
              <div style={{ fontSize: "0.97rem", color: "#7c2d12", lineHeight: 1.5 }}>
                {page.offer}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} />
            </div>
          </div>
        </div>
      </div>

      {/* ── SERVICES + TRUST — two-column desktop, stacked mobile ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <div style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {/* Services card */}
          <div style={{
            background: C.accentBg,
            border: `1.5px solid ${C.accentBdr}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: C.accent, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
              Services
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {page.services.map((svc, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.93rem", color: C.heading, fontWeight: 500 }}>
                  <span style={{ color: C.accent, flexShrink: 0 }}><CheckIcon /></span>
                  {svc}
                </li>
              ))}
            </ul>
          </div>

          {/* Trust card */}
          <div style={{
            background: C.greenBg,
            border: `1.5px solid ${C.greenBdr}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: C.green, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 14 }}>
              Why Choose Us
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9 }}>
              {page.trustPoints.map((pt, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: "0.93rem", color: C.heading, fontWeight: 500 }}>
                  <span style={{ color: C.green, flexShrink: 0 }}><CheckIcon /></span>
                  {pt}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── SERVICE AREA ── */}
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            background: C.white,
            border: `1.5px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>📍</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: C.heading }}>Service Area: </span>
              <span style={{ fontSize: "0.9rem", color: C.body }}>{page.serviceArea}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{ background: C.navy, margin: "28px 0 0", padding: "40px 20px 44px" }}>
        <div style={{ maxWidth: 540, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.35rem, 4vw, 1.8rem)", fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            Need AC service?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.62)", fontSize: "0.97rem", margin: "0 0 24px", lineHeight: 1.55 }}>
            Call {page.businessName} to schedule service.
          </p>
          <div style={{ display: "inline-block" }}>
            <CallBtn phone={page.phone} label={page.primaryButtonText} big />
          </div>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: C.footerBg, padding: "18px 20px", textAlign: "center" }}>
        <div style={{ fontFamily: FONT, fontSize: 12, color: C.footerTxt, lineHeight: 1.7 }}>
          {page.businessName} · {page.serviceArea}
          {page.mainWebsiteUrl && (
            <>
              {" · "}
              <a
                href={page.mainWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.footerTxt, textDecoration: "underline" }}
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
