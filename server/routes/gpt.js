// server/routes/gpt.js
/* eslint-disable */
const express = require('express');
const router = express.Router();

/**
 * Goals:
 * - Smarter intent matching (fuzzy + token overlap) with clean, concise replies
 * - Small in-memory session history (24h TTL) so follow-ups feel more contextual
 * - Backward compatible: always returns { reply }, plus optional bullets/suggestions
 *
 * No external deps.
 */

/* -------------------- tiny in-memory session store -------------------- */
const SESSIONS = new Map(); // key -> { last, messages: [{role,text,ts}], created }
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function getSessionKey(req, body) {
  // Prefer explicit conversationId if your UI sends one; else use ip+ua
  const cid = body?.conversationId;
  if (cid && typeof cid === 'string') return `cid:${cid}`;
  return `ip:${req.ip}|ua:${req.headers['user-agent'] || ''}`.slice(0, 400);
}
function touchSession(key) {
  let s = SESSIONS.get(key);
  if (!s) {
    s = { created: Date.now(), last: Date.now(), messages: [] };
    SESSIONS.set(key, s);
  } else {
    s.last = Date.now();
  }
  // GC (simple)
  for (const [k, v] of SESSIONS.entries()) {
    if (Date.now() - (v?.last || 0) > SESSION_TTL_MS) SESSIONS.delete(k);
  }
  return s;
}

/* --------------------------- text utilities --------------------------- */
const STOPWORDS = new Set([
  'the','a','an','and','or','but','if','then','else','when','what','which','who',
  'are','is','was','were','be','been','do','does','did','can','could','should','would',
  'to','for','of','on','in','with','about','how','this','that','it','my','your',
  'you','i','me','we','our','us','they','them','their'
]);

function normalize(str = '') {
  return String(str).toLowerCase().replace(/[\u2018\u2019]/g,"'").replace(/[^\w\s$%+]/g, ' ').replace(/\s+/g, ' ').trim();
}
function tokenize(str) {
  return normalize(str).split(' ').filter(t => t && !STOPWORDS.has(t));
}
function jaccard(aTokens, bTokens) {
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if (!A.size && !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}
function includesLoose(text, trig) {
  text = normalize(text);
  trig = normalize(trig);
  if (!trig) return false;
  if (text.includes(trig)) return true;
  // allow small edit-distance-ish by segment
  const tks = tokenize(text);
  const rks = tokenize(trig);
  return jaccard(tks, rks) > 0.45;
}
function cleanReply(s = '') {
  // Single spaces, sentence case-ish, trim, no over-excited punctuation
  let out = String(s).replace(/\s+/g, ' ').trim();
  out = out.replace(/!\s*$/g, '.');
  return out;
}

/* --------------------------- knowledge base --------------------------- */
/**
 * Each entry: { intent, triggers[], reply, bullets?, suggestions? }
 * Keep replies short; bullets <= 4 items.
 */
const KB = [
  {
    intent: 'WHAT_ARE_YOU',
    triggers: ['who are you','what are you','what is this','what do you do','what can you do'],
    reply: "I'm your AI Ad Manager. I help you create and launch ads—like an agency, but automated.",
    bullets: ["Generate image + video ads", "Draft ad copy", "Guide setup", "Help you launch"],
    suggestions: ['How does it work?', 'Can you make videos?', 'Pricing']
  },
  {
    intent: 'HOW_IT_WORKS',
    triggers: ['how does this work','how do you work','how does it work','process','get started','begin'],
    reply: "Answer a few prompts, I generate image and video ads, you review, then launch.",
    bullets: ["Fill quick form", "Preview creatives", "Select media", "Launch to your page"],
    suggestions: ['Can I edit the ads?', 'Which platforms?']
  },
  {
    intent: 'PLATFORMS',
    triggers: ['what platforms','which platforms','where will my ads show','facebook','instagram'],
    reply: "Optimized for Meta (Facebook + Instagram) today, with more channels coming.",
    suggestions: ['Do you integrate with Facebook?', 'Can you connect my page?']
  },
  {
    intent: 'INTEGRATIONS',
    triggers: ['integrate with facebook','connect to facebook','connect page','connect account'],
    reply: "Yes—connect your Facebook Ads account and page, then launch in a few clicks.",
    suggestions: ['How to launch?', 'Can you set targeting?']
  },
  {
    intent: 'MAKE_ADS',
    triggers: ['do you create the ads','do you write the ads','make the ads','generate ads','image ads','video ads'],
    reply: "I generate ad copy, images, and short video previews automatically from your answers.",
    bullets: ['Auto copywriting', 'Branded image options', 'Short video variants'],
    suggestions: ['Can I upload my own logo?', 'How many versions?']
  },
  {
    intent: 'PRICING',
    triggers: ['is this free','how much','pricing','do i have to pay','fee','cost'],
    reply: "SmartMark is in beta. You’ll see a small service fee on launch.",
    suggestions: ['How long does it take?', 'Can I run multiple campaigns?']
  },
  {
    intent: 'RESULTS',
    triggers: ['will this get me customers','does this work','is this effective','results'],
    reply: "SmartMark uses proven formats to drive clicks and conversions. Better inputs = better results.",
    suggestions: ['Can you optimize my ads?', 'Can I edit the ads?']
  },
  {
    intent: 'PRIVACY',
    triggers: ['do you store my data','is my data safe','privacy','what do you do with my info'],
    reply: "Your info is used only to generate ads. We keep it minimal and private.",
    suggestions: ['Can I delete my data?', 'How long do you keep drafts?']
  },
  {
    intent: 'EDITING',
    triggers: ['can i edit the ads','change my answers','update my campaign','regenerate'],
    reply: "Yes—adjust answers, regenerate creatives, and preview before launching.",
    suggestions: ['How many ads can I make?', 'Can I make video ads?']
  },
  {
    intent: 'COUNT_LIMITS',
    triggers: ['how many ads do i get','generate more ads','how many campaigns','limits'],
    reply: "You can generate multiple image/video variants and start a new campaign anytime.",
    suggestions: ['What’s the process?', 'Pricing']
  },
  {
    intent: 'TARGETING',
    triggers: ['target my audience','handle targeting','set audience','retarget','retargeting'],
    reply: "We baseline your targeting and are adding deeper audience tools soon.",
    suggestions: ['How do I launch?', 'Can I pause a campaign?']
  },
  {
    intent: 'LAUNCHING',
    triggers: ['launch my ads','post my ads','run my ads','how to launch'],
    reply: "Connect your account, review creatives, set budget and dates, then hit Launch.",
    suggestions: ['Can I pause later?', 'Which platforms?']
  },
  {
    intent: 'PAUSE',
    triggers: ['pause a campaign','pause my ads','stop my ads'],
    reply: "You can pause or archive campaigns from your Campaigns panel.",
    suggestions: ['How to launch?', 'Can you optimize my ads?']
  },
  {
    intent: 'SUPPORT',
    triggers: ['contact support','help','support','problem','issue'],
    reply: "Ask here and I’ll guide you. For anything urgent, we’ll follow up via email.",
    suggestions: ['How does it work?', 'Pricing']
  },
  {
    intent: 'THANKS',
    triggers: ['thanks','thank you','great','cool','nice','good job'],
    reply: "You’re welcome. Ready to launch when you are.",
    suggestions: ['How do I launch?', 'Make video ads']
  },
  {
    intent: 'RESET',
    triggers: ['reset','start over','clear'],
    reply: "Starting fresh—feel free to update any answer and regenerate creatives.",
    suggestions: ['How does it work?', 'Generate more ads']
  }
];

const GENERIC_REPLY =
  "I'm your AI Ad Manager. Ask anything about launching, creatives, budget, or setup.";

/* --------------------------- matching engine --------------------------- */
function bestKBMatch(userText) {
  let best = null;
  let bestScore = 0;
  for (const entry of KB) {
    for (const trig of entry.triggers) {
      if (includesLoose(userText, trig)) {
        // score with token similarity for a bit of ranking
        const s = jaccard(tokenize(userText), tokenize(trig));
        if (s > bestScore) {
          bestScore = s;
          best = entry;
        }
      }
    }
  }
  return best;
}

function summarizeTopic(text) {
  const toks = tokenize(text).filter(t => t.length > 3);
  // pick up to 2 prominent tokens
  const counts = {};
  toks.forEach(t => counts[t] = (counts[t] || 0) + 1);
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([t])=>t);
  return sorted.slice(0,2).join(' ');
}

/* ------------------------------- router ------------------------------- */
router.post('/gpt-chat', (req, res) => {
  const { message } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ reply: "Please type a question or tell me what you want to launch." });
  }

  const key = getSessionKey(req, req.body);
  const session = touchSession(key);
  const userText = String(message || '');

  // quick commands
  if (/^\s*(reset|clear|start over)\s*$/i.test(userText)) {
    session.messages = [];
    return res.json({
      intent: 'RESET',
      reply: cleanReply("Starting fresh—go ahead and enter your details again and I’ll regenerate everything."),
      bullets: [],
      suggestions: ['How does it work?', 'Generate more ads'],
      history_len: 0
    });
  }

  // record user message
  session.messages.push({ role: 'user', text: userText, ts: Date.now() });
  if (session.messages.length > 20) session.messages.shift();

  // try to match
  const match = bestKBMatch(userText);
  let reply = match ? match.reply : GENERIC_REPLY;
  let bullets = match?.bullets || [];
  let suggestions = match?.suggestions || [];

  // micro-context: if last bot reply was about launching and user asks "how long"
  const lastBot = [...session.messages].reverse().find(m => m.role === 'assistant');
  if (!match && /how\s+long|how\s+fast/i.test(userText)) {
    reply = "Creative generation usually takes under two minutes. You can preview while assets finish.";
    suggestions = ['How do I launch?', 'Can I make video ads?'];
  }

  // fallback: echo topic if we still didn’t match a strong intent
  if (!match) {
    const topic = summarizeTopic(userText);
    if (topic) {
      reply = `Here’s how ${topic} works with SmartMark: ${reply}`;
    }
  }

  const clean = cleanReply(reply);
  const botMsg = { role: 'assistant', text: clean, ts: Date.now() };
  session.messages.push(botMsg);

  return res.json({
    intent: match?.intent || 'GENERAL',
    reply: clean,
    bullets,
    suggestions,
    history_len: session.messages.length
  });
});

module.exports = router;
