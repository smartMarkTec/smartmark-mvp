/**
 * creativeGeneration.js
 * Shared helpers for ad copy + image generation.
 * Extracted from FormPage.js to be reused by InlineAdAgent.
 *
 * Key contract (matching FormPage exactly):
 *   fetchAdCopy  → returns json.copy || {}   (FormPage line 830)
 *   fetchAdImage → returns first valid URL from urls[] or pngUrl/absoluteUrl/url
 */

function getSid() {
  const s = (localStorage.getItem("sm_sid_v1") || "").trim();
  return s ? { "x-sm-sid": s } : {};
}
function jsonHeaders() {
  return { "Content-Type": "application/json", ...getSid() };
}

/**
 * Build authoritative intake answers from premiumIntake (highest priority)
 * falling back to campaign context DB record.
 * Matches FormPage's buildCurrentIntakeAnswers() logic.
 */
export function buildIntakeAnswers(adminClientInfo, ctx = {}) {
  const pi = adminClientInfo?.premiumIntake || {};
  const piUrl = String(pi.websiteUrl || ctx.websiteUrl || "").trim();
  return {
    businessName:  String(pi.businessName  || ctx.businessName  || "").trim(),
    industry:      String(pi.mainServices  || ctx.industry      || "").trim(),
    offer:         String(pi.currentSpecialOrOffer || ctx.offer  || "").trim(),
    mainBenefit:   String(pi.mainServices  || ctx.mainBenefit   || "").trim(),
    idealCustomer: String(pi.idealCustomer || ctx.idealCustomer || "").trim(),
    serviceArea:   String(pi.serviceArea   || ctx.serviceArea   || "").trim(),
    city:          String((pi.targetCities || "").split(",")[0]?.trim() || ctx.city || "").trim(),
    state:         String(ctx.state || "").trim(),
    phone:         String(pi.mainPhone || pi.bestContactPhone || ctx.phoneNumber || "").trim(),
    cta:           String(ctx.cta || "Learn more").trim(),
    url:           piUrl,
    websiteUrl:    piUrl,
  };
}

/**
 * Normalize ad copy response — handles all possible field shapes.
 * Matches FormPage's normalizeSmartCopy().
 */
export function normalizeAdCopy(raw = {}) {
  return {
    headline:  String(raw.headline  || raw.adHeadline  || raw.title    || "").trim().slice(0, 55),
    body:      String(raw.subline   || raw.body        || raw.adCopy   || raw.description || "").trim(),
    cta:       String(raw.cta       || raw.callToAction || "Learn more").trim(),
    overlay:   String(raw.image_overlay_text || raw.overlay || raw.cta || "Learn more").trim(),
    offer:     String(raw.offer     || "").trim(),
  };
}

/**
 * Fetch ad copy for a given angle.
 * Returns json.copy (the inner object) — matches FormPage line 830.
 */
export async function fetchAdCopy(answers, angle = "") {
  try {
    const r = await fetch("/api/summarize-ad-copy", {
      method: "POST", credentials: "include", headers: jsonHeaders(),
      body: JSON.stringify({ answers, ...(angle ? { angle } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return {};
    return j.copy || {};   // ← matches FormPage exactly
  } catch {
    return {};
  }
}

/**
 * Fetch ad image. Returns the first valid URL.
 * Checks pngUrl, absoluteUrl, urls[0], url, and filename fallback —
 * matching FormPage's handleGenerateStaticAd parsing.
 */
export async function fetchAdImage(answers, copy = {}, angle = "") {
  try {
    const r = await fetch("/api/generate-static-ad", {
      method: "POST", credentials: "include", headers: jsonHeaders(),
      body: JSON.stringify({
        template: "poster_b",
        regenerateToken: `agent-${angle}-${Date.now()}`,
        url: answers.url || "", website: answers.url || "",
        answers: { ...answers },
        copy: {
          headline: copy.headline || "",
          subline:  copy.body     || "",
          cta:      copy.cta      || "Learn more",
        },
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.ok) return null;
    // Match FormPage field priority: pngUrl > absoluteUrl > urls[0] > url > filename
    return d.pngUrl
        || d.absoluteUrl
        || (Array.isArray(d.urls) ? d.urls[0] : null)
        || d.url
        || (d.filename ? `/api/media/${d.filename}` : null)
        || null;
  } catch {
    return null;
  }
}

/**
 * Generate a full creative set: copy + unique image per angle.
 * Returns array of creative objects.
 */
export async function generateCreativeSet(angles, answers, onProgress) {
  const creatives = [];
  for (let i = 0; i < angles.length; i++) {
    const angle = angles[i];
    onProgress?.(angle);
    const rawCopy = await fetchAdCopy(answers, angle.id);
    const copy    = normalizeAdCopy(rawCopy);
    const imgUrl  = await fetchAdImage(answers, copy, angle.id);
    creatives.push({
      id:            `c-${angle.id}-${Date.now()}-${i}`,
      angle:         angle.id,
      angleLabel:    angle.label,
      headline:      copy.headline,
      body:          copy.body,
      cta:           copy.cta,
      imageUrl:      imgUrl || "",
      link:          answers.url || "",
      mediaSelection:"image",
      creativeSource:"ai_agent",
      status:        "draft",
    });
  }
  return creatives;
}

/**
 * Save creative draft to backend.
 */
export async function saveCreativeDraft(adminClientId, draft) {
  const r = await fetch("/api/campaign-context/save-creative-draft", {
    method: "POST", credentials: "include", headers: jsonHeaders(),
    body: JSON.stringify({ adminClientId, creativeDraft: draft }),
  });
  return r.json().catch(() => ({}));
}

/** Parse a budget string like "$3 a day", "5", "$10/day" → number */
export function parseBudget(str) {
  const n = parseFloat(String(str || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Suggest a campaign name from intake */
export function suggestCampaignName(adminClientInfo, ctx, creativeCount) {
  const biz = adminClientInfo?.premiumIntake?.businessName || ctx?.businessName || "Campaign";
  const offer = adminClientInfo?.premiumIntake?.currentSpecialOrOffer || ctx?.offer || "";
  const suffix = creativeCount > 1 ? ` (${creativeCount}-Ad Test)` : "";
  if (offer) return `${biz} — ${offer.slice(0, 30)}${suffix}`.slice(0, 80);
  return `${biz} Traffic Campaign${suffix}`.slice(0, 80);
}
