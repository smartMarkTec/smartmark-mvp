/* ANCHOR: src/api/staticAds.js */
export async function generateStaticAd(payload) {
  const res = await fetch("/api/generate-static-ad", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`static-ad ${res.status}`);
  return await res.json(); // { pngUrl, svgUrl, ... }
}
