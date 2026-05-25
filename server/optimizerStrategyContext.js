'use strict';

const fs = require('fs');
const path = require('path');

const STRATEGY_FILE = path.join(
  __dirname,
  'data/knowledge/marketing/derived/strategy_summary.txt'
);

// Cache after first successful load — file is static at runtime.
let _cachedContext = null;

/**
 * Returns the compact strategy context string for injection into AI prompts.
 * Returns empty string if the file cannot be read (never throws).
 */
function loadStrategyContext() {
  if (_cachedContext !== null) return _cachedContext;

  try {
    const text = fs.readFileSync(STRATEGY_FILE, 'utf8').trim();
    _cachedContext = text;
    return _cachedContext;
  } catch {
    _cachedContext = '';
    return '';
  }
}

module.exports = { loadStrategyContext };
