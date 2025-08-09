// server/smartCampaignEngine/generator/index.js
// Reuses your existing AI endpoints to create 2 fresh variants (image + video + copy).

const axios = require('axios');

function baseUrl() {
  // INTERNAL_BASE_URL can be set to your Render URL; fallback to localhost:PORT
  const fromEnv = process.env.INTERNAL_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const port = process.env.PORT || 10000;
  return `http://127.0.0.1:${port}`;
}

// Create two new creatives by calling your own endpoints
async function generateTwoCreatives({ form, answers, url, mediaSelection }) {
  const api = baseUrl() + '/api';

  // 1) Get image w/ overlay text
  const imgResp = await axios.post(`${api}/generate-image-from-prompt`, {
    url: url || form?.url || '',
    industry: answers?.industry || form?.industry || '',
    regenerateToken: `${Date.now()}_1`
  }, { timeout: 45000 });

  const imageUrl = imgResp.data?.imageUrl;
  const overlayResp = await axios.post(`${api}/generate-image-with-overlay`, {
    imageUrl,
    answers,
    url: url || form?.url || ''
  }, { timeout: 90000 });

  // 2) Get video
  const vidResp = await axios.post(`${api}/generate-video-ad`, {
    url: url || form?.url || '',
    answers: { ...answers, cta: 'Learn More!' },
    regenerateToken: `${Date.now()}_2`
  }, { timeout: 180000 });

  // 3) Get copy (headline+body)
  const copyResp = await axios.post(`${api}/generate-campaign-assets`, {
    answers,
    url: url || form?.url || ''
  }, { timeout: 60000 });

  const copy = `${copyResp.data?.headline || ''}\n\n${copyResp.data?.body || ''}`.trim();

  return [
    {
      kind: 'image',
      imageUrl: overlayResp.data?.imageUrl,
      adCopy: copy
    },
    {
      kind: 'video',
      video: {
        relativeUrl: vidResp.data?.videoUrl,
        absoluteUrl: vidResp.data?.absoluteVideoUrl,
        fbVideoId: vidResp.data?.fbVideoId || null
      },
      adCopy: copy
    }
  ];
}

module.exports = { generateTwoCreatives };
