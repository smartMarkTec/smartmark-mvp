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

function buildAdPromptFromAnswers(a = {}, variationToken = "", craftedCopy = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = clean(a.industry || "Business");
  const website = clean(a.website || a.url || "");
  const idealCustomer = clean(a.idealCustomer || "");
  const benefit = clean(a.mainBenefit || a.benefit || "");
  const headline = clean(craftedCopy.headline || "");
  const offer = clean(craftedCopy.offer || a.offer || a.promo || "");
  const cta = clean(craftedCopy.cta || a.cta || "Learn More");

  return [
    `Create a realistic, practical Facebook/Instagram feed ad for "${businessName}", a ${industry} business.`,
    ``,
    idealCustomer ? `Target customer: ${idealCustomer}.` : null,
    benefit ? `Key message: ${benefit}.` : null,
    headline ? `Headline text in the ad: "${headline}"` : null,
    offer
      ? `Promotional offer to show: "${offer}"`
      : `Do not invent or display any promotional offer, discount, or deal — this brand has no active promotion.`,
    `CTA button/text: "${cta}"`,
    `Brand name visible in the ad: "${businessName}"`,
    website ? `Website URL shown: ${website}` : null,
    ``,
    `Style: a clean, professional, believable direct-response social ad. Realistic scene or product photo — not abstract art, not stylized poster, not over-designed. Natural layout typical of a real paid Facebook/Instagram ad. Text clearly readable and naturally composed into the design. No stock photo watermarks or unrelated logos.`,
    ``,
    `Variation: ${variationToken || Date.now()}`,
  ].filter(Boolean).join("\n");
}

/* ------------------------ Logo detection ------------------------ */

async function detectBrandLogo(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    if (!/^https?:\/\//i.test(websiteUrl)) websiteUrl = `https://${websiteUrl}`;
    const parsed = new URL(websiteUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;

    // Fetch homepage HTML to find logo candidates
    let html = "";
    try {
      const { status, body } = await fetchUpstream(
        "GET", websiteUrl,
        { "User-Agent": "Mozilla/5.0 (compatible; Smartmark/1.0)", "Accept": "text/html" },
        null, 7000
      );
      if (status === 200) html = body.toString("utf8").slice(0, 120000);
    } catch { /* continue to fallbacks */ }

    const candidates = [];

    if (html) {
      // <img> tags with "logo" anywhere in the tag attributes
      for (const m of html.matchAll(/<img[^>]+>/gi)) {
        const tag = m[0];
        const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
        if (src && /logo/i.test(tag)) candidates.push(src);
      }
      // <link rel="apple-touch-icon"> — highest-quality icon, usually clean
      for (const m of html.matchAll(/<link[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi)) {
        const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
        if (href) candidates.push(href);
      }
    }

    // Always try well-known paths as fallbacks
    candidates.push(
      `${origin}/logo.png`,
      `${origin}/logo.jpg`,
      `${origin}/apple-touch-icon.png`,
      `${origin}/favicon.png`,
    );

    for (const src of candidates.slice(0, 8)) {
      try {
        let url = src.trim();
        if (url.startsWith("//")) url = `${parsed.protocol}${url}`;
        else if (url.startsWith("/")) url = `${origin}${url}`;
        else if (!/^https?:\/\//i.test(url)) url = `${origin}/${url}`;

        const { status, headers, body: buf } = await fetchUpstream(
          "GET", url, { "User-Agent": "Mozilla/5.0" }, null, 5000
        );
        if (status !== 200 || buf.length < 500) continue;

        const ct = String(headers?.["content-type"] || "").toLowerCase();
        // Accept PNG, JPEG, WEBP — skip SVG and ICO (complex formats)
        const isImage = /png|jpeg|jpg|webp/.test(ct) || /\.(png|jpg|jpeg|webp)(\?|$)/i.test(url);
        if (!isImage) continue;

        console.log(`[logo-detect] found logo at ${url} (${buf.length} bytes)`);
        return buf;
      } catch { continue; }
    }
  } catch (e) {
    console.warn("[logo-detect] failed:", e?.message);
  }
  return null;
}

/* ------------------------ Logo compositing ------------------------ */

async function compositeLogoOntoAd(adBuf, logoBuf) {
  try {
    const adMeta = await sharp(adBuf).metadata();
    const adW = adMeta.width || 1024;
    const adH = adMeta.height || 1024;

    const maxLogoW = Math.round(adW * 0.18);
    const maxLogoH = Math.round(adH * 0.09);
    const pad = Math.round(adW * 0.03);

    const logoResized = await sharp(logoBuf)
      .resize(maxLogoW, maxLogoH, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoResized).metadata();
    const lW = logoMeta.width || maxLogoW;
    const lH = logoMeta.height || maxLogoH;

    const left = adW - lW - pad;
    const top = adH - lH - pad;

    return await sharp(adBuf)
      .composite([{ input: logoResized, left, top }])
      .png()
      .toBuffer();
  } catch (e) {
    console.warn("[logo-composite] failed, returning original:", e?.message);
    return adBuf;
  }
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

    // Start logo detection in parallel — runs while image generation is happening
    const website = clean(a.website || a.url || "");
    const logoPromise = website ? detectBrandLogo(website) : Promise.resolve(null);

    const prompts = [
      buildAdPromptFromAnswers(a, `${variationToken}-A`, craftedCopy),
      buildAdPromptFromAnswers(a, `${variationToken}-B`, craftedCopy),
    ];

    let bufs = [];

    if (count === 1) {
      bufs = await generateOpenAIAdImageBuffers({
        prompt: prompts[0],
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: 1,
      });
    } else {
      const b1 = await generateOpenAIAdImageBuffers({
        prompt: prompts[0],
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: 1,
      });
      const b2 = await generateOpenAIAdImageBuffers({
        prompt: prompts[1],
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: 1,
      });
      bufs = [b1[0], b2[0]].filter(Boolean);
    }

    // Composite logo onto each generated image if one was detected
    const logoBuf = await logoPromise;
    if (logoBuf && bufs.length) {
      console.log(`[generate-static-ad] compositing logo onto ${bufs.length} image(s)`);
      bufs = await Promise.all(bufs.map(b => compositeLogoOntoAd(b, logoBuf)));
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
