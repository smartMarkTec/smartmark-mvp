import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";
import { FaEdit, FaCheckCircle } from "react-icons/fa";

const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const DARK_GREEN = "#185431";
const FADE = "0 8px 40px 0 rgba(24,84,49,0.12)";

// Sample ad content (to be replaced by AI results)
const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=facearea&w=600&q=80";
const DEFAULT_VIDEO =
  "https://www.w3schools.com/html/mov_bbb.mp4";
const DEFAULT_COPY =
  "Discover why locals love us! Visit our website to get exclusive deals, fast service, and a friendly welcome.";

const QUESTIONS = [
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

const AdPreview = ({
  type,
  selected,
  onSelect,
  onEdit,
  adCopy,
  src,
  editing,
  onCopyChange,
  onCloseEdit
}) => (
  <div
    className={`group relative rounded-2xl shadow-lg transition-all duration-300 cursor-pointer ${
      selected ? "ring-4 ring-green-400 scale-105" : "hover:scale-105"
    }`}
    style={{
      border: selected ? "2px solid #18b158" : "2px solid transparent",
      background: "#212425",
      minWidth: 330,
      maxWidth: 360,
      minHeight: 410,
      flex: 1,
      margin: "0 0.7rem",
      display: "flex",
      flexDirection: "column",
      position: "relative",
      boxShadow: FADE,
      transition: "box-shadow 0.3s, transform 0.3s"
    }}
    onClick={onSelect}
    onMouseEnter={e => e.currentTarget.classList.add("animate-wiggle")}
    onMouseLeave={e => e.currentTarget.classList.remove("animate-wiggle")}
  >
    {/* Edit Button */}
    <button
      onClick={e => {
        e.stopPropagation();
        onEdit();
      }}
      style={{
        position: "absolute",
        top: 18,
        right: 18,
        background: "#fff",
        color: "#1a9e5e",
        borderRadius: "999px",
        border: "none",
        boxShadow: "0 1px 4px #1a9e5e19",
        fontWeight: 700,
        fontSize: 17,
        padding: 8,
        zIndex: 2,
        cursor: "pointer",
        opacity: 0.85
      }}
      title="Edit Ad"
    >
      <FaEdit />
    </button>

    {/* Ad Content */}
    <div style={{ flex: 1, paddingTop: type === "image" ? 18 : 8 }}>
      {type === "image" ? (
        <img
          src={src}
          alt="Generated ad"
          style={{
            width: "100%",
            height: 210,
            borderRadius: 20,
            objectFit: "cover",
            marginBottom: 10
          }}
        />
      ) : (
        <video
          src={src}
          controls
          loop
          muted
          style={{
            width: "100%",
            height: 210,
            borderRadius: 20,
            objectFit: "cover",
            marginBottom: 10,
            background: "#232829"
          }}
        />
      )}
      {/* Ad Copy */}
      {editing ? (
        <div style={{ padding: "1rem" }}>
          <textarea
            value={adCopy}
            onChange={e => onCopyChange(e.target.value)}
            style={{
              width: "100%",
              minHeight: 78,
              borderRadius: 10,
              border: "1.5px solid #11b179",
              fontSize: "1.12rem",
              padding: 8,
              marginBottom: 7
            }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={e => {
                e.stopPropagation();
                onCloseEdit();
              }}
              style={{
                background: "#17a658",
                color: "#fff",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "7px 22px",
                cursor: "pointer"
              }}
            >
              Save
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                onCopyChange(DEFAULT_COPY);
                onCloseEdit();
              }}
              style={{
                background: "#eaeaea",
                color: "#123",
                borderRadius: 10,
                border: "none",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "7px 22px",
                cursor: "pointer"
              }}
            >
              Reset
            </button>
          </div>
        </div>
      ) : (
        <div style={{ padding: "1rem", fontSize: "1.1rem", color: "#e0e0e0" }}>
          {adCopy}
        </div>
      )}
    </div>
    {/* Select Checkmark */}
    {selected && (
      <FaCheckCircle
        style={{
          position: "absolute",
          bottom: 16,
          right: 18,
          color: "#22d37a",
          fontSize: 28,
          background: "#fff",
          borderRadius: "50%",
          boxShadow: "0 0 6px #13d37b55"
        }}
      />
    )}
  </div>
);

const FormPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [showFollowup, setShowFollowup] = useState(false);

  // Ad preview logic
  const [showAds, setShowAds] = useState(false);
  const [selected, setSelected] = useState({ image: false, video: false });
  const [editMode, setEditMode] = useState({ image: false, video: false });
  const [copy, setCopy] = useState({ image: DEFAULT_COPY, video: DEFAULT_COPY });

  const current = step < QUESTIONS.length ? QUESTIONS[step] : null;

  // Survey Next
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

  // Handle finish survey → show ad previews
  const handleGenerate = () => {
    setShowAds(true);
    // TODO: Replace with AI-generated content
  };

  // Handle Finalize
  const handleFinalize = () => {
    // TODO: Send choices + creative to backend
    alert(
      `Campaign finalized!\nSelected: ${
        selected.image && selected.video
          ? "Both"
          : selected.image
          ? "Image"
          : "Video"
      }`
    );
    // Navigate or reset
    navigate("/dashboard");
  };

  // Layout config
  const mainWidth = showAds ? 820 : 660;
  const previewWidth = 740;

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: "linear-gradient(135deg, #232425 0%, #363a3d 100%)",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        fontFamily: MODERN_FONT,
        position: "relative",
        padding: "3rem 0"
      }}
    >
      <div style={{ position: "fixed", top: 30, right: 36, zIndex: 99 }}>
        <SmartMarkLogoButton />
      </div>
      <div
        style={{
          background: "#34373de6",
          padding: "2.7rem 2.5rem 3.2rem 2.5rem",
          borderRadius: "2.2rem",
          boxShadow: FADE,
          minWidth: mainWidth,
          maxWidth: mainWidth + 16,
          width: "100%",
          margin: "0 auto",
          transition: "all 0.4s cubic-bezier(.79,.11,.21,.99)",
        }}
      >
        {/* Survey */}
        {!showAds && (
          <>
            <h2
              style={{
                color: "#fff",
                fontWeight: 700,
                fontSize: "2.2rem",
                textAlign: "center",
                marginBottom: "1.4rem",
                letterSpacing: "-0.5px",
                fontFamily: MODERN_FONT
              }}
            >
              Quick Campaign Survey
            </h2>
            {step < QUESTIONS.length && (
              <>
                <div style={{ color: "#fff", fontSize: "1.24rem", marginBottom: "1.6rem", fontWeight: 500, minHeight: 56 }}>
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
                      fontSize: "1.17rem",
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
                        padding: "1.05rem 2.7rem",
                        fontWeight: 600,
                        fontSize: "1.21rem",
                        cursor: "pointer",
                        fontFamily: MODERN_FONT,
                        boxShadow: "0 2px 18px 0 #15713717",
                        opacity: 0.96
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
                        padding: "1.05rem 2.7rem",
                        fontWeight: 600,
                        fontSize: "1.21rem",
                        cursor: "pointer",
                        fontFamily: MODERN_FONT,
                        boxShadow: "0 2px 18px 0 #15713717",
                        opacity: 0.96
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
                          padding: "1.04rem",
                          fontWeight: 600,
                          fontSize: "1.12rem",
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

                {/* Next/Finish Button (for free text/followup) */}
                {(showFollowup || current.type === "text") && (
                  <button
                    disabled={inputValue.trim() === ""}
                    style={{
                      background: DARK_GREEN,
                      color: "#fff",
                      border: "none",
                      borderRadius: "1.1rem",
                      padding: "1.09rem 2.7rem",
                      fontWeight: 700,
                      fontSize: "1.15rem",
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
              </>
            )}

            {/* Generate Campaign Button: Only after last Q */}
            {step >= QUESTIONS.length && (
              <button
                style={{
                  background: DARK_GREEN,
                  color: "#fff",
                  border: "none",
                  borderRadius: "1.3rem",
                  padding: "1.25rem 2.9rem",
                  fontWeight: 700,
                  fontSize: "1.23rem",
                  cursor: "pointer",
                  fontFamily: MODERN_FONT,
                  width: "100%",
                  marginTop: "2.0rem",
                  marginBottom: "0.7rem"
                }}
                onClick={handleGenerate}
              >
                Generate Campaign
              </button>
            )}
            {/* Progress */}
            {step < QUESTIONS.length && (
              <div style={{ marginTop: 27, textAlign: "center", color: "#b4b7bb", fontSize: "1.07rem" }}>
                {`Question ${step + 1} of ${QUESTIONS.length}`}
              </div>
            )}
          </>
        )}

        {/* Ad Previews */}
        {showAds && (
          <div style={{
            marginTop: "1.4rem",
            width: previewWidth,
            maxWidth: "100%",
            marginLeft: "auto",
            marginRight: "auto"
          }}>
            <h2 style={{
              color: "#fff",
              fontWeight: 700,
              fontSize: "2.07rem",
              textAlign: "center",
              margin: "1.0rem 0 1.2rem 0",
              letterSpacing: "-0.5px"
            }}>
              Ad Previews
            </h2>
            <div style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "stretch",
              gap: "0",
              width: "100%",
              minHeight: 420,
              margin: "0 auto",
              background: "transparent"
            }}>
              {/* Image Ad */}
              <AdPreview
                type="image"
                selected={selected.image}
                onSelect={() =>
                  setSelected(sel => ({
                    ...sel,
                    image: !sel.image
                  }))
                }
                onEdit={() => setEditMode(em => ({ ...em, image: true }))}
                adCopy={copy.image}
                src={DEFAULT_IMAGE}
                editing={editMode.image}
                onCopyChange={v => setCopy(c => ({ ...c, image: v }))}
                onCloseEdit={() => setEditMode(em => ({ ...em, image: false }))}
              />
              {/* Divider */}
              <div style={{
                width: 2,
                background: "linear-gradient(180deg, #0ee196 0%, #9effe2 100%)",
                margin: "0 16px",
                borderRadius: 12,
                alignSelf: "center"
              }} />
              {/* Video Ad */}
              <AdPreview
                type="video"
                selected={selected.video}
                onSelect={() =>
                  setSelected(sel => ({
                    ...sel,
                    video: !sel.video
                  }))
                }
                onEdit={() => setEditMode(em => ({ ...em, video: true }))}
                adCopy={copy.video}
                src={DEFAULT_VIDEO}
                editing={editMode.video}
                onCopyChange={v => setCopy(c => ({ ...c, video: v }))}
                onCloseEdit={() => setEditMode(em => ({ ...em, video: false }))}
              />
            </div>
            <div style={{
              textAlign: "center",
              color: "#b6ffc3",
              margin: "1.2rem 0 1.3rem 0",
              fontWeight: 500,
              fontSize: "1.09rem"
            }}>
              {!(selected.image || selected.video)
                ? "Pick at least one to continue"
                : `You selected: ${
                    selected.image && selected.video
                      ? "Both"
                      : selected.image
                      ? "Image"
                      : "Video"
                  }`}
            </div>
            <button
              disabled={!(selected.image || selected.video)}
              style={{
                background: DARK_GREEN,
                color: "#fff",
                border: "none",
                borderRadius: "1.3rem",
                padding: "1.15rem 2.7rem",
                fontWeight: 700,
                fontSize: "1.19rem",
                cursor: !(selected.image || selected.video)
                  ? "not-allowed"
                  : "pointer",
                fontFamily: MODERN_FONT,
                width: "100%",
                opacity: !(selected.image || selected.video) ? 0.5 : 1,
                marginTop: "0.5rem"
              }}
              onClick={handleFinalize}
            >
              Finalize Campaign
            </button>
          </div>
        )}
      </div>
      {/* Ad preview hover animation */}
      <style>{`
        .animate-wiggle {
          animation: wiggle 0.33s linear 1;
        }
        @keyframes wiggle {
          0% { transform: scale(1) rotate(-2deg); }
          25% { transform: scale(1.02) rotate(2deg);}
          50% { transform: scale(1.06) rotate(-2deg);}
          75% { transform: scale(1.02) rotate(2deg);}
          100% { transform: scale(1) rotate(0);}
        }
      `}</style>
    </div>
  );
};

export default FormPage;
