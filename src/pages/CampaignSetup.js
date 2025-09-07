/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown } from "react-icons/fa";

const backendUrl = "https://smartmark-mvp.onrender.com";

/* ======================= Visual Theme (polish only) ======================= */
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const DARK_BG = "#11161c";           // page background (slightly cooler than landing for variety)
const GLOW_TEAL = "rgba(20,231,185,0.22)";
const CARD_BG = "rgba(27, 32, 37, 0.92)";
const EDGE_BG = "rgba(35, 39, 42, 0.85)";
const PANEL_BG = "#1c2126";
const INPUT_BG = "#1b1f23";
const INPUT_BORDER = "rgba(255,255,255,0.06)";
const TEXT_MAIN = "#ecfff6";
const TEXT_DIM = "#bdfdf0";
const TEXT_MUTED = "#9ddfcd";
const ACCENT = "#14e7b9";
const ACCENT_ALT = "#1ec885";
const WHITE = "#ffffff";

const CREATIVE_HEIGHT = 150;

/* ======================= (unchanged business constants) ======================= */
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const CREATIVE_DRAFT_KEY = "draft_form_creatives_v2";
const FORM_DRAFT_KEY = "sm_form_draft_v2";

/* ---------------- DEV NOTE ----------------
   To ensure NO auto-redirects to /login while you test,
   there is deliberately NO auth-guard here.
-------------------------------------------- */

/* Responsive helper (unchanged) */
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

/* FB connection flag (unchanged) */
const FB_CONN_KEY = "smartmark_fb_connected";
const FB_CONN_MAX_AGE = 3 * 24 * 60 * 60 * 1000;

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
      background: "rgba(10,14,17,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{
        position: "relative", maxWidth: "88vw", maxHeight: "88vh",
        borderRadius: 18, background: "#12171b", padding: 0, boxShadow: "0 10px 60px #000c"
      }}>
        <img
          src={src || ""}
          alt="Full-screen"
          style={{ maxWidth: "84vw", maxHeight: "80vh", display: "block", borderRadius: 14, background: "#0f1215" }}
        />
        <button
          style={{
            position: "absolute", top: 12, right: 18, background: "#1b242a",
            border: "1px solid rgba(255,255,255,0.06)", color: WHITE, borderRadius: 11, padding: "9px 17px",
            fontWeight: 800, fontSize: 15, cursor: "pointer", boxShadow: "0 1px 6px #14e7b933"
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

/* ---- helpers for Image/Video carousels (unchanged logic) ---- */
const navBtn = (dir) => ({
  position:"absolute",
  top:"50%",
  transform:"translateY(-50%)",
  [dir < 0 ? "left" : "right"]: 8,
  background:"rgba(0,0,0,0.55)",
  color:"#fff",
  border:"none",
  borderRadius:10,
  width:28, height:28,
  fontSize:16, fontWeight:900,
  cursor:"pointer",
  zIndex: 2
});
const badge = {
  position:"absolute", bottom:6, right:6,
  background:"rgba(0,0,0,0.55)", color:"#fff",
  borderRadius:8, padding:"2px 6px", fontSize:11, fontWeight:900,
  zIndex: 2
};

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

function VideoCarousel({ items = [], height = 220 }) {
  const [idx, setIdx] = useState(0);
  const normalized = (items || [])
    .map(u => (u && !/^https?:\/\//.test(u) ? `${backendUrl}${u}` : String(u || "").trim()))
    .filter(Boolean);

  useEffect(() => { if (idx >= normalized.length) setIdx(0); }, [normalized, idx]);

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

/* ---------- Minimal metrics row (unchanged logic, refreshed styles) ---------- */
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
    background: "#1e252a",
    border: "1px solid rgba(255,255,255,0.06)",
    color: "#eafff6",
    borderRadius: 14,
    padding: "10px 12px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 6,
    boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
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
            <div style={{ fontSize:12, color:TEXT_MUTED, fontWeight:900, letterSpacing:0.3 }}>{c.label}</div>
            <div style={{ fontSize:20, fontWeight:900 }}>{c.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ======================================================================= */
/* ============================== MAIN =================================== */
/* ======================================================================= */
const CampaignSetup = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  /* ---------------------------- State (unchanged) ---------------------------- */
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

  // NO auth-guard useEffect here. You can visit /setup freely.

  const touchFbConn = () => {
    try { localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() })); } catch {}
  };

  useEffect(() => {
    const saved = localStorage.getItem(FB_CONN_KEY);
    if (!saved) return;
    const { connected, time } = JSON.parse(saved);
    if (!connected) return;
    if (Date.now() - time > FB_CONN_MAX_AGE) {
      localStorage.removeItem(FB_CONN_KEY);
      setFbConnected(false);
      return;
    }
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(() => { setFbConnected(true); touchFbConn(); })
      .catch(() => { localStorage.removeItem(FB_CONN_KEY); setFbConnected(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const [expandedId, setExpandedId] = useState(null);

  const [draftCreatives, setDraftCreatives] = useState({
    images: [],
    videos: [],
    fbVideoIds: [],
    mediaSelection: (location.state?.mediaSelection || localStorage.getItem("smartmark_media_selection") || "both").toLowerCase()
  });

  const {
    imageUrls: navImageUrls,
    videoUrls: navVideoUrls,
    fbVideoIds: navFbVideoIds,
    headline,
    body,
    answers,
    mediaSelection: navMediaSelection
  } = location.state || {};

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

  useEffect(() => {
    const clampDay = (m, y2) => {
      const y = 2000 + y2;
      return new Date(y, m, 0).getDate();
    };
    const sdMaxDay = clampDay(sMonth, sYear);
    const sD = Math.min(sDay, sdMaxDay);
    const sISO = new Date(2000 + sYear, sMonth - 1, sD, 9, 0, 0).toISOString().slice(0,16);
    setStartDate(sISO);

    const edMaxDay = clampDay(eMonth, eYear);
    const eD = Math.min(eDay, edMaxDay);
    let eISO = new Date(2000 + eYear, eMonth - 1, eD, 18, 0, 0).toISOString().slice(0,16);

    eISO = clampEndForStart(sISO, eISO);
    setEndDate(eISO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sMonth, sDay, sYear, eMonth, eDay, eYear]);

  useEffect(() => {
    const lastFields = localStorage.getItem("smartmark_last_campaign_fields");
    if (lastFields) {
      const f = JSON.parse(lastFields);
      setForm(f);
      if (f.startDate) setStartDate(f.startDate);
      if (f.endDate) setEndDate(clampEndForStart(f.startDate || startDate, f.endDate));
    }

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
      const sess = sessionStorage.getItem("draft_form_creatives");
      if (sess) {
        applyDraft(JSON.parse(sess));
        return;
      }
      const raw = localStorage.getItem(CREATIVE_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const ageOk = !draft.savedAt || (Date.now() - draft.savedAt <= DRAFT_TTL_MS);
      if (ageOk) applyDraft(draft);
      else localStorage.removeItem(CREATIVE_DRAFT_KEY);
    } catch {}
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    const hasDraft =
      (draftCreatives.images && draftCreatives.images.length) ||
      (draftCreatives.videos && draftCreatives.videos.length) ||
      (draftCreatives.fbVideoIds && draftCreatives.fbVideoIds.length);
    if (!hasDraft) return;
    try {
      localStorage.setItem(
        CREATIVE_DRAFT_KEY,
        JSON.stringify({ ...draftCreatives, savedAt: Date.now() })
      );
    } catch {}
  }, [draftCreatives]);

  const handleClearDraft = () => {
    try { sessionStorage.removeItem("draft_form_creatives"); } catch {}
    try { localStorage.removeItem(CREATIVE_DRAFT_KEY); } catch {}
    try { localStorage.removeItem(FORM_DRAFT_KEY); } catch {}
    try { localStorage.removeItem("smartmark_media_selection"); } catch {}
    setDraftCreatives({ images: [], videos: [], fbVideoIds: [], mediaSelection: "both" });
    if (expandedId === "__DRAFT__") setExpandedId(null);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("facebook_connected") === "1") {
      setFbConnected(true);
      try { localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() })); } catch {}
      window.history.replaceState({}, document.title, "/setup");
    }
  }, [location.search]);

  useEffect(() => {
    if (fbConnected) {
      try { localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() })); } catch {}
    }
  }, [fbConnected]);

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

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => { setAdAccounts(json.data || []); touchFbConn(); })
      .catch(() => {});
  }, [fbConnected]);

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/pages`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => { setPages(json.data || []); touchFbConn(); })
      .catch(() => {});
  }, [fbConnected]);

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

  useEffect(() => { localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify({ ...form, startDate, endDate })); }, [form, startDate, endDate]);
  useEffect(() => { localStorage.setItem("smartmark_last_budget", budget); }, [budget]);
  useEffect(() => { localStorage.setItem("smartmark_login_username", cashapp); }, [cashapp]);
  useEffect(() => { localStorage.setItem("smartmark_login_password", email); }, [email]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_account", selectedAccount); }, [selectedAccount]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_pageId", selectedPageId); }, [selectedPageId]);

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

  /* ---------- Render helpers ---------- */
  const yearNow = new Date().getFullYear() % 100;
  const years = [yearNow, yearNow + 1];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const daysFor = (m, y2) => {
    const y = 2000 + y2;
    const max = new Date(y, m, 0).getDate();
    return Array.from({ length: max }, (_, i) => i + 1);
  };

  const hasDraft =
    (draftCreatives.images && draftCreatives.images.length) ||
    (draftCreatives.videos && draftCreatives.videos.length) ||
    (draftCreatives.fbVideoIds && draftCreatives.fbVideoIds.length);

  const rightPaneCampaigns = [
    ...campaigns.map(c => ({ ...c, __isDraft:false })),
    ...(hasDraft ? [{ id:"__DRAFT__", name: (form.campaignName || "Untitled"), __isDraft:true }] : [])
  ].slice(0, 2 + (hasDraft ? 1 : 0));

  /* ================================ UI ================================ */
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
        overflowX: "hidden"
      }}
    >
      {/* subtle teal glow background like other pages */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          top: "-18vh",
          right: "-12vw",
          width: 720,
          height: 720,
          background: `radial-gradient(40% 40% at 50% 50%, ${GLOW_TEAL}, transparent 70%)`,
          filter: "blur(20px)",
          pointerEvents: "none",
          zIndex: 0
        }}
      />

      {/* Top bar + centered title */}
      <div style={{ width: "100%", maxWidth: 1180, padding: "22px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "space-between" }}>
          <button
            onClick={() => navigate('/form')}
            style={{
              background: "#202824e0",
              color: WHITE,
              border: `1px solid ${INPUT_BORDER}`,
              borderRadius: "1.1rem",
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: "1rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
            }}
          >
            ← Back
          </button>

          <button
            onClick={() => navigate('/')}
            style={{
              background: "#232828",
              color: WHITE,
              border: `1px solid ${INPUT_BORDER}`,
              borderRadius: "1.1rem",
              padding: "10px 18px",
              fontWeight: 800,
              fontSize: "1rem",
              letterSpacing: "0.6px",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(0,0,0,0.25)"
            }}
          >
            Home
          </button>
        </div>

        {/* Centered page heading */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: "2.15rem",
              lineHeight: 1.2,
              letterSpacing: "-0.4px",
              fontWeight: 900,
              background: `linear-gradient(90deg, #ffffff, ${ACCENT})`,
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              textAlign: "center"
            }}
          >
            Campaign Setup
          </h1>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div
        style={{
          width: "100vw",
          maxWidth: "1550px",
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          alignItems: "flex-start",
          justifyContent: "center",
          marginTop: isMobile ? 56 : 64,
          gap: isMobile ? 28 : 52,
          padding: isMobile ? "0 4vw 40px" : "0 36px 48px",
          minHeight: "92vh",
          position: "relative",
          zIndex: 1
        }}
      >
        {/* LEFT PANE (forms) — visual only */}
        <main style={{
          background: EDGE_BG,
          border: `1px solid ${INPUT_BORDER}`,
          borderRadius: "22px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
          padding: isMobile ? "24px 16px" : "32px 26px",
          minWidth: isMobile ? "98vw" : 520,
          maxWidth: isMobile ? "100vw" : 600,
          flex: "0 1 590px",
          display: "flex",
          flexDirection: "column",
          gap: "22px",
          alignItems: "center",
          marginBottom: isMobile ? 24 : 0,
          minHeight: "600px",
        }}>
          {/* Facebook Connect */}
          <button
            onClick={() => {
              window.location.href = `${backendUrl}/auth/facebook`;
              setFbConnected(true);
              try { localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() })); } catch {}
            }}
            style={{
              padding: "14px 22px",
              borderRadius: "14px",
              border: "none",
              background: fbConnected ? ACCENT_ALT : "#1877F2",
              color: WHITE,
              fontWeight: 900,
              fontSize: "1.08rem",
              boxShadow: "0 2px 12px rgba(24,119,242,0.35)",
              letterSpacing: "0.4px",
              cursor: "pointer",
              width: "100%",
              maxWidth: 420,
              transition: "transform 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
          </button>

          {/* Add Payment Method */}
          <button
            onClick={openFbPaymentPopup}
            style={{
              width: "100%",
              maxWidth: 420,
              padding: "12px 16px",
              borderRadius: "14px",
              border: "none",
              background: "#2f7a5d",
              color: WHITE,
              fontWeight: 900,
              fontSize: "1rem",
              cursor: "pointer",
              boxShadow: "0 2px 10px rgba(12,63,46,0.5)",
              transition: "transform 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
            onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
          >
            Add Payment Method
          </button>

          {/* Campaign Name */}
          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ color: WHITE, fontWeight: 800, fontSize: "1.02rem" }}>
              Campaign Name
            </label>
            <div style={{ background: INPUT_BG, borderRadius: 12, padding: "10px 12px", border: `1px solid ${INPUT_BORDER}` }}>
              <input
                type="text"
                value={form.campaignName || ""}
                onChange={e => setForm({ ...form, campaignName: e.target.value })}
                placeholder="Type a name..."
                style={{
                  background:"transparent",
                  border:"none",
                  outline:"none",
                  width:"100%",
                  color: TEXT_DIM,
                  fontSize:"1.02rem",
                  fontWeight:800
                }}
              />
            </div>
          </div>

          {/* Campaign Duration */}
          <div style={{ width:"100%", maxWidth:420, display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ color: WHITE, fontWeight: 900, fontSize: "1.02rem" }}>Campaign Duration</div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:12 }}>
              {/* Start */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ color:TEXT_MUTED, fontWeight:800, fontSize:"0.92rem" }}>Start</label>
                <div style={{
                  display:"flex", gap:10, alignItems:"center",
                  padding:"8px 10px", borderRadius:12, background:INPUT_BG, border:`1px solid ${INPUT_BORDER}`
                }}>
                  <Picker value={sMonth} options={months} onChange={setSMonth} />
                  <Sep />
                  <Picker value={sDay} options={daysFor(sMonth, sYear)} onChange={setSDay} />
                  <Sep />
                  <Picker value={sYear} options={years} onChange={setSYear} />
                </div>
              </div>

              {/* End */}
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                <label style={{ color:TEXT_MUTED, fontWeight:800, fontSize:"0.92rem" }}>End</label>
                <div style={{
                  display:"flex", gap:10, alignItems:"center",
                  padding:"8px 10px", borderRadius:12, background:INPUT_BG, border:`1px solid ${INPUT_BORDER}`
                }}>
                  <Picker value={eMonth} options={months} onChange={setEMonth} />
                  <Sep />
                  <Picker value={eDay} options={daysFor(eMonth, eYear)} onChange={setEDay} />
                  <Sep />
                  <Picker value={eYear} options={years} onChange={setEYear} />
                </div>
              </div>
            </div>

            <div style={{ color: "#9fe9c8", fontWeight: 700, fontSize: "0.9rem" }}>
              Max duration is 14 days. End will auto-adjust if needed.
            </div>
          </div>

          {/* Budget + payment + creds */}
          <div style={{ width: "100%", maxWidth: 420, display: "flex", flexDirection: "column", gap: 10 }}>
            <label style={{ color: WHITE, fontWeight: 800, fontSize: "1.02rem" }}>
              Campaign Budget ($)
            </label>
            <div style={{ background: INPUT_BG, borderRadius: 12, padding: "10px 12px", border: `1px solid ${INPUT_BORDER}` }}>
              <input
                type="number"
                placeholder="Enter budget (minimum $3)"
                min={3}
                step={1}
                value={budget}
                onChange={e => setBudget(e.target.value)}
                style={{
                  background:"transparent",
                  border:"none",
                  outline:"none",
                  width:"100%",
                  color: TEXT_DIM,
                  fontSize:"1.02rem",
                  fontWeight:800
                }}
              />
            </div>
            <div style={{ color: "#b7f5c2", fontWeight: 800 }}>
              SmartMark Fee: <span style={{ color: ACCENT_ALT }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: WHITE }}>${total.toFixed(2)}</span>
            </div>

            {parseFloat(budget) >= 3 && (
              <div style={{ width: "100%", display:"flex", flexDirection:"column", gap:10 }}>
                <button
                  onClick={() => window.open("https://cash.app", "_blank")}
                  style={{
                    background: ACCENT,
                    color: "#0f1418",
                    border: "none",
                    borderRadius: 12,
                    fontWeight: 900,
                    padding: "10px 16px",
                    cursor: "pointer",
                    boxShadow: "0 2px 12px rgba(12,196,190,0.35)",
                    transition: "transform 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  Pay ${calculateFees(budget).fee.toFixed(0)}
                </button>

                <div>
                  <label style={{ color:TEXT_MUTED, fontWeight:800, fontSize:"0.92rem" }}>Cashtag (your username)</label>
                  <div style={{ background: INPUT_BG, borderRadius: 12, padding: "10px 12px", marginTop: 6, border:`1px solid ${INPUT_BORDER}` }}>
                    <input
                      type="text"
                      value={cashapp}
                      onChange={e => setCashapp(e.target.value)}
                      placeholder="$yourcashtag"
                      style={{
                        background:"transparent",
                        border:"none",
                        outline:"none",
                        width:"100%",
                        color: TEXT_DIM,
                        fontSize:"1rem",
                        fontWeight:800
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ color:TEXT_MUTED, fontWeight:800, fontSize:"0.92rem" }}>Email (used as password)</label>
                  <div style={{ background: INPUT_BG, borderRadius: 12, padding: "10px 12px", marginTop: 6, border:`1px solid ${INPUT_BORDER}` }}>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      style={{
                        background:"transparent",
                        border:"none",
                        outline:"none",
                        width:"100%",
                        color: TEXT_DIM,
                        fontSize:"1rem",
                        fontWeight:800
                      }}
                    />
                  </div>
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
              color: "#0f1418",
              border: "none",
              borderRadius: 14,
              fontWeight: 900,
              fontSize: "1.02rem",
              padding: "14px 36px",
              marginTop: 6,
              boxShadow: "0 2px 16px rgba(12,196,190,0.25)",
              cursor: (loading || campaignCount >= 2 || !canLaunch) ? "not-allowed" : "pointer",
              opacity: (loading || campaignCount >= 2 || !canLaunch) ? 0.6 : 1,
              transition: "transform 0.15s",
            }}
            onMouseEnter={e => {
              if (!e.currentTarget.disabled) e.currentTarget.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {campaignCount >= 2 ? "Limit Reached" : "Launch Campaign"}
          </button>

          {launched && launchResult && (
            <div style={{
              color: "#1eea78",
              fontWeight: 900,
              marginTop: "0.8rem",
              fontSize: "0.98rem",
              textShadow: "0 2px 8px #0a893622"
            }}>
              Campaign launched! ID: {launchResult.campaignId || "--"}
            </div>
          )}
        </main>

        {/* RIGHT PANE (campaigns & previews) — layout preserved */}
        <aside style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: isMobile ? "center" : "flex-start",
          width: isMobile ? "100vw" : "100%",
          marginTop: isMobile ? 8 : 0,
          gap: "1.6rem",
          minWidth: isMobile ? "100vw" : 400,
          maxWidth: 560,
        }}>
          <div
            style={{
              background: CARD_BG,
              borderRadius: "18px",
              padding: isMobile ? "22px 16px" : "24px 22px 26px",
              color: TEXT_MAIN,
              width: isMobile ? "97vw" : "100%",
              maxWidth: "99vw",
              border: `1px solid ${INPUT_BORDER}`,
              boxShadow: "0 12px 36px rgba(0,0,0,0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
              minHeight: "600px",
            }}
          >
            {/* Header row */}
            <div style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div style={{ fontSize:"1.08rem", fontWeight: 900, color: WHITE, letterSpacing: 0.3 }}>
                Active Campaigns
              </div>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  onClick={handlePauseUnpause}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: isPaused ? "#22dd7f" : "#ffd966",
                    color: "#0f1418",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 20,
                    width: 36, height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
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
                    color: WHITE,
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 900,
                    fontSize: 18,
                    width: 36, height: 36,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
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
                      color: WHITE,
                      border: "none",
                      borderRadius: 10,
                      fontWeight: 900,
                      fontSize: 20,
                      width: 36, height: 36,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
                    }}
                    title="New Campaign"
                  >
                    <FaPlus />
                  </button>
                )}
              </div>
            </div>

            {/* Rows */}
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
                    background:PANEL_BG,
                    borderRadius:"12px",
                    padding:"8px",
                    border:`1px solid ${INPUT_BORDER}`,
                    boxShadow: "0 2px 12px rgba(0,0,0,0.25)"
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
                        padding:"8px 10px",
                        borderRadius:10,
                        background:"#161c21",
                        border:`1px solid ${INPUT_BORDER}`
                      }}
                    >
                      <div style={{ display:"flex", alignItems:"center", gap:10, color:WHITE, fontWeight:900 }}>
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

                      {isDraft ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClearDraft(); }}
                          title="Discard draft"
                          aria-label="Discard draft"
                          style={{
                            background:"#5b2d2d",
                            color:"#ffecec",
                            border:"none",
                            borderRadius:10,
                            fontWeight:900,
                            width:28,
                            height:28,
                            lineHeight:"28px",
                            textAlign:"center",
                            cursor:"pointer",
                            boxShadow:"0 1px 6px rgba(0,0,0,0.25)"
                          }}
                        >
                          ×
                        </button>
                      ) : (
                        <div style={{ color:"#89f0cc", fontSize:12, fontWeight:900 }}>
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
                          background: "#14191e",
                          borderRadius: "12px",
                          padding: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                          border:`1px solid ${INPUT_BORDER}`
                        }}>
                          <div style={{ color: TEXT_MAIN, fontWeight: 900, fontSize: "1rem", marginBottom: 2 }}>
                            Creatives
                          </div>

                          {/* Images Card */}
                          {showImages && (
                            <div style={{
                              background:"#ffffff",
                              borderRadius:12,
                              border:"1.2px solid #eaeaea",
                              overflow:"hidden",
                              boxShadow:"0 2px 16px rgba(0,0,0,0.12)"
                            }}>
                              <div style={{
                                background:"#f5f6fa",
                                padding:"8px 12px",
                                borderBottom:"1px solid #e0e4eb",
                                display:"flex",
                                justifyContent:"space-between",
                                alignItems:"center",
                                color:"#495a68",
                                fontWeight:800,
                                fontSize: "0.95rem"
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
                              background:"#ffffff",
                              borderRadius:12,
                              border:"1.2px solid #eaeaea",
                              overflow:"hidden",
                              boxShadow:"0 2px 16px rgba(0,0,0,0.12)"
                            }}>
                              <div style={{
                                background:"#f5f6fa",
                                padding:"8px 12px",
                                borderBottom:"1px solid #e0e4eb",
                                display:"flex",
                                justifyContent:"space-between",
                                alignItems:"center",
                                color:"#495a68",
                                fontWeight:800,
                                fontSize: "0.95rem"
                              }}>
                                <span>Videos</span>
                                {(!creatives.videos || creatives.videos.length === 0) ? <DottyMini/> : null}
                              </div>
                              <VideoCarousel items={creatives.videos} height={CREATIVE_HEIGHT} />
                            </div>
                          )}

                          {!showImages && !showVideos && (
                            <div style={{ color:"#c9d7d2", fontWeight:800, padding:"8px 4px" }}>
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

            {/* Ad Account & Page Selectors */}
            <div style={{
              width: "100%",
              marginTop: 8,
              background: "#14191e",
              borderRadius: "12px",
              padding: "12px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              border:`1px solid ${INPUT_BORDER}`
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: "0.98rem", color: WHITE }}>Ad Account</div>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    fontSize: "1rem",
                    width: "100%",
                    outline: "none",
                    border: `1px solid ${INPUT_BORDER}`,
                    background: "#1a2025",
                    color: TEXT_DIM,
                    marginTop: 6,
                    fontWeight: 800
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
                <div style={{ fontWeight: 900, fontSize: "0.98rem", color: WHITE }}>Facebook Page</div>
                <select
                  value={selectedPageId}
                  onChange={e => setSelectedPageId(e.target.value)}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    fontSize: "1rem",
                    width: "100%",
                    outline: "none",
                    border: `1px solid ${INPUT_BORDER}`,
                    background: "#1a2025",
                    color: TEXT_DIM,
                    marginTop: 6,
                    fontWeight: 800
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

/* ---------- tiny UI helpers for compact wheels (unchanged logic) ---------- */
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
        color: TEXT_DIM,
        fontWeight: 900,
        fontSize: "1.02rem",
        padding: "4px 8px",
        outline: "none",
        maxHeight: 120,
        overflowY: "auto",
        scrollbarWidth: "none"
      }}
    >
      {options.map(v => (
        <option key={v} value={v} style={{ background: "#0f1418", color: TEXT_DIM, fontWeight: 900 }}>
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
