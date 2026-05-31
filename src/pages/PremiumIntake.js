/* eslint-disable */
// src/pages/PremiumIntake.js
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.10)";
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

const STEP1_REQUIRED = ["businessName", "websiteUrl", "mainPhone", "serviceArea", "mainServices"];

function Field({ label, name, placeholder, required, value, onChange, multiline, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>
        {label}
        {required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: 12, color: TEXT_SOFT, marginBottom: 5 }}>{hint}</div>}
      {multiline ? (
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          rows={3}
          style={{
            width: "100%", padding: "10px 12px", border: `1px solid ${BORDER}`,
            borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT,
            resize: "vertical", outline: "none", background: "#fafafa",
            boxSizing: "border-box", lineHeight: 1.5,
          }}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: "100%", padding: "10px 12px", border: `1px solid ${BORDER}`,
            borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT,
            outline: "none", background: "#fafafa", boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

export default function PremiumIntake() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const step1Valid = STEP1_REQUIRED.every((k) => String(form[k] || "").trim());
  const step2Valid =
    String(form.bestContactName || "").trim() &&
    String(form.bestContactEmail || "").trim() &&
    authorized;

  const handleNext = (e) => {
    e.preventDefault();
    if (step1Valid) setStep(2);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!step2Valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const r = await fetch("/api/premium-intake", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(sid ? { "x-sm-sid": sid } : {}),
        },
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
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "32px 16px 80px" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => step === 1 ? navigate("/setup") : setStep(1)}
            style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 18, fontFamily: FONT }}
          >
            ← {step === 1 ? "Back to Dashboard" : "Back"}
          </button>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(93,89,234,0.08)", color: PURPLE, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, marginBottom: 14, letterSpacing: 0.4 }}>
            Smartemark Premium
          </div>
          <h1 style={{ margin: "0 0 8px", fontSize: "1.65rem", fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>
            {step === 1 ? "Tell us about your business." : "Contact & authorization."}
          </h1>
          <p style={{ margin: 0, color: TEXT_SOFT, fontSize: 14.5, lineHeight: 1.6 }}>
            {step === 1
              ? "Fill in the details below so our team can set up your campaigns."
              : "Almost done — add your contact info and authorize Smartemark to manage your ads."}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28, alignItems: "center" }}>
          {[1, 2].map((s) => (
            <React.Fragment key={s}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: s <= step ? PURPLE : "#e5e7eb",
                color: s <= step ? "#fff" : TEXT_SOFT,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}>
                {s}
              </div>
              {s < 2 && <div style={{ flex: 1, height: 2, background: step >= 2 ? PURPLE : "#e5e7eb", borderRadius: 99 }} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── Step 1: Business Info ── */}
        {step === 1 && (
          <form onSubmit={handleNext}>
            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 18 }}>
              <Field label="Business Name" name="businessName" value={form.businessName} onChange={set("businessName")} placeholder="e.g. Wilks HVAC & Plumbing" required />
              <Field label="Website URL" name="websiteUrl" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="e.g. https://wilkshvac.com" required />
              <Field label="Main Phone Number" name="mainPhone" value={form.mainPhone} onChange={set("mainPhone")} placeholder="e.g. (832) 555-0100" required />
              <Field label="Service Area" name="serviceArea" value={form.serviceArea} onChange={set("serviceArea")} placeholder="e.g. Houston, TX and surrounding suburbs" required />
              <Field label="Main Services" name="mainServices" value={form.mainServices} onChange={set("mainServices")} placeholder="e.g. AC repair, furnace installation, duct cleaning" required multiline />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Optional</div>
              <Field label="Current Special or Offer" name="currentSpecialOrOffer" value={form.currentSpecialOrOffer} onChange={set("currentSpecialOrOffer")} placeholder="e.g. $89 AC tune-up, free estimate" multiline />
              <Field label="Preferred Monthly Ad Budget" name="preferredAdBudget" value={form.preferredAdBudget} onChange={set("preferredAdBudget")} placeholder="e.g. $200/month, $500/month" hint="Facebook/Instagram ad spend is separate from Smartemark's fee." />
            </div>

            <button
              type="submit"
              disabled={!step1Valid}
              style={{
                width: "100%", padding: "14px", background: step1Valid ? "#111827" : "#e5e7eb",
                color: step1Valid ? "#fff" : "#9ca3af", border: "none", borderRadius: 10,
                fontWeight: 700, fontSize: 15, cursor: step1Valid ? "pointer" : "not-allowed",
                fontFamily: FONT,
              }}
            >
              Continue →
            </button>
          </form>
        )}

        {/* ── Step 2: Contact + Auth ── */}
        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 18 }}>
              <Field label="Your Name" name="bestContactName" value={form.bestContactName} onChange={set("bestContactName")} placeholder="Your name" required />
              <Field label="Your Email" name="bestContactEmail" value={form.bestContactEmail} onChange={set("bestContactEmail")} placeholder="Your email address" required />
              <Field label="Your Phone" name="bestContactPhone" value={form.bestContactPhone} onChange={set("bestContactPhone")} placeholder="Best number to reach you" />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 18 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Optional</div>
              <Field label="Facebook Page URL" name="facebookPageUrl" value={form.facebookPageUrl} onChange={set("facebookPageUrl")} placeholder="https://facebook.com/yourbusiness" />
              <Field label="Facebook Ad Account Notes" name="facebookAdAccountNotes" value={form.facebookAdAccountNotes} onChange={set("facebookAdAccountNotes")} placeholder="Any notes about your ad account or Business Manager" multiline />
              <Field label="Website Platform" name="websitePlatform" value={form.websitePlatform} onChange={set("websitePlatform")} placeholder="e.g. WordPress, Wix, Squarespace" />
              <Field label="Website Contact" name="websiteLoginOrWebPersonContact" value={form.websiteLoginOrWebPersonContact} onChange={set("websiteLoginOrWebPersonContact")} placeholder="Name/email of person who manages your site, or 'self-managed'" />
              <Field label="Additional Notes" name="additionalNotes" value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Anything else we should know" multiline />
            </div>

            {/* Authorization */}
            <div style={{
              background: "white",
              border: `1.5px solid ${authorized ? "rgba(93,89,234,0.35)" : BORDER}`,
              borderRadius: 12, padding: "18px 22px", marginBottom: 14,
            }}>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={authorized}
                  onChange={(e) => setAuthorized(e.target.checked)}
                  style={{ marginTop: 2, flexShrink: 0, width: 17, height: 17, cursor: "pointer", accentColor: PURPLE }}
                />
                <span style={{ fontSize: 14, color: TEXT, lineHeight: 1.65, fontWeight: 500 }}>
                  I authorize Smartemark to create, launch, monitor, and manage advertising campaigns on my behalf using the information and connected accounts I provide.
                  {" "}<span style={{ color: "#ef4444" }}>*</span>
                </span>
              </label>
            </div>

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 18px", marginBottom: 24, fontSize: 13.5, color: "#92400e", lineHeight: 1.6 }}>
              Facebook/Instagram ad spend is separate from Smartemark's monthly fee and is controlled through your connected ad account.
            </div>

            {error && (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 14, marginBottom: 20 }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!step2Valid}
              style={{
                width: "100%", padding: "14px", background: step2Valid ? "#111827" : "#e5e7eb",
                color: step2Valid ? "#fff" : "#9ca3af", border: "none", borderRadius: 10,
                fontWeight: 700, fontSize: 15, cursor: step2Valid ? "pointer" : "not-allowed",
                fontFamily: FONT, transition: "background 0.15s",
              }}
            >
              {submitting ? "Submitting…" : "Submit Setup Information"}
            </button>
            <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: TEXT_SOFT }}>
              After submitting, connect your Facebook account from the Setup section.
            </p>
          </form>
        )}

      </div>
    </div>
  );
}
