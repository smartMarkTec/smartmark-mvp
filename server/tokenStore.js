// server/tokenStore.js
'use strict';

const db = require('./db');

let mem = {
  fbUserToken: null,
  loaded: false
};

async function loadOnce() {
  if (mem.loaded) return;
  await db.read();
  db.data = db.data || {};
  db.data.tokens = db.data.tokens || {};
  mem.fbUserToken = db.data.tokens.fbUserToken || null;
  mem.loaded = true;
}

async function setFbUserToken(token) {
  await db.read();
  db.data = db.data || {};
  db.data.tokens = db.data.tokens || {};
  db.data.tokens.fbUserToken = token || null;
  db.data.tokens.updatedAt = new Date().toISOString();
  await db.write();
  mem.fbUserToken = token || null;
  mem.loaded = true;
  return true;
}

// sync-friendly getter that falls back to DB snapshot if needed
function getFbUserToken() {
  if (mem.loaded) return mem.fbUserToken;
  try {
    if (db.data && db.data.tokens) {
      mem.fbUserToken = db.data.tokens.fbUserToken || null;
      mem.loaded = true;
      return mem.fbUserToken;
    }
  } catch {}
  return null;
}

async function clearFbUserToken() {
  await setFbUserToken(null);
}

module.exports = {
  getFbUserToken,
  setFbUserToken,
  clearFbUserToken,
  _loadOnce: loadOnce // optional
};
