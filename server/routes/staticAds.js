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

function fetchUpstream(method, url, extraHeaders = {}, bodyBuf = null) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith("https") ? https : http;
      const r = lib.request(
        url,
        { method, timeout: 45000, headers: extraHeaders },
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
 * This generates the FINAL ad image directly from the model (no templates, no compositing).
 * We still have to decode base64 and save to disk so we can return a URL to your frontend.
 */
async function generateOpenAIAdImageBuffer({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "auto",
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
    n: 1,
  });

  const { status, body: respBuf } = await fetchUpstream(
    "POST",
    "https://api.openai.com/v1/images/generations",
    {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    Buffer.from(body)
  );

  if (status !== 200) {
    let msg = `OpenAI image HTTP ${status}`;
    try {
      msg += " " + respBuf.toString("utf8").slice(0, 1000);
    } catch {}
    throw new Error(msg);
  }

  let parsed;
  try {
    parsed = JSON.parse(respBuf.toString("utf8"));
  } catch (e) {
    throw new Error("OpenAI image: failed to parse JSON response");
  }

  // GPT image models return base64 via b64_json
  const b64 = parsed?.data?.[0]?.b64_json;
  if (!b64) {
    // If OpenAI ever returns URLs for your model/account, this will catch it.
    const maybeUrl = parsed?.data?.[0]?.url;
    if (maybeUrl) {
      throw new Error(
        "OpenAI image returned a URL, but this server expects b64_json. Update code to fetch the URL."
      );
    }
    throw new Error("OpenAI image: missing b64_json");
  }

  return Buffer.from(b64, "base64");
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

    // Generate the FINAL ad image directly from OpenAI (no resizing, no compositing).
    const imgBuf = await generateOpenAIAdImageBuffer({
      prompt,
      size: "1024x1024",
      output_format: "png",
      quality: "auto",
    });

    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pngName = `${base}.png`;

    await fs.promises.writeFile(path.join(GEN_DIR, pngName), imgBuf);

    const mediaPng = makeMediaUrl(req, pngName);

    return res.json({
      ok: true,
      type: "image",
      template: "openai_direct",
      url: mediaPng,
      absoluteUrl: mediaPng,
      pngUrl: mediaPng,
      filename: pngName,
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

module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;
