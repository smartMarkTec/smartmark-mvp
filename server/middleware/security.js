'use strict';

/**
 * Lightweight security middlewares with zero external deps.
 * Add to any router: router.use(secureHeaders()); router.use(basicRateLimit({...}))
 */

function secureHeaders(options = {}) {
  const {
    frameOptions = 'DENY',
    referrerPolicy = 'strict-origin-when-cross-origin',
    permissionsPolicy = "geolocation=(), microphone=(), camera=()",
    xssProtection = '0', // modern browsers ignore this; CSP should live at app level if needed
  } = options;

  return function securityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', frameOptions);
    res.setHeader('Referrer-Policy', referrerPolicy);
    res.setHeader('Permissions-Policy', permissionsPolicy);
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-XSS-Protection', xssProtection);
    // do NOT set overly strict COOP/COEP here as it could break video/audio; keep API-friendly defaults
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

module.exports = { secureHeaders, basicRateLimit };
