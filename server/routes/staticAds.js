/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (templates → SVG → PNG)
 * - Works for ANY industry string.
 * - Two universal layouts: "promo" (SALE style) and "services" (checklist style).
 * - Chooses a layout by keywords, or you can pass "style":"promo|services".
 * - Writes to GENERATED_DIR and serves at /generated.
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const Ajv = require('ajv');
const sharp = require('sharp');

const ajv = new Ajv({ allErrors: true });

/* ------------------------ Paths ------------------------ */
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
  required: ["size","brand","headline","cta"],
  properties: {
    // any string allowed; we only use it for heuristics
    industry: { type: "string", maxLength: 40 },
    // support more later; we render to 1080x1080 now
    size: { enum: ["1080x1080"] },
    style: { enum: ["promo","services"] }, // optional
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
    headline: { type: "string", maxLength: 48 },
    subline: { type: "string", maxLength: 120 },
    cta: { type: "string", maxLength: 28 },
    offer: { type: "string", maxLength: 36 },
    bullets: { type: "array", minItems: 0, maxItems: 6, items: { type: "string", maxLength: 32 } },
    disclaimers: { type: "string", maxLength: 140 }
  }
};

/* ------------------------ Layout Templates (SVG) ------------------------ */
/** SERVICES (checklist) — universal */
function tplServices1080({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="20"/></filter>
    <style>
      .h1{font:900 92px/1 Inter,system-ui}
      .h2{font:800 48px/1.1 Inter,system-ui}
      .b1{font:700 34px/1.25 Inter,system-ui}
      .meta{font:600 28px/1.2 Inter,system-ui}
      .chip{font:900 36px/1 Inter,system-ui}
    </style>
  </defs>

  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="{{brand.primary}}"/><stop offset="100%" stop-color="{{brand.bg}}"/>
  </linearGradient>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect x="36" y="36" width="${W-72}" height="${H-72}" rx="28" fill="#fff" opacity=".06" filter="url(#soft)"/>

  <g transform="translate(64,116)">
    <text class="h1" fill="#fff">{{headline}}</text>
    <text class="meta" y="112" fill="#d7e9ff">{{brand.businessName}} • {{brand.location}}</text>
  </g>

  <g transform="translate(64,250)">
    <g>
      <text class="h2" fill="#fff">{{servicesLabel}}</text>
      {{#bullets}}
        <g transform="translate(0, {{y}})">
          <circle cx="0" cy="10" r="10" fill="{{brand.accent}}"/>
          <text class="b1" x="24" y="18" fill="#eaf6ff">{{text}}</text>
        </g>
      {{/bullets}}
    </g>

    <g transform="translate(${Math.round(W*0.48)}, 0)">
      <text class="h2" fill="#fff">{{offeredLabel}}</text>
      <text class="b1" y="60" fill="#eaf6ff">{{subline}}</text>
      {{#offer}}<text class="h2" y="120" fill="{{brand.accent}}">{{offer}}</text>{{/offer}}
    </g>
  </g>

  <g transform="translate(64,${H-180})">
    <rect width="${W-128}" height="98" rx="20" fill="#fff"/>
    <text class="chip" x="28" y="62" fill="{{brand.primary}}">{{cta}}</text>
    <text class="chip" x="${W-64-28}" y="62" text-anchor="end" fill="{{brand.primary}}">{{brand.phone}}</text>
  </g>
</svg>`;
}

/** PROMO (sale card) — universal */
function tplPromo1080({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="8"/><feMerge>
        <feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <style>
      .h1{font:900 88px/1 Inter,system-ui}
      .h2{font:800 48px/1.1 Inter,system-ui}
      .b1{font:700 34px/1.2 Inter,system-ui}
      .meta{font:600 26px/1.2 Inter,system-ui}
      .chip{font:900 36px/1 Inter,system-ui}
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="{{brand.bg}}"/>

  <g transform="translate(80,110)">
    <rect width="${W-160}" height="380" rx="26" fill="#fff" filter="url(#cardShadow)"/>
    <text x="${(W-160)/2}" y="120" text-anchor="middle" class="h1" fill="{{brand.accent}}">{{headline}}</text>
    <text x="${(W-160)/2}" y="190" text-anchor="middle" class="meta" fill="#333">{{brand.businessName}} • {{brand.location}}</text>
    <text x="${(W-160)/2}" y="250" text-anchor="middle" class="meta" fill="#333">{{subline}}</text>
  </g>

  {{#bigSave}}
  <g transform="translate(100,620)">
    <text class="h1" fill="#fff">{{saveLabel}}</text>
    <text class="h1" x="360" fill="#fff">{{saveValue}}</text>
  </g>
  {{/bigSave}}

  <g transform="translate(100,740)">
    {{#bullets}}
      <g transform="translate(0, {{y}})">
        <circle cx="0" cy="10" r="10" fill="{{brand.accent}}"/>
        <text class="b1" x="24" y="18" fill="#eaf6ff">{{text}}</text>
      </g>
    {{/bullets}}
  </g>

  <g transform="translate(100, ${H-170})">
    <rect width="${W-200}" height="98" rx="20" fill="{{brand.accent}}"/>
    <text class="chip" x="28" y="62" fill="#071018">{{cta}}</text>
    <text class="chip" x="${W-100-28}" y="62" text-anchor="end" fill="#071018">{{brand.phone}}</text>
  </g>

  {{#disclaimers}}
  <text x="${W/2}" y="${H-28}" text-anchor="middle" class="meta" fill="#fff" opacity=".85">{{disclaimers}}</text>
  {{/disclaimers}}
</svg>`;
}

/* ------------------------ Helpers ------------------------ */
function layoutBullets(items) {
  const startY = 60, step = 56;
  return items.slice(0,6).map((t,i)=>({ y: startY + i*step, text: t }));
}

function defaultBullets(industry) {
  const s = (industry || '').toLowerCase();
  if (/(clean|maid|janit)/.test(s)) return ["One Time","Weekly","Bi-Weekly","Monthly"];
  if (/(floor|carpet|tile|hardwood)/.test(s)) return ["Hardwood","Vinyl","Carpet","Installers Available"];
  if (/(dent|clinic|health|med)/.test(s)) return ["New Patients Welcome","Insurance Accepted","Same-Day Appointments"];
  if (/(auto|car|mechanic|tire)/.test(s)) return ["Diagnostics","Repairs","Maintenance","Free Estimates"];
  return ["Quality Service","Fast Response","Great Prices","Locally Owned"];
}

function inferStyle(industry) {
  const s = (industry || '').toLowerCase();
  if (/(sale|promo|deal|floor|carpet|retail|store|clearance)/.test(s)) return 'promo';
  return 'services';
}

function chooseTemplate(style) {
  if (style === 'promo') return tplPromo1080({ W:1080, H:1080 });
  return tplServices1080({ W:1080, H:1080 });
}

function coerceSaveParts(offer) {
  // crude extraction like "Save $1000" or "Save up to $500"
  if (!offer) return null;
  const m = String(offer).match(/save(?:\s+up\s+to)?\s+(\$?[0-9,]+)/i);
  if (!m) return null;
  return { saveLabel: 'SAVE', saveValue: m[1].toUpperCase() };
}

/* ------------------------ Route ------------------------ */
router.post('/generate-static-ad', async (req, res) => {
  try {
    const {
      industry = '',
      size = '1080x1080',
      style, // optional
      brand = {},
      headline,
      subline,
      cta = 'CALL NOW!',
      offer = '',
      bullets,
      disclaimers = ''
    } = req.body || {};

    // Fill + validate
    const payload = {
      industry, size, style,
      brand: {
        businessName: brand.businessName || 'Your Business',
        phone: brand.phone || '(000) 000-0000',
        location: brand.location || 'Your City',
        website: brand.website || '',
        primary: brand.primary || '#0d3b66',
        accent: brand.accent || '#ffc857',
        bg: brand.bg || '#0a1922'
      },
      headline: headline || (industry ? `${industry.toUpperCase()} SERVICES` : 'LOCAL SERVICES'),
      subline: subline || (industry ? `Trusted ${industry} pros • Fast scheduling` : 'Fast, friendly, local'),
      cta,
      offer,
      bullets: (Array.isArray(bullets) && bullets.length ? bullets : defaultBullets(industry)),
      disclaimers
    };

    const validate = ajv.compile(schema);
    if (!validate(payload)) {
      throw new Error('validation failed: ' + JSON.stringify(validate.errors));
    }

    // Vars for template
    const bl = layoutBullets(payload.bullets);
    const saveParts = coerceSaveParts(payload.offer);
    const pickedStyle = payload.style || inferStyle(payload.industry);

    const vars = {
      ...payload,
      bullets: bl,
      servicesLabel: 'Services',
      offeredLabel: 'Details',
      bigSave: !!saveParts,
      saveLabel: saveParts?.saveLabel,
      saveValue: saveParts?.saveValue
    };

    // Render SVG → PNG
    const svgTpl = chooseTemplate(pickedStyle);
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
      style: pickedStyle,
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
