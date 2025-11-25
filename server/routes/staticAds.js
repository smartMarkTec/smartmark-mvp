/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (industry-agnostic → SVG → PNG)
 * - No stock fetches. Universal layout.
 * - Writes to GENERATED_DIR and serves via /generated.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const Ajv = require('ajv');
const sharp = require('sharp');

const ajv = new Ajv({ allErrors: true });

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
  required: ["size","brand","headline","subline","cta","bullets"],
  properties: {
    size: { enum: ["1080x1080","1200x1500","1080x1920"] },
    style: { enum: ["promo","services"] },
    brand: {
      type: "object",
      required: ["businessName","phone","location","primary","accent","bg"],
      properties: {
        businessName: { type: "string", maxLength: 48 },
        phone: { type: "string", maxLength: 24 },
        website: { type: "string", maxLength: 80 },
        location: { type: "string", maxLength: 48 },
        primary: { type: "string" },
        accent: { type: "string" },
        bg: { type: "string" }
      }
    },
    industry: { type: "string", maxLength: 40 },
    headline: { type: "string", maxLength: 48 },
    subline: { type: "string", maxLength: 140 },
    cta: { type: "string", maxLength: 28 },
    offer: { type: "string", maxLength: 36 },
    bullets: { type: "array", minItems: 3, maxItems: 6, items: { type: "string", maxLength: 30 } },
    disclaimers: { type: "string", maxLength: 160 }
  }
};

/* ------------------------ Template ------------------------ */
function tplUniversal1080({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="18"/></filter>
    <style>
      .h0{font:900 64px/1 Inter,system-ui}
      .h1{font:900 86px/1 Inter,system-ui}
      .h2{font:800 44px/1.1 Inter,system-ui}
      .b1{font:700 34px/1.2 Inter,system-ui}
      .meta{font:600 26px/1.2 Inter,system-ui}
      .chip{font:900 34px/1 Inter,system-ui}
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="{{brand.bg}}"/>
  <circle cx="160" cy="140" r="120" fill="{{brand.accent}}" opacity=".18" filter="url(#soft)"/>
  <circle cx="${W-160}" cy="260" r="170" fill="{{brand.primary}}" opacity=".14" filter="url(#soft)"/>

  <!-- Card -->
  <g transform="translate(80,120)">
    <rect width="${W-160}" height="${H-240}" rx="30" fill="#ffffff" opacity=".06"/>
    <rect width="${W-160}" height="${H-240}" rx="30" fill="#0b1720" opacity=".18"/>

    <!-- Header -->
    <g transform="translate(30,40)">
      <text class="h0" fill="#d7e9ff">{{brand.businessName}} • {{brand.location}}</text>
      <text class="h1" y="110" fill="#fff">{{headline}}</text>
      <text class="b1" y="170" fill="#eaf6ff">{{subline}}</text>
    </g>

    <!-- Body -->
    <g transform="translate(30,260)">
      {{#offer}}<text class="h2" fill="{{brand.accent}}">{{offer}}</text>{{/offer}}
      {{#bullets}}
        <g transform="translate(0, {{y}})">
          <circle cx="0" cy="10" r="10" fill="{{brand.accent}}"/>
          <text class="b1" x="24" y="18" fill="#eaf6ff">{{text}}</text>
        </g>
      {{/bullets}}
    </g>
  </g>

  <!-- CTA bar -->
  <g transform="translate(80, ${H-170})">
    <rect width="${W-160}" height="92" rx="18" fill="{{brand.accent}}"/>
    <text class="chip" x="28" y="60" fill="#071018">{{cta}}</text>
    <text class="chip" x="${W-80-28}" y="60" text-anchor="end" fill="#071018">{{brand.phone}}</text>
  </g>

  {{#disclaimers}}
  <g transform="translate(80, ${H-26})">
    <text class="meta" x="${W-200}" text-anchor="end" fill="#9ab6cc" font-size="18">{{disclaimers}}</text>
  </g>
  {{/disclaimers}}
</svg>`;
}

/* ------------------------ Helpers ------------------------ */
function layoutBullets(items) {
  const startY = 56, step = 54;
  return items.slice(0,6).map((t,i)=>({ y: startY + i*step, text: t }));
}

/* ------------------------ Route ------------------------ */
router.post('/generate-static-ad', async (req, res) => {
  try {
    const {
      industry = "",
      size = "1080x1080",
      style,
      brand = {},
      headline,
      subline,
      cta = "CALL NOW!",
      offer = "",
      bullets = [],
      disclaimers = ""
    } = req.body || {};

    const fallbackIndustry = (industry || "Local").trim();
    const payload = {
      size,
      style,
      brand: {
        businessName: brand.businessName || 'Your Business',
        phone: brand.phone || '(000) 000-0000',
        location: brand.location || 'Your City',
        website: brand.website || '',
        primary: brand.primary || '#0d3b66',
        accent: brand.accent || '#ffc857',
        bg: brand.bg || '#0a1922'
      },
      industry: fallbackIndustry,
      headline: headline || `${fallbackIndustry.toUpperCase()} SERVICES`,
      subline: subline || `Trusted ${fallbackIndustry.toLowerCase()} pros • Fast scheduling`,
      cta,
      offer,
      bullets: (bullets && bullets.length ? bullets : [
        "Quality Service", "Fast Response", "Great Prices", "Locally Owned"
      ]),
      disclaimers
    };

    const validate = ajv.compile(schema);
    if (!validate(payload)) {
      throw new Error('validation failed: ' + JSON.stringify(validate.errors));
    }

    const bl = layoutBullets(payload.bullets);
    const vars = { ...payload, bullets: bl };

    const svgTpl = tplUniversal1080({ W:1080, H:1080 });
    const svg = mustache.render(svgTpl, vars);

    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const svgPath = path.join(GEN_DIR, `${base}.svg`);
    const pngPath = path.join(GEN_DIR, `${base}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');

    await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(pngPath);

    res.json({
      ok: true,
      type: 'image',
      size: payload.size,
      meta: payload,
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
