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
  offerBdr:  "#fdba74",
  offerText: "#92400e",
  greenBg:   "#f0fdf4",
  greenBdr:  "#86efac",
  green:     "#15803d",
  accentBg:  "#eff6ff",
  accentBdr: "#bfdbfe",
  accent:    "#1d4ed8",
  footerBg:  "#0a1e38",
  footerTxt: "#94a3b8",
};

function PhoneIcon({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.1 12.17 19.79 19.79 0 0 1 1 3.58 2 2 0 0 1 2.98 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  );
}

function CheckIcon({ size = 14, color = C.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function PinIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
    </svg>
  );
}

function CallBtn({ phone, label, big = false }) {
  return (
    <a
      href={`tel:${phone}`}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        gap: 7, background: C.callBtn, color: "#fff", fontFamily: FONT,
        fontWeight: 800, fontSize: big ? "1.05rem" : "0.88rem",
        padding: big ? "14px 28px" : "9px 16px", borderRadius: 10,
        textDecoration: "none", boxShadow: "0 3px 14px rgba(249,115,22,0.38)",
        transition: "background 0.12s, transform 0.1s", whiteSpace: "nowrap",
        boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.callHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = C.callBtn; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <PhoneIcon size={big ? 18 : 13} />
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

      {/* ── TOP NAV ── */}
      <div style={{ background: C.navy, borderBottom: `1px solid rgba(255,255,255,0.08)`, padding: "0 20px" }}>
        <div style={{
          maxWidth: 840, margin: "0 auto", height: 54,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          <span style={{
            color: "#fff", fontWeight: 700, fontSize: 14, letterSpacing: 0.1,
            flexShrink: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {page.businessName}
          </span>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* Call — orange, primary */}
            <a
              href={`tel:${page.phone}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: C.callBtn, color: "#fff", fontFamily: FONT,
                fontWeight: 800, fontSize: 13, padding: "7px 13px", borderRadius: 8,
                textDecoration: "none", boxShadow: "0 2px 8px rgba(249,115,22,0.4)",
                transition: "background 0.12s", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = C.callHover; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.callBtn; }}
            >
              <PhoneIcon size={12} />
              Call: {page.phoneDisplay}
            </a>

            {/* Home — ghost */}
            <a
              href={page.mainWebsiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600,
                textDecoration: "none", padding: "6px 12px", borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.2)",
                transition: "color 0.12s, border-color 0.12s", whiteSpace: "nowrap",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
            >
              Home
            </a>
          </div>
        </div>
      </div>

      {/* ── HERO + TWO-COLUMN CARDS — all on navy ── */}
      <div style={{ background: C.navy, padding: "38px 20px 44px" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>

          {/* Label */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", marginBottom: 10 }}>
            {page.businessName}
          </div>

          {/* Headline */}
          <h1 style={{
            fontSize: "clamp(1.7rem, 5.5vw, 2.4rem)",
            fontWeight: 900, lineHeight: 1.15, letterSpacing: -0.3,
            color: "#fff", margin: "0 0 10px",
          }}>
            {page.headline}
          </h1>

          {/* Subheadline */}
          <p style={{
            fontSize: "0.97rem", color: "rgba(255,255,255,0.65)",
            lineHeight: 1.6, margin: "0 0 24px", maxWidth: 500,
          }}>
            {page.subheadline}
          </p>

          {/* ── TWO-COLUMN GRID ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}>

            {/* LEFT — Promotion card */}
            <div style={{
              background: C.offerBg,
              border: `1.5px solid ${C.offerBdr}`,
              borderRadius: 14,
              padding: "22px 22px 20px",
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: C.offerText, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                Promotion
              </div>
              <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "#7c2d12", lineHeight: 1.1, marginBottom: 10 }}>
                $75 AC Tune-Up
              </div>
              <div style={{ fontSize: "0.9rem", color: "#92400e", lineHeight: 1.65, marginBottom: 20 }}>
                Having AC issues or due for maintenance? Call now to schedule your tune-up or ask about the $120 annual maintenance plan.
              </div>
              <div>
                <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} />
              </div>
            </div>

            {/* RIGHT — Services + Why Choose Us */}
            <div style={{
              background: C.white,
              border: "1.5px solid rgba(255,255,255,0.15)",
              borderRadius: 14,
              padding: "22px 22px 20px",
            }}>
              {/* Inner two-column grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: "18px 20px",
              }}>
                {/* Services */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
                    Services
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {page.services.map((svc, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", color: C.heading, fontWeight: 500 }}>
                        <CheckIcon color={C.accent} />
                        {svc}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Why Choose Us */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 10, color: C.green, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
                    Why Choose Us
                  </div>
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                    {page.trustPoints.map((pt, i) => (
                      <li key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.88rem", color: C.heading, fontWeight: 500 }}>
                        <CheckIcon color={C.green} />
                        {pt}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

          </div>
          {/* end two-column grid */}

          {/* Service area — below cards, still on navy */}
          <div style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 5, color: "rgba(255,255,255,0.38)", fontSize: 12, fontWeight: 500 }}>
            <PinIcon />
            {page.serviceArea}
          </div>
        </div>
      </div>
      {/* end navy hero */}

      {/* ── SERVICE AREA CARD ── */}
      <div style={{ padding: "24px 20px 0" }}>
        <div style={{ maxWidth: 840, margin: "0 auto" }}>
          <div style={{
            background: C.white, border: `1.5px solid ${C.border}`,
            borderRadius: 14, padding: "13px 20px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>📍</span>
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.88rem", color: C.heading }}>Service Area: </span>
              <span style={{ fontSize: "0.88rem", color: C.body }}>{page.serviceArea}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM CTA ── */}
      <div style={{ background: C.navy, margin: "24px 0 0", padding: "38px 20px 44px" }}>
        <div style={{ maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.3rem, 4vw, 1.7rem)", fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
            Need AC service?
          </h2>
          <p style={{ color: "rgba(255,255,255,0.58)", fontSize: "0.93rem", margin: "0 0 22px", lineHeight: 1.55 }}>
            Call {page.businessName} to schedule service.
          </p>
          <CallBtn phone={page.phone} label={page.primaryButtonText} big />
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: C.footerBg, padding: "14px 20px", textAlign: "center" }}>
        <div style={{ fontSize: 12, color: C.footerTxt, lineHeight: 1.7 }}>
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
