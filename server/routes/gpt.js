// server/routes/gpt.js
/* eslint-disable */
const express = require("express");
const router = express.Router();
const OpenAI = require("openai"); // npm i openai

// Minimal, safe OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Fallback if API is down or key is missing
const FALLBACK = "I'm your AI Ad Manager—ask me anything about launching ads, creatives, or budgets.";

router.post("/gpt-chat", async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ reply: "Please provide a message." });
  }

  // Build messages array. If history provided, use it (last 12 turns), else just user message.
  // History expects items like: { role: "user"|"assistant", content: "..." }
  const trimmedHistory = Array.isArray(history) ? history.slice(-12) : [];
  const messages = [
    {
      role: "system",
      content:
        "You are SmartMark, a concise, friendly AI Ad Manager. Keep replies brief (1-3 sentences). " +
        "Answer questions about advertising, creatives, targeting, and budgets. " +
        "DO NOT ask the user the survey questions; the UI handles that. " +
        "If the user asks something unrelated to ads, still be helpful but brief."
    },
    ...trimmedHistory,
    // If the last history item is already the user's message, don't duplicate it.
    ...(trimmedHistory.length && trimmedHistory[trimmedHistory.length - 1]?.role === "user"
      ? []
      : [{ role: "user", content: message.slice(0, 2000) }])
  ];

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o-mini"; // small & affordable
    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.5,
      max_tokens: 250
    });

    const reply = completion.choices?.[0]?.message?.content?.trim() || FALLBACK;
    // Optional: log token usage for your own monitoring
    if (completion.usage) {
      console.log(
        "[SmartMark GPT] tokens:",
        completion.usage.prompt_tokens,
        completion.usage.completion_tokens,
        completion.usage.total_tokens
      );
    }
    res.json({ reply });
  } catch (err) {
    console.error("GPT error:", err?.message || err);
    res.json({ reply: FALLBACK });
  }
});

module.exports = router;
