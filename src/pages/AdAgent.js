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

// Local access check — mirrors backend logic, does not affect global plan limits
function adAgentAccess(planKey) {
  const s = String(planKey || "").trim().toLowerCase();
  if (s === "premium" || s === "operator") return "pixel"; // chat + pixel
  if (s === "deluxe" || s === "pro") return "chat";        // chat only
  return "locked"; // base, starter, standard, '', unknown
}

export default function AdAgent() {
  const navigate = useNavigate();
  const [planKey, setPlanKey] = useState("");
  const [planLoading, setPlanLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Load plan from existing billing-status endpoint
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/stripe/billing-status", { credentials: "include" });
        const j = await r.json().catch(() => ({}));
        setPlanKey(String(j?.billing?.planKey || "").trim());
      } catch {
        setPlanKey("");
      } finally {
        setPlanLoading(false);
      }
    })();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const access = adAgentAccess(planKey);

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
      const r = await fetch("/api/ad-agent/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          // Pass last 8 prior messages for in-session context (no DB storage)
          history: updatedMessages
            .slice(-9, -1)
            .map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      const reply = j?.reply || "Sorry, something went wrong. Please try again.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
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
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: TEXT, lineHeight: 1.2 }}>
            Ad Agent
          </div>
          <div style={{ fontSize: 11, color: TEXT_SOFT }}>
            {access === "pixel"
              ? "AI marketing assistant · Meta Pixel available"
              : "AI marketing assistant"}
          </div>
        </div>
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
              minHeight: "calc(100vh - 160px)",
              padding: "0 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: "rgba(93,89,234,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 20,
              }}
            >
              <FaRobot style={{ color: PURPLE, fontSize: 26 }} />
            </div>
            <h2 style={{ margin: "0 0 10px", fontSize: "1.5rem", fontWeight: 700, color: TEXT }}>
              Ad Agent
            </h2>
            <p
              style={{
                margin: 0,
                color: TEXT_SOFT,
                fontSize: 16,
                maxWidth: 420,
                lineHeight: 1.65,
              }}
            >
              Ask me about your campaigns, services to promote, ad angles, or how to improve your
              results.
              {access === "pixel" && " I can also fetch your Meta Pixel."}
            </p>
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
            {messages.map((m, i) => (
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
            ))}
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
