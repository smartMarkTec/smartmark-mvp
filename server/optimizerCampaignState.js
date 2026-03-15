'use strict';

const axios = require('axios');
const {
  findOptimizerCampaignStateByCampaignId,
  upsertOptimizerCampaignState,
  updateOptimizerCampaignState,
} = require('./optimizerCampaignState');

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeDivide(a, b, fallback = null) {
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y === 0) return fallback;
  return x / y;
}

function extractActionValue(actions = [], actionTypes = []) {
  if (!Array.isArray(actions) || !Array.isArray(actionTypes) || actionTypes.length === 0) {
    return 0;
  }

  const wanted = new Set(actionTypes.map((x) => String(x).trim().toLowerCase()));

  return actions.reduce((sum, row) => {
    const type = String(row?.action_type || '').trim().toLowerCase();
    if (!wanted.has(type)) return sum;
    return sum + toNumber(row?.value, 0);
  }, 0);
}

function normalizeInsightsRow(row = {}, campaignId) {
  const impressions = toNumber(row.impressions, 0);
  const reach = toNumber(row.reach, 0);
  const clicks = toNumber(row.clicks, 0);
  const uniqueClicks = toNumber(row.unique_clicks, 0);
  const spend = toNumber(row.spend, 0);
  const ctr = toNumber(row.ctr, safeDivide(clicks * 100, impressions, 0));
  const cpm = toNumber(row.cpm, safeDivide(spend * 1000, impressions, 0));
  const cpp = toNumber(row.cpp, safeDivide(spend * 1000, reach, 0));

  const actions = Array.isArray(row.actions) ? row.actions : [];
  const linkClicks = extractActionValue(actions, [
    'link_click',
    'landing_page_view',
    'outbound_click',
  ]);

  const conversions = extractActionValue(actions, [
    'lead',
    'onsite_conversion.lead_grouped',
    'offsite_conversion.fb_pixel_lead',
    'omni_lead',
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]);

  const cpc =
    linkClicks > 0
      ? safeDivide(spend, linkClicks, null)
      : clicks > 0
      ? safeDivide(spend, clicks, null)
      : null;

  const frequency = reach > 0 ? safeDivide(impressions, reach, null) : null;
  const conversionRate = linkClicks > 0 ? safeDivide(conversions * 100, linkClicks, null) : null;
  const costPerConversion = conversions > 0 ? safeDivide(spend, conversions, null) : null;

  return {
    campaignId: String(campaignId || '').trim(),
    spend,
    impressions,
    reach,
    clicks,
    uniqueClicks,
    linkClicks,
    ctr,
    cpm,
    cpp,
    cpc,
    frequency,
    conversions,
    conversionRate,
    costPerConversion,
    rawActions: actions,
    source: 'meta_insights',
    datePreset: 'maximum',
    dateStart: String(row.date_start || '').trim(),
    dateStop: String(row.date_stop || '').trim(),
    lastSyncedAt: new Date().toISOString(),
  };
}

async function fetchCampaignInsightsSnapshot({ userToken, campaignId }) {
  if (!userToken) throw new Error('userToken is required');
  if (!campaignId) throw new Error('campaignId is required');

  const response = await axios.get(`https://graph.facebook.com/v18.0/${campaignId}/insights`, {
    params: {
      access_token: userToken,
      fields:
        'impressions,clicks,spend,cpm,cpp,ctr,actions,reach,unique_clicks,date_start,date_stop',
      date_preset: 'maximum',
    },
  });

  const row = Array.isArray(response.data?.data) ? response.data.data[0] || {} : {};
  return normalizeInsightsRow(row, campaignId);
}

async function syncCampaignMetricsToOptimizerState({
  userToken,
  campaignId,
  accountId = '',
  ownerKey = '',
}) {
  if (!campaignId) throw new Error('campaignId is required');

  const snapshot = await fetchCampaignInsightsSnapshot({ userToken, campaignId });

  let existing = await findOptimizerCampaignStateByCampaignId(campaignId);

  if (!existing) {
    existing = await upsertOptimizerCampaignState({
      campaignId: String(campaignId).trim(),
      metaCampaignId: String(campaignId).trim(),
      accountId: String(accountId || '').replace(/^act_/, '').trim(),
      ownerKey: String(ownerKey || '').trim(),
      currentStatus: 'ACTIVE',
      optimizationEnabled: true,
      metricsSnapshot: snapshot,
    });

    return {
      snapshot,
      optimizerState: existing,
      created: true,
    };
  }

  const patch = {
    metricsSnapshot: snapshot,
  };

  if (!existing.accountId && accountId) {
    patch.accountId = String(accountId).replace(/^act_/, '').trim();
  }

  if (!existing.ownerKey && ownerKey) {
    patch.ownerKey = String(ownerKey).trim();
  }

  const updated = await updateOptimizerCampaignState(campaignId, patch);

  return {
    snapshot,
    optimizerState: updated,
    created: false,
  };
}

module.exports = {
  fetchCampaignInsightsSnapshot,
  syncCampaignMetricsToOptimizerState,
  normalizeInsightsRow,
};