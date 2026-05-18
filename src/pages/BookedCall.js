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
// These are the fallback slots. Admin edit mode (localStorage) overrides them.
// youtubeUrl accepts: watch?v=, youtu.be/, or /embed/ formats.
// duration: leave blank to hide; add manually e.g. "3 min".
// thumbnail: leave blank to auto-derive from YouTube ID.
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

// ─── VideoCard (public view) ──────────────────────────────────────────────────────
function VideoCard({ video, isOpen, onToggle }) {
  const embedUrl    = getEmbedUrl(video.youtubeUrl);
  const thumbUrl    = getThumbnailUrl(video.youtubeUrl, video.thumbnail);
  const hasVideo    = !!embedUrl;
  const title       = video.title       || "Video coming soon";
  const description = video.description || "This video will be added soon.";
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        background: isOpen ? "rgba(93,89,234,0.09)" : hover ? "rgba(255,255,255,0.07)" : CARD_BG,
        border: `1px solid ${isOpen ? ACTIVE_BORDER : CARD_BORDER}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "all 150ms ease",
        boxShadow: isOpen ? GLOW : "none",
        cursor: hasVideo ? "pointer" : "default",
      }}
      onClick={hasVideo ? onToggle : undefined}
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
            {hasVideo && (
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
        {hasVideo && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: PURPLE, fontFamily: FONT, fontWeight: 600 }}>
            {isOpen ? "▲ Close" : "▶ Watch"}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AdminCardForm ────────────────────────────────────────────────────────────────
function AdminCardForm({ draft, index, onChange }) {
  const inputBase = {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 8,
    color: TEXT,
    fontFamily: FONT,
    fontSize: 13,
    padding: "9px 12px",
    outline: "none",
    marginTop: 5,
  };

  const labelStyle = { fontSize: 11, fontWeight: 600, color: TEXT_SOFT, fontFamily: FONT, letterSpacing: "0.04em", textTransform: "uppercase" };

  const previewThumb = getThumbnailUrl(draft.youtubeUrl, draft.thumbnail);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 14,
        padding: "18px 18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* Card number + thumbnail preview */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(93,89,234,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: PURPLE, fontFamily: FONT }}>{index + 1}</span>
        </div>
        {previewThumb && (
          <img src={previewThumb} alt="" style={{ height: 36, width: 64, objectFit: "cover", borderRadius: 6, opacity: 0.8 }} />
        )}
        <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: FONT }}>
          {draft.title || `Video slot ${index + 1}`}
        </span>
      </div>

      {/* YouTube URL */}
      <div>
        <label style={labelStyle}>YouTube URL</label>
        <input
          type="url"
          value={draft.youtubeUrl}
          onChange={(e) => onChange("youtubeUrl", e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          style={inputBase}
        />
        {draft.youtubeUrl && !getYouTubeId(draft.youtubeUrl) && (
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#e06060", fontFamily: FONT }}>
            Could not parse a YouTube ID — check the URL format.
          </p>
        )}
        {draft.youtubeUrl && getYouTubeId(draft.youtubeUrl) && (
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#1ec885", fontFamily: FONT }}>
            ✓ Valid YouTube ID: {getYouTubeId(draft.youtubeUrl)}
          </p>
        )}
      </div>

      {/* Title */}
      <div>
        <label style={labelStyle}>Title / Headline</label>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => onChange("title", e.target.value)}
          placeholder="e.g. How Smartemark Works"
          style={inputBase}
        />
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <textarea
          value={draft.description}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Short 1–2 sentence description shown under the video title."
          rows={2}
          style={{ ...inputBase, resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      {/* Duration */}
      <div>
        <label style={labelStyle}>Duration (optional)</label>
        <input
          type="text"
          value={draft.duration}
          onChange={(e) => onChange("duration", e.target.value)}
          placeholder='e.g. "2 min" — leave blank to hide'
          style={{ ...inputBase, width: "auto", minWidth: 140 }}
        />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────────
export default function BookedCall() {
  const isMobile = useIsMobile();

  // Public state
  const [videos, setVideos]   = useState(loadVideos);
  const [openId, setOpenId]   = useState(null);

  // Admin state
  const [adminMode, setAdminMode] = useState(false);
  const [drafts, setDrafts]       = useState([]);
  const [saved, setSaved]         = useState(false);

  const enterAdmin = () => {
    setDrafts(videos.map((v) => ({ ...v })));
    setAdminMode(true);
    setSaved(false);
  };

  const exitAdmin = () => {
    setAdminMode(false);
    setSaved(false);
  };

  const updateDraft = (id, field, value) => {
    setDrafts((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };

  const saveAll = () => {
    saveVideos(drafts);
    setVideos(drafts.map((v) => ({ ...v })));
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const resetToDefaults = () => {
    if (!window.confirm("Reset all videos to the code defaults? Any saved data in this browser will be cleared.")) return;
    try { localStorage.removeItem(LS_KEY); } catch {}
    const fresh = DEFAULT_VIDEOS.map((v) => ({ ...v }));
    setVideos(fresh);
    setDrafts(fresh);
    setSaved(false);
  };

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

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

      {/* ── Section 2: Admin mode ───────────────────────────────────────────── */}
      {adminMode && (
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: isMobile ? "0 16px 8px" : "0 24px 8px",
          }}
        >
          {/* Admin banner */}
          <div
            style={{
              background: "rgba(255,200,50,0.08)",
              border: "1px solid rgba(255,200,50,0.25)",
              borderRadius: 14,
              padding: "14px 18px",
              marginBottom: 20,
            }}
          >
            <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 700, color: "#f0c040", fontFamily: FONT }}>
              Admin Edit Mode
            </p>
            <p style={{ margin: 0, fontSize: 12, color: TEXT_MUTED, fontFamily: FONT, lineHeight: 1.5 }}>
              Changes are saved to this browser's localStorage. They will persist across refreshes but are device-local until a backend is added.
              Prospects visiting from other devices will see the code defaults until you share the saved state another way.
            </p>
          </div>

          {/* Edit forms */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {drafts.map((draft, i) => (
              <AdminCardForm
                key={draft.id}
                draft={draft}
                index={i}
                onChange={(field, value) => updateDraft(draft.id, field, value)}
              />
            ))}
          </div>

          {/* Admin action bar */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              margin: "20px 0 32px",
              alignItems: "center",
            }}
          >
            <button
              onClick={saveAll}
              style={{
                background: "linear-gradient(135deg, #4c63ff 0%, #5d59ea 100%)",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              {saved ? "✓ Saved!" : "Save All Changes"}
            </button>

            <button
              onClick={exitAdmin}
              style={{
                background: "rgba(255,255,255,0.08)",
                color: TEXT,
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                padding: "11px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: FONT,
              }}
            >
              Done
            </button>

            <button
              onClick={resetToDefaults}
              style={{
                background: "transparent",
                color: TEXT_MUTED,
                border: "none",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: FONT,
                padding: "8px 4px",
                marginLeft: "auto",
              }}
            >
              Reset to defaults
            </button>
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

    </div>
  );
}
