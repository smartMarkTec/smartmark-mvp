// src/pages/Agreement.js
import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const BG   = "#1a1c20";
const CARD = "#23262b";
const GREEN = "#1ec885";
const WHITE = "#ffffff";
const GRAY  = "#9ca3af";
const FONT  = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SM_SID_KEY = "sm_sid_v1";

function getSid() {
  try { return (localStorage.getItem(SM_SID_KEY) || "").trim(); } catch { return ""; }
}

function smFetch(path, opts = {}) {
  const sid = getSid();
  return fetch(path, {
    ...opts,
    credentials: "include",
    headers: { ...(opts.headers || {}), "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
  });
}

const PLAN_LABEL = { base: "Base", deluxe: "Deluxe", premium: "Premium", operator: "Premium", starter: "Base", pro: "Deluxe" };
const VARIANT_LABEL = { high_ticket_test: "Growth Plan Pricing", normal: "Standard Pricing" };
const PLAN_REDIRECT = { premium: "/premium-intake", operator: "/premium-intake" };

function fmt(date) {
  return new Date(date || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function buildAgreementText({ businessName, planLabel, monthlyPrice, variantLabel, signerName, signerTitle, signerEmail, signature, date }) {
  const bn    = businessName || "[CLIENT BUSINESS NAME]";
  const sn    = signerName   || "[AUTHORIZED REPRESENTATIVE NAME]";
  const title = signerTitle  || "[TITLE]";
  const email = signerEmail  || "[EMAIL]";
  const sig   = signature    || "[ELECTRONIC SIGNATURE]";
  const d     = date         || fmt(Date.now());
  const price = monthlyPrice > 0 ? `$${monthlyPrice.toLocaleString()}` : "[MONTHLY PRICE]";
  const plan  = planLabel    || "[PLAN NAME]";
  const pv    = variantLabel || "Standard Pricing";

  return `SMARTEMARK MARKETING SERVICES AGREEMENT

This AGREEMENT between ${bn}, hereinafter referred to as "CLIENT," and William Knowles d/b/a Smartemark, hereinafter referred to as "INDEPENDENT CONTRACTOR," is entered into and shall commence on ${d}.

Smartemark business contact:
William Knowles d/b/a Smartemark
66 Mill Point Place
Texas
Email: knowlesw34@gmail.com

1. TERM OF AGREEMENT

This agreement will be effective on ${d} and will continue on a recurring 30-day service period unless terminated in accordance with the provisions of this agreement.

Each paid monthly service cycle covers a 30-day period of services rendered by Smartemark.

2. INDEPENDENT CONTRACTOR STATUS

It is the express intention of the parties involved that Smartemark is an independent contractor and not an employee of CLIENT.

This agreement does not create an employee relationship, partnership, joint venture, or agency relationship between CLIENT and Smartemark.

Smartemark is responsible for choosing the methods, details, tools, and means used to perform the services described in this agreement.

3. SERVICES TO BE RENDERED BY SMARTEMARK

Smartemark has agreed to perform marketing and advertising services for CLIENT as stated in the Description of Services attached below.

Smartemark helps local service businesses create, launch, monitor, and improve Facebook and Instagram advertising campaigns with the support of Smartemark software, AI-assisted campaign tools, and, depending on the plan selected, Smartemark team support.

The purpose of the service is to help CLIENT promote services or specials, build more local visibility, and create more opportunities for calls and bookings.

4. METHODS FOR PERFORMANCE

Smartemark, being an independent contractor, is free to choose the methods, details, systems, software, and means of performing the services.

Smartemark may use internal team members, contractors, software tools, AI systems, third-party platforms, Meta/Facebook/Instagram tools, and other reasonable business resources to perform the services.

Smartemark may perform the services remotely and at such times as Smartemark determines are reasonable for completion of the service.

5. COMPENSATION FOR SERVICES RENDERED

CLIENT agrees to pay Smartemark the monthly service fee selected at checkout.

Selected plan: ${plan}

Monthly service fee: ${price} per month

Pricing version: ${pv}

Billing cycle: Monthly

The agreement will commence upon completion of the first monthly service fee payment paid in full.

CLIENT understands that the monthly service fee paid to Smartemark is separate from any advertising spend paid to Meta, Facebook, Instagram, or any other advertising platform.

Recommended ad spend may vary depending on CLIENT's goals, market, service area, offer, and campaign testing needs.

CLIENT is responsible for funding advertising spend directly through the appropriate advertising platform or approved payment method.

Should either party require any change to the payment schedule, service fee, plan level, or service scope, such change must be made in writing and agreed to by both parties.

6. MODIFICATION OF SERVICES

Changes to the original services agreed upon will require a written amendment to this agreement.

If CLIENT requests additional work, additional revisions, additional campaigns, additional services, additional strategy sessions, website work, landing page work, copywriting, creative work, funnel work, or any work outside the original scope, additional fees may apply.

Verbal agreements will not supersede this written agreement.

All changes must be written and acknowledged by both parties.

The most current written agreement or written amendment will supersede any prior agreement regarding the same subject matter.

7. CLIENT OBLIGATIONS

CLIENT must provide all relevant details, access, assets, approvals, and information necessary for Smartemark to perform the services.

CLIENT may be required to provide:
- Business name
- Website URL
- Service area
- Main services
- Current specials or offers
- Business phone number
- Business email
- Facebook page access
- Instagram page access
- Meta Business Manager access
- Meta ad account access
- Meta Pixel or Events Manager access, if available
- Website or landing page information
- Photos, videos, logos, or brand assets
- Approval for campaign copy, creative, budget, and offer
- Any other information reasonably needed to create, launch, or manage campaigns

CLIENT agrees to provide clear instructions and information and to respond to reasonable requests for approval or clarification.

If CLIENT delays providing access, information, approval, ad spend, payment, or required assets, CLIENT understands that campaign launch, campaign performance, reporting, or service delivery may be delayed.

Smartemark is not responsible for delays caused by CLIENT's failure to provide timely access, assets, payment, ad spend, approvals, or required information.

8. ADMINISTRATIVE ACCESS AND PLATFORM RIGHTS

CLIENT authorizes Smartemark to access and use certain social media, advertising, analytics, and business accounts only for the purpose of planning, creating, launching, monitoring, and improving CLIENT's marketing and advertising campaigns.

This may include access to:
- Facebook Page
- Instagram account
- Meta Business Manager
- Meta ad account
- Meta Pixel or Events Manager, if available
- Website analytics, if provided
- Landing page or website platform, if provided
- Other related marketing assets approved by CLIENT

CLIENT retains ownership of CLIENT's accounts.

CLIENT may revoke access at any time, but CLIENT understands that revoking access may prevent Smartemark from performing the services.

Upon termination of this agreement, Smartemark will discontinue using administrative access granted by CLIENT.

Smartemark should be added through official admin/user access methods whenever possible. CLIENT should avoid sending passwords unless there is no other reasonable access method available.

9. TERMINATION AT DISCRETION OF PARTIES

This agreement may be terminated for the following reasons:

a. Termination by CLIENT for default by Smartemark after Smartemark fails to respond to written notice of default and demand to perform.

b. Termination by Smartemark for breach by CLIENT after CLIENT fails to respond to written notice of breach and request to cure.

c. Termination for failure to meet the agreed payment schedule.

d. Termination by CLIENT by providing written notice of cancellation before the next billing cycle, subject to the terms of this agreement.

e. Termination by Smartemark if CLIENT refuses to provide required access, assets, approvals, payment, ad spend, or cooperation necessary to perform the services.

10. PAYMENT, CANCELLATION, AND REFUND POLICY

CLIENT understands that Smartemark provides intangible marketing services, software-supported campaign creation, strategy, campaign monitoring, campaign optimization, reporting, and related marketing work.

Once a monthly service fee is paid, that payment covers the current 30-day service period.

Once invoice is paid, buyer agrees that there are no cancellations, returns, or refunds for the current service period because of the nature of services rendered.

CLIENT may cancel future billing by providing written notice before the next monthly billing date.

Cancellation stops future service periods. Cancellation does not refund a service period that has already been paid.

Smartemark does not guarantee a specific number of calls, bookings, leads, sales, revenue, return on ad spend, or business growth.

Marketing performance depends on many factors, including but not limited to market demand, service area, offer strength, ad budget, competition, seasonality, client reputation, website quality, landing page quality, response speed, sales process, and other outside variables.

Smartemark's role is to create, launch, monitor, test, and improve campaigns based on available data and the service level selected by CLIENT.

11. NO GUARANTEE OF RESULTS

CLIENT understands that advertising and marketing involve testing, data collection, campaign adjustments, and market response.

Smartemark does not promise or guarantee specific financial outcomes.

Smartemark does not guarantee that CLIENT will receive a specific number of calls, bookings, leads, customers, sales, or revenue.

Smartemark will perform services in a professional manner according to standard marketing practices and will use reasonable efforts to improve campaign direction based on available data.

12. DESCRIPTION OF SERVICES TO BE RENDERED

The selected service package for CLIENT is:

${plan} for ${bn}

Monthly service fee: ${price}

Service period: 30-day recurring monthly service agreement

Purpose:

The purpose of Smartemark's service is to help CLIENT promote services or specials, build more local visibility, and create more opportunities for calls and bookings through Facebook and Instagram advertising.

Scope of Work:

Depending on the selected plan, Smartemark may provide the following services:
- Campaign setup support
- Campaign intake review
- Business and offer review
- Facebook and Instagram ad campaign creation
- AI-assisted ad copy generation
- AI-assisted creative direction
- Image or video ad support, depending on available assets and plan level
- Campaign launch support
- Campaign monitoring
- Campaign reporting
- Campaign observations
- Campaign recommendations
- Campaign optimization support
- Testing of different ad angles, offers, copy, or creatives when appropriate
- Monthly performance summary
- Client-friendly explanation of campaign results
- Strategy recommendations based on available data

Premium Plan Additional Support:

If CLIENT is on the Premium plan, Smartemark may also provide more hands-on campaign operation and support, including:
- More direct team involvement
- Campaign setup assistance
- Campaign monitoring
- Campaign improvement recommendations
- Campaign adjustments when appropriate
- Monthly reporting
- Ongoing review of campaign bottlenecks
- Support with identifying what should be tested next

Not Included Unless Separately Agreed In Writing:
- Website redesign
- Full landing page buildout
- SEO services
- Google Ads, TikTok Ads, YouTube Ads
- Email marketing, CRM setup
- Sales team management, call center services
- Reputation management, review generation
- Social media posting, organic content management
- Unlimited revisions or unlimited creative production
- Guaranteed leads, calls, sales, or revenue

Any additional services must be added through a written amendment, updated agreement, or separate invoice.

13. CAMPAIGN APPROVAL

Before campaign launch, Smartemark may request CLIENT approval of campaign details such as: campaign objective, service area, budget, offer or special, ad copy, ad creative, destination URL, call-to-action, and business information.

CLIENT understands that once campaign materials are approved and launched, any changes requested after approval may require additional time and may be considered out of scope depending on the request.

14. AD SPEND

CLIENT understands that Meta/Facebook/Instagram advertising spend is separate from Smartemark's monthly service fee.

CLIENT is responsible for providing, approving, and maintaining ad spend.

Campaign performance may be limited if ad spend is too low, paused, declined, interrupted, or unavailable.

Smartemark is not responsible for issues caused by declined payments, insufficient ad spend, ad account restrictions, Meta policy reviews, platform outages, account bans, or third-party platform issues outside of Smartemark's control.

15. PLATFORM AND THIRD-PARTY LIMITATIONS

CLIENT understands that Smartemark may rely on third-party platforms, including but not limited to Meta, Facebook, Instagram, Stripe, website platforms, analytics tools, and AI tools.

Smartemark is not responsible for delays, outages, rejections, restrictions, account issues, policy reviews, inaccurate reporting, or technical problems caused by third-party platforms.

16. CLIENT RESPONSIBILITY FOR SALES AND FOLLOW-UP

CLIENT understands that advertising can help create visibility and opportunities, but CLIENT is responsible for answering calls, following up with leads, booking jobs, closing customers, and delivering services.

Smartemark is not responsible for missed calls, poor phone handling, slow follow-up, weak sales process, unavailable staff, poor customer service, or failure to convert opportunities into revenue.

17. GENERAL PROVISIONS

All work will be completed in a professional manner according to standard practices.

Any alteration or deviation from the original scope involving extra costs will be executed only upon written approval and may become an extra charge over and above the original agreement.

Smartemark may use work produced, campaign results, screenshots, statistics, testimonials, or general project outcomes as part of Smartemark's portfolio, marketing, case studies, or future references, unless CLIENT requests otherwise in writing.

Smartemark will not disclose CLIENT's private login information, financial information, or confidential business information except as reasonably needed to perform the services or as required by law.

18. CONFIDENTIALITY

Smartemark agrees not to disclose confidential information obtained from CLIENT except as authorized by CLIENT or as required to perform the services.

Confidential information may include private business information, account access information, marketing strategy, financial information, customer information, and other private data.

This confidentiality obligation survives termination of this agreement.

19. OWNERSHIP OF WORK PRODUCT

CLIENT retains ownership of CLIENT's business, brand, accounts, website, ad account, pages, and original materials provided by CLIENT.

Smartemark retains ownership of Smartemark software, systems, internal processes, AI tools, templates, campaign frameworks, workflows, strategy documents, and proprietary methods used to perform the services.

Ad copy, campaign assets, reports, and materials created specifically for CLIENT may be used by CLIENT for CLIENT's business while CLIENT remains in good standing.

20. COMPLIANCE WITH LAWS AND PLATFORM POLICIES

Both parties agree to comply with applicable laws and platform policies.

CLIENT agrees that any claims, offers, promotions, discounts, prices, guarantees, testimonials, licenses, certifications, or representations provided to Smartemark are accurate and lawful.

Smartemark may refuse to run ads or marketing content that Smartemark believes may violate platform policies, advertising rules, legal requirements, or ethical business practices.

21. LIMITATION OF LIABILITY

To the maximum extent permitted by law, Smartemark shall not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages arising out of this agreement.

Smartemark's total liability under this agreement shall not exceed the amount paid by CLIENT to Smartemark for the most recent monthly service period.

22. ENTIRE AGREEMENT

This agreement represents the entire agreement between the parties and supersedes all prior oral or written agreements relating to the same subject matter.

No verbal agreement will modify this agreement.

Any modification must be made in writing and acknowledged by both parties.

23. GOVERNING LAW

This agreement shall be governed by the laws of the State of Texas.

24. ACCEPTANCE

By signing below, CLIENT acknowledges that CLIENT has read, understands, and agrees to the terms of this agreement.

CLIENT also acknowledges that Smartemark does not guarantee specific calls, leads, bookings, sales, revenue, or profit.

CLIENT agrees that Smartemark's services are intangible marketing services and that once a monthly service period has been paid, the payment is non-refundable for that service period.

CLIENT:

Business Name: ${bn}

Authorized Representative: ${sn}

Title: ${title}

Email: ${email}

Electronic Signature: ${sig}

Date: ${d}

SMARTEMARK:

William Knowles d/b/a Smartemark

By: William Knowles

Email: knowlesw34@gmail.com

END OF AGREEMENT`;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%",
  background: "#2a2d33",
  border: "1px solid #3a3d45",
  borderRadius: 8,
  padding: "11px 14px",
  color: WHITE,
  fontSize: 14,
  fontFamily: FONT,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: GRAY,
  marginBottom: 6,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Agreement() {
  const navigate = useNavigate();

  const [loading, setLoading]       = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr]               = useState("");
  const [expanded, setExpanded]     = useState(false);

  // Billing data from server
  const [planLabel, setPlanLabel]         = useState("");
  const [monthlyPrice, setMonthlyPrice]   = useState(0);
  const [variantLabel, setVariantLabel]   = useState("Standard Pricing");
  const [planKey, setPlanKey]             = useState("");
  const [stripeCustomerId, setStripeCustomerId]         = useState("");
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState("");
  const [stripePriceId, setStripePriceId]               = useState("");
  const [pricingVariant, setPricingVariant]             = useState("normal");

  // Form fields
  const [businessName,        setBusinessName]        = useState("");
  const [signerName,          setSignerName]          = useState("");
  const [signerTitle,         setSignerTitle]         = useState("");
  const [signerEmail,         setSignerEmail]         = useState("");
  const [electronicSignature, setElectronicSignature] = useState("");
  const [checked,             setChecked]             = useState(false);

  const today = fmt(Date.now());

  const canSubmit =
    businessName.trim() &&
    signerName.trim() &&
    signerEmail.trim() &&
    electronicSignature.trim() &&
    checked &&
    !submitting;

  // ── On mount: check status ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res  = await smFetch("/api/agreement/status");
        const json = await res.json().catch(() => ({}));

        if (!json?.ok) {
          navigate("/pricing", { replace: true });
          return;
        }
        if (!json.hasAccess) {
          navigate("/pricing", { replace: true });
          return;
        }
        // Already signed — skip ahead
        if (json.signed) {
          navigate(PLAN_REDIRECT[json.planKey] || "/setup", { replace: true });
          return;
        }

        setPlanLabel(json.planLabel         || "Base");
        setMonthlyPrice(Number(json.monthlyPrice || 0));
        setVariantLabel(json.variantLabel   || "Standard Pricing");
        setPlanKey(json.planKey             || "");
        setPricingVariant(json.pricingVariant || "normal");
        setStripeCustomerId(json.stripeCustomerId     || "");
        setStripeSubscriptionId(json.stripeSubscriptionId || "");
        setStripePriceId(json.stripePriceId           || "");
      } catch {
        navigate("/pricing", { replace: true });
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate]);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setErr("");

    const snapshot = buildAgreementText({
      businessName,
      planLabel,
      monthlyPrice,
      variantLabel,
      signerName,
      signerTitle,
      signerEmail,
      signature: electronicSignature,
      date: today,
    });

    try {
      const res  = await smFetch("/api/agreement/accept", {
        method: "POST",
        body: JSON.stringify({
          businessName,
          signerName,
          signerTitle,
          signerEmail,
          electronicSignature,
          checkboxAccepted: true,
          agreementVersion: "smartemark_msa_v1",
          agreementTextSnapshot: snapshot,
          selectedPlan:         planKey,
          monthlyPrice,
          pricingVariant,
          stripeCustomerId,
          stripeSubscriptionId,
          stripePriceId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json?.ok) {
        setErr(json?.error || "Could not save agreement. Please try again.");
        return;
      }
      navigate(PLAN_REDIRECT[planKey] || "/setup", { replace: true });
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, businessName, planLabel, monthlyPrice, variantLabel, signerName, signerTitle, signerEmail, electronicSignature, today, planKey, pricingVariant, stripeCustomerId, stripeSubscriptionId, stripePriceId, navigate]);

  // ── Preview text for the scrollable box ────────────────────────────────────
  const previewText = buildAgreementText({
    businessName: businessName || "[CLIENT BUSINESS NAME]",
    planLabel,
    monthlyPrice,
    variantLabel,
    signerName:          signerName          || "[AUTHORIZED REPRESENTATIVE NAME]",
    signerTitle:         signerTitle         || "[TITLE]",
    signerEmail:         signerEmail         || "[EMAIL]",
    signature:           electronicSignature || "[ELECTRONIC SIGNATURE]",
    date: today,
  });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT }}>
        <div style={{ color: GRAY, fontSize: 14 }}>Loading agreement…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: FONT, color: WHITE, padding: "32px 16px 64px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, textAlign: "center" }}>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 8 }}>Step 1 of 2</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.5px" }}>
            Smartemark Marketing Services Agreement
          </h1>
          <div style={{ fontSize: 13, color: GRAY }}>Review and sign before accessing your account.</div>
        </div>

        {/* Plan badge */}
        <div style={{
          background: "#1e2940",
          border: "1px solid #2a3a5c",
          borderRadius: 12,
          padding: "14px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>
              Your Selected Plan
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: WHITE }}>
              {planLabel} — ${monthlyPrice.toLocaleString()}/month
            </div>
          </div>
          <div style={{ fontSize: 12, color: GRAY }}>{variantLabel}</div>
        </div>

        {/* Agreement box */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: GRAY, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Agreement Text
            </div>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              style={{ background: "none", border: "none", color: GREEN, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              {expanded ? "Collapse" : "Expand Agreement"}
            </button>
          </div>
          <div style={{
            background: "#16181d",
            border: "1px solid #2e3138",
            borderRadius: 10,
            padding: "16px 18px",
            height: expanded ? "auto" : 320,
            overflowY: "auto",
            fontFamily: "monospace",
            fontSize: 12,
            lineHeight: 1.75,
            color: "#d1d5db",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>
            {previewText}
          </div>
          {!expanded && (
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 11, color: GRAY }}>
              Scroll to read the full agreement, or click "Expand Agreement" above.
            </div>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 18 }}>

          <div style={{ background: CARD, borderRadius: 14, padding: "24px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: WHITE, marginBottom: 4 }}>Client Information</div>

            <div>
              <label style={labelStyle}>Business Name *</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Your business DBA or legal name"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={labelStyle}>Authorized Representative Name *</label>
                <input
                  type="text"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  placeholder="Full legal name"
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  type="text"
                  value={signerTitle}
                  onChange={(e) => setSignerTitle(e.target.value)}
                  placeholder="Owner, CEO, etc."
                  style={inputStyle}
                />
              </div>
            </div>

            <div>
              <label style={labelStyle}>Email Address *</label>
              <input
                type="email"
                value={signerEmail}
                onChange={(e) => setSignerEmail(e.target.value)}
                placeholder="your@email.com"
                required
                style={inputStyle}
              />
            </div>
          </div>

          {/* Checkbox */}
          <label style={{
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            cursor: "pointer",
            background: CARD,
            borderRadius: 12,
            padding: "16px 18px",
            border: checked ? `1px solid ${GREEN}` : "1px solid #3a3d45",
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              style={{ marginTop: 2, width: 17, height: 17, accentColor: GREEN, flexShrink: 0, cursor: "pointer" }}
            />
            <span style={{ fontSize: 13, color: "#d1d5db", lineHeight: 1.6 }}>
              By checking this box and typing my name below, I agree that I have read and accepted the Smartemark Marketing Services Agreement. I understand that typing my name below acts as my electronic signature.
            </span>
          </label>

          {/* Electronic signature */}
          <div style={{ background: CARD, borderRadius: 14, padding: "20px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ ...labelStyle, fontSize: 13, textTransform: "none", color: WHITE }}>
              Type your full legal name to sign electronically *
            </label>
            <input
              type="text"
              value={electronicSignature}
              onChange={(e) => setElectronicSignature(e.target.value)}
              placeholder="Full legal name"
              required
              style={{ ...inputStyle, fontSize: 18, fontFamily: "Georgia, serif", borderColor: electronicSignature ? GREEN : "#3a3d45" }}
            />
            {electronicSignature && (
              <div style={{ fontSize: 11, color: GRAY }}>
                Signed as: <em style={{ color: WHITE }}>{electronicSignature}</em> — {today}
              </div>
            )}
          </div>

          {/* Error */}
          {err && (
            <div style={{ background: "#2d1515", border: "1px solid #7f1d1d", borderRadius: 8, padding: "12px 16px", color: "#fca5a5", fontSize: 13 }}>
              {err}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              background: canSubmit ? GREEN : "#2a2d33",
              color: canSubmit ? "#000" : GRAY,
              border: "none",
              borderRadius: 12,
              padding: "16px 24px",
              fontSize: 16,
              fontWeight: 800,
              cursor: canSubmit ? "pointer" : "not-allowed",
              letterSpacing: "0.02em",
              transition: "background 0.15s",
            }}
          >
            {submitting ? "Saving…" : "I Agree & Continue to Intake"}
          </button>

          <div style={{ fontSize: 11, color: GRAY, textAlign: "center", lineHeight: 1.6 }}>
            This electronic signature is legally binding. Smartemark is William Knowles d/b/a Smartemark, 66 Mill Point Place, Texas.
          </div>
        </form>
      </div>
    </div>
  );
}
