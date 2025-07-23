// routes/ai.js
const express = require('express');
const router = express.Router();
const { OpenAI } = require('openai');
const axios = require('axios');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
    const adCopy = response.choices[0].message.content.trim();
    return res.json({ adCopy });
  } catch (err) {
    return res.status(500).json({ error: "Failed to generate ad copy" });
  }
});

// ========== AI: AUTOMATIC AUDIENCE DETECTION ==========

// Helper: Scrape website homepage text
async function getWebsiteText(url) {
  try {
    const { data } = await axios.get(url, { timeout: 8000 });
    // Remove all tags, get main text, limit to 3500 chars for OpenAI
    return data.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3500);
  } catch (err) {
    return '';
  }
}

// POST /api/detect-audience
router.post('/detect-audience', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing URL' });

  // 1. Scrape website text
  const websiteText = await getWebsiteText(url);

  if (!websiteText || websiteText.length < 100) {
    return res.status(400).json({ error: 'Could not extract website text.' });
  }

  // 2. OpenAI prompt
  const prompt = `
Website homepage text:
"""${websiteText}"""

Based only on this text, describe:
1. What type of business or website is this?
2. Where is it located, or who is the ideal geographic audience?
3. What interests/age/gender best match this site?
4. Suggest a Facebook/Google ad audience targeting (geo, interests, age) for best results.
Be concise and business-like.
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 220,
      temperature: 0.3,
    });
    const aiText = response.choices[0]?.message?.content?.trim();
    res.json({ audience: aiText });
  } catch (err) {
    console.error('OpenAI Error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'AI audience detection failed.' });
  }
});

module.exports = router;
