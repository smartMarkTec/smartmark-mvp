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
    `Create a premium square (1:1) Facebook/Instagram ad for ${businessName}, a ${industry} business.`,
    ``,
    idealCustomer ? `Target audience: ${idealCustomer}.` : null,
    benefit ? `Key benefit: ${benefit}.` : null,
    headline ? `Headline to include: "${headline}"` : null,
    offer
      ? `Promotional offer to include: "${offer}"`
      : `Do not add any promotional offer, discount, sale, or deal — this brand has no active promotion.`,
    `CTA: "${cta}"`,
    website ? `Brand URL: ${website}` : null,
    `Brand name: ${businessName}`,
    ``,
    `Make it look like a real paid campaign — premium, cohesive, stop-scroll quality. Text and imagery naturally integrated, not a template or stock photo. No watermarks, badges, or third-party logos.`,
    ``,
    `Variation: ${variationToken || Date.now()}`,
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
