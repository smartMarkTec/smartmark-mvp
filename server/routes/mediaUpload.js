'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const router = express.Router();

// Where to save uploaded images
// IMPORTANT: Set this to the SAME folder your existing /api/media/:filename uses.
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(process.cwd(), 'media');

// Ensure folder exists
fs.mkdirSync(MEDIA_DIR, { recursive: true });

// Helper: parse data URL -> { mime, buffer, ext }
function parseDataUrl(dataUrl) {
  const s = String(dataUrl || '');
  const m = s.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!m) return null;

  const mime = m[1];
  const b64 = m[2];

  let ext = 'png';
  if (mime.includes('jpeg')) ext = 'jpg';
  else if (mime.includes('webp')) ext = 'webp';
  else if (mime.includes('png')) ext = 'png';

  const buffer = Buffer.from(b64, 'base64');
  return { mime, buffer, ext };
}

// POST /api/media/upload
// Accepts JSON: { dataUrl } or { dataUrls: [] }
router.post('/upload', express.json({ limit: '20mb' }), async (req, res) => {
  try {
    const { dataUrl, dataUrls } = req.body || {};

    const inputs = [];
    if (dataUrl) inputs.push(dataUrl);
    if (Array.isArray(dataUrls)) inputs.push(...dataUrls);

    const clean = inputs
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, 2);

    if (!clean.length) {
      return res.status(400).json({ error: 'No dataUrl provided' });
    }

    const urls = [];

    for (const du of clean) {
      const parsed = parseDataUrl(du);
      if (!parsed) continue;

      const id = crypto.randomBytes(8).toString('hex');
      const filename = `static-${Date.now()}-${id}.${parsed.ext}`;
      const outPath = path.join(MEDIA_DIR, filename);

      fs.writeFileSync(outPath, parsed.buffer);

      // Your frontend already assumes /api/media/<filename>
      urls.push(`/api/media/${filename}`);
    }

    if (!urls.length) {
      return res.status(400).json({ error: 'Invalid dataUrl(s)' });
    }

    res.json({ success: true, urls });
  } catch (e) {
    res.status(500).json({ error: e?.message || 'Upload failed' });
  }
});

module.exports = router;
