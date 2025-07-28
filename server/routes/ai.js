const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const TextToSVG = require('text-to-svg');
const textToSvg = TextToSVG.loadSync(); // ← No font file, uses system default

const fontPick = { name: 'Georgia', css: 'Georgia, serif' };
const fontFamily = fontPick.css;
let svgFontFace = '';


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

// ========== AI: GENERATE IMAGE WITH OVERLAY (PIXEL-PERFECT FIT WITH text-to-svg) ==========
router.post('/generate-image-with-overlay', async (req, res) => {
  try {
    const { imageUrl, headline, cta, industry = "" } = req.body;
    if (!imageUrl || !headline) {
      return res.status(400).json({ error: "imageUrl and headline are required." });
    }

    // Download and fit main image
    const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const mainW = 1100, mainH = 550;
    let baseImage = await sharp(imgRes.data)
      .resize(mainW, mainH, { fit: 'cover' })
      .toBuffer();

    // SVG canvas
    const svgW = 1200, svgH = 627;

    // Helpers
    function escapeForSVG(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    }

    // Font sizing (fit/shrink text to box, multiple lines)
    function fitLines(text, maxWidth, maxLines, maxFont, minFont) {
      let font = maxFont, lines = [];
      while (font >= minFont) {
        lines = [];
        let words = text.split(" "), line = "";
        for (let word of words) {
          let test = line ? line + " " + word : word;
          const width = textToSvg.getMetrics(test, { fontSize: font }).width;
          if (width > maxWidth && line) {
            lines.push(line.trim());
            line = word;
          } else {
            line = test;
          }
        }
        if (line) lines.push(line.trim());
        if (
          lines.length <= maxLines &&
          lines.every(l => textToSvg.getMetrics(l, { fontSize: font }).width <= maxWidth)
        ) break;
        font -= 2;
      }
      // Ellipsis if still over maxLines
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1] + "...";
      }
      return { font, lines };
    }

    // Headline: measure, fit, and box
    const paddingX = 32, paddingY = 16;
    const maxBoxW = svgW - 96;
    const maxLines = 3;
    const { font: headlineFont, lines: headlineLines } = fitLines(headline, maxBoxW - 2 * paddingX, maxLines, 54, 18);
    // Now, recalculate the ACTUAL box width needed (largest line, this font)
    const headlineWidths = headlineLines.map(line => textToSvg.getMetrics(line, { fontSize: headlineFont }).width);
    const headlineBoxWidth = Math.max(...headlineWidths) + 2 * paddingX;
    const headlineBoxHeight = headlineLines.length * (headlineFont + 10) - 10 + 2 * paddingY;
    const headlineBoxX = svgW / 2 - headlineBoxWidth / 2;
    const headlineBoxY = 52;

    // CTA box: same logic, smaller max width/lines/font
    const ctaText = (cta || "Learn more.").replace(/[.]+$/, ".");
    const { font: ctaFont, lines: ctaLines } = fitLines(ctaText, maxBoxW / 1.6 - 2 * paddingX, 2, 32, 14);
    const ctaWidths = ctaLines.map(line => textToSvg.getMetrics(line, { fontSize: ctaFont }).width);
    const ctaBoxWidth = Math.max(...ctaWidths) + 2 * paddingX;
    const ctaBoxHeight = ctaLines.length * (ctaFont + 10) - 10 + 2 * (paddingY - 6);
    const ctaBoxX = svgW / 2 - ctaBoxWidth / 2;
    const ctaBoxY = headlineBoxY + headlineBoxHeight + 28;

    // SVG (GLASSY boxes remain!)
    const svg = `
<svg width="${svgW}" height="${svgH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${svgW}" height="${svgH}" fill="#edead9" rx="26"/>
  <image href="data:image/jpeg;base64,${baseImage.toString('base64')}" x="50" y="50" width="${mainW}" height="${mainH}" />
  <!-- Headline Box -->
  <rect x="${headlineBoxX}" y="${headlineBoxY}" width="${headlineBoxWidth}" height="${headlineBoxHeight}" rx="26" fill="#fff9" />
  ${headlineLines.map((line, i) =>
    `<text
      x="${svgW / 2}"
      y="${headlineBoxY + paddingY + (i * (headlineFont + 10)) + headlineFont/2}"
      text-anchor="middle"
      font-family="'${fontPick.name}', ${fontFamily}"
      font-size="${headlineFont}"
      font-weight="bold"
      fill="#333"
      dominant-baseline="middle"
    >${escapeForSVG(line)}</text>`).join('\n')}
  <!-- CTA Box -->
  <rect x="${ctaBoxX}" y="${ctaBoxY}" width="${ctaBoxWidth}" height="${ctaBoxHeight}" rx="19" fill="#fff8" />
  ${ctaLines.map((line, i) =>
    `<text
      x="${svgW / 2}"
      y="${ctaBoxY + paddingY + (i * (ctaFont + 10)) + ctaFont/2}"
      text-anchor="middle"
      font-family="'${fontPick.name}', ${fontFamily}"
      font-size="${ctaFont}"
      font-weight="bold"
      fill="#222"
      dominant-baseline="middle"
    >${escapeForSVG(line)}</text>`).join('\n')}
</svg>
`;

    // Save SVG as image
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
    console.log("Overlay image saved at:", filePath, "and served as:", publicUrl);

    return res.json({ imageUrl: publicUrl });
  } catch (err) {
    console.error("Image overlay error:", err.message);
    return res.status(500).json({ error: "Failed to overlay image", detail: err.message });
  }
});


module.exports = router;
