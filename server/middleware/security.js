'use strict';

/**
 * Lightweight security middlewares with zero external deps.
 * Usage:
 *   router.use(secureHeaders());
 *   router.use(basicAuth());              // only active if env vars are set
 *   router.use(basicRateLimit({ ... }));  // per-route or per-router
 */

const crypto = require('crypto');

function secureHeaders(options = {}) {
  const {
    frameOptions = 'DENY',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = 'geolocation=(), microphone=(), camera=()',
    xssProtection = '0', // modern browsers ignore this; CSP should live at app level if needed
  } = options;

  return function securityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', frameOptions);
    res.setHeader('Referrer-Policy', referrerPolicy);
    res.setHeader('Permissions-Policy', permissionsPolicy);
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-XSS-Protection', xssProtection);
    // keep API-friendly defaults; avoid COOP/COEP here (can break video/audio)
    next();
  };
}

function basicRateLimit({ windowMs = 15 * 60 * 1000, max = 120 } = {}) {
  const hits = new Map(); // key -> { count, reset }

  function cleanup(now) {
    for (const [k, v] of hits) {
      if (v.reset <= now) hits.delete(k);
    }
  }

  return function limiter(req, res, next) {
    if (req.method === 'OPTIONS') return next(); // allow CORS preflight

    const now = Date.now();
    cleanup(now);

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${ip}:${req.baseUrl || ''}${req.path || ''}`;

    const entry = hits.get(key) || { count: 0, reset: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.reset - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    }

    next();
  };
}

/**
 * Basic auth (MVP)
 * Enabled ONLY if BASIC_AUTH_USER and BASIC_AUTH_PASS are set.
 * Add to a router: router.use(basicAuth());
 */
function basicAuth(options = {}) {
  const realm = options.realm || 'Protected';
  const envUser = process.env.BASIC_AUTH_USER || '';
  const envPass = process.env.BASIC_AUTH_PASS || '';

  // If not configured, auth is disabled (no-op).
  if (!envUser || !envPass) {
    return function noAuth(_req, _res, next) {
      next();
    };
  }

  // constant-time compare
  const safeEq = (a, b) => {
    const A = Buffer.from(String(a || ''), 'utf8');
    const B = Buffer.from(String(b || ''), 'utf8');
    if (A.length !== B.length) return false;
    return crypto.timingSafeEqual(A, B);
  };

  return function requireBasicAuth(req, res, next) {
    const header = req.headers?.authorization || '';
    const m = /^Basic\s+(.+)$/i.exec(header);

    if (!m) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let decoded = '';
    try {
      decoded = Buffer.from(m[1], 'base64').toString('utf8');
    } catch {
      decoded = '';
    }

    const idx = decoded.indexOf(':');
    const user = idx >= 0 ? decoded.slice(0, idx) : '';
    const pass = idx >= 0 ? decoded.slice(idx + 1) : '';

    if (!safeEq(user, envUser) || !safeEq(pass, envPass)) {
      res.setHeader('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    next();
  };
}

module.exports = { secureHeaders, basicRateLimit, basicAuth };
