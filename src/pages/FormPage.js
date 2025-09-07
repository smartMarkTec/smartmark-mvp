// src/pages/FormPage.js
/* eslint-disable */
import React, { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { FaSyncAlt, FaTimes, FaArrowUp, FaArrowLeft } from "react-icons/fa";

/* ===== Visual theme to match Landing ===== */
const MODERN_FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const BG_DARK = "#0b0f14";       // deep navy (same family as landing)
const ACCENT = "#31e1ff";        // electric cyan
const ACCENT_2 = "#7c4dff";      // violet
const TEAL = "#14e7b9";

/* ===== Behavior constants ===== */
const SIDE_CHAT_LIMIT = 5;

// If you run a local backend with a CRA proxy, set USE_LOCAL_BACKEND=true
const USE_LOCAL_BACKEND = false;
const PROD_BACKEND = "https://smartmark-mvp.onrender.com";
const BACKEND_URL = USE_LOCAL_BACKEND ? "" : PROD_BACKEND;               // For assets returned like /generated/xxx
const API_BASE = USE_LOCAL_BACKEND ? "/api" : `${PROD_BACKEND}/api`;     // <-- absolute API for Vercel

// ---- Draft persistence (24h TTL) ----
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FORM_DRAFT_KEY = "sm_form_draft_v2";
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v2";

// ---- Image copy edit store (per image) ----
const IMAGE_DRAFTS_KEY = "smartmark.imageDrafts.v1";
const ALLOWED_CTAS = [
  "Shop now", "Buy now", "Learn more", "Visit us", "Check us out",
  "Take a look", "Get started"
];

/* ===== Small helpers for the image draft store ===== */
function loadImageDrafts() {
  try { return JSON.parse(localStorage.getItem(IMAGE_DRAFTS_KEY) || "{}"); } catch { return {}; }
}
function saveImageDrafts(map) {
  try { localStorage.setItem(IMAGE_DRAFTS_KEY, JSON.stringify(map)); } catch {}
}
function getImageDraftById(id) {
  const all = loadImageDrafts();
  return all[id] || null;
}
function saveImageDraftById(id, patch) {
  const all = loadImageDrafts();
  const next = { ...(all[id] || {}), ...patch, _updatedAt: Date.now() };
  all[id] = next;
  saveImageDrafts(all);
  return next;
}
function normalizeOverlayCTA(s = "") {
  const raw = String(s).trim();
  if (!raw) return "Learn more";
  const plain = raw.replace(/[!?.]+$/g, "").toLowerCase();
  const match = ALLOWED_CTAS.find(c => c.toLowerCase() === plain);
  const chosen = match || plain;
  return chosen.replace(/\b\w/g, c => c.toUpperCase());
}
function creativeIdFromUrl(url = "") {
  return `img:${url}`;
}

/* ===== Decorative micro-component ===== */
function Dotty() {
  return (
    <span style={{ display: "inline-block", minWidth: 60, letterSpacing: 4 }}>
      <span className="dotty-dot" style={dotStyle(0)}>.</span>
      <span className="dotty-dot" style={dotStyle(1)}>.</span>
      <span className="dotty-dot" style={dotStyle(2)}>.</span>
      <style>
        {`
        @keyframes bounceDot {
          0% { transform: translateY(0);}
          30% { transform: translateY(-7px);}
          60% { transform: translateY(0);}
        }
        .dotty-dot {
          display: inline-block;
          animation: bounceDot 1.2s infinite;
        }
        .dotty-dot:nth-child(2) { animation-delay: 0.15s;}
        .dotty-dot:nth-child(3) { animation-delay: 0.3s;}
        `}
      </style>
    </span>
  );
}
function dotStyle(n) {
  return { display: "inline-block", margin: "0 3px", fontSize: 36, color: "#29efb9", animationDelay: `${n * 0.13}s` };
}

/* ===== Modal for full image view ===== */
function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      background: "rgba(8,10,12,0.92)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 9999
    }}>
      <div style={{ position: "relative", background: "#0f1419", borderRadius: 18, boxShadow: "0 0 40px #0008" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 2,
            background: "#1a2026", color: "#fff", border: "none",
            borderRadius: 20, padding: 8, cursor: "pointer"
          }}
        >
          <FaTimes size={20} />
        </button>
        <img
          src={imageUrl ? (imageUrl.startsWith("http") ? imageUrl : BACKEND_URL + imageUrl) : ""}
          alt="Full Ad"
          style={{
            display: "block",
            maxWidth: "90vw",
            maxHeight: "82vh",
            borderRadius: 16,
            background: "#111",
            margin: "40px 28px 28px 28px",
            boxShadow: "0 8px 38px #000b",
            fontFamily: AD_FONT
          }}
        />
      </div>
    </div>
  );
}

/* ===== Small UI helpers (unchanged behavior) ===== */
function MediaTypeToggle({ mediaType, setMediaType }) {
  const choices = [
    { key: "image", label: "Image" },
    { key: "both", label: "Both" },
    { key: "video", label: "Video" }
  ];
  return (
    <div style={{ display: "flex", gap: 16, justifyContent: "center", alignItems: "center", margin: "18px 0 14px 0" }}>
      {choices.map((choice) => (
        <button
          key={choice.key}
          onClick={() => setMediaType(choice.key)}
          style={{
            fontWeight: 800,
            fontSize: "1.18rem",
            padding: "10px 28px",
            borderRadius: 12,
            border: "none",
            background: mediaType === choice.key ? "#1ad6b7" : "#23292c",
            color: mediaType === choice.key ? "#0b0f14" : "#bcfff6",
            cursor: "pointer",
            boxShadow: mediaType === choice.key ? "0 2px 18px #1ad6b773" : "none",
            transform: mediaType === choice.key ? "scale(1.09)" : "scale(1)",
            transition: "all 0.15s",
            outline: mediaType === choice.key ? "3px solid #14e7b9" : "none"
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
function Arrow({ side = "left", onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: "absolute",
        top: "50%",
        [side]: 10,
        transform: "translateY(-50%)",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        border: "none",
        width: 34,
        height: 34,
        borderRadius: "50%",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.45 : 0.85,
        zIndex: 3
      }}
      aria-label={side === "left" ? "Previous" : "Next"}
      title={side === "left" ? "Previous" : "Next"}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
        {side === "left" ? (
          <path d="M12.5 15L7.5 10L12.5 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M7.5 5L12.5 10L7.5 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}
function Dots({ count, active, onClick }) {
  return (
    <div style={{
      position: "absolute",
      bottom: 8,
      left: 0,
      right: 0,
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
      zIndex: 3
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          onClick={() => onClick(i)}
          style={{
            width: 8, height: 8, borderRadius: "50%",
            border: "none",
            background: i === active ? TEAL : "rgba(255,255,255,0.55)",
            cursor: "pointer", opacity: i === active ? 1 : 0.7
          }}
          aria-label={`Go to slide ${i + 1}`}
          title={`Slide ${i + 1}`}
        />
      ))}
    </div>
  );
}

/* ===== Misc helpers ===== */
function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}
function isGenerateTrigger(input) {
  return /^(yes|y|i'?m ready|lets? do it|generate|go ahead|start|sure|ok)$/i.test(input.trim());
}
async function safeJson(res) {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  try { return await res.json(); } catch { throw new Error("Bad JSON"); }
}

// URL helpers to avoid false "question" positives
const URL_REGEX = /(https?:\/\/|www\.)[^\s]+/gi;
function stripUrls(s = "") {
  return (s || "").replace(URL_REGEX, "");
}
function extractFirstUrl(s = "") {
  const m = (s || "").match(URL_REGEX);
  return m ? m[0] : null;
}
function isLikelyQuestion(s) {
  const t = (s || "").trim().toLowerCase();
  if (extractFirstUrl(t) && t === extractFirstUrl(t)?.toLowerCase()) return false;
  const textWithoutUrls = stripUrls(t);
  const hasQMark = textWithoutUrls.includes("?");
  const startsWithQword = /^(who|what|why|how|when|where|which|can|do|does|is|are|should|help)\b/.test(t);
  return hasQMark || startsWithQword;
}
function isLikelySideStatement(s) {
  const t = (s || "").trim().toLowerCase();
  const sentimental = /(wow|amazing|awesome|incredible|insane|crazy|cool|great|impressive|unbelievable|never seen|i have never|this is (amazing|awesome|great|insane|incredible)|love (this|it)|thank(s)?|omg)\b/;
  const hasBang = t.includes("!");
  return sentimental.test(t) || hasBang;
}
function isLikelySideChat(s, currentQ) {
  if (isLikelyQuestion(s) || isLikelySideStatement(s)) return true;
  const t = (s || "").trim();
  if (!currentQ) return false;
  if (currentQ.key === "url") {
    const hasUrl = !!extractFirstUrl(t);
    return !hasUrl && t.split(/\s+/).length > 3;
  }
  if (currentQ.key === "hasOffer") {
    return !/^(yes|no|y|n)$/i.test(t);
  }
  if (currentQ.key === "industry" || currentQ.key === "businessName") {
    return t.length > 80;
  }
  return false;
}

/* ============================ Main Component ============================ */
export default function FormPage() {
  const navigate = useNavigate();
  const chatBoxRef = useRef();

  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [chatHistory, setChatHistory] = useState([
    { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign. Ask me anything at any time.` },
    { from: "gpt", text: "Are you ready to get started? (yes/no)" }
  ]);

  // ---- Chat state
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [sideChatCount, setSideChatCount] = useState(0);
  const [hasGenerated, setHasGenerated] = useState(false);

  // Ad preview state
  const [mediaType, setMediaType] = useState("both");
  const [result, setResult] = useState(null);
  const [imageUrls, setImageUrls] = useState([]);
  const [activeImage, setActiveImage] = useState(0);
  const [videoItems, setVideoItems] = useState([]);
  const [activeVideo, setActiveVideo] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [videoScript, setVideoScript] = useState("");

  const [imageLoading, setImageLoading] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalImg, setModalImg] = useState("");
  const [awaitingReady, setAwaitingReady] = useState(true);

  // ---- Image copy editing state ----
  const [imageEditing, setImageEditing] = useState(false);
  const currentImageId = useMemo(
    () => creativeIdFromUrl(imageUrls[activeImage] || ""),
    [imageUrls, activeImage]
  );
const [editHeadline, setEditHeadline] = useState("");
const [editBody, setEditBody] = useState("");
const [editCTA, setEditCTA] = useState("");

  // helper for absolute URLs
  const abs = (u) => (/^https?:\/\//.test(u) ? u : (BACKEND_URL + u));

  // Scroll chat to bottom
  useEffect(() => {
    if (chatBoxRef.current) chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
  }, [chatHistory]);

  // ---- Restore full form draft on mount (24h TTL) ----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FORM_DRAFT_KEY);
      if (!raw) return;
      const { savedAt, data } = JSON.parse(raw);
      if (savedAt && Date.now() - savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(FORM_DRAFT_KEY);
        localStorage.removeItem(CREATIVE_DRAFT_KEY);
        return;
      }
      if (data) {
        setAnswers(data.answers || {});
        setStep(data.step ?? 0);
        setChatHistory(
          Array.isArray(data.chatHistory) && data.chatHistory.length
            ? data.chatHistory
            : chatHistory
        );
        setMediaType(data.mediaType || "both");
        setResult(data.result || null);
        setImageUrls(data.imageUrls || []);
        setVideoItems(data.videoItems || []);
        setActiveImage(data.activeImage || 0);
        setActiveVideo(data.activeVideo || 0);
        setAwaitingReady(data.awaitingReady ?? true);
        setInput(data.input || "");
        setSideChatCount(data.sideChatCount || 0);
        setHasGenerated(!!data.hasGenerated);
      }
    } catch {}
    // eslint-disable-next-line
  }, []);

  // Hydrate edit fields whenever active image or result changes
  useEffect(() => {
    const draft = currentImageId ? getImageDraftById(currentImageId) : null;
    setEditHeadline((draft?.headline ?? result?.headline ?? "").slice(0, 55));
    setEditBody(draft?.body ?? result?.body ?? "");
    setEditCTA(normalizeOverlayCTA(draft?.overlay ?? result?.image_overlay_text ?? "Learn more"));
  }, [currentImageId, result]);

  // Debounced autosave while typing
  useEffect(() => {
    if (!currentImageId) return;
    const t = setTimeout(() => {
      saveImageDraftById(currentImageId, {
        headline: (editHeadline || "").trim(),
        body: (editBody || "").trim(),
        overlay: normalizeOverlayCTA(editCTA || "Learn more")
      });
    }, 400);
    return () => clearTimeout(t);
  }, [currentImageId, editHeadline, editBody, editCTA]);

  const displayHeadline = (editHeadline || result?.headline || "Don't Miss Our Limited-Time Offer").slice(0, 55);
  const displayBody = (editBody || result?.body || "Ad copy goes here...");
  const displayCTA = normalizeOverlayCTA(editCTA || result?.image_overlay_text || "Learn more");

  // ---- Hard reset chat + draft ----
  function hardResetChat() {
    if (!window.confirm("Reset the chat and clear saved progress for this form?")) return;
    try {
      localStorage.removeItem(FORM_DRAFT_KEY);
      localStorage.removeItem(CREATIVE_DRAFT_KEY);
      sessionStorage.removeItem("draft_form_creatives");
      localStorage.removeItem(IMAGE_DRAFTS_KEY);
    } catch {}
    setAnswers({});
    setStep(0);
    setChatHistory([
      { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through a few quick questions to create your ad campaign. Ask me anything at any time.` },
      { from: "gpt", text: "Are you ready to get started? (yes/no)" }
    ]);
    setInput("");
    setResult(null);
    setImageUrls([]);
    setVideoItems([]);
    setActiveImage(0);
    setActiveVideo(0);
    setImageUrl("");
    setVideoUrl("");
    setVideoScript("");
    setAwaitingReady(true);
    setError("");
    setGenerating(false);
    setLoading(false);
    setSideChatCount(0);
    setHasGenerated(false);
    setImageEditing(false);
    setEditHeadline("");
    setEditBody("");
    setEditCTA("");
  }

  // ---- Autosave (throttled) the entire FormPage session + creatives ----
  useEffect(() => {
    const t = setTimeout(() => {
      const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
      const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
      const mergedBody = activeDraft?.body || result?.body || "";

      const payload = {
        answers, step, chatHistory, mediaType, result: {
          ...(result || {}),
          headline: mergedHeadline,
          body: mergedBody
        },
        imageUrls, videoItems, activeImage, activeVideo,
        awaitingReady, input, sideChatCount, hasGenerated
      };
      localStorage.setItem(
        FORM_DRAFT_KEY,
        JSON.stringify({ savedAt: Date.now(), data: payload })
      );

      let imgs = imageUrls.slice(0, 2).map(abs);
      let vids = videoItems.map(v => v?.url).filter(Boolean).slice(0, 2).map(abs);
      let fbIds = videoItems.map(v => v?.fbVideoId).filter(Boolean).slice(0, 2);

      if (mediaType === "image") { vids = []; fbIds = []; }
      if (mediaType === "video") { imgs = []; }

      const draftForSetup = {
        images: imgs,
        videos: vids,
        fbVideoIds: fbIds,
        headline: mergedHeadline,
        body: mergedBody,
        imageOverlayCTA: normalizeOverlayCTA(activeDraft?.overlay || result?.image_overlay_text || "Learn more"),
        videoScript: (videoItems[activeVideo]?.script || ""),
        answers,
        mediaSelection: mediaType,
        savedAt: Date.now()
      };

      localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
      sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
    }, 150);

    return () => clearTimeout(t);
  }, [
    answers, step, chatHistory, mediaType, result,
    imageUrls, videoItems, activeImage, activeVideo,
    awaitingReady, input, sideChatCount, hasGenerated,
    currentImageId, editHeadline, editBody, editCTA
  ]);

  function handleImageClick(url) { setShowModal(true); setModalImg(url); }
  function handleModalClose() { setShowModal(false); setModalImg(""); }

  // ---- Ask OpenAI (used for side chat & FAQs) ----
  async function askGPT(userText) {
    try {
      const history = chatHistory.slice(-8).map(m => ({
        role: m.from === "gpt" ? "assistant" : "user",
        content: m.text
      }));
      history.push({ role: "user", content: userText });

      const resp = await fetch(`${API_BASE}/gpt-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userText, history })
      });
      const data = await safeJson(resp);
      return data?.reply || null;
    } catch (e) {
      console.warn("gpt-chat failed:", e.message);
      return null;
    }
  }

  // central side-chat handler with cap + optional follow-up prompt
  async function handleSideChat(userText, followUpPrompt) {
    if (sideChatCount >= SIDE_CHAT_LIMIT) {
      if (followUpPrompt) {
        setChatHistory(ch => [...ch, { from: "gpt", text: followUpPrompt }]);
      }
      return;
    }
    setSideChatCount(c => c + 1);
    const reply = await askGPT(userText);
    if (reply) setChatHistory(ch => [...ch, { from: "gpt", text: reply }]);
    if (followUpPrompt) {
      setChatHistory(ch => [...ch, { from: "gpt", text: followUpPrompt }]);
    }
  }

  // ---- API calls (defensive) ----
  async function fetchImageOnce(token) {
    try {
      const resp = await fetch(`${API_BASE}/generate-image-from-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...answers, regenerateToken: token })
      });
      const data = await safeJson(resp);
      return data?.imageUrl || "";
    } catch (e) {
      console.warn("image fetch failed:", e.message);
      return "";
    }
  }
  async function fetchVideoOnce(token) {
    try {
      const resp = await fetch(`${API_BASE}/generate-video-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: answers?.url || "", answers, regenerateToken: token })
      });
      const data = await safeJson(resp);
      const vUrl = data?.videoUrl
        ? (data.videoUrl.startsWith("http") ? data.videoUrl : BACKEND_URL + data.videoUrl)
        : "";
      return {
        url: vUrl,
        script: data?.script || data?.video?.script || "",
        fbVideoId: data?.fbVideoId || data?.video?.fbVideoId || null
      };
    } catch (e) {
      console.warn("video fetch failed:", e.message);
      return { url: "", script: "", fbVideoId: null };
    }
  }

  // ---- Chat flow handler ----
  async function handleUserInput(e) {
    e.preventDefault();
    if (loading) return;
    const value = (input || "").trim();
    if (!value) return;

    setChatHistory(ch => [...ch, { from: "user", text: value }]);
    setInput("");

    if (awaitingReady) {
      if (/^(yes|yep|ready|start|go|let'?s (go|start)|ok|okay|yea|yeah|alright|i'?m ready|im ready|lets do it|sure)$/i.test(value)) {
        setAwaitingReady(false);
        setChatHistory(ch => [...ch, { from: "gpt", text: CONVO_QUESTIONS[0].question }]);
        setStep(0);
        return;
      } else if (/^(no|not yet|wait|hold on|nah|later)$/i.test(value)) {
        setChatHistory(ch => [...ch, { from: "gpt", text: "No problem! Just say 'ready' when you want to start." }]);
        return;
      } else {
        setChatHistory(ch => [...ch, { from: "gpt", text: "Please reply 'yes' when you're ready to start!" }]);
        return;
      }
    }

    const currentQ = CONVO_QUESTIONS[step];

    if (step >= CONVO_QUESTIONS.length) {
      if (!hasGenerated && isGenerateTrigger(value)) {
        setLoading(true);
        setGenerating(true);
        setChatHistory(ch => [...ch, { from: "gpt", text: "AI generating..." }]);

        setTimeout(async () => {
          const tokenA = getRandomString();
          const tokenB = getRandomString();

          try {
            const [data, img1, img2, vid1, vid2] = await Promise.all([
              fetch(`${API_BASE}/generate-campaign-assets`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers })
              }).then(safeJson).catch(() => ({})),
              fetchImageOnce(tokenA),
              fetchImageOnce(tokenB),
              fetchVideoOnce(tokenA),
              fetchVideoOnce(tokenB)
            ]);

            setResult({
              headline: data?.headline || "",
              body: data?.body || "",
              image_overlay_text: data?.image_overlay_text || ""
            });

            const imgs = [img1, img2].filter(Boolean).slice(0, 2);
            setImageUrls(imgs);
            setActiveImage(0);
            setImageUrl(imgs[0] || "");

            const vids = [vid1, vid2].filter(v => v && v.url).slice(0, 2);
            setVideoItems(vids);
            setActiveVideo(0);
            setVideoUrl(vids[0]?.url || "");
            setVideoScript(vids[0]?.script || "");

            setChatHistory(ch => [...ch, { from: "gpt", text: "Done! Here are your ad previews. You can regenerate the image or video below." }]);
            setHasGenerated(true);
          } catch (err) {
            console.error("generation failed:", err);
            setError("Generation failed. Please try again.");
          } finally {
            setGenerating(false);
            setLoading(false);
          }
        }, 400);
        return;
      }

      if (hasGenerated) {
        await handleSideChat(value, null);
      } else {
        await handleSideChat(value, "Ready to generate your campaign? (yes/no)");
      }
      return;
    }

    if (currentQ && isLikelySideChat(value, currentQ)) {
      await handleSideChat(value, `Ready for the next question?\n${currentQ.question}`);
      return;
    }

    if (currentQ) {
      let answerToSave = value;
      if (currentQ.key === "url") {
        const firstUrl = extractFirstUrl(value);
        if (firstUrl) answerToSave = firstUrl;
      }

      const newAnswers = { ...answers, [currentQ.key]: answerToSave };
      setAnswers(newAnswers);

      let nextStep = step + 1;
      while (
        CONVO_QUESTIONS[nextStep] &&
        CONVO_QUESTIONS[nextStep].conditional &&
        newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !== CONVO_QUESTIONS[nextStep].conditional.value
      ) {
        nextStep += 1;
      }

      if (!CONVO_QUESTIONS[nextStep]) {
        setChatHistory(ch => [...ch, { from: "gpt", text: "Are you ready for me to generate your campaign? (yes/no)" }]);
        setStep(nextStep);
        return;
      }

      setStep(nextStep);
      setChatHistory(ch => [...ch, { from: "gpt", text: CONVO_QUESTIONS[nextStep].question }]);
    }
  }

  // Regenerate actions
  async function handleRegenerateImage() {
    setImageLoading(true);
    const [a, b] = await Promise.all([fetchImageOnce(getRandomString()), fetchImageOnce(getRandomString())]);
    const imgs = [a, b].filter(Boolean).slice(0, 2);
    setImageUrls(imgs);
    setActiveImage(0);
    setImageUrl(imgs[0] || "");
    setImageLoading(false);
  }
  async function handleRegenerateVideo() {
    setVideoLoading(true);
    const [a, b] = await Promise.all([fetchVideoOnce(getRandomString()), fetchVideoOnce(getRandomString())]);
    const vids = [a, b].filter(v => v && v.url).slice(0, 2);
    setVideoItems(vids);
    setActiveVideo(0);
    setVideoUrl(vids[0]?.url || "");
    setVideoScript(vids[0]?.script || "");
    setVideoLoading(false);
  }

  /* ============================ Render ============================ */
  return (
    <div
      style={{
        background: BG_DARK,
        minHeight: "100vh",
        fontFamily: MODERN_FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        overflowX: "hidden",
        color: "#fff"
      }}
    >
      {/* page-wide tweaks; ensures full-height bg and animated orbs */}
      <style>{`
        html, body, #root { height: 100%; background: ${BG_DARK}; margin: 0; }
        @keyframes floatA { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-12px) } }
        @keyframes floatB { 0%,100% { transform: translateY(0) } 50% { transform: translateY(10px) } }
      `}</style>

      {/* tech gradient glows */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: "-15vh",
          right: "-10vw",
          width: 720,
          height: 720,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT}33, transparent 70%)`,
          filter: "blur(18px)",
          animation: "floatA 18s ease-in-out infinite",
          pointerEvents: "none"
        }}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          bottom: "-22vh",
          left: "-14vw",
          width: 800,
          height: 800,
          background: `radial-gradient(40% 40% at 50% 50%, ${ACCENT_2}2e, transparent 70%)`,
          filter: "blur(18px)",
          animation: "floatB 22s ease-in-out infinite",
          pointerEvents: "none"
        }}
      />

      {/* Top Bar with Back */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "28px 36px 0 36px",
          boxSizing: "border-box",
          maxWidth: 1200,
        }}
      >
        <button
          onClick={() => navigate("/")}
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
            color: "#eaf5ff",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "1.3rem",
            padding: "0.72rem 1.8rem",
            fontWeight: 700,
            fontSize: "1.05rem",
            letterSpacing: "0.7px",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
          aria-label="Back"
        >
          <FaArrowLeft />
          Back
        </button>
      </div>

      {/* Page Title */}
      <div style={{ width: "100%", maxWidth: 1200, padding: "10px 36px 0", boxSizing: "border-box" }}>
        <h1
          style={{
            margin: "18px 0 2px",
            fontSize: "2.2rem",
            fontWeight: 900,
            background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Create Your Ad
        </h1>
        <div style={{ color: "#bfeeff", opacity: 0.9, fontWeight: 600 }}>
          Answer a few prompts, then preview your image or video ads instantly.
        </div>
      </div>

      {/* ---- Chat Panel (kept same structure & behavior) ---- */}
      <div style={{
        width: "100%",
        maxWidth: 560,
        minHeight: 370,
        marginTop: 26,
        marginBottom: 24,
        background: "#202327",
        borderRadius: 18,
        boxShadow: "0 2px 32px #181b2040",
        padding: "38px 30px 22px 30px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center"
      }}>
        <div style={{ color: "#7fffe2", fontSize: 17, fontWeight: 800, marginBottom: 8, letterSpacing: 1.2 }}>
          AI Ad Manager
        </div>

        {/* Scrollable chat history */}
        <div ref={chatBoxRef} style={{
          width: "100%", height: 160, maxHeight: 180, overflowY: "auto",
          marginBottom: 16, paddingRight: 4, background: "#191b22", borderRadius: 12
        }}>
          {chatHistory.slice(-24).map((msg, i) => (
            <div key={i}
              style={{
                textAlign: msg.from === "gpt" ? "left" : "right",
                margin: "8px 0",
                color: msg.from === "gpt" ? "#22e3bd" : "#fff",
                fontWeight: 600,
                fontSize: 16,
                background: msg.from === "gpt" ? "#161a1f" : "#14e7b9",
                borderRadius: msg.from === "gpt" ? "14px 18px 18px 7px" : "16px 12px 7px 17px",
                padding: "10px 18px",
                maxWidth: "98%",
                boxSizing: "border-box",
                display: "inline-block",
                overflowWrap: "anywhere",
                wordBreak: "break-word",
                whiteSpace: "pre-wrap"
              }}>
              {msg.text}
            </div>
          ))}
        </div>

        {/* Prompt bar with Reset + Send (unchanged) */}
        {!loading && (
          <form onSubmit={handleUserInput} style={{ width: "100%", display: "flex", gap: 10, alignItems: "center" }}>
            <button
              type="button"
              onClick={hardResetChat}
              title="Reset chat"
              aria-label="Reset chat"
              style={{
                background: "#23262a",
                color: "#9cefdc",
                border: "none",
                borderRadius: 12,
                padding: "0 14px",
                height: 48,
                cursor: "pointer",
                boxShadow: "0 1.5px 8px #1acbb932",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <FaSyncAlt />
            </button>

            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              autoFocus
              placeholder="Your answer…"
              aria-label="Your answer"
              autoComplete="off"
              style={{
                flex: 1,
                padding: "14px 18px",
                borderRadius: 12,
                border: "none",
                outline: "none",
                fontSize: "1.07rem",
                fontWeight: 600,
                background: "#23262a",
                color: "#fff",
                boxShadow: "0 1.5px 8px #1acbb932"
              }}
            />
            <button
              type="submit"
              style={{
                background: TEAL,
                color: "#0b0f14",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.35rem",
                padding: "0 22px",
                cursor: "pointer",
                height: 48
              }}
              disabled={loading}
              tabIndex={0}
              aria-label="Send"
            >
              <FaArrowUp />
            </button>
          </form>
        )}

        {loading && <div style={{ color: "#15efb8", marginTop: 10, fontWeight: 600 }}>AI generating...</div>}
        {error && <div style={{ color: "#f35e68", marginTop: 18 }}>{error}</div>}
      </div>

      {/* Selector above previews (unchanged behavior) */}
      <MediaTypeToggle mediaType={mediaType} setMediaType={setMediaType} />

      {/* Section header */}
      <div style={{ width: "100%", maxWidth: 1200, padding: "0 24px 8px", boxSizing: "border-box" }}>
        <div style={{
          fontWeight: 900,
          letterSpacing: 0.2,
          fontSize: "1.3rem",
          color: "#eaf5ff",
          opacity: 0.9
        }}>
          Ad Previews
        </div>
      </div>

      {/* Ad Previews — keep card structure, improve outer layout only */}
      <div style={{
        width: "100%",
        maxWidth: 1200,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 34,
        padding: "8px 24px 24px",
        boxSizing: "border-box",
      }}>
        {/* ================= IMAGE CARD (unchanged internals) ================= */}
        <div style={{
          background: "#fff",
          borderRadius: 13,
          boxShadow: "0 2px 24px #16242714",
          minWidth: 340,
          maxWidth: 420,
          justifySelf: "center",
          flex: mediaType === "video" ? 0 : 1,
          marginBottom: 0,
          padding: "0px 0px 14px 0px",
          border: "1.5px solid #eaeaea",
          fontFamily: AD_FONT,
          display: mediaType === "video" ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            background: "#f5f6fa",
            padding: "11px 20px",
            borderBottom: "1px solid #e0e4eb",
            fontWeight: 700,
            color: "#495a68",
            fontSize: 16,
            letterSpacing: 0.08,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>Sponsored · <span style={{ color: "#12cbb8" }}>SmartMark</span></span>
            <button
              style={{
                background: "#1ad6b7",
                color: "#222",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.01rem",
                padding: "6px 20px",
                cursor: imageLoading ? "not-allowed" : "pointer",
                marginLeft: 8,
                boxShadow: "0 2px 7px #19e5b733",
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
              onClick={handleRegenerateImage}
              disabled={imageLoading}
              title="Regenerate Image Ad"
            >
              <FaSyncAlt style={{ fontSize: 16 }} />
              {imageLoading || generating ? <Dotty /> : "Regenerate"}
            </button>
          </div>

          {/* Carousel body */}
          <div style={{ background: "#222", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220 }}>
            {imageLoading || generating ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : imageUrls.length > 0 ? (
              <>
                <img
                  src={(imageUrls[activeImage] || "").startsWith("http") ? imageUrls[activeImage] : BACKEND_URL + imageUrls[activeImage]}
                  alt="Ad Preview"
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 0,
                    cursor: "pointer"
                  }}
                  onClick={() => handleImageClick(imageUrls[activeImage])}
                />
                <Arrow side="left" onClick={() => setActiveImage((activeImage + imageUrls.length - 1) % imageUrls.length)} disabled={imageUrls.length <= 1} />
                <Arrow side="right" onClick={() => setActiveImage((activeImage + 1) % imageUrls.length)} disabled={imageUrls.length <= 1} />
                <Dots count={imageUrls.length} active={activeImage} onClick={setActiveImage} />
              </>
            ) : (
              <div style={{
                height: 220,
                width: "100%",
                background: "#e9ecef",
                color: "#a9abb0",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22
              }}>Image goes here</div>
            )}
          </div>

          {/* Copy block */}
          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {displayHeadline}
            </div>
            <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 3, minHeight: 18 }}>
              {displayBody}
            </div>
          </div>
          <div style={{ padding: "8px 18px", marginTop: 2 }}>
            <button style={{
              background: "#14e7b9",
              color: "#181b20",
              fontWeight: 700,
              border: "none",
              borderRadius: 9,
              padding: "8px 20px",
              fontSize: 15,
              cursor: "pointer"
            }}>{displayCTA}</button>
          </div>

          {/* Image Edit toggle + fields (unchanged) */}
          <button
            style={{
              position: "absolute",
              bottom: 10,
              right: 18,
              background: "#f3f6f7",
              color: "#12cbb8",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "1.05rem",
              padding: "5px 14px",
              cursor: "pointer",
              boxShadow: "0 1px 3px #2bcbb828",
              display: "flex",
              alignItems: "center",
              gap: 5,
              zIndex: 2
            }}
            onClick={() => setImageEditing(v => !v)}
          >
            {imageEditing ? "Done" : "Edit"}
          </button>

          {imageEditing && (
            <div style={{ padding: "10px 18px 4px 18px", display: "grid", gap: 10 }}>
              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>Headline (max 55 chars)</div>
                <input
                  value={editHeadline}
                  onChange={(e) => setEditHeadline(e.target.value.slice(0, 55))}
                  onBlur={() => saveImageDraftById(currentImageId, { headline: (editHeadline || "").trim() })}
                  placeholder="Headline"
                  maxLength={55}
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 700
                  }}
                />
                <div style={{ fontSize: 11, color: "#9aa6b2", marginTop: 4 }}>{editHeadline.length}/55</div>
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>Body (18–30 words)</div>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  onBlur={() => saveImageDraftById(currentImageId, { body: (editBody || "").trim() })}
                  rows={3}
                  placeholder="Body copy"
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 600
                  }}
                />
              </label>

              <label style={{ display: "block" }}>
                <div style={{ fontSize: 12, color: "#6b7785", marginBottom: 4 }}>CTA (e.g., Shop now, Learn more)</div>
                <input
                  value={editCTA}
                  onChange={(e) => setEditCTA(e.target.value)}
                  onBlur={() => setEditCTA(normalizeOverlayCTA(editCTA))}
                  placeholder="CTA"
                  style={{
                    width: "100%", borderRadius: 10, border: "1px solid #e4e7ec",
                    padding: "10px 12px", fontWeight: 700
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* ================= VIDEO CARD (unchanged internals) ================= */}
        <div style={{
          background: "#fff",
          borderRadius: 13,
          boxShadow: "0 2px 24px #16242714",
          minWidth: 340,
          maxWidth: 420,
          justifySelf: "center",
          flex: mediaType === "image" ? 0 : 1,
          marginBottom: 0,
          padding: "0px 0px 14px 0px",
          border: "1.5px solid #eaeaea",
          fontFamily: AD_FONT,
          display: mediaType === "image" ? "none" : "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative"
        }}>
          <div style={{
            background: "#f5f6fa",
            padding: "11px 20px",
            borderBottom: "1px solid #e0e4eb",
            fontWeight: 700,
            color: "#495a68",
            fontSize: 16,
            letterSpacing: 0.08,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center"
          }}>
            <span>Sponsored · <span style={{ color: "#12cbb8" }}>SmartMark</span></span>
            <button
              style={{
                background: "#1ad6b7",
                color: "#222",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.01rem",
                padding: "6px 20px",
                cursor: videoLoading ? "not-allowed" : "pointer",
                marginLeft: 8,
                boxShadow: "0 2px 7px #19e5b733",
                display: "flex",
                alignItems: "center",
                gap: 7
              }}
              onClick={handleRegenerateVideo}
              disabled={videoLoading}
              title="Regenerate Video Ad"
            >
              <FaSyncAlt style={{ fontSize: 16 }} />
              {videoLoading || generating ? <Dotty /> : "Regenerate"}
            </button>
          </div>

          {/* Carousel body */}
          <div style={{ background: "#222", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220 }}>
            {videoLoading || generating ? (
              <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Dotty />
              </div>
            ) : videoItems.length > 0 ? (
              <>
                <video
                  key={videoItems[activeVideo]?.url || "video"}
                  src={videoItems[activeVideo]?.url}
                  controls
                  style={{ width: "100%", maxHeight: 220, borderRadius: 0, background: "#111" }}
                />
                <Arrow side="left" onClick={() => {
                  const next = (activeVideo + videoItems.length - 1) % videoItems.length;
                  setActiveVideo(next);
                  setVideoUrl(videoItems[next]?.url || "");
                  setVideoScript(videoItems[next]?.script || "");
                }} disabled={videoItems.length <= 1} />
                <Arrow side="right" onClick={() => {
                  const next = (activeVideo + 1) % videoItems.length;
                  setActiveVideo(next);
                  setVideoUrl(videoItems[next]?.url || "");
                  setVideoScript(videoItems[next]?.script || "");
                }} disabled={videoItems.length <= 1} />
                <Dots count={videoItems.length} active={activeVideo} onClick={(i) => {
                  setActiveVideo(i);
                  setVideoUrl(videoItems[i]?.url || "");
                  setVideoScript(videoItems[i]?.script || "");
                }} />
              </>
            ) : (
              <div style={{
                height: 220,
                width: "100%",
                background: "#e9ecef",
                color: "#a9abb0",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22
              }}>Video goes here</div>
            )}
          </div>

          <div style={{ padding: "17px 18px 4px 18px" }}>
            <div style={{ color: "#191c1e", fontWeight: 800, fontSize: 17, marginBottom: 5, fontFamily: AD_FONT }}>
              {result?.headline || "Welcome New Customers Instantly!"}
            </div>
            {videoItems.length > 0 && (videoItems[activeVideo]?.script || videoScript) && (
              <div style={{ color: "#3a4149", fontSize: 15, fontWeight: 600, marginBottom: 3, minHeight: 18 }}>
                <b>Script:</b> {videoItems[activeVideo]?.script || videoScript}
              </div>
            )}
          </div>
          <div style={{ padding: "8px 18px", marginTop: 2 }}>
            <button style={{
              background: "#14e7b9",
              color: "#181b20",
              fontWeight: 700,
              border: "none",
              borderRadius: 9,
              padding: "8px 20px",
              fontSize: 15,
              cursor: "pointer"
            }}>Learn More</button>
          </div>
        </div>
      </div>

      {/* Continue Button */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 10, marginBottom: 28 }}>
        <button
          style={{
            background: TEAL,
            color: "#0b0f14",
            border: "none",
            borderRadius: 13,
            fontWeight: 700,
            fontSize: "1.19rem",
            padding: "18px 72px",
            fontFamily: MODERN_FONT,
            boxShadow: "0 16px 56px rgba(15,111,255,0.25)",
            cursor: "pointer",
            transition: "transform .15s ease, background .2s ease"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
          onClick={() => {
            const activeDraft = currentImageId ? getImageDraftById(currentImageId) : null;
            const mergedHeadline = (activeDraft?.headline || result?.headline || "").slice(0, 55);
            const mergedBody = activeDraft?.body || result?.body || "";
            const mergedCTA = normalizeOverlayCTA(activeDraft?.overlay || result?.image_overlay_text || "Learn more");

            let imgA = imageUrls.map(abs).slice(0, 2);
            let vidA = videoItems.map(v => abs(v.url)).slice(0, 2);
            let fbIds = videoItems.map(v => v.fbVideoId).filter(Boolean).slice(0, 2);

            if (mediaType === "image") { vidA = []; fbIds = []; }
            if (mediaType === "video") { imgA = []; }

            const draftForSetup = {
              images: imgA,
              videos: vidA,
              fbVideoIds: fbIds,
              headline: mergedHeadline,
              body: mergedBody,
              imageOverlayCTA: mergedCTA,
              videoScript: videoItems[0]?.script || videoScript || "",
              answers,
              mediaSelection: mediaType,
              savedAt: Date.now()
            };

            sessionStorage.setItem("draft_form_creatives", JSON.stringify(draftForSetup));
            localStorage.setItem(CREATIVE_DRAFT_KEY, JSON.stringify(draftForSetup));
            localStorage.setItem("smartmark_media_selection", mediaType);

            if (imgA[0]) localStorage.setItem("smartmark_last_image_url", imgA[0]);
            if (vidA[0]) localStorage.setItem("smartmark_last_video_url", vidA[0]);
            if (fbIds[0]) localStorage.setItem("smartmark_last_fb_video_id", String(fbIds[0]));

            navigate("/setup", {
              state: {
                imageUrls: imgA,
                videoUrls: vidA,
                fbVideoIds: fbIds,
                headline: mergedHeadline,
                body: mergedBody,
                imageOverlayCTA: mergedCTA,
                videoScript: videoItems[0]?.script || videoScript,
                answers,
                mediaSelection: mediaType
              }
            });
          }}
        >
          Continue
        </button>
      </div>

      <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />

      {/* tiny spacer to guarantee no bottom bleed */}
      <div style={{ height: 24 }} />
    </div>
  );
}

/* ====== Conversation questions (unchanged) ====== */
const CONVO_QUESTIONS = [
  { key: "url", question: "What's your website URL?" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "idealCustomer", question: "Describe your ideal customer in one sentence." },
  { key: "hasOffer", question: "Do you have a special offer or promo? (yes/no)" },
  { key: "offer", question: "What is your offer/promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or transformation you promise?" }
];
