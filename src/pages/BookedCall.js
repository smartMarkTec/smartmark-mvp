/* eslint-disable */
import React, { useState, useEffect } from "react";
import smartmarkLogo from "../assets/smartemark-logo.png";

// ─── Design tokens ──────────────────────────────────────────────────────────────
const FONT          = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PAGE_BG       = "linear-gradient(160deg, #0b0e1c 0%, #0f1228 60%, #0d1020 100%)";
const TEXT          = "#f0f0f8";
const TEXT_SOFT     = "#8b93b8";
const TEXT_MUTED    = "#5a6080";
const PURPLE        = "#5d59ea";
const CARD_BG       = "rgba(255,255,255,0.05)";
const CARD_BORDER   = "rgba(255,255,255,0.10)";
const ACTIVE_BORDER = "rgba(93,89,234,0.55)";
const GLOW          = "0 0 28px rgba(93,89,234,0.15)";

// ─── Video defaults ──────────────────────────────────────────────────────────────
const DEFAULT_VIDEOS = [
  { id: "video-1", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
  { id: "video-2", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
  { id: "video-3", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
  { id: "video-4", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
  { id: "video-5", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
  { id: "video-6", title: "", description: "", youtubeUrl: "", thumbnail: "", duration: "" },
];

// ─── localStorage helpers ────────────────────────────────────────────────────────
const LS_KEY = "sm_booked_videos";

function loadVideos() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_VIDEOS.map((v) => ({ ...v }));
}

function saveVideos(videos) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(videos));
  } catch {}
}

// ─── YouTube helpers ─────────────────────────────────────────────────────────────
function getYouTubeId(url) {
  if (!url) return null;
  const m =
    url.match(/[?&]v=([^&#]+)/) ||
    url.match(/youtu\.be\/([^?&#]+)/) ||
    url.match(/embed\/([^?&#]+)/);
  return m ? m[1] : null;
}

function getEmbedUrl(url) {
  const id = getYouTubeId(url);
  if (!id) return null;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

function getThumbnailUrl(url, override) {
  if (override) return override;
  const id = getYouTubeId(url);
  if (!id) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// ─── useIsMobile ─────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth <= 680);
  useEffect(() => {
    const fn = () => setIs(window.innerWidth <= 680);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return is;
}

// ─── VideoCard (public view, with optional admin overlay button) ──────────────────
function VideoCard({ video, isOpen, onToggle, adminMode, onAdminEdit }) {
  const embedUrl    = getEmbedUrl(video.youtubeUrl);
  const thumbUrl    = getThumbnailUrl(video.youtubeUrl, video.thumbnail);
  const hasVideo    = !!embedUrl;
  const isPopulated = !!(video.title || video.youtubeUrl);
  const title       = video.title       || "Video coming soon";
  const description = video.description || "This video will be added soon.";
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        background: isOpen ? "rgba(93,89,234,0.09)" : hover ? "rgba(255,255,255,0.07)" : CARD_BG,
        border: `1px solid ${isOpen ? ACTIVE_BORDER : CARD_BORDER}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "all 150ms ease",
        boxShadow: isOpen ? GLOW : "none",
        cursor: adminMode ? "default" : hasVideo ? "pointer" : "default",
      }}
      onClick={!adminMode && hasVideo ? onToggle : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail / player */}
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#0a0c18" }}>
        {isOpen && embedUrl ? (
          <iframe
            src={`${embedUrl}&autoplay=1`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
          />
        ) : thumbUrl ? (
          <>
            <img
              src={thumbUrl}
              alt={title}
              loading="lazy"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8 }}
            />
            {hasVideo && !adminMode && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.18)" }}>
                <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.88)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,0.35)" }}>
                  <span style={{ fontSize: 16, color: "#111", marginLeft: 3, lineHeight: 1 }}>▶</span>
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, background: "linear-gradient(135deg, #10132a 0%, #0d1128 100%)" }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(93,89,234,0.18)", border: "1.5px solid rgba(93,89,234,0.35)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 16, color: PURPLE, marginLeft: 2, lineHeight: 1 }}>▶</span>
            </div>
            <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: FONT }}>Coming soon</span>
          </div>
        )}

        {video.duration && !isOpen && (
          <div style={{ position: "absolute", bottom: 7, right: 9, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, fontFamily: FONT }}>
            {video.duration}
          </div>
        )}
      </div>

      {/* Text */}
      <div style={{ padding: "14px 16px 16px" }}>
        <p style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 600, color: isOpen ? "#e0e0ff" : TEXT, fontFamily: FONT, lineHeight: 1.35 }}>
          {title}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: FONT, lineHeight: 1.5 }}>
          {description}
        </p>
        {hasVideo && !adminMode && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: PURPLE, fontFamily: FONT, fontWeight: 600 }}>
            {isOpen ? "▲ Close" : "▶ Watch"}
          </p>
        )}
      </div>

      {/* Admin edit button — only visible in admin mode */}
      {adminMode && (
        <button
          onClick={(e) => { e.stopPropagation(); onAdminEdit(); }}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "rgba(93,89,234,0.88)",
            border: "none",
            borderRadius: 8,
            color: "#fff",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
            padding: "5px 11px",
            fontFamily: FONT,
            zIndex: 10,
            backdropFilter: "blur(4px)",
            letterSpacing: "0.01em",
          }}
        >
          {isPopulated ? "Edit" : "+ Add"}
        </button>
      )}
    </div>
  );
}

// ─── AdminModal — edit form for a single video card ───────────────────────────────
function AdminModal({ video, index, onSave, onCancel }) {
  const [local, setLocal] = useState({ ...video });

  const ytId = getYouTubeId(local.youtubeUrl);
  const isPopulated = !!(local.youtubeUrl || local.title || local.description || local.duration);

  const inputBase = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: TEXT,
    fontFamily: FONT,
    fontSize: 14,
    padding: "10px 13px",
    outline: "none",
    marginTop: 6,
  };

  const labelStyle = {
    fontSize: 11,
    fontWeight: 700,
    color: TEXT_SOFT,
    fontFamily: FONT,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  };

  const set = (field, value) => setLocal((p) => ({ ...p, [field]: value }));

  const clearVideo = () => {
    if (!window.confirm("Clear all data for this video slot?")) return;
    setLocal({ ...video, youtubeUrl: "", title: "", description: "", duration: "", thumbnail: "" });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.72)",
          zIndex: 2000,
        }}
      />

      {/* Modal panel */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 2001,
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "#12152e",
          border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 20,
          padding: "26px 24px 30px",
          boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Modal header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(93,89,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: PURPLE, fontFamily: FONT }}>{index + 1}</span>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, color: TEXT, fontFamily: FONT }}>
              {video.title ? "Edit Video" : "Add Video"}
            </span>
          </div>
          <button
            onClick={onCancel}
            style={{ background: "transparent", border: "none", color: TEXT_MUTED, fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "2px 6px", fontFamily: FONT }}
          >
            ×
          </button>
        </div>

        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* YouTube URL */}
          <div>
            <label style={labelStyle}>YouTube URL</label>
            <input
              type="url"
              value={local.youtubeUrl}
              onChange={(e) => set("youtubeUrl", e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              style={inputBase}
            />
            {local.youtubeUrl && !ytId && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#e06060", fontFamily: FONT }}>
                Could not parse a YouTube ID — check the URL format.
              </p>
            )}
            {local.youtubeUrl && ytId && (
              <p style={{ margin: "5px 0 0", fontSize: 12, color: "#1ec885", fontFamily: FONT }}>
                ✓ Valid — YouTube ID: {ytId}
              </p>
            )}
          </div>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title / Headline</label>
            <input
              type="text"
              value={local.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="e.g. How Smartemark Works"
              style={inputBase}
            />
          </div>

          {/* Description */}
          <div>
            <label style={labelStyle}>Description</label>
            <textarea
              value={local.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Short 1–2 sentence description shown under the video title."
              rows={2}
              style={{ ...inputBase, resize: "vertical", lineHeight: 1.55 }}
            />
          </div>

          {/* Duration */}
          <div>
            <label style={labelStyle}>Duration (optional)</label>
            <input
              type="text"
              value={local.duration}
              onChange={(e) => set("duration", e.target.value)}
              placeholder='e.g. "3 min" — leave blank to hide'
              style={{ ...inputBase, width: "auto", minWidth: 160 }}
            />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 10, marginTop: 24, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => onSave(local)}
            style={{
              background: "linear-gradient(135deg, #4c63ff 0%, #5d59ea 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 26px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Save
          </button>

          <button
            onClick={onCancel}
            style={{
              background: "rgba(255,255,255,0.07)",
              color: TEXT,
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 10,
              padding: "12px 22px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: FONT,
            }}
          >
            Cancel
          </button>

          {isPopulated && (
            <button
              onClick={clearVideo}
              style={{
                background: "transparent",
                color: TEXT_MUTED,
                border: "none",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
                marginLeft: "auto",
                padding: "8px 4px",
              }}
            >
              Clear video
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────────
export default function BookedCall() {
  const isMobile = useIsMobile();

  // Public state
  const [videos, setVideos] = useState(loadVideos);
  const [openId, setOpenId] = useState(null);

  // Admin state
  const [adminMode, setAdminMode]   = useState(false);
  const [editingId, setEditingId]   = useState(null); // id of the card whose modal is open

  const enterAdmin = () => {
    setAdminMode(true);
    setEditingId(null);
    setOpenId(null);
  };

  const exitAdmin = () => {
    setAdminMode(false);
    setEditingId(null);
  };

  const handleAdminSave = (id, updatedData) => {
    const updated = videos.map((v) => (v.id === id ? { ...v, ...updatedData } : v));
    setVideos(updated);
    saveVideos(updated);
    setEditingId(null);
  };

  const resetToDefaults = () => {
    if (!window.confirm("Reset all videos to the code defaults? Any saved data in this browser will be cleared.")) return;
    try { localStorage.removeItem(LS_KEY); } catch {}
    const fresh = DEFAULT_VIDEOS.map((v) => ({ ...v }));
    setVideos(fresh);
    setEditingId(null);
  };

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  // Find the video being edited
  const editingVideo = editingId ? videos.find((v) => v.id === editingId) : null;
  const editingIndex = editingId ? videos.findIndex((v) => v.id === editingId) : -1;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, fontFamily: FONT, color: TEXT }}>

      {/* ── Section 1: Header ───────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "44px 20px 32px" : "64px 24px 40px",
          textAlign: "center",
        }}
      >
        <div style={{ marginBottom: 28 }}>
          <img src={smartmarkLogo} alt="Smartemark" style={{ height: 32, objectFit: "contain" }} />
        </div>

        <h1
          style={{
            margin: "0 0 14px",
            fontSize: isMobile ? 26 : 34,
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          Smartemark Video Library
        </h1>

        <p
          style={{
            margin: "0 auto",
            maxWidth: 540,
            fontSize: isMobile ? 15 : 16,
            color: TEXT_SOFT,
            lineHeight: 1.7,
          }}
        >
          Before our call, these short videos will help you understand how Smartemark works,
          what makes it different, and how it can help simplify your advertising.
        </p>
      </div>

      {/* ── Section 2: Admin mode banner (only shown when active) ───────────── */}
      {adminMode && (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: isMobile ? "0 16px 20px" : "0 24px 20px",
          }}
        >
          <div
            style={{
              background: "rgba(255,200,50,0.08)",
              border: "1px solid rgba(255,200,50,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 700, color: "#f0c040", fontFamily: FONT }}>
                Admin Edit Mode
              </p>
              <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, fontFamily: FONT, lineHeight: 1.5 }}>
                Tap "+ Add" or "Edit" on any video card to update it. Changes save instantly to this browser.
              </p>
            </div>

            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
              <button
                onClick={resetToDefaults}
                style={{
                  background: "transparent",
                  color: TEXT_MUTED,
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: FONT,
                  padding: "7px 12px",
                }}
              >
                Reset
              </button>
              <button
                onClick={exitAdmin}
                style={{
                  background: "rgba(255,255,255,0.10)",
                  color: TEXT,
                  border: "1px solid rgba(255,255,255,0.18)",
                  borderRadius: 8,
                  padding: "8px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: FONT,
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 3: Video catalog ────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "0 16px 64px" : "0 24px 80px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
          }}
        >
          {videos.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              isOpen={!adminMode && openId === v.id}
              onToggle={() => toggle(v.id)}
              adminMode={adminMode}
              onAdminEdit={() => setEditingId(v.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Section 4: Footer ───────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: isMobile ? "32px 20px 48px" : "40px 24px 56px",
          textAlign: "center",
        }}
      >
        <img
          src={smartmarkLogo}
          alt="Smartemark"
          style={{ height: 24, objectFit: "contain", opacity: 0.5, marginBottom: 16 }}
        />
        <p style={{ margin: "0 0 28px", fontSize: 15, color: TEXT_SOFT, lineHeight: 1.6 }}>
          Looking forward to speaking with you on our scheduled call.
        </p>

        {/* Admin entry — subtle, won't confuse prospects */}
        {!adminMode && (
          <button
            onClick={enterAdmin}
            style={{
              background: "transparent",
              border: "none",
              color: TEXT_MUTED,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: FONT,
              opacity: 0.5,
              padding: "4px 8px",
            }}
          >
            Admin Edit
          </button>
        )}
      </div>

      {/* ── Admin modal — renders on top when a card's Edit button is clicked ── */}
      {adminMode && editingVideo && (
        <AdminModal
          video={editingVideo}
          index={editingIndex}
          onSave={(data) => handleAdminSave(editingId, data)}
          onCancel={() => setEditingId(null)}
        />
      )}

    </div>
  );
}
