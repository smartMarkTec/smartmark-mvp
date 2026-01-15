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

// Optional basic auth (enabled only if BASIC_AUTH_USER + BASIC_AUTH_PASS are set)
router.use(basicAuth());

// ---------- Per-route rate limits (MVP) ----------
const limitChat = basicRateLimit({ windowMs: 60 * 1000, max: 30 });
const limitSubline = basicRateLimit({ windowMs: 60 * 1000, max: 40 });
const limitSummarize = basicRateLimit({ windowMs: 60 * 1000, max: 20 });

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

// ---------- Route: chat (reactive + guardrails) ----------
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

// ---------- coherent 7–9 word subline generator ----------
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

// ---------- summarize-ad-copy (JSON) ----------
router.post(["/summarize-ad-copy", "/gpt/summarize-ad-copy"], limitSummarize, async (req, res) => {
  try {
    const a = (req.body && req.body.answers) || {};
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const system =
      "You write concise ad copy. Return strict JSON with keys: " +
      "headline (<=8 words), subline (7–14 words), offer (short, optional), " +
      "bullets (array of up to 3 short items), disclaimers (short, optional), cta (2–3 words). " +
      "No brand-superlatives (best, #1, premium, luxury). No URLs. No 'our/we' language.";

    const user = [
      `Industry: ${a.industry || ""}`,
      `Business: ${a.businessName || ""}`,
      `Location: ${a.city ? (a.state ? `${a.city}, ${a.state}` : a.city) : (a.location || "")}`,
      `Audience: ${a.idealCustomer || ""}`,
      `Main benefit: ${a.mainBenefit || a.details || ""}`,
      `Offer: ${a.offer || a.saveAmount || ""}`,
      `Secondary: ${a.secondary || a.financingLine || ""}`
    ].join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 220,
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

    const copy = {
      headline: clamp(parsed.headline || "", 55),
      subline: clamp(parsed.subline || "", 140),
      offer: clamp(parsed.offer || "", 40),
      bullets: arr(parsed.bullets || []).slice(0, 3).map(b => clamp(b, 40)),
      disclaimers: clamp(parsed.disclaimers || "", 160),
      cta: clamp(parsed.cta || "Learn more", 24)
    };

    return res.json({ ok: true, copy });
  } catch (e) {
    console.error("summarize-ad-copy error:", e?.message || e);
    return res.status(400).json({ ok: false, error: "copy_failed" });
  }
});

module.exports = router;
