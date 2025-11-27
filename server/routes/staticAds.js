/* eslint-disable */
'use strict';

/**
 * Static Ad Generator — exact layout templates
 *   - flyer_a  : Home Cleaning flyer (header bar, diagonal split, lists, phone CTA)
 *   - poster_b : Fall Flooring event (center white card, save $, financing, leaves)
 *
 * Writes SVG → PNG into GENERATED_DIR and returns pngUrl + svgUrl.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');
const sharp = require('sharp');

const ajv = new Ajv({ allErrors: true });

/* ------------------------ Storage ------------------------ */
const GEN_DIR = process.env.GENERATED_DIR ||
  path.join(process.cwd(), 'server', 'public', 'generated');
fs.mkdirSync(GEN_DIR, { recursive: true });

function makeUrl(req, absPath) {
  const filename = path.basename(absPath);
  const base = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
  return `${base}/generated/${filename}`;
}

/* ------------------------ Schema ------------------------ */
const schema = {
  type: "object",
  required: ["template","inputs","knobs"],
  properties: {
    template: { enum: ["flyer_a","poster_b"] },
    inputs: {
      type: "object",
      required: ["businessName","headline","subline","cta"],
      properties: {
        industry: { type: "string", maxLength: 48 },
        businessName: { type: "string", maxLength: 64 },
        website: { type: "string", maxLength: 120 },
        location: { type: "string", maxLength: 64 },
        phone: { type: "string", maxLength: 32 },
        headline: { type: "string", maxLength: 64 },
        subline: { type: "string", maxLength: 140 },
        cta: { type: "string", maxLength: 28 },
        offer: { type: "string", maxLength: 48 }
      }
    },
    knobs: { type: "object" }
  }
};

/* ------------------------ Utility ------------------------ */
function esc(t="") {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
function listToRows(arr = [], max = 6) {
  return (Array.isArray(arr) ? arr : []).slice(0, max).map((text, i) => ({
    y: 40 + i * 42,
    text: esc(text)
  }));
}

/* ------------------------ Template: flyer_a ------------------------ */
/**
 * Visual targets:
 * - Dark teal header strip
 * - Body has diagonal split (light aqua)
 * - Left column: frequencies list with check marks (orange)
 * - Right column: services list with bullet dots
 * - Bottom CTA bar (orange) with CALL NOW + phone
 */
function tplFlyerA(opts) {
  const W = 1080, H = 1080;
  const {
    brand = {},
    lists = {},
    coverage = "Coverage area 25 Miles around your city",
    inputs = {}
  } = opts;

  const primary = brand.primary || "#0d3b66";   // dark teal
  const accent  = brand.accent  || "#ff8b4a";   // orange
  const bodyBg  = "#dff3f4";                     // light aqua
  const textDark= "#2b3a44";

  const left = listToRows(lists.left || ["One Time","Weekly","Bi-Weekly","Monthly"]);
  const right= listToRows(lists.right|| ["Kitchen","Bathrooms","Offices","Dusting","Mopping","Vacuuming"]);

  const phone = brand.phone || inputs.phone || "(210) 555-0147";
  const biz   = brand.businessName || inputs.businessName || "Your Business";

  // Check icon path
  const checkPath = `M8 14.5l-4.5-4.6L1 12l7 7L23 4.9 20.6 3z`;

  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="diag" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bodyBg}"/>
      <stop offset="1" stop-color="#e9fbfb"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <style>
      .h0{font:900 96px/1 Inter,system-ui,Arial}
      .h1{font:900 64px/1 Inter,system-ui,Arial}
      .b1{font:700 38px/1.2 Inter,system-ui,Arial}
      .b2{font:700 34px/1.2 Inter,system-ui,Arial}
      .small{font:600 28px/1.2 Inter,system-ui,Arial}
      .chip{font:900 44px/1 Inter,system-ui,Arial; letter-spacing: .5px}
    </style>
  </defs>

  <!-- background -->
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="0" y="0" width="${W}" height="260" fill="${primary}"/>
  <rect x="0" y="260" width="${W}" height="${H-260}" fill="url(#diag)"/>
  <!-- diagonal split overlay -->
  <path d="M0,420 L1080,260 L1080,1080 L0,1080 Z" fill="#bfe9ea" opacity=".45"/>

  <!-- Header -->
  <g transform="translate(60,140)">
    <text class="h0" fill="#ffffff">HOME CLEANING</text>
    <text class="h0" y="110" fill="#ffffff" opacity=".98">SERVICES</text>
    <text class="b1" y="170" fill="#e6f5ff" opacity=".9">APARTMENT • HOME • OFFICE</text>
  </g>

  <!-- Mascot placeholder (soft blob) -->
  <ellipse cx="280" cy="620" rx="120" ry="160" fill="${accent}" opacity=".16" filter="url(#soft)"/>

  <!-- Left list -->
  <g transform="translate(120, 560)">
    <text class="h1" fill="${primary}" y="-30">FREQUENCY</text>
    ${left.map(r => `
      <g transform="translate(0, ${r.y})">
        <path d="${checkPath}" transform="scale(1.2)" fill="${accent}"/>
        <text class="b2" x="40" y="18" fill="${textDark}">${r.text}</text>
      </g>
    `).join('')}
  </g>

  <!-- Right list -->
  <g transform="translate(620, 560)">
    <text class="h1" fill="${primary}" y="-30">SERVICES</text>
    ${right.map(r => `
      <g transform="translate(0, ${r.y})">
        <circle cx="10" cy="10" r="10" fill="${primary}"/>
        <text class="b2" x="40" y="18" fill="${textDark}">${r.text}</text>
      </g>
    `).join('')}
  </g>

  <!-- Coverage -->
  <g transform="translate(120, 930)">
    <text class="small" fill="${primary}" opacity=".9">
      <tspan dx="0">📍</tspan>
      <tspan dx="10">${esc(coverage)}</tspan>
    </text>
  </g>

  <!-- CTA bar -->
  <g transform="translate(60, 970)">
    <rect width="${W-120}" height="90" rx="18" fill="${accent}" />
    <text class="chip" x="40" y="60" fill="#071018">CALL NOW! ${esc(phone)}</text>
  </g>

  <!-- Top-left badge -->
  <g transform="translate(820,40)">
    <rect width="220" height="80" rx="14" fill="#ffffff22" stroke="#ffffff55"/>
    <text class="b2" x="110" y="50" text-anchor="middle" fill="#fff">${esc(biz)}</text>
  </g>
</svg>`;
}

/* ------------------------ Template: poster_b ------------------------ */
/**
 * Visual targets:
 * - Dark room/lifestyle vibe background (simulated with gradient + vignette)
 * - Center white card with soft shadow
 * - Big FALL FLOORING SALE! headline
 * - Save up to $1000 + SPECIAL FINANCING line
 * - Maple leaves in the corners
 * - Fine-print legal on bottom
 */
function tplPosterB(opts) {
  const W = 1080, H = 1080;
  const {
    inputs = {},
    knobs = {}
  } = opts;

  const eventTitle   = esc(knobs.eventTitle || "FALL FLOORING SALE!");
  const dateRange    = esc(knobs.dateRange || "AUGUST 15 – SEPTEMBER 30");
  const saveAmount   = esc(knobs.saveAmount || "SAVE up to $1000");
  const financing    = esc(knobs.financingLine || "PLUS SPECIAL FINANCING*");
  const qualifiers   = esc(knobs.qualifiers || "On select flooring products and services");
  const legal        = esc(knobs.legal || "*With approved credit. Ask for details.");
  const brandName    = esc(inputs.businessName || "Your Brand");

  // Simple maple leaf path (stylized)
  const leaf = "M50 0 C65 20, 70 40, 60 60 C85 55, 100 70, 100 90 C80 85, 70 95, 60 110 C80 110, 95 120, 90 140 C70 130, 60 140, 50 150 C40 140, 30 130, 10 140 C5 120, 20 110, 40 110 C30 95, 20 85, 0 90 C0 70, 15 55, 40 60 C30 40, 35 20, 50 0 Z";

  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="room" cx="50%" cy="35%">
      <stop offset="0" stop-color="#27313a"/>
      <stop offset="1" stop-color="#0f151c"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#000" flood-opacity=".36"/>
    </filter>
    <style>
      .title{font:900 84px/1.04 Inter,system-ui,Arial; letter-spacing:1px}
      .sale{font:900 92px/1.02 Inter,system-ui,Arial}
      .meta{font:800 28px/1.2 Inter,system-ui,Arial; letter-spacing:.6px}
      .save{font:900 78px/1 Inter,system-ui,Arial}
      .fin{font:900 38px/1 Inter,system-ui,Arial}
      .fine{font:600 24px/1.2 Inter,system-ui,Arial}
      .brand{font:900 34px/1 Inter,system-ui,Arial}
    </style>
  </defs>

  <!-- background room + vignette -->
  <rect width="${W}" height="${H}" fill="url(#room)"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" rx="36" fill="none" stroke="#ffffff" opacity=".14"/>

  <!-- leaves -->
  <g opacity=".85">
    <g transform="translate(120,110) scale(1.6) rotate(-18)">
      <path d="${leaf}" fill="#c54e2f"/>
    </g>
    <g transform="translate(${W-220},160) scale(1.3) rotate(22)">
      <path d="${leaf}" fill="#d58a2a"/>
    </g>
  </g>

  <!-- central card -->
  <g transform="translate(150,180)">
    <rect width="${W-300}" height="${H-360}" rx="26" fill="#ffffff" filter="url(#shadow)"/>
    <g transform="translate(60,60)">
      <text class="brand" fill="#3a4450">${brandName}</text>
      <text class="title" y="100" fill="#bf2b2b">${eventTitle}</text>
      <text class="meta" y="150" fill="#3a4450">${dateRange}</text>

      <text class="save" y="280" fill="#0f151c">${saveAmount}</text>
      <text class="fin"  y="340" fill="#0f151c">${financing}</text>
      <text class="meta" y="386" fill="#6d7782">${qualifiers}</text>

      <text class="fine" y="${H-360-60-26-60}" fill="#8a96a3" text-anchor="end" x="${W-300-120}">
        ${legal}
      </text>
    </g>
  </g>
</svg>`;
}

/* ------------------------ Route ------------------------ */
router.post('/generate-static-ad', async (req, res) => {
  try {
    const body = req.body || {};
    // Accept both the new shape (template/inputs/knobs) and the older ai.js proxy shape:
    const template = body.template || (body?.templateKey) || (body?.templateName) || "poster_b";

    // If the request came from your FormPage proxy:
    // { template, inputs, knobs }
    const inputs = body.inputs || {};
    const knobs  = body.knobs  || {};

    // Also accept the previous "brand/lists/..." flat shape
    const brand = body.brand || {
      businessName: inputs.businessName || body?.brandName || "Your Brand",
      phone: inputs.phone || body?.phone || "(210) 555-0147",
      location: body?.location || inputs.location || "",
      website: inputs.website || "",
      primary: body?.palette?.header || "#0d3b66",
      accent: body?.palette?.accent || "#ff8b4a",
      bg: body?.palette?.bg || "#0a1922"
    };

    const lists = body.lists || {
      left: (body.frequencyList || ["One Time","Weekly","Bi-Weekly","Monthly"]),
      right: (body.servicesList || ["Kitchen","Bathrooms","Offices","Dusting","Mopping","Vacuuming"])
    };

    const payload = {
      template,
      inputs: {
        industry: inputs.industry || body.industry || "",
        businessName: inputs.businessName || brand.businessName || "Your Brand",
        website: inputs.website || "",
        location: inputs.location || brand.location || "",
        phone: inputs.phone || brand.phone || "(210) 555-0147",
        headline: inputs.headline || body.headline || "",
        subline: inputs.subline || body.subline || "",
        cta: inputs.cta || body.cta || "CALL NOW!",
        offer: inputs.offer || body.offer || ""
      },
      knobs: {
        ...knobs,
        // defaults for poster_b
        eventTitle: knobs.eventTitle || body.eventTitle || "FALL FLOORING SALE!",
        dateRange: knobs.dateRange || body.dateRange || "LIMITED TIME ONLY",
        saveAmount: knobs.saveAmount || body.saveAmount || "SAVE up to $1000",
        financingLine: knobs.financingLine || body.financingLine || "PLUS SPECIAL FINANCING*",
        qualifiers: knobs.qualifiers || body.qualifiers || "On select flooring products and services",
        legal: knobs.legal || body.legal || "*With approved credit. Ask for details."
      },
      brand,
      lists,
      coverage: body.coverage || "Coverage area 25 Miles around your city"
    };

    // Validate minimal envelope (template/inputs/knobs)
    const ok = ajv.validate(schema, { template: payload.template, inputs: payload.inputs, knobs: payload.knobs });
    if (!ok) {
      throw new Error('validation failed: ' + JSON.stringify(ajv.errors));
    }

    // Render SVG by template
    let svg;
    if (payload.template === "flyer_a") {
      svg = tplFlyerA({
        brand: payload.brand,
        lists: payload.lists,
        coverage: payload.coverage,
        inputs: payload.inputs
      });
    } else {
      svg = tplPosterB({
        inputs: payload.inputs,
        knobs: payload.knobs
      });
    }

    // Write files
    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const svgPath = path.join(GEN_DIR, `${base}.svg`);
    const pngPath = path.join(GEN_DIR, `${base}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');

    await sharp(Buffer.from(svg))
      .png({ quality: 92 })
      .toFile(pngPath);

    res.json({
      ok: true,
      type: 'image',
      template: payload.template,
      svgUrl: makeUrl(req, svgPath),
      pngUrl: makeUrl(req, pngPath),
      filename: `${base}.png`
    });
  } catch (err) {
    console.error('[generate-static-ad]', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

module.exports = router;
