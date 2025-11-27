/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (industry-aware → SVG/PNG)
 * - flyer_a (services) : SVG → PNG (unchanged)
 * - poster_b (retail)  : optional photo baked with Sharp OR randomized gradient bg
 *   + larger, cleaner card, auto-fit typography, brand pill clamp, industry spot icon
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
    home_cleaning: { template:'flyer_a', headline:'HOME CLEANING SERVICES', subline:'Apartment • Home • Office', cta:'CALL NOW!', palette:PALETTES.navy, lists:serviceLists, coverage:'Coverage area 25 Miles around your city', bgHint:'home cleaning' },
    flooring:      { template:'poster_b', eventTitle:'FALL FLOORING EVENT', dateRange:'LIMITED TIME ONLY', saveAmount:'up to $1000', financingLine:'PLUS SPECIAL FINANCING*', qualifiers:'On select flooring products and services', legal:'*With approved credit. Ask for details.', palette:PALETTES.forest, bgHint:'flooring' },
    restaurant:    { template:'poster_b', eventTitle:'TASTE THE NEW SPECIALS', dateRange:'THIS WEEK ONLY', saveAmount:'2 for $20', financingLine:'ORDER ONLINE • PICKUP', qualifiers:'Fresh & local ingredients', legal:'', palette:PALETTES.wine, bgHint:'restaurant' },
    salon_spa:     { template:'poster_b', eventTitle:'SELF-CARE EVENT', dateRange:'LIMITED TIME • 15% OFF', saveAmount:'glow packages', financingLine:'BOOK TODAY', qualifiers:'Hair • Nails • Lashes • Skin', legal:'', palette:PALETTES.wine, bgHint:'salon spa' },
    fitness:       { template:'poster_b', eventTitle:'JOIN & SAVE', dateRange:'MEMBERSHIP DEALS THIS MONTH', saveAmount:'NO ENROLLMENT', financingLine:'FIRST WEEK FREE', qualifiers:'Classes • Coaching • 24/7 Access', legal:'', palette:PALETTES.slate, bgHint:'gym fitness' },
    real_estate:   { template:'poster_b', eventTitle:'OPEN HOUSE', dateRange:'SAT–SUN • 12–4PM', saveAmount:'NEW LISTING', financingLine:'ASK ABOUT FINANCING', qualifiers:'3 Bed • 2 Bath • 2,100 sq ft', legal:'', palette:PALETTES.teal, bgHint:'real estate' },
    auto:          { template:'flyer_a', headline:'AUTO REPAIR & SERVICE', subline:'Reliable • Fast • Affordable', cta:'CALL NOW!', palette:PALETTES.slate, lists:autoLists, coverage:'Same-day appointments available', bgHint:'auto repair' },
    landscaping:   { template:'flyer_a', headline:'LANDSCAPING & LAWN CARE', subline:'Clean-ups • Maintenance • Installs', cta:'GET A QUOTE', palette:PALETTES.forest, lists:landscapingLists, coverage:'Serving your area', bgHint:'landscaping' },
    hvac_plumbing: { template:'flyer_a', headline:'HVAC & PLUMBING', subline:'Install • Repair • Maintenance', cta:'SCHEDULE NOW', palette:PALETTES.teal, lists:hvacLists, coverage:'Emergency service available', bgHint:'hvac plumbing' },
    fashion:       { template:'poster_b', eventTitle:'NEW ARRIVALS', dateRange:'SEASONAL DROP', saveAmount:'FREE SHIPPING', financingLine:'EASY RETURNS', qualifiers:'Mens • Womens • Accessories', legal:'', palette:PALETTES.wine, bgHint:'fashion' },
    electronics:   { template:'poster_b', eventTitle:'TECH DEALS', dateRange:'LIMITED TIME SAVINGS', saveAmount:'UP TO 40% OFF', financingLine:'0% APR PROMO*', qualifiers:'Laptops • Tablets • Headphones', legal:'*OAC. Limited time.', palette:PALETTES.slate, bgHint:'electronics' },
    pets:          { template:'poster_b', eventTitle:'PET CARE & TREATS', dateRange:'THIS WEEK ONLY', saveAmount:'BUY 2 GET 1', financingLine:'GROOMING • VET • SUPPLIES', qualifiers:'Everything for happy pets', legal:'', palette:PALETTES.forest, bgHint:'pets' },
    coffee:        { template:'poster_b', eventTitle:'FRESH ROASTS DAILY', dateRange:'TRY NEW SEASONALS', saveAmount:'2 FOR $5', financingLine:'ORDER AHEAD', qualifiers:'Espresso • Cold Brew • Tea', legal:'', palette:PALETTES.wine, bgHint:'coffee' },
    generic:       { template:'flyer_a', headline:'LOCAL SERVICES', subline:'Reliable • Friendly • On Time', cta:'CONTACT US', palette:PALETTES.base, lists:{ left:["Free Quote","Same-Day","Licensed","Insured"], right:["Great Reviews","Family Owned","Fair Prices","Guaranteed"] }, coverage:'Serving your area', bgHint:'generic' }
  };

  let prof = MAP[kind];
  if (kind === 'hvac_plumbing' && /plumb/i.test(industry)) {
    prof = { ...prof, lists: plumbingLists };
  }
  return { kind, ...prof };
}

/* ------------------------ Templates ------------------------ */

// ---- flyer_a (unchanged) ----
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

  <g transform="translate(60, 85)">
    <text class="h0" fill="#ffffff">{{headline}}</text>
  </g>

  <path d="M0,220 L${W},160 L${W},${H} L0,${H} Z" fill="#ffffff" opacity=".16"/>
  <circle cx="${W/2}" cy="${H/2+20}" r="120" fill="{{palette.accent}}" opacity=".15" filter="url(#soft)"/>

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

  <g transform="translate(80, 350)">
    <text class="b1" fill="#113a5d" opacity=".65">{{subline}}</text>
  </g>

  {{#coverage}}
  <g transform="translate(80, ${H-210})">
    <text class="meta" fill="#2b3a44" opacity=".7">📍 {{coverage}}</text>
  </g>
  {{/coverage}}

  <g transform="translate(80, ${H-160})">
    <rect width="${W-160}" height="96" rx="22" fill="{{palette.accent}}"/>
    <text class="chip" x="${(W-160)/2}" y="62" text-anchor="middle" fill="#0b1115">{{cta}} {{phone}}</text>
  </g>
</svg>`;
}

/* ---- poster_b card (transparent) with size/typography knobs ---- */
function tplPosterBCard({ cardW, cardH, padX, padY }) {
  return `
<svg viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#000" flood-opacity="0.28"/>
    </filter>
  </defs>

  <g filter="url(#cardShadow)">
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="30" fill="#ffffff"/>
  </g>

  <g transform="translate(${padX}, ${padY})">
    <!-- brand pill -->
    <g transform="translate(${cardW - padX - 180}, -8)">
      <rect width="180" height="42" rx="21" fill="#0f1a22" opacity="0.08"/>
      <text style="font:700 26px Inter,system-ui; fill:#334554;" x="90" y="30" text-anchor="middle">{{brandName}}</text>
    </g>

    <text style="font:900 var(--fsTitle,78px)/1.05 Inter,system-ui; letter-spacing:-1px; fill:#0f1a22;" x="0" y="0" dy="0.95em">{{eventTitle}}</text>
    <text style="font:800 var(--fsH2,36px)/1.2 Inter,system-ui; fill:#334554;" x="0" y="82" dy="1.2em">{{dateRange}}</text>
    <text style="font:900 var(--fsSave,62px)/1.05 Inter,system-ui; fill:{{accent}};" x="0" y="162" dy="1.25em">{{saveAmount}}</text>
    <text style="font:800 var(--fsH2,36px)/1.2 Inter,system-ui; fill:#334554;" x="0" y="260" dy="1.1em">{{financingLine}}</text>
    <text style="font:700 var(--fsBody,28px)/1.25 Inter,system-ui; fill:#66798a;" x="0" y="318" dy="1.2em">{{qualifiers}}</text>
  </g>

  {{#legal}}
  <g transform="translate(${padX}, ${cardH - 18})">
    <text style="font:700 22px/1.2 Inter,system-ui; fill:#9eb2c3;" x="0" y="-6">{{legal}}</text>
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
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function ellipsize(s = "", max = 22) {
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

/* tiny fetch to buffer */
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      lib.get(url, { timeout: 12000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return fetchBuffer(res.headers.location).then(resolve).catch(reject);
        }
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }).on('error', reject);
    } catch (e) { reject(e); }
  });
}

/* subtle industry “spot” icon (vector) */
function industrySpotSVG(kind, width, height, color = '#ffffff') {
  const o = 0.12; // opacity
  switch (kind) {
    case 'home_cleaning':
      return `<g opacity="${o}" transform="translate(${width*0.62}, ${height*0.18}) scale(2)">
        <path d="M10 30 h40 l5 40 h-50 z" fill="${color}"/>
        <rect x="5" y="70" width="60" height="10" rx="5" fill="${color}"/>
      </g>`;
    case 'fashion':
      return `<g opacity="${o}" transform="translate(${width*0.65}, ${height*0.2}) scale(2)">
        <path d="M20 20 h40 l-10 20 h-20 z" fill="${color}"/>
        <rect x="15" y="20" width="6" height="30" rx="3" fill="${color}"/>
      </g>`;
    case 'electronics':
      return `<g opacity="${o}" transform="translate(${width*0.60}, ${height*0.2}) scale(2)">
        <rect x="10" y="20" width="60" height="40" rx="6" fill="${color}"/>
        <rect x="25" y="62" width="30" height="6" rx="3" fill="${color}"/>
      </g>`;
    default:
      return `<circle cx="${width*0.18}" cy="${height*0.25}" r="120" fill="${color}" opacity="${o}"/>`;
  }
}

/* Randomized gradient + noise + vignette (used when no photo). */
function randomGradientSVG({ width, height, accent, seed }) {
  // seed influences hue rotation & angle
  const r = (min, max) => min + (seed % 997) / 997 * (max - min);
  const angle = Math.floor(r(20, 340));
  return `
  <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g" gradientTransform="rotate(${angle})">
        <stop offset="0%" stop-color="${accent}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="#0e151c" stop-opacity="1"/>
      </linearGradient>
      <radialGradient id="v" cx="50%" cy="45%" r="70%">
        <stop offset="0%" stop-color="#0d131a" stop-opacity="0.0"/>
        <stop offset="70%" stop-color="#0d131a" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="#0d131a" stop-opacity="0.75"/>
      </radialGradient>
      <filter id="noise">
        <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="2" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
        <feComponentTransfer><feFuncA type="linear" slope="0.025"/></feComponentTransfer>
      </filter>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <rect width="100%" height="100%" filter="url(#noise)"/>
    <rect x="42" y="42" width="${width-84}" height="${height-84}" rx="40" fill="#fff" opacity="0.04"/>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`;
}

/* Build photographic/gradient background and add industry spot */
async function buildPosterBackground({
  width = 1080,
  height = 1080,
  bgUrl = "",
  accent = "#ff7b41",
  industryKind = "generic",
  seed = Date.now()
}) {
  let base = sharp({
    create: { width, height, channels: 3, background: { r: 12, g: 18, b: 24 } }
  }).png();

  const layers = [];

  if (bgUrl) {
    try {
      const buf = await fetchBuffer(bgUrl);
      const photo = await sharp(buf)
        .resize(width, height, { fit: 'cover', position: 'centre' })
        .modulate({ saturation: 0.9, brightness: 1.02 })
        .blur(6)
        .png()
        .toBuffer();
      layers.push({ input: photo, gravity: 'centre', blend: 'over' });
    } catch {
      // ignore; fall back to gradient
    }
  }

  if (!bgUrl || layers.length === 0) {
    const grad = Buffer.from(randomGradientSVG({ width, height, accent, seed }));
    layers.push({ input: grad, blend: 'over' });
  }

  // industry spot
  const spot = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${industrySpotSVG(industryKind, width, height, '#ffffff')}
    </svg>
  `);
  layers.push({ input: spot, blend: 'over' });

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

    /* ------------------- FLYER A ------------------- */
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
        ok: true, type: 'image', template,
        svgUrl: mediaSvg, pngUrl: mediaPng, url: mediaPng, absoluteUrl: mediaPng,
        filename: pngName, asset: { id: base, createdAt: Date.now() }, ready: true
      });
    }

    /* ------------------- POSTER B ------------------- */
    const mergedInputsB = {
      industry,
      businessName: inputs.businessName || 'Your Brand',
      location: inputs.location || 'Your City'
    };
    const mergedKnobsB = {
      size: (knobs.size || '1080x1080'),
      backgroundHint: knobs.backgroundHint || prof.bgHint || 'retail',
      backgroundUrl: knobs.backgroundUrl || "",
      eventTitle: knobs.eventTitle || prof.eventTitle || 'SEASONAL EVENT',
      dateRange: knobs.dateRange || prof.dateRange || 'LIMITED TIME ONLY',
      saveAmount: knobs.saveAmount || prof.saveAmount || 'BIG SAVINGS',
      financingLine: knobs.financingLine || prof.financingLine || '',
      qualifiers: knobs.qualifiers || prof.qualifiers || '',
      legal: knobs.legal || prof.legal || '',
      palette: knobs.palette || prof.palette
    };

    const validateB = ajv.compile(posterSchema);
    if (!validateB({ template, inputs: mergedInputsB, knobs: mergedKnobsB })) {
      throw new Error('validation failed: ' + JSON.stringify(validateB.errors));
    }

    // compute typography sizes based on content length (keeps text inside card)
    const lenTitle = String(mergedKnobsB.eventTitle || "").length;
    const lenSave  = String(mergedKnobsB.saveAmount || "").length;
    const fsTitle = clamp(88 - Math.max(0, lenTitle - 16) * 2.2, 60, 88);
    const fsSave  = clamp(70 - Math.max(0, lenSave  - 14) * 2.0, 48, 72);
    const fsH2    = 36;
    const fsBody  = 28;

    // choose background
    let bgUrl = mergedKnobsB.backgroundUrl || "";
    if (!bgUrl) bgUrl = selfUrl(req, '/__fallback/1200.jpg');

    const bgPng = await buildPosterBackground({
      width: 1080,
      height: 1080,
      bgUrl,
      accent: mergedKnobsB.palette.accent || '#ff7b41',
      industryKind: classifyIndustry(industry),
      seed: Date.now()
    });

    // render card SVG (bigger card + paddings)
    const cardW = 820, cardH = 560, padX = 56, padY = 64;
    const cardVars = {
      brandName: ellipsize(mergedInputsB.businessName, 22),
      eventTitle: mergedKnobsB.eventTitle,
      dateRange: mergedKnobsB.dateRange,
      saveAmount: mergedKnobsB.saveAmount,
      financingLine: mergedKnobsB.financingLine,
      qualifiers: mergedKnobsB.qualifiers,
      legal: mergedKnobsB.legal,
      accent: mergedKnobsB.palette.accent || '#ff7b41'
    };

    // inject CSS custom props for font sizes
    const cardSvg = mustache.render(tplPosterBCard({ cardW, cardH, padX, padY }), cardVars)
      .replace('</svg>', `
        <style>
          :root{
            --fsTitle:${fsTitle}px;
            --fsSave:${fsSave}px;
            --fsH2:${fsH2}px;
            --fsBody:${fsBody}px;
          }
        </style>
      </svg>`);

    const cardPng = await sharp(Buffer.from(cardSvg)).png().toBuffer();

    // center composite
    const left = Math.round((1080 - cardW) / 2);
    const top  = Math.round((1080 - cardH) / 2);

    const finalPng = await sharp(bgPng)
      .composite([{ input: cardPng, left, top }])
      .png({ quality: 92 })
      .toBuffer();

    const baseB = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pngNameB = `${baseB}.png`;
    await fs.promises.writeFile(path.join(GEN_DIR, pngNameB), finalPng);

    const mediaPngB = makeMediaUrl(req, pngNameB);
    return res.json({
      ok: true, type: 'image', template,
      url: mediaPngB, absoluteUrl: mediaPngB, pngUrl: mediaPngB,
      filename: pngNameB, asset: { id: baseB, createdAt: Date.now() }, ready: true
    });

  } catch (err) {
    console.error('[generate-static-ad]', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

module.exports = router;
