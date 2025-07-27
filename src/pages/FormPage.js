import React, { useState } from "react";
import { FaEdit, FaArrowLeft, FaArrowRight, FaSyncAlt, FaTimes } from "react-icons/fa";

const API_BASE = "/api";
// Add this:
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

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";

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

// Fullscreen modal for image view
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
    boxShadow: "0 8px 38px #000b"
  }}
/>

      </div>
    </div>
  );
}

const AdPreviewCard = ({
  title, type, headline, body, imageUrl, imageLoading, onRegenerate, onImageClick
}) => (
  <div
    style={{
      flex: 1,
      minWidth: 340,
      maxWidth: 430,
      background: "#23262a",
      borderRadius: 18,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      position: "relative",
      boxShadow: "0 2px 18px 0 #1115",
      marginBottom: 6
    }}
  >
    <span style={{
      color: "#adadad",
      fontWeight: 600,
      fontSize: "1.01rem",
      letterSpacing: 1,
      marginBottom: 18
    }}>
      {title}
    </span>
    {/* Image Preview */}
    {type === "image" ? (
      imageLoading ? (
        <div style={{ width: "100%", marginBottom: 18 }}>
          <LoadingSpinner />
        </div>
      ) : imageUrl ? (
        <div
          style={{
            width: "100%",
            marginBottom: 18,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={() => onImageClick(imageUrl)}
          title="Click to view larger"
        >
          <img
  src={imageUrl ? (imageUrl.startsWith("http") ? imageUrl : BACKEND_URL + imageUrl) : ""}
  alt="Ad Preview"
  style={{
    maxWidth: "100%",
    maxHeight: 270,
    borderRadius: 12,
    background: "#282d33",
    boxShadow: "0 2px 14px #1114",
    objectFit: "contain",
    transition: "box-shadow 0.15s"
  }}
/>

          <button
            style={{
              position: "absolute",
              top: 18,
              right: 22,
              background: "#232c29",
              color: "#fff",
              border: "1.5px solid #222",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: "1.07rem",
              padding: "7px 16px",
              cursor: imageLoading ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 7
            }}
            onClick={e => { e.stopPropagation(); onRegenerate(); }}
            disabled={imageLoading}
          >
            <FaSyncAlt style={{ fontSize: 15 }} />
            {imageLoading ? "Regenerating..." : "Regenerate"}
          </button>
        </div>
      ) : (
        <div
          style={{
            width: "100%",
            height: 150,
            background: "#282d33",
            borderRadius: 10,
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#555",
            fontWeight: 700,
            fontSize: 22,
            fontFamily: MODERN_FONT,
            letterSpacing: 1
          }}
        >
          Image goes here
        </div>
      )
    ) : (
      <div
        style={{
          width: "100%",
          height: 150,
          background: "#282d33",
          borderRadius: 10,
          marginBottom: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#555",
          fontWeight: 700,
          fontSize: 22,
          fontFamily: MODERN_FONT,
          letterSpacing: 1
        }}
      >
        Video goes here
      </div>
    )}

    {/* Ad Copy only */}
    <div style={{
      color: "#fff",
      fontWeight: 600,
      fontSize: "1.19rem",
      marginBottom: 7
    }}>
      {type === "image"
        ? headline || "Don't Miss Our Limited-Time Offer"
        : headline || "Welcome New Customers Instantly!"}
    </div>
    <div style={{ color: "#bababa", fontSize: "1.05rem", marginBottom: 6 }}>
      {type === "image"
        ? body || "Ad copy goes here..."
        : ""}
    </div>
    <button
      style={{
        position: "absolute",
        top: 16,
        left: 20,
        background: "#232c29",
        color: "#fff",
        border: "1.5px solid #222",
        borderRadius: 8,
        fontWeight: 700,
        fontSize: "1.07rem",
        padding: "7px 16px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6
      }}
      onClick={() => {}}
    >
      <FaEdit style={{ fontSize: 15 }} />
      Edit
    </button>
  </div>
);

function getRandomString() {
  return Math.random().toString(36).substring(2, 12) + Date.now();
}

export default function FormPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
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

// Generate full campaign assets (AI)
const handleGenerate = async () => {
  setLoading(true);
  setResult(null);
  setImageUrl("");
  setError("");
  try {
    const toSend = { ...answers };
    const res = await fetch(`${API_BASE}/generate-campaign-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: toSend, url: answers.url || "" })
    });
    const data = await res.json();

    // Store overlay text as well
    setResult({
      headline: data.headline || "",
      body: data.body || "",
      image_overlay_text: data.image_overlay_text || ""
    });

    // Step 1: Generate a new stock image
    setImageLoading(true);
    const token = getRandomString();
    setLastRegenerateToken(token);
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

    // Step 2: If overlay text exists, overlay on image
    if (stockImageUrl && data.image_overlay_text) {
      const overlayRes = await fetch(`${API_BASE}/generate-image-with-overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: stockImageUrl,
          headline: data.image_overlay_text, // This is the GPT overlay!
          cta: answers.offer || data.headline || ""
        })
      });
      const overlayData = await overlayRes.json();
      setImageUrl(overlayData.imageUrl || stockImageUrl);
    } else {
      setImageUrl(stockImageUrl);
    }
    setImageLoading(false);
  } catch (err) {
    setError("Failed to generate campaign: " + (err.message || ""));
    setLoading(false);
  }
  setLoading(false);
};

// Allow user to regenerate image with overlay!
const handleRegenerateImage = async () => {
  setImageLoading(true);
  setImageUrl("");
  try {
    const token = getRandomString();
    setLastRegenerateToken(token);

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

    // If overlay text exists, overlay on image (***IMPORTANT FIX BELOW***)
    if (stockImageUrl && result?.image_overlay_text) {
      const overlayRes = await fetch(`${API_BASE}/generate-image-with-overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: stockImageUrl,
          headline: result.image_overlay_text, // <- use overlay text, NOT just headline
          cta: answers.offer || result.headline || ""
        })
      });
      const overlayData = await overlayRes.json();
      setImageUrl(overlayData.imageUrl || stockImageUrl);
    } else {
      setImageUrl(stockImageUrl);
    }
  } catch {
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
        {/* Ad Previews (always visible) */}
        <div style={{
          display: "flex",
          alignItems: "stretch",
          width: "100%",
          gap: 0,
          position: "relative",
          marginTop: 18,
          marginBottom: 14
        }}>
          <AdPreviewCard
            title="IMAGE AD PREVIEW"
            type="image"
            imageUrl={imageUrl}
            imageLoading={imageLoading || loading}
            headline={result?.headline}
            body={result?.body}
            onRegenerate={handleRegenerateImage}
            onImageClick={handleImageClick}
          />
          <div style={{
            width: 2,
            background: "linear-gradient(180deg, #22d1c6 0%, #0fe8b5 100%)",
            borderRadius: 8,
            margin: "0 30px",
            minHeight: 270,
            alignSelf: "center"
          }} />
          <AdPreviewCard
            title="VIDEO AD PREVIEW"
            type="video"
            headline={result?.headline}
          />
        </div>
      </div>
    </div>
  );
}
