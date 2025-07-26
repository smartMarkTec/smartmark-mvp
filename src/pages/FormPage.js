import React, { useState } from "react";
import { FaEdit, FaArrowLeft, FaArrowRight, FaSyncAlt, FaTimes } from "react-icons/fa";

const API_BASE = "/api";

const QUESTIONS = [
  { question: "Main objective?", key: "objective", type: "choices", choices: ["Drive sales", "Get leads", "Website visits", "Build brand"] },
  { question: "Is your offer time-limited?", key: "timelimit", type: "yesno" },
  { question: "Business mostly local or online?", key: "localOnline", type: "choices", choices: ["Local", "Online"] },
  { question: "How urgent is your offer?", key: "urgency", type: "choices", choices: ["Very urgent", "Somewhat urgent", "Not urgent"] },
  { question: "Target new customers, existing, or both?", key: "target", type: "choices", choices: ["New", "Existing", "Both"] },
  { question: "Feature a specific product or service?", key: "featureSpecific", type: "yesno" },
  { question: "Describe your perfect customer in one sentence.", key: "perfectCustomer", type: "text", placeholder: "e.g. 'Families who order takeout weekly'", },
  { question: "What should people do after seeing your ad?", key: "desiredAction", type: "text", placeholder: "e.g. 'Order online', 'Call for a quote', 'Visit website'", }
];

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";

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
          src={imageUrl}
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

// Preview Card
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
    {type === "image" && imageUrl ? (
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
          src={imageUrl}
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
            cursor: "pointer",
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
    ) : type === "image" ? (
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
        {/* No "AI generating..." in preview */}
        {imageLoading ? "" : "Image goes here"}
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
    >
      <FaEdit style={{ fontSize: 15 }} />
      Edit
    </button>
  </div>
);

export default function FormPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  // AI/campaign outputs:
  const [result, setResult] = useState(null);
  const [imageUrl, setImageUrl] = useState("");
  const [imageLoading, setImageLoading] = useState(false);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

  const q = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;
  const readyToAdvance = !!answers[q.key];

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };
  const handleForward = () => {
    if (isLast) return;
    if (readyToAdvance) {
      setStep(step + 1);
      setTouched(false);
    }
  };

  const handleAnswer = (value) => {
    setAnswers({ ...answers, [q.key]: value });
    setTouched(true);
  };

  // Generate full campaign assets (AI)
  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setImageUrl("");
    setError("");
    try {
      const res = await fetch(`${API_BASE}/generate-campaign-assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, url: "" })
      });
      const data = await res.json();
      if (!data.headline && !data.body && !data.image_prompt) throw new Error("AI did not return campaign assets.");
      setResult(data);

      // Generate image
      if (data.image_prompt) {
        setImageLoading(true);
        const imgRes = await fetch(`${API_BASE}/generate-image-from-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: data.image_prompt })
        });
        const imgData = await imgRes.json();
        setImageUrl(imgData.imageUrl || "");
        setImageLoading(false);
      }
    } catch (err) {
      setError("Failed to generate campaign: " + (err.message || ""));
      setLoading(false);
    }
    setLoading(false);
  };

  // Allow user to regenerate image
  const handleRegenerateImage = async () => {
    if (!result?.image_prompt) return;
    setImageLoading(true);
    setImageUrl("");
    try {
      const imgRes = await fetch(`${API_BASE}/generate-image-from-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: result.image_prompt })
      });
      const imgData = await imgRes.json();
      setImageUrl(imgData.imageUrl || "");
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
        {!result && (
          <>
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
                  {q.question}
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
                {q.type === "yesno" && (
                  <div style={{display:"flex", gap:18, justifyContent:"center"}}>
                    <button
                      style={{
                        background: answers[q.key] === "yes" ? TEAL : "#202c28",
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
                        background: answers[q.key] === "no" ? TEAL : "#202c28",
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
                {q.type === "choices" && (
                  <div style={{display:"flex", gap:18, flexWrap:"wrap", justifyContent:"center"}}>
                    {q.choices.map((c, idx) => (
                      <button
                        key={c}
                        style={{
                          background: answers[q.key] === c ? TEAL : "#202c28",
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
                {q.type === "text" && (
                  <input
                    type="text"
                    value={answers[q.key] || ""}
                    onChange={e => handleAnswer(e.target.value)}
                    placeholder={q.placeholder || ""}
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
                      if (e.key === "Enter" && (answers[q.key] || "").length > 0) {
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
            <div style={{
              display: "flex",
              alignItems: "stretch",
              width: "100%",
              gap: 0,
              position: "relative",
              marginTop: 18
            }}>
              <AdPreviewCard
                title="IMAGE AD PREVIEW"
                type="image"
                imageUrl={imageUrl}
                imageLoading={imageLoading}
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
                // No script shown
              />
            </div>
          </>
        )}
        {/* Show AI Results + Real Image */}
        {result && (
          <div style={{
            width: "100%",
            display: "flex",
            gap: 0,
            alignItems: "stretch",
            marginTop: 18
          }}>
            <AdPreviewCard
              title="IMAGE AD PREVIEW"
              type="image"
              imageUrl={imageUrl}
              imageLoading={imageLoading}
              headline={result.headline}
              body={result.body}
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
              headline={result.headline}
            />
          </div>
        )}
      </div>
    </div>
  );
}
