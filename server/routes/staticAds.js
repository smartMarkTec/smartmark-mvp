/* eslint-disable */
"use strict";

const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const mustache = require("mustache");
const Ajv = require("ajv");
const sharp = require("sharp");
const http = require("http");
const https = require("https");

const ajv = new Ajv({ allErrors: true });

/* ------------------------ Paths / URLs ------------------------ */

const GEN_DIR =
  process.env.GENERATED_DIR ||
  path.join(process.cwd(), "server", "public", "generated");
fs.mkdirSync(GEN_DIR, { recursive: true });

const STOCK_DIR = path.join(process.cwd(), "server", "public", "stock");
try {
  fs.mkdirSync(STOCK_DIR, { recursive: true });
} catch {}

function makeMediaUrl(req, filename) {
  const base =
    process.env.PUBLIC_BASE_URL || req.protocol + "://" + req.get("host");
  return `${base}/api/media/${filename}`;
}
function selfUrl(req, p = "") {
  const base =
    process.env.PUBLIC_BASE_URL || req.protocol + "://" + req.get("host");
  return `${base}${p.startsWith("/") ? p : `/${p}`}`;
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

function fetchUpstream(method, url, extraHeaders = {}, bodyBuf = null) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.request(
        url,
        { method, timeout: 25000, headers: extraHeaders },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      r.on("error", reject);
      r.on("timeout", () => {
        r.destroy(new Error("HTTP timeout"));
      });
      if (bodyBuf) r.write(bodyBuf);
      r.end();
    } catch (e) {
      reject(e);
    }
  });
}

function fetchBuffer(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.get(
        url,
        { timeout: 15000, headers: extraHeaders },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            return fetchBuffer(res.headers.location, extraHeaders)
              .then(resolve)
              .catch(reject);
          }
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}`));
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("end", () => resolve(Buffer.concat(chunks)));
        }
      );
      r.on("error", reject);
      r.on("timeout", () => {
        r.destroy(new Error("HTTP timeout"));
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ------------------------ Industry profiles ------------------------ */

function classifyIndustry(s = "") {
  const t = String(s).toLowerCase();
  const has = (rx) => rx.test(t);

  if (has(/clean|maid|janitor|housekeep/)) return "home_cleaning";
  if (has(/floor|carpet|tile|vinyl|hardwood/)) return "flooring";
  if (has(/restaurant|food|pizza|burger|cafe|bar|grill|taqueria|eat|diner/))
    return "restaurant";
  if (has(/gym|fitness|trainer|yoga|crossfit|pilates/)) return "fitness";
  if (has(/salon|spa|barber|nail|lash|beauty/)) return "salon_spa";
  if (has(/real\s?estate|realtor|broker|homes?|listings?/))
    return "real_estate";
  if (has(/auto|mechanic|tire|oil|detailing|car wash/)) return "auto";
  if (has(/landscap|lawn|tree|garden|yard/)) return "landscaping";
  if (has(/plumb|hvac|heating|cooling|air|electric/)) return "hvac_plumbing";
  if (has(/fashion|apparel|clothing|boutique|shoe|jewel/)) return "fashion";
  if (has(/electronics?|gadgets?|tech/)) return "electronics";
  if (has(/pet|groom|vet|animal/)) return "pets";
  if (has(/coffee|bakery|dessert|boba|tea/)) return "coffee";
  return "generic";
}

function profileForIndustry(industry = "") {
  const kind = classifyIndustry(industry);

  const PALETTES = {
    base: {
      header: "#0d3b66",
      body: "#dff3f4",
      accent: "#ff8b4a",
      textOnDark: "#ffffff",
      textOnLight: "#2b3a44",
    },
    teal: {
      header: "#0b5563",
      body: "#e7f6f2",
      accent: "#16a085",
      textOnDark: "#ffffff",
      textOnLight: "#23343d",
    },
    navy: {
      header: "#113a5d",
      body: "#e8f0f6",
      accent: "#ff7b41",
      textOnDark: "#ffffff",
      textOnLight: "#213547",
    },
    wine: {
      header: "#3a2740",
      body: "#f2ecf7",
      accent: "#e76f51",
      textOnDark: "#ffffff",
      textOnLight: "#2d283a",
    },
    forest: {
      header: "#1d3b2a",
      body: "#e9f5ee",
      accent: "#f4a261",
      textOnDark: "#ffffff",
      textOnLight: "#273b33",
    },
    slate: {
      header: "#213043",
      body: "#eaf2fb",
      accent: "#f59e0b",
      textOnDark: "#ffffff",
      textOnLight: "#182435",
    },
  };

  const serviceLists = {
    left: ["One Time", "Weekly", "Bi-Weekly", "Monthly"],
    right: ["Kitchen", "Bathrooms", "Offices", "Dusting", "Mopping", "Vacuuming"],
  };
  const hvacLists = {
    left: ["Install", "Repair", "Tune-Up", "Maintenance"],
    right: [
      "AC Units",
      "Furnaces",
      "Ductwork",
      "Thermostats",
      "Heat Pumps",
      "Filters",
    ],
  };
  const plumbingLists = {
    left: ["Leaks", "Clogs", "Installs", "Repairs"],
    right: [
      "Water Heaters",
      "Toilets",
      "Sinks",
      "Showers",
      "Garbage Disposal",
      "Piping",
    ],
  };
  const landscapingLists = {
    left: ["Mowing", "Edging", "Trimming", "Cleanup"],
    right: ["Mulch", "Hedges", "Tree Care", "Fertilize", "Weed Control", "Irrigation"],
  };
  const autoLists = {
    left: ["Oil Change", "Brakes", "Tires", "Alignment"],
    right: ["Diagnostics", "AC Service", "Batteries", "Inspections"],
  };

  const MAP = {
    home_cleaning: {
      template: "flyer_a",
      headline: "HOME CLEANING SERVICES",
      subline: "Apartment • Home • Office",
      cta: "CALL NOW!",
      palette: PALETTES.navy,
      lists: serviceLists,
      coverage: "Coverage area 25 Miles around your city",
      bgHint: "home cleaning",
    },
    flooring: {
      template: "poster_b",
      palette: PALETTES.forest,
      bgHint: "flooring",
    },
    restaurant: {
      template: "poster_b",
      palette: PALETTES.wine,
      bgHint: "restaurant",
    },
    salon_spa: {
      template: "poster_b",
      palette: PALETTES.wine,
      bgHint: "salon spa",
    },
    fitness: {
      template: "poster_b",
      palette: PALETTES.slate,
      bgHint: "gym fitness",
    },
    real_estate: {
      template: "poster_b",
      palette: PALETTES.teal,
      bgHint: "real estate",
    },
    auto: {
      template: "flyer_a",
      headline: "AUTO REPAIR & SERVICE",
      subline: "Reliable • Fast • Affordable",
      cta: "CALL NOW!",
      palette: PALETTES.slate,
      lists: autoLists,
      coverage: "Same-day appointments available",
      bgHint: "auto repair",
    },
    landscaping: {
      template: "flyer_a",
      headline: "LANDSCAPING & LAWN CARE",
      subline: "Clean-ups • Maintenance • Installs",
      cta: "GET A QUOTE",
      palette: PALETTES.forest,
      lists: landscapingLists,
      coverage: "Serving your area",
      bgHint: "landscaping",
    },
    hvac_plumbing: {
      template: "flyer_a",
      headline: "HVAC & PLUMBING",
      subline: "Install • Repair • Maintenance",
      cta: "SCHEDULE NOW",
      palette: PALETTES.teal,
      lists: hvacLists,
      coverage: "Emergency service available",
      bgHint: "hvac plumbing",
    },
    fashion: {
      template: "poster_b",
      palette: PALETTES.wine,
      bgHint: "fashion",
    },
    electronics: {
      template: "poster_b",
      palette: PALETTES.slate,
      bgHint: "electronics",
    },
    pets: {
      template: "poster_b",
      palette: PALETTES.forest,
      bgHint: "pets",
    },
    coffee: {
      template: "poster_b",
      palette: PALETTES.wine,
      bgHint: "coffee",
    },
    generic: {
      template: "flyer_a",
      headline: "LOCAL SERVICES",
      subline: "Reliable • Friendly • On Time",
      cta: "CONTACT US",
      palette: PALETTES.base,
      lists: {
        left: ["Free Quote", "Same-Day", "Licensed", "Insured"],
        right: ["Great Reviews", "Family Owned", "Fair Prices", "Guaranteed"],
      },
      coverage: "Serving your area",
      bgHint: "generic",
    },
  };

  let prof = MAP[kind];
  if (kind === "hvac_plumbing" && /plumb/i.test(industry)) {
    prof = { ...prof, lists: plumbingLists };
  }
  return { kind, ...prof };
}

/* ------------------------ Copy helpers ------------------------ */

function titleCase(s = "") {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}
function cleanLine(s = "") {
  const noUrl = String(s).replace(/https?:\/\/\S+|www\.\S+/gi, "");
  return noUrl.replace(/\s+/g, " ").trim();
}
function clampWords(s = "", max = 16) {
  const w = String(s)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return w.length > max ? w.slice(0, max).join(" ") + "…" : String(s).trim();
}

function pickHeadlineWordCap() {
  // Random int between 3 and 6
  return 3 + Math.floor(Math.random() * 4);
}


function trimDanglingTail(s = "") {
  const words = String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";

  const badEnd = new Set(["for", "of", "to", "with", "and", "or", "at", "in", "on"]);
  const last = words[words.length - 1].toLowerCase();

  if (badEnd.has(last)) {
    words.pop();
  }
  return words.join(" ");
}

function trimDanglingTail(s = "") {
  const words = String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return "";

  const badEnd = new Set(["for", "of", "to", "with", "and", "or", "at", "in", "on"]);
  const last = words[words.length - 1].toLowerCase();

  if (badEnd.has(last)) {
    words.pop();
  }
  return words.join(" ");
}

const HEADLINE_CHAR_MAX = 20; // target ~16–20 characters max

function safeHeadlineText(s = "") {
  // 1) basic clean + remove URLs + clamp to at most 6 words
  const base = trimDanglingTail(clampWords(cleanLine(s || ""), 6));
  if (!base) return "";

  // 2) if already short enough, we're done
  if (base.length <= HEADLINE_CHAR_MAX) return base;

  // 3) otherwise, build up word-by-word until we hit the char cap
  const words = base.split(/\s+/).filter(Boolean);
  let out = "";

  for (const w of words) {
    const candidate = out ? out + " " + w : w;
    if (candidate.length > HEADLINE_CHAR_MAX) break;
    out = candidate;
  }

  // 4) if (weirdly) nothing fit, do a hard slice as a last resort
  if (!out) out = base.slice(0, HEADLINE_CHAR_MAX).trim();

  // 5) make sure we don't end on "for / of / to / with / and / or / at / in / on"
  return trimDanglingTail(out);
}


// --- Very simple headline variety by industry ---
const HEADLINE_VARIANTS = {
  flooring: [
    "Flooring Deals",
    "Fresh New Floors",
    "Update Your Floors",
    "Stylish Flooring",
  ],
  restaurant: [
    "Tonight’s Special",
    "Hungry? Pull Up",
    "Fresh Hot Bites",
    "Dinner Plans?",
  ],
  coffee: [
    "Coffee Time",
    "Your Daily Brew",
    "Fresh Hot Coffee",
    "Morning Fuel",
  ],
  fashion: [
    "New Fits In",
    "Drop New Styles",
    "Fresh Fits Daily",
    "Style Upgrade",
  ],
  electronics: [
    "Tech Deals",
    "Upgrade Your Tech",
    "New Gadgets In",
    "Smart Tech Sale",
  ],
  pets: [
    "Happy Pet Toys",
    "For Happy Pups",
    "Spoil Your Pet",
    "Pet Fun Time",
  ],
  generic: [
    "Local Deals",
    "New Offer In",
    "Don’t Miss This",
    "Limited Time",
  ],
};

function pickHeadlineVariant(kind = "generic") {
  const list = HEADLINE_VARIANTS[kind] || HEADLINE_VARIANTS.generic;
  if (!list || !list.length) return "";
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

// Use GPT headline *if* it’s decent, otherwise swap to a random variant
function applyHeadlineVariety(rawHeadline = "", kind = "generic") {
  let h = safeHeadlineText(rawHeadline || "");

  // If GPT gave nothing or some tiny/generic junk, swap for one of ours
  if (!h || h.length < 4) {
    h = pickHeadlineVariant(kind);
  }

  if (!h) h = "Local Deals";

  return safeHeadlineText(h);
}



// normalize subline → allow to be fairly long, but still neat
function safeSublineText(s = "") {
  return trimDanglingTail(clampWords(cleanLine(s || ""), 14));
}



const INDUSTRY_TEMPLATES = {
  home_cleaning: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Sparkling Clean Spaces`,
    subline: (aud, city) =>
      [
        aud || "Apartments • Homes • Offices",
        city ? `Serving ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Weekly & one-time",
      "Kitchens & bathrooms",
    ],
  },

  flooring: {
    headline: (brand, benefit) =>
      benefit || `${brand ? titleCase(brand) + ": " : ""}Flooring Sale Event`,
    subline: (aud, city) =>
      [
        aud || "Hardwood • Vinyl • Tile",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Free estimates",
      "Pro installation",
    ],
  },

  restaurant: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Fresh Flavor, Fast Service`,
    subline: (aud, city) =>
      [
        aud || "Dine-in • Takeout • Delivery",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Daily specials",
      "Order online",
    ],
  },

  salon_spa: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Relax, Refresh, Renew`,
    subline: (aud, city) =>
      [
        aud || "Hair • Nails • Skin",
        city ? `Located in ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Cuts & color",
      "Spa treatments",
    ],
  },

  fitness: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Stronger Every Session`,
    subline: (aud, city) =>
      [
        aud || "Classes • Personal training",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Group classes",
      "Open gym access",
    ],
  },

  real_estate: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Find Your Next Home`,
    subline: (aud, city) =>
      [
        aud || "Buying • Selling • Leasing",
        city ? `Across ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Free home valuation",
      "Local experts",
    ],
  },

  auto: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Reliable Auto Service`,
    subline: (aud, city) =>
      [
        aud || "Oil changes • Brakes • Tires",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Same-day appointments",
      "Certified techs",
    ],
  },

  landscaping: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Yards That Stand Out`,
    subline: (aud, city) =>
      [
        aud || "Mowing • Cleanup • Installs",
        city ? `Serving ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Seasonal cleanups",
      "Ongoing maintenance",
    ],
  },

  hvac_plumbing: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Comfort You Can Count On`,
    subline: (aud, city) =>
      [
        aud || "Heat • AC • Plumbing",
        city ? `Serving ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Install & repair",
      "24/7 emergency",
    ],
  },

  fashion: {
    headline: (brand, benefit) =>
      benefit || `${brand ? titleCase(brand) + ": " : ""}New Season Styles`,
    subline: (aud, city) => {
      const parts = [];
      if (aud) parts.push(aud);
      else parts.push("Everyday quality. Statement looks.");
      if (city) parts.push(`Available in ${city}`);
      return parts.join(" • ");
    },
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Premium fabrics",
      "Modern fits",
    ],
  },

  electronics: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Smart Tech Deals`,
    subline: (aud, city) =>
      [
        aud || "Laptops • Phones • Accessories",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Latest devices",
      "Expert support",
    ],
  },

  pets: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Play-Ready Pet Toys`,
    subline: (aud, city) => {
      const parts = [];
      if (aud) parts.push(aud);
      parts.push("Safe • Long-lasting fun");
      if (city) parts.push(`Available in ${city}`);
      return parts.join(" • ");
    },
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Tough materials",
      "For all breeds",
    ],
  },

  coffee: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Your Daily Coffee Spot`,
    subline: (aud, city) =>
      [
        aud || "Espresso • Lattes • Pastries",
        city ? `In ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Freshly roasted",
      "Cozy atmosphere",
    ],
  },

  generic: {
    headline: (brand, benefit) =>
      benefit ||
      `${brand ? titleCase(brand) + ": " : ""}Quality You Can Trust`,
    subline: (aud, city) =>
      [
        aud || "Local service you can count on",
        city ? `Serving ${city}` : null,
      ]
        .filter(Boolean)
        .join(" • "),
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : "Fast scheduling",
      "Great reviews",
    ],
  },
};

/* ------------------------ OpenAI copy ------------------------ */

/* ------------------------ OpenAI copy ------------------------ */

async function generateSmartCopyWithOpenAI(answers = {}, prof = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const sys = `You are a marketing copywriter for clean square social ads with a Shaw Floors style layout.
Return only strict JSON for these fields:
{ "headline": "...", "subline": "...", "offer": "...", "secondary": "", "bullets": ["...","..."], "disclaimers": "" }

Global behavior / variety:
- Imagine this business will run many different ad variations over time.
- For each request, choose a headline and subline pattern that feels fresh and specific to the inputs.
- Avoid reusing the same generic headline over and over (for example, don't keep giving "Durable Toys For" or "Elevate Your Style").
- Use concrete language tied to the business, audience, and offer.

Headline rules:
- Headline: between 3 and 6 words total, punchy, no period at end.
- You MAY end the headline with a single exclamation mark (!) if it feels natural for the brand and offer.
- Never use more than one '!' in the headline (no "!!").
- It must stand alone as a complete campaign idea (e.g., "Happy Pup Toys", "Fresh Summer Styles").
- Do NOT end with connector words like "for", "of", "to", "with", "and".
- Avoid generic phrases like "Elevate your", "Transform your", or "Upgrade your".
- Use varied wording from ad to ad based on the business and benefit (don’t always repeat words like "Durable").

Subline rules:
- One complete phrase or short sentence, up to about 16 words.
- It should read naturally and should NOT end on just "for / of / to / with / and / or".
- It can echo the benefit or describe how/when the product is used.
- The subline MAY end with a single exclamation mark (!) for warmth, but only if the headline does NOT use '!'.

Exclamation rules:
- Across the headline and subline combined, you may use AT MOST ONE exclamation mark total.
- If the headline uses '!', the subline must not contain any '!'.
- Never use more than one '!' in a row.

Bullet rules:
- 2–3 micro-phrases, 1–3 words each, no periods.
- Think of compact feature labels such as "Long wear", "Vegan formulas", "Tough chewers".
- Do NOT repeat the offer text inside bullets or the subline.

Offer rules:
- If the user's input clearly describes a deal (e.g., 20% off, $50 off, buy one get one, free shipping), put a very short, punchy version in "offer" (1–4 words) that matches the deal.
- If the user's offer field is blank or clearly indicates no discount (e.g., "no offer", "none", "n/a"), STILL fill "offer" with a short non-discount promo label such as a collection or benefit tag (for example: "New Collection", "Best Sellers", "Signature Menu", "Everyday Favorites").
- When you create one of these non-discount promo labels, do NOT invent fake percentages, prices, or words like "OFF", "% OFF", "$ OFF", "SALE", "FREE", "DEAL", or "DISCOUNT". It must read like a neutral promo tag, not a discount.

General:
- Keep all copy coherent, brand-safe, specific to the business, and suitable for a single static promo image.`;

  const user = {
    businessName: answers.businessName || "",
    industry: answers.industry || "",
    location: answers.location || answers.city || "",
    idealCustomer: answers.idealCustomer || "",
    offer: answers.offer || "",
    mainBenefit: answers.mainBenefit || answers.benefit || "",
    website: answers.website || "",
  };

  const body = JSON.stringify({
    model,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Make ad copy for:\n${JSON.stringify(user, null, 2)}` },
    ],
    temperature: 0.8,
    response_format: { type: "json_object" },
  });

  const { status, body: respBuf } = await fetchUpstream(
    "POST",
    "https://api.openai.com/v1/chat/completions",
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    Buffer.from(body)
  );

  if (status !== 200) return null;

  try {
    const parsed = JSON.parse(respBuf.toString("utf8"));
    const content = parsed?.choices?.[0]?.message?.content || "{}";
    const j = JSON.parse(content);
    if (j && j.headline) return j;
  } catch (_) {}
  return null;
}


/* ------------------------ Offer & bullets ------------------------ */

function tightenOfferText(s = "") {
  let t = String(s || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s%$]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";

  const shortenWords = (str, maxWords = 4) => {
    const words = String(str || "").trim().split(/\s+/);
    if (words.length <= maxWords) return words.join(" ").toUpperCase();
    return words.slice(0, maxWords).join(" ").toUpperCase();
  };

    // Handle BOGO cleanly: "buy one get one free" -> "BUY 1 GET 1 FREE"
  if (/buy\s*(?:1|one)\s*get\s*(?:1|one)\s*(?:free)?/i.test(t)) {
    return "BUY 1 GET 1 FREE";
  }


  const pct = t.match(/(?:up to\s*)?(\d{1,3})\s*%/i);
  const upTo = /up to/.test(t);
  if (pct) {
    let out = (upTo ? `up to ${pct[1]}%` : `${pct[1]}%`) + " off";
    if (/\b(first|1st)\s+(order|purchase)\b/.test(t)) {
      out += " first order";
    }
    return shortenWords(out, 4);
  }

  const dol = t.match(/\$?\s*(\d+)\s*(?:off|discount|rebate)/i);
  if (dol) {
    const out = `$${dol[1]} off`;
    return shortenWords(out, 3);
  }

  if (/buy\s*1\s*get\s*1/i.test(t)) return "BUY 1 GET 1";

  const cleaned = t
    .replace(
      /\b(we|our|you|your|they|their|will|get|receive|customers)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();

  return shortenWords(cleaned, 4);
}

function compactBullet(s = "") {
  let t = cleanLine(s);
  if (!t) return "";
  t = t.replace(/•/g, " ");
  const fillerStarts =
    /^(discover|enhance|experience|enjoy|shop|find|explore|get|stay|keep)\b/i;
  t = t.replace(fillerStarts, "").trim();

  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const kept = words.slice(0, 3);
  return kept.join(" ");
}

/* ------------------------ SVG templates ------------------------ */

function tplFlyerA({ W = 1080, H = 1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="28"/></filter>
    <style>
      .h0{font:900 110px/1 Inter,system-ui}
      .h1{font:900 64px/1 Inter,system-ui}
      .h2{font:800 44px/1 Inter,system-ui}
      .b1{font:700 34px/1.28 Inter,system-ui}
      .chip{font:900 44px/1 Inter,system-ui;letter-spacing:.5px}
      .meta{font:600 26px/1.2 Inter,system-ui}
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="{{palette.body}}"/>
  <rect width="${W}" height="220" fill="{{palette.header}}"/>

  <g transform="translate(60, 85)">
    <text class="h0" fill="#ffffff">{{headline}}</text>
  </g>

  <path d="M0,220 L${W},160 L${W},${H} L0,${H} Z" fill="#ffffff" opacity=".16"/>
  <circle cx="${W / 2}" cy="${H / 2 + 20}" r="120" fill="{{palette.accent}}" opacity=".15" filter="url(#soft)"/>

  <g transform="translate(80, 440)">
    <text class="h1" fill="{{palette.header}}">FREQUENCY</text>
    {{#lists.left}}
      <g transform="translate(0, {{y}})">
        <circle cx="14" cy="10" r="10" fill="{{accentLeft}}"/>
        <text class="b1" x="34" y="20" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/lists.left}}
  </g>

  <g transform="translate(${W - 520}, 440)">
    <text class="h1" fill="{{palette.header}}">SERVICES</text>
    {{#lists.right}}
      <g transform="translate(0, {{y}})">
        <circle cx="14" cy="10" r="10" fill="{{accentRight}}"/>
        <text class="b1" x="34" y="20" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/lists.right}}
  </g>

  <g transform="translate(80, 350)">
    <text class="b1" fill="#113a5d" opacity=".65">{{subline}}</text>
  </g>

  {{#coverage}}
  <g transform="translate(80, ${H - 210})">
    <text class="meta" fill="#2b3a44" opacity=".7">📍 {{coverage}}</text>
  </g>
  {{/coverage}}

  <g transform="translate(80, ${H - 160})">
    <rect width="${W - 160}" height="96" rx="22" fill="{{palette.accent}}"/>
    <text class="chip" x="${(W - 160) / 2}" y="62" text-anchor="middle" fill="#0b1115">{{cta}} {{phone}}</text>
  </g>
</svg>`;
}

/**
 * Shaw-inspired poster B:
 * - widened top box (left-right)
 * - subline sits on a subtle bottom strip for legibility (non-pill)
 */
/**
 * Shaw-inspired poster B:
 * - widened top box (left-right)
 * - clean subline text (no band / shadow)
 */
function tplPosterBCard({ cardW, cardH, fsTitle, fsH2, fsSave, fsBody }) {
  const frameT = 40;
  const innerX = frameT;
  const innerY = frameT;
  const innerW = cardW - frameT * 2;
  const innerH = cardH - frameT * 2;
  const centerX = cardW / 2;
  const titleCenterX = centerX + 6;

  // widened box left-right, similar height (keeps square-ish feel)
  const bannerW = Math.round(innerW * 0.62);
  const bannerH = Math.round(innerW * 0.42);
  const bannerX = centerX - bannerW / 2;
  const bannerY = innerY + 70;

  const brandY = bannerY + 70;
// tiny downward nudge so the three lines look perfectly centered
const titleY = brandY + fsTitle * 1.2 + 6;


  const offerY = innerY + innerH * 0.62;
  const subY = offerY + fsSave * 1.05 + 85;
  const legalY = cardH - frameT - 22;

  return `
<svg viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .t-center { text-anchor: middle; }
      .brand   { font: 700 28px/1 Inter,system-ui; fill:#f97316; letter-spacing:0.18em; }
      .title   { font: 900 ${fsTitle}px/1.08 Inter,system-ui; letter-spacing:0.02em; fill:#111827; }
      .save    { font: 900 ${fsSave}px/1.0 Inter,system-ui; fill:#ffffff; stroke:#000000; stroke-opacity:.55; stroke-width:3; paint-order:stroke fill; letter-spacing:0.16em; }
      /* subline: plain white text, no stroke/shadow */
      .sub     { font: 700 ${fsBody}px/1.4 Inter,system-ui; fill:#ffffff; stroke:#000000; stroke-opacity:.65; stroke-width:3; paint-order:stroke fill; letter-spacing:0.16em; }
      .legal   { font: 600 22px/1.2 Inter,system-ui; fill:#e5e7eb; }
    </style>
  </defs>

  <!-- white frame -->
  <path
    d="
      M 0 0
        H ${cardW}
        V ${cardH}
        H 0
        Z
      M ${innerX} ${innerY}
        H ${innerX + innerW}
        V ${innerY + innerH}
        H ${innerX}
        Z
    "
    fill="#ffffff"
    fill-rule="evenodd"
  />

  <!-- widened top panel -->
  <g>
    <rect x="${bannerX}" y="${bannerY}" width="${bannerW}" height="${bannerH}" rx="0" fill="#ffffff"/>

    <!-- soft leaf accents -->
    <path d="M ${bannerX + 26} ${bannerY + 40}
             C ${bannerX + bannerW * 0.28} ${bannerY - 6},
               ${bannerX + bannerW * 0.28} ${bannerY + bannerH * 0.78},
               ${bannerX + bannerW * 0.10} ${bannerY + bannerH * 0.88}
             Z"
          fill="#fde4cf"/>
    <path d="M ${bannerX + bannerW - 26} ${bannerY + 40}
             C ${bannerX + bannerW * 0.72} ${bannerY - 6},
               ${bannerX + bannerW * 0.72} ${bannerY + bannerH * 0.78},
               ${bannerX + bannerW * 0.90} ${bannerY + bannerH * 0.88}
             Z"
          fill="#fde1cd"/>

    <text class="brand t-center" x="${centerX}" y="${brandY}">
      {{brandName}}
    </text>

    <text class="title t-center" x="${titleCenterX}" y="${titleY}">
      {{#eventTitleLines}}
        <tspan x="${titleCenterX}" dy="{{dy}}">{{line}}</tspan>
      {{/eventTitleLines}}
    </text>

  </g>

  <!-- promotion line -->
  <text class="save t-center" x="${centerX}" y="${offerY}">
    {{#saveLines}}
      <tspan x="${centerX}" dy="{{dy}}">{{line}}</tspan>
    {{/saveLines}}
  </text>

  <!-- subline (no background band) -->
  <text class="sub t-center" x="${centerX}" y="${subY}">
    {{#subLines}}
      <tspan x="${centerX}" dy="{{dy}}">{{line}}</tspan>
    {{/subLines}}
  </text>

  {{#legal}}
  <text class="legal t-center" x="${centerX}" y="${legalY}}">
    {{legal}}
  </text>
  {{/legal}}
</svg>`;
}


/* ------------------------ Utility helpers ------------------------ */



const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function ellipsize(s = "", max = 22) {
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
function layoutList(items) {
  const startY = 56,
    step = 54;
  return (items || []).slice(0, 6).map((t, i) => ({ y: startY + i * step, text: t }));
}
function withListLayout(lists = {}) {
  return {
    left: layoutList(lists.left || []),
    right: layoutList(lists.right || []),
  };
}

// updated: allow forcing more lines for the title so it doesn't get chopped
function wrapTextToWidth(
  str = "",
  fsPx = 48,
  cardW = 860,
  padX = 60,
  maxLines = 2,
  minLines = 1,
  avoidEllipsis = false // if true, never add "..."
) {
  const s = String(str || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return [];
  const pxWidth = Math.max(10, cardW - padX * 2);
  let maxChars = Math.max(6, Math.floor(pxWidth / (fsPx * 0.58)));

  // if we want multiple lines, pretend usable width is smaller
  if (minLines > 1) {
    maxChars = Math.max(4, Math.floor(maxChars / minLines));
  }

  const words = s.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;

  const used = lines.join(" ").length;
  if (used < s.length && !avoidEllipsis) {
    const last = lines.length - 1;
    lines[last] = ellipsize(lines[last], Math.max(6, maxChars - 2));
  }
  return lines.map((line, i) => ({ line, dy: i === 0 ? 0 : fsPx * 1.08 }));
}

// special wrapper for the headline inside the top square:
// it shrinks the font down (to a floor) until ALL characters fit in
// the requested number of lines, with NO ellipsis.
function wrapTitleToBox(
  str = "",
  fsInitial = 72,
  boxW = 600,
  padX = 60,
  maxLines = 3
) {
  const s = String(str || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!s) return { fs: fsInitial, lines: [] };

  const fullLen = s.length;
  let fs = fsInitial;
  let lines = [];
  const minFs = Math.max(40, Math.floor(fsInitial * 0.6)); // don't get silly small

  for (let i = 0; i < 8; i++) {
    // standard wrap: first line dy = 0, then +fs*1.08, etc.
    lines = wrapTextToWidth(s, fs, boxW, padX, maxLines, maxLines, true);
    const used = lines.map((l) => l.line).join(" ").length;

    if (used >= fullLen || fs <= minFs) break;
    fs -= 4;
  }

  // NO extra centering math here – this keeps wrap stable
  return { fs, lines };
}


/* ------------------------ Stock / Pexels ------------------------ */

function pickLocalStockPath(kind, seed = Date.now()) {
  const dir = path.join(STOCK_DIR, kind);
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (files.length) {
      const idx = Math.floor(
        (typeof seed === "number" ? seed : Date.now()) % files.length
      );
      return path.join(dir, files[idx]);
    }
  } catch {}
  try {
    const gdir = path.join(STOCK_DIR, "generic");
    const gfiles = fs
      .readdirSync(gdir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (gfiles.length) {
      const idx = Math.floor(
        (typeof seed === "number" ? seed : Date.now()) % gfiles.length
      );
      return path.join(gdir, gfiles[idx]);
    }
  } catch {}
  return null;
}

async function fetchPexelsPhotoBuffer(query, seed = Date.now()) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error("PEXELS_API_KEY missing");

  const page = 1 + (seed % 5);
  const perPage = 15;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=${perPage}&page=${page}&orientation=square`;

  const json = await fetchBuffer(url, { Authorization: key });
  let data;
  try {
    data = JSON.parse(json.toString("utf8"));
  } catch {
    throw new Error("pexels JSON parse error");
  }

  const arr = Array.isArray(data?.photos) ? data.photos : [];
  if (!arr.length) throw new Error("pexels: no results");

  const pick = arr[Math.floor((seed * 13) % arr.length)];
  const src =
    pick?.src?.large2x ||
    pick?.src?.large ||
    pick?.src?.original ||
    pick?.src?.medium;
  if (!src) throw new Error("pexels: no src");

  return await fetchBuffer(src);
}

function pexelsQueryForKind(kind, hint = "") {
  const h = (hint || "").trim();
  const map = {
    fashion: h || "fashion clothing rack apparel boutique models streetwear",
    electronics: h || "electronics gadgets laptop smartphone tech workspace",
    restaurant: h || "restaurant food dining table dishes gourmet chef",
    coffee: h || "coffee shop cafe espresso cappuccino latte barista",
    pets: h || "pets dogs cats pet care grooming",
    real_estate: h || "modern home interior living room kitchen real estate",
    flooring: h || "hardwood floor vinyl tile flooring interior",
    fitness: h || "gym fitness workout training weights",
    salon_spa: h || "salon spa beauty hair nails skin care",
    auto: h || "auto repair car garage mechanic workshop",
    landscaping: h || "landscaping lawn garden yard mowing",
    hvac_plumbing: h || "plumbing hvac air conditioner furnace repair",
    home_cleaning: h || "cleaning service home cleaning tidy house",
    generic: h || "small business storefront local shop",
  };
  return map[kind] || map.generic;
}

async function buildPosterBackgroundFromPhotoBuffer({
  width = 1080,
  height = 1080,
  photoBuffer,
}) {
  if (!photoBuffer) throw new Error("no photo buffer provided");

  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 18, b: 24 },
    },
  }).png();

  const photo = await sharp(photoBuffer)
    .resize(width, height, { fit: "cover", position: "centre" })
    .modulate({ saturation: 0.9, brightness: 1.02 })
    .blur(6)
    .png()
    .toBuffer();

  return await base
    .composite([{ input: photo, gravity: "centre", blend: "over" }])
    .png()
    .toBuffer();
}

/* ------------------------ Validation ------------------------ */

const flyerSchema = {
  type: "object",
  required: ["inputs", "knobs"],
  properties: {
    template: { enum: ["flyer_a", "poster_b", "auto"] },
    inputs: {
      type: "object",
      required: [
        "industry",
        "businessName",
        "phone",
        "location",
        "headline",
        "subline",
        "cta",
      ],
      properties: {
        industry: { type: "string", maxLength: 60 },
        businessName: { type: "string", maxLength: 60 },
        phone: { type: "string", maxLength: 32 },
        website: { type: "string", maxLength: 120 },
        location: { type: "string", maxLength: 60 },
        headline: { type: "string", maxLength: 60 },
        subline: { type: "string", maxLength: 120 },
        cta: { type: "string", maxLength: 32 },
      },
    },
    knobs: { type: "object" },
  },
};

const posterSchema = {
  type: "object",
  required: ["inputs", "knobs"],
  properties: {
    template: { enum: ["flyer_a", "poster_b", "auto"] },
    inputs: {
      type: "object",
      required: ["industry", "businessName", "location"],
      properties: {
        industry: { type: "string", maxLength: 60 },
        businessName: { type: "string", maxLength: 60 },
        location: { type: "string", maxLength: 60 },
      },
    },
    knobs: { type: "object" },
  },
};

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  try {
    const body = req.body || {};
    const templateReq = (body.template || "auto").toString();
    const inputs = body.inputs || {};
    const knobs = body.knobs || {};
    const a = body.answers && typeof body.answers === "object" ? body.answers : {};

    const industry = inputs.industry || a.industry || "Local Services";
    const prof = profileForIndustry(industry);

    const template =
      templateReq !== "auto"
        ? templateReq
        : [
            "fashion",
            "electronics",
            "pets",
            "coffee",
            "restaurant",
            "real_estate",
            "flooring",
          ].includes(prof.kind)
        ? "poster_b"
        : "flyer_a";

    /* ---------- FLYER A ---------- */
    if (template === "flyer_a") {
      const mergedInputs = {
        industry,
        businessName: inputs.businessName || a.businessName || "Your Brand",
        phone: inputs.phone || a.phone || "(000) 000-0000",
        location: inputs.location || a.location || "Your City",
        website: inputs.website || a.website || "",
        headline: inputs.headline || prof.headline,
        subline: inputs.subline || prof.subline,
        cta: inputs.cta || prof.cta,
      };

      const mergedKnobs = {
        size: knobs.size || "1080x1080",
        palette: knobs.palette || prof.palette,
        lists: knobs.lists || prof.lists,
        coverage: knobs.coverage || prof.coverage || "",
        showIcons: knobs.showIcons !== undefined ? knobs.showIcons : true,
        headerSplitDiagonal:
          knobs.headerSplitDiagonal !== undefined
            ? knobs.headerSplitDiagonal
            : true,
        roundedOuter:
          knobs.roundedOuter !== undefined ? knobs.roundedOuter : true,
        backgroundHint: knobs.backgroundHint || prof.bgHint || "generic",
      };

      const validate = ajv.compile(flyerSchema);
      if (!validate({ template, inputs: mergedInputs, knobs: mergedKnobs })) {
        throw new Error(
          "validation failed: " + JSON.stringify(validate.errors)
        );
      }

      const listsLaidOut = withListLayout(mergedKnobs.lists || {});
      const vars = {
        headline: mergedInputs.headline,
        subline: mergedInputs.subline,
        phone: mergedInputs.phone,
        cta: mergedInputs.cta,
        coverage: mergedKnobs.coverage,
        palette: mergedKnobs.palette,
        accentLeft: mergedKnobs.palette.accent,
        accentRight: "#1f3b58",
        lists: listsLaidOut,
      };

      const svgTpl = tplFlyerA({ W: 1080, H: 1080 });
      const svg = mustache.render(svgTpl, vars);

      const base = `static-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
      const svgName = `${base}.svg`;
      const pngName = `${base}.png`;

      fs.writeFileSync(path.join(GEN_DIR, svgName), svg, "utf8");
      await sharp(Buffer.from(svg))
        .png({ quality: 92 })
        .toFile(path.join(GEN_DIR, pngName));

      const mediaPng = makeMediaUrl(req, pngName);
      const mediaSvg = makeMediaUrl(req, svgName);

      return res.json({
        ok: true,
        type: "image",
        template,
        svgUrl: mediaSvg,
        pngUrl: mediaPng,
        url: mediaPng,
        absoluteUrl: mediaPng,
        filename: pngName,
        asset: { id: base, createdAt: Date.now() },
        ready: true,
      });
    }

    /* ---------- POSTER B ---------- */

    let crafted =
      body.copy && typeof body.copy === "object" ? body.copy : null;

    if (!crafted) {
      const rb = craftCopyFromAnswers({ ...a, industry }, prof);
      crafted =
        rb?.copy || {
          headline: "",
          subline: "",
          offer: "",
          secondary: "",
          bullets: [],
          disclaimers: "",
        };
    }

    // 🔒 Normalize headline / subline exactly like /generate-image-from-prompt
   const safeHeadline = applyHeadlineVariety(crafted.headline || "", prof.kind);
const safeSubline = safeSublineText(crafted.subline || "");


        const rawOffer =
      crafted.offer || a.offer || a.saveAmount || "";
    const cleanedOffer = /^(no offer|none|n\/a|null|no deal)$/i.test(
      String(rawOffer).trim()
    )
      ? ""
      : rawOffer;
    const safeOffer = tightenOfferText(cleanedOffer);

    const safeSecondary = clampWords(cleanLine(crafted.secondary || ""), 10);

    let rawBullets = Array.isArray(crafted.bullets) ? crafted.bullets : [];
    rawBullets = rawBullets
      .map((b) => compactBullet(b || ""))
      .filter(Boolean);

    const subLower = safeSubline.toLowerCase();
    const offerLower = (safeOffer || "").toLowerCase();

    let safeBullets = rawBullets.filter((b) => {
      const low = (b || "").toLowerCase();
      if (!low) return false;
      if (
        subLower &&
        (low === subLower || subLower.includes(low) || low.includes(subLower))
      )
        return false;
      if (
        offerLower &&
        (low.includes(offerLower) || offerLower.includes(low))
      )
        return false;
      if (/%\s*off|\$[\d]+.*off|discount|rebate|deal/.test(low)) return false;
      return true;
    });

    if (!safeBullets.length) safeBullets = rawBullets.filter(Boolean);
    if (!safeBullets.length) {
      const tmpl = INDUSTRY_TEMPLATES[prof.kind];
      if (tmpl) {
        safeBullets =
          tmpl
            .bullets("")
            .map((b) => compactBullet(b))
            .filter(Boolean)
            .slice(0, 3) || [];
      } else {
        safeBullets = ["Modern styles", "Quality you feel"];
      }
    }

    let safeDisclaimers = (crafted.disclaimers || "").toString().trim();
    if (
      safeDisclaimers &&
      safeSubline &&
      safeDisclaimers.toLowerCase() === subLower
    ) {
      safeDisclaimers = "";
    }
    if (!safeDisclaimers && safeOffer) {
      safeDisclaimers = "Limited time offer.";
    }

    crafted = {
      headline: safeHeadline,
      subline: safeSubline,
      offer: safeOffer,
      secondary: safeSecondary,
      bullets: safeBullets,
      disclaimers: safeDisclaimers,
    };

    console.log("[poster_b] using copy:", crafted);

    const get = (k, def = "") =>
      a[k] ?? inputs[k] ?? knobs[k] ?? def;

    const mergedInputsB = {
      industry,
      businessName: get("businessName", "Your Brand"),
      location: get("location", "Your City"),
    };

    const bulletsParagraph = safeBullets.join(" • ").toUpperCase();

    const autoFields = {
      eventTitle: (crafted.headline || "").toString().toUpperCase(),
      dateRange: (crafted.subline || "").toString(),
      saveAmount: crafted.offer || "",
      financingLine: (crafted.secondary || "").toString(),
      qualifiers: bulletsParagraph,
      legal: safeDisclaimers,
      palette: knobs.palette || prof.palette,
    };

    const mergedKnobsB = {
      size: get("size", knobs.size || "1080x1080"),
      backgroundUrl: get("backgroundUrl", knobs.backgroundUrl || ""),
      backgroundHint:
        get("backgroundHint", knobs.backgroundHint || prof.bgHint || ""),
      eventTitle: autoFields.eventTitle,
      dateRange: autoFields.dateRange,
      saveAmount: autoFields.saveAmount,
      financingLine: autoFields.financingLine,
      qualifiers: autoFields.qualifiers,
      legal: autoFields.legal,
      palette: autoFields.palette,
    };

    const validateB = ajv.compile(posterSchema);
    if (
      !validateB({
        template,
        inputs: mergedInputsB,
        knobs: mergedKnobsB,
      })
    ) {
      throw new Error(
        "validation failed: " + JSON.stringify(validateB.errors)
      );
    }

    // background
    let photoBuf = null;
    const seed = Date.now();

    if (mergedKnobsB.backgroundUrl) {
      try {
        photoBuf = await fetchBuffer(mergedKnobsB.backgroundUrl);
      } catch (e) {
        console.warn(
          "[poster_b] backgroundUrl fetch failed → try Pexels/local:",
          e.message
        );
      }
    }
    if (!photoBuf) {
      try {
        const q = pexelsQueryForKind(
          classifyIndustry(industry),
          mergedKnobsB.backgroundHint
        );
        photoBuf = await fetchPexelsPhotoBuffer(q, seed);
      } catch (e) {
        console.warn("[poster_b] Pexels fetch failed:", e.message);
      }
    }
    if (!photoBuf) {
      const localPath = pickLocalStockPath(classifyIndustry(industry), seed);
      if (localPath) {
        try {
          photoBuf = fs.readFileSync(localPath);
        } catch {}
      }
    }
    if (!photoBuf) {
      try {
        photoBuf = await fetchBuffer(selfUrl(req, "/__fallback/1200.jpg"));
      } catch {}
    }
    if (!photoBuf) throw new Error("no background photo available");

    const bgPng = await buildPosterBackgroundFromPhotoBuffer({
      width: 1080,
      height: 1080,
      photoBuffer: photoBuf,
    });

    // 🔒 Typography sizes – let headline auto-shrink to fit inside the box
    const fsTitleBase = 101;
    const fsSave = 74;
    const fsH2 = 34;
    const fsBody = 31;

    const cardW = 1080;
    const cardH = 1080;

    // geometry kept in sync with tplPosterBCard
    const frameT = 40;
    const innerW = cardW - frameT * 2;
    const bannerW = Math.round(innerW * 0.62);
    const headPadX = 70;

    const padX = 180;
    const padXBody = 260;

    // shrink headline font size as needed so ALL characters fit in up to 3 lines
    const titleWrap = wrapTitleToBox(
      mergedKnobsB.eventTitle,
      fsTitleBase,
      bannerW,
      headPadX,
      3
    );
    const fsTitle = titleWrap.fs;
    const eventTitleLines = titleWrap.lines;



    const saveLines = wrapTextToWidth(
      mergedKnobsB.saveAmount,
      fsSave,
      cardW,
      padX,
      2,
      1
    );
    const subLines = wrapTextToWidth(
      mergedKnobsB.dateRange,
      fsBody,
      cardW,
      padXBody,
      3,
      1
    );

    const qualifiersText = [
      mergedKnobsB.financingLine,
      mergedKnobsB.qualifiers,
    ]
      .filter(Boolean)
      .join(" • ");

    const qualifierLines = wrapTextToWidth(
      qualifiersText,
      fsBody * 1.15,
      cardW,
      padXBody,
      2
    );

    const cardVars = {
      brandName: ellipsize(mergedInputsB.businessName, 22),
      eventTitleLines,
      saveLines,
      subLines,
      qualifierLines,
      legal: mergedKnobsB.legal,
    };

    const cardSvg = mustache.render(
      tplPosterBCard({
        cardW,
        cardH,
        fsTitle,
        fsH2,
        fsSave,
        fsBody,
      }),
      cardVars
    );
    const cardPng = await sharp(Buffer.from(cardSvg)).png().toBuffer();

    const finalPng = await sharp(bgPng)
      .composite([{ input: cardPng, left: 0, top: 0 }])
      .png({ quality: 92 })
      .toBuffer();

    const baseB = `static-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const pngNameB = `${baseB}.png`;
    await fs.promises.writeFile(path.join(GEN_DIR, pngNameB), finalPng);

    const mediaPngB = makeMediaUrl(req, pngNameB);
    return res.json({
      ok: true,
      type: "image",
      template,
      url: mediaPngB,
      absoluteUrl: mediaPngB,
      pngUrl: mediaPngB,
      filename: pngNameB,
      asset: { id: baseB, createdAt: Date.now() },
      ready: true,
    });
  } catch (err) {
    console.error("[generate-static-ad]", err);
    res
      .status(400)
      .json({ ok: false, error: String(err?.message || err) });
  }
});


/* ------------------------ proxy-img ------------------------ */

async function proxyImgHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== "string") return res.status(400).send("missing u");

    const passHeaders = {};
    if (req.headers["range"]) passHeaders["Range"] = req.headers["range"];

    const { status, headers, body } = await fetchUpstream("GET", u, passHeaders);

    res.status(status || 200);
    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = k.toLowerCase();
      if (["transfer-encoding", "connection"].includes(key)) return;
      res.setHeader(k, v);
    });
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Accept-Ranges", headers?.["accept-ranges"] || "bytes");

    return res.end(body);
  } catch (e) {
    console.error("[proxy-img GET]", e);
    res.status(502).send("bad upstream");
  }
}

async function proxyHeadHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== "string") return res.status(400).end();

    const passHeaders = {};
    if (req.headers["range"]) passHeaders["Range"] = req.headers["range"];

    const { status, headers } = await fetchUpstream("HEAD", u, passHeaders);

    res.status(status || 200);
    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = k.toLowerCase();
      if (["transfer-encoding", "connection"].includes(key)) return;
      res.setHeader(k, v);
    });
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Vary", "Origin");
    res.setHeader("Accept-Ranges", headers?.["accept-ranges"] || "bytes");

    return res.end();
  } catch (e) {
    console.error("[proxy-img HEAD]", e);
    res.status(502).end();
  }
}

router.get("/proxy-img", proxyImgHandler);
router.head("/proxy-img", proxyHeadHandler);

/* ------------------------ /generate-image-from-prompt ------------------------ */

router.post("/generate-image-from-prompt", async (req, res) => {
  try {
    const b = req.body || {};
    const a = b.answers || {};
    const industry = a.industry || b.industry || "Local Services";
    const businessName = a.businessName || b.businessName || "Your Brand";
    const location = a.location || b.location || "Your City";
    const backgroundUrl = a.backgroundUrl || b.backgroundUrl || "";

    const overlay = {
      headline: (a.headline || b.overlayHeadline || "").toString().slice(0, 55),
      body: a.adCopy || b.overlayBody || "",
      offer: a.offer || "",
      promoLine: a.promoLine || "",
      secondary: a.secondary || "",
      cta: a.cta || b.overlayCTA || "Learn more",
      legal: a.legal || "",
    };

    const prof = profileForIndustry(industry);
    const isPoster = [
      "fashion",
      "electronics",
      "pets",
      "coffee",
      "restaurant",
      "real_estate",
      "flooring",
    ].includes(prof.kind);

    const W = 1080,
      H = 1080;
    const files = [];

    if (isPoster) {
      const seeds = [Date.now(), Date.now() + 7777];

      for (const seed of seeds) {
        let photoBuf = null;
        if (backgroundUrl) {
          try {
            photoBuf = await fetchBuffer(backgroundUrl);
          } catch {}
        }
        if (!photoBuf) {
          try {
            const q = pexelsQueryForKind(prof.kind, prof.bgHint);
            photoBuf = await fetchPexelsPhotoBuffer(q, seed);
          } catch (e) {
            console.warn(
              "[generate-image-from-prompt] Pexels failed:",
              e.message
            );
          }
        }
        if (!photoBuf) {
          const localPath = pickLocalStockPath(prof.kind, seed);
          if (localPath) {
            try {
              photoBuf = fs.readFileSync(localPath);
            } catch {}
          }
        }
        if (!photoBuf) {
          try {
            photoBuf = await fetchBuffer(selfUrl(req, "/__fallback/1200.jpg"));
          } catch {}
        }
        if (!photoBuf) throw new Error("no background photo");

        const bgPng = await buildPosterBackgroundFromPhotoBuffer({
          width: W,
          height: H,
          photoBuffer: photoBuf,
        });

        // headline: cleaned, no dangling "for/of/to", then uppercased
    const eventTitleRaw = applyHeadlineVariety(overlay.headline || "", prof.kind);
const eventTitle = safeHeadlineText(eventTitleRaw).toUpperCase();


        // subline: allow to be fairly long, but still neat and complete
        const dateRangeRaw = overlay.promoLine || overlay.body || "";
        const dateRange = safeSublineText(dateRangeRaw);

        const rawOffer =
          (b.copy && b.copy.offer) || overlay.offer || "";
        const cleanedOffer = /^(no offer|none|n\/a|null|no deal)$/i.test(
          String(rawOffer).trim()
        )
          ? ""
          : rawOffer;
        const saveAmount = tightenOfferText(cleanedOffer);


        const financingLn = (overlay.secondary || "").trim();
        const qualifiers = "";
        const legal = (overlay.legal || "").trim();

        // base sizes – let headline auto-shrink so it always fits in the box
        const fsTitleBase = 101;
        const fsH2 = 34;
        const fsSave = 74;
        const fsBody = 31;

        const cardW = 1080;
        const cardH = 1080;

        // keep geometry consistent with tplPosterBCard
        const frameT = 40;
        const innerW = cardW - frameT * 2;
        const bannerW = Math.round(innerW * 0.62);
        const headPadX = 70;

        const padX = 180;
        const padXBody = 260;

        // shrink headline font size as needed so ALL characters fit in up to 3 lines
        const titleWrap = wrapTitleToBox(
          eventTitle,
          fsTitleBase,
          bannerW,
          headPadX,
          3
        );
        const fsTitle = titleWrap.fs;
        const eventTitleLines = titleWrap.lines;



        const saveLines = wrapTextToWidth(
          saveAmount,
          fsSave,
          cardW,
          padX,
          2,
          1
        );
        const subLines = wrapTextToWidth(
          dateRange,
          fsBody,
          cardW,
          padXBody,
          3,
          1
        );

        const qualifiersText = [financingLn, qualifiers]
          .filter(Boolean)
          .join(" • ");

        const qualifierLines = wrapTextToWidth(
          qualifiersText,
          fsBody * 1.15,
          cardW,
          padXBody,
          2
        );

        const cardVars = {
          brandName: ellipsize(businessName, 22),
          eventTitleLines,
          saveLines,
          subLines,
          qualifierLines,
          legal,
        };
        const cardSvg = mustache.render(
          tplPosterBCard({
            cardW,
            cardH,
            fsTitle,
            fsH2,
            fsSave,
            fsBody,
          }),
          cardVars
        );
        const cardPng = await sharp(Buffer.from(cardSvg)).png().toBuffer();

        const finalPng = await sharp(bgPng)
          .composite([{ input: cardPng, left: 0, top: 0 }])
          .png({ quality: 92 })
          .toBuffer();

        const fname = `static-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.png`;
        await fs.promises.writeFile(path.join(GEN_DIR, fname), finalPng);
        files.push({ absoluteUrl: makeMediaUrl(req, fname) });
      }
    } else {
      const palette =
        prof.palette || {
          header: "#0d3b66",
          body: "#dff3f4",
          accent: "#ff8b4a",
          textOnDark: "#ffffff",
          textOnLight: "#2b3a44",
        };
      const lists = withListLayout(
        prof.lists || {
          left: ["Free Quote", "Same-Day", "Licensed", "Insured"],
          right: ["Great Reviews", "Family Owned", "Fair Prices", "Guaranteed"],
        }
      );
      const vars = {
        headline: overlay.headline || prof.headline || "LOCAL SERVICES",
        subline:
          overlay.body || prof.subline || "Reliable • Friendly • On Time",
        phone: a.phone || "(000) 000-0000",
        cta: overlay.cta || prof.cta || "Contact Us",
        coverage: prof.coverage || "Serving your area",
        palette,
        accentLeft: palette.accent,
        accentRight: "#1f3b58",
        lists,
      };
      const svg = mustache.render(tplFlyerA({ W, H }), vars);
      const pngBuf = await sharp(Buffer.from(svg))
        .png({ quality: 92 })
        .toBuffer();
      for (let i = 0; i < 2; i++) {
        const fname = `static-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.png`;
        await fs.promises.writeFile(path.join(GEN_DIR, fname), pngBuf);
        files.push({ absoluteUrl: makeMediaUrl(req, fname) });
      }
    }

    return res.json({ ok: true, images: files });
  } catch (err) {
    console.error("[generate-image-from-prompt]", err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

/* ------------------------ /craft-ad-copy ------------------------ */

router.post("/craft-ad-copy", async (req, res) => {
  try {
    const b = req.body || {};
    const a = b.answers || b || {};
    const prof = profileForIndustry(a.industry || "");
    let rawCopy = await generateSmartCopyWithOpenAI(a, prof);
    if (!rawCopy) {
      const rb = craftCopyFromAnswers(a, prof);
      rawCopy = rb?.copy || null;
    }
    if (!rawCopy)
      return res.status(400).json({ ok: false, error: "copy failed" });

     const rawOffer =
      rawCopy.offer || a.offer || a.saveAmount || "";

    const cleanedOffer = /^(no offer|none|n\/a|null|no deal)$/i.test(
      String(rawOffer).trim()
    )
      ? ""
      : rawOffer;
    const safeOffer = tightenOfferText(cleanedOffer);


    // Use the same normalization helper as poster B so copy matches layout behavior
    const safeHeadline = applyHeadlineVariety(rawCopy.headline || "", prof.kind);

    const safeSubline = safeSublineText(rawCopy.subline || "");

    const safeSecondary = clampWords(cleanLine(rawCopy.secondary || ""), 10);

    let bulletsRaw = Array.isArray(rawCopy.bullets) ? rawCopy.bullets : [];
    bulletsRaw = bulletsRaw
      .map((b) => compactBullet(b || ""))
      .filter(Boolean);

    const subLower = safeSubline.toLowerCase();
    const offerLower = (safeOffer || "").toLowerCase();

    let bullets = bulletsRaw.filter((b) => {
      const low = (b || "").toLowerCase();
      if (!low) return false;
      if (
        subLower &&
        (low === subLower || subLower.includes(low) || low.includes(subLower))
      )
        return false;
      if (
        offerLower &&
        (low.includes(offerLower) || offerLower.includes(low))
      )
        return false;
      if (/%\s*off|\$[\d]+.*off|discount|rebate|deal/.test(low)) return false;
      return true;
    });
    if (!bullets.length) bullets = bulletsRaw.filter(Boolean);
    if (!bullets.length) bullets = ["QUALITY YOU FEEL", "MODERN CLEAN DESIGN"];

    let safeDisclaimers = (rawCopy.disclaimers || "").toString().trim();
    if (
      safeDisclaimers &&
      safeSubline &&
      safeDisclaimers.toLowerCase() === subLower
    ) {
      safeDisclaimers = "";
    }

    const copy = {
      headline: safeHeadline,
      subline: safeSubline,
      offer: safeOffer,
      secondary: safeSecondary,
      bullets,
      disclaimers: safeDisclaimers,
    };

    return res.json({ ok: true, copy });
  } catch (e) {
    console.error("[craft-ad-copy]", e);
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});


/* ------------------------ Exports ------------------------ */

module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;
