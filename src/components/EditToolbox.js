import React, { useState } from "react";
import { motion } from "framer-motion";

const fonts = [
  { name: "Inter", value: "Inter, Arial, sans-serif" },
  { name: "Roboto", value: "Roboto, Arial, sans-serif" },
  { name: "Georgia", value: "Georgia, serif" },
  { name: "Oswald", value: "Oswald, Arial, sans-serif" },
  { name: "Lobster", value: "Lobster, cursive" },
];

const MODERN_COLORS = [
  "#5b6cff", "#7b60fb", "#38c6ad", "#ff8767",
  "#232323", "#fff7ef", "#f5f5fa", "#a3bffa",
  "#ffffff", "#000000",
];

const TOOLBOX_WIDTH = 230;
const TOOLBOX_HEIGHT = 245;

const EditToolbox = ({
  visible,
  onAddBox,
  selectedBox,
  boxStyle = {},
  setBoxStyle,
  onDeselect,
  onDeleteBox,
  onDuplicateBox,
  onChangePageBg,
  pageBg,
  onSave,
}) => {
  const [open, setOpen] = useState(true);

  if (!visible) return null;

  if (!open)
    return (
      <motion.button
        drag
        dragMomentum={false}
        dragConstraints={{
          left: 0,
          top: 0,
          right: window.innerWidth - 120,
          bottom: window.innerHeight - 40,
        }}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 9999,
          background: "#5b6cff",
          color: "#fff",
          borderRadius: 8,
          padding: "8px 18px",
          fontWeight: "bold",
          border: "none",
          boxShadow: "0 2px 10px rgba(60,50,110,.08)",
          cursor: "pointer",
        }}
        onClick={() => setOpen(true)}
      >
        Open Editor
      </motion.button>
    );

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={{
        left: 0,
        top: 0,
        right: window.innerWidth - TOOLBOX_WIDTH,
        bottom: window.innerHeight - TOOLBOX_HEIGHT,
      }}
      className="fixed top-8 right-8 z-50 bg-white rounded-2xl shadow-xl p-4 flex flex-col space-y-3"
      style={{
        minWidth: TOOLBOX_WIDTH,
        minHeight: TOOLBOX_HEIGHT,
        border: "2px solid #e5e7ef",
        cursor: "move",
      }}
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-blue-700">Editor</span>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: "#eee",
            color: "#555",
            border: "none",
            borderRadius: 6,
            padding: "0 9px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: 18,
          }}
          title="Close"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2 flex-wrap mb-2">
        <button
          className="px-2 py-1 rounded-xl bg-blue-500 text-white shadow"
          onClick={() => onAddBox("headline")}
        >Headline</button>
        <button
          className="px-2 py-1 rounded-xl bg-purple-400 text-white shadow"
          onClick={() => onAddBox("subtitle")}
        >Subtitle</button>
        <button
          className="px-2 py-1 rounded-xl bg-emerald-400 text-white shadow"
          onClick={() => onAddBox("text")}
        >Text</button>
        <button
          className="px-2 py-1 rounded-xl bg-orange-400 text-white shadow"
          onClick={() => onAddBox("button")}
        >Button</button>
        <button
          className="px-2 py-1 rounded-xl bg-pink-400 text-white shadow"
          onClick={() => onAddBox("text_colored")}
        >Colored Box</button>
      </div>
      {selectedBox && (
        <div>
          <div className="flex gap-2 mb-2">
            <button
              className="px-2 py-1 bg-red-50 text-red-700 rounded-lg hover:bg-red-200"
              onClick={onDeleteBox}
              title="Delete Box"
            >🗑️</button>
            <button
              className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-200"
              onClick={onDuplicateBox}
              title="Duplicate Box"
            >⧉</button>
          </div>
          <div className="mb-1">
            <label className="block text-xs font-semibold">Font</label>
            <select
              className="w-full p-1 rounded border"
              value={boxStyle.fontFamily}
              onChange={e => setBoxStyle("fontFamily", e.target.value)}
            >
              {fonts.map(f => (
                <option key={f.value} value={f.value}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="mb-1">
            <label className="block text-xs font-semibold">Font Size</label>
            <input
              type="text"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={3}
              placeholder="Font Size"
              value={boxStyle.fontSize || ""}
              className="w-full p-1 rounded border"
              onChange={e => {
                const v = e.target.value.replace(/[^0-9]/g, "");
                setBoxStyle("fontSize", v ? parseInt(v) : "");
              }}
            />
          </div>
          <div className="mb-1">
            <label className="block text-xs font-semibold">Font Color</label>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {MODERN_COLORS.map((color) => (
                <span
                  key={color}
                  className="w-5 h-5 rounded-full border cursor-pointer"
                  style={{ background: color, borderColor: "#ccc" }}
                  onClick={() => setBoxStyle("color", color)}
                />
              ))}
              <input
                type="color"
                value={boxStyle.color || "#232323"}
                onChange={e => setBoxStyle("color", e.target.value)}
                className="ml-2 w-6 h-6 p-0 border-0"
                style={{ background: "none" }}
              />
            </div>
          </div>
          {/* Background for all boxes that should support it */}
          {(selectedBox.type === "button" ||
            selectedBox.type === "text_colored" ||
            selectedBox.type === "text") && (
            <div className="mb-1">
              <label className="block text-xs font-semibold">Background</label>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {MODERN_COLORS.map((color) => (
                  <span
                    key={color}
                    className="w-5 h-5 rounded-full border cursor-pointer"
                    style={{ background: color, borderColor: "#ccc" }}
                    onClick={() => setBoxStyle("background", color)}
                  />
                ))}
                <input
                  type="color"
                  value={
                    boxStyle.background && boxStyle.background !== "transparent"
                      ? boxStyle.background
                      : "#ffffff"
                  }
                  onChange={e => setBoxStyle("background", e.target.value)}
                  className="ml-2 w-6 h-6 p-0 border-0"
                  style={{ background: "none" }}
                />
              </div>
            </div>
          )}
        </div>
      )}
      {/* Page background color */}
      <div>
        <label className="block text-xs font-semibold">Page BG</label>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {MODERN_COLORS.map((color) => (
            <span
              key={color}
              className="w-5 h-5 rounded-full border cursor-pointer"
              style={{ background: color, borderColor: "#ccc" }}
              onClick={() => onChangePageBg(color)}
            />
          ))}
          <input
            type="color"
            value={pageBg}
            onChange={e => onChangePageBg(e.target.value)}
            className="ml-2 w-6 h-6 p-0 border-0"
            style={{ background: "none" }}
          />
        </div>
      </div>
      <div className="flex mt-3 gap-2">
        <button
          className="px-2 py-1 bg-blue-600 text-white rounded-xl hover:bg-blue-400 flex-1"
          onClick={onSave}
        >Save</button>
        <button
          className="px-2 py-1 bg-gray-300 rounded-xl hover:bg-red-400 flex-1"
          onClick={onDeselect}
        >Deselect</button>
      </div>
    </motion.div>
  );
};

export default EditToolbox;
