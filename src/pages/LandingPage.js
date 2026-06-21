// src/pages/LandingPage.js
import React, { useEffect, useRef, useState } from "react";
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
function ScheduleBtn({ label, size = "md", onClick }) {
  const big = size === "lg";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        background: "transparent", color: "#fff", fontFamily: FONT, fontWeight: 700,
        fontSize: big ? "1.05rem" : "0.9rem",
        padding: big ? "15px 30px" : "10px 20px",
        borderRadius: 6, cursor: "pointer",
        border: "2px solid rgba(255,255,255,0.55)",
        transition: "border-color 0.12s, background 0.12s",
        whiteSpace: "nowrap", boxSizing: "border-box",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.55)"; e.currentTarget.style.background = "transparent"; }}
    >
      {label}
    </button>
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

  /* ── GA4: inject gtag.js and fire page_view if gaMeasurementId is set ── */
  useEffect(() => {
    const mid = page?.gaMeasurementId;
    if (!mid) return;

    // Inject the gtag script only once
    if (!window.gtag && !document.getElementById("ga4-script")) {
      const script = document.createElement("script");
      script.id = "ga4-script";
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${mid}`;
      document.head.appendChild(script);

      window.dataLayer = window.dataLayer || [];
      window.gtag = function() { window.dataLayer.push(arguments); };
      window.gtag("js", new Date());
      window.gtag("config", mid, { send_page_view: false });
    }

    // Fire page_view with landing page context
    if (window.gtag) {
      window.gtag("event", "page_view", {
        client:    page.clientSlug || page.slug,
        page_slug: page.slug,
      });
    }
  }, [page?.gaMeasurementId, page?.slug, page?.clientSlug]);

  /* ── URL param extraction: fbclid, campaignId, metaAdId, utm_* ── */
  // Stored in a ref so event handlers can read them without re-renders.
  const urlParamsRef = useRef({});
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      urlParamsRef.current = {
        fbclid:       sp.get("fbclid")       || "",
        campaignId:   sp.get("campaignId")   || sp.get("campaign_id") || "",
        metaAdId:     sp.get("metaAdId")     || sp.get("ad_id")       || "",
        utm_source:   sp.get("utm_source")   || "",
        utm_medium:   sp.get("utm_medium")   || "",
        utm_campaign: sp.get("utm_campaign") || "",
        utm_content:  sp.get("utm_content")  || "",
      };
    } catch {}
  }, []);

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

  // ── Meta Pixel event helper ──────────────────────────────────────────────
  const track = (event, data = {}) => {
    if (window.fbq) window.fbq("track", event, data);
  };

  // ── GA4 event helper (no-op when GA4 not loaded) ─────────────────────────
  const trackGA4 = (eventName, params = {}) => {
    if (window.gtag) {
      window.gtag("event", eventName, {
        client:    page.clientSlug || page.slug,
        page_slug: page.slug,
        ...params,
      });
    }
  };

  // ── Server-side event logger (/api/landing-events) ────────────────────────
  // Fire-and-forget: never awaited so it never blocks the user action.
  const logEvent = (eventName, extra = {}) => {
    const p = urlParamsRef.current || {};
    fetch("/api/landing-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientSlug:   page.clientSlug  || page.slug,
        pageSlug:     page.slug,
        eventName,
        phone:        page.phone || "",
        campaignId:   p.campaignId   || "",
        metaAdId:     p.metaAdId     || "",
        fbclid:       p.fbclid       || "",
        utm_source:   p.utm_source   || "",
        utm_medium:   p.utm_medium   || "",
        utm_campaign: p.utm_campaign || "",
        utm_content:  p.utm_content  || "",
        userAgent:    navigator.userAgent || "",
        timestamp:    new Date().toISOString(),
        ...extra,
      }),
    }).catch(() => {}); // swallow network errors — never block the user
  };

  // ── Combined call-click handler ───────────────────────────────────────────
  // Fires Meta Pixel Contact + GA4 click_to_call + server log.
  // NOTE: This tracks call button CLICKS only, not actual answered calls.
  // TODO: wire up real call tracking via Twilio/CallRail/GoHighLevel:
  //   - tracking number receives the call
  //   - webhook fires with caller number, duration, recording URL
  //   - store in DB with campaignId/metaAdId attribution from URL params
  const trackCallClick = () => {
    const p = urlParamsRef.current || {};
    track("Contact", {
      content_name:  `${page.businessName} Call Button`,
      business_name: page.businessName,
      phone:         page.phone,
    });
    trackGA4("click_to_call", {
      phone:       page.phone,
      campaign_id: p.campaignId || "",
      meta_ad_id:  p.metaAdId   || "",
    });
    logEvent("call_click", { phone: page.phone });
  };

  // ── CTA click handler ─────────────────────────────────────────────────────
  const trackCtaClick = (label = "cta") => {
    const p = urlParamsRef.current || {};
    trackGA4("cta_click", {
      cta_label:   label,
      campaign_id: p.campaignId || "",
      meta_ad_id:  p.metaAdId   || "",
    });
    logEvent("cta_click");
  };

  // Schedule Service modal
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", preferredDate: "", preferredTime: "" });
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const openModal = () => {
    setFormData({ name: "", phone: "", preferredDate: "", preferredTime: "" });
    setFormError(""); setSubmitSuccess(false); setSubmitting(false);
    setModalOpen(true);
    trackCtaClick("schedule_service");
  };
  const closeModal = () => setModalOpen(false);

  const handleScheduleSubmit = async (e) => {
    e.preventDefault();
    const { name, phone, preferredDate, preferredTime } = formData;
    if (!name.trim() || !phone.trim() || !preferredDate || !preferredTime) {
      setFormError("Please fill in all fields."); return;
    }
    setFormError(""); setSubmitting(true);
    try {
      const res = await fetch("/api/landing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          landingPageSlug: page.slug,
          businessName: page.businessName,
          name: name.trim(),
          phone: phone.trim(),
          preferredDate,
          preferredTime,
          source: `${page.businessName} Landing Page`,
          pageUrl: window.location.href,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Submission failed.");
      setSubmitSuccess(true);
      // Meta Pixel Lead event
      track("Lead", {
        content_name:  `${page.businessName} Schedule Service Form Submitted`,
        business_name: page.businessName,
      });
      // GA4 generate_lead
      trackGA4("generate_lead", { form: "schedule_service" });
      // Server-side event log
      logEvent("lead_submit");
    } catch (err) {
      setFormError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
              onClick={trackCallClick}
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
            {page.locationBadge || "Texas"}
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
              onClick={trackCallClick}
            />
            <ScheduleBtn
              label="Schedule Service"
              size="lg"
              onClick={openModal}
            />
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
            {page.offerHeadline || "Special Offer"}
          </div>
          <p style={{ fontSize: "0.97rem", color: "#92400e", lineHeight: 1.7, margin: "0 0 22px", maxWidth: 560 }}>
            {page.offer}
          </p>
          <CallBtn
            phone={page.phone}
            label={`Call: ${page.phoneDisplay}`}
            onClick={trackCallClick}
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
            Why Choose {page.businessName}
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
              onClick={trackCallClick}
            />
            <ScheduleBtn
              label="Schedule Service"
              size="lg"
              onClick={openModal}
            />
          </div>
        </div>
      </div>

      {/* ════════════ SCHEDULE SERVICE MODAL ════════════ */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(5,14,26,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px", boxSizing: "border-box",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, width: "100%", maxWidth: 460,
              padding: "28px 28px 24px", boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
              boxSizing: "border-box", position: "relative",
            }}
          >
            {/* Close button */}
            <button
              type="button" onClick={closeModal}
              style={{
                position: "absolute", top: 14, right: 14, background: "none",
                border: "none", cursor: "pointer", color: "#6b7280", fontSize: 22,
                lineHeight: 1, padding: 4,
              }}
              aria-label="Close"
            >
              ✕
            </button>

            <h2 style={{ fontSize: "1.25rem", fontWeight: 900, color: "#0f2744", margin: "0 0 6px" }}>
              Schedule AC Service
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#6b7280", margin: "0 0 22px", lineHeight: 1.55 }}>
              Tell us the best time to reach you. {page.businessName} will follow up to confirm your appointment.
            </p>

            {submitSuccess ? (
              <div style={{
                background: "#f0fdf4", border: "1.5px solid #86efac",
                borderRadius: 10, padding: "16px 18px",
                fontSize: "0.93rem", color: "#15803d", lineHeight: 1.6, fontWeight: 600,
              }}>
                Thanks — your request was sent. {page.businessName} will follow up shortly to confirm.
              </div>
            ) : (
              <form onSubmit={handleScheduleSubmit} noValidate>
                {[
                  { label: "Your Name", key: "name", type: "text", placeholder: "Jane Smith" },
                  { label: "Phone Number", key: "phone", type: "tel", placeholder: "(555) 000-0000" },
                  { label: "Preferred Date", key: "preferredDate", type: "date", placeholder: "" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#374151", marginBottom: 5 }}>
                      {label}
                    </label>
                    <input
                      type={type}
                      placeholder={placeholder}
                      value={formData[key]}
                      onChange={(e) => setFormData((f) => ({ ...f, [key]: e.target.value }))}
                      style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "10px 12px", borderRadius: 7,
                        border: "1.5px solid #d1d5db", fontSize: "0.93rem",
                        fontFamily: FONT, color: "#111827", outline: "none",
                      }}
                    />
                  </div>
                ))}

                <div style={{ marginBottom: 18 }}>
                  <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "#374151", marginBottom: 5 }}>
                    Preferred Time
                  </label>
                  <select
                    value={formData.preferredTime}
                    onChange={(e) => setFormData((f) => ({ ...f, preferredTime: e.target.value }))}
                    style={{
                      width: "100%", boxSizing: "border-box",
                      padding: "10px 12px", borderRadius: 7,
                      border: "1.5px solid #d1d5db", fontSize: "0.93rem",
                      fontFamily: FONT, color: formData.preferredTime ? "#111827" : "#9ca3af",
                      background: "#fff", outline: "none",
                    }}
                  >
                    <option value="">Select a time...</option>
                    <option value="Morning (8am–12pm)">Morning (8am–12pm)</option>
                    <option value="Afternoon (12pm–4pm)">Afternoon (12pm–4pm)</option>
                    <option value="Evening (4pm–7pm)">Evening (4pm–7pm)</option>
                    <option value="Any time">Any time</option>
                  </select>
                </div>

                {formError && (
                  <div style={{ fontSize: "0.85rem", color: "#dc2626", marginBottom: 12, fontWeight: 600 }}>
                    {formError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    width: "100%", padding: "13px", background: submitting ? "#fdba74" : "#f97316",
                    color: "#fff", border: "none", borderRadius: 8, fontSize: "1rem",
                    fontWeight: 800, fontFamily: FONT, cursor: submitting ? "not-allowed" : "pointer",
                    transition: "background 0.12s",
                  }}
                >
                  {submitting ? "Sending…" : "Request Service"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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
