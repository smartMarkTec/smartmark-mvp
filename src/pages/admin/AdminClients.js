/* eslint-disable */
// src/pages/admin/AdminClients.js
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.09)";
const PURPLE = "#5d59ea";

function Badge({ children, color }) {
  const colors = {
    green:  { bg: "#dcfce7", text: "#15803d" },
    yellow: { bg: "#fef9c3", text: "#854d0e" },
    red:    { bg: "#fee2e2", text: "#b91c1c" },
    gray:   { bg: "#f1f5f9", text: "#475569" },
    purple: { bg: "rgba(93,89,234,0.10)", text: PURPLE },
  };
  const c = colors[color] || colors.gray;
  return (
    <span style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: c.bg, color: c.text,
    }}>
      {children}
    </span>
  );
}

export default function AdminClients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/clients", { credentials: "include" });
        if (r.status === 403) {
          navigate("/setup");
          return;
        }
        const j = await r.json().catch(() => ({}));
        if (!j.ok) throw new Error(j.error || "Failed to load clients.");
        setClients(j.clients || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: TEXT_SOFT }}>Loading clients…</p>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 4, letterSpacing: 0.4 }}>
              ADMIN
            </div>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: TEXT }}>
              Clients
            </h1>
          </div>
          <button
            onClick={() => navigate("/setup")}
            style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", fontFamily: FONT }}
          >
            ← Dashboard
          </button>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {clients.length === 0 && !error && (
          <div style={{ textAlign: "center", padding: "60px 0", color: TEXT_SOFT, fontSize: 15 }}>
            No clients found yet.
          </div>
        )}

        {clients.length > 0 && (
          <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 100px",
              padding: "12px 18px",
              background: "#f8f9fc",
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 11,
              fontWeight: 700,
              color: TEXT_SOFT,
              letterSpacing: 0.5,
              textTransform: "uppercase",
            }}>
              <div>Client</div>
              <div>Plan</div>
              <div>Intake</div>
              <div>Facebook</div>
              <div>Campaigns</div>
              <div>Checklist</div>
              <div></div>
            </div>

            {/* Rows */}
            {clients.map((c, i) => (
              <div
                key={c.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr 100px",
                  padding: "14px 18px",
                  borderBottom: i < clients.length - 1 ? `1px solid ${BORDER}` : "none",
                  alignItems: "center",
                  fontSize: 13.5,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: TEXT, marginBottom: 2 }}>
                    {c.businessName || c.displayName || c.email}
                  </div>
                  <div style={{ fontSize: 12, color: TEXT_SOFT }}>{c.email}</div>
                </div>

                <div>
                  <Badge color={c.planKey === "premium" || c.planKey === "operator" ? "purple" : c.hasAccess ? "green" : "gray"}>
                    {c.planKey || "none"}
                  </Badge>
                </div>

                <div>
                  {c.intakeSubmitted
                    ? <Badge color="green">Submitted</Badge>
                    : <Badge color="gray">Pending</Badge>}
                </div>

                <div>
                  {c.fbConnected
                    ? <Badge color="green">Connected</Badge>
                    : <Badge color="yellow">Not connected</Badge>}
                </div>

                <div style={{ color: TEXT_SOFT }}>
                  {c.campaignCount} total
                  {c.activeCampaignCount > 0 && (
                    <span style={{ color: "#15803d", fontWeight: 600, marginLeft: 6 }}>
                      ({c.activeCampaignCount} active)
                    </span>
                  )}
                </div>

                <div>
                  <div style={{ fontSize: 13, color: TEXT_SOFT }}>{c.checklistProgress}</div>
                  <div style={{
                    marginTop: 4,
                    height: 4,
                    borderRadius: 99,
                    background: "#e5e7eb",
                    overflow: "hidden",
                    width: 72,
                  }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 99,
                      background: PURPLE,
                      width: `${Math.round((c.checklistDone / c.checklistTotal) * 100)}%`,
                      transition: "width 0.3s",
                    }} />
                  </div>
                </div>

                <div>
                  <button
                    onClick={() => navigate(`/admin/clients/${c.id}`)}
                    style={{
                      padding: "6px 14px",
                      background: "#111827",
                      color: "#fff",
                      border: "none",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: FONT,
                    }}
                  >
                    View
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
