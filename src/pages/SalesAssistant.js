// src/pages/SalesAssistant.js — Smartemark Internal Sales Copilot
import React, { useState, useRef, useCallback, useEffect } from "react";

/* ─── Constants ────────────────────────────────────────────────────────────── */
const LS_KEY = "sm_sales_assistant_v1";
const PASSCODE = "SMARTEMARK_SALES_2026";
const SCORE_THRESHOLD = 5;
const AI_DEBOUNCE_MS = 1600;
const AI_MIN_CHARS = 12;
const RECENT_CHARS = 160;  // chars sent as recentTranscript
const CONTEXT_CHARS = 600; // chars sent as fullRecentContext
const CHUNK_DURATION_MS = 4000; // HQ mode: ms of audio per transcription chunk

/* ─── Default Script ───────────────────────────────────────────────────────── */
const DEFAULT_SCRIPT = {
  opener: `Hey, this is Will/Walter/Emma calling from UTSA — how've you been?\n\nI'm reaching out because I'm part of a small team over here at UTSA that's been getting feedback working with HVAC companies on an AI marketing software we built that basically helps automate advertising and helps get more calls coming in.\n\nI've been showing it to a few companies in the area and getting feedback.\n\nI know I caught you out of the blue here, but do you have a quick minute right now? I can give you the simple version so you can see if it's even worth taking a look at.`,
  ifBusy: `I understand. I'll make it super quick — less than a minute — just so you can see if it's even relevant.`,
  ifCantTalk: `No problem. How does your schedule look later today or tomorrow?`,
  pitch: `So in simple terms, you hop on our platform, tell the AI about your business and what you're trying to promote, and then the AI learns your business, creates the advertisement, writes the copy, helps launch the Facebook and Instagram campaign, and manages the campaign while it runs.\n\nSo instead of you having to learn Facebook ads yourself, constantly post content, or pay a high-ticket fee to an agency, the platform helps handle the campaign for you.\n\nIt's month-to-month, there's no contract, you can cancel anytime, and the plans range from $100 to $250 a month. Your Facebook ad budget is separate, and you control that.`,
  preClose: `Quick question — are you currently running paid ads, or are you mostly getting customers from word of mouth?`,
  mainClose: `Based on that, if this sounds like something that could help, we can honestly get you set up pretty quickly and let you test it out. Worst case, if you don't like it, you're not locked into anything.\n\nWould it make sense to get you set up and let you try it out?`,
  ifYes: `Perfect. It only takes a few minutes to get started.\n\n1. Go to smartemark.com and hit "Get Started"\n2. Create your account\n3. Select your plan (Starter at $100/month is a good start)\n4. Answer a few simple questions about your HVAC business\n5. The AI builds your first ad — you review and approve before anything goes live\n\nWant me to text you the link right now?`,
  meetingLinks: [
    { label: "Will's Link", url: "https://meet.google.com/gaj-ocgq-dip" },
    { label: "Emma's Link", url: "https://meet.google.com/svi-itsm-ami" },
  ],
};

/* ─── Default Objections ───────────────────────────────────────────────────── */
const DEFAULT_OBJECTIONS = [
  {
    id: "busy",
    priority: 1,
    category: "Timing",
    label: "Busy Right Now",
    exactPhrases: ["i'm busy", "i am busy", "i don't have time", "i'm on a job", "i'm driving", "call me later", "i'm in an attic", "can't talk right now", "not a good time"],
    keywordGroups: [["busy"], ["dont", "have", "time"], ["on", "job"], ["driving"], ["call", "later"], ["attic"], ["cant", "talk"], ["not", "good", "time"]],
    response: `Totally understand — I know HVAC owners are usually in the field, driving, or on jobs. I'll make it under a minute.\n\nSmartemark is basically an AI ad manager for HVAC businesses. You tell it about your business, it creates the ad, launches the Facebook campaign, and monitors it. Starts at $100/month, cancel anytime.`,
    followUp: `Does that sound like something worth a closer look, or should I call you back later today?`,
    close: `What time works better — later this afternoon or tomorrow morning?`,
    coachingNote: `Keep it SHORT. Give them a 15-second pitch and a yes/no. Don't pitch hard to someone who's on a roof.`,
  },
  {
    id: "price",
    priority: 2,
    category: "Price",
    label: "Price / Cost",
    exactPhrases: ["how much is it", "what does it cost", "how much does it cost", "what's the pricing", "what is the pricing", "how much", "monthly fee", "is it expensive", "what's the fee"],
    keywordGroups: [["how", "much"], ["what", "cost"], ["pricing"], ["price"], ["monthly"], ["fee"], ["expensive"]],
    response: `Plans range from $100 to $250/month, and it's month-to-month with no contract. Your Facebook ad budget is separate — you control that yourself.\n\nSo you're not locked into a big agency fee, and you can test it at the level that makes sense for you.`,
    followUp: `Would you want to start small and try it out, or look at one of the higher plans?`,
    close: `Most people start at $100/month to test it. If they're seeing results after 30 days, they scale up. Would that feel reasonable?`,
    coachingNote: `Don't get defensive about price. Frame it as low-risk vs. an agency alternative. $100 is less than one service call.`,
  },
  {
    id: "tried_before",
    priority: 3,
    category: "Bad Experience",
    label: "Tried Marketing Before / Ads Didn't Work",
    exactPhrases: ["tried ads before", "ads didn't work", "ads did not work", "marketing didn't work", "wasted money on ads", "spent money and got nothing", "got bad leads", "no calls from ads", "facebook ads didn't work", "yelp didn't work", "agency didn't work", "got burned before", "i've been burned before", "i tried marketing before"],
    keywordGroups: [["tried", "ads"], ["ads", "didnt", "work"], ["marketing", "didnt", "work"], ["spent", "money", "nothing"], ["wasted", "money"], ["bad", "leads"], ["no", "calls"], ["facebook", "didnt", "work"], ["agency", "didnt", "work"], ["yelp", "didnt", "work"], ["burned", "before"], ["ran", "ads"], ["got", "nothing"], ["no", "results"], ["facebook", "ads"], ["didnt", "get", "results"]],
    response: `Yeah, I completely get that. A lot of HVAC owners have tried ads, Yelp, agencies, or boosted posts and felt like they just spent money without seeing anything real.\n\nUsually the issue isn't that marketing can't work — it's poor targeting, weak creative, or nobody optimizing after the campaign starts. That's exactly what Smartemark is built to help with.`,
    followUp: `When you tried it before, was the bigger issue bad leads, no calls, or just not knowing what they were doing?`,
    close: `So if you could test it month-to-month without being locked in, would it make sense to try it out?`,
    coachingNote: `Validate the frustration first. Don't dismiss it. Separate "ads don't work" from "that approach didn't work." Reframe with specific reasons this is different.`,
  },
  {
    id: "has_marketing_guy",
    priority: 4,
    category: "Competition",
    label: "Already Has Marketing Guy",
    exactPhrases: ["i have a marketing guy", "i already have someone", "i have an agency", "someone handles that", "my guy does that", "we have marketing already", "i have someone doing that", "my marketing guy handles that"],
    keywordGroups: [["marketing", "guy"], ["already", "someone"], ["have", "agency"], ["someone", "handles"], ["marketing", "already"], ["have", "someone"], ["guy", "does"]],
    response: `Got it. If he's doing a good job, I wouldn't tell you to stop that. Smartemark doesn't have to replace him.\n\nIt can work alongside him — help him create ads faster, test different versions, and reduce campaign workload.`,
    followUp: `Is he mostly posting content, or is he running paid Facebook ads too?`,
    close: `Got it. Would it make sense to test Smartemark as a tool that helps with that paid ad side?`,
    coachingNote: `Don't attack their current person. Position Smartemark as a tool, not a replacement. Ask what the guy actually does — often it's social media posting, not paid ads.`,
  },
  {
    id: "send_info",
    priority: 5,
    category: "Stall",
    label: "Send Me Info",
    exactPhrases: ["send me info", "send me information", "email me", "text me the link", "send me something", "can you send that over", "send me the website", "send me the pricing", "send me a link"],
    keywordGroups: [["send", "info"], ["send", "information"], ["email", "me"], ["text", "link"], ["send", "something"], ["send", "website"], ["send", "pricing"], ["send", "link"]],
    response: `Yeah, I can send that over. Quick question though — just so I send you the right thing — are you more interested in how it works, what it costs, or how it compares to hiring a marketing person?`,
    followUp: `What would be most useful for you to see?`,
    close: `Perfect, I'll send that. And if it looks useful, we can either get you set up or do a quick walkthrough — whatever makes more sense.`,
    coachingNote: `"Send me info" is usually a soft no or a stall. Don't just agree and hang up. Ask a qualifying question and book a follow-up before you send anything.`,
  },
  {
    id: "partner",
    priority: 6,
    category: "Decision",
    label: "Need To Talk To Wife / Partner / Owner",
    exactPhrases: ["i need to talk to my wife", "i need to ask my partner", "i need to talk to the owner", "i need to ask my manager", "let me talk to my wife", "i have to ask my partner", "need to check with someone"],
    keywordGroups: [["talk", "wife"], ["ask", "partner"], ["talk", "owner"], ["ask", "manager"], ["check", "someone"], ["talk", "partner"], ["talk", "husband"], ["ask", "wife"]],
    response: `Totally fair. A lot of owners have someone else involved with the business or payment side.\n\nI can send the overview page so they can see exactly how it works, what it costs, and what to expect.`,
    followUp: `What would be most helpful for them to see?`,
    close: `Would it be better to send that over and then schedule a quick call with both of you?`,
    coachingNote: `Don't try to close without the decision-maker. Offer to loop them in directly. Ask if you can get a short 15-min call with both of them to avoid the "telephone game."`,
  },
  {
    id: "facebook_spend",
    priority: 7,
    category: "Price",
    label: "Facebook Ad Spend Separate",
    exactPhrases: ["facebook charges separately", "ad budget", "ad spend", "do i pay facebook", "is the budget included", "how does the budget work", "is facebook included"],
    keywordGroups: [["facebook", "charges"], ["ad", "budget"], ["ad", "spend"], ["pay", "facebook"], ["budget", "included"], ["facebook", "included"], ["facebook", "separately"]],
    response: `Correct. Smartemark is the software fee. Facebook and Instagram ad spend is separate.\n\nSimple way to think about it: Smartemark is the engine, and Facebook is the fuel. You control the fuel budget. We don't take a percentage of your ad spend.`,
    followUp: `What kind of monthly ad budget would you feel comfortable testing with?`,
    close: `Most customers start around $200–$300 in ad spend to test it. That's enough to see real data in the first 2–3 weeks.`,
    coachingNote: `Be transparent about the ad spend. Frame it as a positive — they control it, we don't take a cut. Help them think about a starting budget.`,
  },
  {
    id: "cheesy",
    priority: 8,
    category: "Quality",
    label: "Ads Look Cheesy / Fake",
    exactPhrases: ["will it look cheesy", "will it look fake", "ai ads look bad", "i don't want fake looking ads", "will the ad look professional", "i don't want cartoon ads", "those ai ads look weird"],
    keywordGroups: [["look", "cheesy"], ["look", "fake"], ["ai", "ads", "bad"], ["fake", "ads"], ["cartoon", "ads"], ["look", "weird"], ["look", "professional"]],
    response: `Fair question. A lot of AI ads do look fake, and that's exactly what we try to avoid.\n\nSmartemark focuses on clean, simple HVAC ads that actually communicate the service. And if you don't like the first version, you can regenerate or adjust it before anything goes live.`,
    followUp: `Would you want the ad to focus more on the service — like repair or install — or more on a seasonal offer?`,
    close: `You can literally see a preview of your ad before spending a dollar. Want me to show you what that looks like?`,
    coachingNote: `Show, don't tell when possible. Offer to show them a sample ad. Acknowledge that bad AI ads exist — don't argue.`,
  },
  {
    id: "not_understand",
    priority: 9,
    category: "Knowledge",
    label: "Doesn't Understand Ads / AI",
    exactPhrases: ["i don't know ai", "i don't know facebook ads", "i'm not technical", "i don't understand ads", "i don't know how this works", "i'm not good with technology"],
    keywordGroups: [["dont", "know", "ai"], ["dont", "know", "facebook"], ["not", "technical"], ["dont", "understand", "ads"], ["not", "good", "technology"], ["not", "tech", "savvy"]],
    response: `That's actually the point. You don't need to know Facebook ads or AI. The platform asks simple questions about your business, what you want to promote, and where you're located. Then the AI helps create, launch, and manage the campaign.`,
    followUp: `Have you ever boosted a post on Facebook before, even just once?`,
    close: `So if this could help you run ads without having to learn the whole platform yourself, would it make sense to get you set up and let you test it out?`,
    coachingNote: `This is a buying signal in disguise. They want it to be easy. Reassure them repeatedly that they don't need to know anything technical.`,
  },
  {
    id: "word_of_mouth",
    priority: 10,
    category: "Referral",
    label: "Word Of Mouth / Referrals",
    exactPhrases: ["word of mouth", "referrals", "we don't advertise", "we get enough referrals", "customers refer us", "we get business from referrals"],
    keywordGroups: [["word", "mouth"], ["referrals"], ["dont", "advertise"], ["enough", "referrals"], ["customers", "refer"], ["referral", "business"]],
    response: `Word of mouth is actually a great foundation — it means people already trust your work.\n\nThe thing is, referrals can have a ceiling. Smartemark is not meant to replace word of mouth. It's meant to add another channel so people in your area who don't know you yet can find you.`,
    followUp: `Are you looking to grow more this season, or mainly keep things steady?`,
    close: `If this could help you add another source of calls besides referrals, would it make sense to test it out?`,
    coachingNote: `Referral-based businesses are comfortable. The play is to make them feel this is additive, not a criticism of their current approach.`,
  },
  {
    id: "not_ready",
    priority: 11,
    category: "Timing",
    label: "Not Ready Right Now",
    exactPhrases: ["not ready", "maybe later", "later in the season", "not right now", "call me next month", "we're good right now", "check back later"],
    keywordGroups: [["not", "ready"], ["maybe", "later"], ["later", "season"], ["not", "right", "now"], ["call", "next", "month"], ["good", "right", "now"], ["check", "back"]],
    response: `No problem. A lot of owners start thinking about this before they actually turn it on.\n\nSince it's month-to-month, you can start when timing makes sense without being locked into a long contract.`,
    followUp: `Would next week or later this month be better for me to check back?`,
    close: `I'll shoot you a text as a reminder. What's the best number to reach you on?`,
    coachingNote: `Get a specific callback date before you hang up. "Not right now" without a follow-up date = lost lead.`,
  },
];

const OUTCOME_OPTIONS = [
  "No Answer", "Voicemail", "Heard Pitch", "Interested",
  "Signup Link Requested", "Booked Walkthrough", "Call Back Later",
  "Not Interested", "Paid / Customer", "Needs Follow-Up",
];

const CATEGORIES = [
  "All", "Timing", "Stall", "Bad Experience",
  "Competition", "Price", "Decision", "Quality", "Knowledge", "Referral",
];

/* ─── Detection: keyword scoring fallback ──────────────────────────────────── */
function normalizeText(text) {
  return text.toLowerCase().replace(/'/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreObjection(obj, normalized) {
  let score = 0;
  for (const phrase of obj.exactPhrases || []) {
    if (normalized.includes(normalizeText(phrase))) score += 10;
  }
  for (const group of obj.keywordGroups || []) {
    if (group.every((w) => normalized.includes(normalizeText(w)))) score += 5;
  }
  return score;
}

function keywordDetect(transcript, objections, usedIds = []) {
  if (!transcript || transcript.trim().length < 3) return [];
  const normalized = normalizeText(transcript);
  return objections
    .filter((o) => !usedIds.includes(o.id))
    .map((o) => ({ obj: o, score: scoreObjection(o, normalized) }))
    .filter(({ score }) => score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.obj.priority - b.obj.priority)
    .slice(0, 2);
}

/* ─── localStorage ─────────────────────────────────────────────────────────── */
function loadLS() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; }
}
function saveLS(data) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}
function isOldFormat(objs) {
  return Array.isArray(objs) && objs.length > 0 && !objs[0].label;
}
function mergeWithDefaults(saved) {
  const objs = (!saved?.objections || isOldFormat(saved?.objections))
    ? DEFAULT_OBJECTIONS
    : saved.objections;
  return {
    script: saved?.script || DEFAULT_SCRIPT,
    objections: objs,
    callLogs: saved?.callLogs || [],
  };
}

/* ─── Styles & UI primitives ───────────────────────────────────────────────── */
const S = {
  bg: "#0f1117",
  surface: "#15171f",
  card: "#1b1e28",
  border: "#252836",
  borderHi: "#323651",
  green: "#22c577",
  text: "#dde0ef",
  muted: "#636882",
  orange: "#f0a04b",
  purple: "#a78bfa",
  blue: "#60a5fa",
  red: "#f87171",
  yellow: "#fbbf24",
  teal: "#2dd4bf",
};

const baseInput = {
  display: "block", width: "100%", background: "#0f1117",
  color: S.text, border: `1px solid ${S.border}`, borderRadius: 7,
  padding: "8px 11px", fontSize: 13, boxSizing: "border-box", marginTop: 4,
};

function Card({ children, style }) {
  return (
    <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 16, ...style }}>
      {children}
    </div>
  );
}

function SLabel({ children, color }) {
  return <div style={{ color: color || S.muted, fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{children}</div>;
}

function Badge({ children, color = S.green }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}44`, borderRadius: 6, fontSize: 11, fontWeight: 800, padding: "2px 9px", letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function CopyBtn({ text, label = "Copy" }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text || "").catch(() => {}); setDone(true); setTimeout(() => setDone(false), 1500); }}
      style={{ background: done ? S.green : "#23273a", color: done ? "#fff" : S.muted, border: `1px solid ${done ? S.green : S.border}`, borderRadius: 6, padding: "5px 13px", fontSize: 12, cursor: "pointer", transition: "all 0.18s", whiteSpace: "nowrap" }}
    >
      {done ? "Copied!" : label}
    </button>
  );
}

function Btn({ children, onClick, color = S.green, variant = "fill", disabled, style: extra }) {
  const fill = variant === "fill";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ background: fill ? color : "transparent", color: fill ? "#fff" : color, border: `1px solid ${color}${fill ? "" : "88"}`, borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1, transition: "all 0.18s", ...extra }}
    >
      {children}
    </button>
  );
}

function catColor(cat) {
  return { Timing: S.green, Stall: S.orange, "Bad Experience": S.red, Competition: S.purple, Price: S.blue, Decision: "#f472b6", Quality: "#34d399", Knowledge: "#fb923c", Referral: "#4ade80" }[cat] || S.muted;
}

function outcomeColor(o) {
  return { "No Answer": S.muted, "Voicemail": "#888", "Heard Pitch": S.blue, "Interested": S.green, "Signup Link Requested": S.teal, "Booked Walkthrough": S.purple, "Call Back Later": S.orange, "Not Interested": S.red, "Paid / Customer": S.yellow, "Needs Follow-Up": "#fb923c" }[o] || S.muted;
}

/* ─── Confidence bar ───────────────────────────────────────────────────────── */
function ConfBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  const col = pct >= 75 ? S.green : pct >= 45 ? S.orange : S.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: S.surface, borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 3, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ color: col, fontSize: 12, fontWeight: 800, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

/* ─── Objection display card (Live Call tab) ───────────────────────────────── */
function ObjectionCard({ obj, aiResult, source, onMarkUsed }) {
  if (!obj) {
    return (
      <Card style={{ border: `1px solid ${S.border}`, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ color: S.muted, fontSize: 13, marginBottom: 6 }}>No objection detected yet.</div>
          <div style={{ color: "#3a3d50", fontSize: 12 }}>Listening for trigger phrases…</div>
        </div>
      </Card>
    );
  }

  const copyAll = [obj.response, obj.followUp, obj.close].filter(Boolean).join("\n\n");

  return (
    <Card style={{ border: `1px solid ${source === "ai" ? S.green + "55" : source === "keyword" ? S.orange + "44" : S.purple + "44"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        {source === "ai" && <Badge color={S.green}>AI</Badge>}
        {source === "keyword" && <Badge color={S.orange}>Keyword Match</Badge>}
        {source === "manual" && <Badge color={S.purple}>Manual</Badge>}
        <Badge color={catColor(obj.category)}>{obj.category}</Badge>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{obj.label}</span>
      </div>

      {source === "ai" && aiResult?.confidence > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SLabel>Confidence</SLabel>
          <ConfBar value={aiResult.confidence} />
        </div>
      )}

      {source === "ai" && aiResult?.prospectMeaning && (
        <div style={{ marginBottom: 12, background: S.surface, borderRadius: 8, padding: "10px 13px", borderLeft: `3px solid ${S.blue}` }}>
          <SLabel color={S.blue}>Prospect Means</SLabel>
          <div style={{ color: S.text, fontSize: 13, lineHeight: 1.6 }}>{aiResult.prospectMeaning}</div>
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <SLabel color={S.green}>Say This</SLabel>
        <div style={{ color: S.text, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiResult?.sayThis || obj.response}</div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <SLabel>Ask This Next</SLabel>
        <div style={{ color: S.text, fontSize: 13, lineHeight: 1.6 }}>{aiResult?.askThisNext || obj.followUp}</div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <SLabel color={S.green}>Move Forward</SLabel>
        <div style={{ color: S.green, fontSize: 13, lineHeight: 1.6, fontWeight: 600 }}>{aiResult?.moveForward || obj.close}</div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <CopyBtn text={copyAll} label="Copy All" />
        <Btn onClick={onMarkUsed} variant="outline" color={S.muted} style={{ padding: "5px 13px", fontSize: 12 }}>Mark Used</Btn>
      </div>
    </Card>
  );
}

/* ─── Live Call Tab ────────────────────────────────────────────────────────── */
function LiveCallTab({ objections, callLogs, onSaveCall }) {
  // Detect HQ capability once (stable — no state needed)
  const hqSupported = !!(
    typeof navigator !== "undefined" &&
    navigator.mediaDevices?.getUserMedia &&
    typeof window !== "undefined" &&
    window.MediaRecorder
  );
  const brSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // ─ Core state
  const [transcribeMode, setTranscribeMode] = useState(hqSupported ? "hq" : "browser");
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true); // browser SR available

  // HQ mode state
  const [micStatus, setMicStatus] = useState("idle"); // idle | active | error
  const [micLevel, setMicLevel] = useState(0); // 0–100
  const [transcribing, setTranscribing] = useState(false);

  // AI state
  const [aiResult, setAiResult] = useState(null);
  const [aiStatus, setAiStatus] = useState("idle"); // idle | analyzing | done | error
  const [lastSentText, setLastSentText] = useState("");

  // Keyword fallback
  const [kwMatches, setKwMatches] = useState([]);

  // Override & session tracking
  const [manualOverride, setManualOverride] = useState("");
  const [usedIds, setUsedIds] = useState([]);
  const [stage, setStage] = useState("pitch");

  // Quick log form (bottom bar)
  const [logForm, setLogForm] = useState({ company: "", contact: "", phone: "", notes: "" });

  // Browser SR refs
  const recogRef = useRef(null);
  const transcriptRef = useRef("");
  const requestIdRef = useRef(0);
  const debounceRef = useRef(null);
  const callAIRef = useRef(null);
  const runKwRef = useRef(null);

  // HQ mode refs
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const hqActiveRef = useRef(false);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const levelIntervalRef = useRef(null);
  const lastTranscribedRef = useRef("");

  // Shared helper — appends text to transcript and triggers AI + keyword detection
  const appendTranscript = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const next = transcriptRef.current ? transcriptRef.current + " " + trimmed : trimmed;
    transcriptRef.current = next;
    setTranscript(next);
    runKwRef.current?.(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => callAIRef.current?.(next), AI_DEBOUNCE_MS);
  }, []);

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

  const startMicMeter = useCallback((stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(stream).connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      levelIntervalRef.current = setInterval(() => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setMicLevel(Math.min(100, Math.round(avg * 1.5)));
      }, 80);
    } catch {}
  }, []);

  const stopMicMeter = useCallback(() => {
    clearInterval(levelIntervalRef.current);
    setMicLevel(0);
    try { audioCtxRef.current?.close(); } catch {}
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const sendChunk = useCallback(async (blob) => {
    if (!blob || blob.size < 1500) return;
    setTranscribing(true);
    try {
      const b64 = await blobToBase64(blob);
      const mimeType = blob.type || "audio/webm";
      const context = lastTranscribedRef.current.split(" ").slice(-25).join(" ");
      const res = await fetch("/api/sales-assistant/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64, mimeType, context }),
      });
      const data = await res.json();
      if (data.ok && data.text) {
        lastTranscribedRef.current = (lastTranscribedRef.current + " " + data.text).trim().slice(-400);
        appendTranscript(data.text);
      }
    } catch (err) {
      console.warn("[HQ transcribe] chunk error:", err?.message);
    } finally {
      setTranscribing(false);
    }
  }, [appendTranscript]);

  const recordChunk = useCallback((stream) => {
    if (!hqActiveRef.current) return;
    let mimeType = "audio/webm;codecs=opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "";
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    recorderRef.current = rec;
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      if (chunks.length) sendChunk(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      if (hqActiveRef.current) recordChunk(stream);
    };
    rec.start();
    setTimeout(() => { if (rec.state === "recording") rec.stop(); }, CHUNK_DURATION_MS);
  }, [sendChunk]);

  const startHQ = useCallback(async () => {
    if (!hqSupported) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      hqActiveRef.current = true;
      setMicStatus("active");
      setListening(true);
      startMicMeter(stream);
      recordChunk(stream);
    } catch (err) {
      console.error("[startHQ] mic error:", err?.message);
      setMicStatus("error");
      setListening(false);
    }
  }, [hqSupported, startMicMeter, recordChunk]);

  const stopHQ = useCallback(() => {
    hqActiveRef.current = false;
    try { recorderRef.current?.stop(); } catch {}
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch {}
    streamRef.current = null;
    recorderRef.current = null;
    stopMicMeter();
    setMicStatus("idle");
    setListening(false);
    setTranscribing(false);
  }, [stopMicMeter]);

  // Defined before useEffect to avoid TDZ; stored in refs so handler stays current
  const callAI = useCallback(async (text) => {
    const recent = text.slice(-RECENT_CHARS).trim();
    const context = text.slice(-CONTEXT_CHARS).trim();
    if (recent === lastSentText || recent.length < AI_MIN_CHARS) return;
    setLastSentText(recent);

    const myId = ++requestIdRef.current;
    setAiStatus("analyzing");

    const approvedObjections = objections
      .filter((o) => !usedIds.includes(o.id))
      .map((o) => ({
        label: o.label,
        response: (o.response || "").slice(0, 160),
        followUp: (o.followUp || "").slice(0, 120),
        close: (o.close || "").slice(0, 120),
      }));

    try {
      const res = await fetch("/api/sales-assistant/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recentTranscript: recent, fullRecentContext: context, currentStage: stage, approvedObjections }),
      });
      if (requestIdRef.current !== myId) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (requestIdRef.current !== myId) return;
      setAiResult(data);
      setAiStatus("done");
    } catch {
      if (requestIdRef.current !== myId) return;
      setAiStatus("error");
    }
  }, [objections, usedIds, stage, lastSentText]);

  const runKwFallback = useCallback((text) => {
    setKwMatches(keywordDetect(text, objections, usedIds));
  }, [objections, usedIds]);

  // Keep refs pointing at latest versions on every render
  callAIRef.current = callAI;
  runKwRef.current = runKwFallback;

  // Set up SpeechRecognition exactly once; calls through refs so it's never stale
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      if (!final) return;
      appendTranscript(final);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recogRef.current = rec;
  }, []); // intentionally empty — all live state accessed through refs above

  const regenerate = () => {
    const text = transcriptRef.current;
    if (!text) return;
    setLastSentText("");
    callAI(text);
  };

  const handleModeChange = (mode) => {
    if (listening) {
      if (transcribeMode === "hq") stopHQ();
      else { recogRef.current?.stop(); setListening(false); }
    }
    setTranscribeMode(mode);
  };

  const startListening = () => {
    if (transcribeMode === "hq") startHQ();
    else { recogRef.current?.start(); setListening(true); }
  };

  const stopListening = () => {
    if (transcribeMode === "hq") stopHQ();
    else { recogRef.current?.stop(); setListening(false); }
  };

  const clearAll = () => {
    if (transcribeMode === "hq") stopHQ();
    else { recogRef.current?.stop(); setListening(false); }
    setTranscript("");
    transcriptRef.current = "";
    lastTranscribedRef.current = "";
    setAiResult(null);
    setAiStatus("idle");
    setKwMatches([]);
    setLastSentText("");
    setManualOverride("");
    setUsedIds([]);
    clearTimeout(debounceRef.current);
  };

  // Determine what to show
  const manualObj = manualOverride ? objections.find((o) => o.id === manualOverride) : null;
  const aiLabel = aiResult?.detectedObjection;
  const aiObj = aiLabel && aiLabel !== "No Clear Objection" && aiResult.confidence >= 0.5
    ? objections.find((o) => o.label === aiLabel)
    : null;
  const [kwPrimary] = kwMatches;
  const kwObj = kwPrimary && !usedIds.includes(kwPrimary.obj.id) ? kwPrimary.obj : null;

  const displayObj = manualObj || aiObj || kwObj || null;
  const source = manualObj ? "manual" : aiObj ? "ai" : kwObj ? "keyword" : null;

  const secondaryLabel = aiResult?.secondaryMatch;
  const secondaryObj = secondaryLabel && secondaryLabel !== "No Clear Objection" && !manualObj
    ? objections.find((o) => o.label === secondaryLabel)
    : null;

  const markUsed = () => {
    if (displayObj) {
      setUsedIds((p) => [...p, displayObj.id]);
      setManualOverride("");
      setAiResult(null);
    }
  };

  const handleOutcome = (outcome) => {
    const entry = { ...logForm, outcome, timestamp: new Date().toISOString(), id: `call_${Date.now()}` };
    onSaveCall(entry);
    setLogForm({ company: "", contact: "", phone: "", notes: "" });
  };

  return (
    <div>
      {/* Mode selector + listener controls */}
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "14px 20px", marginBottom: 16 }}>
        {/* Mode toggle */}
        {(hqSupported || brSupported) && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            <span style={{ color: S.muted, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Mode:</span>
            {hqSupported && (
              <button
                onClick={() => handleModeChange("hq")}
                style={{ background: transcribeMode === "hq" ? S.green : "transparent", color: transcribeMode === "hq" ? "#fff" : S.muted, border: `1px solid ${transcribeMode === "hq" ? S.green : S.border}`, borderRadius: 7, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                High Accuracy (Whisper)
              </button>
            )}
            {brSupported && (
              <button
                onClick={() => handleModeChange("browser")}
                style={{ background: transcribeMode === "browser" ? S.blue : "transparent", color: transcribeMode === "browser" ? "#fff" : S.muted, border: `1px solid ${transcribeMode === "browser" ? S.blue : S.border}`, borderRadius: 7, padding: "4px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Browser (Built-in)
              </button>
            )}
            {transcribeMode === "hq" && (
              <span style={{ color: "#3a3e58", fontSize: 11, marginLeft: 8 }}>
                Uses OpenAI Whisper — better accuracy on phone speakers &amp; accents
              </span>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!supported && transcribeMode === "browser" ? (
            <span style={{ color: S.orange, fontSize: 13 }}>
              Live transcription not supported. Use Chrome or paste notes below.
            </span>
          ) : (
            <>
              <Btn onClick={startListening} disabled={listening} color={S.green} style={{ minWidth: 140 }}>
                {listening ? "● Listening…" : "Start Listening"}
              </Btn>
              <Btn onClick={stopListening} disabled={!listening} color={S.red} variant="outline">Stop</Btn>
              <Btn onClick={clearAll} color={S.muted} variant="outline">Clear</Btn>

              {listening && transcribeMode === "hq" && micStatus === "active" && (
                <span style={{ color: S.green, fontSize: 12 }}>● Recording</span>
              )}
              {listening && transcribeMode === "browser" && (
                <span style={{ color: S.green, fontSize: 12, animation: "pulse 1.5s infinite" }}>Recording active</span>
              )}
              {transcribing && (
                <span style={{ color: S.teal, fontSize: 12 }}>Transcribing…</span>
              )}
              {aiStatus === "analyzing" && (
                <span style={{ color: S.blue, fontSize: 12 }}>AI analyzing…</span>
              )}
              {aiStatus === "error" && (
                <span style={{ color: S.orange, fontSize: 12 }}>AI offline — using keyword fallback</span>
              )}
              {micStatus === "error" && (
                <span style={{ color: S.red, fontSize: 12 }}>Mic error — check browser permissions</span>
              )}

              {/* Mic level meter (HQ only) */}
              {listening && transcribeMode === "hq" && micStatus === "active" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
                  <span style={{ color: S.muted, fontSize: 11 }}>Mic</span>
                  <div style={{ width: 80, height: 6, background: S.border, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ width: `${micLevel}%`, height: "100%", background: micLevel > 70 ? S.green : micLevel > 30 ? S.teal : S.blue, transition: "width 80ms linear", borderRadius: 3 }} />
                  </div>
                </div>
              )}
            </>
          )}
          <span style={{ color: "#3a3e58", fontSize: 11, marginLeft: "auto", textAlign: "right", maxWidth: 280 }}>
            Use only in compliance with applicable call recording and monitoring laws. This tool does not save audio recordings.
          </span>
        </div>
      </div>

      {/* Main 2-col layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, alignItems: "start" }}>
        {/* LEFT: transcript */}
        <div>
          <Card>
            <SLabel>Live Transcript</SLabel>
            {(!supported && transcribeMode === "browser") ? (
              <textarea
                placeholder="Paste prospect's words here to detect objections…"
                onChange={(e) => {
                  const v = e.target.value;
                  transcriptRef.current = v;
                  setTranscript(v);
                  runKwFallback(v);
                  clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => callAIRef.current?.(v), AI_DEBOUNCE_MS);
                }}
                style={{ ...baseInput, minHeight: 220, resize: "vertical", marginTop: 8, fontSize: 14, lineHeight: 1.7 }}
              />
            ) : (
              <div style={{ background: S.surface, border: `1px solid ${S.border}`, borderRadius: 8, padding: 14, minHeight: 220, maxHeight: 380, overflowY: "auto", color: transcript ? S.text : "#3a3e58", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
                {transcript || (transcribeMode === "hq" ? "Start Listening to capture audio via Whisper…" : "Transcript will appear here as the prospect speaks…")}
              </div>
            )}
          </Card>

          {/* Stage picker */}
          <Card style={{ padding: "12px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <SLabel>Call Stage</SLabel>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {["opening", "pitch", "objection_handling", "close"].map((s) => (
                  <button key={s} onClick={() => setStage(s)} style={{ background: stage === s ? S.green : "transparent", color: stage === s ? "#fff" : S.muted, border: `1px solid ${stage === s ? S.green : S.border}`, borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* RIGHT: detection panel */}
        <div>
          {/* Controls row */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <select
              value={manualOverride}
              onChange={(e) => setManualOverride(e.target.value)}
              style={{ flex: 1, background: S.card, color: S.text, border: `1px solid ${S.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" }}
            >
              <option value="">Auto-detect objection</option>
              {objections.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <Btn onClick={regenerate} disabled={!transcript} color={S.blue} variant="outline" style={{ whiteSpace: "nowrap" }}>
              Regenerate AI
            </Btn>
          </div>

          {/* Primary detection */}
          <ObjectionCard obj={displayObj} aiResult={source === "ai" ? aiResult : null} source={source} onMarkUsed={markUsed} />

          {/* Secondary match */}
          {secondaryObj && !manualObj && (
            <div style={{ border: `1px solid ${S.borderHi}`, borderRadius: 10, padding: "10px 14px", background: S.surface }}>
              <div style={{ color: S.muted, fontSize: 11, fontWeight: 800, textTransform: "uppercase", marginBottom: 6 }}>Also Possible</div>
              <div style={{ display: "flex", align: "center", gap: 8, flexWrap: "wrap" }}>
                <Badge color={catColor(secondaryObj.category)}>{secondaryObj.category}</Badge>
                <span style={{ color: S.text, fontSize: 13, fontWeight: 600 }}>{secondaryObj.label}</span>
                <button
                  onClick={() => setManualOverride(secondaryObj.id)}
                  style={{ marginLeft: "auto", background: "transparent", color: S.blue, border: `1px solid ${S.blue}44`, borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                >
                  Use this
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Quick Call Logger */}
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 12, padding: "16px 20px", marginTop: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr", gap: 10, marginBottom: 12 }}>
          {[["company", "Company"], ["contact", "Contact"], ["phone", "Phone"], ["notes", "Notes"]].map(([k, label]) => (
            <div key={k}>
              <SLabel>{label}</SLabel>
              <input
                value={logForm[k]}
                onChange={(e) => setLogForm((p) => ({ ...p, [k]: e.target.value }))}
                placeholder={label}
                style={{ ...baseInput }}
              />
            </div>
          ))}
        </div>
        <div>
          <SLabel>Log Outcome</SLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {OUTCOME_OPTIONS.map((o) => (
              <button
                key={o}
                onClick={() => handleOutcome(o)}
                style={{ background: outcomeColor(o) + "18", color: outcomeColor(o), border: `1px solid ${outcomeColor(o)}44`, borderRadius: 8, padding: "6px 13px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}
              >
                {o}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Script Tab ───────────────────────────────────────────────────────────── */
function ScriptTab({ script }) {
  const [open, setOpen] = useState("opener");
  const sections = [
    { key: "opener", label: "Opening Script" },
    { key: "ifBusy", label: "If They're Busy" },
    { key: "ifCantTalk", label: "If They Can't Talk" },
    { key: "pitch", label: "Quick Pitch" },
    { key: "preClose", label: "Pre-Close Question" },
    { key: "mainClose", label: "Main Close" },
    { key: "ifYes", label: "If Yes / Setup Instructions" },
  ];
  return (
    <div>
      {sections.map(({ key, label }) => (
        <Card key={key} style={{ padding: 0, overflow: "hidden" }}>
          <button
            onClick={() => setOpen(open === key ? null : key)}
            style={{ width: "100%", background: "none", border: "none", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 20px", cursor: "pointer" }}
          >
            <span style={{ color: S.green, fontWeight: 700, fontSize: 14 }}>{label}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ color: S.muted, fontSize: 18, lineHeight: 1 }}>{open === key ? "−" : "+"}</span>
            </div>
          </button>
          {open === key && (
            <div style={{ borderTop: `1px solid ${S.border}`, padding: "16px 20px" }}>
              <p style={{ color: S.text, fontSize: 14, lineHeight: 1.8, margin: "0 0 12px", whiteSpace: "pre-wrap" }}>{script[key]}</p>
              <CopyBtn text={script[key]} />
            </div>
          )}
        </Card>
      ))}

      <Card>
        <SLabel color={S.green}>Meeting Links</SLabel>
        {(script.meetingLinks || []).map((link, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <span style={{ color: S.muted, fontSize: 13, minWidth: 100 }}>{link.label}:</span>
            <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: S.green, fontSize: 13 }}>{link.url}</a>
            <CopyBtn text={link.url} label="Copy Link" />
          </div>
        ))}
      </Card>

      <Card style={{ border: `1px solid ${S.purple}33`, background: "#1a1a2a" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{ fontSize: 24 }}>🧠</div>
          <div>
            <div style={{ color: S.purple, fontWeight: 800, fontSize: 13, marginBottom: 6 }}>OBJECTION = UNCERTAINTY</div>
            <ol style={{ color: S.text, fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              <li>Acknowledge</li><li>Answer / Reframe</li><li>Rebuild Certainty</li><li>Move Forward</li>
            </ol>
            <p style={{ color: S.orange, fontSize: 12, marginTop: 8, marginBottom: 0, fontWeight: 700 }}>
              Team rule: Never answer an objection and go silent.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ─── Objections Tab ───────────────────────────────────────────────────────── */
function ObjectionsTab({ objections, adminMode, onChange }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const filtered = objections.filter(
    (o) =>
      (cat === "All" || o.category === cat) &&
      ((o.label || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.response || "").toLowerCase().includes(search.toLowerCase()) ||
        (o.coachingNote || "").toLowerCase().includes(search.toLowerCase()))
  );

  const startEdit = (obj) => { setEditing(obj.id); setDraft({ ...obj, _exactPhrases: (obj.exactPhrases || []).join("\n"), _keywordGroups: (obj.keywordGroups || []).map((g) => g.join(" ")).join("\n") }); };
  const saveEdit = () => {
    const updated = {
      ...draft,
      exactPhrases: draft._exactPhrases.split("\n").map((s) => s.trim()).filter(Boolean),
      keywordGroups: draft._keywordGroups.split("\n").map((line) => line.trim().split(/\s+/).filter(Boolean)).filter((g) => g.length),
    };
    delete updated._exactPhrases;
    delete updated._keywordGroups;
    onChange(objections.map((o) => (o.id === editing ? updated : o)));
    setEditing(null);
  };
  const deleteObj = (id) => { if (window.confirm("Delete this objection?")) onChange(objections.filter((o) => o.id !== id)); };
  const addNew = () => {
    const n = { id: `obj_${Date.now()}`, priority: 99, category: "Timing", label: "New Objection", exactPhrases: [], keywordGroups: [], response: "", followUp: "", close: "", coachingNote: "" };
    onChange([...objections, n]);
    startEdit(n);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search objections…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, ...baseInput, marginTop: 0 }}
        />
        {adminMode && <Btn onClick={addNew} color={S.green}>+ Add Objection</Btn>}
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
        {CATEGORIES.map((c) => (
          <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? S.green : "transparent", color: cat === c ? "#fff" : S.muted, border: `1px solid ${cat === c ? S.green : S.border}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: cat === c ? 700 : 400 }}>
            {c}
          </button>
        ))}
      </div>

      {filtered.map((obj) => (
        <Card key={obj.id}>
          {editing === obj.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
                <div><SLabel>Label</SLabel><input value={draft.label || ""} onChange={(e) => setDraft((p) => ({ ...p, label: e.target.value }))} style={baseInput} /></div>
                <div><SLabel>Category</SLabel><select value={draft.category || "Timing"} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} style={{ ...baseInput, width: "auto" }}>{CATEGORIES.filter((c) => c !== "All").map((c) => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div><SLabel>Response</SLabel><textarea rows={4} value={draft.response || ""} onChange={(e) => setDraft((p) => ({ ...p, response: e.target.value }))} style={{ ...baseInput, resize: "vertical" }} /></div>
              <div><SLabel>Follow-Up Question</SLabel><input value={draft.followUp || ""} onChange={(e) => setDraft((p) => ({ ...p, followUp: e.target.value }))} style={baseInput} /></div>
              <div><SLabel>Move Forward / Close</SLabel><input value={draft.close || ""} onChange={(e) => setDraft((p) => ({ ...p, close: e.target.value }))} style={baseInput} /></div>
              <div><SLabel>Coaching Note</SLabel><input value={draft.coachingNote || ""} onChange={(e) => setDraft((p) => ({ ...p, coachingNote: e.target.value }))} style={baseInput} /></div>
              <div><SLabel>Exact Phrases (one per line)</SLabel><textarea rows={3} value={draft._exactPhrases || ""} onChange={(e) => setDraft((p) => ({ ...p, _exactPhrases: e.target.value }))} style={{ ...baseInput, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} /></div>
              <div><SLabel>Keyword Groups (one group per line, space-separated words)</SLabel><textarea rows={3} value={draft._keywordGroups || ""} onChange={(e) => setDraft((p) => ({ ...p, _keywordGroups: e.target.value }))} style={{ ...baseInput, resize: "vertical", fontFamily: "monospace", fontSize: 12 }} /></div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn onClick={saveEdit} color={S.green}>Save</Btn>
                <Btn onClick={() => setEditing(null)} color={S.muted} variant="outline">Cancel</Btn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge color={catColor(obj.category)}>{obj.category}</Badge>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>{obj.label}</span>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  <CopyBtn text={[obj.response, obj.followUp, obj.close].filter(Boolean).join("\n\n")} />
                  {adminMode && <>
                    <Btn onClick={() => startEdit(obj)} color={S.muted} variant="outline" style={{ padding: "4px 12px", fontSize: 12 }}>Edit</Btn>
                    <Btn onClick={() => deleteObj(obj.id)} color={S.red} variant="outline" style={{ padding: "4px 12px", fontSize: 12 }}>Delete</Btn>
                  </>}
                </div>
              </div>
              <div style={{ color: S.text, fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}><span style={{ color: S.muted, fontWeight: 700 }}>Response: </span>{obj.response}</div>
              <div style={{ color: S.text, fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}><span style={{ color: S.muted, fontWeight: 700 }}>Follow-up: </span>{obj.followUp}</div>
              <div style={{ color: S.green, fontSize: 13, lineHeight: 1.7, marginBottom: obj.coachingNote ? 8 : 0 }}><span style={{ color: S.muted, fontWeight: 700 }}>Close: </span>{obj.close}</div>
              {obj.coachingNote && (
                <div style={{ background: S.surface, border: `1px solid ${S.purple}33`, borderRadius: 7, padding: "8px 12px", marginTop: 6 }}>
                  <span style={{ color: S.purple, fontSize: 11, fontWeight: 800 }}>COACHING: </span>
                  <span style={{ color: S.muted, fontSize: 12, fontStyle: "italic" }}>{obj.coachingNote}</span>
                </div>
              )}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ─── Call Log Tab ─────────────────────────────────────────────────────────── */
function CallLogTab({ callLogs, onSave, onClear }) {
  const [form, setForm] = useState({ company: "", contact: "", phone: "", email: "", notes: "" });
  const handleOutcome = (outcome) => {
    onSave({ ...form, outcome, timestamp: new Date().toISOString(), id: `call_${Date.now()}` });
    setForm({ company: "", contact: "", phone: "", email: "", notes: "" });
  };
  return (
    <div>
      <Card>
        <SLabel color={S.green}>Log a Call</SLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          {[["company", "Company"], ["contact", "Contact"], ["phone", "Phone"], ["email", "Email"]].map(([k, lbl]) => (
            <div key={k}><SLabel>{lbl}</SLabel><input value={form[k]} onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} placeholder={lbl} style={baseInput} /></div>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}><SLabel>Notes</SLabel><textarea value={form.notes} rows={2} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes…" style={{ ...baseInput, resize: "vertical" }} /></div>
        <SLabel>Select Outcome</SLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {OUTCOME_OPTIONS.map((o) => (
            <button key={o} onClick={() => handleOutcome(o)} style={{ background: outcomeColor(o) + "18", color: outcomeColor(o), border: `1px solid ${outcomeColor(o)}44`, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 700 }}>{o}</button>
          ))}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>Recent Calls ({callLogs.length})</span>
          {callLogs.length > 0 && <Btn onClick={onClear} color={S.red} variant="outline" style={{ padding: "5px 13px", fontSize: 12 }}>Clear All</Btn>}
        </div>
        {callLogs.length === 0 ? (
          <p style={{ color: S.muted, fontSize: 14 }}>No calls logged yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${S.border}` }}>
                  {["Time", "Company", "Contact", "Phone", "Outcome", "Notes"].map((h) => (
                    <th key={h} style={{ color: S.muted, fontWeight: 700, padding: "7px 10px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...callLogs].reverse().map((log) => (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${S.surface}` }}>
                    <td style={{ color: S.muted, padding: "7px 10px", whiteSpace: "nowrap" }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ color: S.text, padding: "7px 10px" }}>{log.company || "—"}</td>
                    <td style={{ color: S.text, padding: "7px 10px" }}>{log.contact || "—"}</td>
                    <td style={{ color: S.text, padding: "7px 10px" }}>{log.phone || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ background: outcomeColor(log.outcome) + "18", color: outcomeColor(log.outcome), border: `1px solid ${outcomeColor(log.outcome)}44`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 700 }}>{log.outcome}</span>
                    </td>
                    <td style={{ color: S.muted, padding: "7px 10px", maxWidth: 200 }}>{log.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/* ─── Admin Tab ────────────────────────────────────────────────────────────── */
function AdminTab({ data, onScriptChange, onObjectionsChange, onReset }) {
  const [section, setSection] = useState("script");
  const { script, objections, callLogs } = data;

  const scriptSections = [
    { key: "opener", label: "Opening Script", rows: 6 },
    { key: "ifBusy", label: "If They're Busy", rows: 3 },
    { key: "ifCantTalk", label: "If They Can't Talk", rows: 2 },
    { key: "pitch", label: "Quick Pitch", rows: 6 },
    { key: "preClose", label: "Pre-Close Question", rows: 2 },
    { key: "mainClose", label: "Main Close", rows: 4 },
    { key: "ifYes", label: "If Yes / Setup Instructions", rows: 5 },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {["script", "objections", "info"].map((s) => (
          <button key={s} onClick={() => setSection(s)} style={{ background: section === s ? S.purple : "transparent", color: section === s ? "#fff" : S.muted, border: `1px solid ${section === s ? S.purple : S.border}`, borderRadius: 8, padding: "8px 18px", fontSize: 13, cursor: "pointer", fontWeight: section === s ? 700 : 400 }}>
            {s === "info" ? "Info & Reset" : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {section === "script" && (
        <div>
          {scriptSections.map(({ key, label, rows }) => (
            <Card key={key}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <SLabel color={S.green}>{label}</SLabel>
                <CopyBtn text={script[key] || ""} />
              </div>
              <textarea rows={rows} value={script[key] || ""} onChange={(e) => onScriptChange(key, e.target.value)} style={{ ...baseInput, resize: "vertical" }} />
            </Card>
          ))}
          <Card>
            <SLabel color={S.green}>Meeting Links</SLabel>
            {(script.meetingLinks || []).map((link, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <input value={link.label} onChange={(e) => { const next = script.meetingLinks.map((l, j) => j === i ? { ...l, label: e.target.value } : l); onScriptChange("meetingLinks", next); }} style={{ ...baseInput, width: 140 }} placeholder="Label" />
                <input value={link.url} onChange={(e) => { const next = script.meetingLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l); onScriptChange("meetingLinks", next); }} style={{ ...baseInput, flex: 1 }} placeholder="URL" />
              </div>
            ))}
          </Card>
        </div>
      )}

      {section === "objections" && (
        <ObjectionsTab objections={objections} adminMode={true} onChange={onObjectionsChange} />
      )}

      {section === "info" && (
        <div>
          <Card>
            <SLabel color={S.purple}>Storage Key</SLabel>
            <p style={{ color: S.text, fontSize: 14 }}>All edits save to localStorage key: <code style={{ color: S.green }}>{LS_KEY}</code></p>
            <p style={{ color: S.muted, fontSize: 13 }}>{callLogs.length} call{callLogs.length !== 1 ? "s" : ""} logged.</p>
          </Card>
          <Card>
            <SLabel color={S.orange}>Reset to Defaults</SLabel>
            <p style={{ color: S.muted, fontSize: 13, marginBottom: 12 }}>Restores original script and objection library. Call logs are preserved.</p>
            <Btn onClick={onReset} color={S.orange} variant="outline">Reset Script + Objections to Defaults</Btn>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ─── Passcode Gate ────────────────────────────────────────────────────────── */
function PasscodeGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const attempt = () => {
    if (value.trim() === PASSCODE) {
      localStorage.setItem("sm_sales_gate", "1");
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };
  return (
    <div style={{ minHeight: "100vh", background: S.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: S.card, border: `1px solid ${S.border}`, borderRadius: 16, padding: "44px 52px", maxWidth: 380, width: "90%", textAlign: "center" }}>
        <div style={{ color: S.green, fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Smartemark</div>
        <div style={{ color: S.muted, fontSize: 13, marginBottom: 28 }}>Internal Sales Tool</div>
        <input
          type="password"
          placeholder="Enter passcode"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && attempt()}
          style={{ ...baseInput, fontSize: 15, padding: "11px 14px", border: `1px solid ${error ? S.red : S.border}`, marginBottom: 10, marginTop: 0 }}
        />
        {error && <div style={{ color: S.red, fontSize: 13, marginBottom: 8 }}>Incorrect passcode.</div>}
        <button onClick={attempt} style={{ width: "100%", background: S.green, color: "#fff", border: "none", borderRadius: 8, padding: 12, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Enter</button>
      </div>
    </div>
  );
}

/* ─── Main SalesAssistant page ─────────────────────────────────────────────── */
export default function SalesAssistant() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("sm_sales_gate") === "1");
  const [activeTab, setActiveTab] = useState("live");
  const [adminMode, setAdminMode] = useState(false);
  const [data, setData] = useState(() => mergeWithDefaults(loadLS()));

  const persist = useCallback((next) => {
    setData(next);
    saveLS(next);
  }, []);

  const updateScript = useCallback((key, value) => {
    setData((prev) => {
      const next = { ...prev, script: { ...prev.script, [key]: value } };
      saveLS(next);
      return next;
    });
  }, []);

  const updateObjections = useCallback((next) => {
    setData((prev) => {
      const d = { ...prev, objections: next };
      saveLS(d);
      return d;
    });
  }, []);

  const saveCall = useCallback((entry) => {
    setData((prev) => {
      const d = { ...prev, callLogs: [...prev.callLogs, entry] };
      saveLS(d);
      return d;
    });
  }, []);

  const clearCalls = useCallback(() => {
    if (!window.confirm("Clear all call logs?")) return;
    setData((prev) => { const d = { ...prev, callLogs: [] }; saveLS(d); return d; });
  }, []);

  const resetToDefaults = useCallback(() => {
    if (!window.confirm("Reset script and objections to defaults? Call logs will be preserved.")) return;
    setData((prev) => {
      const d = { ...prev, script: DEFAULT_SCRIPT, objections: DEFAULT_OBJECTIONS };
      saveLS(d);
      return d;
    });
  }, []);

  const lock = () => { localStorage.removeItem("sm_sales_gate"); setUnlocked(false); };

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const tabs = [
    { id: "live", label: "Live Call" },
    { id: "script", label: "Script" },
    { id: "objections", label: "Objections" },
    { id: "calllog", label: "Call Log" },
    { id: "admin", label: "Admin" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: S.bg, fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: S.green, fontSize: 18, fontWeight: 900, letterSpacing: -0.5 }}>Smartemark</span>
            <span style={{ color: "#fff", fontSize: 15, fontWeight: 700 }}>Sales Assistant</span>
            <Badge>Internal Tool</Badge>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => setAdminMode((p) => !p)} style={{ background: adminMode ? S.purple + "22" : "transparent", color: adminMode ? S.purple : S.muted, border: `1px solid ${adminMode ? S.purple + "55" : S.border}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: adminMode ? 700 : 400 }}>
              {adminMode ? "Admin ON" : "Admin Mode"}
            </button>
            <button onClick={lock} style={{ background: "transparent", color: S.red, border: `1px solid ${S.red}44`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>Lock</button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: S.surface, borderBottom: `1px solid ${S.border}`, padding: "0 24px" }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex" }}>
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{ background: "none", border: "none", borderBottom: `2px solid ${activeTab === t.id ? S.green : "transparent"}`, color: activeTab === t.id ? S.green : S.muted, padding: "14px 20px", fontSize: 14, fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "22px 24px 60px" }}>
        {activeTab === "live" && (
          <LiveCallTab objections={data.objections} callLogs={data.callLogs} onSaveCall={saveCall} />
        )}
        {activeTab === "script" && <ScriptTab script={data.script} />}
        {activeTab === "objections" && (
          <ObjectionsTab objections={data.objections} adminMode={adminMode} onChange={updateObjections} />
        )}
        {activeTab === "calllog" && (
          <CallLogTab callLogs={data.callLogs} onSave={saveCall} onClear={clearCalls} />
        )}
        {activeTab === "admin" && (
          <AdminTab data={data} onScriptChange={updateScript} onObjectionsChange={updateObjections} onReset={resetToDefaults} />
        )}
      </div>
    </div>
  );
}
