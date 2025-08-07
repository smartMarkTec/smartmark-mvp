import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaEdit, FaArrowLeft, FaArrowRight, FaSyncAlt, FaTimes } from "react-icons/fa";

const API_BASE = "/api";
const BACKEND_URL = "https://smartmark-mvp.onrender.com";

const QUESTIONS = [
  { question: "Website URL", key: "url", type: "text", placeholder: "https://yourbusiness.com" },
  { question: "Business/Industry", key: "industry", type: "text", placeholder: "e.g. Pizza restaurant, Fashion store" },
  { question: "Business Name", key: "businessName", type: "text", placeholder: "e.g. Joe's Pizza" },
  { question: "Describe your ideal customer in one sentence.", key: "idealCustomer", type: "text", placeholder: "e.g. Working moms in Dallas" },
  { question: "What is the main problem your customer wants solved?", key: "mainProblem", type: "text", placeholder: "e.g. No time to cook after work" },
  { question: "Do you have a special offer or promo?", key: "hasOffer", type: "yesno" },
  { question: "What is your offer/promo?", key: "offer", type: "text", placeholder: "e.g. $5 off first order", conditional: { key: "hasOffer", value: "yes" } },
  { question: "What’s the main benefit or transformation you promise?", key: "mainBenefit", type: "text", placeholder: "e.g. Healthy meals in under 20 minutes" },
  { question: "What’s a common objection customers have?", key: "objection", type: "text", placeholder: "e.g. Too expensive" },
  { question: "What makes you different? (Unique selling point)", key: "uniqueSellingPoint", type: "text", placeholder: "e.g. Only organic ingredients" },
  { question: "What action do you want people to take after seeing your ad?", key: "cta", type: "text", placeholder: "e.g. Order online" },
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
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 150
    }}>
      <div style={{
        border: "4px solid #19e5b7",
        borderTop: "4px solid #23262a",
        borderRadius: "50%",
        width: 44,
        height: 44,
        animation: "spin 1s linear infinite"
      }} />
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg);}
          100% { transform: rotate(360deg);}
        }
      `}</style>
    </div>
  );
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

export default function FormPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [touched, setTouched] = useState(false);
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

  // Helper for skipping conditional questions
  const getNextVisibleStep = (currentStep, direction = 1) => {
    let s = currentStep + direction;
    while (QUESTIONS[s] && QUESTIONS[s].conditional) {
      const cond = QUESTIONS[s].conditional;
      if (answers[cond.key] !== cond.value) {
        s += direction;
      } else break;
    }
    return s;
  };

  const currentQ = QUESTIONS[step];
  if (currentQ.conditional) {
    const { key, value } = currentQ.conditional;
    if (answers[key] !== value) {
      setTimeout(() => setStep(getNextVisibleStep(step)), 1);
      return null;
    }
  }

  // Show generate only if on last *visible* question
  const isLast = (() => {
    let s = step;
    while (QUESTIONS[s + 1] && QUESTIONS[s + 1].conditional && answers[QUESTIONS[s + 1].conditional.key] !== QUESTIONS[s + 1].conditional.value) {
      s++;
    }
    return s === QUESTIONS.length - 1;
  })();

  const readyToAdvance = !!answers[currentQ.key] || (currentQ.type === "yesno" && typeof answers[currentQ.key] !== "undefined");

  const handleBack = () => {
    let prevStep = step - 1;
    while (prevStep >= 0 && QUESTIONS[prevStep].conditional && answers[QUESTIONS[prevStep].conditional.key] !== QUESTIONS[prevStep].conditional.value) {
      prevStep--;
    }
    if (prevStep >= 0) setStep(prevStep);
  };
  const handleForward = () => {
    if (isLast) return;
    if (readyToAdvance) {
      setStep(getNextVisibleStep(step));
      setTouched(false);
    }
  };

  const handleAnswer = (value) => {
    setAnswers({ ...answers, [currentQ.key]: value });
    setTouched(true);
  };

  // -----------------------
  // MAIN AI GENERATE BUTTON (image + video parallel)
  // -----------------------
  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setImageUrl("");
    setVideoUrl("");
    setVideoScript("");
    setError("");
    setImageLoading(true);
    setVideoLoading(true);

    try {
      const toSend = { ...answers };
      const token = getRandomString();
      setLastRegenerateToken(token);

      // Requests in parallel
      // Defensive JSON handler
const safeJson = async (res) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    try {
      return await res.json();
    } catch (e) {
      return { error: "Malformed JSON", detail: e.message };
    }
  } else {
    // fallback: plain text or HTML error
    const text = await res.text();
    return { error: "Non-JSON response", detail: text };
  }
};


const adCopyPromise = fetch(`${API_BASE}/generate-campaign-assets`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ answers: toSend, url: answers.url || "" })
}).then(safeJson);

const imgPromise = fetch(`${API_BASE}/generate-image-from-prompt`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: answers.url || "",
    industry: answers.industry || "",
    regenerateToken: token
  })
}).then(safeJson);

const videoPromise = fetch(`${API_BASE}/generate-video-ad`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    answers,
    url: answers.url || "",
    industry: answers.industry || "",
    regenerateToken: token
  }),
}).then(safeJson);



      const [data, imgData, videoData] = await Promise.all([adCopyPromise, imgPromise, videoPromise]);

      // Store overlay text as well
      setResult({
        headline: data.headline || "",
        body: data.body || "",
        image_overlay_text: data.image_overlay_text || ""
      });

      // Step 1: Set image
      let stockImageUrl = imgData.imageUrl || "";
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
      setImageLoading(false);

      // Step 2: Set video
      if (videoData.videoUrl) setVideoUrl(videoData.videoUrl.startsWith("http") ? videoData.videoUrl : BACKEND_URL + videoData.videoUrl);
      setVideoScript(videoData.script || "");
      setVideoLoading(false);

    } catch (err) {
      setError("Failed to generate campaign: " + (err.message || ""));
      setImageLoading(false);
      setVideoLoading(false);
    }
    setLoading(false);
  };

  // -----------------------
  // VIDEO AD GENERATION BUTTON (no change)
  // -----------------------
  const handleGenerateVideo = async () => {
    setVideoLoading(true);
    setVideoUrl("");
    setVideoScript("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/generate-video-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers,
          url: answers.url || "",
          industry: answers.industry || ""
        }),
      });
      const data = await res.json();
      if (data.videoUrl) setVideoUrl(data.videoUrl.startsWith("http") ? data.videoUrl : BACKEND_URL + data.videoUrl);
      setVideoScript(data.script || "");
      setVideoLoading(false);
    } catch (err) {
      setError("Failed to generate video ad: " + (err.message || ""));
      setVideoLoading(false);
    }
  };

  // -----------------------
// VIDEO REGENERATE HANDLER (UPDATED)
// -----------------------
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


  // Regenerate always uses current industry/answers (syncs with backend for overlays)
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

  // Modal open/close handlers
  const handleImageClick = (url) => {
    setModalImg(url);
    setShowModal(true);
  };
  const handleModalClose = () => {
    setShowModal(false);
    setModalImg("");
  };

  // ...rest of your component code (JSX return, etc) unchanged...
  return (
  <div
    style={{
      minHeight: "100vh",
      background: DARK_BG,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      fontFamily: MODERN_FONT,
      padding: "0 0 60px 0"
    }}
  >
    {/* Fullscreen Modal */}
    <ImageModal open={showModal} imageUrl={modalImg} onClose={handleModalClose} />

    <div style={{
      width: "100%",
      maxWidth: 780,
      marginTop: 60,
      marginBottom: 30,
      background: "#202327",
      borderRadius: 22,
      boxShadow: "0 2px 32px #181b2040",
      padding: "44px 36px 32px 36px",
      display: "flex",
      flexDirection: "column",
      alignItems: "center"
    }}>
      {/* Stationary Q&A Card */}
      <div style={{
        width: "100%",
        minHeight: 180,
        marginBottom: 34,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:22, width:"100%", justifyContent:"center"}}>
          {/* Back arrow */}
          {step > 0 && (
            <button
              aria-label="Back"
              onClick={handleBack}
              style={{
                border: "none",
                background: "#232729",
                borderRadius: 8,
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 7px #0002",
                cursor: "pointer",
                marginRight: 2,
                outline: "none"
              }}>
              <FaArrowLeft size={20} color={TEAL} />
            </button>
          )}
          <div style={{
            color: "#fff",
            fontWeight: 800,
            fontSize: "2.04rem",
            textAlign: "center",
            lineHeight: 1.15,
            letterSpacing: "-.4px",
            minHeight: 52,
            maxWidth: 540,
            flex:1
          }}>
            {currentQ.question}
          </div>
          {/* Forward arrow */}
          {(!isLast || (isLast && readyToAdvance)) && (
            <button
              aria-label="Next"
              onClick={handleForward}
              disabled={!readyToAdvance}
              style={{
                border: "none",
                background: readyToAdvance ? TEAL : "#243835",
                borderRadius: 8,
                width: 38,
                height: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: readyToAdvance ? "0 2px 7px #14e7b929" : "0 2px 7px #2229",
                cursor: readyToAdvance ? "pointer" : "not-allowed",
                marginLeft: 2,
                outline: "none",
                transition: "background 0.2s"
              }}>
              <FaArrowRight size={20} color={readyToAdvance ? "#fff" : "#57a091"} />
            </button>
          )}
        </div>
        {/* Answers */}
        <div style={{
          marginTop: 36,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%"
        }}>
          {currentQ.type === "yesno" && (
            <div style={{display:"flex", gap:18, justifyContent:"center"}}>
              <button
                style={{
                  background: answers[currentQ.key] === "yes" ? TEAL : "#202c28",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: "1.16rem",
                  padding: "15px 45px",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px #1112",
                  transition: "background 0.15s"
                }}
                onClick={() => handleAnswer("yes")}
              >Yes</button>
              <button
                style={{
                  background: answers[currentQ.key] === "no" ? TEAL : "#202c28",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: "1.16rem",
                  padding: "15px 45px",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px #1112",
                  transition: "background 0.15s"
                }}
                onClick={() => handleAnswer("no")}
              >No</button>
            </div>
          )}
          {currentQ.type === "choices" && (
            <div style={{display:"flex", gap:18, flexWrap:"wrap", justifyContent:"center"}}>
              {currentQ.choices.map((c, idx) => (
                <button
                  key={c}
                  style={{
                    background: answers[currentQ.key] === c ? TEAL : "#202c28",
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: "1.07rem",
                    padding: "15px 38px",
                    cursor: "pointer",
                    marginBottom: 6,
                    boxShadow: "0 2px 10px #1112",
                    transition: "background 0.15s"
                  }}
                  onClick={() => handleAnswer(c)}
                >{c}</button>
              ))}
            </div>
          )}
          {currentQ.type === "text" && (
            <input
              type="text"
              value={answers[currentQ.key] || ""}
              onChange={e => handleAnswer(e.target.value)}
              placeholder={currentQ.placeholder || ""}
              style={{
                background: "#191b1e",
                color: "#fff",
                border: "none",
                outline: "none",
                borderRadius: 99,
                fontWeight: 600,
                fontSize: "1.11rem",
                padding: "17px 28px",
                minWidth: 320,
                maxWidth: 420,
                boxShadow: "0 2px 8px #0002",
                letterSpacing: ".04em",
                textAlign: "center"
              }}
              onKeyDown={e => {
                if (e.key === "Enter" && (answers[currentQ.key] || "").length > 0) {
                  handleForward();
                }
              }}
            />
          )}
        </div>
      </div>
     <button
        id="generate-campaign-btn"
        disabled={!isLast || !readyToAdvance || loading}
        style={{
          background: isLast && readyToAdvance ? TEAL : "#26322f",
          color: isLast && readyToAdvance ? "#fff" : "#87e6d7",
          border: "none",
          borderRadius: 12,
          fontWeight: 700,
          fontSize: "1.19rem",
          padding: "17px 66px",
          cursor: isLast && readyToAdvance && !loading ? "pointer" : "not-allowed",
          boxShadow: isLast && readyToAdvance ? "0 2px 16px #0cc4be44" : "none",
          marginBottom: 42,
          marginTop: 10,
          fontFamily: MODERN_FONT,
          transition: "background 0.18s"
        }}
        onClick={handleGenerate}
      >
        {loading ? "🤖 AI generating..." : "Generate Campaign"}
      </button>
      {error && (
        <div style={{
          color: "#f35e68",
          background: "#281d1d",
          borderRadius: 8,
          padding: "10px 12px",
          fontWeight: 700,
          fontSize: 15,
          marginTop: -10
        }}>
          {error}
        </div>
      )}

       {/* --- Ad Preview Header & MediaType Toggle --- */}
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


    </div>
  </div>
)};
