const FONT = "'Inter', 'Poppins', 'Segoe UI', Arial, sans-serif";
const PURPLE = "#5d59ea";
const TEXT = "#101426";
const TEXT_SOFT = "#626b86";
const BORDER = "rgba(93,89,234,0.10)";

function PolicySection({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: TEXT,
          margin: "0 0 10px",
          letterSpacing: "-0.02em",
        }}
      >
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.85, color: "#374151" }}>{children}</div>
    </div>
  );
}

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

export default function PrivacyPolicy() {
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
          style={{ fontSize: 19, fontWeight: 700, color: TEXT, textDecoration: "none", letterSpacing: -0.5 }}
        >
          Smartemark
        </a>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "52px 24px 80px" }}>
        <h1
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: TEXT,
            letterSpacing: "-0.04em",
            marginBottom: 8,
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ fontSize: 13, color: TEXT_SOFT, marginBottom: 40 }}>Last Updated: May 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.85, color: "#374151", marginBottom: 32 }}>
          Smartemark respects your privacy. This Privacy Policy explains how we collect, use, and
          protect information when you visit our website, use our platform, communicate with us, or
          receive messages from us.
        </p>

        <PolicySection title="1. Information We Collect">
          <p>
            We may collect information you provide directly, including your name, business name,
            email address, phone number, website URL, business details, campaign preferences, and
            payment or account information when applicable.
          </p>
          <p style={{ marginTop: 12 }}>
            We may also collect technical information such as your IP address, browser type, device
            information, pages visited, and usage activity on our website or platform.
          </p>
        </PolicySection>

        <PolicySection title="2. How We Use Information">
          <p>
            We use information to provide and improve Smartemark services, create and manage
            advertising campaigns, communicate with customers and prospects, send appointment
            reminders, send requested information, provide customer support, process account
            activity, and improve our website and platform.
          </p>
        </PolicySection>

        <PolicySection title="3. SMS and Messaging">
          <p>
            If you provide your phone number or agree to receive messages from Smartemark, we may
            send you text messages related to your inquiry, demo request, support request,
            appointment coordination, missed-call follow-up, and account communication. Message
            types may include appointment reminders, follow-up messages, service updates, customer
            support messages, and informational messages related to Smartemark.
          </p>
          <p style={{ marginTop: 12 }}>
            Message frequency may vary. Message and data rates may apply. You can opt out of SMS
            messages at any time by replying <strong>STOP</strong>. You may reply{" "}
            <strong>HELP</strong> for help.
          </p>
          <p style={{ marginTop: 12 }}>
            Smartemark does not sell, rent, or share your mobile phone number or SMS consent with
            third parties or affiliates for marketing or promotional purposes. Mobile information
            and SMS consent are used only to communicate with you about your inquiry, demo request,
            support request, customer service, account communication, and related business
            communications.
          </p>
        </PolicySection>

        <PolicySection title="4. Sharing of Information">
          <p>
            We do not sell personal information. We may share information with trusted service
            providers who help us operate our website, platform, payment processing,
            communications, analytics, advertising integrations, or customer support.
          </p>
          <p style={{ marginTop: 12 }}>
            We may also disclose information if required by law or to protect the rights, safety,
            and security of Smartemark, our users, or others.
          </p>
        </PolicySection>

        <PolicySection title="5. Cookies and Tracking">
          <p>
            Our website may use cookies, analytics tools, pixels, or similar technologies to
            understand website activity, improve the user experience, and support advertising or
            marketing efforts. You may be able to adjust cookie preferences through your browser
            settings.
          </p>
        </PolicySection>

        <PolicySection title="6. Data Security">
          <p>
            We take reasonable measures to protect the information we collect. However, no method
            of transmission or storage is completely secure, and we cannot guarantee absolute
            security.
          </p>
        </PolicySection>

        <PolicySection title="7. Third-Party Platforms">
          <p>
            Smartemark may connect with third-party platforms such as Facebook, Instagram, payment
            processors, analytics tools, or communication providers. Your use of those services may
            also be governed by their own privacy policies and terms.
          </p>
        </PolicySection>

        <PolicySection title="8. Your Choices">
          <p>
            You may contact us to request updates, corrections, or deletion of your information
            where applicable. You may also opt out of SMS messages by replying STOP.
          </p>
        </PolicySection>

        <PolicySection title="9. Contact Us">
          <p>If you have questions about this Privacy Policy, contact us at:</p>
          <div
            style={{
              marginTop: 14,
              padding: "18px 20px",
              background: "#f8fafc",
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              fontSize: 14,
              lineHeight: 2,
            }}
          >
            <strong>Smartemark</strong>
            <br />
            Spring, TX
            <br />
            Phone:{" "}
            <a href="tel:+18324386456" style={{ color: PURPLE, textDecoration: "none" }}>
              (832) 438-6456
            </a>
            <br />
            Email:{" "}
            <a href="mailto:support@smartemark.com" style={{ color: PURPLE, textDecoration: "none" }}>
              support@smartemark.com
            </a>
          </div>
        </PolicySection>
      </div>

      <SiteFooter />
    </div>
  );
}
