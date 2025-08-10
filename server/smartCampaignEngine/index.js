// server/smartCampaignEngine/index.js
// Combined Policy + Analyzer + Generator + Deployer with A/B guardrails, stop rules, CPC/CTR metrics,
// and budget helpers (steps 1–5). Keep exports stable + add new helpers.

'use strict';

const axios = require('axios');
const FormData = require('form-data');
const path = require('path');

// =========================
// Shared helpers
// =========================
function absolutePublicUrl(relativePath) {
  const base =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    'https://smartmark-mvp.onrender.com';
  if (!relativePath) return '';
  return relativePath.startsWith('http') ? relativePath : `${base}${relativePath}`;
}

function baseUrl() {
  const fromEnv = process.env.INTERNAL_BASE_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const port = process.env.PORT || 10000;
  return `http://127.0.0.1:${port}`;
}

async function fbGetV(apiVersion, endpoint, params) {
  const url = `https://graph.facebook.com/${apiVersion}/${endpoint}`;
  const res = await axios.get(url, { params });
  return res.data;
}
async function fbPostV(apiVersion, endpoint, body, params) {
  const url = `https://graph.facebook.com/${apiVersion}/${endpoint}`;
  const res = await axios.post(url, body, { params });
  return res.data;
}
const FB_API_VER = 'v23.0';

// =========================
// POLICY (Step 1)
// =========================
const policy = {
  // Recent/prior windows for analyzer
  WINDOWS: {
    RECENT_DAYS: 3,
    PRIOR_DAYS: 3
  },

  // A/B defaults and guardrails
  VARIANTS: {
    DEFAULT_COUNT_PER_TYPE: 2,      // images:2, videos:2 (if selected)
    FALLBACK_COUNT_PER_TYPE: 1,     // fallback when budget/flight too small
    MIN_DAILY_BUDGET_FOR_AB: 20,    // USD
    MIN_FLIGHT_HOURS_FOR_AB: 48     // hours
  },

  // Stop rules (any one met → we can choose a winner)
  STOP_RULES: {
    MIN_SPEND_PER_AD: 20,           // USD
    MIN_IMPRESSIONS_PER_AD: 3000,
    MIN_CLICKS_PER_AD: 30,
    MAX_TEST_HOURS: 48              // hours since ad.created_time
  },

  // Plateau rules (Champion degradation)
  PLATEAU: {
    CPC_DEGRADATION_PCT: 0.20,      // +20% CPC vs baseline (prior window)
    MIN_IMPRESSIONS_RECENT: 1500,
    MIN_SPEND_RECENT: 5
  },

  // Safety limits
  LIMITS: {
    MAX_NEW_ADS_PER_RUN_PER_ADSET: 2,
    MIN_HOURS_BETWEEN_RUNS: 24,
    MIN_HOURS_BETWEEN_NEW_ADS: 72
  },

  // Legacy adset-level plateau heuristic (kept for compatibility)
  THRESHOLDS: {
    MIN_IMPRESSIONS: 1500,
    CTR_DROP_PCT: 0.20,
    FREQ_MAX: 2.0,
    MIN_SPEND: 5
  },

  isPlateau({ recent, prior, thresholds }) {
    const t = thresholds || this.THRESHOLDS;
    const safe = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
    const rImp = safe(recent.impressions);
    const pCtr = safe(prior.ctr);
    const rCtr = safe(recent.ctr);
    const rFreq = safe(recent.frequency);
    const rSpend = safe(recent.spend);
    if (rImp < t.MIN_IMPRESSIONS) return false;
    if (rSpend < t.MIN_SPEND) return false;
    const ctrDrop = pCtr > 0 ? (pCtr - rCtr) / pCtr : 0;
    if (ctrDrop >= t.CTR_DROP_PCT) return true;
    if (rFreq >= t.FREQ_MAX) return true;
    return false;
  },

  // Decide # of variants per asset type
  decideVariantPlan({ assetTypes = 'both', dailyBudget = 0, flightHours = 0, overrideCountPerType = null }) {
    const at = String(assetTypes || 'both').toLowerCase();
    const wantsImage = at === 'image' || at === 'both';
    const wantsVideo = at === 'video' || at === 'both';

    // override support
    if (overrideCountPerType && typeof overrideCountPerType === 'object') {
      return {
        images: wantsImage ? Math.max(1, Number(overrideCountPerType.images || 0)) : 0,
        videos: wantsVideo ? Math.max(1, Number(overrideCountPerType.videos || 0)) : 0
      };
    }

    const canAB =
      Number(dailyBudget) >= this.VARIANTS.MIN_DAILY_BUDGET_FOR_AB &&
      Number(flightHours) >= this.VARIANTS.MIN_FLIGHT_HOURS_FOR_AB;

    const count = canAB ? this.VARIANTS.DEFAULT_COUNT_PER_TYPE : this.VARIANTS.FALLBACK_COUNT_PER_TYPE;
    return {
      images: wantsImage ? count : 0,
      videos: wantsVideo ? count : 0
    };
  }
};

// =========================
// ANALYZER (Step 4)
// =========================
function dateRange(daysBackStart, daysBackLength) {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - daysBackStart);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBackLength + 1);
  const toYMD = (d) => d.toISOString().slice(0, 10);
  return { since: toYMD(start), until: toYMD(end) };
}

function parseMetrics(node) {
  if (!node || !node.data || !node.data[0]) return {};
  const x = node.data[0];
  const n = (v) => (v ? Number(v) : 0);
  const clicks = n(x.clicks);
  const spend = n(x.spend);
  const cpc = clicks > 0 ? spend / clicks : null;
  return {
    impressions: n(x.impressions),
    clicks,
    spend,
    ctr: n(x.ctr),
    cpm: n(x.cpm),
    frequency: n(x.frequency),
    cpc
  };
}

async function getWindowInsights(id, token, level, windows) {
  const FIELDS = 'impressions,clicks,spend,ctr,cpm,frequency';
  const { RECENT_DAYS, PRIOR_DAYS } = windows || policy.WINDOWS;

  const recentRange = dateRange(0, RECENT_DAYS);
  const priorRange = dateRange(RECENT_DAYS, PRIOR_DAYS);

  const [recent, prior] = await Promise.all([
    fbGetV(FB_API_VER, `${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(recentRange), level }),
    fbGetV(FB_API_VER, `${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(priorRange), level })
  ]);

  return {
    recent: parseMetrics(recent),
    prior: parseMetrics(prior),
    _ranges: { recentRange, priorRange }
  };
}

function rankAds(listByAdId, kpi = 'cpc') {
  const safe = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const rows = Object.entries(listByAdId).map(([adId, w]) => {
    const v =
      kpi === 'cpc'
        ? safe(w.recent?.cpc)
        : (kpi === 'ctr' ? safe(w.recent?.ctr) : safe(w.recent?.ctr));
    return { adId, value: v, windows: w };
  });

  // For CPC, lower is better; for CTR higher is better
  if (kpi === 'cpc') {
    rows.sort((a, b) => {
      if (a.value === null && b.value === null) return 0;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return a.value - b.value;
    });
  } else {
    rows.sort((a, b) => {
      if (a.value === null && b.value === null) return 0;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      return b.value - a.value;
    });
  }
  return rows;
}

function hoursSince(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 36e5;
}

function stopFlagsForAd(windows, createdTime, stop) {
  const r = windows?.recent || {};
  const flags = {
    spend: (r.spend || 0) >= stop.MIN_SPEND_PER_AD,
    impressions: (r.impressions || 0) >= stop.MIN_IMPRESSIONS_PER_AD,
    clicks: (r.clicks || 0) >= stop.MIN_CLICKS_PER_AD,
    time: hoursSince(createdTime) >= stop.MAX_TEST_HOURS
  };
  return {
    flags,
    any: !!(flags.spend || flags.impressions || flags.clicks || flags.time)
  };
}

const analyzer = {
  /**
   * Analyze a campaign (compatible return + extras).
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {string} opts.campaignId
   * @param {string} opts.userToken
   * @param {string} [opts.kpi='cpc']  // primary CPC, tiebreaker CTR
   */
  async analyzeCampaign({ accountId, campaignId, userToken, kpi = 'cpc' }) {
    // 1) Fetch ad sets within campaign
    const adsets = await fbGetV(FB_API_VER, `act_${accountId}/adsets`, {
      access_token: userToken,
      fields: 'id,name,campaign_id,status,daily_budget,budget_remaining',
      limit: 200,
      filtering: JSON.stringify([{ field: 'campaign_id', operator: 'IN', value: [campaignId] }])
    });

    const adsetIds = (adsets.data || []).map(a => a.id);
    const adsetInsights = {};
    const adInsights = {};
    const adMapByAdset = {};
    const adMeta = {}; // created_time per ad

    // 2) Per adset: insights + ads + per-ad insights
    for (const adsetId of adsetIds) {
      adsetInsights[adsetId] = await getWindowInsights(adsetId, userToken, 'adset', policy.WINDOWS);

      const ads = await fbGetV(FB_API_VER, `${adsetId}/ads`, {
        access_token: userToken,
        fields: 'id,name,status,created_time,creative{id,object_story_spec}',
        limit: 200
      });
      const ids = (ads.data || []).map(a => a.id);
      adMapByAdset[adsetId] = ids;
      for (const a of (ads.data || [])) {
        adMeta[a.id] = { created_time: a.created_time || null };
      }

      for (const adId of ids) {
        adInsights[adId] = await getWindowInsights(adId, userToken, 'ad', policy.WINDOWS);
      }
    }

    // 3) Plateau (legacy, adset-level) and CPC/CTR-based rankings
    const plateauByAdset = {};
    const winnersByAdset = {};
    const losersByAdset = {};
    const stopFlagsByAd = {};
    const championByAdset = {};
    const championPlateauByAdset = {};

    for (const adsetId of adsetIds) {
      const ids = adMapByAdset[adsetId] || [];

      // legacy plateau
      plateauByAdset[adsetId] = policy.isPlateau({
        recent: adsetInsights[adsetId].recent,
        prior: adsetInsights[adsetId].prior,
        thresholds: policy.THRESHOLDS
      });

      // rank by CPC (primary); choose loser by worst CPC
      const subset = {};
      ids.forEach(id => (subset[id] = adInsights[id]));
      const ranking = rankAds(subset, 'cpc');

      if (ranking.length > 0) {
        winnersByAdset[adsetId] = [ranking[0].adId];
        losersByAdset[adsetId] = [ranking[ranking.length - 1].adId];
        championByAdset[adsetId] = ranking[0].adId;
      } else {
        winnersByAdset[adsetId] = [];
        losersByAdset[adsetId] = [];
        championByAdset[adsetId] = null;
      }

      // stop flags per ad
      for (const adId of ids) {
        stopFlagsByAd[adId] = stopFlagsForAd(adInsights[adId], adMeta[adId]?.created_time, policy.STOP_RULES);
      }

      // Champion plateau (CPC degradation vs baseline)
      const champId = championByAdset[adsetId];
      if (champId) {
        const w = adInsights[champId] || {};
        const recent = w.recent || {};
        const prior = w.prior || {};
        const enoughVol =
          (recent.impressions || 0) >= policy.PLATEAU.MIN_IMPRESSIONS_RECENT &&
          (recent.spend || 0) >= policy.PLATEAU.MIN_SPEND_RECENT;
        const priorCpc = prior.cpc;
        const recentCpc = recent.cpc;
        let degraded = false;
        if (priorCpc && recentCpc) {
          const delta = (recentCpc - priorCpc) / priorCpc;
          degraded = delta >= policy.PLATEAU.CPC_DEGRADATION_PCT;
        }
        championPlateauByAdset[adsetId] = !!(enoughVol && degraded);
      } else {
        championPlateauByAdset[adsetId] = false;
      }
    }

    return {
      adsetIds,
      adMapByAdset,
      adsetInsights,
      adInsights,
      plateauByAdset,                 // legacy
      winnersByAdset,
      losersByAdset,
      stopFlagsByAd,
      championByAdset,
      championPlateauByAdset
    };
  }
};

// =========================
// GENERATOR (Step 2)
// =========================
const generator = {
  /**
   * Generate N variants per asset type using your existing AI endpoints.
   * @param {Object} opts
   * @param {Object} opts.form
   * @param {Object} opts.answers
   * @param {string} opts.url
   * @param {string} opts.mediaSelection  "image" | "video" | "both"
   * @param {Object} opts.variantPlan     { images: 0|1|2, videos: 0|1|2 }
   */
  async generateVariants({ form = {}, answers = {}, url = '', mediaSelection = 'both', variantPlan = { images: 2, videos: 2 } }) {
    const api = baseUrl() + '/api';
    const wantsImage = variantPlan.images > 0;
    const wantsVideo = variantPlan.videos > 0;

    // 1) Copy (generate once, reuse)
    let copy = '';
    try {
      const copyResp = await axios.post(`${api}/generate-campaign-assets`, {
        answers,
        url: url || form?.url || ''
      }, { timeout: 60000 });
      copy = `${copyResp.data?.headline || ''}\n\n${copyResp.data?.body || ''}`.trim();
    } catch {
      copy = '';
    }

    const out = [];

    // 2) Images
    if (wantsImage) {
      for (let i = 0; i < variantPlan.images; i++) {
        try {
          const regTok = `${Date.now()}_img_${i}_${Math.random().toString(36).slice(2, 8)}`;
          const imgResp = await axios.post(`${api}/generate-image-from-prompt`, {
            url: url || form?.url || '',
            industry: answers?.industry || form?.industry || '',
            regenerateToken: regTok
          }, { timeout: 45000 });

          const pickedUrl = imgResp.data?.imageUrl;
          if (!pickedUrl) continue;

          const overlayResp = await axios.post(`${api}/generate-image-with-overlay`, {
            imageUrl: pickedUrl,
            answers,
            url: url || form?.url || ''
          }, { timeout: 90000 });

          let imageUrl = overlayResp.data?.imageUrl || pickedUrl;
          imageUrl = absolutePublicUrl(imageUrl);

          out.push({
            kind: 'image',
            variantId: `img_${i + 1}`,
            imageUrl,
            adCopy: copy
          });
        } catch (e) {
          // skip this variant
        }
      }
    }

    // 3) Videos
    if (wantsVideo) {
      for (let i = 0; i < variantPlan.videos; i++) {
        try {
          const regTok = `${Date.now()}_vid_${i}_${Math.random().toString(36).slice(2, 8)}`;
          const vidResp = await axios.post(`${api}/generate-video-ad`, {
            url: url || form?.url || '',
            answers: { ...answers, cta: 'Learn More!' },
            regenerateToken: regTok
          }, { timeout: 180000 });

          const absoluteVideoUrl = vidResp.data?.absoluteVideoUrl || absolutePublicUrl(vidResp.data?.videoUrl || '');
          out.push({
            kind: 'video',
            variantId: `vid_${i + 1}`,
            video: {
              relativeUrl: vidResp.data?.videoUrl || '',
              absoluteUrl: absoluteVideoUrl || '',
              fbVideoId: vidResp.data?.fbVideoId || null
            },
            adCopy: copy
          });
        } catch (e) {
          // skip this variant
        }
      }
    }

    return out;
  },

  // Back-compat: old function used by existing code
  async generateTwoCreatives({ form = {}, answers = {}, url = '', mediaSelection = 'both' }) {
    return this.generateVariants({
      form,
      answers,
      url,
      mediaSelection,
      variantPlan: { images: 1, videos: 1 }
    });
  }
};

// =========================
// DEPLOYER (Step 3) + Budget helpers (Step 5)
// =========================
async function uploadImageToAccount({ accountId, userToken, dataUrl }) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image data URL');
  const base64 = m[2];
  const resp = await fbPostV(FB_API_VER, `act_${accountId}/adimages`, new URLSearchParams({ bytes: base64 }), {
    access_token: userToken
  });
  const hash = Object.values(resp.images || {})[0]?.hash;
  if (!hash) throw new Error('Image upload failed');
  return hash;
}

async function ensureVideoId({ accountId, userToken, creativeVideo }) {
  if (creativeVideo.fbVideoId) return creativeVideo.fbVideoId;

  // If we have an absolute file URL, upload by file_url
  if (creativeVideo.absoluteUrl) {
    const form = new FormData();
    form.append('file_url', creativeVideo.absoluteUrl);
    form.append('name', 'SmartMark Generated Video');
    form.append('description', 'Generated by SmartMark');

    const res = await axios.post(
      `https://graph.facebook.com/${FB_API_VER}/act_${accountId}/advideos`,
      form,
      { headers: form.getHeaders(), params: { access_token: userToken } }
    );
    return res.data?.id;
  }
  throw new Error('No video available to upload');
}

async function createImageAd({ pageId, accountId, adsetId, adCopy, imageHash, userToken, link }) {
  const creative = await fbPostV(FB_API_VER, `act_${accountId}/adcreatives`, {
    name: `SmartMark Image ${new Date().toISOString()}`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: adCopy || '',
        link: link || 'https://your-smartmark-site.com',
        image_hash: imageHash
      }
    }
  }, { access_token: userToken });

  const ad = await fbPostV(FB_API_VER, `act_${accountId}/ads`, {
    name: `SmartMark Image Ad ${new Date().toISOString()}`,
    adset_id: adsetId,
    creative: { creative_id: creative.id },
    status: 'ACTIVE'
  }, { access_token: userToken });

  return ad.id;
}

async function createVideoAd({ pageId, accountId, adsetId, adCopy, videoId, imageHash, userToken, link }) {
  // Optional thumbnail (not required)
  let image_url = null;
  try {
    const thumbs = await fbGetV(FB_API_VER, `${videoId}/thumbnails`, { access_token: userToken, fields: 'uri,is_preferred' });
    image_url = (thumbs.data || [])[0]?.uri || null;
  } catch {}

  const video_data = {
    video_id: videoId,
    message: adCopy || '',
    title: 'SmartMark Video',
    call_to_action: { type: 'LEARN_MORE', value: { link: link || 'https://your-smartmark-site.com' } }
  };
  if (image_url) video_data.image_url = image_url;

  const creative = await fbPostV(FB_API_VER, `act_${accountId}/adcreatives`, {
    name: `SmartMark Video ${new Date().toISOString()}`,
    object_story_spec: { page_id: pageId, video_data }
  }, { access_token: userToken });

  const ad = await fbPostV(FB_API_VER, `act_${accountId}/ads`, {
    name: `SmartMark Video Ad ${new Date().toISOString()}`,
    adset_id: adsetId,
    creative: { creative_id: creative.id },
    status: 'ACTIVE'
  }, { access_token: userToken });

  return ad.id;
}

async function pauseAds({ adIds, userToken }) {
  for (const id of adIds) {
    try {
      await fbPostV(FB_API_VER, id, { status: 'PAUSED' }, { access_token: userToken });
    } catch (e) {
      // log and keep going
      console.warn('Pause failed for', id, e?.response?.data?.error?.message || e.message);
    }
  }
}

// Budget helpers (Step 5)
async function setAdsetDailyBudget({ adsetId, dailyBudgetCents, userToken }) {
  // NB: Requires correct access & ad set billing settings
  await fbPostV(FB_API_VER, adsetId, { daily_budget: Math.max(100, Number(dailyBudgetCents || 0)) }, { access_token: userToken });
}

async function splitBudgetBetweenChampionAndChallengers({
  championAdsetId,
  challengerAdsetId,
  totalBudgetCents,
  championPct = 0.75,
  userToken
}) {
  const total = Math.max(200, Number(totalBudgetCents || 0));
  const champ = Math.round(total * Math.min(0.95, Math.max(0.05, championPct)));
  const chall = Math.max(100, total - champ);
  await setAdsetDailyBudget({ adsetId: championAdsetId, dailyBudgetCents: champ, userToken });
  await setAdsetDailyBudget({ adsetId: challengerAdsetId, dailyBudgetCents: chall, userToken });
}

const deployer = {
  /**
   * Deploy variants as separate ads in each ad set (capped by policy limit).
   * Returns { createdAdsByAdset, pausedAdsByAdset, variantMapByAdset }
   */
  async deploy({ accountId, pageId, campaignLink, adsetIds, winnersByAdset, losersByAdset, creatives, userToken }) {
    const createdAdsByAdset = {};
    const pausedAdsByAdset = {};
    const variantMapByAdset = {};

    // Prepare cached image uploads to avoid re-uploading same image URL
    const uploadedImageHashByDataUrl = new Map();

    for (const adsetId of adsetIds) {
      createdAdsByAdset[adsetId] = [];
      pausedAdsByAdset[adsetId] = [];
      variantMapByAdset[adsetId] = {};

      // Cap the number of new ads per run per adset
      const maxNew = policy.LIMITS.MAX_NEW_ADS_PER_RUN_PER_ADSET;
      let created = 0;

      for (const c of creatives) {
        if (created >= maxNew) break;

        try {
          if (c.kind === 'image' && c.imageUrl) {
            // Fetch the image file and upload as data: URL to adimages
            const imgRes = await axios.get(c.imageUrl, { responseType: 'arraybuffer' });
            const dataUrl = `data:image/jpeg;base64,${Buffer.from(imgRes.data).toString('base64')}`;

            let hash;
            if (uploadedImageHashByDataUrl.has(dataUrl)) {
              hash = uploadedImageHashByDataUrl.get(dataUrl);
            } else {
              hash = await uploadImageToAccount({ accountId, userToken, dataUrl });
              uploadedImageHashByDataUrl.set(dataUrl, hash);
            }

            const adId = await createImageAd({
              pageId, accountId, adsetId,
              adCopy: c.adCopy,
              imageHash: hash,
              userToken,
              link: campaignLink
            });

            createdAdsByAdset[adsetId].push(adId);
            variantMapByAdset[adsetId][c.variantId || `image_${created + 1}`] = adId;
            created += 1;
          } else if (c.kind === 'video' && c.video) {
            const videoId = await ensureVideoId({ accountId, userToken, creativeVideo: c.video });

            const adId = await createVideoAd({
              pageId, accountId, adsetId,
              adCopy: c.adCopy,
              videoId,
              imageHash: null,
              userToken,
              link: campaignLink
            });

            createdAdsByAdset[adsetId].push(adId);
            variantMapByAdset[adsetId][c.variantId || `video_${created + 1}`] = adId;
            created += 1;
          }
        } catch (e) {
          console.warn('Create ad failed:', e?.response?.data?.error?.message || e.message);
        }
      }

      // Pause only the worst 1 per adset (as provided)
      const losers = losersByAdset[adsetId] || [];
      if (losers.length) {
        await pauseAds({ adIds: losers, userToken });
        pausedAdsByAdset[adsetId].push(...losers);
      }
    }

    return { createdAdsByAdset, pausedAdsByAdset, variantMapByAdset };
  },

  // Budget helpers exposed
  setAdsetDailyBudget,
  splitBudgetBetweenChampionAndChallengers
};

module.exports = {
  policy,
  analyzer,
  generator,
  deployer
};
