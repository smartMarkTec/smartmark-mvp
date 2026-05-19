/* eslint-disable */
import { useState, useEffect } from "react";
import smartmarkLogo from "../assets/smartemark-logo.png";

// ─── Design tokens ──────────────────────────────────────────────────────────────
const FONT       = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PAGE_BG    = "linear-gradient(160deg, #0b0e1c 0%, #0f1228 60%, #0d1020 100%)";
const TEXT       = "#f0f0f8";
const TEXT_SOFT  = "#8b93b8";
const TEXT_MUTED = "#5a6080";
const PURPLE     = "#5d59ea";
const CARD_BG    = "rgba(255,255,255,0.05)";
const CARD_BORDER= "rgba(255,255,255,0.10)";
const GLOW       = "0 0 28px rgba(93,89,234,0.15)";

// ─── VIDEO LIBRARY ────────────────────────────────────────────────────────────────
// Edit this array to update videos for ALL visitors on ALL devices after deploy.
//
// Fields:
//   id          — internal key, keep as-is
//   slug        — appears in shareable links: /booked-call?video=THIS-VALUE
//                 lowercase, hyphens only, no spaces. Auto-derived from title if blank.
//   title       — card headline. Blank → "Video coming soon"
//   description — text under title. Blank → "This video will be added soon."
//   youtubeUrl  — full YouTube URL (watch, share, or embed format). Blank → coming-soon state.
//   duration    — optional badge like "3 min". Leave blank to hide.
//
// Example:
//   { id: "video-1", slug: "smartemark-overview", title: "How Smartemark Works",
//     description: "A 3-minute walkthrough of what Smartemark does.",
//     youtubeUrl: "https://www.youtube.com/watch?v=YOUR_VIDEO_ID", duration: "3 min" },
//
const VIDEOS = [
  {
    id: "video-1",
    slug: "why-hvac-marketing-feels-like-a-waste-of-money",
    title: "Why HVAC Marketing Often Feels Like A Waste Of Money",
    description: "Why traditional HVAC marketing can feel frustrating, and how Smartemark is designed to simplify the process.",
    youtubeUrl: "https://youtu.be/7a9WzezMEfU",
    thumbnail: "",
    duration: "3 min",
  },
  {
    id: "video-2",
    slug: "smartemark-in-2-minutes",
    title: "Smartemark in 2 Minutes",
    description: "A quick overview of how Smartemark works and what business owners can expect before getting started.",
    youtubeUrl: "https://youtu.be/Db61PCdNt8A",
    thumbnail: "",
    duration: "2 min",
  },
  {
    id: "video-3",
    slug: "smartemark-pricing-explained-in-2-minutes",
    title: "Smartemark Pricing Explained in 2 Minutes",
    description: "A simple breakdown of Smartemark pricing and what each plan is designed to help with.",
    youtubeUrl: "https://youtu.be/qwAsvW7IgUQ",
    thumbnail: "",
    duration: "2 min",
  },
  {
    id: "video-4",
    slug: "will-the-ads-look-fake-or-cheesy",
    title: "Will The Ads Look Fake Or Cheesy?",
    description: "A quick explanation of how Smartemark creates ads that are meant to look professional, not fake or cheesy.",
    youtubeUrl: "https://youtu.be/1SY08ydXGAg",
    thumbnail: "",
    duration: "2 min",
  },
];

// ─── Slug helpers ─────────────────────────────────────────────────────────────────
function makeSlug(title) {
  return String(title || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Priority: explicit slug → derived from title → fall back to id
function getVideoSlug(video) {
  if (video.slug) return video.slug;
  const fromTitle = makeSlug(video.title);
  if (fromTitle) return fromTitle;
  return video.id;
}

// ─── YouTube helpers ──────────────────────────────────────────────────────────────
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

// ─── useIsMobile ──────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [is, setIs] = useState(window.innerWidth <= 680);
  useEffect(() => {
    const fn = () => setIs(window.innerWidth <= 680);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return is;
}

// ─── CopyLinkButton ───────────────────────────────────────────────────────────────
function CopyLinkButton({ video }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const slug = getVideoSlug(video);
    const url  = `${window.location.origin}/booked-call?video=${encodeURIComponent(slug)}`;

    navigator.clipboard.writeText(url).catch(() => {
      try {
        const el = document.createElement("textarea");
        el.value = url;
        el.style.cssText = "position:fixed;opacity:0;pointer-events:none";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {}
    });

    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <button
      onClick={handleCopy}
      title="Copy direct link to this video"
      style={{
        background: "transparent",
        border: "none",
        color: copied ? "#1ec885" : TEXT_MUTED,
        fontSize: 11,
        fontWeight: 600,
        cursor: "pointer",
        padding: "2px 0",
        fontFamily: FONT,
        transition: "color 200ms ease",
        flexShrink: 0,
      }}
    >
      {copied ? "✓ Copied" : "Copy link"}
    </button>
  );
}

// ─── VideoCard ────────────────────────────────────────────────────────────────────
function VideoCard({ video, onOpen }) {
  const embedUrl = getEmbedUrl(video.youtubeUrl);
  const thumbUrl = getThumbnailUrl(video.youtubeUrl, video.thumbnail);
  const hasVideo = !!embedUrl;
  const title       = video.title       || "Video coming soon";
  const description = video.description || "This video will be added soon.";
  const [hover, setHover] = useState(false);

  return (
    <div
      style={{
        position: "relative",
        background: hover && hasVideo ? "rgba(255,255,255,0.07)" : CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 16,
        overflow: "hidden",
        transition: "all 150ms ease",
        boxShadow: hover && hasVideo ? GLOW : "none",
        cursor: hasVideo ? "pointer" : "default",
      }}
      onClick={hasVideo ? () => onOpen(video.id) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Thumbnail */}
      <div style={{ position: "relative", paddingTop: "56.25%", background: "#0a0c18" }}>
        {thumbUrl ? (
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

        {video.duration && (
          <div style={{ position: "absolute", bottom: 7, right: 9, background: "rgba(0,0,0,0.72)", color: "#fff", fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, fontFamily: FONT }}>
            {video.duration}
          </div>
        )}
      </div>

      {/* Text */}
      <div style={{ padding: "14px 16px 16px" }}>
        <p style={{ margin: "0 0 5px", fontSize: 14, fontWeight: 600, color: TEXT, fontFamily: FONT, lineHeight: 1.35 }}>
          {title}
        </p>
        <p style={{ margin: 0, fontSize: 13, color: TEXT_MUTED, fontFamily: FONT, lineHeight: 1.5 }}>
          {description}
        </p>
        {hasVideo && (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, color: PURPLE, fontFamily: FONT, fontWeight: 600 }}>▶ Watch</span>
            <CopyLinkButton video={video} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VideoModal — full-screen player ─────────────────────────────────────────────
function VideoModal({ video, onClose }) {
  const embedUrl = getEmbedUrl(video.youtubeUrl);
  const title    = video.title || "Smartemark Video";

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.88)", zIndex: 3000 }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 3001,
          width: "min(900px, calc(100vw - 24px))",
          maxHeight: "calc(100vh - 40px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10, padding: "0 2px" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16, color: "#fff", fontFamily: FONT, lineHeight: 1.3, minWidth: 0 }}>
            {title}
          </p>
          <button
            onClick={onClose}
            aria-label="Close video"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: 20,
              cursor: "pointer",
              borderRadius: 8,
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FONT,
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* 16:9 responsive player */}
        <div
          style={{
            position: "relative",
            paddingTop: "56.25%",
            background: "#000",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          }}
        >
          {embedUrl ? (
            <iframe
              src={`${embedUrl}&autoplay=1`}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: "none" }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: FONT, fontSize: 14 }}>Video unavailable</span>
            </div>
          )}
        </div>

        {video.description && (
          <p style={{ margin: "12px 2px 0", fontSize: 14, color: "rgba(255,255,255,0.60)", fontFamily: FONT, lineHeight: 1.65 }}>
            {video.description}
          </p>
        )}
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────────
export default function BookedCall() {
  const isMobile = useIsMobile();
  const [modalVideoId, setModalVideoId] = useState(null);

  // On mount: check ?video=slug and auto-open the matching video
  useEffect(() => {
    const params     = new URLSearchParams(window.location.search);
    const videoParam = params.get("video");
    if (!videoParam) return;
    const found = VIDEOS.find((v) => getVideoSlug(v) === videoParam);
    if (found && getEmbedUrl(found.youtubeUrl)) {
      setModalVideoId(found.id);
    }
  }, []);

  const openModal  = (id) => setModalVideoId(id);
  const closeModal = ()   => setModalVideoId(null);

  const modalVideo = modalVideoId ? VIDEOS.find((v) => v.id === modalVideoId) : null;

  return (
    <div style={{ minHeight: "100vh", background: PAGE_BG, fontFamily: FONT, color: TEXT }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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

      {/* ── Video catalog ────────────────────────────────────────────────────── */}
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
          {VIDEOS.map((v) => (
            <VideoCard key={v.id} video={v} onOpen={openModal} />
          ))}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────────── */}
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
        <p style={{ margin: 0, fontSize: 15, color: TEXT_SOFT, lineHeight: 1.6 }}>
          Looking forward to speaking with you on our scheduled call.
        </p>
      </div>

      {/* ── Video modal ──────────────────────────────────────────────────────── */}
      {modalVideo && <VideoModal video={modalVideo} onClose={closeModal} />}

    </div>
  );
}
