"use strict";
// server/routes/salesAssistant.js
// Real-time AI objection analysis for Smartemark Sales Assistant (internal tool)

const express = require("express");
const router = express.Router();

let OpenAI;
let toFile;
try {
  const openaiPkg = require("openai");
  OpenAI = openaiPkg;
  toFile = openaiPkg.toFile;
} catch {
  console.warn("[salesAssistant] openai package not available");
}

const ALLOWED_CLASSIFICATIONS = [
  "Busy Right Now",
  "Send Me Info",
  "Tried Marketing Before / Ads Didn't Work",
  "Already Has Marketing Guy",
  "Price / Cost",
  "Need To Talk To Wife / Partner / Owner",
  "Ads Look Cheesy / Fake",
  "Not Ready Right Now",
  "Facebook Ad Spend Separate",
  "Doesn't Understand Ads / AI",
  "Word Of Mouth / Referrals",
  "Positive Buying Signal",
  "Wants To Sign Up",
  "Wants A Walkthrough",
  "No Clear Objection",
];

const SYSTEM_PROMPT = `You are the Smartemark Sales Assistant, a real-time AI sales copilot for HVAC cold calls.

Your job is to analyze the prospect's latest statement and choose the clearest matching objection from the approved Smartemark objection library.

Do not invent random responses. Use the approved objection responses, follow-up questions, and move-forward lines. Keep sayThis under 3 sentences — the caller needs to say it out loud during an active phone call.

If the prospect is showing buying intent, classify as: Positive Buying Signal, Wants To Sign Up, or Wants A Walkthrough.
If the statement is unclear or just small talk, return: No Clear Objection.

ALLOWED CLASSIFICATIONS (use these exact strings only):
${ALLOWED_CLASSIFICATIONS.join("\n")}

RULES:
- Always return JSON only. No markdown. No extra text outside the JSON object.
- Never invent pricing. Never claim guaranteed leads or guaranteed results.
- If confidence is below 0.5, return "No Clear Objection" — do not interrupt the caller with a low-confidence guess.
- prospectMeaning: one clear sentence describing what the prospect actually means or fears.
- If multiple objections match, pick the strongest as detectedObjection and include a secondaryMatch.
- If none match, set both to "No Clear Objection" and confidence to 0.

Return ONLY this JSON structure:
{
  "detectedObjection": "<exact allowed classification>",
  "secondaryMatch": "<exact allowed classification or null>",
  "confidence": <float 0.0 to 1.0>,
  "prospectMeaning": "<one sentence>",
  "sayThis": "<response to say — from approved library>",
  "askThisNext": "<follow-up question>",
  "moveForward": "<close or move-forward line>",
  "stage": "<listening|objection_handling|positive_signal|closing>"
}`;

const EMPTY_RESPONSE = {
  detectedObjection: "No Clear Objection",
  secondaryMatch: null,
  confidence: 0,
  prospectMeaning: "",
  sayThis: "",
  askThisNext: "",
  moveForward: "",
  stage: "listening",
};

router.post("/sales-assistant/analyze", async (req, res) => {
  try {
    const {
      recentTranscript = "",
      fullRecentContext = "",
      currentStage = "pitch",
      approvedObjections = [],
    } = req.body || {};

    const text = String(recentTranscript || "").trim();

    // Reject very short inputs — not enough signal to analyze
    if (text.length < 8 || text.split(" ").length < 2) {
      return res.json(EMPTY_RESPONSE);
    }

    if (!OpenAI || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ ok: false, error: "AI service not configured" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Build compact library reference (truncated to keep tokens low)
    const libraryRef = Array.isArray(approvedObjections)
      ? approvedObjections
          .slice(0, 20)
          .map(
            (o) =>
              `[${o.label}]\nSay: "${String(o.response || "").slice(0, 160)}"\nAsk: "${String(o.followUp || "").slice(0, 120)}"\nClose: "${String(o.close || "").slice(0, 120)}"`
          )
          .join("\n\n")
      : "(no library provided)";

    const userContent = `Prospect just said: "${text}"

Recent call context (last ~60 seconds): "${String(fullRecentContext || text).slice(-600)}"

Current call stage: ${currentStage}

Approved objection library:
${libraryRef}

Analyze and return JSON.`;

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      max_tokens: 420,
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    });

    const raw = (completion.choices?.[0]?.message?.content || "{}").trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[salesAssistant] AI returned non-JSON:", raw.slice(0, 300));
      return res.status(500).json({ ok: false, error: "AI returned invalid JSON" });
    }

    // Sanitize — only allowed classifications pass through
    if (!ALLOWED_CLASSIFICATIONS.includes(parsed.detectedObjection)) {
      parsed.detectedObjection = "No Clear Objection";
    }
    if (parsed.secondaryMatch && !ALLOWED_CLASSIFICATIONS.includes(parsed.secondaryMatch)) {
      parsed.secondaryMatch = null;
    }
    if (parsed.secondaryMatch === parsed.detectedObjection) {
      parsed.secondaryMatch = null;
    }

    const confidence = typeof parsed.confidence === "number"
      ? Math.min(1, Math.max(0, parsed.confidence))
      : 0;

    return res.json({
      detectedObjection: parsed.detectedObjection || "No Clear Objection",
      secondaryMatch: parsed.secondaryMatch || null,
      confidence,
      prospectMeaning: String(parsed.prospectMeaning || "").slice(0, 300),
      sayThis: String(parsed.sayThis || "").slice(0, 700),
      askThisNext: String(parsed.askThisNext || "").slice(0, 300),
      moveForward: String(parsed.moveForward || "").slice(0, 300),
      stage: String(parsed.stage || "listening"),
    });
  } catch (err) {
    console.error("[salesAssistant/analyze] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || "Analysis failed" });
  }
});

/* ─── POST /api/sales-assistant/transcribe ─────────────────────────────────── */
// Receives a base64 audio chunk, transcribes it with OpenAI Whisper, returns text.
// Audio is never written to disk — processed in memory and discarded immediately.
router.post("/sales-assistant/transcribe", async (req, res) => {
  try {
    const { audio, mimeType = "audio/webm", context = "" } = req.body || {};

    if (!audio || typeof audio !== "string") {
      return res.status(400).json({ ok: false, error: "audio field required (base64 string)" });
    }

    if (!OpenAI || !toFile || !process.env.OPENAI_API_KEY) {
      return res.status(503).json({ ok: false, error: "AI transcription service not configured" });
    }

    const buffer = Buffer.from(audio, "base64");

    // Skip chunks that are too small to contain real speech (likely silence)
    if (buffer.length < 1500) {
      return res.json({ ok: true, text: "" });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Determine file extension from MIME type for Whisper file hint
    const cleanMime = mimeType.split(";")[0].trim();
    const ext =
      cleanMime.includes("mp4") || cleanMime.includes("m4a") ? "mp4"
      : cleanMime.includes("ogg") ? "ogg"
      : cleanMime.includes("wav") ? "wav"
      : "webm";

    // Wrap buffer as a File object (no disk I/O — in-memory only)
    const file = await toFile(buffer, `chunk.${ext}`, { type: cleanMime });

    // Domain hint helps Whisper recognise HVAC / sales vocabulary accurately.
    // Prepend recent transcript context for cross-chunk continuity.
    const domainHint =
      "HVAC, heating, air conditioning, repair, install, marketing, advertising, " +
      "Facebook ads, Instagram, Google ads, Yelp, Smartemark, monthly, cancel anytime, " +
      "cold call, impressions, leads, results, agency, campaign, no contract";
    const prompt = context
      ? `${String(context).slice(-150)} ${domainHint}`
      : domainHint;

    const transcription = await client.audio.transcriptions.create({
      file,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || "whisper-1",
      language: "en",
      prompt,
    });

    // SDK returns { text } for json format (default)
    const text =
      typeof transcription === "string"
        ? transcription
        : String(transcription?.text || "").trim();

    return res.json({ ok: true, text });
  } catch (err) {
    console.error("[salesAssistant/transcribe] error:", err?.message || err);
    return res.status(500).json({ ok: false, error: err?.message || "Transcription failed" });
  }
});

module.exports = router;
