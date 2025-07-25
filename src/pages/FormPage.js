import React, { useState, useRef } from "react";
import { FaEdit, FaArrowLeft } from "react-icons/fa";

const QUESTIONS = [
  {
    question: "Would you like us to use your website to generate your ad?",
    key: "useWebsite",
    type: "yesno",
  },
  {
    question: "Is your business primarily targeting local customers?",
    key: "isLocal",
    type: "yesno",
  },
  {
    question: "Are you currently running any promotions or offers?",
    key: "hasPromo",
    type: "yesno",
  },
  {
    question: "Would you prefer your ad to focus on brand awareness over direct sales?",
    key: "brandAwareness",
    type: "yesno",
  },
  {
    question: "Do you offer delivery or online ordering?",
    key: "hasDelivery",
    type: "yesno",
  },
  {
    question: "Should we emphasize fast service or convenience in your ad?",
    key: "fastService",
    type: "yesno",
  },
  {
    question: "What would you like customers to do once they visit your website?",
    key: "goal",
    type: "text",
    placeholder: "e.g., place an order, book, read a blog...",
  },
  {
    question: "Anything specific you want shown in the ad?",
    key: "custom",
    type: "text",
    placeholder: "e.g., menu items, offers, images, phrases...",
  }
];

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#14e7b9";
const DARK_BG = "#181b20";

const AdPreviewCard = ({ title, type }) => (
  <div
    style={{
      flex: 1,
      minWidth: 340,
      maxWidth: 400,
      background: "#23262a",
      borderRadius: 18,
      padding: 24,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      position: "relative",
      boxShadow: "0 2px 18px 0 #1115"
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
    {/* Placeholder for image or video */}
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
      {type === "image" ? "Image goes here" : "Video goes here"}
    </div>
    {/* Sample ad copy text */}
    <div style={{ color: "#fff", fontWeight: 600, fontSize: "1.19rem", marginBottom: 7 }}>
      {type === "image" ? "Don't Miss Our Limited-Time Offer" : "Welcome New Customers Instantly!"}
    </div>
    <div style={{ color: "#bababa", fontSize: "1.05rem" }}>
      {type === "image" ? "Ad copy goes here..." : "Video ad copy..."}
    </div>
    <button
      style={{
        position: "absolute",
        top: 16,
        right: 20,
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
  const [done, setDone] = useState(false);

  const handleAnswer = (ans) => {
    setAnswers({ ...answers, [QUESTIONS[step].key]: ans });
    if (step < QUESTIONS.length - 1) {
      setStep(step + 1);
    } else {
      setDone(true);
    }
  };

  const handleBack = () => {
    if (done) {
      setDone(false);
      setStep(QUESTIONS.length - 1);
    } else if (step > 0) {
      setStep(step - 1);
    }
  };

  // Carousel slide logic
  const slideStyle = {
    display: "flex",
    flexDirection: "row",
    transition: "transform 0.44s cubic-bezier(.8, .2, .15, 1)",
    width: `${QUESTIONS.length * 100}%`,
    transform: `translateX(-${step * (100 / QUESTIONS.length)}%)`
  };
  const singleSlide = {
    width: `${100 / QUESTIONS.length}%`,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  };

  // Input for free response
  const handleTextChange = (e) => {
    setAnswers({ ...answers, [QUESTIONS[step].key]: e.target.value });
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
        {/* Carousel/Slider Survey */}
        <div style={{
          width: "100%",
          overflow: "hidden",
          marginBottom: 34,
          position: "relative",
          minHeight: 180
        }}>
          <div style={slideStyle}>
            {QUESTIONS.map((q, i) => (
              <div style={singleSlide} key={q.key}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginBottom: 36,
                  justifyContent: "center"
                }}>
                  {/* Back arrow button */}
                  {((step === i && step > 0 && !done) || (done && i === QUESTIONS.length - 1)) && (
                    <button
                      aria-label="Back"
                      onClick={handleBack}
                      style={{
                        border: "none",
                        background: "#222729",
                        borderRadius: 8,
                        width: 38,
                        height: 38,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 7px #0002",
                        cursor: "pointer",
                        marginRight: 6,
                        outline: "none"
                      }}>
                      <FaArrowLeft size={20} color={TEAL} />
                    </button>
                  )}
                  <div style={{
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: "2.13rem",
                    textAlign: "center",
                    lineHeight: 1.22,
                    letterSpacing: "-.4px",
                    minHeight: 52,
                    maxWidth: 540
                  }}>
                    {q.question}
                  </div>
                </div>
                {q.type === "yesno" && (
                  <div style={{ display: "flex", gap: 20 }}>
                    <button
                      style={{
                        background: answers[q.key] === "yes" ? TEAL : "#202c28",
                        color: "#fff",
                        border: "none",
                        borderRadius: 14,
                        fontWeight: 700,
                        fontSize: "1.19rem",
                        padding: "15px 48px",
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
                        fontSize: "1.19rem",
                        padding: "15px 48px",
                        cursor: "pointer",
                        boxShadow: "0 2px 10px #1112",
                        transition: "background 0.15s"
                      }}
                      onClick={() => handleAnswer("no")}
                    >No</button>
                  </div>
                )}
                {q.type === "text" && (
                  <input
                    type="text"
                    value={answers[q.key] || ""}
                    onChange={handleTextChange}
                    placeholder={q.placeholder || ""}
                    style={{
                      background: "#191b1e",
                      color: "#fff",
                      border: "none",
                      outline: "none",
                      borderRadius: 99,
                      fontWeight: 600,
                      fontSize: "1.17rem",
                      padding: "17px 28px",
                      marginTop: 6,
                      marginBottom: 8,
                      minWidth: 320,
                      boxShadow: "0 2px 8px #0002",
                      letterSpacing: ".04em",
                      textAlign: "center"
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (answers[q.key] || "").length > 0) {
                        handleAnswer(e.target.value);
                      }
                    }}
                  />
                )}
                {/* Show Done button on last question and it's not text input */}
                {(step === QUESTIONS.length - 1 && q.type !== "text" && !done) && (
                  <button
                    style={{
                      marginTop: 28,
                      background: TEAL,
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: "1.19rem",
                      padding: "15px 48px",
                      cursor: "pointer",
                      boxShadow: "0 2px 12px #13e8be32",
                      fontFamily: MODERN_FONT,
                      transition: "background 0.18s"
                    }}
                    onClick={() => setDone(true)}
                  >
                    Done
                  </button>
                )}
                {/* Show Done for last free response if not empty */}
                {(step === QUESTIONS.length - 1 && q.type === "text" && (answers[q.key] || "").length > 0 && !done) && (
                  <button
                    style={{
                      marginTop: 18,
                      background: TEAL,
                      color: "#fff",
                      border: "none",
                      borderRadius: 12,
                      fontWeight: 700,
                      fontSize: "1.19rem",
                      padding: "15px 48px",
                      cursor: "pointer",
                      boxShadow: "0 2px 12px #13e8be32",
                      fontFamily: MODERN_FONT,
                      transition: "background 0.18s"
                    }}
                    onClick={() => setDone(true)}
                  >
                    Done
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        {/* Generate Campaign Button */}
        {done && (
          <button
            id="generate-campaign-btn"
            style={{
              background: TEAL,
              color: "#222",
              border: "none",
              borderRadius: 12,
              fontWeight: 700,
              fontSize: "1.24rem",
              padding: "18px 66px",
              cursor: "pointer",
              boxShadow: "0 2px 16px #0cc4be44",
              marginBottom: 42,
              marginTop: 8,
              fontFamily: MODERN_FONT,
              transition: "background 0.18s"
            }}
            onClick={() => alert("Generate Campaign (hook up logic here)!")}
          >
            Generate Campaign
          </button>
        )}

        {/* Ad Previews with Divider */}
        <div style={{
          display: "flex",
          alignItems: "stretch",
          width: "100%",
          gap: 0,
          position: "relative",
          marginTop: 18
        }}>
          <AdPreviewCard title="IMAGE AD PREVIEW" type="image" />
          {/* Vertical Divider */}
          <div style={{
            width: 2,
            background: "linear-gradient(180deg, #22d1c6 0%, #0fe8b5 100%)",
            borderRadius: 8,
            margin: "0 30px",
            minHeight: 270,
            alignSelf: "center"
          }} />
          <AdPreviewCard title="VIDEO AD PREVIEW" type="video" />
        </div>
      </div>
    </div>
  );
}
