// server/routes/adAgent.js
'use strict';

const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { secureHeaders, basicRateLimit, basicAuth } = require('../middleware/security');

// ── OpenAI ────────────────────────────────────────────────────────────────────
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const AD_AGENT_SYSTEM =
  "You are Smartemark's Ad Agent. Help HVAC and local service businesses understand their campaign, " +
  "choose services/specials to promote, improve ad angles, and understand setup steps. " +
  "Be concise, practical, and action-focused. Do not guarantee leads or calls. " +
  "Position Smartemark as helping with branding, local visibility, promoting specials, and getting more eyes on the business. " +
  "If campaign metrics context is provided, use it to answer performance questions simply and clearly — explain metrics in plain language a business owner would understand. " +
  "If metrics data is limited or missing, say so honestly rather than guessing.";

// ── Campaign metrics context builder (read-only) ──────────────────────────────
async function getCampaignContext(ownerKey) {
  try {
    await db.read();
    const allStates = db.data?.optimizer_campaign_state || [];
    const userStates = allStates.filter(
      (s) =>
        String(s?.ownerKey || '').trim() === String(ownerKey || '').trim() &&
        !s?.smArchived
    );

    if (!userStates.length) {
      return 'No active campaign metrics are available. If the user asks about campaign performance, say exactly: "I don\'t see active campaign metrics connected yet."';
    }

    // Prefer active campaigns first, take up to 3
    const sorted = [
      ...userStates.filter((s) => String(s?.currentStatus || '').toUpperCase() === 'ACTIVE'),
      ...userStates.filter((s) => String(s?.currentStatus || '').toUpperCase() !== 'ACTIVE'),
    ].slice(0, 3);

    const lines = ['Current campaign data:'];
    for (const s of sorted) {
      const m = s.metricsSnapshot || {};
      const name = s.campaignName || s.campaignId || 'Unnamed campaign';
      const status = String(s.currentStatus || '').toUpperCase() || 'UNKNOWN';

      const hasMetrics =
        Number(m.impressions || 0) > 0 ||
        Number(m.spend || 0) > 0 ||
        Number(m.clicks || 0) > 0;

      if (!hasMetrics) {
        lines.push(`- "${name}" (${status}): No metrics data yet.`);
        continue;
      }

      const parts = [`"${name}" | Status: ${status}`];
      if (m.impressions) parts.push(`Impressions: ${Math.round(Number(m.impressions)).toLocaleString()}`);
      if (m.reach)       parts.push(`Reach: ${Math.round(Number(m.reach)).toLocaleString()}`);
      if (m.clicks != null && m.clicks !== '') parts.push(`Clicks: ${m.clicks}`);
      if (m.linkClicks)  parts.push(`Link clicks: ${m.linkClicks}`);
      if (m.spend)       parts.push(`Spend: $${Number(m.spend).toFixed(2)}`);
      if (m.ctr)         parts.push(`CTR: ${Number(m.ctr).toFixed(2)}%`);
      if (m.cpc)         parts.push(`CPC: $${Number(m.cpc).toFixed(2)}`);
      if (m.cpm)         parts.push(`CPM: $${Number(m.cpm).toFixed(2)}`);
      const conv = Number(m.conversions || 0);
      parts.push(`Conversions: ${conv}`);
      if (conv > 0) {
        if (m.costPerConversion) parts.push(`Cost/Conv: $${Number(m.costPerConversion).toFixed(2)}`);
        if (m.conversionRate)    parts.push(`Conv Rate: ${Number(m.conversionRate).toFixed(2)}%`);
      }
      lines.push('- ' + parts.join(' | '));

      // Include AI optimizer summary if available
      const summary = s.publicSummary?.summary || s.publicSummary?.headline || s.latestDiagnosis?.summary;
      if (summary) lines.push(`  AI note: ${String(summary).slice(0, 200)}`);
    }

    return lines.join('\n');
  } catch {
    return null;
  }
}

// ── Session helpers (same read-only pattern as auth.js) ──────────────────────
const COOKIE_NAME = 'sm_sid';
const SID_HEADER = 'x-sm-sid';

function getSidFromReq(req) {
  return (
    req.cookies?.[COOKIE_NAME] ||
    req.get(SID_HEADER) ||
    String(req.query?.sm_sid || '').trim() ||
    ''
  ).trim();
}

function ownerKeyFromReq(req) {
  const sid = getSidFromReq(req);
  try {
    const sess = db?.data?.sessions?.find((s) => String(s.sid) === sid);
    const username = sess?.username ? String(sess.username).trim() : '';
    if (username) return `user:${username}`;
  } catch {}
  return sid || `ip:${req.ip}`;
}

async function findUserByOwnerKey(ownerKey) {
  try { await db.read(); } catch {}
  const key = String(ownerKey || '').trim();
  if (!key) return null;
  if (key.startsWith('user:')) {
    const username = key.slice(5).trim();
    return (db.data?.users || []).find((u) => String(u?.username || '').trim() === username) || null;
  }
  const sess = (db.data?.sessions || []).find((s) => String(s?.sid || '').trim() === key) || null;
  if (!sess?.username) return null;
  return (
    (db.data?.users || []).find(
      (u) => String(u?.username || '').trim() === String(sess.username || '').trim()
    ) || null
  );
}

const ADMIN_USERNAME_AGENT = process.env.ADMIN_BYPASS_USERNAME || 'TheBoss';

// ── Admin-client mode: resolve who we're acting on behalf of ─────────────────
// If the current user is admin and the request carries an adminClientId,
// swap the ownerKey to that client so all token/metrics lookups use their data.
// Non-admin users always get their own ownerKey.
function resolveEffectiveOwnerKey(req, user, selfOwnerKey) {
  if (
    user?.role === 'admin' ||
    String(user?.username || '').trim() === ADMIN_USERNAME_AGENT
  ) {
    const clientId = String(
      req.body?.adminClientId || req.query?.adminClientId || ''
    ).trim();
    if (clientId) return `user:${clientId}`;
  }
  return selfOwnerKey;
}

// ── Persist pixel info + mark onboarding checklist ───────────────────────────
async function savePixelInfo(effectiveOwnerKey, pixelId, pixelName, adAccountId, status) {
  try {
    const key = String(effectiveOwnerKey || '').trim();
    if (!key.startsWith('user:')) return;
    const username = key.slice(5);
    await db.read();
    const idx = (db.data.users || []).findIndex(
      (u) => String(u?.username || '').trim() === username
    );
    if (idx === -1) return;
    db.data.users[idx].metaPixel = {
      pixelId: String(pixelId || ''),
      pixelName: String(pixelName || 'Smartemark Pixel'),
      adAccountId: String(adAccountId || ''),
      status,
      installStatus: 'needs_website_install',
      lastUpdatedAt: new Date().toISOString(),
    };
    db.data.users[idx].onboarding = {
      ...(db.data.users[idx].onboarding || {}),
      meta_pixel_setup: true,
      updatedAt: new Date().toISOString(),
    };
    await db.write();
  } catch (err) {
    console.error('[AdAgent] savePixelInfo error:', err?.message);
  }
}

// ── Ad Agent access — local to this feature only ──────────────────────────────
// Returns: 'locked' | 'chat' | 'pixel'
function adAgentAccess(user) {
  // Admin role always gets full pixel access regardless of planKey
  if (user?.role === 'admin' || String(user?.username || '').trim() === ADMIN_USERNAME_AGENT) {
    return 'pixel';
  }
  const s = String(user?.billing?.planKey || '').trim().toLowerCase();
  if (s === 'premium' || s === 'operator') return 'pixel';
  if (s === 'deluxe' || s === 'pro') return 'chat';
  return 'locked';
}

// ── Pixel intent detection ────────────────────────────────────────────────────
function isPixelIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /fetch.*pixel|get.*pixel|find.*pixel|show.*pixel|paste.*pixel|retrieve.*pixel|pixel.*code|pixel.*id/i.test(s) ||
    /(meta|facebook|fb)\s*pixel/i.test(s) ||
    /my pixel/i.test(s)
  );
}

// ── Meta Pixel install snippet builder ───────────────────────────────────────
function buildPixelSnippet(pixelId) {
  const id = String(pixelId || '');
  return (
    '<!-- Meta Pixel Code -->\n' +
    '<script>\n' +
    '!function(f,b,e,v,n,t,s)\n' +
    '{if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n' +
    'n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n' +
    "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n" +
    'n.queue=[];t=b.createElement(e);t.async=!0;\n' +
    "t.src=v;s=b.getElementsByTagName(e)[0];\n" +
    "s.parentNode.insertBefore(t,s)}(window,document,'script',\n" +
    "'https://connect.facebook.net/en_US/fbevents.js');\n" +
    "fbq('init', '" + id + "');\n" +
    "fbq('track', 'PageView');\n" +
    '</script>\n' +
    '<noscript><img height="1" width="1" style="display:none"\n' +
    'src="https://www.facebook.com/tr?id=' + id + '&ev=PageView&noscript=1"\n' +
    '/></noscript>\n' +
    '<!-- End Meta Pixel Code -->'
  );
}

function buildPixelReply(result) {
  if (result.notConnected) {
    return 'Facebook is not connected yet. Connect your Facebook ad account first in the Connect Facebook step.';
  }
  if (result.error) {
    return 'There was an issue fetching your Meta Pixel: ' + result.error;
  }
  if (result.noPixel || !result.pixels?.length) {
    return (
      'No Meta Pixel was found for your connected ad account. ' +
      'If you\'d like, I can create one for you — just say "create a pixel" or "create one".'
    );
  }

  const p = result.pixels[0];
  const snippet = buildPixelSnippet(p.id);

  return (
    'Your Meta Pixel was found:\n\n' +
    'Pixel ID: ' + p.id + '\n' +
    'Pixel Name: ' + (p.name || 'Unnamed Pixel') + '\n' +
    'Ad Account: ' + result.adAccountId + '\n\n' +
    'Install code — paste into your website <head> section:\n\n' +
    snippet + '\n\n' +
    'How to install:\n' +
    '• WordPress: use the "Insert Headers and Footers" plugin\n' +
    '• Wix: Settings → Custom Code → Head section\n' +
    '• Shopify: Online Store → Themes → Edit code → theme.liquid (before </head>)\n' +
    '• Other: paste just before the closing </head> tag\n\n' +
    'Note: Smartemark does not install the Pixel automatically. ' +
    'Installation must be done manually on your website.'
  );
}

// ── Core Meta Pixel fetch ─────────────────────────────────────────────────────
async function fetchMetaPixels(ownerKey) {
  const token = getFbUserToken(ownerKey);
  if (!token) return { notConnected: true };

  try {
    const acctRes = await axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });

    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noPixel: true };

    const actId = accounts[0].id;

    const pixelRes = await axios.get(
      'https://graph.facebook.com/v18.0/' + actId + '/adspixels',
      {
        params: { fields: 'id,name', access_token: token },
        timeout: 10000,
      }
    );

    const pixels = pixelRes.data?.data || [];
    return { pixels, adAccountId: actId, noPixel: pixels.length === 0 };
  } catch (err) {
    const fbError = err?.response?.data?.error;
    if (fbError) {
      const code = fbError.code;
      if (code === 190 || code === 102) {
        return { error: 'Your Facebook session has expired. Please reconnect your Facebook account.' };
      }
      if (code === 10 || code === 200 || code === 273) {
        return {
          error:
            'Additional Meta permissions may be required to access Pixel data. ' +
            'Try reconnecting your Facebook account with the required permissions.',
        };
      }
      return { error: fbError.message || 'Meta API error.' };
    }
    console.error('[AdAgent] fetchMetaPixels error:', err?.message || err);
    return { error: 'Could not reach Meta API. Please try again.' };
  }
}

// ── Pixel create intent detection ─────────────────────────────────────────────
// Must be checked BEFORE isPixelIntent because "create a meta pixel" also
// matches the (meta|facebook|fb)\s*pixel pattern in the fetch detector.
function isPixelCreateIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /create\s+(a\s+)?(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /make\s+(a\s+)?(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /set\s*up\s+(a\s+)?(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /generate\s+(a\s+)?(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /build\s+(a\s+)?(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /create\s+one\b/i.test(s) ||
    /create\s+my\s+(meta\s+|facebook\s+|fb\s+)?pixel/i.test(s) ||
    /that\s+is\s+fine.*create/i.test(s) ||
    /fine.*create\s+one/i.test(s)
  );
}

// ── Create-or-fetch Meta Pixel (deduplicated) ─────────────────────────────────
async function createOrFetchMetaPixel(ownerKey) {
  const token = getFbUserToken(ownerKey);
  if (!token) return { notConnected: true };

  try {
    // Resolve ad account
    const acctRes = await axios.get('https://graph.facebook.com/v18.0/me/adaccounts', {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });
    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noAccount: true };

    const actId = accounts[0].id;
    const actName = String(accounts[0].name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim().slice(0, 60);

    // Check for existing pixel first — never create a duplicate
    const pixelRes = await axios.get(
      'https://graph.facebook.com/v18.0/' + actId + '/adspixels',
      { params: { fields: 'id,name', access_token: token }, timeout: 10000 }
    );
    const existing = pixelRes.data?.data || [];
    if (existing.length > 0) {
      return { pixels: existing, adAccountId: actId, alreadyExisted: true };
    }

    // No existing pixel — create one
    const pixelName = actName ? 'Smartemark Pixel - ' + actName : 'Smartemark Pixel';
    const createRes = await axios.post(
      'https://graph.facebook.com/v18.0/' + actId + '/adspixels',
      null,
      { params: { name: pixelName, access_token: token }, timeout: 15000 }
    );
    const newId = createRes.data?.id;
    if (!newId) {
      return { error: 'Pixel was submitted but no Pixel ID was returned. Check Meta Events Manager to confirm.' };
    }

    return { pixels: [{ id: newId, name: pixelName }], adAccountId: actId, created: true };
  } catch (err) {
    const fbError = err?.response?.data?.error;
    if (fbError) {
      const code = fbError.code;
      if (code === 190 || code === 102) {
        return { error: 'Your Facebook session has expired. Please reconnect your Facebook account.' };
      }
      if (code === 10 || code === 200 || code === 273 || code === 100) {
        return { permissionDenied: true, errorDetail: fbError.message || 'Permission denied.' };
      }
      return { permissionDenied: true, errorDetail: fbError.message || 'Meta API error.' };
    }
    console.error('[AdAgent] createOrFetchMetaPixel error:', err?.message || err);
    return { error: 'Could not reach Meta API. Please try again.' };
  }
}

// ── Reply builder for pixel create/fetch-or-create ───────────────────────────
function buildPixelCreateReply(result) {
  if (result.notConnected) {
    return 'Facebook is not connected yet. Connect your Facebook ad account first in the Connect Facebook step.';
  }
  if (result.noAccount) {
    return 'No connected ad account was found. Connect or select a Facebook ad account first.';
  }
  if (result.permissionDenied) {
    return (
      'Meta did not allow Smartemark to create a Pixel for this ad account. ' +
      'The account may need Business Manager ownership, Events Manager access, or additional API permissions.\n\n' +
      'You can create it manually:\n' +
      '1. Go to business.facebook.com → Events Manager\n' +
      '2. Click Connect Data Sources → Web → Meta Pixel → Connect\n' +
      '3. Name your Pixel and save\n\n' +
      'Once created, ask me to "fetch my pixel" and I\'ll retrieve the install code for you.' +
      (result.errorDetail ? '\n\nMeta said: ' + result.errorDetail : '')
    );
  }
  if (result.error) {
    return 'There was an issue with Meta Pixel creation: ' + result.error;
  }

  const p = result.pixels[0];
  const snippet = buildPixelSnippet(p.id);
  const label = result.created ? 'created' : 'found (already existed — no duplicate was created)';

  return (
    'Your Meta Pixel was ' + label + ':\n\n' +
    'Pixel ID: ' + p.id + '\n' +
    'Pixel Name: ' + (p.name || 'Smartemark Pixel') + '\n' +
    'Ad Account: ' + result.adAccountId + '\n\n' +
    'Install code — paste into your website <head> section:\n\n' +
    snippet + '\n\n' +
    'How to install:\n' +
    '• WordPress: use the "Insert Headers and Footers" plugin\n' +
    '• Wix: Settings → Custom Code → Head section\n' +
    '• Shopify: Online Store → Themes → Edit code → theme.liquid (before </head>)\n' +
    '• Other: paste just before the closing </head> tag\n\n' +
    'Note: Smartemark does not install the Pixel automatically. You must paste this code into your website manually.'
  );
}

// ── Rate limits ───────────────────────────────────────────────────────────────
const limitChat = basicRateLimit({ windowMs: 60 * 1000, max: 30 });
const limitPixel = basicRateLimit({ windowMs: 60 * 1000, max: 10 });

router.use(secureHeaders());
router.use(basicAuth());

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ad-agent/chat
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ad-agent/chat', limitChat, async (req, res) => {
  try {
    try { await db.read(); } catch {}
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
    }

    const access = adAgentAccess(user);

    if (access === 'locked') {
      return res.status(403).json({
        ok: false,
        locked: true,
        error: 'Ad Agent is available on Deluxe and Premium plans.',
      });
    }

    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ ok: false, error: 'Please provide a message.' });
    }

    // In admin-client mode the effective target is the selected client, not TheBoss
    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);

    const trimmed = message.trim().slice(0, 2000);

    // Pixel CREATE intent — must be checked before general pixel intent
    if (isPixelCreateIntent(trimmed)) {
      if (access !== 'pixel') {
        return res.json({
          ok: true,
          reply: 'Meta Pixel setup is available on the Premium plan. Upgrade to Premium to create or fetch your Meta Pixel.',
        });
      }
      const createResult = await createOrFetchMetaPixel(effectiveOwnerKey);
      if (createResult.pixels?.length && createResult.adAccountId) {
        const p = createResult.pixels[0];
        const st = createResult.created ? 'created' : 'found_existing';
        savePixelInfo(effectiveOwnerKey, p.id, p.name, createResult.adAccountId, st);
      }
      return res.json({ ok: true, reply: buildPixelCreateReply(createResult) });
    }

    // Pixel FETCH intent on non-pixel plan
    if (isPixelIntent(trimmed) && access !== 'pixel') {
      return res.json({
        ok: true,
        reply:
          'Meta Pixel setup is available on the Premium plan. ' +
          'Upgrade to Premium to fetch your Meta Pixel from your connected Facebook ad account.',
      });
    }

    // Pixel FETCH intent on premium/operator — fetch inline
    if (isPixelIntent(trimmed) && access === 'pixel') {
      const pixelResult = await fetchMetaPixels(effectiveOwnerKey);
      if (pixelResult.pixels?.length && pixelResult.adAccountId) {
        const p = pixelResult.pixels[0];
        savePixelInfo(effectiveOwnerKey, p.id, p.name, pixelResult.adAccountId, 'found_existing');
      }
      return res.json({ ok: true, reply: buildPixelReply(pixelResult) });
    }

    // Normal chat — with in-session history + read-only campaign metrics context
    const normalizedHistory = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
          .slice(-8)
      : [];

    const campaignContext = await getCampaignContext(effectiveOwnerKey);

    const completion = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: AD_AGENT_SYSTEM },
        ...(campaignContext ? [{ role: 'system', content: campaignContext }] : []),
        ...normalizedHistory,
        { role: 'user', content: trimmed },
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const reply =
      completion.choices?.[0]?.message?.content?.trim() ||
      'I can help with your campaigns and marketing. What would you like to know?';

    return res.json({ ok: true, reply });
  } catch (err) {
    console.error('[AdAgent] chat error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ad-agent/meta-pixel
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ad-agent/meta-pixel', limitPixel, async (req, res) => {
  try {
    try { await db.read(); } catch {}
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }

    const access = adAgentAccess(user);

    if (access !== 'pixel') {
      return res.status(403).json({ ok: false, error: 'Meta Pixel fetch is available on Premium only.' });
    }

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const result = await fetchMetaPixels(effectiveOwnerKey);

    if (result.notConnected) {
      return res.json({ ok: false, notConnected: true, error: 'Facebook is not connected yet. Connect your Facebook ad account first.' });
    }
    if (result.error) {
      return res.status(500).json({ ok: false, error: result.error });
    }
    if (result.noPixel || !result.pixels?.length) {
      return res.json({
        ok: true,
        noPixel: true,
        message: 'No Meta Pixel was found for this connected ad account. You may need to create one in Meta Events Manager first.',
      });
    }

    if (result.pixels?.length && result.adAccountId) {
      const p = result.pixels[0];
      savePixelInfo(effectiveOwnerKey, p.id, p.name, result.adAccountId, 'found_existing');
    }

    return res.json({
      ok: true,
      adAccountId: result.adAccountId,
      pixels: result.pixels.map((p) => ({
        id: p.id,
        name: p.name || 'Unnamed Pixel',
        snippet: buildPixelSnippet(p.id),
      })),
    });
  } catch (err) {
    console.error('[AdAgent] meta-pixel error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong fetching Meta Pixel.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ad-agent/meta-pixel/create
// Premium/admin only — creates a pixel if none exists, returns existing if one does
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ad-agent/meta-pixel/create', limitPixel, async (req, res) => {
  try {
    try { await db.read(); } catch {}
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }
    if (adAgentAccess(user) !== 'pixel') {
      return res.status(403).json({ ok: false, error: 'Meta Pixel creation is available on Premium only.' });
    }

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const result = await createOrFetchMetaPixel(effectiveOwnerKey);

    if (result.notConnected) {
      return res.json({ ok: false, notConnected: true, error: 'Facebook is not connected yet.' });
    }
    if (result.noAccount) {
      return res.json({ ok: false, error: 'No connected ad account found.' });
    }
    if (result.permissionDenied) {
      return res.status(403).json({ ok: false, permissionDenied: true, error: result.errorDetail || 'Meta permission denied.' });
    }
    if (result.error) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    const p = result.pixels[0];
    const st = result.created ? 'created' : 'found_existing';
    savePixelInfo(effectiveOwnerKey, p.id, p.name, result.adAccountId, st);
    return res.json({
      ok: true,
      created: !!result.created,
      alreadyExisted: !!result.alreadyExisted,
      adAccountId: result.adAccountId,
      pixel: { id: p.id, name: p.name || 'Smartemark Pixel', snippet: buildPixelSnippet(p.id) },
    });
  } catch (err) {
    console.error('[AdAgent] meta-pixel/create error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong creating Meta Pixel.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ad-agent/history  — load saved chat history for the current user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ad-agent/history', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const history = Array.isArray(user.adAgentHistory) ? user.adAgentHistory : [];
    return res.json({ ok: true, history });
  } catch (err) {
    console.error('[AdAgent] history GET error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Could not load history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ad-agent/history  — save (replace) chat history for the current user
// ─────────────────────────────────────────────────────────────────────────────
router.post('/ad-agent/history', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const { messages } = req.body || {};
    if (!Array.isArray(messages)) {
      return res.status(400).json({ ok: false, error: 'messages must be an array.' });
    }

    // Sanitize: only keep user/assistant turns, truncate content, cap at 50 messages
    const sanitized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      .slice(-50);

    const idx = (db.data.users || []).findIndex(
      (u) => String(u?.username || '').trim() === String(user.username || '').trim()
    );
    if (idx !== -1) {
      db.data.users[idx].adAgentHistory = sanitized;
      await db.write();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AdAgent] history POST error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Could not save history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/ad-agent/history  — clear chat history for the current user
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/ad-agent/history', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const idx = (db.data.users || []).findIndex(
      (u) => String(u?.username || '').trim() === String(user.username || '').trim()
    );
    if (idx !== -1) {
      db.data.users[idx].adAgentHistory = [];
      await db.write();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[AdAgent] history DELETE error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Could not clear history.' });
  }
});

module.exports = router;
