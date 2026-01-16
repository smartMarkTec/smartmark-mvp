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

  return res.json({ subline: line });
});

// ---------- summarize-ad-copy (JSON) ----------
router.post(["/summarize-ad-copy", "/gpt/summarize-ad-copy"], limitSummarize, async (req, res) => {
  try {
    const a = (req.body && req.body.answers) || {};
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

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
      s = s.replace(/[“”"']/g, "").replace(/[.,;:!?]+$/g, "").trim();
      s = clampWords(s, 8);
      if (!s) return "";
      return s[0].toUpperCase() + s.slice(1);
    };

    const safeSubline = (s = "") => {
      s = stripWeOur(s);
      s = s.replace(/[“”"']/g, "").replace(/[.]+$/g, "").trim();
      s = String(s || "").replace(/\s+/g, " ").trim();
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > 14) return words.slice(0, 14).join(" ");
      return s;
    };

    const buildFallbackHeadline = () => {
      const industry = String(a.industry || "").trim();
      const benefit = String(a.mainBenefit || a.details || "").trim();
      const offer = String(a.offer || a.saveAmount || "").trim();

      const benefitTerms = takeTerms(benefit, 3).join(" ");
      const indTerms = takeTerms(industry, 2).join(" ");

      if (offer) return safeHeadline(`Limited-time ${offer}`);
      if (benefitTerms) return safeHeadline(`${benefitTerms} made simple`);
      if (indTerms) return safeHeadline(`Better ${indTerms} for busy days`);
      return "Made for everyday use";
    };

    const buildFallbackSubline = (headline) => {
      const industry = String(a.industry || "").trim();
      const audience = String(a.idealCustomer || "").trim();
      const benefit = String(a.mainBenefit || a.details || "").trim();
      const offer = String(a.offer || a.saveAmount || "").trim();

      const chunks = [];
      if (benefit) chunks.push(benefit);
      else if (industry) chunks.push(`Clean, modern ${industry} that fits your needs`);
      else chunks.push("Clean, modern design that fits your needs");

      if (audience) chunks.push(`Built for ${audience}.`);
      if (offer) chunks.push(`Offer: ${offer}.`);

      let out = chunks.join(" ").replace(/\s+/g, " ").trim();
      if (headline && norm(out).startsWith(norm(headline))) out = out.slice(headline.length).trim();
      return safeSubline(out);
    };

    const system =
      "You are a professional direct-response copywriter. " +
      "Return strict JSON with keys: headline (<=8 words), subline (7–14 words), offer (short, optional), " +
      "bullets (array up to 3), disclaimers (short, optional), cta (2–3 words). " +
      "Hard rules: NO URLs. NO 'our/we' language. NO brand-superlatives (best, #1, premium, luxury). " +
      "Do NOT copy phrases verbatim from inputs; paraphrase and summarize. " +
      "Headline and subline must not repeat each other.";

    const user = [
      `Industry: ${a.industry || ""}`,
      `Business: ${a.businessName || ""}`,
      `Location: ${a.city ? (a.state ? `${a.city}, ${a.state}` : a.city) : (a.location || "")}`,
      `Audience: ${a.idealCustomer || ""}`,
      `Main benefit: ${a.mainBenefit || a.details || ""}`,
      `Offer: ${a.offer || a.saveAmount || ""}`,
      `Secondary: ${a.secondary || a.financingLine || ""}`,
    ].join("\n");

    const completion = await client.chat.completions.create({
      model,
      temperature: 0.45, // more variety, less echo
      max_tokens: 240,
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

    // kill “our/we” beginnings if any slipped
    headline = headline.replace(/^\s*(our|we)\b\s*/i, "").trim();
    subline = subline.replace(/^\s*(our|we)\b\s*/i, "").trim();

    // if headline echoes benefit too closely, regenerate fallback
    if (mainBenefit && (jaccard(headline, mainBenefit) > 0.75 || norm(headline) === norm(mainBenefit))) {
      headline = buildFallbackHeadline();
    }

    if (!subline) subline = buildFallbackSubline(headline);

    // prevent repeats between headline and subline
    if (jaccard(headline, subline) > 0.55 || norm(subline).startsWith(norm(headline))) {
      subline = buildFallbackSubline(headline);
    }

    // if still too close to full source, force fallbacks
    if (jaccard(headline, source) > 0.65) headline = buildFallbackHeadline();
    if (jaccard(subline, source) > 0.70) subline = buildFallbackSubline(headline);

    // bullets fallback
    if (!bullets.length) {
      const ind = String(a.industry || "services").trim().toLowerCase();
      if (ind.includes("fashion")) bullets = ["New arrivals weekly", "Everyday fits", "Easy returns"];
      else if (ind.includes("restaurant") || ind.includes("food")) bullets = ["Fresh ingredients", "Fast pickup", "Local favorites"];
      else bullets = ["Clear offer", "Clean design", "Strong call to action"];
      bullets = bullets.map((b) => clamp(b, 40));
    }

    cta = cta.replace(/[.]+$/g, "").trim();
    if (!cta) cta = "Learn more";

    const copy = {
      headline: clamp(headline, 55),
      subline: clamp(subline, 140),
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
