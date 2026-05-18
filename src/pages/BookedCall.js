/* eslint-disable */
import React, { useState, useEffect } from "react";
import smartmarkLogo from "../assets/smartemark-logo.png";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const FONT        = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PAGE_BG     = "linear-gradient(160deg, #0b0e1c 0%, #0f1228 60%, #0d1020 100%)";
const TEXT        = "#f0f0f8";
const TEXT_SOFT   = "#8b93b8";
const TEXT_MUTED  = "#5a6080";
const PURPLE      = "#5d59ea";
const GREEN       = "#1ec885";
const CARD_BG     = "rgba(255,255,255,0.05)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const ACTIVE_BORDER = "rgba(93,89,234,0.55)";
const GLOW        = "0 0 28px rgba(93,89,234,0.15)";

// ─── VIDEO CATALOG ──────────────────────────────────────────────────────────────
// Admin: fill in title, description, youtubeUrl (and optionally duration/thumbnail)
// for each slot as you record videos. Leave fields blank to show coming-soon state.
//
// youtubeUrl accepts:
//   https://www.youtube.com/watch?v=VIDEO_ID
//   https://youtu.be/VIDEO_ID
//   https://www.youtube.com/embed/VIDEO_ID
//
// duration: optional — leave blank ("") to hide it; or add e.g. "3 min" manually.
// thumbnail: optional — auto-derived from YouTube ID if blank.

const VIDEOS = [
  {
    id: "video-1",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
  {
    id: "video-2",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
  {
    id: "video-3",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
  {
    id: "video-4",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
  {
    id: "video-5",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
  {
    id: "video-6",
    title: "",
    description: "",
    youtubeUrl: "",
    thumbnail: "",
    duration: "",
  },
];

// ─── YouTube helpers ────────────────────────────────────────────────────────────
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

// ─── useIsMobile ────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth <= 680);
  useEffect(() => {
    const fn = () => setIs(window.innerWidth <= 680);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return is;
}

// ─── VideoCard ──────────────────────────────────────────────────────────────────
// Clicking a card with a valid URL expands the inline player inside that card.
// Clicking again collapses it. Fullscreen works through the YouTube iframe.
function VideoCard({ video, isOpen, onToggle }) {
  const embedUrl   = getEmbedUrl(video.youtubeUrl);
  const thumbUrl   = getThumbnailUrl(video.youtubeUrl, video.thumbnail);
  const hasVideo   = !!embedUrl;
  const title      = video.title       || "Video coming soon";
  const description= video.description || "This video will be added soon.";
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
      {/* ── Thumbnail / player area ─────────────────────────────────────── */}
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#0a0c18" }}>
        {isOpen && embedUrl ? (
          /* Inline YouTube player — stops when collapsed (iframe removed from DOM) */
          <iframe
            src={`${embedUrl}&autoplay=1`}
            title={title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            loading="lazy"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        ) : thumbUrl ? (
          /* Thumbnail with play overlay */
          <>
            <img
              src={thumbUrl}
              alt={title}
              loading="lazy"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                opacity: 0.80,
              }}
            />
            {hasVideo && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.18)",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.88)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 4px 14px rgba(0,0,0,0.35)",
                  }}
                >
                  <span style={{ fontSize: 16, color: "#111", marginLeft: 3, lineHeight: 1 }}>▶</span>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Coming-soon placeholder */
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "linear-gradient(135deg, #10132a 0%, #0d1128 100%)",
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "rgba(93,89,234,0.18)",
                border: "1.5px solid rgba(93,89,234,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ fontSize: 16, color: PURPLE, marginLeft: 2, lineHeight: 1 }}>▶</span>
            </div>
            <span style={{ fontSize: 12, color: TEXT_MUTED, fontFamily: FONT }}>Coming soon</span>
          </div>
        )}

        {/* Duration badge — only shown when provided */}
        {video.duration && !isOpen && (
          <div
            style={{
              position: "absolute",
              bottom: 7,
              right: 9,
              background: "rgba(0,0,0,0.72)",
              color: "#fff",
              fontSize: 10,
              fontWeight: 600,
              padding: "2px 8px",
              borderRadius: 6,
              fontFamily: FONT,
              letterSpacing: "0.02em",
            }}
          >
            {video.duration}
          </div>
        )}
      </div>

      {/* ── Text area ───────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 16px 16px" }}>
        <p
          style={{
            margin: "0 0 5px",
            fontSize: 14,
            fontWeight: 600,
            color: isOpen ? "#e0e0ff" : TEXT,
            fontFamily: FONT,
            lineHeight: 1.35,
          }}
        >
          {title}
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: TEXT_MUTED,
            fontFamily: FONT,
            lineHeight: 1.5,
          }}
        >
          {description}
        </p>
        {hasVideo && (
          <p
            style={{
              margin: "10px 0 0",
              fontSize: 12,
              color: PURPLE,
              fontFamily: FONT,
              fontWeight: 600,
            }}
          >
            {isOpen ? "▲ Close" : "▶ Watch"}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────────
export default function BookedCall() {
  const isMobile = useIsMobile();
  const [openId, setOpenId] = useState(null);

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, fontFamily: FONT, color: TEXT }}>

      {/* ── Section 1: Header ──────────────────────────────────────────────── */}
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
            fontSize: isMobile ? 26 : 32,
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          Smartemark Videos
        </h1>

        <p
          style={{
            margin: "0 auto",
            maxWidth: 520,
            fontSize: isMobile ? 15 : 16,
            color: TEXT_SOFT,
            lineHeight: 1.65,
          }}
        >
          Here are a few short videos that explain how Smartemark works before our call.
        </p>
      </div>

      {/* ── Section 2: Video catalog ────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "0 16px 56px" : "0 24px 72px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
          }}
        >
          {VIDEOS.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              isOpen={openId === v.id}
              onToggle={() => toggle(v.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Section 3: Footer ───────────────────────────────────────────────── */}
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
          style={{ height: 24, objectFit: "contain", opacity: 0.55, marginBottom: 16 }}
        />
        <p style={{ margin: 0, fontSize: 15, color: TEXT_SOFT, lineHeight: 1.6 }}>
          Looking forward to speaking with you on our scheduled call.
        </p>
      </div>

    </div>
  );
}
