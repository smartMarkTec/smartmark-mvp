export const SMARTEMARK_PIXEL_ID = "828115410101813";

// Pixel is initialized in public/index.html — this provides safe wrappers.
export function initMetaPixel() {
  if (typeof window === "undefined" || window.fbq) return;
  (function(f,b,e,v,n,t,s){
    if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s);
  })(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");
  window.fbq("init", SMARTEMARK_PIXEL_ID);
  window.fbq("track", "PageView");
}

export function trackPageView() {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "PageView");
  if (process.env.NODE_ENV === "development") console.log("[MetaPixel] PageView fired");
}

export function trackLead() {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "Lead");
  if (process.env.NODE_ENV === "development") console.log("[MetaPixel] Lead fired");
}

export function trackSchedule() {
  if (typeof window === "undefined" || !window.fbq) return;
  window.fbq("track", "Schedule");
  if (process.env.NODE_ENV === "development") console.log("[MetaPixel] Schedule fired");
}

export function isMetaPixelLoaded() {
  return typeof window !== "undefined" && typeof window.fbq === "function";
}
