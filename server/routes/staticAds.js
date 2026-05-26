/* eslint-disable */
"use strict";

const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const sharp = require("sharp");

/* ------------------------ Paths / URLs ------------------------ */

const GEN_DIR =
  process.env.GENERATED_DIR ||
  path.join(process.cwd(), "server", "public", "generated");

fs.mkdirSync(GEN_DIR, { recursive: true });

function makeMediaUrl(req, filename) {
  const base =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  return `${base}/api/media/${filename}`;
}

/* ------------------------ CORS ------------------------ */

router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Range"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges"
  );

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ------------------------ HTTP helpers ------------------------ */

function fetchUpstream(
  method,
  url,
  extraHeaders = {},
  bodyBuf = null,
  timeoutMs = 15000
) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;

      const req = lib.request(
        url,
        {
          method,
          timeout: timeoutMs,
          headers: extraHeaders,
        },
        (res) => {
          const chunks = [];

          res.on("data", (d) => chunks.push(d));
          res.on("error", reject);
          res.on("end", () => {
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            });
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", () => {
        req.destroy(new Error(`HTTP timeout after ${timeoutMs}ms`));
      });

      if (bodyBuf) req.write(bodyBuf);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

/* ------------------------ Small helpers ------------------------ */

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function isBlankOrSkipped(value) {
  const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
  return !s || ["skip", "skipped", "none", "n/a", "na", "-", "no", "no phone", "no website", "not provided"].includes(s);
}

function titleCase(s) {
  return clean(s)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function clip(s, max) {
  const out = clean(s);
  if (!out) return "";
  return out.length > max ? `${out.slice(0, max - 3).trim()}...` : out;
}

/* Truncate at the last word boundary — no trailing "..." so the model renders the
   full text rather than the ellipsis character literally.
   Also strips any trailing preposition/article/conjunction that would leave a
   dangling incomplete phrase (e.g. "HVAC Services in" → "HVAC Services"). */
const DANGLING_TAIL = /^(in|at|for|of|to|by|a|an|the|and|or|nor|with|from|near|on|as|into|onto|per|via|that|when|where|which|but|both|either|neither|whether|so)$/i;

function wordTrim(s, maxChars) {
  const out = clean(s);
  if (!out || out.length <= maxChars) return out;
  const sub = out.slice(0, maxChars);
  const lastSpace = sub.lastIndexOf(" ");
  let trimmed = lastSpace > 4 ? sub.slice(0, lastSpace) : sub.slice(0, maxChars);
  // Drop trailing dangling words so we never emit "Services in" or "Care for"
  const words = trimmed.split(/\s+/);
  while (words.length > 1 && DANGLING_TAIL.test(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

function safeFilenamePart(s) {
  return clean(s).replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
}

function inferIndustry(a = {}) {
  return clean(a.industry || a.businessType || a.niche || "business");
}

/* Keyword → finished ad copy pairs.
   Used to transform raw user benefit text into polished marketing language. */
const OUTCOME_PATTERNS = [
  { re: /\b(leads?|inquir|prospect)\b/i,
    headline: "More Leads, Less Guesswork",
    support: "Campaigns built to bring in qualified customers for your business." },
  { re: /\b(roi|return.on.invest|revenue|profit)\b/i,
    headline: "Marketing That Pays Off",
    support: "Strategies built to deliver measurable returns on every dollar you spend." },
  { re: /\b(sales|conversions?|customer|client)\b/i,
    headline: "Grow Your Customer Base",
    support: "Smart campaigns that turn attention into real, paying customers." },
  { re: /\b(traffic|clicks?|visits?|web)\b/i,
    headline: "More Clicks, More Business",
    support: "Drive the right visitors to your site with focused, targeted campaigns." },
  { re: /\b(awareness|visib|brand|recognit)\b/i,
    headline: "Get Noticed Locally",
    support: "Build real presence where your customers already spend their time." },
  { re: /\b(time|effic|automat|faster|quicker)\b/i,
    headline: "Save Time, Grow Faster",
    support: "Streamlined marketing that lets you focus on running your business." },
  { re: /\b(savings?|cost|budget|afford)\b/i,
    headline: "Smarter Marketing, Better Value",
    support: "Get stronger results without overspending on your marketing budget." },
  { re: /\b(trust|credib|reputation|review|refer)\b/i,
    headline: "Build Trust That Converts",
    support: "A stronger local reputation drives more referrals and repeat business." },
  { re: /\b(calls?|phone|book|appoint|schedul)\b/i,
    headline: "More Calls, More Jobs",
    support: "Reach customers who are ready to book or call you right now." },
  { re: /\b(rank|seo|search|google|found)\b/i,
    headline: "Show Up Where It Counts",
    support: "Get discovered by local customers searching for exactly what you offer." },
  { re: /\b(grow|growth|scal|expand)\b/i,
    headline: "Built for Business Growth",
    support: "A marketing approach designed to scale with you as your business grows." },
  { re: /\b(result|outcome|perform|success)\b/i,
    headline: "Results You Can Measure",
    support: "Clear goals, real tracking, and campaigns built to actually perform." },
  { re: /\b(comfort|cool|warm|temperat|indoor)\b/i,
    headline: "Comfort You Can Count On",
    support: "Reliable service that keeps your home comfortable all year long." },
  { re: /\b(clean|spotless|fresh|tidy)\b/i,
    headline: "Clean Home, Clear Mind",
    support: "Professional cleaning you can count on for every room, every time." },
  { re: /\b(safe|secur|protect|peace.of.mind)\b/i,
    headline: "Peace of Mind, Guaranteed",
    support: "Trusted professionals keeping your home and family protected." },
];

function matchOutcomePattern(rawText) {
  const s = clean(rawText).toLowerCase();
  for (const p of OUTCOME_PATTERNS) {
    if (p.re.test(s)) return { headline: p.headline, support: p.support };
  }
  return null;
}

/* Random pick from a small array — used to vary copy and visual mood across runs. */
function pickOne(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* Returns true if a string looks like raw user input — first-person company voice,
   explicit claim/promise language, or percentage figures. These should not pass
   directly to the image prompt as ad copy. */
function looksLikeRawClaim(s = "") {
  const t = clean(s).toLowerCase();
  return (
    /\b(our|we)\b/.test(t) ||
    /\b(promise|guarantee|will give|will produce|will provide|will increase|will grow|will help|will boost|will get you)\b/.test(t) ||
    /\d+\s*%/.test(t)
  );
}

function deriveHeadline(a = {}, craftedCopy = {}) {
  const copyHeadline = clean(craftedCopy.headline || "");

  // 1. Use pre-crafted headline if it doesn't look like raw user input.
  // Allow up to 40 chars — enough for a natural 6-7 word headline without truncating it mid-thought.
  if (copyHeadline && !looksLikeRawClaim(copyHeadline)) return wordTrim(copyHeadline, 40);

  // Combine incoming copy + raw benefit as source material for pattern matching
  const rawPool = copyHeadline || clean(a.mainBenefit || a.benefit || "");

  // 2. Try keyword → marketing pattern match
  if (rawPool) {
    const match = matchOutcomePattern(rawPool);
    if (match) return match.headline;
  }

  // 3. Use benefit verbatim only if ≤4 words and not a claim
  const mainBenefit = clean(a.mainBenefit || a.benefit || "");
  const benefitWords = mainBenefit.split(/\s+/).filter(Boolean);
  if (mainBenefit && benefitWords.length <= 4 && !looksLikeRawClaim(mainBenefit)) {
    return wordTrim(titleCase(mainBenefit), 28);
  }

  // 4. Industry-specific short headlines (randomized to avoid repetition)
  const ind = inferIndustry(a).toLowerCase();
  if (/hvac|heating|cooling|air.?cond/.test(ind))      return pickOne(["AC fixed same day.", "Heating and cooling done right.", "Comfort restored fast.", "Same-day HVAC service."]);
  if (/plumb/.test(ind))                                return pickOne(["Leak fixed fast.", "Plumbing problems solved today.", "Licensed plumber, shows up on time."]);
  if (/electr/.test(ind))                               return pickOne(["Electrical work done safely.", "Licensed electrician, real prices.", "Power issues fixed fast."]);
  if (/roof/.test(ind))                                 return pickOne(["Roof replaced before it rains.", "New roof, free estimate.", "Roofing done right the first time."]);
  if (/landscap|lawn/.test(ind))                        return pickOne(["Lawn looking great every week.", "Professional lawn care, no hassle.", "Curb appeal done right."]);
  if (/restaurant|food|cater/.test(ind))                return pickOne(["Fresh food, ready when you are.", "Real ingredients, real flavor.", "Great food, made right here."]);
  if (/market|advertis|agency/.test(ind))               return pickOne(["More leads, less guesswork.", "Marketing that brings in customers.", "Ads that actually work."]);
  if (/insur/.test(ind))                                return pickOne(["Coverage that fits your life.", "Protected when it matters most.", "Insurance made simple."]);
  if (/dental|dent/.test(ind))                          return pickOne(["Healthy smile starts here.", "Dental care done right.", "Comfortable visits, healthy results."]);
  if (/legal|law/.test(ind))                            return pickOne(["Legal help when you need it.", "Real legal advice, real results.", "Protect what matters most."]);
  if (/auto|car|vehicle/.test(ind))                     return pickOne(["Car fixed right the first time.", "Fast auto repair, honest prices.", "Same-day service, real mechanics."]);
  if (/clean|maid/.test(ind))                           return pickOne(["Home cleaned top to bottom.", "Spotless every single visit.", "Professional cleaning done right."]);
  if (/pest/.test(ind))                                 return pickOne(["Pests gone, guaranteed.", "Home protected from pests today.", "Pest-free living starts here."]);
  if (/real.?estate|realt/.test(ind))                   return pickOne(["Find the right home today.", "Buy or sell with confidence.", "Real estate done right."]);
  if (/fitness|gym|personal.?train/.test(ind))          return pickOne(["Reach your fitness goals faster.", "Real results, real training.", "Get fit with a real plan."]);
  if (/salon|hair|beauty/.test(ind))                    return pickOne(["Look great, feel confident.", "Salon results that last.", "Professional styling, every time."]);
  if (/pet|animal|vet/.test(ind))                       return pickOne(["Your pet deserves the best.", "Compassionate care for every pet.", "Healthy pets, happy families."]);
  if (/child|kid|daycare|school/.test(ind))             return pickOne(["Where kids thrive every day.", "Safe, nurturing care they deserve.", "A great place to grow and learn."]);

  // 5. Short business name as final fallback
  const businessName = clean(a.businessName || a.brand || "");
  if (businessName && businessName.split(/\s+/).length <= 3) return wordTrim(businessName, 28);

  return "Local Experts, Real Results";
}

/* Trim AI-generated support copy to a length that renders cleanly inside the image.
   Prefers a complete first sentence (≤13 words). If the first sentence is too long,
   returns a word-trimmed version rather than nothing — a short fragment beats a blank. */
function imageSafeSupport(s) {
  const full = clean(s);
  if (!full) return "";
  const firstSentMatch = full.match(/^(.+?[.!?])(?:\s|$)/);
  if (firstSentMatch) {
    const sent = firstSentMatch[1].trim();
    const words = sent.split(/\s+/).filter(Boolean);
    if (words.length <= 13) return sent;
    // Sentence slightly too long — trim to 11 words at a word boundary
    return words.slice(0, 11).join(" ");
  }
  // No sentence-ending punctuation — word-trim to 10 words
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length <= 10) return full;
  return words.slice(0, 10).join(" ");
}

function deriveSupportLine(a = {}, craftedCopy = {}) {
  const subline = clean(craftedCopy.subline || craftedCopy.body || "");

  // 1. Use pre-crafted subline trimmed to image-safe length
  if (subline && !looksLikeRawClaim(subline)) return imageSafeSupport(subline);

  // Combine incoming copy + raw benefit as source material for pattern matching
  const rawPool = subline || clean(a.mainBenefit || a.benefit || "");

  // 2. Try keyword → marketing pattern match
  if (rawPool) {
    const match = matchOutcomePattern(rawPool);
    if (match) return match.support;
  }

  // 3. Use idealCustomer only if it's short and not a raw claim
  const idealCustomer = clean(a.idealCustomer || "");
  if (idealCustomer && idealCustomer.length <= 55 && !looksLikeRawClaim(idealCustomer)) {
    return clip(idealCustomer, 80);
  }

  // 4. Use mainBenefit only if ≤8 words and not a claim
  const mainBenefit = clean(a.mainBenefit || a.benefit || "");
  if (mainBenefit && mainBenefit.split(/\s+/).filter(Boolean).length <= 8 && !looksLikeRawClaim(mainBenefit)) {
    return clip(mainBenefit, 80);
  }

  // 5. Industry-based fallback support lines (randomized to avoid repetition)
  const ind = inferIndustry(a).toLowerCase();
  if (/market|advertis|agency/.test(ind))  return pickOne(["Practical marketing built for local businesses that want real results.", "Campaigns designed to bring in qualified customers, not just clicks.", "Focused strategies that grow your business without the guesswork."]);
  if (/hvac|heating|cooling/.test(ind))    return pickOne(["Fast, reliable service from technicians you can trust.", "Same-day service from local HVAC professionals.", "Keep your home comfortable with experienced local technicians.", "Certified technicians ready when your system needs attention."]);
  if (/plumb/.test(ind))                   return pickOne(["Local plumbers ready to help when you need it most.", "Fast response, quality work, honest pricing."]);
  if (/clean|maid/.test(ind))              return pickOne(["Professional cleaning you can count on, every visit.", "Thorough, reliable cleaning for homes and businesses."]);
  if (/roof/.test(ind))                    return pickOne(["Expert roofing from a team your neighbors already trust.", "Quality materials, professional installation, lasting results."]);
  if (/dental|dent/.test(ind))             return pickOne(["Gentle, professional care for your whole family.", "Comfortable dental visits for patients of all ages."]);
  if (/auto|car|vehicle/.test(ind))        return pickOne(["Honest service from mechanics who take pride in their work.", "Fast, reliable auto repair from your local experts."]);

  return "";
}

function deriveCTA(a = {}, craftedCopy = {}) {
  const cta = clean(craftedCopy.cta || a.cta || "");
  if (cta) return clip(cta, 26);

  if (clean(a.offer || a.promo || craftedCopy.offer || "")) return "Claim Your Offer";

  // Phone-only — call is the natural CTA
  if (!clean(a.website || a.url || "") && clean(a.phone || "")) return "Call Now";

  // Industry-aware last resort — "Learn More" is too weak for service businesses
  const _ind = inferIndustry(a).toLowerCase();
  if (/hvac|heating|cooling|air.?cond/.test(_ind)) return "Schedule Service";
  if (/plumb/.test(_ind))                           return "Get a Free Quote";
  if (/electr/.test(_ind))                          return "Get a Free Quote";
  if (/roof/.test(_ind))                            return "Get a Free Estimate";
  if (/landscap|lawn/.test(_ind))                   return "Get a Free Quote";
  if (/clean|maid/.test(_ind))                      return "Book a Cleaning";
  if (/dental|dent/.test(_ind))                     return "Book an Appointment";
  if (/legal|law/.test(_ind))                       return "Book a Consultation";
  if (/auto|car|vehicle/.test(_ind))                return "Schedule Service";
  return "Get a Free Quote";
}

function deriveOffer(a = {}, craftedCopy = {}) {
  return clean(craftedCopy.offer || a.offer || a.promo || "");
}


/* ------------------------ Ad prompt builder (text-to-image path) ------------------------
   Step A: extract business facts from form answers + optional website content.
             Form answers always win — website content fills gaps only.
   Step B: wrap into a natural image-generation prompt with an optional
             industry visual hint (currently: HVAC). No layout templates. */
function buildAdPrompt(a = {}, craftedCopy = {}, webContent = null, logoFound = false) {
  const businessName  = clean(a.businessName || a.brand || a.business || a.company || "Local Business");
  const industry      = clean(a.industry || a.businessType || a.niche || "business");
  const city          = isBlankOrSkipped(a.city) ? "" : clean(a.city || "");
  const state         = isBlankOrSkipped(a.state) ? "" : clean(a.state || "");
  const idealCustomer = clean(a.idealCustomer || "");
  const mainBenefit   = clean(a.mainBenefit || a.details || a.benefit || "");
  const phone         = isBlankOrSkipped(a.phone) ? "" : clean(a.phone || "");
  const website       = isBlankOrSkipped(a.website || a.url) ? "" : clean(a.website || a.url || "");
  const rawOffer      = clean(craftedCopy.offer || a.offer || a.promo || "");
  const hasOffer      = rawOffer && !["no","none","n/a","na","-","no offer","no promo","nothing"].includes(rawOffer.toLowerCase());
  const offer         = hasOffer ? clip(rawOffer, 70) : "";
  const locationText  = [city, state].filter(Boolean).join(", ");
  const headline      = deriveHeadline(a, craftedCopy);
  const supportLine   = deriveSupportLine(a, craftedCopy);
  const cta           = deriveCTA(a, craftedCopy);

  // Step A — structured business summary (form answers are canonical)
  const summaryLines = [
    `Business: ${businessName}`,
    `Industry: ${industry}`,
    locationText  ? `Location: ${locationText}` : null,
    idealCustomer ? `Audience: ${idealCustomer}` : null,
    mainBenefit   ? `Service: ${mainBenefit}` : null,
    offer         ? `Offer: "${offer}"` : null,
    headline      ? `Headline: "${headline}"` : null,
    supportLine   ? `Supporting text: "${supportLine}"` : null,
    `CTA: "${cta}"`,
    phone   ? `Phone: ${phone}` : null,
    website ? `Website: ${website}` : null,
  ].filter(Boolean);

  // Website context is supporting only — never replaces any form field above
  if (webContent?.headline)    summaryLines.push(`Context (from website): "${webContent.headline}"`);
  if (webContent?.description) summaryLines.push(`About (from website): "${clip(webContent.description, 180)}"`);

  const summary = summaryLines.join("\n");

  // Prevent URL hallucination; explicitly block invented URLs when no website was provided
  const websiteNote = website
    ? ` If any website URL appears in the image, use exactly "${website}" — do not invent or alter it.`
    : " Do not display any website URL or web address — none was provided.";
  const phoneNote = phone
    ? ""
    : " Do not display any phone number — none was provided.";

  // Per-generation creative style seed — applied to every industry, every call.
  // Describes ad composition energy and visual approach ONLY — not specific objects or scenes.
  // The business summary below determines subject matter; this seed sets the creative style.
  const AD_DIRECTIONS = [
    "Make this ad feel clean and confident — polished composition, professional visual presence, modern local-business feel.",
    "Make this ad feel clean and premium — polished, high-quality visual treatment, professional brand aesthetic.",
    "Make this ad feel bright and energetic — open, fresh, visually dynamic, inviting atmosphere.",
    "Make this ad feel trustworthy and established — credible, professionally composed, locally rooted visual story.",
    "Make this ad feel sleek and contemporary — clean design, strong visual hierarchy, modern professional look.",
    "Make this ad feel approachable and professional — warm, credible, visually appealing, clean local business presence.",
    "Make this ad feel simple and direct — clear, service-focused, visually strong, clean professional composition.",
    "Make this ad feel polished and visually strong — well-composed, professional, clean, and visually compelling.",
  ];
  const adDir = AD_DIRECTIONS[Math.floor(Math.random() * AD_DIRECTIONS.length)];
  const industryHint = ` ${adDir}`;
  console.log("[generate-static-ad] ad-direction:", adDir.slice(0, 80));

  // Anti-fake-logo instruction: specific about what is banned (invented brand marks, house icons,
  // manufacturer badges) without suppressing general creative ad design or graphic composition.
  const logoInstruction = logoFound
    ? "\nDo not invent or draw any logo, brand mark, manufacturer badge, house icon, or fake business symbol — a real logo will be composited after generation."
    : "\nDo not invent or draw any logo, brand mark, manufacturer badge, house icon, or fake business symbol. If no real logo is provided, use text branding only.";

  // Step B — natural image-generation prompt
  return `Create a high-quality, visually compelling advertisement image for this business. Make it look like a polished, professionally composed ad creative — photorealistic, creatively designed, and visually engaging. No people in the image. Keep it realistic and not cartoonish.${industryHint}${websiteNote}${phoneNote} The visual can range from clean and modern to bold and eye-catching — choose the approach that best fits the business type and target audience. Use strong, brand-relevant visual storytelling: imagery that reflects the service, the customer experience, or the outcome the business delivers. Avoid generic defaults like laptops on desks, blank office scenes, or unrelated objects — choose a visual that feels specific to this business and its customers. The composition should feel intentional and professionally designed, not cluttered. Use the business details below as the source for all ad copy and claims — do not invent unrelated services, fake offers, fictional locations, or random slogans. Only include contact information and location details explicitly listed in the business context below — do not invent or substitute any phone number, website URL, address, city, state, or other contact detail. Render the headline, supporting text, and CTA exactly as specified in the business context — do not rewrite or replace them. Keep every text element fully inside the visible image area with generous safe margins on all sides. Reserve a clear bottom safe zone: the bottom 15% of the image must remain free of text — never place the final line of copy, CTA, phone number, or website URL near the lower edge. Never crop, cut off, or partially hide any word, letter, headline, business name, phone number, website URL, or CTA — reduce font size if needed to ensure everything fits completely inside the frame. Use concise, readable copy. Let the AI decide the best composition, layout, and visual treatment naturally.

${summary}${logoInstruction}`;
}

/* ------------------------ OpenAI Image Edit (user-uploaded photo path) ------------------------ */

/* Build a multipart/form-data body from fields and file parts. */
function buildMultipartForm(fields, files) {
  const boundary = `----FormBoundary${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  const parts = [];
  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ));
  }
  for (const { name, filename, contentType, data } of files) {
    parts.push(Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
    ));
    parts.push(data);
    parts.push(Buffer.from("\r\n"));
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/* Call the OpenAI image edits endpoint with a user-supplied photo. */
async function generateOpenAIAdImageEdit({ imageBuffer, prompt, size = "1024x1024", quality = "high", n = 1 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const model = "gpt-image-1.5";
  console.log(`[image-edit] model=${model} | quality=${quality} | size=${size} | n=${n}`);

  // Scale to fit within 1024×1024 without cropping, letterboxing with white if needed.
  // Using "cover" was destructive — it cropped portrait/landscape photos and sent a
  // distorted crop to the edit endpoint, producing poor-quality results.
  const pngBuf = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toBuffer();

  const { body, contentType } = buildMultipartForm(
    { model, prompt, n: String(Math.max(1, Math.min(2, Number(n) || 1))), size, quality, output_format: "png" },
    [{ name: "image[]", filename: "photo.png", contentType: "image/png", data: pngBuf }]
  );

  const { status, body: respBuf } = await fetchUpstream(
    "POST",
    "https://api.openai.com/v1/images/edits",
    { Authorization: `Bearer ${key}`, "Content-Type": contentType },
    body,
    180000
  );

  if (status !== 200) {
    let msg = `OpenAI image edit HTTP ${status}`;
    try { msg += ` ${respBuf.toString("utf8").slice(0, 1200)}`; } catch {}
    throw new Error(msg);
  }

  let parsed;
  try { parsed = JSON.parse(respBuf.toString("utf8")); } catch { throw new Error("OpenAI image edit: failed to parse JSON"); }

  const arr = Array.isArray(parsed?.data) ? parsed.data : [];
  if (!arr.length) throw new Error("OpenAI image edit: empty data array");

  const buffers = [];
  for (const item of arr) {
    if (item?.b64_json) buffers.push(Buffer.from(item.b64_json, "base64"));
  }
  if (!buffers.length) throw new Error("OpenAI image edit: missing b64_json");
  return buffers;
}

/* Build the prompt for the image-edit path (user uploaded their own photo).
   The uploaded photo is a creative foundation — the model should transform it into
   a polished ad, not just paste text on top of whatever was uploaded. */
function buildAdEditPromptFromAnswers(a = {}, craftedCopy = {}, { logoFound = false } = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = inferIndustry(a);
  const website = isBlankOrSkipped(a.website || a.url) ? "" : clean(a.website || a.url || "");
  const phone = isBlankOrSkipped(a.phone) ? "" : clean(a.phone || "");
  const offer = clip(deriveOffer(a, craftedCopy), 70);
  const headline = deriveHeadline(a, craftedCopy);
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  const contextLines = [
    `Business: ${businessName}`,
    `Industry: ${industry}`,
    headline    ? `Headline: "${headline}"` : null,
    supportLine ? `Tagline: "${supportLine}"` : null,
    `CTA: "${cta}"`,
    offer   ? `Offer: "${offer}"` : null,
    website ? `Website: ${website}` : null,
    phone   ? `Phone: ${phone}` : null,
  ].filter(Boolean).join("\n");

  return [
    `Transform this uploaded business photo into a high-quality, polished advertisement image for "${businessName}", a ${industry} business.`,
    ``,
    `Use the uploaded photo as the creative foundation. Keep its essential subject matter, but improve the overall visual presentation to make the result feel like a professionally designed ad creative — lively, attractive, and polished. If the original photo is flat, gloomy, dimly lit, or compositionally weak, enhance it: improve the mood, brighten the scene naturally, and make it feel more vibrant and inviting. The result should feel energetic and appealing, not dull or gloomy.`,
    ``,
    `Keep the result photorealistic. Do not turn it into a cartoon, illustration, painting, or any non-photographic style. Keep the composition polished and professionally designed — bold and visually striking compositions are welcome when they suit the business type. No people in the image. Let the AI decide the best overall ad composition and visual treatment naturally.`,
    ``,
    `Text layout: keep every text element fully inside the visible image area with generous safe margins on all sides — do not place any text near the top, bottom, left, or right edge. Reserve a clear bottom safe zone: the bottom 15% of the image must remain free of text — never position the CTA, phone number, website URL, or final line of copy inside this zone. Never crop, cut off, or partially hide any word, letter, headline, business name, phone number, website, or CTA — reduce the font size if needed so everything fits completely inside the frame. Use concise, strong ad copy: a short punchy headline, brief supporting text if needed, and a clear CTA. Avoid large text blocks or dense paragraphs. Text must be fully legible at social-feed viewing sizes.`,
    ``,
    `Business context for the ad — use these as the source for all copy and claims. Do not invent unrelated services, fake offers, or fictional locations:`,
    contextLines,
    ``,
    `Only display the exact contact details listed above. Never invent or hallucinate any website URL, phone number, or contact information.`,
    !website ? `No website was provided — do not display any URL or web address.` : null,
    !phone   ? `No phone number was provided — do not display any phone number.` : null,
    ``,
    logoFound
      ? `A real business logo will be composited onto the image after generation — do not invent or draw any logo, brand mark, manufacturer badge, house icon, or fake business symbol.`
      : `Do not invent or draw any logo, brand mark, manufacturer badge, house icon, or fake business symbol. If no real logo is provided, use text branding only.`,
  ].filter(Boolean).join("\n");
}

/* ------------------------ OpenAI Image ------------------------ */

async function generateOpenAIAdImageBuffers({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "high",
  n = 1,
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = "gpt-image-1.5";

  const payload = JSON.stringify({
    model,
    prompt,
    size,
    quality,
    output_format,
    n: Math.max(1, Math.min(2, Number(n) || 1)),
  });

  const attempt = async (timeoutMs = 150000) => {
    const { status, body: respBuf } = await fetchUpstream(
      "POST",
      "https://api.openai.com/v1/images/generations",
      {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      Buffer.from(payload),
      timeoutMs
    );

    if (status !== 200) {
      let msg = `OpenAI image HTTP ${status}`;
      try {
        msg += ` ${respBuf.toString("utf8").slice(0, 1200)}`;
      } catch {}
      throw new Error(msg);
    }

    let parsed;
    try {
      parsed = JSON.parse(respBuf.toString("utf8"));
    } catch {
      throw new Error("OpenAI image: failed to parse JSON");
    }

    const arr = Array.isArray(parsed?.data) ? parsed.data : [];
    if (!arr.length) {
      throw new Error("OpenAI image: empty data array");
    }

    const buffers = [];
    for (const item of arr) {
      if (item?.b64_json) {
        buffers.push(Buffer.from(item.b64_json, "base64"));
      } else if (item?.url) {
        throw new Error("OpenAI image returned URL but server expects b64_json.");
      }
    }

    if (!buffers.length) {
      throw new Error("OpenAI image: missing b64_json");
    }

    return buffers;
  };

  try {
    return await attempt(150000);
  } catch (firstErr) {
    const msg = String(firstErr?.message || firstErr);
    const retryable =
      /timeout|OpenAI image HTTP 5\d\d|empty data array|failed to parse JSON/i.test(msg);

    if (!retryable) throw firstErr;

    console.warn("[generate-static-ad] first image attempt failed, retrying once:", msg);

    await new Promise((r) => setTimeout(r, 1200));
    return await attempt(180000);
  }
}
/* ------------------------ Website content grounding ------------------------
   Fetches the business homepage and extracts lightweight context signals:
   page title, og:title, meta description, first H1, phone, and city/state.
   Used to ground the ad prompt in real business content rather than relying
   solely on form answers. Falls back to null on any failure — caller handles. */

async function fetchWebsiteContent(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    let url = websiteUrl;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

    const { status, body: respBuf } = await fetchUpstream(
      "GET",
      url,
      { "User-Agent": "Mozilla/5.0 (compatible; Smartemark/1.0)", Accept: "text/html,application/xhtml+xml" },
      null,
      6000
    );

    if (status !== 200) {
      console.warn(`[website-grounding] non-200 from ${url}: HTTP ${status}`);
      return null;
    }

    const html = respBuf.toString("utf8").slice(0, 80000);
    const get = (re) => clean((html.match(re) || [])[1] || "");

    // Title signals — prefer og:title, then <title>, then first H1
    const ogTitle  = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,120})["']/i)
                  || get(/<meta[^>]+content=["']([^"']{1,120})["'][^>]+property=["']og:title["']/i);
    const pageTitle = get(/<title[^>]*>([^<]{1,120})<\/title>/i);
    const h1        = get(/<h1[^>]*>([^<]{1,120})<\/h1>/i);

    // Description signals — prefer og:description, then meta description
    const ogDesc   = get(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']{1,300})["']/i)
                  || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+property=["']og:description["']/i);
    const metaDesc = get(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i)
                  || get(/<meta[^>]+content=["']([^"']{1,300})["'][^>]+name=["']description["']/i);

    const headline    = clip(ogTitle || pageTitle || h1, 100);
    const description = clip(ogDesc || metaDesc, 220);

    // US phone number
    const phoneMatch = html.match(/\b(\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4})\b/);
    const phone = phoneMatch ? phoneMatch[1] : "";

    // City, ST pattern
    const locMatch = html.match(/\b([A-Z][a-z]+(?:[ -][A-Za-z]+)?),\s*([A-Z]{2})\b/);
    const cityState = locMatch ? `${locMatch[1]}, ${locMatch[2]}` : "";

    if (!headline && !description) {
      console.warn(`[website-grounding] no usable content from ${url}`);
      return null;
    }

    console.log(`[website-grounding] ok | headline="${headline.slice(0, 60)}" | phone=${phone || "none"} | loc=${cityState || "none"}`);
    return { headline, description, phone, cityState };
  } catch (err) {
    console.warn("[website-grounding] fetch failed:", err?.message || err);
    return null;
  }
}

/* ------------------------ Logo detection ------------------------ */

function looksLikeLogoUrl(url) {
  const u = clean(url).toLowerCase();
  // Narrow to actual logo indicators only — "brand", "navbar", "header" catch too many non-logo images
  return /logo|site-logo/.test(u);
}

async function detectBrandLogo(websiteUrl) {
  if (!websiteUrl) return null;

  try {
    let url = websiteUrl;
    if (!/^https?:\/\//i.test(url)) {
      url = `https://${url}`;
    }

    const parsed = new URL(url);
    const origin = `${parsed.protocol}//${parsed.host}`;

    let html = "";
    try {
      const homeResp = await fetchUpstream(
        "GET",
        url,
        {
          "User-Agent": "Mozilla/5.0 (compatible; Smartemark/1.0)",
          Accept: "text/html,application/xhtml+xml",
        },
        null,
        5000
      );

      if (homeResp.status === 200) {
        html = homeResp.body.toString("utf8").slice(0, 120000);
      }
    } catch {}

    const candidateUrls = [];

    if (html) {
      const imgTags = html.match(/<img[^>]+>/gi) || [];
      for (const tag of imgTags) {
        const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
        const alt = clean((tag.match(/alt=["']([^"']+)["']/i) || [])[1] || "");
        const cls = clean((tag.match(/class=["']([^"']+)["']/i) || [])[1] || "");
        const id = clean((tag.match(/id=["']([^"']+)["']/i) || [])[1] || "");

        const srcLower = (src || "").toLowerCase();
        const combined = `${srcLower} ${alt} ${cls} ${id}`.toLowerCase();
        // Require "logo" to appear in the src URL itself — not just alt/class/id.
        // This rejects equipment badges and partner logos that have alt="Our Logo"
        // but whose image file is clearly not the site's own branding.
        if (src && /logo|site-logo/.test(srcLower)) {
          // Reject images that look like third-party equipment/supplier brand logos rather than
          // the site's own logo (common on HVAC, plumbing, and other trade contractor sites).
          const isThirdPartyBrand = /\b(lennox|trane|carrier|rheem|york|goodman|daikin|american.standard|mitsubishi|heil|ruud|bryant|amana|bosch|navien|rinnai|honeywell|nest|fujitsu|lg|samsung|gree|panasonic|weil.mclain|burnham|lochinvar|bradford.white|a\.o\.smith|ao.smith|noritz|takagi)\b/.test(combined);
          if (!isThirdPartyBrand) {
            candidateUrls.push(src);
          }
        }
      }

      const iconLinks =
        html.match(/<link[^>]+rel=["'][^"']*(icon|apple-touch-icon)[^"']*["'][^>]*>/gi) || [];
      for (const tag of iconLinks) {
        const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
        if (href && looksLikeLogoUrl(href)) {
          candidateUrls.push(href);
        }
      }
    }

    candidateUrls.push(
      `${origin}/logo.png`,
      `${origin}/logo.jpg`,
      `${origin}/logo.jpeg`,
      `${origin}/assets/logo.png`,
      `${origin}/images/logo.png`,
      `${origin}/img/logo.png`
    );

    for (const rawCandidate of candidateUrls.slice(0, 8)) {
      try {
        let candidate = clean(rawCandidate);
        if (!candidate) continue;

        if (candidate.startsWith("//")) candidate = `${parsed.protocol}${candidate}`;
        else if (candidate.startsWith("/")) candidate = `${origin}${candidate}`;
        else if (!/^https?:\/\//i.test(candidate)) candidate = `${origin}/${candidate}`;

        const resp = await fetchUpstream(
          "GET",
          candidate,
          { "User-Agent": "Mozilla/5.0" },
          null,
          5000
        );

        if (resp.status !== 200) {
          console.log(`[logo-detect] skip ${candidate}: HTTP ${resp.status}`);
          continue;
        }
        if (!resp.body || resp.body.length < 800) {
          console.log(`[logo-detect] skip ${candidate}: too small (${resp.body?.length ?? 0} bytes)`);
          continue;
        }

        const contentType = String(resp.headers?.["content-type"] || "").toLowerCase();
        const imageLike =
          /image\/(png|jpeg|jpg|webp|svg\+xml)/.test(contentType) ||
          /\.(png|jpg|jpeg|webp|svg)(\?|$)/i.test(candidate);

        if (!imageLike) {
          console.log(`[logo-detect] skip ${candidate}: not image (${contentType})`);
          continue;
        }

        if (/svg/.test(contentType) || /\.svg(\?|$)/i.test(candidate)) {
          console.log(`[logo-detect] skip ${candidate}: SVG not supported`);
          continue;
        }

        try {
          const meta = await sharp(resp.body).metadata();
          if (!meta.width || !meta.height) {
            console.log(`[logo-detect] skip ${candidate}: no dimensions`);
            continue;
          }

          const aspect = meta.width / meta.height;
          const w = meta.width;
          const h = meta.height;

          // Business logos are landscape (wider than tall) and large enough to read.
          // Minimum aspect 1.4: rejects square icons, house marks, app icons (~1:1).
          // Minimum width 150, height 40: rejects favicons and tiny generic placeholders.
          // Maximum aspect 6.0: rejects ultra-wide banners or decorative strips.
          if (w < 150) { console.log(`[logo-detect] skip ${candidate}: width ${w} < 150`); continue; }
          if (h < 40)  { console.log(`[logo-detect] skip ${candidate}: height ${h} < 40`); continue; }
          if (w > 2000 || h > 1200) { console.log(`[logo-detect] skip ${candidate}: too large ${w}×${h}`); continue; }
          if (aspect < 1.4) { console.log(`[logo-detect] skip ${candidate}: aspect ${aspect.toFixed(2)} < 1.4 (square/portrait icon)`); continue; }
          if (aspect > 6.0) { console.log(`[logo-detect] skip ${candidate}: aspect ${aspect.toFixed(2)} > 6.0 (banner strip)`); continue; }

          console.log(`[logo-detect] selected: ${candidate} | ${w}×${h} aspect=${aspect.toFixed(2)}`);
        } catch {
          console.log(`[logo-detect] skip ${candidate}: sharp metadata error`);
          continue;
        }

        return resp.body;
      } catch {
        continue;
      }
    }
  } catch (err) {
    console.warn("[logo-detect] failed:", err?.message || err);
  }

  return null;
}

/* ------------------------ Logo compositing ------------------------ */

async function compositeLogoOntoAd(adBuf, logoBuf) {
  if (!adBuf || !logoBuf) return adBuf;

  try {
    const adMeta = await sharp(adBuf).metadata();
    const adW = adMeta.width || 1024;
    const adH = adMeta.height || 1024;
    console.log(`[logo-composite] applying logo to ${adW}×${adH} ad`);

    // 20% width / 10% height gives a readable logo without dominating the ad.
    const maxLogoW = Math.round(adW * 0.20);
    const maxLogoH = Math.round(adH * 0.10);
    const pad = Math.round(adW * 0.035);

    const logoMetaRaw = await sharp(logoBuf).metadata();
    const hasAlpha = (logoMetaRaw.channels || 3) >= 4;

    // Step 1 — trim background FROM THE ORIGINAL before any resize.
    // Trimming after resize loses accuracy (scaled-down pixels blur the edge).
    // threshold:10 tolerates slight gradients/shadows without over-cropping.
    let workingBuf = logoBuf;
    if (!hasAlpha) {
      try {
        workingBuf = await sharp(logoBuf)
          .trim({ threshold: 10 })
          .toBuffer();
      } catch {
        // trim failed — continue with original
      }
    }

    // Step 2 — resize to target box, then add alpha channel.
    const preparedLogo = await sharp(workingBuf)
      .resize(maxLogoW, maxLogoH, {
        fit: "inside",
        withoutEnlargement: true,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .ensureAlpha()
      .png()
      .toBuffer();

    const logoMeta = await sharp(preparedLogo).metadata();
    const lW = logoMeta.width || maxLogoW;
    const lH = logoMeta.height || maxLogoH;

    // Place top-right with consistent padding.
    const left = adW - lW - pad;
    const top = pad;

    return await sharp(adBuf)
      .composite([{ input: preparedLogo, left, top }])
      .png()
      .toBuffer();
  } catch (err) {
    console.warn("[logo-composite] failed:", err?.message || err);
    return adBuf;
  }
}

/* ------------------------ Daily image-gen rate limiting ------------------------ */

const db = require("../db");

// In-memory daily counters: key = "{identity}:{YYYY-MM-DD}" → count
// Resets naturally on server restart (which also wipes /tmp/generated anyway).
const _dailyGenCounts = new Map();

function _todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
}

function _dailyLimit(planKey) {
  const k = String(planKey || "").trim().toLowerCase();
  if (k === "operator") return 20;
  if (k === "pro") return 12;
  if (k === "starter" || k === "standard") return 5;
  return 1; // visitor / unknown
}

function _getSidFromReq(req) {
  const cookieSid = req.cookies?.sm_sid;
  const headerSid = req.get("x-sm-sid");
  const querySid = String(req.query?.sm_sid || req.query?.sid || "").trim();
  const auth = req.headers.authorization || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  return (cookieSid || headerSid || querySid || bearer || "").trim();
}

async function _resolveIdentityAndPlan(req) {
  try {
    const sid = _getSidFromReq(req);
    if (!sid) return { identity: null, planKey: "visitor" };

    await db.read();
    const sessions = db.data?.sessions || [];
    const session = sessions.find((s) => String(s?.sid || "").trim() === sid);
    if (!session) return { identity: sid, planKey: "visitor" };

    const username = String(session.username || "").trim();
    if (!username) return { identity: sid, planKey: "visitor" };

    const users = db.data?.users || [];
    const user = users.find(
      (u) => String(u?.username || "").trim() === username
    );
    // Only grant a paying-plan limit if an explicit plan key is recorded.
    // A logged-in user with no billing plan set is non-paying → "visitor" (1/day).
    const rawPlanKey =
      user?.billing?.planKey || user?.planKey || session.planKey || "";
    const planKey = String(rawPlanKey).trim().toLowerCase() || "visitor";

    return { identity: `user:${username}`, planKey };
  } catch {
    return { identity: null, planKey: "visitor" };
  }
}

function _checkAndIncrementDailyCount(identity, planKey, requestedCount) {
  const key = `${identity || "anon"}:${_todayKey()}`;
  const limit = _dailyLimit(planKey);
  const current = _dailyGenCounts.get(key) || 0;
  const remaining = limit - current;

  if (remaining <= 0) {
    return { allowed: false, limit, current, toGenerate: 0 };
  }

  const toGenerate = Math.min(requestedCount, remaining);
  _dailyGenCounts.set(key, current + toGenerate);
  return { allowed: true, limit, current, toGenerate };
}

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  const hasKey = !!process.env.OPENAI_API_KEY;
  // model is hardcoded in generateOpenAIAdImageBuffers — log it here for visibility
  console.log(`[generate-static-ad] request received | model=gpt-image-1.5 (hardcoded) | hasKey=${hasKey}`);

  try {
    const body = req.body || {};

    const a =
      body.answers && typeof body.answers === "object"
        ? body.answers
        : body.inputs && typeof body.inputs === "object"
        ? body.inputs
        : body;

    const craftedCopy =
      body.copy && typeof body.copy === "object" ? body.copy : {};

    const requestedCount = Number(body.count || body.n || 1);
    const rawCount = Math.max(1, Math.min(2, requestedCount || 1));

    // Enforce daily image-gen limit before spending API budget.
    const { identity, planKey } = await _resolveIdentityAndPlan(req);
    const rateCheck = _checkAndIncrementDailyCount(identity, planKey, rawCount);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        ok: false,
        error: "daily_limit_reached",
        message: `Daily image generation limit reached (${rateCheck.limit} per day for your plan). Try again tomorrow.`,
        limit: rateCheck.limit,
        current: rateCheck.current,
      });
    }
    const count = rateCheck.toGenerate;

    console.log("[CREATIVE][context]", {
      route: "generate-static-ad",
      businessName: String(a.businessName || a.brand || "").trim() || "(empty)",
      industry: String(a.industry || "").trim() || "(empty)",
      businessType: String(a.businessType || "").trim() || "(empty)",
      niche: String(a.niche || "").trim() || "(empty)",
      effectiveIndustry: String(a.industry || a.businessType || a.niche || "business").trim(),
      location: String(a.location || a.city || "").trim() || "(empty)",
      offer: String(a.offer || a.saveAmount || "").trim() || "(empty)",
      hasCraftedCopy: !!(body.copy && typeof body.copy === "object" && (body.copy.headline || body.copy.subline)),
      craftedHeadlinePreview: String((body.copy || {}).headline || "").trim().slice(0, 60) || "(empty)",
    });

    const website = clean(a.website || a.url || "");
    const businessName = safeFilenamePart(a.businessName || a.brand || "ad");

    // Detect a user-uploaded photo — if present, use the image-edit path instead of text-to-image.
    const rawUserImage = a.userImage || body.userImage || null;
    let userImageBuffer = null;
    if (rawUserImage && typeof rawUserImage === "string") {
      try {
        const m = rawUserImage.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
        if (m) userImageBuffer = Buffer.from(m[2], "base64");
      } catch { /* ignore malformed data URL */ }
    }

    let imageBuffers;
    if (userImageBuffer) {
      // Uploaded-photo edit path: detect logo then apply ad treatment to the photo.
      const logoBuf = website
        ? await Promise.race([
            detectBrandLogo(website).catch(() => null),
            new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
          ])
        : null;
      const editPrompt = buildAdEditPromptFromAnswers(a, craftedCopy, { logoFound: !!logoBuf });
      console.log("[generate-static-ad] using user-uploaded image via edit endpoint");
      imageBuffers = await generateOpenAIAdImageEdit({
        imageBuffer: userImageBuffer,
        prompt: editPrompt,
        size: "1024x1024",
        quality: "high",
        n: count,
      });
      if (logoBuf) {
        imageBuffers = await Promise.all(
          imageBuffers.map((buf) => compositeLogoOntoAd(buf, logoBuf).catch(() => buf))
        );
      }
    } else {
      // Text-to-image path: ground in website content + detect logo concurrently, then generate.
      const [webContent, logoBuf] = await Promise.all([
        website
          ? Promise.race([
              fetchWebsiteContent(website).catch(() => null),
              new Promise((resolve) => setTimeout(() => resolve(null), 7000)),
            ])
          : Promise.resolve(null),
        website
          ? Promise.race([
              detectBrandLogo(website).catch(() => null),
              new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
            ])
          : Promise.resolve(null),
      ]);

      console.log(`[generate-static-ad] website-grounding=${webContent ? "ok" : "none"} | logo-found=${!!logoBuf} | website=${website || "none"}`);
      console.log("[generate-static-ad] image-gen params | model=gpt-image-1.5 | quality=high | size=1024x1024 | output_format=png | n=" + count);

      const prompt = buildAdPrompt(a, craftedCopy, webContent, !!logoBuf);
      console.log("[generate-static-ad] full prompt:", prompt);

      imageBuffers = await generateOpenAIAdImageBuffers({
        prompt,
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: count,
      });

      if (logoBuf) {
        console.log("[generate-static-ad] compositing logo onto generated ad");
        imageBuffers = await Promise.all(
          imageBuffers.map((buf) => compositeLogoOntoAd(buf, logoBuf).catch(() => buf))
        );
      }
    }

    if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
      throw new Error("No image buffers returned from generator");
    }

    const base = `${businessName || "static-ad"}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const filenames = [];
    const urls = [];

    for (let i = 0; i < imageBuffers.length; i++) {
      const filename = `${base}-${i + 1}.png`;
      await fs.promises.writeFile(path.join(GEN_DIR, filename), imageBuffers[i]);
      filenames.push(filename);
      urls.push(makeMediaUrl(req, filename));
    }

    return res.json({
      ok: true,
      type: "image",
      template: "openai_direct",
      url: urls[0] || null,
      absoluteUrl: urls[0] || null,
      pngUrl: urls[0] || null,
      filename: filenames[0] || null,
      imageUrls: urls,
      imageVariants: urls,
      filenames,
      ready: true,
    });
  } catch (err) {
    console.error("[generate-static-ad]", err);

  const msg = String(err?.message || err);
const statusCode = /timeout|OpenAI image HTTP 5\d\d/i.test(msg) ? 502 : 400;

return res.status(statusCode).json({
  ok: false,
  error: msg,
});
  }
});

/* ------------------------ proxy-img ------------------------ */

async function proxyImgHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== "string") {
      return res.status(400).send("missing u");
    }

    const passHeaders = {};
    if (req.headers.range) passHeaders.Range = req.headers.range;

    const { status, headers, body } = await fetchUpstream(
      "GET",
      u,
      passHeaders,
      null,
      30000
    );

    res.status(status || 200);

    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = String(k).toLowerCase();
      if (["transfer-encoding", "connection"].includes(key)) return;
      res.setHeader(k, v);
    });

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Accept-Ranges", headers?.["accept-ranges"] || "bytes");

    return res.end(body);
  } catch (e) {
    console.error("[proxy-img GET]", e);
    return res.status(502).send("bad upstream");
  }
}

async function proxyHeadHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== "string") {
      return res.status(400).end();
    }

    const passHeaders = {};
    if (req.headers.range) passHeaders.Range = req.headers.range;

    const { status, headers } = await fetchUpstream(
      "HEAD",
      u,
      passHeaders,
      null,
      15000
    );

    res.status(status || 200);

    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = String(k).toLowerCase();
      if (["transfer-encoding", "connection"].includes(key)) return;
      res.setHeader(k, v);
    });

    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Accept-Ranges", headers?.["accept-ranges"] || "bytes");

    return res.end();
  } catch (e) {
    console.error("[proxy-img HEAD]", e);
    return res.status(502).end();
  }
}

router.get("/proxy-img", proxyImgHandler);
router.head("/proxy-img", proxyHeadHandler);

module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;