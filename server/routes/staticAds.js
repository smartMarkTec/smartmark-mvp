/* eslint-disable */
'use strict';

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

const STOCK_DIR = path.join(process.cwd(), 'server', 'public', 'stock');
try {
  fs.mkdirSync(STOCK_DIR, { recursive: true });
} catch {}

function makeMediaUrl(req, filename) {
  const base =
    process.env.PUBLIC_BASE_URL || req.protocol + '://' + req.get('host');
  return `${base}/api/media/${filename}`;
}
function selfUrl(req, p = '') {
  const base =
    process.env.PUBLIC_BASE_URL || req.protocol + '://' + req.get('host');
  return `${base}${p.startsWith('/') ? p : `/${p}`}`;
}

/* ------------------------ CORS ------------------------ */
router.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS,HEAD');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, Range'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'Content-Length, Content-Range, Accept-Ranges'
  );
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/* ------------------------ HTTP helpers ------------------------ */
function fetchUpstream(method, url, extraHeaders = {}, bodyBuf = null) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.request(
        url,
        { method, timeout: 25000, headers: extraHeaders },
        (res) => {
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () =>
            resolve({
              status: res.statusCode,
              headers: res.headers,
              body: Buffer.concat(chunks),
            })
          );
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('HTTP timeout'));
      });
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

function fetchBuffer(url, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(
        url,
        { timeout: 15000, headers: extraHeaders },
        (res) => {
          if (
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            return fetchBuffer(res.headers.location, extraHeaders)
              .then(resolve)
              .catch(reject);
          }
          if (res.statusCode !== 200)
            return reject(new Error(`HTTP ${res.statusCode}`));
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('HTTP timeout'));
      });
    } catch (e) {
      reject(e);
    }
  });
}

/* ------------------------ Industry Profiles ------------------------ */

function classifyIndustry(s = '') {
  const t = String(s).toLowerCase();
  const has = (rx) => rx.test(t);
  if (has(/clean|maid|janitor|housekeep/)) return 'home_cleaning';
  if (has(/floor|carpet|tile|vinyl|hardwood/)) return 'flooring';
  if (has(/restaurant|food|pizza|burger|cafe|bar|grill|taqueria|eat|diner/))
    return 'restaurant';
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

function profileForIndustry(industry = '') {
  const kind = classifyIndustry(industry);
  const PALETTES = {
    base: {
      header: '#0d3b66',
      body: '#dff3f4',
      accent: '#ff8b4a',
      textOnDark: '#ffffff',
      textOnLight: '#2b3a44',
    },
    teal: {
      header: '#0b5563',
      body: '#e7f6f2',
      accent: '#16a085',
      textOnDark: '#ffffff',
      textOnLight: '#23343d',
    },
    navy: {
      header: '#113a5d',
      body: '#e8f0f6',
      accent: '#ff7b41',
      textOnDark: '#ffffff',
      textOnLight: '#213547',
    },
    wine: {
      header: '#3a2740',
      body: '#f2ecf7',
      accent: '#e76f51',
      textOnDark: '#ffffff',
      textOnLight: '#2d283a',
    },
    forest: {
      header: '#1d3b2a',
      body: '#e9f5ee',
      accent: '#f4a261',
      textOnDark: '#ffffff',
      textOnLight: '#273b33',
    },
    slate: {
      header: '#213043',
      body: '#eaf2fb',
      accent: '#f59e0b',
      textOnDark: '#ffffff',
      textOnLight: '#182435',
    },
  };

  const serviceLists = {
    left: ['One Time', 'Weekly', 'Bi-Weekly', 'Monthly'],
    right: ['Kitchen', 'Bathrooms', 'Offices', 'Dusting', 'Mopping', 'Vacuuming'],
  };
  const hvacLists = {
    left: ['Install', 'Repair', 'Tune-Up', 'Maintenance'],
    right: ['AC Units', 'Furnaces', 'Ductwork', 'Thermostats', 'Heat Pumps', 'Filters'],
  };
  const plumbingLists = {
    left: ['Leaks', 'Clogs', 'Installs', 'Repairs'],
    right: ['Water Heaters', 'Toilets', 'Sinks', 'Showers', 'Garbage Disposal', 'Piping'],
  };
  const landscapingLists = {
    left: ['Mowing', 'Edging', 'Trimming', 'Cleanup'],
    right: ['Mulch', 'Hedges', 'Tree Care', 'Fertilize', 'Weed Control', 'Irrigation'],
  };
  const autoLists = {
    left: ['Oil Change', 'Brakes', 'Tires', 'Alignment'],
    right: ['Diagnostics', 'AC Service', 'Batteries', 'Inspections'],
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
      bgHint: 'home cleaning',
    },
    flooring: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.forest,
      bgHint: 'flooring',
    },
    restaurant: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'restaurant',
    },
    salon_spa: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'salon spa',
    },
    fitness: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.slate,
      bgHint: 'gym fitness',
    },
    real_estate: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.teal,
      bgHint: 'real estate',
    },
    auto: {
      template: 'flyer_a',
      headline: 'AUTO REPAIR & SERVICE',
      subline: 'Reliable • Fast • Affordable',
      cta: 'CALL NOW!',
      palette: PALETTES.slate,
      lists: autoLists,
      coverage: 'Same-day appointments available',
      bgHint: 'auto repair',
    },
    landscaping: {
      template: 'flyer_a',
      headline: 'LANDSCAPING & LAWN CARE',
      subline: 'Clean-ups • Maintenance • Installs',
      cta: 'GET A QUOTE',
      palette: PALETTES.forest,
      lists: landscapingLists,
      coverage: 'Serving your area',
      bgHint: 'landscaping',
    },
    hvac_plumbing: {
      template: 'flyer_a',
      headline: 'HVAC & PLUMBING',
      subline: 'Install • Repair • Maintenance',
      cta: 'SCHEDULE NOW',
      palette: PALETTES.teal,
      lists: hvacLists,
      coverage: 'Emergency service available',
      bgHint: 'hvac plumbing',
    },
    fashion: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'fashion',
    },
    electronics: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.slate,
      bgHint: 'electronics',
    },
    pets: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.forest,
      bgHint: 'pets',
    },
    coffee: {
      template: 'poster_b',
      eventTitle: '',
      dateRange: '',
      saveAmount: '',
      financingLine: '',
      qualifiers: '',
      legal: '',
      palette: PALETTES.wine,
      bgHint: 'coffee',
    },
    generic: {
      template: 'flyer_a',
      headline: 'LOCAL SERVICES',
      subline: 'Reliable • Friendly • On Time',
      cta: 'CONTACT US',
      palette: PALETTES.base,
      lists: {
        left: ['Free Quote', 'Same-Day', 'Licensed', 'Insured'],
        right: ['Great Reviews', 'Family Owned', 'Fair Prices', 'Guaranteed'],
      },
      coverage: 'Serving your area',
      bgHint: 'generic',
    },
  };

  let prof = MAP[kind];
  if (kind === 'hvac_plumbing' && /plumb/i.test(industry)) {
    prof = { ...prof, lists: plumbingLists };
  }
  return { kind, ...prof };
}

/* ------------------------ Smart copy helpers ------------------------ */

function titleCase(s = '') {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m, c) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanLine(s = '') {
  const noUrl = String(s).replace(/https?:\/\/\S+|www\.\S+/gi, '');
  const noFiller = noUrl
    .replace(/\b(our|we|my|the|very|really)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return noFiller;
}
function clampWords(s = '', max = 16) {
  const w = String(s)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return w.length > max ? w.slice(0, max).join(' ') + '…' : String(s).trim();
}

const INDUSTRY_TEMPLATES = {
  fashion: {
    headline: (brand, benefit) =>
      brand ? `${titleCase(brand)} New Collection` : 'Effortless Everyday Style',
    subline: (aud, city) => {
      const parts = [];
      if (aud) parts.push(`Style for ${aud}`);
      else parts.push('Everyday quality. Statement looks.');
      if (city) parts.push(`Available in ${city}`);
      return parts.join(' • ');
    },
    bullets: (offer) => [
      offer ? clampWords(cleanLine(offer), 6) : 'Premium fabrics',
      'Modern fits • New drops',
    ],
  },
  restaurant: {
    headline: (brand, benefit) =>
      benefit || `${brand ? titleCase(brand) + ': ' : ''}Fresh. Fast. Crave-worthy.`,
    subline: (aud, city) =>
      [aud ? `Perfect for ${aud}` : 'Chef-crafted flavors', city ? `In ${city}` : null]
        .filter(Boolean)
        .join(' • '),
    bullets: (offer) => [
      offer || 'Lunch specials daily',
      'Order online • Pickup or delivery',
    ],
  },
  flooring: {
    headline: (brand, benefit) =>
      benefit || `${brand ? titleCase(brand) + ': ' : ''}Upgrade Your Floors`,
    subline: (aud, city) =>
      [aud ? `Designed for ${aud}` : 'Hardwood • Vinyl • Tile', city || null]
        .filter(Boolean)
        .join(' • '),
    bullets: (offer) => [offer || 'Free in-home estimate', 'Install by licensed pros'],
  },
};

function craftCopyFromAnswers(a = {}, prof = {}) {
  const kind = prof?.kind || classifyIndustry(a.industry || '');
  const t =
    INDUSTRY_TEMPLATES[kind] || {
      headline: (brand, benefit) =>
        benefit || `${brand ? titleCase(brand) + ': ' : ''}Quality You Can Feel`,
      subline: (aud, city) =>
        [aud ? `Built for ${aud}` : 'Trusted local service', city ? `Serving ${city}` : null]
          .filter(Boolean)
          .join(' • '),
      bullets: (offer) => [offer || 'Fast scheduling', 'Great reviews • Fair pricing'],
    };

  const brand = cleanLine(a.businessName || a.brand?.businessName || '');
  const city = cleanLine(
    a.city ? (a.state ? `${a.city}, ${a.state}` : a.city) : a.location || ''
  );
  const benefit = clampWords(cleanLine(a.mainBenefit || a.details || ''), 10);
  const audience = clampWords(cleanLine(a.idealCustomer || ''), 8);
  const offer = cleanLine(a.offer || a.saveAmount || '');

  const headline = clampWords(cleanLine(t.headline(brand, benefit)), 10);
  const subline = clampWords(cleanLine(t.subline(audience, city)), 14);
  const bullets = (t.bullets(offer) || [])
    .map((b) => clampWords(cleanLine(b), 7))
    .slice(0, 3);

  return {
    ok: true,
    copy: {
      headline,
      subline,
      offer: offer || '',
      secondary: '',
      bullets,
      disclaimers: '',
    },
  };
}

/* ------------------------ OpenAI JSON copywriter ------------------------ */

async function generateSmartCopyWithOpenAI(answers = {}, prof = {}) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const sys = `You are a marketing copywriter for square social ads. 
Return only strict JSON for these fields:
{ "headline": "...", "subline": "...", "offer": "...", "secondary": "", "bullets": ["...","..."], "disclaimers": "" }
Rules:
- Do NOT repeat user's sentences verbatim; paraphrase into crisp ad copy.
- Headline: max 6 words, punchy, no punctuation at end.
- Subline: max 12 words; may include separators "•".
- Bullets: 2–4 micro-phrases, 3–5 words each, no periods.
- Offer must be based ONLY on the user's described offer/discount. If they did not describe a deal, set "offer" to an empty string "".
- Do NOT invent discounts, free shipping, financing, APR, rebates, or % OFF if the user didn't clearly provide one.
- Keep it brand-safe and generic.`;

  const user = {
    businessName: answers.businessName || '',
    industry: answers.industry || '',
    location: answers.location || answers.city || '',
    idealCustomer: answers.idealCustomer || '',
    offer: answers.offer || '',
    mainBenefit: answers.mainBenefit || answers.benefit || '',
    website: answers.website || '',
  };

  const body = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: `Make ad copy for:\n${JSON.stringify(user, null, 2)}` },
    ],
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const { status, body: respBuf } = await fetchUpstream(
    'POST',
    'https://api.openai.com/v1/chat/completions',
    {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    Buffer.from(body)
  );

  if (status !== 200) return null;

  try {
    const parsed = JSON.parse(respBuf.toString('utf8'));
    const content = parsed?.choices?.[0]?.message?.content || '{}';
    const j = JSON.parse(content);
    if (j && j.headline) return j;
  } catch (_) {}
  return null;
}

/* ------------------------ Offer normalizer ------------------------ */

function tightenOfferText(s = '') {
  let t = String(s || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\w\s%$]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return '';

  const pct = t.match(/(?:up to\s*)?(\d{1,3})\s*%/i);
  const upTo = /up to/.test(t);
  if (pct) {
    let out = (upTo ? `UP TO ${pct[1]}%` : `${pct[1]}%`) + ' OFF';
    if (/\b(first|1st)\s+(order|purchase)\b/.test(t)) out += ' FIRST ORDER';
    return out;
  }
  const dol = t.match(/\$?\s*(\d+)\s*(?:off|discount|rebate)/i);
  if (dol) return `$${dol[1]} OFF`;
  if (/buy\s*1\s*get\s*1/i.test(t)) return 'BUY 1 GET 1';

  return t
    .replace(/\b(we|our|you|your|they|their|will|get|receive|customers)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/* ------------------------ SVG templates ------------------------ */

function tplFlyerA({ W = 1080, H = 1080 }) {
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
  <circle cx="${W / 2}" cy="${H / 2 + 20}" r="120" fill="{{palette.accent}}" opacity=".15" filter="url(#soft)"/>

  <g transform="translate(80, 440)">
    <text class="h1" fill="{{palette.header}}">FREQUENCY</text>
    {{#lists.left}}
      <g transform="translate(0, {{y}})">
        <circle cx="14" cy="10" r="10" fill="{{accentLeft}}"/>
        <text class="b1" x="34" y="20" fill="{{palette.textOnLight}}">{{text}}</text>
      </g>
    {{/lists.left}}
  </g>

  <g transform="translate(${W - 520}, 440)">
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
  <g transform="translate(80, ${H - 210})">
    <text class="meta" fill="#2b3a44" opacity=".7">📍 {{coverage}}</text>
  </g>
  {{/coverage}}

  <g transform="translate(80, ${H - 160})">
    <rect width="${W - 160}" height="96" rx="22" fill="{{palette.accent}}"/>
    <text class="chip" x="${(W - 160) / 2}" y="62" text-anchor="middle" fill="#0b1115">{{cta}} {{phone}}</text>
  </g>
</svg>`;
}

function tplPosterBCard({
  cardW,
  cardH,
  padX,
  padY,
  fsTitle,
  fsH2,
  fsSave,
  fsBody,
  metrics,
}) {
  const { titleY, dateY, dividerY, saveY, financeY, qualY, bulletStartY } = metrics;
  return `
<svg viewBox="0 0 ${cardW} ${cardH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="cardShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="22" flood-color="#000" flood-opacity="0.25"/>
    </filter>
    <style>
      .t-center { text-anchor: middle; }
      .title   { font: 900 ${fsTitle}px/1.08 Inter,system-ui; letter-spacing:-1px; fill:#0f1a22; }
      .h2      { font: 800 ${fsH2}px/1.22  Inter,system-ui; fill:#3b4b59; }
      .save    { font: 900 ${fsSave}px/1.05 Inter,system-ui; fill: {{accent}}; }
      .body    { font: 700 ${fsBody}px/1.28 Inter,system-ui; fill:#5f7182; }
      .legal   { font: 700 22px/1.2 Inter,system-ui; fill:#9eb2c3; }
      .brand   { font: 800 24px/1 Inter,system-ui; fill:#334554; }
    </style>
  </defs>

  <!-- White card with soft shadow, like the Shaw template -->
  <g filter="url(#cardShadow)">
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="30" fill="#ffffff"/>
  </g>

  <!-- Brand pill at the very top -->
  <g transform="translate(${cardW / 2 - 140}, ${Math.max(10, padY - 40)})">
    <rect width="280" height="44" rx="22" fill="#0f1a22" opacity="0.06"/>
    <text class="brand t-center" x="140" y="30">{{brandName}}</text>
  </g>

  <!-- Main stacked content -->
  <g>
    <!-- Big headline (FALL FLOORING SALE style) -->
    <text class="title t-center" x="${cardW / 2}" y="${titleY}">
      {{#eventTitleLines}}
        <tspan x="${cardW / 2}" dy="{{dy}}">{{line}}</tspan>
      {{/eventTitleLines}}
    </text>

    <!-- Date range / subline (AUGUST 15 – SEPTEMBER 30, 2020) -->
    <text class="h2 t-center" x="${cardW / 2}" y="${dateY}">{{dateRange}}</text>

    <!-- Divider -->
    <g transform="translate(${padX}, ${dividerY})">
      <rect width="${cardW - padX * 2}" height="2" fill="#e8eef3"/>
    </g>

    <!-- SAVE up to $1000 -->
    <text class="save t-center" x="${cardW / 2}" y="${saveY}">{{saveAmount}}</text>

    <!-- PLUS SPECIAL FINANCING -->
    <text class="h2 t-center" x="${cardW / 2}" y="${financeY}">{{financingLine}}</text>

    <!-- Qualifier lines (e.g., ON SELECT PRODUCTS...) -->
    <text class="body t-center" x="${cardW / 2}" y="${qualY}">
      {{#qualifierLines}}
        <tspan x="${cardW / 2}" dy="{{dy}}">{{line}}</tspan>
      {{/qualifierLines}}
    </text>

    <!-- Bullet list under the qualifier (centered, Shaw-style) -->
    <text class="body t-center" x="${cardW / 2}" y="${bulletStartY}">
      {{#bulletLines}}
        <tspan x="${cardW / 2}" dy="{{dy}}">• {{line}}</tspan>
      {{/bulletLines}}
    </text>
  </g>

  <!-- Legal / disclaimer at the very bottom of the card -->
  {{#legal}}
  <g transform="translate(${padX}, ${cardH - 18})">
    <text class="legal" x="0" y="-6">{{legal}}</text>
  </g>
  {{/legal}}
</svg>`;
}


/* ------------------------ Utility helpers ------------------------ */

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function ellipsize(s = '', max = 22) {
  s = String(s).trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}
function layoutList(items) {
  const startY = 56,
    step = 54;
  return (items || []).slice(0, 6).map((t, i) => ({ y: startY + i * step, text: t }));
}
function withListLayout(lists = {}) {
  return {
    left: layoutList(lists.left || []),
    right: layoutList(lists.right || []),
  };
}

function wrapTextToWidth(str = '', fsPx = 48, cardW = 860, padX = 60, maxLines = 2) {
  const s = String(str || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!s) return [];
  const pxWidth = cardW - padX * 2;
  const maxChars = Math.max(6, Math.floor(pxWidth / (fsPx * 0.58)));
  const words = s.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length > maxLines) lines.length = maxLines;
  const used = lines.join(' ').length;
  if (used < s.length) {
    lines[lines.length - 1] = ellipsize(lines[lines.length - 1], Math.max(6, maxChars));
  }
  return lines.map((line, i) => ({ line, dy: i === 0 ? 0 : fsPx * 1.08 }));
}

/* ------------------------ Local stock & Pexels ------------------------ */

function pickLocalStockPath(kind, seed = Date.now()) {
  const dir = path.join(STOCK_DIR, kind);
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (files.length) {
      const idx = Math.floor(
        (typeof seed === 'number' ? seed : Date.now()) % files.length
      );
      return path.join(dir, files[idx]);
    }
  } catch {}
  try {
    const gdir = path.join(STOCK_DIR, 'generic');
    const gfiles = fs
      .readdirSync(gdir)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
    if (gfiles.length) {
      const idx = Math.floor(
        (typeof seed === 'number' ? seed : Date.now()) % gfiles.length
      );
      return path.join(gdir, gfiles[idx]);
    }
  } catch {}
  return null;
}

async function fetchPexelsPhotoBuffer(query, seed = Date.now()) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new Error('PEXELS_API_KEY missing');

  const page = 1 + (seed % 5);
  const perPage = 15;
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(
    query
  )}&per_page=${perPage}&page=${page}&orientation=square`;

  const json = await fetchBuffer(url, { Authorization: key });
  let data;
  try {
    data = JSON.parse(json.toString('utf8'));
  } catch {
    throw new Error('pexels JSON parse error');
  }

  const arr = Array.isArray(data?.photos) ? data.photos : [];
  if (!arr.length) throw new Error('pexels: no results');

  const pick = arr[Math.floor((seed * 13) % arr.length)];
  const src =
    pick?.src?.large2x ||
    pick?.src?.large ||
    pick?.src?.original ||
    pick?.src?.medium;
  if (!src) throw new Error('pexels: no src');

  return await fetchBuffer(src);
}

function pexelsQueryForKind(kind, hint = '') {
  const h = (hint || '').trim();
  const map = {
    fashion:
      h || 'fashion clothing rack apparel boutique models streetwear',
    electronics:
      h || 'electronics gadgets laptop smartphone tech workspace',
    restaurant: h || 'restaurant food dining table dishes gourmet chef',
    coffee: h || 'coffee shop cafe espresso cappuccino latte barista',
    pets: h || 'pets dogs cats pet care grooming',
    real_estate:
      h || 'modern home interior living room kitchen real estate',
    flooring: h || 'hardwood floor vinyl tile flooring interior',
    fitness: h || 'gym fitness workout training weights',
    salon_spa: h || 'salon spa beauty hair nails skin care',
    auto: h || 'auto repair car garage mechanic workshop',
    landscaping: h || 'landscaping lawn garden yard mowing',
    hvac_plumbing: h || 'plumbing hvac air conditioner furnace repair',
    home_cleaning: h || 'cleaning service home cleaning tidy house',
    generic: h || 'small business storefront local shop',
  };
  return map[kind] || map.generic;
}

async function buildPosterBackgroundFromPhotoBuffer({
  width = 1080,
  height = 1080,
  photoBuffer,
}) {
  if (!photoBuffer) throw new Error('no photo buffer provided');

  const base = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 12, g: 18, b: 24 },
    },
  }).png();

  const photo = await sharp(photoBuffer)
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .modulate({ saturation: 0.9, brightness: 1.02 })
    .blur(6)
    .png()
    .toBuffer();

  return await base
    .composite([{ input: photo, gravity: 'centre', blend: 'over' }])
    .png()
    .toBuffer();
}

/* ------------------------ Validation ------------------------ */

const flyerSchema = {
  type: 'object',
  required: ['inputs', 'knobs'],
  properties: {
    template: { enum: ['flyer_a', 'poster_b', 'auto'] },
    inputs: {
      type: 'object',
      required: ['industry', 'businessName', 'phone', 'location', 'headline', 'subline', 'cta'],
      properties: {
        industry: { type: 'string', maxLength: 60 },
        businessName: { type: 'string', maxLength: 60 },
        phone: { type: 'string', maxLength: 32 },
        website: { type: 'string', maxLength: 120 },
        location: { type: 'string', maxLength: 60 },
        headline: { type: 'string', maxLength: 60 },
        subline: { type: 'string', maxLength: 120 },
        cta: { type: 'string', maxLength: 32 },
      },
    },
    knobs: { type: 'object' },
  },
};

const posterSchema = {
  type: 'object',
  required: ['inputs', 'knobs'],
  properties: {
    template: { enum: ['flyer_a', 'poster_b', 'auto'] },
    inputs: {
      type: 'object',
      required: ['industry', 'businessName', 'location'],
      properties: {
        industry: { type: 'string', maxLength: 60 },
        businessName: { type: 'string', maxLength: 60 },
        location: { type: 'string', maxLength: 60 },
      },
    },
    knobs: { type: 'object' },
  },
};

/* ------------------------ /generate-static-ad ------------------------ */

router.post('/generate-static-ad', async (req, res) => {
  try {
    const body = req.body || {};
    const templateReq = (body.template || 'auto').toString();
    const inputs = body.inputs || {};
    const knobs = body.knobs || {};
    const a = body.answers && typeof body.answers === 'object' ? body.answers : {};

    const industry = inputs.industry || a.industry || 'Local Services';
    const prof = profileForIndustry(industry);

    const template =
      templateReq !== 'auto'
        ? templateReq
        : ['fashion', 'electronics', 'pets', 'coffee', 'restaurant', 'real_estate', 'flooring'].includes(
            prof.kind
          )
        ? 'poster_b'
        : 'flyer_a';

    /* ---------- FLYER A ---------- */
    if (template === 'flyer_a') {
      const mergedInputs = {
        industry,
        businessName: inputs.businessName || a.businessName || 'Your Brand',
        phone: inputs.phone || a.phone || '(000) 000-0000',
        location: inputs.location || a.location || 'Your City',
        website: inputs.website || a.website || '',
        headline: inputs.headline || prof.headline,
        subline: inputs.subline || prof.subline,
        cta: inputs.cta || prof.cta,
      };

      const mergedKnobs = {
        size: knobs.size || '1080x1080',
        palette: knobs.palette || prof.palette,
        lists: knobs.lists || prof.lists,
        coverage: knobs.coverage || prof.coverage || '',
        showIcons: knobs.showIcons !== undefined ? knobs.showIcons : true,
        headerSplitDiagonal:
          knobs.headerSplitDiagonal !== undefined ? knobs.headerSplitDiagonal : true,
        roundedOuter:
          knobs.roundedOuter !== undefined ? knobs.roundedOuter : true,
        backgroundHint: knobs.backgroundHint || prof.bgHint || 'generic',
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
        lists: listsLaidOut,
      };

      const svgTpl = tplFlyerA({ W: 1080, H: 1080 });
      const svg = mustache.render(svgTpl, vars);

      const base = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const svgName = `${base}.svg`;
      const pngName = `${base}.png`;

      fs.writeFileSync(path.join(GEN_DIR, svgName), svg, 'utf8');
      await sharp(Buffer.from(svg))
        .png({ quality: 92 })
        .toFile(path.join(GEN_DIR, pngName));

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
        ready: true,
      });
    }

    /* ---------- POSTER B (photo) ---------- */

    // Prefer GPT-crafted copy from frontend; else craft here
    let crafted =
      body.copy && typeof body.copy === 'object' ? body.copy : null;

    if (crafted) {
      const safeHeadline = clampWords(cleanLine(crafted.headline || ''), 6);
      const safeSubline = clampWords(cleanLine(crafted.subline || ''), 14);
      const safeOffer = tightenOfferText(crafted.offer || '');
      const safeSecondary = clampWords(cleanLine(crafted.secondary || ''), 10);
      const safeBullets = Array.isArray(crafted.bullets)
        ? crafted.bullets
            .map((b) => clampWords(cleanLine(b || ''), 5))
            .slice(0, 4)
        : [];

      crafted = {
        headline: safeHeadline,
        subline: safeSubline,
        offer: safeOffer,
        secondary: safeSecondary,
        bullets: safeBullets,
        disclaimers: (crafted.disclaimers || '').toString().trim(),
      };
    } else {
      const rb = craftCopyFromAnswers({ ...a, industry }, prof);
      crafted =
        rb?.copy || {
          headline: '',
          subline: '',
          offer: '',
          secondary: '',
          bullets: [],
          disclaimers: '',
        };
    }

    console.log('[poster_b] using copy:', crafted);

    const get = (k, def = '') => a[k] ?? inputs[k] ?? knobs[k] ?? def;

    const mergedInputsB = {
      industry,
      businessName: get('businessName', 'Your Brand'),
      location: get('location', 'Your City'),
    };

    // Build final fields ONLY from crafted copy (for text)
    const userOfferRaw = (a.offer || a.saveAmount || '').toString();

    const autoFields = {
      eventTitle: (crafted.headline || '').toString(),
      dateRange: (crafted.subline || '').toString(),
      saveAmount: tightenOfferText(userOfferRaw),
      financing: (crafted.secondary || '').toString(),
      qualifiers: (
        [
          crafted.subline,
          // keep qualifier line compact; bullets are separate
        ]
          .filter(Boolean)
          .join(' • ')
      ).toString(),
      legal: (crafted.disclaimers || '').toString(),
      palette: knobs.palette || prof.palette,
      bullets: Array.isArray(crafted.bullets) ? crafted.bullets : [],
    };

    const mergedKnobsB = {
      size: get('size', knobs.size || '1080x1080'),
      backgroundUrl: get('backgroundUrl', knobs.backgroundUrl || ''),
      backgroundHint:
        get('backgroundHint', knobs.backgroundHint || prof.bgHint || ''),
      eventTitle: autoFields.eventTitle,
      dateRange: autoFields.dateRange,
      saveAmount: autoFields.saveAmount,
      financingLine: autoFields.financing,
      qualifiers: autoFields.qualifiers,
      legal: autoFields.legal,
      palette: autoFields.palette,
      bullets: autoFields.bullets || [],
    };

    const validateB = ajv.compile(posterSchema);
    if (
      !validateB({
        template,
        inputs: mergedInputsB,
        knobs: mergedKnobsB,
      })
    ) {
      throw new Error('validation failed: ' + JSON.stringify(validateB.errors));
    }

    // ---------- build background photo ----------
    let photoBuf = null;
    const seed = Date.now();

    if (mergedKnobsB.backgroundUrl) {
      try {
        photoBuf = await fetchBuffer(mergedKnobsB.backgroundUrl);
      } catch (e) {
        console.warn('[poster_b] backgroundUrl fetch failed → try Pexels/local:', e.message);
      }
    }
    if (!photoBuf) {
      try {
        const q = pexelsQueryForKind(
          classifyIndustry(industry),
          mergedKnobsB.backgroundHint
        );
        photoBuf = await fetchPexelsPhotoBuffer(q, seed);
      } catch (e) {
        console.warn('[poster_b] Pexels fetch failed:', e.message);
      }
    }
    if (!photoBuf) {
      const localPath = pickLocalStockPath(classifyIndustry(industry), seed);
      if (localPath) {
        try {
          photoBuf = fs.readFileSync(localPath);
        } catch {}
      }
    }
    if (!photoBuf) {
      try {
        photoBuf = await fetchBuffer(selfUrl(req, '/__fallback/1200.jpg'));
      } catch {}
    }
    if (!photoBuf) throw new Error('no background photo available');

    const bgPng = await buildPosterBackgroundFromPhotoBuffer({
      width: 1080,
      height: 1080,
      photoBuffer: photoBuf,
    });

    // ---------- card layout (Shaw-style) ----------
    const lenTitle = String(mergedKnobsB.eventTitle || '').length;
    const lenSave = String(mergedKnobsB.saveAmount || '').length;
    const fsTitle = clamp(92 - Math.max(0, lenTitle - 14) * 2.4, 56, 92);
    const fsSave = clamp(76 - Math.max(0, lenSave - 12) * 2.2, 46, 76);
    const fsH2 = 38;
    const fsBody = 30;

    const cardW = 860,
      cardH = 660,
      padX = 60,
      padY = 56;

    const eventTitleLines = wrapTextToWidth(
      mergedKnobsB.eventTitle,
      fsTitle,
      cardW,
      padX,
      2
    );
    const qualifierLines = wrapTextToWidth(
      mergedKnobsB.qualifiers,
      fsBody,
      cardW,
      padX,
      2
    );

    // bullets: 2–3 short lines, stacked with dot prefix
    const bulletLines = Array.isArray(mergedKnobsB.bullets)
      ? mergedKnobsB.bullets
          .map((b) => cleanLine(String(b || '')))
          .filter(Boolean)
          .slice(0, 3)
          .map((line, i) => ({
            line,
            dy: i === 0 ? 0 : fsBody * 1.28,
          }))
      : [];

    const titleBlock =
      Math.max(1, eventTitleLines.length) * (fsTitle * 1.08);
    const titleTop = padY + fsTitle;
    const dateY = titleTop + titleBlock + 20;
    const dividerY = dateY + 28;
    const saveY = dividerY + 22 + fsSave * 1.05;
    const financeY = saveY + fsH2 * 1.25;
    const qualY = financeY + 32;

    const hasQual = qualifierLines.length > 0;
    const hasBullets = bulletLines.length > 0;
    const bulletStartY = hasBullets
      ? hasQual
        ? qualY + fsBody * 1.7
        : financeY + fsBody * 1.4
      : 0;

    const metrics = {
      titleY: titleTop,
      dateY,
      dividerY,
      saveY,
      financeY,
      qualY,
      bulletStartY,
    };

    const cardVars = {
      brandName: ellipsize(mergedInputsB.businessName, 22),
      eventTitleLines,
      qualifierLines,
      bulletLines,
      hasBullets,
      dateRange: mergedKnobsB.dateRange,
      saveAmount: mergedKnobsB.saveAmount,
      financingLine: mergedKnobsB.financingLine,
      legal: mergedKnobsB.legal,
      accent: mergedKnobsB.palette.accent || '#ff7b41',
      metrics,
    };

    const cardSvg = mustache.render(
      tplPosterBCard({
        cardW,
        cardH,
        padX,
        padY,
        fsTitle,
        fsH2,
        fsSave,
        fsBody,
        metrics,
      }),
      cardVars
    );
    const cardPng = await sharp(Buffer.from(cardSvg)).png().toBuffer();

    const left = Math.round((1080 - cardW) / 2);
    const top = Math.round((1080 - cardH) / 2);

    const finalPng = await sharp(bgPng)
      .composite([{ input: cardPng, left, top }])
      .png({ quality: 92 })
      .toBuffer();

    const baseB = `static-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const pngNameB = `${baseB}.png`;
    await fs.promises.writeFile(path.join(GEN_DIR, pngNameB), finalPng);

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
      ready: true,
    });
  } catch (err) {
    console.error('[generate-static-ad]', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

/* ------------------------ proxy-img ------------------------ */

async function proxyImgHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== 'string') return res.status(400).send('missing u');

    const passHeaders = {};
    if (req.headers['range']) passHeaders['Range'] = req.headers['range'];

    const { status, headers, body } = await fetchUpstream('GET', u, passHeaders);

    res.status(status || 200);
    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = k.toLowerCase();
      if (['transfer-encoding', 'connection'].includes(key)) return;
      res.setHeader(k, v);
    });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Accept-Ranges', headers?.['accept-ranges'] || 'bytes');

    return res.end(body);
  } catch (e) {
    console.error('[proxy-img GET]', e);
    res.status(502).send('bad upstream');
  }
}

async function proxyHeadHandler(req, res) {
  try {
    const u = req.query.u;
    if (!u || typeof u !== 'string') return res.status(400).end();

    const passHeaders = {};
    if (req.headers['range']) passHeaders['Range'] = req.headers['range'];

    const { status, headers } = await fetchUpstream('HEAD', u, passHeaders);

    res.status(status || 200);
    Object.entries(headers || {}).forEach(([k, v]) => {
      if (!k) return;
      const key = k.toLowerCase();
      if (['transfer-encoding', 'connection'].includes(key)) return;
      res.setHeader(k, v);
    });
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Accept-Ranges', headers?.['accept-ranges'] || 'bytes');

    return res.end();
  } catch (e) {
    console.error('[proxy-img HEAD]', e);
    res.status(502).end();
  }
}

router.get('/proxy-img', proxyImgHandler);
router.head('/proxy-img', proxyHeadHandler);

/* ------------------------ /generate-image-from-prompt ------------------------ */

router.post('/generate-image-from-prompt', async (req, res) => {
  try {
    const b = req.body || {};
    const a = b.answers || {};
    const industry = a.industry || b.industry || 'Local Services';
    const businessName = a.businessName || b.businessName || 'Your Brand';
    const location = a.location || b.location || 'Your City';
    const backgroundUrl = a.backgroundUrl || b.backgroundUrl || '';

    const overlay = {
      headline: (a.headline || b.overlayHeadline || '').toString().slice(0, 55),
      body: a.adCopy || b.overlayBody || '',
      offer: a.offer || '',
      promoLine: a.promoLine || '',
      secondary: a.secondary || '',
      cta: a.cta || b.overlayCTA || 'Learn more',
      legal: a.legal || '',
    };

    const prof = profileForIndustry(industry);
    const isPoster = [
      'fashion',
      'electronics',
      'pets',
      'coffee',
      'restaurant',
      'real_estate',
      'flooring',
    ].includes(prof.kind);

    const W = 1080,
      H = 1080;
    const files = [];

    if (isPoster) {
      const seeds = [Date.now(), Date.now() + 7777];
      for (const seed of seeds) {
        let photoBuf = null;
        if (backgroundUrl) {
          try {
            photoBuf = await fetchBuffer(backgroundUrl);
          } catch {}
        }
        if (!photoBuf) {
          try {
            const q = pexelsQueryForKind(prof.kind, prof.bgHint);
            photoBuf = await fetchPexelsPhotoBuffer(q, seed);
          } catch (e) {
            console.warn('[generate-image-from-prompt] Pexels failed:', e.message);
          }
        }
        if (!photoBuf) {
          const localPath = pickLocalStockPath(prof.kind, seed);
          if (localPath) {
            try {
              photoBuf = fs.readFileSync(localPath);
            } catch {}
          }
        }
        if (!photoBuf) {
          try {
            photoBuf = await fetchBuffer(selfUrl(req, '/__fallback/1200.jpg'));
          } catch {}
        }
        if (!photoBuf) throw new Error('no background photo');

        const bgPng = await buildPosterBackgroundFromPhotoBuffer({
          width: W,
          height: H,
          photoBuffer: photoBuf,
        });

        const eventTitle = (overlay.headline || '').trim();
        const dateRange = (overlay.promoLine || '').trim();
        const saveAmount = (overlay.offer || '').trim();
        const financingLn = (overlay.secondary || '').trim();
        const qualifiers = (overlay.body || '').trim();
        const legal = (overlay.legal || '').trim();

        const fsTitle = 88,
          fsH2 = 36,
          fsSave = 72,
          fsBody = 28;
        const cardW = 860,
          cardH = 660,
          padX = 60,
          padY = 56;

        const eventTitleLines = wrapTextToWidth(
          eventTitle,
          fsTitle,
          cardW,
          padX,
          2
        );
        const qualifierLines = wrapTextToWidth(
          qualifiers,
          fsBody,
          cardW,
          padX,
          2
        );
        const bulletLines = []; // regen path has no structured bullets

        const titleBlock =
          Math.max(1, eventTitleLines.length) * (fsTitle * 1.08);
        const titleTop = padY + fsTitle;
        const dateY = titleTop + titleBlock + 20;
        const dividerY = dateY + 28;
        const saveY = dividerY + 22 + fsSave * 1.05;
        const financeY = saveY + fsH2 * 1.25;
        const qualY = financeY + 32;
        const bulletStartY = qualY + fsBody * 1.6;

        const metrics = {
          titleY: titleTop,
          dateY,
          dividerY,
          saveY,
          financeY,
          qualY,
          bulletStartY,
        };

        const cardVars = {
          brandName: ellipsize(businessName, 22),
          eventTitleLines,
          qualifierLines,
          bulletLines,
          dateRange,
          saveAmount,
          financingLine: financingLn,
          legal,
          accent: (prof.palette && prof.palette.accent) || '#ff7b41',
          metrics,
        };
        const cardSvg = mustache.render(
          tplPosterBCard({
            cardW,
            cardH,
            padX,
            padY,
            fsTitle,
            fsH2,
            fsSave,
            fsBody,
            metrics,
          }),
          cardVars
        );
        const cardPng = await sharp(Buffer.from(cardSvg)).png().toBuffer();

        const left = Math.round((W - cardW) / 2);
        const top = Math.round((H - cardH) / 2);

        const finalPng = await sharp(bgPng)
          .composite([{ input: cardPng, left, top }])
          .png({ quality: 92 })
          .toBuffer();

        const fname = `static-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.png`;
        await fs.promises.writeFile(path.join(GEN_DIR, fname), finalPng);
        files.push({ absoluteUrl: makeMediaUrl(req, fname) });
      }
    } else {
      const palette =
        prof.palette || {
          header: '#0d3b66',
          body: '#dff3f4',
          accent: '#ff8b4a',
          textOnDark: '#ffffff',
          textOnLight: '#2b3a44',
        };
      const lists = withListLayout(
        prof.lists || {
          left: ['Free Quote', 'Same-Day', 'Licensed', 'Insured'],
          right: ['Great Reviews', 'Family Owned', 'Fair Prices', 'Guaranteed'],
        }
      );
      const vars = {
        headline: overlay.headline || prof.headline || 'LOCAL SERVICES',
        subline: overlay.body || prof.subline || 'Reliable • Friendly • On Time',
        phone: a.phone || '(000) 000-0000',
        cta: overlay.cta || prof.cta || 'Contact Us',
        coverage: prof.coverage || 'Serving your area',
        palette,
        accentLeft: palette.accent,
        accentRight: '#1f3b58',
        lists,
      };
      const svg = mustache.render(tplFlyerA({ W, H }), vars);
      const pngBuf = await sharp(Buffer.from(svg))
        .png({ quality: 92 })
        .toBuffer();
      for (let i = 0; i < 2; i++) {
        const fname = `static-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.png`;
        await fs.promises.writeFile(path.join(GEN_DIR, fname), pngBuf);
        files.push({ absoluteUrl: makeMediaUrl(req, fname) });
      }
    }

    return res.json({ ok: true, images: files });
  } catch (err) {
    console.error('[generate-image-from-prompt]', err);
    res.status(400).json({ ok: false, error: String(err?.message || err) });
  }
});

/* ------------------------ /craft-ad-copy ------------------------ */

router.post('/craft-ad-copy', async (req, res) => {
  try {
    const b = req.body || {};
    const a = b.answers || b || {};
    const prof = profileForIndustry(a.industry || '');
    let rawCopy = await generateSmartCopyWithOpenAI(a, prof);
    if (!rawCopy) {
      const rb = craftCopyFromAnswers(a, prof);
      rawCopy = rb?.copy || null;
    }
    if (!rawCopy)
      return res.status(400).json({ ok: false, error: 'copy failed' });

    const safeOffer = tightenOfferText(a.offer || a.saveAmount || '');

    const copy = {
      headline: clampWords(cleanLine(rawCopy.headline || ''), 6),
      subline: clampWords(cleanLine(rawCopy.subline || ''), 14),
      offer: safeOffer,
      secondary: clampWords(cleanLine(rawCopy.secondary || ''), 10),
      bullets: Array.isArray(rawCopy.bullets)
        ? rawCopy.bullets
            .map((b) => clampWords(cleanLine(b || ''), 7))
            .slice(0, 4)
        : [],
      disclaimers: (rawCopy.disclaimers || '').toString().trim(),
    };

    return res.json({ ok: true, copy });
  } catch (e) {
    console.error('[craft-ad-copy]', e);
    return res.status(400).json({ ok: false, error: String(e?.message || e) });
  }
});

/* ------------------------ Exports ------------------------ */
module.exports = router;
module.exports.proxyImgHandler = proxyImgHandler;
module.exports.proxyHeadHandler = proxyHeadHandler;
