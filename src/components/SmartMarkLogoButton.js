import React from "react";
import { useNavigate } from "react-router-dom";

const SmartMarkLogoButton = ({
  style = {},
  size = 44,
  top = 22,
  left = 24,
}) => {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/")}
      style={{
        position: "fixed",
        top,
        left,
        background: "transparent",
        border: "none",
        cursor: "pointer",
        zIndex: 50,
        padding: 0,
        margin: 0,
        outline: "none",
        ...style,
      }}
      aria-label="Go to home"
    >
      {/* S-shaped Figma-style logo (SVG) */}
      <svg width={size} height={size} viewBox="0 0 44 44">
        {/* Top circle */}
        <circle cx="22" cy="11" r="6.7" fill="#6EE7B7" />
        {/* Upper right */}
        <ellipse cx="31" cy="17.5" rx="6" ry="6.2" fill="#60A5FA" />
        {/* Center */}
        <ellipse cx="22" cy="22.5" rx="6.2" ry="6.2" fill="#FDE68A" />
        {/* Lower left */}
        <ellipse cx="13" cy="29" rx="6" ry="6.2" fill="#F87171" />
        {/* Bottom circle */}
        <ellipse cx="22" cy="33.5" rx="6.7" ry="6.2" fill="#34D399" />
        {/* S outline (optional for more S-shape) */}
        <text x="22" y="27" textAnchor="middle" fontFamily="'Times New Roman', Times, serif" fontSize="15" fontWeight="bold" fill="#232629" opacity="0.11" style={{ pointerEvents: "none" }}>S</text>
      </svg>
    </button>
  );
};

export default SmartMarkLogoButton;
