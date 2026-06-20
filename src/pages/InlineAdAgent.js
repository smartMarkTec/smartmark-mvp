/* eslint-disable */
/**
 * InlineAdAgent — AI Ad Agent rendered as a tab inside CampaignSetup.
 * No fullscreen modal. ChatGPT-style layout.
 *
 * Bug fixes in this version:
 *  1. adminClientInfo is tracked in a useRef to fix stale closure in generation
 *  2. Waits for adminClientInfo to be non-null before loading context
 *  3. Approval-based flow: recommend → choose count → confirm → generate
 *  4. Rotating "thinking" status messages during generation
 *  5. LLM recommendation via /api/ad-agent/chat
 *  6. Draft save passes valid payload even when image generation fails
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaPaperPlane, FaRobot, FaCheck } from "react-icons/fa";

/* ── Design tokens ─────────────────────────────────────────────────────────── */
const FONT   = "'Inter','Poppins','Segoe UI',Arial,sans-serif";
const ACCENT = "#5d59ea";
const TEXT   = "#0f172a";
const SOFT   = "#64748b";
const AI_BG  = "#f1f5f9";
const USER_BG = "#111827";

/* ── Creative angle definitions ────────────────────────────────────────────── */
const ANGLES = [
  { id: "offer",   label: "Offer Angle",       hint: "Focus on the specific offer or promotion" },
  { id: "problem", label: "Problem Angle",      hint: "Focus on the customer pain point"         },
  { id: "trust",   label: "Local Trust Angle",  hint: "Focus on local expertise and reliability" },
  { id: "urgency", label: "Urgency Angle",       hint: "Focus on immediate action"               },
];
function getAngles(n) { return ANGLES.slice(0, Math.min(n, 4)); }

/* ── Rotating status messages during generation ─────────────────────────────── */
const STATUS_MSGS = [
  "Thinking through the best angles for your business…",
  "Drafting campaign concepts…",
  "Refining the copy for each angle…",
  "Calibrating the campaign direction…",
  "Generating visuals…",
  "Assembling your ad set…",
  "Reviewing headline strength…",
  "Saving your creatives…",
];

/* ── API helpers ────────────────────────────────────────────────────────────── */
function sidHdr() {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  return { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) };
}

async function apiPost(path, body) {
  const r = await fetch(path, { method: "POST", credentials: "include", headers: sidHdr(), body: JSON.stringify(body) });
  return r.json().catch(() => ({}));
}

async function apiGet(path) {
  const r = await fetch(path, { credentials: "include", headers: sidHdr() });
  return r.json().catch(() => ({}));
}

async function fetchCopy(answers, angle) {
  return apiPost("/api/summarize-ad-copy", { answers, angle });
}

async function fetchImage(answers, copy) {
  const j = await apiPost("/api/generate-static-ad", {
    template: "poster_b",
    regenerateToken: `agent-${Date.now()}`,
    url: answers.url || "", website: answers.url || "",
    answers: { ...answers },
    copy: { headline: copy?.headline || "", subline: copy?.subline || copy?.body || "", cta: copy?.cta || "Learn more" },
  });
  return j?.urls?.[0] || null;
}

async function getIntakeContext(adminClientId) {
  const url = adminClientId
    ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
    : "/api/campaign-context";
  const j = await apiGet(url);
  return j.ok ? j.context : null;
}

async function getLLMRecommendation(adminClientId, selectedCampaignId, bizName, offer, service) {
  const msg = `Based on the client intake for ${bizName || "this business"}, recommend a creative testing strategy for their first campaign. ${offer ? `They have an offer: ${offer}. ` : ""}${service ? `Their main service is ${service}. ` : ""}Keep it under 60 words. Be specific, not generic.`;
  const j = await apiPost("/api/ad-agent/chat", {
    message: msg,
    history: [],
    ...(adminClientId ? { adminClientId } : {}),
    ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
  });
  return j?.reply || null;
}

async function saveBackendDraft(adminClientId, draft) {
  return apiPost("/api/campaign-context/save-creative-draft", { adminClientId, creativeDraft: draft });
}

/* ── CreativeCard ──────────────────────────────────────────────────────────── */
function CreativeCard({ c, expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        flex: "0 0 210px", maxWidth: 210, cursor: "pointer",
        background: "#fff", border: expanded ? `2px solid ${ACCENT}` : "1px solid #e2e8f0",
        borderRadius: 14, overflow: "hidden", boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
        transition: "border 0.12s",
      }}
    >
      {c.imageUrl ? (
        <img src={c.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <div style={{ aspectRatio: "1/1", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 28 }}>
          <FaRobot />
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <span style={{ display: "inline-block", background: "#eef2ff", color: ACCENT, fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "2px 7px", marginBottom: 6 }}>
          {c.angleLabel}
        </span>
        <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, lineHeight: 1.3, marginBottom: 4 }}>
          {c.headline || <span style={{ color: "#f87171" }}>generation incomplete</span>}
        </div>
        {expanded ? (
          <>
            <div style={{ fontSize: 12, color: SOFT, lineHeight: 1.5, marginBottom: 4 }}>{c.body}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>CTA: {c.cta}</div>
            {c.link && <div style={{ fontSize: 10, color: SOFT, marginTop: 2 }}>{c.link}</div>}
          </>
        ) : (
          <div style={{ fontSize: 11, color: SOFT }}>
            {(c.body || "").slice(0, 55)}{(c.body || "").length > 55 ? "…" : ""}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 6 }}>{expanded ? "▲ collapse" : "▼ expand"}</div>
      </div>
    </div>
  );
}

function CreativeCarousel({ creatives }) {
  const [exp, setExp] = useState(0);
  const ref = useRef(null);
  const scroll = (d) => ref.current?.scrollBy({ left: d * 230, behavior: "smooth" });
  return (
    <div style={{ width: "100%" }}>
      {creatives.length > 1 && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => scroll(-1)} style={arrowBtn}><FaChevronLeft /></button>
          <span style={{ fontSize: 12, color: SOFT, lineHeight: "28px" }}>{creatives.length} ads</span>
          <button onClick={() => scroll(1)}  style={arrowBtn}><FaChevronRight /></button>
        </div>
      )}
      <div ref={ref} style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
        {creatives.map((c, i) => (
          <CreativeCard key={c.id || i} c={c} expanded={exp === i} onToggle={() => setExp(exp === i ? -1 : i)} />
        ))}
      </div>
    </div>
  );
}

const arrowBtn = {
  width: 28, height: 28, border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff",
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11,
};

/* ── Markdown-lite renderer ─────────────────────────────────────────────────── */
function Md({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p.split("\n").map((line, j) =>
              j === 0
                ? <React.Fragment key={`${i}-${j}`}>{line}</React.Fragment>
                : <React.Fragment key={`${i}-${j}`}><br />{line}</React.Fragment>
            )
      )}
    </span>
  );
}

/* ── Action button row ──────────────────────────────────────────────────────── */
function ActionRow({ actions, onAction }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      {actions.map((a) => (
        <button key={a.id} onClick={() => onAction(a.id)} style={{
          padding: "7px 14px", borderRadius: 8,
          border: a.primary ? "none" : "1px solid #e2e8f0",
          background: a.primary ? ACCENT : "#fff",
          color: a.primary ? "#fff" : TEXT,
          fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: FONT,
        }}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,        // may arrive null then update — use ref
  selectedCampaignId,
  onCreativesGenerated,   // (payload) => void
  onGoToCreatives,        // () => void
  onGoToCampaign,         // () => void
}) {
  // Stable ref so all async closures see the latest adminClientInfo
  const clientInfoRef = useRef(adminClientInfo);
  useEffect(() => { clientInfoRef.current = adminClientInfo; }, [adminClientInfo]);

  const [msgs,        setMsgs]        = useState([]);
  const [input,       setInput]       = useState("");
  const [sending,     setSending]     = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [statusMsg,   setStatusMsg]   = useState("");
  const [intakeCtx,   setIntakeCtx]   = useState(null);
  const [phase,       setPhase]       = useState("init");
  const [pendingCount, setPendingCount] = useState(null);
  const [creatives,   setCreatives]   = useState([]);

  const bottomRef  = useRef(null);
  const textRef    = useRef(null);
  const statusTmr  = useRef(null);
  const hasLoaded  = useRef(false);

  const push = useCallback((msg) =>
    setMsgs((prev) => [...prev, { _id: Math.random(), ...msg }]), []);

  const scrollBottom = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);

  /* ── Load context when adminClientInfo arrives ──────────────────────────── */
  useEffect(() => {
    // Wait until we have at least some client info before greeting
    if (!adminClientInfo && !adminClientId) return;
    if (hasLoaded.current) return;
    hasLoaded.current = true;
    loadAndGreet();
  // eslint-disable-next-line
  }, [adminClientInfo, adminClientId]);

  async function loadAndGreet() {
    setPhase("loading");

    // Fetch intake context from backend
    let ctx = null;
    try { ctx = await getIntakeContext(adminClientId); } catch {}
    setIntakeCtx(ctx);

    // Use ref for latest clientInfo (may have arrived between render and now)
    const ci  = clientInfoRef.current;
    const pi  = ci?.premiumIntake || {};
    const biz = pi.businessName || ctx?.businessName || ci?.displayName || adminClientId?.split("@")[0] || "";
    const offer   = pi.currentSpecialOrOffer || ctx?.offer    || "";
    const service = pi.mainServices          || ctx?.industry || "";

    // Greeting
    push({
      role: "assistant", type: "greeting",
      content: `Hey${biz ? ` — ready to create your campaign for **${biz}**` : ", ready to create your campaign"}? 👋`,
    });

    // LLM recommendation (fallback if fails)
    let rec = null;
    try {
      rec = await getLLMRecommendation(adminClientId, selectedCampaignId, biz, offer, service);
    } catch {}

    if (!rec) {
      const offerLine   = offer   ? `an offer-driven ad promoting ${offer}` : "an offer-driven ad";
      const problemLine = service ? `a problem/pain ad addressing ${service} needs` : "a problem/pain ad";
      rec = `Based on your intake${biz ? ` for **${biz}**` : ""}, I recommend starting with a 3-ad creative test: ${offerLine}, ${problemLine}, and a local trust ad — all inside one campaign and one ad set.`;
    }

    push({ role: "assistant", type: "recommendation", content: rec });
    push({
      role: "assistant", type: "actions",
      content: "What would you like to do?",
      actions: [
        { id: "generate-recommended", label: "Generate 3 recommended creatives", primary: true },
        { id: "choose-count",         label: "Choose number of creatives" },
        { id: "ask",                  label: "Ask a question" },
      ],
    });
    setPhase("awaiting-action");
    scrollBottom();
  }

  /* ── Action handler ─────────────────────────────────────────────────────── */
  function handleAction(id) {
    if (id === "generate-recommended") {
      confirmCount(3);
    } else if (id === "choose-count") {
      push({ role: "user", content: "I want to choose the number of creatives." });
      push({
        role: "assistant", type: "count-select",
        content: "How many ad creatives do you want to test?",
      });
      setPhase("count-select");
      scrollBottom();
    } else if (id === "ask") {
      push({ role: "user", content: "I have a question." });
      push({ role: "assistant", content: "Of course — what would you like to know?" });
      setPhase("chat");
      scrollBottom();
    } else if (id === "go-creatives") {
      onGoToCreatives?.();
    } else if (id === "go-campaign") {
      onGoToCampaign?.();
    } else if (id === "confirm-generate") {
      startGeneration(pendingCount || 3);
    } else if (id === "change-strategy") {
      push({ role: "user", content: "Change strategy." });
      push({
        role: "assistant", type: "actions",
        content: "No problem — what would you like to do instead?",
        actions: [
          { id: "choose-count", label: "Choose a different count" },
          { id: "ask",          label: "Ask a question" },
        ],
      });
      setPhase("awaiting-action");
      scrollBottom();
    }
  }

  function selectCount(n) {
    setPendingCount(n);
    push({ role: "user", content: `${n} ad${n > 1 ? "s" : ""}` });
    push({
      role: "assistant", type: "actions",
      content: `Great — a **${n}-ad creative test** inside one campaign and one ad set. Want me to generate those now?`,
      actions: [
        { id: "confirm-generate", label: "Generate now", primary: true },
        { id: "change-strategy",  label: "Change strategy" },
      ],
    });
    setPhase("confirm-generate");
    scrollBottom();
  }

  function confirmCount(n) {
    setPendingCount(n);
    push({ role: "user", content: `Generate ${n} recommended creatives.` });
    push({
      role: "assistant", type: "actions",
      content: `A **${n}-ad creative test** — one image, different copy per angle. Ready to go?`,
      actions: [
        { id: "confirm-generate", label: "Yes, generate now", primary: true },
        { id: "choose-count",     label: "Change count" },
      ],
    });
    setPhase("confirm-generate");
    scrollBottom();
  }

  /* ── Generation ─────────────────────────────────────────────────────────── */
  function startStatusRotation() {
    let i = 0;
    setStatusMsg(STATUS_MSGS[0]);
    statusTmr.current = setInterval(() => {
      i = (i + 1) % STATUS_MSGS.length;
      setStatusMsg(STATUS_MSGS[i]);
    }, 2200);
  }
  function stopStatusRotation() {
    clearInterval(statusTmr.current);
    setStatusMsg("");
  }

  async function startGeneration(n) {
    setPhase("generating");
    setGenerating(true);
    startStatusRotation();
    scrollBottom();

    // Always use ref for latest client data — avoids stale closure bug
    const ci  = clientInfoRef.current;
    const pi  = ci?.premiumIntake || {};
    const ctx = intakeCtx || {};
    const piUrl = pi.websiteUrl || ctx.websiteUrl || "";

    const answers = {
      businessName:  pi.businessName  || ctx.businessName  || "",
      industry:      pi.mainServices  || ctx.industry      || "",
      offer:         pi.currentSpecialOrOffer || ctx.offer  || "",
      mainBenefit:   pi.mainServices  || ctx.mainBenefit   || "",
      city:          pi.targetCities?.split(",")?.[0]?.trim() || ctx.city || "",
      state:         ctx.state        || "",
      idealCustomer: pi.idealCustomer || ctx.idealCustomer || "",
      serviceArea:   pi.serviceArea   || ctx.serviceArea   || "",
      cta:           ctx.cta          || "Learn more",
      url:           piUrl,
      websiteUrl:    piUrl,
      phone:         pi.mainPhone     || ctx.phoneNumber   || "",
    };

    console.log("[INLINE_AGENT_GENERATE_START]", {
      adminClientId, bizName: answers.businessName, industry: answers.industry, url: answers.url, n,
    });

    // 1) Generate one shared image using offer angle
    let sharedImageUrl = null;
    try {
      const offerCopy = await fetchCopy(answers, "offer");
      sharedImageUrl  = await fetchImage(answers, offerCopy);
    } catch (e) { console.warn("[INLINE_AGENT] image gen failed:", e?.message); }

    // 2) Generate copy for each angle (parallel where possible)
    const angleList = getAngles(n);
    const copyResults = await Promise.allSettled(
      angleList.map((a) => fetchCopy(answers, a.id))
    );

    const newCreatives = angleList.map((angle, i) => {
      const copy = copyResults[i].status === "fulfilled" ? copyResults[i].value : {};
      return {
        id:            `c-${angle.id}-${Date.now()}-${i}`,
        angle:         angle.id,
        angleLabel:    angle.label,
        headline:      (copy?.headline || "").slice(0, 55),
        body:          copy?.subline || copy?.body || "",
        cta:           copy?.cta || answers.cta,
        imageUrl:      sharedImageUrl || "",
        link:          piUrl,
        mediaSelection:"image",
        creativeSource:"ai_agent",
        status:        "draft",
      };
    });

    stopStatusRotation();
    setGenerating(false);

    // Check whether generation actually produced real content
    const hasRealContent = newCreatives.some(
      (c) => String(c.headline || "").trim() || String(c.body || "").trim()
    );

    if (!hasRealContent) {
      push({
        role: "assistant",
        content: "⚠️ Generation failed — no headline or copy was returned. This usually means the client intake is incomplete or the AI service is unavailable. Please check that the intake form has a business name, industry, and service description, then try again.",
      });
      setPhase("awaiting-action");
      return;
    }

    setCreatives(newCreatives);

    console.log("[INLINE_AGENT_GENERATE_SUCCESS]", {
      count: newCreatives.length, hasImage: !!sharedImageUrl,
      headlines: newCreatives.map((c) => c.headline || "(empty)"),
    });

    // 3) Notify parent → updates draftCreatives + selects __DRAFT__
    const images = [sharedImageUrl].filter(Boolean);
    onCreativesGenerated?.({ images, creativeSet: newCreatives, creativeTestCount: n });

    // 4) Save to backend (images may be empty — backend now allows this)
    const strategy = {
      type: "creative_angle_test", creativeCount: n,
      recommendedDurationDays: 7, structure: "1 campaign, 1 ad set, multiple ads",
      angles: angleList.map((a) => a.id),
      decisionRules: [
        "Do not judge before enough impressions/clicks",
        "After 7 days, compare CTR, CPC, spend, and link clicks",
        "Pause weakest ads if a winner is clear",
        "Keep the winner and generate a challenger",
      ],
    };
    const draftPayload = {
      creativeSet: newCreatives, images,
      headline: newCreatives[0]?.headline || "",
      body:     newCreatives[0]?.body     || "",
      link:     piUrl, answers, initialTestStrategy: strategy,
      savedAt: Date.now(), status: "draft",
    };
    const saveRes = await saveBackendDraft(adminClientId, draftPayload);
    console.log("[INLINE_AGENT_DRAFT_SAVE]", { ok: saveRes?.ok, error: saveRes?.error });

    // 5) Show creatives in chat
    push({
      role: "assistant", type: "creatives",
      content: `Here are your **${n} ad concepts** — one image, different copy per angle:`,
      creatives: newCreatives,
    });
    push({
      role: "assistant", type: "actions",
      content: `Your creatives are saved to the **Creatives tab** ✓\nGo to the **Campaign tab** to set your budget and launch — 1 campaign · 1 ad set · ${n} ads.`,
      actions: [
        { id: "go-creatives", label: "View Creatives" },
        { id: "go-campaign",  label: "Campaign & Launch →", primary: true },
      ],
    });
    setPhase("done");
    scrollBottom();
  }

  /* ── Free-form chat ────────────────────────────────────────────────────────── */
  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;

    // Simple intent detection for common actions
    const lower = msg.toLowerCase();
    if (/generate|create|make.*ad|start/i.test(lower) && /\d/.test(lower)) {
      const m = msg.match(/\d+/);
      const cnt = m ? Math.min(4, Math.max(1, parseInt(m[0]))) : 3;
      push({ role: "user", content: msg });
      setInput("");
      confirmCount(cnt);
      return;
    }
    if (/go.*campaign|campaign.*tab|launch/i.test(lower)) {
      push({ role: "user", content: msg });
      push({ role: "assistant", content: "Heading to the Campaign tab now!" });
      setInput("");
      setTimeout(() => onGoToCampaign?.(), 500);
      scrollBottom();
      return;
    }
    if (/show.*creative|creative.*tab|view.*creative/i.test(lower)) {
      push({ role: "user", content: msg });
      push({ role: "assistant", content: "Switching to the Creatives tab!" });
      setInput("");
      setTimeout(() => onGoToCreatives?.(), 500);
      scrollBottom();
      return;
    }

    push({ role: "user", content: msg });
    setInput("");
    if (textRef.current) textRef.current.style.height = "auto";
    setSending(true);
    scrollBottom();

    try {
      const j = await apiPost("/api/ad-agent/chat", {
        message: msg,
        history: msgs.slice(-8).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
        ...(adminClientId ? { adminClientId } : {}),
        ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
      });
      push({ role: "assistant", content: j?.reply || "Something went wrong. Please try again." });
    } catch {
      push({ role: "assistant", content: "Something went wrong. Try again." });
    } finally {
      setSending(false);
      scrollBottom();
    }
  }

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  /* ── Render ─────────────────────────────────────────────────────────────── */
  const showInput = phase === "chat" || phase === "done";

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 130px)", minHeight: 480,
      fontFamily: FONT, background: "#fff",
      border: "1px solid #e8ecf0", borderRadius: 20,
      overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", gap: 10,
        background: "linear-gradient(135deg,#fff 0%,#f8f7ff 100%)",
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FaRobot style={{ color: "#fff", fontSize: 16 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: TEXT }}>AI Ad Agent</div>
          <div style={{ fontSize: 12, color: SOFT }}>
            {generating ? statusMsg || "Generating…" :
             phase === "done" ? `${creatives.length} creatives ready` :
             "Your Smartemark creative partner"}
          </div>
        </div>
        {(phase === "done" || creatives.length > 0) && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onGoToCreatives} style={hdrBtn("#f1f5f9", TEXT)}>Creatives</button>
            <button onClick={onGoToCampaign}  style={hdrBtn(ACCENT, "#fff")}>Launch →</button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>

        {phase === "init" || (phase === "loading" && !msgs.length) ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: SOFT, fontSize: 14 }}>
            Loading your intake…
          </div>
        ) : null}

        {msgs.map((m) => (
          <div key={m._id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: m.type === "creatives" ? "100%" : "82%", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>

              {/* AI bubble */}
              {m.role === "assistant" && (
                <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: TEXT, fontSize: 14, lineHeight: 1.65 }}>
                  {m.type === "creatives" && m.creatives?.length ? (
                    <>
                      <div style={{ marginBottom: 12 }}><Md text={m.content} /></div>
                      <CreativeCarousel creatives={m.creatives} />
                    </>
                  ) : (
                    <Md text={m.content} />
                  )}
                </div>
              )}

              {/* Count selector */}
              {m.role === "assistant" && m.type === "count-select" && phase === "count-select" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} onClick={() => selectCount(n)} style={{
                      padding: "8px 18px", borderRadius: 999,
                      border: `2px solid ${n === 3 ? ACCENT : "#e2e8f0"}`,
                      background: n === 3 ? ACCENT : "#fff",
                      color: n === 3 ? "#fff" : TEXT,
                      fontWeight: 800, fontSize: 13, cursor: "pointer",
                    }}>
                      {n} ad{n > 1 ? "s" : ""}{n === 3 ? " ✓" : ""}
                    </button>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              {m.role === "assistant" && m.type === "actions" && m.actions && (
                <ActionRow actions={m.actions} onAction={handleAction} />
              )}

              {/* User bubble */}
              {m.role === "user" && (
                <div style={{ background: USER_BG, borderRadius: "18px 18px 4px 18px", padding: "11px 16px", color: "#fff", fontSize: 14, lineHeight: 1.65 }}>
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Generating indicator */}
        {generating && (
          <div style={{ display: "flex" }}>
            <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: SOFT, fontSize: 14, fontStyle: "italic" }}>
              <span style={{ marginRight: 8 }}>⟳</span>{statusMsg}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {showInput && (
        <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 22px 16px", background: "#fff" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              ref={textRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask a question or type 'make 3 ads'…"
              disabled={sending || generating}
              rows={1}
              style={{
                flex: 1, padding: "11px 15px", border: "1px solid #e2e8f0", borderRadius: 12,
                fontSize: 14, fontFamily: FONT, resize: "none", outline: "none",
                background: "#f8fafc", lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
              }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending || generating}
              style={{
                width: 42, height: 42, borderRadius: 10, border: "none", flexShrink: 0,
                background: (input.trim() && !sending) ? ACCENT : "#e5e7eb",
                cursor: (input.trim() && !sending) ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <FaPaperPlane style={{ color: (input.trim() && !sending) ? "#fff" : "#9ca3af", fontSize: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function hdrBtn(bg, color) {
  return {
    padding: "6px 14px", borderRadius: 7, border: "none",
    background: bg, color, fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: FONT,
  };
}
