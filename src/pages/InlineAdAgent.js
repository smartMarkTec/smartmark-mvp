/* eslint-disable */
/**
 * InlineAdAgent — Claude/ChatGPT-style AI campaign creation inside CampaignSetup.
 *
 * Fixes in this version:
 *  - Chat history saved/restored via /api/ad-agent/history
 *  - Draft restore is silent (no "Welcome back" chat message)
 *  - Per-creative image and copy regeneration via chat intent
 *  - Per-creative image upload/replace
 *  - Clear Drafts clears backend + localStorage + state
 *  - InputBox is module-level (no focus-loss typing bug)
 */
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaHistory, FaPaperPlane, FaRobot, FaTimes, FaUpload, FaSyncAlt } from "react-icons/fa";
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

/* ─── Design ─────────────────────────────────────────────────────────────── */
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

/* ─── Module-level helper ────────────────────────────────────────────────── */
function getSid() {
  const s = (localStorage.getItem("sm_sid_v1") || "").trim();
  return s ? { "x-sm-sid": s } : {};
}
function jh() { return { "Content-Type": "application/json", ...getSid() }; }

async function clearBackendDraft(adminClientId) {
  // Use the real DELETE route — POST with empty arrays would fail validation
  const url = adminClientId
    ? `/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`
    : "/api/campaign-context/creative-draft";
  await fetch(url, { method: "DELETE", credentials: "include", headers: jh() }).catch(() => {});
}

/* ─── InputBox — module-level so React never remounts it ──────────────────── */
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
          border: "1px solid " + BORDER, borderRadius: large ? 18 : 14,
          fontSize: large ? 16 : 14, fontFamily: FONT, resize: "none",
          outline: "none", background: large ? "#fff" : "#f8f9fa",
          color: TEXT, lineHeight: 1.55, maxHeight: 140, overflowY: "auto",
          boxShadow: large ? "0 4px 24px rgba(0,0,0,0.08)" : "none",
        }}
        onInput={(e) => {
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
        }}
      />
      <button onClick={onSubmit} disabled={!value.trim() || disabled} style={{
        width: large ? 52 : 44, height: large ? 52 : 44,
        borderRadius: 14, border: "none", flexShrink: 0,
        background: value.trim() && !disabled ? ACCENT : "#e5e7eb",
        cursor: value.trim() && !disabled ? "pointer" : "not-allowed",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
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

/* ─── Creative card with per-creative actions ────────────────────────────── */
function CreativeCard({ c, idx, expanded, onToggle, onRegenImage, onRegenCopy, onUploadImage, regenning }) {
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result;
      if (!dataUrl) return;
      // Upload to media server
      try {
        const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
        const r = await fetch("/api/media/upload", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
          body: JSON.stringify({ dataUrl }),
        });
        const j = await r.json().catch(() => ({}));
        const url = j?.urls?.[0] || null;
        if (url) onUploadImage(idx, url);
      } catch {}
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const spinning = regenning === idx;

  return (
    <div style={{
      flex: "0 0 210px", maxWidth: 210,
      background: "#fff", borderRadius: 16, overflow: "hidden",
      border: expanded ? `2px solid ${ACCENT}` : "1px solid #e8eaf0",
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)", transition: "border 0.12s",
    }}>
      {/* Image area */}
      <div style={{ position: "relative" }}>
        {c.imageUrl ? (
          <img src={c.imageUrl} alt="" style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
            onError={(e) => { e.target.style.display = "none"; }} />
        ) : (
          <div style={{ aspectRatio: "1/1", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", fontSize: 26 }}>
            <FaRobot />
          </div>
        )}
        {/* Per-image action buttons */}
        <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 4 }}>
          <button title="Regenerate image" onClick={() => onRegenImage(idx)}
            disabled={spinning}
            style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
            <FaSyncAlt style={{ animation: spinning ? "spin 1s linear infinite" : "none" }} />
          </button>
          <button title="Upload image" onClick={() => fileRef.current?.click()}
            style={{ width: 26, height: 26, borderRadius: 6, border: "none", background: "rgba(255,255,255,0.9)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>
            <FaUpload />
          </button>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>

      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "inline-block", background: "#eef2ff", color: ACCENT, fontSize: 10, fontWeight: 800, borderRadius: 5, padding: "2px 7px", marginBottom: 5 }}>
          Ad {idx + 1} · {c.angleLabel}
        </div>
        <div style={{ fontWeight: 800, fontSize: 12, color: c.headline ? TEXT : "#ef4444", lineHeight: 1.3, marginBottom: 3, cursor: "pointer" }} onClick={onToggle}>
          {c.headline || "⚠ no headline"}
        </div>
        {expanded ? (
          <>
            <div style={{ fontSize: 11, color: SOFT, lineHeight: 1.5, marginBottom: 4 }}>{c.body}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 4 }}>CTA: {c.cta}</div>
            <button onClick={() => onRegenCopy(idx)} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: SOFT }}>
              Regenerate copy
            </button>
          </>
        ) : (
          <div style={{ fontSize: 11, color: SOFT, cursor: "pointer" }} onClick={onToggle}>
            {(c.body || "").slice(0, 55)}{(c.body || "").length > 55 ? "…" : ""}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4, cursor: "pointer" }} onClick={onToggle}>
          {expanded ? "▲ collapse" : "▼ expand"}
        </div>
      </div>
    </div>
  );
}

function CreativeCarousel({ creatives, onRegenImage, onRegenCopy, onUploadImage, regenning }) {
  const [exp, setExp] = useState(-1);
  const ref = useRef(null);
  return (
    <div>
      {creatives.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
          <button onClick={() => ref.current?.scrollBy({ left: -225, behavior: "smooth" })}
            style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 }}>
            <FaChevronLeft />
          </button>
          <span style={{ fontSize: 12, color: SOFT, fontWeight: 600 }}>{creatives.length} ads — scroll to see all</span>
          <button onClick={() => ref.current?.scrollBy({ left: 225, behavior: "smooth" })}
            style={{ width: 26, height: 26, border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: SOFT, fontSize: 11 }}>
            <FaChevronRight />
          </button>
        </div>
      )}
      <div ref={ref} style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin" }}>
        {creatives.map((c, i) => (
          <CreativeCard key={c.id || i} c={c} idx={i}
            expanded={exp === i} onToggle={() => setExp(exp === i ? -1 : i)}
            onRegenImage={onRegenImage} onRegenCopy={onRegenCopy} onUploadImage={onUploadImage}
            regenning={regenning}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Inject spin keyframe once ──────────────────────────────────────────── */
if (typeof document !== "undefined" && !document.getElementById("sm-spin-kf")) {
  const s = document.createElement("style");
  s.id = "sm-spin-kf";
  s.textContent = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,
  selectedCampaignId,
  onCreativesGenerated,
  onGoToCreatives,
  onGoToCampaign,
  onGoToSettings,
  onSetBudget,
  onSetCampaignName,
  onRefreshCampaigns,
  onChallengerDraftsCreated,
}) {
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
  const [ctx,        setCtx]       = useState(null);
  const [regenning,  setRegenning] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [abLightbox, setAbLightbox]  = useState(null); // { src, title } for fullscreen

  const bottomRef = useRef(null);
  const timerRef  = useRef(null);
  const loaded    = useRef(false);

  const push = useCallback(
    (m) => setMsgs((p) => [...p, { _k: Date.now() + Math.random(), ...m }]),
    []
  );
  const scroll = () =>
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);

  /* ─── Save chat history ──────────────────────────────────────────────── */
  const saveHistory = useCallback((newMsgs) => {
    const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const acId = adminClientId;
    const url = acId
      ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(acId)}`
      : "/api/ad-agent/history";
    // Only save plain text messages (not complex type objects like "creatives")
    const toSave = newMsgs.filter((m) => typeof m.content === "string" && m.type !== "creatives");
    fetch("/api/ad-agent/history", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
      body: JSON.stringify({
        messages: toSave,
        ...(acId ? { adminClientId: acId } : {}),
      }),
    }).catch(() => {});
  }, [adminClientId]);

  // Save whenever messages change (debounced by 500ms)
  const saveTmr = useRef(null);
  useEffect(() => {
    if (!msgs.length) return;
    clearTimeout(saveTmr.current);
    saveTmr.current = setTimeout(() => saveHistory(msgs), 500);
    return () => clearTimeout(saveTmr.current);
  }, [msgs, saveHistory]);

  /* ─── Initial load ───────────────────────────────────────────────────── */
  useEffect(() => {
    if (loaded.current) return;
    // Admin-client mode: wait until adminClientInfo has loaded before proceeding
    // (it's fetched async from /api/admin/clients/:id in CampaignSetup).
    // Regular user (no adminClientId): adminClientInfo is always null — do NOT gate on it.
    if (adminClientId && !adminClientInfo) return;
    loaded.current = true;
    initialLoad();
  // eslint-disable-next-line
  }, [adminClientId, adminClientInfo]);

  async function initialLoad() {
    setPhase("loading");
    const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const hdr = sid ? { "x-sm-sid": sid } : {};
    let resolvedPhase = "welcome"; // always set a phase in finally

    try {
      // 1) Load intake context
      let ctxRecord = null;
      try {
        const url = adminClientId
          ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
          : "/api/campaign-context";
        const r = await fetch(url, { credentials: "include", headers: hdr });
        const j = await r.json().catch(() => ({}));
        if (j.ok) ctxRecord = j.context;
      } catch {}

      const ci  = clientRef.current;
      const biz = ci?.premiumIntake?.businessName || ctxRecord?.businessName || ci?.displayName || adminClientId?.split("@")[0] || "";
      const hasIntake = !!(ctxRecord?.businessName || ctxRecord?.industry || ci?.premiumIntake?.businessName);

      console.debug("[AI_AGENT_CONTEXT_LOADED]", {
        hasContext: !!ctxRecord, hasIntake, isAdminMode: !!adminClientId, biz,
        loadingFalse: "will be set in finally",
      });

      const enriched = {
        ...(ctxRecord || {}),
        _biz:       biz,
        _offer:     ci?.premiumIntake?.currentSpecialOrOffer || ctxRecord?.offer    || "",
        _service:   ci?.premiumIntake?.mainServices          || ctxRecord?.industry  || "",
        _hasIntake: hasIntake,
        _restoredCreatives: null,
      };
      setCtx(enriched);

      // No intake for regular users — prompt to add business info
      if (!hasIntake && !adminClientId) {
        setMsgs([{ _k: 1, role: "assistant", type: "chips",
          content: "To create a campaign, I need your business info first. Add it in **Account → Business Info**.",
          chips: [{ label: "Go to Settings", action: "go-settings" }],
        }]);
        resolvedPhase = "done";
        scroll();
        return;
      }

      // 2) Restore saved draft SILENTLY
      let hadDraft = false;
      try {
        const url = adminClientId
          ? `/api/campaign-context/creative-draft?adminClientId=${encodeURIComponent(adminClientId)}`
          : "/api/campaign-context/creative-draft";
        const r = await fetch(url, { credentials: "include", headers: hdr });
        const j = await r.json().catch(() => ({}));
        const savedSet = j.creativeDraft?.creativeSet;
        const hasRealContent = Array.isArray(savedSet) && savedSet.length > 0 &&
          savedSet.some((c) => String(c?.headline || "").trim() || String(c?.imageUrl || "").trim());
        if (j.ok && hasRealContent) {
          const saved = j.creativeDraft;
          setCreatives(saved.creativeSet);
          onCreativesGenerated?.({ images: saved.images || [], creativeSet: saved.creativeSet, creativeTestCount: saved.creativeSet.length });
          if (saved.campaignName) onSetCampaignName?.(saved.campaignName);
          if (saved.budget)       onSetBudget?.(saved.budget);
          enriched._restoredCreatives = saved.creativeSet;
          hadDraft = true;
        }
      } catch {}

      // 3) Restore chat history
      let hadHistory = false;
      try {
        const histUrl = adminClientId
          ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(adminClientId)}`
          : "/api/ad-agent/history";
        const r = await fetch(histUrl, { credentials: "include", headers: hdr });
        const j = await r.json().catch(() => ({}));
        if (j.ok && Array.isArray(j.history) && j.history.length > 0) {
          setMsgs(j.history.map((m) => ({ ...m, _k: Math.random() })));
          hadHistory = true;
        }
      } catch {}

      if (!hadHistory && !hadDraft) {
        resolvedPhase = "welcome";
      } else if (!hadHistory && hadDraft) {
        const restoredSet = enriched._restoredCreatives;
        if (restoredSet?.length) {
          push({ role: "assistant", type: "creatives",
            content: `Your **${restoredSet.length} saved creatives** are ready:`, creatives: restoredSet });
        }
        push({ role: "assistant", type: "chips", content: "What would you like to do?", chips: [
          { label: "View Creatives", action: "go-creatives" },
          { label: "Campaign & Launch →", action: "go-campaign", primary: true },
          { label: "Generate new set", action: "regen" },
        ]});
        resolvedPhase = "done";
      } else if (hadHistory && hadDraft) {
        const restoredSet = enriched._restoredCreatives;
        if (restoredSet?.length) {
          push({ role: "assistant", type: "creatives",
            content: `Your **${restoredSet.length} saved creatives** (restored):`, creatives: restoredSet });
          push({ role: "assistant", type: "chips", content: null, chips: [
            { label: "View Creatives", action: "go-creatives" },
            { label: "Campaign & Launch →", action: "go-campaign", primary: true },
          ]});
        }
        resolvedPhase = "done";
      } else {
        resolvedPhase = "done";
      }
    } catch (err) {
      console.warn("[AI_AGENT_CONTEXT_LOADED] initialLoad error:", err?.message);
      resolvedPhase = "welcome"; // fallback — never stay stuck on loading
    } finally {
      console.debug("[AI_AGENT_CONTEXT_LOADED]", { loadingFalse: true, resolvedPhase });
      setPhase(resolvedPhase);
      scroll();
    }
  }

  /* ─── Status rotation ────────────────────────────────────────────────── */
  function startStatus() {
    let i = 0;
    setGenMsg(GEN_MSGS[0]);
    timerRef.current = setInterval(() => {
      i = (i + 1) % GEN_MSGS.length;
      setGenMsg(GEN_MSGS[i]);
    }, 2000);
  }
  function stopStatus() { clearInterval(timerRef.current); setGenMsg(""); }

  /* ─── Intent detection ───────────────────────────────────────────────── */
  function detectIntent(txt) {
    const t = txt.toLowerCase().trim();

    // ── Hard bypass for explicit action commands ───────────────────────────
    // If the message contains a Meta ad ID (10+ digits), "control ad" reference,
    // or explicit test-type language, it must NEVER be routed to respondWithStrategy().
    // respondWithStrategy() replaces the user's text with a system prompt — wrong.
    // These messages must fall through to the LLM path that sends message: txt directly.
    if (
      /\b\d{10,}\b/.test(t) ||          // long numeric Meta ad ID
      /control\s*ad/i.test(t) ||         // "control ad"
      /headline-only|image-only/i.test(t) ||  // "headline-only challenger"
      /create.{0,50}challenger.*ad/i.test(t)  // "create ... challenger ads"
    ) {
      return { type: "llm" };
    }
    // ── End action command bypass ──────────────────────────────────────────

    const nm = t.match(/\b([1-4])\b/);
    const n  = nm ? parseInt(nm[1]) : null;

    if (/\byes\b|generate\s*now|do\s*it|go\s*ahead|confirm|sounds\s*good|let'?s\s*go|^ok$|^okay$/i.test(t)) return { type: "confirm" };
    if (/clear\s*(draft|creative|all)/i.test(t)) return { type: "clear" };

    // Per-creative regeneration: "regen ad 2 image", "regenerate image for ad 2", "redo image 3"
    const regenImgMatch = t.match(/regen(?:erate)?\s+(?:(?:the\s+)?(?:image|photo|visual|pic)\s+(?:for\s+)?(?:ad|creative)?\s*(\d+)|(?:ad|creative)\s*(\d+)\s+(?:image|photo|visual|pic))/i)
      || t.match(/(?:redo|change|replace)\s+(?:the\s+)?(?:image|photo|visual)\s+(?:for\s+)?(?:ad|creative)?\s*(\d+)/i);
    if (regenImgMatch) {
      const idx = parseInt(regenImgMatch[1] || regenImgMatch[2]) - 1;
      if (idx >= 0) return { type: "regen-image", idx };
    }

    // Per-creative copy regen: "regen copy for ad 1", "rewrite ad 2 copy"
    const regenCopyMatch = t.match(/regen(?:erate)?\s+(?:(?:the\s+)?(?:copy|headline|text|body)\s+(?:for\s+)?(?:ad|creative)?\s*(\d+)|(?:ad|creative)\s*(\d+)\s+(?:copy|headline|text|body))/i)
      || t.match(/(?:rewrite|redo|change)\s+(?:(?:the\s+)?(?:copy|headline|text|body)\s+(?:for\s+)?(?:ad|creative)?\s*(\d+)|(?:ad|creative)\s*(\d+)\s+(?:copy|headline|text|body))/i);
    if (regenCopyMatch) {
      const idx = parseInt(regenCopyMatch[1] || regenCopyMatch[2]) - 1;
      if (idx >= 0) return { type: "regen-copy", idx };
    }

    if (/generat|creat|make|build/i.test(t) && n) return { type: "count", n };
    if (/generat|creat|make.*campaign|build.*campaign|start.*campaign|i\s+want\s+to\s+creat/i.test(t)) return { type: "create" };
    if (/budget|spend|per\s*day|\$\d|\d+\s*(dollar|bucks?)/i.test(t)) {
      const b = parseBudget(t);
      if (b) return { type: "budget", value: b };
    }
    if (/view.*creative|show.*creative|creative.*tab/i.test(t)) return { type: "go-creatives" };
    if (/campaign.*tab|go.*campaign|launch|review.*campaign|ready\s+to\s+launch/i.test(t)) return { type: "go-campaign" };
    if (/metrics|how.*doing|performance|results|stats/i.test(t)) return { type: "metrics" };
    if (/recommend|strateg|suggest|what.*should|best.*approach/i.test(t)) return { type: "strategy" };
    if (/(?:generate\s+)?new\s+set|start\s*over|try\s*again|different\s+creative/i.test(t)) return { type: "regen" };
    return { type: "llm" };
  }

  /* ─── Actions ────────────────────────────────────────────────────────── */
  function doAction(action) {
    if (action === "go-creatives")  { onGoToCreatives?.(); return; }
    if (action === "go-campaign")   { onGoToCampaign?.();  return; }
    if (action === "go-settings")   { onGoToSettings?.();  return; }
    if (action === "confirm")       { if (pendingN) startGeneration(pendingN); return; }
    if (action === "regen")         { askHowMany(); return; }
    if (action === "clear")         { clearDrafts(); return; }
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
        { label: "Choose different count", action: "regen" },
      ],
    });
    setPhase("confirm"); scroll();
  }

  async function clearDrafts() {
    // SCOPE: only clears AI Agent draft state — never touches launched campaign records.
    // Launched creativeSet is stored in campaignCreativesMap / readCreativeMap (keyed by
    // real campaignId), which is separate from the draft keys cleared here.
    console.debug("[CLEAR_DRAFT_SCOPE]", {
      adminClientId, cleared: ["backend creative-draft", "chat history", "localStorage draft keys", "draftCreatives state"],
      notCleared: ["campaignCreativesMap", "readCreativeMap launched records", "campaign_creatives DB"],
    });

    // Clear backend creative draft
    if (adminClientId) await clearBackendDraft(adminClientId);
    // Clear chat history on backend
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const url = adminClientId
        ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(adminClientId)}`
        : "/api/ad-agent/history";
      await fetch(url, { method: "DELETE", credentials: "include", headers: sid ? { "x-sm-sid": sid } : {} });
    } catch {}
    // Clear localStorage draft backup (admin-client namespace only — NOT readCreativeMap)
    try {
      if (adminClientId) {
        const ns = `u:adminClient:${adminClientId}`;
        localStorage.removeItem(`${ns}:draft_form_creatives_v3`);
        localStorage.removeItem(`${ns}:sm_setup_creatives_backup_v1`);
      }
    } catch {}
    // Reset AI Agent draft state in parent (draftCreatives)
    // This does NOT affect campaignCreativesMap which holds launched campaign data.
    setCreatives([]);
    setMsgs([]);
    setPendingN(null);
    onCreativesGenerated?.({ images: [], creativeSet: [], creativeTestCount: 0 });
    onSetCampaignName?.("");
    setPhase("welcome");
    scroll();
  }

  async function respondWithStrategy() {
    setPhase("chat");
    setSending(true);
    scroll();

    const ci = clientRef.current;
    const pi = ci?.premiumIntake || {};
    const biz     = ctx?._biz     || pi.businessName  || "your business";
    const offer   = ctx?._offer   || pi.currentSpecialOrOffer || "";
    const service = ctx?._service || pi.mainServices  || "";
    const area    = pi.serviceArea || ctx?.serviceArea || "";
    const url     = pi.websiteUrl  || ctx?.websiteUrl  || "";

    const prompt = [
      `You are a Meta ads expert. The client is ${biz}.`,
      service ? `Service: ${service}.` : "",
      offer   ? `Current offer: ${offer}.` : "",
      area    ? `Service area: ${area}.` : "",
      url     ? `Landing page: ${url}.` : "",
      `The only supported campaign objective right now is website traffic (driving visitors to the landing page).`,
      `In 3–4 sentences, recommend a website traffic campaign strategy and creative testing plan.`,
      `Suggest a 3-ad test (offer angle, problem/pain angle, local trust angle) as the recommended first test.`,
      `Be concise and operator-like. End by asking if they want to generate the 3 ads.`,
    ].filter(Boolean).join(" ");

    let rec = null;
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
        body: JSON.stringify({ message: prompt, history: [], ...(adminClientId ? { adminClientId } : {}) }),
      });
      const j = await r.json().catch(() => ({}));
      if (j?.reply) rec = j.reply;
    } catch {}

    if (!rec) {
      const offerLine = offer ? `the **${offer}** offer` : "your best offer";
      rec = `For **${biz}**, I recommend a **website traffic campaign** focused on driving qualified visitors to your landing page. For the creative strategy, I suggest a 3-ad angle test: one leading with ${offerLine}, one speaking to the customer's pain, and one focused on local trust — all inside one campaign and one ad set.\n\nWould you like me to generate the 3 ads?`;
    }

    setSending(false);
    push({ role: "assistant", content: rec });
    push({ role: "assistant", type: "chips", content: null, chips: [
      { label: "Generate 3 ads (recommended)", action: "count-3", primary: true },
      { label: "Choose count", action: "regen" },
    ]});
    scroll();
  }

  /* ─── Full set generation ────────────────────────────────────────────── */
  async function startGeneration(n) {
    setPhase("generating"); setGenerating(true); startStatus(); scroll();

    const ci      = clientRef.current;
    const answers = buildIntakeAnswers(ci, ctx || {});

    let newCreatives = [];
    try {
      newCreatives = await generateCreativeSet(
        getAngles(n), answers,
        (angle) => setGenMsg(`Generating ${angle.label.toLowerCase()} visual…`)
      );
    } catch (e) { console.warn("[InlineAdAgent] generation error:", e?.message); }

    stopStatus(); setGenerating(false);

    const hasContent = newCreatives.some((c) => String(c.headline || "").trim() || String(c.body || "").trim());
    if (!hasContent) {
      push({ role: "assistant", content: "⚠️ Generation failed — the AI returned no copy. Check that the client intake has a business name and service, then try again." });
      push({ role: "assistant", type: "chips", chips: [{ label: "Try again", action: `count-${n}`, primary: true }]});
      setPhase("chat"); return;
    }

    const imgUrls = newCreatives.map((c) => c.imageUrl).filter(Boolean);
    if (imgUrls.length > 1 && new Set(imgUrls).size < imgUrls.length)
      console.warn("[INLINE_AGENT_DUPLICATE_IMAGES]", imgUrls);

    setCreatives(newCreatives);
    const images = imgUrls;
    onCreativesGenerated?.({ images, creativeSet: newCreatives, creativeTestCount: n });

    const suggestedName = suggestCampaignName(ci, ctx, n);
    onSetCampaignName?.(suggestedName);

    await saveCreativeDraft(adminClientId, {
      creativeSet: newCreatives, images,
      campaignName: suggestedName,
      headline: newCreatives[0]?.headline || "",
      body:     newCreatives[0]?.body     || "",
      link:     answers.url,
      answers,
      savedAt: Date.now(), status: "draft",
    });

    push({ role: "assistant", type: "creatives",
      content: `Here are your **${n} ad concepts** — each has a unique image and copy angle:`,
      creatives: newCreatives });
    push({ role: "assistant", type: "chips",
      content: `Creatives saved ✓\n\nWhat **daily budget** do you want to start with? Minimum $3/day is recommended for ${n} ads.`,
      chips: [
        { label: "$3/day", action: "budget-3" },
        { label: "$5/day", action: "budget-5", primary: true },
        { label: "$10/day", action: "budget-10" },
      ],
    });
    setPhase("budget"); scroll();
  }

  /* ─── Per-creative regeneration ──────────────────────────────────────── */
  async function regenCreativeImage(idx) {
    if (idx < 0 || idx >= creatives.length) return;
    setRegenning(idx);
    const ci      = clientRef.current;
    const answers = buildIntakeAnswers(ci, ctx || {});
    const c       = creatives[idx];
    const copy    = { headline: c.headline, body: c.body, cta: c.cta };
    const newUrl  = await fetchAdImage(answers, copy, c.angle);
    if (newUrl) {
      const updated = creatives.map((cr, i) => i === idx ? { ...cr, imageUrl: newUrl } : cr);
      setCreatives(updated);
      onCreativesGenerated?.({ images: updated.map(c => c.imageUrl).filter(Boolean), creativeSet: updated, creativeTestCount: updated.length });
      await saveCreativeDraft(adminClientId, { creativeSet: updated, images: updated.map(c => c.imageUrl).filter(Boolean), savedAt: Date.now(), status: "draft" });
      push({ role: "assistant", content: `Ad ${idx + 1} image regenerated ✓` });
    } else {
      push({ role: "assistant", content: `⚠️ Image regeneration failed for ad ${idx + 1}. Try again.` });
    }
    setRegenning(null); scroll();
  }

  async function regenCreativeCopy(idx) {
    if (idx < 0 || idx >= creatives.length) return;
    setRegenning(idx + 100); // offset to distinguish from image regen
    const ci      = clientRef.current;
    const answers = buildIntakeAnswers(ci, ctx || {});
    const angle   = creatives[idx].angle;
    const rawCopy = await fetchAdCopy(answers, angle);
    const copy    = normalizeAdCopy(rawCopy);
    if (copy.headline || copy.body) {
      const updated = creatives.map((cr, i) => i === idx ? { ...cr, headline: copy.headline, body: copy.body, cta: copy.cta } : cr);
      setCreatives(updated);
      onCreativesGenerated?.({ images: updated.map(c => c.imageUrl).filter(Boolean), creativeSet: updated, creativeTestCount: updated.length });
      await saveCreativeDraft(adminClientId, { creativeSet: updated, images: updated.map(c => c.imageUrl).filter(Boolean), savedAt: Date.now(), status: "draft" });
      push({ role: "assistant", content: `Ad ${idx + 1} copy regenerated ✓\n**${copy.headline}**\n${copy.body}` });
    } else {
      push({ role: "assistant", content: `⚠️ Copy regeneration failed for ad ${idx + 1}. Try again.` });
    }
    setRegenning(null); scroll();
  }

  async function uploadImageForCreative(idx, newUrl) {
    const updated = creatives.map((cr, i) => i === idx ? { ...cr, imageUrl: newUrl } : cr);
    setCreatives(updated);
    onCreativesGenerated?.({ images: updated.map(c => c.imageUrl).filter(Boolean), creativeSet: updated, creativeTestCount: updated.length });
    await saveCreativeDraft(adminClientId, { creativeSet: updated, images: updated.map(c => c.imageUrl).filter(Boolean), savedAt: Date.now(), status: "draft" });
    push({ role: "assistant", content: `Ad ${idx + 1} image updated with your upload ✓` });
    scroll();
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

    if (it.type === "confirm" && pendingN) { startGeneration(pendingN); return; }
    if (it.type === "count")               { askConfirm(it.n); return; }
    if (it.type === "create")              { respondWithStrategy(); return; }
    if (it.type === "strategy")            { respondWithStrategy(); return; }
    if (it.type === "clear")               { clearDrafts(); return; }
    if (it.type === "regen")               { askHowMany(); return; }
    if (it.type === "regen-image")         { regenCreativeImage(it.idx); return; }
    if (it.type === "regen-copy")          { regenCreativeCopy(it.idx); return; }
    if (it.type === "go-creatives")        { push({ role: "assistant", content: "Switching to Creatives!" }); setTimeout(() => onGoToCreatives?.(), 400); return; }
    if (it.type === "go-campaign")         { push({ role: "assistant", content: "Heading to Campaign tab!" }); setTimeout(() => onGoToCampaign?.(), 400); return; }
    if (/settings|account|business.*info/i.test(txt))  { push({ role: "assistant", content: "Opening Account settings!" }); setTimeout(() => onGoToSettings?.(), 400); return; }
    if (it.type === "metrics") {
      push({ role: "assistant", content: selectedCampaignId && selectedCampaignId !== "__DRAFT__"
        ? "Ask me 'how is my campaign doing?' and I'll check the numbers."
        : "No active campaign yet. Generate creatives and launch one first!" });
      return;
    }
    if (it.type === "budget") {
      onSetBudget?.(it.value);
      const name = suggestCampaignName(clientRef.current, ctx, creatives.length);
      onSetCampaignName?.(name);
      push({ role: "assistant", type: "chips",
        content: `Budget set to **$${it.value}/day** ✓\n\nCampaign name: **${name}**\n\nReady to review and launch?`,
        chips: [
          { label: "Review & Launch →", action: "go-campaign", primary: true },
          { label: "View Creatives", action: "go-creatives" },
        ],
      });
      setPhase("done"); scroll(); return;
    }

    // LLM fallback — sends the user's EXACT typed text to the backend.
    // selectedCampaignId and adminClientId are included so the backend can
    // route action commands (like create_challenger_ads) correctly.
    setSending(true);
    try {
      const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      // Show "Generating…" interim message for A/B test creation — user sees progress
      const _looksLikeABTest =
        /\b(create|make|build|generate)\b/i.test(txt) &&
        /\b(a\/b|ab\s*test|challenger)\b/i.test(txt) &&
        /\b\d{10,}\b/.test(txt);
      if (_looksLikeABTest) {
        push({ role: "assistant", content: "Generating A/B test previews…", _generating: true });
        scroll();
      }

      // Always send selectedCampaignId — use prop value if valid, otherwise null
      const activeCampaignId = selectedCampaignId && selectedCampaignId !== "__DRAFT__" ? selectedCampaignId : null;
      const payload = {
        message: txt,
        history: msgs.slice(-8).map((m) => ({ role: m.role, content: typeof m.content === "string" ? m.content : "" })),
        ...(adminClientId      ? { adminClientId }                    : {}),
        ...(activeCampaignId   ? { selectedCampaignId: activeCampaignId } : {}),
      };
      console.log("[AD_AGENT_FRONTEND_SEND]", {
        userMessage:        txt,
        messageBeingSent:   payload.message,
        selectedCampaignId: payload.selectedCampaignId || null,
        adminClientId:      payload.adminClientId || null,
        historyCount:       payload.history?.length || 0,
      });
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      console.log("[AD_AGENT_FRONTEND_RESPONSE]", j);
      push({ role: "assistant", content: j?.reply || "Something went wrong. Try again.",
        ...(j?.proposalId      && { proposalId:      j.proposalId }),
        ...(j?.proposalPending && { proposalPending: true }),
        ...(j?.proposalTitle   && { proposalTitle:   j.proposalTitle }),
        ...(j?.proposalSummary && { proposalSummary: j.proposalSummary }),
        ...(j?.proposalAction  && { proposalAction:  j.proposalAction }),
      });

      // A/B test preview cards — stay on AI Agent tab, show visual cards
      if (j?.eventType === "ab_test_previews_generated" && Array.isArray(j?.previews) && j.previews.length > 0) {
        console.log("[AB_TEST_PREVIEW_RENDERED_FRONTEND]", {
          campaignId:   j.campaignId,
          controlAdId:  j.controlAdId,
          previewCount: j.previews.length,
        });
        // Replace the "Generating…" interim message (or last assistant msg) with the preview card
        setMsgs((prev) => {
          const updated = [...prev];
          // Find the most recent generating/assistant message and upgrade it
          for (let i = updated.length - 1; i >= 0; i--) {
            if (updated[i].role === "assistant") {
              updated[i] = {
                ...updated[i],
                content:     j.reply || `I generated ${j.previews.length} A/B test preview${j.previews.length !== 1 ? "s" : ""}.`,
                type:        "ab_test_preview",
                campaignId:  j.campaignId,
                controlAdId: j.controlAdId,
                previews:    j.previews,
                _generating: false,
              };
              break;
            }
          }
          return updated;
        });
        // DO NOT call onChallengerDraftsCreated — user must approve first
        // DO NOT switch tab — stay in AI Agent for review
        scroll();
        return;
      }

      // Legacy: challenger_drafts_created (keep for backward compat)
      if (j?.eventType === "challenger_drafts_created" && Array.isArray(j?.drafts) && j.drafts.length > 0) {
        if (onChallengerDraftsCreated) onChallengerDraftsCreated(j.campaignId, j.drafts);
        else if (onRefreshCampaigns) setTimeout(() => onRefreshCampaigns(), 800);
      }

      // Only auto-switch to Creatives when explicitly requested
      if (j?.openCreativesTab && onGoToCreatives) {
        setTimeout(() => onGoToCreatives(), 600);
      }
    } catch (e) {
      console.error("[AD_AGENT_FRONTEND_ERROR]", e?.message);
      push({ role: "assistant", content: "Something went wrong. Try again." });
    } finally { setSending(false); scroll(); }
  }

  const onKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  /* ─── A/B preview card approve + publish helper ─────────────────────── */
  // Clicking "Approve & Publish" immediately creates the real Meta ads.
  async function handleApproveAbPreviews(campaignId, previews, msgKey) {
    const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const _adminClientId = adminClientId || (localStorage.getItem("sm_admin_target_client_id") || "").trim();

    // Validate no image-failed previews before attempting
    const hasFailedImage = previews.some((p) => p.imageFailed || (!p.imageUrl && p.testType === "image"));
    if (hasFailedImage) {
      push({ role: "assistant", content: "Cannot publish — one or more challengers has a missing image. Please regenerate before publishing." });
      scroll();
      return;
    }

    // Mark as publishing (disable button)
    setMsgs((prev) => prev.map((msg) => msg._k === msgKey ? { ...msg, publishing: true } : msg));
    push({ role: "assistant", content: "Publishing A/B test ads to Meta…" });
    scroll();

    console.log("[AB_TEST_APPROVED_BY_USER]", { campaignId, previewCount: previews.length });

    const r = await fetch("/api/campaign-context/publish-ab-previews", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
      body: JSON.stringify({ campaignId, previews, adminClientId: _adminClientId }),
    }).catch(() => null);
    const result = r ? await r.json().catch(() => ({})) : {};

    if (result.ok && Array.isArray(result.createdAds) && result.createdAds.length > 0) {
      console.log("[AB_TEST_META_ADS_CREATED]", { campaignId, adIds: result.createdAds.map((a) => a.metaAdId) });
      // Mark preview message as done
      setMsgs((prev) => prev.map((msg) => msg._k === msgKey ? { ...msg, approved: true, publishing: false } : msg));
      // Inject new active ads into parent campaignCreativesMap
      if (onChallengerDraftsCreated) {
        onChallengerDraftsCreated(campaignId, result.createdAds);
        console.log("[AB_TEST_CREATIVES_UPDATED_ACTIVE]", { campaignId, adCount: result.createdAds.length });
      }
      push({ role: "assistant", content: result.reply || `Approved. I created ${result.createdAds.length} active A/B test ads.` });
      // Switch to Creatives tab so the user can see the new active ads
      if (onGoToCreatives) setTimeout(() => onGoToCreatives(), 800);
    } else {
      setMsgs((prev) => prev.map((msg) => msg._k === msgKey ? { ...msg, publishing: false } : msg));
      push({ role: "assistant", content: `Could not publish: ${result.error || "unknown error"}` });
    }
    scroll();
  }

  /* ─── Render helpers ─────────────────────────────────────────────────── */
  function renderMsg(m) {
    const isAI = m.role === "assistant";

    // ── A/B test preview cards ─────────────────────────────────────────
    if (m.type === "ab_test_preview" && Array.isArray(m.previews) && m.previews.length > 0) {
      return (
        <div key={m._k} style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14, width: "100%" }}>
          {m.content && (
            <div style={{ background: AI_BG, borderRadius: "18px 18px 18px 4px", padding: "10px 14px", color: TEXT, fontSize: 14, lineHeight: 1.6, alignSelf: "flex-start", maxWidth: "80%" }}>
              <Md text={m.content} />
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", width: "100%" }}>
            {m.previews.map((preview, pi) => {
              const imgSrc = preview.imageUrl || null;
              return (
                <div key={pi} style={{
                  flex: "1 1 220px", minWidth: 200, maxWidth: 300,
                  background: "#faf5ff", border: "1.5px solid #a78bfa",
                  borderRadius: 14, padding: "12px 14px",
                  display: "flex", flexDirection: "column", gap: 7,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ background: "#ede9fe", color: "#7c3aed", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 800 }}>
                      {preview.name}
                    </span>
                    <span style={{ background: "#f3f4f6", color: "#6b7280", borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, textTransform: "uppercase" }}>
                      {preview.testType} test
                    </span>
                  </div>
                  {imgSrc ? (
                    <div
                      style={{ position: "relative", cursor: "zoom-in" }}
                      onClick={() => setAbLightbox({ src: imgSrc, title: preview.name })}
                    >
                      <img
                        src={imgSrc}
                        alt={preview.name}
                        style={{ width: "100%", borderRadius: 8, aspectRatio: "1.9/1", objectFit: "cover", border: "1px solid #ddd6fe" }}
                      />
                      <span style={{
                        position: "absolute", bottom: 6, right: 6,
                        background: "rgba(0,0,0,0.5)", color: "#fff",
                        fontSize: 10, borderRadius: 4, padding: "2px 6px",
                      }}>⤢ Enlarge</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: "#b91c1c", background: "#fef2f2", borderRadius: 6, padding: "6px 8px" }}>
                      Image missing — regenerate required before publishing
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#3b0764", lineHeight: 1.3 }}>{preview.headline}</div>
                  {preview.body && (
                    <div style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.4 }}>
                      {preview.body.slice(0, 100)}{preview.body.length > 100 ? "…" : ""}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>
                    CTA: {preview.cta || "—"}
                    {preview.link && <> · <a href={preview.link} target="_blank" rel="noreferrer" style={{ color: "#7c3aed" }}>Landing page ↗</a></>}
                  </div>
                  <div style={{ fontSize: 10, color: "#7c3aed", fontStyle: "italic" }}>
                    Changes: {(preview.changes || []).join(", ")}
                  </div>
                </div>
              );
            })}
          </div>
          {!m.approved && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                disabled={!!m.publishing}
                onClick={() => handleApproveAbPreviews(m.campaignId, m.previews, m._k)}
                style={{
                  background: m.publishing ? "#a78bfa" : "#7c3aed", color: "#fff", border: "none",
                  borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 700,
                  cursor: m.publishing ? "not-allowed" : "pointer", opacity: m.publishing ? 0.7 : 1,
                }}
              >
                {m.publishing ? "Publishing to Meta…" : "Approve & Publish to Meta"}
              </button>
              {!m.publishing && (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>Creates real ads in the existing ad set</span>
              )}
            </div>
          )}
          {m.approved && (
            <div style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>✓ Published — new ads are now active on Meta</div>
          )}
        </div>
      );
    }

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
              <CreativeCarousel
                creatives={m.creatives}
                onRegenImage={regenCreativeImage}
                onRegenCopy={regenCreativeCopy}
                onUploadImage={uploadImageForCreative}
                regenning={regenning}
              />
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

  /* ─── Layout ─────────────────────────────────────────────────────────── */
  const inputDisabled = sending || generating || regenning != null;
  const showTopNav    = phase === "done" || creatives.length > 0;
  const biz           = ctx?._biz || "";

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 130px)", minHeight: 480,
      fontFamily: FONT, background: "#fff",
      border: "1px solid " + BORDER, borderRadius: 20,
      overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.05)",
      position: "relative",   // needed for history drawer absolute positioning
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
             regenning != null ? "Regenerating…" :
             phase === "done" ? `${creatives.length} creatives ready` :
             "Smartemark campaign brain"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {/* History icon — always visible */}
          <button
            title="Chat history"
            onClick={async () => {
              setShowHistory((v) => !v);
              if (!showHistory) {
                // Load history list preview
                try {
                  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
                  const url = adminClientId
                    ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(adminClientId)}`
                    : "/api/ad-agent/history";
                  const r = await fetch(url, { credentials: "include", headers: sid ? { "x-sm-sid": sid } : {} });
                  const j = await r.json().catch(() => ({}));
                  if (j.ok && Array.isArray(j.history)) setHistoryList(j.history);
                } catch {}
              }
            }}
            style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid " + BORDER, background: showHistory ? ACCENT : "#fff", color: showHistory ? "#fff" : SOFT, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
            <FaHistory />
          </button>
          {showTopNav && (
            <>
              <button onClick={() => clearDrafts()} title="Clear all drafts"
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #fca5a5", background: "#fff", color: "#ef4444", fontWeight: 700, fontSize: 11, cursor: "pointer", fontFamily: FONT }}>
                Clear
              </button>
              <button onClick={onGoToCreatives} style={hdrBtn("#f1f5f9", TEXT)}>Creatives</button>
              <button onClick={onGoToCampaign}  style={hdrBtn(ACCENT, "#fff")}>Launch →</button>
            </>
          )}
        </div>
      </div>

      {/* ElevenLabs-style history drawer */}
      {showHistory && (
        <div style={{
          position: "absolute", top: 61, right: 0, width: 280, bottom: 0,
          background: "#fff", borderLeft: "1px solid #f1f5f9",
          zIndex: 10, display: "flex", flexDirection: "column",
          boxShadow: "-4px 0 16px rgba(0,0,0,0.07)",
        }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 800, fontSize: 13, color: TEXT }}>Chat History</span>
            <button onClick={() => setShowHistory(false)}
              style={{ border: "none", background: "none", cursor: "pointer", color: SOFT, fontSize: 14, padding: 4 }}>
              <FaTimes />
            </button>
          </div>
          {/* New chat */}
          <div style={{ padding: "10px 16px", borderBottom: "1px solid #f8f9fa" }}>
            <button
              onClick={() => { clearDrafts(); setShowHistory(false); }}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid " + BORDER, background: "#fff", color: TEXT, fontWeight: 700, fontSize: 12, cursor: "pointer", textAlign: "left", fontFamily: FONT }}>
              + New campaign
            </button>
          </div>
          {/* Session list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {historyList.length === 0 ? (
              <div style={{ padding: "16px", color: SOFT, fontSize: 12 }}>No saved history yet.</div>
            ) : (
              <div style={{ padding: "8px 0" }}>
                {/* Current session summary */}
                <div
                  onClick={() => setShowHistory(false)}
                  style={{ padding: "10px 16px", cursor: "pointer", background: "#f8f8ff", borderLeft: `3px solid ${ACCENT}` }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: TEXT, marginBottom: 2 }}>
                    {ctx?._biz ? `${ctx._biz} campaign` : "Current campaign"}
                  </div>
                  <div style={{ fontSize: 11, color: SOFT }}>
                    {creatives.length > 0 ? `${creatives.length} creatives ready` : "In progress"}
                  </div>
                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 2 }}>
                    {historyList.length} messages · Now
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Welcome screen */}
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
              <InputBox value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onSubmit={() => send()} disabled={inputDisabled} large />
              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
                {["I want to create a campaign.", "What do you recommend?", "Show my current creatives.", "How are my metrics?"].map((s) => (
                  <button key={s} onClick={() => setInput(s)}
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
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "12px 22px 16px", background: "#fff" }}>
            <InputBox value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} onSubmit={() => send()} disabled={inputDisabled} large={false} />
          </div>
        </>
      )}

      {/* A/B preview lightbox / fullscreen */}
      {abLightbox && (
        <div
          onClick={() => setAbLightbox(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9000,
            background: "rgba(0,0,0,0.85)",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{abLightbox.title}</div>
          <img
            src={abLightbox.src}
            alt={abLightbox.title}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 12, objectFit: "contain", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
          />
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginTop: 12 }}>Click anywhere to close</div>
        </div>
      )}
    </div>
  );
}

const hdrBtn = (bg, color) => ({
  padding: "6px 14px", borderRadius: 8, border: "none",
  background: bg, color, fontWeight: 700, fontSize: 12,
  cursor: "pointer", fontFamily: FONT,
});
