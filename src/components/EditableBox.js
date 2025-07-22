import React, { useState } from "react";
import { Rnd } from "react-rnd";

const EditableBox = ({
  defaultText,
  type = "text",
  defaultWidth = 300,
  defaultHeight = 60,
  isButton = false,
  to = "",
  style = {},
  onClick = () => {},
  selected = false,
  setSelectedBox = () => {},
  updateBox = () => {},
}) => {
  const [text, setText] = useState(defaultText);
  const [editing, setEditing] = useState(false);

  // Use parent style as the source of truth for position/size.
  const boxStyle = style || {};

  React.useEffect(() => {
    updateBox && updateBox({ text, style: boxStyle });
    // eslint-disable-next-line
  }, [text, boxStyle]);

  const handleBoxClick = (e) => {
    e.stopPropagation();
    setSelectedBox();
    onClick();
  };

  // Show as "box" if colored, button, or background is set and not transparent
  const isBoxStyle =
    type === "button" ||
    type === "text_colored" ||
    (boxStyle.background && boxStyle.background !== "transparent" && boxStyle.background !== "");

  return (
    <Rnd
      position={{
        x: boxStyle.x ?? 60,
        y: boxStyle.y ?? 60,
      }}
      size={{
        width: boxStyle.width || defaultWidth,
        height: boxStyle.height || defaultHeight,
      }}
      bounds="parent"
      enableResizing={true}
      onClick={handleBoxClick}
      onResizeStop={(e, direction, ref, delta, position) => {
        const newStyle = {
          ...boxStyle,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          x: position.x,
          y: position.y,
        };
        updateBox({ text, style: newStyle });
      }}
      onDragStop={(e, d) => {
        const newStyle = { ...boxStyle, x: d.x, y: d.y };
        updateBox({ text, style: newStyle });
      }}
      style={{
        outline: selected ? "2px solid #2563eb" : "none",
        cursor: "move",
        padding: 0,
        zIndex: selected ? 2 : 1,
        background: "none",
      }}
    >
      {editing ? (
        <textarea
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            outline: "none",
            background: isBoxStyle ? boxStyle.background : "transparent",
            color: boxStyle.color,
            fontFamily: boxStyle.fontFamily,
            fontSize: boxStyle.fontSize,
            fontWeight: boxStyle.fontWeight,
            fontStyle: boxStyle.fontStyle,
            resize: "none",
            borderRadius: boxStyle.borderRadius || 0,
            boxShadow: boxStyle.boxShadow || "none",
            textAlign: boxStyle.textAlign || "left",
            padding: isBoxStyle ? "8px 16px" : 0,
          }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => setEditing(false)}
          autoFocus
        />
      ) : isBoxStyle ? (
        <span
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              type === "button"
                ? "#232323"
                : boxStyle.background || "#ff8767",
            color: boxStyle.color,
            fontFamily: boxStyle.fontFamily,
            fontSize: boxStyle.fontSize,
            fontWeight: boxStyle.fontWeight,
            fontStyle: boxStyle.fontStyle,
            borderRadius: boxStyle.borderRadius || 20,
            border: boxStyle.border || "none",
            boxShadow: boxStyle.boxShadow || "0 2px 10px rgba(60,50,110,.07)",
            userSelect: "none",
            cursor: isButton ? "pointer" : "default",
            padding: "8px 18px",
            transition: "all .12s",
            outline: selected ? "2px solid #2563eb" : "none",
            textAlign: boxStyle.textAlign || "center",
          }}
          onClick={handleBoxClick}
          onDoubleClick={() => setEditing(true)}
        >
          {text}
        </span>
      ) : (
        <span
          style={{
            color: boxStyle.color,
            fontFamily: boxStyle.fontFamily,
            fontSize: boxStyle.fontSize,
            fontWeight: boxStyle.fontWeight,
            fontStyle: boxStyle.fontStyle,
            background: "transparent",
            border: "none",
            outline: "none",
            width: "100%",
            height: "100%",
            display: "inline-block",
            textAlign: boxStyle.textAlign || "left",
            userSelect: "none",
            cursor: "text",
          }}
          onClick={handleBoxClick}
          onDoubleClick={() => setEditing(true)}
        >
          {text}
        </span>
      )}
    </Rnd>
  );
};

export default EditableBox;
