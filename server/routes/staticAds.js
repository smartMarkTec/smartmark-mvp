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
  timeoutMs = 120000
) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.request(
        url,
        { method, timeout: timeoutMs, headers: extraHeaders },
        (res) => {
          const chunks = [];
          res.on("data", (d) => chunks.push(d));
          res.on("error", reject);
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
      try {
        msg += " " + respBuf.toString("utf8").slice(0, 1200);
      } catch {}
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
      if (b64) {
        bufs.push(Buffer.from(b64, "base64"));
      } else if (item?.url) {
        throw new Error(
          "OpenAI image returned URL but server expects b64_json."
        );
      }
    }

    if (!bufs.length) throw new Error("OpenAI image: missing b64_json");
    return bufs;
  };

  try {
    return await attempt();
  } catch (firstErr) {
    console.warn(
      "[generate-static-ad] first attempt failed, retrying once:",
      firstErr?.message || firstErr
    );
    return await attempt();
  }
}

/* ------------------------ Prompt helpers ------------------------ */

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function titleCase(s) {
  return clean(s)
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function simplifyBenefit(s) {
  let out = clean(s);
  if (!out) return "";
  out = out
    .replace(/\bour\b/gi, "")
    .replace(/\bwe\b/gi, "")
    .replace(/\bis\b/gi, "")
    .replace(/\bare\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return titleCase(out);
}

function deriveHeadline(a = {}, craftedCopy = {}) {
  const fromCopy = clean(craftedCopy.headline || "");
  if (fromCopy) return fromCopy;

  const benefit = simplifyBenefit(a.mainBenefit || a.benefit || "");
  if (benefit) {
    if (/effortless/i.test(benefit) && /marketing/i.test(a.industry || "")) {
      return "Effortless Marketing";
    }
    return benefit;
  }

  const industry = clean(a.industry || "");
  if (industry) return `${titleCase(industry)} That Works`;

  return clean(a.businessName || a.brand || "Your Brand");
}

function deriveSupportLine(a = {}, craftedCopy = {}) {
  const fromCopy = clean(craftedCopy.subline || craftedCopy.body || "");
  if (fromCopy) return fromCopy;

  const idealCustomer = clean(a.idealCustomer || "");
  const benefit = clean(a.mainBenefit || a.benefit || "");

  if (idealCustomer) {
    return idealCustomer.length > 95
      ? idealCustomer.slice(0, 92).trim() + "..."
      : idealCustomer;
  }

  if (benefit) {
    return benefit.length > 90 ? benefit.slice(0, 87).trim() + "..." : benefit;
  }

  return "";
}

function deriveCTA(a = {}, craftedCopy = {}) {
  const fromCopy = clean(craftedCopy.cta || a.cta || "");
  if (fromCopy) return fromCopy;

  if (clean(a.offer || a.promo || "")) return "Claim Offer";

  return "Learn More";
}

function buildAdPromptFromAnswers(a = {}, variationToken = "", craftedCopy = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = clean(a.industry || "business");
  const website = clean(a.website || a.url || "");
  const idealCustomer = clean(a.idealCustomer || "");
  const benefit = clean(a.mainBenefit || a.benefit || "");
  const offer = clean(craftedCopy.offer || a.offer || a.promo || "");
  const headline = deriveHeadline(a, craftedCopy);
  const supportLine = deriveSupportLine(a, craftedCopy);
  const cta = deriveCTA(a, craftedCopy);

  const variationHint =
    /-B$/.test(variationToken)
      ? "Use a different realistic ad scene than the first version. Lean slightly more toward a device/dashboard/business-use moment."
      : "Use a clean, believable primary ad scene with strong commercial appeal.";

  return [
    `Create a square 1:1 photorealistic Facebook or Instagram ad for "${businessName}", a ${industry} business.`,
    variationHint,
    `This should look like a real paid social ad someone would actually run today.`,
    `Make it clean, premium, believable, direct-response, and naturally integrated.`,
    `Not abstract art. Not poster art. Not weird. Not fake-looking. Not overly stylized. Not a template mockup.`,
    `Use a realistic marketing/business scene that fits the business and feels commercially useful.`,
    idealCustomer ? `The target customer is: ${idealCustomer}.` : null,
    benefit ? `The main benefit is: ${benefit}.` : null,
    ``,
    `Use this brand name in the ad if a brand mark or brand text appears: "${businessName}".`,
    `Use this headline naturally in the ad: "${headline}".`,
    supportLine ? `Use this short support line naturally in the ad: "${supportLine}".` : null,
    `Use this CTA naturally in the ad: "${cta}".`,
    website ? `Show this website subtly in the ad if it fits cleanly: ${website}` : null,
    offer
      ? `There is a real promotion. Use it naturally in the ad: "${offer}".`
      : `Do not invent any promotion, sale, discount, free trial, deal, or limited-time offer. There is no active promo.`,
    ``,
    `The text should feel like it was created together with the image, not pasted on top later.`,
    `Keep the copy readable, clean, and natural for a real social ad.`,
    `No unrelated logos, no stock photo watermarks, no gibberish text.`,
    `Variation token: ${variationToken || Date.now()}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------ Logo detection ------------------------ */

async function detectBrandLogo(websiteUrl) {
  if (!websiteUrl) return null;

  try {
    if (!/^https?:\/\//i.test(websiteUrl)) {
      websiteUrl = `https://${websiteUrl}`;
    }

    const parsed = new URL(websiteUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;

    let html = "";
    try {
      const { status, body } = await fetchUpstream(
        "GET",
        websiteUrl,
        {
          "User-Agent": "Mozilla/5.0 (compatible; Smartmark/1.0)",
          Accept: "text/html",
        },
        null,
        7000
      );
      if (status === 200) {
        html = body.toString("utf8").slice(0, 150000);
      }
    } catch {}

    const candidates = [];

    if (html) {
      for (const m of html.matchAll(/<img[^>]+>/gi)) {
        const tag = m[0];
        const src = (tag.match(/src=["']([^"']+)["']/i) || [])[1];
        if (src && /logo/i.test(tag)) candidates.push(src);
      }

      for (const m of html.matchAll(
        /<link[^>]*rel=["'][^"']*apple-touch-icon[^"']*["'][^>]*>/gi
      )) {
        const href = (m[0].match(/href=["']([^"']+)["']/i) || [])[1];
        if (href) candidates.push(href);
      }

      const ogImage =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogImage && ogImage[1]) candidates.push(ogImage[1]);
    }

    candidates.push(
      `${origin}/logo.png`,
      `${origin}/logo.jpg`,
      `${origin}/logo.jpeg`,
      `${origin}/apple-touch-icon.png`,
      `${origin}/favicon.png`
    );

    for (const src of candidates.slice(0, 10)) {
      try {
        let url = src.trim();
        if (url.startsWith("//")) url = `${parsed.protocol}${url}`;
        else if (url.startsWith("/")) url = `${origin}${url}`;
        else if (!/^https?:\/\//i.test(url)) url = `${origin}/${url}`;

        const { status, headers, body: buf } = await fetchUpstream(
          "GET",
          url,
          { "User-Agent": "Mozilla/5.0" },
          null,
          5000
        );

        if (status !== 200 || buf.length < 500) continue;

        const ct = String(headers?.["content-type"] || "").toLowerCase();
        const isImage =
          /png|jpeg|jpg|webp/.test(ct) ||
          /\.(png|jpg|jpeg|webp)(\?|$)/i.test(url);

        if (!isImage) continue;

        console.log(`[logo-detect] found logo at ${url} (${buf.length} bytes)`);
        return buf;
      } catch {
        continue;
      }
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

    const maxLogoW = Math.round(adW * 0.16);
    const maxLogoH = Math.round(adH * 0.08);
    const pad = Math.round(adW * 0.03);

    const logoResized = await sharp(logoBuf)
      .resize(maxLogoW, maxLogoH, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();

    const logoMeta = await sharp(logoResized).metadata();
    const lW = logoMeta.width || maxLogoW;
    const lH = logoMeta.height || maxLogoH;

    const left = adW - lW - pad;
    const top = pad;

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

    const variationToken = String(
      body.regenerateToken || body.variant || `${Date.now()}-${Math.random()}`
    );

    const requestedCount = Number(body.count || body.n || 2);
    const count = Math.max(1, Math.min(2, requestedCount || 2));

    const craftedCopy =
      body.copy && typeof body.copy === "object" ? body.copy : {};

    const website = clean(a.website || a.url || "");
    const logoPromise = website
      ? detectBrandLogo(website)
      : Promise.resolve(null);

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
      const aBuf = await generateOpenAIAdImageBuffers({
        prompt: prompts[0],
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: 1,
      });

      const bBuf = await generateOpenAIAdImageBuffers({
        prompt: prompts[1],
        size: "1024x1024",
        output_format: "png",
        quality: "high",
        n: 1,
      });

      bufs = [aBuf[0], bBuf[0]].filter(Boolean);
    }

    const logoBuf = await logoPromise;
    if (logoBuf && bufs.length) {
      console.log(
        `[generate-static-ad] compositing logo onto ${bufs.length} image(s)`
      );
      bufs = await Promise.all(bufs.map((b) => compositeLogoOntoAd(b, logoBuf)));
    }

    const base = `static-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}`;

    const filenames = [];
    const urls = [];

    for (let i = 0; i < Math.min(count, bufs.length); i++) {
      const pngName = `${base}-${i + 1}.png`;
      await fs.promises.writeFile(path.join(GEN_DIR, pngName), bufs[i]);
      filenames.push(pngName);
      urls.push(makeMediaUrl(req, pngName));
    }

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
    if (req.headers.range) passHeaders.Range = req.headers.range;

    const { status, headers, body } = await fetchUpstream(
      "GET",
      u,
      passHeaders,
      null,
      120000
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
    if (!u || typeof u !== "string") return res.status(400).end();

    const passHeaders = {};
    if (req.headers.range) passHeaders.Range = req.headers.range;

    const { status, headers } = await fetchUpstream(
      "HEAD",
      u,
      passHeaders,
      null,
      120000
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