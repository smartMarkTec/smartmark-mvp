/* eslint-disable */
/**
 * InlineAdAgent — Claude-style AI Ad Agent tab inside CampaignSetup.
 *
 * Fix log:
 *  - fetchCopy now returns `response.copy` (not the full response) matching FormPage line 830
 *  - normalizeCopyResult maps all possible field names defensively
 *  - Claude-style two-phase UI: welcome → chat thread
 *  - Typed natural language input with intent detection + LLM fallback
 *  - Approval-before-generate flow
 *  - adminClientInfo tracked via ref — no stale-closure bug
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaPaperPlane, FaRobot, FaChevronLeft, FaChevronRight, FaTimes } from "react-icons/fa";

/* ─── Design ──────────────────────────────────────────────────────────────── */
const FONT   = "'Inter','Poppins','Segoe UI',Arial,sans-serif";
const ACCENT = "#5d59ea";
const TEXT   = "#0f172a";
const SOFT   = "#6b7280";
const AI_BG  = "#f3f4f6";
const USER_BG = "#111827";
const BORDER  = "rgba(0,0,0,0.08)";

/* ─── Creative angles ─────────────────────────────────────────────────────── */
const ANGLES = [
  { id: "offer",   label: "Offer Angle",      hint: "Lead with special offer or promotion" },
  { id: "problem", label: "Problem Angle",     hint: "Lead with customer pain point"        },
  { id: "trust",   label: "Local Trust Angle", hint: "Lead with local expertise"            },
  { id: "urgency", label: "Urgency Angle",     hint: "Lead with time-sensitive action"      },
];
function getAngles(n) { return ANGLES.slice(0, Math.min(n, 4)); }

/* ─── Rotating status messages ────────────────────────────────────────────── */
const STATUS = [
  "Thinking through the best angles…",
  "Drafting concepts from your intake…",
  "Refining copy for each angle…",
  "Generating your visuals…",
  "Calibrating the campaign direction…",
  "Assembling your ad set…",
  "Almost there — saving your creatives…",
];

/* ─── API helpers ──────────────────────────────────────────────────────────── */
function sid() {
  const s = (localStorage.getItem("sm_sid_v1") || "").trim();
  return s ? { "x-sm-sid": s } : {};
}
function jsonHdr() { return { "Content-Type": "application/json", ...sid() }; }

/** Matches FormPage line 830: return json.copy || {} */
async function fetchCopy(answers, angle = "") {
  try {
    const r = await fetch("/api/summarize-ad-copy", {
      method: "POST", credentials: "include", headers: jsonHdr(),
      body: JSON.stringify({ answers, ...(angle ? { angle } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    console.log("[INLINE_AGENT_COPY_RAW]", { angle, ok: j.ok, copy: j.copy });
    if (!r.ok || !j.ok) return {};
    return j.copy || {};           // ← CRITICAL: return the nested copy object
  } catch (e) {
    console.warn("[INLINE_AGENT_COPY_RAW] error:", e?.message);
    return {};
  }
}

/** Defensively normalize all field shapes the backend might return */
function normalizeCopy(raw = {}) {
  const headline = String(
    raw.headline || raw.adHeadline || raw.title || raw.primaryText || ""
  ).trim().slice(0, 55);
  const body = String(
    raw.subline || raw.body || raw.adCopy || raw.copy || raw.text || raw.description || ""
  ).trim();
  const cta = String(
    raw.cta || raw.callToAction || raw.button || "Learn more"
  ).trim();
  const overlay = String(raw.image_overlay_text || raw.overlay || cta).trim();
  console.log("[INLINE_AGENT_COPY_NORMALIZED]", { headline, body: body.slice(0, 60), cta });
  return { headline, body, cta, overlay };
}

/** Generate static ad image. Returns first URL or null. */
async function fetchImage(answers, copy = {}) {
  try {
    const r = await fetch("/api/generate-static-ad", {
      method: "POST", credentials: "include", headers: jsonHdr(),
      body: JSON.stringify({
        template: "poster_b",
        regenerateToken: `agent-${Date.now()}`,
        url: answers.url || "", website: answers.url || "",
        answers: { ...answers },
        copy: { headline: copy.headline || "", subline: copy.body || "", cta: copy.cta || "Learn more" },
      }),
    });
    const j = await r.json().catch(() => ({}));
    console.log("[INLINE_AGENT_IMAGE_RAW]", { ok: j.ok, urlCount: j.urls?.length, first: j.urls?.[0]?.slice(0,60) });
    return j?.urls?.[0] || null;
  } catch (e) {
    console.warn("[INLINE_AGENT_IMAGE_RAW] error:", e?.message);
    return null;
  }
}

async function getContext(adminClientId) {
  const url = adminClientId
    ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
    : "/api/campaign-context";
  const r = await fetch(url, { credentials: "include", headers: sid() });
  const j = await r.json().catch(() => ({}));
  return j.ok ? j.context : null;
}

async function getLLMRec(adminClientId, selectedCampaignId, biz, offer, service, area) {
  const prompt = [
    `Write a 2-sentence campaign strategy recommendation for ${biz || "this business"}.`,
    offer   ? `They have an offer: ${offer}.`         : "",
    service ? `Their main service is: ${service}.`    : "",
    area    ? `They serve: ${area}.`                  : "",
    "Recommend a 3-ad creative angle test (offer, problem, local trust). Be specific and concise.",
  ].filter(Boolean).join(" ");

  const r = await fetch("/api/ad-agent/chat", {
    method: "POST", credentials: "include", headers: jsonHdr(),
    body: JSON.stringify({
      message: prompt, history: [],
      ...(adminClientId ? { adminClientId } : {}),
      ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.reply || null;
}

async function saveDraft(adminClientId, draft) {
  const r = await fetch("/api/campaign-context/save-creative-draft", {
    method: "POST", credentials: "include", headers: jsonHdr(),
    body: JSON.stringify({ adminClientId, creativeDraft: draft }),
  });
  const j = await r.json().catch(() => ({}));
  console.log("[INLINE_AGENT_DRAFT_SAVE]", { ok: j.ok, error: j.error });
  return j;
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */
function Md({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((p, i) =>
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

function Chip({ label, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 14px", borderRadius: 20,
        border: primary ? "none" : "1px solid " + BORDER,
        background: primary ? ACCENT : "#fff",
        color: primary ? "#fff" : TEXT,
        fontSize: 13, fontWeight: 600, cursor: "pointer",
        fontFamily: FONT, transition: "all 0.1s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      {label}
    </button>
  );
}

function CreativeCard({ c, expanded, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        flex: "0 0 200px", maxWidth: 200, cursor: "pointer",
        background: "#fff", borderRadius: 14, overflow: "hidden",
        border: expanded ? `2px solid ${ACCENT}` : "1px solid #e5e7eb",
        boxShadow: "0 2px 8px rgba(0,0,0,0.05)", transition: "border 0.12s",
      }}
    >
      {c.imageUrl ? (
        <img src={c.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <div style={{ aspectRatio: "1/1", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 26 }}>
          <FaRobot />
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "inline-block", background: "#eef2ff", color: ACCENT, fontSize: 10, fontWeight: 800, borderRadius: 4, padding: "2px 7px", marginBottom: 6 }}>
          {c.angleLabel}
        </div>
        <div style={{ fontWeight: 800, fontSize: 13, color: c.headline ? TEXT : "#ef4444", lineHeight: 1.3, marginBottom: 4 }}>
          {c.headline || "⚠ copy generation incomplete"}
        </div>
        {expanded ? (
          <>
            <div style={{ fontSize: 12, color: SOFT, lineHeight: 1.5, marginBottom: 4 }}>{c.body}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: ACCENT }}>CTA: {c.cta}</div>
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
    <div style={{ width: "100%" }}>
      {creatives.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <button onClick={() => ref.current?.scrollBy({ left: -220, behavior: "smooth" })} style={arrowBtnSt}><FaChevronLeft /></button>
          <span style={{ fontSize: 12, color: SOFT }}>{creatives.length} ads</span>
          <button onClick={() => ref.current?.scrollBy({ left: 220, behavior: "smooth" })}  style={arrowBtnSt}><FaChevronRight /></button>
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
const arrowBtnSt = { width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 };

/* ─── Main component ──────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,
  selectedCampaignId,
  onCreativesGenerated,
  onGoToCreatives,
  onGoToCampaign,
}) {
  // Track latest adminClientInfo in a ref so async closures don't go stale
  const clientRef = useRef(adminClientInfo);
  useEffect(() => { clientRef.current = adminClientInfo; }, [adminClientInfo]);

  const [msgs,        setMsgs]       = useState([]);
  const [input,       setInput]      = useState("");
  const [sending,     setSending]    = useState(false);
  const [generating,  setGenerating] = useState(false);
  const [statusMsg,   setStatusMsg]  = useState("");
  const [phase,       setPhase]      = useState("init");   // init|welcome|chat|generating|done
  const [pendingN,    setPendingN]   = useState(null);
  const [creatives,   setCreatives]  = useState([]);
  const [intakeCtx,   setIntakeCtx]  = useState(null);
  const [greeting,    setGreeting]   = useState("");

  const bottomRef = useRef(null);
  const textRef   = useRef(null);
  const timerRef  = useRef(null);
  const loaded    = useRef(false);

  const push = useCallback((m) => setMsgs((p) => [...p, { _k: Math.random(), ...m }]), []);
  const scroll = () => setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 70);

  /* ─── Load once adminClientInfo or adminClientId is available ─────────── */
  useEffect(() => {
    if (loaded.current) return;
    if (!adminClientId && !adminClientInfo) return;
    loaded.current = true;
    load();
  // eslint-disable-next-line
  }, [adminClientId, adminClientInfo]);

  async function load() {
    setPhase("init");
    let ctx = null;
    try { ctx = await getContext(adminClientId); } catch {}
    setIntakeCtx(ctx);

    const ci  = clientRef.current;
    const pi  = ci?.premiumIntake || {};
    const biz = pi.businessName || ctx?.businessName || ci?.displayName || adminClientId?.split("@")[0] || "there";
    const g   = `Hey — ready to create your campaign${biz && biz !== "there" ? ` for **${biz}**` : ""}? 👋`;
    setGreeting(g);

    // Fetch LLM strategy recommendation in background
    const offer   = pi.currentSpecialOrOffer || ctx?.offer    || "";
    const service = pi.mainServices          || ctx?.industry || "";
    const area    = pi.serviceArea           || ctx?.serviceArea || "";
    let rec = null;
    try { rec = await getLLMRec(adminClientId, selectedCampaignId, biz, offer, service, area); } catch {}
    if (!rec) {
      const offerPart = offer ? `the **${offer}** offer` : "your best offer";
      rec = `For **${biz}**'s first campaign, I recommend starting with a 3-ad creative test: one ad leading with ${offerPart}, one speaking to the customer's pain point, and one focused on local expertise. All three share one campaign and one ad set, so the budget stays focused and we can see which message wins fastest.`;
    }

    // Load saved draft if it exists
    let restored = false;
    try {
      const url = adminClientId
        ? `/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`
        : "/api/campaign-context/creative-draft";
      const dr = await fetch(url, { credentials: "include", headers: sid() });
      const dj = await dr.json().catch(() => ({}));
      if (dj.ok && dj.creativeDraft?.creativeSet?.length) {
        const saved = dj.creativeDraft;
        setCreatives(saved.creativeSet);
        onCreativesGenerated?.({ images: saved.images || [], creativeSet: saved.creativeSet, creativeTestCount: saved.creativeSet.length });
        console.log("[INLINE_AGENT_DRAFT_RESTORE]", { count: saved.creativeSet.length });
        restored = true;
      }
    } catch {}

    // Build initial context object for later use
    setIntakeCtx({ ...ctx, _pi: pi, _biz: biz, _offer: offer, _service: service, _area: area, _rec: rec });

    if (restored) {
      // Had saved draft — go straight to chat with quick summary
      push({ role: "assistant", type: "greeting", content: greeting });
      push({ role: "assistant", content: `Welcome back! I found your saved creatives from last time. You can go straight to the **Creatives** or **Campaign** tab, or type to make changes.` });
      push({ role: "assistant", type: "chips", chips: [
        { label: "View Creatives", action: "go-creatives" },
        { label: "Campaign & Launch →", action: "go-campaign", primary: true },
        { label: "Regenerate creatives", action: "regen" },
      ]});
      setPhase("done");
    } else {
      setPhase("welcome"); // show Claude-style welcome + centered input
    }
    scroll();
  }

  /* ─── Generation status rotation ─────────────────────────────────────────── */
  function startStatus() {
    let i = 0;
    setStatusMsg(STATUS[0]);
    timerRef.current = setInterval(() => {
      i = (i + 1) % STATUS.length;
      setStatusMsg(STATUS[i]);
    }, 2200);
  }
  function stopStatus() { clearInterval(timerRef.current); setStatusMsg(""); }

  /* ─── Intent detection ────────────────────────────────────────────────────── */
  function detectIntent(txt) {
    const t = txt.toLowerCase().trim();
    // Number extraction
    const nm = t.match(/\b([1-4])\b/);
    const n  = nm ? parseInt(nm[1]) : null;

    if (/\byes\b|generate\s*now|do\s*it|go\s*ahead|confirm/i.test(t)) return { type: "confirm" };
    if (/generat|creat|make|build/i.test(t) && n)                    return { type: "count", n };
    if (/generat|creat|make/i.test(t) && /3|three|recommend/i.test(t)) return { type: "count", n: 3 };
    if (/generat|creat|make/i.test(t))                               return { type: "count", n: 3 };
    if (/choose\s*count|pick\s*(number|count)/i.test(t))             return { type: "choose-count" };
    if (/recommend|strateg|suggest/i.test(t))                        return { type: "strategy" };
    if (/show|view|see.*creative|creative.*tab/i.test(t))            return { type: "go-creatives" };
    if (/campaign.*tab|go.*campaign|launch/i.test(t))               return { type: "go-campaign" };
    if (/change|different|regen/i.test(t))                          return { type: "regen" };
    return { type: "chat" };
  }

  /* ─── Action handler ──────────────────────────────────────────────────────── */
  function handleAction(action) {
    if (action === "go-creatives")   { onGoToCreatives?.(); return; }
    if (action === "go-campaign")    { onGoToCampaign?.();  return; }
    if (action === "confirm")        { if (pendingN) startGeneration(pendingN); return; }
    if (action === "regen")          { resetToChooseCount(); return; }
    if (action === "choose-count")   { showCountPicker(); return; }
    if (action.startsWith("count-")) {
      const n = parseInt(action.replace("count-", ""));
      askConfirm(n);
    }
  }

  function showStrategyRec() {
    const ctx = intakeCtx;
    push({ role: "assistant", content: ctx?._rec || "I recommend a 3-ad creative test." });
    push({
      role: "assistant", type: "chips",
      chips: [
        { label: "Generate 3 recommended creatives", action: "count-3", primary: true },
        { label: "Choose count", action: "choose-count" },
        { label: "Ask me a question", action: "chat" },
      ],
    });
    setPhase("chat");
    scroll();
  }

  function showCountPicker() {
    push({
      role: "assistant", type: "count-pick",
      content: "How many ad creatives do you want to test?",
    });
    setPhase("count-pick");
    scroll();
  }

  function askConfirm(n) {
    setPendingN(n);
    const angles = getAngles(n).map((a) => `• ${a.label}`).join("\n");
    push({
      role: "assistant", type: "chips",
      content: `A **${n}-ad creative test** — one shared image, different copy per angle:\n${angles}\n\nReady to generate?`,
      chips: [
        { label: "Yes, generate now", action: "confirm", primary: true },
        { label: "Change count", action: "choose-count" },
      ],
    });
    setPhase("confirm");
    scroll();
  }

  function resetToChooseCount() {
    setPendingN(null);
    showCountPicker();
  }

  /* ─── Generation ──────────────────────────────────────────────────────────── */
  async function startGeneration(n) {
    setPhase("generating");
    setGenerating(true);
    startStatus();
    scroll();

    const ci  = clientRef.current;
    const pi  = ci?.premiumIntake || {};
    const ctx = intakeCtx || {};
    const piUrl = pi.websiteUrl || ctx.websiteUrl || "";

    const answers = {
      businessName:  pi.businessName  || ctx.businessName  || "",
      industry:      pi.mainServices  || ctx.industry      || "",
      offer:         pi.currentSpecialOrOffer || ctx.offer  || "",
      mainBenefit:   pi.mainServices  || ctx.mainBenefit   || "",
      city:          (pi.targetCities || "").split(",")[0]?.trim() || ctx.city  || "",
      state:         ctx.state        || "",
      idealCustomer: pi.idealCustomer || ctx.idealCustomer || "",
      serviceArea:   pi.serviceArea   || ctx.serviceArea   || "",
      cta:           ctx.cta          || "Learn more",
      url:           piUrl, websiteUrl: piUrl,
      phone:         pi.mainPhone     || ctx.phoneNumber   || "",
    };

    console.log("[INLINE_AGENT_GENERATE_START]", {
      adminClientId, n,
      businessName: answers.businessName,
      industry: answers.industry,
      url: answers.url,
    });

    // 1) Generate primary copy (offer angle) for image prompt
    const primaryRaw = await fetchCopy(answers, "offer");
    const primaryCopy = normalizeCopy(primaryRaw);

    // 2) Generate shared image
    let sharedImageUrl = null;
    try { sharedImageUrl = await fetchImage(answers, primaryCopy); } catch {}

    // 3) Generate copy for each angle in parallel
    const angleList = getAngles(n);
    const copyResults = await Promise.allSettled(
      angleList.map((a) => fetchCopy(answers, a.id))
    );

    // 4) Build creative set
    const newCreatives = angleList.map((angle, i) => {
      const raw  = copyResults[i].status === "fulfilled" ? copyResults[i].value : {};
      const norm = normalizeCopy(raw);
      return {
        id:            `c-${angle.id}-${Date.now()}-${i}`,
        angle:         angle.id,
        angleLabel:    angle.label,
        headline:      norm.headline,
        body:          norm.body,
        cta:           norm.cta,
        imageUrl:      sharedImageUrl || "",
        link:          piUrl,
        mediaSelection:"image",
        creativeSource:"ai_agent",
        status:        "draft",
      };
    });

    stopStatus();
    setGenerating(false);

    // 5) Check for real content
    const hasContent = newCreatives.some(
      (c) => String(c.headline || "").trim() || String(c.body || "").trim()
    );

    if (!hasContent) {
      console.warn("[INLINE_AGENT_GENERATE_FAIL]", { newCreatives });
      push({
        role: "assistant",
        content: "⚠️ Copy generation failed — no headline or body was returned. This usually means the client intake is incomplete. Please check that the intake form has a **business name**, **industry**, and **service description**, then try again.",
      });
      push({ role: "assistant", type: "chips", chips: [
        { label: "Try again", action: "count-" + n, primary: true },
        { label: "Choose different count", action: "choose-count" },
      ]});
      setPhase("chat");
      return;
    }

    console.log("[INLINE_AGENT_GENERATE_SUCCESS]", {
      count: newCreatives.length,
      hasImage: !!sharedImageUrl,
      headlines: newCreatives.map((c) => c.headline || "(empty)"),
    });

    setCreatives(newCreatives);

    // 6) Notify parent → sets draftCreatives + __DRAFT__
    const images = [sharedImageUrl].filter(Boolean);
    onCreativesGenerated?.({ images, creativeSet: newCreatives, creativeTestCount: n });

    // 7) Save to backend
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
    await saveDraft(adminClientId, {
      creativeSet: newCreatives, images,
      headline: newCreatives[0]?.headline || "",
      body:     newCreatives[0]?.body     || "",
      link:     piUrl, answers, initialTestStrategy: strategy,
      savedAt: Date.now(), status: "draft",
    });

    // 8) Show in chat
    push({
      role: "assistant", type: "creatives",
      content: `Here are your **${n} ad concepts** ✓`,
      creatives: newCreatives,
    });
    push({
      role: "assistant", type: "chips",
      content: !sharedImageUrl
        ? "_(Image generation timed out — copy is ready. You can launch text-only or try regenerating.)_\n\nCreatives saved → **Creatives tab** is updated. Go to **Campaign** to set budget and launch."
        : "Creatives saved → **Creatives tab** is updated. Go to **Campaign** to set budget and launch — 1 campaign · 1 ad set · " + n + " ads.",
      chips: [
        { label: "View Creatives", action: "go-creatives" },
        { label: "Campaign & Launch →", action: "go-campaign", primary: true },
      ],
    });
    setPhase("done");
    scroll();
  }

  /* ─── Free-form typed chat ────────────────────────────────────────────────── */
  async function send(override) {
    const raw = typeof override === "string" ? override : input.trim();
    if (!raw || sending || generating) return;
    setInput("");
    if (textRef.current) textRef.current.style.height = "auto";

    // Switch from welcome to chat mode on first message
    if (phase === "welcome") setPhase("chat");

    push({ role: "user", content: raw });
    scroll();

    const intent = detectIntent(raw);

    // Handle known intents locally (fast)
    if (intent.type === "confirm" && pendingN) {
      startGeneration(pendingN);
      return;
    }
    if (intent.type === "count") {
      askConfirm(intent.n || 3);
      return;
    }
    if (intent.type === "choose-count") {
      showCountPicker();
      return;
    }
    if (intent.type === "strategy") {
      showStrategyRec();
      return;
    }
    if (intent.type === "go-creatives") {
      push({ role: "assistant", content: "Switching to Creatives tab!" });
      setTimeout(() => onGoToCreatives?.(), 400);
      scroll();
      return;
    }
    if (intent.type === "go-campaign") {
      push({ role: "assistant", content: "Heading to Campaign tab!" });
      setTimeout(() => onGoToCampaign?.(), 400);
      scroll();
      return;
    }
    if (intent.type === "regen") {
      resetToChooseCount();
      return;
    }

    // Fallback to LLM
    setSending(true);
    try {
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include", headers: jsonHdr(),
        body: JSON.stringify({
          message: raw,
          history: msgs.slice(-8).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
          ...(adminClientId ? { adminClientId } : {}),
          ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? { selectedCampaignId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      push({ role: "assistant", content: j?.reply || "Something went wrong. Please try again." });
    } catch {
      push({ role: "assistant", content: "Something went wrong. Try again." });
    } finally {
      setSending(false);
      scroll();
    }
  }

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  /* ─── Render helpers ──────────────────────────────────────────────────────── */
  function renderMsg(m) {
    const isAI = m.role === "assistant";
    return (
      <div key={m._k} style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end", marginBottom: 12 }}>
        <div style={{ maxWidth: m.type === "creatives" ? "100%" : "80%", display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end", gap: 6 }}>

          {/* AI bubble */}
          {isAI && m.content && (
            <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: TEXT, fontSize: 14, lineHeight: 1.65 }}>
              <Md text={m.content} />
            </div>
          )}

          {/* Creatives carousel */}
          {m.type === "creatives" && m.creatives?.length && (
            <div style={{ marginTop: 4, width: "100%" }}>
              <CreativeCarousel creatives={m.creatives} />
            </div>
          )}

          {/* Count picker */}
          {m.type === "count-pick" && phase === "count-pick" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {[1, 2, 3, 4].map((n) => (
                <Chip key={n} label={`${n} ad${n > 1 ? "s" : ""}${n === 3 ? " ✓" : ""}`}
                  primary={n === 3} onClick={() => { push({ role: "user", content: `${n} ads` }); askConfirm(n); }} />
              ))}
            </div>
          )}

          {/* Chips/action row */}
          {m.type === "chips" && m.chips && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {m.chips.map((c) => (
                <Chip key={c.label} label={c.label} primary={c.primary}
                  onClick={() => { push({ role: "user", content: c.label }); handleAction(c.action); }} />
              ))}
            </div>
          )}

          {/* User bubble */}
          {!isAI && (
            <div style={{ background: USER_BG, borderRadius: "18px 18px 4px 18px", padding: "11px 16px", color: "#fff", fontSize: 14, lineHeight: 1.65 }}>
              {m.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Input box (shared between welcome + chat) ───────────────────────────── */
  function InputBox({ large }) {
    return (
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", width: "100%", maxWidth: large ? 680 : "100%" }}>
        <textarea
          ref={large ? null : textRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={generating ? "Generating…" : "Ask me to create, change, or launch your campaign…"}
          disabled={sending || generating}
          rows={large ? 2 : 1}
          style={{
            flex: 1, padding: large ? "16px 20px" : "11px 15px",
            border: "1px solid " + BORDER, borderRadius: large ? 16 : 12,
            fontSize: large ? 15 : 14, fontFamily: FONT, resize: "none", outline: "none",
            background: large ? "#fff" : "#f9fafb", color: TEXT, lineHeight: 1.5,
            maxHeight: 140, overflowY: "auto",
            boxShadow: large ? "0 2px 20px rgba(0,0,0,0.07)" : "none",
          }}
          onInput={(e) => {
            e.target.style.height = "auto";
            e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
          }}
        />
        <button
          onClick={() => send()}
          disabled={!input.trim() || sending || generating}
          style={{
            width: large ? 50 : 42, height: large ? 50 : 42, borderRadius: 12, border: "none", flexShrink: 0,
            background: input.trim() && !sending && !generating ? ACCENT : "#e5e7eb",
            cursor: input.trim() && !sending && !generating ? "pointer" : "not-allowed",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <FaPaperPlane style={{ color: input.trim() && !sending ? "#fff" : "#9ca3af", fontSize: large ? 16 : 14 }} />
        </button>
      </div>
    );
  }

  /* ─── Layout ─────────────────────────────────────────────────────────────── */
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", minHeight: 480, fontFamily: FONT, background: "#fff", border: "1px solid " + BORDER, borderRadius: 20, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>

      {/* Header */}
      <div style={{ padding: "13px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, background: "#fff" }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FaRobot style={{ color: "#fff", fontSize: 15 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>AI Ad Agent</div>
          <div style={{ fontSize: 11, color: SOFT }}>
            {generating ? statusMsg : phase === "done" ? `${creatives.length} creatives ready` : "Smartemark campaign brain"}
          </div>
        </div>
        {(phase === "done" || creatives.length > 0) && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onGoToCreatives} style={hdrBtnSt("#f1f5f9", TEXT)}>Creatives</button>
            <button onClick={onGoToCampaign}  style={hdrBtnSt(ACCENT, "#fff")}>Launch →</button>
          </div>
        )}
      </div>

      {/* ── Welcome (Claude-style centered) ─────────────────────────────────── */}
      {(phase === "welcome" || phase === "init") && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px 40px" }}>
          {phase === "init" ? (
            <div style={{ color: SOFT, fontSize: 14 }}>Loading your intake…</div>
          ) : (
            <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg,#eef2ff 0%,#e0e7ff 100%)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 24, color: ACCENT }}>
                <FaRobot />
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>
                <Md text={greeting || "Hey — ready to create your campaign? 👋"} />
              </h2>
              <p style={{ color: SOFT, fontSize: 15, lineHeight: 1.65, margin: "0 0 28px" }}>
                <Md text={intakeCtx?._rec || "I'll help you create a multi-angle ad campaign from your intake data."} />
              </p>
              <InputBox large />
              {/* Quick-action chips below input */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
                {[
                  { label: "Generate 3 recommended creatives", fn: () => { push({ role: "user", content: "Generate 3 recommended creatives" }); setPhase("chat"); askConfirm(3); } },
                  { label: "Choose number of creatives",        fn: () => { push({ role: "user", content: "Choose number of creatives" });        setPhase("chat"); showCountPicker(); } },
                  { label: "What do you recommend?",           fn: () => { push({ role: "user", content: "What do you recommend?" });            setPhase("chat"); showStrategyRec(); } },
                ].map((c) => (
                  <button key={c.label} onClick={c.fn} style={{ padding: "7px 14px", borderRadius: 20, border: "1px solid " + BORDER, background: "#fff", color: TEXT, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Chat thread ──────────────────────────────────────────────────────── */}
      {phase !== "welcome" && phase !== "init" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
            {msgs.map(renderMsg)}

            {/* Generating indicator */}
            {generating && (
              <div style={{ display: "flex", marginBottom: 12 }}>
                <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: SOFT, fontSize: 14, fontStyle: "italic" }}>
                  ⟳ {statusMsg}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Sticky input */}
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 22px 16px", background: "#fff" }}>
            <InputBox />
          </div>
        </>
      )}
    </div>
  );
}

const hdrBtnSt = (bg, color) => ({
  padding: "6px 13px", borderRadius: 7, border: "none",
  background: bg, color, fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: FONT,
});
