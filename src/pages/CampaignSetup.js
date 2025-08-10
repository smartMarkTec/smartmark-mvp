// src/pages/CampaignSetup.js

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaPause, FaPlay, FaTrash, FaPlus, FaChevronDown, FaChevronUp, FaExpand, FaAngleLeft, FaAngleRight } from "react-icons/fa";

const backendUrl = "https://smartmark-mvp.onrender.com";
const DARK_GREEN = "#185431";
const ACCENT_GREEN = "#1ec885";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const BG_GRADIENT = "linear-gradient(135deg,#181b20 0%,#1e2327 100%)";

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

// --- Creative storage helpers (localStorage) ---
const STORE_KEY = "sm_campaign_creatives";
function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
  } catch {
    return {};
  }
}
function saveStore(obj) {
  localStorage.setItem(STORE_KEY, JSON.stringify(obj));
}
function getBucket(store, accountId, campaignId) {
  if (!accountId || !campaignId) return null;
  if (!store[accountId]) store[accountId] = {};
  if (!store[accountId][campaignId]) {
    store[accountId][campaignId] = {
      images: [],
      videos: [],
      fbVideoIds: [],
      meta: { createdAt: Date.now() }
    };
  }
  return store[accountId][campaignId];
}
function upsertCreatives({ accountId, campaignId, images = [], videos = [], fbVideoIds = [] }) {
  if (!accountId || !campaignId) return;
  const st = loadStore();
  const b = getBucket(st, accountId, campaignId);
  if (!b) return;
  const pushUnique = (arr, val) => {
    if (!val) return;
    if (!arr.includes(val)) arr.push(val);
  };
  images.slice(0, 2).forEach(u => pushUnique(b.images, u));
  videos.slice(0, 2).forEach(u => pushUnique(b.videos, u));
  fbVideoIds.slice(0, 2).forEach(id => pushUnique(b.fbVideoIds, String(id)));
  saveStore(st);
}
function readCreatives(accountId, campaignId) {
  const st = loadStore();
  const b = (st[accountId] && st[accountId][campaignId]) || null;
  return b || { images: [], videos: [], fbVideoIds: [], meta: {} };
}

// Small carousel for compact previews
function SmallCarousel({ items = [], type = "image", size = 120, onClick }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => { setIdx(0); }, [items.length]);
  if (!items || items.length === 0) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 12,
        background: "#2a2f33",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#9fb6ad", fontWeight: 700, fontSize: 12, border: "1.5px solid #31413b"
      }}>
        {type === "image" ? "Image" : "Video"}
      </div>
    );
  }
  const onPrev = (e) => { e.stopPropagation(); setIdx((idx - 1 + items.length) % items.length); };
  const onNext = (e) => { e.stopPropagation(); setIdx((idx + 1) % items.length); };
  const src = items[idx];
  const resolved = src?.startsWith("http") ? src : `${backendUrl}${src}`;
  return (
    <div
      onClick={() => onClick && onClick(resolved)}
      style={{
        position: "relative",
        width: size, height: size, borderRadius: 14, overflow: "hidden",
        border: "2px solid #18c38a", background: "#1d2326",
        boxShadow: "0 2px 12px rgba(24,195,138,0.16)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: onClick ? "pointer" : "default"
      }}
      title={type === "image" ? "Click to enlarge" : "Preview"}
    >
      {type === "image" ? (
        <img src={resolved} alt="creative" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <video src={resolved} style={{ width: "100%", height: "100%", objectFit: "cover", background: "#111" }} controls={false} muted playsInline />
      )}
      {items.length > 1 && (
        <>
          <button
            onClick={onPrev}
            style={{
              position: "absolute", left: 6, top: "50%", transform: "translateY(-50%)",
              width: 26, height: 26, borderRadius: 999, border: "none",
              background: "rgba(0,0,0,0.42)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer"
            }}>
            <FaAngleLeft />
          </button>
          <button
            onClick={onNext}
            style={{
              position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
              width: 26, height: 26, borderRadius: 999, border: "none",
              background: "rgba(0,0,0,0.42)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer"
            }}>
            <FaAngleRight />
          </button>
        </>
      )}
      {items.length > 1 && (
        <div style={{ position: "absolute", bottom: 6, right: 8, color: "#fff", fontWeight: 800, fontSize: 11, background: "rgba(0,0,0,0.35)", borderRadius: 8, padding: "2px 6px" }}>
          {idx + 1}/{items.length}
        </div>
      )}
    </div>
  );
}

function VideoPreviewBox({ videoUrl }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);
  const togglePlay = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoRef.current) return;
    if (playing) videoRef.current.pause(); else videoRef.current.play();
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

const CampaignSetup = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();

  // --- Persistent State (Auto Save + Restore) ---
  const [form, setForm] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("smartmark_last_campaign_fields") || "{}");
    } catch { return {}; }
  });
  const [budget, setBudget] = useState(() => localStorage.getItem("smartmark_last_budget") || "");
  const [cashapp, setCashapp] = useState(() => localStorage.getItem("smartmark_login_username") || "");
  const [email, setEmail] = useState(() => localStorage.getItem("smartmark_login_password") || "");
  const [selectedAccount, setSelectedAccount] = useState(() => localStorage.getItem("smartmark_last_selected_account") || "");
  const [selectedPageId, setSelectedPageId] = useState(() => localStorage.getItem("smartmark_last_selected_pageId") || "");
  const [fbConnected, setFbConnected] = useState(() => {
    const conn = localStorage.getItem("smartmark_fb_connected");
    if (conn) {
      const { connected, time } = JSON.parse(conn);
      if (connected && Date.now() - time < 2.5 * 24 * 60 * 60 * 1000) return true;
      localStorage.removeItem("smartmark_fb_connected");
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

  // Campaigns dropdown control (also toggles creatives visibility under it)
  const [dropdownOpen, setDropdownOpen] = useState(true);

  useEffect(() => {
    if (!selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
    fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`)
      .then(res => res.json())
      .then(data => {
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
  }, [location.state?.mediaSelection]);

  useEffect(() => { localStorage.setItem("smartmark_last_campaign_fields", JSON.stringify(form)); }, [form]);
  useEffect(() => { localStorage.setItem("smartmark_last_budget", budget); }, [budget]);
  useEffect(() => { localStorage.setItem("smartmark_login_username", cashapp); }, [cashapp]);
  useEffect(() => { localStorage.setItem("smartmark_login_password", email); }, [email]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_account", selectedAccount); }, [selectedAccount]);
  useEffect(() => { localStorage.setItem("smartmark_last_selected_pageId", selectedPageId); }, [selectedPageId]);
  useEffect(() => {
    if (fbConnected) {
      localStorage.setItem("smartmark_fb_connected", JSON.stringify({ connected: 1, time: Date.now() }));
    }
  }, [fbConnected]);

  // Navigation state aliases (if FormPage passed arrays)
  const {
    images: navImages,
    videos: navVideos,
    fbVideoIds: navFbVideoIds,
    imageUrl: navImageUrl, // fallback single
    videoUrl: navVideoUrl, // fallback single
    fbVideoId: navFbVideoIdSingle, // fallback single
    headline,
    body,
    videoScript,
    answers,
  } = location.state || {};

  // Pull creatives from nav state and commit to current selected campaign bucket when selected
  useEffect(() => {
    const acctId = String(selectedAccount || "").replace("act_", "");
    const cid = selectedCampaignId || "";
    if (!acctId || !cid) return;

    const imgs = Array.isArray(navImages) && navImages.length
      ? navImages
      : (navImageUrl ? [navImageUrl] : []);
    const vids = Array.isArray(navVideos) && navVideos.length
      ? navVideos
      : (navVideoUrl ? [navVideoUrl] : []);
    const vidIds = Array.isArray(navFbVideoIds) && navFbVideoIds.length
      ? navFbVideoIds
      : (navFbVideoIdSingle ? [String(navFbVideoIdSingle)] : []);

    if (imgs.length || vids.length || vidIds.length) {
      const resolvedImgs = imgs.map(u => (/^https?:\/\//.test(u) ? u : `${backendUrl}${u}`));
      const resolvedVids = vids.map(u => (/^https?:\/\//.test(u) ? u : `${backendUrl}${u}`));
      upsertCreatives({ accountId: acctId, campaignId: cid, images: resolvedImgs, videos: resolvedVids, fbVideoIds: vidIds });
      if (vidIds[0]) {
        setFbVideoId(vidIds[0]);
        localStorage.setItem("smartmark_last_fb_video_id", String(vidIds[0]));
      }
    }
  }, [selectedAccount, selectedCampaignId, navImages, navVideos, navFbVideoIds, navImageUrl, navVideoUrl, navFbVideoIdSingle]);

  // Load single "last" media fallbacks for left preview (optional)
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

  // Fetch accounts/pages/campaigns
  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => setAdAccounts(json.data || []))
      .catch(err => console.error("FB ad accounts error", err));
  }, [fbConnected]);

  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/pages`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => setPages(json.data || []))
      .catch(err => console.error("FB pages error", err));
  }, [fbConnected]);

  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      const acctId = String(selectedAccount).replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/details`)
        .then(res => res.json())
        .then(data => setCampaignStatus(data.status || data.effective_status || "ACTIVE"))
        .catch(() => setCampaignStatus("ACTIVE"));
    }
  }, [selectedCampaignId, selectedAccount]);

  useEffect(() => {
    if (fbConnected && selectedAccount) {
      const acctId = String(selectedAccount).replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaigns`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          const list = (data && data.data) ? data.data : [];
          setCampaigns(list.slice(0, 2));
          if (list.length > 0 && !selectedCampaignId) setSelectedCampaignId(list[0].id);
        });
    }
  }, [fbConnected, selectedAccount, launched]); // refresh after launch

  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      const acctId = String(selectedAccount).replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/metrics`, { credentials: 'include' })
        .then(res => res.json())
        .then(setMetrics)
        .catch(() => setMetrics(null));
    }
  }, [selectedCampaignId, selectedAccount]);

  // Pause/Play/Delete
  const [isPaused, setIsPaused] = useState(false);
  const handlePauseUnpause = async () => {
    if (!selectedCampaignId || !selectedAccount) return;
    const acctId = String(selectedAccount).replace("act_", "");
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
    const acctId = String(selectedAccount).replace("act_", "");
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

  // Launch
  async function urlToBase64(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  }
  const canLaunch = !!(
    fbConnected &&
    selectedAccount &&
    selectedPageId &&
    budget &&
    !isNaN(parseFloat(budget)) &&
    parseFloat(budget) >= 3
  );
  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = String(selectedAccount).replace("act_", "");
      const safeBudget = Math.max(3, Number(budget) || 0);

      // resolve current campaign creatives (first of each for the /launch-campaign route)
      const bucket = readCreatives(acctId, selectedCampaignId);
      const img0 = bucket.images?.[0] || mediaImageUrl || localStorage.getItem("smartmark_last_image_url") || "";
      const vid0 = bucket.videos?.[0] || mediaVideoUrl || localStorage.getItem("smartmark_last_video_url") || "";
      const fbVid0 = bucket.fbVideoIds?.[0] || fbVideoId || "";

      let adImage = img0;
      let adVideo = vid0;
      if (adImage && !adImage.startsWith("data:")) adImage = await urlToBase64(adImage);
      if (adVideo && !adVideo.startsWith("data:")) adVideo = await urlToBase64(adVideo);

      const payload = {
        form: { ...form },
        budget: safeBudget,
        campaignType: form?.campaignType || "Website Traffic",
        pageId: selectedPageId,
        aiAudience: form?.aiAudience || (location.state?.answers?.aiAudience) || "",
        adCopy: (headline || "") + (body ? `\n\n${body}` : ""),
        adImage: adImage || "",
        adVideo: adVideo || "",
        mediaSelection,
        fbVideoId: fbVid0 || undefined
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

  // Helpers for creatives display
  const currentAcctId = String(selectedAccount || "").replace("act_", "");
  const currentCreatives = readCreatives(currentAcctId, selectedCampaignId);
  const compactSize = 118;

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
          background: "#21262ae6",
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

          {/* Campaign Name */}
          <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem", alignSelf: "flex-start" }}>
              Campaign Name
            </label>
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

          {/* Budget */}
          <div style={{ width: "100%", maxWidth: 370, margin: "0 auto", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem", marginBottom: 7, alignSelf: "flex-start" }}>
              Campaign Budget ($)
            </label>
            <input
              type="number"
              placeholder="Enter budget (minimum $2)"
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
              <>
                <div style={{
                  marginTop: "-0.6rem",
                  fontWeight: 700,
                  color: ACCENT_GREEN,
                  fontSize: "1.06rem",
                  letterSpacing: "0.04em"
                }}>
                  Pay to <span style={{ color: "#19bd7b" }}>$Wknowles20</span>
                </div>
                <div style={{ color: "#afeca3", fontWeight: 700, marginBottom: 8 }}>
                  Fee: <span style={{ color: ACCENT_GREEN }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
                </div>

                {/* Show CashApp/Email only when budget entered */}
                <div style={{ width: "100%", maxWidth: 370, margin: "6px auto 0 auto", display: "flex", flexDirection: "column", gap: 8 }}>
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
              </>
            )}
          </div>

          {/* Launch */}
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
              padding: "16px 48px",
              marginBottom: 8,
              marginTop: 2,
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
              marginTop: "0.6rem",
              fontSize: "1.05rem",
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
          gap: "1.6rem",
          minWidth: isMobile ? "100vw" : 420,
          maxWidth: 520,
        }}>
          {/* Campaigns + Metrics + Creatives (attached under tab) */}
          <div
            style={{
              background: "#1b1f24f7",
              borderRadius: "1.4rem",
              padding: isMobile ? "1.6rem 1.1rem" : "1.8rem",
              color: "#e7f8ec",
              fontWeight: 700,
              width: isMobile ? "97vw" : "100%",
              maxWidth: "99vw",
              boxShadow: "0 2px 24px #183a2a13",
              display: "flex",
              flexDirection: "column",
              gap: "0.9rem",
              alignItems: "stretch",
              minHeight: "auto"
            }}
          >
            {/* Campaign Dropdown Header */}
            <div
              style={{
                display: "flex", width: "100%",
                justifyContent: "space-between",
                alignItems: "center"
              }}>
              <div
                style={{
                  fontSize: "1.12rem",
                  fontWeight: 800,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  gap: 9,
                }}
                onClick={() => setDropdownOpen(o => !o)}
                title="Toggle"
              >
                {dropdownOpen ? <FaChevronUp /> : <FaChevronDown />}
                {selectedCampaignId
                  ? (campaigns.find(c => c.id === selectedCampaignId)?.name || "Campaign")
                  : "Campaigns"}
              </div>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                <button
                  onClick={handlePauseUnpause}
                  disabled={loading || !selectedCampaignId}
                  style={{
                    background: isPaused ? "#22dd7f" : "#ffd966",
                    color: "#181b20",
                    border: "none",
                    borderRadius: 9,
                    fontWeight: 900,
                    fontSize: 18,
                    width: 34, height: 34,
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
                    fontSize: 16,
                    width: 34, height: 34,
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
                      fontSize: 18,
                      width: 34, height: 34,
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
                background: "#1f252a",
                borderRadius: "0.9rem",
                padding: "0.6rem 0.5rem",
                boxShadow: "0 2px 12px #193a2a13",
              }}>
                {campaigns.map(c => (
                  <div
                    key={c.id}
                    style={{
                      color: c.id === selectedCampaignId ? "#1ec885" : "#fff",
                      fontWeight: c.id === selectedCampaignId ? 800 : 600,
                      fontSize: "1.02rem",
                      cursor: "pointer",
                      padding: "0.42rem 0.8rem",
                      borderRadius: 8,
                      marginBottom: 4,
                      background: c.id === selectedCampaignId ? "#1c3938" : "transparent"
                    }}
                    onClick={() => setSelectedCampaignId(c.id)}
                  >
                    {c.name || c.id}
                  </div>
                ))}

                {/* Creatives attached under the tab (SMALL) */}
                {selectedCampaignId && (
                  <div style={{
                    marginTop: 10,
                    background: "#20262b",
                    border: "1px solid #2b343a",
                    borderRadius: 12,
                    padding: "10px 12px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10
                  }}>
                    <div style={{ color: "#baf5e4", fontWeight: 800, fontSize: 13, marginBottom: 4 }}>
                      Creatives
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {/* Two image slots */}
                      <SmallCarousel
                        items={(currentCreatives.images || []).slice(0, 2)}
                        type="image"
                        size={compactSize}
                        onClick={(url) => { setModalImg(url); setShowImageModal(true); }}
                      />
                      {/* Two video slots */}
                      <SmallCarousel
                        items={(currentCreatives.videos || []).slice(0, 2)}
                        type="video"
                        size={compactSize}
                        onClick={null}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metrics */}
            {selectedCampaignId && (
              <div style={{
                background: "#1f2428",
                borderRadius: 12,
                padding: "12px 14px",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 8,
                marginTop: 6,
                border: "1px solid #2a3438"
              }}>
                <div>Impressions: <b>{metrics?.impressions ?? "--"}</b></div>
                <div>Clicks: <b>{metrics?.clicks ?? "--"}</b></div>
                <div>CTR: <b>{metrics?.ctr ?? "--"}</b></div>
                <div>Spend: <b>{metrics?.spend ? `$${metrics.spend}` : "--"}</b></div>
                <div>Results: <b>{metrics?.results ?? "--"}</b></div>
                <div>Cost/Result: <b>
                  {metrics?.spend && metrics?.results
                    ? `$${(metrics.spend / metrics.results).toFixed(2)}`
                    : "--"}
                </b></div>
              </div>
            )}

            {/* Selectors */}
            <div style={{
              width: "100%", marginTop: 8, background: "#22282d", borderRadius: "1.1rem", padding: "1.1rem",
              display: "flex", flexDirection: "column", gap: 14, border: "1px solid #2c353a"
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
        </aside>
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

      <ImageModal open={showImageModal} imageUrl={modalImg} onClose={() => setShowImageModal(false)} />
    </div>
  );
};

export default CampaignSetup;
