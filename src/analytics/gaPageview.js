// src/analytics/gaPageviews.js
export function trackPageView(path) {
  if (typeof window === "undefined") return;
  if (!window.gtag) return;

  window.gtag("config", "G-XP146JNFE7", {
    page_path: path,
  });
}
