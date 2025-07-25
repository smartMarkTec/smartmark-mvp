import React, { useState } from "react";
import { FaEdit } from "react-icons/fa";

const QUESTIONS = [
  {
    question: "Would you like us to use your website to learn about your business and generate your ad?",
    type: "yesno",
    key: "useWebsite"
  },
  {
    question: "Is your business primarily targeting local customers?",
    type: "yesno",
    key: "isLocal"
  },
  {
    question: "Are you currently running any promotions or offers?",
    type: "yesno",
    key: "hasPromo"
  },
  {
    question: "Would you prefer your ad to focus on brand awareness over direct sales?",
    type: "yesno",
    key: "brandAwareness"
  },
  {
    question: "Do you offer delivery or online ordering?",
    type: "yesno",
    key: "hasDelivery"
  },
  {
    question: "Should we emphasize fast service or convenience in your ad?",
    type: "yesno",
    key: "fastService"
  }
];

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const TEAL = "#12b3a6";
const DARK_BG = "#181b20";

const AdPreviewCard = ({ title, type }) => (
  <div
    style={{
      flex: 1,
      minWidth: 320,
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
        background: "#262b2d",
        color: "#fff",
        border: "1.5px solid #444",
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
  const [showPreviews, setShowPreviews] = useState(false);

  const handleAnswer = (ans) => {
    setAnswers({ ...answers, [QUESTIONS[step].key]: ans });
    if (step === QUESTIONS.length - 1) return;
    setStep(step + 1);
  };

  const handleGenerate = () => setShowPreviews(true);

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
        maxWidth: 760,
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
        {!showPreviews ? (
          <>
            <div style={{
              color: "#fff",
              fontWeight: 800,
              fontSize: "2.13rem",
              textAlign: "center",
              marginBottom: 32,
              lineHeight: 1.22,
              letterSpacing: "-.4px"
            }}>
              {QUESTIONS[step].question}
            </div>
            {/* Yes/No buttons */}
            <div style={{
              display: "flex",
              gap: 20,
              width: "100%",
              justifyContent: "center",
              marginBottom: 38
            }}>
              <button
                style={{
                  background: "#23282e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: "1.22rem",
                  padding: "17px 54px",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px #1112",
                  transition: "background 0.15s"
                }}
                onClick={() => handleAnswer("yes")}
              >Yes</button>
              <button
                style={{
                  background: "#23282e",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  fontWeight: 700,
                  fontSize: "1.22rem",
                  padding: "17px 54px",
                  cursor: "pointer",
                  boxShadow: "0 2px 10px #1112",
                  transition: "background 0.15s"
                }}
                onClick={() => handleAnswer("no")}
              >No</button>
            </div>
            {/* Generate or Done button */}
            {step === QUESTIONS.length - 1 ? (
              <button
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  background: TEAL,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: "1.19rem",
                  padding: "16px 52px",
                  cursor: "pointer",
                  boxShadow: "0 2px 16px #0cc4be44",
                  transition: "background 0.18s"
                }}
                onClick={handleGenerate}
              >
                Generate Campaign
              </button>
            ) : (
              <button
                style={{
                  marginTop: 8,
                  marginBottom: 0,
                  background: TEAL,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontWeight: 700,
                  fontSize: "1.18rem",
                  padding: "15px 46px",
                  cursor: "pointer",
                  opacity: 0.7,
                  boxShadow: "0 2px 16px #0cc4be22"
                }}
                disabled
              >
                Next
              </button>
            )}
          </>
        ) : (
          // Ad previews with divider
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
        )}
      </div>
    </div>
  );
}
