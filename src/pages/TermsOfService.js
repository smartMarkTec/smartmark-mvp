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
        <a href="https://smartemark.com/privacy-policy" style={{ color: "#94a3b8", textDecoration: "none" }}>
          Privacy Policy
        </a>
        {" · "}
        <a href="https://smartemark.com/terms-of-service" style={{ color: "#94a3b8", textDecoration: "none" }}>
          Terms of Service
        </a>
      </div>
    </footer>
  );
}

export default function TermsOfService() {
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
          Terms of Service
        </h1>
        <p style={{ fontSize: 13, color: TEXT_SOFT, marginBottom: 40 }}>Last Updated: May 2026</p>

        <p style={{ fontSize: 15, lineHeight: 1.85, color: "#374151", marginBottom: 32 }}>
          These Terms of Service govern your use of the Smartemark website, platform, software,
          communications, and related services. By using Smartemark, you agree to these terms.
        </p>

        <PolicySection title="1. Overview">
          <p>
            Smartemark provides AI-powered marketing software designed to help local businesses
            create advertising content, launch campaigns, and monitor campaign performance.
            Smartemark is a software platform and does not guarantee specific business results,
            revenue, leads, sales, or advertising outcomes.
          </p>
        </PolicySection>

        <PolicySection title="2. Accounts">
          <p>
            To use certain Smartemark features, you may need to create an account and provide
            accurate business, contact, and payment information. You are responsible for
            maintaining the security of your account and for all activity under your account.
          </p>
        </PolicySection>

        <PolicySection title="3. Advertising Campaigns">
          <p>
            Smartemark may help generate ad creatives, copy, headlines, campaign suggestions, and
            campaign management recommendations or actions. You are responsible for reviewing
            campaign materials, business information, offers, budgets, and advertising settings
            before launch.
          </p>
          <p style={{ marginTop: 12 }}>
            Advertising performance depends on many factors, including market demand, ad budget,
            offer quality, location, competition, customer behavior, platform performance, and
            campaign data.
          </p>
        </PolicySection>

        <PolicySection title="4. Facebook and Instagram Ad Spend">
          <p>
            Smartemark's software fee is separate from any advertising spend paid to Meta,
            Facebook, Instagram, or other advertising platforms. You control your advertising
            budget. Smartemark does not take a percentage of your ad spend unless separately
            agreed in writing.
          </p>
        </PolicySection>

        <PolicySection title="5. Payments and Subscription">
          <p>
            Smartemark may offer monthly subscription plans. Subscription fees are billed
            according to the plan selected. Plans are month-to-month unless otherwise stated.
          </p>
          <p style={{ marginTop: 12 }}>
            You may cancel your subscription at any time. Cancellation stops future billing but
            does not automatically refund previous payments unless required by law or separately
            agreed.
          </p>
        </PolicySection>

        <PolicySection title="6. No Guarantee of Results">
          <p>
            Smartemark does not guarantee a specific number of leads, calls, clicks, customers,
            sales, revenue, or return on ad spend. Any examples, estimates, or performance
            references are for illustration only and are not guarantees.
          </p>
        </PolicySection>

        <PolicySection title="7. User Responsibilities">
          <p>
            You agree to provide truthful business information, comply with advertising platform
            policies, follow applicable laws, avoid misleading claims, and ensure that any offers,
            promotions, or business statements used in campaigns are accurate.
          </p>
        </PolicySection>

        <PolicySection title="8. Third-Party Services">
          <p>
            Smartemark may integrate with or rely on third-party services such as Meta, Facebook,
            Instagram, payment processors, hosting providers, analytics tools, or communication
            services. Smartemark is not responsible for outages, policy changes, account issues,
            or performance problems caused by third-party platforms.
          </p>
        </PolicySection>

        <PolicySection title="9. SMS and Communications">
          <p>
            By providing your phone number or agreeing to receive messages from Smartemark, you
            consent to receive text messages related to your inquiry, demo request, support
            request, appointment coordination, missed-call follow-up, and account communication.
            Message types may include appointment reminders, service updates, customer support
            messages, follow-ups, and informational messages from Smartemark.
          </p>
          <p style={{ marginTop: 12 }}>
            Message frequency may vary. Message and data rates may apply. You can opt out of SMS
            messages at any time by replying <strong>STOP</strong>. Reply <strong>HELP</strong>{" "}
            for help.
          </p>
          <p style={{ marginTop: 12 }}>
            Smartemark does not sell, rent, or share your mobile phone number or SMS consent with
            third parties or affiliates for marketing or promotional purposes.
          </p>
        </PolicySection>

        <PolicySection title="10. Intellectual Property">
          <p>
            Smartemark, its website, software, branding, designs, workflows, content, and
            technology are owned by Smartemark or its licensors. You may not copy, modify, reverse
            engineer, resell, or misuse the platform without permission.
          </p>
        </PolicySection>

        <PolicySection title="11. Limitation of Liability">
          <p>
            To the maximum extent permitted by law, Smartemark is not liable for indirect,
            incidental, consequential, special, or lost-profit damages arising from your use of
            the website, platform, advertising campaigns, or third-party services.
          </p>
        </PolicySection>

        <PolicySection title="12. Changes to Terms">
          <p>
            Smartemark may update these Terms of Service from time to time. Updates will be posted
            on this page with a revised "Last Updated" date.
          </p>
        </PolicySection>

        <PolicySection title="13. Contact Us">
          <p>If you have questions about these Terms, contact us at:</p>
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
