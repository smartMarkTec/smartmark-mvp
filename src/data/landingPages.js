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
/**
 * New optional fields added for tracking:
 *   clientSlug       — short identifier used in landing_events logs (e.g. "aspen", "proteks")
 *   gaMeasurementId  — GA4 Measurement ID (e.g. "G-XXXXXXXXXX"). Empty string = disabled.
 */

  /* ── Pro Teks HVAC — Austin / Hill Country ── */
  "proteks-austin": {
    slug: "proteks-austin",
    businessName: "Pro Teks HVAC",
    headline: "Replace Your Old AC System Before It Fails in the Texas Heat",
    subheadline: "Austin / Hill Country AC system replacements starting at $6,995 installed.",
    offer: "$500 Off Full System Replacement + Free Replacement Estimate. Financing available for approved customers through Synchrony Bank and other financing partners.",
    phone: "9564363122",
    phoneDisplay: "(956) 436-3122",
    forwardingPhone: "5129399485",
    serviceArea: "Austin, Round Rock, Georgetown, Leander, Cedar Park, Liberty Hill, Hutto, Dripping Springs, Bee Cave, West Lake, Horseshoe Bay, Burnet, Blanco, and surrounding Hill Country areas.",
    services: [
      "AC System Replacement",
      "Full System Swaps",
      "New HVAC Installs",
      "Ductless Mini Splits",
      "Financing Available",
    ],
    trustPoints: [
      "Local Hill Country HVAC contractor",
      "AC system replacements starting at $6,995 installed",
      "$500 off full system replacement",
      "Free replacement estimate",
      "Financing through Synchrony Bank",
    ],
    hostnames: [],
    mainWebsiteUrl: "https://proteks.ac/",
    primaryButtonText: "Call (956) 436-3122",
    secondaryButtonText: "Home",
    pageTitle: "Pro Teks HVAC | Austin / Hill Country AC Replacement — $500 Off",
    metaDescription: "AC system replacements starting at $6,995 installed. $500 off full system replacement + free estimate. Serving Austin, Round Rock, Georgetown, Cedar Park, and surrounding Hill Country.",
    logo: null,
    favicon: null,
    metaPixelId: null,
    scheduleUrl: null,
    backgroundImage: null,
    offerHeadline: "$500 Off Full System Replacement",
    locationBadge: "Austin / Hill Country",
    clientSlug: "proteks",
    gaMeasurementId: "",
  },

  /* ── Pro Teks HVAC — North San Antonio ── */
  "proteks-san-antonio": {
    slug: "proteks-san-antonio",
    businessName: "Pro Teks HVAC",
    headline: "Replace Your Old AC System Before It Fails in the Texas Heat",
    subheadline: "North San Antonio area AC system replacements starting at $6,495 installed.",
    offer: "$500 Off Full System Replacement + Free Replacement Estimate. Financing available for approved customers through Synchrony Bank and other financing partners.",
    phone: "9564363122",
    phoneDisplay: "(956) 436-3122",
    forwardingPhone: "5129399485",
    serviceArea: "North San Antonio, Boerne, New Braunfels, San Marcos, Bulverde, Blanco, Spring Branch, and surrounding areas.",
    services: [
      "AC System Replacement",
      "Full System Swaps",
      "New HVAC Installs",
      "Ductless Mini Splits",
      "Financing Available",
    ],
    trustPoints: [
      "Local North San Antonio HVAC contractor",
      "AC system replacements starting at $6,495 installed",
      "$500 off full system replacement",
      "Free replacement estimate",
      "Financing through Synchrony Bank",
    ],
    hostnames: [],
    mainWebsiteUrl: "https://proteks.ac/",
    primaryButtonText: "Call (956) 436-3122",
    secondaryButtonText: "Home",
    pageTitle: "Pro Teks HVAC | North San Antonio AC Replacement — $500 Off",
    metaDescription: "AC system replacements starting at $6,495 installed. $500 off full system replacement + free estimate. Serving North San Antonio, Boerne, New Braunfels, San Marcos, and surrounding areas.",
    logo: null,
    favicon: null,
    metaPixelId: null,
    scheduleUrl: null,
    backgroundImage: null,
    offerHeadline: "$500 Off Full System Replacement",
    locationBadge: "North San Antonio",
    clientSlug: "proteks",
    gaMeasurementId: "",
  },

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
    primaryButtonText: "Call Now: (346) 641-1064",
    secondaryButtonText: "Home",
    pageTitle: "Aspen Air Conditioning & Heating | Houston AC Tune-Up Special",
    metaDescription: "Fast, reliable AC service in Houston. Call Aspen Air Conditioning & Heating for AC tune-ups, service, and maintenance.",
    logo: "/client-assets/aspen-ac-logo.png",
    favicon: "/client-assets/aspen-ac-logo.png",
    metaPixelId: "2079374046338979",
    scheduleUrl: null,
    backgroundImage: null,
    offerHeadline: "$75 AC Tune-Up",
    locationBadge: "Houston, TX",
    clientSlug: "aspen",
    gaMeasurementId: "G-YKSC8DNBHQ",
  },
};

export default LANDING_PAGES;
