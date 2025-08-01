// server/routes/ai.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Load Pexels API key from environment
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;

// --- Use system font for overlay (no font file needed) ---
const TextToSVG = require('text-to-svg');
const textToSvg = TextToSVG.loadSync(); // Uses default system font (Arial/sans-serif on most OS)

// ----------- UNIVERSAL TRAINING FILE LOADER -----------
const dataDir = path.join(__dirname, '../data');
const TRAINING_DOCS = fs.existsSync(dataDir)
  ? fs.readdirSync(dataDir).map(file => path.join(dataDir, file))
  : [];

let customContext = '';
for (const file of TRAINING_DOCS) {
  try {
    if (file.endsWith('.docx')) {
      const buffer = fs.readFileSync(file);
      customContext += buffer.toString('utf8') + '\n\n';
    } else {
      customContext += fs.readFileSync(file, 'utf8') + '\n\n';
    }
    console.log(`Loaded training file: ${file}`);
  } catch (e) {
    console.warn(`Could not load file: ${file}:`, e.message);
  }
}

// ----------- OPENAI -----------
const { OpenAI } = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ========== QUICK TEST ENDPOINT ==========
router.get('/test', (req, res) => {
  res.json({ msg: "AI route is working!" });
});

// ========== AI: EXPERT AD COPY GENERATOR ==========
router.post('/generate-ad-copy', async (req, res) => {
  const { description = "", businessName = "", url = "" } = req.body;
  if (!description && !businessName && !url) {
    return res.status(400).json({ error: "Please provide at least a description." });
  }
  let prompt = `Write only the exact words for a spoken video ad script for this business, no scene directions, no director notes, only what the voiceover should say. Script should be around 110–130 words, spoken naturally in 30 seconds. Make it friendly, confident, and include a brief intro, 2-3 unique benefits, and a call to action at the end. Respond with ONLY the script, nothing else.`;
  if (description) prompt += `\nBusiness Description: ${description}`;
  if (businessName) prompt += `\nBusiness Name: ${businessName}`;
  if (url) prompt += `\nWebsite: ${url}`;
  prompt += `\nUse a powerful call to action. Output only the ad copy.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 120,
    });
    const adCopy = response.choices?.[0]?.message?.content?.trim() || "";
    return res.json({ adCopy });
  } catch (err) {
    console.error("Ad Copy Generation Error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Failed to generate ad copy" });
  }
});

// ========== AI: AUTOMATIC AUDIENCE DETECTION ==========
const DEFAULT_AUDIENCE = {
  brandName: "",
  demographic: "",
  ageRange: "18-65",
  location: "US",
  interests: "Business, Restaurants",
  fbInterestIds: [],
  summary: ""
};

async function getWebsiteText(url) {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    return data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3500);
  } catch (err) {
    console.warn("Could not scrape website text for:", url);
    return '';
  }
}

async function extractKeywords(text) {
  const prompt = `
Extract 3-6 of the most relevant keywords or topics (comma-separated, lowercase, no duplicates) from the text below. Only output a comma-separated string, no extra text.

Website text:
"""${text}"""
`;
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 40,
      temperature: 0.2,
    });
    return response.choices?.[0]?.message?.content
      .replace(/[\n.]/g, "")
      .toLowerCase()
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function getFbInterestIds(keywords, fbToken) {
  const results = [];
  for (let keyword of keywords) {
    try {
      const resp = await axios.get(
        `https://graph.facebook.com/v18.0/search`,
        {
          params: {
            type: "adinterest",
            q: keyword,
            access_token: fbToken,
            limit: 1
          }
        }
      );
      if (
        resp.data &&
        Array.isArray(resp.data.data) &&
        resp.data.data[0] &&
        resp.data.data[0].id
      ) {
        results.push({
          id: resp.data.data[0].id,
          name: resp.data.data[0].name
        });
      }
    } catch (err) {}
  }
  return results;
}

// POST /api/detect-audience
router.post('/detect-audience', async (req, res) => {
  const { url, fbToken } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  const websiteText = await getWebsiteText(url);

  if (!websiteText || websiteText.length < 100) {
    return res.json({ audience: DEFAULT_AUDIENCE });
  }

  const prompt = `
Analyze this website's homepage content and answer ONLY in the following JSON format:

{
  "brandName": "",
  "demographic": "",
  "ageRange": "",
  "location": "",
  "interests": "",
  "summary": ""
}

Website homepage text:
"""${websiteText}"""
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.3,
    });
    const aiText = response.choices?.[0]?.message?.content?.trim();
    let audienceJson = null;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      audienceJson = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);
      audienceJson = {
        brandName: audienceJson.brandName || "",
        demographic: audienceJson.demographic || "",
        ageRange: /^\d{2}-\d{2}$/.test(audienceJson.ageRange || "") ? audienceJson.ageRange : "18-65",
        location: typeof audienceJson.location === "string" && audienceJson.location.trim().length > 0
          ? audienceJson.location.trim().toUpperCase()
          : "US",
        interests: audienceJson.interests && String(audienceJson.interests).length > 0
          ? audienceJson.interests
          : "Business, Restaurants",
        summary: audienceJson.summary || ""
      };
    } catch (err) {
      return res.json({ audience: DEFAULT_AUDIENCE });
    }

    let fbInterestIds = [];
    if (fbToken) {
      const keywords = await extractKeywords(websiteText);
      const fbInterests = await getFbInterestIds(keywords, fbToken);
      fbInterestIds = fbInterests.map(i => i.id);
      audienceJson.fbInterestIds = fbInterestIds;
      audienceJson.fbInterestNames = fbInterests.map(i => i.name);
    } else {
      audienceJson.fbInterestIds = [];
      audienceJson.fbInterestNames = [];
    }

    return res.json({ audience: audienceJson });
  } catch (err) {
    return res.json({ audience: DEFAULT_AUDIENCE });
  }
});

router.post('/generate-campaign-assets', async (req, res) => {
  const { answers = {}, url = "" } = req.body;
  if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
    return res.status(400).json({ error: "Missing answers" });
  }

  let surveyStr = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');

  const prompt = `
You are an expert Facebook ads copywriter and creative strategist. Based only on the info below, return your answer STRICTLY in minified JSON (no markdown, no explanation, no extra words). Required fields: headline, body, image_prompt, video_script, image_overlay_text.

Rules for "image_overlay_text":
- Write a short, punchy, 7–10 word text for the image overlay.
- Make it direct, bold, and readable on a photo.
- Use ALL-CAPS. No punctuation.

Example:
{"headline":"30% Off for First-Time Customers!","body":"Hungry for pizza? Order now from Joe's Pizza and get 30% off your first order. Fresh, fast, and delicious — delivered to your door. Don't miss out!","image_prompt":"Close-up of a smiling chef holding a pizza box in a bright, modern kitchen, soft lighting, high energy, happy expression, NO text.","video_script":"[15s fast montage] Fresh dough tossed, oven flames, happy customers, ending with a call-to-action to order online now.","image_overlay_text":"ORDER NOW GET 30 PERCENT OFF FRESH FAST PIZZA"}

${customContext ? "Training context:\n" + customContext : ""}
Survey answers:
${surveyStr}
Website URL: ${url}
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a world-class Facebook ad copy, creative, and script expert. Never say you are an AI." },
        { role: "user", content: prompt }
      ],
      max_tokens: 750
    });
    const raw = response.choices?.[0]?.message?.content?.trim();
    let result;

    function tryParseJson(str) {
      let cleaned = str.replace(/```(json)?/gi, '').replace(/[\r\n]/g, ' ');
      const jsonMatch = cleaned.match(/\{.*\}/s);
      if (jsonMatch) cleaned = jsonMatch[0];
      cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      return JSON.parse(cleaned);
    }

    try {
      result = tryParseJson(raw);
      result.headline = result.headline || "";
      result.body = result.body || "";
      result.image_prompt = result.image_prompt || "";
      result.video_script = result.video_script || "";
      result.image_overlay_text = result.image_overlay_text || "";
    } catch (e) {
      console.error("Parse error! Raw AI output was:", raw);
      return res.status(500).json({
        error: "Failed to parse AI response",
        raw,
        parseError: e.message
      });
    }
    res.json(result);
  } catch (err) {
    console.error("Ad Campaign AI Error:", err?.response?.data || err.message);
    res.status(500).json({ error: "AI error", detail: err.message });
  }
});

// ========== AI: GENERATE IMAGE FROM PROMPT (PEXELS + GPT-4o) ==========

const PEXELS_BASE_URL = "https://api.pexels.com/v1/search";

router.post('/generate-image-from-prompt', async (req, res) => {
  try {
    const { url = "", industry = "", regenerateToken = "" } = req.body;
    let searchTerm = industry || url;
    if (!searchTerm) {
      return res.status(400).json({ error: "Missing url or industry" });
    }

    const gptPrompt = `
Given this business URL and industry, output only the most relevant 1-2 word search term for a stock photo (such as "gym", "restaurant", "pizza", "doctor", "salon", "fashion", "coffee shop", "bakery"). Do NOT use more than 2 words. Only output the search term. Do not include any quotes or extra words.

URL: ${url}
Industry: ${industry}
    `.trim();

    let keyword = "";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const gptRes = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: gptPrompt }],
        max_tokens: 6,
        temperature: 0.35
      }, { signal: controller.signal });
      clearTimeout(timeout);
      keyword = gptRes.choices?.[0]?.message?.content?.trim().replace(/["'.]/g, "");
      if (!keyword) keyword = industry || url;
    } catch (e) {
      keyword = industry || url;
    }

    const perPage = 15;
    let photos = [];
    try {
      const resp = await axios.get(PEXELS_BASE_URL, {
        headers: { Authorization: PEXELS_API_KEY },
        params: {
          query: keyword,
          per_page: perPage,
          cb: Date.now() + (regenerateToken || "")
        },
        timeout: 4800,
      });
      photos = resp.data.photos || [];
    } catch (err) {
      console.error("Pexels fetch error:", err?.message || err);
      return res.status(500).json({ error: "Image search failed" });
    }

    if (!photos.length) {
      return res.status(404).json({ error: "No images found for this topic." });
    }

    let imgIdx = 0;
    if (regenerateToken) {
      let hash = 0;
      for (let i = 0; i < regenerateToken.length; i++) {
        hash = (hash * 31 + regenerateToken.charCodeAt(i)) % perPage;
      }
      imgIdx = Math.abs(hash) % photos.length;
    } else {
      imgIdx = Math.floor(Math.random() * photos.length);
    }

    const img = photos[imgIdx];

    return res.json({
      imageUrl: img.src.large2x || img.src.original || img.src.large,
      photographer: img.photographer,
      pexelsUrl: img.url,
      keyword,
      totalResults: photos.length,
      usedIndex: imgIdx
    });
  } catch (err) {
    console.error("AI image generation error:", err?.message || err);
    res.status(500).json({ error: "Failed to fetch stock image", detail: err.message });
  }
});

// ========== AI: GENERATE IMAGE WITH OVERLAY (AUTO AI TEXT, 4-5 WORDS, PUNCTUATION) ==========
router.post('/generate-image-with-overlay', async (req, res) => {
  try {
    const { imageUrl, answers = {}, url = "" } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl required" });

    // --- Scrape website for extra context ---
    let websiteKeywords = [];
    if (url) {
      try {
        const websiteText = await getWebsiteText(url);
        websiteKeywords = await extractKeywords(websiteText);
      } catch (e) {
        websiteKeywords = [];
      }
    }

    // Prepare context for GPT
    const keysToShow = [
      "industry", "businessName", "url",
      ...Object.keys(answers).filter(k => !["industry", "businessName", "url"].includes(k))
    ];
    const formInfo = keysToShow
      .map(k => answers[k] && `${k}: ${answers[k]}`)
      .filter(Boolean)
      .join('\n');

    // --- NEW: Add keywords from website to prompt ---
    const prompt = `
You are the best Facebook ad copywriter. You are Jeremy Haynes.
Below you have:
- Business info from a form (see below).
- Website keywords: [${websiteKeywords.join(", ")}]

TASK:
1. Write an overlay headline (3-5 words) and CTA (3-6 words) for a stock ad image, based ONLY on this business, industry, and website. 
2. Headline and CTA must be **highly relevant to THIS business and industry**. Never generic, never vague, never a direct copy of the answers or keywords, but informed by them.
3. Headline must fit the business/industry (e.g. for dentist: "Brighten Your Smile Today", for gym: "Start Your Fitness Journey"). CTA must be a next step or benefit.
4. Write a CTA (3-6 words) that MUST end with an exclamation point (!).

Output ONLY valid minified JSON:
{"headline":"...","cta_box":"..."}

BUSINESS FORM INFO:
${formInfo}
WEBSITE KEYWORDS: [${websiteKeywords.join(", ")}]
    `.trim();

    let headline = "";
    let ctaText = "";
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a world-class Facebook ad overlay expert. Output ONLY valid JSON. Do not explain." },
          { role: "user", content: prompt }
        ],
        max_tokens: 120,
        temperature: 0.2,
      });
      const raw = response.choices?.[0]?.message?.content?.trim();
      let parsed = {};
      try {
        parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
      } catch (e) {
        parsed = {};
        console.warn("AI OVERLAY JSON PARSE FAIL:", raw); // DEBUG
      }
      headline = parsed.headline && parsed.headline.trim() ? parsed.headline : "GET MORE CLIENTS NOW!";
      ctaText = parsed.cta_box && parsed.cta_box.trim() ? parsed.cta_box : "BOOK YOUR FREE CALL.";
    } catch (e) {
      headline = "AI ERROR - CONTACT SUPPORT";
      ctaText = "SEE DETAILS";
    }

    headline = String(headline).toUpperCase();
    ctaText = String(ctaText).toUpperCase();

    // ...Rest of your image overlay code...



    // === ...the rest of your image processing logic follows as before... ===



    // Download and fit main image
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mainW = 1100, mainH = 550;
    let baseImage = await sharp(imgRes.data)
      .resize(mainW, mainH, { fit: 'cover' })
      .toBuffer();

    // Layout
    const svgW = 1200, svgH = 627;
    const borderW = 32, borderGap = 12;
    const imgX = borderW + borderGap, imgY = borderW + borderGap;
    const imgW = svgW - (borderW + borderGap) * 2;
    const imgH = svgH - (borderW + borderGap) * 2;

    // Font/box params
    const fontFamily = 'Times New Roman, Times, serif';

    // Headline fixed params
    const HEADLINE_BOX_W = 956, HEADLINE_BOX_H = 134;
    const HEADLINE_BOX_X = svgW / 2 - HEADLINE_BOX_W / 2;
    const HEADLINE_BOX_Y = 62;
    const HEADLINE_FONT_SIZE = 45;

    // CTA params
    const CTA_BOX_W = 540, CTA_BOX_H = 70;
    const CTA_BOX_X = svgW / 2 - CTA_BOX_W / 2;
    const CTA_BOX_Y = HEADLINE_BOX_Y + HEADLINE_BOX_H + 34;
    const CTA_FONT_SIZE = 26;

    // Glassmorph blur for headline box
    const blurStrength = 15;
    const headlineImg = await sharp(baseImage)
      .extract({
        left: Math.max(0, Math.round(HEADLINE_BOX_X - imgX)),
        top: Math.max(0, Math.round(HEADLINE_BOX_Y - imgY)),
        width: Math.round(HEADLINE_BOX_W),
        height: Math.round(HEADLINE_BOX_H)
      })
      .blur(blurStrength)
      .toBuffer();

    // Glassmorph blur for CTA
    const ctaImg = await sharp(baseImage)
      .extract({
        left: Math.max(0, Math.round(CTA_BOX_X - imgX)),
        top: Math.max(0, Math.round(CTA_BOX_Y - imgY)),
        width: Math.round(CTA_BOX_W),
        height: Math.round(CTA_BOX_H)
      })
      .blur(blurStrength)
      .toBuffer();

    // Helper for brightness (not used, keeping for ref)
    // async function getAverageBrightness(imgBuffer) { ... }

    const headlineTextColor = "#181b20";
    const ctaTextColor = "#181b20";

    // SVG helper
    function escapeForSVG(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    // Pick two distinct colors for borders
    const borderColors = ['#edead9', '#191919', '#193356']; // beige, black, navy
    let outerBorderColor = borderColors[Math.floor(Math.random() * borderColors.length)];
    let innerBorderColor = borderColors[Math.floor(Math.random() * borderColors.length)];
    while (innerBorderColor === outerBorderColor) {
      innerBorderColor = borderColors[Math.floor(Math.random() * borderColors.length)];
    }

    // --- Compose SVG ---
    const svg = `
<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
  <!-- Outer border -->
  <rect x="7" y="7" width="${svgW-14}" height="${svgH-14}" fill="none" stroke="${outerBorderColor}" stroke-width="10" rx="34"/>
  <!-- Inner border -->
  <rect x="27" y="27" width="${svgW-54}" height="${svgH-54}" fill="none" stroke="${innerBorderColor}" stroke-width="5" rx="20"/>
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#edead9" rx="26"/>
  <image href="data:image/jpeg;base64,${baseImage.toString('base64')}" x="${imgX+8}" y="${imgY+8}" width="${imgW-16}" height="${imgH-16}" />
  <!-- Glassmorph headline -->
  <image href="data:image/jpeg;base64,${headlineImg.toString('base64')}" x="${HEADLINE_BOX_X}" y="${HEADLINE_BOX_Y}" width="${HEADLINE_BOX_W}" height="${HEADLINE_BOX_H}" opacity="0.97"/>
  <rect x="${HEADLINE_BOX_X}" y="${HEADLINE_BOX_Y}" width="${HEADLINE_BOX_W}" height="${HEADLINE_BOX_H}" rx="22" fill="#ffffff38"/>
  <text
    x="${svgW/2}"
    y="${HEADLINE_BOX_Y + HEADLINE_BOX_H/2 + HEADLINE_FONT_SIZE/3}"
    text-anchor="middle"
    font-family="${fontFamily}"
    font-size="${HEADLINE_FONT_SIZE}"
    font-weight="bold"
    fill="${headlineTextColor}"
    alignment-baseline="middle"
    dominant-baseline="middle"
    letter-spacing="1"
  >${escapeForSVG(headline)}</text>
  <!-- Glassmorph CTA -->
  <image href="data:image/jpeg;base64,${ctaImg.toString('base64')}" x="${CTA_BOX_X}" y="${CTA_BOX_Y}" width="${CTA_BOX_W}" height="${CTA_BOX_H}" opacity="0.97"/>
  <rect x="${CTA_BOX_X}" y="${CTA_BOX_Y}" width="${CTA_BOX_W}" height="${CTA_BOX_H}" rx="19" fill="#ffffff38"/>
  <text
    x="${svgW/2}"
    y="${CTA_BOX_Y + CTA_BOX_H/2 + CTA_FONT_SIZE/3}"
    text-anchor="middle"
    font-family="${fontFamily}"
    font-size="${CTA_FONT_SIZE}"
    font-weight="bold"
    fill="${ctaTextColor}"
    alignment-baseline="middle"
    dominant-baseline="middle"
    letter-spacing="0.5"
  >${escapeForSVG(ctaText)}</text>
</svg>`;

    // --- Compose SVG on Image ---
    const genDir = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
    const fileName = `${uuidv4()}.jpg`;
    const filePath = path.join(genDir, fileName);

    const outBuffer = await sharp({
      create: {
        width: svgW,
        height: svgH,
        channels: 3,
        background: "#edead9"
      }
    })
      .composite([
        { input: Buffer.from(svg), top: 0, left: 0 }
      ])
      .jpeg({ quality: 98 })
      .toBuffer();

    fs.writeFileSync(filePath, outBuffer);

    const publicUrl = `/generated/${fileName}`;
    console.log("Glass overlay image saved at:", filePath, "and served as:", publicUrl);

    return res.json({ imageUrl: publicUrl, overlay: { headline, ctaText } });
  } catch (err) {
    console.error("Image overlay error:", err.message);
    return res.status(500).json({ error: "Failed to overlay image", detail: err.message });
  }
});

// ===== Music selection helper =====
// Folder: /server/Music.  Music files should be named like: "pizza.mp3", "gym.mp3", etc.
function pickMusicFile(keywords = []) {
  // Try to find a matching music file by keyword
  const musicDir = path.join(__dirname, '../Music');
  if (!fs.existsSync(musicDir)) return null;
  const files = fs.readdirSync(musicDir);
  // Lowercase filenames for match
  const filesLower = files.map(f => f.toLowerCase());
  for (let kw of keywords.map(x => String(x).toLowerCase())) {
    // Try exact match, then "contains"
    let idx = filesLower.findIndex(f => f === `${kw}.mp3`);
    if (idx !== -1) return path.join(musicDir, files[idx]);
    idx = filesLower.findIndex(f => f.includes(kw) && f.endsWith('.mp3'));
    if (idx !== -1) return path.join(musicDir, files[idx]);
  }
  // Default fallback (optional): first music file in folder
  if (files.length > 0) return path.join(musicDir, files[0]);
  return null;
}

// ========== AI: GENERATE VIDEO AD FOR E-COMMERCE ==========
const PEXELS_VIDEO_BASE = "https://api.pexels.com/videos/search";
const TTS_VOICE = "alloy";
const ffmpegPath = 'ffmpeg';
const child_process = require('child_process');
const util = require('util');
const exec = util.promisify(child_process.exec);

// Helper to download video files
async function downloadFile(url, dest) {
  const writer = fs.createWriteStream(dest);
  const response = await axios({ url, method: 'GET', responseType: 'stream' });
  await new Promise((resolve, reject) => {
    response.data.pipe(writer);
    let error = null;
    writer.on('error', err => { error = err; writer.close(); reject(err); });
    writer.on('close', () => { if (!error) resolve(); });
  });
  return dest;
}

router.post('/generate-video-ad', async (req, res) => {
  try {
    const { url = "", answers = {} } = req.body;
    const industry = answers?.industry || answers?.productType || "";

    // 1. Build a highly relevant search term for Pexels using industry + ecommerce + website scrape
    let videoKeywords = ["ecommerce"];
    if (industry) videoKeywords.push(industry);

    // Try to extract keywords from the user's website for extra relevance
    if (url) {
      try {
        const websiteText = await getWebsiteText(url);
        const siteKeywords = (await extractKeywords(websiteText)).slice(0, 2);
        videoKeywords.push(...siteKeywords);
      } catch (e) {}
    }

    // Unique, prioritized, always start with "ecommerce"
    videoKeywords = Array.from(new Set(videoKeywords.filter(Boolean)));
    const searchTerm = videoKeywords.slice(0, 2).join(" "); // e.g., "ecommerce jewelry"

    // 2. Fetch videos from Pexels (get 8 to ensure variety)
    let videoClips = [];
    try {
      const resp = await axios.get(PEXELS_VIDEO_BASE, {
        headers: { Authorization: PEXELS_API_KEY },
        params: { query: searchTerm, per_page: 8 }
      });
      videoClips = resp.data.videos || [];
    } catch (err) {
      return res.status(500).json({ error: "Stock video fetch failed" });
    }
    if (!videoClips.length) return res.status(404).json({ error: "No stock videos found" });

    // 3. Pick exactly 3 short, unique video clips
    let files = [];
    let usedIds = new Set();
    for (let v of videoClips) {
      let best = (v.video_files || []).find(f =>
        f.quality === 'sd' && f.width <= 1280 && f.link.endsWith('.mp4')
      ) || (v.video_files || [])[0];
      if (best && !usedIds.has(v.id)) {
        files.push(best.link);
        usedIds.add(v.id);
      }
      if (files.length === 3) break;
    }
    // Fallback: fill to 3 if needed
    if (files.length < 3) {
      for (let v of videoClips) {
        if (files.length >= 3) break;
        let f = (v.video_files || [])[0];
        if (f && !files.includes(f.link)) files.push(f.link);
      }
    }
    if (files.length < 3) return res.status(500).json({ error: "Could not find three suitable MP4 clips" });

    // 4. Download each video locally
    const tempDir = path.join(__dirname, '../tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const videoPaths = [];
    for (let i = 0; i < files.length; i++) {
      const dest = path.join(tempDir, `${uuidv4()}.mp4`);
      await downloadFile(files[i], dest);
      videoPaths.push(dest);
    }

    // 5. Generate script (strictly ad copy, 15–18s, no scene directions)
    let prompt = `Write ONLY the exact words for a Facebook video ad for an e-commerce business, selling any type of goods. DO NOT include scene directions, stage notes, or any non-spoken text—only the spoken script. Must be friendly, confident, 15–18 seconds long (45–55 words). Start with a hook, include 2–3 benefits, end with a call to action.`;
    if (industry) prompt += `\nIndustry: ${industry}`;
    if (answers && Object.keys(answers).length) {
      prompt += '\nBusiness Details:\n' + Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    if (url) prompt += `\nWebsite: ${url}`;
    prompt += "\nRespond ONLY with the script. No headings. No intro.";

    const gptRes = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 110,
      temperature: 0.65
    });
    let script = gptRes.choices?.[0]?.message?.content?.trim() || "Shop the best products online now!";

    // 6. Generate TTS
    const ttsRes = await openai.audio.speech.create({
      model: 'tts-1',
      voice: TTS_VOICE,
      input: script
    });
    const ttsBuffer = Buffer.from(await ttsRes.arrayBuffer());
    const ttsPath = path.join(tempDir, `${uuidv4()}.mp3`);
    fs.writeFileSync(ttsPath, ttsBuffer);

    // 7. Get duration of voiceover (in seconds)
    const ffprobeCmd = `ffprobe -i "${ttsPath}" -show_entries format=duration -v quiet -of csv="p=0"`;
    const { stdout } = await exec(ffprobeCmd);
    let duration = parseFloat(stdout.trim());
    if (!duration || isNaN(duration)) duration = 16;
    duration = Math.ceil(duration); // Round up to ensure complete voiceover

    // 8. Concatenate videos (segment to 3 equal parts)
    // Use ffmpeg -t and -ss to split each video into 1/3 of total duration if they're too long,
    // but if not, just concatenate and let -shortest handle.
    // (Most Pexels clips are short enough, so this usually "just works".)
    const listPath = path.join(tempDir, `${uuidv4()}.txt`);
    fs.writeFileSync(listPath, videoPaths.map(p => `file '${p}'`).join('\n'));

    // Output dir and file
    const genDir = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
    const videoId = uuidv4();
    const outPath = path.join(genDir, `${videoId}.mp4`);

    // FFmpeg: concat, add audio, trim to exactly match TTS duration
    const ffmpegCmd = [
      `${ffmpegPath} -y -f concat -safe 0 -i "${listPath}" -c copy "${outPath}.temp.mp4"`,
      `${ffmpegPath} -y -i "${outPath}.temp.mp4" -i "${ttsPath}" -map 0:v:0 -map 1:a:0 -shortest -t ${duration} -c:v libx264 -c:a aac -b:a 192k -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${outPath}"`
    ];
    for (let cmd of ffmpegCmd) await exec(cmd);

    // Clean up temp files
    [...videoPaths, ttsPath, listPath, `${outPath}.temp.mp4`].forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });

    // Respond with the generated video url and script
    const publicUrl = `/generated/${videoId}.mp4`;
    return res.json({ videoUrl: publicUrl, script, voice: TTS_VOICE });

  } catch (err) {
    console.error("Video generation error:", err.message, err?.response?.data || "");
    return res.status(500).json({ error: "Failed to generate video ad", detail: err.message });
  }
});


module.exports = router;
