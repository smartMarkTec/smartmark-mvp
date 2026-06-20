/* eslint-disable */
/**
 * InlineAdAgent — Claude/ChatGPT-style AI campaign creation inside CampaignSetup.
 *
 * Primary UX: open chat. No button wizard. User types, AI responds.
 * Generation uses shared helpers from src/lib/creativeGeneration.js.
 *
 * Typing bug fixed: InputBox is a module-level memo'd component,
 * never recreated on parent re-render → no focus loss.
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaPaperPlane, FaRobot } from "react-icons/fa";
import {
  buildIntakeAnswers,
  fetchAdCopy,
  fetchAdImage,
  generateCreativeSet,
  normalizeAdCopy,
  parseBudget,
  saveCreativeDraft,
  suggestCampaignName,
} from "../lib/creativeGeneration";

/* ─── Design tokens ─────────────────────────────────────────────────────── */
const FONT    = "'Inter','Poppins','Segoe UI',Arial,sans-serif";
const ACCENT  = "#5d59ea";
const TEXT    = "#0f172a";
const SOFT    = "#6b7280";
const AI_BG   = "#f3f4f6";
const USER_BG = "#111827";
const BORDER  = "rgba(0,0,0,0.08)";

const ANGLES = [
  { id: "offer",   label: "Offer Angle",      hint: "Lead with special offer" },
  { id: "problem", label: "Problem Angle",     hint: "Lead with customer pain" },
  { id: "trust",   label: "Local Trust Angle", hint: "Lead with local expertise" },
  { id: "urgency", label: "Urgency Angle",      hint: "Lead with time-sensitive action" },
];
function getAngles(n) { return ANGLES.slice(0, Math.min(n, 4)); }

const GEN_MSGS = [
  "Thinking through the best campaign angle…",
  "Writing the first ad…",
  "Generating offer-driven visual…",
  "Generating problem-driven visual…",
  "Generating local trust visual…",
  "Finalizing your creative set…",
  "Saving your creatives…",
];

/* ─── Sub-components (module-level — never recreated on parent re-render) ─ */

/** CRITICAL: defined outside InlineAdAgent so React always sees the same type. */
const InputBox = memo(function InputBox({ value, onChange, onKeyDown, onSubmit, disabled, large }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", width: "100%", maxWidth: large ? 680 : "100%" }}>
      <textarea
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={disabled ? "Working on it…" : "Ask me to create, change, or launch your campaign…"}
        disabled={disabled}
        rows={large ? 2 : 1}
        style={{
          flex: 1, padding: large ? "16px 20px" : "12px 16px",
          border: "1px solid " + BORDER,
          borderRadius: large ? 18 : 14,
          fontSize: large ? 16 : 14,
          fontFamily: FONT, resize: "none", outline: "none",
          background: large ? "#fff" : "#f8f9fa",
          color: TEXT, lineHeight: 1.55,
          maxHeight: 140, overflowY: "auto",
          boxShadow: large ? "0 4px 24px rgba(0,0,0,0.08)" : "none",
          transition: "box-shadow 0.15s",
        }}
        onInput={(e) => {
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!value.trim() || disabled}
        style={{
          width: large ? 52 : 44, height: large ? 52 : 44,
          borderRadius: 14, border: "none", flexShrink: 0,
          background: value.trim() && !disabled ? ACCENT : "#e5e7eb",
          cursor: value.trim() && !disabled ? "pointer" : "not-allowed",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.12s",
        }}
      >
        <FaPaperPlane style={{ color: value.trim() && !disabled ? "#fff" : "#9ca3af", fontSize: large ? 17 : 14 }} />
      </button>
    </div>
  );
});

function Chip({ label, onClick, primary }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: 20, cursor: "pointer",
      border: primary ? "none" : "1px solid " + BORDER,
      background: primary ? ACCENT : "#fff",
      color: primary ? "#fff" : SOFT,
      fontSize: 13, fontWeight: 600, fontFamily: FONT,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      transition: "all 0.1s",
    }}>{label}</button>
  );
}

function Md({ text }) {
  if (!text) return null;
  return (
    <span>
      {String(text).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p.split("\n").map((ln, j) =>
              j === 0
                ? <React.Fragment key={`${i}-${j}`}>{ln}</React.Fragment>
                : <React.Fragment key={`${i}-${j}`}><br />{ln}</React.Fragment>
            )
      )}
    </span>
  );
}

function CreativeCard({ c, expanded, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      flex: "0 0 195px", maxWidth: 195,
      background: "#fff", borderRadius: 16, overflow: "hidden",
      border: expanded ? `2px solid ${ACCENT}` : "1px solid #e8eaf0",
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
      cursor: "pointer", transition: "border 0.12s",
    }}>
      {c.imageUrl ? (
        <img src={c.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <div style={{ aspectRatio: "1/1", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 26 }}>
          <FaRobot />
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "inline-block", background: "#eef2ff", color: ACCENT, fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "2px 7px", marginBottom: 5 }}>
          {c.angleLabel}
        </div>
        <div style={{ fontWeight: 800, fontSize: 12, color: c.headline ? TEXT : "#ef4444", lineHeight: 1.3, marginBottom: 3 }}>
          {c.headline || "⚠ generation incomplete"}
        </div>
        {expanded ? (
          <>
            <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.5, marginBottom: 4 }}>{c.body}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>CTA: {c.cta}</div>
            {c.link && <div style={{ fontSize: 10, color: SOFT, marginTop: 2, wordBreak: "break-all" }}>{c.link}</div>}
          </>
        ) : (
          <div style={{ fontSize: 11, color: SOFT }}>
            {(c.body || "").slice(0, 55)}{(c.body || "").length > 55 ? "…" : ""}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>{expanded ? "▲ collapse" : "▼ expand"}</div>
      </div>
    </div>
  );
}

function CreativeCarousel({ creatives }) {
  const [exp, setExp] = useState(0);
  const ref = useRef(null);
  return (
    <div>
      {creatives.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <button onClick={() => ref.current?.scrollBy({ left: -210, behavior: "smooth" })}
            style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 }}>
            <FaChevronLeft />
          </button>
          <span style={{ fontSize: 12, color: SOFT, fontWeight: 600 }}>{creatives.length} ads</span>
          <button onClick={() => ref.current?.scrollBy({ left: 210, behavior: "smooth" })}
            style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 }}>
            <FaChevronRight />
          </button>
        </div>
      )}
      <div ref={ref} style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
        {creatives.map((c, i) => (
          <CreativeCard key={c.id || i} c={c} expanded={exp === i} onToggle={() => setExp(exp === i ? -1 : i)} />
        ))}
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,
  selectedCampaignId,
  onCreativesGenerated,
  onGoToCreatives,
  onGoToCampaign,
  onSetBudget,
  onSetCampaignName,
}) {
  // Ref tracks latest clientInfo — prevents stale closure in async generation
  const clientRef = useRef(adminClientInfo);
  useEffect(() => { clientRef.current = adminClientInfo; }, [adminClientInfo]);

  const [msgs,       setMsgs]      = useState([]);
  const [input,      setInput]     = useState("");
  const [sending,    setSending]   = useState(false);
  const [generating, setGenerating]= useState(false);
  const [genMsg,     setGenMsg]    = useState("");
  const [phase,      setPhase]     = useState("init");
  const [pendingN,   setPendingN]  = useState(null);
  const [creatives,  setCreatives] = useState([]);
  const [ctx,        setCtx]       = useState(null);  // enriched intake context

  const bottomRef = useRef(null);
  const timerRef  = useRef(null);
  const loaded    = useRef(false);

  const push = useCallback(
    (m) => setMsgs((p) => [...p, { _k: Date.now() + Math.random(), ...m }]),
    []
  );
  const scroll = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  /* ─── Load on first render ─────────────────────────────────────────────── */
  useEffect(() => {
    if (loaded.current) return;
    if (!adminClientId && !adminClientInfo) return;
    loaded.current = true;
    initialLoad();
  // eslint-disable-next-line
  }, [adminClientId, adminClientInfo]);

  async function initialLoad() {
    setPhase("loading");
    let ctxRecord = null;
    try {
      const url = adminClientId
        ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
        : "/api/campaign-context";
      const r = await fetch(url, { credentials: "include", headers: { ...(getSid()) } });
      const j = await r.json().catch(() => ({}));
      if (j.ok) ctxRecord = j.context;
    } catch {}

    const ci  = clientRef.current;
    const biz = ci?.premiumIntake?.businessName || ctxRecord?.businessName || ci?.displayName || adminClientId?.split("@")[0] || "there";
    const enriched = {
      ...(ctxRecord || {}),
      _biz: biz,
      _offer:   ci?.premiumIntake?.currentSpecialOrOffer || ctxRecord?.offer    || "",
      _service: ci?.premiumIntake?.mainServices          || ctxRecord?.industry  || "",
    };
    setCtx(enriched);

    // Try to restore saved draft
    let restored = false;
    try {
      const url = adminClientId
        ? `/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`
        : "/api/campaign-context/creative-draft";
      const r = await fetch(url, { credentials: "include", headers: { ...(getSid()) } });
      const j = await r.json().catch(() => ({}));
      if (j.ok && j.creativeDraft?.creativeSet?.length) {
        const saved = j.creativeDraft;
        setCreatives(saved.creativeSet);
        onCreativesGenerated?.({ images: saved.images || [], creativeSet: saved.creativeSet, creativeTestCount: saved.creativeSet.length });
        if (saved.campaignName) onSetCampaignName?.(saved.campaignName);
        if (saved.budget) onSetBudget?.(saved.budget);
        push({ role: "assistant", content: `Welcome back! I found your **${saved.creativeSet.length} saved creatives** from last time.` });
        push({ role: "assistant", type: "chips", chips: [
          { label: "View Creatives", action: "go-creatives" },
          { label: "Campaign & Launch →", action: "go-campaign", primary: true },
          { label: "Generate new set", action: "regen" },
        ]});
        setPhase("done");
        scroll();
        restored = true;
      }
    } catch {}

    if (!restored) {
      setPhase("welcome");
    }
  }

  function getSid() {
    const s = (localStorage.getItem("sm_sid_v1") || "").trim();
    return s ? { "x-sm-sid": s } : {};
  }

  /* ─── Generation status rotation ─────────────────────────────────────── */
  function startGenStatus(angleList) {
    let i = 0;
    setGenMsg(GEN_MSGS[0]);
    timerRef.current = setInterval(() => {
      i = (i + 1) % GEN_MSGS.length;
      setGenMsg(GEN_MSGS[i]);
    }, 2200);
  }
  function stopGenStatus() { clearInterval(timerRef.current); setGenMsg(""); }

  /* ─── Intent detection ────────────────────────────────────────────────── */
  function detectIntent(txt) {
    const t = txt.toLowerCase().trim();
    const nm = t.match(/\b([1-4])\b/);
    const n  = nm ? parseInt(nm[1]) : null;

    if (/\byes\b|generate\s*now|do\s*it|go\s*ahead|confirm|sounds\s*good|let'?s\s*go|ok\b|okay\b/i.test(t)) return { type: "confirm" };
    if (/generat|creat|make|build/i.test(t) && n) return { type: "count", n };
    if (/generat|creat|make.*campaign|build.*campaign|start.*campaign/i.test(t)) return { type: "create" };
    if (/budget|spend|per day|\$\d/i.test(t)) {
      const b = parseBudget(t);
      if (b) return { type: "budget", value: b };
    }
    if (/view.*creative|show.*creative|creative.*tab/i.test(t)) return { type: "go-creatives" };
    if (/campaign.*tab|go.*campaign|launch|review.*campaign/i.test(t)) return { type: "go-campaign" };
    if (/metrics|how.*doing|performance|results|stats/i.test(t)) return { type: "metrics" };
    if (/recommend|strateg|suggest|what.*should|best.*approach/i.test(t)) return { type: "strategy" };
    if (/change|different|regen|start\s*over|try\s*again/i.test(t)) return { type: "regen" };
    return { type: "llm" };
  }

  /* ─── Chat actions ───────────────────────────────────────────────────── */
  function doAction(action) {
    if (action === "go-creatives")  { onGoToCreatives?.(); return; }
    if (action === "go-campaign")   { onGoToCampaign?.();  return; }
    if (action === "confirm")       { if (pendingN) startGeneration(pendingN); return; }
    if (action === "regen")         { askHowMany(); return; }
    if (action.startsWith("count-")) { askConfirm(parseInt(action.replace("count-", ""))); return; }
  }

  function askHowMany() {
    push({ role: "assistant", type: "count-pick",
      content: "How many ad creatives do you want to test?" });
    setPhase("count-pick"); scroll();
  }

  function askConfirm(n) {
    setPendingN(n);
    const lines = getAngles(n).map((a) => `  • ${a.label} — ${a.hint}`).join("\n");
    push({ role: "assistant", type: "chips",
      content: `A **${n}-ad creative test**, each with a unique image and copy:\n${lines}\n\nReady to generate?`,
      chips: [
        { label: "Yes, generate now", action: "confirm", primary: true },
        { label: "Change count", action: "regen" },
      ],
    });
    setPhase("confirm"); scroll();
  }

  // Uses LLM for strategy recommendation — hardcoded text is fallback only
  async function respondWithStrategy() {
    setPhase("chat");
    setSending(true);
    scroll();

    const ci      = clientRef.current;
    const pi      = ci?.premiumIntake || {};
    const biz     = ctx?._biz     || pi.businessName  || "your business";
    const offer   = ctx?._offer   || pi.currentSpecialOrOffer || "";
    const service = ctx?._service || pi.mainServices  || "";
    const area    = pi.serviceArea || ctx?.serviceArea || "";
    const url     = pi.websiteUrl  || ctx?.websiteUrl  || "";

    // Build a focused prompt that includes all intake context
    const prompt = [
      `You are a Meta ads expert and campaign strategist for Smartemark.`,
      `The client is: ${biz}.`,
      service  ? `Main service: ${service}.`             : "",
      offer    ? `Current offer: ${offer}.`              : "",
      area     ? `Service area: ${area}.`                : "",
      url      ? `Landing page: ${url}.`                 : "",
      `Important: the only supported campaign objective right now is website traffic (driving visitors to the landing page). Do not suggest other objectives.`,
      `In 2–4 sentences, recommend a campaign strategy and creative testing plan. Suggest a 3-ad creative angle test (offer, problem/pain, local trust) as the recommended first test. Be concise and operator-like — no fluff.`,
      `End by asking if they want to generate the 3 ads.`,
    ].filter(Boolean).join(" ");

    let rec = null;
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
        body: JSON.stringify({
          message: prompt, history: [],
          ...(adminClientId ? { adminClientId } : {}),
          ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.reply) rec = j.reply;
    } catch {}

    // Fallback if LLM fails
    if (!rec) {
      const offerLine = offer ? `the **${offer}** offer` : "your best offer";
      rec = `For **${biz}**, I recommend a **website traffic campaign** focused on driving qualified visitors to your landing page and testing which message gets the best clicks.\n\nFor the creative strategy, I suggest a 3-ad angle test: one leading with ${offerLine}, one speaking to the customer's pain point, and one focused on local trust — all inside one campaign and one ad set. The 3-ad test gives enough variation to learn what works without spreading the budget too thin.\n\nWould you like me to generate the 3 ads?`;
    }

    setSending(false);
    push({ role: "assistant", content: rec });
    push({ role: "assistant", type: "chips",
      content: null,
      chips: [
        { label: "Generate 3 ads (recommended)", action: "count-3", primary: true },
        { label: "Choose count", action: "regen" },
      ],
    });
    scroll();
  }

  /* ─── Generation ─────────────────────────────────────────────────────── */
  async function startGeneration(n) {
    setPhase("generating"); setGenerating(true);
    const angleList = getAngles(n);
    startGenStatus(angleList);
    scroll();

    const ci      = clientRef.current;
    const answers = buildIntakeAnswers(ci, ctx || {});

    let newCreatives = [];
    try {
      newCreatives = await generateCreativeSet(
        angleList,
        answers,
        (angle) => setGenMsg(`Generating ${angle.label.toLowerCase()} visual…`)
      );
    } catch (e) {
      console.warn("[INLINE_AGENT] generation error:", e?.message);
    }

    stopGenStatus(); setGenerating(false);

    const hasContent = newCreatives.some((c) => String(c.headline || "").trim() || String(c.body || "").trim());
    if (!hasContent) {
      push({ role: "assistant", content: "⚠️ Generation failed — no ad copy was returned. Check that the client intake has a business name and service description, then try again." });
      push({ role: "assistant", type: "chips", chips: [
        { label: "Try again", action: `count-${n}`, primary: true },
      ]});
      setPhase("chat"); return;
    }

    // Log duplicate images warning
    const imgUrls = newCreatives.map((c) => c.imageUrl).filter(Boolean);
    if (imgUrls.length > 1 && new Set(imgUrls).size < imgUrls.length) {
      console.warn("[INLINE_AGENT_DUPLICATE_IMAGES]", imgUrls);
    }

    console.log("[INLINE_AGENT_GENERATE_SUCCESS]", {
      count: newCreatives.length,
      headlines: newCreatives.map((c) => c.headline || "(empty)"),
      hasImages: newCreatives.filter((c) => c.imageUrl).length,
    });

    setCreatives(newCreatives);
    const images = newCreatives.map((c) => c.imageUrl).filter(Boolean);
    onCreativesGenerated?.({ images, creativeSet: newCreatives, creativeTestCount: n });

    // Suggest campaign name
    const suggestedName = suggestCampaignName(ci, ctx, n);
    onSetCampaignName?.(suggestedName);

    // Save to backend
    const strategy = {
      type: "creative_angle_test", creativeCount: n,
      recommendedDurationDays: 7, structure: "1 campaign, 1 ad set, multiple ads",
      angles: angleList.map((a) => a.id),
      decisionRules: [
        "Do not judge before enough impressions/clicks",
        "After 7 days, compare CTR, CPC, spend, and link clicks",
        "Pause weakest ads if winner is clear",
        "Keep winner and generate a challenger",
      ],
    };
    const draftPayload = {
      creativeSet: newCreatives, images,
      campaignName: suggestedName,
      headline: newCreatives[0]?.headline || "", body: newCreatives[0]?.body || "",
      link: answers.url, answers, initialTestStrategy: strategy,
      savedAt: Date.now(), status: "draft",
    };
    const saveRes = await saveCreativeDraft(adminClientId, draftPayload);
    console.log("[INLINE_AGENT_DRAFT_SAVE]", { ok: saveRes?.ok });

    // Show creatives in chat
    push({ role: "assistant", type: "creatives",
      content: `Here are your **${n} ad concepts** — each has a unique image and copy:`,
      creatives: newCreatives });

    // Ask for budget
    push({ role: "assistant", type: "chips",
      content: `Creatives are saved ✓\n\nWhat **daily budget** do you want to start with? (Minimum $3/day is recommended for testing ${n} ads.)`,
      chips: [
        { label: "$3/day", action: "budget-3" },
        { label: "$5/day", action: "budget-5", primary: true },
        { label: "$10/day", action: "budget-10" },
      ],
    });
    setPhase("budget"); scroll();
  }

  /* ─── Send typed message ─────────────────────────────────────────────── */
  async function send(overrideText) {
    const txt = typeof overrideText === "string" ? overrideText : input.trim();
    if (!txt || sending || generating) return;

    setInput("");
    if (phase === "welcome") setPhase("chat");
    push({ role: "user", content: txt });
    scroll();

    const it = detectIntent(txt);

    // Budget-specific handling
    if (it.type === "budget" || phase === "budget") {
      const b = parseBudget(txt);
      if (b) {
        onSetBudget?.(b);
        const suggestedName = suggestCampaignName(clientRef.current, ctx, creatives.length);
        push({ role: "assistant", type: "chips",
          content: `Got it — **$${b}/day** budget.\n\nI've set the campaign name to **${suggestedName}**. Here's what's ready:\n  • Campaign: ${suggestedName}\n  • Budget: $${b}/day\n  • ${creatives.length} ads: ${getAngles(creatives.length).map(a => a.label).join(", ")}\n\nWant to review and launch?`,
          chips: [
            { label: "Review & Launch →", action: "go-campaign", primary: true },
            { label: "View Creatives", action: "go-creatives" },
          ],
        });
        setPhase("done"); scroll();
        return;
      }
    }

    // Budget chip shortcuts
    if (it.type === "confirm" && pendingN) { startGeneration(pendingN); return; }
    if (it.type === "count")               { askConfirm(it.n); return; }
    if (it.type === "create")              { respondWithStrategy(); return; }  // async, fire-and-forget
    if (it.type === "strategy")            { respondWithStrategy(); return; }  // async, fire-and-forget
    if (it.type === "go-creatives")        { push({ role: "assistant", content: "Switching to Creatives!" }); setTimeout(() => onGoToCreatives?.(), 400); return; }
    if (it.type === "go-campaign")         { push({ role: "assistant", content: "Heading to Campaign!" }); setTimeout(() => onGoToCampaign?.(), 400); return; }
    if (it.type === "regen")               { askHowMany(); return; }
    if (it.type === "metrics") {
      push({ role: "assistant", content: selectedCampaignId && selectedCampaignId !== "__DRAFT__"
        ? "Let me check your metrics — ask me 'how is my campaign doing?' and I'll pull the numbers."
        : "No active campaign found yet. Generate creatives and launch one first!" });
      return;
    }

    // LLM fallback
    setSending(true);
    try {
      const sid = localStorage.getItem("sm_sid_v1") || "";
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
        body: JSON.stringify({
          message: txt,
          history: msgs.slice(-8).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
          ...(adminClientId ? { adminClientId } : {}),
          ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      push({ role: "assistant", content: j?.reply || "Something went wrong. Try again." });
    } catch {
      push({ role: "assistant", content: "Something went wrong. Try again." });
    } finally { setSending(false); scroll(); }
  }

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* ─── Render helpers ─────────────────────────────────────────────────── */
  function renderMsg(m) {
    const isAI = m.role === "assistant";
    return (
      <div key={m._k} style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end", marginBottom: 14 }}>
        <div style={{ maxWidth: m.type === "creatives" ? "100%" : "80%", display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end", gap: 7 }}>
          {isAI && m.content && (
            <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "12px 16px", color: TEXT, fontSize: 14, lineHeight: 1.65 }}>
              <Md text={m.content} />
            </div>
          )}
          {m.type === "creatives" && m.creatives?.length > 0 && (
            <div style={{ width: "100%", marginTop: 4 }}>
              <CreativeCarousel creatives={m.creatives} />
            </div>
          )}
          {m.type === "count-pick" && phase === "count-pick" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[1,2,3,4].map((n) => (
                <Chip key={n} label={`${n} ad${n>1?"s":""}${n===3?" ✓":""}`} primary={n===3}
                  onClick={() => { push({ role: "user", content: `${n} ad${n>1?"s":""}` }); askConfirm(n); }} />
              ))}
            </div>
          )}
          {m.type === "chips" && m.chips && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {m.chips.map((c) => (
                <Chip key={c.label} label={c.label} primary={c.primary}
                  onClick={() => {
                    // Budget chip shortcuts
                    if (c.action.startsWith("budget-")) {
                      const b = parseFloat(c.action.replace("budget-", ""));
                      push({ role: "user", content: `$${b}/day` });
                      send(`$${b}/day`);
                      return;
                    }
                    push({ role: "user", content: c.label });
                    doAction(c.action);
                  }} />
              ))}
            </div>
          )}
          {!isAI && (
            <div style={{ background: USER_BG, borderRadius: "18px 18px 4px 18px", padding: "12px 16px", color: "#fff", fontSize: 14, lineHeight: 1.65 }}>
              {m.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Layout ────────────────────────────────────────────────────────── */
  const inputDisabled = sending || generating;
  const showTopNav    = phase === "done" || creatives.length > 0;
  const biz           = ctx?._biz || "";

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 130px)", minHeight: 480,
      fontFamily: FONT, background: "#fff",
      border: "1px solid " + BORDER, borderRadius: 20,
      overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{ padding: "13px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, background: "#fff" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FaRobot style={{ color: "#fff", fontSize: 15 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>AI Ad Agent</div>
          <div style={{ fontSize: 11, color: SOFT }}>
            {generating ? genMsg :
             phase === "done" ? `${creatives.length} creatives ready` :
             "Smartemark campaign brain"}
          </div>
        </div>
        {showTopNav && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onGoToCreatives} style={hdrBtn("#f1f5f9", TEXT)}>Creatives</button>
            <button onClick={onGoToCampaign}  style={hdrBtn(ACCENT, "#fff")}>Launch →</button>
          </div>
        )}
      </div>

      {/* Welcome — Claude-style centered blank slate */}
      {(phase === "welcome" || phase === "loading" || phase === "init") && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 40px", background: "#fafafa" }}>
          {phase === "loading" || phase === "init" ? (
            <div style={{ color: SOFT, fontSize: 14 }}>Loading your intake…</div>
          ) : (
            <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#eef2ff,#e0e7ff)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 22px", fontSize: 24, color: ACCENT }}>
                <FaRobot />
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: "0 0 8px", lineHeight: 1.25 }}>
                {biz ? `Hey — ready to create your campaign for ${biz}? 👋` : "Hey — ready to create your campaign? 👋"}
              </h2>
              <p style={{ color: SOFT, fontSize: 14, lineHeight: 1.7, margin: "0 0 30px", maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
                I have your intake details. Tell me what you'd like to do and I'll recommend a strategy, generate creatives, and help you launch.
              </p>
              {/* Large Claude-style input box */}
              <InputBox
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                onSubmit={() => send()}
                disabled={inputDisabled}
                large={true}
              />
              {/* Subtle suggestion chips — clicking fills input */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
                {[
                  "I want to create a campaign.",
                  "What do you recommend?",
                  "Show my current creatives.",
                  "How are my metrics?",
                ].map((s) => (
                  <button key={s} onClick={() => { setInput(s); }}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "1px solid " + BORDER, background: "#fff", color: SOFT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat thread */}
      {phase !== "welcome" && phase !== "loading" && phase !== "init" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", background: "#fafafa" }}>
            {msgs.map(renderMsg)}
            {generating && (
              <div style={{ display: "flex", marginBottom: 14 }}>
                <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "12px 16px", color: SOFT, fontSize: 14, fontStyle: "italic" }}>
                  ⟳ {genMsg}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          {/* Sticky bottom input */}
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 22px 16px", background: "#fff" }}>
            <InputBox
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              onSubmit={() => send()}
              disabled={inputDisabled}
              large={false}
            />
          </div>
        </>
      )}
    </div>
  );
}

const hdrBtn = (bg, color) => ({
  padding: "6px 14px", borderRadius: 8, border: "none",
  background: bg, color, fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: FONT,
});
