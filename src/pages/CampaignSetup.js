/* eslint-disable */
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown, FaChevronLeft, FaChevronRight } from "react-icons/fa";

const backendUrl = "https://smartmark-mvp.onrender.com";

// Visual theme
const DARK_BG = "#181b20";
const PANEL_BG = "#202327";
const CARD_BG = "#1b1e22f7";
const EDGE_BG = "#232528e6";
const INPUT_BG = "#1c2120";
const TEXT_MAIN = "#ecfff6";
const TEXT_DIM = "#b3f1d6";
const LINE = "#2d5b45";
const ACCENT = "#14e7b9";
const ACCENT_ALT = "#1ec885";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";

const CREATIVE_HEIGHT = 150;

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

// Persisted creatives (only AFTER launch)
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
  cursor:"pointer"
});
const badge = {
  position:"absolute", bottom:6, right:6,
  background:"rgba(0,0,0,0.55)", color:"#fff",
  borderRadius:8, padding:"2px 6px", fontSize:11, fontWeight:800
};

function ImageCarousel({ items = [], onFullscreen, height = 220 }) {
  const [idx, setIdx] = useState(0);
  const normalized = items.map(u => (u && !/^https?:\/\//.test(u) ? `${backendUrl}${u}` : u)).filter(Boolean);
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
  const normalized = items.map(u => (u && !/^https?:\/\//.test(u) ? `${backendUrl}${u}` : u)).filter(Boolean);
  useEffect(() => { if (idx >= normalized.length) setIdx(0); }, [normalized, idx]);
  if (!normalized.length) {
    return <div style={{ height, width: "100%", background: "#e9ecef",
      color: "#a9abb0", fontWeight: 700, display:"flex", alignItems:"center",
      justifyContent:"center", fontSize: 18 }}>Videos</div>;
  }
  const go = (d) => setIdx((p) => (p + d + normalized.length) % normalized.length);
  return (
    <div style={{ position:"relative", background:"#111" }}>
      <video src={normalized[idx]} controls style={{ width:"100%", maxHeight:height, height, display:"block", objectFit:"cover" }} />
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

/* ---------- NEW: Compact metrics slider ---------- */
function MetricsSlider({ metrics }) {
  const stripRef = useRef(null);
  const cards = useMemo(() => ([
    { key: "impressions", label: "Impressions", value: metrics?.impressions ?? "--" },
    { key: "clicks", label: "Clicks", value: metrics?.clicks ?? "--" },
    { key: "ctr", label: "CTR", value: metrics?.ctr ?? "--" },
    { key: "spend", label: "Spend", value: metrics?.spend ? `$${metrics.spend}` : "--" },
    { key: "results", label: "Results", value: metrics?.results ?? "--" },
    { key: "cpr", label: "Cost/Result", value: (metrics?.spend && metrics?.results) ? `$${(metrics.spend / metrics.results).toFixed(2)}` : "--" },
  ]), [metrics]);

  const scroll = (dir) => {
    if (!stripRef.current) return;
    const delta = dir * (stripRef.current.clientWidth * 0.85);
    stripRef.current.scrollBy({ left: delta, behavior: "smooth" });
  };

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
      <button
        onClick={() => scroll(-1)}
        style={{ position:"absolute", left:-8, top:"50%", transform:"translateY(-50%)", background:"#22312b", border:"none", color:"#aef4da", width:32, height:32, borderRadius:10, cursor:"pointer", zIndex:2 }}
        aria-label="Prev metrics"
      ><FaChevronLeft/></button>
      <div
        ref={stripRef}
        style={{
          display:"flex",
          gap:12,
          overflowX:"auto",
          padding: "6px 28px",
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
      <button
        onClick={() => scroll(1)}
        style={{ position:"absolute", right:-8, top:"50%", transform:"translateY(-50%)", background:"#22312b", border:"none", color:"#aef4da", width:32, height:32, borderRadius:10, cursor:"pointer", zIndex:2 }}
        aria-label="Next metrics"
      ><FaChevronRight/></button>
    </div>
  );
}

/* ---------- Simple local scheduler (unchanged) ---------- */
function SchedulerInline({ campaignKey }) {
  const STORE_KEY = useMemo(() => `sm_sched_jobs_${campaignKey || "draft"}`, [campaignKey]);
  const defaultRun = useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }, []);
  const [runAt, setRunAt] = useState(defaultRun);
  const [jobs, setJobs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch { return []; }
  });

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(jobs)); }, [jobs, STORE_KEY]);

  const uid = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);
  const nowIso = () => new Date().toISOString();
  const DEFAULT_ACTION = "generate-video";

  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const dueIdx = jobs.findIndex(
        (j) => j.status === "pending" && new Date(j.runAt).getTime() <= Date.now() + 2000
      );
      if (dueIdx !== -1) {
        setJobs((prev) => {
          const clone = [...prev];
          clone[dueIdx] = { ...clone[dueIdx], status: "done", finishedAt: nowIso() };
          return clone;
        });
      }
      setTimeout(tick, 1500);
    };
    if (jobs.some(j => !j.status)) {
      setJobs((prev) => prev.map(j => j.status ? j : { ...j, status: "pending" }));
    }
    tick();
    return () => { alive = false; };
  }, [jobs]);

  const addJob = () => {
    if (!runAt) return;
    const job = { id: uid(), runAt, createdAt: nowIso(), status: "pending", action: DEFAULT_ACTION };
    setJobs((prev) => [...prev, job].sort((a, b) => new Date(a.runAt) - new Date(b.runAt)));
    const next = new Date(new Date(runAt).getTime() + 15 * 60 * 1000);
    next.setSeconds(0, 0);
    setRunAt(next.toISOString().slice(0, 16));
  };

  const clearDone = () => setJobs((prev) => prev.filter((j) => j.status !== "done"));
  const resetAll = () => { setJobs([]); localStorage.removeItem(STORE_KEY); setRunAt(defaultRun); };
  const minAttr = new Date(Date.now() - 60_000).toISOString().slice(0, 16);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", width: "100%" }}>
      <div style={{ color: TEXT_MAIN, fontWeight: 700, fontSize: "0.98rem" }}>Schedule:</div>
      <input
        type="datetime-local"
        value={runAt}
        min={minAttr}
        onChange={e => setRunAt(e.target.value)}
        style={{ background: INPUT_BG, color: TEXT_DIM, border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px", fontWeight: 700 }}
      />
      <button onClick={addJob}
        style={{ background: ACCENT, color: "#181b20", border: "none", borderRadius: 10, padding: "9px 14px", fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 10px #14e7b955" }}>
        Add
      </button>
      <button onClick={clearDone}
        style={{ background: "#2b3135", color: "#d9f8ea", border: "1px solid #3b4a44", borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer" }}>
        Clear Done
      </button>
      <button onClick={resetAll}
        style={{ background: "#3c4045", color: "#ffd", border: "1px solid #4b5550", borderRadius: 10, padding: "9px 12px", fontWeight: 800, cursor: "pointer" }}>
        Reset
      </button>
      <span style={{ color: "#9fe9c8", fontWeight: 700, marginLeft: 6 }}>
        {jobs.filter(j => j.status === "pending").length} pending
      </span>
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
  const [pages, setPages] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [, setCampaignStatus] = useState("ACTIVE");
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [campaignCount, setCampaignCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(true);

  const [mediaSelection, setMediaSelection] = useState(() =>
    (location.state?.mediaSelection || localStorage.getItem("smartmark_media_selection") || "both").toLowerCase()
  );

  // Timeframe (max two weeks)
  const [startDate, setStartDate] = useState(form.startDate || "");
  const [endDate, setEndDate] = useState(form.endDate || "");

  // PREVIEW-ONLY creatives carried from FormPage via navigation state
  const [imageUrlsArr, setImageUrlsArr] = useState([]);
  const [videoUrlsArr, setVideoUrlsArr] = useState([]);
  const [fbVideoIdsArr, setFbVideoIdsArr] = useState([]);

  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");

  // From navigation state
  const {
    imageUrls: navImageUrls,
    videoUrls: navVideoUrls,
    fbVideoIds: navFbVideoIds,
    headline,
    body,
    answers,
    mediaSelection: navMediaSelection
  } = location.state || {};

  // Load basic persisted fields
  useEffect(() => {
    const lastFields = localStorage.getItem("smartmark_last_campaign_fields");
    if (lastFields) setForm(JSON.parse(lastFields));
    const lastAudience = localStorage.getItem("smartmark_last_ai_audience");
    if (lastAudience) setForm(f => ({ ...f, aiAudience: JSON.parse(lastAudience) }));
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

  // Fetch ad accounts
  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => setAdAccounts(json.data || []))
      .catch(() => {});
  }, [fbConnected]);

  // Fetch pages
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

  // Sync mediaSelection if passed from nav
  useEffect(() => {
    if (navMediaSelection) {
      const v = String(navMediaSelection).toLowerCase();
      setMediaSelection(v);
      localStorage.setItem("smartmark_media_selection", v);
    }
  }, [navMediaSelection]);

  // Load campaigns list
  useEffect(() => {
    if (!fbConnected || !selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        const list = (data && data.data) ? data.data.slice(0, 2) : [];
        setCampaigns(list);
        if (!selectedCampaignId) {
          const hasNavDraft = (Array.isArray(navImageUrls) && navImageUrls.length) ||
                              (Array.isArray(navVideoUrls) && navVideoUrls.length) ||
                              (Array.isArray(navFbVideoIds) && navFbVideoIds.length);
          if (!hasNavDraft && list.length > 0) {
            setSelectedCampaignId(list[0].id);
          }
        }
      })
      .catch(() => {});
  }, [fbConnected, selectedAccount, launched, navImageUrls, navVideoUrls, navFbVideoIds, selectedCampaignId]);

  // Metrics for selected campaign
  useEffect(() => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/details`, { credentials: 'include' })
      .then(res => res.json())
      .then(c => {
        setCampaignStatus(c.status || c.effective_status || "ACTIVE");
        setBudget(prev => prev || "");
        setForm(f => ({
          ...f,
          campaignName: c.campaignName || f.campaignName || "",
          startDate: f.startDate || "",
          endDate: f.endDate || ""
        }));
      })
      .catch(() => {});
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/metrics`, { credentials: 'include' })
      .then(res => res.json())
      .then(setMetrics)
      .catch(() => setMetrics(null));
  }, [selectedCampaignId, selectedAccount]);

  // Persist basic fields
  useEffect(() => { localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify({ ...form, startDate, endDate })); }, [form, startDate, endDate]);
  useEffect(() => { localStorage.setItem("smartmark_last_budget", budget); }, [budget]);
  useEffect(() => { localStorage.setItem("smartmark_login_username", cashapp); }, [cashapp]);
  useEffect(() => { localStorage.setItem("smartmark_login_password", email); }, [email]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_account", selectedAccount); }, [selectedAccount]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_pageId", selectedPageId); }, [selectedPageId]);

  // PREVIEW ONLY: hydrate from navigation OR from sessionStorage draft after FB connect redirect
  useEffect(() => {
    const imgs = Array.isArray(navImageUrls) ? navImageUrls.slice(0, 2) : [];
    const vids = Array.isArray(navVideoUrls) ? navVideoUrls.slice(0, 2) : [];
    const ids  = Array.isArray(navFbVideoIds) ? navFbVideoIds.slice(0, 2) : [];
    if (imgs.length || vids.length || ids.length) {
      setImageUrlsArr(imgs);
      setVideoUrlsArr(vids);
      setFbVideoIdsArr(ids);
      return;
    }

    try {
      const draftRaw = sessionStorage.getItem("draft_form_creatives");
      if (!draftRaw) return;
      const draft = JSON.parse(draftRaw);
      setImageUrlsArr(Array.isArray(draft.images) ? draft.images.slice(0, 2) : []);
      setVideoUrlsArr(Array.isArray(draft.videos) ? draft.videos.slice(0, 2) : []);
      setFbVideoIdsArr(Array.isArray(draft.fbVideoIds) ? draft.fbVideoIds.slice(0, 2) : []);
      if (draft.mediaSelection) {
        const v = String(draft.mediaSelection).toLowerCase();
        setMediaSelection(v);
        localStorage.setItem("smartmark_media_selection", v);
      }
    } catch {}
  }, [navImageUrls, navVideoUrls, navFbVideoIds]);

  // When switching to an existing campaign, show its persisted creatives (post-launch only)
  useEffect(() => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctKey = String(selectedAccount || "").replace(/^act_/, "");
    const map = readCreativeMap(acctKey);
    const saved = map[selectedCampaignId];
    if (saved) {
      setImageUrlsArr(saved.images || []);
      setVideoUrlsArr(saved.videos || []);
      setFbVideoIdsArr(saved.fbVideoIds || []);

      const inferred =
        saved.mediaSelection
          ? String(saved.mediaSelection).toLowerCase()
          : ( (saved.images?.length && saved.videos?.length) ? 'both'
            : saved.videos?.length ? 'video'
            : saved.images?.length ? 'image'
            : (localStorage.getItem("smartmark_media_selection") || 'both') );
      setMediaSelection(inferred);
      localStorage.setItem("smartmark_media_selection", inferred);
    } else {
      setImageUrlsArr([]);
      setVideoUrlsArr([]);
      setFbVideoIdsArr([]);
    }
  }, [selectedCampaignId, selectedAccount]);

  // Pause/Unpause/Delete
  const [isPaused, setIsPaused] = useState(false);

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
      setMetrics(null);
      setSelectedCampaignId("");
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

  // helper: cap timeframe to 14 days
  function capTwoWeeksISO(startISO, endISO) {
    try {
      if (!startISO && !endISO) return { startISO: null, endISO: null };
      const now = new Date();
      const start = startISO ? new Date(startISO) : now;
      let end = endISO ? new Date(endISO) : null;
      const maxEnd = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
      if (!end) end = maxEnd;
      if (end > maxEnd) end = maxEnd;
      if (end <= start) end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { startISO: start.toISOString(), endISO: end.toISOString() };
    } catch { return { startISO: null, endISO: null }; }
  }

  // Launch
  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = String(selectedAccount).replace(/^act_/, "");
      const safeBudget = Math.max(3, Number(budget) || 0);

      const images = (imageUrlsArr || []).slice(0, 2);
      const videos = (videoUrlsArr || []).slice(0, 2);
      const fbIds  = (fbVideoIdsArr || []).slice(0, 2);

      // timeframe (cap to two weeks)
      const { startISO, endISO } = capTwoWeeksISO(
        startDate ? new Date(startDate).toISOString() : null,
        endDate ? new Date(endDate).toISOString() : null
      );

      const payload = {
        form: { ...form },
        budget: safeBudget,
        campaignType: form?.campaignType || "Website Traffic",
        pageId: selectedPageId,
        aiAudience: form?.aiAudience || answers?.aiAudience || "",
        adCopy: (headline || "") + (body ? `\n\n${body}` : ""),
        answers: answers || {},
        mediaSelection,                         // "image" | "video" | "both"
        imageVariants: images,
        videoVariants: videos,
        fbVideoIds: fbIds,
        videoThumbnailUrl: images[0] || null,
        flightStart: startISO,
        flightEnd: endISO,
        overrideCountPerType: {
          images: Math.min(2, images.length),
          videos: Math.min(2, Math.max(videos.length, fbIds.length))
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

      // Persist creatives ONLY AFTER a successful launch
      const map = readCreativeMap(acctId);
      if (json.campaignId) {
        map[json.campaignId] = {
          images: (imageUrlsArr || []).slice(0, 2),
          videos: (videoUrlsArr || []).slice(0, 2),
          fbVideoIds: (fbVideoIdsArr || []).slice(0, 2),
          mediaSelection: (mediaSelection || 'both').toLowerCase(),
          time: Date.now()
        };
        writeCreativeMap(acctId, map);
      }

      // Clear the draft now that it's launched (remove from FormPage)
      sessionStorage.removeItem("draft_form_creatives");

      setLaunched(true);
      setLaunchResult(json);
      setSelectedCampaignId(json.campaignId || selectedCampaignId);
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

  // ---------- Render ----------
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
          {fbConnected && (
            <button
              onClick={openFbPaymentPopup}
              style={{
                marginTop: 16,
                padding: "0.72rem 1.5rem",
                borderRadius: "1.1rem",
                background: "#fff",
                color: "#1877F2",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                fontSize: "1.01rem",
                boxShadow: "0 2px 8px #1877f233",
                width: "100%",
                maxWidth: 370,
                marginLeft: "auto",
                marginRight: "auto",
                display: "block"
              }}
            >
              Add/Manage Payment Method
            </button>
          )}

          {/* Campaign Name + Scheduler */}
          <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", width: "100%", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
              <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem", marginBottom: 7 }}>
                Campaign Name
              </label>
              <SchedulerInline campaignKey={selectedCampaignId || "draft"} />
            </div>

            <input
              type="text"
              value={form.campaignName || ""}
              onChange={e => setForm({ ...form, campaignName: e.target.value })}
              placeholder="Name your campaign"
              style={{
                padding: "1rem 1.1rem",
                borderRadius: "1.1rem",
                border: "1.2px solid #57dfa9",
                fontSize: "1.14rem",
                background: INPUT_BG,
                color: TEXT_DIM,
                marginBottom: "1rem",
                outline: "none",
                width: "100%"
              }}
            />
          </div>

          {/* Timeframe (optional, max 14 days) */}
          <div style={{ width:"100%", maxWidth:370, margin:"0 auto", display:"flex", flexDirection:"column", gap:8 }}>
            <div style={{ color:"#fff", fontWeight:700, fontSize:"1.05rem" }}>Campaign Timeframe (optional)</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <input
                type="datetime-local"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                placeholder="Start"
                style={{ padding:"0.8rem", borderRadius:"0.9rem", border:"1.2px solid #57dfa9", background:INPUT_BG, color:TEXT_DIM }}
              />
              <input
                type="datetime-local"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                placeholder="End"
                style={{ padding:"0.8rem", borderRadius:"0.9rem", border:"1.2px solid #57dfa9", background:INPUT_BG, color:TEXT_DIM }}
              />
            </div>
            <div style={{ color:"#9fe9c8", fontWeight:700, fontSize:"0.92rem" }}>We’ll cap duration to 14 days automatically.</div>
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
                marginBottom: "1rem",
                outline: "none",
                width: "100%"
              }}
            />

            {budget && Number(budget) > 0 && (
              <div style={{ marginTop: "-0.6rem", fontWeight: 700, color: ACCENT_ALT, fontSize: "1.06rem", letterSpacing: "0.04em" }}>
                Pay to <span style={{ color: "#19bd7b" }}>$Wknowles20</span>
              </div>
            )}

            <div style={{ color: "#afeca3", fontWeight: 700, marginBottom: 8 }}>
              SmartMark Fee: <span style={{ color: ACCENT_ALT }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
            </div>

            {/* CashApp + Email */}
            {budget && Number(budget) >= 1 && (
              <div style={{
                marginTop: "0.7rem",
                background: "#1c1c1e",
                borderRadius: "0.9rem",
                padding: "0.8rem 1.1rem",
                fontWeight: 700,
                textAlign: "center",
                fontSize: "1.05rem",
                border: "1.2px solid #2b2923",
                width: "100%",
                color: "#ffe066"
              }}>
                <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
                    <label style={{ color: "#fff", fontWeight: 600, fontSize: "1.01rem", marginBottom: 3 }}>Your CashApp:</label>
                    <input
                      type="text"
                      placeholder="CashApp username"
                      value={cashapp}
                      onChange={e => { setCashapp(e.target.value); localStorage.setItem("smartmark_login_username", e.target.value); }}
                      style={{
                        padding: "0.74rem 1rem",
                        borderRadius: "0.85rem",
                        border: "1.2px solid #57dfa9",
                        fontSize: "1.09rem",
                        background: INPUT_BG,
                        color: TEXT_DIM,
                        marginBottom: 3,
                        width: "100%"
                      }}
                      autoComplete="username"
                    />
                    <label style={{ color: "#fff", fontWeight: 600, fontSize: "1.01rem", marginBottom: 3, marginTop: 4 }}>Your Email:</label>
                    <input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={e => { setEmail(e.target.value); localStorage.setItem("smartmark_login_password", e.target.value); }}
                      style={{
                        padding: "0.74rem 1rem",
                        borderRadius: "0.85rem",
                        border: "1.2px solid #57dfa9",
                        fontSize: "1.09rem",
                        background: INPUT_BG,
                        color: TEXT_DIM,
                        marginBottom: 3,
                        width: "100%"
                      }}
                      autoComplete="email"
                    />
                  </div>
                </div>
                Pay (${fee.toFixed(2)}) to <span style={{ color: ACCENT_ALT }}>$Wknowles20</span>
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
              marginTop: 2,
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

          {/* Metrics + Campaign Dropdown */}
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
              gap: "0.8rem",
              alignItems: "flex-start",
              minHeight: "600px",
            }}
          >
            {/* Campaign dropdown + controls */}
            <div style={{ width: "100%", marginBottom: 6 }}>
              <div
                style={{
                  display: "flex", width: "100%",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12
                }}>
                <div
                  style={{
                    fontSize: "1.23rem",
                    fontWeight: 800,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    gap: 9,
                  }}
                  onClick={() => setDropdownOpen((o) => !o)}
                >
                  <FaChevronDown
                    style={{
                      transform: dropdownOpen ? "rotate(180deg)" : "rotate(0deg)",
                      marginRight: 7,
                      transition: "transform 0.18s"
                    }}
                  />
                  {selectedCampaignId
                    ? (campaigns.find(c => c.id === selectedCampaignId)?.name || "Campaign")
                    : "Campaigns"}
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

              {/* Dropdown list */}
              {dropdownOpen && (
                <div style={{
                  width: "100%",
                  background: "#232a28",
                  borderRadius: "0.8rem",
                  marginBottom: 6,
                  marginTop: 1,
                  padding: "0.7rem 0.4rem",
                  boxShadow: "0 2px 12px #193a2a13"
                }}>
                  {campaigns.map(c => (
                    <div
                      key={c.id}
                      style={{
                        color: c.id === selectedCampaignId ? ACCENT_ALT : "#fff",
                        fontWeight: c.id === selectedCampaignId ? 800 : 600,
                        fontSize: "1.09rem",
                        cursor: "pointer",
                        padding: "0.35rem 0.8rem",
                        borderRadius: 8,
                        marginBottom: 2,
                        background: c.id === selectedCampaignId ? "#1c3938" : "transparent"
                      }}
                      onClick={() => setSelectedCampaignId(c.id)}
                    >
                      {c.name || c.id}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Compact, scrollable metrics tied to selected campaign */}
            {selectedCampaignId && (
              <div style={{ width: "100%" }}>
                <MetricsSlider metrics={metrics} />
              </div>
            )}

            {/* PREVIEW CAROUSELS (aesthetic only) */}
            {dropdownOpen && (
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
                    items={imageUrlsArr}
                    height={CREATIVE_HEIGHT}
                    onFullscreen={(url) => { setModalImg(url); setShowImageModal(true); }}
                  />
                </div>

                {/* Videos Card */}
                <div style={{
                  background:"#fff", borderRadius:12, border:"1.2px solid #eaeaea",
                  overflow:"hidden", boxShadow:"0 2px 16px #16242714"
                }}>
                  <div style={{
                    background:"#f5f6fa", padding:"8px 12px", borderBottom:"1px solid #e0e4eb",
                    display:"flex", justifyContent:"space-between", alignItems:"center", color:"#495a68", fontWeight:700, fontSize: "0.96rem"
                  }}>
                    <span>Videos</span>
                    {videoUrlsArr.length === 0 ? <DottyMini/> : null}
                  </div>
                  <VideoCarousel items={videoUrlsArr} height={CREATIVE_HEIGHT} />
                </div>
              </div>
            )}

            {/* Ad Account & Page Selectors */}
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

          {/* Pause Modal */}
          {showPauseModal && (
            <div style={{
              position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
              background: 'rgba(0,0,0,0.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
            }}>
              <div style={{
                background: '#24262b', borderRadius: 18, padding: 36, minWidth: 370, boxShadow: "0 10px 44px #000a"
              }}>
                <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 28, color: '#fff' }}>
                  Are you sure you want to pause this campaign?
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 22 }}>
                  <button
                    onClick={() => setShowPauseModal(false)}
                    style={{ background: '#e74c3c', color: '#fff', border: 'none', padding: '0.7rem 1.7rem', borderRadius: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    No
                  </button>
                  <button
                    onClick={async () => { setShowPauseModal(false); await handlePauseUnpause(); }}
                    style={{ background: ACCENT_ALT, color: '#fff', border: 'none', padding: '0.7rem 1.7rem', borderRadius: 13, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Yes, Pause
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Image modal viewer */}
      <ImageModal open={showImageModal} imageUrl={modalImg} onClose={() => setShowImageModal(false)} />
    </div>
  );
};

export default CampaignSetup;
