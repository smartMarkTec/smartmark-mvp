/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown } from "react-icons/fa";

const backendUrl = "https://smartmark-mvp.onrender.com";

// Visual theme
const DARK_BG = "#181b20";
const PANEL_BG = "#202327";
const CARD_BG = "#1b1e22f7";
const EDGE_BG = "#232528e6";
const INPUT_BG = "#1c2120";
const TEXT_MAIN = "#ecfff6";
const TEXT_DIM = "#b3f1d6";
const ACCENT = "#14e7b9";
const ACCENT_ALT = "#1ec885";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";

const CREATIVE_HEIGHT = 150;

// ---- Draft persistence (24h TTL) ----
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v2";
const FORM_DRAFT_KEY = "sm_form_draft_v2";

// Responsive helper
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

// FB connection flag
const FB_CONN_KEY = "smartmark_fb_connected";
const FB_CONN_MAX_AGE = 2.5 * 24 * 60 * 60 * 1000;

// Persisted creatives (keyed by adAccount -> campaignId)
const CREATIVE_MAP_KEY = (actId) => `sm_creatives_map_${String(actId || "").replace(/^act_/, "")}`;
const readCreativeMap = (actId) => {
  try { return JSON.parse(localStorage.getItem(CREATIVE_MAP_KEY(actId)) || "{}"); }
  catch { return {}; }
};
const writeCreativeMap = (actId, map) => {
  try { localStorage.setItem(CREATIVE_MAP_KEY(actId), JSON.stringify(map || {})); }
  catch {}
};

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = 25;
  const total = parsed + fee;
  return { fee, total };
};

function DottyMini() {
  return (
    <span style={{ display:"inline-block", minWidth:32, letterSpacing:3 }}>
      <span style={{ animation:"dm 1.2s infinite", display:"inline-block" }}>.</span>
      <span style={{ animation:"dm 1.2s infinite .15s", display:"inline-block", marginLeft:4 }}>.</span>
      <span style={{ animation:"dm 1.2s infinite .3s", display:"inline-block", marginLeft:4 }}>.</span>
      <style>{`@keyframes dm{0%{transform:translateY(0)}30%{transform:translateY(-5px)}60%{transform:translateY(0)}}`}</style>
    </span>
  );
}

function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  const src = imageUrl && !/^https?:\/\//.test(imageUrl) ? backendUrl + imageUrl : imageUrl;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1005,
      background: "rgba(16,22,21,0.85)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        position: "relative", maxWidth: "88vw", maxHeight: "88vh",
        borderRadius: 18, background: "#191e20", padding: 0, boxShadow: "0 10px 60px #000c"
      }}>
        <img
          src={src || ""}
          alt="Full-screen"
          style={{ maxWidth: "84vw", maxHeight: "80vh", display: "block", borderRadius: 14, background: "#101312" }}
        />
        <button
          style={{
            position: "absolute", top: 12, right: 18, background: "#212f29",
            border: "none", color: "#fff", borderRadius: 11, padding: "9px 17px",
            fontWeight: 700, fontSize: 15, cursor: "pointer", boxShadow: "0 1px 6px #1ec88530"
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ---- helpers for ImageCarousel ---- */
const navBtn = (dir) => ({
  position:"absolute",
  top:"50%",
  transform:"translateY(-50%)",
  [dir < 0 ? "left" : "right"]: 6,
  background:"rgba(0,0,0,0.45)",
  color:"#fff",
  border:"none",
  borderRadius:8,
  width:26, height:26,
  fontSize:16, fontWeight:900,
  cursor:"pointer",
  zIndex: 2
});
const badge = {
  position:"absolute", bottom:6, right:6,
  background:"rgba(0,0,0,0.55)", color:"#fff",
  borderRadius:8, padding:"2px 6px", fontSize:11, fontWeight:800,
  zIndex: 2
};

/* ---- ImageCarousel ---- */
function ImageCarousel({ items = [], onFullscreen, height = 220 }) {
  const [idx, setIdx] = useState(0);
  const normalized = (items || [])
    .map(u => (u && !/^https?:\/\//.test(u) ? `${backendUrl}${u}` : String(u || "").trim()))
    .filter(Boolean);

  useEffect(() => { if (idx >= normalized.length) setIdx(0); }, [normalized, idx]);

  if (!normalized.length) {
    return <div style={{ height, width: "100%", background: "#e9ecef",
      color: "#a9abb0", fontWeight: 700, display:"flex", alignItems:"center",
      justifyContent:"center", fontSize: 18 }}>Images</div>;
  }
  const go = (d) => setIdx((p) => (p + d + normalized.length) % normalized.length);

  return (
    <div style={{ position:"relative", background:"#222" }}>
      <img
        src={normalized[idx]}
        alt="Ad"
        style={{ width:"100%", maxHeight:height, height, objectFit:"cover", display:"block" }}
        onClick={() => onFullscreen && onFullscreen(normalized[idx])}
      />
      {normalized.length > 1 && (
        <>
          <button onClick={() => go(-1)} style={navBtn(-1)} aria-label="Prev">‹</button>
          <button onClick={() => go(1)} style={navBtn(1)} aria-label="Next">›</button>
          <div style={badge}>{idx + 1}/{normalized.length}</div>
        </>
      )}
    </div>
  );
}

/* ---- VideoCarousel (with <source> + preload) ---- */
function VideoCarousel({ items = [], height = 220 }) {
  const [idx, setIdx] = useState(0);
  const normalized = (items || [])
    .map(u => (u && !/^https?:\/\//.test(u) ? `${backendUrl}${u}` : String(u || "").trim()))
    .filter(Boolean);

  useEffect(() => {
    if (idx >= normalized.length) setIdx(0);
  }, [normalized, idx]);

  if (!normalized.length) {
    return (
      <div style={{
        height, width: "100%", background: "#e9ecef",
        color: "#a9abb0", fontWeight: 700, display: "flex",
        alignItems: "center", justifyContent: "center", fontSize: 18
      }}>
        Videos
      </div>
    );
  }

  const go = (d) => setIdx(p => (p + d + normalized.length) % normalized.length);

  return (
    <div style={{ position: "relative", background: "#222" }}>
      <video
        key={normalized[idx]}
        controls
        preload="metadata"
        playsInline
        crossOrigin="anonymous"
        style={{ width: "100%", maxHeight: height, height, display: "block", objectFit: "cover", background:"#111" }}
      >
        <source src={normalized[idx]} type="video/mp4" />
      </video>
      {normalized.length > 1 && (
        <>
          <button onClick={() => go(-1)} style={navBtn(-1)} aria-label="Prev">‹</button>
          <button onClick={() => go(1)} style={navBtn(1)} aria-label="Next">›</button>
          <div style={badge}>{idx + 1}/{normalized.length}</div>
        </>
      )}
    </div>
  );
}

/* ---------- Minimal, clean metrics row ---------- */
function MetricsRow({ metrics }) {
  const cards = useMemo(() => {
    const m = metrics || {};
    const impressions = m.impressions ?? "--";
    const clicks = m.clicks ?? "--";
    const ctr = m.ctr ?? "--";
    const cpc = (m.spend && m.clicks) ? `$${(Number(m.spend)/Number(m.clicks)).toFixed(2)}` : "--";
    return [
      { key: "impressions", label: "Impressions", value: impressions },
      { key: "clicks", label: "Clicks", value: clicks },
      { key: "ctr", label: "CTR", value: ctr },
      { key: "cpc", label: "CPC", value: cpc },
    ];
  }, [metrics]);

  const cardStyle = {
    minWidth: 160,
    background: "#242a2e",
    border: "1px solid #2f5243",
    color: "#eafff6",
    borderRadius: 14,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 2px 10px #14352a33"
  };

  return (
    <div style={{ position:"relative", width:"100%" }}>
      <div
        style={{
          display:"flex",
          gap:12,
          overflowX:"auto",
          padding: "6px 2px",
          scrollSnapType: "x proximity",
          scrollbarWidth: "none"
        }}
      >
        {cards.map(c => (
          <div key={c.key} style={{ ...cardStyle, scrollSnapAlign:"start" }}>
            <div style={{ fontSize:12, color:"#a6d9c5", fontWeight:800, letterSpacing:0.2 }}>{c.label}</div>
            <div style={{ fontSize:20, fontWeight:900 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =========================================================
// ===================== MAIN COMPONENT ====================
// =========================================================
const CampaignSetup = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  // Persisted non-creative fields
  const [form, setForm] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smartmark_last_campaign_fields")) || {}; }
    catch { return {}; }
  });
  const [budget, setBudget] = useState(() => localStorage.getItem("smartmark_last_budget") || "");
  const [cashapp, setCashapp] = useState(() => localStorage.getItem("smartmark_login_username") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("smartmark_login_password") || "");
  const [selectedAccount, setSelectedAccount] = useState(() => localStorage.getItem("smartmark_last_selected_account") || "");
  const [selectedPageId, setSelectedPageId] = useState(() => localStorage.getItem("smartmark_last_selected_pageId") || "");
  const [fbConnected, setFbConnected] = useState(() => {
    const conn = localStorage.getItem(FB_CONN_KEY);
    if (conn) {
      const { connected, time } = JSON.parse(conn);
      if (connected && Date.now() - time < FB_CONN_MAX_AGE) return true;
      localStorage.removeItem(FB_CONN_KEY);
      return false;
    }
    return false;
  });

  // UI state
  const [adAccounts, setAdAccounts] = useState([]);

  const defaultStart = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    return d;
  }, []);

  const [pages, setPages] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metricsMap, setMetricsMap] = useState({});
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setCampaignStatus] = useState("ACTIVE");
  const [campaignCount, setCampaignCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Right-pane: which row is expanded
  const [expandedId, setExpandedId] = useState(null);

  // DRAFT creatives (used ONLY for not-yet-launched new campaign)
  const [draftCreatives, setDraftCreatives] = useState({
    images: [],
    videos: [],
    fbVideoIds: [],
    mediaSelection: (location.state?.mediaSelection || localStorage.getItem("smartmark_media_selection") || "both").toLowerCase()
  });

  // From navigation state (for new draft creation)
  const {
    imageUrls: navImageUrls,
    videoUrls: navVideoUrls,
    fbVideoIds: navFbVideoIds,
    headline,
    body,
    answers,
    mediaSelection: navMediaSelection
  } = location.state || {};

  // --- Campaign Duration (max 14 days) — COMPACT WHEELS VERSION ---
  const [startDate, setStartDate] = useState(() => {
    const existing = form.startDate || "";
    return existing || new Date(defaultStart).toISOString().slice(0, 16);
  });
  const [endDate, setEndDate] = useState(() => {
    const s = startDate ? new Date(startDate) : defaultStart;
    const e = new Date(s.getTime() + 3 * 24 * 60 * 60 * 1000);
    e.setSeconds(0, 0);
    return (form.endDate || "").length ? form.endDate : e.toISOString().slice(0, 16);
  });

  // derived date parts for compact pickers (MM | DD | YY)
  const sd = new Date(startDate || defaultStart);
  const ed = new Date(endDate || new Date(sd.getTime() + 3 * 24 * 60 * 60 * 1000));
  const [sMonth, setSMonth] = useState(sd.getMonth() + 1);
  const [sDay, setSDay] = useState(sd.getDate());
  const [sYear, setSYear] = useState(sd.getFullYear() % 100);
  const [eMonth, setEMonth] = useState(ed.getMonth() + 1);
  const [eDay, setEDay] = useState(ed.getDate());
  const [eYear, setEYear] = useState(ed.getFullYear() % 100);

  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

  // helpers for duration
  const clampEndForStart = (startStr, endStr) => {
    try {
      const start = new Date(startStr);
      let end = endStr ? new Date(endStr) : null;
      const maxEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (!end || end <= start) end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      if (end > maxEnd) end = maxEnd;
      end.setSeconds(0,0);
      return end.toISOString().slice(0, 16);
    } catch {
      return endStr;
    }
  };

  // Sync compact pickers -> ISO strings
  useEffect(() => {
    const clampDay = (m, y2) => {
      const y = 2000 + y2;
      return new Date(y, m, 0).getDate();
    };
    // build start at 09:00 local
    const sdMaxDay = clampDay(sMonth, sYear);
    const sD = Math.min(sDay, sdMaxDay);
    const sISO = new Date(2000 + sYear, sMonth - 1, sD, 9, 0, 0).toISOString().slice(0,16);
    setStartDate(sISO);

    // end at 18:00 local (visually distinct)
    const edMaxDay = clampDay(eMonth, eYear);
    const eD = Math.min(eDay, edMaxDay);
    let eISO = new Date(2000 + eYear, eMonth - 1, eD, 18, 0, 0).toISOString().slice(0,16);

    // enforce clamp (>= start +1h, <= start +14d)
    eISO = clampEndForStart(sISO, eISO);
    setEndDate(eISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sMonth, sDay, sYear, eMonth, eDay, eYear]);

  // Load persisted fields + saved draft (24h TTL)
  useEffect(() => {
    const lastFields = localStorage.getItem("smartmark_last_campaign_fields");
    if (lastFields) {
      const f = JSON.parse(lastFields);
      setForm(f);
      if (f.startDate) setStartDate(f.startDate);
      if (f.endDate) setEndDate(clampEndForStart(f.startDate || startDate, f.endDate));
    }
    const lastAudience = localStorage.getItem("smartmark_last_ai_audience");
    if (lastAudience) setForm(f => ({ ...f, aiAudience: JSON.parse(lastAudience) }));

    const applyDraft = (draftObj) => {
      setDraftCreatives({
        images: Array.isArray(draftObj.images) ? draftObj.images.slice(0, 2) : [],
        videos: Array.isArray(draftObj.videos) ? draftObj.videos.slice(0, 2) : [],
        fbVideoIds: Array.isArray(draftObj.fbVideoIds) ? draftObj.fbVideoIds.slice(0, 2) : [],
        mediaSelection: (draftObj.mediaSelection || navMediaSelection || "both").toLowerCase()
      });
      if (draftObj.mediaSelection) {
        localStorage.setItem("smartmark_media_selection", String(draftObj.mediaSelection).toLowerCase());
      }
    };

    try {
      // Priority: session (OAuth bounce)
      const sess = sessionStorage.getItem("draft_form_creatives");
      if (sess) {
        applyDraft(JSON.parse(sess));
        return;
      }

      // Fallback: 24h local draft
      const raw = localStorage.getItem(CREATIVE_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const ageOk = !draft.savedAt || (Date.now() - draft.savedAt <= DRAFT_TTL_MS);
      if (ageOk) applyDraft(draft);
      else localStorage.removeItem(CREATIVE_DRAFT_KEY);
    } catch {}
    // eslint-disable-next-line
  }, []);

  // Handle Facebook oauth return
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("facebook_connected") === "1") {
      setFbConnected(true);
      localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
      window.history.replaceState({}, document.title, "/setup");
    }
  }, [location.search]);

  useEffect(() => {
    if (fbConnected) localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
  }, [fbConnected]);

  // Apply nav creatives to draft (NEVER to existing campaigns)
  useEffect(() => {
    const imgs = Array.isArray(navImageUrls) ? navImageUrls.slice(0, 2) : [];
    const vids = Array.isArray(navVideoUrls) ? navVideoUrls.slice(0, 2) : [];
    const ids  = Array.isArray(navFbVideoIds) ? navFbVideoIds.slice(0, 2) : [];
    if (imgs.length || vids.length || ids.length || navMediaSelection) {
      setDraftCreatives(dc => ({
        images: imgs.length ? imgs : dc.images,
        videos: vids.length ? vids : dc.videos,
        fbVideoIds: ids.length ? ids : dc.fbVideoIds,
        mediaSelection: (navMediaSelection || dc.mediaSelection || "both").toLowerCase()
      }));
      localStorage.setItem("smartmark_media_selection", (navMediaSelection || "both").toLowerCase());
    }
  }, [navImageUrls, navVideoUrls, navFbVideoIds, navMediaSelection]);

  // Fetch ad accounts / pages
  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => setAdAccounts(json.data || []))
      .catch(() => {});
  }, [fbConnected]);

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/pages`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => setPages(json.data || []))
      .catch(() => {});
  }, [fbConnected]);

  // Count campaigns
  useEffect(() => {
    if (!selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data?.data || []);
        const activeCount = list.filter(c => (c.status || c.effective_status) === "ACTIVE" || (c.status || c.effective_status) === "PAUSED").length;
        setCampaignCount(activeCount);
      })
      .catch(() => {});
  }, [selectedAccount]);

  // Load campaigns list
  useEffect(() => {
    if (!fbConnected || !selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const list = (data && data.data) ? data.data.slice(0, 2) : [];
        setCampaigns(list);
        if (!selectedCampaignId && list.length > 0) {
          setSelectedCampaignId(list[0].id);
          setExpandedId(list[0].id);
        }
      })
      .catch(() => {});
  }, [fbConnected, selectedAccount, launched]);

  // Fetch metrics for expanded campaign only
  useEffect(() => {
    if (!expandedId || !selectedAccount || expandedId === "__DRAFT__") return;
    const acctId = String(selectedAccount).replace(/^act_/, "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${expandedId}/metrics`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const row = (Array.isArray(data?.data) && data.data[0]) ? data.data[0] : {};
        const normalized = {
          impressions: row.impressions ? String(row.impressions) : "--",
          clicks: row.clicks ? String(row.clicks) : "--",
          ctr: row.ctr ? String(row.ctr) : "--",
          spend: row.spend ? Number(row.spend) : undefined,
        };
        setMetricsMap(m => ({ ...m, [expandedId]: normalized }));
      })
      .catch(() => setMetricsMap(m => ({ ...m, [expandedId]: { impressions:"--", clicks:"--", ctr:"--" } })));
  }, [expandedId, selectedAccount]);

  // Persist basics
  useEffect(() => { localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify({ ...form, startDate, endDate })); }, [form, startDate, endDate]);
  useEffect(() => { localStorage.setItem("smartmark_last_budget", budget); }, [budget]);
  useEffect(() => { localStorage.setItem("smartmark_login_username", cashapp); }, [cashapp]);
  useEffect(() => { localStorage.setItem("smartmark_login_password", email); }, [email]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_account", selectedAccount); }, [selectedAccount]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_pageId", selectedPageId); }, [selectedPageId]);

  // Pause/Unpause/Delete
  const handlePauseUnpause = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = String(selectedAccount).replace(/^act_/, "");
    setLoading(true);
    try {
      if (isPaused) {
        const r = await fetch(
          `${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/unpause`,
          { method: "POST", credentials: "include" }
        );
        if (!r.ok) throw new Error("Unpause failed");
        setCampaignStatus("ACTIVE");
        setIsPaused(false);
      } else {
        const r = await fetch(
          `${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/pause`,
          { method: "POST", credentials: "include" }
        );
        if (!r.ok) throw new Error("Pause failed");
        setCampaignStatus("PAUSED");
        setIsPaused(true);
      }
    } catch {
      alert("Could not update campaign status.");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = String(selectedAccount).replace(/^act_/, "");
    setLoading(true);
    try {
      const r = await fetch(
        `${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/cancel`,
        { method: "POST", credentials: "include" }
      );
      if (!r.ok) throw new Error("Archive failed");
      setCampaignStatus("ARCHIVED");
      setLaunched(false);
      setLaunchResult(null);
      setSelectedCampaignId("");
      setMetricsMap(m => {
        const { [selectedCampaignId]: _, ...rest } = m;
        return rest;
      });
      alert("Campaign deleted.");
    } catch {
      alert("Could not delete campaign.");
    }
    setLoading(false);
  };

  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    navigate('/form');
  };

  const canLaunch = !!(
    fbConnected &&
    selectedAccount &&
    selectedPageId &&
    budget &&
    !isNaN(parseFloat(budget)) &&
    parseFloat(budget) >= 3
  );

  function capTwoWeeksISO(startISO, endISO) {
    try {
      if (!startISO && !endISO) return { startISO: null, endISO: null };
      const start = startISO ? new Date(startISO) : new Date();
      let end = endISO ? new Date(endISO) : null;
      const maxEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (!end) end = maxEnd;
      if (end > maxEnd) end = maxEnd;
      if (end <= start) end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    } catch { return { startISO: null, endISO: null }; }
  }

  // Launch (uses ONLY the draft creatives; never touches launched campaigns)
  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = String(selectedAccount).replace(/^act_/, "");
      const safeBudget = Math.max(3, Number(budget) || 0);

      const { startISO, endISO } = capTwoWeeksISO(
        startDate ? new Date(startDate).toISOString() : null,
        endDate ? new Date(endDate).toISOString() : null
      );

      const filteredImages = draftCreatives.mediaSelection === "video" ? [] : (draftCreatives.images || []).slice(0,2);
      const filteredVideos = draftCreatives.mediaSelection === "image" ? [] : (draftCreatives.videos || []).slice(0,2);
      const filteredFbIds  = draftCreatives.mediaSelection === "image" ? [] : (draftCreatives.fbVideoIds || []).slice(0,2);

      const payload = {
        form: { ...form },
        budget: safeBudget,
        campaignType: form?.campaignType || "Website Traffic",
        pageId: selectedPageId,
        aiAudience: form?.aiAudience || answers?.aiAudience || "",
        adCopy: (headline || "") + (body ? `\n\n${body}` : ""),
        answers: answers || {},
        mediaSelection: (draftCreatives.mediaSelection || 'both').toLowerCase(),
        imageVariants: filteredImages,
        videoVariants: filteredVideos,
        fbVideoIds: filteredFbIds,
        videoThumbnailUrl: filteredImages[0] || null,
        flightStart: startISO,
        flightEnd: endISO,
        overrideCountPerType: {
          images: Math.min(2, filteredImages.length),
          videos: Math.min(2, Math.max(filteredVideos.length, filteredFbIds.length))
        }
      };

      const res = await fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/launch-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Server error");

      const map = readCreativeMap(acctId);
      if (json.campaignId) {
        map[json.campaignId] = {
          images: filteredImages,
          videos: filteredVideos,
          fbVideoIds: filteredFbIds,
          mediaSelection: (draftCreatives.mediaSelection || 'both').toLowerCase(),
          time: Date.now(),
          name: form.campaignName || "Untitled"
        };
        writeCreativeMap(acctId, map);
      }

      // Clear the draft after successful launch
      sessionStorage.removeItem("draft_form_creatives");
      localStorage.removeItem(CREATIVE_DRAFT_KEY);
      localStorage.removeItem(FORM_DRAFT_KEY);
      setDraftCreatives({ images: [], videos: [], fbVideoIds: [], mediaSelection: "both" });

      setLaunched(true);
      setLaunchResult(json);
      setSelectedCampaignId(json.campaignId || selectedCampaignId);
      setExpandedId(json.campaignId || selectedCampaignId);
      setTimeout(() => setLaunched(false), 1500);
    } catch (err) {
      alert("Failed to launch campaign: " + (err.message || ""));
      console.error(err);
    }
    setLoading(false);
  };

  const openFbPaymentPopup = () => {
    if (!selectedAccount) {
      alert("Please select an ad account first.");
      return;
    }
    const fbPaymentUrl = `https://business.facebook.com/ads/manager/account_settings/account_billing/?act=${selectedAccount}`;
    const width = 540;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      fbPaymentUrl,
      "Add Payment Method",
      `width=${width},height=${height},left=${left},top=${top},resizable,scrollbars`
    );
    if (!popup) {
      alert("Popup blocked! Please allow popups for this site.");
      return;
    }
    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        alert("Payment method window closed. If you added a card, you're good to go!");
      }
    }, 500);
  };

  const { fee, total } = calculateFees(budget);

  // Saved creatives for a launched campaign (infer mediaSelection if missing)
  const getSavedCreatives = (campaignId) => {
    if (!selectedAccount) return { images:[], videos:[], fbVideoIds:[], mediaSelection:"both" };
    const acctKey = String(selectedAccount || "").replace(/^act_/, "");
    const map = readCreativeMap(acctKey);
    const saved = map[campaignId] || null;
    if (!saved) return { images:[], videos:[], fbVideoIds:[], mediaSelection:"both" };

    let mediaSelection = (saved.mediaSelection || "").toLowerCase();
    if (!mediaSelection) {
      const hasImgs = (saved.images || []).length > 0;
      const hasVids = (saved.videos || []).length > 0 || (saved.fbVideoIds || []).length > 0;
      mediaSelection = hasImgs && hasVids ? "both" : hasVids ? "video" : hasImgs ? "image" : "both";
    }

    return {
      images: saved.images || [],
      videos: saved.videos || [],
      fbVideoIds: saved.fbVideoIds || [],
      mediaSelection
    };
  };

  // ---------- Render ----------
  // compact date wheels helpers
  const yearNow = new Date().getFullYear() % 100;
  const years = [yearNow, yearNow + 1];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const daysFor = (m, y2) => {
    const y = 2000 + y2;
    const max = new Date(y, m, 0).getDate();
    return Array.from({ length: max }, (_, i) => i + 1);
  };

  // Compose right-pane rows: existing campaigns (max 2) + draft if present
  const hasDraft =
    (draftCreatives.images && draftCreatives.images.length) ||
    (draftCreatives.videos && draftCreatives.videos.length) ||
    (draftCreatives.fbVideoIds && draftCreatives.fbVideoIds.length);

  const rightPaneCampaigns = [
    ...campaigns.map(c => ({ ...c, __isDraft:false })),
    ...(hasDraft ? [{ id:"__DRAFT__", name: (form.campaignName || "Untitled"), __isDraft:true }] : [])
  ].slice(0, 2 + (hasDraft ? 1 : 0));

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: DARK_BG,
        fontFamily: MODERN_FONT,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowX: "hidden"
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "32px 36px 0 36px",
          boxSizing: "border-box",
        }}
      >
        <button
          onClick={() => navigate('/form')}
          style={{
            background: "#202824e0",
            color: "#fff",
            border: "none",
            borderRadius: "1.3rem",
            padding: "0.72rem 1.8rem",
            fontWeight: 700,
            fontSize: "1.08rem",
            letterSpacing: "0.7px",
            cursor: "pointer",
            boxShadow: "0 2px 10px 0 rgba(24,84,49,0.13)",
          }}
        >
          ← Back
        </button>
        <button
          onClick={() => navigate('/')}
          style={{
            background: "#232828",
            color: "#fff",
            border: "none",
            borderRadius: "1.3rem",
            padding: "0.72rem 1.8rem",
            fontWeight: 700,
            fontSize: "1.08rem",
            letterSpacing: "0.7px",
            cursor: "pointer",
            boxShadow: "0 2px 10px 0 rgba(24,84,49,0.13)",
          }}
        >
          Home
        </button>
      </div>

      {/* MAIN */}
      <div
        style={{
          width: "100vw",
          maxWidth: "1550px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "flex-start",
          justifyContent: "center",
          marginTop: isMobile ? 80 : 90,
          gap: isMobile ? 32 : 64,
          padding: isMobile ? "0 4vw" : "0 36px",
          minHeight: "92vh"
        }}
      >
        {/* LEFT PANE */}
        <main style={{
          background: EDGE_BG,
          borderRadius: "2.2rem",
          boxShadow: "0 12px 52px 0 rgba(30,200,133,0.13)",
          padding: isMobile ? "2.4rem 1.2rem" : "3.7rem 2.6rem",
          minWidth: isMobile ? "99vw" : 520,
          maxWidth: isMobile ? "100vw" : 600,
          flex: "0 1 590px",
          display: "flex",
          flexDirection: "column",
          gap: "2.2rem",
          alignItems: "center",
          marginBottom: isMobile ? 30 : 0,
          position: "relative",
          minHeight: "600px",
        }}>
          {/* Facebook Connect */}
          <button
            onClick={() => {
              window.location.href = `${backendUrl}/auth/facebook`;
              setFbConnected(true);
              localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
            }}
            style={{
              padding: "1.15rem 2.8rem",
              borderRadius: "1.5rem",
              border: "none",
              background: fbConnected ? ACCENT_ALT : "#1877F2",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.25rem",
              boxShadow: "0 2px 12px #1877f233",
              letterSpacing: "1px",
              cursor: "pointer",
              width: "100%",
              maxWidth: 370,
              margin: "0 auto",
              display: "block",
              transition: "background 0.23s"
            }}
          >
            {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
          </button>

          {/* Payment Method */}
          <button
            onClick={openFbPaymentPopup}
            style={{
              width: "100%",
              maxWidth: 370,
              margin: "0 auto",
              display: "block",
              background: "#202824e0",
              color: "#fff",
              border: "none",
              borderRadius: "1.3rem",
              padding: "0.9rem 1.6rem",
              fontWeight: 800,
              fontSize: "1.05rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px 0 rgba(24,84,49,0.13)"
            }}
            title="Add Payment Method in Facebook Ads"
          >
            Add Payment Method
          </button>

          {/* Campaign Name — minimalist pill style, typable */}
          <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ color: "#fff", fontWeight: 800, fontSize: "1.10rem" }}>
              Campaign Name
            </div>
            <div style={{
              width: "100%",
              background: "#1f2523",
              borderRadius: "0.9rem",
              padding: "0.2rem",
              display: "flex",
              alignItems: "center"
            }}>
              <input
                type="text"
                value={form.campaignName || ""}
                onChange={e => setForm({ ...form, campaignName: e.target.value })}
                placeholder="Type a name..."
                style={{
                  flex: 1,
                  padding: "0.9rem 1.0rem",
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  color: "#c9ffe9",
                  fontWeight: 800,
                  fontSize: "1.06rem",
                  letterSpacing: 0.2
                }}
              />
            </div>
          </div>

          {/* Campaign Duration — COMPACT WHEELS (exact look) */}
          <div style={{ width:"100%", maxWidth:370, margin:"6px auto 0 auto", display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ color:"#fff", fontWeight:800, fontSize:"1.10rem" }}>Campaign Duration</div>

            {/* Compact wheels */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:12 }}>
              {/* Start */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ color:"#c9ffe9", fontWeight:700, fontSize:"0.95rem" }}>Start</label>
                <div style={{
                  display:"flex", gap:10, alignItems:"center",
                  padding:"8px 10px", borderRadius:12, background:"#1b1f22"
                }}>
                  {/* MM */}
                  <Picker
                    value={sMonth}
                    options={months}
                    onChange={setSMonth}
                  />
                  <Sep />
                  {/* DD */}
                  <Picker
                    value={sDay}
                    options={daysFor(sMonth, sYear)}
                    onChange={setSDay}
                  />
                  <Sep />
                  {/* YY */}
                  <Picker
                    value={sYear}
                    options={years}
                    onChange={setSYear}
                  />
                </div>
              </div>

              {/* End */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ color:"#c9ffe9", fontWeight:700, fontSize:"0.95rem" }}>End</label>
                <div style={{
                  display:"flex", gap:10, alignItems:"center",
                  padding:"8px 10px", borderRadius:12, background:"#1b1f22"
                }}>
                  <Picker value={eMonth} options={months} onChange={setEMonth} />
                  <Sep />
                  <Picker value={eDay} options={daysFor(eMonth, eYear)} onChange={setEDay} />
                  <Sep />
                  <Picker value={eYear} options={years} onChange={setEYear} />
                </div>
              </div>
            </div>

            <div style={{ color:"#9fe9c8", fontWeight:700, fontSize:"0.92rem" }}>
              Max duration is 14 days. End will auto-adjust if needed.
            </div>
          </div>

          {/* Budget */}
          <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem", marginBottom: 7, alignSelf: "flex-start" }}>
              Campaign Budget ($)
            </label>
            <input
              type="number"
              placeholder="Enter budget (minimum $3)"
              min={3}
              step={1}
              value={budget}
              onChange={e => setBudget(e.target.value)}
              style={{
                padding: "1rem 1.1rem",
                borderRadius: "1.1rem",
                border: "1.2px solid #57dfa9",
                fontSize: "1.14rem",
                background: INPUT_BG,
                color: TEXT_DIM,
                marginBottom: "0.6rem",
                outline: "none",
                width: "100%"
              }}
            />
            <div style={{ color: "#afeca3", fontWeight: 700, marginBottom: 8 }}>
              SmartMark Fee: <span style={{ color: ACCENT_ALT }}>${calculateFees(budget).fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${calculateFees(budget).total.toFixed(2)}</span>
            </div>

            {/* Pay + credentials (simple, only when budget valid) */}
            {parseFloat(budget) >= 3 && (
              <div style={{ width: "100%", display:"flex", flexDirection:"column", gap:10, marginTop: 6 }}>
                <button
                  onClick={() => window.open("https://cash.app", "_blank")}
                  style={{
                    background: "#14e7b9",
                    color: "#181b20",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 800,
                    padding: "10px 16px",
                    cursor: "pointer",
                    boxShadow: "0 2px 12px #0cc4be44"
                  }}
                >
                  Pay ${calculateFees(budget).fee.toFixed(0)}
                </button>

                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <label style={{ color:"#c9ffe9", fontWeight:700, fontSize:"0.95rem" }}>Cashtag (your username)</label>
                  <input
                    type="text"
                    value={cashapp}
                    onChange={e => setCashapp(e.target.value)}
                    placeholder="$yourcashtag"
                    style={{
                      padding:"0.85rem 1rem", borderRadius:10, border:"1.2px solid #57dfa9",
                      background: INPUT_BG, color: TEXT_DIM, outline:"none"
                    }}
                  />
                </div>

                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <label style={{ color:"#c9ffe9", fontWeight:700, fontSize:"0.95rem" }}>Email (used as password)</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      padding:"0.85rem 1rem", borderRadius:10, border:"1.2px solid #57dfa9",
                      background: INPUT_BG, color: TEXT_DIM, outline:"none"
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Launch */}
          <button
            onClick={handleLaunch}
            disabled={loading || campaignCount >= 2 || !canLaunch}
            style={{
              background: (campaignCount >= 2 || !canLaunch) ? "#8b8d90" : ACCENT,
              color: "#181b20",
              border: "none",
              borderRadius: 13,
              fontWeight: 700,
              fontSize: "1.19rem",
              padding: "18px 72px",
              marginBottom: 18,
              marginTop: 12,
              boxShadow: "0 2px 16px #0cc4be24",
              cursor: (loading || campaignCount >= 2 || !canLaunch) ? "not-allowed" : "pointer",
              transition: "background 0.18s",
              opacity: (loading || campaignCount >= 2 || !canLaunch) ? 0.6 : 1
            }}
          >
            {campaignCount >= 2 ? "Limit Reached" : "Launch Campaign"}
          </button>

          {launched && launchResult && (
            <div style={{
              color: "#1eea78",
              fontWeight: 800,
              marginTop: "1.2rem",
              fontSize: "1.15rem",
              textShadow: "0 2px 8px #0a893622"
            }}>
              Campaign launched! ID: {launchResult.campaignId || "--"}
            </div>
          )}
        </main>

        {/* RIGHT PANE */}
        <aside style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: isMobile ? "center" : "flex-start",
          width: isMobile ? "100vw" : "100%",
          marginTop: isMobile ? 36 : 0,
          gap: "2.0rem",
          minWidth: isMobile ? "100vw" : 400,
          maxWidth: 540,
        }}>
          <div
            style={{
              background: CARD_BG,
              borderRadius: "1.4rem",
              padding: isMobile ? "2rem 1.2rem" : "2.1rem 2rem 2.3rem 2rem",
              color: TEXT_MAIN,
              fontWeight: 700,
              width: isMobile ? "97vw" : "100%",
              maxWidth: "99vw",
              boxShadow: "0 2px 24px #183a2a13",
              display: "flex",
              flexDirection: "column",
              gap: "1.0rem",
              alignItems: "flex-start",
              minHeight: "600px",
            }}
          >
            {/* Top row: Title + controls */}
            <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:"1.23rem", fontWeight: 900, color: "#fff" }}>
                Active Campaigns
              </div>
              <div style={{ display: "flex", gap: "0.7rem" }}>
                <button
                  onClick={handlePauseUnpause}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: isPaused ? "#22dd7f" : "#ffd966",
                    color: "#181b20",
                    border: "none",
                    borderRadius: 9,
                    fontWeight: 900,
                    fontSize: 22,
                    width: 36, height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title={isPaused ? "Play" : "Pause"}
                >
                  {isPaused ? <FaPlay /> : <FaPause />}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: "#f44336",
                    color: "#fff",
                    border: "none",
                    borderRadius: 9,
                    fontWeight: 900,
                    fontSize: 19,
                    width: 36, height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                  title="Delete"
                >
                  <FaTrash />
                </button>
                {campaigns.length < 2 && (
                  <button
                    onClick={handleNewCampaign}
                    style={{
                      background: ACCENT_ALT,
                      color: "#fff",
                      border: "none",
                      borderRadius: 9,
                      fontWeight: 900,
                      fontSize: 22,
                      width: 36, height: 36,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                    title="New Campaign"
                  >
                    <FaPlus />
                  </button>
                )}
              </div>
            </div>

            {/* Campaign rows (existing + Draft “In progress”) */}
            <div style={{ width:"100%", display:"flex", flexDirection:"column", gap:10 }}>
              {rightPaneCampaigns.map(c => {
                const isDraft = !!c.__isDraft;
                const id = c.id;
                const isOpen = expandedId === id;
                const name = isDraft ? (form.campaignName || "Untitled") : (c.name || "Campaign");
                const creatives = isDraft ? draftCreatives : getSavedCreatives(id);
                const showImages = creatives.mediaSelection === "image" || creatives.mediaSelection === "both";
                const showVideos = creatives.mediaSelection === "video" || creatives.mediaSelection === "both";

                return (
                  <div key={id} style={{
                    width:"100%",
                    background:"#232a28",
                    borderRadius:"0.9rem",
                    padding:"0.7rem",
                    boxShadow: "0 2px 12px #193a2a13"
                  }}>
                    {/* Row header */}
                    <div
                      onClick={() => {
                        setExpandedId(isOpen ? null : id);
                        if (!isDraft) setSelectedCampaignId(id);
                      }}
                      style={{
                        display:"flex",
                        alignItems:"center",
                        justifyContent:"space-between",
                        cursor:"pointer",
                        padding:"0.5rem 0.6rem",
                        borderRadius:8,
                        background:"#1f2523"
                      }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:10, color:"#fff", fontWeight:800 }}>
                        <FaChevronDown
                          style={{
                            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.18s"
                          }}
                        />
                        <span>{name}</span>
                        {isDraft && (
                          <span style={{
                            marginLeft:8,
                            padding:"2px 8px",
                            borderRadius:999,
                            background:"#2d5b45",
                            color:"#aef4da",
                            fontSize:11,
                            fontWeight:900,
                            letterSpacing:0.5
                          }}>
                            IN&nbsp;PROGRESS
                          </span>
                        )}
                      </div>
                      {!isDraft && (
                        <div style={{ color:"#89f0cc", fontSize:12, fontWeight:800 }}>
                          {(c.status || c.effective_status || "ACTIVE")}
                        </div>
                      )}
                    </div>

                    {/* Row contents */}
                    {isOpen && (
                      <div style={{ marginTop:10, display:"flex", flexDirection:"column", gap:10 }}>
                        {!isDraft && (
                          <div style={{ width:"100%" }}>
                            <MetricsRow metrics={metricsMap[id]} />
                          </div>
                        )}

                        {/* Creatives */}
                        <div style={{
                          width: "100%",
                          background: PANEL_BG,
                          borderRadius: "1.0rem",
                          padding: "0.9rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          marginTop: 6
                        }}>
                          <div style={{ color: TEXT_MAIN, fontWeight: 800, fontSize: "1.02rem", marginBottom: 2 }}>
                            Creatives
                          </div>

                          {/* Images Card */}
                          {showImages && (
                            <div style={{
                              background:"#fff", borderRadius:12, border:"1.2px solid #eaeaea",
                              overflow:"hidden", boxShadow:"0 2px 16px #16242714"
                            }}>
                              <div style={{
                                background:"#f5f6fa", padding:"8px 12px", borderBottom:"1px solid #e0e4eb",
                                display:"flex", justifyContent:"space-between", alignItems:"center", color:"#495a68", fontWeight:700, fontSize: "0.96rem"
                              }}>
                                <span>Images</span>
                              </div>
                              <ImageCarousel
                                items={creatives.images}
                                height={CREATIVE_HEIGHT}
                                onFullscreen={(url) => { setModalImg(url); setShowImageModal(true); }}
                              />
                            </div>
                          )}

                          {/* Videos Card */}
                          {showVideos && (
                            <div style={{
                              background:"#fff", borderRadius:12, border:"1.2px solid #eaeaea",
                              overflow:"hidden", boxShadow:"0 2px 16px #16242714"
                            }}>
                              <div style={{
                                background:"#f5f6fa", padding:"8px 12px", borderBottom:"1px solid #e0e4eb",
                                display:"flex", justifyContent:"space-between", alignItems:"center", color:"#495a68", fontWeight:700, fontSize: "0.96rem"
                              }}>
                                <span>Videos</span>
                                {(!creatives.videos || creatives.videos.length === 0) ? <DottyMini/> : null}
                              </div>
                              <VideoCarousel items={creatives.videos} height={CREATIVE_HEIGHT} />
                            </div>
                          )}

                          {!showImages && !showVideos && (
                            <div style={{ color:"#c9d7d2", fontWeight:700, padding:"8px 4px" }}>
                              No creatives saved for this campaign yet.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Ad Account & Page Selectors (outside campaign rows) */}
            <div style={{
              width: "100%", marginTop: 16, background: "#242628", borderRadius: "1.1rem", padding: "1.1rem",
              display: "flex", flexDirection: "column", gap: 14
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: "1.01rem", color: "#fff" }}>Ad Account</div>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  style={{
                    padding: "0.7rem",
                    borderRadius: "1.1rem",
                    fontSize: "1.07rem",
                    width: "100%",
                    outline: "none",
                    border: "1.5px solid #2e5c44",
                    background: "#2c2f33",
                    color: "#c7fbe3",
                    marginTop: 5
                  }}>
                  <option value="">Select an ad account</option>
                  {adAccounts.map(ac => (
                    <option key={ac.id} value={ac.id.replace("act_", "")}>
                      {ac.name ? `${ac.name} (${ac.id.replace("act_", "")})` : ac.id.replace("act_", "")}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: "1.01rem", color: "#fff" }}>Facebook Page</div>
                <select
                  value={selectedPageId}
                  onChange={e => setSelectedPageId(e.target.value)}
                  style={{
                    padding: "0.7rem",
                    borderRadius: "1.1rem",
                    fontSize: "1.07rem",
                    width: "100%",
                    outline: "none",
                    border: "1.5px solid #2e5c44",
                    background: "#2c2f33",
                    color: "#c7fbe3",
                    marginTop: 5
                  }}>
                  <option value="">Select a page</option>
                  {pages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Image modal viewer */}
          <ImageModal open={showImageModal} imageUrl={modalImg} onClose={() => setShowImageModal(false)} />
        </aside>
      </div>
    </div>
  );
};

/* ---------- tiny UI helpers for compact wheels ---------- */
function Picker({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      style={{
        appearance: "none",
        WebkitAppearance: "none",
        MozAppearance: "none",
        background: "transparent",
        border: "none",
        color: "#c7fbe3",
        fontWeight: 900,
        fontSize: "1.05rem",
        padding: "4px 8px",
        outline: "none",
        maxHeight: 120,
        overflowY: "auto",
        scrollbarWidth: "none"
      }}
    >
      {options.map(v => (
        <option key={v} value={v} style={{ background:"#1b1f22", color:"#c7fbe3" }}>
          {String(v).padStart(2,"0")}
        </option>
      ))}
    </select>
  );
}
function Sep() {
  return <div style={{ width:2, height:22, background:"#2a3236", borderRadius:2 }} />;
}

export default CampaignSetup;
