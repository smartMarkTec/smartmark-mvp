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
  "Position Smartemark as helping with branding, local visibility, promoting specials, " +
  "and getting more eyes on the business.";

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

// ── Ad Agent access — local to this feature only ──────────────────────────────
// Returns: 'locked' | 'chat' | 'pixel'
function adAgentAccess(planKey) {
  const s = String(planKey || '').trim().toLowerCase();
  if (s === 'premium' || s === 'operator') return 'pixel';
  if (s === 'deluxe' || s === 'pro') return 'chat';
  return 'locked'; // base, starter, standard, '', unknown
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
      'You may need to create one first — go to Meta Events Manager ' +
      '(business.facebook.com) → Data Sources → Connect → Web.'
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
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated. Please log in.' });
    }

    const planKey = String(user?.billing?.planKey || '').trim();
    const access = adAgentAccess(planKey);

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

    const trimmed = message.trim().slice(0, 2000);

    // Pixel intent on non-pixel plan
    if (isPixelIntent(trimmed) && access !== 'pixel') {
      return res.json({
        ok: true,
        reply:
          'Meta Pixel setup is available on the Premium plan. ' +
          'Upgrade to Premium to fetch your Meta Pixel from your connected Facebook ad account.',
      });
    }

    // Pixel intent on premium/operator — fetch inline
    if (isPixelIntent(trimmed) && access === 'pixel') {
      const pixelResult = await fetchMetaPixels(ownerKey);
      return res.json({ ok: true, reply: buildPixelReply(pixelResult) });
    }

    // Normal chat — with in-session history for context
    const normalizedHistory = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
          .slice(-8)
      : [];

    const completion = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: AD_AGENT_SYSTEM },
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
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }

    const planKey = String(user?.billing?.planKey || '').trim();
    const access = adAgentAccess(planKey);

    if (access !== 'pixel') {
      return res.status(403).json({ ok: false, error: 'Meta Pixel fetch is available on Premium only.' });
    }

    const result = await fetchMetaPixels(ownerKey);

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

module.exports = router;
