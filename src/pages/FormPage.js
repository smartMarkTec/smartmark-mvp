import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaSyncAlt, FaArrowUp, FaTimes } from "react-icons/fa";

// ------------- Config & Constants -------------
const API_BASE = "/api";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";
const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";

// ------------- Questions -------------
const CONVO_QUESTIONS = [
  { key: "url", question: "What's your website URL?" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "idealCustomer", question: "Describe your ideal customer in one sentence." },
  { key: "mainProblem", question: "What's the main problem your customer wants solved?" },
  { key: "hasOffer", question: "Do you have a special offer or promo? (yes/no)" },
  { key: "offer", question: "What is your offer/promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or transformation you promise?" },
  { key: "objection", question: "What's a common objection customers have?" },
  { key: "uniqueSellingPoint", question: "What makes you different? (Unique selling point)" },
  { key: "cta", question: "What action do you want people to take after seeing your ad?" },
  // Add up to 20 total if you want! You can add more questions here.
];

// ------------- Helper Components -------------
function LoadingSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: 110 }}>
      <div style={{ color: "#b0b8bc", fontWeight: 500, fontSize: "0.95rem", marginBottom: 8, letterSpacing: 0.08 }}>
        Generating... <span role="img" aria-label="robot">🤖</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", height: 32, fontSize: 28, fontWeight: 700, letterSpacing: 1 }}>
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
      </div>
    </div>
  );
}
function dotStyle(n) {
  return {
    display: "inline-block",
    margin: "0 3px",
    fontSize: 26,
    color: "#29efb9",
    animationDelay: `${n * 0.13}s`
  };
}
function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh",
      background: "rgba(16,22,25,0.96)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 9999
    }}>
      <div style={{ position: "relative", background: "#181b20", borderRadius: 18, boxShadow: "0 0 40px #0008" }}>
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 2,
            background: "#23262a", color: "#fff", border: "none",
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
            background: "#222",
            margin: "40px 28px 28px 28px",
            boxShadow: "0 8px 38px #000b",
            fontFamily: AD_FONT
          }}
        />
      </div>
    </div>
  );
}
function MediaTypeToggle({ mediaType, setMediaType }) {
  const choices = [
    { key: "image", label: "Image" },
    { key: "both", label: "Both" },
    { key: "video", label: "Video" },
  ];
  return (
    <div style={{
      display: "flex",
      gap: 16,
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 12
    }}>
      {choices.map((choice) => (
        <button
          key={choice.key}
          onClick={() => setMediaType(choice.key)}
          style={{
            fontWeight: 800,
            fontSize: "1.09rem",
            padding: "8px 22px",
            borderRadius: 11,
            border: "none",
            background: mediaType === choice.key ? "#1ad6b7" : "#23292c",
            color: mediaType === choice.key ? "#181b20" : "#bcfff6",
            cursor: "pointer",
            boxShadow: mediaType === choice.key ? "0 2px 18px #1ad6b773" : "none",
            transform: mediaType === choice.key ? "scale(1.09)" : "scale(1)",
            transition: "all 0.13s",
            outline: mediaType === choice.key ? "3px solid #14e7b9" : "none"
          }}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}

// =========== Main Component ==============
export default function FormPage() {
  const navigate = useNavigate();
  const inputRef = useRef();

  // ---------- State ----------
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [chatHistory, setChatHistory] = useState([
    {
      from: "gpt",
      text: `👋 Hey, I'm your AI Ad Manager. We'll go through about 10 quick questions to create your campaign. You can ask me anything about marketing, or correct an answer anytime!`
    },
    { from: "gpt", text: CONVO_QUESTIONS[0].question }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // --- Ad previews & media toggling ---
  const [mediaType, setMediaType] = useState("both");
  const [result, setResult] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoScript, setVideoScript] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalImg, setModalImg] = useState("");
  const [lastRegenerateToken, setLastRegenerateToken] = useState("");

  // --- Scroll chat to bottom on update
  const chatBoxRef = useRef();
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  // --- Helper for smart GPT chat ---
  function isCorrection(text) {
    return /(?:actually|i meant|change|let me edit|correction|edit answer|can you update|should say|replace)/i.test(text);
  }
  function findCorrectionKey(text) {
    for (let q of CONVO_QUESTIONS) {
      if (text.toLowerCase().includes(q.key)) return q.key;
      if (q.question && text.toLowerCase().includes(q.question.split(" ")[0].toLowerCase())) return q.key;
    }
    return null;
  }
  function isGeneralQ(text) {
    return /what do you do|who are you|what is this|marketing|facebook ad|campaign|features|pricing|help|how/i.test(text);
  }

  // ------------ Handle User Chat/Answer ------------
  async function handleUserInput(e) {
    e.preventDefault();
    if (loading) return;
    const value = input.trim();
    if (!value) return;

    // If user asks a general question, respond as "AI Ad Manager" then restate the current question.
    if (isGeneralQ(value)) {
      setChatHistory(ch => [
        ...ch,
        { from: "user", text: value },
        {
          from: "gpt",
          text:
            value.toLowerCase().includes("what do you do") || value.toLowerCase().includes("who are you")
              ? "I'm SmartMark's AI Ad Manager. I help you build high-performing Facebook and Instagram ads by asking the right questions and generating creative, compliant ad campaigns. Just answer the questions, or correct any response!"
              : "I can help with marketing, campaign setup, creative ideas, and more. Let's continue with your campaign setup!"
        },
        { from: "gpt", text: CONVO_QUESTIONS[step]?.question }
      ]);
      setInput("");
      return;
    }

    // Handle corrections (natural language update)
    if (isCorrection(value)) {
      let keyToUpdate = findCorrectionKey(value) || (step > 0 ? CONVO_QUESTIONS[step - 1].key : null);
      if (keyToUpdate) {
        setAnswers(prev => ({
          ...prev,
          [keyToUpdate]: value.replace(/^(actually|i meant|change|let me edit|correction|edit answer|can you update|should say|replace)\s*/i, "")
        }));
        setChatHistory(ch => [
          ...ch,
          { from: "user", text: value },
          {
            from: "gpt",
            text: `✅ Updated your answer for "${keyToUpdate.replace(/([A-Z])/g, ' $1')}". If you'd like to correct anything else, just let me know!`
          },
          { from: "gpt", text: CONVO_QUESTIONS[step]?.question }
        ]);
        setInput("");
        return;
      }
    }

    // Save answer to current question (handles skip for conditionals)
    const currentQ = CONVO_QUESTIONS[step];
    let newAnswers = { ...answers, [currentQ.key]: value };
    setAnswers(newAnswers);
    setChatHistory(ch => [...ch, { from: "user", text: value }]);
    setInput("");

    // Find next visible question
    let nextStep = step + 1;
    while (
      CONVO_QUESTIONS[nextStep] &&
      CONVO_QUESTIONS[nextStep].conditional &&
      newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !== CONVO_QUESTIONS[nextStep].conditional.value
    ) {
      nextStep += 1;
    }

    // After last Q, ask for confirmation to generate
    if (!CONVO_QUESTIONS[nextStep]) {
      setChatHistory(ch => [
        ...ch,
        {
          from: "gpt",
          text: "Would you like me to generate your ad campaign now? (yes/no)"
        }
      ]);
      setStep(nextStep);
      return;
    }

    // Otherwise, prompt the next question
    setChatHistory(ch => [
      ...ch,
      { from: "gpt", text: CONVO_QUESTIONS[nextStep].question }
    ]);
    setStep(nextStep);
  }

  // ----------- Watch for yes/no after last Q for campaign generate ------------
  useEffect(() => {
    if (step === CONVO_QUESTIONS.length && chatHistory.length > 2) {
      const lastUser = chatHistory.filter(m => m.from === "user").slice(-1)[0]?.text?.toLowerCase();
      if (lastUser === "yes" || lastUser === "y" || lastUser?.includes("go ahead")) {
        setLoading(true);
        setChatHistory(ch => [...ch, { from: "gpt", text: "Great! Generating your ad campaign now..." }]);
        setTimeout(async () => {
          const token = getRandomString();
          const [data, imgData, videoData] = await Promise.all([
            fetch(`${API_BASE}/generate-campaign-assets`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ answers })
            }).then(res => res.json()),
            fetch(`${API_BASE}/generate-image-from-prompt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...answers, regenerateToken: token })
            }).then(res => res.json()),
            fetch(`${API_BASE}/generate-video-ad`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...answers, regenerateToken: token }),
            }).then(res => res.json())
          ]);
          setResult({
            headline: data.headline || "",
            body: data.body || "",
            image_overlay_text: data.image_overlay_text || ""
          });
          setImageUrl(imgData.imageUrl || "");
          setVideoUrl(videoData.videoUrl || "");
          setVideoScript(videoData.script || "");
          setChatHistory(ch => [
            ...ch,
            { from: "gpt", text: "Done! Here are your ad previews below. You can regenerate the image or video at any time." }
          ]);
          setLoading(false);
        }, 1700);
      }
      if (lastUser === "no" || lastUser === "n") {
        setChatHistory(ch => [
          ...ch,
          { from: "gpt", text: "No problem! Tell me what you'd like to change or add, or correct any previous answer." }
        ]);
      }
    }
    // eslint-disable-next-line
  }, [chatHistory, step]);

  // --- Modal Handler ---
  function handleModalClose() {
    setShowModal(false);
    setModalImg("");
  }

  // ---- Regenerate Handlers (Image/Video) ----
  const handleRegenerateImage = async () => {
    setImageLoading(true);
    setImageUrl("");
    try {
      const token = getRandomString();
      setLastRegenerateToken(token);
      const imgRes = await fetch(`${API_BASE}/generate-image-from-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          regenerateToken: token
        })
      });
      const imgData = await imgRes.json();
      setImageUrl(imgData.imageUrl || "");
    } catch (err) { setImageUrl(""); }
    setImageLoading(false);
  };
  const handleRegenerateVideo = async () => {
    setVideoLoading(true);
    setVideoUrl("");
    setVideoScript("");
    try {
      const token = getRandomString();
      setLastRegenerateToken(token);
      const res = await fetch(`${API_BASE}/generate-video-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...answers,
          regenerateToken: token
        }),
      });
      const data = await res.json();
      setVideoUrl(data.videoUrl || "");
      setVideoScript(data.script || "");
    } catch (err) { setVideoUrl(""); setVideoScript(""); }
    setVideoLoading(false);
  };

  // ---- Main Render ----
  return (
    <div style={{
      background: DARK_BG, minHeight: "100vh", fontFamily: MODERN_FONT,
      display: "flex", flexDirection: "column", alignItems: "center"
    }}>
      {/* ---------- Home btn ---------- */}
      <button
        style={{
          position: "absolute", top: 24, right: 38, padding: "10px 30px",
          fontWeight: 700, fontSize: "1.18rem", background: "#222c27", color: "#fff",
          border: "none", borderRadius: 20, boxShadow: "0 2px 12px #0003",
          cursor: "pointer", letterSpacing: "1.1px", zIndex: 1001, opacity: 0.92
        }}
        onClick={() => navigate("/")}
      >Home</button>

      {/* --- Chatbox and Ad UI --- */}
      <div style={{
        width: "100%", maxWidth: 550, minHeight: 320, marginTop: 54,
        background: "#202327", borderRadius: 20, boxShadow: "0 2px 32px #181b2040",
        padding: "38px 24px 28px 24px", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        {/* Chatbox Title */}
        <div style={{
          width: "100%", marginBottom: 14,
          textAlign: "center", color: "#7fffe2",
          fontWeight: 900, fontSize: 20, letterSpacing: 1.3,
          borderRadius: 13
        }}>AI Ad Manager</div>

        {/* Scrollable chat history */}
        <div ref={chatBoxRef} style={{
          width: "100%", height: 184, maxHeight: 184, overflowY: "auto",
          marginBottom: 14, paddingRight: 4, background: "#191b22", borderRadius: 14
        }}>
          {chatHistory.map((msg, i) => (
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
                maxWidth: "96%",
                display: "inline-block"
              }}>
              {msg.text}
            </div>
          ))}
        </div>
        {/* Prompt bar */}
        {!loading &&
          <form onSubmit={handleUserInput} style={{ width: "100%", display: "flex", gap: 10 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              autoFocus
              placeholder={
                step < CONVO_QUESTIONS.length
                  ? CONVO_QUESTIONS[step]?.question
                  : "Type yes to generate, or say what to change..."
              }
              style={{
                flex: 1,
                padding: "14px 18px",
                borderRadius: 12,
                border: "none",
                outline: "none",
                fontSize: "1.12rem",
                fontWeight: 600,
                background: "#23262a",
                color: "#fff",
                boxShadow: "0 1.5px 8px #1acbb932"
              }}
            />
            <button type="submit"
              style={{
                background: "#14e7b9",
                color: "#181b20",
                border: "none",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: "1.23rem",
                padding: "0 22px",
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}
              disabled={loading}
              aria-label="Send"
            >
              <FaArrowUp />
            </button>
          </form>
        }
        {loading && <div style={{ color: "#15efb8", marginTop: 10, fontWeight: 600 }}>AI Ad Manager is thinking...</div>}
        {error && <div style={{ color: "#f35e68", marginTop: 18 }}>{error}</div>}

        {/* --- Media Type Toggle (above ad previews) --- */}
        <MediaTypeToggle mediaType={mediaType} setMediaType={setMediaType} />

        {/* --- Ad Previews, always visible --- */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: 36,
          flexWrap: "wrap",
          width: "100%",
          margin: "10px 0 10px 0"
        }}>
          {(mediaType === "image" || mediaType === "both") && (
            // IMAGE AD PREVIEW CARD
            <div style={{
              background: "#fff",
              borderRadius: 13,
              boxShadow: "0 2px 24px #16242714",
              minWidth: 290,
              maxWidth: 340,
              flex: 1,
              marginBottom: 12,
              padding: "0px 0px 14px 0px",
              border: "1.5px solid #eaeaea",
              fontFamily: AD_FONT,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative"
            }}>
              {/* "Facebook" header strip */}
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
                {/* Move regenerate button to top right inside card */}
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
                  {imageLoading ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
              {/* Ad Image Preview */}
              <div style={{ background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {imageLoading ? (
                  <div style={{ width: "100%", height: 162 }}><LoadingSpinner /></div>
                ) : imageUrl ? (
                  <img
                    src={imageUrl.startsWith("http") ? imageUrl : BACKEND_URL + imageUrl}
                    alt="Ad Preview"
                    style={{
                      width: "100%",
                      maxHeight: 162,
                      objectFit: "cover",
                      borderRadius: 0,
                      cursor: "pointer"
                    }}
                    onClick={() => { setModalImg(imageUrl); setShowModal(true); }}
                    title="Click to view larger"
                  />
                ) : (
                  <div style={{
                    height: 162,
                    width: "100%",
                    background: "#e9ecef",
                    color: "#a9abb0",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 19
                  }}>Image goes here</div>
                )}
              </div>
              {/* Headline & Body */}
              <div style={{ padding: "13px 15px 4px 15px" }}>
                <div style={{
                  color: "#191c1e",
                  fontWeight: 800,
                  fontSize: 16,
                  marginBottom: 3,
                  fontFamily: AD_FONT
                }}>
                  {result?.headline || "Don't Miss Our Limited-Time Offer"}
                </div>
                <div style={{
                  color: "#3a4149",
                  fontSize: 14,
                  fontWeight: 600,
                  marginBottom: 3,
                  minHeight: 18
                }}>
                  {result?.body || "Ad copy goes here..."}
                </div>
              </div>
              {/* CTA Bar */}
              <div style={{
                padding: "8px 15px",
                marginTop: 2
              }}>
                <button style={{
                  background: "#14e7b9",
                  color: "#181b20",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 9,
                  padding: "8px 20px",
                  fontSize: 14,
                  cursor: "pointer"
                }}>Learn More</button>
              </div>
              {/* (Edit button now bottom right) */}
              <button
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 14,
                  background: "#f3f6f7",
                  color: "#12cbb8",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "1.01rem",
                  padding: "5px 13px",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px #2bcbb828",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  zIndex: 2
                }}
                onClick={() => {}}
              >
                <FaEdit style={{ fontSize: 14 }} />
                Edit
              </button>
            </div>
          )}
          {(mediaType === "video" || mediaType === "both") && (
            // VIDEO AD PREVIEW CARD
            <div style={{
              background: "#fff",
              borderRadius: 13,
              boxShadow: "0 2px 24px #16242714",
              minWidth: 290,
              maxWidth: 340,
              flex: 1,
              marginBottom: 12,
              padding: "0px 0px 14px 0px",
              border: "1.5px solid #eaeaea",
              fontFamily: AD_FONT,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              position: "relative"
            }}>
              {/* "Facebook" header strip with Regenerate Button */}
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
                  {videoLoading ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
              {/* Video Preview */}
              <div style={{ background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {videoLoading ? (
                  <div style={{ width: "100%", height: 162 }}><LoadingSpinner /></div>
                ) : videoUrl ? (
                  <video
                    src={videoUrl}
                    controls
                    style={{
                      width: "100%",
                      maxHeight: 162,
                      borderRadius: 0,
                      background: "#111"
                    }}
                  />
                ) : (
                  <div style={{
                    height: 162,
                    width: "100%",
                    background: "#e9ecef",
                    color: "#a9abb0",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 19
                  }}>Video goes here</div>
                )}
              </div>
              {/* Headline */}
              <div style={{ padding: "13px 15px 4px 15px" }}>
                <div style={{
                  color: "#191c1e",
                  fontWeight: 800,
                  fontSize: 16,
                  marginBottom: 3,
                  fontFamily: AD_FONT
                }}>
                  {result?.headline || "Welcome New Customers Instantly!"}
                </div>
                {/* Only show script if there is a video */}
                {videoScript && (
                  <div style={{
                    color: "#3a4149",
                    fontSize: 14,
                    fontWeight: 600,
                    marginBottom: 3,
                    minHeight: 18
                  }}>
                    <b>Script:</b> {videoScript}
                  </div>
                )}
              </div>
              {/* CTA Bar */}
              <div style={{
                padding: "8px 15px",
                marginTop: 2
              }}>
                <button style={{
                  background: "#14e7b9",
                  color: "#181b20",
                  fontWeight: 700,
                  border: "none",
                  borderRadius: 9,
                  padding: "8px 20px",
                  fontSize: 14,
                  cursor: "pointer"
                }}>Learn More</button>
              </div>
              {/* (Edit button now bottom right) */}
              <button
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 14,
                  background: "#f3f6f7",
                  color: "#12cbb8",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: "1.01rem",
                  padding: "5px 13px",
                  cursor: "pointer",
                  boxShadow: "0 1px 3px #2bcbb828",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  zIndex: 2
                }}
                onClick={() => {}}
              >
                <FaEdit style={{ fontSize: 14 }} />
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Modal for full image preview */}
        <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />

        {/* --- Continue Button Below Previews --- */}
        <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 12 }}>
          <button
            style={{
              background: "#14e7b9",
              color: "#181b20",
              border: "none",
              borderRadius: 13,
              fontWeight: 700,
              fontSize: "1.13rem",
              padding: "14px 54px",
              marginBottom: 12,
              fontFamily: MODERN_FONT,
              boxShadow: "0 2px 16px #0cc4be24",
              cursor: "pointer",
              transition: "background 0.18s"
            }}
            onClick={() => {
              // Always store and send ABSOLUTE URLs
              let imgUrlToSend = imageUrl;
              let vidUrlToSend = videoUrl;
              if (imgUrlToSend && !/^https?:\/\//.test(imgUrlToSend)) imgUrlToSend = BACKEND_URL + imgUrlToSend;
              if (vidUrlToSend && !/^https?:\/\//.test(vidUrlToSend)) vidUrlToSend = BACKEND_URL + vidUrlToSend;
              if (imgUrlToSend) localStorage.setItem("smartmark_last_image_url", imgUrlToSend);
              if (vidUrlToSend) localStorage.setItem("smartmark_last_video_url", vidUrlToSend);
              navigate("/setup", {
                state: {
                  imageUrl: imgUrlToSend,
                  videoUrl: vidUrlToSend,
                  headline: result?.headline,
                  body: result?.body,
                  videoScript,
                  answers
                }
              });
            }}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
