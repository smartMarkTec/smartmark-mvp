// server/smartCampaignEngine/index.js
'use strict';

const axios = require('axios');
const FormData = require('form-data');

// ===== runtime test toggles (no spend / dry run) =====
const NO_SPEND = process.env.NO_SPEND === '1';
const VALIDATE_ONLY = process.env.VALIDATE_ONLY === '1';
const SAFE_START = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // +7 days

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
  return `http://localhost:${port}`; // safer than 127.0.0.1 in some hosts
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeJson(obj) {
  try { return JSON.stringify(obj); } catch { return '[unserializable]'; }
}

async function fbGetV(apiVersion, endpoint, params) {
  const url = `https://graph.facebook.com/${apiVersion}/${endpoint}`;
  const res = await axios.get(url, { params });
  return res.data;
}

async function fbPostV(apiVersion, endpoint, body, params = {}) {
  const url = `https://graph.facebook.com/${apiVersion}/${endpoint}`;
  const mergedParams = { ...params };
  if (VALIDATE_ONLY) mergedParams.execution_options = 'validate_only';
  const res = await axios.post(url, body, { params: mergedParams });
  return res.data;
}

const FB_API_VER = 'v23.0';

// =========================
/* POLICY */
const policy = {
  WINDOWS: { RECENT_DAYS: 3, PRIOR_DAYS: 3 },
  VARIANTS: {
    DEFAULT_COUNT_PER_TYPE: 2,
    FALLBACK_COUNT_PER_TYPE: 1,
    MIN_DAILY_BUDGET_FOR_AB: 20,
    MIN_FLIGHT_HOURS_FOR_AB: 48
  },
  STOP_RULES: {
    MIN_SPEND_PER_AD: 20,
    MIN_IMPRESSIONS_PER_AD: 3000,
    MIN_CLICKS_PER_AD: 30,
    MAX_TEST_HOURS: 48
  },
  PLATEAU: {
    CPC_DEGRADATION_PCT: 0.20,
    MIN_IMPRESSIONS_RECENT: 1500,
    MIN_SPEND_RECENT: 5
  },
  LIMITS: {
    MAX_NEW_ADS_PER_RUN_PER_ADSET: 2,
    MIN_HOURS_BETWEEN_RUNS: 24,
    MIN_HOURS_BETWEEN_NEW_ADS: 72
  },
  THRESHOLDS: { MIN_IMPRESSIONS: 1500, CTR_DROP_PCT: 0.20, FREQ_MAX: 2.0, MIN_SPEND: 5 },

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

  decideVariantPlan({
    assetTypes = 'both',
    dailyBudget = 0,
    flightHours = 0,
    overrideCountPerType = null,
    forceTwoPerType = false
  }) {
    const at = String(assetTypes || 'both').toLowerCase();
    const wantsImage = at === 'image' || at === 'both';
    const wantsVideo = at === 'video' || at === 'both';

    if (overrideCountPerType && typeof overrideCountPerType === 'object') {
      return {
        images: wantsImage ? Math.max(0, Number(overrideCountPerType.images || 0)) : 0,
        videos: wantsVideo ? Math.max(0, Number(overrideCountPerType.videos || 0)) : 0
      };
    }

    if (forceTwoPerType) {
      const count = this.VARIANTS.DEFAULT_COUNT_PER_TYPE;
      return { images: wantsImage ? count : 0, videos: wantsVideo ? count : 0 };
    }

    const canAB =
      Number(dailyBudget) >= this.VARIANTS.MIN_DAILY_BUDGET_FOR_AB &&
      Number(flightHours) >= this.VARIANTS.MIN_FLIGHT_HOURS_FOR_AB;

    const count = canAB ? this.VARIANTS.DEFAULT_COUNT_PER_TYPE : this.VARIANTS.FALLBACK_COUNT_PER_TYPE;
    return { images: wantsImage ? count : 0, videos: wantsVideo ? count : 0 };
  }
};

// =========================
// TEST MOCKS
const _mocks = { adset: {}, ad: {} };

function _norm(m = {}) {
  const imp = Number(m.impressions || 0);
  const clk = Number(m.clicks || 0);
  const sp = Number(m.spend || 0);
  const ctr = (typeof m.ctr === 'number') ? m.ctr : (imp ? (clk / imp) * 100 : 0);
  const cpm = (typeof m.cpm === 'number') ? m.cpm : (imp ? (sp / imp) * 1000 : 0);
  const freq = Number(m.frequency || 1);
  const cpc = clk > 0 ? sp / clk : null;
  return { impressions: imp, clicks: clk, spend: sp, ctr, cpm, frequency: freq, cpc };
}

const testing = {
  setMockInsights({ adset = {}, ad = {} } = {}) {
    _mocks.adset = { ..._mocks.adset, ...adset };
    _mocks.ad = { ..._mocks.ad, ...ad };
  },
  clearMockInsights() {
    _mocks.adset = {};
    _mocks.ad = {};
  }
};

// =========================
/* ANALYZER */
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
  if (level === 'adset' && _mocks.adset[id]) {
    const { recent = {}, prior = {} } = _mocks.adset[id];
    return { recent: _norm(recent), prior: _norm(prior), _ranges: null };
  }
  if (level === 'ad' && _mocks.ad[id]) {
    const { recent = {}, prior = {} } = _mocks.ad[id];
    return { recent: _norm(recent), prior: _norm(prior), _ranges: null };
  }

  const FIELDS = 'impressions,clicks,spend,ctr,cpm,frequency';
  const { RECENT_DAYS, PRIOR_DAYS } = windows || policy.WINDOWS;

  const recentRange = dateRange(0, RECENT_DAYS);
  const priorRange = dateRange(RECENT_DAYS, PRIOR_DAYS);

  const [recent, prior] = await Promise.all([
    fbGetV(FB_API_VER, `${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(recentRange), level }),
    fbGetV(FB_API_VER, `${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(priorRange), level })
  ]);

  return { recent: parseMetrics(recent), prior: parseMetrics(prior), _ranges: { recentRange, priorRange } };
}

function rankAds(listByAdId, kpi = 'cpc') {
  const toNum = (v) => (typeof v === 'number' && isFinite(v) ? v : null);
  const rows = Object.entries(listByAdId).map(([adId, w]) => ({
    adId,
    cpc: toNum(w?.recent?.cpc),
    ctr: toNum(w?.recent?.ctr),
    windows: w
  }));

  const EPS = 1e-9;
  const byCpcThenCtr = (a, b) => {
    const ac = a.cpc == null ? Number.POSITIVE_INFINITY : a.cpc;
    const bc = b.cpc == null ? Number.POSITIVE_INFINITY : b.cpc;
    if (Math.abs(ac - bc) > EPS) return ac - bc;
    const actr = a.ctr == null ? Number.NEGATIVE_INFINITY : a.ctr;
    const bctr = b.ctr == null ? Number.NEGATIVE_INFINITY : b.ctr;
    if (Math.abs(actr - bctr) > EPS) return bctr - actr;
    return String(a.adId).localeCompare(String(b.adId));
  };
  const byCtrThenCpc = (a, b) => {
    const actr = a.ctr == null ? Number.NEGATIVE_INFINITY : a.ctr;
    const bctr = b.ctr == null ? Number.NEGATIVE_INFINITY : b.ctr;
    if (Math.abs(actr - bctr) > EPS) return bctr - actr;
    const ac = a.cpc == null ? Number.POSITIVE_INFINITY : a.cpc;
    const bc = b.cpc == null ? Number.POSITIVE_INFINITY : b.cpc;
    if (Math.abs(ac - bc) > EPS) return ac - bc;
    return String(a.adId).localeCompare(String(b.adId));
  };

  rows.sort(kpi === 'ctr' ? byCtrThenCpc : byCpcThenCtr);
  return rows.map(r => ({ adId: r.adId, value: kpi === 'ctr' ? r.ctr : r.cpc, windows: r.windows }));
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
  return { flags, any: !!(flags.spend || flags.impressions || flags.clicks || flags.time) };
}

const analyzer = {
  async analyzeCampaign({ accountId, campaignId, userToken, kpi = 'cpc', stopRules = null }) {
    const adsetsResp = await fbGetV(FB_API_VER, `${campaignId}/adsets`, {
      access_token: userToken,
      fields: 'id,name,status,daily_budget,budget_remaining,created_time',
      limit: 200
    });

    let adsetIds = (adsetsResp.data || []).map(a => a.id);

    if (adsetIds.length === 0) {
      const adsFallback = await fbGetV(FB_API_VER, `${campaignId}/ads`, {
        access_token: userToken,
        fields: 'id,adset_id',
        limit: 200
      });
      const set = new Set((adsFallback.data || []).map(a => a.adset_id).filter(Boolean));
      adsetIds = Array.from(set);
    }

    const adsetInsights = {};
    const adInsights = {};
    const adMapByAdset = {};
    const adMeta = {};
    const stop = stopRules || policy.STOP_RULES;

    for (const adsetId of adsetIds) {
      adsetInsights[adsetId] = await getWindowInsights(adsetId, userToken, 'adset', policy.WINDOWS);

      const ads = await fbGetV(FB_API_VER, `${adsetId}/ads`, {
        access_token: userToken,
        fields: 'id,name,status,effective_status,created_time,adset_id,creative{id,object_story_spec}',
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

    const plateauByAdset = {};
    const winnersByAdset = {};
    const losersByAdset = {};
    const stopFlagsByAd = {};
    const championByAdset = {};
    const championPlateauByAdset = {};

    for (const adsetId of adsetIds) {
      const ids = adMapByAdset[adsetId] || [];

      plateauByAdset[adsetId] = policy.isPlateau({
        recent: adsetInsights[adsetId]?.recent || {},
        prior: adsetInsights[adsetId]?.prior || {},
        thresholds: policy.THRESHOLDS
      });

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

      for (const adId of ids) {
        stopFlagsByAd[adId] = stopFlagsForAd(adInsights[adId], adMeta[adId]?.created_time, stop);
      }

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
      plateauByAdset,
      winnersByAdset,
      losersByAdset,
      stopFlagsByAd,
      championByAdset,
      championPlateauByAdset
    };
  }
};

// =========================
/* GENERATOR */
function pickImageUrlFromPromptResponse(data) {
  if (!data) return '';
  // Most common legacy shape
  if (typeof data.imageUrl === 'string' && data.imageUrl) return data.imageUrl;
  if (typeof data.absoluteUrl === 'string' && data.absoluteUrl) return data.absoluteUrl;

  // Current shape you showed: { ok:true, images:[{absoluteUrl:...}, ...] }
  if (Array.isArray(data.images) && data.images.length) {
    const first = data.images[0] || {};
    if (typeof first.absoluteUrl === 'string' && first.absoluteUrl) return first.absoluteUrl;
    if (typeof first.url === 'string' && first.url) return first.url;
    if (typeof first.imageUrl === 'string' && first.imageUrl) return first.imageUrl;
  }

  // Other possible shapes
  if (Array.isArray(data.imageUrls) && data.imageUrls.length) return data.imageUrls[0] || '';
  if (Array.isArray(data.urls) && data.urls.length) return data.urls[0] || '';
  return '';
}

const generator = {
  async generateVariants({
    form = {},
    answers = {},
    url = '',
    mediaSelection = 'both',
    variantPlan = { images: 2, videos: 2 },
    debug = false
  }) {
    const api = baseUrl() + '/api';

    const wantsImage = Number(variantPlan.images || 0) > 0;
    const wantsVideo = Number(variantPlan.videos || 0) > 0;

    const seedUrl = url || form?.url || '';
    const seedIndustry = answers?.industry || form?.industry || '';

    const errors = [];

    let copy = '';
    try {
      const copyResp = await axios.post(`${api}/generate-campaign-assets`, {
        answers,
        url: seedUrl
      }, { timeout: 120000 });
      copy = `${copyResp.data?.headline || ''}\n\n${copyResp.data?.body || ''}`.trim();
    } catch (e) {
      errors.push({ step: 'copy', message: e?.response?.data?.error || e?.message || 'copy_failed' });
      copy = '';
    }

    const out = [];

    const genImageOnce = async (i) => {
      const regTok = `${Date.now()}_img_${i}_${Math.random().toString(36).slice(2, 8)}`;

      const imgResp = await axios.post(`${api}/generate-image-from-prompt`, {
        url: seedUrl,
        industry: seedIndustry,
        answers,
        regenerateToken: regTok
      }, { timeout: 180000 });

      const pickedUrl = pickImageUrlFromPromptResponse(imgResp.data);
      if (!pickedUrl) throw new Error('image_endpoint_returned_no_imageUrl');

      // IMPORTANT FIX:
      // Your generate-image-from-prompt already returns a final composed static (api/media/...)
      // The overlay endpoint is not guaranteed to exist on Render; do NOT hard-fail on it.
      let imageUrl = pickedUrl;

      // Optional overlay (safe fallback). Only attempt if explicitly enabled.
      const TRY_OVERLAY = process.env.SMART_TRY_IMAGE_OVERLAY === '1';
      if (TRY_OVERLAY) {
        try {
          const overlayResp = await axios.post(`${api}/generate-image-with-overlay`, {
            imageUrl: pickedUrl,
            answers,
            url: seedUrl,
            regenerateToken: regTok
          }, { timeout: 240000 });

          const overlayUrl = overlayResp.data?.imageUrl;
          if (overlayUrl) imageUrl = overlayUrl;
        } catch (e) {
          // swallow overlay errors so image generation still succeeds
          const status = e?.response?.status;
          const msg = e?.response?.data?.error || e?.response?.data || e?.message || 'overlay_failed';
          if (debug) console.warn('[smartCampaignEngine] overlay skipped/fallback', safeJson({ status, msg }));
        }
      }

      imageUrl = absolutePublicUrl(imageUrl);
      if (!imageUrl.startsWith('http')) throw new Error('imageUrl_not_public');

      return { kind: 'image', variantId: `img_${i}`, imageUrl, adCopy: copy };
    };

    const genVideoOnce = async (i) => {
      const regTok = `${Date.now()}_vid_${i}_${Math.random().toString(36).slice(2, 8)}`;

      const vidResp = await axios.post(`${api}/generate-video-ad`, {
        url: seedUrl,
        answers: { ...answers, cta: answers?.cta || 'Learn More!' },
        regenerateToken: regTok,
        variant: (i % 2) + 1
      }, { timeout: 420000 });

      const rel = vidResp.data?.videoUrl || '';
      const abs = vidResp.data?.absoluteVideoUrl || absolutePublicUrl(rel);

      if (!abs || !abs.startsWith('http')) throw new Error('videoUrl_not_public');

      return {
        kind: 'video',
        variantId: `vid_${i}`,
        video: {
          relativeUrl: rel,
          absoluteUrl: abs,
          fbVideoId: vidResp.data?.fbVideoId || null,
          variant: vidResp.data?.variant || ((i % 2) + 1)
        },
        adCopy: copy
      };
    };

    // Retry strategy: attempt up to 3x per requested creative.
    const maxImgAttempts = wantsImage ? Math.max(variantPlan.images * 3, variantPlan.images) : 0;
    const maxVidAttempts = wantsVideo ? Math.max(variantPlan.videos * 3, variantPlan.videos) : 0;

    if (wantsImage) {
      let made = 0;
      let attempts = 0;
      while (made < variantPlan.images && attempts < maxImgAttempts) {
        attempts += 1;
        try {
          const c = await genImageOnce(made + 1);
          out.push(c);
          made += 1;
        } catch (e) {
          const msg = e?.response?.data?.error || e?.response?.data || e?.message || 'image_generate_failed';
          errors.push({ step: 'image', attempt: attempts, message: String(msg) });
          if (debug) console.warn('[smartCampaignEngine] image gen fail:', msg);
          await sleep(250);
        }
      }
      if (made < variantPlan.images) {
        console.warn(`[smartCampaignEngine] images generated ${made}/${variantPlan.images}. errors=${errors.filter(x => x.step === 'image').length}`);
      }
    }

    if (wantsVideo) {
      let made = 0;
      let attempts = 0;
      while (made < variantPlan.videos && attempts < maxVidAttempts) {
        attempts += 1;
        try {
          const c = await genVideoOnce(made + 1);
          out.push(c);
          made += 1;
        } catch (e) {
          const msg = e?.response?.data?.error || e?.response?.data || e?.message || 'video_generate_failed';
          errors.push({ step: 'video', attempt: attempts, message: String(msg) });
          if (debug) console.warn('[smartCampaignEngine] video gen fail:', msg);
          await sleep(500);
        }
      }
      if (made < variantPlan.videos) {
        console.warn(`[smartCampaignEngine] videos generated ${made}/${variantPlan.videos}. errors=${errors.filter(x => x.step === 'video').length}`);
      }
    }

    // Always surface a useful log line so you can see whether generation happened
    if (debug) {
      const imgs = out.filter(x => x.kind === 'image').length;
      const vids = out.filter(x => x.kind === 'video').length;
      console.warn('[smartCampaignEngine] generateVariants done', safeJson({
        requested: variantPlan,
        got: { images: imgs, videos: vids },
        errorCount: errors.length
      }));
      if (errors.length) console.warn('[smartCampaignEngine] generateVariants errors', safeJson(errors.slice(-10)));
    }

    // Keep return type backward compatible (array), but expose errors through console + attach for internal use
    out._errors = errors; // useful to callers in-process
    return out;
  },

  async generateTwoCreatives({ form = {}, answers = {}, url = '', mediaSelection = 'both', debug = false }) {
    return this.generateVariants({ form, answers, url, mediaSelection, variantPlan: { images: 1, videos: 2 }, debug });
  }
};

// =========================
/* DEPLOYER (+ dryRun simulation for tests) */
async function uploadImageToAccount({ accountId, userToken, dataUrl }) {
  const m = /^data:(image\/\w+);base64,(.+)$/.exec(dataUrl || '');
  if (!m) throw new Error('Invalid image data URL');
  const base64 = m[2];
  const resp = await fbPostV(FB_API_VER, `act_${accountId}/adimages`, new URLSearchParams({ bytes: base64 }), {
    access_token: userToken
  });
  let hash = Object.values(resp.images || {})[0]?.hash || null;
  if (!hash && VALIDATE_ONLY) hash = 'VALIDATION_ONLY_HASH';
  if (!hash) throw new Error('Image upload failed');
  return hash;
}

async function ensureVideoId({ accountId, userToken, creativeVideo }) {
  if (creativeVideo?.fbVideoId) return creativeVideo.fbVideoId;

  const absoluteUrl = creativeVideo?.absoluteUrl || (creativeVideo?.relativeUrl ? absolutePublicUrl(creativeVideo.relativeUrl) : '');
  if (absoluteUrl) {
    const form = new FormData();
    form.append('file_url', absoluteUrl);
    form.append('name', 'SmartMark Generated Video');
    form.append('description', 'Generated by SmartMark');
    const res = await axios.post(
      `https://graph.facebook.com/${FB_API_VER}/act_${accountId}/advideos`,
      form,
      {
        headers: form.getHeaders(),
        params: VALIDATE_ONLY
          ? { access_token: userToken, execution_options: 'validate_only' }
          : { access_token: userToken }
      }
    );
    const vid = res.data?.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_VIDEO_${Date.now()}` : null);
    if (!vid) throw new Error('Video upload failed');
    return vid;
  }
  throw new Error('No video available to upload');
}

async function createImageAd({ pageId, accountId, adsetId, adCopy, imageHash, userToken, link }) {
  const creative = await fbPostV(FB_API_VER, `act_${accountId}/adcreatives`, {
    name: `SmartMark Image ${new Date().toISOString()}`,
    object_story_spec: {
      page_id: pageId,
      link_data: { message: adCopy || '', link: link || 'https://your-smartmark-site.com', image_hash: imageHash }
    }
  }, { access_token: userToken });

  const creativeId = creative.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_CREATIVE_${Date.now()}` : null);
  if (!creativeId) throw new Error('Creative create failed');

  const ad = await fbPostV(FB_API_VER, `act_${accountId}/ads`, {
    name: `SmartMark Image Ad ${new Date().toISOString()}`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: NO_SPEND ? 'PAUSED' : 'ACTIVE'
  }, { access_token: userToken });

  const adId = ad.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_AD_${Date.now()}` : null);
  if (!adId) throw new Error('Ad create failed');
  return adId;
}

async function createVideoAd({ pageId, accountId, adsetId, adCopy, videoId, userToken, link }) {
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

  const creativeId = creative.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_CREATIVE_${Date.now()}` : null);
  if (!creativeId) throw new Error('Creative create failed');

  const ad = await fbPostV(FB_API_VER, `act_${accountId}/ads`, {
    name: `SmartMark Video Ad ${new Date().toISOString()}`,
    adset_id: adsetId,
    creative: { creative_id: creativeId },
    status: NO_SPEND ? 'PAUSED' : 'ACTIVE'
  }, { access_token: userToken });

  const adId = ad.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_AD_${Date.now()}` : null);
  if (!adId) throw new Error('Ad create failed');
  return adId;
}

async function pauseAds({ adIds, userToken }) {
  for (const id of adIds) {
    try {
      await fbPostV(FB_API_VER, id, { status: 'PAUSED' }, { access_token: userToken });
    } catch (e) {
      console.warn('Pause failed for', id, e?.response?.data?.error?.message || e.message);
    }
  }
}

async function setAdsetDailyBudget({ adsetId, dailyBudgetCents, userToken }) {
  await fbPostV(FB_API_VER, adsetId, { daily_budget: Math.max(100, Number(dailyBudgetCents || 0)) }, { access_token: userToken });
}

async function splitBudgetBetweenChampionAndChallengers({ championAdsetId, challengerAdsetId, totalBudgetCents, championPct = 0.75, userToken }) {
  const total = Math.max(200, Number(totalBudgetCents || 0));
  const champ = Math.round(total * Math.min(0.95, Math.max(0.05, championPct)));
  const chall = Math.max(100, total - champ);
  await setAdsetDailyBudget({ adsetId: championAdsetId, dailyBudgetCents: champ, userToken });
  await setAdsetDailyBudget({ adsetId: challengerAdsetId, dailyBudgetCents: chall, userToken });
}

async function getAdsetDetails({ adsetId, userToken }) {
  const FIELDS = [
    'name','campaign_id','daily_budget','billing_event','optimization_goal','bid_strategy',
    'targeting','promoted_object','attribution_spec','start_time','end_time'
  ].join(',');
  return fbGetV(FB_API_VER, adsetId, { access_token: userToken, fields: FIELDS });
}

async function ensureChallengerAdsetClone({
  accountId, campaignId, sourceAdsetId, userToken,
  nameSuffix = 'Challengers', dailyBudgetCents = 300
}) {
  const src = await getAdsetDetails({ adsetId: sourceAdsetId, userToken });

  const body = {
    name: `${src.name || 'Ad Set'} - ${nameSuffix}`,
    campaign_id: campaignId,
    daily_budget: Math.max(100, Number(dailyBudgetCents || src.daily_budget || 300)),
    billing_event: src.billing_event || 'IMPRESSIONS',
    optimization_goal: src.optimization_goal || 'LINK_CLICKS',
    ...(src.bid_strategy ? { bid_strategy: src.bid_strategy } : {}),
    ...(src.targeting ? { targeting: src.targeting } : {}),
    ...(src.promoted_object ? { promoted_object: src.promoted_object } : {}),
    ...(src.attribution_spec ? { attribution_spec: src.attribution_spec } : {}),
    ...(src.start_time ? { start_time: src.start_time } : {}),
    ...(src.end_time ? { end_time: src.end_time } : {}),
    status: NO_SPEND ? 'PAUSED' : 'ACTIVE'
  };

  const created = await fbPostV(FB_API_VER, `act_${accountId}/adsets`, body, { access_token: userToken });
  const id = created.id || (VALIDATE_ONLY ? `VALIDATION_ONLY_ADSET_${Date.now()}` : null);
  if (!id) throw new Error('Challenger ad set creation failed');
  return id;
}

function countKinds(creatives) {
  const counts = { images: 0, videos: 0 };
  for (const c of creatives || []) {
    if (c?.kind === 'image' && c?.imageUrl) counts.images += 1;
    if (c?.kind === 'video' && c?.video?.absoluteUrl) counts.videos += 1;
  }
  return counts;
}

const deployer = {
  async deploy({
    accountId,
    pageId,
    campaignLink,
    adsetIds,
    winnersByAdset,
    losersByAdset,
    creatives,
    userToken,
    dryRun = false,
    debug = false
  }) {
    const createdAdsByAdset = {};
    const pausedAdsByAdset = {};
    const variantMapByAdset = {};

    const generatedCounts = countKinds(creatives);
    if (debug) console.warn('[smartCampaignEngine] deploy input', safeJson({ dryRun, generatedCounts, adsetCount: (adsetIds || []).length }));

    for (const adsetId of (adsetIds || [])) {
      createdAdsByAdset[adsetId] = [];
      pausedAdsByAdset[adsetId] = [];
      variantMapByAdset[adsetId] = {};

      // Always pause losers if present (safe)
      const losers = losersByAdset?.[adsetId] || [];
      if (losers.length && userToken) {
        await pauseAds({ adIds: losers, userToken });
        pausedAdsByAdset[adsetId].push(...losers);
      }

      // If dryRun, simulate "created" IDs so your tests can prove the engine produced the right # of variants
      if (dryRun) {
        let n = 0;
        for (const c of creatives || []) {
          if (c.kind === 'image' && c.imageUrl) {
            n += 1;
            const fake = `DRYRUN_IMG_AD_${Date.now()}_${n}`;
            createdAdsByAdset[adsetId].push(fake);
            variantMapByAdset[adsetId][c.variantId || `image_${n}`] = fake;
          } else if (c.kind === 'video' && c.video?.absoluteUrl) {
            n += 1;
            const fake = `DRYRUN_VID_AD_${Date.now()}_${n}`;
            createdAdsByAdset[adsetId].push(fake);
            variantMapByAdset[adsetId][c.variantId || `video_${n}`] = fake;
          }
        }
        continue;
      }

      // LIVE deploy (but NO_SPEND=1 will keep ads PAUSED)
      const maxNew = policy.LIMITS.MAX_NEW_ADS_PER_RUN_PER_ADSET;
      let created = 0;

      for (const c of creatives || []) {
        if (created >= maxNew) break;

        try {
          if (c.kind === 'image' && c.imageUrl) {
            const imgRes = await axios.get(c.imageUrl, { responseType: 'arraybuffer', timeout: 120000 });
            const dataUrl = `data:image/jpeg;base64,${Buffer.from(imgRes.data).toString('base64')}`;

            const hash = await uploadImageToAccount({ accountId, userToken, dataUrl });
            const adId = await createImageAd({
              pageId,
              accountId,
              adsetId,
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
              pageId,
              accountId,
              adsetId,
              adCopy: c.adCopy,
              videoId,
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
    }

    return { createdAdsByAdset, pausedAdsByAdset, variantMapByAdset, generatedCounts };
  },

  pauseAds,
  setAdsetDailyBudget,
  splitBudgetBetweenChampionAndChallengers,
  ensureChallengerAdsetClone
};

module.exports = { policy, analyzer, generator, deployer, testing };
