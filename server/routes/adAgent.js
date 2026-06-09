// server/routes/adAgent.js
'use strict';

const express = require('express');
const router = express.Router();
const OpenAI = require('openai');
const axios = require('axios');
const db = require('../db');
const { getFbUserToken } = require('../tokenStore');
const { secureHeaders, basicRateLimit, basicAuth } = require('../middleware/security');
const { META_API_VERSION } = require('../metaConfig');
const {
  findOptimizerCampaignStateByCampaignId,
  updateOptimizerCampaignState,
  appendAiHistoryEntry,
} = require('../optimizerCampaignState');

// ── OpenAI ────────────────────────────────────────────────────────────────────
const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const AD_AGENT_SYSTEM =
  "You are Smartemark's Ad Agent. Help HVAC and local service businesses understand their campaign, " +
  "choose services/specials to promote, improve ad angles, and understand setup steps. " +
  "Be concise, practical, and action-focused. Do not guarantee leads or calls. " +
  "Position Smartemark as helping with branding, local visibility, promoting specials, and getting more eyes on the business. " +
  "IMPORTANT: When campaign metrics context is provided in the system messages, USE IT. " +
  "Answer performance questions with the actual numbers provided — impressions, CTR, CPC, spend, clicks. " +
  "Explain metrics in plain language a business owner would understand. " +
  "If the AI optimizer has made a diagnosis or taken an action, mention it. " +
  "If there is an active A/B test, mention it. " +
  "Only say data is unavailable if the context explicitly says so.";

// ── Campaign performance intent detection ─────────────────────────────────────
function isCampaignPerformanceIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /how (is|are|did|has|was) my (campaign|ad|ads|marketing|campaign doing|ads doing)/i.test(s) ||
    /campaign (performance|update|report|results|stats|status|numbers|doing)/i.test(s) ||
    /how (are|is) (the|my|our) ads? (doing|performing|running)/i.test(s) ||
    /(performance|results|stats|metrics|numbers|report) (for|on|of|about) (my|the|our) (campaign|ads?)/i.test(s) ||
    /what('s| is| are) (my|the|our) (campaign|ad|ads?) (doing|showing|getting|results)/i.test(s) ||
    /check (my|the|our) (campaign|ad|ads?) (performance|results|stats|metrics)/i.test(s) ||
    /give me (a|an|my) (campaign|performance|ad|ads?) (update|report|summary|overview)/i.test(s) ||
    /(impressions|clicks|ctr|cpc|spend|conversions).*campaign/i.test(s) ||
    /campaign.*(\d|\$|%)/i.test(s)
  );
}

// ── Wrong challenger / regeneration intent detection ──────────────────────────
function isWrongChallengerIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /(wrong|bad|incorrect|off.?brand|not related|unrelated|irrelevant|weird|random|generic).*(creative|challenger|ad|image|visual)/i.test(s) ||
    /(delete|remove|pause|kill|clear|reset|get rid of|undo).*(challenger|a\/b test|ab test|creative test|test ad)/i.test(s) ||
    /(challenger|creative|test ad).*(wrong|bad|incorrect|not right|not related|unrelated|doesn.?t match|doesn.?t look|delete|remove|pause|clear)/i.test(s) ||
    /regenerate.*(challenger|creative|ad|test)/i.test(s) ||
    /(start|restart|redo|try again|replace).*(challenger|creative test|ab test|a\/b test)/i.test(s) ||
    /this (creative|ad|challenger|image) is.*(wrong|not|off|bad|weird|generic|unrelated|incorrect)/i.test(s)
  );
}

// ── Campaign metrics context builder (read-only) ──────────────────────────────
async function getCampaignContext(ownerKey, selectedCampaignId) {
  try {
    await db.read();
    const allStates = db.data?.optimizer_campaign_state || [];
    const userStates = allStates.filter(
      (s) =>
        String(s?.ownerKey || '').trim() === String(ownerKey || '').trim() &&
        !s?.smArchived &&
        !s?.hiddenFromHistory
    );

    if (!userStates.length) {
      return 'No active campaign metrics are available. If the user asks about campaign performance, say exactly: "I don\'t see active campaign metrics connected yet."';
    }

    // Pick the campaign to highlight: prefer selectedCampaignId, then most recent ACTIVE, then any
    let primary = null;
    if (selectedCampaignId) {
      primary = userStates.find((s) => String(s?.campaignId || '') === String(selectedCampaignId));
    }
    if (!primary) {
      primary = userStates.find((s) => String(s?.currentStatus || '').toUpperCase() === 'ACTIVE') || userStates[0];
    }

    // Build full context: primary campaign first, then others (up to 2 more)
    const others = userStates.filter((s) => s !== primary).slice(0, 2);
    const toReport = [primary, ...others].filter(Boolean);

    const lines = [`Campaign data (${toReport.length} campaign${toReport.length !== 1 ? 's' : ''}):`];

    for (const s of toReport) {
      const m = s.metricsSnapshot || {};
      const name = String(s.campaignName || s.campaignId || 'Unnamed campaign').trim();
      const status = String(s.currentStatus || 'UNKNOWN').toUpperCase();
      const isPrimary = s === primary;

      const impr  = Math.round(Number(m.impressions || 0));
      const clicks = Number(m.clicks || 0);
      const spend  = Number(m.spend || 0);
      const ctr    = Number(m.ctr || 0);
      const cpc    = Number(m.cpc || 0);
      const cpm    = Number(m.cpm || 0);
      const reach  = Math.round(Number(m.reach || 0));
      const conv   = Number(m.conversions || 0);

      const parts = [`"${name}"${isPrimary ? ' [selected]' : ''} | Status: ${status}`];
      parts.push(`Impressions: ${impr.toLocaleString()}`);
      if (reach > 0) parts.push(`Reach: ${reach.toLocaleString()}`);
      parts.push(`Clicks: ${clicks}`);
      parts.push(`Spend: $${spend.toFixed(2)}`);
      parts.push(`CTR: ${ctr.toFixed(2)}%`);
      if (cpc > 0) parts.push(`CPC: $${cpc.toFixed(2)}`);
      if (cpm > 0) parts.push(`CPM: $${cpm.toFixed(2)}`);
      if (conv > 0) {
        parts.push(`Conversions: ${conv}`);
        if (m.costPerConversion) parts.push(`Cost/Conv: $${Number(m.costPerConversion).toFixed(2)}`);
      }
      lines.push('- ' + parts.join(' | '));

      // AI diagnosis
      const diag = s.latestDiagnosis;
      if (diag?.diagnosis) {
        lines.push(`  AI Diagnosis: ${diag.diagnosis}${diag.reason ? ` — ${String(diag.reason).slice(0, 180)}` : ''}`);
        if (diag.recommendedAction) lines.push(`  Recommended next action: ${diag.recommendedAction}`);
      }

      // Latest optimizer action
      const action = s.latestAction;
      if (action?.actionType && action.actionType !== 'continue_monitoring') {
        const actionStatus = action.executed ? 'executed' : (action.status || 'pending');
        lines.push(`  Last optimizer action: ${action.actionType} (${actionStatus})`);
      }

      // A/B test
      const test = s.pendingCreativeTest;
      if (test?.status) {
        const testStatus = String(test.status).toLowerCase();
        lines.push(`  A/B test: ${testStatus}${test.creativeGoal ? ` — goal: ${test.creativeGoal}` : ''}`);
      }
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
    const acctRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`, {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });

    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noPixel: true };

    const actId = accounts[0].id;

    const pixelRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/` + actId + '/adspixels',
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
    const acctRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`, {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });
    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noAccount: true };

    const actId = accounts[0].id;
    const actName = String(accounts[0].name || '').replace(/[^a-zA-Z0-9 \-_]/g, '').trim().slice(0, 60);

    // Check for existing pixel first — never create a duplicate
    const pixelRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/` + actId + '/adspixels',
      { params: { fields: 'id,name', access_token: token }, timeout: 10000 }
    );
    const existing = pixelRes.data?.data || [];
    if (existing.length > 0) {
      return { pixels: existing, adAccountId: actId, alreadyExisted: true };
    }

    // No existing pixel — create one
    const pixelName = actName ? 'Smartemark Pixel - ' + actName : 'Smartemark Pixel';
    const createRes = await axios.post(
      `https://graph.facebook.com/${META_API_VERSION}/` + actId + '/adspixels',
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

// ── Pixel diagnostics / event activity ───────────────────────────────────────
// Matches questions about whether the Pixel is working/receiving events.
// MUST be checked before isPixelIntent so diagnostic phrases don't fall through
// to the install-code path.
function isPixelDiagnosticsIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /pixel.*receiv/i.test(s) ||
    /pixel.*event/i.test(s) ||
    /pixel.*activ/i.test(s) ||
    /pixel.*work/i.test(s) ||
    /pixel.*fir/i.test(s) ||
    /pixel.*send/i.test(s) ||
    /pixel.*status/i.test(s) ||
    /pixel.*diagnos/i.test(s) ||
    /pixel.*test/i.test(s) ||
    /pixel.*verif/i.test(s) ||
    /check.*pixel/i.test(s) ||
    /event.*pixel/i.test(s) ||
    /events?\s*manager/i.test(s) ||
    /pagev?iew.*fire/i.test(s) ||
    /lead.*event/i.test(s) ||
    /track.*event/i.test(s) ||
    /did.*pixel/i.test(s) ||
    /is.*pixel/i.test(s)
  );
}

async function checkPixelEventActivity(ownerKey) {
  const token = getFbUserToken(ownerKey);
  if (!token) return { notConnected: true };

  try {
    // Resolve ad account
    const acctRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`, {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });
    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noAccount: true };
    const actId = accounts[0].id;

    // Fetch pixels with basic diagnostic fields
    const pixelRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/` + actId + '/adspixels',
      {
        params: { fields: 'id,name,last_fired_time,is_unavailable', access_token: token },
        timeout: 10000,
      }
    );
    const pixels = pixelRes.data?.data || [];
    if (!pixels.length) return { noPixel: true, adAccountId: actId };

    // For each pixel, try to fetch event-level stats from /{pixel-id}/stats.
    // Meta exposes aggregate event counts (PageView, Lead, etc.) for the last N days
    // when the token has sufficient permissions. Failure is non-fatal: we fall back
    // to last_fired_time only.
    const pixelData = await Promise.all(
      pixels.slice(0, 2).map(async (p) => {
        const base = {
          id: p.id,
          name: p.name || 'Unnamed Pixel',
          lastFiredTime: p.last_fired_time || null,
          isUnavailable: !!p.is_unavailable,
          eventStats: null,       // { PageView: N, Lead: N, ... } if available
          statsUnavailable: false, // true if the stats endpoint failed or returned nothing
        };

        try {
          const nowSec = Math.floor(Date.now() / 1000);
          const sevenDaysAgo = nowSec - 7 * 24 * 3600;
          const statsRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/` + p.id + '/stats',
            {
              params: {
                start_time: sevenDaysAgo,
                end_time: nowSec,
                aggregation: 'total',
                access_token: token,
              },
              timeout: 10000,
            }
          );

          // Response may be { data: [{ PageView: N, Lead: N, ... }] } or similar
          const raw = statsRes.data?.data;
          const row = Array.isArray(raw) ? raw[0] : (raw && typeof raw === 'object' ? raw : null);

          if (row && typeof row === 'object') {
            const skip = new Set(['start_time', 'end_time', 'pixel_id', 'object_type']);
            const events = {};
            for (const [k, v] of Object.entries(row)) {
              if (!skip.has(k)) {
                const n = Number(v);
                if (Number.isFinite(n)) events[k] = n;
              }
            }
            if (Object.keys(events).length > 0) {
              base.eventStats = events;
            } else {
              base.statsUnavailable = true;
            }
          } else {
            base.statsUnavailable = true;
          }
        } catch {
          // Stats endpoint not accessible with current permissions — fall back gracefully
          base.statsUnavailable = true;
        }

        return base;
      })
    );

    return { adAccountId: actId, pixels: pixelData };
  } catch (err) {
    const fbError = err?.response?.data?.error;
    if (fbError) {
      const code = fbError.code;
      if (code === 190 || code === 102) {
        return { error: 'Your Facebook session has expired. Please reconnect your Facebook account.' };
      }
      return { error: fbError.message || 'Meta API error.' };
    }
    console.error('[AdAgent] checkPixelEventActivity error:', err?.message || err);
    return { error: 'Could not reach Meta API. Please try again.' };
  }
}

function buildPixelDiagnosticsReply(result) {
  if (result.notConnected) {
    return 'Facebook is not connected yet. Connect your Facebook ad account first in the Connect Facebook step.';
  }
  if (result.noAccount) {
    return 'No connected Facebook ad account was found. Connect or select an ad account first.';
  }
  if (result.error) {
    return 'There was an issue checking Pixel event activity: ' + result.error;
  }
  if (result.noPixel) {
    return (
      'No Meta Pixel was found for your connected ad account. ' +
      'You\'ll need to create one first — say "create a pixel" and I\'ll set one up for you.'
    );
  }

  const lines = [];
  for (const p of result.pixels) {
    lines.push('Pixel: "' + p.name + '" (ID: ' + p.id + ')');

    if (p.isUnavailable) {
      lines.push('  Status: Unavailable — Meta may have restricted access to this Pixel.');
      continue;
    }

    // Last-fired timestamp (always shown when present)
    if (p.lastFiredTime) {
      const last = new Date(p.lastFiredTime);
      const diffMs = Date.now() - last.getTime();
      const diffHrs = Math.round(diffMs / 3600000);
      const diffDays = Math.round(diffMs / 86400000);
      const ago = diffHrs < 1 ? 'less than an hour ago'
        : diffHrs < 24 ? `~${diffHrs} hour${diffHrs === 1 ? '' : 's'} ago`
        : `~${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
      lines.push('  Last event received: ' + ago + ' (' + last.toLocaleDateString() + ') ✓');
    } else {
      lines.push('  Last event received: no timestamp available from Meta API.');
    }

    // Event-level stats (last 7 days)
    if (p.eventStats && Object.keys(p.eventStats).length > 0) {
      lines.push('  Event counts (last 7 days):');

      // Show high-priority events first
      const priority = ['PageView', 'Lead', 'ViewContent', 'Purchase', 'Contact',
        'CompleteRegistration', 'SubmitApplication', 'Schedule'];
      const shown = new Set();
      for (const evt of priority) {
        if (evt in p.eventStats) {
          const count = p.eventStats[evt];
          lines.push('    ' + evt + ': ' + count.toLocaleString() + (count > 0 ? ' ✓' : ' — not seen'));
          shown.add(evt);
        }
      }
      // Any remaining events
      for (const [k, v] of Object.entries(p.eventStats)) {
        if (!shown.has(k) && v > 0) {
          lines.push('    ' + k + ': ' + v.toLocaleString());
        }
      }

      // Plain-language PageView / Lead read
      const pageView = p.eventStats['PageView'] || 0;
      const lead = p.eventStats['Lead'] || 0;
      if (pageView === 0 && lead === 0) {
        lines.push('  PageView and Lead have not been reported by Meta in the last 7 days.');
      }
    } else if (p.statsUnavailable) {
      // Meta returned nothing useful from /{pixel-id}/stats — be honest
      lines.push(
        '  Event-level counts (PageView, Lead, etc.) are not available through the current API permissions.\n' +
        '  Meta reports the Pixel exists' + (p.lastFiredTime ? ' and has recent activity' : '') +
        ', but does not expose per-event breakdown at this permission level.\n' +
        '  For exact event names in real time, open Meta Events Manager → Test Events, ' +
        'visit the website, and events appear live in that interface.'
      );
    }
  }

  lines.push(
    '\nNote: Event counts come from Meta\'s Marketing API (' +
    (result.pixels.some((p) => p.eventStats) ? '/{pixel-id}/stats endpoint' : 'last_fired_time only') +
    '). This is real data from Meta — not a live stream. ' +
    'For real-time verification, open Meta Events Manager → Test Events.'
  );
  return lines.join('\n');
}

// ── Meta Ads Manager read-only helpers ───────────────────────────────────────

function extractConversions(actions) {
  if (!Array.isArray(actions)) return 0;
  const convTypes = new Set([
    'lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead',
    'omni_lead', 'purchase', 'offsite_conversion.fb_pixel_purchase',
  ]);
  return actions.reduce((sum, row) => {
    if (convTypes.has(String(row?.action_type || '').trim().toLowerCase())) {
      return sum + Number(row?.value || 0);
    }
    return sum;
  }, 0);
}

function isMetaAdsManagerIntent(message) {
  const s = String(message || '').toLowerCase();
  return (
    /ads?\s*manager/i.test(s) ||
    /check.*meta\s*ads/i.test(s) ||
    /check.*facebook\s*ads/i.test(s) ||
    /check.*fb\s*ads/i.test(s) ||
    /meta\s*ads?\s*report/i.test(s) ||
    /facebook\s*ads?\s*report/i.test(s) ||
    /ad\s*account\s*performance/i.test(s) ||
    /show.*meta.*campaigns?/i.test(s) ||
    /what.*going.*on.*in.*(?:my\s+)?ads/i.test(s) ||
    /give.*me.*(?:a\s+)?(?:meta|facebook)\s*ads?\s*(report|summary|update)/i.test(s) ||
    /report.*(?:meta|facebook)\s*ads/i.test(s)
  );
}

async function fetchMetaAdsSummary(ownerKey) {
  const token = getFbUserToken(ownerKey);
  if (!token) return { notConnected: true };

  try {
    const acctRes = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/me/adaccounts`, {
      params: { fields: 'id,name', access_token: token },
      timeout: 10000,
    });
    const accounts = acctRes.data?.data || [];
    if (!accounts.length) return { noAccount: true };

    const actId = accounts[0].id;
    const actName = accounts[0].name || actId;

    const campRes = await axios.get(
      `https://graph.facebook.com/${META_API_VERSION}/` + actId + '/campaigns',
      {
        params: { fields: 'id,name,status,effective_status,objective', access_token: token, limit: 10 },
        timeout: 10000,
      }
    );
    const campaigns = campRes.data?.data || [];
    if (!campaigns.length) {
      return { noCampaigns: true, adAccountId: actId, adAccountName: actName };
    }

    const campaignData = await Promise.all(
      campaigns.slice(0, 6).map(async (c) => {
        try {
          const insRes = await axios.get(
            `https://graph.facebook.com/${META_API_VERSION}/` + c.id + '/insights',
            {
              params: {
                fields: 'impressions,clicks,spend,ctr,cpc,cpm,reach,actions',
                date_preset: 'last_7d',
                access_token: token,
              },
              timeout: 10000,
            }
          );
          const row = insRes.data?.data?.[0] || {};
          const actions = Array.isArray(row.actions) ? row.actions : [];
          const conversions = extractConversions(actions);
          const imp = Number(row.impressions || 0);
          const spd = Number(row.spend || 0);
          return {
            id: c.id,
            name: c.name,
            status: String(c.effective_status || c.status || '').toUpperCase(),
            objective: c.objective || null,
            impressions: imp,
            reach: Number(row.reach || 0),
            clicks: Number(row.clicks || 0),
            spend: spd,
            ctr: Number(row.ctr || 0),
            cpc: Number(row.cpc || 0),
            cpm: Number(row.cpm || 0),
            conversions,
            hasData: imp > 0 || spd > 0,
          };
        } catch {
          return {
            id: c.id,
            name: c.name,
            status: String(c.effective_status || c.status || '').toUpperCase(),
            hasData: false,
          };
        }
      })
    );

    return { adAccountId: actId, adAccountName: actName, campaigns: campaignData };
  } catch (err) {
    const fbError = err?.response?.data?.error;
    if (fbError) {
      const code = fbError.code;
      if (code === 190 || code === 102) {
        return { error: 'Your Facebook session has expired. Please reconnect your Facebook account.' };
      }
      return { error: fbError.message || 'Meta API error.' };
    }
    console.error('[AdAgent] fetchMetaAdsSummary error:', err?.message || err);
    return { error: 'Could not reach Meta API. Please try again.' };
  }
}

function buildMetaAdsSummaryReply(result) {
  if (result.notConnected) {
    return 'Facebook is not connected yet. Connect your Facebook ad account first in the Connect Facebook step.';
  }
  if (result.noAccount) {
    return 'No connected Facebook ad account was found. Connect or select an ad account first.';
  }
  if (result.error) {
    return 'There was an issue checking Meta Ads Manager: ' + result.error;
  }
  if (result.noCampaigns) {
    return (
      'I connected to your ad account (' + result.adAccountId + ') but don\'t see any campaigns yet. ' +
      'Launch a campaign to start seeing performance data here.'
    );
  }

  const { adAccountId, adAccountName, campaigns } = result;
  const lines = [
    "Here's what I'm seeing in Meta Ads Manager (last 7 days):\n",
    'Ad Account: ' + adAccountName + ' (' + adAccountId + ')\n',
  ];

  for (const c of campaigns) {
    lines.push('Campaign: "' + c.name + '" — ' + (c.status || 'UNKNOWN'));

    if (!c.hasData) {
      lines.push('  No delivery data in the last 7 days.');
    } else {
      const parts = [];
      if (c.spend > 0)       parts.push('Spend: $' + Number(c.spend).toFixed(2));
      if (c.impressions > 0) parts.push('Impressions: ' + Number(c.impressions).toLocaleString());
      if (c.reach > 0)       parts.push('Reach: ' + Number(c.reach).toLocaleString());
      if (c.clicks > 0)      parts.push('Clicks: ' + c.clicks);
      if (c.ctr > 0)         parts.push('CTR: ' + Number(c.ctr).toFixed(2) + '%');
      if (c.cpc > 0)         parts.push('CPC: $' + Number(c.cpc).toFixed(2));
      if (c.cpm > 0)         parts.push('CPM: $' + Number(c.cpm).toFixed(2));
      if (c.conversions > 0) parts.push('Conversions: ' + c.conversions);
      if (parts.length) lines.push('  ' + parts.join(' · '));

      // Plain-language read on performance
      const ctr = Number(c.ctr || 0);
      if (c.status === 'ACTIVE' && c.impressions > 500) {
        if (ctr >= 2.0)       lines.push('  Looks good — CTR is strong.');
        else if (ctr >= 1.0)  lines.push('  Decent CTR, some room to improve creative or copy.');
        else if (c.impressions > 1000) lines.push('  CTR below 1% — worth testing a fresh creative or tightening the headline.');
      } else if (c.status !== 'ACTIVE') {
        lines.push('  Campaign is ' + c.status.toLowerCase() + ' — not currently delivering.');
      }
    }
  }

  lines.push('\nNote: This is a read-only summary. To make changes, go to Meta Ads Manager directly.');
  return lines.join('\n');
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

    const { message, history, selectedCampaignId } = req.body || {};
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

    // Pixel DIAGNOSTICS intent — check BEFORE fetch intent so "check my pixel / is it active"
    // doesn't fall through to the install-code path
    if (isPixelDiagnosticsIntent(trimmed)) {
      if (access !== 'pixel') {
        return res.json({
          ok: true,
          reply: 'Meta Pixel diagnostics are available on the Premium plan. Upgrade to Premium to check Pixel event activity.',
        });
      }
      const diagResult = await checkPixelEventActivity(effectiveOwnerKey);
      return res.json({ ok: true, reply: buildPixelDiagnosticsReply(diagResult) });
    }

    // Meta Ads Manager read-only check
    if (isMetaAdsManagerIntent(trimmed)) {
      if (access !== 'pixel') {
        return res.json({
          ok: true,
          reply: 'Live Meta Ads Manager checks are available on Premium. Upgrade to Premium to check your ad account performance directly from Ad Agent.',
        });
      }
      const adsSummary = await fetchMetaAdsSummary(effectiveOwnerKey);
      return res.json({ ok: true, reply: buildMetaAdsSummaryReply(adsSummary) });
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

    // Wrong challenger intent — guide user to confirm removal via the A/B Test tab
    if (isWrongChallengerIntent(trimmed)) {
      const hasCampaign = !!safeCampaignId;
      const reply = hasCampaign
        ? 'Got it — I can remove the AI challenger from this campaign. To confirm the removal:\n\n' +
          '1. Open the **A/B Test** tab for this campaign.\n' +
          '2. Click **"Remove Challenger"** at the bottom of the tab.\n' +
          '3. Confirm — only the AI challenger will be removed. Your original ad stays live and untouched.\n\n' +
          'Once removed, I can generate a replacement challenger using the correct campaign context. Just say **"generate a new challenger"** after removing this one.'
        : 'I can remove the AI challenger from your campaign. Please select a campaign first (use the campaign dropdown), then go to the **A/B Test** tab and click **"Remove Challenger"** to confirm. Your original ad will stay live and untouched.';
      return res.json({ ok: true, reply });
    }

    // Normal chat — with in-session history + read-only campaign metrics context
    const normalizedHistory = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
          .slice(-8)
      : [];

    const safeCampaignId = selectedCampaignId && selectedCampaignId !== '__DRAFT__'
      ? String(selectedCampaignId).trim()
      : null;

    const campaignContext = await getCampaignContext(effectiveOwnerKey, safeCampaignId);

    // For campaign performance questions, add an explicit instruction so the model
    // leads with the real numbers rather than giving a generic non-answer.
    const isPerformanceQ = isCampaignPerformanceIntent(trimmed);
    const performanceInstruction = isPerformanceQ && campaignContext
      ? 'The user is asking about campaign performance. Use the campaign data in this context to give a direct, specific answer with the actual numbers. Lead with the key metrics (impressions, CTR, spend, CPC), then add a brief observation about what they mean. Keep it under 120 words.'
      : null;

    const completion = await openaiClient.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: AD_AGENT_SYSTEM },
        ...(campaignContext ? [{ role: 'system', content: campaignContext }] : []),
        ...(performanceInstruction ? [{ role: 'system', content: performanceInstruction }] : []),
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
// GET /api/ad-agent/meta-pixel/events
// Premium/admin only — read-only Pixel event activity check
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ad-agent/meta-pixel/events', limitPixel, async (req, res) => {
  try {
    try { await db.read(); } catch {}
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    if (adAgentAccess(user) !== 'pixel') {
      return res.status(403).json({ ok: false, error: 'Pixel diagnostics are available on Premium only.' });
    }

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const result = await checkPixelEventActivity(effectiveOwnerKey);

    if (result.notConnected) {
      return res.json({ ok: false, notConnected: true, error: 'Facebook is not connected yet.' });
    }
    if (result.error) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[AdAgent] meta-pixel/events error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong checking Pixel events.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ad-agent/meta-ads-summary
// Premium/admin only — read-only Meta campaign performance summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ad-agent/meta-ads-summary', limitPixel, async (req, res) => {
  try {
    try { await db.read(); } catch {}
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);

    if (!user) {
      return res.status(401).json({ ok: false, error: 'Not authenticated.' });
    }
    if (adAgentAccess(user) !== 'pixel') {
      return res.status(403).json({ ok: false, error: 'Live ad account checks are available on Premium only.' });
    }

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const result = await fetchMetaAdsSummary(effectiveOwnerKey);

    if (result.notConnected) {
      return res.json({ ok: false, notConnected: true, error: 'Facebook is not connected yet. Connect your ad account first.' });
    }
    if (result.error) {
      return res.status(500).json({ ok: false, error: result.error });
    }

    // Return safe structured data — no tokens
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[AdAgent] meta-ads-summary error:', err?.message || err);
    return res.status(500).json({ ok: false, error: 'Something went wrong fetching Meta ads summary.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ad-agent/history
// History is scoped to the effective user — admin-client mode reads the client's
// history, not TheBoss's. Pass ?adminClientId=<username> when in client mode.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ad-agent/history', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const historyUser = effectiveOwnerKey !== ownerKey
      ? (await findUserByOwnerKey(effectiveOwnerKey) || user)
      : user;

    const history = Array.isArray(historyUser.adAgentHistory) ? historyUser.adAgentHistory : [];
    console.log('[AdAgent] history GET — owner:', historyUser.username, '| admin:', user.username !== historyUser.username ? user.username : null);
    return res.json({ ok: true, history, historyOwner: historyUser.username });
  } catch (err) {
    console.error('[AdAgent] history GET error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Could not load history.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ad-agent/history
// Saves to the effective user's history record. In admin-client mode the client's
// record is updated, not TheBoss's.
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

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const historyUser = effectiveOwnerKey !== ownerKey
      ? (await findUserByOwnerKey(effectiveOwnerKey) || user)
      : user;

    const sanitized = messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      .slice(-50);

    const idx = (db.data.users || []).findIndex(
      (u) => String(u?.username || '').trim() === String(historyUser.username || '').trim()
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
// DELETE /api/ad-agent/history
// Clears the effective user's history. In admin-client mode clears the client's
// history, not TheBoss's.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/ad-agent/history', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const historyUser = effectiveOwnerKey !== ownerKey
      ? (await findUserByOwnerKey(effectiveOwnerKey) || user)
      : user;

    const idx = (db.data.users || []).findIndex(
      (u) => String(u?.username || '').trim() === String(historyUser.username || '').trim()
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

// POST /api/ad-agent/remove-challenger
// Pauses all AI challenger ads for a campaign and clears pendingCreativeTest from optimizer state.
router.post('/ad-agent/remove-challenger', limitChat, async (req, res) => {
  try {
    await db.read();
    const ownerKey = ownerKeyFromReq(req);
    const user = await findUserByOwnerKey(ownerKey);
    if (!user) return res.status(401).json({ ok: false, error: 'Not authenticated.' });

    const effectiveOwnerKey = resolveEffectiveOwnerKey(req, user, ownerKey);
    const safeCampaignId = String(req.body?.campaignId || req.query?.campaignId || '').trim();
    if (!safeCampaignId) return res.status(400).json({ ok: false, error: 'campaignId is required.' });

    // Locate the optimizer state for this campaign
    const campaignState = await findOptimizerCampaignStateByCampaignId(safeCampaignId).catch(() => null);
    if (!campaignState) {
      return res.status(404).json({ ok: false, error: 'No optimizer state found for this campaign.' });
    }

    // Verify ownership (effective owner must match the state's ownerKey, or caller is admin)
    const stateOwner = String(campaignState.ownerKey || '').trim();
    const callerIsAdmin = effectiveOwnerKey !== ownerKey;
    if (!callerIsAdmin && stateOwner && stateOwner !== effectiveOwnerKey) {
      return res.status(403).json({ ok: false, error: 'Not authorized to modify this campaign.' });
    }

    const pending = campaignState.pendingCreativeTest || null;
    const candidateAdIds = Array.isArray(pending?.candidateAdIds) ? pending.candidateAdIds.filter(Boolean) : [];

    console.log('[AdAgent] remove challenger request', {
      campaignId: safeCampaignId,
      effectiveOwnerKey,
      isAdmin: callerIsAdmin,
      candidateAdIdsCount: candidateAdIds.length,
      pendingStatus: String(pending?.status || 'none'),
    });

    // Pause challenger ads on Meta if we have a token and ad IDs
    const userToken = getFbUserToken(effectiveOwnerKey);
    const pauseResults = [];
    const pauseErrors = [];

    if (userToken && candidateAdIds.length > 0) {
      for (const adId of candidateAdIds) {
        try {
          const pauseRes = await axios.post(
            `https://graph.facebook.com/${META_API_VERSION}/${adId}`,
            { status: 'PAUSED' },
            { params: { access_token: userToken } }
          );
          pauseResults.push({ adId, paused: true, response: pauseRes.data || null });
        } catch (err) {
          pauseErrors.push({ adId, error: err?.response?.data || err?.message || String(err) });
        }
      }
    }

    // Clear pendingCreativeTest from optimizer state
    await updateOptimizerCampaignState(safeCampaignId, {
      pendingCreativeTest: null,
    });

    // Log to AI history
    await appendAiHistoryEntry(safeCampaignId, {
      type: 'action',
      timestamp: new Date().toISOString(),
      title: 'Removed AI challenger',
      summary: candidateAdIds.length > 0
        ? `Paused ${pauseResults.length} challenger ad(s).${pauseErrors.length > 0 ? ` ${pauseErrors.length} pause error(s).` : ''}`
        : 'No challenger ad IDs were on record.',
      reason: 'User requested removal of the AI challenger via the A/B Test tab.',
      actionType: 'remove_challenger',
      source: 'user_manual',
    }).catch(() => {});

    return res.json({
      ok: true,
      paused: pauseResults,
      errors: pauseErrors,
      candidateAdIds,
    });
  } catch (err) {
    console.error('[AdAgent] remove-challenger error:', err?.message);
    return res.status(500).json({ ok: false, error: 'Could not remove challenger.' });
  }
});

module.exports = router;
