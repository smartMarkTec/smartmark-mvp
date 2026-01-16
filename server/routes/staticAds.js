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
/**
 * Generates FINAL ad images directly from the model (no templates, no compositing).
 * Returns an array of Buffers (length n).
 */
async function generateOpenAIAdImageBuffers({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "auto",
  n = 2,
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  // Best default per your request (you can override via env):
  // - OPENAI_IMAGE_MODEL=gpt-image-1.5
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

  const body = JSON.stringify({
    model,
    prompt,
    size, // keep square
    quality, // "auto" behaves closest to "just do it"
    output_format, // "png"
    n: Math.max(1, Math.min(4, Number(n) || 1)), // safety clamp
  });

  // one retry on transient failures/timeouts
  const attempt = async () => {
    const { status, body: respBuf } = await fetchUpstream(
      "POST",
      "https://api.openai.com/v1/images/generations",
      {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      Buffer.from(body),
      120000
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
        continue;
      }
      // If OpenAI ever returns URLs for your model/account, catch it loudly
      const maybeUrl = item?.url;
      if (maybeUrl) {
        throw new Error(
          "OpenAI image returned a URL, but this server expects b64_json. Update code to fetch the URL."
        );
      }
    }

    if (!bufs.length) throw new Error("OpenAI image: missing b64_json");
    return bufs;
  };

  try {
    return await attempt();
  } catch (e) {
    // retry once
    try {
      return await attempt();
    } catch (e2) {
      throw e2;
    }
  }
}

/* ------------------------ Prompt builder ------------------------ */

function clean(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function buildAdPromptFromAnswers(a = {}) {
  const businessName = clean(a.businessName || a.brand || "Your Brand");
  const industry = clean(a.industry || "Business");
  const website = clean(a.website || a.url || "");
  const idealCustomer = clean(a.idealCustomer || "");
  const offer = clean(a.offer || a.promo || "");
  const benefit = clean(a.mainBenefit || a.benefit || "");
  const cta = clean(
    a.cta ||
      (industry.toLowerCase().includes("fashion") ? "Shop Now" : "Learn More")
  );

  // Goal: generate the finished paid-ad creative directly from the model.
  // No templates, no overlays, no “baked” layouts in code.
  return [
    `Create a finished, high-converting square (1:1) social media static advertisement image.`,
    `It must look like a real paid Facebook/Instagram ad creative a brand would run.`,
    ``,
    `Business name: "${businessName}"`,
    `Industry: "${industry}"`,
    website ? `Website (small, subtle): "${website}"` : `No website line.`,
    idealCustomer
      ? `Target customer: "${idealCustomer}"`
      : `Target customer: typical buyers for this industry.`,
    benefit
      ? `Core promise/benefit: "${benefit}"`
      : `Include a clear believable benefit appropriate to this industry.`,
    offer
      ? `Promo/offer to feature prominently: "${offer}"`
      : `No discount given. Use a neutral promo tag appropriate to the industry (e.g., "New Arrivals", "Featured Collection", "Limited Drop").`,
    ``,
    `Layout & typography requirements:`,
    `- Use modern, premium, clean design with strong visual hierarchy.`,
    `- Include readable on-image text: business name, a short headline (3–7 words), one supporting line, the offer/promo, and a clear CTA button that says: "${cta}".`,
    `- Keep typography crisp and legible on mobile. Avoid tiny text.`,
    `- Use industry-appropriate imagery (commercial photo-real or polished brand style).`,
    ``,
    `Strict constraints:`,
    `- NO third-party logos, NO watermarks, NO QR codes.`,
    `- NO fake certifications, NO policy-violating claims.`,
    `- Do not include any unrelated brand names.`,
    ``,
    `Output: a single square static ad image.`,
  ].join("\n");
}

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  try {
    const body = req.body || {};
    // accept answers, inputs, or direct body
    const a =
      body.answers && typeof body.answers === "object"
        ? body.answers
        : body.inputs && typeof body.inputs === "object"
        ? body.inputs
        : body;

    const prompt = buildAdPromptFromAnswers(a);

    // Default: ALWAYS generate 2 images for your A/B flow.
    // Allow override, but clamp 1..2 unless you purposely change it.
    const requestedCount = Number(body.count || body.n || 2);
    const count = Math.max(1, Math.min(2, requestedCount || 2));

    const bufs = await generateOpenAIAdImageBuffers({
      prompt,
      size: "1024x1024",
      output_format: "png",
      quality: "auto",
      n: count,
    });

    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const filenames = [];
    const urls = [];

    for (let i = 0; i < Math.min(count, bufs.length); i++) {
      const pngName = `${base}-${i + 1}.png`;
      await fs.promises.writeFile(path.join(GEN_DIR, pngName), bufs[i]);
      filenames.push(pngName);
      urls.push(makeMediaUrl(req, pngName));
    }

    // Hard guarantee for frontend: always return 2 entries if count=2
    // If upstream returned only 1 buffer (rare), duplicate it as fallback.
    if (count === 2 && urls.length === 1) {
      urls.push(urls[0]);
      filenames.push(filenames[0]);
    }

    return res.json({
      ok: true,
      type: "image",
      template: "openai_direct",
      // legacy fields (keep old callers working)
      url: urls[0] || null,
      absoluteUrl: urls[0] || null,
      pngUrl: urls[0] || null,
      filename: filenames[0] || null,
      // new stable fields (preferred)
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
