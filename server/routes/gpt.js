// server/routes/gpt.js
/* eslint-disable */
const express = require("express");
const router = express.Router();
const OpenAI = require("openai"); // npm i openai

// Use your existing security middleware names
const { secureHeaders, basicRateLimit, basicAuth } = require("../middleware/security");

// ---------- Minimal, safe OpenAI client ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------- Global, minimal hardening for this router ----------
router.use(secureHeaders());

// Optional basic auth (enabled only if BASIC_AUTH_USER + BASIC_AUTH_PASS are set)
router.use(basicAuth());

// ---------- Per-route rate limits (MVP) ----------
const limitChat = basicRateLimit({ windowMs: 60 * 1000, max: 30 });
const limitSubline = basicRateLimit({ windowMs: 60 * 1000, max: 40 });
const limitSummarize = basicRateLimit({ windowMs: 60 * 1000, max: 20 });

// ---------- Small helpers shared by routes ----------
const FALLBACK_CHAT =
  "I’m your AI Ad Manager—share your goal and I’ll suggest a clear next move.";

const STOP = new Set([
  "and","or","the","a","an","of","to","in","on","with","for","by","your","you","is","are","at"
]);
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
function softRewrite(line = "") {
  let s = String(line).replace(/\s+/g, " ").trim();
  s = s.replace(/\b(our|we|my|I)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  s = s.replace(/[.,;:!?-]+$/g, "");
  return s;
}
function clampWords(s = "", max = 10) {
  const w = String(s).trim().split(/\s+/).filter(Boolean);
  return w.length > max ? w.slice(0, max).join(" ") : s.trim();
}

// ---------- Chat alignment guards (HARD RULE) ----------
function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }))
    .slice(-12);
}

function userAllowsAssistantQuestions(userMsg = "") {
  const s = String(userMsg || "").toLowerCase();
  // Only allow assistant questions if user explicitly asks for next steps / guidance
  return /\b(next|what next|next step|steps|what should i do|what do i do|guide me|walk me through|help me decide|ask me|questions)\b/.test(s);
}

// Remove all question sentences unless allowed
function stripQuestionsIfNotAllowed(reply = "", allowed = false) {
  let out = String(reply || "").replace(/\s+/g, " ").trim();
  if (!out) return FALLBACK_CHAT;

  // Keep 1–3 sentences max
  const parts = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  out = parts.slice(0, 3).join(" ").trim();

  if (allowed) return out;

  // Remove any sentence containing '?'
  const sentences = out.split(/(?<=[.!?])\s+/).filter(Boolean);
  const filtered = sentences.filter(s => !s.includes("?"));
  out = (filtered.length ? filtered.join(" ") : "").trim();

  // Remove leftover '?' characters (edge cases)
  out = out.replace(/\?/g, "").trim();

  // If nothing left, return a short helpful statement (no questions)
  if (!out) {
    return "I can help with targeting, creatives, and budgets—share your goal and I’ll recommend a clear next move.";
  }

  // Avoid dangling punctuation prompts
  out = out.replace(/[:\-–—]\s*$/g, "").trim();

  return out || FALLBACK_CHAT;
}

/* ====================== NEW: anti-copy + copywriter helpers ====================== */
function normText(s = "") {
  return String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function jaccard(a = "", b = "") {
  const A = new Set(normText(a).split(" ").filter(Boolean));
  const B = new Set(normText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}
function containsLongSubstring(a = "", b = "", minLen = 24) {
  const A = normText(a);
  const B = normText(b);
  if (!A || !B) return false;
  if (A.length < minLen || B.length < minLen) return false;
  return A.includes(B.slice(0, minLen)) || B.includes(A.slice(0, minLen)) || A.includes(B) || B.includes(A);
}

// Builds a fallback headline/description that is NOT copied verbatim
function fallbackCopyFromAnswers(a = {}) {
  const industry = String(a.industry || "").trim();
  const biz = String(a.businessName || a.brand || "").trim();
  const benefit = String(a.mainBenefit || a.details || "").trim();
  const offer = String(a.offer || a.saveAmount || "").trim();

  const heads = [];
  if (offer) heads.push(offer);
  if (benefit) heads.push(benefit);
  if (industry) heads.push(industry);

  let headline = heads.find(Boolean) || "New Offers Available";
  headline = sentenceCase(clampWords(softRewrite(headline), 8));

  let descriptionParts = [];
  if (benefit) descriptionParts.push(sentenceCase(softRewrite(benefit)));
  if (offer) descriptionParts.push(sentenceCase(softRewrite(offer)));
  if (!descriptionParts.length && industry) descriptionParts.push(`Designed for ${industry.toLowerCase()} customers.`);
  if (!descriptionParts.length) descriptionParts.push("Clean, simple, and made for everyday use.");

  if (biz) descriptionParts.push(`Explore ${biz} today.`);
  let description = descriptionParts.join(" ").replace(/\s+/g, " ").trim();
  description = description.slice(0, 160);

  return { headline, description };
}

/* ====================== Route: chat ====================== */
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

/* ====================== coherent 7–9 word subline generator ====================== */
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

  const system = [
    "You are SmartMark's subline composer.",
    "Write ONE short ad subline of 7–9 words, sentence case.",
    "No buzzwords, no unverifiable claims, no website/domain.",
    "Do NOT end on a preposition (to, for, with, of, in, on, at, by)."
  ].join(" ");

  const user = [
    `Category: ${category || "generic"}.`,
    productHead ? `Product/topic: ${productHead}.` : "",
    benefitTerms.length ? `Main benefit: ${benefitTerms.join(" ")}.` : "",
    audienceTerms.length ? `Audience: ${audienceTerms.join(" ")}.` : "",
    locationTerm ? `Location: ${locationTerm}.` : "",
    "",
    "Return ONLY the line, nothing else."
  ].join(" ");

  let line = "";
  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 24,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    line = resp.choices?.[0]?.message?.content?.trim() || "";
  } catch (e) {
    console.warn("coherent-subline API error:", e?.message);
  }

  if (!line) line = "Modern fashion built for everyday wear";
  line = line.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
  line = ensure7to9Words(line);

  if ((category || "").toLowerCase() === "fashion") {
    const badCombo = /\b(fashion)\s+modern\b/i.test(line) || /\bmodern\s+built\b/i.test(line);
    if (badCombo) line = "Modern fashion built for everyday wear";
    line = line.replace(/\bfashion modern built into\b/i, "Modern fashion built for");
  }

  return res.json({ subline: line });
});

/* ====================== summarize-ad-copy (JSON) ====================== */
router.post(["/summarize-ad-copy", "/gpt/summarize-ad-copy"], limitSummarize, async (req, res) => {
  try {
    const a = (req.body && req.body.answers) || {};
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    // Create a single string representing all user-provided text we must not copy verbatim
    const inputText = [
      a.industry,
      a.businessName || a.brand,
      a.idealCustomer,
      a.mainBenefit || a.details,
      a.offer || a.saveAmount,
      a.secondary || a.financingLine,
      a.description,
      a.topic,
      a.title,
    ].filter(Boolean).join(" ");

    const system =
      "You are a senior direct-response copywriter. " +
      "Write a fresh headline + description that SELL the offer. " +
      "ABSOLUTE RULES: " +
      "1) Do NOT copy phrases verbatim from the input. Rephrase everything. " +
      "2) No 'our/we' language. " +
      "3) No brand-superlatives (best, #1, premium, luxury). " +
      "4) No URLs. " +
      "Return STRICT JSON with keys: headline (<=8 words), subline (7–14 words), offer (optional short), " +
      "bullets (array up to 3), disclaimers (optional), cta (2–3 words).";

    const user = [
      `Industry: ${a.industry || ""}`,
      `Business: ${a.businessName || a.brand || ""}`,
      `Location: ${a.city ? (a.state ? `${a.city}, ${a.state}` : a.city) : (a.location || "")}`,
      `Audience: ${a.idealCustomer || ""}`,
      `Main benefit: ${a.mainBenefit || a.details || ""}`,
      `Offer: ${a.offer || a.saveAmount || ""}`,
      `Secondary: ${a.secondary || a.financingLine || ""}`,
      "",
      "Write new copy that is NOT a paraphrase-by-copy. Use different wording."
    ].join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.35, // slight creativity helps variation
      max_tokens: 240,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
        { role: "user", content: "Return ONLY compact JSON object with those keys." }
      ]
    });

    let txt = completion.choices?.[0]?.message?.content?.trim() || "{}";
    txt = txt.replace(/^```json\s*|\s*```$/g, "");
    let parsed = {};
    try { parsed = JSON.parse(txt); } catch { parsed = {}; }

    const clamp = (s, n) => String(s || "").trim().slice(0, n);
    const arr = (x) => Array.isArray(x) ? x : (x ? [String(x)] : []);

    let headline = clamp(parsed.headline || "", 55);
    let subline = clamp(parsed.subline || "", 160);
    let offer = clamp(parsed.offer || "", 50);
    let bullets = arr(parsed.bullets || []).slice(0, 3).map(b => clamp(b, 46));
    let disclaimers = clamp(parsed.disclaimers || "", 160);
    let cta = clamp(parsed.cta || "Learn more", 24);

    // Post-guard: if model copied input too closely, force a clean fallback
    const tooSimilar =
      jaccard(headline, inputText) > 0.65 ||
      jaccard(subline, inputText) > 0.65 ||
      containsLongSubstring(headline, inputText, 18) ||
      containsLongSubstring(subline, inputText, 24);

    if (tooSimilar || !headline || !subline) {
      const fb = fallbackCopyFromAnswers(a);
      headline = fb.headline;
      subline = fb.description;
      // Keep other fields simple
      if (!cta) cta = "Learn more";
      if (!bullets || !bullets.length) bullets = [];
      offer = offer || "";
      disclaimers = disclaimers || "";
    }

    // Additional: prevent headline == subline
    if (jaccard(headline, subline) > 0.55 || containsLongSubstring(headline, subline, 16)) {
      const fb = fallbackCopyFromAnswers(a);
      // Keep headline, rewrite subline
      subline = fb.description;
    }

    // Clean/shape
    headline = sentenceCase(clampWords(softRewrite(headline), 8));
    subline = sentenceCase(softRewrite(subline)).slice(0, 160);

    const copy = {
      headline: clamp(headline, 55),
      subline: clamp(subline, 160),
      offer: clamp(offer, 50),
      bullets: (bullets || []).slice(0, 3).map(b => clamp(sentenceCase(softRewrite(b)), 46)),
      disclaimers: clamp(disclaimers, 160),
      cta: clamp(sentenceCase(softRewrite(cta)), 24),
    };

    // IMPORTANT: return headline/description directly too (easy frontend wiring)
    return res.json({
      ok: true,
      copy,
      headline: copy.headline,
      description: copy.subline,
    });
  } catch (e) {
    console.error("summarize-ad-copy error:", e?.message || e);
    return res.status(400).json({ ok: false, error: "copy_failed" });
  }
});

module.exports = router;
