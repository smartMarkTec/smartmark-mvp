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
   Each entry specifies a photographic style so the model defaults to real-world photography. */
const VISUAL_MOODS = [
  "the key equipment, product, or service vehicle as the hero — commercial product photography, clean studio or natural-light background, no people",
  "a building exterior, storefront, or job-site setting — architectural exterior photography, natural daylight, realistic materials and surfaces",
  "a comfortable finished interior relevant to the business — professional interior photography, natural light from windows, no crew or staff visible",
  "a close-up detail of the product, material, tool, or finished result — macro commercial photography, real-world texture, shallow depth of field",
  "a clean editorial composition — bold professional typography on a simply photographed or minimally styled background, no people",
  "an outdoor environment relevant to the business — professional location photography, natural daylight, no workers visible",
  "a single person in a natural, candid, unposed moment — editorial lifestyle photography, only when people clearly fit the business type",
  "a bold graphic layout — type-forward commercial design with a supporting photographic element, modern editorial style",
  "a wide environmental scene showing the business context or setting — professional architectural or location photography, no people present",
  "the service result or product shown in its real-world context — commercial lifestyle photography, authentic setting and lighting",
];

/* Industry → specific photographic scene descriptions.
   HVAC has 16 entries covering distinct service contexts — thermostat is index 4 (1-of-16, ~6%).
   Other industries have 4–6 entries. All are hash-indexed (not Math.random) so the
   variationToken deterministically drives scene selection and different tokens get different scenes. */
const INDUSTRY_SCENES = {
  hvac: [
    /* 0 */ "a residential central air split-system condenser unit on a concrete equipment pad beside a well-landscaped home exterior — professional exterior photography, natural daylight, realistic vinyl siding and mature shrubs",
    /* 1 */ "a clean HVAC service van parked in a suburban residential driveway, modest brick home behind it — no driver visible, commercial vehicle photography, clear blue sky, mid-morning light",
    /* 2 */ "a bright, comfortable residential living room conveying whole-home comfort — architectural interior photography, natural light streaming through large windows, soft furnishings and hardwood flooring, no people",
    /* 3 */ "a modern ductless mini-split air handler mounted flush on a white wall in a clean contemporary living room — real interior photography, warm ambient light, realistic wall texture and flooring visible",
    /* 4 */ "a sleek digital programmable thermostat mounted on a neutral painted wall — close-up commercial product photography, shallow depth of field, warm residential lighting, softly blurred room background",
    /* 5 */ "a white ceiling supply air vent in a freshly painted residential room — close-up architectural interior photography, clean natural light, minimal and fresh composition",
    /* 6 */ "HVAC service tools and equipment laid out neatly beside an outdoor condenser unit — still-life commercial photography, natural light, no person visible, realistic metal and rubber textures",
    /* 7 */ "a brand-new high-efficiency outdoor condenser unit on a clean concrete pad beside a modern home — professional exterior photography, natural morning light, fresh landscaping, no workers visible",
    /* 8 */ "a residential air handler unit in a finished utility room with a fresh replacement air filter beside it — close-up interior photography, bright shop lighting, realistic metal and fiberglass textures",
    /* 9 */ "a bright, airy home interior with a visible air purifier on a side table and open windows — lifestyle interior photography, warm natural light, comfortable modern furnishings, clean and healthy atmosphere",
    /* 10 */ "a cozy residential living room on a cold winter day, warm amber interior light visible, frost on exterior windows — lifestyle exterior/interior photography, dusk light, welcoming and warm feeling, no people",
    /* 11 */ "a modern suburban home on a sunny summer day, outdoor AC condenser unit visible in a clean landscaped side yard — wide exterior photography, bright blue sky, green grass, natural light",
    /* 12 */ "a dramatic editorial close-up of a high-efficiency outdoor condenser unit, blurred suburban house in soft background — commercial advertising photography, natural backlit golden light, premium equipment focus",
    /* 13 */ "a dramatic macro close-up of condenser fin coil and copper refrigerant lines — commercial product photography, natural side light, realistic aluminum and copper textures, shallow depth of field",
    /* 14 */ "a wide-angle shot of a well-maintained two-story suburban home, outdoor AC unit clearly visible in side yard — professional real estate exterior photography, clear sky, natural midday light",
    /* 15 */ "a newly installed high-efficiency furnace and air handler in a clean modern mechanical room — commercial interior photography, bright LED lighting, pristine white walls, realistic equipment detail",
  ],
  plumbing: [
    "a clean, modern bathroom with polished chrome fixtures and fresh white subway tile — professional interior photography, bright natural light, realistic porcelain and chrome",
    "a professional plumbing service van parked on a quiet residential street — no people, commercial vehicle photography, suburban neighborhood, natural daylight",
    "copper and PEX piping neatly installed under a kitchen sink — close-up commercial photography, warm shop lighting, realistic metal textures and wood cabinet surfaces",
    "a gleaming modern kitchen with polished chrome faucet and undermount sink — interior photography, natural window light, realistic stone countertop and stainless steel",
    "a freshly tiled walk-in shower with polished chrome fixtures and frameless glass door — professional interior photography, bright natural light, clean premium materials",
    "a clean professional pipe fitting with soldered copper joints — macro commercial photography, natural light, realistic metal texture and depth of field",
  ],
  electrical: [
    "a clean residential electrical panel with neat organized wiring in a finished garage — close-up commercial photography, bright shop lighting, realistic metal enclosure",
    "modern recessed LED lighting in a well-finished living room — professional interior photography, warm ambient light, realistic ceiling and furnishings",
    "a professional electrician's branded service van on a suburban street — no people, commercial vehicle photography, residential neighborhood background",
    "a newly installed outdoor electrical panel with weatherproof cover on a stucco house exterior — close-up exterior photography, natural daylight, realistic materials",
    "a beautifully lit dining room with pendant lights and dimmer switches — editorial interior photography, warm evening ambiance, realistic wood and fabric finishes",
    "a clean breaker panel being inspected — commercial product photography, bright overhead lighting, realistic metal and plastic components",
  ],
  roofing: [
    "a freshly installed dimensional asphalt shingle roof on a two-story residential home — wide exterior photography, natural daylight, realistic shingles, gutters, and mature trees",
    "a close-up of premium roofing shingles in a precise overlapping pattern — macro commercial photography, natural light, realistic granule texture and shadow detail",
    "a wide exterior shot of a large home with a beautiful roof line against a deep blue sky — professional exterior photography, golden-hour light",
    "a clean rooftop view looking down a freshly shingled slope against a blue sky horizon — editorial exterior photography, natural daylight, sharp architectural lines",
    "a professional roofing crew truck parked in a residential driveway — no people visible, commercial vehicle photography, suburban home in background",
  ],
  landscaping: [
    "a beautifully manicured front yard with crisp edging, lush green grass, and flowering shrubs — professional exterior photography, bright natural morning light",
    "a professionally designed backyard patio with planted beds, clean mulch, and stone edging — garden photography, natural afternoon light, vibrant greens",
    "a freshly mowed lawn with clean diagonal mowing lines and sharp sidewalk edging — exterior photography, bright natural light, healthy green grass",
    "a colorful landscape planting bed with annuals and fresh dark mulch alongside a home foundation — close-up exterior photography, natural morning light",
  ],
  cleaning: [
    "a spotlessly clean bright kitchen with gleaming countertops and stainless appliances — professional interior photography, natural window light, realistic cabinet and countertop materials",
    "a pristine living room with fresh vacuum lines in plush carpet — professional interior photography, warm ambient light, realistic furniture and textures",
    "a gleaming bathroom with polished chrome fixtures and sparkling tile — interior photography, bright natural light, fresh and sanitized atmosphere",
    "freshly cleaned hardwood floor reflecting soft window light in an open living area — interior photography, natural light, clean and inviting",
  ],
  dental: [
    "a modern welcoming dental office reception area with clean white and warm-wood finishes — professional commercial interior photography, bright natural light",
    "a confident natural smile in close-up — editorial portrait photography, soft studio lighting, shallow depth of field, authentic-looking teeth, neutral background",
    "a clean modern dental treatment room with polished equipment and bright operatory light — commercial interior photography, clinical but welcoming",
    "a close-up of a dental model showing clean well-aligned teeth — product photography, soft studio lighting, white background",
  ],
  restaurant: [
    "a beautifully plated signature dish on a restaurant table with warm ambient lighting — professional editorial food photography, soft natural light, realistic tableware and linen",
    "a warm inviting restaurant dining room with set tables and low pendant lighting — professional interior photography, atmospheric ambient light, realistic wood and fabric finishes",
    "fresh ingredients artfully arranged on a cutting board — editorial food photography, natural overhead light, vibrant colors, realistic textures",
    "a stylish restaurant bar with warm lighting and polished glassware — commercial interior photography, atmospheric evening ambiance",
  ],
  auto: [
    "a clean well-lit auto repair shop with a car on the lift — commercial interior photography, professional overhead lighting, realistic concrete floor and tool equipment",
    "a gleaming vehicle exterior freshly detailed in an open lot — commercial product photography, natural outdoor light, realistic paint reflections and chrome",
    "a mechanic's tool chest with organized chrome tools in a clean shop — still-life commercial photography, realistic lighting, authentic metal textures",
    "a car engine bay being serviced — close-up commercial photography, realistic engine components and professional tools visible",
  ],
  pest: [
    "a bright clean kitchen interior free of clutter — professional interior photography, natural light, spotless counters and appliances",
    "a professional pest control service truck on a residential street — no people, commercial vehicle photography, suburban neighborhood background",
    "a clean well-maintained home exterior with a manicured yard — professional exterior photography, clear daylight, fresh and protected feeling",
  ],
  realEstate: [
    "a beautiful home exterior with a manicured lawn, clear sky, and welcoming front entrance — professional real estate exterior photography, natural daylight",
    "a bright airy open-concept living room with large windows — professional real estate interior photography, natural window light, realistic furnishings",
    "a stunning kitchen with granite counters, stainless appliances, and warm pendant lighting — real estate interior photography, natural and artificial light blend",
    "a wide aerial-perspective shot of a suburban neighborhood with well-kept homes — professional architectural photography, golden-hour light",
  ],
  fitness: [
    "a modern gym interior with well-spaced equipment and motivating lighting — commercial interior photography, bright overhead lighting, realistic rubber flooring and equipment",
    "a clean open personal training studio with natural light — professional interior photography, inviting and energetic atmosphere",
    "a row of dumbbells on a clean rack in a modern gym — commercial product photography, natural light, realistic metal and rubber textures",
  ],
  salon: [
    "a modern upscale salon interior with styling chairs, mirrors, and soft overhead lighting — professional commercial interior photography, bright and clean, realistic materials",
    "a beautifully finished haircut or blowout — editorial beauty photography, soft diffused studio lighting, natural-looking result",
    "a styling station with professional tools neatly arranged — close-up commercial photography, clean and polished",
  ],
  insurance: [
    "a comfortable family home exterior on a sunny day — professional real estate photography style, natural daylight, inviting and secure feeling",
    "a warm professional insurance office interior — commercial interior photography, natural light, clean and trustworthy aesthetic",
    "a new car parked in a clean driveway in front of a home — commercial lifestyle photography, natural morning light",
  ],
  legal: [
    "a professional law office interior with bookshelves and a clean conference table — commercial interior photography, warm natural light, polished wood and leather",
    "a courthouse exterior or professional building facade — architectural exterior photography, natural daylight, serious and trustworthy",
    "a legal document on a clean desk with a pen — editorial commercial photography, natural window light, clean minimal composition",
  ],
  marketing: [
    "a modern marketing agency open-plan office with computers and whiteboards — commercial interior photography, bright natural light, clean creative environment",
    "a close-up of a laptop displaying a clean professional digital interface — commercial product photography, shallow depth of field, neutral background",
    "a clean desk workspace with a notepad, laptop, and coffee — lifestyle commercial photography, natural window light, minimal and professional",
  ],
};

/* Context keyword → HVAC scene index subsets.
   When the user's offer/benefit text signals a specific service type, scene selection
   narrows to the most relevant scenes. Hash picks deterministically within the subset. */
const HVAC_CONTEXT_BUCKETS = [
  { re: /\b(tune.?up|maintenance|annual|seasonal.check|check.?up|inspect|filter.change|filter.replace|service.check)\b/i, indices: [8, 6, 5, 13] },
  { re: /\b(repair|fix|broken|not.cooling|not.heating|emergency|diagnostic|failure|broke|malfunction)\b/i,               indices: [6, 7, 0, 12] },
  { re: /\b(install|installation|new.system|new.unit|replace|replacement|upgrade|new.equipment)\b/i,                      indices: [7, 15, 0, 3] },
  { re: /\b(comfort|indoor.air|air.quality|iaq|clean.air|allergen|purif|fresh.air|healthy.air)\b/i,                       indices: [9, 2, 3, 5] },
  { re: /\b(heat|heating|furnace|warm|boiler|winter)\b/i,                                                                 indices: [10, 15, 8, 2] },
  { re: /\b(cool|cooling|ac\b|air.cond|summer|hot)\b/i,                                                                   indices: [11, 0, 3, 12] },
  { re: /\b(promo|special|offer|discount|financing|deal|save\b|savings|rebate|credit)\b/i,                                indices: [12, 11, 0, 7] },
  { re: /\b(effici|energy|electric.bill|utility.bill|lower.bill|save.money|high.effici)\b/i,                              indices: [15, 7, 0, 9] },
];

/* Select a scene from the appropriate industry pool.
   - hash is the djb2 token hash from buildAdPromptFromAnswers (deterministic per variationToken)
   - a is the raw form answers object (used for context-keyword nudging on HVAC)
   Returns null for unknown industries, which falls through to VISUAL_MOODS. */
function getIndustryScene(industry, hash, a = {}) {
  const ind = String(industry || "").toLowerCase();
  const h = Number.isFinite(hash) ? hash : Math.floor(Math.random() * 999983);

  if (/hvac|heating|cooling|air.?cond/.test(ind)) {
    const pool = INDUSTRY_SCENES.hvac;
    // Check form context for service-type keywords to narrow scene to relevant bucket
    const ctx = String([
      a.mainBenefit || "", a.offer || "", a.description || "",
      a.details || "", a.offerHeadline || "", a.secondary || "",
    ].join(" "));
    for (const bucket of HVAC_CONTEXT_BUCKETS) {
      if (bucket.re.test(ctx)) {
        return pool[bucket.indices[h % bucket.indices.length]];
      }
    }
    return pool[h % pool.length];
  }

  const pick = (arr) => arr[h % arr.length];
  if (/plumb/.test(ind))                           return pick(INDUSTRY_SCENES.plumbing);
  if (/electr/.test(ind))                          return pick(INDUSTRY_SCENES.electrical);
  if (/roof/.test(ind))                            return pick(INDUSTRY_SCENES.roofing);
  if (/landscap|lawn/.test(ind))                   return pick(INDUSTRY_SCENES.landscaping);
  if (/clean|maid/.test(ind))                      return pick(INDUSTRY_SCENES.cleaning);
  if (/dental|dent/.test(ind))                     return pick(INDUSTRY_SCENES.dental);
  if (/restaurant|food|cater/.test(ind))           return pick(INDUSTRY_SCENES.restaurant);
  if (/auto|car|vehicle/.test(ind))                return pick(INDUSTRY_SCENES.auto);
  if (/pest/.test(ind))                            return pick(INDUSTRY_SCENES.pest);
  if (/real.?estate|realt/.test(ind))              return pick(INDUSTRY_SCENES.realEstate);
  if (/fitness|gym|personal.?train/.test(ind))     return pick(INDUSTRY_SCENES.fitness);
  if (/salon|hair|beauty/.test(ind))               return pick(INDUSTRY_SCENES.salon);
  if (/insur/.test(ind))                           return pick(INDUSTRY_SCENES.insurance);
  if (/legal|law/.test(ind))                       return pick(INDUSTRY_SCENES.legal);
  if (/market|advertis|agency/.test(ind))          return pick(INDUSTRY_SCENES.marketing);
  return null; // unknown industry — fall through to VISUAL_MOODS
}

/* Named layout recipes for controlled composition variety.
   Principle: the photo is always the hero. Text sits naturally over or beside it with
   minimal support. No inset photo boxes, no icon grids, no stacked decorative panels.
   Variety comes from text placement, scrim style, and photo composition — not from structure. */
const LAYOUT_RECIPES = [
  // 0 — full-bleed, text lower with gradient scrim
  "Full-bleed photographic scene fills the entire canvas. Headline and support copy sit in the lower portion with a smooth gradient scrim beneath them — the scrim fades naturally from fully transparent at center to a dark overlay at the bottom, giving text legible contrast without obscuring the photo. CTA as a small pill or compact rectangle with solid fill. No borders, no panels, no frames — just the photo and clean text.",

  // 1 — premium split: light text panel left, photo right
  "Split composition: the left 40–45% of the canvas is a clean, light panel — white, off-white, or a very light neutral background. The right 55–60% is the photographic scene, meeting the panel with a clean edge. On the left panel: headline in large, heavy, dark type broken across 2 lines for impact — this two-line format is essential for visual weight. Below the headline: a thin brand-accent color horizontal rule (1–2px), then the support copy in a smaller lighter weight. CTA or contact info at the bottom of the panel. The left panel must feel uncluttered — generous spacing, strong typographic hierarchy, nothing decorative beyond the accent rule. No additional footer strips or feature lists below — keep it clean.",

  // 2 — photo left, text right
  "The photographic scene fills the left 55–60% of the canvas. A clean, lightly colored background on the right holds the headline, support copy, and CTA stacked with clear spacing. No frames around the photo, no fake border at the edge, no extra decorative elements. The photo and text are the only things in the composition.",

  // 3 — photo hero top, simple footer bar
  "The photographic scene fills the upper 65–70% of the canvas. Below: a clean solid-color footer bar in a deep, grounded tone (dark navy, charcoal, or a strong brand color). The footer contains only: the CTA as a clearly styled button, and — if provided — the phone number or website in clean readable type. No icons, no multi-column service grids, no feature labels. The bar should feel like a clean professional ad footer, not a brochure panel. The photo does the storytelling; the bar provides the single next action.",

  // 4 — minimal, text over open negative space
  "Minimal full-bleed: the scene is chosen for open negative space — clear sky, open wall, simple floor — where text can sit directly on the photo with natural contrast. Short headline placed cleanly in the open area. A clean CTA button below. No scrim unless the photo genuinely needs contrast help, and if so, only a very light one. Nothing else. The photo sells the ad.",

  // 5 — text-forward, photo background
  "Text-forward layout: the headline is large and dominant in the upper half of the canvas. The photographic scene fills the full canvas or lower half as a natural background. Support copy and CTA sit below the headline with clear spacing. A simple smooth gradient may darken the upper area slightly for legibility if needed. No hard panels, no poster borders — text and photo coexist naturally.",

  // 6 — photo hero with minimal CTA strip
  "Strong photographic hero fills the top 70–75% of the canvas. Below: a simple, undecorated strip — solid color, just enough height for the CTA button and one contact line. No icons, no columns, no feature lists. The photo carries the message; the strip handles the single call to action.",

  // 7 — centered text on vignette
  "Full-scene photography with a smooth, natural vignette — the scene stays fully visible at center while edges darken gently to provide contrast zones for text. Headline centered or slightly upper-center in white or high-contrast text. CTA centered below as a clean styled button. Nothing else — no callout boxes, no additional layers. Scene, headline, CTA.",

  // 8 — headline and offer prominent, photo as atmosphere
  "The headline and offer text are given clear visual priority — set large and legibly over the photographic scene, which serves as atmosphere rather than the focal point. The photo may be slightly darkened or used as a full-canvas tonal background. A clearly styled CTA button sits below the headline block. No decorative badges, no callout boxes — the type itself is the design.",

  // 9 — scene-first, almost no text
  "Scene-first editorial layout: the photographic scene carries nearly all the visual weight. One short, confident headline — 4–5 words — placed in the lower third or a corner using natural photo contrast or a very light gradient strip. CTA small and understated below. Nothing else. This works when the scene is strong enough to sell the concept on its own.",
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
   Prefers a complete first sentence (≤11 words). If the first sentence is too long,
   returns empty string — a missing support line is better than a semantically broken fragment. */
function imageSafeSupport(s) {
  const full = clean(s);
  if (!full) return "";
  const firstSentMatch = full.match(/^(.+?[.!?])(?:\s|$)/);
  if (firstSentMatch) {
    const sent = firstSentMatch[1].trim();
    if (sent.split(/\s+/).filter(Boolean).length <= 11) return sent;
  }
  // Sentence too long — omit rather than emit a broken fragment
  return "";
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


function buildAdPromptFromAnswers(a = {}, craftedCopy = {}, variationToken = "", { logoFound = false } = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = inferIndustry(a);
  const website = clean(a.website || a.url || "");
  const phone = clean(a.phone || "");
  const offer = clip(deriveOffer(a, craftedCopy), 70);
  // No outer wordTrim — deriveHeadline already handles truncation internally.
  // The previous double-truncation at 28 chars was causing cut-off headlines.
  const headline = deriveHeadline(a, craftedCopy);
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  // djb2-style hash — drives scene selection and variation deterministically per token.
  function tokenHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
    return Math.abs(h);
  }
  const hash = variationToken
    ? tokenHash(variationToken)
    : Math.floor(Math.random() * 999983);

  // Industry-specific scene (hash-indexed for deterministic variety per token).
  // Falls back to generic VISUAL_MOODS for unknown industries.
  const moodIdx = (hash >> 3) % VISUAL_MOODS.length;
  const industryScene = getIndustryScene(industry, hash, a);
  const sceneDescription = industryScene || VISUAL_MOODS[moodIdx];
  const noPersonClause = (industryScene || !sceneDescription.toLowerCase().includes("person"))
    ? "No people in the scene unless the description above explicitly mentions one."
    : null;

  // Contact lines — only what was actually provided
  const hasContact = website || phone;

  return [
    `Generate a polished square Facebook/Instagram ad for "${businessName}", a ${industry} business.`,
    ``,
    `PHOTOGRAPHIC STYLE — most important: This image must look like a real photograph taken by a professional commercial photographer. Real-world lighting with natural shadows, authentic surface textures, genuine depth of field, and subtle photographic grain. The scene must feel like it actually exists. Not illustration, not CGI, not cartoon, not over-smoothed — a real photo.`,
    ``,
    `SCENE: ${sceneDescription}`,
    noPersonClause,
    ``,
    `AD COPY — render exactly as written:`,
    `  Headline: "${headline}"`,
    supportLine ? `  Supporting line: "${supportLine}"` : null,
    `  CTA button: "${cta}"`,
    website ? `  Website: ${website}` : null,
    phone ? `  Phone: ${phone}` : null,
    `  Business name: "${businessName}"`,
    offer ? `  Offer: "${offer}"` : null,
    ``,
    `TEXT RULES — strictly enforced:`,
    `  Every word of every text element must be completely visible and legible. No truncation, no clipping, no ellipsis. If text is tight, reduce font size — never cut words. Headline is the largest, boldest element. Supporting line is clearly smaller. CTA is a clean styled button with solid fill. Keep generous space between text elements. All text must stay at least 8% from every image edge.`,
    ``,
    hasContact
      ? `CONTACT — strictly enforced: Only show the exact contact details listed above. Never invent any website URL, domain name, or phone number.`
      : `CONTACT — strictly enforced: No website or phone was provided. Do NOT display any URL, domain name, or phone number anywhere in the image.`,
    ``,
    `COMPOSITION: Clean, modern social ad. The photo is the hero — text sits naturally over or beside the scene with good contrast. A gradient scrim or semi-transparent strip is fine for legibility if needed; keep it subtle. CTA as a pill or rectangle button. No cluttered footers, no icon rows, no badge stickers, no brochure layouts. Minimal, premium, ad-quality.`,
    ``,
    logoFound
      ? `LOGO: A real business logo will be composited after generation. Do not draw any logo, brand mark, icon, emblem, or graphic symbol.`
      : `BRANDING: No logo. Do not draw any logo, brand mark, seal, or graphic symbol. Do not write any manufacturer, supplier, or third-party brand name other than "${businessName}".`,
    !offer ? `Do not invent any promotional offer, discount, or sale.` : null,
    ``,
    `PHOTOREALISM FINAL CHECK: The scene must look captured with a real camera — authentic grain, real surfaces, believable natural light. If any part looks illustrated, CGI, or synthetic, it is wrong. The photograph itself must never look generated or stylized.`,
    variationToken ? `Variation: ${variationToken}` : null,
  ]
    .filter(Boolean)
    .join("\n");
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
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

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
   The photo already provides the scene — we only need to describe:
   1. How to preserve its photographic quality (strongly)
   2. What ad text elements to add on top of it
   This prompt must produce results at the same quality bar as the main generation path. */
function buildAdEditPromptFromAnswers(a = {}, craftedCopy = {}, { logoFound = false } = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = inferIndustry(a);
  const website = clean(a.website || a.url || "");
  const phone = clean(a.phone || "");
  const offer = clip(deriveOffer(a, craftedCopy), 70);
  const headline = deriveHeadline(a, craftedCopy); // deriveHeadline handles its own truncation
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  return [
    `This is a real photograph uploaded by "${businessName}", a ${industry} business. Add a premium, professional Facebook/Instagram ad text treatment to this photo. The result must be a polished, ad-quality creative — clean, modern, and visually strong.`,
    ``,
    `PRESERVE THE PHOTOGRAPH — THIS IS THE MOST IMPORTANT DIRECTIVE:`,
    `The photograph must remain completely unchanged in photographic quality, style, lighting, grain, and content. Do NOT alter, restyle, redraw, or transform any part of the scene. You are adding text and a CTA button as an overlay only — not redesigning the image. The photo is the background: keep it looking exactly like a real photograph.`,
    ``,
    `DO NOT apply any of these styles to the photo or the overall result: illustration, digital painting, cartoon, anime, watercolor, comic-book look, CGI render, plastic-looking CGI surfaces, fantasy lighting, overly smooth AI-synthesis texture, hand-drawn aesthetics, or any treatment that makes the image look generated, stylized, or non-photographic. The photo must stay a photograph — real, grain-authentic, and untouched.`,
    ``,
    `AD COPY TO ADD:`,
    `  Headline: "${headline}"`,
    supportLine ? `  Support text: "${supportLine}"` : null,
    `  CTA: "${cta}"`,
    website ? `  Website: ${website}` : null,
    phone ? `  Phone: ${phone}` : null,
    `  Brand name: "${businessName}"`,
    offer ? `  Offer: "${offer}"` : `  Do not invent any promotional offer or discount.`,
    ``,
    `CONTACT IDENTITY — strictly enforced: Only display the exact contact details listed above. Never invent, guess, or hallucinate any website URL, domain name, or phone number.`,
    !website ? `No website was provided — do NOT display any website URL, domain, or web address anywhere in the image.` : null,
    !phone ? `No phone number was provided — do NOT display any phone number anywhere in the image.` : null,
    ``,
    `TYPOGRAPHY: the headline is the dominant typographic element — set at the largest size and heaviest weight of the chosen typeface. For headlines of 3 or more words, break across 2 short lines for maximum visual impact. Support copy should be clearly lighter in weight. ${website || phone ? "Place contact info (phone/website) in a clean footer zone at the bottom of the ad." : "No contact info was provided — do not add a contact strip."} All text must be fully legible at social-feed viewing sizes.`,
    ``,
    `DESIGN TREATMENT: Choose one clean layout that works with the photo — (a) text in the lower portion on a smooth gradient scrim from transparent to dark; (b) a clean text panel on one side with the photo filling the other; (c) text placed in an open area of the photo with natural contrast. CTA as a clean pill or compact rectangle button with solid fill and high-contrast label. One optional thin horizontal accent rule (1–2px) between headline and support copy. No photo frames, no inset boxes, no callout badges, no decorative clutter. Premium-minimal — every element earns its place.`,
    ``,
    logoFound
      ? `LOGO: A real business logo will be composited after generation — do not draw any logo, brand mark, icon, or emblem.`
      : `BRANDING: No logo available — do not draw any logo, brand mark, or graphic symbol. Do not write any equipment manufacturer, supplier, or third-party brand name other than "${businessName}".`,
    ``,
    `FINAL CHECK: The photographic scene must look exactly as uploaded — authentic grain, real-world materials, believable natural light, no stylization. The ad text sits cleanly on top. The final result should look like a real commercial ad creative built from a real business photograph — not like AI-generated art.`,
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
          // Raised minimums: real business logos are at least 120×30 px.
          // Tightened aspect ratio: 0.8–6.0 excludes favicons, tall banners,
          // and ultra-wide equipment badges that were slipping through.
          if (meta.width < 120 || meta.height < 30) continue;
          if (meta.width > 2000 || meta.height > 1200) continue;
          if (aspect < 0.8 || aspect > 6.0) continue;
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

    // Ensure any fill/pad area introduced by resize is transparent, not black.
    // Then guarantee an alpha channel exists before converting to PNG so the
    // composite always blends correctly rather than painting a solid rectangle.
    const logoMetaRaw = await sharp(logoBuf).metadata();
    const hasAlpha = (logoMetaRaw.channels || 3) >= 4;

    let logoSharp = sharp(logoBuf).resize(maxLogoW, maxLogoH, {
      fit: "inside",
      withoutEnlargement: true,
      background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent fill, not black
    });

    if (!hasAlpha) {
      // Source has no alpha (JPEG or opaque PNG). Trim uniform border color so the
      // logo isn't surrounded by the page background it was captured against.
      // trim() uses the top-left corner pixel as the reference background color.
      try {
        logoSharp = logoSharp.trim();
      } catch {
        // trim failed — proceed without it
      }
    }

    const preparedLogo = await logoSharp
      .ensureAlpha()   // adds alpha=1 for opaque pixels; keeps existing alpha intact
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

    // Detect logo BEFORE building the prompt so the branding instructions accurately
    // reflect whether a real logo will be composited. Wrong logo is worse than no logo —
    // if detection is not confident, the prompt must explicitly forbid invented brand text.
    const logoBuf = website
      ? await Promise.race([
          detectBrandLogo(website).catch(() => null),
          new Promise((resolve) => setTimeout(() => resolve(null), 5000)),
        ])
      : null;

    const variationToken = String(
      body.regenerateToken || body.variant || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    );

    // Detect a user-uploaded photo — if present, use the image-edit path instead of text-to-image.
    // The field is sent as a base64 DataURL: "data:image/jpeg;base64,..."
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
      // User-uploaded photo path: edit the existing image to add ad treatment.
      const editPrompt = buildAdEditPromptFromAnswers(a, craftedCopy, { logoFound: !!logoBuf });
      console.log("[generate-static-ad] using user-uploaded image via edit endpoint");
      imageBuffers = await generateOpenAIAdImageEdit({
        imageBuffer: userImageBuffer,
        prompt: editPrompt,
        size: "1024x1024",
        quality: "high",
        n: count,
      });
    } else {
      // Standard text-to-image path.
      const prompt = buildAdPromptFromAnswers(a, craftedCopy, variationToken, { logoFound: !!logoBuf });
      imageBuffers = await generateOpenAIAdImageBuffers({
        prompt,
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: count,
      });
    }

    if (!Array.isArray(imageBuffers) || !imageBuffers.length) {
      throw new Error("No image buffers returned from generator");
    }

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