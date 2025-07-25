import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const DARK_GREEN = "#185431";
const QUESTIONS = [
  // Yes/No Qs
  {
    type: "yesno",
    question: "Would you like us to use your website to learn about your business and generate your ad?",
    key: "useWebsite",
    followup: {
      type: "text",
      question: "Enter your website URL",
      key: "websiteUrl"
    }
  },
  {
    type: "yesno",
    question: "Is your business primarily targeting local customers?",
    key: "isLocal"
  },
  {
    type: "yesno",
    question: "Are you currently running any promotions or offers?",
    key: "hasPromo",
    followup: {
      type: "text",
      question: "Briefly describe the offer",
      key: "promoDesc"
    }
  },
  {
    type: "yesno",
    question: "Would you prefer your ad to focus on brand awareness over direct sales?",
    key: "brandAwareness"
  },
  {
    type: "yesno",
    question: "Do you offer delivery or online ordering?",
    key: "hasDelivery"
  },
  {
    type: "yesno",
    question: "Should we emphasize fast service or convenience in your ad?",
    key: "fastService"
  },
  // Multiple Choice
  {
    type: "multiple",
    question: "What’s the main goal of this ad?",
    key: "adGoal",
    options: [
      "Get more website visitors",
      "Drive online orders",
      "Increase bookings",
      "Promote a special deal"
    ]
  },
  {
    type: "multiple",
    question: "Which best describes your brand's vibe?",
    key: "brandVibe",
    options: [
      "Premium / Luxury",
      "Friendly & Approachable",
      "Trendy & Bold",
      "Minimal / Clean",
      "Energetic / Fun"
    ]
  },
  // Free Response
  {
    type: "text",
    question: "What would you like customers to do once they visit your website?",
    key: "websiteGoal"
  },
  {
    type: "text",
    question: "Is there anything specific you want shown in the ad?",
    key: "adSpecific"
  }
];

const FormPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputValue, setInputValue] = useState("");

  const current = QUESTIONS[step];

  // For followup question (e.g. promo or url)
  const [showFollowup, setShowFollowup] = useState(false);

  const handleNext = (value) => {
    let newAnswers = { ...answers };
    if (showFollowup) {
      newAnswers[current.followup.key] = value;
      setAnswers(newAnswers);
      setShowFollowup(false);
      setInputValue("");
      setStep(step + 1);
      return;
    }
    newAnswers[current.key] = value;

    // Trigger followup if yes and followup exists
    if (current.followup && value === "yes") {
      setAnswers(newAnswers);
      setShowFollowup(true);
      setInputValue("");
      return;
    }

    setAnswers(newAnswers);
    setInputValue("");
    setStep(step + 1);
  };

  // Handle form finish (send to backend or move to next page)
  const handleFinish = () => {
    // TODO: submit answers to backend
    console.log("Collected Answers:", answers);
    // Save to localStorage or context if needed
    // Redirect to campaign setup page or next step
    navigate("/setup", { state: { surveyAnswers: answers } });
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: "linear-gradient(135deg, #2b2e32 0%, #383c40 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: MODERN_FONT,
        position: "relative"
      }}
    >
      <div style={{ position: "fixed", top: 30, right: 36, zIndex: 99 }}>
        <SmartMarkLogoButton />
      </div>

      <div
        style={{
          background: "#34373de6",
          padding: "2.8rem 2.2rem",
          borderRadius: "2.1rem",
          boxShadow: "0 8px 40px 0 rgba(24,84,49,0.12)",
          
          minWidth: 400,
          maxWidth: 440,
          transition: "all 0.7s cubic-bezier(.79,.11,.21,.99)"
        }}

      >
        <h2
          style={{
            color: "#fff",
            fontWeight: 700,
            fontSize: "2.1rem",
            textAlign: "center",
            marginBottom: "1.4rem",
            letterSpacing: "-0.5px",
            fontFamily: MODERN_FONT
          }}
        >
          Quick Campaign Survey
        </h2>
        {/* Question */}
        <div style={{ color: "#fff", fontSize: "1.18rem", marginBottom: "1.6rem", fontWeight: 500, minHeight: 56 }}>
          {showFollowup ? current.followup.question : current.question}
        </div>
        {/* Input */}
        {showFollowup || current.type === "text" ? (
          <input
            type="text"
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            style={{
              padding: "1.1rem",
              borderRadius: "1.2rem",
              border: "none",
              fontSize: "1.15rem",
              outline: "none",
              fontFamily: MODERN_FONT,
              marginBottom: "1.1rem",
              width: "100%"
            }}
            placeholder="Type your answer..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && inputValue.trim() !== "") {
                handleNext(inputValue.trim());
              }
            }}
          />
        ) : current.type === "yesno" ? (
          <div style={{ display: "flex", gap: "2rem", marginBottom: "1.2rem" }}>
            <button
              style={{
                background: DARK_GREEN,
                color: "#fff",
                border: "none",
                borderRadius: "1.1rem",
                padding: "1rem 2.5rem",
                fontWeight: 600,
                fontSize: "1.18rem",
                cursor: "pointer",
                fontFamily: MODERN_FONT,
                boxShadow: "0 2px 18px 0 #15713717",
                opacity: 0.95
              }}
              onClick={() => handleNext("yes")}
            >
              Yes
            </button>
            <button
              style={{
                background: "#fff",
                color: "#232529",
                border: "none",
                borderRadius: "1.1rem",
                padding: "1rem 2.5rem",
                fontWeight: 600,
                fontSize: "1.18rem",
                cursor: "pointer",
                fontFamily: MODERN_FONT,
                boxShadow: "0 2px 18px 0 #15713717",
                opacity: 0.95
              }}
              onClick={() => handleNext("no")}
            >
              No
            </button>
          </div>
        ) : current.type === "multiple" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.3rem", marginBottom: "1.2rem" }}>
            {current.options.map((opt, i) => (
              <button
                key={i}
                style={{
                  background: DARK_GREEN,
                  color: "#fff",
                  border: "none",
                  borderRadius: "1.1rem",
                  padding: "1rem",
                  fontWeight: 600,
                  fontSize: "1.09rem",
                  cursor: "pointer",
                  fontFamily: MODERN_FONT,
                  boxShadow: "0 2px 14px 0 #15713711",
                  opacity: 0.93,
                  textAlign: "left"
                }}
                onClick={() => handleNext(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : null}

        {/* Next/Finish Button */}
        {(showFollowup || current.type === "text") && (
          <button
            disabled={inputValue.trim() === ""}
            style={{
              background: DARK_GREEN,
              color: "#fff",
              border: "none",
              borderRadius: "1.1rem",
              padding: "1rem 2.3rem",
              fontWeight: 700,
              fontSize: "1.12rem",
              cursor: inputValue.trim() === "" ? "not-allowed" : "pointer",
              fontFamily: MODERN_FONT,
              marginTop: 6,
              opacity: inputValue.trim() === "" ? 0.6 : 1
            }}
            onClick={() => handleNext(inputValue.trim())}
          >
            Next
          </button>
        )}
        {/* Finish */}
        {step === QUESTIONS.length && (
          <button
            style={{
              background: DARK_GREEN,
              color: "#fff",
              border: "none",
              borderRadius: "1.1rem",
              padding: "1.1rem 2.8rem",
              fontWeight: 700,
              fontSize: "1.15rem",
              cursor: "pointer",
              fontFamily: MODERN_FONT,
              width: "100%",
              marginTop: "1.2rem"
            }}
            onClick={handleFinish}
          >
            Finish & Continue
          </button>
        )}
        {/* Carousel progress */}
        <div style={{ marginTop: 25, textAlign: "center", color: "#b4b7bb", fontSize: "1.01rem" }}>
          {step < QUESTIONS.length
            ? `Question ${step + 1} of ${QUESTIONS.length}`
            : "Done"}
        </div>
      </div>
    </div>
  );
};

export default FormPage;
