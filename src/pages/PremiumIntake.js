/* eslint-disable */
// src/pages/PremiumIntake.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.12)";
const PURPLE = "#5d59ea";

const REQUIRED = [
  "businessName",
  "websiteUrl",
  "mainPhone",
  "serviceArea",
  "mainServices",
  "bestContactName",
  "bestContactEmail",
];

const EMPTY = {
  businessName: "",
  websiteUrl: "",
  mainPhone: "",
  serviceArea: "",
  mainServices: "",
  currentSpecialOrOffer: "",
  preferredAdBudget: "",
  facebookPageUrl: "",
  facebookAdAccountNotes: "",
  websitePlatform: "",
  websiteLoginOrWebPersonContact: "",
  bestContactName: "",
  bestContactEmail: "",
  bestContactPhone: "",
  additionalNotes: "",
};

function InputField({ label, name, placeholder, required, value, onChange, multiline }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        style={{
          display: "block",
          fontSize: 13,
          fontWeight: 600,
          color: TEXT,
          marginBottom: 5,
        }}
      >
        {label}
        {required && (
          <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>
        )}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={3}
          style={{
            width: "100%",
            padding: "9px 12px",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: FONT,
            color: TEXT,
            resize: "vertical",
            outline: "none",
            background: "#fafafa",
            boxSizing: "border-box",
            lineHeight: 1.5,
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: "100%",
            padding: "9px 12px",
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            fontSize: 14,
            fontFamily: FONT,
            color: TEXT,
            outline: "none",
            background: "#fafafa",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <h3
      style={{
        margin: "0 0 14px",
        fontSize: 15,
        fontWeight: 700,
        color: TEXT,
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        paddingBottom: 10,
      }}
    >
      {title}
    </h3>
  );
}

export default function PremiumIntake() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit =
    REQUIRED.every((k) => String(form[k] || "").trim()) && authorized && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch("/api/premium-intake", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Submission failed. Please try again.");
      navigate("/premium-intake-complete");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f9fc",
        fontFamily: FONT,
        padding: "32px 16px 80px",
      }}
    >
      <div style={{ maxWidth: 660, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => navigate("/setup")}
            style={{
              background: "none",
              border: "none",
              color: TEXT_SOFT,
              fontSize: 14,
              cursor: "pointer",
              padding: 0,
              marginBottom: 16,
              fontFamily: FONT,
            }}
          >
            ← Back to Dashboard
          </button>
          <div
            style={{
              display: "inline-block",
              background: "rgba(93,89,234,0.08)",
              color: PURPLE,
              fontSize: 12,
              fontWeight: 700,
              padding: "4px 12px",
              borderRadius: 999,
              marginBottom: 12,
              letterSpacing: 0.4,
            }}
          >
            Smartemark Premium
          </div>
          <h1
            style={{
              margin: "0 0 10px",
              fontSize: "1.75rem",
              fontWeight: 800,
              color: TEXT,
              lineHeight: 1.2,
            }}
          >
            Let's get your campaign set up.
          </h1>
          <p style={{ margin: 0, color: TEXT_SOFT, fontSize: 15, lineHeight: 1.65 }}>
            Fill out the information below so our team can create, launch, and manage your
            ads. Fields marked with <span style={{ color: "#ef4444" }}>*</span> are required.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Business Info */}
          <div
            style={{
              background: "white",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 20,
            }}
          >
            <SectionHeader title="Business Information" />
            <InputField
              label="Business Name"
              name="businessName"
              value={form.businessName}
              onChange={set("businessName")}
              placeholder="e.g. Wilks HVAC & Plumbing"
              required
            />
            <InputField
              label="Website URL"
              name="websiteUrl"
              value={form.websiteUrl}
              onChange={set("websiteUrl")}
              placeholder="e.g. https://wilkshvac.com"
              required
            />
            <InputField
              label="Main Phone Number"
              name="mainPhone"
              value={form.mainPhone}
              onChange={set("mainPhone")}
              placeholder="e.g. (832) 555-0100"
              required
            />
            <InputField
              label="Service Area"
              name="serviceArea"
              value={form.serviceArea}
              onChange={set("serviceArea")}
              placeholder="e.g. Houston, TX and surrounding suburbs"
              required
            />
            <InputField
              label="Main Services"
              name="mainServices"
              value={form.mainServices}
              onChange={set("mainServices")}
              placeholder="e.g. AC repair, furnace installation, duct cleaning"
              required
              multiline
            />
            <InputField
              label="Current Special or Offer"
              name="currentSpecialOrOffer"
              value={form.currentSpecialOrOffer}
              onChange={set("currentSpecialOrOffer")}
              placeholder="e.g. $89 AC tune-up, free estimate on new installs"
              multiline
            />
            <InputField
              label="Preferred Monthly Ad Budget"
              name="preferredAdBudget"
              value={form.preferredAdBudget}
              onChange={set("preferredAdBudget")}
              placeholder="e.g. $200/month, $500/month"
            />
          </div>

          {/* Facebook */}
          <div
            style={{
              background: "white",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 20,
            }}
          >
            <SectionHeader title="Facebook & Ad Account" />
            <InputField
              label="Facebook Page URL (if you have one)"
              name="facebookPageUrl"
              value={form.facebookPageUrl}
              onChange={set("facebookPageUrl")}
              placeholder="e.g. https://facebook.com/wilkshvac"
            />
            <InputField
              label="Facebook Ad Account Notes"
              name="facebookAdAccountNotes"
              value={form.facebookAdAccountNotes}
              onChange={set("facebookAdAccountNotes")}
              placeholder="Any notes about your ad account or Business Manager"
              multiline
            />
          </div>

          {/* Website Access */}
          <div
            style={{
              background: "white",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 20,
            }}
          >
            <SectionHeader title="Website Access" />
            <InputField
              label="Website Platform"
              name="websitePlatform"
              value={form.websitePlatform}
              onChange={set("websitePlatform")}
              placeholder="e.g. WordPress, Wix, Squarespace, custom"
            />
            <InputField
              label="Website Contact or Web Person"
              name="websiteLoginOrWebPersonContact"
              value={form.websiteLoginOrWebPersonContact}
              onChange={set("websiteLoginOrWebPersonContact")}
              placeholder="Name/email of person who manages your site, or 'self-managed'"
            />
          </div>

          {/* Contact */}
          <div
            style={{
              background: "white",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: "22px 24px",
              marginBottom: 20,
            }}
          >
            <SectionHeader title="Best Contact" />
            <InputField
              label="Contact Name"
              name="bestContactName"
              value={form.bestContactName}
              onChange={set("bestContactName")}
              placeholder="Your name"
              required
            />
            <InputField
              label="Contact Email"
              name="bestContactEmail"
              value={form.bestContactEmail}
              onChange={set("bestContactEmail")}
              placeholder="Your email address"
              required
            />
            <InputField
              label="Contact Phone"
              name="bestContactPhone"
              value={form.bestContactPhone}
              onChange={set("bestContactPhone")}
              placeholder="Best phone number to reach you"
            />
            <InputField
              label="Additional Notes"
              name="additionalNotes"
              value={form.additionalNotes}
              onChange={set("additionalNotes")}
              placeholder="Anything else we should know"
              multiline
            />
          </div>

          {/* Authorization */}
          <div
            style={{
              background: "white",
              border: `1.5px solid ${authorized ? "rgba(93,89,234,0.35)" : BORDER}`,
              borderRadius: 12,
              padding: "18px 22px",
              marginBottom: 16,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={authorized}
                onChange={(e) => setAuthorized(e.target.checked)}
                style={{
                  marginTop: 2,
                  flexShrink: 0,
                  width: 17,
                  height: 17,
                  cursor: "pointer",
                  accentColor: PURPLE,
                }}
              />
              <span style={{ fontSize: 14, color: TEXT, lineHeight: 1.65, fontWeight: 500 }}>
                I authorize Smartemark to create, launch, monitor, and manage advertising
                campaigns on my behalf using the information and connected accounts I
                provide.{" "}
                <span style={{ color: "#ef4444" }}>*</span>
              </span>
            </label>
          </div>

          {/* Ad spend note */}
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: 10,
              padding: "13px 18px",
              marginBottom: 24,
              fontSize: 13.5,
              color: "#92400e",
              lineHeight: 1.6,
            }}
          >
            <strong>Note:</strong> Facebook/Instagram ad spend is separate from
            Smartemark's monthly fee and is controlled through your connected ad account.
            You set your own daily or monthly budget.
          </div>

          {/* Error */}
          {error && (
            <div
              style={{
                padding: "12px 16px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 8,
                color: "#b91c1c",
                fontSize: 14,
                marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "14px",
              background: canSubmit ? "#111827" : "#e5e7eb",
              color: canSubmit ? "#fff" : "#9ca3af",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 16,
              cursor: canSubmit ? "pointer" : "not-allowed",
              fontFamily: FONT,
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Submitting…" : "Submit Setup Information"}
          </button>

          <p
            style={{
              textAlign: "center",
              marginTop: 14,
              fontSize: 13,
              color: TEXT_SOFT,
            }}
          >
            After submitting, you can connect your Facebook account from the Setup section.
          </p>
        </form>
      </div>
    </div>
  );
}
