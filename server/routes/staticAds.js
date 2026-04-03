/* eslint-disable */
"use strict";

const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

/* ------------------------ Paths / URLs ------------------------ */

const GEN_DIR =
  process.env.GENERATED_DIR ||
  path.join(process.cwd(), "server", "public", "generated");
fs.mkdirSync(GEN_DIR, { recursive: true });

function makeMediaUrl(req, filename) {
  const base =
    process.env.PUBLIC_BASE_URL || req.protocol + "://" + req.get("host");
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

function fetchUpstream(method, url, extraHeaders = {}, bodyBuf = null, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.request(
        url,
        { method, timeout: timeoutMs, headers: extraHeaders },
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
      r.on("timeout", () => r.destroy(new Error("HTTP timeout")));
      if (bodyBuf) r.write(bodyBuf);
      r.end();
    } catch (e) {
      reject(e);
    }
  });
}

/* ------------------------ OpenAI Image (DIRECT AD) ------------------------ */
async function generateOpenAIAdImageBuffers({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "auto",
  n = 2,
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";

  const body = JSON.stringify({
    model,
    prompt,
    size,
    quality,
    output_format,
    n: Math.max(1, Math.min(4, Number(n) || 1)),
  });

  const attempt = async () => {
    const { status, body: respBuf } = await fetchUpstream(
      "POST",
      "https://api.openai.com/v1/images/generations",
      {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      Buffer.from(body),
      50000
    );

    if (status !== 200) {
      let msg = `OpenAI image HTTP ${status}`;
      try { msg += " " + respBuf.toString("utf8").slice(0, 1200); } catch {}
      throw new Error(msg);
    }

    let parsed;
    try {
      parsed = JSON.parse(respBuf.toString("utf8"));
    } catch {
      throw new Error("OpenAI image: failed to parse JSON response");
    }

    const arr = Array.isArray(parsed?.data) ? parsed.data : [];
    if (!arr.length) throw new Error("OpenAI image: empty data array");

    const bufs = [];
    for (const item of arr) {
      const b64 = item?.b64_json;
      if (b64) bufs.push(Buffer.from(b64, "base64"));
      else if (item?.url) {
        throw new Error("OpenAI image returned URL but server expects b64_json.");
      }
    }

    if (!bufs.length) throw new Error("OpenAI image: missing b64_json");
    return bufs;
  };

  try {
    return await attempt();
  } catch (firstErr) {
    console.warn("[generate-static-ad] first attempt failed, retrying once:", firstErr?.message || firstErr);
    return await attempt(); // retry once
  }
}

/* ------------------------ Prompt builder ------------------------ */

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function hashSeed(str = "") {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

function buildVariantProfile(variationToken = "", variantTag = "A", industryHint = "") {
  const rng = mulberry32(hashSeed(`${variationToken}|${variantTag}`));
  const ind = String(industryHint || "").toLowerCase();

  const settings = [
    "bright studio backdrop",
    "modern storefront exterior",
    "cozy home interior",
    "clean office/workspace",
    "outdoor lifestyle scene",
    "urban street scene",
    "minimal product-on-table scene",
    "soft gradient abstract backdrop",
    "sleek tech abstract scene",
    "modern desk flatlay with devices"
  ];

  const palettes = [
    "cool neutrals + teal accents",
    "warm neutrals + gold accents",
    "bold high-contrast colors",
    "pastel modern palette",
    "monochrome with one accent color",
    "earth tones with natural textures"
  ];

  const compositions = [
    "tight close-up with typography overlay",
    "mid-shot with clear subject focus",
    "wide shot with strong negative space for text",
    "rule-of-thirds composition with CTA anchored"
  ];

  const lighting = [
    "soft natural light",
    "bright commercial lighting",
    "cinematic rim lighting",
    "even studio lighting"
  ];

  const isTechy =
    /(marketing|agency|advertis|branding|seo|saas|software|tech|ai|analytics|data|startup|consult)/i.test(ind);

  // Subject focus: allow more non-people variety (dashboards/charts/graphics) especially for marketing/tech
  const subjectModesTech = [
    "no-people concept: clean analytics dashboard/charts/graphs visual",
    "no-people concept: abstract technology/AI/network graphics",
    "no-people concept: laptop/phone UI mockup showing growth metrics",
    "one person using a laptop/phone with subtle dashboard overlay",
    "product/service hero visual with bold typography (no people)"
  ];

  const subjectModesGeneral = [
    "product or service hero visual (no people)",
    "one person enjoying/using the service",
    "one person portrait-style lifestyle ad shot",
    "environment/scene-led creative with strong negative space (no people)",
    "object/flatlay-led creative with premium textures (no people)"
  ];

  const subjectMode = isTechy ? pick(rng, subjectModesTech) : pick(rng, subjectModesGeneral);

  // People: more often none or 1 person; 2 people sometimes; groups rare
  const peoplePoolTech = [
    "no people (use tech/graphics/charts/dashboards instead)",
    "no people (use tech/graphics/charts/dashboards instead)",
    "one person",
    "one person",
    "two people (only if it naturally fits)"
  ];

  const peoplePoolGeneral = [
    "no people (product/service focused)",
    "one person",
    "one person",
    "one person",
    "two people (only if it naturally fits)",
    "small group (3–5) ONLY if it truly fits the scenario"
  ];

  const peopleMode = pick(rng, isTechy ? peoplePoolTech : peoplePoolGeneral);

  return {
    variantTag,
    setting: pick(rng, settings),
    palette: pick(rng, palettes),
    composition: pick(rng, compositions),
    lighting: pick(rng, lighting),
    subjectMode,
    peopleMode
  };
}

function buildAdPromptFromAnswers(a = {}, variationToken = "", profile = null, craftedCopy = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = clean(a.industry || "Business");
  const website = clean(a.website || a.url || "");
  const idealCustomer = clean(a.idealCustomer || "");
  const benefit = clean(a.mainBenefit || a.benefit || "");

  // Use GPT-crafted copy when available — creates cohesion between UI copy and image text
  const headline = clean(craftedCopy.headline || "");
  const offer = clean(craftedCopy.offer || a.offer || a.promo || "");
  const cta = clean(
    craftedCopy.cta ||
    a.cta ||
    (industry.toLowerCase().includes("fashion") ? "Shop Now" : "Learn More")
  );

  const p = profile || buildVariantProfile(variationToken, "A", industry);

  // Derive the emotional register from industry so the design feels intentional
  const ind = industry.toLowerCase();
  let emotionalTone;
  if (/(restaurant|food|cafe|bakery|diner|pizza|catering)/i.test(ind))      emotionalTone = "warm, inviting, and appetite-stimulating";
  else if (/(fashion|clothing|apparel|boutique|style|wear)/i.test(ind))     emotionalTone = "sleek, modern, and aspirational";
  else if (/(home|decor|furniture|interior|flooring|remodel|renovation)/i.test(ind)) emotionalTone = "warm, premium, and lifestyle-driven";
  else if (/(fitness|gym|health|wellness|yoga|personal train)/i.test(ind))  emotionalTone = "energetic, motivational, and results-driven";
  else if (/(tech|software|saas|app|digital|marketing|agency|seo)/i.test(ind)) emotionalTone = "clean, capable, and growth-oriented";
  else if (/(legal|law|attorney|lawyer)/i.test(ind))                         emotionalTone = "trustworthy, authoritative, and reassuring";
  else if (/(real estate|realty|property|homes for sale)/i.test(ind))        emotionalTone = "premium, aspirational, and community-focused";
  else if (/(auto|car|vehicle|mechanic|dealer|truck)/i.test(ind))            emotionalTone = "reliable, confident, and value-driven";
  else if (/(beauty|salon|spa|skincare|hair|nail)/i.test(ind))               emotionalTone = "elegant, transformative, and confidence-building";
  else emotionalTone = "professional, clear, and benefit-focused";

  // The single core concept this entire ad communicates
  const coreConcept = headline
    ? `"${headline}"`
    : benefit
    ? benefit
    : offer
    ? offer
    : `trusted ${industry} for ${idealCustomer || "local customers"}`;

  const variantBlock = [
    `VARIANT ${p.variantTag} DESIGN DIRECTION (make this visually distinct — different setting, palette, and composition than other variants):`,
    `- Visual environment: ${p.setting}`,
    `- Color palette: ${p.palette}`,
    `- Composition: ${p.composition}`,
    `- Lighting: ${p.lighting}`,
    `- Subject: ${p.subjectMode}`,
    `- People: ${p.peopleMode} — prefer no people or one person; avoid groups.`,
  ].join("\n");

  return [
    `You are a world-class creative director and graphic designer. Design a premium square (1:1) Facebook/Instagram static ad creative.`,
    ``,
    `BRAND: ${businessName} | INDUSTRY: ${industry}`,
    idealCustomer ? `AUDIENCE: ${idealCustomer}` : null,
    ``,
    `CORE CONCEPT — everything in this ad must communicate this single idea:`,
    coreConcept,
    `EMOTIONAL REGISTER: ${emotionalTone}`,
    ``,
    `COPY TO INTEGRATE INTO THE DESIGN:`,
    headline
      ? `Headline (the most prominent text — design the visual around this): "${headline}"`
      : benefit
      ? `Core message (express this visually and typographically): "${benefit}"`
      : null,
    offer
      ? `Featured offer (make this visually prominent): "${offer}"`
      : `No promotional offer. DO NOT use "Sale", "New Arrivals", "Featured Collection", "Limited Time", or any discount language. Use a neutral brand label instead (e.g. "Made Daily", "Trusted Service", "Crafted Locally").`,
    `CTA button: "${cta}"`,
    website ? `Website (small, subtle, bottom of design): ${website}` : null,
    `Business name: "${businessName}" (visible but secondary to headline)`,
    ``,
    `CRITICAL DESIGN MANDATE:`,
    `Design this as ONE unified visual concept — NOT a photo with text overlaid on top.`,
    `Typography, imagery, color, and composition must be designed together as a single visual system.`,
    `The headline text must feel built into the design — integral to the composition, not floating above a background photo.`,
    `Think: branded print advertisement or premium campaign asset — polished, intentional, and cohesive.`,
    `The visual must make someone stop scrolling. The message must be clear within 2 seconds.`,
    `Strong hierarchy: headline dominates, supporting text and CTA follow, brand name anchors.`,
    ``,
    `NO generic stock-photo look. NO template aesthetic. This must look like a real brand's paid creative.`,
    `NO third-party logos. NO watermarks. NO QR codes. NO fake certifications.`,
    ``,
    variantBlock,
    `Variation token: ${variationToken || Date.now()}`,
    ``,
    `Output: one complete, professional square ad image.`,
  ].filter(Boolean).join("\n");
}

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const hasKey = !!process.env.OPENAI_API_KEY;
  console.log(`[generate-static-ad] request received | model=${model} | hasKey=${hasKey}`);
  try {
    const body = req.body || {};
    const a =
      body.answers && typeof body.answers === "object"
        ? body.answers
        : body.inputs && typeof body.inputs === "object"
        ? body.inputs
        : body;

    // Use regenerateToken/variant to force variation across runs
    const variationToken = String(body.regenerateToken || body.variant || `${Date.now()}-${Math.random()}`);

    const requestedCount = Number(body.count || body.n || 2);
    const count = Math.max(1, Math.min(2, requestedCount || 2));

    // Pull GPT-crafted copy if FormPage sent it — used to unify image text with UI copy
    const craftedCopy = (body.copy && typeof body.copy === "object") ? body.copy : {};

    // Generate each image with its OWN prompt/profile (more variation than n=2 on one prompt)
    const profiles = [
      buildVariantProfile(variationToken, "A", a.industry || ""),
      buildVariantProfile(variationToken, "B", a.industry || ""),
    ];

    const prompts = [
      buildAdPromptFromAnswers(a, variationToken, profiles[0], craftedCopy),
      buildAdPromptFromAnswers(a, variationToken, profiles[1], craftedCopy),
    ];

    let bufs = [];

    if (count === 1) {
      bufs = await generateOpenAIAdImageBuffers({
        prompt: prompts[0],
        size: "1024x1024",
        output_format: "png",
        quality: "auto",
        n: 1,
      });
    } else {
      const b1 = await generateOpenAIAdImageBuffers({
        prompt: prompts[0],
        size: "1024x1024",
        output_format: "png",
        quality: "auto",
        n: 1,
      });
      const b2 = await generateOpenAIAdImageBuffers({
        prompt: prompts[1],
        size: "1024x1024",
        output_format: "png",
        quality: "auto",
        n: 1,
      });
      bufs = [b1[0], b2[0]].filter(Boolean);
    }

    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const filenames = [];
    const urls = [];

    for (let i = 0; i < Math.min(count, bufs.length); i++) {
      const pngName = `${base}-${i + 1}.png`;
      await fs.promises.writeFile(path.join(GEN_DIR, pngName), bufs[i]);
      filenames.push(pngName);
      urls.push(makeMediaUrl(req, pngName));
    }

    // Guarantee 2 if requested
    if (count === 2 && urls.length === 1) {
      urls.push(urls[0]);
      filenames.push(filenames[0]);
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
      promptUsed: process.env.RETURN_PROMPTS === "1" ? prompt : undefined,
      ready: true,
    });
  } catch (err) {
    console.error("[generate-static-ad]", err);
    return res
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

    const { status, headers, body } = await fetchUpstream("GET", u, passHeaders, null, 120000);

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
    res.status(502).send("bad upstream");
  }
}

async function proxyHeadHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== "string") return res.status(400).end();

    const passHeaders = {};
    if (req.headers["range"]) passHeaders["Range"] = req.headers["range"];

    const { status, headers } = await fetchUpstream("HEAD", u, passHeaders, null, 120000);

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
    res.status(502).end();
  }
}

router.get("/proxy-img", proxyImgHandler);
router.head("/proxy-img", proxyHeadHandler);

module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;
