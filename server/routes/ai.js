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

// ========== AI: GENERATE IMAGE WITH OVERLAY (serious = visible colored overlay, always neutral boxes) ==========
// ========== AI: GENERATE IMAGE WITH OVERLAY (serious = visible colored overlay, always neutral boxes) ==========
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

    // ----- Palettes -----
    const neutralPalette = [
      "#DEDAD1EE", "#C7C3B4EE", "#BAB6ABEE", "#A8A59CEE", "#B8C0B9EE",
      "#E3DDD5EE", "#949588EE", "#C4CBC7EE", "#B7B9A4EE", "#D3CEC6EE",
      "#99A4A6EE", "#717678EE", "#5A6366EE", "#D6D1C4EE", "#B0B7BEEE",
      "#E7E3DDDD", "#E9E4E0EE", "#4B5054EE", "#818680EE", "#353C41EE"
    ];

    // Strong, visible, but clean overlays (blue, teal, orange, red, maroon, charcoal)
    const overlayColorPalette = [
      "#3474E6CC", // rich blue
      "#185e82CC", // teal-blue
      "#31B17BCC", // teal-green
      "#F47B08CC", // orange
      "#E63946CC", // red
      "#B94747CC", // maroon
      "#4B3568CC", // deep purple
      "#111827CC", // dark navy/charcoal
      "#00000055"  // subtle black
    ];

    function pickFrom(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    // Font family pool
    const fontFamilies = [
      "Poppins,Arial Black,Arial,sans-serif",
      "'Times New Roman',Times,serif",
      "'Helvetica Neue',Helvetica,Arial,sans-serif",
      "Impact,Arial,sans-serif",
      "Inter,Arial,sans-serif"
    ];
    const fontFamily = pickFrom(fontFamilies);

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

    // --- HEADLINE WRAP ---
    function smartWrap(text, maxLines = 3) {
      if (!text) return [];
      const words = text.trim().split(' ');
      if (words.length <= maxLines) return words;
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
    const headlineFont = 52;
    const headlineLines = smartWrap(headline, 3);

    // --- SUBHEADLINE WRAP ---
    const subFont = 28;
    function fitLines(text, fontSize, maxWidth, maxLines = 2) {
      let words = text.split(' ');
      let lines = [], currentLine = '';
      for (let word of words) {
        let testLine = currentLine ? currentLine + ' ' + word : word;
        let estWidth = testLine.length * (fontSize * 0.57);
        if (estWidth > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
      if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        let last = lines.length - 1;
        if (lines[last].length > 5) lines[last] = lines[last].slice(0, -3) + "...";
      }
      return lines;
    }
    const subLines = subheadline ? fitLines(subheadline, subFont, 700, 2) : [];

    // --- CTA ---
    function truncateCta(text) {
      let str = (text || "").trim();
      let words = str.split(" ");
      if (words.length > 5) words = words.slice(0, 5);
      str = words.join(" ");
      return str;
    }
    let ctaText = truncateCta(cta);
    let showCta = !!ctaText;
    const ctaFont = 30;
    const estCtaWidth = Math.max(160, Math.min(420, ctaText.length * ctaFont * 0.54 + 44));
    const ctaBoxH = 56, ctaBoxX = 1200 - estCtaWidth - 40, ctaBoxY = 52;

    // --- Overlay and Box Color Logic ---
    let overlayColor = null, boxColor, textColor;
    let boxRx = Math.random() < 0.5 ? 12 : 48; // Vary corners

    if (isSerious) {
      overlayColor = pickFrom(overlayColorPalette);
      boxColor = pickFrom(neutralPalette);
      textColor = "#232323";
    } else {
      overlayColor = null;
      boxColor = pickFrom(neutralPalette);
      textColor = "#232323";
    }

    // Randomize headline alignment (center or left) for all
    let align = Math.random() < 0.55 ? "left" : "center";
    const paddingX = 54, paddingY = 36;
    const boxWidth = Math.max(...headlineLines.map(line => line.length)) * (headlineFont * 0.59) + paddingX * 2;
    const boxHeight = headlineLines.length * (headlineFont + 10) + paddingY * 2;
    const boxX = align === "center"
      ? 600 - boxWidth / 2
      : 160;
    const textX = align === "center" ? 600 : (boxX + paddingX);
    const boxY = 130;

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
  ${isSerious && overlayColor ? `
    <!-- FULLSCREEN TRANSLUCENT BG FILTER (VISIBLE, SERIOUS ONLY) -->
    <rect x="0" y="0" width="1200" height="627" fill="${overlayColor}" />
  ` : ""}
  <!-- Headline Box -->
  <rect x="${boxX}" y="${boxY}" width="${boxWidth}" height="${boxHeight}" rx="${boxRx}" fill="${boxColor}" />
  ${headlineLines.map((line, i) =>
    `<text x="${textX}" y="${boxY + paddingY + (i + 1) * headlineFont + i * 6 - 6}" text-anchor="${align === "center" ? "middle" : "start"}" font-family="${fontFamily}" font-size="${headlineFont}" font-weight="bold" fill="${textColor}">${escapeForSVG(line)}</text>`
  ).join("\n")}
  ${subLines.length ? subLines.map((line, i) =>
    `<text x="600" y="${boxY + boxHeight + 46 + i * (subFont + 7)}" text-anchor="middle" font-family="${fontFamily}" font-size="${subFont}" font-weight="bold" fill="#232323">${escapeForSVG(line)}</text>`
  ).join("\n") : ''}
  ${showCta ? `
    <rect x="${ctaBoxX}" y="${ctaBoxY}" width="${estCtaWidth}" height="${ctaBoxH}" rx="28" fill="${boxColor}" />
    <text x="${ctaBoxX + estCtaWidth/2}" y="${ctaBoxY + 36}" text-anchor="middle" font-family="${fontFamily}" font-size="${ctaFont}" font-weight="bold" fill="${textColor}">${escapeForSVG(ctaText)}</text>
  ` : ''}
  <rect x="0" y="570" width="1200" height="60" fill="#222" />
  <text x="72" y="610" font-family="${fontFamily}" font-size="33" font-weight="bold" fill="${footerColor}">${escapeForSVG(footer)}</text>
</svg>`;

    // --- Compose SVG on Image ---
    const genDir = path.join(__dirname, '../public/generated');
    if (!fs.existsSync(genDir)) fs.mkdirSync(genDir, { recursive: true });
    const fileName = `${uuidv4()}.jpg`;
    const filePath = path.join(genDir, fileName);

    const outBuffer = await sharp(baseImage)
      .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
      .jpeg({ quality: 98 })
      .toBuffer();

    fs.writeFileSync(filePath, outBuffer);

    const publicUrl = `/generated/${fileName}`;
    console.log("Modern overlay image saved at:", filePath, "and served as:", publicUrl);

    return res.json({ imageUrl: publicUrl, mainText: headline, secondaryText: ctaText });
  } catch (err) {
    console.error("Image overlay error:", err.message);
    return res.status(500).json({ error: "Failed to overlay image", detail: err.message });
  }
});


module.exports = router;
