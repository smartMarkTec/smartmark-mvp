// src/pages/CampaignSetup.js

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown } from "react-icons/fa";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";
import { FaExpand } from "react-icons/fa";

const backendUrl = "https://smartmark-mvp.onrender.com";
const DARK_GREEN = "#185431";
const ACCENT_GREEN = "#1ec885";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const BG_GRADIENT = "linear-gradient(135deg,#232a24 0%,#34373d 100%)";

const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};

const getUserKey = (email, cashapp) =>
  `smartmark_user_${(email || "").trim().toLowerCase()}_${(cashapp || "").trim().toLowerCase()}`;

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = 25;
  const total = parsed + fee;
  return { fee, total };
};

function VideoPreviewBox({ videoUrl }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  const togglePlay = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setPlaying(!playing);
  };

  const enterFullScreen = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const onEnded = () => setPlaying(false);

  return (
    <div
      style={{
        width: 110,
        height: 110,
        borderRadius: 14,
        overflow: "hidden",
        cursor: "pointer",
        boxShadow: "0 2px 10px rgba(30,200,133,0.13)",
        border: "2.2px solid #1ec885",
        background: "#191f1b",
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={togglePlay}
      title={playing ? "Pause" : "Play"}
      onDoubleClick={enterFullScreen}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        width={110}
        height={110}
        style={{ objectFit: "cover", width: "100%", height: "100%", borderRadius: 14, background: "#232a24" }}
        controls={false}
        onEnded={onEnded}
        preload="metadata"
        tabIndex={-1}
      />
      {!playing && (
        <div style={{
          position: "absolute",
          left: 0, top: 0, width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none", zIndex: 2
        }}>
          <svg width="34" height="34" fill="#fff" style={{ opacity: 0.78 }}>
            <polygon points="8,7 28,17 8,27" />
          </svg>
        </div>
      )}
      <button
        onClick={enterFullScreen}
        style={{
          position: "absolute",
          bottom: 7,
          right: 7,
          zIndex: 3,
          background: "rgba(24,84,49,0.81)",
          border: "none",
          borderRadius: 5,
          color: "#fff",
          padding: 3,
          cursor: "pointer",
          opacity: 0.8
        }}
        tabIndex={-1}
        title="Fullscreen"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <rect x="3" y="3" width="5" height="2" rx="1" fill="white"/>
          <rect x="3" y="3" width="2" height="5" rx="1" fill="white"/>
          <rect x="15" y="3" width="2" height="5" rx="1" fill="white"/>
          <rect x="12" y="3" width="5" height="2" rx="1" fill="white"/>
          <rect x="3" y="15" width="5" height="2" rx="1" fill="white"/>
          <rect x="3" y="12" width="2" height="5" rx="1" fill="white"/>
          <rect x="15" y="12" width="2" height="5" rx="1" fill="white"/>
          <rect x="12" y="15" width="5" height="2" rx="1" fill="white"/>
        </svg>
      </button>
    </div>
  );
}

// ==================== PERSISTENT STATE SECTION STARTS HERE ====================

const FB_CONN_KEY = "smartmark_fb_connected";
const FB_CONN_MAX_AGE = 2.5 * 24 * 60 * 60 * 1000; // 2.5 days in ms

function SchedulerInline({
  backendUrl,
  form,
  selectedAccount,
  selectedPageId,
  budget,
  mediaImageUrl,
  mediaVideoUrl,
  headline,
  body,
  answers,
  mediaSelection,
  fbVideoId // NEW: pass-through for lightweight upload path
}) {
  const STORE_KEY = "sm_sched_jobs";
  const [action, setAction] = React.useState("generate-video"); // generate-video | launch

  const defaultRun = React.useMemo(() => {
    const d = new Date(Date.now() + 10 * 60 * 1000);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  }, []);
  const [runAt, setRunAt] = React.useState(defaultRun);

  const [jobs, setJobs] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); }
    catch { return []; }
  });

  React.useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(jobs));
  }, [jobs]);

  const uid = () =>
    (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10);

  const nowIso = () => new Date().toISOString();

  const urlToBase64Maybe = async (url) => {
    if (!url || url.startsWith("data:")) return url || "";
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  };

  const buildPayload = async (kind) => {
    const acctId = String(selectedAccount || "").replace(/^act_/, "");
    const safeBudget = Math.max(3, Number(budget) || 0);

    let adImage = mediaImageUrl || "";
    let adVideo = mediaVideoUrl || "";
    if (kind === "launch") {
      if (adImage && !adImage.startsWith("data:")) adImage = await urlToBase64Maybe(adImage);
      if (adVideo && !adVideo.startsWith("data:")) adVideo = await urlToBase64Maybe(adVideo);
    }

    if (kind === "generate-video") {
      return {
        endpoint: `${backendUrl}/api/generate-video-ad`,
        method: "POST",
        body: {
          url: form?.url || "",
          answers: { ...answers, industry: form?.industry || answers?.industry },
          regenerateToken: uid(),
          fbAdAccountId: acctId || undefined // allows backend to upload to FB library if token available
        }
      };
    }

    if (kind === "launch") {
      return {
        endpoint: `${backendUrl}/auth/facebook/adaccount/${acctId}/launch-campaign`,
        method: "POST",
        body: {
          form: { ...form },
          budget: safeBudget,
          campaignType: form?.campaignType || "Website Traffic",
          pageId: selectedPageId,
          aiAudience: form?.aiAudience || answers?.aiAudience || "",
          adCopy: (headline || "") + (body ? `\n\n${body}` : ""),
          adImage: adImage || "",
          adVideo: adVideo || "",
          fbVideoId: fbVideoId || null,
          answers: answers || {},
          mediaSelection: mediaSelection || "both"
        }
      };
    }

    throw new Error("Unknown action");
  };

  React.useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (!alive) return;

      const dueIdx = jobs.findIndex(
        (j) => j.status === "pending" &&
               new Date(j.runAt).getTime() <= Date.now() + 2000
      );

      if (dueIdx !== -1) {
        const job = jobs[dueIdx];

        setJobs((prev) => {
          const clone = [...prev];
          clone[dueIdx] = { ...clone[dueIdx], status: "running", startedAt: nowIso() };
          return clone;
        });

        try {
          const res = await fetch(job.endpoint, {
            method: job.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: job.body ? JSON.stringify(job.body) : undefined
          });
          const json = await res.json().catch(() => ({}));

          setJobs((prev) => {
            const clone = [...prev];
            clone[dueIdx] = {
              ...clone[dueIdx],
              status: res.ok ? "done" : "failed",
              finishedAt: nowIso(),
              result: res.ok ? json : null,
              error: res.ok ? null : (json?.error || "Request failed")
            };
            return clone;
          });
        } catch (e) {
          setJobs((prev) => {
            const clone = [...prev];
            clone[dueIdx] = {
              ...clone[dueIdx],
              status: "failed",
              finishedAt: nowIso(),
              error: e?.message || "Network error"
            };
            return clone;
          });
        }
      }

      setTimeout(tick, 1500);
    };

    if (jobs.some(j => !j.status)) {
      setJobs((prev) => prev.map(j => j.status ? j : { ...j, status: "pending" }));
    }

    tick();
    return () => { alive = false; };
  }, [jobs, backendUrl]);

  const addJob = async () => {
    if (!runAt) return;

    if (action === "launch") {
      if (!selectedAccount) return alert("Select an Ad Account first.");
      if (!selectedPageId) return alert("Select a Facebook Page first.");
      if (!budget || Number(budget) < 3) return alert("Budget must be at least $3.");
    }

    let payload;
    try {
      payload = await buildPayload(action);
    } catch (e) {
      console.error("buildPayload error:", e);
      return alert("Could not prepare the request. Check your inputs.");
    }

    const job = {
      id: uid(),
      runAt,
      createdAt: nowIso(),
      status: "pending",
      action,
      endpoint: payload.endpoint,
      method: payload.method,
      body: payload.body
    };

    setJobs((prev) => [...prev, job].sort((a, b) => new Date(a.runAt) - new Date(b.runAt)));
    const next = new Date(new Date(runAt).getTime() + 15 * 60 * 1000);
    next.setSeconds(0, 0);
    setRunAt(next.toISOString().slice(0, 16));
  };

  const clearDone = () => {
    setJobs((prev) => prev.filter((j) => j.status !== "done"));
  };

  const minAttr = new Date(Date.now() - 60_000).toISOString().slice(0, 16);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      flexWrap: "wrap",
      justifyContent: "flex-end",
      width: "100%"
    }}>
      <div style={{ color: "#c7fbe3", fontWeight: 700, fontSize: "0.98rem" }}>Schedule:</div>

      <select
        value={action}
        onChange={e => setAction(e.target.value)}
        style={{
          background: "#1c2120", color: "#b3f1d6", border: "1px solid #2d5b45",
          borderRadius: 10, padding: "8px 10px", fontWeight: 700
        }}>
        <option value="generate-video">Generate Video</option>
        <option value="launch">Launch Campaign</option>
      </select>

      <input
        type="datetime-local"
        value={runAt}
        min={minAttr}
        onChange={e => setRunAt(e.target.value)}
        style={{
          background: "#1c2120", color: "#b3f1d6", border: "1px solid #2d5b45",
          borderRadius: 10, padding: "8px 10px", fontWeight: 700
        }}
      />

      <button
        onClick={addJob}
        disabled={
          !runAt ||
          (action === "launch" && (!selectedAccount || !selectedPageId || !budget))
        }
        style={{
          background: "#19c37d", color: "#fff", border: "none",
          borderRadius: 10, padding: "9px 14px", fontWeight: 800,
          cursor: (!runAt || (action === "launch" && (!selectedAccount || !selectedPageId || !budget))) ? "not-allowed" : "pointer",
          opacity: (!runAt || (action === "launch" && (!selectedAccount || !selectedPageId || !budget))) ? 0.6 : 1
        }}>
        Add
      </button>

      <button
        onClick={clearDone}
        style={{
          background: "#2b3135", color: "#d9f8ea", border: "1px solid #3b4a44",
          borderRadius: 10, padding: "9px 12px", fontWeight: 700, cursor: "pointer"
        }}>
        Clear Done
      </button>

      <span style={{ color: "#9fe9c8", fontWeight: 700, marginLeft: 6 }}>
        {jobs.filter(j => j.status === "pending").length} pending
      </span>
    </div>
  );
}

const CampaignSetup = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("smartmark_last_campaign_fields")) || {};
    } catch { return {}; }
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
      if (connected && Date.now() - time < FB_CONN_MAX_AGE) {
        return true;
      } else {
        localStorage.removeItem(FB_CONN_KEY);
        return false;
      }
    }
    return false;
  });

  const [userKey, setUserKey] = useState("");
  const [adAccounts, setAdAccounts] = useState([]);
  const [pages, setPages] = useState([]);
  const [fbUserToken, setFbUserToken] = useState(() => localStorage.getItem("smartmark_fb_user_token") || "");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState("ACTIVE");
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [mediaImageUrl, setMediaImageUrl] = useState("");
  const [mediaVideoUrl, setMediaVideoUrl] = useState("");
  const [showImageModal, setShowImageModal] = useState(false);
  const [modalImg, setModalImg] = useState("");
  const [campaignCount, setCampaignCount] = useState(0);
  const [fbVideoId, setFbVideoId] = useState(() => localStorage.getItem("smartmark_last_fb_video_id") || "");

  useEffect(() => {
    if (!selectedAccount) return;
    const acctId = selectedAccount.replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`)
      .then(res => res.json())
      .then(data => {
        // Accept both shapes: array or {data:[...]}
        const list = Array.isArray(data) ? data : (data?.data || []);
        const activeCount = list.filter(c => (c.status || c.effective_status) === "ACTIVE").length;
        setCampaignCount(activeCount);
      })
      .catch(err => console.error("Error fetching campaigns:", err));
  }, [selectedAccount]);

  const [mediaSelection, setMediaSelection] = useState(() =>
    (location.state?.mediaSelection || localStorage.getItem("smartmark_media_selection") || "both").toLowerCase()
  );
  useEffect(() => {
    if (location.state?.mediaSelection) {
      const v = String(location.state.mediaSelection).toLowerCase();
      setMediaSelection(v);
      localStorage.setItem("smartmark_media_selection", v);
    }
    // eslint-disable-next-line
  }, [location.state?.mediaSelection]);

  // =============== AUTO-SAVE/RESTORE ================
  useEffect(() => { localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem("smartmark_last_budget", budget); }, [budget]);
  useEffect(() => { localStorage.setItem("smartmark_login_username", cashapp); }, [cashapp]);
  useEffect(() => { localStorage.setItem("smartmark_login_password", email); }, [email]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_account", selectedAccount); }, [selectedAccount]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_pageId", selectedPageId); }, [selectedPageId]);
  useEffect(() => {
    if (fbConnected) {
      localStorage.setItem(FB_CONN_KEY, JSON.stringify({ connected: 1, time: Date.now() }));
    }
  }, [fbConnected]);

  // Always use navigation state if present, otherwise fallback to localStorage
  useEffect(() => {
    let img = location.state?.imageUrl || localStorage.getItem("smartmark_last_image_url") || "";
    let vid = location.state?.videoUrl || localStorage.getItem("smartmark_last_video_url") || "";
    let vidId = location.state?.fbVideoId || localStorage.getItem("smartmark_last_fb_video_id") || "";

    setMediaImageUrl(img);
    setMediaVideoUrl(vid);
    if (vidId) setFbVideoId(vidId);

    if (location.state?.imageUrl) localStorage.setItem("smartmark_last_image_url", location.state.imageUrl);
    if (location.state?.videoUrl) localStorage.setItem("smartmark_last_video_url", location.state.videoUrl);
    if (location.state?.fbVideoId) localStorage.setItem("smartmark_last_fb_video_id", String(location.state.fbVideoId));
  }, [location.state]);

  const [dropdownOpen, setDropdownOpen] = useState(true);
  const [isPaused, setIsPaused] = useState(false);

// when reading from navigation state, ALIAS the fields to avoid name collisions
const {
  imageUrl: navImageUrl,
  videoUrl: navVideoUrl,
  headline,
  body,
  videoScript,
  answers,
  fbVideoId: navFbVideoId,
} = location.state || {};

// REPLACE both of your "Always use navigation state..." effects with this ONE:
useEffect(() => {
  const img = navImageUrl || localStorage.getItem("smartmark_last_image_url") || "";
  const vid = navVideoUrl || localStorage.getItem("smartmark_last_video_url") || "";
  const vidId = navFbVideoId || localStorage.getItem("smartmark_last_fb_video_id") || "";

  setMediaImageUrl(img);
  setMediaVideoUrl(vid);
  if (vidId) setFbVideoId(vidId);

  if (navImageUrl) localStorage.setItem("smartmark_last_image_url", navImageUrl);
  if (navVideoUrl) localStorage.setItem("smartmark_last_video_url", navVideoUrl);
  if (navFbVideoId) localStorage.setItem("smartmark_last_fb_video_id", String(navFbVideoId));
}, [navImageUrl, navVideoUrl, navFbVideoId]);

// later when building the launch payload:
const payload = {
  // ...
  fbVideoId: fbVideoId || undefined,
};


  useEffect(() => {
    let email = localStorage.getItem("smartmark_last_email") || "";
    let cashapp = localStorage.getItem("smartmark_last_cashapp") || "";
    let key = getUserKey(email, cashapp);
    setUserKey(key);
    const conn = localStorage.getItem(`${key}_fb_connected_v2`);
    if (conn) {
      const { connected, time } = JSON.parse(conn);
      if (connected && Date.now() - time < 432000000) {
        setFbConnected(true);
      } else {
        setFbConnected(false);
        localStorage.removeItem(`${key}_fb_connected_v2`);
      }
    }
    const lastFields = localStorage.getItem("smartmark_last_campaign_fields");
    if (lastFields) setForm(JSON.parse(lastFields));
    const lastAudience = localStorage.getItem("smartmark_last_ai_audience");
    if (lastAudience) setForm(f => ({ ...f, aiAudience: JSON.parse(lastAudience) }));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);

    if (params.get("facebook_connected") === "1") {
      setFbConnected(true);
      if (userKey) {
        localStorage.setItem(`${userKey}_fb_connected_v2`, JSON.stringify({ connected: 1, time: Date.now() }));
      }
    }

    const tokenFromCallback = params.get("fb_user_token");
    if (tokenFromCallback) {
      setFbUserToken(tokenFromCallback);
      localStorage.setItem("smartmark_fb_user_token", tokenFromCallback);
    }

    if (params.get("facebook_connected") === "1" || tokenFromCallback) {
      window.history.replaceState({}, document.title, "/setup");
    }
    // eslint-disable-next-line
  }, [location, userKey]);

  useEffect(() => {
    if (fbConnected && userKey) {
      localStorage.setItem(`${userKey}_fb_connected_v2`, JSON.stringify({ connected: 1, time: Date.now() }));
    }
  }, [fbConnected, userKey]);

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        setAdAccounts(json.data || []);
      })
      .catch(err => console.error("FB ad accounts error", err));
  }, [fbConnected]);

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/pages`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        setPages(json.data || []);
      })
      .catch(err => console.error("FB pages error", err));
  }, [fbConnected]);

  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/details`)
        .then(res => res.json())
        .then(data => setCampaignStatus(data.status || data.effective_status || "ACTIVE"))
        .catch(() => setCampaignStatus("ACTIVE"));
    }
  }, [selectedCampaignId, selectedAccount]);

  useEffect(() => {
    if (fbConnected && selectedAccount) {
      const acctId = selectedAccount.replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          if (data && data.data) {
            setCampaigns(data.data.slice(0, 2));
            if (data.data.length > 0) setSelectedCampaignId(data.data[0].id);
          }
        });
    }
  }, [fbConnected, selectedAccount, launched]);

  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      const acctId = selectedAccount.replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/details`, { credentials: 'include' })
        .then(res => res.json())
        .then(c => {
          setBudget(c.budget || "");
          setForm(f => ({
            ...f,
            campaignName: c.campaignName || "",
            startDate: c.startDate || ""
          }));
        });
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/metrics`, { credentials: 'include' })
        .then(res => res.json())
        .then(setMetrics)
        .catch(() => setMetrics(null));
    }
  }, [selectedCampaignId, selectedAccount]);

  const handlePauseUnpause = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = selectedAccount.replace("act_", "");
    setLoading(true);
    try {
      if (isPaused) {
        await fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/unpause`, { method: "POST" });
        setCampaignStatus("ACTIVE");
        setIsPaused(false);
      } else {
        await fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/pause`, { method: "POST" });
        setCampaignStatus("PAUSED");
        setIsPaused(true);
      }
    } catch (e) {
      alert("Could not update campaign status.");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = selectedAccount.replace("act_", "");
    setLoading(true);
    try {
      await fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/cancel`, { method: "POST" });
      setCampaignStatus("ARCHIVED");
      setLaunched(false);
      setLaunchResult(null);
      setMetrics(null);
      setSelectedCampaignId("");
      alert("Campaign deleted.");
    } catch (e) {
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

  async function urlToBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }

  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = selectedAccount.replace("act_", "");
      const safeBudget = Math.max(3, Number(budget) || 0);

      let adImage = mediaImageUrl || imageUrl || localStorage.getItem("smartmark_last_image_url") || "";
      let adVideo = mediaVideoUrl || videoUrl || localStorage.getItem("smartmark_last_video_url") || "";
      const maybeFbVideoId = (location.state && location.state.fbVideoId) || fbVideoId || localStorage.getItem("smartmark_last_fb_video_id") || null;

      if (adImage && !adImage.startsWith("data:")) {
        adImage = await urlToBase64(adImage);
      }
      if (adVideo && !adVideo.startsWith("data:")) {
        adVideo = await urlToBase64(adVideo);
      }

     const payload = {
  form: { ...form },
  budget: safeBudget,
  campaignType: form?.campaignType || "Website Traffic",
  pageId: selectedPageId,
  aiAudience: form?.aiAudience || answers?.aiAudience || "",
  adCopy: (headline || "") + (body ? `\n\n${body}` : ""),
  adImage: adImage || "",
  adVideo: adVideo || "",
  answers: answers || {},
  mediaSelection,
  fbVideoId: fbVideoId || localStorage.getItem("smartmark_last_fb_video_id") || undefined, // <— add this
};


      const res = await fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/launch-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Server error");
      setLaunched(true);
      setLaunchResult(json);
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

  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: BG_GRADIENT,
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
            fontFamily: MODERN_FONT,
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
            fontFamily: MODERN_FONT,
          }}
        >
          Home
        </button>
      </div>

      {/* MAIN CONTENT */}
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
          background: "#232528e6",
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
            localStorage.setItem("smartmark_fb_connected", JSON.stringify({ connected: 1, time: Date.now() }));
          }}
          style={{
            padding: "1.15rem 2.8rem",
            borderRadius: "1.5rem",
            border: "none",
            background: fbConnected ? ACCENT_GREEN : "#1877F2",
            color: "#fff",
            fontWeight: 800,
            fontSize: "1.25rem",
            boxShadow: "0 2px 12px #1877f233",
            letterSpacing: "1px",
            cursor: "pointer",
            fontFamily: MODERN_FONT,
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
              fontFamily: MODERN_FONT,
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

       {/* CAMPAIGN NAME + INLINE SCHEDULER */}
        <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", width: "100%", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem", marginBottom: 7 }}>
              Campaign Name
            </label>
            <SchedulerInline
              backendUrl={backendUrl}
              form={form}
              selectedAccount={selectedAccount}
              selectedPageId={selectedPageId}
              budget={budget}
              mediaImageUrl={mediaImageUrl || imageUrl || localStorage.getItem("smartmark_last_image_url") || ""}
              mediaVideoUrl={mediaVideoUrl || videoUrl || localStorage.getItem("smartmark_last_video_url") || ""}
              headline={headline}
              body={body}
              answers={answers}
              mediaSelection={mediaSelection}
              fbVideoId={fbVideoId || location.state?.fbVideoId || localStorage.getItem("smartmark_last_fb_video_id") || null}
            />
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
              background: "#1c2120",
              color: "#b3f1d6",
              marginBottom: "1rem",
              outline: "none",
              width: "100%"
            }}
          />
        </div>

          {/* CAMPAIGN BUDGET */}
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
                background: "#1c2120",
                color: "#b3f1d6",
                marginBottom: "1rem",
                outline: "none",
                width: "100%"
              }}
            />
            {budget && Number(budget) > 0 && (
              <div style={{
                marginTop: "-0.6rem",
                fontWeight: 700,
                color: ACCENT_GREEN,
                fontSize: "1.06rem",
                letterSpacing: "0.04em"
              }}>
                Pay to <span style={{ color: "#19bd7b" }}>$Wknowles20</span>
              </div>
            )}
            <div style={{ color: "#afeca3", fontWeight: 700, marginBottom: 8 }}>
              SmartMark Fee: <span style={{ color: ACCENT_GREEN }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
            </div>
            {budget && Number(budget) >= 2 && (
              <div
                style={{
                  marginTop: "0.7rem",
                  color: "#ffe066",
                  background: "#1c1c1e",
                  borderRadius: "0.9rem",
                  padding: "0.8rem 1.1rem",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "1.13rem",
                  border: "1.2px solid #2b2923",
                  width: "100%"
                }}
              >
                <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, margin: "8px 0" }}>
                    <label style={{ color: "#fff", fontWeight: 600, fontSize: "1.01rem", marginBottom: 3 }}>Your CashApp:</label>
                    <input
                      type="text"
                      placeholder="CashApp username"
                      value={cashapp}
                      onChange={e => {
                        setCashapp(e.target.value);
                        localStorage.setItem("smartmark_login_username", e.target.value);
                      }}
                      style={{
                        padding: "0.74rem 1rem",
                        borderRadius: "0.85rem",
                        border: "1.2px solid #57dfa9",
                        fontSize: "1.09rem",
                        background: "#1c2120",
                        color: "#b3f1d6",
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
                      onChange={e => {
                        setEmail(e.target.value);
                        localStorage.setItem("smartmark_login_password", e.target.value);
                      }}
                      style={{
                        padding: "0.74rem 1rem",
                        borderRadius: "0.85rem",
                        border: "1.2px solid #57dfa9",
                        fontSize: "1.09rem",
                        background: "#1c2120",
                        color: "#b3f1d6",
                        marginBottom: 3,
                        width: "100%"
                      }}
                      autoComplete="email"
                    />
                  </div>
                </div>
                Pay (${fee.toFixed(2)}) to <span style={{ color: ACCENT_GREEN }}>$Wknowles20</span>
              </div>
            )}
          </div>

          <button
            onClick={handleLaunch}
            disabled={loading || campaignCount >= 2}
            style={{
              background: campaignCount >= 2 ? "#ccc" : "#14e7b9",
              color: "#181b20",
              border: "none",
              borderRadius: 13,
              fontWeight: 700,
              fontSize: "1.19rem",
              padding: "18px 72px",
              marginBottom: 18,
              marginTop: 2,
              fontFamily: MODERN_FONT,
              boxShadow: "0 2px 16px #0cc4be24",
              cursor: loading || campaignCount >= 2 ? "not-allowed" : "pointer",
              transition: "background 0.18s",
              opacity: loading || campaignCount >= 2 ? 0.6 : 1
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

        {/* RIGHT PANE: Metrics & Dropdown */}
        <aside style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: isMobile ? "center" : "flex-start",
          width: isMobile ? "100vw" : "100%",
          marginTop: isMobile ? 36 : 0,
          gap: "2.5rem",
          minWidth: isMobile ? "100vw" : 400,
          maxWidth: 430,
        }}>
          <div
            style={{
              background: "#1b1e22f7",
              borderRadius: "1.4rem",
              padding: isMobile ? "2rem 1.2rem" : "2.1rem 2rem 2.3rem 2rem",
              color: "#e7f8ec",
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
                        background: "#19c37d",
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
                        color: c.id === selectedCampaignId ? "#1ec885" : "#fff",
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
            {selectedCampaignId && (
              <>
                <div>Impressions: <b>{metrics?.impressions ?? "--"}</b></div>
                <div>Clicks: <b>{metrics?.clicks ?? "--"}</b></div>
                <div>CTR: <b>{metrics?.ctr ?? "--"}</b></div>
                <div>Spend: <b>{metrics?.spend ? `$${metrics.spend}` : "--"}</b></div>
                <div>Results: <b>{metrics?.results ?? "--"}</b></div>
                <div>Cost per Result: <b>
                  {metrics?.spend && metrics?.results
                    ? `$${(metrics.spend / metrics.results).toFixed(2)}`
                    : "--"}
                </b></div>
              </>
            )}
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

              {(mediaImageUrl || mediaVideoUrl) && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: mediaImageUrl && mediaVideoUrl ? "row" : "column",
                    gap: "18px",
                    margin: "22px 0 0 0",
                    alignItems: "center",
                    justifyContent: "center"
                  }}
                >
                  {mediaImageUrl && (
                    <div
                      style={{
                        position: "relative",
                        width: 120,
                        height: 120,
                        borderRadius: 16,
                        overflow: "hidden",
                        background: "#232a24",
                        boxShadow: "0 2px 18px 0 rgba(30,200,133,0.19)",
                        border: "2.2px solid #1ec885",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src={mediaImageUrl}
                        alt="Ad Creative"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 16,
                          display: "block"
                        }}
                      />
                      <button
                        style={{
                          position: "absolute",
                          bottom: 7,
                          right: 7,
                          background: "rgba(24,84,49,0.93)",
                          border: "none",
                          borderRadius: 7,
                          padding: 7,
                          cursor: "pointer",
                          color: "#fff",
                          fontSize: 16,
                          zIndex: 2,
                          display: "flex",
                          alignItems: "center",
                          boxShadow: "0 1px 7px #20292777"
                        }}
                        onClick={() => {
                          setModalImg(mediaImageUrl);
                          setShowImageModal(true);
                        }}
                        aria-label="Fullscreen Image"
                      >
                        <FaExpand />
                      </button>
                    </div>
                  )}
                  {mediaVideoUrl && (
                    <div
                      style={{
                        width: 120,
                        height: 120,
                        borderRadius: 16,
                        overflow: "hidden",
                        background: "#232a24",
                        boxShadow: "0 2px 18px 0 rgba(30,200,133,0.12)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        border: "2.2px solid #1ec885",
                        position: "relative"
                      }}
                    >
                      <VideoPreviewBox videoUrl={mediaVideoUrl} />
                    </div>
                  )}
                  <ImageModal
                    open={showImageModal}
                    imageUrl={modalImg}
                    onClose={() => setShowImageModal(false)}
                  />
                </div>
              )}

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
        </aside>
      </div>
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
                onClick={async () => {
                  setShowPauseModal(false);
                  await handlePauseUnpause();
                }}
                style={{ background: ACCENT_GREEN, color: '#fff', border: 'none', padding: '0.7rem 1.7rem', borderRadius: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                Yes, Pause
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Image Modal Component (put above or below CampaignSetup, or in the same file)
function ImageModal({ open, imageUrl, onClose }) {
  if (!open) return null;
  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 1005,
      background: "rgba(16,22,21,0.85)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <div style={{
        position: "relative",
        maxWidth: "88vw",
        maxHeight: "88vh",
        borderRadius: 18,
        background: "#191e20",
        padding: 0,
        boxShadow: "0 10px 60px #000c"
      }}>
        <img
          src={imageUrl}
          alt="Full Screen Ad"
          style={{
            maxWidth: "84vw",
            maxHeight: "80vh",
            display: "block",
            borderRadius: 14,
            background: "#101312"
          }}
        />
        <button
          style={{
            position: "absolute",
            top: 12,
            right: 18,
            background: "#212f29",
            border: "none",
            color: "#fff",
            borderRadius: 11,
            padding: "9px 17px",
            fontWeight: 700,
            fontSize: 15,
            cursor: "pointer",
            boxShadow: "0 1px 6px #1ec88530"
          }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default CampaignSetup;
