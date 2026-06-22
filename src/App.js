// src/App.js
import React, { useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import LandingTest from "./pages/LandingTest";
import PricingTest from "./pages/PricingTest";
// FormPage removed from primary flow — AI Agent tab is the campaign creation UI.
// File kept for reference; import removed to ensure no stale routes use it.
import CampaignSetup from "./pages/CampaignSetup";
import Login from "./pages/Login";
import Signup from "./Signup";
import Confirmation from "./pages/Confirmation";
import PostCheckout from "./pages/PostCheckout";
import BookedCall from "./pages/BookedCall";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SalesAssistant from "./pages/SalesAssistant";
import AdAgent from "./pages/AdAgent";
import PremiumIntake from "./pages/PremiumIntake";
import PremiumIntakeComplete from "./pages/PremiumIntakeComplete";
import AdminClients from "./pages/admin/AdminClients";
import AdminClientDetail from "./pages/admin/AdminClientDetail";
import AdminManageCampaign from "./pages/admin/AdminManageCampaign";
import AdminLeads from "./pages/admin/AdminLeads";
import BookingConfirmed from "./pages/BookingConfirmed";
import Agreement from "./pages/Agreement";
import OnboardingConnect from "./pages/OnboardingConnect";
import LandingPage from "./pages/LandingPage";
import LANDING_PAGES from "./data/landingPages";

const SMARTEMARK_GA_ID = "G-XP146JNFE7";
const SMARTEMARK_HOSTNAMES = new Set([
  "www.smartemark.com",
  "smartemark.com",
  "smartmark-mvp.vercel.app",
  "localhost",
]);

/* Renders the matching client landing page when the hostname is a known custom domain,
   otherwise falls through to the normal Smartemark homepage. */
function HostnameGateway() {
  const hostname = window.location.hostname;
  const match = Object.values(LANDING_PAGES).find(
    (p) => Array.isArray(p.hostnames) && p.hostnames.includes(hostname)
  );
  if (match) return <LandingPage slug={match.slug} />;
  return <Landing />;
}

/** Redirects legacy /form traffic to the AI Agent tab in CampaignSetup. */
function FormRedirect() {
  const loc = useLocation();
  const qs  = new URLSearchParams(loc.search);
  const adminClientId = qs.get("adminClientId") || "";
  const dest = adminClientId
    ? `/setup?adminClientId=${encodeURIComponent(adminClientId)}&tab=ai-agent`
    : "/setup?tab=ai-agent";
  return <Navigate to={dest} replace />;
}

function NotFound() {
  return (
    <div
      style={{
        color: "#fff",
        background: "#232529",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <h1>404 - Page Not Found</h1>
      <a href="/" style={{ color: "#1ec885", marginTop: 20, fontWeight: 700 }}>
        Go to Home
      </a>
    </div>
  );
}

function App() {
  const location = useLocation();

  // Inject Smartemark GA4 once — only on Smartemark domains, never on client landing page domains
  useEffect(() => {
    if (!SMARTEMARK_HOSTNAMES.has(window.location.hostname)) return;

    const scriptId = `gtag-js-${SMARTEMARK_GA_ID}`;
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id    = scriptId;
      script.async = true;
      script.src   = `https://www.googletagmanager.com/gtag/js?id=${SMARTEMARK_GA_ID}`;
      document.head.appendChild(script);
    }

    window.dataLayer = window.dataLayer || [];
    if (!window.gtag) {
      window.gtag = function () { window.dataLayer.push(arguments); };
    }
    window.gtag("js", new Date());
    window.gtag("config", SMARTEMARK_GA_ID);
  }, []); // runs once on mount

  // Track SPA route changes for Smartemark GA — skipped on client landing page domains
  useEffect(() => {
    if (!SMARTEMARK_HOSTNAMES.has(window.location.hostname)) return;
    if (!window.gtag) return;

    window.gtag("config", SMARTEMARK_GA_ID, {
      page_path: location.pathname + location.search,
    });
  }, [location]);

  return (
    <Routes>
      <Route path="/" element={<HostnameGateway />} />
      <Route path="/growth" element={<LandingTest />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/growth-pricing" element={<PricingTest />} />
      <Route path="/test" element={<Navigate to="/growth" replace />} />
      <Route path="/pricing-test" element={<Navigate to="/growth-pricing" replace />} />
      {/* /form is no longer the primary flow — redirect to AI Agent tab */}
      <Route path="/form" element={<FormRedirect />} />
      <Route path="/setup" element={<CampaignSetup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/confirmation" element={<Confirmation />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/terms-of-service" element={<TermsOfService />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/post-checkout" element={<PostCheckout />} />
      <Route path="/agreement" element={<Agreement />} />
      <Route path="/onboarding" element={<OnboardingConnect />} />
      <Route path="/booking-confirmed" element={<BookingConfirmed />} />
      <Route path="/booked-call" element={<BookedCall />} />
      <Route path="/videos" element={<BookedCall />} />
      <Route path="/sales-assistant" element={<SalesAssistant />} />
      <Route path="/ad-agent" element={<AdAgent />} />
      <Route path="/premium-intake" element={<PremiumIntake />} />
      <Route path="/premium-intake-complete" element={<PremiumIntakeComplete />} />
      <Route path="/admin/clients" element={<AdminClients />} />
      <Route path="/admin/clients/:id" element={<AdminClientDetail />} />
      <Route path="/admin/clients/:id/manage-campaign" element={<AdminManageCampaign />} />
      <Route path="/admin/leads" element={<AdminLeads />} />
      {/* ── Public client landing pages — no auth required ── */}
      <Route path="/lp/:slug" element={<LandingPage />} />
      {/* ── Pro Teks HVAC offer pages ── */}
      <Route path="/offers/proteks-austin" element={<LandingPage slug="proteks-austin" />} />
      <Route path="/offers/proteks-san-antonio" element={<LandingPage slug="proteks-san-antonio" />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;