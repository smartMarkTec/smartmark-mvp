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

/* Visual emphasis cues — rotated by variation token so each run explores a different
   composition without hardcoding scenes or demographics.
   People are one valid option among many — not the default. */
const VISUAL_MOODS = [
  "the equipment, vehicle, or product itself as the hero — no people, let the hardware do the talking",
  "a building exterior, storefront, or job-site environment — architecture and setting, no workers",
  "a comfortable finished interior relevant to the business — clean, well-lit, no crew or staff",
  "a close-up detail of the product, material, tool, or finished result — texture and craft foreground",
  "a clean, minimal graphic composition — strong type on a simple well-lit background, no people",
  "an outdoor environment relevant to the business — yard, roof, street, or landscape, no workers",
  "a single person in a natural, unposed moment — used sparingly and only when people clearly fit",
  "a commercial or editorial graphic layout — bold, modern, type-forward with supporting imagery",
  "a wide environmental scene showing the business context — before/after, setting, or worksite without people",
  "a product or service in use in a realistic context — show the result or the environment, not the worker",
];

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

  // 1. Use pre-crafted headline only if it doesn't look like raw user input
  // Keep to ≤28 chars (~4-5 words) so image AI renders it complete without clipping
  if (copyHeadline && !looksLikeRawClaim(copyHeadline)) return wordTrim(copyHeadline, 28);

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
  if (/hvac|heating|cooling|air.?cond/.test(ind))      return pickOne(["Trusted HVAC Service", "Comfort All Year Round", "Your Local HVAC Experts", "Heating & Cooling Done Right", "Stay Comfortable, Year-Round"]);
  if (/plumb/.test(ind))                                return pickOne(["Reliable Plumbing Service", "Fast Local Plumbers", "Plumbing You Can Count On", "Fix It Right the First Time"]);
  if (/electr/.test(ind))                               return pickOne(["Professional Electrical", "Reliable Electrical Service", "Local Electricians You Trust"]);
  if (/roof/.test(ind))                                 return pickOne(["Trusted Roofing Experts", "Quality Roofing, Every Time", "Protect Your Home from the Top"]);
  if (/landscap|lawn/.test(ind))                        return pickOne(["Beautiful Yards, Every Season", "Curb Appeal That Stands Out", "Your Lawn, Our Expertise"]);
  if (/restaurant|food|cater/.test(ind))                return pickOne(["Great Food, Local Flavor", "Fresh Food, Every Time", "Taste the Difference Locally"]);
  if (/market|advertis|agency/.test(ind))               return pickOne(["More Leads, Less Guesswork", "Marketing That Actually Works", "Grow Your Business Smarter"]);
  if (/insur/.test(ind))                                return pickOne(["Coverage You Can Count On", "Protect What Matters Most", "Insurance Made Simple"]);
  if (/dental|dent/.test(ind))                          return pickOne(["Healthy Smiles Start Here", "A Smile Worth Showing Off", "Your Comfort, Our Priority"]);
  if (/legal|law/.test(ind))                            return pickOne(["Trusted Legal Help", "Your Rights, Our Focus", "Legal Advice You Can Trust"]);
  if (/auto|car|vehicle/.test(ind))                     return pickOne(["Reliable Auto Service", "Your Car in Good Hands", "Expert Auto Care, Every Visit"]);
  if (/clean|maid/.test(ind))                           return pickOne(["Clean Home, Clear Mind", "Spotless, Every Single Time", "Professional Cleaning You'll Love"]);
  if (/pest/.test(ind))                                 return pickOne(["Pest-Free Living", "Keep Pests Out for Good", "Your Home, Pest-Free"]);
  if (/real.?estate|realt/.test(ind))                   return pickOne(["Find Your Next Home", "Local Real Estate Experts", "Buy or Sell with Confidence"]);
  if (/fitness|gym|personal.?train/.test(ind))          return pickOne(["Train Smarter, Live Better", "Reach Your Fitness Goals", "Real Results, Real Progress"]);
  if (/salon|hair|beauty/.test(ind))                    return pickOne(["Look Good, Feel Great", "Beauty That Turns Heads", "Your Best Look Starts Here"]);
  if (/pet|animal|vet/.test(ind))                       return pickOne(["Care You Can Trust", "Your Pet Deserves the Best", "Compassionate Pet Care"]);
  if (/child|kid|daycare|school/.test(ind))             return pickOne(["Nurturing Young Minds", "Where Kids Thrive", "A Safe Place to Grow"]);

  // 5. Short business name as final fallback
  const businessName = clean(a.businessName || a.brand || "");
  if (businessName && businessName.split(/\s+/).length <= 3) return wordTrim(businessName, 28);

  return "Local Experts, Real Results";
}

/* Trim AI-generated support copy to a length that renders cleanly inside the image.
   Prefers a complete first sentence (≤8 words). If the first sentence is too long,
   falls back to the first 7 words — no ellipsis, so there is no cut-off artifact. */
function imageSafeSupport(s) {
  const full = clean(s);
  if (!full) return "";
  const firstSentMatch = full.match(/^(.+?[.!?])(?:\s|$)/);
  if (firstSentMatch) {
    const sent = firstSentMatch[1].trim();
    if (sent.split(/\s+/).filter(Boolean).length <= 8) return sent;
  }
  return full.split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
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

  if (clean(a.offer || a.promo || craftedCopy.offer || "")) return "Claim Offer";

  // No website but phone provided — use a call-based CTA
  if (!clean(a.website || a.url || "") && clean(a.phone || "")) return "Call Now";

  return "Learn More";
}

function deriveOffer(a = {}, craftedCopy = {}) {
  return clean(craftedCopy.offer || a.offer || a.promo || "");
}


function buildAdPromptFromAnswers(a = {}, craftedCopy = {}, variationToken = "") {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = inferIndustry(a);
  const website = clean(a.website || a.url || "");
  const phone = clean(a.phone || "");
  const offer = clip(deriveOffer(a, craftedCopy), 70);
  const headline = wordTrim(deriveHeadline(a, craftedCopy), 28);
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  // Hash the full token so mood is distributed across all options, not locked to last char.
  // djb2-style fold: each character contributes, so token suffix doesn't dominate.
  function tokenHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h);
  }
  const moodIdx = variationToken
    ? tokenHash(variationToken) % VISUAL_MOODS.length
    : Math.floor(Math.random() * VISUAL_MOODS.length);

  return [
    `Create a square Facebook/Instagram ad for "${businessName}", a ${industry} business.`,
    `Style: clean, polished, and professional — like a real paid social ad. No heavy border frames, no thick decorative edges, no flyer or poster layout. The image should feel like a modern social ad creative, not a printed announcement.`,
    ``,
    `Visual direction: ${VISUAL_MOODS[moodIdx]}. Unless the visual direction above specifically mentions a person, do not add any human figure — prefer equipment, environment, buildings, product, or graphic elements instead.`,
    ``,
    `Composition: you have creative freedom over background, visual style, color palette, and type treatment — but the layout must follow these safe-zone rules so the final ad looks professional and complete:`,
    `  1. Text clearance: all text must sit at least 9% inset from every edge of the image. No headline, support text, CTA, or footer detail may touch or bleed into the outer 9% margin. This prevents clipping at any render resolution.`,
    `  2. Logo zone: reserve the top-right corner — roughly the top 12% height and rightmost 22% width — completely clear of text and important visual elements. A real business logo will be composited into that zone after generation. Nothing should compete with it.`,
    `  3. Hierarchy: headline reads first (largest, highest contrast), support text second (smaller, lighter), CTA last (distinct button or label treatment). These three elements must be visually separated, not stacked tight.`,
    `  4. Breathing room: leave generous white space or visual separation between the headline block and any other element — at least 4% of image height between the headline and the next element below it.`,
    `  Within these rules, the visual direction, color, layout style, and background are entirely your creative choice.`,
    ``,
    `Ad copy to render:`,
    `  Headline: "${headline}"`,
    supportLine ? `  Support: "${supportLine}"` : null,
    `  CTA: "${cta}"`,
    website ? `  Website: ${website}` : null,
    phone ? `  Phone: ${phone}` : null,
    `Brand: "${businessName}"`,
    offer
      ? `Offer: "${offer}"`
      : `Do not invent any promotional offer, sale, or discount.`,
    ``,
    `Typography: the headline is the dominant typographic element — large, bold, high-contrast, fully legible. Every single word of every line must render completely. If any line does not fit at the size chosen, reduce the font size until every word is fully visible. Never truncate, clip, or add "..." to any copy element.`,
    `Branding: a real business logo will be composited onto this image after generation — do not draw any logo, icon, emblem, seal, badge, or invented brand mark anywhere in the image. The business name may appear as plain readable text if the layout calls for it, but no graphic symbol of any kind.`,
    variationToken ? `Variation seed: ${variationToken}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------ OpenAI Image ------------------------ */

async function generateOpenAIAdImageBuffers({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "auto",
  n = 1,
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

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

        const combined = `${src || ""} ${alt} ${cls} ${id}`.toLowerCase();
        if (src && /logo|site-logo/.test(combined)) {
          candidateUrls.push(src);
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

        if (resp.status !== 200) continue;
        if (!resp.body || resp.body.length < 800) continue;

        const contentType = String(resp.headers?.["content-type"] || "").toLowerCase();
        const imageLike =
          /image\/(png|jpeg|jpg|webp|svg\+xml)/.test(contentType) ||
          /\.(png|jpg|jpeg|webp|svg)(\?|$)/i.test(candidate);

        if (!imageLike) continue;

        if (/svg/.test(contentType) || /\.svg(\?|$)/i.test(candidate)) {
          continue;
        }

        try {
          const meta = await sharp(resp.body).metadata();
          if (!meta.width || !meta.height) continue;

          const aspect = meta.width / meta.height;
          if (meta.width < 80 || meta.height < 20) continue;
          if (meta.width > 2000 || meta.height > 1200) continue;
          if (aspect < 0.6 || aspect > 8.5) continue;
        } catch {
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

    const maxLogoW = Math.round(adW * 0.16);
    const maxLogoH = Math.round(adH * 0.08);
    const pad = Math.round(adW * 0.03);

    const preparedLogo = await sharp(logoBuf)
      .resize(maxLogoW, maxLogoH, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const logoMeta = await sharp(preparedLogo).metadata();
    const lW = logoMeta.width || maxLogoW;
    const lH = logoMeta.height || maxLogoH;

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

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const hasKey = !!process.env.OPENAI_API_KEY;

  console.log(
    `[generate-static-ad] request received | model=${model} | hasKey=${hasKey}`
  );

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
    const count = Math.max(1, Math.min(2, requestedCount || 1));

    const website = clean(a.website || a.url || "");
    const businessName = safeFilenamePart(a.businessName || a.brand || "ad");

    // Start logo lookup in parallel, but do not let it fail the ad.
    const logoPromise = website
      ? detectBrandLogo(website).catch(() => null)
      : Promise.resolve(null);

    const variationToken = String(
      body.regenerateToken || body.variant || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    );
    const prompt = buildAdPromptFromAnswers(a, craftedCopy, variationToken);

    // Single OpenAI call for speed and lower failure risk.
    let imageBuffers = await generateOpenAIAdImageBuffers({
      prompt,
      size: "1024x1024",
      output_format: "png",
      quality: "auto",
      n: count,
    });

    if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
      throw new Error("No image buffers returned from generator");
    }

    const logoBuf = await Promise.race([
      logoPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
    ]);

    if (logoBuf) {
      imageBuffers = await Promise.all(
        imageBuffers.map((buf) =>
          compositeLogoOntoAd(buf, logoBuf).catch(() => buf)
        )
      );
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