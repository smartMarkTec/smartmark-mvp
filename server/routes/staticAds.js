/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (industry-agnostic → SVG → PNG)
 * Supports new payload:
 *   { template: "flyer_a" | "poster_b", inputs: {...}, knobs: {...} }
 * Also backward-compatible with legacy:
 *   { size, style, brand, headline, subline, cta, offer, bullets, disclaimers }
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const Ajv = require('ajv');
const sharp = require('sharp');

const ajv = new Ajv({ allErrors: true, removeAdditional: 'failing' });

/* ------------------------ Paths ------------------------ */
const GEN_DIR = process.env.GENERATED_DIR ||
  path.join(process.cwd(), 'server', 'public', 'generated');
fs.mkdirSync(GEN_DIR, { recursive: true });

function makeUrl(req, absPath) {
  const filename = path.basename(absPath);
  const base = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
  return `${base}/generated/${filename}`;
}

/* ------------------------ Schemas (relaxed) ------------------------ */
const schemaNew = {
  type: "object",
  required: ["template", "inputs"],
  properties: {
    template: { enum: ["flyer_a","poster_b"] },
    inputs: {
      type: "object",
      properties: {
        industry: { type: "string" },
        businessName: { type: "string" },
        website: { type: "string" },
        location: { type: "string" },
        offer: { type: "string" },
        mainBenefit: { type: "string" },
        idealCustomer: { type: "string" },
        phone: { type: "string" },
        headline: { type: "string" },
        subline: { type: "string" },
        cta: { type: "string" }
      },
      additionalProperties: true
    },
    knobs: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const schemaLegacy = {
  type: "object",
  properties: {
    size: { enum: ["1080x1080","1200x1500","1080x1920"] },
    style: { enum: ["promo","services"] },
    brand: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        phone: { type: "string" },
        website: { type: "string" },
        location: { type: "string" },
        primary: { type: "string" },
        accent: { type: "string" },
        bg: { type: "string" }
      },
      additionalProperties: true
    },
    industry: { type: "string" },
    headline: { type: "string" },
    subline: { type: "string" },
    cta: { type: "string" },
    offer: { type: "string" },
    bullets: { type: "array", items: { type: "string" } },
    disclaimers: { type: "string" }
  },
  additionalProperties: true
};

/* ------------------------ Helpers ------------------------ */
function clampStr(s, max) {
  const t = (s || "").toString();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

function layoutBullets(items) {
  const startY = 56, step = 54;
  return (items || []).slice(0, 6).map((t,i)=>({ y: startY + i*step, text: t }));
}

function parseSize(size = "1080x1080") {
  const m = String(size).match(/^(\d+)x(\d+)$/);
  if (!m) return { W:1080, H:1080 };
  return { W: parseInt(m[1],10), H: parseInt(m[2],10) };
}

function safePalette(knobs = {}, fallback = {}) {
  const p = knobs.palette || {};
  return {
    header: p.header || fallback.header || "#0d3b66",
    body: p.body || fallback.body || "#dff3f4",
    accent: p.accent || fallback.accent || "#ff8b4a",
    textOnDark: p.textOnDark || fallback.textOnDark || "#ffffff",
    textOnLight: p.textOnLight || fallback.textOnLight || "#2b3a44"
  };
}

/* ------------------------ Templates ------------------------ */
/** Legacy universal card (kept for backward compatibility) */
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

/** New: Flyer A (square flyer with top header, diagonal split, lists, CTA row) */
function tplFlyerA({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .hdr{font:900 40px/1 Inter,system-ui}
      .h1{font:900 72px/1.05 Inter,system-ui}
      .sub{font:800 34px/1.25 Inter,system-ui}
      .lbl{font:800 28px/1.2 Inter,system-ui}
      .li{font:700 30px/1.2 Inter,system-ui}
      .cta{font:900 34px/1 Inter,system-ui}
      .small{font:600 22px/1.2 Inter,system-ui}
    </style>
    <clipPath id="diag">
      <path d="M0 0 H${W} V${H*0.58} L0 ${H*0.72} Z"/>
    </clipPath>
  </defs>

  <!-- header area -->
  <rect width="${W}" height="${H}" fill="{{palette.body}}"/>
  <g clip-path="url(#diag)">
    <rect width="${W}" height="${H}" fill="{{palette.header}}"/>
  </g>

  <!-- header text -->
  <g transform="translate(56,70)">
    <text class="hdr" fill="{{palette.textOnDark}}">{{businessName}}</text>
    <text class="small" y="48" fill="{{palette.textOnDark}}">{{location}}</text>
  </g>

  <!-- main copy -->
  <g transform="translate(56,220)">
    <text class="h1" fill="{{palette.textOnDark}}">{{headline}}</text>
    <text class="sub" y="90" fill="{{palette.textOnDark}}" opacity=".9">{{subline}}</text>
  </g>

  <!-- left list -->
  <g transform="translate(56,420)">
    <text class="lbl" fill="{{palette.textOnLight}}">Options</text>
    {{#listLeft}}
      <g transform="translate(0, {{y}})">
        <circle cx="6" cy="10" r="6" fill="{{palette.accent}}"/>
        <text class="li" x="22" y="18" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/listLeft}}
  </g>

  <!-- right list -->
  <g transform="translate(${W/2+20},420)">
    <text class="lbl" fill="{{palette.textOnLight}}">Services</text>
    {{#listRight}}
      <g transform="translate(0, {{y}})">
        <circle cx="6" cy="10" r="6" fill="{{palette.accent}}"/>
        <text class="li" x="22" y="18" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/listRight}}
  </g>

  <!-- CTA bar -->
  <g transform="translate(56, ${H-140})">
    <rect width="${W-112}" height="84" rx="16" fill="{{palette.accent}}"/>
    <text class="cta" x="28" y="54" fill="#071018">{{cta}}</text>
    <text class="cta" x="${W-140}" y="54" text-anchor="end" fill="#071018">{{phone}}</text>
  </g>

  <!-- footer -->
  {{#coverage}}
  <g transform="translate(56, ${H-28})">
    <text class="small" fill="#5b6a75">{{coverage}}</text>
  </g>
  {{/coverage}}
</svg>`;
}

/** New: Poster B (lifestyle background + centered card + frame + event meta) */
function tplPosterB({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .brand{font:900 34px/1 Inter,system-ui}
      .h1{font:900 70px/1.08 Inter,system-ui}
      .sub{font:800 32px/1.25 Inter,system-ui}
      .meta{font:800 28px/1.2 Inter,system-ui}
      .cta{font:900 34px/1 Inter,system-ui}
      .fine{font:600 20px/1.2 Inter,system-ui}
    </style>
    <filter id="blur"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>

  <!-- soft bg gradient -->
  <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
    <stop offset="0%" stop-color="{{bgStart}}"/>
    <stop offset="100%" stop-color="{{bgEnd}}"/>
  </linearGradient>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <circle cx="${W*0.18}" cy="${H*0.22}" r="${W*0.22}" fill="{{accent}}" opacity=".14" filter="url(#blur)"/>
  <circle cx="${W*0.84}" cy="${H*0.30}" r="${W*0.28}" fill="{{primary}}" opacity=".12" filter="url(#blur)"/>

  <!-- frame -->
  {{#frame.outerWhite}}
  <rect x="26" y="26" width="${W-52}" height="${H-52}" rx="28" fill="none" stroke="#ffffff" opacity=".65" stroke-width="4"/>
  {{/frame.outerWhite}}

  <!-- centered card -->
  <g transform="translate(${(W*0.15).toFixed(0)}, ${(H*0.22).toFixed(0)})">
    <rect width="${(W*0.70).toFixed(0)}" height="${(H*0.56).toFixed(0)}" rx="28" fill="#ffffff" opacity=".92"/>
    {{#card.shadow}}
    <rect width="${(W*0.70).toFixed(0)}" height="${(H*0.56).toFixed(0)}" rx="28" fill="#000000" opacity=".08"/>
    {{/card.shadow}}

    <!-- text -->
    <g transform="translate(40,48)">
      <text class="brand" fill="#2a3a44">{{businessName}} • {{location}}</text>
      <text class="h1" y="98" fill="#0c1520">{{headline}}</text>
      <text class="sub" y="150" fill="#2f3d47" opacity=".9">{{subline}}</text>
      <text class="meta" y="205" fill="{{primary}}">{{eventTitle}} • {{dateRange}}</text>
      <text class="meta" y="245" fill="{{accent}}">SAVE {{saveAmount}} • {{financingLine}}</text>
      <text class="fine" y="288" fill="#6d7a84">{{qualifiers}}</text>
    </g>

    <!-- CTA row -->
    <g transform="translate(40, ${(H*0.56 - 40 - 66).toFixed(0)})">
      <rect width="${(W*0.70 - 80).toFixed(0)}" height="66" rx="16" fill="{{accent}}"/>
      <text class="cta" x="24" y="44" fill="#071018">{{cta}}</text>
      <text class="cta" x="${(W*0.70 - 104).toFixed(0)}" y="44" text-anchor="end" fill="#071018">{{phone}}</text>
    </g>

    <!-- legal -->
    {{#legal}}
    <g transform="translate(40, ${(H*0.56 - 14).toFixed(0)})">
      <text class="fine" x="${(W*0.70 - 80).toFixed(0)}" text-anchor="end" fill="#6b7785">{{legal}}</text>
    </g>
    {{/legal}}
  </g>
</svg>`;
}

/* ------------------------ Main route ------------------------ */
router.post('/generate-static-ad', async (req, res) => {
  try {
    const body = req.body || {};

    /* ---------- Normalize to new model ---------- */
    let isNewShape = false;
    const validateNew = ajv.compile(schemaNew);
    if (validateNew(body)) {
      isNewShape = true;
    } else {
      // try legacy
      const validateLegacy = ajv.compile(schemaLegacy);
      if (!validateLegacy(body)) {
        // We still proceed, but we’ll coerce into new shape with best-effort defaults
      }
    }

    // Defaults (work for any industry)
    const FALLBACKS = {
      industry: "Local Services",
      businessName: "Your Business",
      location: "Your City",
      website: "",
      offer: "",
      mainBenefit: "",
      idealCustomer: "",
      phone: "(000) 000-0000",
      headline: "Limited-Time Offer",
      subline: "Trusted local pros • Fast scheduling",
      cta: "Learn more"
    };

    let template = "flyer_a";
    let inputs = {};
    let knobs = {};

    if (isNewShape) {
      template = body.template || "flyer_a";
      inputs = { ...FALLBACKS, ...(body.inputs || {}) };
      knobs = body.knobs || {};
    } else {
      // Legacy → map to new
      const brand = body.brand || {};
      inputs = {
        industry: body.industry || FALLBACKS.industry,
        businessName: brand.businessName || FALLBACKS.businessName,
        location: brand.location || FALLBACKS.location,
        website: brand.website || FALLBACKS.website,
        offer: body.offer || FALLBACKS.offer,
        mainBenefit: body.mainBenefit || FALLBACKS.mainBenefit,
        idealCustomer: body.idealCustomer || FALLBACKS.idealCustomer,
        phone: brand.phone || FALLBACKS.phone,
        headline: body.headline || FALLBACKS.headline,
        subline: body.subline || FALLBACKS.subline,
        cta: body.cta || FALLBACKS.cta
      };
      // palette fallback from brand
      knobs = {
        size: body.size || "1080x1080",
        palette: {
          header: (brand.primary || "#0d3b66"),
          body: "#dff3f4",
          accent: (brand.accent || "#ff8b4a"),
          textOnDark: "#ffffff",
          textOnLight: "#2b3a44"
        },
        frame: { outerWhite: true, softShadow: true },
        card: { shadow: true },
        eventTitle: body.eventTitle || `${(inputs.industry || "LOCAL").toUpperCase()} EVENT`,
        dateRange: body.dateRange || "LIMITED TIME ONLY",
        saveAmount: body.saveAmount || "up to $1000",
        financingLine: body.financingLine || "PLUS SPECIAL FINANCING*",
        qualifiers: body.qualifiers || `On select ${inputs.industry} products and services`,
        legal: body.disclaimers || body.legal || ""
      };
      template = "flyer_a";
    }

    // Clamp a few fields for safety
    inputs.businessName = clampStr(inputs.businessName, 48);
    inputs.headline = clampStr(inputs.headline, 60);
    inputs.subline = clampStr(inputs.subline, 160);
    inputs.cta = clampStr(inputs.cta, 28);
    inputs.phone = clampStr(inputs.phone, 28);

    const size = (knobs.size || "1080x1080");
    const { W, H } = parseSize(size);

    // Build render context shared by templates
    const palette = safePalette(knobs, {
      header: "#0d3b66",
      body: "#dff3f4",
      accent: "#ff8b4a",
      textOnDark: "#ffffff",
      textOnLight: "#2b3a44"
    });

    const frame = knobs.frame || { outerWhite: true, softShadow: true };
    const card  = knobs.card  || { widthPct: 70, heightPct: 55, shadow: true };

    const contextBase = {
      W, H,
      palette,
      primary: palette.header,
      accent: palette.accent,
      bgStart: "#0a1922",
      bgEnd: "#0e2230",
      businessName: inputs.businessName || "Your Business",
      location: inputs.location || "Your City",
      headline: inputs.headline || "Limited-Time Offer",
      subline: inputs.subline || "",
      cta: inputs.cta || "Learn more",
      phone: inputs.phone || "(000) 000-0000",
      // Poster meta:
      eventTitle: knobs.eventTitle || `${(inputs.industry || "Local").toUpperCase()} EVENT`,
      dateRange: knobs.dateRange || "LIMITED TIME ONLY",
      saveAmount: knobs.saveAmount || "up to $1000",
      financingLine: knobs.financingLine || "PLUS SPECIAL FINANCING*",
      qualifiers: knobs.qualifiers || `On select ${(inputs.industry || "Local Services")} products and services`,
      legal: knobs.legal || "",
      frame,
      card
    };

    // Flyer lists
    const listLeft = layoutBullets(
      (knobs.lists && knobs.lists.left) ||
      inputs.frequencyList || ["One Time", "Weekly", "Bi-Weekly", "Monthly"]
    );
    const listRight = layoutBullets(
      (knobs.lists && knobs.lists.right) ||
      inputs.servicesList || ["Kitchen", "Bathrooms", "Offices", "Dusting", "Mopping", "Vacuuming"]
    );
    const coverage = knobs.coverage || inputs.coverage || "Coverage area ~25 miles around your city";

    // Legacy bullets (for universal template fallback)
    const legacyBullets = layoutBullets(
      Array.isArray(body?.bullets) && body.bullets.length
        ? body.bullets
        : ["Quality Service", "Fast Response", "Great Prices", "Locally Owned"]
    );

    /* ---------- Render SVG ---------- */
    let svgTpl;
    let vars;

    if (template === "flyer_a") {
      svgTpl = tplFlyerA({ W, H });
      vars = { ...contextBase, listLeft, listRight, coverage };
    } else if (template === "poster_b") {
      svgTpl = tplPosterB({ W, H });
      vars = { ...contextBase };
    } else {
      // Fallback to legacy universal card
      svgTpl = tplUniversal1080({ W, H });
      vars = {
        brand: {
          businessName: contextBase.businessName,
          location: contextBase.location,
          phone: contextBase.phone,
          primary: palette.header,
          accent: palette.accent,
          bg: "#0a1922"
        },
        headline: contextBase.headline,
        subline: contextBase.subline,
        cta: contextBase.cta,
        offer: inputs.offer || "",
        bullets: legacyBullets,
        disclaimers: contextBase.legal
      };
    }

    const svg = mustache.render(svgTpl, vars);

    // Persist
    const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const svgPath = path.join(GEN_DIR, `${base}.svg`);
    const pngPath = path.join(GEN_DIR, `${base}.png`);
    fs.writeFileSync(svgPath, svg, 'utf8');

    await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(pngPath);

    res.json({
      ok: true,
      type: 'image',
      size,
      meta: { template, inputs, knobs },
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
