// server/smartCampaignEngine/analyzer/index.js
// Pulls campaign → adsets → ads → insights. Computes winners/losers and plateau.

const axios = require('axios');
const policy = require('../policy');

function dateRange(daysBackStart, daysBackLength) {
  // Returns since & until (YYYY-MM-DD) for insights
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - daysBackStart);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - daysBackLength + 1);
  const toYMD = (d) => d.toISOString().slice(0, 10);
  return { since: toYMD(start), until: toYMD(end) };
}

async function fbGet(endpoint, params) {
  const { access_token, ...rest } = params;
  const url = `https://graph.facebook.com/v18.0/${endpoint}`;
  const res = await axios.get(url, { params: { access_token, ...rest } });
  return res.data;
}

function parseMetrics(node) {
  // Normalize a single insight row -> { impressions, clicks, spend, ctr, frequency, cpm }
  if (!node || !node.data || !node.data[0]) return {};
  const x = node.data[0];
  const n = (v) => (v ? Number(v) : 0);
  return {
    impressions: n(x.impressions),
    clicks: n(x.clicks),
    spend: n(x.spend),
    ctr: n(x.ctr),
    cpm: n(x.cpm),
    frequency: n(x.frequency)
  };
}

async function getWindowInsights(id, token, level) {
  const FIELDS = 'impressions,clicks,spend,ctr,cpm,frequency';
  const { RECENT_DAYS, PRIOR_DAYS } = policy.WINDOWS;

  const recentRange = dateRange(0, RECENT_DAYS);
  const priorRange = dateRange(RECENT_DAYS, PRIOR_DAYS);

  const [recent, prior] = await Promise.all([
    fbGet(`${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(recentRange), level }),
    fbGet(`${id}/insights`, { access_token: token, fields: FIELDS, time_range: JSON.stringify(priorRange), level })
  ]);

  return {
    recent: parseMetrics(recent),
    prior: parseMetrics(prior)
  };
}

function rankAdsByKpi(adMetrics, kpi = 'ctr') {
  const safe = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
  const list = Object.entries(adMetrics).map(([adId, m]) => ({ adId, value: safe(m.recent[kpi]), metrics: m }));
  list.sort((a, b) => b.value - a.value);
  return list;
}

module.exports = {
  /**
   * Analyze a campaign.
   * @param {Object} opts
   * @param {string} opts.accountId
   * @param {string} opts.campaignId
   * @param {string} opts.userToken
   * @param {string} [opts.kpi='ctr']
   */
  async analyzeCampaign({ accountId, campaignId, userToken, kpi = 'ctr' }) {
    // 1) fetch ad sets
    const adsets = await fbGet(`act_${accountId}/adsets`, {
      access_token: userToken,
      fields: 'id,name,campaign_id,status',
      limit: 200,
      filtering: JSON.stringify([{ field: 'campaign_id', operator: 'IN', value: [campaignId] }])
    });

    const adsetIds = (adsets.data || []).map(a => a.id);
    const adsetInsights = {};
    const adInsights = {};
    const adMapByAdset = {};

    // 2) per adset: insights + ads + per-ad insights
    for (const adsetId of adsetIds) {
      adsetInsights[adsetId] = await getWindowInsights(adsetId, userToken, 'adset');

      const ads = await fbGet(`${adsetId}/ads`, {
        access_token: userToken,
        fields: 'id,name,status,creative{id,object_story_spec}',
        limit: 200
      });
      const ids = (ads.data || []).map(a => a.id);
      adMapByAdset[adsetId] = ids;

      for (const adId of ids) {
        adInsights[adId] = await getWindowInsights(adId, userToken, 'ad');
      }
    }

    // 3) plateau decision per adset
    const plateauByAdset = {};
    for (const adsetId of adsetIds) {
      const p = policy.isPlateau({
        recent: adsetInsights[adsetId].recent,
        prior: adsetInsights[adsetId].prior,
        thresholds: policy.THRESHOLDS
      });
      plateauByAdset[adsetId] = !!p;
    }

    // 4) winners/losers per adset
    const winnersByAdset = {};
    const losersByAdset = {};
    for (const adsetId of adsetIds) {
      const ids = adMapByAdset[adsetId] || [];
      const metricsSubset = {};
      ids.forEach(id => (metricsSubset[id] = adInsights[id]));

      const ranking = rankAdsByKpi(metricsSubset, kpi);
      if (ranking.length === 0) { winnersByAdset[adsetId] = []; losersByAdset[adsetId] = []; continue; }

      const top = ranking[0]?.adId ? [ranking[0].adId] : [];
      const bottom = ranking.slice(-1).map(x => x.adId); // 1 worst
      winnersByAdset[adsetId] = top;
      losersByAdset[adsetId] = bottom;
    }

    return {
      adsetIds,
      adMapByAdset,
      adsetInsights,
      adInsights,
      plateauByAdset,
      winnersByAdset,
      losersByAdset
    };
  }
};
