import { useNavigate } from "react-router-dom";
import smartemarkLogo from "../assets/smartemark-logo.png";

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
      <div
        role="img"
        aria-label="Smartemark"
        style={{
          width: size,
          height: size,
          borderRadius: 12,
          display: "block",
          backgroundImage: `url(${smartemarkLogo})`,
          backgroundSize: "256%",
          backgroundPosition: "51% 48%",
          backgroundRepeat: "no-repeat",
        }}
      />
    </button>
  );
};

export default SmartMarkLogoButton;
