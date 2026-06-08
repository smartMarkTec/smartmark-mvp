import { useEffect } from "react";
import Pricing from "./Pricing";

const HIGH_TICKET_PLANS = [
  {
    name: "Base",
    planKey: "base",
    price: "$495",
    cardTitle: "AI Campaign Manager",
    description:
      "For business owners who want to use Smartemark themselves to create, launch, and monitor Facebook/Instagram ads.",
    badge: null,
    featured: false,
    isDark: false,
    cta: "Get Base",
    features: [
      "AI creates ads",
      "AI writes headlines/captions",
      "AI launches campaigns",
      "AI monitors campaigns",
      "Basic AI optimization",
      "10 ad regenerations/day",
      "Upload custom photos/creatives",
      "Campaign dashboard",
      "Basic support",
    ],
  },
  {
    name: "Deluxe",
    planKey: "deluxe",
    price: "$995",
    cardTitle: "AI Campaign Manager + AI Assistant",
    description:
      "For business owners who want the Smartemark platform plus guided AI help with marketing decisions, offers, services, and campaign ideas.",
    badge: "Most Popular",
    featured: true,
    isDark: false,
    cta: "Get Deluxe",
    features: [
      "Everything in Base",
      "AI Marketing Assistant",
      "Ask campaign/marketing questions",
      "AI suggestions for ad angles",
      "AI help choosing services/specials to promote",
      "AI help deciding between marketing ideas",
      "20 ad regenerations/day",
      "AI Assistant usage refreshes throughout the day",
      "Advanced dashboard",
      "Priority support",
    ],
  },
  {
    name: "Premium",
    planKey: "premium",
    price: "$1,500",
    cardTitle: "Done-For-You AI Ad Management",
    description:
      "For business owners who want our team to manage the campaign for them through Smartemark.",
    badge: "Done For You",
    featured: false,
    isDark: true,
    cta: "Get Premium",
    features: [
      "Everything in Deluxe",
      "We create campaigns for you",
      "We launch campaigns through Smartemark",
      "We monitor campaign performance",
      "We make campaign adjustments",
      "Ad variations handled by our team as needed",
      "Creative/photo assets handled by our team as needed",
      "Meta Pixel setup",
      "Google Analytics setup/review",
      "Call tracking setup",
      "Conversion tracking setup",
      "Monthly performance review",
    ],
  },
];

export default function PricingTest() {
  useEffect(() => {
    localStorage.setItem("sm_pricing_variant", "high_ticket_test");
  }, []);

  return (
    <Pricing
      pricingVariant="high_ticket_test"
      customPlans={HIGH_TICKET_PLANS}
      homeRoute="/test"
    />
  );
}
