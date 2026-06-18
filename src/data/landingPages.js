/**
 * Landing page data configs.
 *
 * Each entry is keyed by slug (the URL segment after /lp/).
 * To add a new client page, copy one entry and change the values.
 *
 * Fields:
 *   slug            — URL segment, must be unique, URL-safe
 *   businessName    — Full business name shown in header and body
 *   headline        — Hero headline (short, punchy)
 *   subheadline     — Supporting line under headline
 *   offer           — Promotional offer text shown in the offer box
 *   phone           — Digits only, used for tel: link  e.g. "7138822767"
 *   phoneDisplay    — Formatted string for display  e.g. "(713) 882-2767"
 *   serviceArea     — Short city/region description
 *   services        — Array of service strings for the Services section
 *   trustPoints     — Array of trust/credibility bullet strings
 *   mainWebsiteUrl  — Client's primary website (secondary CTA)
 *   primaryButtonText   — Label for the call CTA
 *   secondaryButtonText — Label for the website link CTA
 *   metaPixelId     — Optional. Facebook Pixel ID (public-safe). Set to null to skip.
 *   logo            — Optional. URL to a logo image. Set to null to skip.
 *   backgroundImage — Optional. Hero background image URL. Set to null for solid color.
 */

const LANDING_PAGES = {
  "aspen-ac": {
    slug: "aspen-ac",
    businessName: "Aspen Air Conditioning & Heating",
    headline: "Houston AC Tune-Up Special",
    subheadline: "Fast, reliable AC service from Aspen Air Conditioning & Heating.",
    offer: "Having issues with your AC or due for maintenance? Take advantage of our $75 AC tune-up, or ask about the $120 annual maintenance plan.",
    phone: "13466411064",
    phoneDisplay: "(346) 641-1064",
    forwardingPhone: "17138822767",
    serviceArea: "Houston and surrounding areas",
    services: [
      "AC repair",
      "AC service",
      "AC installation",
      "AC tune-ups",
      "Annual maintenance plans",
    ],
    trustPoints: [
      "Local Houston AC service",
      "Fast response",
      "Residential AC repair and service",
      "Simple scheduling",
      "Call for current availability",
    ],
    hostnames: ["offers.aspen-hvac.com"],
    mainWebsiteUrl: "https://aspen93.godaddysites.com",
    primaryButtonText: "Call Now: (713) 882-2767",
    secondaryButtonText: "Home",
    pageTitle: "Aspen Air Conditioning & Heating | Houston AC Tune-Up Special",
    metaDescription: "Fast, reliable AC service in Houston. Call Aspen Air Conditioning & Heating for AC tune-ups, service, and maintenance.",
    logo: "/client-assets/aspen-ac-logo.png",
    favicon: "/client-assets/aspen-ac-logo.png",
    metaPixelId: "2079374046338979",
    scheduleUrl: null,
    backgroundImage: null,
  },
};

export default LANDING_PAGES;
