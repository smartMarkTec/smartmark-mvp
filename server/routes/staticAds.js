/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (industry-aware → SVG/PNG)
 * - flyer_a (services) : SVG → PNG (as before)
 * - poster_b (retail)  : background photo baked via Sharp → card SVG composited on top
 * - Optional knobs.backgroundUrl to force a specific bg image
 * - If no backgroundUrl is given, falls back to /__fallback/1200.jpg on this server
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const mustache = require('mustache');
const Ajv = require('ajv');
const sharp = require('sharp');
const http = require('http');
const https = require('https');

const ajv = new Ajv({ allErrors: true });

/* ------------------------ Paths / URLs ------------------------ */
const GEN_DIR =
  process.env.GENERATED_DIR ||
  path.join(process.cwd(), 'server', 'public', 'generated');
fs.mkdirSync(GEN_DIR, { recursive: true });

function makeMediaUrl(req, filename) {
  const base = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
  // We expose /generated also via /api/media; return the latter for frontend helpers.
  return `${base}/api/media/${filename}`;
}

function selfUrl(req, p = '') {
  const base = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

/* ------------------------ Industry Profiles ------------------------ */

function classifyIndustry(s = "") {
  const t = String(s).toLowerCase();
  const has = (rx) => rx.test(t);
  if (has(/clean|maid|janitor|housekeep/)) return 'home_cleaning';
  if (has(/floor|carpet|tile|vinyl|hardwood/)) return 'flooring';
  if (has(/restaurant|food|pizza|burger|cafe|bar|grill|taqueria|eat|diner/)) return 'restaurant';
  if (has(/gym|fitness|trainer|yoga|crossfit|pilates/)) return 'fitness';
  if (has(/salon|spa|barber|nail|lash|beauty/)) return 'salon_spa';
  if (has(/real\s?estate|realtor|broker|homes?|listings?/)) return 'real_estate';
  if (has(/auto|mechanic|tire|oil|detailing|car wash/)) return 'auto';
  if (has(/landscap|lawn|tree|garden|yard/)) return 'landscaping';
  if (has(/plumb|hvac|heating|cooling|air|electric/)) return 'hvac_plumbing';
  if (has(/fashion|apparel|clothing|boutique|shoe|jewel/)) return 'fashion';
  if (has(/electronics?|gadgets?|tech/)) return 'electronics';
  if (has(/pet|groom|vet|animal/)) return 'pets';
  if (has(/coffee|bakery|dessert|boba|tea/)) return 'coffee';
  return 'generic';
}

function profileForIndustry(industry = "") {
  const kind = classifyIndustry(industry);

  const PALETTES = {
    base:   { header: '#0d3b66', body: '#dff3f4', accent: '#ff8b4a', textOnDark: '#ffffff', textOnLight: '#2b3a44' },
    teal:   { header: '#0b5563', body: '#e7f6f2', accent: '#16a085', textOnDark: '#ffffff', textOnLight: '#23343d' },
    navy:   { header: '#113a5d', body: '#e8f0f6', accent: '#ff7b41', textOnDark: '#ffffff', textOnLight: '#213547' },
    wine:   { header: '#3a2740', body: '#f2ecf7', accent: '#e76f51', textOnDark: '#ffffff', textOnLight: '#2d283a' },
    forest: { header: '#1d3b2a', body: '#e9f5ee', accent: '#f4a261', textOnDark: '#ffffff', textOnLight: '#273b33' },
    slate:  { header: '#213043', body: '#eaf2fb', accent: '#f59e0b', textOnDark: '#ffffff', textOnLight: '#182435' }
  };

  // Default bullets for services
  const serviceLists = {
    left:  ["One Time","Weekly","Bi-Weekly","Monthly"],
    right: ["Kitchen","Bathrooms","Offices","Dusting","Mopping","Vacuuming"]
  };
  const hvacLists = {
    left:  ["Install","Repair","Tune-Up","Maintenance"],
    right: ["AC Units","Furnaces","Ductwork","Thermostats","Heat Pumps","Filters"]
  };
  const plumbingLists = {
    left:  ["Leaks","Clogs","Installs","Repairs"],
    right: ["Water Heaters","Toilets","Sinks","Showers","Garbage Disposal","Piping"]
  };
  const landscapingLists = {
    left:  ["Mowing","Edging","Trimming","Cleanup"],
    right: ["Mulch","Hedges","Tree Care","Fertilize","Weed Control","Irrigation"]
  };
  const autoLists = {
    left:  ["Oil Change","Brakes","Tires","Alignment"],
    right: ["Diagnostics","AC Service","Batteries","Inspections"]
  };

  const MAP = {
    home_cleaning: {
      template: 'flyer_a',
      headline: 'HOME CLEANING SERVICES',
      subline: 'Apartment • Home • Office',
      cta: 'CALL NOW!',
      palette: PALETTES.navy,
      lists: serviceLists,
      coverage: 'Coverage area 25 Miles around your city',
      bgHint: 'home cleaning'
    },
    flooring: {
      template: 'poster_b',
      eventTitle: 'FALL FLOORING EVENT',
      dateRange: 'LIMITED TIME ONLY',
      saveAmount: 'up to $1000',
      financingLine: 'PLUS SPECIAL FINANCING*',
      qualifiers: 'On select flooring products and services',
      legal: '*With approved credit. Ask for details.',
      palette: PALETTES.forest,
      bgHint: 'flooring'
    },
    restaurant: {
      template: 'poster_b',
      eventTitle: 'TASTE THE NEW SPECIALS',
      dateRange: 'THIS WEEK ONLY',
      saveAmount: '2 for $20',
      financingLine: 'ORDER ONLINE • PICKUP',
      qualifiers: 'Fresh & local ingredients',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'restaurant'
    },
    salon_spa: {
      template: 'poster_b',
      eventTitle: 'SELF-CARE EVENT',
      dateRange: 'LIMITED TIME • 15% OFF',
      saveAmount: 'glow packages',
      financingLine: 'BOOK TODAY',
      qualifiers: 'Hair • Nails • Lashes • Skin',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'salon spa'
    },
    fitness: {
      template: 'poster_b',
      eventTitle: 'JOIN & SAVE',
      dateRange: 'MEMBERSHIP DEALS THIS MONTH',
      saveAmount: 'NO ENROLLMENT',
      financingLine: 'FIRST WEEK FREE',
      qualifiers: 'Classes • Coaching • 24/7 Access',
      legal: '',
      palette: PALETTES.slate,
      bgHint: 'gym fitness'
    },
    real_estate: {
      template: 'poster_b',
      eventTitle: 'OPEN HOUSE',
      dateRange: 'SAT–SUN • 12–4PM',
      saveAmount: 'NEW LISTING',
      financingLine: 'ASK ABOUT FINANCING',
      qualifiers: '3 Bed • 2 Bath • 2,100 sq ft',
      legal: '',
      palette: PALETTES.teal,
      bgHint: 'real estate'
    },
    auto: {
      template: 'flyer_a',
      headline: 'AUTO REPAIR & SERVICE',
      subline: 'Reliable • Fast • Affordable',
      cta: 'CALL NOW!',
      palette: PALETTES.slate,
      lists: autoLists,
      coverage: 'Same-day appointments available',
      bgHint: 'auto repair'
    },
    landscaping: {
      template: 'flyer_a',
      headline: 'LANDSCAPING & LAWN CARE',
      subline: 'Clean-ups • Maintenance • Installs',
      cta: 'GET A QUOTE',
      palette: PALETTES.forest,
      lists: landscapingLists,
      coverage: 'Serving your area',
      bgHint: 'landscaping'
    },
    hvac_plumbing: {
      template: 'flyer_a',
      headline: 'HVAC & PLUMBING',
      subline: 'Install • Repair • Maintenance',
      cta: 'SCHEDULE NOW',
      palette: PALETTES.teal,
      lists: hvacLists, // plumbingLists swapped below if "plumb"
      coverage: 'Emergency service available',
      bgHint: 'hvac plumbing'
    },
    fashion: {
      template: 'poster_b',
      eventTitle: 'NEW ARRIVALS',
      dateRange: 'SEASONAL DROP',
      saveAmount: 'FREE SHIPPING',
      financingLine: 'EASY RETURNS',
      qualifiers: 'Mens • Womens • Accessories',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'fashion'
    },
    electronics: {
      template: 'poster_b',
      eventTitle: 'TECH DEALS',
      dateRange: 'LIMITED TIME SAVINGS',
      saveAmount: 'UP TO 40% OFF',
      financingLine: '0% APR PROMO*',
      qualifiers: 'Laptops • Tablets • Headphones',
      legal: '*OAC. Limited time.',
      palette: PALETTES.slate,
      bgHint: 'electronics'
    },
    pets: {
      template: 'poster_b',
      eventTitle: 'PET CARE & TREATS',
      dateRange: 'THIS WEEK ONLY',
      saveAmount: 'BUY 2 GET 1',
      financingLine: 'GROOMING • VET • SUPPLIES',
      qualifiers: 'Everything for happy pets',
      legal: '',
      palette: PALETTES.forest,
      bgHint: 'pets'
    },
    coffee: {
      template: 'poster_b',
      eventTitle: 'FRESH ROASTS DAILY',
      dateRange: 'TRY NEW SEASONALS',
      saveAmount: '2 FOR $5',
      financingLine: 'ORDER AHEAD',
      qualifiers: 'Espresso • Cold Brew • Tea',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'coffee'
    },
    generic: {
      template: 'flyer_a',
      headline: 'LOCAL SERVICES',
      subline: 'Reliable • Friendly • On Time',
      cta: 'CONTACT US',
      palette: PALETTES.base,
      lists: {
        left:  ["Free Quote","Same-Day","Licensed","Insured"],
        right: ["Great Reviews","Family Owned","Fair Prices","Guaranteed"]
      },
      coverage: 'Serving your area',
      bgHint: 'generic'
    }
  };

  let prof = MAP[kind];
  if (kind === 'hvac_plumbing' && /plumb/i.test(industry)) {
    prof = { ...prof, lists: plumbingLists };
  }
  return { kind, ...prof };
}

/* ------------------------ Templates ------------------------ */

// Flyer A (services) — header bar + diagonal split + two columns + CTA bar
function tplFlyerA({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="28"/></filter>
    <style>
      .h0{font:900 110px/1 Inter,system-ui}
      .h1{font:900 64px/1 Inter,system-ui}
      .h2{font:800 44px/1 Inter,system-ui}
      .b1{font:700 34px/1.28 Inter,system-ui}
      .chip{font:900 44px/1 Inter,system-ui;letter-spacing:.5px}
      .meta{font:600 26px/1.2 Inter,system-ui}
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="{{palette.body}}"/>
  <rect width="${W}" height="220" fill="{{palette.header}}"/>

  <!-- Header text -->
  <g transform="translate(60, 85)">
    <text class="h0" fill="#ffffff">{{headline}}</text>
  </g>

  <!-- subtle diagonal and soft blob -->
  <path d="M0,220 L${W},160 L${W},${H} L0,${H} Z" fill="#ffffff" opacity=".16"/>
  <circle cx="${W/2}" cy="${H/2+20}" r="120" fill="{{palette.accent}}" opacity=".15" filter="url(#soft)"/>

  <!-- Columns -->
  <g transform="translate(80, 440)">
    <text class="h1" fill="{{palette.header}}">FREQUENCY</text>
    {{#lists.left}}
      <g transform="translate(0, {{y}})">
        <circle cx="14" cy="10" r="10" fill="{{accentLeft}}"/>
        <text class="b1" x="34" y="20" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/lists.left}}
  </g>

  <g transform="translate(${W-520}, 440)">
    <text class="h1" fill="{{palette.header}}">SERVICES</text>
    {{#lists.right}}
      <g transform="translate(0, {{y}})">
        <circle cx="14" cy="10" r="10" fill="{{accentRight}}"/>
        <text class="b1" x="34" y="20" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/lists.right}}
  </g>

  <!-- Subline under header -->
  <g transform="translate(80, 350)">
    <text class="b1" fill="#113a5d" opacity=".65">{{subline}}</text>
  </g>

  <!-- Coverage -->
  {{#coverage}}
  <g transform="translate(80, ${H-210})">
    <text class="meta" fill="#2b3a44" opacity=".7">📍 {{coverage}}</text>
  </g>
  {{/coverage}}

  <!-- CTA bar -->
  <g transform="translate(80, ${H-160})">
    <rect width="${W-160}" height="96" rx="22" fill="{{palette.accent}}"/>
    <text class="chip" x="${(W-160)/2}" y="62" text-anchor="middle" fill="#0b1115">{{cta}} {{phone}}</text>
  </g>
</svg>`;
}

/* Poster B — card only (transparent). The photographic background is built with Sharp. */
function tplPosterBCard({ cardW = 760, cardH = 520, padX = 48, padY = 56 }) {
  return `
<svg viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="20" stdDeviation="20" flood-color="#000" flood-opacity="0.28"/>
    </filter>
    <style>
      .t-h0{font:900 78px/1.05 Inter,system-ui; letter-spacing:-1px}
      .t-h1{font:900 60px/1.05 Inter,system-ui}
      .t-h2{font:800 38px/1.2  Inter,system-ui}
      .t-b1{font:700 28px/1.25 Inter,system-ui}
      .t-meta{font:700 22px/1.2  Inter,system-ui}
    </style>
  </defs>

  <!-- Card -->
  <g filter="url(#cardShadow)">
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="28" fill="#ffffff"/>
  </g>

  <!-- Content -->
  <g transform="translate(${padX}, ${padY})">
    <!-- Brand pill (top right) -->
    <g transform="translate(${cardW - padX - 170}, -12)">
      <rect width="170" height="42" rx="21" fill="#0f1a22" opacity="0.08"/>
      <text class="t-b1" x="85" y="30" text-anchor="middle" fill="#334554">{{brandName}}</text>
    </g>

    <text class="t-h0" x="0" y="0" dy="0.95em" fill="#0f1a22">{{eventTitle}}</text>
    <text class="t-h2" x="0" y="82" dy="1.2em" fill="#334554">{{dateRange}}</text>
    <text class="t-h1" x="0" y="162" dy="1.25em" fill="{{accent}}">{{saveAmount}}</text>
    <text class="t-h2" x="0" y="260" dy="1.1em" fill="#334554">{{financingLine}}</text>
    <text class="t-b1" x="0" y="318" dy="1.2em" fill="#66798a">{{qualifiers}}</text>
  </g>

  {{#legal}}
  <g transform="translate(0, ${cardH - 18})">
    <text class="t-meta" x="0" y="-6" fill="#9eb2c3">{{legal}}</text>
  </g>
  {{/legal}}
</svg>`;
}

/* ------------------------ Helpers ------------------------ */

function layoutList(items) {
  const startY = 56, step = 54;
  return (items || []).slice(0, 6).map((t, i) => ({ y: startY + i * step, text: t }));
}
function withListLayout(lists = {}) {
  return {
    left: layoutList(lists.left || []),
    right: layoutList(lists.right || [])
  };
}

/* tiny fetch to buffer (no extra deps) */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      lib
        .get(url, { timeout: 12000 }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            // follow one redirect
            return fetchBuffer(res.headers.location).then(resolve).catch(reject);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP ${res.statusCode}`));
          }
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        })
        .on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

/* Build photographic background: (1) optional fetched image → cover → blur → darken vignette
   Returns a 1080x1080 PNG Buffer. */
async function buildPosterBackground({ width = 1080, height = 1080, bgUrl = "", accent = "#ff7b41" }) {
  // Base dark canvas
  let base = sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 18, b: 24 } }
  }).png();

  let layers = [];

  if (bgUrl) {
    try {
      const buf = await fetchBuffer(bgUrl);
      // Cover-fit the background, then blur a bit
      const photo = await sharp(buf)
        .resize(width, height, { fit: 'cover', position: 'center' })
        .modulate({ saturation: 0.8, brightness: 1.0 })
        .blur(8)
        .png()
        .toBuffer();
      layers.push({ input: photo, gravity: 'centre', blend: 'over' });
    } catch {
      // ignore; we'll just keep the dark canvas + vignette
    }
  }

  // Add subtle vignette and soft blobs to hint brand colors
  const vignetteSvg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="v" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stop-color="#0d131a" stop-opacity="0.0"/>
          <stop offset="70%" stop-color="#0d131a" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="#0d131a" stop-opacity="0.75"/>
        </radialGradient>
        <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <rect width="100%" height="100%" fill="url(#v)"/>
      <circle cx="${width*0.2}" cy="${height*0.25}" r="120" fill="${accent}" opacity="0.14" filter="url(#soft)"/>
      <circle cx="${width*0.85}" cy="${height*0.80}" r="140" fill="#1a2936" opacity="0.18" filter="url(#soft)"/>
      <!-- inner framed stage -->
      <rect x="42" y="42" width="${width-84}" height="${height-84}" rx="40" fill="#fff" opacity="0.04"/>
    </svg>
  `);
  layers.push({ input: vignetteSvg, blend: 'over' });

  return await base.composite(layers).png().toBuffer();
}

/* ------------------------ Validation Schemas ------------------------ */

const flyerSchema = {
  type: "object",
  required: ["inputs","knobs"],
  properties: {
    template: { enum: ["flyer_a","poster_b","auto"] },
    inputs: {
      type: "object",
      required: ["industry","businessName","phone","location","headline","subline","cta"],
      properties: {
        industry: { type: "string", maxLength: 60 },
        businessName: { type: "string", maxLength: 60 },
        phone: { type: "string", maxLength: 32 },
        website: { type: "string", maxLength: 120 },
        location: { type: "string", maxLength: 60 },
        headline: { type: "string", maxLength: 60 },
        subline: { type: "string", maxLength: 120 },
        cta: { type: "string", maxLength: 32 }
      }
    },
    knobs: { type: "object" }
  }
};

const posterSchema = {
  type: "object",
  required: ["inputs","knobs"],
  properties: {
    template: { enum: ["flyer_a","poster_b","auto"] },
    inputs: {
      type: "object",
      required: ["industry","businessName","location"],
      properties: {
        industry: { type: "string", maxLength: 60 },
        businessName: { type: "string", maxLength: 60 },
        location: { type: "string", maxLength: 60 }
      }
    },
    knobs: { type: "object" }
  }
};

/* ------------------------ Route ------------------------ */

router.post('/generate-static-ad', async (req, res) => {
  try {
    const body = req.body || {};
    const templateReq = (body.template || 'auto').toString();
    const inputs = body.inputs || {};
    const knobs = body.knobs || {};

    const industry = inputs.industry || 'Local Services';
    const prof = profileForIndustry(industry);

    // Decide template for 'auto'
    const template =
      templateReq !== 'auto'
        ? templateReq
        : (['fashion','electronics','pets','coffee','restaurant','real_estate'].includes(prof.kind) ? 'poster_b' : 'flyer_a');

    /* ------------------- FLYER A (unchanged pipeline) ------------------- */
    if (template === 'flyer_a') {
      const mergedInputs = {
        industry,
        businessName: inputs.businessName || 'Your Brand',
        phone: inputs.phone || '(000) 000-0000',
        location: inputs.location || 'Your City',
        website: inputs.website || '',
        headline: inputs.headline || prof.headline,
        subline: inputs.subline || prof.subline,
        cta: inputs.cta || prof.cta
      };

      const mergedKnobs = {
        size: (knobs.size || '1080x1080'),
        palette: knobs.palette || prof.palette,
        lists: (knobs.lists || prof.lists),
        coverage: (knobs.coverage || prof.coverage || ''),
        showIcons: (knobs.showIcons !== undefined ? knobs.showIcons : true),
        headerSplitDiagonal: (knobs.headerSplitDiagonal !== undefined ? knobs.headerSplitDiagonal : true),
        roundedOuter: (knobs.roundedOuter !== undefined ? knobs.roundedOuter : true),
        backgroundHint: (knobs.backgroundHint || prof.bgHint || 'generic')
      };

      const validate = ajv.compile(flyerSchema);
      if (!validate({ template, inputs: mergedInputs, knobs: mergedKnobs })) {
        throw new Error('validation failed: ' + JSON.stringify(validate.errors));
      }

      const listsLaidOut = withListLayout(mergedKnobs.lists || {});
      const vars = {
        headline: mergedInputs.headline,
        subline: mergedInputs.subline,
        phone: mergedInputs.phone,
        cta: mergedInputs.cta,
        coverage: mergedKnobs.coverage,
        palette: mergedKnobs.palette,
        accentLeft: mergedKnobs.palette.accent,
        accentRight: '#1f3b58',
        lists: listsLaidOut
      };

      const svgTpl = tplFlyerA({ W:1080, H:1080 });
      const svg = mustache.render(svgTpl, vars);

      const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const svgName = `${base}.svg`;
      const pngName = `${base}.png`;
      const svgPath = path.join(GEN_DIR, svgName);
      const pngPath = path.join(GEN_DIR, pngName);

      fs.writeFileSync(svgPath, svg, 'utf8');
      await sharp(Buffer.from(svg)).png({ quality: 92 }).toFile(pngPath);

      const mediaPng = makeMediaUrl(req, pngName);
      const mediaSvg = makeMediaUrl(req, svgName);

      return res.json({
        ok: true,
        type: 'image',
        template,
        svgUrl: mediaSvg,
        pngUrl: mediaPng,
        url: mediaPng,
        absoluteUrl: mediaPng,
        filename: pngName,
        asset: { id: base, createdAt: Date.now() },
        ready: true
      });
    }

    /* ------------------- POSTER B (photo baked + card) ------------------- */
    const mergedInputsB = {
      industry,
      businessName: inputs.businessName || 'Your Brand',
      location: inputs.location || 'Your City'
    };
    const mergedKnobsB = {
      size: (knobs.size || '1080x1080'),
      // Background image hint/url
      backgroundHint: knobs.backgroundHint || prof.bgHint || 'retail',
      backgroundUrl: knobs.backgroundUrl || "", // NEW
      // Card text parts
      eventTitle: knobs.eventTitle || prof.eventTitle || 'SEASONAL EVENT',
      dateRange: knobs.dateRange || prof.dateRange || 'LIMITED TIME ONLY',
      saveAmount: knobs.saveAmount || prof.saveAmount || 'BIG SAVINGS',
      financingLine: knobs.financingLine || prof.financingLine || '',
      qualifiers: knobs.qualifiers || prof.qualifiers || '',
      legal: knobs.legal || prof.legal || '',
      // Palette
      palette: knobs.palette || prof.palette
    };

    const validateB = ajv.compile(posterSchema);
    if (!validateB({ template, inputs: mergedInputsB, knobs: mergedKnobsB })) {
      throw new Error('validation failed: ' + JSON.stringify(validateB.errors));
    }

    // Choose a background URL: explicit knob wins; otherwise fall back to a local generated solid
    let bgUrl = mergedKnobsB.backgroundUrl;
    if (!bgUrl) {
      // Always valid fallback on this same server
      bgUrl = selfUrl(req, '/__fallback/1200.jpg');
    }

    // Build photographic background layer
    const bgPng = await buildPosterBackground({
      width: 1080,
      height: 1080,
      bgUrl,
      accent: mergedKnobsB.palette.accent || '#ff7b41'
    });

    // Render card-only SVG
    const cardVars = {
      brandName: mergedInputsB.businessName,
      eventTitle: mergedKnobsB.eventTitle,
      dateRange: mergedKnobsB.dateRange,
      saveAmount: mergedKnobsB.saveAmount,
      financingLine: mergedKnobsB.financingLine,
      qualifiers: mergedKnobsB.qualifiers,
      legal: mergedKnobsB.legal,
      accent: mergedKnobsB.palette.accent || '#ff7b41'
    };
    const cardSvg = mustache.render(tplPosterBCard({}), cardVars);
    const cardPng = await sharp(Buffer.from(cardSvg))
      .png()
      .toBuffer();

    // Composite: center the card on the 1080 background
    const cardW = 760, cardH = 520;
    const left = Math.round((1080 - cardW) / 2);
    const top  = Math.round((1080 - cardH) / 2);

    const finalPng = await sharp(bgPng)
      .composite([{ input: cardPng, left, top }])
      .png({ quality: 92 })
      .toBuffer();

    // Persist
    const baseB = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pngNameB = `${baseB}.png`;
    const pngPathB = path.join(GEN_DIR, pngNameB);
    await fs.promises.writeFile(pngPathB, finalPng);

    const mediaPngB = makeMediaUrl(req, pngNameB);

    return res.json({
      ok: true,
      type: 'image',
      template,
      url: mediaPngB,
      absoluteUrl: mediaPngB,
      pngUrl: mediaPngB,
      filename: pngNameB,
      asset: { id: baseB, createdAt: Date.now() },
      ready: true
    });

  } catch (err) {
    console.error('[generate-static-ad]', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

module.exports = router;
