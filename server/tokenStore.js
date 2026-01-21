// server/tokenStore.js
'use strict';

const db = require('./db');

/**
 * Token store (multi-user safe)
 * - Persists FB user tokens per "owner key" (session id / sm_sid / etc.)
 * - Keeps a small in-memory cache for speed
 *
 * IMPORTANT:
 * - Caller should pass a stable key (e.g. sm_sid cookie, x-sm-sid header, or username)
 * - If caller doesn't pass a key, we fall back to legacy single-token behavior.
 *
 * ✅ Update: adds token META (expiresAt, etc.) without breaking old callers.
 */

let mem = {
  loaded: false,
  // key -> token string
  byOwner: new Map(),
  // key -> meta object
  metaByOwner: new Map(),

  // legacy (single) token support
  legacyToken: null,
  legacyMeta: null,
};

async function ensureDBShape() {
  await db.read();
  db.data = db.data || {};
  db.data.tokens = db.data.tokens || {};

  // New shape: tokens.byOwner = { [ownerKey]: { token, updatedAt } }
  if (!db.data.tokens.byOwner || typeof db.data.tokens.byOwner !== 'object') {
    db.data.tokens.byOwner = {};
  }

  // ✅ New shape: tokens.metaByOwner = { [ownerKey]: { expiresAt, ... } }
  if (!db.data.tokens.metaByOwner || typeof db.data.tokens.metaByOwner !== 'object') {
    db.data.tokens.metaByOwner = {};
  }

  // Legacy shape (your old code): tokens.fbUserToken
  if (typeof db.data.tokens.fbUserToken === 'undefined') {
    db.data.tokens.fbUserToken = null;
  }

  // ✅ Legacy meta
  if (typeof db.data.tokens.fbUserTokenMeta === 'undefined') {
    db.data.tokens.fbUserTokenMeta = null;
  }
}

async function loadOnce() {
  if (mem.loaded) return;

  await ensureDBShape();

  // Load new-style tokens
  try {
    const obj = db.data.tokens.byOwner || {};
    mem.byOwner = new Map(
      Object.entries(obj)
        .filter(([, v]) => v && typeof v === 'object')
        .map(([k, v]) => [k, v.token || null])
    );
  } catch {
    mem.byOwner = new Map();
  }

  // ✅ Load new-style meta
  try {
    const mobj = db.data.tokens.metaByOwner || {};
    mem.metaByOwner = new Map(
      Object.entries(mobj)
        .filter(([, v]) => v && typeof v === 'object')
        .map(([k, v]) => [k, v])
    );
  } catch {
    mem.metaByOwner = new Map();
  }

  // Load legacy token too (if present)
  mem.legacyToken = db.data.tokens.fbUserToken || null;
  mem.legacyMeta = db.data.tokens.fbUserTokenMeta || null;

  mem.loaded = true;
}

/**
 * Set token for a specific owner key.
 * If ownerKey is missing, we set the legacy token (backward compatible).
 */
async function setFbUserToken(token, ownerKey = null) {
  await ensureDBShape();

  const t = token || null;
  const nowIso = new Date().toISOString();

  if (ownerKey) {
    const key = String(ownerKey);
    db.data.tokens.byOwner[key] = { token: t, updatedAt: nowIso };
    await db.write();

    // update memory cache
    mem.byOwner.set(key, t);
    mem.loaded = true;
    return true;
  }

  // legacy behavior (single token)
  db.data.tokens.fbUserToken = t;
  db.data.tokens.updatedAt = nowIso;
  await db.write();

  mem.legacyToken = t;
  mem.loaded = true;
  return true;
}

/**
 * ✅ Set token meta (expiresAt, etc.) for ownerKey.
 */
async function setFbUserTokenMeta(meta, ownerKey = null) {
  await ensureDBShape();

  const m = meta && typeof meta === 'object' ? meta : null;
  const nowIso = new Date().toISOString();

  if (ownerKey) {
    const key = String(ownerKey);
    db.data.tokens.metaByOwner[key] = { ...(m || {}), updatedAt: nowIso };
    await db.write();

    mem.metaByOwner.set(key, db.data.tokens.metaByOwner[key]);
    mem.loaded = true;
    return true;
  }

  // legacy behavior
  db.data.tokens.fbUserTokenMeta = m ? { ...(m || {}), updatedAt: nowIso } : null;
  db.data.tokens.updatedAt = nowIso;
  await db.write();

  mem.legacyMeta = db.data.tokens.fbUserTokenMeta;
  mem.loaded = true;
  return true;
}

/**
 * Get token for a specific owner key.
 * If ownerKey is missing, we return legacy token (backward compatible).
 */
function getFbUserToken(ownerKey = null) {
  // best effort: try in-memory first
  try {
    if (ownerKey) {
      const key = String(ownerKey);
      if (mem.loaded && mem.byOwner.has(key)) return mem.byOwner.get(key) || null;

      // fallback: if db is already in memory (lowdb keeps data in-process), read from it
      const rec = db?.data?.tokens?.byOwner?.[key];
      if (rec && typeof rec === 'object') {
        const t = rec.token || null;
        mem.byOwner.set(key, t);
        mem.loaded = true;
        return t;
      }
      return null;
    }

    // legacy token path
    if (mem.loaded) return mem.legacyToken || null;
    if (db?.data?.tokens) {
      mem.legacyToken = db.data.tokens.fbUserToken || null;
      mem.loaded = true;
      return mem.legacyToken;
    }
  } catch {}

  return null;
}

/**
 * ✅ Get token meta for ownerKey.
 */
function getFbUserTokenMeta(ownerKey = null) {
  try {
    if (ownerKey) {
      const key = String(ownerKey);
      if (mem.loaded && mem.metaByOwner.has(key)) return mem.metaByOwner.get(key) || null;

      const rec = db?.data?.tokens?.metaByOwner?.[key];
      if (rec && typeof rec === 'object') {
        mem.metaByOwner.set(key, rec);
        mem.loaded = true;
        return rec;
      }
      return null;
    }

    if (mem.loaded) return mem.legacyMeta || null;
    if (db?.data?.tokens) {
      mem.legacyMeta = db.data.tokens.fbUserTokenMeta || null;
      mem.loaded = true;
      return mem.legacyMeta;
    }
  } catch {}

  return null;
}

/**
 * Clear token for an ownerKey, or clear legacy token if no key provided.
 */
async function clearFbUserToken(ownerKey = null) {
  await ensureDBShape();
  const nowIso = new Date().toISOString();

  if (ownerKey) {
    const key = String(ownerKey);
    if (db.data.tokens.byOwner && db.data.tokens.byOwner[key]) {
      delete db.data.tokens.byOwner[key];
      db.data.tokens.updatedAt = nowIso;
      await db.write();
    }
    mem.byOwner.delete(key);
    mem.loaded = true;
    return true;
  }

  // legacy clear
  db.data.tokens.fbUserToken = null;
  db.data.tokens.updatedAt = nowIso;
  await db.write();

  mem.legacyToken = null;
  mem.loaded = true;
  return true;
}

/**
 * ✅ Clear token meta for ownerKey.
 */
async function clearFbUserTokenMeta(ownerKey = null) {
  await ensureDBShape();
  const nowIso = new Date().toISOString();

  if (ownerKey) {
    const key = String(ownerKey);
    if (db.data.tokens.metaByOwner && db.data.tokens.metaByOwner[key]) {
      delete db.data.tokens.metaByOwner[key];
      db.data.tokens.updatedAt = nowIso;
      await db.write();
    }
    mem.metaByOwner.delete(key);
    mem.loaded = true;
    return true;
  }

  db.data.tokens.fbUserTokenMeta = null;
  db.data.tokens.updatedAt = nowIso;
  await db.write();

  mem.legacyMeta = null;
  mem.loaded = true;
  return true;
}

/**
 * Optional: remove old tokens if you ever want cleanup.
 * Not required for MVP, but safe to keep here.
 */
async function pruneTokens({ maxOwners = 200 } = {}) {
  await ensureDBShape();
  const obj = db.data.tokens.byOwner || {};
  const keys = Object.keys(obj);

  if (keys.length <= maxOwners) return;

  // Sort by updatedAt ascending and delete oldest
  keys.sort((a, b) => {
    const ta = Date.parse(obj[a]?.updatedAt || '') || 0;
    const tb = Date.parse(obj[b]?.updatedAt || '') || 0;
    return ta - tb;
  });

  const toDelete = keys.slice(0, Math.max(0, keys.length - maxOwners));
  for (const k of toDelete) {
    delete obj[k];
    if (db.data.tokens.metaByOwner) delete db.data.tokens.metaByOwner[k];
  }

  db.data.tokens.byOwner = obj;
  db.data.tokens.updatedAt = new Date().toISOString();
  await db.write();

  // Refresh mem map
  mem.byOwner = new Map(Object.entries(obj).map(([k, v]) => [k, v?.token || null]));
  mem.metaByOwner = new Map(Object.entries(db.data.tokens.metaByOwner || {}).map(([k, v]) => [k, v || null]));
  mem.loaded = true;
}

module.exports = {
  // Backward-compatible API
  getFbUserToken,
  setFbUserToken,
  clearFbUserToken,

  // ✅ Meta API
  getFbUserTokenMeta,
  setFbUserTokenMeta,
  clearFbUserTokenMeta,

  // Optional helpers
  _loadOnce: loadOnce,
  _prune: pruneTokens,
};
