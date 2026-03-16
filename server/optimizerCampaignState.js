// server/optimizerCampaignState.js
'use strict';

const db = require('./db');

async function ensureOptimizerCampaignStateShape() {
  await db.read();
  db.data = db.data || {};
  db.data.optimizer_campaign_state = db.data.optimizer_campaign_state || [];
  await db.write();
  return db.data.optimizer_campaign_state;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeId(value) {
  return String(value || '').trim();
}

async function getAllOptimizerCampaignStates() {
  await ensureOptimizerCampaignStateShape();
  return db.data.optimizer_campaign_state;
}

async function findOptimizerCampaignStateByCampaignId(campaignId) {
  await ensureOptimizerCampaignStateShape();
  const id = normalizeId(campaignId);
  if (!id) return null;

  return (
    db.data.optimizer_campaign_state.find(
      (row) => normalizeId(row?.campaignId) === id
    ) || null
  );
}

async function findOptimizerCampaignStateByMetaCampaignId(metaCampaignId) {
  await ensureOptimizerCampaignStateShape();
  const id = normalizeId(metaCampaignId);
  if (!id) return null;

  return (
    db.data.optimizer_campaign_state.find(
      (row) => normalizeId(row?.metaCampaignId) === id
    ) || null
  );
}

async function upsertOptimizerCampaignState(input = {}) {
  await ensureOptimizerCampaignStateShape();

  const campaignId = normalizeId(input.campaignId || input.metaCampaignId);
  const metaCampaignId = normalizeId(input.metaCampaignId || input.campaignId);

  if (!campaignId && !metaCampaignId) {
    throw new Error('campaignId or metaCampaignId is required');
  }

  const list = db.data.optimizer_campaign_state;
  const existingIndex = list.findIndex((row) => {
    const rowCampaignId = normalizeId(row?.campaignId);
    const rowMetaCampaignId = normalizeId(row?.metaCampaignId);

    return (
      (campaignId && rowCampaignId === campaignId) ||
      (metaCampaignId && rowMetaCampaignId === metaCampaignId)
    );
  });

  const timestamp = nowIso();

  const baseRecord = {
    campaignId: campaignId || metaCampaignId,
    metaCampaignId: metaCampaignId || campaignId,
    accountId: normalizeId(input.accountId),
    ownerKey: normalizeId(input.ownerKey),
    pageId: normalizeId(input.pageId),
    campaignName: String(input.campaignName || '').trim(),
    niche: String(input.niche || '').trim(),
    currentStatus: String(input.currentStatus || 'ACTIVE').trim(),
    optimizationEnabled:
      typeof input.optimizationEnabled === 'boolean'
        ? input.optimizationEnabled
        : true,
    metricsSnapshot:
      input.metricsSnapshot && typeof input.metricsSnapshot === 'object'
        ? input.metricsSnapshot
        : {},
    latestAction:
      input.latestAction && typeof input.latestAction === 'object'
        ? input.latestAction
        : null,
    latestMonitoringDecision:
      input.latestMonitoringDecision && typeof input.latestMonitoringDecision === 'object'
        ? input.latestMonitoringDecision
        : null,
    currentWinner:
      input.currentWinner && typeof input.currentWinner === 'object'
        ? input.currentWinner
        : null,
   activeTestType: String(input.activeTestType || '').trim(),
manualOverride:
  typeof input.manualOverride === 'boolean'
    ? input.manualOverride
    : false,
manualOverrideType: String(input.manualOverrideType || '').trim(),
manualOverrideReason: String(input.manualOverrideReason || '').trim(),
manualOverrideAt: String(input.manualOverrideAt || '').trim(),
createdAt: timestamp,
updatedAt: timestamp,
  };

  if (existingIndex === -1) {
    list.push(baseRecord);
    await db.write();
    return baseRecord;
  }

  const existing = list[existingIndex];

  const merged = {
    ...existing,
    ...Object.fromEntries(
      Object.entries(baseRecord).filter(([, value]) => value !== undefined)
    ),
    createdAt: existing.createdAt || timestamp,
    updatedAt: timestamp,
  };

  list[existingIndex] = merged;
  await db.write();
  return merged;
}

async function updateOptimizerCampaignState(campaignId, patch = {}) {
  await ensureOptimizerCampaignStateShape();

  const id = normalizeId(campaignId);
  if (!id) throw new Error('campaignId is required');

  const list = db.data.optimizer_campaign_state;
  const index = list.findIndex(
    (row) =>
      normalizeId(row?.campaignId) === id ||
      normalizeId(row?.metaCampaignId) === id
  );

  if (index === -1) return null;

  const existing = list[index];
  const timestamp = nowIso();

  const merged = {
    ...existing,
    ...patch,
    updatedAt: timestamp,
    createdAt: existing.createdAt || timestamp,
  };

  list[index] = merged;
  await db.write();
  return merged;
}

async function findOptimizerCampaignStatesByAccountId(accountId) {
  await ensureOptimizerCampaignStateShape();
  const normalized = normalizeId(accountId).replace(/^act_/, '');
  if (!normalized) return [];

  return db.data.optimizer_campaign_state.filter(
    (row) => normalizeId(row?.accountId).replace(/^act_/, '') === normalized
  );
}

module.exports = {
  ensureOptimizerCampaignStateShape,
  getAllOptimizerCampaignStates,
  findOptimizerCampaignStateByCampaignId,
  findOptimizerCampaignStateByMetaCampaignId,
  findOptimizerCampaignStatesByAccountId,
  upsertOptimizerCampaignState,
  updateOptimizerCampaignState,
};