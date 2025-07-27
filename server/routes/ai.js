// routes/ai.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp'); // Added for creative overlays!
const { v4: uuidv4 } = require('uuid'); // For unique filenames

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
  let prompt = `You are a world-class direct response copywriter. Write a short, high-converting Facebook ad based on the following description. Be direct, persuasive, no fluff.`;
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

// ===== GENERATE FULL AD SUITE FROM NOTES + SURVEY ======
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

    // Bulletproof JSON cleaner/parser
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
const PEXELS_API_KEY = "x3ydqR4xmwbpuQsqNZYY3hS9ZDoqQijM6H6jCdiAv2ncX5B3DvZIqRuu"; // Or use process.env.PEXELS_API_KEY
const PEXELS_BASE_URL = "https://api.pexels.com/v1/search";

// POST /api/generate-image-from-prompt
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
        timeout: 4800, // < 5s hard limit for speed
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

// ========== AI: GENERATE IMAGE WITH OVERLAY (ENHANCED) ==========
// POST /api/generate-image-with-overlay
router.post('/generate-image-with-overlay', async (req, res) => {
  try {
    const { imageUrl, headline, cta } = req.body;
    if (!imageUrl || !headline) {
      return res.status(400).json({ error: "imageUrl and headline are required." });
    }

    // Download image buffer
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    let baseImage = sharp(imgRes.data).resize(1200, 627); // Facebook ad size

    // ----------- Overlay Styles (Randomized) -----------
    const overlayStyles = [
      { rect: { x: 0, y: 40, width: 1200, height: 120, rx: 28, fill: "rgba(30,30,30,0.79)" }, text: { x: 600, y: 115, anchor: "middle", fontSize: 60, color: "#fff", maxWidth: 1080 } },
      { rect: { x: 80, y: 250, width: 1040, height: 135, rx: 32, fill: "rgba(30,50,90,0.76)" }, text: { x: 600, y: 340, anchor: "middle", fontSize: 62, color: "#fff", maxWidth: 980 } },
      { rect: { x: 0, y: 495, width: 1200, height: 110, rx: 30, fill: "rgba(18,32,44,0.88)" }, text: { x: 600, y: 570, anchor: "middle", fontSize: 58, color: "#fff", maxWidth: 1080 } }
    ];
    const randStyle = overlayStyles[Math.floor(Math.random() * overlayStyles.length)];

    // Randomly choose whether to show headline or CTA in the main box (default to headline if no CTA)
    let mainText = headline;
    let secondaryText = cta;
    if (cta && Math.random() > 0.5) {
      mainText = cta;
      secondaryText = headline;
    }

   // --- SVG-safe word wrapping that always fits in box and expands/shrinks the box! ---
function wrapTextStrict(text, fontSize, maxWidth, maxLines = 2, minFont = 28) {
  let words = text.split(" ");
  let lines = [];
  let line = "";
  let usedFont = fontSize;
  // Wrap lines
  for (let word of words) {
    let testLine = line ? `${line} ${word}` : word;
    let estWidth = testLine.length * (usedFont * 0.62);
    if (estWidth > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  // Shrink font if over maxLines or still doesn't fit
  while ((lines.length > maxLines || Math.max(...lines.map(l => l.length)) * usedFont * 0.62 > maxWidth) && usedFont > minFont) {
    usedFont -= 4;
    // Retry wrapping at smaller font
    lines = [];
    line = "";
    for (let word of words) {
      let testLine = line ? `${line} ${word}` : word;
      let estWidth = testLine.length * (usedFont * 0.62);
      if (estWidth > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);
  }
  // If still too long, ellipsis
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[lines.length - 1];
    if (last.length > 8) lines[lines.length - 1] = last.slice(0, -3) + "...";
  }
  return { lines, fontSize: usedFont };
}

// Use a solid background color for headline box
const headlineFont = "'Bebas Neue', 'Bungee Inline', Arial, Helvetica, sans-serif"; // Popular ad fonts fallback
const solidBox = {
  x: 60,
  y: 210, // vertical center
  width: 1080,
  height: 150,
  rx: 34,
  fill: "#233c54", // Deep, solid blue
};
const textMaxWidth = solidBox.width - 56;
const { lines: mainLines, fontSize: mainFontSize } = wrapTextStrict(mainText, 68, textMaxWidth, 2, 26);

// (optional) CTA styling, same wrap rules, always all caps, solid bg
const ctaBox = {
  x: 850,
  y: 540,
  width: 300,
  height: 64,
  rx: 18,
  fill: "#15a1df", // Brighter blue, feel free to adjust
};
const ctaFontInit = 32;
const ctaMaxWidth = ctaBox.width - 40;
const { lines: ctaLines, fontSize: ctaFontSize } = showSecondary
  ? wrapTextStrict(String(secondaryText || "").toUpperCase(), ctaFontInit, ctaMaxWidth, 1, 18)
  : { lines: [], fontSize: ctaFontInit };

// SVG (centered box, no transparency, sharp font, all caps headline)
const svg = `
<svg width="1200" height="627" xmlns="http://www.w3.org/2000/svg">
  <rect x="${solidBox.x}" y="${solidBox.y}" width="${solidBox.width}" height="${solidBox.height}" rx="${solidBox.rx}" fill="${solidBox.fill}" />
  ${mainLines.map((line, i) =>
    `<text x="600" y="${solidBox.y + 58 + i * (mainFontSize + 8)}" text-anchor="middle" font-family=${headlineFont} font-size="${mainFontSize}" font-weight="bold" fill="#fff" letter-spacing="3" style="text-shadow:2px 4px 18px #000a">${line.toUpperCase()}</text>`
  ).join("\n")}
  ${showSecondary ? `
    <rect x="${ctaBox.x}" y="${ctaBox.y}" width="${ctaBox.width}" height="${ctaBox.height}" rx="${ctaBox.rx}" fill="${ctaBox.fill}" />
    ${ctaLines.map((line, i) =>
      `<text x="${ctaBox.x + ctaBox.width/2}" y="${ctaBox.y + 44 + i * (ctaFontSize + 7)}" text-anchor="middle" font-family=${headlineFont} font-size="${ctaFontSize}" font-weight="bold" fill="#fff" letter-spacing="2">${line}</text>`
    ).join("\n")}
  ` : ''}
</svg>`;


    // Composite SVG overlay
    const outBuffer = await baseImage
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 97 })
      .toBuffer();

    // Save in /tmp and return URL
    const tmpDir = '/tmp';
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);
    const fileName = `${uuidv4()}.jpg`;
    const filePath = path.join(tmpDir, fileName);
    fs.writeFileSync(filePath, outBuffer);

    const publicUrl = `/tmp/${fileName}`;
    console.log("Overlay image saved at:", filePath, "and served as:", publicUrl);

    return res.json({ imageUrl: publicUrl, mainText, secondaryText });
  } catch (err) {
    console.error("Image overlay error:", err.message);
    return res.status(500).json({ error: "Failed to overlay image", detail: err.message });
  }
});

module.exports = router;
