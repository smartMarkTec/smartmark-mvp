import React, { useState } from "react";
import { FaEdit } from "react-icons/fa";

const QUESTIONS = [
  {
    question: "Use your website to generate the ad?",
    key: "useWebsite"
  },
  {
    question: "Is your business local?",
    key: "isLocal"
  },
  {
    question: "Currently running promotions?",
    key: "hasPromo"
  },
  {
    question: "Focus on brand awareness over sales?",
    key: "brandAwareness"
  },
  {
    question: "Offer delivery or online ordering?",
    key: "hasDelivery"
  },
  {
    question: "Emphasize fast service or convenience?",
    key: "fastService"
  },
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
  const [answers, setAnswers] = useState({});

  const handleAnswer = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
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
        <div style={{
          color: "#fff",
          fontWeight: 800,
          fontSize: "2.13rem",
          textAlign: "center",
          marginBottom: 32,
          lineHeight: 1.22,
          letterSpacing: "-.4px"
        }}>
          Campaign Setup Survey
        </div>

        {/* Survey Questions */}
        <div style={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 28,
          marginBottom: 48
        }}>
          {QUESTIONS.map(q => (
            <div key={q.key} style={{ width: "100%" }}>
              <div style={{
                color: "#e4e4e4",
                fontWeight: 700,
                fontSize: "1.21rem",
                marginBottom: 10
              }}>
                {q.question}
              </div>
              <div style={{ display: "flex", gap: 20 }}>
                <button
                  style={{
                    background: answers[q.key] === "yes" ? TEAL : "#23282e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: "1.16rem",
                    padding: "13px 44px",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px #1112",
                    transition: "background 0.15s"
                  }}
                  onClick={() => handleAnswer(q.key, "yes")}
                >Yes</button>
                <button
                  style={{
                    background: answers[q.key] === "no" ? TEAL : "#23282e",
                    color: "#fff",
                    border: "none",
                    borderRadius: 14,
                    fontWeight: 700,
                    fontSize: "1.16rem",
                    padding: "13px 44px",
                    cursor: "pointer",
                    boxShadow: "0 2px 10px #1112",
                    transition: "background 0.15s"
                  }}
                  onClick={() => handleAnswer(q.key, "no")}
                >No</button>
              </div>
            </div>
          ))}
        </div>

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
