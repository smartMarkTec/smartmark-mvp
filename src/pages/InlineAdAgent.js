/* eslint-disable */
/**
 * InlineAdAgent — AI Ad Agent rendered as a tab inside CampaignSetup.
 * No fullscreen modal. No route change. ChatGPT-style layout.
 *
 * Props:
 *   adminClientId          string  — admin-client email, or "" for TheBoss
 *   adminClientInfo        object  — full client record from /api/admin/clients/:id
 *   selectedCampaignId     string  — current campaign selection (for chat context)
 *   onCreativesGenerated   fn      — called with {images, creativeSet, creativeTestCount}
 *   onGoToCreatives        fn      — navigates parent to "creatives" tab
 *   onGoToCampaign         fn      — navigates parent to "campaign" tab
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight, FaPaperPlane, FaRobot, FaSyncAlt } from "react-icons/fa";

/* ── constants ─────────────────────────────────────────────────────────────── */
const FONT   = "'Inter','Poppins','Segoe UI',Arial,sans-serif";
const BG     = "#f9fafb";
const BUBBLE_AI   = "#f0f2ff";
const BUBBLE_USER = "#111827";
const TEXT   = "#111827";
const SOFT   = "#64748b";
const ACCENT = "#5d59ea";

const CREATIVE_ANGLES = [
  { id: "offer",   label: "Offer Angle",       desc: "Lead with special offer or promotion" },
  { id: "problem", label: "Problem Angle",      desc: "Lead with customer pain point"        },
  { id: "trust",   label: "Local Trust Angle",  desc: "Lead with local expertise & trust"    },
  { id: "urgency", label: "Urgency Angle",       desc: "Lead with immediate action urgency"  },
];
function getAngles(n) { return CREATIVE_ANGLES.slice(0, Math.min(n, 4)); }

/* ── API helpers ────────────────────────────────────────────────────────────── */
function sidHeaders() {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  return { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) };
}

async function fetchSummarizeAdCopy(answers, angle) {
  const r = await fetch("/api/summarize-ad-copy", {
    method: "POST", credentials: "include", headers: sidHeaders(),
    body: JSON.stringify({ answers, angle }),
  });
  return r.json().catch(() => ({}));
}

async function fetchGenerateImage(answers, copy) {
  const r = await fetch("/api/generate-static-ad", {
    method: "POST", credentials: "include", headers: sidHeaders(),
    body: JSON.stringify({
      template: "poster_b",
      regenerateToken: `agent-${Date.now()}`,
      url: answers.url || "", website: answers.url || "",
      answers: { ...answers },
      copy: {
        headline: copy?.headline || "",
        subline:  copy?.subline  || copy?.body || "",
        cta:      copy?.cta      || "Learn more",
      },
    }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.urls?.[0] || null;
}

async function fetchContext(adminClientId) {
  const url = adminClientId
    ? `/api/campaign-context?adminClientId=${encodeURIComponent(adminClientId)}`
    : "/api/campaign-context";
  const r = await fetch(url, { credentials: "include", headers: sidHeaders() });
  const j = await r.json().catch(() => ({}));
  return j.ok ? j.context : null;
}

async function saveCreativeDraft(adminClientId, creativeDraft) {
  await fetch("/api/campaign-context/save-creative-draft", {
    method: "POST", credentials: "include", headers: sidHeaders(),
    body: JSON.stringify({ adminClientId, creativeDraft }),
  }).catch(() => {});
}

/* ── Sub-components ─────────────────────────────────────────────────────────── */
function CreativeCard({ creative, onRegenerate, expanded, onToggle }) {
  const imgSrc = creative.imageUrl || "";
  return (
    <div
      style={{
        background: "#fff",
        border: expanded ? `2px solid ${ACCENT}` : "1px solid #e2e8f0",
        borderRadius: 16, overflow: "hidden",
        boxShadow: "0 2px 12px rgba(93,89,234,0.08)",
        transition: "border 0.15s",
        flex: "0 0 220px",
        maxWidth: 220,
      }}
    >
      {imgSrc ? (
        <img
          src={imgSrc} alt={creative.angleLabel}
          style={{ width: "100%", aspectRatio: "1/1", objectFit: "cover", display: "block" }}
          onError={(e) => { e.target.style.display = "none"; }}
        />
      ) : (
        <div style={{ background: "#f0f2ff", aspectRatio: "1/1", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, fontSize: 30 }}>
          <FaRobot />
        </div>
      )}
      <div style={{ padding: "10px 12px" }}>
        <span style={{ background: "#eef2ff", color: ACCENT, fontSize: 11, fontWeight: 800, borderRadius: 6, padding: "2px 8px", marginBottom: 6, display: "inline-block" }}>
          {creative.angleLabel || creative.angle}
        </span>
        <div style={{ fontWeight: 800, fontSize: 13, color: TEXT, lineHeight: 1.35, margin: "6px 0 4px" }}>
          {creative.headline || "(no headline)"}
        </div>
        {expanded && (
          <>
            <div style={{ fontSize: 12, color: SOFT, lineHeight: 1.5, marginBottom: 6 }}>
              {creative.body || ""}
            </div>
            <div style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}>
              CTA: {creative.cta || "Learn more"}
            </div>
          </>
        )}
        {!expanded && (
          <div style={{ fontSize: 11, color: SOFT }}>
            {(creative.body || "").slice(0, 60)}{(creative.body || "").length > 60 ? "…" : ""}
          </div>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            onClick={onToggle}
            style={{ flex: 1, padding: "4px 0", border: "1px solid #e2e8f0", borderRadius: 6, background: "#f9fafb", color: SOFT, fontSize: 11, fontWeight: 700, cursor: "pointer" }}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreativeCarousel({ creatives, onRegenerate }) {
  const [expanded, setExpanded] = useState(0);
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    scrollRef.current?.scrollBy({ left: dir * 240, behavior: "smooth" });
  };

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <button onClick={() => scroll(-1)} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", cursor: "pointer", color: SOFT }}><FaChevronLeft /></button>
        <span style={{ fontSize: 12, color: SOFT, fontWeight: 600 }}>{creatives.length} ad{creatives.length > 1 ? "s" : ""} — scroll to see all</span>
        <button onClick={() => scroll(1)}  style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 8px", cursor: "pointer", color: SOFT }}><FaChevronRight /></button>
      </div>
      <div
        ref={scrollRef}
        style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, scrollbarWidth: "thin" }}
      >
        {creatives.map((c, i) => (
          <CreativeCard
            key={c.id || i}
            creative={c}
            expanded={expanded === i}
            onToggle={() => setExpanded(expanded === i ? -1 : i)}
            onRegenerate={onRegenerate ? () => onRegenerate(i) : null}
          />
        ))}
      </div>
    </div>
  );
}

function CountSelector({ onSelect }) {
  return (
    <div style={{ margin: "4px 0 2px" }}>
      <div style={{ fontSize: 13, color: SOFT, marginBottom: 8, fontWeight: 600 }}>
        Choose how many creatives to test — one image, different copy per ad:
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => onSelect(n)}
            style={{
              padding: "8px 20px", borderRadius: 999,
              border: `2px solid ${n === 3 ? ACCENT : "#d1d5db"}`,
              background: n === 3 ? ACCENT : "#fff",
              color: n === 3 ? "#fff" : TEXT,
              fontWeight: 800, fontSize: 14, cursor: "pointer",
            }}
          >
            {n} ad{n > 1 ? "s" : ""}{n === 3 ? " ✓" : ""}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: SOFT, marginTop: 8, lineHeight: 1.5 }}>
        Smartemark creates 1 campaign · 1 ad set · N ads sharing the budget.
        With smaller budgets, 2–3 ads work better than 4.
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function InlineAdAgent({
  adminClientId,
  adminClientInfo,
  selectedCampaignId,
  onCreativesGenerated,
  onGoToCreatives,
  onGoToCampaign,
}) {
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState("");
  const [sending, setSending]             = useState(false);
  const [generating, setGenerating]       = useState(false);
  const [phase, setPhase]                 = useState("init");
  const [intakeCtx, setIntakeCtx]         = useState(null);
  const [generatedCreatives, setGenerated] = useState([]);
  const [countSelected, setCountSelected] = useState(null);

  const bottomRef    = useRef(null);
  const textareaRef  = useRef(null);
  const hasGreeted   = useRef(false);

  const bizName = adminClientInfo?.premiumIntake?.businessName ||
                  adminClientInfo?.displayName ||
                  (adminClientId ? adminClientId.split("@")[0] : "");
  const displayName = bizName || "there";

  const addMsg = useCallback((msg) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  }, []);

  const scrollBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  /* Load context + greet on mount ------------------------------------------ */
  useEffect(() => {
    if (hasGreeted.current) return;
    hasGreeted.current = true;
    (async () => {
      let ctx = null;
      try { ctx = await fetchContext(adminClientId); } catch {}
      setIntakeCtx(ctx);

      const biz     = adminClientInfo?.premiumIntake?.businessName || ctx?.businessName || displayName;
      const offer   = adminClientInfo?.premiumIntake?.currentSpecialOrOffer || ctx?.offer || "";
      const service = adminClientInfo?.premiumIntake?.mainServices || ctx?.industry || "";
      const area    = adminClientInfo?.premiumIntake?.serviceArea || ctx?.serviceArea || "";

      const rec = buildRec(biz, offer, service, area);

      setMessages([
        { id: 1, role: "assistant", type: "greeting",
          content: `Hey${biz ? `, ready to create a campaign for **${biz}**` : " — ready to create your campaign"}? 👋` },
        { id: 2, role: "assistant", type: "recommendation", content: rec },
        { id: 3, role: "assistant", type: "count-prompt",
          content: "**How many ad creatives do you want to test?**" },
      ]);
      setPhase("count-select");
      scrollBottom();
    })();
  // eslint-disable-next-line
  }, [adminClientId]);

  function buildRec(biz, offer, service, area) {
    const offerLine   = offer   ? `• **Offer Angle** — ${offer}` : "• **Offer Angle** — highlight your best value";
    const problemLine = service ? `• **Problem Angle** — what customers struggle with re: ${service}` : "• **Problem Angle** — speak to customer pain";
    const trustLine   = area    ? `• **Local Trust Angle** — trusted expertise in ${area}` : "• **Local Trust Angle** — local expertise and reliability";
    return `Based on your intake${biz ? ` for **${biz}**` : ""}, I recommend a **3-ad creative angle test**:\n\n${offerLine}\n${problemLine}\n${trustLine}\n\nOne campaign · one ad set · 3 ads sharing the budget. This is the most cost-effective way to find what resonates.`;
  }

  /* Count select ------------------------------------------------------------ */
  async function handleCountSelect(n) {
    setCountSelected(n);
    addMsg({ role: "user", content: `${n} ad${n > 1 ? "s" : ""}` });
    addMsg({
      role: "assistant", type: "generating",
      content: `Great — generating ${n} ad creative${n > 1 ? "s" : ""} now (one image, different copy per angle). This takes about a minute…`,
    });
    setPhase("generating");
    scrollBottom();
    await runGeneration(n);
  }

  /* Generation -------------------------------------------------------------- */
  async function runGeneration(n) {
    setGenerating(true);
    const angles = getAngles(n);
    const pi     = adminClientInfo?.premiumIntake || {};
    const ctx    = intakeCtx || {};
    const piUrl  = pi.websiteUrl || ctx.websiteUrl || "";

    const answers = {
      businessName:  pi.businessName  || ctx.businessName  || "",
      industry:      pi.mainServices  || ctx.industry      || "",
      offer:         pi.currentSpecialOrOffer || ctx.offer  || "",
      mainBenefit:   pi.mainServices  || ctx.mainBenefit   || "",
      city:          ctx.city || "",
      state:         ctx.state || "",
      idealCustomer: pi.idealCustomer || ctx.idealCustomer || "",
      cta:           ctx.cta || "Learn more",
      url:           piUrl,
      websiteUrl:    piUrl,
    };

    // Generate shared image using offer angle copy
    let sharedImageUrl = null;
    try {
      const firstCopy = await fetchSummarizeAdCopy(answers, "offer");
      sharedImageUrl  = await fetchGenerateImage(answers, firstCopy);
    } catch {}

    // Generate copy for each angle
    const creatives = [];
    for (let i = 0; i < angles.length; i++) {
      const angle = angles[i];
      try {
        const copy = await fetchSummarizeAdCopy(answers, angle.id);
        creatives.push({
          id:            `c-${angle.id}-${Date.now()}-${i}`,
          angle:         angle.id,
          angleLabel:    angle.label,
          headline:      (copy?.headline || "").slice(0, 55),
          body:          copy?.subline || copy?.body || "",
          cta:           copy?.cta || answers.cta,
          imageUrl:      sharedImageUrl || "",
          link:          piUrl,
          mediaSelection:"image",
          status:        "draft",
        });
      } catch {}
    }

    setGenerating(false);

    if (!creatives.length) {
      addMsg({ role: "assistant", content: "Generation failed — please try again." });
      setPhase("chat");
      return;
    }

    setGenerated(creatives);

    // Notify parent (updates draftCreatives + selects __DRAFT__)
    if (onCreativesGenerated) {
      onCreativesGenerated({
        images: [sharedImageUrl].filter(Boolean),
        creativeSet: creatives,
        creativeTestCount: n,
      });
    }

    // Save to backend
    await saveCreativeDraft(adminClientId, {
      creativeSet:    creatives,
      images:         [sharedImageUrl].filter(Boolean),
      headline:       creatives[0]?.headline || "",
      body:           creatives[0]?.body     || "",
      link:           piUrl,
      answers,
      initialTestStrategy: {
        type: "creative_angle_test",
        creativeCount: creatives.length,
        recommendedDurationDays: 7,
        structure: "1 campaign, 1 ad set, multiple ads",
        angles: creatives.map((c) => c.angle),
        decisionRules: [
          "Do not judge before enough impressions/clicks",
          "After 7 days, compare CTR, CPC, spend, and link clicks",
          "Pause weakest ads if a winner is clear",
          "Keep the winner and generate a challenger",
        ],
      },
      savedAt: Date.now(),
      status: "draft",
    });

    // Add creative cards to chat
    addMsg({
      role: "assistant", type: "creatives",
      content: `Here are your **${creatives.length} ad concepts**:`,
      creatives,
    });
    addMsg({
      role: "assistant", type: "next-steps",
      content: `Your creatives are saved to the **Creatives tab** ✓\n\nWhen you're ready, go to the **Campaign tab** to set your name, budget, and launch — 1 campaign · 1 ad set · ${creatives.length} ads.`,
      actions: ["creatives", "campaign"],
    });
    setPhase("done");
    scrollBottom();
  }

  /* Chat send --------------------------------------------------------------- */
  async function send() {
    const msg = input.trim();
    if (!msg || sending) return;
    addMsg({ role: "user", content: msg });
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);
    scrollBottom();
    try {
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST", credentials: "include", headers: sidHeaders(),
        body: JSON.stringify({
          message: msg,
          history: messages.slice(-8).map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : "",
          })),
          ...(adminClientId ? { adminClientId } : {}),
          ...(selectedCampaignId && selectedCampaignId !== "__DRAFT__"
            ? { selectedCampaignId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      addMsg({ role: "assistant", content: j?.reply || "Something went wrong." });
    } catch {
      addMsg({ role: "assistant", content: "Something went wrong. Try again." });
    } finally {
      setSending(false);
      scrollBottom();
    }
  }

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  /* Render ------------------------------------------------------------------ */
  return (
    <div style={{
      display: "flex", flexDirection: "column",
      height: "calc(100vh - 120px)", minHeight: 500,
      background: "#fff", borderRadius: 20,
      border: "1px solid #e8ecf0",
      boxShadow: "0 4px 24px rgba(93,89,234,0.07)",
      fontFamily: FONT, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 24px", borderBottom: "1px solid #f0f2f5",
        display: "flex", alignItems: "center", gap: 12,
        background: "linear-gradient(135deg,#fff 0%,#f5f3ff 100%)",
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <FaRobot style={{ color: "#fff", fontSize: 18 }} />
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, color: TEXT }}>AI Ad Agent</div>
          <div style={{ fontSize: 12, color: SOFT }}>
            {phase === "generating" ? "Generating your creatives…" :
             phase === "done"       ? `${generatedCreatives.length} creatives ready · Creatives tab updated` :
             "Your Smartemark creative partner"}
          </div>
        </div>
        {(phase === "done" || phase === "chat") && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {onGoToCreatives && (
              <button onClick={onGoToCreatives} style={tabBtnStyle(ACCENT)}>
                View Creatives
              </button>
            )}
            {onGoToCampaign && (
              <button onClick={onGoToCampaign} style={tabBtnStyle("#111827")}>
                Go to Campaign ›
              </button>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
        {messages.length === 0 && phase === "init" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <FaRobot style={{ fontSize: 48, color: ACCENT, opacity: 0.3 }} />
            <div style={{ color: SOFT, fontSize: 15 }}>Loading your intake…</div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ maxWidth: m.type === "creatives" ? "100%" : "80%" }}>
              {/* AI bubble */}
              {m.role === "assistant" && (
                <div style={{
                  background: BUBBLE_AI, borderRadius: "18px 18px 18px 4px",
                  padding: "12px 16px", color: TEXT, fontSize: 14, lineHeight: 1.65,
                }}>
                  {renderContent(m)}
                </div>
              )}
              {/* Count selector */}
              {m.role === "assistant" && m.type === "count-prompt" && phase === "count-select" && !countSelected && (
                <div style={{ marginTop: 10 }}>
                  <CountSelector onSelect={handleCountSelect} />
                </div>
              )}
              {/* Next step buttons */}
              {m.role === "assistant" && m.type === "next-steps" && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {onGoToCreatives && (
                    <button onClick={onGoToCreatives} style={tabBtnStyle(ACCENT)}>View Creatives</button>
                  )}
                  {onGoToCampaign && (
                    <button onClick={onGoToCampaign} style={tabBtnStyle("#111827")}>Campaign & Launch ›</button>
                  )}
                </div>
              )}
              {/* User bubble */}
              {m.role === "user" && (
                <div style={{
                  background: BUBBLE_USER, borderRadius: "18px 18px 4px 18px",
                  padding: "12px 16px", color: "#fff", fontSize: 14, lineHeight: 1.65,
                }}>
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Generating spinner */}
        {generating && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ background: BUBBLE_AI, borderRadius: "18px 18px 18px 4px", padding: "12px 20px", color: SOFT, fontSize: 14 }}>
              <FaSyncAlt style={{ animation: "spin 1s linear infinite", marginRight: 8 }} />
              Generating your creatives…
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {(phase === "done" || phase === "chat") && (
        <div style={{ borderTop: "1px solid #f0f2f5", padding: "14px 24px 18px", background: "#fff" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end", maxWidth: 740, margin: "0 auto" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything about your campaign…"
              disabled={sending}
              rows={1}
              style={{
                flex: 1, padding: "12px 16px", border: "1px solid #e2e8f0",
                borderRadius: 12, fontSize: 14, fontFamily: FONT, resize: "none",
                outline: "none", background: BG, lineHeight: 1.5, maxHeight: 120, overflowY: "auto",
              }}
              onInput={(e) => {
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || sending}
              style={{
                width: 44, height: 44, borderRadius: 10, border: "none",
                background: input.trim() && !sending ? ACCENT : "#e5e7eb",
                cursor: input.trim() && !sending ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <FaPaperPlane style={{ color: input.trim() && !sending ? "#fff" : "#9ca3af", fontSize: 14 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function tabBtnStyle(bg) {
  return {
    padding: "7px 16px", borderRadius: 8, border: "none",
    background: bg, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer",
    fontFamily: FONT,
  };
}

function renderContent(m) {
  if (m.type === "creatives" && Array.isArray(m.creatives) && m.creatives.length) {
    return (
      <div>
        <div style={{ marginBottom: 12, fontWeight: 700 }}>{m.content}</div>
        <CreativeCarousel creatives={m.creatives} />
      </div>
    );
  }
  // Render markdown-lite: **bold**, \n\n paragraph breaks
  const text = typeof m.content === "string" ? m.content : "";
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <div>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p.split("\n").map((line, j) =>
              j === 0 ? <React.Fragment key={`${i}-${j}`}>{line}</React.Fragment>
                       : <React.Fragment key={`${i}-${j}`}><br />{line}</React.Fragment>
            )
      )}
    </div>
  );
}

/* CSS spinner keyframes injected once */
if (typeof document !== "undefined" && !document.getElementById("sm-spin-style")) {
  const s = document.createElement("style");
  s.id = "sm-spin-style";
  s.textContent = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
  document.head.appendChild(s);
}
