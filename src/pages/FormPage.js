import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaSyncAlt, FaTimes, FaArrowUp } from "react-icons/fa";

// ========== Constants ==========
const API_BASE = "/api";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";
const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";
const CONVO_QUESTIONS = [
  { key: "url", question: "What's your website URL?" },
  { key: "industry", question: "What industry is your business in?" },
  { key: "businessName", question: "What's your business name?" },
  { key: "idealCustomer", question: "Describe your ideal customer in one sentence." },
  { key: "mainProblem", question: "What's the main problem your customer wants solved?" },
  { key: "hasOffer", question: "Do you have a special offer or promo? (yes/no)" },
  { key: "offer", question: "What is your offer/promo?", conditional: { key: "hasOffer", value: "yes" } },
  { key: "mainBenefit", question: "What's the main benefit or transformation you promise?" },
  // Add more up to 20 if desired
];

// ========== Helper Functions/Components ==========

function LoadingSpinner() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: 150
    }}>
      <div style={{ color: "#b0b8bc", fontWeight: 500, fontSize: "0.99rem", marginBottom: 10 }}>
        This could take up to 2 minutes <span role="img" aria-label="robot">🤖</span>
      </div>
      <Dotty />
    </div>
  );
}

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
  return {
    display: "inline-block",
    margin: "0 3px",
    fontSize: 36,
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
      margin: "18px 0 14px 0"
    }}>
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
            color: mediaType === choice.key ? "#181b20" : "#bcfff6",
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

function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}

function isGenerateTrigger(input) {
  return /^(yes|y|i'?m ready|lets? do it|generate|go ahead|start|sure|ok)$/i.test(input.trim());
}

// =========== Main Component ============
export default function FormPage() {
  const navigate = useNavigate();
  const inputRef = useRef();
  const chatBoxRef = useRef();

  // --------------- State -----------------
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
const [chatHistory, setChatHistory] = useState([
  { from: "gpt", text: `👋 Hey, I'm your AI Ad Manager. We'll go through about 10 quick questions to create your ad campaign. You can ask me anything about ads, marketing, or correct an answer anytime!` },
  { from: "gpt", text: "Are you ready to get started? (yes/no)" }
]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Ad preview state
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
  const [awaitingContinue, setAwaitingContinue] = useState(false);
const [awaitingGenerate, setAwaitingGenerate] = useState(false);
const [awaitingReady, setAwaitingReady] = useState(true);


function userSaysContinue(val) {
  return /^(yes|yep|ready|continue|next|ok|sure)$/i.test(val.trim());
}
function userSaysGenerate(val) {
  return /^(yes|yep|ready|let's do it|generate|go ahead|ok|i am ready|im ready|lets do it)$/i.test(val.trim());
}
function isOffTopic(val) {
  // Customize as needed for your ad manager
  return /(who are you|how does|what do you do|agency|ad manager|work|help|support|feature|question)/i.test(val);
}
function getOffTopicAnswer(val) {
  // Replace with smarter GPT logic or your gpt.js lookup if desired
  return "I'm your AI Ad Manager. I help create and manage your ad campaigns automatically! Ready for the next question?";
}



  // Scroll chat to bottom on update
  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chatHistory]);

  function handleModalClose() {
    setShowModal(false);
    setModalImg("");
  }

// ---- AI Q&A: Check for GPT chat before stepping to next Q
async function handleUserInput(e) {
  e.preventDefault();
  if (loading) return;
  const value = input.trim();
  if (!value) return;

  // If waiting for "ready"
  if (awaitingReady) {
    setChatHistory(ch => [...ch, { from: "user", text: value }]);
    if (/^(yes|yep|ready|start|go|let'?s go|let'?s start|ok|okay|yea|yeah|alright|i'?m ready|im ready|lets do it|sure)$/i.test(value)) {
      setAwaitingReady(false);
      setChatHistory(ch => [
        ...ch,
        { from: "gpt", text: CONVO_QUESTIONS[0].question }
      ]);
      setStep(0);
      setInput("");
      return;
    } else if (/^(no|not yet|wait|hold on|nah|later)$/i.test(value)) {
      setChatHistory(ch => [
        ...ch,
        { from: "gpt", text: "No problem! Just say 'ready' when you want to start." }
      ]);
      setInput("");
      return;
    } else if (isOffTopic(value)) {
      // Off-topic Q (who are you etc)
      const resp = await fetch(`${API_BASE}/gpt-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: value })
      });
      const { reply } = await resp.json();
      setChatHistory(ch => [
        ...ch,
        { from: "gpt", text: reply },
        { from: "gpt", text: "Are you ready to get started? (yes/no)" }
      ]);
      setInput("");
      return;
    } else {
      setChatHistory(ch => [
        ...ch,
        { from: "gpt", text: "Please reply 'yes' when you're ready to start!" }
      ]);
      setInput("");
      return;
    }
  }

  // 1. "Ready to generate?" positive answer triggers campaign
  if (step === CONVO_QUESTIONS.length && isGenerateTrigger(value)) {
    setLoading(true);
    setGenerating(true);
    setChatHistory(ch => [
      ...ch,
      { from: "user", text: value },
      { from: "gpt", text: "AI generating..." }
    ]);
    setInput("");
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
          body: JSON.stringify({ ...answers, regenerateToken: token })
        }).then(res => res.json())
      ]);
      setResult({
        headline: data.headline || "",
        body: data.body || "",
        image_overlay_text: data.image_overlay_text || ""
      });
      setImageUrl(imgData.imageUrl || "");
setVideoUrl(
  videoData.videoUrl
    ? (videoData.videoUrl.startsWith('http')
      ? videoData.videoUrl
      : BACKEND_URL + videoData.videoUrl)
    : ""
);


      setVideoScript(videoData.script || "");
      setGenerating(false);
      setLoading(false);
      setChatHistory(ch => [
        ...ch,
        { from: "gpt", text: "Done! Here are your ad previews. You can regenerate the image or video below." }
      ]);
    }, 1600);
    return;
  }

  // 2. If at confirmation step but answer is not "yes"
  if (step === CONVO_QUESTIONS.length) {
    setChatHistory(ch => [
      ...ch,
      { from: "user", text: value },
      { from: "gpt", text: "Let's continue! Just answer the question or let me know if you want to change anything." }
    ]);
    setInput("");
    return;
  }

  // 3. If off-topic (AI Ad Manager Q&A), answer, then wait for user input
  if (/(\bwho are you\b|\bwhat is this\b|\bhow does it work\b|\bdo you use ai\b|\bpricing\b|\bhow do you work\b|\bcan you help\b|\bprivacy\b|\bwhat platforms\b|\bcan you run my ads\b|\bcontact\b)/i.test(value)) {
    const resp = await fetch(`${API_BASE}/gpt-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: value, context: { answers } })
    });
    const { reply } = await resp.json();
    setChatHistory(ch => [
      ...ch,
      { from: "user", text: value },
      { from: "gpt", text: reply }
    ]);
    setInput("");
    return;
  }

  // 4. If user input looks like a correction
  if (/^(actually|i meant|change|correction|edit answer|should say|replace|let me edit)/i.test(value)) {
    const lastQ = step > 0 ? CONVO_QUESTIONS[step - 1] : null;
    const keyToUpdate = lastQ ? lastQ.key : null;
    if (keyToUpdate) {
      setAnswers(prev => ({
        ...prev,
        [keyToUpdate]: value.replace(/^(actually|i meant|change|correction|edit answer|should say|replace|let me edit)\s*/i, "")
      }));
      setChatHistory(ch => [
        ...ch,
        { from: "user", text: value },
        { from: "gpt", text: `✅ Updated your answer for "${keyToUpdate.replace(/([A-Z])/g, ' $1')}". Want to change anything else or continue?` }
      ]);
      setInput("");
      return;
    }
  }

  // 5. Normal Q&A: update answer, move to next Q
  const currentQ = CONVO_QUESTIONS[step];
  let newAnswers = { ...answers, [currentQ.key]: value };
  setAnswers(newAnswers);
  setChatHistory(ch => [...ch, { from: "user", text: value }]);
  setInput("");

  // Conditional skip logic
  let nextStep = step + 1;
  while (
    CONVO_QUESTIONS[nextStep] &&
    CONVO_QUESTIONS[nextStep].conditional &&
    newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !== CONVO_QUESTIONS[nextStep].conditional.value
  ) {
    nextStep += 1;
  }

  // If last Q, ask for confirmation
  if (!CONVO_QUESTIONS[nextStep]) {
    setChatHistory(ch => [
      ...ch,
      { from: "gpt", text: "Are you ready for me to generate your campaign? (yes/no)" }
    ]);
    setStep(nextStep);
    setAwaitingGenerate && setAwaitingGenerate(true); // if using
    return;
  }

  // Otherwise, ask next question
  setStep(nextStep);
  setChatHistory(ch => [
    ...ch,
    { from: "gpt", text: CONVO_QUESTIONS[nextStep].question }
  ]);
}



  // --- Handlers for modal image, regenerate, etc. ---
  function handleImageClick(url) {
    setShowModal(true);
    setModalImg(url);
  }

  async function handleRegenerateImage() {
    setImageLoading(true);
    const token = getRandomString();
    const resp = await fetch(`${API_BASE}/generate-image-from-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...answers, regenerateToken: token })
    });
    const data = await resp.json();
    setImageUrl(data.imageUrl || "");
    setImageLoading(false);
  }

  async function handleRegenerateVideo() {
    setVideoLoading(true);
    const token = getRandomString();
    const resp = await fetch(`${API_BASE}/generate-video-ad`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...answers, regenerateToken: token })
    });
    const data = await resp.json();
   setVideoUrl(
  data.videoUrl
    ? (data.videoUrl.startsWith('http')
      ? data.videoUrl
      : BACKEND_URL + data.videoUrl)
    : ""
);




    setVideoScript(data.script || "");
    setVideoLoading(false);
  }

  // ========== Render ==========
  return (
    <div style={{
      background: DARK_BG, minHeight: "100vh", fontFamily: MODERN_FONT,
      display: "flex", flexDirection: "column", alignItems: "center"
    }}>
      {/* Home btn */}
      <button
        style={{
          position: "absolute", top: 24, right: 38, padding: "10px 30px",
          fontWeight: 700, fontSize: "1.18rem", background: "#222c27", color: "#fff",
          border: "none", borderRadius: 20, boxShadow: "0 2px 12px #0003",
          cursor: "pointer", letterSpacing: "1.1px", zIndex: 1001, opacity: 0.92
        }}
        onClick={() => navigate("/")}
      >Home</button>

      {/* ---- Chat Panel, slightly larger, scrollable --- */}
      <div style={{
        width: "100%", maxWidth: 510, minHeight: 370, marginTop: 54, marginBottom: 26,
        background: "#202327", borderRadius: 18, boxShadow: "0 2px 32px #181b2040",
        padding: "38px 30px 22px 30px", display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        {/* Chat Header */}
        <div style={{
          color: "#7fffe2", fontSize: 17, fontWeight: 800, marginBottom: 8, letterSpacing: 1.2
        }}>
          AI Ad Manager
        </div>
        {/* Scrollable chat history */}
        <div ref={chatBoxRef} style={{
          width: "100%", height: 160, maxHeight: 180, overflowY: "auto",
          marginBottom: 16, paddingRight: 4, background: "#191b22", borderRadius: 12
        }}>
          {chatHistory.slice(-20).map((msg, i) => (
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
        {!loading && step <= CONVO_QUESTIONS.length &&
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
                fontSize: "1.07rem",
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
                fontSize: "1.35rem",
                padding: "0 22px",
                cursor: "pointer"
              }}
              disabled={loading}
              tabIndex={0}
              aria-label="Send"
            >
              <FaArrowUp />
            </button>
          </form>
        }
        {loading && <div style={{ color: "#15efb8", marginTop: 10, fontWeight: 600 }}>AI generating...</div>}
        {error && <div style={{ color: "#f35e68", marginTop: 18 }}>{error}</div>}
      </div>

      {/* MediaTypeToggle above previews */}
      <MediaTypeToggle mediaType={mediaType} setMediaType={setMediaType} />

      {/* Ad Previews — always shown */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 34,
        flexWrap: "wrap",
        width: "100%"
      }}>
        {(mediaType === "image" || mediaType === "both") && (
          <div style={{
            background: "#fff",
            borderRadius: 13,
            boxShadow: "0 2px 24px #16242714",
            minWidth: 340,
            maxWidth: 390,
            flex: 1,
            marginBottom: 20,
            padding: "0px 0px 14px 0px",
            border: "1.5px solid #eaeaea",
            fontFamily: AD_FONT,
            display: "flex",
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
            <div style={{ background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {imageLoading || generating ? (
                <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Dotty />
                </div>
              ) : imageUrl ? (
                <img
                  src={imageUrl.startsWith("http") ? imageUrl : BACKEND_URL + imageUrl}
                  alt="Ad Preview"
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    objectFit: "cover",
                    borderRadius: 0,
                    cursor: "pointer"
                  }}
                  onClick={() => handleImageClick(imageUrl)}
                  title="Click to view larger"
                />
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
            <div style={{ padding: "17px 18px 4px 18px" }}>
              <div style={{
                color: "#191c1e",
                fontWeight: 800,
                fontSize: 17,
                marginBottom: 5,
                fontFamily: AD_FONT
              }}>
                {result?.headline || "Don't Miss Our Limited-Time Offer"}
              </div>
              <div style={{
                color: "#3a4149",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 3,
                minHeight: 18
              }}>
                {result?.body || "Ad copy goes here..."}
              </div>
            </div>
            <div style={{
              padding: "8px 18px",
              marginTop: 2
            }}>
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
              onClick={() => {}}
            >
              <FaEdit style={{ fontSize: 15 }} />
              Edit
            </button>
          </div>
        )}
        {(mediaType === "video" || mediaType === "both") && (
          <div style={{
            background: "#fff",
            borderRadius: 13,
            boxShadow: "0 2px 24px #16242714",
            minWidth: 340,
            maxWidth: 390,
            flex: 1,
            marginBottom: 20,
            padding: "0px 0px 14px 0px",
            border: "1.5px solid #eaeaea",
            fontFamily: AD_FONT,
            display: "flex",
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
            <div style={{ background: "#222", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {videoLoading || generating ? (
                <div style={{ width: "100%", height: 220, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Dotty />
                </div>
              ) : videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  style={{
                    width: "100%",
                    maxHeight: 220,
                    borderRadius: 0,
                    background: "#111"
                  }}
                />
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
              <div style={{
                color: "#191c1e",
                fontWeight: 800,
                fontSize: 17,
                marginBottom: 5,
                fontFamily: AD_FONT
              }}>
                {result?.headline || "Welcome New Customers Instantly!"}
              </div>
              {videoScript && (
                <div style={{
                  color: "#3a4149",
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 3,
                  minHeight: 18
                }}>
                  <b>Script:</b> {videoScript}
                </div>
              )}
            </div>
            <div style={{
              padding: "8px 18px",
              marginTop: 2
            }}>
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
              onClick={() => {}}
            >
              <FaEdit style={{ fontSize: 15 }} />
              Edit
            </button>
          </div>
        )}
      </div>

      {/* Continue Button */}
      <div style={{ width: "100%", display: "flex", justifyContent: "center", marginTop: 18 }}>
        <button
          style={{
            background: "#14e7b9",
            color: "#181b20",
            border: "none",
            borderRadius: 13,
            fontWeight: 700,
            fontSize: "1.19rem",
            padding: "18px 72px",
            marginBottom: 18,
            marginTop: 2,
            fontFamily: MODERN_FONT,
            boxShadow: "0 2px 16px #0cc4be24",
            cursor: "pointer",
            transition: "background 0.18s"
          }}
          onClick={() => {
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
      <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />
    </div>
  );
}
