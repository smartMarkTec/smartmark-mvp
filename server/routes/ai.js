// routes/ai.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

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
You are a Facebook Ads expert. Use ONLY the marketing strategies, ad copy frameworks, and techniques in the following context.

### Training context:
${customContext}

### Survey answers:
${surveyStr}
Website URL: ${url}

### Generate the following, each with clear labels:
1. High-converting Facebook ad copy (headline + body)
2. An image prompt describing exactly what the ad image should look like (detailed, visual, for a human designer; must describe people/faces with close-up, camera/lighting, emotion, appearance, and absolutely NO text)
3. A short, punchy 30-second video ad script

Respond as JSON:
{
  "headline": "...",
  "body": "...",
  "image_prompt": "...",
  "video_script": "..."
}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a world-class Facebook ad copy, creative, and script expert. Never say you are an AI." },
        { role: "user", content: prompt }
      ],
      max_tokens: 700
    });
    const raw = response.choices?.[0]?.message?.content?.trim();
    let result;
    try { result = JSON.parse(raw); } catch (e) { result = { raw }; }
    res.json(result);
  } catch (err) {
    console.error("Ad Campaign AI Error:", err?.response?.data || err.message);
    res.status(500).json({ error: "AI error", detail: err.message });
  }
});

// ========== AI: GENERATE IMAGE FROM PROMPT (DALL·E 3) ==========
router.post('/generate-image-from-prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "Missing image prompt." });

  const gptPrompt = `
You are an AI photo director for high-end advertising. Write an ultra-specific, concise (under 900 characters), photorealistic prompt for DALL·E.

Rules:
- All faces must be front-facing, straight, perfectly proportional, eyes looking directly at the camera, clear eyes, sharp focus, natural expressions, realistic skin, perfect facial symmetry.
- Be precise about each subject's appearance, position, and the composition (body/face ratios, camera angle, lens, lighting, no distortion).
- If relevant, set: "Canon DSLR, close-up, straight gaze, studio backdrop, no text, no logo."
- If business type is given, style and setting should match.

Scene:
"""${prompt}"""

ALWAYS append: "Faces are front-facing, straight, perfectly proportional, natural expressions, no distortion, clear eyes, realistic skin texture, sharp focus, perfect facial symmetry."
Output: Only the DALL·E prompt, nothing else.
  `;

  try {
    // 1. Get final DALL·E prompt from GPT
    const gptRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: gptPrompt }],
      max_tokens: 200,
      temperature: 0.5,
    });
    let dallePrompt = gptRes.choices?.[0]?.message?.content?.trim() || "";

    // Basic prompt cleanup
    if (dallePrompt.toLowerCase().startsWith("dall·e prompt:")) {
      dallePrompt = dallePrompt.replace(/^dall·e prompt:/i, '').trim();
    }
    if (!dallePrompt) {
      console.error("GPT did not return a prompt!");
      return res.status(500).json({ error: "AI failed to generate image prompt." });
    }
    console.log("Generated DALL·E prompt:", dallePrompt);

    // 2. Generate the image with DALL·E
    let imageRes;
    try {
      imageRes = await openai.images.generate({
        prompt: dallePrompt,
        n: 1,
        size: "1024x1024"
      });
    } catch (err) {
      console.error("DALL·E API error:", err?.response?.data || err.message || err);
      return res.status(500).json({ error: "DALL·E image API failed.", detail: err?.response?.data || err.message || err });
    }

    const imageUrl = imageRes.data[0]?.url || null;
    if (!imageUrl) {
      console.error("No image URL returned by DALL·E!");
      return res.status(500).json({ error: "No image URL returned by DALL·E." });
    }

    // 3. Run Replicate Face Fixer (GFPGAN)
    let fixedImageUrl = imageUrl;
    try {
      const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
      const output = await replicate.run(
        "tencentarc/gfpgan:1.4",
        { input: { img: imageUrl, scale: 2 } }
      );
      fixedImageUrl = Array.isArray(output) ? output[0] : output;
    } catch (err) {
      console.error("Replicate face fixer failed:", err?.response?.data || err.message || err);
      // fallback: return original DALL·E image
      fixedImageUrl = imageUrl;
    }

    res.json({ imageUrl: fixedImageUrl, dallePrompt });

  } catch (err) {
    console.error("Ultra-Precise Image Generation Error:", err?.response?.data || err.message || err);
    res.status(500).json({ error: "Image generation failed.", detail: err?.response?.data || err.message || err });
  }
});

module.exports = router;
