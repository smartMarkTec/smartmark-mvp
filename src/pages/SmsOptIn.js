import { useEffect } from "react";

const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PURPLE = "#5d59ea";
const TEXT = "#101426";
const TEXT_SOFT = "#626b86";
const BORDER = "rgba(93,89,234,0.10)";

function SiteFooter() {
  return (
    <footer
      style={{
        borderTop: `1px solid ${BORDER}`,
        padding: "32px 24px",
        textAlign: "center",
        fontSize: 12,
        color: "#94a3b8",
        fontFamily: FONT,
        lineHeight: 2.2,
      }}
    >
      <div style={{ fontWeight: 600, color: TEXT_SOFT, marginBottom: 2 }}>Smartemark</div>
      <div>Spring, TX</div>
      <div>
        <a href="tel:+18324386456" style={{ color: "#94a3b8", textDecoration: "none" }}>
          (832) 438-6456
        </a>
      </div>
      <div>
        <a href="mailto:support@smartemark.com" style={{ color: "#94a3b8", textDecoration: "none" }}>
          support@smartemark.com
        </a>
      </div>
      <div style={{ marginTop: 8 }}>
        <a href="/privacy-policy" style={{ color: "#94a3b8", textDecoration: "none" }}>
          Privacy Policy
        </a>
        {" · "}
        <a href="/terms-of-service" style={{ color: "#94a3b8", textDecoration: "none" }}>
          Terms of Service
        </a>
      </div>
    </footer>
  );
}

export default function SmsOptIn() {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://widgets.leadconnectorhq.com/loader.js";
    script.setAttribute(
      "data-resources-url",
      "https://widgets.leadconnectorhq.com/chat-widget/loader.js"
    );
    script.setAttribute("data-widget-id", "6a458bda52b633f86120967e");
    script.setAttribute("data-source", "WEB_USER");
    script.async = true;
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#ffffff", fontFamily: FONT, color: TEXT }}>
      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${BORDER}`,
          padding: "0 32px",
          height: 60,
          display: "flex",
          alignItems: "center",
        }}
      >
        <a
          href="/"
          style={{
            fontSize: 19,
            fontWeight: 700,
            color: TEXT,
            textDecoration: "none",
            letterSpacing: -0.5,
          }}
        >
          Smartemark
        </a>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "52px 24px 100px" }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: TEXT,
            letterSpacing: "-0.04em",
            marginBottom: 16,
          }}
        >
          Chat with Smartemark
        </h1>

        <p style={{ fontSize: 16, lineHeight: 1.85, color: "#374151", marginBottom: 32 }}>
          Use the chat widget on this page to ask a question, request support, schedule a demo, or
          get help with Smartemark's marketing and lead response services.
        </p>

        {/* Messages section */}
        <div
          style={{
            background: "#f8fafc",
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: "28px 28px 24px",
            marginBottom: 36,
          }}
        >
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: TEXT,
              margin: "0 0 14px",
              letterSpacing: "-0.02em",
            }}
          >
            Messages from Smartemark may include:
          </h2>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              fontSize: 15,
              lineHeight: 2,
              color: "#374151",
            }}
          >
            <li>Replies to your inquiry</li>
            <li>Demo or appointment coordination</li>
            <li>Customer support messages</li>
            <li>Missed-call or follow-up messages</li>
            <li>Service-related account updates</li>
          </ul>
        </div>

        {/* SMS consent */}
        <div
          style={{
            border: `1.5px solid ${PURPLE}22`,
            borderRadius: 14,
            padding: "24px 28px",
            background: `${PURPLE}06`,
            marginBottom: 36,
          }}
        >
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: PURPLE,
              margin: "0 0 10px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            SMS Consent
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.85, color: "#374151", margin: 0 }}>
            By starting a chat, you agree to receive text messages from Smartemark related to your
            inquiry, demo request, support request, or account communication. Message and data rates
            may apply. Message frequency may vary. Reply <strong>STOP</strong> to unsubscribe.
            Reply <strong>HELP</strong> for help.
          </p>
        </div>

        {/* Legal links */}
        <p style={{ fontSize: 13, color: TEXT_SOFT, lineHeight: 2 }}>
          By using this page you also agree to our{" "}
          <a href="/privacy-policy" style={{ color: PURPLE, textDecoration: "none", fontWeight: 600 }}>
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms-of-service" style={{ color: PURPLE, textDecoration: "none", fontWeight: 600 }}>
            Terms of Service
          </a>
          .
        </p>
      </div>

      <SiteFooter />
    </div>
  );
}
