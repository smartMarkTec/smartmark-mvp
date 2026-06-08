import { useEffect } from "react";
import Landing from "./Landing";

export default function LandingGrowth() {
  useEffect(() => {
    localStorage.setItem("sm_pricing_variant", "high_ticket_test");
  }, []);

  return <Landing pricingPath="/growth-pricing" homePath="/growth" />;
}
