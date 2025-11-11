// server/routes/gpt.js
/* eslint-disable */
const express = require("express");
const router = express.Router();
const OpenAI = require("openai"); // npm i openai

// ---------- Minimal, safe OpenAI client ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------- Small helpers shared by both routes ----------
const FALLBACK_CHAT =
  "I'm your AI Ad Manager—ask me anything about launching ads, creatives, or budgets.";

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
function categoryFallback(category = "generic") {
  const MAP = {
    fashion: [
      "Modern fashion built for everyday wear",
      "Natural materials for everyday wear made simple",
      "Simple pieces built to last every day"
    ],
    books: ["New stories and classic runs to explore","Graphic novels and comics for quiet nights"],
    cosmetics: ["Gentle formulas for daily care and glow","A simple routine for better skin daily"],
    hair: ["Better hair care with less effort daily","Clean formulas for easy styling each day"],
    food: ["Great taste with less hassle every day","Fresh flavor made easy for busy nights"],
    pets: ["Everyday care for happy pets made simple","Simple treats your pet will love daily"],
    electronics: ["Reliable tech for everyday use and value","Simple design with solid performance daily"],
    home: ["Upgrade your space the simple practical way","Clean looks with everyday useful function"],
    coffee: ["Balanced flavor for better breaks each day","Smooth finish in every cup every day"],
    fitness: ["Made for daily training sessions that stick","Durable gear built for consistent workouts"],
    generic: ["Made for everyday use with less hassle","Simple design that is built to last"]
  };
  const arr = MAP[category] || MAP.generic;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------- Route: chat (unchanged) ----------
router.post("/gpt-chat", async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Please provide a message." });
  }

  const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];
  const messages = [
    {
      role: "system",
      content:
        "You are SmartMark, a concise, friendly AI Ad Manager. Keep replies brief (1-3 sentences). " +
        "Answer questions about advertising, creatives, targeting, and budgets. " +
        "DO NOT ask the user the survey questions; the UI handles that. " +
        "If the user asks something unrelated to ads, still be helpful but brief."
    },
    ...trimmedHistory,
    ...(trimmedHistory.length && trimmedHistory[trimmedHistory.length - 1]?.role === "user"
      ? []
      : [{ role: "user", content: message.slice(0, 2000) }])
  ];

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.5,
      max_tokens: 250
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || FALLBACK_CHAT;
    if (completion.usage) {
      console.log(
        "[SmartMark GPT] tokens:",
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
        completion.usage.total_tokens
      );
    }
    res.json({ reply });
  } catch (err) {
    console.error("GPT error:", err?.message || err);
    res.json({ reply: FALLBACK_CHAT });
  }
});

// ---------- NEW: coherent 7–9 word subline generator ----------
router.post("/coherent-subline", async (req, res) => {
  const { answers = {}, category = "generic", seed = "" } = req.body || {};

  // Extract facts for the prompt and for fallback validation
  const productTerms = takeTerms(answers.productType || answers.topic || answers.title || "");
  const benefitTerms = takeTerms(answers.mainBenefit || answers.description || "");
  const audienceTerms = takeTerms(answers.audience || answers.target || answers.customer || "", 2);
  const locationTerm = takeTerms(answers.location || answers.city || answers.region || "", 1)[0] || "";

  // Gentle normalization to prevent “clothing quality …” glitches
  let productHead = productTerms[0] || "";
  if ((category || "").toLowerCase() === "fashion") {
    if (!/shirt|tee|top|dress|skirt|jean|pant|jacket|hoodie|outfit|wear/i.test(productHead)) {
      productHead = "fashion";
    }
  }
  if (productHead === "quality") productHead = "products";

  const system = [
    "You are SmartMark's subline composer.",
    "Write ONE short ad subline of 7–9 words, plain language, sentence case.",
    "Must be coherent English and read naturally.",
    "No buzzwords, no claims you can't infer from inputs, no website/domain.",
    "Do NOT end on a preposition (to, for, with, of, in, on, at, by).",
    "Keep it brand-safe and factual; avoid 'our', 'we', 'best', 'premium', 'luxury'.",
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

  // Validate and fix server-side (always)
  if (!line) line = categoryFallback(category);
  // strip quotes/extra punctuation etc.
  line = line.replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, "");
  line = ensure7to9Words(line);

  // Extra guard: simple “modern fashion …” style fix for fashion category
  if (category.toLowerCase() === "fashion") {
    const badCombo = /\b(fashion)\s+modern\b/i.test(line) || /\bmodern\s+built\b/i.test(line);
    if (badCombo) line = "Modern fashion built for everyday wear";
    // also prevent “fashion modern built into clothing essentials …”
    line = line.replace(/\bfashion modern built into\b/i, "Modern fashion built for");
  }

  return res.json({ subline: line });
});

module.exports = router;
