/* eslint-disable */
'use strict';

/**
 * Static Ad Generator (industry-aware → SVG → PNG)
 * - Two templates: flyer_a (services) and poster_b (retail/promo)
 * - Auto industry profiles for any vertical (fallbacks if unknown)
 * - Writes to GENERATED_DIR and serves via /generated and /api/media
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

function makeMediaUrl(req, filename) {
  const base = process.env.PUBLIC_BASE_URL || (req.protocol + '://' + req.get('host'));
  // We expose under /generated and /api/media; use the /api/media alias for frontend helpers.
  return `${base}/api/media/${filename}`;
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
  // palettes lean dark header / light body by default
  const PALETTES = {
    base:   { header: '#0d3b66', body: '#dff3f4', accent: '#ff8b4a', textOnDark: '#ffffff', textOnLight: '#2b3a44' },
    teal:   { header: '#0b5563', body: '#e7f6f2', accent: '#16a085', textOnDark: '#ffffff', textOnLight: '#23343d' },
    navy:   { header: '#113a5d', body: '#e8f0f6', accent: '#ff7b41', textOnDark: '#ffffff', textOnLight: '#213547' },
    wine:   { header: '#3a2740', body: '#f2ecf7', accent: '#e76f51', textOnDark: '#ffffff', textOnLight: '#2d283a' },
    forest: { header: '#1d3b2a', body: '#e9f5ee', accent: '#f4a261', textOnDark: '#ffffff', textOnLight: '#273b33' },
    slate:  { header: '#213043', body: '#eaf2fb', accent: '#f59e0b', textOnDark: '#ffffff', textOnLight: '#182435' }
  };

  // Default buckets
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
  const salonLists = {
    left:  ["Haircuts","Color","Blowouts","Treatments"],
    right: ["Nails","Lashes","Waxing","Makeup"]
  };
  const fitnessLists = {
    left:  ["Personal Training","Group Classes","Open Gym","Nutrition"],
    right: ["HIIT","Strength","Mobility","Yoga","Pilates","Cardio"]
  };

  // Per-kind defaults
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
      lists: hvacLists, // plumbingLists swapped in below if we detect “plumb”
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
  // Small tweak: if text includes "plumb" prefer plumbing lists
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

// Poster B (retail/promo) — lifestyle bg + centered card
function tplPosterB({ W=1080, H=1080 }) {
  return `
<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>
    <style>
      .h0{font:900 84px/1 Inter,system-ui}
      .h1{font:900 66px/1.02 Inter,system-ui}
      .b1{font:800 34px/1.2 Inter,system-ui}
      .meta{font:700 24px/1.2 Inter,system-ui}
    </style>
  </defs>

  <rect width="${W}" height="${H}" fill="#0e151c"/>
  <rect x="40" y="40" width="${W-80}" height="${H-80}" rx="34" fill="#fff" opacity=".05" />
  <rect x="80" y="120" width="${W*0.7}" height="${H*0.55}" rx="28" fill="#ffffff" />

  <!-- Headline card -->
  <g transform="translate(120, 180)">
    <text class="h0" fill="#0f1a22">{{eventTitle}}</text>
    <text class="b1" y="90" fill="#334554">{{dateRange}}</text>
    <text class="h1" y="180" fill="{{palette.header}}">{{saveAmount}}</text>
    <text class="b1" y="250" fill="#334554">{{financingLine}}</text>
    <text class="meta" y="310" fill="#66798a">{{qualifiers}}</text>
  </g>

  <!-- Footer legal -->
  {{#legal}}
  <g transform="translate(80, ${H-40})">
    <text class="meta" fill="#9eb2c3">{{legal}}</text>
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

    // Decide template if 'auto'
    const template =
      templateReq !== 'auto'
        ? templateReq
        : (['fashion','electronics','pets','coffee','restaurant','real_estate'].includes(prof.kind) ? 'poster_b' : 'flyer_a');

    // Merge inputs with profile defaults (user input wins)
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

      // Build render vars
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

    // poster_b
    const mergedInputsB = {
      industry,
      businessName: inputs.businessName || 'Your Brand',
      location: inputs.location || 'Your City'
    };
    const mergedKnobsB = {
      size: (knobs.size || '1080x1080'),
      frame: knobs.frame || { outerWhite: true, softShadow: true },
      card: knobs.card || { widthPct: 70, heightPct: 55, shadow: true },
      eventTitle: knobs.eventTitle || prof.eventTitle || 'SEASONAL EVENT',
      dateRange: knobs.dateRange || prof.dateRange || 'LIMITED TIME ONLY',
      saveAmount: knobs.saveAmount || prof.saveAmount || 'BIG SAVINGS',
      financingLine: knobs.financingLine || prof.financingLine || '',
      qualifiers: knobs.qualifiers || prof.qualifiers || '',
      legal: knobs.legal || prof.legal || '',
      seasonalLeaves: knobs.seasonalLeaves !== undefined ? knobs.seasonalLeaves : true,
      backgroundHint: knobs.backgroundHint || prof.bgHint || 'retail',
      palette: knobs.palette || prof.palette
    };

    const validateB = ajv.compile(posterSchema);
    if (!validateB({ template, inputs: mergedInputsB, knobs: mergedKnobsB })) {
      throw new Error('validation failed: ' + JSON.stringify(validateB.errors));
    }

    const varsB = {
      palette: mergedKnobsB.palette,
      eventTitle: mergedKnobsB.eventTitle,
      dateRange: mergedKnobsB.dateRange,
      saveAmount: mergedKnobsB.saveAmount,
      financingLine: mergedKnobsB.financingLine,
      qualifiers: mergedKnobsB.qualifiers,
      legal: mergedKnobsB.legal
    };

    const svgTplB = tplPosterB({ W:1080, H:1080 });
    const svgB = mustache.render(svgTplB, varsB);

    const baseB = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const svgNameB = `${baseB}.svg`;
    const pngNameB = `${baseB}.png`;
    const svgPathB = path.join(GEN_DIR, svgNameB);
    const pngPathB = path.join(GEN_DIR, pngNameB);
    fs.writeFileSync(svgPathB, svgB, 'utf8');
    await sharp(Buffer.from(svgB)).png({ quality: 92 }).toFile(pngPathB);

    const mediaPngB = makeMediaUrl(req, pngNameB);
    const mediaSvgB = makeMediaUrl(req, svgNameB);

    return res.json({
      ok: true,
      type: 'image',
      template,
      svgUrl: mediaSvgB,
      pngUrl: mediaPngB,
      url: mediaPngB,
      absoluteUrl: mediaPngB,
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
