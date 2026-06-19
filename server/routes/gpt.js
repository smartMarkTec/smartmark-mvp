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
  const { message, history, campaignState } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Please provide a message." });
  }

  const trimmedHistory = normalizeHistory(history);
  const allowQuestions = userAllowsAssistantQuestions(message);

  // Build campaign context block from the frontend's current state so the AI
  // can reference the business, creative, and uploaded image without saying
  // "I can't view uploaded files" — within Smartemark the image is in session state.
  let contextLines = [];
  if (campaignState && typeof campaignState === "object") {
    const cs = campaignState;
    if (cs.businessName) contextLines.push(`Business: ${cs.businessName}`);
    if (cs.objective) contextLines.push(`Campaign objective: ${cs.objective}`);
    if (cs.creativeSource) contextLines.push(`Creative type: ${String(cs.creativeSource).replace(/_/g, " ")}`);
    if (cs.uploadedImageUrl) contextLines.push(`The user has uploaded a photo for their ad (treat this image as visible — describe/reference it using the campaign context below).`);
    if (cs.headline) contextLines.push(`Current headline: "${cs.headline}"`);
    if (cs.body) contextLines.push(`Current body copy: "${cs.body}"`);
    if (cs.offer) contextLines.push(`Offer/promotion: ${cs.offer}`);
    if (cs.service) contextLines.push(`Service/product: ${cs.service}`);
    if (cs.location) contextLines.push(`Location: ${cs.location}`);
    if (cs.idealCustomer) contextLines.push(`Ideal customer: ${cs.idealCustomer}`);
  }
  const contextBlock = contextLines.length
    ? `\n\nCurrent campaign context:\n${contextLines.join("\n")}`
    : "";

  const messages = [
    {
      role: "system",
      content:
        "You are SmartMark, a concise AI Ad Manager. " +
        "You ONLY respond to the user's message and never initiate onboarding or survey questions. " +
        "The UI handles business name, budget, industry, etc. " +
        "Do not ask questions unless the user explicitly asked for next steps or guidance. " +
        "Keep replies 1–3 sentences. " +
        "If the user is off-topic, be helpful but brief. " +
        "If the user asks about their uploaded photo or image, use the campaign context below to generate relevant copy — never say you cannot view uploaded files, because within Smartemark the image is part of the session." +
        contextBlock,
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

    const _skipSet = new Set(["skip", "skipped", "none", "n/a", "na", "-", "no", "not provided"]);
    const _isSkipped = (v) => !v || _skipSet.has(String(v).replace(/\s+/g, " ").trim().toLowerCase());

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
      s = clampWords(s, 8);
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

const _pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const buildFallbackHeadline = () => {
  // Derive from industry only — never from raw benefit text (too echo-prone).
  // Check businessType and niche as fallbacks for industry (some clients populate those instead).
  const industry = String(a.industry || a.businessType || a.niche || "").trim().toLowerCase();

  if (/hvac|heating|cooling|air/.test(industry))   return _pick(["AC down? Fixed today.", "Comfort restored, no surprise bill.", "Same-day HVAC service.", "Cool again before the day gets worse."]);
  if (/plumb/.test(industry))                       return _pick(["Leak stopped before it spreads.", "Same-day plumber, shows up on time.", "Plumbing fixed right the first time."]);
  if (/electr/.test(industry))                      return _pick(["Electrical work done safely.", "Licensed electrician, real prices.", "Power issues fixed fast."]);
  if (/roof/.test(industry))                        return _pick(["Roof replaced before the rain.", "Free estimate, real price.", "Roofing done right the first time."]);
  if (/landscap|lawn/.test(industry))               return _pick(["Lawn looking great every week.", "Curb appeal done right.", "Yard transformed, no effort required."]);
  if (/clean|maid/.test(industry))                  return _pick(["Clean home without lifting a finger.", "Spotless every single visit.", "Home cleaned top to bottom."]);
  if (/pest/.test(industry))                        return _pick(["Pests gone, stays gone.", "Home protected from pests today.", "Pest-free living starts here."]);
  if (/market|advertis|agency/.test(industry))      return _pick(["More leads, less manual work.", "Stop guessing. Start getting customers.", "Ads that bring real customers in."]);
  if (/dental|dent/.test(industry))                 return _pick(["Healthy smile starts here.", "Comfortable visits, healthy results.", "Dental care done right."]);
  if (/legal|law/.test(industry))                   return _pick(["Legal help when you need it.", "Real legal advice, real results.", "Protect what matters most."]);
  if (/auto|car|vehicle/.test(industry))            return _pick(["Car fixed right the first time.", "Same-day service, real mechanics.", "Auto repair, honest prices."]);
  if (/insur/.test(industry))                       return _pick(["Coverage that fits your life.", "Protected when it matters most.", "Insurance made simple."]);
  if (/real.?estate|realt/.test(industry))          return _pick(["Find the right home today.", "Buy or sell with confidence.", "Real estate done right."]);
  if (/restaurant|food|cater/.test(industry))       return _pick(["Fresh food, ready when you are.", "Real ingredients, real flavor.", "Great food, made right here."]);
  if (/fitness|gym|train/.test(industry))           return _pick(["Reach your fitness goals faster.", "Real results, real training.", "Get fit with a real plan."]);
  if (/salon|hair|beauty/.test(industry))           return _pick(["Look great, feel confident.", "Salon results that last.", "Professional styling, every time."]);
  if (/pet|animal|vet/.test(industry))              return _pick(["Compassionate care for every pet.", "Healthy pets, happy families.", "Your pet deserves real care."]);
  if (industry) return safeHeadline(`${industry} service that delivers`);
  return "Real results, real service.";
};

const buildFallbackSubline = (headline) => {
  // Build from industry + audience + offer — never from raw benefit text (too echo-prone).
  // Also check businessType and niche as fallbacks (consistent with buildFallbackHeadline).
  const industry = String(a.industry || a.businessType || a.niche || "").trim().toLowerCase();
  const audience = String(a.idealCustomer || "").trim().toLowerCase();
  const offer = String(a.offer || a.saveAmount || "").trim();

  let s1;
  if (/hvac|heating|cooling|air/.test(industry))   s1 = _pick(["Same-day service, most jobs fixed in one visit.", "Certified technicians with same-day availability.", "Fast diagnosis, most repairs completed the same day."]);
  else if (/plumb/.test(industry))                  s1 = _pick(["Same-day response, work done right the first time.", "Licensed plumbers handling repairs and replacements."]);
  else if (/electr/.test(industry))                 s1 = _pick(["Licensed electricians handling jobs of any size.", "Safe, code-compliant electrical work done fast."]);
  else if (/roof/.test(industry))                   s1 = _pick(["Full roof replacement and repair with free estimates.", "Licensed roofers with quality materials and clean work."]);
  else if (/clean|maid/.test(industry))             s1 = _pick(["Thorough cleaning every visit, no corners cut.", "Professional cleaners who get every room right."]);
  else if (/pest/.test(industry))                   s1 = _pick(["Targeted treatment that eliminates the problem, not just the symptom.", "Licensed pest control with results that last."]);
  else if (/market|advertis|agency/.test(industry)) s1 = _pick(["Campaigns built to bring in qualified customers, not just clicks.", "Focused strategies that grow your business without the guesswork."]);
  else if (/landscap|lawn/.test(industry))          s1 = _pick(["Consistent lawn care that keeps your yard looking sharp.", "Reliable service, same crew, every visit."]);
  else if (/dental|dent/.test(industry))            s1 = _pick(["Gentle, thorough care for patients of all ages.", "Comfortable visits, clear treatment plans, no surprises."]);
  else if (/legal|law/.test(industry))              s1 = _pick(["Clear legal advice you can act on.", "Experienced attorneys, straightforward guidance."]);
  else if (/auto|car|vehicle/.test(industry))       s1 = _pick(["Fast diagnostics and honest repair estimates.", "Repairs done right, with no surprises on the bill."]);
  else if (industry)                                s1 = `Professional ${industry} service built around what customers actually need.`;
  else                                              s1 = "A professional local service built around what customers actually need.";

  const s2 = audience
    ? `${audience.charAt(0).toUpperCase() + audience.slice(1)} who want quality work without the runaround.`
    : "Straightforward service, clear pricing, and work that holds up.";

  const s3 = offer
    ? "Take advantage of the current offer and reach out today."
    : "Get in touch to see what’s included and take the next step.";

  let out = `${s1} ${s2} ${s3}`.replace(/\s+/g, " ").trim();
  if (headline && norm(out).startsWith(norm(headline))) out = out.slice(headline.length).trim();
  return safeSubline(out);
};

const system =
  "You are an expert Facebook/Instagram ad copywriter for local and online businesses. " +
  "You receive a CREATIVE BRIEF describing a specific business and what they want to advertise. " +
  "Your job: write from the CUSTOMER'S perspective — someone who has this problem or desire and is deciding whether to call or click. " +
  "The copy must be grounded in the actual service described in the brief. Generic category language is a failure. " +
  "" +
  "HOW TO TRANSLATE THE BRIEF INTO AD COPY: " +
  "Read the brief carefully to understand the specific service, customer problem, and desired outcome. " +
  "Then write as if you are speaking to a real person in that situation. " +
  "TRANSLATE the customer's pain point or goal into a concrete outcome — do not echo the brief's words back literally. " +
  "If the brief says 'same-day AC repair' → write 'AC down? Fixed today.' or 'Cool again by tonight.' " +
  "If the brief says 'affordable HVAC service' → write 'Comfort restored without the surprise bill.' — never 'Affordable HVAC service.' " +
  "If the brief says 'fast service' → write 'Fixed before the day gets worse.' — never 'Fast service at affordable rates.' " +
  "If the brief says 'furnace installation with financing' → write 'New furnace, pay over time.' " +
  "If the brief says 'roof replacement, free estimates' → write 'Free estimate, real price.' or 'New roof before the rain.' " +
  "If the brief describes a marketing or AI platform → write 'More leads, less manual work.' or 'Stop guessing. Start getting customers.' " +
  "" +
  "HEADLINE: 5–9 words. One complete, punchy thought that either names the exact outcome, states the problem with an instant answer, or frames the key benefit in a way the customer feels. " +
  "Strong patterns: Problem + fix ('AC down? Fixed today.') — Outcome statement ('Comfort restored, no surprise bill.') — Situation + answer ('Roof leaking? Free inspection today.') — Benefit framing ('Clean home without lifting a finger.'). " +
  "NEVER echo input words directly: if the brief says 'affordable', write what affordable means to the customer ('no surprise bill', 'pay over time') — not the word 'affordable'. " +
  "NEVER write: 'quality service', 'professional X', 'trusted Y', 'local experts', 'affordable rates', 'fast and affordable', 'at affordable prices'. " +
  "NEVER add city or location. NEVER write comma-separated slogans ('Cool air, quality care'). NEVER write a question-only headline with no answer ('Need HVAC help?'). " +
  "Strong examples — HVAC: 'AC down? Fixed today.' / 'Comfort restored, no surprise bill.' / 'Cool again before the day gets worse.' " +
  "Plumbing: 'Leak stopped before it spreads.' / 'Same-day plumber, shows up on time.' " +
  "Roofing: 'Roof replaced before the rain.' / 'Free estimate, real price.' " +
  "Cleaning: 'Clean home without lifting a finger.' / 'Spotless every visit.' " +
  "Marketing/SaaS/AI: 'More leads, less manual work.' / 'Stop guessing. Start getting customers.' / 'Ads that bring real customers in.' " +
  "" +
  "SUBLINE: 2–3 sentences, 20–45 words. Sentence 1: what the business specifically delivers — grounded in the brief, not a vague claim. Sentence 2: a specific trust signal or credibility fact (a speed, a process detail, a concrete number, or a result) — trust signals outperform discounts for service businesses. Sentence 3 (optional): a soft reason to act. " +
  "Be specific: 'Same-day service, most jobs fixed in one visit.' beats 'Fast, reliable service from technicians you can trust.' — the second sentence says nothing. " +
  "NEVER write: 'service you can trust', 'solutions that work', 'dedicated to excellence', 'serving customers with pride', 'hassle-free experience', 'team of professionals'. These phrases are invisible to readers. " +
  "VARIETY: Every generation must feel distinct — vary the opening angle, sentence structure, and phrasing based on the COPY ANGLE instruction in the brief. Do not default to the same hook or formula every time. " +
  "PHONE RULE: If and only if a real phone number appears in the PHONE field of the brief, end the subline with a natural call phrase using that exact number. If there is no PHONE field in the brief, never include any phone number, placeholder, or invented number anywhere in the copy — not in the subline, not in bullets, not anywhere. " +
  "" +
  "CTA: 2–5 words. A verb-forward action that matches what this business actually wants people to do next. " +
  "By industry: HVAC/cooling/heating → 'Schedule service today' / 'Book your service call' / 'Get a free estimate'. " +
  "Plumbing → 'Book a plumber' / 'Call for same-day service'. Electrical → 'Book an electrician' / 'Get a free quote'. " +
  "Roofing → 'Get a free estimate' / 'Book your inspection'. Cleaning → 'Book your cleaning'. " +
  "Dental → 'Book an appointment'. Legal → 'Book a consultation'. Marketing/SaaS → 'Get started today' / 'See how it works'. General service → 'Get a free quote' / 'Schedule today'. " +
  "NEVER return 'Learn more' as the CTA — it is too weak for any service business. " +
  "" +
  "Return strict JSON: headline (5–9 words, complete thought, no city), subline (2–3 sentences, 20–45 words), offer (brief string if promotion exists, else empty string ''), bullets (array up to 3 short facts), disclaimers (optional short string), cta (2–5 words). " +
  "Hard rules: NO URLs anywhere. NO 'our/we/I/my' language. NO superlatives (best, #1, guaranteed, fastest, revolutionary). " +
  "NEVER write: 'transform', 'game-changer', 'effortlessly', 'seamless', 'hassle-free', 'cutting-edge', 'quality service is just a call away', 'service you can trust', 'next level', 'designed with you in mind', 'team of experts'. " +
  "OFFER RULE: If no promotion is in the brief, return offer as an empty string ''. Never invent a discount or promotion.";


    // Phone is now asked for all users (website and no-website alike).
    // Use whatever the user actually provided this run; empty string means no phone.
    const isNoWebsiteRun = String(a.noWebsite || "").trim().toLowerCase() === "yes";
    const phoneForCopy = _isSkipped(a.phone) ? "" : String(a.phone || "").trim();

    const websiteForCopy = _isSkipped(a.website || a.url) ? "" : String(a.website || a.url || "").trim();

    // Build a structured creative brief so the model gets synthesized intent,
    // not a list of disconnected raw fields.
    const _city = _isSkipped(a.city) ? "" : String(a.city || "").trim();
    const _state = _isSkipped(a.state) ? "" : String(a.state || "").trim();
    const locationStr = _city
      ? (_state ? `${_city}, ${_state}` : _city)
      : (_state || String(a.location || "").trim());
    const mainService = String(a.mainBenefit || a.details || "").trim();
    const offerStr    = String(a.offer || a.saveAmount || "").trim();
    const audienceStr = String(a.idealCustomer || "").trim();
    const secondaryStr = String(a.secondary || a.financingLine || "").trim();

    // Rotating copy angle — changes per generation so the headline/body feel fresh each time.
    const _COPY_ANGLES = [
      "Lead with the customer's biggest pain point and the immediate relief this service provides.",
      "Lead with the key outcome or transformation — what the customer's situation looks like after.",
      "Lead with a specific trust signal or credibility fact — what makes this business worth calling.",
      "Lead with speed, ease, or offer — make taking the next step feel low-risk and obvious.",
      "Lead with a before/after contrast — the problem state versus how it gets resolved.",
      "Lead with what's specific and different about this business versus a generic option.",
    ];
    const _copyAngle = _COPY_ANGLES[Math.floor(Math.random() * _COPY_ANGLES.length)];

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
      `COPY ANGLE FOR THIS GENERATION: ${_copyAngle}`,
    ].filter(Boolean).join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.72,
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
