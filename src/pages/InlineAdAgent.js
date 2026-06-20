/* eslint-disable */
/**
 * InlineAdAgent — Claude-style AI Ad Agent inside CampaignSetup.
 *
 * Key fixes:
 *  1. InputBox extracted as module-level component — no more remount on each render
 *  2. Per-angle image generation — each creative gets its own image
 *  3. Typed chat first, chips are secondary shortcuts only
 *  4. Clean Claude-style layout
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaPaperPlane, FaRobot } from "react-icons/fa";

/* ─── Design ──────────────────────────────────────────────────────────────── */
const FONT    = "'Inter','Poppins','Segoe UI',Arial,sans-serif";
const ACCENT  = "#5d59ea";
const TEXT    = "#0f172a";
const SOFT    = "#6b7280";
const AI_BG   = "#f3f4f6";
const USER_BG = "#111827";
const BORDER  = "rgba(0,0,0,0.08)";

const ANGLES = [
  { id: "offer",   label: "Offer Angle",      hint: "Lead with special offer or promotion" },
  { id: "problem", label: "Problem Angle",     hint: "Lead with customer pain point"        },
  { id: "trust",   label: "Local Trust Angle", hint: "Lead with local expertise"            },
  { id: "urgency", label: "Urgency Angle",      hint: "Lead with time-sensitive action"     },
];
function getAngles(n) { return ANGLES.slice(0, Math.min(n, 4)); }

const STATUS_MSGS = [
  "Thinking through the best angles for your campaign…",
  "Drafting the first concept…",
  "Generating offer-driven visual…",
  "Generating problem-driven visual…",
  "Generating local trust visual…",
  "Refining copy for each angle…",
  "Saving your creatives…",
];

/* ─── API helpers ─────────────────────────────────────────────────────────── */
function getSid() {
  const s = (localStorage.getItem("sm_sid_v1") || "").trim();
  return s ? { "x-sm-sid": s } : {};
}
function jHdr() { return { "Content-Type": "application/json", ...getSid() }; }

/** Returns json.copy — matches FormPage line 830 exactly */
async function fetchCopy(answers, angle = "") {
  try {
    const r = await fetch("/api/summarize-ad-copy", {
      method: "POST", credentials: "include", headers: jHdr(),
      body: JSON.stringify({ answers, ...(angle ? { angle } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) return {};
    console.log("[INLINE_AGENT_COPY_RAW]", { angle, headline: j.copy?.headline, ok: j.ok });
    return j.copy || {};
  } catch (e) {
    console.warn("[INLINE_AGENT_COPY_RAW] failed:", e?.message);
    return {};
  }
}

/** Normalize all possible field shapes the backend might return */
function normCopy(raw = {}) {
  const headline = String(raw.headline || raw.adHeadline || raw.title || "").trim().slice(0, 55);
  const body     = String(raw.subline  || raw.body  || raw.adCopy || raw.description || "").trim();
  const cta      = String(raw.cta      || raw.callToAction || "Learn more").trim();
  const overlay  = String(raw.image_overlay_text || raw.overlay || cta).trim();
  console.log("[INLINE_AGENT_COPY_NORMALIZED]", { headline: headline.slice(0, 40), body: body.slice(0, 40), cta });
  return { headline, body, cta, overlay };
}

/** Generate one image for a specific angle/copy. Returns URL or null. */
async function fetchImage(answers, copy = {}, angle = "") {
  try {
    const r = await fetch("/api/generate-static-ad", {
      method: "POST", credentials: "include", headers: jHdr(),
      body: JSON.stringify({
        template: "poster_b",
        regenerateToken: `agent-${angle}-${Date.now()}`,
        url: answers.url || "", website: answers.url || "",
        answers: { ...answers },
        copy: {
          headline: copy.headline || "",
          subline:  copy.body     || "",
          cta:      copy.cta      || "Learn more",
        },
      }),
    });
    const j = await r.json().catch(() => ({}));
    const url = j?.urls?.[0] || null;
    console.log("[INLINE_AGENT_IMAGE_NORMALIZED]", { angle, url: url?.slice(0, 60), ok: j.ok });
    return url;
  } catch (e) {
    console.warn("[INLINE_AGENT_IMAGE_NORMALIZED] failed:", e?.message);
    return null;
  }
}

async function loadContext(adminClientId) {
  const url = adminClientId
    ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
    : "/api/campaign-context";
  const r = await fetch(url, { credentials: "include", headers: getSid() });
  const j = await r.json().catch(() => ({}));
  return j.ok ? j.context : null;
}

async function getLLMRec(adminClientId, campaignId, biz, offer, service) {
  const prompt = [
    `You are a Meta ads expert. Write 2-3 sentences recommending a creative testing strategy for ${biz || "this business"}.`,
    offer   ? `Offer: ${offer}.`   : "",
    service ? `Service: ${service}.` : "",
    "Recommend a 3-ad creative angle test: offer angle, problem/pain angle, local trust angle.",
    "Mention that this uses website traffic objective, 1 campaign, 1 ad set, 3 ads. Be specific and concise.",
  ].filter(Boolean).join(" ");

  const r = await fetch("/api/ad-agent/chat", {
    method: "POST", credentials: "include", headers: jHdr(),
    body: JSON.stringify({
      message: prompt, history: [],
      ...(adminClientId ? { adminClientId } : {}),
      ...(campaignId && campaignId !== "__DRAFT__" ? { selectedCampaignId: campaignId } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.reply || null;
}

async function saveDraft(adminClientId, draft) {
  const r = await fetch("/api/campaign-context/save-creative-draft", {
    method: "POST", credentials: "include", headers: jHdr(),
    body: JSON.stringify({ adminClientId, creativeDraft: draft }),
  });
  const j = await r.json().catch(() => ({}));
  console.log("[INLINE_AGENT_DRAFT_SAVE]", { ok: j.ok, error: j.error });
  return j;
}

/* ─── Markdown-lite ──────────────────────────────────────────────────────── */
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

/* ─── Chip ───────────────────────────────────────────────────────────────── */
function Chip({ label, onClick, primary }) {
  return (
    <button onClick={onClick} style={{
      padding: "6px 13px", borderRadius: 20,
      border: primary ? "none" : "1px solid " + BORDER,
      background: primary ? ACCENT : "#fff",
      color: primary ? "#fff" : TEXT,
      fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      {label}
    </button>
  );
}

/* ─── Creative card ──────────────────────────────────────────────────────── */
function CreativeCard({ c, expanded, onToggle }) {
  return (
    <div onClick={onToggle} style={{
      flex: "0 0 195px", maxWidth: 195, cursor: "pointer",
      background: "#fff", borderRadius: 14, overflow: "hidden",
      border: expanded ? `2px solid ${ACCENT}` : "1px solid #e5e7eb",
      boxShadow: "0 2px 8px rgba(0,0,0,0.05)", transition: "border 0.12s",
    }}>
      {c.imageUrl ? (
        <img src={c.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          onError={(e) => { e.target.style.display = "none"; }} />
      ) : (
        <div style={{ aspectRatio: "1/1", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 28 }}>
          <FaRobot />
        </div>
      )}
      <div style={{ padding: "10px 11px" }}>
        <div style={{ display: "inline-block", background: "#eef2ff", color: ACCENT, fontSize: 10, fontWeight: 800, borderRadius: 4, padding: "2px 6px", marginBottom: 5 }}>
          {c.angleLabel}
        </div>
        <div style={{ fontWeight: 800, fontSize: 12, color: c.headline ? TEXT : "#ef4444", lineHeight: 1.3, marginBottom: 3 }}>
          {c.headline || "⚠ incomplete"}
        </div>
        {expanded ? (
          <>
            <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.5, marginBottom: 3 }}>{c.body}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT }}>CTA: {c.cta}</div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: SOFT }}>
            {(c.body || "").slice(0, 50)}{(c.body || "").length > 50 ? "…" : ""}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>{expanded ? "▲ collapse" : "▼ expand"}</div>
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
          <span style={{ fontSize: 12, color: SOFT }}>{creatives.length} ads</span>
          <button onClick={() => ref.current?.scrollBy({ left: 210, behavior: "smooth" })}
            style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 }}>
            <FaChevronRight />
          </button>
        </div>
      )}
      <div ref={ref} style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "thin" }}>
        {creatives.map((c, i) => (
          <CreativeCard key={c.id || i} c={c} expanded={exp === i} onToggle={() => setExp(exp === i ? -1 : i)} />
        ))}
      </div>
    </div>
  );
}

/* ─── CRITICAL: InputBox is a MODULE-LEVEL component (not inside InlineAdAgent).
      If defined inside the parent, React sees a new type every render
      → unmounts/remounts → focus lost after every character typed.         ─── */
const InputBox = memo(function InputBox({ value, onChange, onKeyDown, onSubmit, disabled, large, textRef }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", width: "100%", maxWidth: large ? 680 : "100%" }}>
      <textarea
        ref={textRef}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={disabled ? "Generating…" : "Ask me to create, change, or launch your campaign…"}
        disabled={disabled}
        rows={large ? 2 : 1}
        style={{
          flex: 1, padding: large ? "16px 20px" : "11px 15px",
          border: "1px solid " + BORDER, borderRadius: large ? 16 : 12,
          fontSize: large ? 15 : 14, fontFamily: FONT, resize: "none",
          outline: "none", background: large ? "#fff" : "#f9fafb",
          color: TEXT, lineHeight: 1.5, maxHeight: 140, overflowY: "auto",
          boxShadow: large ? "0 2px 20px rgba(0,0,0,0.07)" : "none",
        }}
        onInput={(e) => {
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
        }}
      />
      <button onClick={onSubmit} disabled={!value.trim() || disabled} style={{
        width: large ? 50 : 42, height: large ? 50 : 42, borderRadius: 12, border: "none", flexShrink: 0,
        background: value.trim() && !disabled ? ACCENT : "#e5e7eb",
        cursor: value.trim() && !disabled ? "pointer" : "not-allowed",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <FaPaperPlane style={{ color: value.trim() && !disabled ? "#fff" : "#9ca3af", fontSize: large ? 16 : 14 }} />
      </button>
    </div>
  );
});

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,
  selectedCampaignId,
  onCreativesGenerated,
  onGoToCreatives,
  onGoToCampaign,
}) {
  const clientRef = useRef(adminClientInfo);
  useEffect(() => { clientRef.current = adminClientInfo; }, [adminClientInfo]);

  const [msgs,       setMsgs]      = useState([]);
  const [input,      setInput]     = useState("");
  const [sending,    setSending]   = useState(false);
  const [generating, setGenerating]= useState(false);
  const [statusMsg,  setStatusMsg] = useState("");
  const [phase,      setPhase]     = useState("init");
  const [pendingN,   setPendingN]  = useState(null);
  const [creatives,  setCreatives] = useState([]);
  const [intakeCtx,  setIntakeCtx] = useState(null);
  const [greeting,   setGreeting]  = useState("");

  const bottomRef = useRef(null);
  const textRef   = useRef(null);
  const timerRef  = useRef(null);
  const loaded    = useRef(false);

  const push = useCallback((m) =>
    setMsgs((p) => [...p, { _k: Date.now() + Math.random(), ...m }]), []);

  const scroll = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  /* Load once ─────────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (loaded.current) return;
    if (!adminClientId && !adminClientInfo) return;
    loaded.current = true;
    load();
  // eslint-disable-next-line
  }, [adminClientId, adminClientInfo]);

  async function load() {
    let ctx = null;
    try { ctx = await loadContext(adminClientId); } catch {}
    setIntakeCtx(ctx);

    const ci    = clientRef.current;
    const pi    = ci?.premiumIntake || {};
    const biz   = pi.businessName || ctx?.businessName || ci?.displayName || adminClientId?.split("@")[0] || "there";
    const offer  = pi.currentSpecialOrOffer || ctx?.offer    || "";
    const service= pi.mainServices          || ctx?.industry || "";
    const area   = pi.serviceArea           || ctx?.serviceArea || "";

    const g = `Hey — ready to create your campaign${biz && biz !== "there" ? ` for **${biz}**` : ""}? 👋`;
    setGreeting(g);
    console.log("[INLINE_AGENT_CONTEXT]", { biz, offer, service, area, url: pi.websiteUrl || ctx?.websiteUrl || "" });

    // LLM recommendation in background
    let rec = null;
    try { rec = await getLLMRec(adminClientId, selectedCampaignId, biz, offer, service); } catch {}
    if (!rec) {
      rec = `For **${biz}**'s first campaign, I recommend a **website traffic** campaign focused on driving qualified visitors to your landing page. I'd start with a 3-ad creative test: one ad leading with ${offer ? "the **" + offer + "** offer" : "your best offer"}, one speaking to customer pain, and one focused on local expertise — all inside one campaign and one ad set.`;
    }

    // Set intake ctx with enriched fields
    setIntakeCtx({ ...ctx, _pi: pi, _biz: biz, _offer: offer, _service: service, _area: area, _rec: rec });

    // Try to restore saved draft
    let restored = false;
    try {
      const url = adminClientId
        ? `/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`
        : "/api/campaign-context/creative-draft";
      const dr = await fetch(url, { credentials: "include", headers: getSid() });
      const dj = await dr.json().catch(() => ({}));
      if (dj.ok && dj.creativeDraft?.creativeSet?.length) {
        const saved = dj.creativeDraft;
        setCreatives(saved.creativeSet);
        onCreativesGenerated?.({ images: saved.images || [], creativeSet: saved.creativeSet, creativeTestCount: saved.creativeSet.length });
        push({ role: "assistant", content: `Welcome back! I found your **${saved.creativeSet.length} saved creatives** from last time.` });
        push({ role: "assistant", type: "chips", chips: [
          { label: "View Creatives", action: "go-creatives" },
          { label: "Campaign & Launch →", action: "go-campaign", primary: true },
          { label: "Regenerate", action: "regen" },
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

  /* Status rotation ─────────────────────────────────────────────────────── */
  function startStatus() {
    let i = 0;
    setStatusMsg(STATUS_MSGS[0]);
    timerRef.current = setInterval(() => {
      i = (i + 1) % STATUS_MSGS.length;
      setStatusMsg(STATUS_MSGS[i]);
    }, 2000);
  }
  function stopStatus() { clearInterval(timerRef.current); setStatusMsg(""); }

  /* Intent detection ────────────────────────────────────────────────────── */
  function intent(txt) {
    const t = txt.toLowerCase().trim();
    const nm = t.match(/\b([1-4])\b/);
    const n  = nm ? parseInt(nm[1]) : null;

    if (/\byes\b|generate\s*now|do\s*it|go\s*ahead|confirm|sounds good|let's go|ok\b|okay\b/i.test(t)) return { type: "confirm" };
    if (/generat|creat|make|build|launch/i.test(t) && n) return { type: "count", n };
    if (/generat|creat|make|build/i.test(t)) return { type: "count", n: pendingN || 3 };
    if (/choose\s*count|pick\s*(number|count)|different\s*count/i.test(t)) return { type: "choose-count" };
    if (/recommend|strateg|suggest|what.*do/i.test(t)) return { type: "strategy" };
    if (/show.*creative|creative.*tab|view.*creative/i.test(t)) return { type: "go-creatives" };
    if (/campaign.*tab|go.*campaign|launch/i.test(t)) return { type: "go-campaign" };
    if (/change|different|regen|start over/i.test(t)) return { type: "regen" };
    return { type: "llm" };
  }

  /* Actions ─────────────────────────────────────────────────────────────── */
  function doAction(action) {
    if (action === "go-creatives")  { onGoToCreatives?.(); return; }
    if (action === "go-campaign")   { onGoToCampaign?.();  return; }
    if (action === "confirm")       { if (pendingN) startGen(pendingN); return; }
    if (action === "regen")         { showCountPicker(); return; }
    if (action === "choose-count")  { showCountPicker(); return; }
    if (action.startsWith("count-")) { askConfirm(parseInt(action.replace("count-", ""))); return; }
  }

  function showStrategyRec() {
    const rec = intakeCtx?._rec || "I recommend a 3-ad creative test: offer, problem, and local trust angles.";
    push({ role: "assistant", content: rec });
    push({
      role: "assistant", type: "chips",
      content: "What would you like to do?",
      chips: [
        { label: "Generate 3 creatives", action: "count-3", primary: true },
        { label: "Choose count", action: "choose-count" },
      ],
    });
    setPhase("chat"); scroll();
  }

  function showCountPicker() {
    push({ role: "assistant", type: "count-pick", content: "How many ad creatives do you want to test?" });
    setPhase("count-pick"); scroll();
  }

  function askConfirm(n) {
    setPendingN(n);
    const angles = getAngles(n).map((a) => `  • ${a.label}`).join("\n");
    push({
      role: "assistant", type: "chips",
      content: `A **${n}-ad creative test** — each ad gets its own image and copy:\n${angles}\n\nEach angle gets a unique visual. Ready to generate?`,
      chips: [
        { label: "Yes, generate now", action: "confirm", primary: true },
        { label: "Change count", action: "choose-count" },
      ],
    });
    setPhase("confirm"); scroll();
  }

  /* Generation ─────────────────────────────────────────────────────────── */
  async function startGen(n) {
    setPhase("generating"); setGenerating(true); startStatus(); scroll();

    const ci   = clientRef.current;
    const pi   = ci?.premiumIntake || {};
    const ctx  = intakeCtx || {};
    const piUrl = pi.websiteUrl || ctx.websiteUrl || "";

    const answers = {
      businessName:  pi.businessName  || ctx.businessName  || "",
      industry:      pi.mainServices  || ctx.industry      || "",
      offer:         pi.currentSpecialOrOffer || ctx.offer  || "",
      mainBenefit:   pi.mainServices  || ctx.mainBenefit   || "",
      city:          (pi.targetCities || "").split(",")[0]?.trim() || ctx.city || "",
      state:         ctx.state || "",
      idealCustomer: pi.idealCustomer || ctx.idealCustomer || "",
      serviceArea:   pi.serviceArea   || ctx.serviceArea   || "",
      cta:           ctx.cta || "Learn more",
      url:           piUrl, websiteUrl: piUrl,
      phone:         pi.mainPhone || ctx.phoneNumber || "",
    };

    const angleList = getAngles(n);

    // Generate copy for all angles in parallel
    const copyResults = await Promise.allSettled(
      angleList.map((a) => fetchCopy(answers, a.id))
    );

    // Generate a UNIQUE image per angle using that angle's specific copy
    // (not a shared image — each creative gets its own visual concept)
    const imageResults = await Promise.allSettled(
      angleList.map((a, i) => {
        const raw  = copyResults[i].status === "fulfilled" ? copyResults[i].value : {};
        const copy = normCopy(raw);
        return fetchImage(answers, copy, a.id);
      })
    );

    // Build creatives
    const newCreatives = angleList.map((angle, i) => {
      const raw  = copyResults[i].status  === "fulfilled" ? copyResults[i].value  : {};
      const copy = normCopy(raw);
      const imgUrl = imageResults[i].status === "fulfilled" ? imageResults[i].value : null;
      return {
        id:            `c-${angle.id}-${Date.now()}-${i}`,
        angle:         angle.id,
        angleLabel:    angle.label,
        headline:      copy.headline,
        body:          copy.body,
        cta:           copy.cta,
        imageUrl:      imgUrl || "",
        link:          piUrl,
        mediaSelection:"image",
        creativeSource:"ai_agent",
        status:        "draft",
      };
    });

    // Warn if images are duplicated (indicates generation issue)
    const urls = newCreatives.map((c) => c.imageUrl).filter(Boolean);
    const uniqueUrls = new Set(urls);
    if (urls.length > 1 && uniqueUrls.size < urls.length) {
      console.warn("[INLINE_AGENT_DUPLICATE_IMAGES]", { urls, uniqueCount: uniqueUrls.size });
    }

    stopStatus(); setGenerating(false);

    const hasContent = newCreatives.some((c) => String(c.headline || "").trim() || String(c.body || "").trim());
    if (!hasContent) {
      console.warn("[INLINE_AGENT_GENERATE_FAIL]", newCreatives);
      push({ role: "assistant", content: "⚠️ Copy generation failed — the AI returned no usable content. Please check that the client intake has a business name, industry, and service description, then try again." });
      push({ role: "assistant", type: "chips", chips: [
        { label: "Try again", action: "count-" + n, primary: true },
        { label: "Choose different count", action: "choose-count" },
      ]});
      setPhase("chat"); return;
    }

    console.log("[INLINE_AGENT_GENERATE_SUCCESS]", {
      count: newCreatives.length,
      imageUrls: newCreatives.map((c) => c.imageUrl?.slice(0, 40)),
      headlines: newCreatives.map((c) => c.headline),
    });

    setCreatives(newCreatives);
    const images = newCreatives.map((c) => c.imageUrl).filter(Boolean);
    onCreativesGenerated?.({ images, creativeSet: newCreatives, creativeTestCount: n });

    // Save to backend
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
      headline: newCreatives[0]?.headline || "", body: newCreatives[0]?.body || "",
      link: piUrl, answers, initialTestStrategy: strategy,
      savedAt: Date.now(), status: "draft",
    });

    push({ role: "assistant", type: "creatives",
      content: `Here are your **${n} ad concepts** — each with a unique image and copy angle:`,
      creatives: newCreatives });
    push({ role: "assistant", type: "chips",
      content: `Creatives saved ✓ — Creatives tab is updated.\nGo to Campaign to set budget and launch: 1 campaign · 1 ad set · ${n} ads.`,
      chips: [
        { label: "View Creatives", action: "go-creatives" },
        { label: "Campaign & Launch →", action: "go-campaign", primary: true },
      ],
    });
    setPhase("done"); scroll();
  }

  /* Send typed message ──────────────────────────────────────────────────── */
  async function send() {
    const txt = input.trim();
    if (!txt || sending || generating) return;

    setInput("");
    if (phase === "welcome" || phase === "init") setPhase("chat");

    push({ role: "user", content: txt });
    scroll();

    const it = intent(txt);

    if (it.type === "confirm" && pendingN)      { startGen(pendingN); return; }
    if (it.type === "count")                    { askConfirm(it.n || 3); return; }
    if (it.type === "choose-count")             { showCountPicker(); return; }
    if (it.type === "strategy")                 { showStrategyRec(); return; }
    if (it.type === "go-creatives")             { push({ role: "assistant", content: "Switching to Creatives!" }); setTimeout(() => onGoToCreatives?.(), 400); return; }
    if (it.type === "go-campaign")              { push({ role: "assistant", content: "Heading to Campaign!" });    setTimeout(() => onGoToCampaign?.(), 400); return; }
    if (it.type === "regen")                    { showCountPicker(); return; }

    // LLM fallback
    setSending(true);
    try {
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include", headers: jHdr(),
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

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  /* Render helpers ─────────────────────────────────────────────────────── */
  function renderMsg(m) {
    const isAI = m.role === "assistant";
    return (
      <div key={m._k} style={{ display: "flex", justifyContent: isAI ? "flex-start" : "flex-end", marginBottom: 14 }}>
        <div style={{ maxWidth: m.type === "creatives" ? "100%" : "80%", display: "flex", flexDirection: "column", alignItems: isAI ? "flex-start" : "flex-end", gap: 7 }}>
          {isAI && m.content && (
            <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: TEXT, fontSize: 14, lineHeight: 1.65 }}>
              <Md text={m.content} />
            </div>
          )}
          {m.type === "creatives" && m.creatives?.length > 0 && (
            <div style={{ marginTop: 4, width: "100%" }}>
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
                  onClick={() => { push({ role: "user", content: c.label }); doAction(c.action); }} />
              ))}
            </div>
          )}
          {!isAI && (
            <div style={{ background: USER_BG, borderRadius: "18px 18px 4px 18px", padding: "11px 16px", color: "#fff", fontSize: 14, lineHeight: 1.65 }}>
              {m.content}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ─── Layout ────────────────────────────────────────────────────────────── */
  const inputDisabled = sending || generating;
  const showTopBar = phase === "done" || creatives.length > 0;

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 130px)", minHeight: 480,
      fontFamily: FONT, background: "#fff",
      border: "1px solid " + BORDER, borderRadius: 20,
      overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
    }}>
      {/* Header */}
      <div style={{
        padding: "13px 20px", borderBottom: "1px solid #f1f5f9",
        display: "flex", alignItems: "center", gap: 10, background: "#fff",
      }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <FaRobot style={{ color: "#fff", fontSize: 15 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: TEXT }}>AI Ad Agent</div>
          <div style={{ fontSize: 11, color: SOFT }}>
            {generating ? statusMsg :
             phase === "done" ? `${creatives.length} creatives ready` :
             "Smartemark campaign brain"}
          </div>
        </div>
        {showTopBar && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={onGoToCreatives} style={hBtn("#f1f5f9", TEXT)}>Creatives</button>
            <button onClick={onGoToCampaign}  style={hBtn(ACCENT, "#fff")}>Launch →</button>
          </div>
        )}
      </div>

      {/* Welcome (Claude-style centered) */}
      {(phase === "welcome" || phase === "init") && (
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: "0 24px 32px",
          background: "#fafafa",
        }}>
          {phase === "init" ? (
            <div style={{ color: SOFT, fontSize: 14 }}>Loading your intake…</div>
          ) : (
            <div style={{ maxWidth: 680, width: "100%", textAlign: "center" }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: "linear-gradient(135deg,#eef2ff,#e0e7ff)",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 20px", fontSize: 24, color: ACCENT,
              }}>
                <FaRobot />
              </div>
              <h2 style={{ fontSize: 26, fontWeight: 800, color: TEXT, margin: "0 0 10px", lineHeight: 1.25 }}>
                <Md text={greeting || "Hey — ready to create your campaign? 👋"} />
              </h2>
              <p style={{ color: SOFT, fontSize: 14, lineHeight: 1.7, margin: "0 0 28px", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
                <Md text={intakeCtx?._rec || "I'll help you build a multi-angle ad campaign from your intake data."} />
              </p>
              {/* Large centered input — primary interaction */}
              <InputBox
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                onSubmit={send}
                disabled={inputDisabled}
                large={true}
                textRef={null}
              />
              {/* Subtle suggestion chips — secondary only */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 14 }}>
                {[
                  { label: "Generate campaign", fn: () => { setInput("Generate 3 recommended creatives"); } },
                  { label: "Recommend strategy", fn: () => { setInput("What strategy do you recommend?"); } },
                  { label: "Review intake",       fn: () => { setInput("What does my intake say?"); } },
                ].map((c) => (
                  <button key={c.label} onClick={c.fn} style={{
                    padding: "6px 13px", borderRadius: 20, border: "1px solid " + BORDER,
                    background: "#fff", color: SOFT, fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: FONT,
                  }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat thread */}
      {phase !== "welcome" && phase !== "init" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px", background: "#fafafa" }}>
            {msgs.map(renderMsg)}
            {generating && (
              <div style={{ display: "flex", marginBottom: 14 }}>
                <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "11px 16px", color: SOFT, fontSize: 14, fontStyle: "italic" }}>
                  ⟳ {statusMsg}
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
              onSubmit={send}
              disabled={inputDisabled}
              large={false}
              textRef={textRef}
            />
          </div>
        </>
      )}
    </div>
  );
}

const hBtn = (bg, color) => ({
  padding: "6px 13px", borderRadius: 7, border: "none",
  background: bg, color, fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: FONT,
});
