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

function PhoneIcon({ size = 16 }) {
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

/* Reusable orange call button */
function CallBtn({ phone, label, big = false }) {
  return (
    <a
      href={`tel:${phone}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        background: C.callBtn,
        color: "#fff",
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: big ? "1.08rem" : "0.9rem",
        padding: big ? "15px 30px" : "9px 18px",
        borderRadius: 10,
        textDecoration: "none",
        boxShadow: "0 4px 16px rgba(249,115,22,0.35)",
        transition: "background 0.13s, transform 0.1s",
        whiteSpace: "nowrap",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.callHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.callBtn; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <PhoneIcon size={big ? 19 : 14} />
      {label}
    </a>
  );
}

export default function LandingPage() {
  const { slug } = useParams();
  const page = LANDING_PAGES[slug];

  useEffect(() => { window.scrollTo(0, 0); }, [slug]);

  /* TODO: inject Meta Pixel when page.metaPixelId is set */

  if (!page) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: FONT, background: C.bg, padding: "0 20px", textAlign: "center",
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
      <div style={{ background: C.navy, borderBottom: `1px solid ${C.navyLight}`, padding: "0 20px" }}>
        <div style={{
          maxWidth: 720, margin: "0 auto", height: 54,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {/* Business name */}
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 0.1, flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {page.businessName}
          </span>

          {/* Right: Call + Home */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Call button — orange, prominent */}
            <a
              href={`tel:${page.phone}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.callBtn, color: "#fff",
                fontFamily: FONT, fontWeight: 800, fontSize: 13,
                padding: "7px 14px", borderRadius: 8, textDecoration: "none",
                boxShadow: "0 2px 10px rgba(249,115,22,0.4)",
                transition: "background 0.13s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.callHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.callBtn; }}
            >
              <PhoneIcon size={13} />
              Call: {page.phoneDisplay}
            </a>

            {/* Home button — ghost */}
            <a
              href={page.mainWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "rgba(255,255,255,0.72)", fontSize: 13, fontWeight: 600,
                textDecoration: "none", padding: "6px 12px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.22)",
                transition: "color 0.12s, border-color 0.12s",
                whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.72)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
            >
              Home
            </a>
          </div>
        </div>
      </div>

      {/* ── HERO ── */}
      <div style={{ background: C.navy, padding: "40px 20px 50px" }}>
        <div style={{ maxWidth: 620, margin: "0 auto" }}>
          {/* Label */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.45)", marginBottom: 12 }}>
            {page.businessName}
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
            fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.4,
            color: "#fff", margin: "0 0 12px",
          }}>
            {page.headline}
          </h1>

          {/* Subheadline */}
          <p style={{ fontSize: "1rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 460 }}>
            {page.subheadline}
          </p>

          {/* White persuasion card */}
          <div style={{
            background: "#fff",
            borderRadius: 14,
            padding: "20px 22px",
            marginBottom: 24,
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            maxWidth: 480,
          }}>
            <div style={{ fontWeight: 800, fontSize: "1.05rem", color: C.heading, marginBottom: 8, lineHeight: 1.3 }}>
              Having AC problems?
            </div>
            <div style={{ fontSize: "0.93rem", color: C.body, lineHeight: 1.6 }}>
              If your system is struggling, blowing warm air, or due for maintenance, Aspen can help keep your home comfortable.
            </div>
          </div>

          {/* Main call CTA */}
          <div style={{ marginBottom: 16, maxWidth: 340 }}>
            <CallBtn phone={page.phone} label={page.primaryButtonText} big />
          </div>

          {/* Service area */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.45)", fontSize: 12, fontWeight: 500 }}>
            <PinIcon />
            {page.serviceArea}
          </div>
        </div>
      </div>

      {/* ── PROMOTION ── */}
      <div style={{ padding: "28px 20px 0" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{
            background: C.offerBg,
            border: `1.5px solid ${C.offerBdr}`,
            borderRadius: 14,
            padding: "20px 22px",
          }}>
            {/* Section label */}
            <div style={{ fontWeight: 700, fontSize: 11, color: C.offerText, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 10 }}>
              Promotion
            </div>

            {/* Price emphasis */}
            <div style={{ fontSize: "1.45rem", fontWeight: 900, color: "#7c2d12", marginBottom: 8, lineHeight: 1.2 }}>
              $75 AC Tune-Up
            </div>

            {/* Body copy */}
            <div style={{ fontSize: "0.95rem", color: "#92400e", lineHeight: 1.6, marginBottom: 18, maxWidth: 520 }}>
              {page.offer}
            </div>

            {/* Call button */}
            <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} />
          </div>
        </div>
      </div>

      {/* ── SERVICES + WHY CHOOSE US ── two-column desktop, stacked mobile */}
      <div style={{ padding: "24px 20px 0" }}>
        <div style={{
          maxWidth: 720, margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}>
          {/* Services */}
          <div style={{ background: C.accentBg, border: `1.5px solid ${C.accentBdr}`, borderRadius: 14, padding: "20px 22px" }}>
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

          {/* Why Choose Us */}
          <div style={{ background: C.greenBg, border: `1.5px solid ${C.greenBdr}`, borderRadius: 14, padding: "20px 22px" }}>
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
            background: C.white, border: `1.5px solid ${C.border}`,
            borderRadius: 14, padding: "13px 20px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.9rem", color: C.heading }}>Service Area: </span>
              <span style={{ fontSize: "0.9rem", color: C.body }}>{page.serviceArea}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{ background: C.navy, margin: "28px 0 0", padding: "40px 20px 46px" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.3rem, 4vw, 1.75rem)", fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            Need AC service?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.95rem", margin: "0 0 24px", lineHeight: 1.55 }}>
            Call {page.businessName} to schedule service.
          </p>
          <CallBtn phone={page.phone} label={page.primaryButtonText} big />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: C.footerBg, padding: "16px 20px", textAlign: "center" }}>
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
