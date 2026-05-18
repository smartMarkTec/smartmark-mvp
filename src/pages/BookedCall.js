/* eslint-disable */
import React, { useState, useEffect } from "react";
import smartmarkLogo from "../assets/smartemark-logo.png";

// ─── Design tokens (dark variant of Smartemark palette) ───────────────────────
const FONT   = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PAGE_BG = "linear-gradient(160deg, #0b0e1c 0%, #0f1228 60%, #0d1020 100%)";
const TEXT        = "#f0f0f8";
const TEXT_SOFT   = "#8b93b8";
const TEXT_MUTED  = "#5a6080";
const PURPLE      = "#5d59ea";
const BLUE        = "#4c63ff";
const GREEN       = "#1ec885";
const CARD_BG     = "rgba(255,255,255,0.05)";
const CARD_BORDER = "rgba(255,255,255,0.10)";
const ACTIVE_BORDER = "rgba(93,89,234,0.60)";
const GLOW        = "0 0 28px rgba(93,89,234,0.15)";
const PANEL_SHADOW = "0 8px 32px rgba(0,0,0,0.35)";

// ─── Video catalog ─────────────────────────────────────────────────────────────
// To update: replace youtubeUrl with any YouTube watch/share/embed URL.
// Thumbnail is auto-derived from the YouTube ID if left blank.
const VIDEOS = [
  {
    id: 1,
    title: "How Smartemark Works",
    description: "Quick breakdown of how Smartemark automates and optimizes advertising for local service businesses.",
    duration: "2 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_1",
  },
  {
    id: 2,
    title: "Why Most HVAC Ads Fail",
    description: "The most common reasons local service businesses waste money on ads — and how to avoid them.",
    duration: "3 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_2",
  },
  {
    id: 3,
    title: "What Makes Smartemark Different",
    description: "How Smartemark compares to hiring an agency or managing ads yourself.",
    duration: "2 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_3",
  },
  {
    id: 4,
    title: "Common Questions Before Getting Started",
    description: "Answers to the questions business owners usually ask before deciding to move forward.",
    duration: "4 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_4",
  },
  {
    id: 5,
    title: "Why Businesses Waste Money On Ads",
    description: "The core mistakes in ad strategy that cause most local businesses to overspend and underperform.",
    duration: "3 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_5",
  },
  {
    id: 6,
    title: "How AI Ad Optimization Works",
    description: "A plain-English explanation of how AI is used to generate and improve ads in Smartemark.",
    duration: "2 min",
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_6",
  },
];

// ─── FAQ data ──────────────────────────────────────────────────────────────────
const FAQS = [
  {
    id: 1,
    q: "Is Smartemark an agency?",
    a: "No. Smartemark is software that helps automate and improve parts of your ad creation and campaign workflow. The goal is to make marketing easier without requiring you to manage everything manually or hire an agency.",
  },
  {
    id: 2,
    q: "How much work is required from me?",
    a: "The setup is designed to be simple. You provide basic business details, and Smartemark helps generate ad creative and campaign assets from there. We'll walk through it together on the call.",
  },
  {
    id: 3,
    q: "What businesses is this best for?",
    a: "It is best for local service businesses — HVAC, plumbing, electrical, roofing, and similar — that want more consistent marketing without having to become ad experts or hire full-time help.",
  },
  {
    id: 4,
    q: "How quickly can campaigns launch?",
    a: "The goal is to make setup fast. We'll walk through the process on the call and show exactly what the launch flow looks like so you can see how quickly things move.",
  },
  {
    id: 5,
    q: "Do I need ad experience?",
    a: "No. Smartemark is built for business owners who want a simpler way to create and manage advertising without needing to learn complicated ad platforms.",
  },
];

// ─── YouTube helpers ───────────────────────────────────────────────────────────
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
  if (!id || id.startsWith("PLACEHOLDER")) return null;
  return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&autoplay=0`;
}

function getThumbnailUrl(url) {
  const id = getYouTubeId(url);
  if (!id || id.startsWith("PLACEHOLDER")) return null;
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

// ─── useIsMobile hook ──────────────────────────────────────────────────────────
function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth <= 680);
  useEffect(() => {
    const fn = () => setIs(window.innerWidth <= 680);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return is;
}

// ─── VideoPlayer ───────────────────────────────────────────────────────────────
function VideoPlayer({ video }) {
  const embedUrl = getEmbedUrl(video.youtubeUrl);
  const thumbUrl = getThumbnailUrl(video.youtubeUrl);

  return (
    <div
      style={{
        borderRadius: 16,
        overflow: "hidden",
        background: "#0a0c18",
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: PANEL_SHADOW,
      }}
    >
      {/* 16:9 responsive wrapper */}
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#0a0c18" }}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            title={video.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
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
        ) : (
          /* Placeholder when YouTube URL not yet set */
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
              gap: 12,
              background: "linear-gradient(135deg, #10132a 0%, #0e1128 100%)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(93,89,234,0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid rgba(93,89,234,0.40)",
              }}
            >
              <span style={{ fontSize: 22, color: PURPLE, marginLeft: 3 }}>▶</span>
            </div>
            <span style={{ fontSize: 13, color: TEXT_MUTED, fontFamily: FONT }}>
              Video coming soon
            </span>
          </div>
        )}
      </div>

      {/* Caption bar */}
      <div style={{ padding: "16px 20px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: GREEN,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontFamily: FONT,
              background: "rgba(30,200,133,0.10)",
              padding: "3px 10px",
              borderRadius: 999,
            }}
          >
            {video.duration}
          </span>
        </div>
        <h3
          style={{
            margin: "10px 0 6px",
            fontSize: 18,
            fontWeight: 700,
            color: TEXT,
            fontFamily: FONT,
            lineHeight: 1.3,
          }}
        >
          {video.title}
        </h3>
        <p style={{ margin: 0, fontSize: 14, color: TEXT_SOFT, fontFamily: FONT, lineHeight: 1.5 }}>
          {video.description}
        </p>
      </div>
    </div>
  );
}

// ─── VideoCard (catalog) ───────────────────────────────────────────────────────
function VideoCard({ video, isActive, onClick }) {
  const [hover, setHover] = useState(false);
  const thumbUrl = getThumbnailUrl(video.youtubeUrl);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: isActive
          ? "rgba(93,89,234,0.12)"
          : hover
          ? "rgba(255,255,255,0.07)"
          : CARD_BG,
        border: `1px solid ${isActive ? ACTIVE_BORDER : CARD_BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        transition: "all 150ms ease",
        boxShadow: isActive ? GLOW : "none",
      }}
    >
      {/* Thumbnail */}
      <div
        style={{
          position: "relative",
          paddingTop: "56.25%",
          background: "#0a0c18",
          overflow: "hidden",
        }}
      >
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.title}
            loading="lazy"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: isActive ? 0.9 : 0.75,
              transition: "opacity 150ms ease",
            }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #10132a 0%, #0e1128 100%)",
            }}
          >
            <span style={{ fontSize: 20, color: "rgba(93,89,234,0.50)" }}>▶</span>
          </div>
        )}
        {/* Play overlay */}
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
            background: "rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: isActive ? PURPLE : "rgba(255,255,255,0.75)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 2px 8px rgba(0,0,0,0.40)",
              transition: "background 150ms ease",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: isActive ? "#fff" : "#111",
                marginLeft: 2,
                lineHeight: 1,
              }}
            >
              ▶
            </span>
          </div>
        </div>
        {/* Duration badge */}
        <div
          style={{
            position: "absolute",
            bottom: 6,
            right: 8,
            background: "rgba(0,0,0,0.70)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 7px",
            borderRadius: 6,
            fontFamily: FONT,
          }}
        >
          {video.duration}
        </div>
      </div>

      {/* Text */}
      <div style={{ padding: "12px 14px 14px" }}>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            color: isActive ? "#e0e0ff" : TEXT,
            fontFamily: FONT,
            lineHeight: 1.35,
          }}
        >
          {video.title}
        </p>
        <p
          style={{
            margin: "5px 0 0",
            fontSize: 12,
            color: TEXT_MUTED,
            fontFamily: FONT,
            lineHeight: 1.4,
          }}
        >
          {video.description}
        </p>
      </div>
    </div>
  );
}

// ─── FAQItem ───────────────────────────────────────────────────────────────────
function FAQItem({ item, isOpen, onToggle }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${isOpen ? ACTIVE_BORDER : CARD_BORDER}`,
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 200ms ease",
        boxShadow: isOpen ? GLOW : "none",
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "20px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 14,
          textAlign: "left",
          fontFamily: FONT,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: TEXT, lineHeight: 1.4, flex: 1 }}>
          {item.q}
        </span>
        <span
          style={{
            fontSize: 18,
            color: PURPLE,
            flexShrink: 0,
            transition: "transform 200ms ease",
            transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
            display: "inline-block",
            lineHeight: 1,
          }}
        >
          +
        </span>
      </button>

      {isOpen && (
        <div style={{ padding: "0 22px 20px" }}>
          <p style={{ margin: 0, fontSize: 14, color: TEXT_SOFT, lineHeight: 1.7, fontFamily: FONT }}>
            {item.a}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export default function BookedCall() {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(VIDEOS[0].id);
  const [openFaqId, setOpenFaqId] = useState(null);

  const selectedVideo = VIDEOS.find((v) => v.id === selectedId) || VIDEOS[0];
  const otherVideos   = VIDEOS.filter((v) => v.id !== selectedId);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: PAGE_BG,
        fontFamily: FONT,
        color: TEXT,
      }}
    >
      {/* ── SECTION 1: Header ─────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "40px 20px 32px" : "60px 24px 40px",
          textAlign: "center",
        }}
      >
        {/* Logo */}
        <div style={{ marginBottom: 28 }}>
          <img
            src={smartmarkLogo}
            alt="Smartemark"
            style={{ height: 34, objectFit: "contain" }}
          />
        </div>

        {/* Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            padding: "6px 14px",
            borderRadius: 999,
            border: "1px solid rgba(93,89,234,0.35)",
            background: "rgba(93,89,234,0.10)",
            color: PURPLE,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.04em",
            marginBottom: 22,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, display: "inline-block" }} />
          Booked Call Prep
        </div>

        <h1
          style={{
            margin: "0 0 16px",
            fontSize: isMobile ? 28 : 36,
            fontWeight: 800,
            color: TEXT,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          Welcome to Smartemark
        </h1>

        <p
          style={{
            margin: "0 auto",
            maxWidth: 580,
            fontSize: isMobile ? 15 : 16,
            color: TEXT_SOFT,
            lineHeight: 1.65,
          }}
        >
          Before our call, here are a few quick videos explaining how Smartemark
          works and answering common questions business owners usually have
          beforehand.
        </p>
      </div>

      {/* ── SECTION 2: Featured video ─────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "0 16px 40px" : "0 24px 52px",
        }}
      >
        <VideoPlayer video={selectedVideo} />
      </div>

      {/* ── SECTION 3: Video catalog ──────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "0 16px 52px" : "0 24px 64px",
        }}
      >
        <h2
          style={{
            margin: "0 0 20px",
            fontSize: 18,
            fontWeight: 700,
            color: TEXT,
            letterSpacing: "-0.01em",
          }}
        >
          More Videos
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 14,
          }}
        >
          {VIDEOS.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              isActive={v.id === selectedId}
              onClick={() => {
                setSelectedId(v.id);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          ))}
        </div>
      </div>

      {/* ── SECTION 4: FAQ ────────────────────────────────────────────────── */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: isMobile ? "0 16px 56px" : "0 24px 72px",
        }}
      >
        {/* Section label */}
        <div style={{ marginBottom: 24 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: PURPLE,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Common Questions
          </span>
          <h2
            style={{
              margin: "8px 0 0",
              fontSize: 22,
              fontWeight: 700,
              color: TEXT,
              letterSpacing: "-0.01em",
            }}
          >
            Before the Call
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {FAQS.map((item) => (
            <FAQItem
              key={item.id}
              item={item}
              isOpen={openFaqId === item.id}
              onToggle={() =>
                setOpenFaqId(openFaqId === item.id ? null : item.id)
              }
            />
          ))}
        </div>
      </div>

      {/* ── SECTION 5: Footer ─────────────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: isMobile ? "36px 20px 48px" : "44px 24px 56px",
          textAlign: "center",
        }}
      >
        <img
          src={smartmarkLogo}
          alt="Smartemark"
          style={{ height: 26, objectFit: "contain", opacity: 0.65, marginBottom: 18 }}
        />
        <p
          style={{
            margin: "0 auto 10px",
            maxWidth: 480,
            fontSize: 15,
            color: TEXT_SOFT,
            lineHeight: 1.6,
          }}
        >
          Looking forward to speaking with you on your scheduled call.
        </p>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 }}>
          If you have questions before then, feel free to reply to the message
          where you received this link.
        </p>
      </div>
    </div>
  );
}
