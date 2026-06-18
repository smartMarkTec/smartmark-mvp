/* eslint-disable */
// src/pages/admin/AdminLeads.js
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const TEXT = "#111827";
const TEXT_SOFT = "#6b7280";
const BORDER = "rgba(0,0,0,0.09)";
const PURPLE = "#5d59ea";

const STATUS_COLORS = {
  new:       { bg: "#dbeafe", text: "#1d4ed8" },
  contacted: { bg: "#fef9c3", text: "#854d0e" },
  booked:    { bg: "#dcfce7", text: "#15803d" },
  lost:      { bg: "#fee2e2", text: "#b91c1c" },
};
const STATUSES = ["new", "contacted", "booked", "lost"];

function adminHeaders(extra) {
  const sid = (localStorage.getItem("sm_sid_v1") || "").trim();
  return sid ? { "x-sm-sid": sid, ...(extra || {}) } : { ...(extra || {}) };
}

function StatusBadge({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.new;
  return (
    <span style={{
      display: "inline-block", padding: "2px 9px", borderRadius: 999,
      fontSize: 11, fontWeight: 700, background: c.bg, color: c.text,
      textTransform: "capitalize",
    }}>
      {status || "new"}
    </span>
  );
}

function fmt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch { return iso; }
}

export default function AdminLeads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterSlug, setFilterSlug] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ status: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [slugOptions, setSlugOptions] = useState([]);

  const loadLeads = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filterSlug) params.set("landingPageSlug", filterSlug);
      if (filterStatus) params.set("status", filterStatus);
      const r = await fetch(`/api/admin/landing-leads?${params}`, {
        credentials: "include", headers: adminHeaders(),
      });
      if (r.status === 403) { navigate("/setup"); return; }
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Failed to load leads.");
      setLeads(j.leads || []);
      const slugs = [...new Set((j.leads || []).map(l => l.landingPageSlug).filter(Boolean))];
      setSlugOptions(slugs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filterSlug, filterStatus, navigate]);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  const startEdit = (lead) => {
    setEditingId(lead.id);
    setEditDraft({ status: lead.status || "new", notes: lead.notes || "" });
  };

  const cancelEdit = () => { setEditingId(null); setEditDraft({ status: "", notes: "" }); };

  const saveEdit = async (leadId) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/landing-leads/${leadId}`, {
        method: "PATCH",
        credentials: "include",
        headers: adminHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(editDraft),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) throw new Error(j.error || "Save failed.");
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, ...j.lead } : l));
      setEditingId(null);
    } catch (err) {
      alert("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const newCount = leads.filter(l => (l.status || "new") === "new").length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fc", fontFamily: FONT, padding: "28px 20px 60px" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: PURPLE, marginBottom: 4, letterSpacing: 0.4 }}>ADMIN</div>
            <h1 style={{ margin: 0, fontSize: "1.6rem", fontWeight: 800, color: TEXT }}>
              Landing Page Leads
              {newCount > 0 && (
                <span style={{ marginLeft: 12, fontSize: 14, background: "#dbeafe", color: "#1d4ed8", padding: "3px 10px", borderRadius: 999, fontWeight: 700, verticalAlign: "middle" }}>
                  {newCount} New
                </span>
              )}
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={loadLeads}
              style={{ padding: "8px 14px", background: "white", border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: FONT, color: TEXT }}
            >
              ↻ Refresh
            </button>
            <button
              onClick={() => navigate("/admin/clients")}
              style={{ background: "none", border: "none", color: TEXT_SOFT, fontSize: 14, cursor: "pointer", fontFamily: FONT }}
            >
              ← Clients
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
          <select
            value={filterSlug}
            onChange={e => setFilterSlug(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: FONT, background: "white", color: TEXT }}
          >
            <option value="">All clients</option>
            {slugOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, fontSize: 13, fontFamily: FONT, background: "white", color: TEXT }}
          >
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>

        {error && (
          <div style={{ padding: "12px 16px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, color: "#b91c1c", fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: TEXT_SOFT }}>Loading leads…</div>
        ) : leads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: TEXT_SOFT, fontSize: 15 }}>No leads found.</div>
        ) : (
          <div style={{ background: "white", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "140px 160px 140px 120px 110px 120px 100px 120px 1fr 80px",
              padding: "11px 16px",
              background: "#f8f9fc",
              borderBottom: `1px solid ${BORDER}`,
              fontSize: 10, fontWeight: 700, color: TEXT_SOFT,
              letterSpacing: 0.5, textTransform: "uppercase",
            }}>
              <div>Created</div>
              <div>Business</div>
              <div>Name</div>
              <div>Phone</div>
              <div>Date</div>
              <div>Time</div>
              <div>Source</div>
              <div>Status</div>
              <div>Notes</div>
              <div>Edit</div>
            </div>

            {leads.map((lead, i) => {
              const isEditing = editingId === lead.id;
              const isNew = (lead.status || "new") === "new";
              return (
                <div
                  key={lead.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 160px 140px 120px 110px 120px 100px 120px 1fr 80px",
                    padding: "12px 16px",
                    borderBottom: i < leads.length - 1 ? `1px solid ${BORDER}` : "none",
                    alignItems: "start",
                    background: isNew ? "#fffbeb" : "white",
                    fontSize: 13,
                  }}
                >
                  <div style={{ color: TEXT_SOFT, fontSize: 12, lineHeight: 1.4 }}>{fmt(lead.createdAt)}</div>
                  <div style={{ fontWeight: 600, color: TEXT, fontSize: 12, wordBreak: "break-word" }}>{lead.businessName || lead.landingPageSlug || "—"}</div>
                  <div style={{ color: TEXT, fontWeight: 500 }}>{lead.name || "—"}</div>
                  <div>
                    <a href={`tel:${lead.phone}`} style={{ color: PURPLE, textDecoration: "none", fontSize: 12 }}>
                      {lead.phone || "—"}
                    </a>
                  </div>
                  <div style={{ color: TEXT_SOFT, fontSize: 12 }}>{lead.preferredDate || "—"}</div>
                  <div style={{ color: TEXT_SOFT, fontSize: 12 }}>{lead.preferredTime || "—"}</div>
                  <div style={{ color: TEXT_SOFT, fontSize: 11 }}>{lead.source || "—"}</div>

                  <div>
                    {isEditing ? (
                      <select
                        value={editDraft.status}
                        onChange={e => setEditDraft(d => ({ ...d, status: e.target.value }))}
                        style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: FONT }}
                      >
                        {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <StatusBadge status={lead.status} />
                    )}
                  </div>

                  <div>
                    {isEditing ? (
                      <textarea
                        value={editDraft.notes}
                        onChange={e => setEditDraft(d => ({ ...d, notes: e.target.value }))}
                        placeholder="Add notes…"
                        rows={2}
                        style={{ width: "100%", padding: "5px 7px", borderRadius: 6, border: `1px solid ${BORDER}`, fontSize: 12, fontFamily: FONT, resize: "vertical", boxSizing: "border-box" }}
                      />
                    ) : (
                      <span style={{ fontSize: 12, color: lead.notes ? TEXT : TEXT_SOFT }}>
                        {lead.notes || <em>—</em>}
                      </span>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(lead.id)}
                          disabled={saving}
                          style={{ padding: "4px 10px", background: PURPLE, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: FONT }}
                        >
                          {saving ? "…" : "Save"}
                        </button>
                        <button
                          onClick={cancelEdit}
                          style={{ padding: "4px 10px", background: "none", color: TEXT_SOFT, border: `1px solid ${BORDER}`, borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: FONT }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => startEdit(lead)}
                        style={{ padding: "4px 10px", background: "none", color: PURPLE, border: `1px solid rgba(93,89,234,0.3)`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: FONT }}
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
