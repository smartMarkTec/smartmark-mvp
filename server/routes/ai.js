// routes/ai.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

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
const PEXELS_API_KEY = "x3ydqR4xmwbpuQsqNZYY3hS9ZDoqQijM6H6jCdiAv2ncX5B3DvZIqRuu";
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

// ========== AI: GENERATE IMAGE WITH OVERLAY (FRAME, FONT, HEADLINE/CTA LOGIC) ==========
router.post('/generate-image-with-overlay', async (req, res) => {
  try {
    const {
      imageUrl,
      headline,
      subheadline = "",
      cta,
      footer = "",
      color = "#225bb3",
      footerColor = "#FFD700",
      industry = ""
    } = req.body;
    if (!imageUrl || !headline) {
      return res.status(400).json({ error: "imageUrl and headline are required." });
    }

    // Download and fit image landscape
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    let baseImage = await sharp(imgRes.data)
      .resize(1200, 627, { fit: 'cover' })
      .toBuffer();

    // ----- Frame Palette -----
    const framePalette = [
      "#1D3557", "#457B9D", "#A8DADC", "#F1FAEE", "#E63946",
      "#6366F1", "#18181B", "#FBBF24", "#10B981", "#F472B6",
      "#F59E42", "#E6D3A3", "#57606f", "#444444"
    ];
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    const frameColor = pick(framePalette);

    // ----- Overlay Box Palettes -----
    const neutralPalette = [
      "#DEDAD1EE", "#C7C3B4EE", "#BAB6ABEE", "#A8A59CEE", "#B8C0B9EE",
      "#E3DDD5EE", "#949588EE", "#C4CBC7EE", "#B7B9A4EE", "#D3CEC6EE",
      "#99A4A6EE", "#717678EE", "#5A6366EE", "#D6D1C4EE", "#B0B7BEEE",
      "#E7E3DDDD", "#E9E4E0EE", "#4B5054EE", "#818680EE", "#353C41EE"
    ];
    const overlayColorPalette = [
      "#3474E688", "#185e8288", "#4B356888", "#11182788", "#00000033"
    ];

    // Font family pool (only Helvetica, Futura, Impact)
    const fontFamilies = [
      "Helvetica,Arial,sans-serif",
      "Futura,Arial,sans-serif",
      "Impact,Arial,sans-serif"
    ];
    const fontFamily = pick(fontFamilies);

    // --- INDUSTRY LOGIC ---
    const seriousIndustries = [
      "medicine","medical","doctor","dentist","health","hospital","hospice",
      "law","legal","lawyer","attorney","finance","financial","accounting","bank","banking",
      "insurance","hvac","plumbing","electrician","contractor",
      "roofing","construction","real estate","security","consulting"
    ];
    const isSerious = seriousIndustries.some(kw =>
      (industry || "").toLowerCase().includes(kw)
    );

    // --- HEADLINE LOGIC: add punctuation if missing, make a sentence ---
    function completeSentence(str) {
      if (!str) return "";
      str = str.trim();
      if (!/[.?!]$/.test(str)) {
        const exclaimWords = ["now", "today", "free", "call", "visit", "sale", "save", "book", "deal", "increase"];
        const lastWord = str.split(/\s+/).pop().toLowerCase();
        str += exclaimWords.includes(lastWord) ? "!" : ".";
      }
      // Capitalize first letter
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
    const headlineWithPunct = completeSentence(headline);

    // --- HEADLINE WRAP ---
    function smartWrap(text, maxLines = 3) {
      if (!text) return [];
      const words = text.trim().split(' ');
      if (words.length <= maxLines) return [text];
      let lines = [];
      let avg = Math.ceil(words.length / maxLines);
      let used = 0;
      for (let i = 0; i < maxLines; i++) {
        lines.push(words.slice(used, used + avg).join(' '));
        used += avg;
        if (i === maxLines - 2) avg = words.length - used;
      }
      return lines;
    }
    const headlineFont = 50;
    const headlineLines = smartWrap(headlineWithPunct, 3);

    // --- CTA LOGIC: Complete sentence, 4-5 words max, period or exclamation ---
    function getCtaText(text) {
      let str = (text || "").trim();
      str = str.replace(/[.!?,]+$/, "");
      let words = str.split(/\s+/);
      if (words.length > 5) words = words.slice(0, 5);
      str = words.join(" ");
      if (!/[.?!]$/.test(str)) str += ".";
      if (str.length < 3) str = "Learn more.";
      // Capitalize first letter
      return str.charAt(0).toUpperCase() + str.slice(1);
    }
    let ctaText = getCtaText(cta);
    let showCta = !!ctaText;

    // --- Visual Layout ---
    // "Picture frame": Draw frame, then image, then boxes
    // Frame = outer rectangle, 32px width, full 1200x627
    const frameWidth = 32;
    const imgX = frameWidth, imgY = frameWidth, imgW = 1200 - frameWidth*2, imgH = 627 - frameWidth*2;

    // Headline box
    const boxColor = pick(neutralPalette);
    const textColor = "#222";
    const boxRx = 0; // pointed corners
    const boxWidth = 940, boxHeight = 160;
    const boxX = 120;
    const boxY = 110;

    // CTA box
    const ctaFont = 30;
    const estCtaWidth = Math.max(180, Math.min(400, ctaText.length * ctaFont * 0.58 + 38));
    const ctaBoxH = 60, ctaBoxX = 120, ctaBoxY = boxY + boxHeight + 36;

    function escapeForSVG(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    // --- SVG ASSEMBLE ---
    const svg = `
<svg width="1200" height="627" xmlns="http://www.w3.org/2000/svg">
  <!-- Picture Frame -->
  <rect x="0" y="0" width="1200" height="627" fill="${frameColor}" rx="30"/>
  <!-- Image area (the real photo) -->
  <clipPath id="imgClip">
    <rect x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" rx="22"/>
  </clipPath>
  <image href="data:image/jpeg;base64,${baseImage.toString('base64')}" x="${imgX}" y="${imgY}" width="${imgW}" height="${imgH}" clip-path="url(#imgClip)" />
  <!-- Headline Box -->
  <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${boxRx}" fill="${boxColor}" opacity="0.92" />
  ${headlineLines.map((line, i) =>
    `<text x="${boxX + boxWidth/2}" y="${boxY + 50 + i*54}" text-anchor="middle" font-family="${fontFamily}" font-size="${headlineFont}" font-weight="bold" fill="${textColor}">${escapeForSVG(line)}</text>`
  ).join("\n")}
  <!-- CTA Button -->
  ${showCta ? `
    <rect x="${ctaBoxX}" y="${ctaBoxY}" width="${estCtaWidth}" height="${ctaBoxH}" rx="0" fill="${boxColor}" opacity="0.93" />
    <text x="${ctaBoxX + estCtaWidth/2}" y="${ctaBoxY + 40}" text-anchor="middle" font-family="${fontFamily}" font-size="${ctaFont}" font-weight="bold" fill="${textColor}">${escapeForSVG(ctaText)}</text>
  ` : ""}
  <!-- Footer -->
  <rect x="0" y="570" width="1200" height="58" fill="#222" />
  <text x="72" y="608" font-family="${fontFamily}" font-size="30" font-weight="bold" fill="${footerColor}">${escapeForSVG(footer)}</text>
</svg>`;

    // --- Compose SVG on Image ---
    const genDir = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
    const fileName = `${uuidv4()}.jpg`;
    const filePath = path.join(genDir, fileName);

    // Compose with frame+svg only (SVG draws photo inline)
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 97 })
      .toFile(filePath);

    const publicUrl = `/generated/${fileName}`;
    console.log("Framed overlay image saved at:", filePath, "and served as:", publicUrl);

    return res.json({ imageUrl: publicUrl, mainText: headlineWithPunct, secondaryText: ctaText });
  } catch (err) {
    console.error("Image overlay error:", err.message);
    return res.status(500).json({ error: "Failed to overlay image", detail: err.message });
  }
});

module.exports = router;
