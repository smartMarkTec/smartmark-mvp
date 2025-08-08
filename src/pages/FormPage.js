import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaSyncAlt, FaTimes } from "react-icons/fa";

const API_BASE = "/api";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";

// New: Conversational Q&A sequence for chat
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
];

const AD_FONT = "Helvetica, Futura, Impact, Arial, sans-serif";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";

const SERIOUS_INDUSTRIES = [
  "medicine","medical","doctor","dentist","health","hospital","hospice",
  "law","legal","lawyer","attorney","finance","financial","accounting","bank","banking",
  "insurance","hvac","plumbing","electrician","contractor",
  "roofing","construction","real estate","security","consulting"
];
const isSeriousIndustry = industry => {
  if (!industry) return false;
  return SERIOUS_INDUSTRIES.some(kw =>
    industry.toLowerCase().includes(kw)
  );
};

function LoadingSpinner() {
  // Dots animation
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: 150
    }}>
      <div style={{
        color: "#b0b8bc",
        fontWeight: 500,
        fontSize: "0.99rem",
        marginBottom: 10,
        letterSpacing: 0.08
      }}>
        This could take up to 2 minutes <span role="img" aria-label="robot">🤖</span>
      </div>
      <div style={{
        display: "flex",
        alignItems: "center",
        height: 44,
        fontSize: 34,
        fontWeight: 700,
        letterSpacing: 1
      }}>
        <Dotty />
      </div>
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

function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}

// --- Toggle Component ---
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
      marginTop: 2,
      marginBottom: 6
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
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.13)"}
          onMouseLeave={e => e.currentTarget.style.transform = mediaType === choice.key ? "scale(1.09)" : "scale(1)"}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

// --------------
// MAIN COMPONENT
// --------------
export default function FormPage() {
  const navigate = useNavigate();
  const inputRef = useRef();
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0); // Now tracks chat step
  const [chatHistory, setChatHistory] = useState([
    { from: "gpt", text: CONVO_QUESTIONS[0].question }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

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

  // Restore/save state as in your original code
  React.useEffect(() => {
    const state = loadFormState();
    if (state) {
      setAnswers(state.answers || {});
      setResult(state.result || null);
      setImageUrl(state.imageUrl || "");
      setVideoUrl(state.videoUrl || "");
      setVideoScript(state.videoScript || "");
      setMediaType(state.mediaType || "both");
    }
  }, []);

  React.useEffect(() => {
    if (!videoUrl && !videoScript) return;
    const prev = loadFormState() || {};
    saveFormState({
      ...prev,
      answers: prev.answers || answers,
      result: prev.result || result,
      imageUrl: prev.imageUrl || imageUrl,
      videoUrl,
      videoScript,
      mediaType: prev.mediaType || mediaType,
    });
    // eslint-disable-next-line
  }, [videoUrl, videoScript]);

  // --- Save helpers (same as your original) ---
  const CAMPAIGN_SAVE_KEY = "smartmark_form_state_v2";
  const CAMPAIGN_SAVE_TTL = 24 * 60 * 60 * 1000;
  function saveFormState(data) {
    localStorage.setItem(CAMPAIGN_SAVE_KEY, JSON.stringify({ ...data, _savedAt: Date.now() }));
  }
  function loadFormState() {
    const raw = localStorage.getItem(CAMPAIGN_SAVE_KEY);
    if (!raw) return null;
    try {
      const obj = JSON.parse(raw);
      if (!obj._savedAt || (Date.now() - obj._savedAt > CAMPAIGN_SAVE_TTL)) {
        localStorage.removeItem(CAMPAIGN_SAVE_KEY);
        return null;
      }
      return obj;
    } catch {
      return null;
    }
  }
  function clearFormState() {
    localStorage.removeItem(CAMPAIGN_SAVE_KEY);
  }

  // -- Chat UI logic replaces old stepper/typeform logic here --
  async function handleUserInput(e) {
    e.preventDefault();
    if (loading) return;
    const currentQ = CONVO_QUESTIONS[step];
    const value = input.trim();
    if (!value) return;

    // Save answer
    const newAnswers = { ...answers, [currentQ.key]: value };
    setAnswers(newAnswers);

    // Add user message to chat
    setChatHistory(ch => [...ch, { from: "user", text: value }]);
    setInput("");

    // Check for conditional skip
    let nextStep = step + 1;
    while (
      CONVO_QUESTIONS[nextStep] &&
      CONVO_QUESTIONS[nextStep].conditional &&
      newAnswers[CONVO_QUESTIONS[nextStep].conditional.key] !== CONVO_QUESTIONS[nextStep].conditional.value
    ) {
      nextStep += 1;
    }

    // If next Q exists, ask it
    if (CONVO_QUESTIONS[nextStep]) {
      setLoading(true);
      setTimeout(() => {
        setChatHistory(ch => [
          ...ch,
          {
            from: "gpt",
            text: [
              "Thanks for sharing!",
              "Noted.",
              "Great info.",
              "That helps a lot.",
              "Perfect.",
              "Got it.",
              "Nice.",
              "Awesome!"
            ][step % 8]
          },
          { from: "gpt", text: CONVO_QUESTIONS[nextStep].question }
        ]);
        setStep(nextStep);
        setLoading(false);
        setTimeout(() => inputRef.current && inputRef.current.focus(), 150);
      }, 350);
      return;
    }

    // All questions answered, run campaign generate!
    setLoading(true);
    setChatHistory(ch => [
      ...ch,
      { from: "gpt", text: "Awesome! Give me a few seconds while I create your campaign..." }
    ]);
    try {
      const token = Math.random().toString(36).slice(2);
      const [data, imgData, videoData] = await Promise.all([
        fetch(`${API_BASE}/generate-campaign-assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: newAnswers })
        }).then(res => res.json()),
        fetch(`${API_BASE}/generate-image-from-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newAnswers, regenerateToken: token })
        }).then(res => res.json()),
        fetch(`${API_BASE}/generate-video-ad`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...newAnswers, regenerateToken: token }),
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
        { from: "gpt", text: "Done! Here are your ad previews. You can regenerate the image or video below." }
      ]);
    } catch (err) {
      setError("Failed to generate campaign: " + (err.message || ""));
      setChatHistory(ch => [...ch, { from: "gpt", text: "There was an error generating your campaign." }]);
    }
    setLoading(false);
  }

  // -----------------------
  // REGENERATE IMAGE/VIDEO (unchanged)
  // -----------------------
  const handleRegenerateImage = async () => {
    setImageLoading(true);
    setImageUrl("");
    try {
      const token = getRandomString();
      setLastRegenerateToken(token);

      const res = await fetch(`${API_BASE}/generate-campaign-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, url: answers.url || "" })
      });
      const data = await res.json();

      // Get a new image
      const imgRes = await fetch(`${API_BASE}/generate-image-from-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: answers.url || "",
          industry: answers.industry || "",
          regenerateToken: token
        })
      });
      const imgData = await imgRes.json();
      const stockImageUrl = imgData.imageUrl || "";

      // Step 2: Always generate overlay if we have an image
      if (stockImageUrl) {
        const overlayRes = await fetch(`${API_BASE}/generate-image-with-overlay`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl: stockImageUrl,
            answers,
            url: answers.url || ""
          })
        });

        const overlayData = await overlayRes.json();
        setImageUrl(overlayData.imageUrl || stockImageUrl);
      } else {
        setImageUrl(stockImageUrl);
      }

      // Update state for preview
      setResult({
        headline: data.headline || "",
        body: data.body || "",
        image_overlay_text: data.image_overlay_text || ""
      });
    } catch (err) {
      setImageUrl("");
    }
    setImageLoading(false);
  };

  const handleRegenerateVideo = async () => {
    setVideoLoading(true);
    setVideoUrl("");
    setVideoScript("");
    setError("");
    try {
      // Generate a NEW random token every time to ensure you get a new set of videos
      const token = getRandomString();
      setLastRegenerateToken(token);

      const res = await fetch(`${API_BASE}/generate-video-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          url: answers.url || "",
          industry: answers.industry || "",
          regenerateToken: token // <-- this is the key: always a fresh value
        }),
      });
      const data = await res.json();
      if (data.videoUrl) setVideoUrl(data.videoUrl.startsWith("http") ? data.videoUrl : BACKEND_URL + data.videoUrl);
      setVideoScript(data.script || "");
    } catch (err) {
      setError("Failed to regenerate video ad: " + (err.message || ""));
    }
    setVideoLoading(false);
  };

  // Modal open/close handlers
  const handleImageClick = (url) => {
    setModalImg(url);
    setShowModal(true);
  };
  const handleModalClose = () => {
    setShowModal(false);
    setModalImg("");
  };

  // ----------- RENDER -----------
  return (
    <div style={{
      background: DARK_BG,
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: MODERN_FONT,
      padding: 0,
    }}>
      {/* Home Button */}
      <button
        style={{
          position: "absolute", top: 24, right: 38, padding: "10px 30px",
          fontWeight: 700, fontSize: "1.18rem", background: "#222c27", color: "#fff",
          border: "none", borderRadius: 20, boxShadow: "0 2px 12px #0003",
          cursor: "pointer", letterSpacing: "1.1px", zIndex: 1001, opacity: 0.92,
          transition: "background 0.15s, color 0.15s",
        }}
        onClick={() => navigate("/")}
      >Home</button>

      {/* Main Content Card */}
      <div style={{
        width: "100%", maxWidth: 600, margin: "88px 0 0 0", background: "#202327",
        borderRadius: 22, boxShadow: "0 2px 32px #181b2040", padding: "36px 22px 30px 22px",
        display: "flex", flexDirection: "column", alignItems: "center"
      }}>
        {/* --- CHAT HISTORY --- */}
        <div style={{ width: "100%", minHeight: 250, marginBottom: 22 }}>
          {chatHistory.map((msg, i) => (
            <div key={i}
              style={{
                textAlign: msg.from === "gpt" ? "left" : "right",
                margin: "8px 0",
                color: msg.from === "gpt" ? "#22e3bd" : "#fff",
                fontWeight: 600,
                fontSize: 18,
                background: msg.from === "gpt" ? "#191d22" : "#12cbb8",
                borderRadius: msg.from === "gpt" ? "14px 18px 18px 7px" : "16px 12px 7px 17px",
                padding: "12px 18px",
                maxWidth: "95%",
                display: "inline-block"
              }}>
              {msg.text}
            </div>
          ))}
        </div>

        {/* Prompt bar (only show before ad previews) */}
        {!result && !loading && CONVO_QUESTIONS[step] && (
          <form onSubmit={handleUserInput} style={{ width: "100%", display: "flex", gap: 10 }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              disabled={loading}
              autoFocus
              placeholder={CONVO_QUESTIONS[step].question}
              style={{
                flex: 1,
                padding: "16px 20px",
                borderRadius: 13,
                border: "none",
                outline: "none",
                fontSize: "1.09rem",
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
                borderRadius: 13,
                fontWeight: 700,
                fontSize: "1.1rem",
                padding: "0 32px",
                cursor: "pointer"
              }}
              disabled={loading}
            >Send</button>
          </form>
        )}

        {loading && <div style={{ color: "#15efb8", marginTop: 20, fontWeight: 600 }}>AI thinking...</div>}
        {error && <div style={{ color: "#f35e68", marginTop: 18 }}>{error}</div>}

        {/* --- Ad Previews (after Q&A is complete) --- */}
        {result && (
          <>
            <div style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              margin: "32px 0 24px 0"
            }}>
              <div style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: "2.01rem",
                letterSpacing: 0.2,
                marginBottom: 18,
                textAlign: "center"
              }}>
                Ad Preview
              </div>
              <div style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center"
              }}>
                <div style={{
                  color: "#98f7e5",
                  fontWeight: 700,
                  fontSize: "1.13rem",
                  letterSpacing: 0.15,
                  textAlign: "center",
                  marginBottom: 2
                }}>
                  Choose
                </div>
                <div style={{ marginBottom: 3, marginTop: 3 }}>
                  <MediaTypeToggle mediaType={mediaType} setMediaType={setMediaType} />
                </div>
              </div>
            </div>
            {/* Facebook Style Ad Previews */}
            <div style={{
              display: "flex",
              justifyContent: "center",
              gap: 34,
              flexWrap: "wrap",
              width: "100%"
            }}>
              {(mediaType === "image" || mediaType === "both") && (
                // IMAGE AD PREVIEW CARD
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
                      <div style={{ width: "100%", height: 220 }}><LoadingSpinner /></div>
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
                  {/* Headline & Body */}
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
                  {/* CTA Bar */}
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
                  {/* (Edit button now bottom right) */}
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
                // VIDEO AD PREVIEW CARD
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
                      <div style={{ width: "100%", height: 220 }}><LoadingSpinner /></div>
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
                  {/* Headline */}
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
                    {/* Only show script if there is a video */}
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
                  {/* CTA Bar */}
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
                  {/* (Edit button now bottom right) */}
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

            {/* CONTINUE BUTTON: Centered under the previews */}
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
                  // Always store and send ABSOLUTE URLs
                  let imgUrlToSend = imageUrl;
                  let vidUrlToSend = videoUrl;
                  // If relative, prepend backend
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
          </>
        )}

        {/* Modal for full image preview */}
        <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />
      </div>
    </div>
  );
}
