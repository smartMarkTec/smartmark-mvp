/* eslint-disable */
// src/pages/admin/AdminManageCampaign.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.09)";
const PURPLE = "#5d59ea";

function Card({ title, children, action }) {
  return (
    <div style={{
      background: "white", border: `1px solid ${BORDER}`,
      borderRadius: 12, padding: "20px 22px", marginBottom: 18,
    }}>
      {title && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, borderBottom: `1px solid ${BORDER}`, paddingBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TEXT }}>{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Field({ label, name, value, onChange, placeholder, multiline, type }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TEXT_SOFT, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </label>
      {multiline ? (
        <textarea value={value} onChange={onChange} placeholder={placeholder} rows={3}
          style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT, resize: "vertical", outline: "none", background: "#fafafa", boxSizing: "border-box", lineHeight: 1.5 }} />
      ) : (
        <input type={type || "text"} value={value} onChange={onChange} placeholder={placeholder}
          style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT, outline: "none", background: "#fafafa", boxSizing: "border-box" }} />
      )}
    </div>
  );
}

function adminHeaders(extra) {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  return sid ? { "x-sm-sid": sid, ...(extra || {}) } : { ...(extra || {}) };
}

export default function AdminManageCampaign() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [fbInfo, setFbInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Campaign form — pre-filled from intake
  const [form, setForm] = useState({
    businessName: "",
    websiteUrl: "",
    phone: "",
    serviceArea: "",
    services: "",
    offer: "",
    headline: "",
    body: "",
    cta: "Call Now",
    adAccountId: "",
    pageId: "",
    dailyBudget: "1000", // cents — $10/day default
    imageUrls: "",
  });

  // AI copy generation
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState("");

  // Launch
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [launchError, setLaunchError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => {
    (async () => {
      try {
        const [clientRes, fbRes] = await Promise.all([
          fetch(`/api/admin/clients/${id}`, { credentials: "include", headers: adminHeaders() }),
          fetch(`/api/admin/clients/${id}/facebook-info`, { credentials: "include", headers: adminHeaders() }),
        ]);

        if (clientRes.status === 403) { navigate("/setup"); return; }

        const [clientJ, fbJ] = await Promise.all([
          clientRes.json().catch(() => ({})),
          fbRes.json().catch(() => ({})),
        ]);

        if (!clientJ.ok) throw new Error(clientJ.error || "Failed to load client.");

        const c = clientJ.client;
        setClient(c);

        const fb = fbJ.ok ? fbJ : { fbConnected: false, adAccounts: [], pages: [] };
        setFbInfo(fb);

        // Pre-fill form from intake data
        const intake = c.premiumIntake;
        const firstAccount = fb.adAccounts?.[0];
        const firstPage = fb.pages?.[0];

        setForm((f) => ({
          ...f,
          businessName: intake?.businessName || c.displayName || "",
          websiteUrl: intake?.websiteUrl || "",
          phone: intake?.mainPhone || "",
          serviceArea: intake?.serviceArea || "",
          services: intake?.mainServices || "",
          offer: intake?.currentSpecialOrOffer || "",
          adAccountId: firstAccount?.id || "",
          pageId: firstPage?.id || "",
        }));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const generateCopy = async () => {
    if (generating) return;
    setGenerating(true);
    setGenMsg("");
    try {
      const prompt =
        `Generate Facebook ad copy for an HVAC business. ` +
        `Business: ${form.businessName}. ` +
        `Services: ${form.services}. ` +
        `Offer: ${form.offer || "none"}. ` +
        `Service area: ${form.serviceArea}. ` +
        `Phone: ${form.phone}. ` +
        `Return a concise headline (max 40 chars), a short ad body (max 90 chars), and CTA. ` +
        `Format as: HEADLINE: ... | BODY: ... | CTA: ...`;

      const r = await fetch("/api/ad-agent/chat", {
        method: "POST",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ message: prompt }),
      });
      const j = await r.json().catch(() => ({}));
      const reply = j?.reply || "";

      // Parse the structured response
      const headlineMatch = reply.match(/HEADLINE:\s*([^|]+)/i);
      const bodyMatch = reply.match(/BODY:\s*([^|]+)/i);
      const ctaMatch = reply.match(/CTA:\s*(.+)/i);

      setForm((f) => ({
        ...f,
        headline: headlineMatch ? headlineMatch[1].trim() : f.headline,
        body: bodyMatch ? bodyMatch[1].trim() : f.body,
        cta: ctaMatch ? ctaMatch[1].trim() : f.cta,
      }));
      setGenMsg("Copy generated — review and edit before launching.");
    } catch (err) {
      setGenMsg("Copy generation failed: " + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleLaunch = async (e) => {
    e.preventDefault();
    if (launching) return;

    if (!form.adAccountId) {
      setLaunchError("Select an ad account first.");
      return;
    }
    if (!form.headline || !form.body) {
      setLaunchError("Headline and body are required.");
      return;
    }

    setLaunching(true);
    setLaunchError("");
    setLaunchResult(null);

    try {
      const images = form.imageUrls
        ? form.imageUrls.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const r = await fetch(`/api/admin/clients/${id}/launch-campaign`, {
        method: "POST",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          adAccountId: form.adAccountId,
          pageId: form.pageId,
          businessName: form.businessName,
          headline: form.headline,
          body: form.body,
          cta: form.cta,
          website: form.websiteUrl,
          phone: form.phone,
          industry: "hvac",
          dailyBudget: parseInt(form.dailyBudget, 10) || 1000,
          images,
          form: {
            answers: {
              businessName: form.businessName,
              url: form.websiteUrl,
              phone: form.phone,
              industry: "hvac",
              city: form.serviceArea,
              mainBenefit: form.services,
              offer: form.offer,
              cta: form.cta,
              headline: form.headline,
              body: form.body,
            },
          },
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok && !j.success && !j.campaignId) {
        throw new Error(j.error || j.upstream?.error || "Launch failed.");
      }
      setLaunchResult(j);
    } catch (err) {
      setLaunchError(err.message);
    } finally {
      setLaunching(false);
    }
  };

  // ── Loading/error states ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: TEXT_SOFT }}>Loading client data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: 32 }}>
        <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>
        <button onClick={() => navigate(`/admin/clients/${id}`)} style={{ marginTop: 16, color: PURPLE, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 14 }}>
          ← Back to Client
        </button>
      </div>
    );
  }

  const intake = client?.premiumIntake;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "28px 20px 80px" }}>
      <div style={{ maxWidth: 860, margin: "0 auto" }}>

        {/* Nav */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
          <button onClick={() => navigate("/admin/clients")} style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", fontFamily: FONT }}>← Clients</button>
          <span style={{ color: BORDER }}>|</span>
          <button onClick={() => navigate(`/admin/clients/${id}`)} style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", fontFamily: FONT }}>
            {intake?.businessName || client?.email}
          </button>
          <span style={{ color: BORDER }}>|</span>
          <span style={{ fontSize: 14, color: TEXT }}>Manage Campaign</span>
        </div>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 4, letterSpacing: 0.4 }}>ADMIN · CAMPAIGN MANAGEMENT</div>
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: TEXT }}>
            {intake?.businessName || client?.displayName || client?.email}
          </h1>
        </div>

        {/* Facebook status */}
        <Card title="Facebook Ad Account">
          {!fbInfo?.fbConnected ? (
            <div style={{ color: "#d97706", fontSize: 14 }}>
              ⚠ This client has not connected Facebook yet. They must connect their Facebook ad account before a campaign can be launched.
            </div>
          ) : fbInfo?.fbError ? (
            <div style={{ color: "#d97706", fontSize: 14 }}>
              Facebook is connected but returned an error: {fbInfo.fbError}
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
                  Ad Account
                </label>
                <select
                  value={form.adAccountId}
                  onChange={set("adAccountId")}
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT, background: "#fafafa", outline: "none" }}
                >
                  <option value="">— Select ad account —</option>
                  {(fbInfo?.adAccounts || []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name || a.id} ({a.id})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 5 }}>
                  Facebook Page
                </label>
                <select
                  value={form.pageId}
                  onChange={set("pageId")}
                  style={{ width: "100%", padding: "9px 12px", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT, background: "#fafafa", outline: "none" }}
                >
                  <option value="">— Select page —</option>
                  {(fbInfo?.pages || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name || p.id}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </Card>

        {/* Campaign form */}
        <form onSubmit={handleLaunch}>
          <Card
            title="Campaign Details"
            action={
              <button
                type="button"
                onClick={generateCopy}
                disabled={generating}
                style={{
                  padding: "6px 14px", background: generating ? "#e5e7eb" : "#111827",
                  color: generating ? TEXT_SOFT : "#fff", border: "none", borderRadius: 7,
                  fontSize: 12, fontWeight: 600, cursor: generating ? "not-allowed" : "pointer", fontFamily: FONT,
                }}
              >
                {generating ? "Generating…" : "Generate Copy with AI"}
              </button>
            }
          >
            {genMsg && (
              <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 7, fontSize: 13, color: "#15803d", marginBottom: 14 }}>
                {genMsg}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Field label="Business Name" name="businessName" value={form.businessName} onChange={set("businessName")} placeholder="Business name" />
              <Field label="Website URL" name="websiteUrl" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="https://..." />
              <Field label="Phone Number" name="phone" value={form.phone} onChange={set("phone")} placeholder="(832) 555-0100" />
              <Field label="Service Area" name="serviceArea" value={form.serviceArea} onChange={set("serviceArea")} placeholder="Houston, TX" />
            </div>
            <Field label="Services" name="services" value={form.services} onChange={set("services")} placeholder="AC repair, furnace install..." multiline />
            <Field label="Current Offer / Special" name="offer" value={form.offer} onChange={set("offer")} placeholder="e.g. $89 AC tune-up" />

            <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "16px 0" }} />

            <Field label="Ad Headline (max 40 chars)" name="headline" value={form.headline} onChange={set("headline")} placeholder="e.g. Same-Day AC Repair" />
            <div style={{ fontSize: 12, color: form.headline.length > 40 ? "#b91c1c" : TEXT_SOFT, marginTop: -8, marginBottom: 12 }}>
              {form.headline.length}/40 characters
            </div>
            <Field label="Ad Body (max 90 chars)" name="body" value={form.body} onChange={set("body")} placeholder="e.g. Fast, affordable HVAC service in Houston. Call now for same-day scheduling." multiline />
            <div style={{ fontSize: 12, color: form.body.length > 90 ? "#b91c1c" : TEXT_SOFT, marginTop: -8, marginBottom: 12 }}>
              {form.body.length}/90 characters
            </div>
            <Field label="Call-to-Action" name="cta" value={form.cta} onChange={set("cta")} placeholder="e.g. Call Now, Get a Free Quote" />

            <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "16px 0" }} />

            <Field
              label="Daily Budget (cents — 1000 = $10/day)"
              name="dailyBudget"
              value={form.dailyBudget}
              onChange={set("dailyBudget")}
              placeholder="1000"
              type="number"
            />
            <Field
              label="Image URLs (comma-separated, leave blank for text-only)"
              name="imageUrls"
              value={form.imageUrls}
              onChange={set("imageUrls")}
              placeholder="https://... , https://..."
              multiline
            />
          </Card>

          {/* Client context summary */}
          {intake && (
            <Card title="Client Intake Summary (read-only)">
              <div style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                <strong style={{ color: TEXT }}>Budget preference:</strong> {intake.preferredAdBudget || "Not specified"}{"\n"}
                <strong style={{ color: TEXT }}>FB Page:</strong> {intake.facebookPageUrl || "Not provided"}{"\n"}
                <strong style={{ color: TEXT }}>Website platform:</strong> {intake.websitePlatform || "Not specified"}{"\n"}
                <strong style={{ color: TEXT }}>Website contact:</strong> {intake.websiteLoginOrWebPersonContact || "Not specified"}{"\n"}
                <strong style={{ color: TEXT }}>Best contact:</strong> {intake.bestContactName} — {intake.bestContactEmail}{intake.bestContactPhone ? ` — ${intake.bestContactPhone}` : ""}{"\n"}
                {intake.additionalNotes && <><strong style={{ color: TEXT }}>Notes:</strong> {intake.additionalNotes}</>}
              </div>
            </Card>
          )}

          {/* Launch result */}
          {launchResult && (
            <div style={{ padding: "16px 18px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, marginBottom: 18, fontSize: 14, color: "#15803d" }}>
              <strong>Campaign launched successfully!</strong>
              {launchResult.campaignId && <div style={{ marginTop: 6, fontSize: 13 }}>Campaign ID: {launchResult.campaignId}</div>}
              {launchResult.campaignStatus && <div style={{ fontSize: 13 }}>Status: {launchResult.campaignStatus}</div>}
            </div>
          )}

          {launchError && (
            <div style={{ padding: "14px 18px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, marginBottom: 18, fontSize: 14, color: "#b91c1c" }}>
              <strong>Launch failed:</strong> {launchError}
            </div>
          )}

          {/* Launch button */}
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <button
              type="submit"
              disabled={launching || !fbInfo?.fbConnected || !form.adAccountId}
              style={{
                padding: "13px 32px",
                background: !launching && fbInfo?.fbConnected && form.adAccountId ? "#111827" : "#e5e7eb",
                color: !launching && fbInfo?.fbConnected && form.adAccountId ? "#fff" : "#9ca3af",
                border: "none",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 15,
                cursor: (!launching && fbInfo?.fbConnected && form.adAccountId) ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              {launching ? "Launching…" : "Launch Campaign for Client"}
            </button>

            {!fbInfo?.fbConnected && (
              <span style={{ fontSize: 13, color: "#d97706" }}>
                Facebook must be connected first.
              </span>
            )}
          </div>

          <p style={{ marginTop: 12, fontSize: 12, color: TEXT_SOFT, lineHeight: 1.6 }}>
            This will use <strong>{intake?.businessName || client?.email}'s</strong> connected Facebook ad account to create and launch the campaign. The campaign will appear under their account in Meta Ads Manager.
          </p>
        </form>

      </div>
    </div>
  );
}
