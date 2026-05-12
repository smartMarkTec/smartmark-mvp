// server/routes/gpt.js
/* eslint-disable */
const express = require("express");
const router = express.Router();
const OpenAI = require("openai"); // npm i openai

// Use your existing security middleware names
const { secureHeaders, basicRateLimit, basicAuth } = require("../middleware/security");

// ---------- Minimal, safe OpenAI client ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------- Global, minimal hardening for this router ----------
router.use(secureHeaders());
router.use(basicAuth());

// ---------- Per-route rate limits (MVP) ----------
const limitChat = basicRateLimit({ windowMs: 60 * 1000, max: 30 });
const limitSubline = basicRateLimit({ windowMs: 60 * 1000, max: 40 });
const limitSummarize = basicRateLimit({ windowMs: 60 * 1000, max: 40 });

// ---------- Small helpers shared by routes ----------
const FALLBACK_CHAT =
  "I’m your AI Ad Manager—share your goal and I’ll suggest a clear next move.";

const STOP = new Set(["and","or","the","a","an","of","to","in","on","with","for","by","your","you","is","are","at"]);
const ENDSTOP = new Set(["and","with","for","to","of","in","on","at","by"]);

function sentenceCase(s = "") {
  s = String(s).toLowerCase().replace(/\s+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
function clean(s = "") {
  return String(s)
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s'-]/g, " ")
    .replace(/\b(best|premium|luxury|#1|guarantee|perfect|revolutionary|magic|cheap|fastest|ultimate|our|we)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function trimEndStops(arr) {
  while (arr.length && ENDSTOP.has(arr[arr.length - 1])) arr.pop();
  return arr;
}
function takeTerms(src = "", max = 3) {
  const words = clean(src).split(" ").filter(Boolean).filter(w => !STOP.has(w));
  return words.slice(0, Math.max(1, Math.min(max, words.length)));
}
function ensure7to9Words(line = "") {
  let words = clean(line).split(" ").filter(Boolean);
  const tails = [
    ["every","day"],
    ["made","simple"],
    ["with","less","hassle"],
    ["for","busy","days"],
    ["built","to","last"]
  ];
  while (words.length > 9) words.pop();
  words = trimEndStops(words);
  while (words.length < 7) {
    const tail = tails[Math.floor(3 * Math.random()) % tails.length];
    for (const w of tail) if (words.length < 9) words.push(w);
    words = trimEndStops(words);
  }
  return sentenceCase(words.join(" "));
}

// ---------- Chat alignment guards ----------
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-12);
}
function userAllowsAssistantQuestions(userMsg = "") {
  const s = String(userMsg || "").toLowerCase();
  return /\b(next|what next|next step|steps|what should i do|what do i do|guide me|walk me through|help me decide|ask me|questions)\b/.test(s);
}
function stripQuestionsIfNotAllowed(reply = "", allowed = false) {
  let out = String(reply || "").replace(/\s+/g, " ").trim();
  if (!out) return FALLBACK_CHAT;
  const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  out = parts.slice(0, 3).join(" ").trim();
  if (allowed) return out;
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  const filtered = sentences.filter(s => !s.includes("?"));
  out = (filtered.length ? filtered.join(" ") : "").trim();
  out = out.replace(/\?/g, "").trim();
  if (!out) return "I can help with targeting, creatives, and budgets—share your goal and I’ll recommend a clear next move.";
  out = out.replace(/[:\-–—]\s*$/g, "").trim();
  return out || FALLBACK_CHAT;
}

// ---------- Route: chat ----------
router.post("/gpt-chat", limitChat, async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Please provide a message." });
  }

  const trimmedHistory = normalizeHistory(history);
  const allowQuestions = userAllowsAssistantQuestions(message);

  const messages = [
    {
      role: "system",
      content:
        "You are SmartMark, a concise AI Ad Manager. " +
        "You ONLY respond to the user's message and never initiate onboarding or survey questions. " +
        "The UI handles business name, budget, industry, etc. " +
        "Do not ask questions unless the user explicitly asked for next steps or guidance. " +
        "Keep replies 1–3 sentences. " +
        "If the user is off-topic, be helpful but brief."
    },
    ...trimmedHistory,
    { role: "user", content: message.slice(0, 2000) }
  ];

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.4,
      max_tokens: 220
    });

    let reply = completion.choices?.[0]?.message?.content?.trim() || FALLBACK_CHAT;
    reply = stripQuestionsIfNotAllowed(reply, allowQuestions);

    if (completion.usage) {
      console.log(
        "[SmartMark GPT] tokens:",
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
        completion.usage.total_tokens
      );
    }
    return res.json({ reply });
  } catch (err) {
    console.error("GPT error:", err?.message || err);
    return res.json({ reply: FALLBACK_CHAT });
  }
});

// ---------- coherent multi-sentence subline generator (28–60 words) ----------
router.post("/coherent-subline", limitSubline, async (req, res) => {
  const { answers = {}, category = "generic" } = req.body || {};

  const productTerms = takeTerms(answers.productType || answers.topic || answers.title || "");
  const benefitTerms = takeTerms(answers.mainBenefit || answers.description || "");
  const audienceTerms = takeTerms(answers.audience || answers.target || answers.customer || "", 2);
  const locationTerm = takeTerms(answers.location || answers.city || answers.region || "", 1)[0] || "";

  let productHead = productTerms[0] || "";
  if ((category || "").toLowerCase() === "fashion") {
    if (!/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear/i.test(productHead)) {
      productHead = "fashion";
    }
  }
  if (productHead === "quality") productHead = "products";

  const stripQuotes = (s = "") => String(s || "").replace(/^["'""‘’\s]+|["'""‘’\s]+$/g, "").trim();

  const normalizeSpaces = (s = "") => String(s || "").replace(/\s+/g, " ").trim();

  const wordCount = (s = "") => normalizeSpaces(s).split(/\s+/).filter(Boolean).length;

  const enforceSublineLen = (s = "") => {
    s = stripWeOur(stripQuotes(s));
    s = s.replace(/["""']/g, "").trim();
    s = normalizeSpaces(s);

    // Trim to max 60 words
    let words = s.split(/\s+/).filter(Boolean);
    if (words.length > 60) words = words.slice(0, 60);

    let out = words.join(" ").trim();

    // Ensure it ends cleanly
    if (out && !/[.!?]$/.test(out)) out += ".";

    // If too short, append a neutral, non-invented sentence
    if (wordCount(out) < 28) {
      out = `${out} See what fits your needs and take the next step today.`;
    }

    // Re-trim if appending pushed it too long
    words = normalizeSpaces(out).split(/\s+/).filter(Boolean);
    if (words.length > 60) out = words.slice(0, 60).join(" ").trim();

    // Guarantee punctuation at end
    if (out && !/[.!?]$/.test(out)) out += ".";

    return out;
  };

  const system = [
    "You are SmartMark's ad description writer for static social ads.",
    "Write a subline of 2–4 sentences.",
    "Total length MUST be 28–60 words.",
    "No emojis. No hashtags. No URLs.",
    "No unverifiable claims (best, #1, guaranteed, cheapest, fastest, premium, luxury).",
    "Do not invent offers, discounts, shipping/returns/warranties, or inventory claims.",
    "Keep it benefit-first, skimmable, and neutral."
  ].join(" ");

  const user = [
    `Category: ${category || "generic"}.`,
    productHead ? `Product/topic: ${productHead}.` : "",
    benefitTerms.length ? `Main benefit: ${benefitTerms.join(" ")}.` : "",
    audienceTerms.length ? `Audience: ${audienceTerms.join(" ")}.` : "",
    locationTerm ? `Location: ${locationTerm}.` : "",
    "",
    "Return ONLY the subline text, nothing else."
  ].join(" ");

  let line = "";
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.35,
      max_tokens: 140,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    line = resp.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.warn("coherent-subline API error:", e?.message);
  }

  if (!line) line = "Built to match your needs with a clear, simple experience. Get the details up front and choose the option that makes sense. Learn more and take the next step today.";

  line = enforceSublineLen(line);

  return res.json({ subline: line });
});


// ---------- summarize-ad-copy (JSON) ----------
router.post(["/summarize-ad-copy", "/gpt/summarize-ad-copy"], limitSummarize, async (req, res) => {
  try {
    const a = (req.body && req.body.answers) || {};
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    console.log("[CREATIVE][context]", {
      route: "summarize-ad-copy",
      businessName: String(a.businessName || "").trim() || "(empty)",
      industry: String(a.industry || "").trim() || "(empty)",
      businessType: String(a.businessType || "").trim() || "(empty)",
      niche: String(a.niche || "").trim() || "(empty)",
      effectiveIndustry: String(a.industry || a.businessType || a.niche || "").trim() || "(EMPTY — will use last-resort fallback)",
      city: String(a.city || "").trim() || "(empty)",
      mainBenefit: String(a.mainBenefit || "").trim().slice(0, 80) || "(empty)",
      offer: String(a.offer || "").trim() || "(empty)",
      hasPhone: !!(a.phone),
    });

    // --- local helpers ---
    const norm = (s = "") =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    const tokenSet = (s = "") => new Set(norm(s).split(" ").filter(Boolean));

    const jaccard = (x = "", y = "") => {
      const A = tokenSet(x);
      const B = tokenSet(y);
      if (!A.size || !B.size) return 0;
      let inter = 0;
      for (const w of A) if (B.has(w)) inter++;
      const union = A.size + B.size - inter;
      return union ? inter / union : 0;
    };

    const clamp = (s, n) => String(s || "").trim().slice(0, n);
    const clampWords = (s = "", maxWords = 8) => {
      const w = String(s || "").trim().split(/\s+/).filter(Boolean);
      return w.length > maxWords ? w.slice(0, maxWords).join(" ") : w.join(" ");
    };

    const stripWeOur = (s = "") =>
      String(s || "")
        .replace(/\b(our|we|us|i|my)\b/gi, "")
        .replace(/\s+/g, " ")
        .trim();

    const safeHeadline = (s = "") => {
      s = stripWeOur(s);
      s = s.replace(/["""']/g, "").replace(/[.,;:!?]+$/g, "").trim();
      s = clampWords(s, 6);
      if (!s) return "";
      return s[0].toUpperCase() + s.slice(1);
    };

const safeSubline = (s = "") => {
  s = stripWeOur(s);
  s = String(s || "")
    .replace(/["""']/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";

  const words = (t) => String(t || "").trim().split(/\s+/).filter(Boolean);

  // Prefer whole sentences so we never "cut off" mid-thought
  const sentences = s
    .split(/(?<=[.!?])\s+/)
    .map(x => x.trim())
    .filter(Boolean);

  let out = "";
  let total = 0;

  for (const sent of sentences) {
    const w = words(sent);
    if (!w.length) continue;
    if (total + w.length > 50) break; // hard cap
    out = out ? `${out} ${sent}` : sent;
    total += w.length;
  }

  // If model returned no punctuation at all, fall back to a clean 50-word slice
  if (!out) {
    const w = words(s);
    out = w.slice(0, 50).join(" ").trim();
  }

  // Ensure it ends like a complete sentence
  out = out.replace(/[,:;—–-]\s*$/g, "").trim();
  if (out && !/[.!?]$/.test(out)) out += ".";

  // Ensure minimum length (20 words) WITHOUT inventing offers
  if (words(out).length < 20) {
    const addon = "Learn what’s included and take the next step today.";
    const remaining = 50 - words(out).length;
    if (remaining > 0) {
      const addWords = words(addon).slice(0, remaining).join(" ");
      out = `${out} ${addWords}`.replace(/\s+/g, " ").trim();
      if (!/[.!?]$/.test(out)) out += ".";
    }
  }

  // Final guard: never exceed 50 words
  const final = words(out);
  if (final.length > 50) {
    out = final.slice(0, 50).join(" ").trim();
    if (!/[.!?]$/.test(out)) out += ".";
  }

  return out;
};

const buildFallbackHeadline = () => {
  // Derive from industry + location only — never from raw benefit text (too echo-prone).
  // Check businessType and niche as fallbacks for industry (some clients populate those instead).
  const industry = String(a.industry || a.businessType || a.niche || "").trim().toLowerCase();
  const city = String(a.city || "").trim();

  if (/hvac|heating|cooling|air/.test(industry))   return city ? `HVAC service in ${city}` : "Trusted local HVAC service";
  if (/plumb/.test(industry))                       return city ? `Plumbing repairs in ${city}` : "Local plumbers ready to help";
  if (/electr/.test(industry))                      return city ? `Electrical work in ${city}` : "Electrical work done right";
  if (/roof/.test(industry))                        return city ? `Roofing in ${city}` : "Expert roofing, every job";
  if (/landscap|lawn/.test(industry))               return city ? `Lawn care in ${city}` : "Yard work done professionally";
  if (/clean|maid/.test(industry))                  return city ? `Cleaning service in ${city}` : "Professional cleaning done right";
  if (/pest/.test(industry))                        return city ? `Pest control in ${city}` : "Pest-free home, guaranteed";
  if (/market|advertis|agency/.test(industry))      return "Marketing that brings in real customers";
  if (/dental|dent/.test(industry))                 return city ? `Dental care in ${city}` : "Dental care you can trust";
  if (/legal|law/.test(industry))                   return city ? `Legal help in ${city}` : "Trusted legal advice";
  if (/auto|car|vehicle/.test(industry))            return city ? `Auto repair in ${city}` : "Auto service done right";
  if (/insur/.test(industry))                       return "Coverage that fits your situation";
  if (/real.?estate|realt/.test(industry))          return city ? `Real estate in ${city}` : "Find the right home";
  if (/restaurant|food|cater/.test(industry))       return city ? `Great food in ${city}` : "Fresh food, real flavor";
  if (/fitness|gym|train/.test(industry))           return "Fitness results that actually stick";
  if (/salon|hair|beauty/.test(industry))           return "Look great, feel confident";
  if (/pet|animal|vet/.test(industry))              return "Compassionate care for your pet";
  if (industry) return safeHeadline(city ? `${industry} service in ${city}` : `Professional ${industry} service`);
  return "Local experts you can count on";
};

const buildFallbackSubline = (headline) => {
  // Build from industry + audience + offer — never from raw benefit text (too echo-prone).
  // Also check businessType and niche as fallbacks (consistent with buildFallbackHeadline).
  const industry = String(a.industry || a.businessType || a.niche || "").trim().toLowerCase();
  const audience = String(a.idealCustomer || "").trim().toLowerCase();
  const city = String(a.city || "").trim();
  const offer = String(a.offer || a.saveAmount || "").trim();

  const s1 = industry
    ? city
      ? `Professional ${industry} service serving ${city} and the surrounding area.`
      : `A professional ${industry} service built around what local customers actually need.`
    : "A professional local service built around what customers actually need.";

  const s2 = audience
    ? `Ideal for ${audience} looking for reliable, honest service they can count on.`
    : "Straightforward service, honest pricing, and quality that speaks for itself.";

  const s3 = offer
    ? "Take advantage of the current offer and get in touch today."
    : "Get in touch to learn what’s included and take the next step.";

  let out = `${s1} ${s2} ${s3}`.replace(/\s+/g, " ").trim();
  if (headline && norm(out).startsWith(norm(headline))) out = out.slice(headline.length).trim();
  return safeSubline(out);
};

const system =
  "You are an expert Facebook/Instagram ad copywriter for small and medium local businesses. " +
  "You receive a CREATIVE BRIEF describing a specific business and what they want to advertise. " +
  "Your job: write from the CUSTOMER'S perspective — someone who has this problem and is considering calling this business. " +
  "The copy must be grounded in the actual service described in the brief. Generic category language is a failure. " +
  "" +
  "HOW TO TRANSLATE THE BRIEF INTO AD COPY: " +
  "Read the brief carefully to understand the specific service, customer problem, and desired outcome. " +
  "Then write as if you are speaking to a real person who just Googled that problem. " +
  "TRANSLATE the customer's pain point into an outcome — do not parrot the brief's words back literally. " +
  "If the brief says 'same-day AC repair', don't write 'Same-day AC repair available' — write 'AC down? Fixed today.' or 'Cool again by tonight.' " +
  "If the brief says 'furnace installation with financing', don't write 'Furnace installation, financing available' — write 'New furnace, pay over time.' or 'Heat this winter, pay later.' " +
  "If the brief says 'roof replacement, free estimates', write 'New roof, no guesswork.' or 'Free estimate, real price.' " +
  "" +
  "HEADLINE: 4–6 words. Short, concrete, benefit-driven. Name the specific job, outcome, or timing — not the business category. " +
  "NEVER write a question headline ('Need...?', 'Looking for...?', 'Want...?') — questions test poorly. " +
  "NEVER add city or location. NEVER use generic phrases ('quality service', 'professional X', 'trusted Y', 'local experts'). " +
  "Strong examples: 'AC fixed same day.' — 'Leak found, fixed fast.' — 'New roof before winter.' — 'Same-day electrician, real prices.' " +
  "" +
  "SUBLINE: 2–3 sentences, 20–50 words. Say what the business does, who it helps, and what makes it worth calling — in plain, direct, human language. No drama, no exaggeration, no padding. " +
  "PHONE RULE: If Phone is in the brief, end the subline with a natural call phrase using that exact number (e.g. 'Call (713) 555-1234 to schedule.'). Never invent or placeholder a number. " +
  "" +
  "CTA: 2–5 words. A verb-forward action that matches what this business actually wants people to do next. " +
  "By industry: HVAC/cooling/heating → 'Schedule service today' / 'Book your service call' / 'Get a free estimate'. " +
  "Plumbing → 'Book a plumber' / 'Call for same-day service'. Electrical → 'Book an electrician' / 'Get a free quote'. " +
  "Roofing → 'Get a free estimate' / 'Book your inspection'. Cleaning → 'Book your cleaning'. " +
  "Dental → 'Book an appointment'. Legal → 'Book a consultation'. General service → 'Get a free quote' / 'Schedule today'. " +
  "NEVER return 'Learn more' as the CTA — it is too weak for any service business. " +
  "" +
  "Return strict JSON: headline (4–6 words, no city), subline (2–3 sentences, 20–50 words), offer (brief string if promotion exists, else empty string ''), bullets (array up to 3 short facts), disclaimers (optional short string), cta (2–5 words). " +
  "Hard rules: NO URLs anywhere. NO 'our/we/I/my' language. NO superlatives (best, #1, guaranteed, fastest, revolutionary). " +
  "NEVER write: 'transform', 'game-changer', 'effortlessly', 'seamless', 'hassle-free', 'cutting-edge', 'quality service is just a call away', 'service you can trust', 'next level', 'designed with you in mind'. " +
  "OFFER RULE: If no promotion is in the brief, return offer as an empty string ''. Never invent a discount or promotion.";


    // Phone is now asked for all users (website and no-website alike).
    // Use whatever the user actually provided this run; empty string means no phone.
    const isNoWebsiteRun = String(a.noWebsite || "").trim().toLowerCase() === "yes";
    const phoneForCopy = String(a.phone || "").trim();

    const websiteForCopy = String(a.website || a.url || "").trim();

    // Build a structured creative brief so the model gets synthesized intent,
    // not a list of disconnected raw fields.
    const locationStr = a.city
      ? (a.state ? `${a.city}, ${a.state}` : a.city)
      : (a.location || "");
    const mainService = String(a.mainBenefit || a.details || "").trim();
    const offerStr    = String(a.offer || a.saveAmount || "").trim();
    const audienceStr = String(a.idealCustomer || "").trim();
    const secondaryStr = String(a.secondary || a.financingLine || "").trim();

    const user = [
      `CREATIVE BRIEF — write ad copy specific to this business:`,
      ``,
      `BUSINESS: ${a.businessName || "(unnamed)"}`,
      `INDUSTRY: ${a.industry || "(not specified)"}`,
      locationStr ? `LOCATION: ${locationStr}` : null,
      ``,
      `SERVICE / WHAT TO ADVERTISE:`,
      mainService || "(no details provided)",
      ``,
      offerStr    ? `PROMOTION: ${offerStr}` : null,
      secondaryStr ? `ADDITIONAL DETAIL: ${secondaryStr}` : null,
      audienceStr ? `TARGET CUSTOMER: ${audienceStr}` : null,
      websiteForCopy && !isNoWebsiteRun
        ? `WEBSITE (context only — do not print URL in copy): ${websiteForCopy}` : null,
      phoneForCopy ? `PHONE: ${phoneForCopy}` : null,
      isNoWebsiteRun
        ? `NOTE: call-only business. Include the phone number naturally in the subline.` : null,
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.65,
      max_tokens: 420,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "user", content: "Return ONLY compact JSON object with those keys." },
      ],
    });

    let txt = completion.choices?.[0]?.message?.content?.trim() || "{}";
    txt = txt.replace(/^```json\s*|\s*```$/g, "");
    let parsed = {};
    try {
      parsed = JSON.parse(txt);
    } catch {
      parsed = {};
    }

    // sanitize
    let headline = safeHeadline(parsed.headline || "");
    let subline = safeSubline(parsed.subline || "");
    const offer = clamp(parsed.offer || "", 40);
    let bullets = (Array.isArray(parsed.bullets) ? parsed.bullets : []).slice(0, 3).map((b) => clamp(stripWeOur(b), 40));
    const disclaimers = clamp(stripWeOur(parsed.disclaimers || ""), 160);
    let cta = clamp(stripWeOur(parsed.cta || "Learn more"), 24);

    // HARD anti-echo against inputs
    const source = [
      a.mainBenefit || "",
      a.details || "",
      a.idealCustomer || "",
      a.offer || "",
      a.saveAmount || "",
      a.industry || "",
      a.businessName || "",
    ].join(" ");

    const mainBenefit = String(a.mainBenefit || a.details || "").trim();

    if (!headline) headline = buildFallbackHeadline();

    // strip first-person if any slipped through
    headline = headline.replace(/^\s*(our|we)\b\s*/i, "").trim();
    subline  = subline.replace(/^\s*(our|we)\b\s*/i, "").trim();

    // Only reject NEAR-VERBATIM copies — not semantically related good copy.
    // Previous thresholds (0.72/0.76/0.82) were too aggressive and filtered out
    // legitimate copy that correctly reflected the user's service description.
    if (mainBenefit && norm(headline) === norm(mainBenefit)) {
      headline = buildFallbackHeadline(); // only reject exact matches
    }

    if (!subline) subline = buildFallbackSubline(headline);

    // Prevent the headline from being literally repeated in the subline
    if (norm(subline).startsWith(norm(headline))) {
      subline = buildFallbackSubline(headline);
    }

    // Only force fallbacks for near-exact verbatim echoes (raised from 0.72/0.76)
    if (jaccard(headline, source) > 0.92) headline = buildFallbackHeadline();
    if (jaccard(subline,  source) > 0.92) subline  = buildFallbackSubline(headline);

    // bullets fallback
    if (!bullets.length) {
      const ind = String(a.industry || "services").trim().toLowerCase();
      if (ind.includes("fashion")) bullets = ["New arrivals weekly", "Everyday fits", "Easy returns"];
      else if (ind.includes("restaurant") || ind.includes("food")) bullets = ["Fresh ingredients", "Fast pickup", "Local favorites"];
      else bullets = ["Clear offer", "Clean design", "Strong call to action"];
      bullets = bullets.map((b) => clamp(b, 40));
    }

    cta = cta.replace(/[.]+$/g, "").trim();
    if (!cta) {
      // Industry-aware CTA fallback — "Learn more" is never appropriate for service businesses.
      const _ind = String(a.industry || a.businessType || a.niche || "").toLowerCase();
      if (/hvac|heating|cooling|air.?cond/.test(_ind)) cta = "Schedule service today";
      else if (/plumb/.test(_ind))                      cta = "Book a plumber";
      else if (/electr/.test(_ind))                     cta = "Book an electrician";
      else if (/roof/.test(_ind))                       cta = "Get a free estimate";
      else if (/landscap|lawn/.test(_ind))              cta = "Get a free quote";
      else if (/clean|maid/.test(_ind))                 cta = "Book your cleaning";
      else if (/dental|dent/.test(_ind))                cta = "Book an appointment";
      else if (/legal|law/.test(_ind))                  cta = "Book a consultation";
      else if (/auto|car|vehicle/.test(_ind))           cta = "Schedule service";
      else if (/pest/.test(_ind))                       cta = "Schedule treatment";
      else if (/market|advertis|agency/.test(_ind))     cta = "Get started today";
      else cta = phoneForCopy ? "Call now" : "Get a free quote";
    }

    // Post-process: if phone was provided but the AI didn't include it in the subline, append naturally.
    // Check by comparing raw digit strings to handle any formatting variation.
    if (phoneForCopy) {
      const phoneDigits = phoneForCopy.replace(/\D/g, "");
      const sublineDigits = subline.replace(/\D/g, "");
      if (phoneDigits && !sublineDigits.includes(phoneDigits)) {
        const callLine = `Call ${phoneForCopy} to get started.`;
        const candidate = `${subline.replace(/[.!?]\s*$/, "")}. ${callLine}`;
        const wordCount = candidate.trim().split(/\s+/).filter(Boolean).length;
        if (wordCount <= 50) {
          subline = candidate.trim();
        } else {
          // subline too long to append — replace last sentence instead
          const sents = subline.split(/(?<=[.!?])\s+/).filter(Boolean);
          if (sents.length > 1) {
            sents[sents.length - 1] = callLine;
            subline = sents.join(" ");
          } else {
            subline = callLine; // last resort: just the call line
          }
        }
      }
    }

const finalizeSubline = (s = "", maxWords = 45) => {
  let out = String(s || "").replace(/\s+/g, " ").trim();

  // cap by WORDS (not characters) so we never cut mid-word
  let words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) words = words.slice(0, maxWords);

  out = words.join(" ").trim();

  // ensure clean ending punctuation
  if (out && !/[.!?]$/.test(out)) out += ".";

  return out;
};

const copy = {
  headline: clamp(headline, 55),
  subline: finalizeSubline(subline, 55),
  offer,
  bullets,
  disclaimers,
  cta,
};

    return res.json({ ok: true, copy });
  } catch (e) {
    console.error("summarize-ad-copy error:", e?.message || e);
    return res.status(400).json({ ok: false, error: "copy_failed" });
  }
});

module.exports = router;
