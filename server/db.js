// server/db.js
'use strict';

const fs = require('fs');
const path = require('path');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');

// Prefer a mounted disk if available (Render: /var/data)
const DATA_DIR = process.env.DATA_DIR ||
  (fs.existsSync('/var/data') ? '/var/data/smartmark' : path.join(__dirname, 'data'));

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'db.json');

// lowdb adapter + instance (no top-level await; callers do db.read()/db.write())
const adapter = new JSONFile(DB_FILE);
const db = new Low(adapter, {
  users: [],
  campaigns: [],
  smart_configs: [],
  smart_runs: [],
  creative_history: [],
  tokens: {} // <= where we keep the FB token
});

module.exports = db;
