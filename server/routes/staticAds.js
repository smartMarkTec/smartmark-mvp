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
   composition without hardcoding scenes or demographics. */
const VISUAL_MOODS = [
  "people and the service or experience",
  "the equipment, product, or result",
  "the environment, setting, or place",
  "a clean, minimal, or graphic composition",
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
  if (copyHeadline && !looksLikeRawClaim(copyHeadline)) return clip(copyHeadline, 45);

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
    return clip(titleCase(mainBenefit), 45);
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
  if (businessName && businessName.split(/\s+/).length <= 3) return clip(businessName, 45);

  return "Local Experts, Real Results";
}

function deriveSupportLine(a = {}, craftedCopy = {}) {
  const subline = clean(craftedCopy.subline || craftedCopy.body || "");

  // 1. Use pre-crafted subline only if it doesn't look like raw user input
  if (subline && !looksLikeRawClaim(subline)) return clip(subline, 80);

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

  return "Learn More";
}

function deriveOffer(a = {}, craftedCopy = {}) {
  return clean(craftedCopy.offer || a.offer || a.promo || "");
}


function buildAdPromptFromAnswers(a = {}, craftedCopy = {}, variationToken = "") {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = inferIndustry(a);
  const website = clean(a.website || a.url || "");
  const offer = clip(deriveOffer(a, craftedCopy), 70);
  const headline = deriveHeadline(a, craftedCopy);
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  return [
    `Create a square Facebook/Instagram ad for "${businessName}", a ${industry} business.`,
    `Style: clean, polished, and believable — like a real paid social ad.`,
    ``,
    `Ad copy:`,
    `  Headline: "${headline}"`,
    supportLine ? `  Support: "${supportLine}"` : null,
    `  CTA: "${cta}"`,
    website ? `  Website: ${website}` : null,
    `Brand: "${businessName}"`,
    offer
      ? `Offer: "${offer}"`
      : `Do not invent any promotional offer, sale, or discount.`,
    ``,
    `Visual: naturally focus on ${VISUAL_MOODS[variationToken ? variationToken.charCodeAt(variationToken.length - 1) % VISUAL_MOODS.length : 0]} for this business. Keep the ad clean, believable, and ready to run.`,
    variationToken ? `Variation: ${variationToken}` : null,
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

  const { status, body: respBuf } = await fetchUpstream(
    "POST",
    "https://api.openai.com/v1/images/generations",
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    Buffer.from(payload),
    45000
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
    }
  }

  if (!buffers.length) {
    throw new Error("OpenAI image: missing b64_json");
  }

  return buffers;
}

/* ------------------------ Logo detection ------------------------ */

function looksLikeLogoUrl(url) {
  const u = clean(url).toLowerCase();
  return (
    /logo/.test(u) ||
    /brand/.test(u) ||
    /navbar/.test(u) ||
    /header/.test(u) ||
    /site-logo/.test(u)
  );
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
        if (src && /logo|brand|site-logo|navbar|header/.test(combined)) {
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

    return res.status(400).json({
      ok: false,
      error: String(err?.message || err),
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