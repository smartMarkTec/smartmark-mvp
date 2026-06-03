/* eslint-disable */
// src/pages/PremiumIntake.js
import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.10)";
const PURPLE = "#5d59ea";

const EMPTY = {
  // Business basics
  businessName: "",
  websiteUrl: "",
  mainPhone: "",
  serviceArea: "",
  mainServices: "",
  callForwardingNumber: "",
  // Campaign strategy
  serviceToPromoteFirst: "",
  targetCities: "",
  idealCustomer: "",
  businessDifferentiator: "",
  customerProblem: "",
  promotionOffer: "",
  seasonalSpecials: "",
  servicesNotToAdvertise: "",
  preferredTone: "",
  preferredAdBudget: "",
  // Website access
  websitePlatform: "",
  websiteLoginOrWebPersonContact: "",
  websiteAccessMethod: "",
  canAddSmartemark: "",
  // Facebook / tracking
  facebookPageUrl: "",
  facebookAdAccountNotes: "",
  currentSpecialOrOffer: "",
  // Contact
  bestContactName: "",
  bestContactEmail: "",
  bestContactPhone: "",
  additionalNotes: "",
};

const STEP1_REQUIRED = ["businessName", "websiteUrl", "mainPhone", "serviceArea", "mainServices"];

function Field({ label, name, placeholder, required, value, onChange, multiline, hint, type }) {
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
            outline: "none", background: "#fafafa", resize: "vertical", boxSizing: "border-box",
          }}
        />
      ) : (
        <input
          type={type || "text"}
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

function SelectField({ label, name, value, onChange, options, hint }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{label}</label>
      {hint && <div style={{ fontSize: 12, color: TEXT_SOFT, marginBottom: 5 }}>{hint}</div>}
      <select
        value={value}
        onChange={onChange}
        style={{
          width: "100%", padding: "10px 12px", border: `1px solid ${BORDER}`,
          borderRadius: 8, fontSize: 14, fontFamily: FONT, color: TEXT,
          outline: "none", background: "#fafafa", boxSizing: "border-box",
        }}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

export default function PremiumIntake() {
  const navigate = useNavigate();
  const location = useLocation();

  const params = new URLSearchParams(location.search);
  const adminClientId = params.get("adminClientId") || "";
  const intakeToken = params.get("token") || "";
  // token mode = customer-facing public link; no login required
  const isTokenMode = !!intakeToken && !adminClientId;

  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState(1);
  const [authorized, setAuthorized] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const step1Valid = STEP1_REQUIRED.every((k) => String(form[k] || "").trim());
  const step3Valid = String(form.bestContactName || "").trim() && String(form.bestContactEmail || "").trim() && authorized;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!step3Valid || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      let url, headers, body;

      if (isTokenMode) {
        // Customer-facing public link — no session needed
        url = "/api/premium-intake/token";
        headers = { "Content-Type": "application/json" };
        body = JSON.stringify({ ...form, token: intakeToken });
      } else {
        const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
        headers = { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) };
        // Admin filling on behalf of client → admin endpoint; otherwise logged-in user endpoint
        url = adminClientId
          ? `/api/admin/clients/${encodeURIComponent(adminClientId)}/premium-intake`
          : "/api/premium-intake";
        body = JSON.stringify(form);
      }

      const r = await fetch(url, { method: "POST", credentials: "include", headers, body });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Submission failed. Please try again.");
      navigate("/premium-intake-complete");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabels = ["Business Info", "Campaign Strategy", "Contact & Auth"];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "32px 16px 80px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          {!isTokenMode && (
            <button
              onClick={() => step === 1 ? navigate("/setup") : setStep(step - 1)}
              style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 16, fontFamily: FONT }}
            >
              ← {step === 1 ? "Back to Dashboard" : "Back"}
            </button>
          )}
          {isTokenMode && step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", padding: 0, marginBottom: 16, fontFamily: FONT }}
            >
              ← Back
            </button>
          )}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(93,89,234,0.08)", color: PURPLE, fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 999, marginBottom: 12, letterSpacing: 0.4 }}>
            Smartemark Premium Setup {adminClientId ? `— Admin Mode` : ""}
          </div>
          <h1 style={{ margin: "0 0 6px", fontSize: "1.55rem", fontWeight: 800, color: TEXT, lineHeight: 1.2 }}>
            {step === 1 ? "Tell us about your business." : step === 2 ? "Campaign strategy." : "Contact & authorization."}
          </h1>
          <p style={{ margin: 0, color: TEXT_SOFT, fontSize: 14, lineHeight: 1.6 }}>
            {step === 1 ? "The basics we need to get started." : step === 2 ? "Help us understand your goals and ideal customers." : "Your contact info and authorization."}
          </p>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 6, marginBottom: 26, alignItems: "center" }}>
          {[1, 2, 3].map((s) => (
            <React.Fragment key={s}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: s <= step ? PURPLE : "#e5e7eb",
                  color: s <= step ? "#fff" : TEXT_SOFT,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>
                  {s}
                </div>
                <div style={{ fontSize: 10, color: s <= step ? PURPLE : TEXT_SOFT, fontWeight: 600, whiteSpace: "nowrap" }}>
                  {stepLabels[s - 1]}
                </div>
              </div>
              {s < 3 && <div style={{ flex: 1, height: 2, background: step > s ? PURPLE : "#e5e7eb", borderRadius: 99, marginBottom: 18 }} />}
            </React.Fragment>
          ))}
        </div>

        {/* ── Step 1: Business Basics ── */}
        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); if (step1Valid) setStep(2); }}>
            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Business Information</div>
              <Field label="Business Name" value={form.businessName} onChange={set("businessName")} placeholder="e.g. Wilks HVAC & Plumbing" required />
              <Field label="Website URL" value={form.websiteUrl} onChange={set("websiteUrl")} placeholder="e.g. https://wilkshvac.com" required />
              <Field label="Main Phone Number" value={form.mainPhone} onChange={set("mainPhone")} placeholder="e.g. (832) 555-0100" required />
              <Field label="Service Area" value={form.serviceArea} onChange={set("serviceArea")} placeholder="e.g. Houston, TX and surrounding suburbs" required />
              <Field label="Main Services" value={form.mainServices} onChange={set("mainServices")} placeholder="e.g. AC repair, furnace installation, duct cleaning" required multiline />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Offers & Budget</div>
              <Field label="Current Special or Offer" value={form.currentSpecialOrOffer} onChange={set("currentSpecialOrOffer")} placeholder="e.g. $89 AC tune-up, free estimate on installs" multiline />
              <Field label="Seasonal Specials / Discounts / Financing / Maintenance Plans" value={form.seasonalSpecials} onChange={set("seasonalSpecials")} placeholder="e.g. Spring tune-up special, 0% financing, annual maintenance plans" multiline hint="Include any limited-time offers, recurring deals, or membership programs." />
              <Field label="Preferred Monthly Ad Budget" value={form.preferredAdBudget} onChange={set("preferredAdBudget")} placeholder="e.g. $300/month" hint="Ad spend is separate from Smartemark's fee." />
              <Field label="Call Forwarding Number" value={form.callForwardingNumber} onChange={set("callForwardingNumber")} placeholder="e.g. (832) 555-0100" hint="The real phone number ad calls should connect to." />
            </div>

            <button type="submit" disabled={!step1Valid} style={{
              width: "100%", padding: "14px", background: step1Valid ? "#111827" : "#e5e7eb",
              color: step1Valid ? "#fff" : "#9ca3af", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: 15, cursor: step1Valid ? "pointer" : "not-allowed", fontFamily: FONT,
            }}>
              Continue →
            </button>
          </form>
        )}

        {/* ── Step 2: Campaign Strategy ── */}
        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); setStep(3); }}>
            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Campaign Focus</div>
              <Field label="What service do you want to promote first?" value={form.serviceToPromoteFirst} onChange={set("serviceToPromoteFirst")} placeholder="e.g. AC repair and tune-ups" />
              <Field label="What cities/areas should we target?" value={form.targetCities} onChange={set("targetCities")} placeholder="e.g. Houston, Katy, Sugar Land, Pearland" />
              <Field label="Who is your ideal customer?" value={form.idealCustomer} onChange={set("idealCustomer")} placeholder="e.g. Homeowners 30–60, families in suburbs, dual-income households" multiline />
              <Field label="What makes your business different from competitors?" value={form.businessDifferentiator} onChange={set("businessDifferentiator")} placeholder="e.g. Same-day service, 20 years experience, licensed & insured, financing available" multiline />
              <Field label="What common problem do customers have before calling you?" value={form.customerProblem} onChange={set("customerProblem")} placeholder="e.g. AC stopped working in summer heat, high energy bills, old unit breaking down" multiline />
              <Field label="What offer or hook should we promote in the ad?" value={form.promotionOffer} onChange={set("promotionOffer")} placeholder="e.g. Free second opinion, $49 diagnostic, no service call fee" multiline hint="This is the main call-to-action in your ad." />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Tone & Restrictions</div>
              <SelectField
                label="Preferred ad tone"
                value={form.preferredTone}
                onChange={set("preferredTone")}
                options={["Professional & trustworthy", "Friendly & approachable", "Urgent / emergency-focused", "Premium / high-end", "Budget-friendly / value-focused", "Local & community-focused"]}
              />
              <Field label="Any services you do NOT want us advertising?" value={form.servicesNotToAdvertise} onChange={set("servicesNotToAdvertise")} placeholder="e.g. Commercial jobs, new construction, out-of-service areas" multiline />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Website Access</div>
              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#0c4a6e", lineHeight: 1.55 }}>
                🔒 <strong>Security note:</strong> Do not paste passwords here. If login access is needed, send it through a secure password manager link, a temporary collaborator invite, or coordinate with William directly.
              </div>
              <SelectField
                label="Website platform"
                value={form.websitePlatform}
                onChange={set("websitePlatform")}
                options={["WordPress", "Wix", "Squarespace", "Shopify", "GoDaddy", "Custom/Other", "Not sure"]}
              />
              <Field label="Who manages your website?" value={form.websiteLoginOrWebPersonContact} onChange={set("websiteLoginOrWebPersonContact")} placeholder="Name / email of your web person, or 'I manage it myself'" />
              <SelectField
                label="How can we install the tracking code?"
                value={form.websiteAccessMethod}
                onChange={set("websiteAccessMethod")}
                options={[
                  "I can add Smartemark as a user/admin",
                  "My web person will install the code",
                  "I need help figuring this out",
                  "I will send access securely (password manager / invite)",
                ]}
                hint="We need to install a small tracking script on your site."
              />
            </div>

            <button type="submit" style={{
              width: "100%", padding: "14px", background: "#111827",
              color: "#fff", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: FONT,
            }}>
              Continue →
            </button>
          </form>
        )}

        {/* ── Step 3: Contact + Auth ── */}
        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Contact Information</div>
              <Field label="Your Name" value={form.bestContactName} onChange={set("bestContactName")} placeholder="Your full name" required />
              <Field label="Your Email" value={form.bestContactEmail} onChange={set("bestContactEmail")} placeholder="Your email address" required type="email" />
              <Field label="Your Phone" value={form.bestContactPhone} onChange={set("bestContactPhone")} placeholder="Best number to reach you" />
            </div>

            <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, padding: "22px 24px", marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: TEXT_SOFT, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 14 }}>Facebook (Optional)</div>
              <Field label="Facebook Page URL" value={form.facebookPageUrl} onChange={set("facebookPageUrl")} placeholder="https://facebook.com/yourbusiness" />
              <Field label="Facebook Ad Account Notes" value={form.facebookAdAccountNotes} onChange={set("facebookAdAccountNotes")} placeholder="Any notes about your Business Manager or ad account" multiline />
              <Field label="Additional Notes" value={form.additionalNotes} onChange={set("additionalNotes")} placeholder="Anything else we should know" multiline />
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

            <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 18px", marginBottom: 22, fontSize: 13, color: "#92400e", lineHeight: 1.6 }}>
              Facebook/Instagram ad spend is separate from Smartemark's monthly fee and is controlled through your connected ad account.
            </div>

            {error && (
              <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 14, marginBottom: 18 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={!step3Valid || submitting} style={{
              width: "100%", padding: "14px", background: step3Valid ? "#111827" : "#e5e7eb",
              color: step3Valid ? "#fff" : "#9ca3af", border: "none", borderRadius: 10,
              fontWeight: 700, fontSize: 15, cursor: step3Valid ? "pointer" : "not-allowed",
              fontFamily: FONT, transition: "background 0.15s",
            }}>
              {submitting ? "Submitting…" : "Submit Setup Information"}
            </button>
            {!isTokenMode && (
              <p style={{ textAlign: "center", marginTop: 12, fontSize: 13, color: TEXT_SOFT }}>
                After submitting, connect your Facebook account from the Dashboard.
              </p>
            )}
          </form>
        )}

      </div>
    </div>
  );
}
