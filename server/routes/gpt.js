// server/routes/gpt.js
/* eslint-disable */
const express = require("express");
const router = express.Router();
const OpenAI = require("openai"); // npm i openai

// ---------- Minimal, safe OpenAI client ----------
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// ---------- Small helpers shared by routes ----------
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

// Soft rewrite to avoid echoing raw user lines
function softRewrite(line = "") {
  let s = String(line).replace(/\s+/g, " ").trim();
  s = s.replace(/\b(our|we|my|I)\b/gi, "").replace(/\s{2,}/g, " ").trim();
  // drop trailing punctuation/commas
  s = s.replace(/[.,;:!?-]+$/g, "");
  return s;
}

// Jaccard similarity over word sets (very crude)
function similarity(a = "", b = "") {
  const A = new Set(clean(a).split(" ").filter(Boolean));
  const B = new Set(clean(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach(w => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Clamp to max words (rough, keeps meaning)
function clampWords(s = "", max = 10) {
  const w = String(s).trim().split(/\s+/).filter(Boolean);
  return w.length > max ? w.slice(0, max).join(" ") : s.trim();
}

// ---------- Simple rule-based fallback composer ----------
function fallbackCopy(answers = {}) {
  const ind = (answers.industry || "").toLowerCase();
  const brand = (answers.businessName || "Your Brand").toString();
  const city = (answers.location || answers.city || "").toString();
  const benefit = (answers.mainBenefit || answers.details || answers.valueProp || "").toString();
  const offer = (answers.offer || answers.saveAmount || "").toString();

  let headline;
  if (/fashion|apparel|clothing|boutique|shoe|jewel/.test(ind)) {
    headline = benefit ? sentenceCase(clampWords(benefit, 6)) : "New Season Essentials";
  } else if (/restaurant|food|cafe|pizza|burger|grill|bar/.test(ind)) {
    headline = benefit ? sentenceCase(clampWords(benefit, 6)) : "Fresh. Fast. Crave Worthy";
  } else if (/floor|carpet|tile|vinyl|hardwood/.test(ind)) {
    headline = benefit ? sentenceCase(clampWords(benefit, 6)) : "Upgrade Your Floors";
  } else {
    headline = benefit ? sentenceCase(clampWords(benefit, 6)) : "Quality You Can Feel";
  }

  const subParts = [];
  if (answers.idealCustomer) subParts.push(`Made for ${answers.idealCustomer}`);
  if (city) subParts.push(city);
  if (!subParts.length) subParts.push("Easy returns • Fast shipping");

  const bullets = [];
  if (offer) bullets.push(offer);
  bullets.push("Simple choices • Great value");
  bullets.push("Hassle free setup");

  return {
    headline: softRewrite(headline),
    subline: softRewrite(subParts.join(" • ")),
    offer: offer || "",
    secondary: "",
    bullets,
    disclaimers: ""
  };
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

// ---------- NEW: summarize-ad-copy (JSON) ----------
router.post(["/summarize-ad-copy", "/gpt/summarize-ad-copy"], async (req, res) => {
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
      `Secondary: ${a.secondary || a.financingLine || ""}`,
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


/* ========= NEW: summarize answers → structured ad copy (JSON) =========
   Input:  { answers: {...}, industry?: string }
   Output: { ok:true, copy:{ headline, subline, offer, secondary, bullets[], disclaimers } }
*/
router.post("/summarize-ad-copy", async (req, res) => {
  const { answers = {}, industry = answers.industry || "generic" } = (req.body || {});
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  // ---- facts for prompting ----
  const facts = {
    businessName: answers.businessName || "",
    industry: (industry || "").toString(),
    location: answers.location || answers.city || "",
    idealCustomer: answers.idealCustomer || answers.audience || "",
    mainBenefit: answers.mainBenefit || answers.benefit || answers.details || "",
    offer: answers.offer || answers.saveAmount || "",
  };

  // ---- local helpers (self-contained) ----
  const titleCase = (s="") =>
    s.toLowerCase().replace(/\s+/g," ").trim().replace(/\b([a-z])/g,(m,c)=>c.toUpperCase());

  const sanitizeHeadline = (s="") => {
    let t = String(s)
      .replace(/https?:\/\/\S+/g," ")
      .toLowerCase()
      .replace(/\b(we|our|my|your|they|their|i|promise|guarantee|best|premium|luxury|perfect|cheap)\b/g," ")
      .replace(/[^\w\s%]/g," ")
      .replace(/\s+/g," ")
      .trim();
    const words = t.split(" ").filter(Boolean).slice(0,6);
    if (!words.length) return "New Season Essentials";
    return titleCase(words.join(" "));
  };

  const tightenOfferText = (s = "") => {
    let t = String(s || "").toLowerCase()
      .replace(/https?:\/\/\S+/g," ")
      .replace(/[^\w\s%$]/g," ")
      .replace(/\s+/g," ")
      .trim();
    if (!t) return "";

    const pct = t.match(/(?:up to\s*)?(\d{1,3})\s*%/i);
    const upTo = /up to/.test(t);
    if (pct) {
      let out = (upTo ? `UP TO ${pct[1]}%` : `${pct[1]}%`) + " OFF";
      if (/\b(first|1st)\s+(order|purchase)\b/.test(t)) out += " FIRST ORDER";
      return out;
    }
    const dol = t.match(/\$?\s*(\d+)\s*(?:off|discount|rebate)/i);
    if (dol) return `$${dol[1]} OFF`;
    if (/buy\s*1\s*get\s*1/i.test(t)) return "BUY 1 GET 1";

    return t
      .replace(/\b(we|our|you|your|they|their|will|get|receive|customers)\b/g,"")
      .replace(/\s+/g," ")
      .trim()
      .toUpperCase();
  };

  // ---- HEADLINE (3–6 words, no we/our) ----
  let aiHeadline = "";
  try {
    const sysHead = "Write a short, brand-safe AD HEADLINE of 3–6 words. No 'we/our/my/your'. No punctuation at end. Return only the headline.";
    const userHead = [
      `Category: ${facts.industry || "generic"}`,
      facts.businessName ? `Brand: ${facts.businessName}` : "",
      facts.mainBenefit ? `Benefit: ${facts.mainBenefit}` : "",
      facts.idealCustomer ? `Audience: ${facts.idealCustomer}` : "",
      facts.location ? `Location: ${facts.location}` : ""
    ].filter(Boolean).join("\n");

    const r = await client.chat.completions.create({
      model, temperature: 0.2, max_tokens: 20,
      messages: [{ role: "system", content: sysHead }, { role: "user", content: userHead }]
    });
    aiHeadline = (r.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.warn("summarize-ad-copy(headline) error:", e?.message);
  }

  // ---- SUBLINE (7–9 words, sentence case, coherent) ----
  let aiSubline = "";
  try {
    const sysSub = "Write ONE ad subline of 7–9 words, sentence case, no 'we/our', no hype, no website. Return only the subline.";
    const r = await client.chat.completions.create({
      model, temperature: 0.2, max_tokens: 24,
      messages: [{ role: "system", content: sysSub }, { role: "user", content: JSON.stringify(facts) }]
    });
    aiSubline = (r.choices?.[0]?.message?.content || "").trim();
  } catch (e) {
    console.warn("summarize-ad-copy(subline) error:", e?.message);
  }

  // ---- Post-process + fallbacks ----
  const cleanHeadline = sanitizeHeadline(aiHeadline || facts.mainBenefit || facts.businessName || "New Season Essentials")
    .replace(/[.,!?]+$/,"");
  const finalSub = sentenceCase(aiSubline || ensure7to9Words(cleanHeadline));
  const compactOffer = tightenOfferText(facts.offer);

  const copy = {
    headline: cleanHeadline,
    subline: finalSub,
    offer: compactOffer,
    secondary: "",
    bullets: [],
    disclaimers: ""
  };

  return res.json({ ok: true, copy });
});

module.exports = router;
