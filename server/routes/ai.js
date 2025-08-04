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

// Robust website scraping
async function getWebsiteText(url) {
  try {
    const { data, headers } = await axios.get(url, { timeout: 7000 });
    // Only allow HTML content
    if (!headers['content-type'] || !headers['content-type'].includes('text/html')) {
      throw new Error('Not an HTML page');
    }
    // Remove <script> and <style> blocks, then HTML tags, then extra whitespace
    const body = String(data)
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const lower = body.toLowerCase();
    if (
      lower.includes("cloudflare") ||
      lower.includes("access denied") ||
      lower.includes("error occurred") ||
      lower.length < 200
    ) {
      throw new Error("Failed to get usable website text (blocked or not enough content)");
    }
    return body.slice(0, 3500);
  } catch (err) {
    console.warn("Could not scrape website text for:", url, "Reason:", err.message);
    return '';
  }
}

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
  const safeWebsiteText = (websiteText && websiteText.length > 100)
    ? websiteText
    : '[WEBSITE TEXT UNAVAILABLE]';

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
"""${safeWebsiteText}"""
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
  try {
    const { answers = {}, url = "" } = req.body;
    if (!answers || typeof answers !== "object" || Object.keys(answers).length === 0) {
      return res.status(400).json({ error: "Missing answers" });
    }

    const websiteText = await getWebsiteText(url).catch(() => '');
    const safeWebsiteText = (websiteText && websiteText.length > 100)
      ? websiteText
      : '[WEBSITE TEXT UNAVAILABLE]';

    let surveyStr = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');

    const prompt = `
You are an expert Facebook ads copywriter and creative strategist. Based only on the info below, return your answer STRICTLY in minified JSON (no markdown, no explanation, no extra words). Required fields: headline, body, image_prompt, video_script, image_overlay_text.

Rules for "image_overlay_text":
- Write a short, punchy, 7–10 word text for the image overlay.
- Make it direct, bold, and readable on a photo.
- Use ALL-CAPS. No punctuation.

${customContext ? "Training context:\n" + customContext : ""}
Survey answers:
${surveyStr}
Website text:
"""${safeWebsiteText}"""
`;

    // Clean parser
    function tryParseJson(str) {
      try {
        let cleaned = String(str)
          .replace(/```json|```/gi, '')
          .replace(/^[\s\r\n]+|[\s\r\n]+$/g, '')
          .trim();

        const braceIdx = cleaned.indexOf('{');
        if (braceIdx > 0) cleaned = cleaned.slice(braceIdx);
        cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        const braceCount = (cleaned.match(/{/g) || []).length;
        if (braceCount > 1) {
          const lastBrace = cleaned.lastIndexOf('}');
          cleaned = cleaned.substring(0, lastBrace + 1);
        }
        return JSON.parse(cleaned);
      } catch {
        return null;
      }
    }

    let raw, result;
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a world-class Facebook ad copy, creative, and script expert. Never say you are an AI." },
          { role: "user", content: prompt }
        ],
        max_tokens: 750
      });
      raw = response.choices?.[0]?.message?.content?.trim();
      result = tryParseJson(raw);
    } catch (err) {
      console.error("Ad Campaign AI Error:", err?.response?.data || err.message);
      return res.status(500).json({ error: "AI error", detail: err.message });
    }

    if (result && typeof result === "object") {
      // Always supply all fields
      return res.json({
        headline: result.headline || "",
        body: result.body || "",
        image_prompt: result.image_prompt || "",
        video_script: result.video_script || "",
        image_overlay_text: result.image_overlay_text || ""
      });
    } else {
      // AI did not return JSON, send a safe fallback
      console.error("Parse error! AI output was:", raw);
      return res.status(500).json({
        error: "Failed to parse AI response",
        aiRaw: raw || "",
        example: '{"headline":"...","body":"...","image_prompt":"...","video_script":"...","image_overlay_text":"..."}'
      });
    }
  } catch (err) {
    console.error("Unhandled campaign assets error:", err?.response?.data || err.message);
    return res.status(500).json({ error: "Unhandled error", detail: err.message });
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
      const resp = await axios.get("https://api.pexels.com/v1/search", {
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
    const generatedPath = path.join(__dirname, '../public/generated');
if (!fs.existsSync(generatedPath)) fs.mkdirSync(generatedPath, { recursive: true });
const fileName = `${uuidv4()}.jpg`;
const filePath = path.join(generatedPath, fileName);

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
const seedrandom = require('seedrandom');

// Helper to timeout any promise
function withTimeout(promise, ms, errorMsg = "Timeout") {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), ms))
  ]);
}

// Download with timeout and file size limit (FAST/Safe)
async function downloadFileWithTimeout(url, dest, timeoutMs = 10000, maxSizeMB = 5) {
  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(dest);
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      writer.close();
      try { fs.unlinkSync(dest); } catch {}
      reject(new Error("Download timed out"));
    }, timeoutMs);

    axios({ url, method: 'GET', responseType: 'stream' })
      .then(response => {
        let bytes = 0;
        response.data.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxSizeMB * 1024 * 1024 && !timedOut) {
            timedOut = true;
            writer.close();
            try { fs.unlinkSync(dest); } catch {}
            clearTimeout(timeout);
            reject(new Error("File too large"));
          }
        });
        response.data.pipe(writer);
        writer.on('finish', () => {
          clearTimeout(timeout);
          if (!timedOut) resolve(dest);
        });
        writer.on('error', err => {
          clearTimeout(timeout);
          try { fs.unlinkSync(dest); } catch {}
          if (!timedOut) reject(err);
        });
      })
      .catch(err => {
        clearTimeout(timeout);
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });
  });
}

// Helper: shuffle with token for regen
function getDeterministicShuffle(arr, seed) {
  let array = [...arr];
  let random = seedrandom(seed);
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- CTA Normalizer ---
function normalizeCTA(input) {
  if (!input) return "Get Started";
  const t = input.toLowerCase();
  if (t.includes("visit")) return "Visit Us!";
  if (t.includes("order")) return "Order Online";
  if (t.includes("buy")) return "Buy Now";
  if (t.includes("sign up")) return "Sign Up Today";
  if (t.includes("call")) return "Call Now";
  if (t.includes("learn")) return "Learn More";
  if (t.includes("book")) return "Book Now";
  if (t.includes("join")) return "Join Now";
  if (/^(i|we)\s*want|should|can|please|try|interested|contact|reach/.test(t)) return "Get Started";
  return input
    .replace(/^(i|we)\s*want (them|you) to\s*/i, '')
    .replace(/^to\s+/i, '')
    .replace(/[\.\!]+$/, '')
    .trim()
    .replace(/^\w/, c => c.toUpperCase())
    + "!";
}

router.post('/generate-video-ad', async (req, res) => {
  try {
    console.log("Step 1: Starting video ad generation...");

    const { url = "", answers = {}, regenerateToken = "" } = req.body;
    const productType = answers?.industry || answers?.productType || "";
    const overlayText = normalizeCTA(answers?.cta);

    // Step 1: Keywords for Pexels
    console.log("Step 2: Building video keywords...");
    let videoKeywords = ["ecommerce"];
    if (productType) videoKeywords.push(productType);
    if (url) {
      try {
        const websiteText = await withTimeout(getWebsiteText(url), 8000, "Website text fetch timed out");
        const siteKeywords = (await extractKeywords(websiteText)).slice(0, 2);
        videoKeywords.push(...siteKeywords);
      } catch (e) {
        console.log("Warning: website text unavailable or timeout");
      }
    }
    videoKeywords = Array.from(new Set(videoKeywords.filter(Boolean)));
    const searchTerm = videoKeywords.slice(0, 2).join(" ");
    console.log("Step 3: Pexels search term:", searchTerm);

    // Step 2: Fetch videos
    let videoClips = [];
    try {
      console.log("Step 4: Fetching videos from Pexels...");
      const resp = await withTimeout(
        axios.get(PEXELS_VIDEO_BASE, {
          headers: { Authorization: PEXELS_API_KEY },
          params: { query: searchTerm, per_page: 12, cb: Date.now() + (regenerateToken || "") }
        }),
        12000,
        "Pexels API timed out"
      );
      videoClips = resp.data.videos || [];
    } catch (err) {
      console.error("Pexels fetch failed:", err.message);
      return res.status(500).json({ error: "Stock video fetch failed", detail: err?.message || err?.toString() });
    }
    if (videoClips.length < 3) {
      console.error("Not enough stock videos found");
      return res.status(404).json({ error: "Not enough stock videos found" });
    }

    // Step 3: Shuffle with regenerateToken, pick 3 smallest SD mp4s from DIFFERENT videos
    let candidates = [];
    for (let v of videoClips) {
      let mp4s = (v.video_files || [])
        .filter(f => f.quality === 'sd' && f.link.endsWith('.mp4'))
        .sort((a, b) => (a.width || 9999) - (b.width || 9999));
      if (mp4s[0] && !candidates.includes(mp4s[0].link)) candidates.push(mp4s[0].link);
    }
    if (candidates.length < 3) {
      console.error("Not enough SD MP4 clips found");
      return res.status(500).json({ error: "Not enough SD MP4 clips found" });
    }
    // Use deterministic shuffle so regen always gets different set
    const shuffled = getDeterministicShuffle(candidates, regenerateToken || `${Date.now()}_${Math.random()}`);
    const files = shuffled.slice(0, 3);

    // Step 4: Download, scale, trim
    console.log("Step 5: Downloading, scaling videos...");
    const tempDir = path.join(__dirname, '../tmp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const videoPaths = [];
    const TARGET_WIDTH = 960, TARGET_HEIGHT = 540, FRAMERATE = 30;
    for (let i = 0; i < files.length; i++) {
      const dest = path.join(tempDir, `${require('uuid').v4()}.mp4`);
      try {
        await withTimeout(downloadFileWithTimeout(files[i], dest, 12000, 5), 15000, "Download step timed out");
      } catch (e) {
        console.error("Video download failed:", e.message);
        return res.status(500).json({ error: "Stock video download failed", detail: e.message });
      }
      const scaledPath = dest.replace('.mp4', '_scaled.mp4');
      try {
        await withTimeout(
          exec(
            `${ffmpegPath} -y -i "${dest}" -vf "scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps=${FRAMERATE}" -t 8 -r ${FRAMERATE} -c:v libx264 -preset ultrafast -crf 24 -an "${scaledPath}"`
          ),
          20000,
          "ffmpeg scaling timed out"
        );
      } catch (e) {
        fs.unlinkSync(dest);
        console.error("Video scaling failed:", e.message);
        return res.status(500).json({ error: "Video scaling failed", detail: e.message });
      }
      fs.unlinkSync(dest);
      videoPaths.push(scaledPath);
    }

    // Step 5: Generate GPT script (mention CTA)
    console.log("Step 6: Generating GPT script...");
    let prompt = `Write a video ad script for an online e-commerce business selling physical products. Script MUST be 45-55 words, read at normal speed for about 15-18 seconds. Include a strong hook, a specific product benefit, and end with this exact call to action: '${overlayText}'. Sound friendly, trustworthy, and conversion-focused.`;
    if (productType) prompt += `\nProduct category: ${productType}`;
    if (answers && Object.keys(answers).length) {
      prompt += '\nBusiness Details:\n' + Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
    }
    if (url) prompt += `\nWebsite: ${url}`;
    prompt += "\nRespond ONLY with the script, no intro or explanation. Script must be at least 15 seconds when spoken.";

    let script;
    try {
      const gptRes = await withTimeout(
        openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 110,
          temperature: 0.65
        }),
        15000,
        "OpenAI GPT timed out"
      );
      script = gptRes.choices?.[0]?.message?.content?.trim() || "Shop the best products online now!";
    } catch (e) {
      console.error("GPT script generation failed:", e.message);
      return res.status(500).json({ error: "GPT script generation failed", detail: e.message });
    }

    // Step 6: Generate TTS voiceover
    console.log("Step 7: Generating TTS audio...");
    let ttsPath;
    try {
      const ttsRes = await withTimeout(
        openai.audio.speech.create({
          model: 'tts-1',
          voice: TTS_VOICE,
          input: script
        }),
        15000,
        "OpenAI TTS timed out"
      );
      const ttsBuffer = Buffer.from(await ttsRes.arrayBuffer());
      ttsPath = path.join(tempDir, `${require('uuid').v4()}.mp3`);
      fs.writeFileSync(ttsPath, ttsBuffer);
    } catch (e) {
      console.error("TTS generation failed:", e.message);
      return res.status(500).json({ error: "TTS generation failed", detail: e.message });
    }

    // Step 7: Get TTS duration
    let ttsDuration = 16;
    try {
      let ffprobePath = ffmpegPath && ffmpegPath.endsWith('ffmpeg')
        ? ffmpegPath.replace(/ffmpeg$/, 'ffprobe')
        : 'ffprobe';
      const { stdout } = await withTimeout(
        exec(`${ffprobePath} -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${ttsPath}"`),
        5000,
        "ffprobe step timed out"
      );
      const seconds = parseFloat(stdout.trim());
      if (!isNaN(seconds) && seconds > 0) ttsDuration = Math.max(seconds, 15);
    } catch (e) {
      ttsDuration = 16;
    }

    // FINAL: force video to match TTS (script) duration + 1s, at least 15s
    let finalDuration = Math.max(ttsDuration + 1, 15);
    const secondsPerClip = 8;
    let clipsNeeded = Math.ceil(finalDuration / secondsPerClip);
    while (videoPaths.length < clipsNeeded) {
      videoPaths.push(videoPaths[videoPaths.length - 1]);
    }
    const listPath = path.join(tempDir, `${require('uuid').v4()}.txt`);
    fs.writeFileSync(listPath, videoPaths.slice(0, clipsNeeded).map(p => `file '${p}'`).join('\n'));

    // Concat videos
    const generatedPath = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(generatedPath)) fs.mkdirSync(generatedPath, { recursive: true });
    const videoId = require('uuid').v4();
    const tempConcat = path.join(generatedPath, `${videoId}.concat.mp4`);
    const tempOverlay = path.join(generatedPath, `${videoId}.overlay.mp4`);
    const outPath = path.join(generatedPath, `${videoId}.mp4`);
    try {
      console.log("Step 8: ffmpeg concat...");
      await withTimeout(
        exec(`${ffmpegPath} -y -f concat -safe 0 -i "${listPath}" -c copy "${tempConcat}"`),
        20000,
        "ffmpeg concat timed out"
      );
    } catch (e) {
      console.error("Video concat failed:", e.message);
      return res.status(500).json({ error: "Video concat failed", detail: e.message });
    }

// --- Overlay text, always use fontfile absolute path (Render-safe)
const fontfile = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
let overlayCmd = `${ffmpegPath} -y -i "${tempConcat}" -vf "drawtext=fontfile='${fontfile}':text='${overlayText.replace(/'/g,"\\'")}':fontcolor=white:fontsize=40:box=1:boxcolor=black@0.5:boxborderw=7:shadowcolor=black:shadowx=2:shadowy=2:x=(w-text_w)/2:y=(h-text_h)/2:enable='between(t,${finalDuration-8},${finalDuration-4})':alpha='if(lt(t,${finalDuration-8}),0, if(lt(t,${finalDuration-4}), (t-(${finalDuration-8}))/${4}, 1-(t-(${finalDuration-4}))/4 ))'" -c:v libx264 -crf 24 -preset veryfast -pix_fmt yuv420p -an "${tempOverlay}"`;

try {
  console.log("Step 9: ffmpeg overlay (fontfile absolute path)...");
  await withTimeout(exec(overlayCmd), 20000, "ffmpeg overlay timed out");
} catch (e) {
  console.error("Text overlay failed:", e.message);
  return res.status(500).json({ error: "Text overlay failed", detail: e.message });
}



    // FINAL: add TTS and force video to match (TTS + 1s) or 15s minimum
    try {
      console.log("Step 10: ffmpeg final mux...");
      await withTimeout(
        exec(`${ffmpegPath} -y -i "${tempOverlay}" -i "${ttsPath}" -map 0:v:0 -map 1:a:0 -shortest -t ${finalDuration} -c:v libx264 -c:a aac -b:a 192k "${outPath}"`),
        25000,
        "ffmpeg mux timed out"
      );
    } catch (e) {
      console.error("Final mux (video+audio) failed:", e.message);
      return res.status(500).json({ error: "Final mux (video+audio) failed", detail: e.message });
    }

    // Check that the final output exists
    if (!fs.existsSync(outPath)) {
      console.error("Video output file missing after render");
      return res.status(500).json({ error: "Video output file missing after render" });
    }

    // Clean up temp files
    [tempConcat, tempOverlay, ...videoPaths, ttsPath, listPath].forEach(p => { try { fs.unlinkSync(p); } catch (e) {} });

    // Return public video URL and script
    const publicUrl = `/generated/${videoId}.mp4`;
    console.log("Step 11: Video ad generated successfully!", publicUrl);
    return res.json({ videoUrl: publicUrl, script, overlayText, voice: TTS_VOICE });

  } catch (err) {
    console.error("Video generation error:", err.message, err?.response?.data || "");
    res.status(500).json({
      error: "Failed to generate video ad",
      detail: (err && err.message) || "Unknown error"
    });
  }
});


module.exports = router;
