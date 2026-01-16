/* eslint-disable */
"use strict";

const express = require("express");
const router = express.Router();

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
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

/* ------------------------ OpenAI Image (FINAL AD) ------------------------ */

// IMPORTANT: correct endpoint is /v1/images/generations (not /v1/images)
async function generateOpenAIAdImageBuffer({
  prompt,
  size = "1024x1024",
  output_format = "png",
  quality = "high",
}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";

  const body = JSON.stringify({
    model,
    prompt,
    size,
    quality,
    output_format, // supported for GPT image models
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
      msg += " " + respBuf.toString("utf8").slice(0, 600);
    } catch {}
    throw new Error(msg);
  }

  const parsed = JSON.parse(respBuf.toString("utf8"));
  const b64 = parsed?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image: missing b64_json");
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
  const cta = clean(a.cta || (industry.toLowerCase().includes("fashion") ? "Shop Now" : "Learn More"));

  // “Direct OpenAI static ad” = generate the whole finished creative (with text)
  // We also tell it to keep typography legible + no random logos/watermarks.
  const lines = [
    `Create a high-converting square (1:1) social media static advertisement image for a real business.`,
    `Business name: "${businessName}". Industry: "${industry}".`,
    website ? `Website to include (small, subtle): "${website}".` : `No website line if none provided.`,
    idealCustomer ? `Target customer: "${idealCustomer}".` : `Target customer: general audience for this industry.`,
    benefit ? `Core promise/benefit: "${benefit}".` : `Highlight a clear, believable benefit for this business.`,
    offer ? `Special offer/promo to feature prominently: "${offer}".` : `No discount. Instead highlight a neutral promo like "New Arrivals" / "Featured Collection" / "Limited Drop" depending on industry.`,
    ``,
    `Design requirements:`,
    `- Modern, premium, clean layout. Strong hierarchy.`,
    `- Include readable text in the image: business name, short headline (3–7 words), 1 supporting line, the offer (or neutral promo), and a clear CTA button text: "${cta}".`,
    `- Keep typography crisp and legible on mobile. Avoid tiny text.`,
    `- Use industry-appropriate imagery (photo-realistic or polished commercial style).`,
    `- NO third-party logos, NO watermarks, NO QR codes, NO fake certifications, NO policy-violating claims.`,
    `- Output should look like a real paid ad creative that a brand would run on Facebook/Instagram.`,
  ];

  return lines.join("\n");
}

/* ------------------------ /generate-static-ad ------------------------ */

router.post("/generate-static-ad", async (req, res) => {
  try {
    const body = req.body || {};
    const a =
      body.answers && typeof body.answers === "object"
        ? body.answers
        : (body.inputs && typeof body.inputs === "object" ? body.inputs : body);

    const prompt = buildAdPromptFromAnswers(a);

    // Generate at 1024 then upscale to 1080 (FB-friendly)
    const imgBuf = await generateOpenAIAdImageBuffer({
      prompt,
      size: "1024x1024",
      output_format: "png",
      quality: "high",
    });

    const finalPng = await sharp(imgBuf)
      .resize(1080, 1080, { fit: "cover" })
      .png({ quality: 92 })
      .toBuffer();

    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pngName = `${base}.png`;
    await fs.promises.writeFile(path.join(GEN_DIR, pngName), finalPng);

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
