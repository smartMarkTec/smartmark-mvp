/* eslint-disable */
// src/pages/admin/AdminClientDetail.js
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.09)";
const PURPLE = "#5d59ea";

const CHECKLIST_LABELS = {
  intake_completed:          "Intake form completed",
  facebook_connected:        "Facebook ad account connected",
  website_access_received:   "Website access received",
  meta_pixel_setup:          "Meta Pixel set up",
  ga4_setup:                 "Google Analytics 4 set up",
  call_tracking_setup:       "Call tracking set up",
  conversion_tracking_setup: "Conversion tracking set up",
  campaign_created:          "Campaign created",
  campaign_launched:         "Campaign launched",
  monthly_report_sent:       "Monthly performance report sent",
};

function Card({ title, children }) {
  return (
    <div style={{
      background: "white",
      border: `1px solid ${BORDER}`,
      borderRadius: 12,
      padding: "20px 22px",
      marginBottom: 18,
    }}>
      {title && (
        <h3 style={{
          margin: "0 0 16px",
          fontSize: 14,
          fontWeight: 700,
          color: TEXT,
          borderBottom: `1px solid ${BORDER}`,
          paddingBottom: 10,
        }}>
          {title}
        </h3>
      )}
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, color: TEXT, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function adminHeaders(extra) {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  return sid ? { "x-sm-sid": sid, ...(extra || {}) } : { ...(extra || {}) };
}

export default function AdminClientDetail() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [fbInfo, setFbInfo] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/clients/${id}`, { credentials: "include", headers: adminHeaders() });
        if (r.status === 403) { navigate("/setup"); return; }
        const j = await r.json().catch(() => ({}));
        if (!j.ok) throw new Error(j.error || "Failed to load client.");
        setClient(j.client);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  useEffect(() => {
    fetch(`/api/admin/clients/${id}/facebook-info`, { credentials: "include", headers: adminHeaders() })
      .then((r) => r.json().catch(() => ({})))
      .then((j) => { if (j.ok) setFbInfo(j); })
      .catch(() => {});
  }, [id]);

  const toggleChecklist = async (field, currentVal) => {
    if (!client) return;
    setSaving(true);
    setSaveMsg("");
    const newVal = !currentVal;
    try {
      const r = await fetch(`/api/admin/clients/${id}/onboarding-status`, {
        method: "PATCH",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ [field]: newVal }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Save failed.");
      setClient((prev) => ({
        ...prev,
        onboarding: { ...prev.onboarding, [field]: newVal },
      }));
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 2000);
    } catch (err) {
      setSaveMsg("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: TEXT_SOFT }}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: 32 }}>
        <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>
        <button onClick={() => navigate("/admin/clients")} style={{ marginTop: 16, color: PURPLE, background: "none", border: "none", cursor: "pointer", fontSize: 14, fontFamily: FONT }}>
          ← Back to Clients
        </button>
      </div>
    );
  }

  const intake = client?.premiumIntake;
  const onboarding = client?.onboarding || {};
  const metaPixel = client?.metaPixel || null;
  const callTracking = client?.callTracking || null;
  const campaigns = client?.campaigns || [];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Nav */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24, flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/admin/clients")}
            style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", fontFamily: FONT }}
          >
            ← All Clients
          </button>
          <span style={{ color: BORDER, fontSize: 14 }}>|</span>
          <span style={{ fontSize: 14, color: TEXT_SOFT }}>
            {client?.businessName || client?.displayName || client?.email}
          </span>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 4, letterSpacing: 0.4 }}>ADMIN · CLIENT DETAIL</div>
            <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800, color: TEXT }}>
              {intake?.businessName || client?.displayName || client?.email}
            </h1>
            <div style={{ fontSize: 13, color: TEXT_SOFT, marginTop: 4 }}>
              {client?.email} · Plan: <strong>{client?.planKey}</strong>
              {client?.fbConnected && <span style={{ color: "#15803d", marginLeft: 8 }}>● Facebook connected</span>}
              {!client?.fbConnected && <span style={{ color: "#d97706", marginLeft: 8 }}>● Facebook not connected</span>}
            </div>
          </div>
          <button
            onClick={() => navigate(`/form?adminClientId=${encodeURIComponent(id)}`)}
            style={{
              padding: "10px 22px",
              background: PURPLE,
              color: "#fff",
              border: "none",
              borderRadius: 9,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Manage →
          </button>
        </div>

        {/* Onboarding checklist */}
        <Card title="Onboarding Checklist">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            {saveMsg && (
              <span style={{ fontSize: 12, color: saveMsg.startsWith("Save failed") ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
                {saveMsg}
              </span>
            )}
            {saving && <span style={{ fontSize: 12, color: TEXT_SOFT }}>Saving…</span>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {Object.entries(CHECKLIST_LABELS).map(([field, label]) => (
              <label
                key={field}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: onboarding[field] ? "rgba(16,185,129,0.07)" : "#f8f9fc",
                  border: `1px solid ${onboarding[field] ? "rgba(16,185,129,0.25)" : BORDER}`,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: onboarding[field] ? 600 : 400,
                  color: onboarding[field] ? "#065f46" : TEXT_SOFT,
                  transition: "all 0.15s",
                }}
              >
                <input
                  type="checkbox"
                  checked={!!onboarding[field]}
                  onChange={() => toggleChecklist(field, !!onboarding[field])}
                  style={{ width: 15, height: 15, cursor: "pointer", accentColor: "#10b981", flexShrink: 0 }}
                />
                {label}
              </label>
            ))}
          </div>
        </Card>

        {/* Premium Intake */}
        {intake ? (
          <Card title="Premium Intake Answers">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <InfoRow label="Business Name" value={intake.businessName} />
              <InfoRow label="Website" value={intake.websiteUrl} />
              <InfoRow label="Phone" value={intake.mainPhone} />
              <InfoRow label="Service Area" value={intake.serviceArea} />
            </div>
            <InfoRow label="Main Services" value={intake.mainServices} />
            <InfoRow label="Current Special / Offer" value={intake.currentSpecialOrOffer} />
            <InfoRow label="Preferred Ad Budget" value={intake.preferredAdBudget} />
            <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "12px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <InfoRow label="Facebook Page URL" value={intake.facebookPageUrl} />
              <InfoRow label="Facebook Ad Account Notes" value={intake.facebookAdAccountNotes} />
              <InfoRow label="Website Platform" value={intake.websitePlatform} />
              <InfoRow label="Website Contact" value={intake.websiteLoginOrWebPersonContact} />
            </div>
            <hr style={{ border: "none", borderTop: `1px solid ${BORDER}`, margin: "12px 0" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
              <InfoRow label="Contact Name" value={intake.bestContactName} />
              <InfoRow label="Contact Email" value={intake.bestContactEmail} />
              <InfoRow label="Contact Phone" value={intake.bestContactPhone} />
            </div>
            <InfoRow label="Additional Notes" value={intake.additionalNotes} />
            <div style={{ marginTop: 8, fontSize: 12, color: TEXT_SOFT }}>
              Submitted: {intake.submittedAt ? new Date(intake.submittedAt).toLocaleString() : "—"}
            </div>
          </Card>
        ) : (
          <Card title="Premium Intake Answers">
            <p style={{ color: TEXT_SOFT, fontSize: 14, margin: 0 }}>
              This client has not submitted the Premium intake form yet.
            </p>
          </Card>
        )}

        {/* Facebook / Ad Account Info */}
        <Card title="Facebook & Ad Account">
          {!fbInfo ? (
            <p style={{ color: TEXT_SOFT, fontSize: 14, margin: 0 }}>Loading…</p>
          ) : !fbInfo.fbConnected ? (
            <p style={{ color: "#d97706", fontSize: 14, margin: 0 }}>Facebook not connected — client must connect their account.</p>
          ) : (
            <>
              <div style={{ marginBottom: 10, fontSize: 13, color: "#15803d", fontWeight: 700 }}>● Facebook connected</div>
              {fbInfo.fbError && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>FB API error: {fbInfo.fbError}</p>}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Ad Accounts</div>
                {(fbInfo.adAccounts || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: TEXT_SOFT }}>No ad accounts found.</div>
                ) : (fbInfo.adAccounts || []).map((a) => (
                  <div key={a.id} style={{ fontSize: 13, color: TEXT, marginBottom: 2 }}>
                    {a.name || "Unnamed"} <span style={{ color: TEXT_SOFT }}>({a.id})</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Pages</div>
                {(fbInfo.pages || []).length === 0 ? (
                  <div style={{ fontSize: 13, color: TEXT_SOFT }}>No pages found.</div>
                ) : (fbInfo.pages || []).map((p) => (
                  <div key={p.id} style={{ fontSize: 13, color: TEXT, marginBottom: 2 }}>
                    {p.name || "Unnamed"} <span style={{ color: TEXT_SOFT }}>({p.id})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* Meta Pixel */}
        <Card title="Meta Pixel">
          {!metaPixel ? (
            <p style={{ color: TEXT_SOFT, fontSize: 14, margin: 0 }}>No Meta Pixel saved yet.</p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
                <InfoRow label="Pixel ID" value={metaPixel.pixelId} />
                <InfoRow label="Pixel Name" value={metaPixel.pixelName} />
                <InfoRow label="Ad Account" value={metaPixel.adAccountId} />
                <InfoRow
                  label="Status"
                  value={
                    metaPixel.status === "created"
                      ? "Created via Ad Agent"
                      : metaPixel.status === "found_existing"
                      ? "Found (existing)"
                      : metaPixel.status || "—"
                  }
                />
              </div>
              <div style={{ marginTop: 4 }}>
                <InfoRow
                  label="Install Status"
                  value={
                    metaPixel.installStatus === "needs_website_install"
                      ? "⚠ Website install still needed"
                      : metaPixel.installStatus || "—"
                  }
                />
                <InfoRow
                  label="Last Updated"
                  value={
                    metaPixel.lastUpdatedAt
                      ? new Date(metaPixel.lastUpdatedAt).toLocaleString()
                      : "—"
                  }
                />
              </div>
            </>
          )}
        </Card>

        {/* Call Tracking */}
        <Card title="Call Tracking">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            <InfoRow label="Setup Status"      value={callTracking?.setupStatus || "Not set up"} />
            <InfoRow label="Tracked Calls"     value={callTracking?.trackedCalls != null ? String(callTracking.trackedCalls) : "0"} />
            <InfoRow label="Tracking Number"   value={callTracking?.trackingNumber || "Not assigned yet"} />
            <InfoRow label="Forwarding Number" value={callTracking?.forwardingNumber || intake?.callForwardingNumber || "Not added yet"} />
          </div>
          {!callTracking && (
            <p style={{ margin: "8px 0 0", fontSize: 12, color: TEXT_SOFT, lineHeight: 1.5 }}>
              Call tracking setup is pending. A dedicated tracking number will forward to the client's real phone number.
            </p>
          )}
        </Card>

        {/* Campaigns */}
        <Card title={`Campaigns (${campaigns.length})`}>
          {campaigns.length === 0 ? (
            <p style={{ color: TEXT_SOFT, fontSize: 14, margin: 0 }}>No campaigns launched yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {campaigns.map((c, i) => (
                <div
                  key={c.campaignId || i}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: "#f8f9fc",
                    border: `1px solid ${BORDER}`,
                    fontSize: 13,
                  }}
                >
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 4 }}>
                    {c.name || `Campaign ${i + 1}`}
                  </div>
                  <div style={{ color: TEXT_SOFT }}>
                    Status: <strong style={{ color: c.status === "ACTIVE" ? "#15803d" : TEXT_SOFT }}>{c.status || "—"}</strong>
                    {" · "}Account: {c.accountId || "—"}
                    {" · "}Created: {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
