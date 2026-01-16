/* eslint-disable */
"use strict";

/**
 * SmartMark Static Ads (PURE OpenAI)
 * ---------------------------------
 * Goal: ZERO hard-coded templates / ZERO SVG overlays / ZERO Pexels.
 * User answers -> OpenAI Images -> save PNG -> return URL.
 *
 * Keeps backward-compatible endpoints:
 * - POST /generate-static-ad   -> returns { ok:true, url, pngUrl, ... }
 * - POST /generate-image-from-prompt -> returns { ok:true, images:[{absoluteUrl}] }
 * - GET/HEAD /proxy-img        -> unchanged (useful for remote image proxying)
 */

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
      r.on("timeout", () => r.destroy(new Error("HTTP timeout")));
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
      r.on("timeout", () => r.destroy(new Error("HTTP timeout")));
    } catch (e) {
      reject(e);
    }
  });
}

/* ------------------------ OpenAI Image ------------------------ */

async function generateOpenAIImageBuffer({
  prompt,
  size = "1024x1024",
  output_format = "png",
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const body = JSON.stringify({
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    prompt,
    size,
    output_format,
  });

  const { status, body: respBuf } = await fetchUpstream(
    "POST",
    "https://api.openai.com/v1/images",
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    Buffer.from(body)
  );

  if (status !== 200) {
    let msg = `OpenAI image HTTP ${status}`;
    try {
      msg += " " + respBuf.toString("utf8").slice(0, 600);
    } catch {}
    throw new Error(msg);
  }

  const parsed = JSON.parse(respBuf.toString("utf8"));
  const b64 = parsed?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image: missing b64_json");
  return Buffer.from(b64, "base64");
}

/* ------------------------ Prompt Builder ------------------------ */

function safeStr(v, max = 240) {
  const s = (v ?? "").toString().replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max).trim() : s;
}

function domainFromUrl(u = "") {
  try {
    const url = new URL(String(u));
    return (url.hostname || "").replace(/^www\./i, "").trim();
  } catch {
    // try to salvage
    const s = String(u || "").trim();
    const m = s.match(/([a-z0-9-]+\.)+[a-z]{2,}/i);
    return m ? m[0].replace(/^www\./i, "") : "";
  }
}

function industryArtDirection(industry = "") {
  const t = String(industry || "").toLowerCase();
  if (t.includes("fashion") || t.includes("apparel") || t.includes("clothing"))
    return "high-end editorial fashion look, clean luxury typography, soft natural lighting, premium brand vibe";
  if (t.includes("restaurant") || t.includes("food") || t.includes("cafe"))
    return "food photography, appetizing lighting, bold headline typography, modern menu promo aesthetic";
  if (t.includes("fitness") || t.includes("gym"))
    return "energetic athletic vibe, high contrast, modern bold type, motivational tone";
  if (t.includes("real estate") || t.includes("realtor"))
    return "clean architectural photography vibe, upscale modern, airy lighting, trust-building design";
  if (t.includes("salon") || t.includes("spa") || t.includes("beauty"))
    return "minimal elegant beauty editorial vibe, soft gradients, premium clean typography";
  if (t.includes("electronics") || t.includes("tech"))
    return "sleek tech aesthetic, modern product photography, crisp clean type, futuristic minimal";
  return "modern premium social ad aesthetic, clean composition, balanced negative space, professional typography";
}

/**
 * IMPORTANT:
 * User wants: "straight OpenAI static ads" (text baked into the image).
 * So we explicitly provide ALL copy lines and require exact spelling.
 */
function buildStaticAdPromptFromAnswers(a = {}) {
  const industry = safeStr(a.industry, 80) || "Business";
  const businessName = safeStr(a.businessName, 80) || "Your Brand";
  const idealCustomer = safeStr(a.idealCustomer, 180);
  const offer = safeStr(a.offer, 120);
  const mainBenefit = safeStr(a.mainBenefit || a.benefit, 220);
  const website = safeStr(a.website || a.url, 240);
  const domain = domainFromUrl(website);
  const cta = safeStr(a.cta, 40) || (offer ? "Shop Now" : "Learn More");

  // Keep the displayed website short & clean
  const websiteDisplay = domain || businessName.replace(/\s+/g, "") + ".com";

  // A few safe “features” derived from the user’s own words (no inventing)
  const features = [];
  if (mainBenefit) {
    // break into compact phrases
    const bits = mainBenefit
      .split(/[.;•|\n]/g)
      .map((x) => x.trim())
      .filter(Boolean);
    for (const b of bits) {
      if (features.length >= 3) break;
      // keep short
      const w = b.split(/\s+/).slice(0, 5).join(" ");
      if (w && w.length <= 34) features.push(w);
    }
  }
  if (!features.length && idealCustomer) {
    const w = idealCustomer.split(/\s+/).slice(0, 6).join(" ");
    if (w) features.push(w);
  }
  if (!features.length) features.push("Premium quality");

  const artDir = industryArtDirection(industry);

  const lines = [
    `Create a SINGLE square social media advertisement image (1:1, ${1024}x${1024}), ready to run as a Facebook/Instagram static ad.`,
    `This must look like a professionally designed paid ad (not a poster mockup, not a UI screenshot).`,
    `Industry: ${industry}. Brand: ${businessName}.`,
    idealCustomer ? `Ideal customer: ${idealCustomer}.` : null,
    mainBenefit ? `Core promise/benefit: ${mainBenefit}.` : null,
    `Art direction: ${artDir}.`,
    ``,
    `TEXT REQUIREMENTS (must be perfectly legible, clean kerning, no gibberish):`,
    `- Render ALL text EXACTLY as written below (same spelling, same casing).`,
    `- Do NOT add any extra words, disclaimers, or fake claims.`,
    `- Use modern clean fonts (sans-serif), strong hierarchy, high contrast, premium layout.`,
    ``,
    `Use this exact text (place it like a real ad):`,
    `1) BRAND: "${businessName.toUpperCase()}"`,
    mainBenefit
      ? `2) HEADLINE: "${mainBenefit
          .split(/[.!?]/)[0]
          .trim()
          .slice(0, 48)}"`
      : `2) HEADLINE: "New Styles, Naturally"`,
    offer ? `3) OFFER BADGE: "${offer.toUpperCase()}"` : `3) (No offer badge)`,
    `4) BULLETS (short, as a checklist or separators): "${features
      .slice(0, 3)
      .map((x) => x.replace(/"/g, ""))
      .join(' • ')}"`,
    `5) CTA BUTTON: "${cta.toUpperCase()}"`,
    `6) WEBSITE: "${websiteDisplay}"`,
    ``,
    `VISUAL REQUIREMENTS:`,
    `- Use original photorealistic imagery relevant to the industry (no logos, no watermarks).`,
    `- Avoid any recognizable brand logos or copyrighted marks.`,
    `- Make sure text sits on clean areas with enough negative space so it reads easily.`,
    `- No QR codes. No phone numbers unless explicitly provided (none given).`,
  ].filter(Boolean);

  return lines.join("\n");
}

/* ------------------------ File Writer ------------------------ */

async function writeGeneratedPng(req, pngBuf) {
  const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pngName = `${base}.png`;
  await fs.promises.writeFile(path.join(GEN_DIR, pngName), pngBuf);
  const url = makeMediaUrl(req, pngName);
  return { base, pngName, url };
}

/* ------------------------ /generate-static-ad ------------------------ */
/**
 * Backward-compatible payloads supported:
 * - { answers: {...} }
 * - { inputs: {...}, answers: {...} } (we merge, answers win)
 * - (legacy) { inputs: {...} }
 *
 * Response (keeps fields your UI already expects):
 * { ok:true, type:"image", template:"openai", url, pngUrl, filename, asset, ready:true }
 */
router.post("/generate-static-ad", async (req, res) => {
  try {
    const body = req.body || {};
    const inputs = (body.inputs && typeof body.inputs === "object") ? body.inputs : {};
    const answers = (body.answers && typeof body.answers === "object") ? body.answers : {};

    // Merge legacy shapes; answers override inputs
    const a = { ...inputs, ...answers, ...body };

    // How many? (optional) default 1, allow 1..4
    const requestedCount = Number(body.count ?? body.n ?? 1);
    const count = Math.max(1, Math.min(4, Number.isFinite(requestedCount) ? requestedCount : 1));

    const prompt = buildStaticAdPromptFromAnswers(a);

    // Generate 1..4 variants (separate calls gives natural variation)
    const out = [];
    for (let i = 0; i < count; i++) {
      const pngBuf = await generateOpenAIImageBuffer({
        prompt,
        size: "1024x1024",
        output_format: "png",
      });
      const saved = await writeGeneratedPng(req, pngBuf);
      out.push(saved);
    }

    // If your existing UI expects a single url, keep that (first image)
    const first = out[0];

    // If count > 1, also return array for newer UI
    return res.json({
      ok: true,
      type: "image",
      template: "openai",
      url: first.url,
      absoluteUrl: first.url,
      pngUrl: first.url,
      filename: first.pngName,
      asset: { id: first.base, createdAt: Date.now() },
      ready: true,
      images: out.map((x) => ({
        absoluteUrl: x.url,
        url: x.url,
        filename: x.pngName,
        id: x.base,
      })),
      debug: {
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        size: "1024x1024",
      },
    });
  } catch (err) {
    console.error("[generate-static-ad]", err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

/* ------------------------ /generate-image-from-prompt ------------------------ */
/**
 * Keeps your old endpoint name but now also uses PURE OpenAI images.
 * Accepts:
 * - { answers: {...} }
 * - or fields at top level (legacy)
 * Returns:
 * - { ok:true, images:[{absoluteUrl}] }
 */
router.post("/generate-image-from-prompt", async (req, res) => {
  try {
    const b = req.body || {};
    const a = (b.answers && typeof b.answers === "object") ? b.answers : b;

    const requestedCount = Number(b.count ?? b.n ?? 2);
    const count = Math.max(1, Math.min(4, Number.isFinite(requestedCount) ? requestedCount : 2));

    const prompt = buildStaticAdPromptFromAnswers(a);

    const files = [];
    for (let i = 0; i < count; i++) {
      const pngBuf = await generateOpenAIImageBuffer({
        prompt,
        size: "1024x1024",
        output_format: "png",
      });
      const saved = await writeGeneratedPng(req, pngBuf);
      files.push({ absoluteUrl: saved.url, url: saved.url, filename: saved.pngName, id: saved.base });
    }

    return res.json({ ok: true, images: files });
  } catch (err) {
    console.error("[generate-image-from-prompt]", err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
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

/* ------------------------ Exports ------------------------ */

module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;
