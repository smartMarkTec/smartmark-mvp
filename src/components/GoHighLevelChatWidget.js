import { useEffect } from "react";

// ─── GoHighLevel Chat Widget ──────────────────────────────────────────────────
// Default: DISABLED. Widget is inactive and no external script is loaded.
//
// To enable:
//   Option A — set the constant below to true and redeploy
//   Option B — set env variable REACT_APP_ENABLE_GHL_CHAT_WIDGET=true
//
const ENABLE_GHL_CHAT_WIDGET = false;

const GHL_WIDGET_SRC = "https://widgets.leadconnectorhq.com/loader.js";
const GHL_RESOURCES_URL = "https://widgets.leadconnectorhq.com/chat-widget/loader.js";
const GHL_WIDGET_ID = "6a108784fbf00cbb1c385175";

export default function GoHighLevelChatWidget() {
  const enabled =
    ENABLE_GHL_CHAT_WIDGET ||
    process.env.REACT_APP_ENABLE_GHL_CHAT_WIDGET === "true";

  useEffect(() => {
    if (!enabled) return;
    if (document.querySelector(`script[data-widget-id="${GHL_WIDGET_ID}"]`)) return;

    const script = document.createElement("script");
    script.src = GHL_WIDGET_SRC;
    script.setAttribute("data-resources-url", GHL_RESOURCES_URL);
    script.setAttribute("data-widget-id", GHL_WIDGET_ID);
    script.setAttribute("data-source", "WEB_USER");
    script.async = true;
    document.body.appendChild(script);

    return () => {
      const el = document.querySelector(`script[data-widget-id="${GHL_WIDGET_ID}"]`);
      if (el) el.remove();
    };
  }, [enabled]);

  return null;
}
