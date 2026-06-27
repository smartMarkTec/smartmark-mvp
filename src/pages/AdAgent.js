/* eslint-disable */
// src/pages/AdAgent.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaRobot, FaLock, FaPaperPlane } from "react-icons/fa";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.09)";
const PURPLE = "#5d59ea";

// Local access check — admin always gets full pixel access
function adAgentAccess(planKey, isAdmin) {
  if (isAdmin) return "pixel";
  const s = String(planKey || "").trim().toLowerCase();
  if (s === "premium" || s === "operator") return "pixel"; // chat + pixel
  if (s === "deluxe" || s === "pro") return "chat";        // chat only
  return "locked"; // base, starter, standard, '', unknown
}

const SUGGESTED_PROMPTS = [
  "How are my ads performing?",
  "Generate a challenger ad for this campaign",
  "What should I test next?",
  "Write 3 headline variations for this campaign",
];

export default function AdAgent() {
  const navigate = useNavigate();
  const [planKey, setPlanKey] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState("");
  const [planLoading, setPlanLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentCampaignId] = useState(() => (localStorage.getItem("sm_agent_campaign_id") || "").trim() || null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Load user/plan from /auth/whoami, then load saved chat history
  useEffect(() => {
    (async () => {
      try {
        const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
        const headers = sid ? { "x-sm-sid": sid } : {};
        const r = await fetch("/auth/whoami", { credentials: "include", headers });
        const j = await r.json().catch(() => ({}));
        setPlanKey(String(j?.billing?.planKey || j?.planKey || "").trim());
        setIsAdmin(!!j?.user?.isAdmin);
        const rawName = String(j?.user?.displayName || j?.user?.username || j?.user?.email || "").trim();
        if (rawName) setUserName(rawName.split("@")[0]);
        // Load persisted chat history — scoped to the effective account (admin-client mode
        // passes adminClientId so the server loads the selected client's history, not TheBoss's)
        const _adminClientId = (localStorage.getItem("sm_admin_target_client_id") || "").trim();
        const historyUrl = _adminClientId
          ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(_adminClientId)}`
          : "/api/ad-agent/history";
        setMessages([]); // clear any stale messages from a previous account before loading
        const hr = await fetch(historyUrl, { credentials: "include", headers });
        if (hr.ok) {
          const hj = await hr.json().catch(() => ({}));
          if (Array.isArray(hj?.history) && hj.history.length > 0) {
            setMessages(hj.history);
          }
        }
      } catch {
        setPlanKey("");
      } finally {
        setPlanLoading(false);
      }
    })();
  }, []);

  const saveHistory = (msgs) => {
    const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const _adminClientId = (localStorage.getItem("sm_admin_target_client_id") || "").trim();
    fetch("/api/ad-agent/history", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(_sid ? { "x-sm-sid": _sid } : {}),
      },
      body: JSON.stringify({
        messages: msgs,
        ...(_adminClientId ? { adminClientId: _adminClientId } : {}),
      }),
    }).catch(() => {});
  };

  const clearChat = () => {
    setMessages([]);
    const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
    const _adminClientId = (localStorage.getItem("sm_admin_target_client_id") || "").trim();
    const deleteUrl = _adminClientId
      ? `/api/ad-agent/history?adminClientId=${encodeURIComponent(_adminClientId)}`
      : "/api/ad-agent/history";
    fetch(deleteUrl, {
      method: "DELETE",
      credentials: "include",
      headers: { ...(_sid ? { "x-sm-sid": _sid } : {}) },
    }).catch(() => {});
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const access = adAgentAccess(planKey, isAdmin);

  const send = async () => {
    const msg = input.trim();
    if (!msg || sending) return;

    const userMsg = { role: "user", content: msg };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setSending(true);

    try {
      const _sid = (localStorage.getItem("sm_sid_v1") || "").trim();
      const _adminClientId = (localStorage.getItem("sm_admin_target_client_id") || "").trim();
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(_sid ? { "x-sm-sid": _sid } : {}),
        },
        body: JSON.stringify({
          message: msg,
          history: updatedMessages
            .slice(-9, -1)
            .map((m) => ({ role: m.role, content: m.content })),
          ...(_adminClientId ? { adminClientId: _adminClientId } : {}),
          ...(agentCampaignId ? { selectedCampaignId: agentCampaignId } : {}),
        }),
      });
      const j = await r.json().catch(() => ({}));
      const reply = j?.reply || "Sorry, something went wrong. Please try again.";
      const assistantMsg = {
        role: "assistant",
        content: reply,
        // Proposal fields — present when aiApprovalRequired is true and agent queued an action
        ...(j?.proposalId       && { proposalId:      j.proposalId }),
        ...(j?.proposalPending  && { proposalPending: true }),
        ...(j?.proposalTitle    && { proposalTitle:   j.proposalTitle }),
        ...(j?.proposalSummary  && { proposalSummary: j.proposalSummary }),
      };
      const finalMessages = [...updatedMessages, assistantMsg];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (planLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fff",
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: TEXT_SOFT, fontSize: 15 }}>Loading…</p>
      </div>
    );
  }

  // ── Locked ─────────────────────────────────────────────────────────────────
  if (access === "locked") {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#fff",
          fontFamily: FONT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: "rgba(93,89,234,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
            }}
          >
            <FaLock style={{ color: PURPLE, fontSize: 22 }} />
          </div>
          <h2 style={{ margin: "0 0 10px", fontSize: "1.35rem", fontWeight: 700, color: TEXT }}>
            Ad Agent
          </h2>
          <p style={{ margin: "0 0 24px", color: TEXT_SOFT, fontSize: 15, lineHeight: 1.65 }}>
            Ad Agent is available on Deluxe and Premium plans.
          </p>
          <button
            onClick={() => navigate("/pricing")}
            style={{
              padding: "11px 28px",
              background: "#111827",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontWeight: 700,
              fontSize: 15,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Upgrade
          </button>
          <div style={{ marginTop: 14 }}>
            <button
              onClick={() => navigate("/setup")}
              style={{
                background: "none",
                border: "none",
                color: TEXT_SOFT,
                fontSize: 14,
                cursor: "pointer",
                textDecoration: "underline",
                fontFamily: FONT,
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat UI ────────────────────────────────────────────────────────────────
  const hasMessages = messages.length > 0;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#fff",
        fontFamily: FONT,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: "13px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 10,
        }}
      >
        <button
          onClick={() => navigate("/setup")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: TEXT_SOFT,
            fontSize: 14,
            padding: "4px 8px",
            borderRadius: 6,
            fontFamily: FONT,
          }}
        >
          ← Back
        </button>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 10,
            background: "rgba(93,89,234,0.10)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FaRobot style={{ color: PURPLE, fontSize: 16 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, lineHeight: 1.2 }}>
            Ad Agent
          </div>
          <div style={{ fontSize: 11, color: TEXT_SOFT }}>
            {access === "pixel"
              ? "AI marketing assistant · Meta Pixel available"
              : "AI marketing assistant"}
          </div>
        </div>
        {hasMessages && (
          <button
            onClick={clearChat}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: TEXT_SOFT,
              fontSize: 13,
              padding: "4px 8px",
              borderRadius: 6,
              fontFamily: FONT,
              flexShrink: 0,
            }}
          >
            Clear chat
          </button>
        )}
      </div>

      {/* Message area */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!hasMessages ? (
          /* Welcome / empty state */
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "calc(100vh - 180px)",
              padding: "0 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 20,
                background: "linear-gradient(135deg, rgba(93,89,234,0.12) 0%, rgba(93,89,234,0.06) 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 22,
                boxShadow: "0 2px 12px rgba(93,89,234,0.10)",
              }}
            >
              <FaRobot style={{ color: PURPLE, fontSize: 28 }} />
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: "1.6rem", fontWeight: 800, color: TEXT }}>
              {userName ? `Hi, ${userName} —` : "Hi —"}
            </h2>
            <p style={{ margin: "0 0 6px", fontSize: "1.1rem", fontWeight: 600, color: TEXT }}>
              what would you like to improve today?
            </p>
            <p
              style={{
                margin: "0 0 28px",
                color: TEXT_SOFT,
                fontSize: 14,
                maxWidth: 380,
                lineHeight: 1.65,
              }}
            >
              I can analyze performance, write ad copy, generate challenger ads, and propose A/B tests
              {access === "pixel" ? " — and fetch your Meta Pixel." : "."}
            </p>
            {/* Suggested prompts */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 480 }}>
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => { setInput(p); setTimeout(() => textareaRef.current?.focus(), 50); }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 20,
                    border: "1px solid #e0e7ff",
                    background: "#f5f3ff",
                    color: PURPLE,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: FONT,
                    transition: "background 0.15s",
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Conversation */
          <div
            style={{
              maxWidth: 740,
              margin: "0 auto",
              padding: "28px 20px 16px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
            }}
          >
            {messages.map((m, i) => {
              // Proposal card: assistant messages that carry a pending proposal
              if (m.role === "assistant" && m.proposalId && m.proposalPending) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "flex-start" }}>
                    <div style={{ maxWidth: "90%", width: "100%" }}>
                      <div style={{
                        background: "#fff7ed",
                        border: "1px solid #fed7aa",
                        borderRadius: "16px 16px 16px 4px",
                        padding: "14px 16px",
                        marginBottom: 8,
                        fontFamily: FONT,
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 4 }}>
                          Proposed Action
                        </div>
                        <div style={{ fontSize: 14, color: "#111827", fontWeight: 600, marginBottom: 4 }}>
                          {m.proposalTitle || "AI Action"}
                        </div>
                        <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.55 }}>
                          {m.proposalSummary || m.content}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={async () => {
                            const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
                            const _adminClientId = (localStorage.getItem("sm_admin_target_client_id") || "").trim();
                            // POST /apply actually executes the action on Meta — not just marks approved.
                            // adminClientId must be sent so the server can find proposals stored under the client's ownerKey.
                            const r = await fetch(`/api/ai-proposal/${m.proposalId}/apply`, {
                              method: "POST", credentials: "include",
                              headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
                              body: JSON.stringify({ ...(_adminClientId ? { adminClientId: _adminClientId } : {}) }),
                            }).catch(() => null);
                            const result = r ? await r.json().catch(() => ({})) : {};
                            const reply = result.ok
                              ? (result.reply || `Done — action applied (status: ${result.actionStatus || "applied"}). Go to the Creatives tab to review.`)
                              : `Could not apply: ${result.error || "unknown error"}. Please try again.`;
                            const updated = messages.map((msg, j) => j === i ? { ...msg, proposalPending: false } : msg);
                            const final = [...updated, { role: "assistant", content: reply }];
                            setMessages(final);
                            saveHistory(final);
                          }}
                          style={{
                            padding: "7px 16px", borderRadius: 8, border: "none",
                            background: "#111827", color: "#fff", fontSize: 12,
                            fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          }}
                        >
                          Approve &amp; Apply
                        </button>
                        <button
                          onClick={async () => {
                            const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
                            await fetch(`/api/ai-proposal/${m.proposalId}`, {
                              method: "PATCH", credentials: "include",
                              headers: { "Content-Type": "application/json", ...(sid ? { "x-sm-sid": sid } : {}) },
                              body: JSON.stringify({ status: "rejected" }),
                            }).catch(() => null);
                            const updated = messages.map((msg, j) => j === i ? { ...msg, proposalPending: false } : msg);
                            const final = [...updated, { role: "assistant", content: "Rejected. No changes were made." }];
                            setMessages(final);
                            saveHistory(final);
                          }}
                          style={{
                            padding: "7px 16px", borderRadius: 8, border: "1px solid #e5e7eb",
                            background: "#fff", color: "#374151", fontSize: 12,
                            fontWeight: 700, cursor: "pointer", fontFamily: FONT,
                          }}
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }
              // Normal message bubble
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: m.role === "user" ? "flex-end" : "flex-start",
                  }}
                >
                  <div
                    style={{
                      maxWidth: "84%",
                      padding: "11px 16px",
                      borderRadius:
                        m.role === "user"
                          ? "18px 18px 4px 18px"
                          : "18px 18px 18px 4px",
                      background: m.role === "user" ? "#111827" : "#f3f4f6",
                      color: m.role === "user" ? "#fff" : TEXT,
                      fontSize: 14.5,
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: FONT,
                    }}
                  >
                    {m.content}
                  </div>
                </div>
              );
            })}
            {sending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    padding: "11px 16px",
                    borderRadius: "18px 18px 18px 4px",
                    background: "#f3f4f6",
                    color: TEXT_SOFT,
                    fontSize: 14,
                  }}
                >
                  Thinking…
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        style={{
          borderTop: `1px solid ${BORDER}`,
          padding: "14px 20px 20px",
          background: "#fff",
          position: "sticky",
          bottom: 0,
        }}
      >
        <div
          style={{
            maxWidth: 740,
            margin: "0 auto",
            display: "flex",
            gap: 10,
            alignItems: "flex-end",
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="How can I help you today?"
            disabled={sending}
            rows={1}
            style={{
              flex: 1,
              padding: "12px 16px",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              fontSize: 15,
              fontFamily: FONT,
              color: TEXT,
              resize: "none",
              outline: "none",
              background: "#f9fafb",
              lineHeight: 1.5,
              maxHeight: 140,
              overflowY: "auto",
            }}
            onInput={(e) => {
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px";
            }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              borderRadius: 10,
              background: input.trim() && !sending ? "#111827" : "#e5e7eb",
              border: "none",
              cursor: input.trim() && !sending ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            <FaPaperPlane
              style={{
                color: input.trim() && !sending ? "#fff" : "#9ca3af",
                fontSize: 14,
              }}
            />
          </button>
        </div>
        <div style={{ maxWidth: 740, margin: "6px auto 0", textAlign: "center" }}>
          <span style={{ fontSize: 12, color: TEXT_SOFT }}>
            {access === "pixel"
              ? 'Tip: Ask "fetch my meta pixel" to retrieve your pixel.'
              : "Ask about ad angles, specials to promote, or how to improve your campaigns."}
          </span>
        </div>
      </div>
    </div>
  );
}
