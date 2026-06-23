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
    headline: "Replace Your Old AC System With Confidence",
    subheadline: "Pro Teks HVAC helps homeowners in Austin, the Hill Country, and surrounding areas replace older AC systems with clean, professional installation and competitive pricing.",
    offer: "Get a free replacement estimate and ask about AC system replacement starting at $6,995 installed for Austin and Hill Country homeowners.",
    offerNote: "Starting price varies by home, system size, and service area. Call for a free replacement estimate.",
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
    // ── Enhanced design layout ──
    topBarCallText: "Call Now",
    fullWidthHeader: true,
    offerMaxWidth: 680,
    centerOfferContent: true,
    enhancedSections: true,
    workshopServicesData: [
      { label: "AC system replacement",     desc: "Replace an aging or failing system with a professionally installed high-efficiency unit." },
      { label: "New AC installation",       desc: "Clean installation for reliable comfort, stronger airflow, and long-term performance." },
      { label: "Free replacement estimate", desc: "Get clear options and pricing before deciding on your full system replacement." },
    ],
    workshopTrustData: [
      { label: "Local HVAC replacement specialists", desc: "Professional AC replacement and installation support for homeowners in your area." },
      { label: "Competitive installed pricing",      desc: "Clear replacement offers designed to help homeowners upgrade with confidence." },
      { label: "Financing available",                desc: "Ask about financing options for approved customers." },
    ],
    workshopTrustBar: {
      headline: "Reliable Installation. Clear Pricing. Better Home Comfort.",
      sub: "Upgrade your AC system with confidence.",
    },
  },

  /* ── Pro Teks HVAC — North San Antonio ── */
  "proteks-san-antonio": {
    slug: "proteks-san-antonio",
    businessName: "Pro Teks HVAC",
    headline: "Need To Replace Your AC System?",
    subheadline: "Pro Teks HVAC helps homeowners in North San Antonio, Helotes, and surrounding areas replace aging AC systems with professional installation and competitive pricing.",
    offer: "Get a free replacement estimate and ask about AC system replacement starting at $6,495 installed for North San Antonio and Helotes homeowners.",
    offerNote: "Starting price varies by home, system size, and service area. Call for a free replacement estimate.",
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
    // ── Enhanced design layout ──
    topBarCallText: "Call Now",
    fullWidthHeader: true,
    offerMaxWidth: 680,
    centerOfferContent: true,
    enhancedSections: true,
    workshopServicesData: [
      { label: "AC system replacement",     desc: "Replace an aging or failing system with a professionally installed high-efficiency unit." },
      { label: "New AC installation",       desc: "Clean installation for reliable comfort, stronger airflow, and long-term performance." },
      { label: "Free replacement estimate", desc: "Get clear options and pricing before deciding on your full system replacement." },
    ],
    workshopTrustData: [
      { label: "Local HVAC replacement specialists", desc: "Professional AC replacement and installation support for homeowners in your area." },
      { label: "Competitive installed pricing",      desc: "Clear replacement offers designed to help homeowners upgrade with confidence." },
      { label: "Financing available",                desc: "Ask about financing options for approved customers." },
    ],
    workshopTrustBar: {
      headline: "Reliable Installation. Clear Pricing. Better Home Comfort.",
      sub: "Upgrade your AC system with confidence.",
    },
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
    // ── Approved design (applied from workshop 2026-06-22) ──
    heroBackgroundImage: "/client-assets/aspen-hero-hvac.jpg",
    heroOverlay: 0.62,
    heroBackgroundPosition: "center 30%",
    topBarCallText: "Call Now",
    logoHeight: 28,
    offerMaxWidth: 680,
    fullWidthHeader: true,
    centerOfferContent: true,
    enhancedSections: true,
    promotionSidePhotos: {
      left: [
        { src: "/client-assets/aspen-work-before.jpg", label: "Before" },
        { src: "/client-assets/aspen-work-after.jpg",  label: "After"  },
      ],
      right: [
        { src: "/client-assets/aspen-work-1.jpg", label: "" },
        { src: "/client-assets/aspen-work-2.jpg", label: "" },
      ],
    },
    workshopServicesData: [
      { label: "AC tune-ups",              desc: "Improve efficiency and catch small issues early with a professional tune-up." },
      { label: "AC installation",          desc: "Expert installation for reliable performance and long-term comfort." },
      { label: "Annual maintenance plans", desc: "Keep your system running strong year-round and avoid unexpected breakdowns." },
    ],
    workshopTrustData: [
      { label: "Local Houston AC service",          desc: "Proudly serving Houston and surrounding areas with honest, dependable service." },
      { label: "Fast response",                     desc: "We respond quickly when you need us most — because your comfort can't wait." },
      { label: "Residential AC repair and service", desc: "From repairs to full system care, we keep your home cool and comfortable." },
    ],
    workshopTrustBar: {
      headline: "Quality Work. Honest Pricing. Year-Round Comfort.",
      sub: "Your comfort is our priority.",
    },
  },

  /* ── Aspen AC — workshop/preview (hero photo test) ──────────────────────
     DO NOT add to hostnames[]. NOT linked from production.
     Safe to iterate on. Apply to "aspen-ac" only after review.
  ── */
  "aspen-ac-workshop": {
    slug: "aspen-ac-workshop",
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
    hostnames: [],
    mainWebsiteUrl: "https://aspen93.godaddysites.com",
    primaryButtonText: "Call Now: (346) 641-1064",
    secondaryButtonText: "Home",
    pageTitle: "Aspen Air Conditioning & Heating | Houston AC Tune-Up Special",
    metaDescription: "Fast, reliable AC service in Houston. Call Aspen Air Conditioning & Heating for AC tune-ups, service, and maintenance.",
    logo: "/client-assets/aspen-ac-logo.png",
    favicon: "/client-assets/aspen-ac-logo.png",
    metaPixelId: null,
    scheduleUrl: null,
    backgroundImage: null,
    offerHeadline: "$75 AC Tune-Up",
    locationBadge: "Houston, TX",
    clientSlug: "aspen",
    gaMeasurementId: "",
    // ── Hero photo config (workshop only) ──
    heroBackgroundImage: "/client-assets/aspen-hero-hvac.jpg",
    heroOverlay: 0.62,
    heroBackgroundPosition: "center 30%",
    // ── Header / layout tweaks (workshop only) ──
    topBarCallText: "Call Now",
    logoHeight: 28,
    offerMaxWidth: 680,
    fullWidthHeader: true,
    centerOfferContent: true,
    enhancedSections: true,
    workshopServices: ["AC tune-ups", "AC installation", "Annual maintenance plans"],
    workshopTrustPoints: ["Local Houston AC service", "Fast response", "Residential AC repair and service"],
    promotionSidePhotos: {
      left: [
        { src: "/client-assets/aspen-work-before.jpg", label: "Before" },
        { src: "/client-assets/aspen-work-after.jpg",  label: "After"  },
      ],
      right: [
        { src: "/client-assets/aspen-work-1.jpg", label: "" },
        { src: "/client-assets/aspen-work-2.jpg", label: "" },
      ],
    },
    workshopServicesData: [
      { label: "AC tune-ups",              desc: "Improve efficiency and catch small issues early with a professional tune-up." },
      { label: "AC installation",          desc: "Expert installation for reliable performance and long-term comfort." },
      { label: "Annual maintenance plans", desc: "Keep your system running strong year-round and avoid unexpected breakdowns." },
    ],
    workshopTrustData: [
      { label: "Local Houston AC service",         desc: "Proudly serving Houston and surrounding areas with honest, dependable service." },
      { label: "Fast response",                    desc: "We respond quickly when you need us most — because your comfort can't wait." },
      { label: "Residential AC repair and service", desc: "From repairs to full system care, we keep your home cool and comfortable." },
    ],
    workshopTrustBar: {
      headline: "Quality Work. Honest Pricing. Year-Round Comfort.",
      sub: "Your comfort is our priority.",
    },
  },
};

export default LANDING_PAGES;
