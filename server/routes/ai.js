// routes/ai.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const axios = require('axios');

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
    console.error("[AI] Ad Copy Generation Error:", err?.response?.data || err.message);
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
  summary: ""
};

// Helper: Scrape website homepage text
async function getWebsiteText(url) {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    // Remove all tags, get main text, limit to 3500 chars for OpenAI
    return data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3500);
  } catch (err) {
    console.warn("[AI] Could not scrape website text for:", url, err?.message || err);
    return '';
  }
}

// POST /api/detect-audience
router.post('/detect-audience', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  // 1. Scrape website text
  const websiteText = await getWebsiteText(url);

  // Defensive fallback if we can't extract usable text
  if (!websiteText || websiteText.length < 100) {
    console.log(`[AI] Fallback to DEFAULT_AUDIENCE: not enough text scraped from ${url}`);
    return res.json({ audience: DEFAULT_AUDIENCE });
  }

  // 2. OpenAI prompt - asks for response in strict JSON format
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

    // Log for debugging
    console.log("[AI] OpenAI raw output:", aiText);

    // Try to parse the JSON in the response
    let audienceJson = null;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/); // extract first {...} block
      audienceJson = JSON.parse(jsonMatch ? jsonMatch[0] : aiText);

      // Enforce required fields and safe fallback
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
      // If OpenAI returns invalid JSON, fall back to default
      console.error("[AI] Could not parse JSON from OpenAI output:", aiText, err?.message);
      // You see the full AI output in the logs
      return res.json({ audience: DEFAULT_AUDIENCE });
    }

    // Log final result for debugging
    console.log("[AI] Final parsed audienceJson:", audienceJson);

    return res.json({ audience: audienceJson });
  } catch (err) {
    if (err?.response?.status === 429) {
      console.error('[AI] OpenAI rate limit hit:', err?.response?.data || err.message);
    } else {
      console.error('[AI] OpenAI Error:', err?.response?.data || err.message);
    }
    // On AI fail, always return DEFAULT_AUDIENCE so the rest of your stack is safe
    return res.json({ audience: DEFAULT_AUDIENCE });
  }
});

module.exports = router;
