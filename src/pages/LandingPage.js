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

/* ─── Enhanced section icons (workshop only) ─────────────────── */
function ServiceIconEnhanced({ index }) {
  const base = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "#f97316", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  if (index === 0) return (
    // Wrench — tune-ups
    <svg {...base}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  );
  if (index === 1) return (
    // HVAC unit — installation
    <svg {...base}>
      <rect x="2" y="6" width="20" height="11" rx="2"/>
      <line x1="6" y1="17" x2="6" y2="20"/>
      <line x1="18" y1="17" x2="18" y2="20"/>
      <line x1="7.5" y1="11.5" x2="7.5" y2="13.5"/>
      <line x1="11" y1="11.5" x2="11" y2="13.5"/>
      <line x1="14.5" y1="11.5" x2="14.5" y2="13.5"/>
    </svg>
  );
  return (
    // Clipboard + check — maintenance
    <svg {...base}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <path d="M9 12l2 2 4-4"/>
    </svg>
  );
}

function TrustIconEnhanced({ index }) {
  // White stroke — sits on dark navy circle background
  const base = { width: 26, height: 26, viewBox: "0 0 24 24", fill: "none", stroke: "#fff", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
  if (index === 0) return (
    // House — local Houston service
    <svg {...base}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
  if (index === 1) return (
    // Speedometer — fast response
    <svg {...base}>
      <path d="M12 2a10 10 0 0 1 7.36 16.7"/>
      <path d="M12 2a10 10 0 0 0-7.36 16.7"/>
      <line x1="12" y1="8" x2="12" y2="6"/>
      <line x1="7" y1="12" x2="5" y2="12"/>
      <path d="M10.5 13.5l2-4" strokeWidth="2"/>
      <circle cx="12" cy="14" r="1.5" fill="#fff" stroke="none"/>
    </svg>
  );
  return (
    // Snowflake — residential cooling & comfort
    <svg {...base}>
      <line x1="12" y1="2" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M17 7l-5 5-5-5"/>
      <path d="M7 17l5-5 5 5"/>
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

  /* ── GA4: inject gtag.js and configure only when gaMeasurementId is set ──
     Guard uses the per-ID script element, not window.gtag, because the
     Smartemark app may have already set window.gtag for its own property.
     Each landing page with a distinct gaMeasurementId gets its own script. ── */
  useEffect(() => {
    const mid = page?.gaMeasurementId;
    if (!mid) return;

    const scriptId = `gtag-js-${mid}`;

    // Inject the gtag.js loader only once per measurement ID
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id    = scriptId;
      script.async = true;
      script.src   = `https://www.googletagmanager.com/gtag/js?id=${mid}`;
      document.head.appendChild(script);
    }

    // Initialize the dataLayer and gtag function (idempotent)
    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function() { window.dataLayer.push(arguments); };
    }
    window.gtag("js", new Date());

    // Standard config call — this is what Google Tag Assistant looks for
    window.gtag("config", mid, {
      page_path:     window.location.pathname,
      page_location: window.location.href,
      page_title:    document.title || page.businessName || "Landing Page",
    });

    console.log("[GA4] loaded", mid, page.slug);
  }, [page?.gaMeasurementId, page?.slug, page?.businessName]);

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
    console.log("[LANDING_EVENT] click_to_call", { pageSlug: page.slug, phone: page.phone });
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
    console.log("[LANDING_EVENT] cta_click", { pageSlug: page.slug, cta: label });
    trackGA4("cta_click", {
      cta_label:   label,
      campaign_id: p.campaignId || "",
      meta_ad_id:  p.metaAdId   || "",
    });
    logEvent("cta_click");
  };

  // Mobile breakpoint for side-photo layout
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 700);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Lightbox for work photos
  const [lightboxSrc, setLightboxSrc] = useState(null);
  useEffect(() => {
    if (!lightboxSrc) return;
    const onKey = (e) => { if (e.key === "Escape") setLightboxSrc(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [lightboxSrc]);

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
      console.log("[LANDING_EVENT] generate_lead", { pageSlug: page.slug });
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
          maxWidth: page.fullWidthHeader ? "none" : 900, margin: "0 auto", height: 52,
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        }}>
          {page.logo ? (
            <div style={{
              background: "#fff", borderRadius: 6,
              padding: (page.logoHeight && page.logoHeight < 40) ? "2px 6px" : "3px 8px",
              display: "flex", alignItems: "center", flexShrink: 1,
            }}>
              <img
                src={page.logo}
                alt={page.businessName}
                onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "inline"; }}
                style={{ height: page.logoHeight || 40, maxWidth: page.logoHeight ? Math.round((page.logoHeight / 40) * 180) : 180, objectFit: "contain", display: "block" }}
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
          <div style={{ display: "flex", alignItems: "center", gap: page.topBarCallText ? 5 : 8, flexShrink: 0 }}>
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
              {page.topBarCallText || `Call: ${page.phoneDisplay}`}
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
        background: page.heroBackgroundImage
          ? `linear-gradient(rgba(5,14,26,${page.heroOverlay ?? 0.68}), rgba(5,14,26,${page.heroOverlay ?? 0.68})), url(${page.heroBackgroundImage}) ${page.heroBackgroundPosition || "center"} / cover no-repeat`
          : "linear-gradient(160deg, #050e1a 0%, #0d1f3c 55%, #143055 100%)",
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
      <div style={{ background: "#fff7ed", borderTop: "3px solid #f97316", padding: page.promotionSidePhotos ? "44px 24px" : "36px 20px" }}>
        {page.promotionSidePhotos ? (
          <div style={{ maxWidth: 1100, margin: "0 auto" }}>
            {isMobile ? (
              /* ── Mobile: promo first, 2×2 photo grid below ── */
              <>
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#ea580c", marginBottom: 8 }}>Promotion</div>
                  <div style={{ fontSize: "clamp(1.6rem, 7vw, 2rem)", fontWeight: 900, color: "#7c2d12", marginBottom: 12, lineHeight: 1.15 }}>{page.offerHeadline || "Special Offer"}</div>
                  <p style={{ fontSize: "0.97rem", color: "#92400e", lineHeight: 1.7, margin: "0 auto 22px", maxWidth: 420 }}>{page.offer}</p>
                  <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} onClick={trackCallClick} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, maxWidth: 340, margin: "0 auto" }}>
                  {[...page.promotionSidePhotos.left, ...page.promotionSidePhotos.right].map((photo, i) => (
                    <div key={i} style={{ position: "relative", cursor: "pointer" }} onClick={() => setLightboxSrc(photo.src)}>
                      <img src={photo.src} alt={photo.label || "Work photo"} style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 10, boxShadow: "0 2px 8px rgba(0,0,0,0.14)", border: "2px solid rgba(255,255,255,0.7)", display: "block" }} />
                      {photo.label && <div style={{ position: "absolute", bottom: 6, left: 6, background: "rgba(10,22,40,0.65)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4 }}>{photo.label}</div>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ── Desktop: [left photos] [promo] [right photos] ── */
              <div style={{ display: "flex", alignItems: "center", gap: 28, justifyContent: "center" }}>
                {/* Left photos */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
                  {page.promotionSidePhotos.left.map((photo, i) => (
                    <div key={i} style={{ position: "relative", cursor: "pointer" }} onClick={() => setLightboxSrc(photo.src)}>
                      <img
                        src={photo.src} alt={photo.label || "Work photo"}
                        style={{ width: 148, height: 108, objectFit: "cover", borderRadius: 10, boxShadow: "0 3px 12px rgba(0,0,0,0.16)", border: "2px solid rgba(255,255,255,0.7)", display: "block", transition: "transform 0.14s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      />
                      {photo.label && <div style={{ position: "absolute", bottom: 7, left: 7, background: "rgba(10,22,40,0.65)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{photo.label}</div>}
                    </div>
                  ))}
                </div>
                {/* Promo content */}
                <div style={{ flex: "1 1 auto", maxWidth: 440, textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#ea580c", marginBottom: 8 }}>Promotion</div>
                  <div style={{ fontSize: "clamp(1.5rem, 3.5vw, 2rem)", fontWeight: 900, color: "#7c2d12", marginBottom: 12, lineHeight: 1.15 }}>{page.offerHeadline || "Special Offer"}</div>
                  <p style={{ fontSize: "0.97rem", color: "#92400e", lineHeight: 1.7, margin: "0 auto 22px", maxWidth: 380 }}>{page.offer}</p>
                  <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} onClick={trackCallClick} />
                </div>
                {/* Right photos */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
                  {page.promotionSidePhotos.right.map((photo, i) => (
                    <div key={i} style={{ position: "relative", cursor: "pointer" }} onClick={() => setLightboxSrc(photo.src)}>
                      <img
                        src={photo.src} alt={photo.label || "Work photo"}
                        style={{ width: 148, height: 108, objectFit: "cover", borderRadius: 10, boxShadow: "0 3px 12px rgba(0,0,0,0.16)", border: "2px solid rgba(255,255,255,0.7)", display: "block", transition: "transform 0.14s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.04)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      />
                      {photo.label && <div style={{ position: "absolute", bottom: 7, left: 7, background: "rgba(10,22,40,0.65)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4 }}>{photo.label}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Original single-column layout ── */
          <div style={{ maxWidth: page.offerMaxWidth || 740, margin: "0 auto", textAlign: page.centerOfferContent ? "center" : undefined }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#ea580c", marginBottom: 8 }}>Promotion</div>
            <div style={{ fontSize: "clamp(1.6rem, 5vw, 2rem)", fontWeight: 900, color: "#7c2d12", marginBottom: 12, lineHeight: 1.15 }}>{page.offerHeadline || "Special Offer"}</div>
            <p style={{ fontSize: "0.97rem", color: "#92400e", lineHeight: 1.7, margin: page.centerOfferContent ? "0 auto 22px" : "0 0 22px", maxWidth: 560 }}>{page.offer}</p>
            <CallBtn phone={page.phone} label={`Call: ${page.phoneDisplay}`} onClick={trackCallClick} />
          </div>
        )}
      </div>

      {/* ════════════ SERVICES ════════════ */}
      {page.enhancedSections ? (
        <div style={{ background: "#f3f5f9", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(1.4rem, 3.5vw, 1.9rem)", fontWeight: 800, color: "#0f2744", textAlign: "center", margin: "0 0 36px" }}>
            Air Conditioning Services
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, maxWidth: 980, margin: "0 auto" }}>
            {(page.workshopServicesData || (page.workshopServices || page.services.slice(0, 3)).map((s) => ({ label: s, desc: "" }))).map((item, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 14, padding: "20px 22px",
                display: "flex", alignItems: "flex-start", gap: 16,
                boxShadow: "0 2px 12px rgba(15,39,68,0.06)", border: "1px solid #e4eaf2",
              }}>
                <div style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: "50%",
                  background: "rgba(249,115,22,0.10)", border: "1.5px solid rgba(249,115,22,0.22)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <ServiceIconEnhanced index={i} />
                </div>
                <div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f2744", marginBottom: 5 }}>{item.label}</div>
                  {item.desc && <div style={{ fontSize: "0.87rem", color: "#64748b", lineHeight: 1.55 }}>{item.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0", padding: "40px 20px" }}>
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.5rem)", fontWeight: 800, color: "#0f2744", margin: "0 0 24px" }}>
              Air Conditioning Services
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
              {page.services.map((svc, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "12px 14px", fontSize: "0.9rem", fontWeight: 600, color: "#1e293b" }}>
                  <CheckCircleIcon />
                  {svc}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ WHY CHOOSE US ════════════ */}
      {page.enhancedSections ? (
        <div style={{ background: "#f3f5f9", padding: "56px 20px" }}>
          <h2 style={{ fontSize: "clamp(1.4rem, 3.5vw, 1.9rem)", fontWeight: 800, color: "#0f2744", textAlign: "center", margin: "0 0 36px" }}>
            Why Choose {page.businessName}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, maxWidth: 980, margin: "0 auto" }}>
            {(page.workshopTrustData || (page.workshopTrustPoints || page.trustPoints.slice(0, 3)).map((s) => ({ label: s, desc: "" }))).map((item, i) => (
              <div key={i} style={{
                background: "#fff", borderRadius: 14, padding: "20px 22px",
                display: "flex", alignItems: "flex-start", gap: 16,
                boxShadow: "0 2px 12px rgba(15,39,68,0.06)", border: "1px solid #e4eaf2",
              }}>
                <div style={{
                  flexShrink: 0, width: 52, height: 52, borderRadius: "50%",
                  background: "#0f2744",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <TrustIconEnhanced index={i} />
                </div>
                <div>
                  <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0f2744", marginBottom: 5 }}>{item.label}</div>
                  {item.desc && <div style={{ fontSize: "0.87rem", color: "#64748b", lineHeight: 1.55 }}>{item.desc}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ background: "#fff", borderTop: "1px solid #e2e8f0", padding: "40px 20px" }}>
          <div style={{ maxWidth: 740, margin: "0 auto" }}>
            <h2 style={{ fontSize: "clamp(1.2rem, 3.5vw, 1.5rem)", fontWeight: 800, color: "#0f2744", margin: "0 0 24px" }}>
              Why Choose {page.businessName}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {page.trustPoints.map((pt, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "12px 14px", fontSize: "0.9rem", fontWeight: 600, color: "#1e293b" }}>
                  <ShieldIcon />
                  {pt}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ════════════ TRUST BAR ════════════ */}
      {page.workshopTrustBar && (
        <div style={{
          background: "#0a1628", padding: "18px 24px",
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 14, flexWrap: "wrap",
        }}>
          <span style={{ color: "#f97316", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <polyline points="9 12 11 14 15 10"/>
            </svg>
          </span>
          <span style={{ color: "#fff", fontWeight: 800, fontSize: "0.97rem", letterSpacing: "-0.1px", whiteSpace: "nowrap" }}>
            {page.workshopTrustBar.headline}
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "1rem", flexShrink: 0 }}>|</span>
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "0.9rem" }}>
            {page.workshopTrustBar.sub}
          </span>
        </div>
      )}

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

      {/* ════════════ WORK PHOTO LIGHTBOX ════════════ */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 2000,
            background: "rgba(5,14,26,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "20px", boxSizing: "border-box",
          }}
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            aria-label="Close"
            style={{
              position: "absolute", top: 16, right: 16,
              background: "rgba(255,255,255,0.14)", border: "none",
              color: "#fff", fontSize: 20, width: 40, height: 40,
              borderRadius: "50%", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: FONT,
            }}
          >
            ✕
          </button>
          <img
            src={lightboxSrc}
            alt="Work photo"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw", maxHeight: "85vh",
              objectFit: "contain",
              borderRadius: 12,
              boxShadow: "0 8px 48px rgba(0,0,0,0.6)",
            }}
          />
        </div>
      )}

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
