// src/pages/CampaignSetup.js

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const backendUrl = "https://smartmark-mvp.onrender.com";
const DARK_GREEN = "#185431";
const LIGHT_BG = "#34373d";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";

const getUserKey = (email, cashapp) =>
  `smartmark_user_${(email || "").trim().toLowerCase()}_${(cashapp || "").trim().toLowerCase()}`;

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = parsed * 0.10 + 45;
  const total = parsed + fee;
  return { fee, total };
};

const btnStyle = {
  padding: "0.7rem 1.6rem",
  marginRight: "0.7rem",
  borderRadius: "1.1rem",
  background: "#21b16d",
  color: "#fff",
  border: "none",
  fontWeight: 700,
  fontSize: "1rem",
  cursor: "pointer",
  transition: "background 0.18s"
};

const CampaignSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef();

  const [form, setForm] = useState({});
  const [userKey, setUserKey] = useState("");
  const [budget, setBudget] = useState("");
  const [adCopy, setAdCopy] = useState("");
  const [adImage, setAdImage] = useState("");
  const [description, setDescription] = useState("");
  const [fbConnected, setFbConnected] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState("ACTIVE");
  const [showPauseModal, setShowPauseModal] = useState(false);

  // Fetch campaign status
  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/details`)
        .then(res => res.json())
        .then(data => setCampaignStatus(data.status || data.effective_status || "ACTIVE"))
        .catch(() => setCampaignStatus("ACTIVE"));
    }
  }, [selectedCampaignId, selectedAccount]);

  // Pause/unpause/cancel handlers
  const pauseCampaign = async () => {
    await fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/pause`, { method: "POST" });
    fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/details`)
      .then(res => res.json())
      .then(data => setCampaignStatus(data.status || data.effective_status || "PAUSED"));
  };

  const unpauseCampaign = async () => {
    await fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/unpause`, { method: "POST" });
    fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/details`)
      .then(res => res.json())
      .then(data => setCampaignStatus(data.status || data.effective_status || "ACTIVE"));
  };

  const cancelCampaign = async () => {
    await fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/cancel`, { method: "POST" });
    fetch(`${backendUrl}/auth/facebook/adaccount/${selectedAccount}/campaign/${selectedCampaignId}/details`)
      .then(res => res.json())
      .then(data => setCampaignStatus(data.status || data.effective_status || "ARCHIVED"));
  };

  // Load user info and prefill campaign form
  useEffect(() => {
    let email = localStorage.getItem("smartmark_last_email") || "";
    let cashapp = localStorage.getItem("smartmark_last_cashapp") || "";
    let key = getUserKey(email, cashapp);
    setUserKey(key);
    setFbConnected(localStorage.getItem(`${key}_fb_connected`) === "1");
    const lastFields = localStorage.getItem("smartmark_last_campaign_fields");
    if (lastFields) setForm(JSON.parse(lastFields));
    const lastAudience = localStorage.getItem("smartmark_last_ai_audience");
    if (lastAudience) setForm(f => ({ ...f, aiAudience: JSON.parse(lastAudience) }));
  }, []);

  // Facebook connect detection
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("facebook_connected") === "1") {
      setFbConnected(true);
      if (userKey) localStorage.setItem(`${userKey}_fb_connected`, "1");
      window.history.replaceState({}, document.title, "/setup");
    }
    // eslint-disable-next-line
  }, [location, userKey]);

  // Fetch Ad Accounts
  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        setAdAccounts(json.data || []);
        if (json.data && json.data.length > 0) setSelectedAccount(json.data[0].id.replace("act_", ""));
      })
      .catch(err => console.error("FB ad accounts error", err));
  }, [fbConnected]);

  // Fetch Pages
  useEffect(() => {
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/pages`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        setPages(json.data || []);
        if (json.data && json.data.length > 0) setSelectedPageId(json.data[0].id);
      })
      .catch(err => console.error("FB pages error", err));
  }, [fbConnected]);

  // Fetch campaigns for dropdown
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

  // When a campaign is selected, fetch its details and metrics
  useEffect(() => {
    if (selectedCampaignId && selectedAccount) {
      const acctId = selectedAccount.replace("act_", "");
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/details`, { credentials: 'include' })
        .then(res => res.json())
        .then(c => {
          setBudget(c.budget || "");
          setAdCopy(c.adCopy || "");
          setAdImage(c.adImage || "");
          setDescription(c.description || "");
          setForm(f => ({
            ...f,
            campaignName: c.campaignName || "",
            startDate: c.startDate || ""
          }));
        });
      // Fetch metrics
      fetch(`${backendUrl}/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/metrics`, { credentials: 'include' })
        .then(res => res.json())
        .then(setMetrics)
        .catch(() => setMetrics(null));
    }
  }, [selectedCampaignId, selectedAccount]);

  // + New Campaign
  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    setSelectedCampaignId("");
    setBudget("");
    setAdCopy("");
    setAdImage("");
    setDescription("");
    setLaunched(false);
    setLaunchResult(null);
    setMetrics(null);
    setForm({});
  };

  // File/image upload
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) {
      setAdImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  // Ad copy generation
  const handleGenerateAdCopy = async () => {
    if (!description && !form.businessName && !form.url) {
      alert("Please enter a description or business info.");
      return;
    }
    const res = await fetch("/api/generate-ad-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        businessName: form.businessName,
        url: form.url
      })
    });
    const data = await res.json();
    if (data.adCopy) {
      let copyWithUrl = data.adCopy.replace(/\[Your Link\]|\[Link\]/gi, form.url || "");
      setAdCopy(copyWithUrl);
    }
  };

  // -- Launch button logic: ensure everything valid, always type-sane --
  const canLaunch = !!(
    fbConnected &&
    selectedAccount &&
    selectedPageId &&
    adCopy &&
    adImage &&
    budget &&
    !isNaN(parseFloat(budget)) &&
    parseFloat(budget) >= 3
  );

  // Launch campaign (ALWAYS send complete, safe payload)
  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = selectedAccount.replace("act_", "");
      const safeBudget = Math.max(3, Number(budget) || 0);
      const payload = {
        form: {
          ...form,
          description,
        },
        budget: safeBudget,
        adCopy,
        adImage,
        campaignType: form?.campaignType || "Website Traffic",
        pageId: selectedPageId,
        aiAudience: form?.aiAudience,
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

  // FB payment popup
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
        background: "linear-gradient(135deg, #2b2e32 0%, #383c40 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        fontFamily: MODERN_FONT,
        position: "relative",
      }}
    >
      {/* Logo top right */}
      <div style={{ position: "fixed", top: 30, right: 36, zIndex: 99 }}>
        <SmartMarkLogoButton />
      </div>
      {/* Back Button */}
      <button
        onClick={() => navigate('/form')}
        style={{
          position: "fixed",
          top: 32,
          left: 72,
          background: "rgba(52,55,61,0.82)",
          color: "#fff",
          border: "none",
          borderRadius: "1.1rem",
          padding: "0.65rem 1.6rem",
          fontWeight: 700,
          fontSize: "1rem",
          letterSpacing: "0.8px",
          cursor: "pointer",
          boxShadow: "0 2px 12px 0 rgba(24,84,49,0.09)",
          zIndex: 20,
          transition: "background 0.18s",
          fontFamily: MODERN_FONT,
        }}
      >
        ← Back
      </button>
      <div
        style={{
          background: `${LIGHT_BG}e6`,
          marginTop: "5.5rem",
          borderRadius: "2.1rem",
          boxShadow: "0 8px 40px 0 rgba(24,84,49,0.10)",
          padding: "2.6rem 2.2rem",
          width: "100%",
          maxWidth: 750,
          minWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: "2.2rem",
        }}
      >
        {/* Facebook Connect */}
        <div style={{ marginBottom: "1.1rem", display: "flex", alignItems: "center", gap: "1.3rem" }}>
          <a
            href={`${backendUrl}/auth/facebook`}
            style={{
              display: "inline-block",
              padding: "0.95rem 1.5rem",
              borderRadius: "1.7rem",
              border: "none",
              background: "#1877F2",
              color: "#fff",
              fontWeight: 700,
              fontSize: "1.18rem",
              letterSpacing: "1px",
              cursor: "pointer",
              boxShadow: "0 2px 12px #1877f233",
              fontFamily: MODERN_FONT,
              transition: "background 0.16s",
              width: "auto",
              textAlign: "center",
              textDecoration: "none"
            }}
          >
            Connect Facebook Ads
          </a>
          {fbConnected && (
            <div
              style={{
                color: "#1ec885",
                fontWeight: 700,
                fontSize: "1.13rem",
                fontFamily: MODERN_FONT,
                textShadow: "0 1px 6px #12392144"
              }}
            >
              Facebook Ads Connected!
            </div>
          )}
        </div>

        {/* Add/Manage Payment Method Button */}
        {fbConnected && (
          <button
            onClick={openFbPaymentPopup}
            style={{
              marginTop: 8,
              padding: "0.75rem 1.6rem",
              borderRadius: "1.1rem",
              background: "#fff",
              color: "#1877F2",
              fontWeight: 700,
              border: "none",
              cursor: "pointer",
              fontFamily: MODERN_FONT,
              fontSize: "1rem",
              boxShadow: "0 2px 8px #1877f233"
            }}
          >
            Add/Manage Payment Method
          </button>
        )}

        {/* Campaigns Tab */}
        {fbConnected && (
          <div style={{
            background: "#232529",
            borderRadius: "1.4rem",
            padding: "1.5rem 1.1rem",
            marginBottom: "0.2rem",
            boxShadow: "0 2px 12px #193a3a11"
          }}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{color:"#fff",fontWeight:800,fontSize:"1.17rem"}}>Your Campaigns</div>
              <button
                type="button"
                onClick={handleNewCampaign}
                disabled={campaigns.length >= 2}
                style={{
                  background: campaigns.length >= 2 ? "#c6c6c6" : DARK_GREEN,
                  color: "#fff",
                  fontWeight: 700,
                  borderRadius: "1.1rem",
                  border: "none",
                  padding: "0.7rem 1.7rem",
                  cursor: campaigns.length >= 2 ? "not-allowed" : "pointer",
                  fontSize: "1.05rem",
                  boxShadow: "0 2px 8px #163a1f19",
                  opacity: campaigns.length >= 2 ? 0.6 : 1
                }}
                title={campaigns.length >= 2 ? "Limit 2 campaigns" : ""}
              >
                + New Campaign
              </button>
            </div>
            {campaigns.length > 0 && (
              <div style={{marginBottom: 12}}>
                <label style={{ color: "#fff", fontWeight: 600, marginRight: 8 }}>
                  Select Campaign:
                </label>
                <select
                  value={selectedCampaignId}
                  onChange={e => setSelectedCampaignId(e.target.value)}
                  style={{
                    padding: "0.7rem",
                    borderRadius: "1.1rem",
                    fontSize: "1.09rem",
                  }}
                >
                  {campaigns.map((c, idx) => (
                    <option key={c.id} value={c.id}>
                      {c.campaignName || `Campaign ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedCampaignId && (
              <div style={{ marginBottom: "1.2rem", marginTop: "0.2rem" }}>
                <span style={{
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "1.05rem",
                  marginRight: 16,
                  letterSpacing: ".4px"
                }}>
                  Status:{" "}
                  {campaignStatus === "PAUSED"
                    ? "Paused"
                    : campaignStatus === "CANCELED"
                    ? "Canceled"
                    : "Active"}
                </span>
                {(campaignStatus === "ACTIVE" || campaignStatus === "RUNNING") && (
                  <button
                    onClick={() => setShowPauseModal(true)}
                    style={btnStyle}
                  >
                    Pause
                  </button>
                )}
                {campaignStatus === "PAUSED" && (
                  <button
                    onClick={unpauseCampaign}
                    style={btnStyle}
                  >
                    Unpause
                  </button>
                )}
                {campaignStatus !== "CANCELED" && (
                  <button
                    onClick={cancelCampaign}
                    style={{ ...btnStyle, background: "#e74c3c", color: "#fff" }}
                  >
                    Cancel
                  </button>
                )}
                <div style={{color:'#fff', fontWeight:600, marginTop:8}}>
                  Started: {campaigns.find(c=>c.id===selectedCampaignId)?.startDate ?
                    new Date(campaigns.find(c=>c.id===selectedCampaignId).startDate).toLocaleDateString() : "--"}
                </div>
              </div>
            )}
            {selectedCampaignId && metrics && (
              <div style={{
                background: "#191d1f",
                borderRadius: "1rem",
                padding: "1.2rem 1.4rem",
                color: "#a8e8a8",
                fontWeight: 600,
                marginTop: 12,
                marginBottom: -8
              }}>
                <div style={{fontSize:"1.19rem",fontWeight:700,color:"#fff",marginBottom:8}}>
                  Campaign Metrics
                </div>
                <div>Impressions: <b>{metrics.impressions ?? "--"}</b></div>
                <div>Clicks: <b>{metrics.clicks ?? "--"}</b></div>
                <div>CTR: <b>{metrics.ctr ?? "--"}</b></div>
                <div>Spend: <b>{metrics.spend ? `$${metrics.spend}` : "--"}</b></div>
                <div>Results: <b>{metrics.results ?? "--"}</b></div>
              </div>
            )}
            <div style={{
              marginTop: "0.9rem",
              marginBottom: "0.2rem",
              color: "#6fdaac",
              fontWeight: 600,
              fontSize: "1rem"
            }}>
              You can create up to <b>2 campaigns</b> per account.
            </div>
          </div>
        )}

        {/* Main Campaign Form */}
        <div>
          {/* Ad Account + Page selection */}
          {fbConnected && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label style={{ color: "#fff", fontWeight: 600 }}>Ad Account</label>
              <select
                value={selectedAccount}
                onChange={e => setSelectedAccount(e.target.value)}
                style={{
                  padding: "0.7rem",
                  borderRadius: "1.1rem",
                  fontSize: "1.06rem",
                }}
              >
                {adAccounts.map(ac => (
                  <option key={ac.id} value={ac.id.replace("act_", "")}>
                    {ac.name ? `${ac.name} (${ac.id.replace("act_", "")})` : ac.id.replace("act_", "")}
                  </option>
                ))}
              </select>

              <label style={{ color: "#fff", fontWeight: 600 }}>Facebook Page</label>
              <select
                value={selectedPageId}
                onChange={e => setSelectedPageId(e.target.value)}
                style={{
                  padding: "0.7rem",
                  borderRadius: "1.1rem",
                  fontSize: "1.06rem",
                }}
              >
                {pages.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Ad Creative & Copy */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.7rem",
              alignItems: "center",
              background: "#222528",
              borderRadius: "1.2rem",
              padding: "2rem 1.5rem",
              marginTop: "1.6rem",
            }}
          >
            {/* Campaign Name */}
            <label style={{ color: "#fff", fontWeight: 600, marginTop: "1.3rem" }}>Campaign Name</label>
            <input
              type="text"
              value={form.campaignName || ""}
              onChange={e => setForm({ ...form, campaignName: e.target.value })}
              placeholder="Name your campaign"
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: "1.1rem",
                border: "1px solid #c6c6c6",
                fontSize: "1.11rem",
                width: "100%",
                marginBottom: "1rem",
              }}
            />

            <label style={{ color: "#fff", fontWeight: 600 }}>Campaign Budget ($)</label>
            <input
              type="number"
              placeholder="Enter budget (minimum $3)"
              min={3}
              step={1}
              value={budget}
              onChange={e => setBudget(e.target.value)}
              style={{
                padding: "0.8rem 1.1rem",
                borderRadius: "1.1rem",
                border: "1px solid #c6c6c6",
                fontSize: "1.11rem",
                width: "100%",
                marginBottom: "1rem",
              }}
            />
            {budget && Number(budget) > 0 && (
              <div style={{
                marginTop: "-0.7rem",
                marginBottom: "0.5rem",
                fontWeight: 700,
                color: "#1ec885",
                fontSize: "1.05rem",
                textAlign: "left",
                letterSpacing: "0.03em",
                fontFamily: "'Poppins', 'Times New Roman', Times, serif",
              }}>
                Pay to <span style={{ color: "#19bd7b" }}>$Wknowles20</span>
              </div>
            )}

            <div style={{ color: "#afeca3", fontWeight: 600 }}>
              SmartMark Fee: <span style={{ color: "#12cf5a" }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
            </div>
            {budget && Number(budget) >= 3 && (
              <div
                style={{
                  marginTop: "0.7rem",
                  color: "#ffe066",
                  background: "#1c1c1e",
                  borderRadius: "0.8rem",
                  padding: "0.75rem 1rem",
                  fontWeight: 700,
                  textAlign: "center",
                  fontSize: "1.13rem",
                  border: "1px solid #2b2923"
                }}
              >
                Pay (${fee.toFixed(2)}) to <span style={{ color: "#12cf5a" }}>$Wknowles20</span>
              </div>
            )}

            <label style={{ color: "#fff", fontWeight: 600, marginTop: "1.3rem" }}>Ad Description</label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe your business or promo"
              style={{
                padding: "0.8rem",
                borderRadius: "0.9rem",
                border: "1px solid #ddd",
                fontSize: "1.08rem",
                width: "100%",
                marginBottom: "1rem",
                resize: "vertical",
              }}
            />
            <button
              type="button"
              onClick={handleGenerateAdCopy}
              style={{
                background: "#1adf72",
                color: "#222",
                border: "none",
                borderRadius: "1.1rem",
                padding: "0.7rem 1.7rem",
                fontWeight: 700,
                fontSize: "1.05rem",
                marginBottom: "1rem",
                cursor: "pointer",
                fontFamily: MODERN_FONT,
              }}
            >
              Generate Ad Copy with AI
            </button>
            <label style={{ color: "#fff", fontWeight: 600, marginTop: "1rem" }}>Ad Copy</label>
            <textarea
              rows={3}
              value={adCopy}
              onChange={e => setAdCopy(e.target.value)}
              placeholder="Paste or write your ad copy"
              style={{
                padding: "0.8rem",
                borderRadius: "0.9rem",
                border: "1px solid #ddd",
                fontSize: "1.08rem",
                width: "100%",
                marginBottom: "1rem",
                resize: "vertical",
              }}
            />
            <label style={{ color: "#fff", fontWeight: 600, marginTop: "1rem" }}>Ad Image</label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleImageUpload}
              style={{ marginBottom: "1rem" }}
            />
            {adImage && (
              <img
                src={adImage}
                alt="Ad preview"
                style={{
                  maxWidth: 320,
                  maxHeight: 180,
                  borderRadius: "1.1rem",
                  marginBottom: "1.2rem",
                  objectFit: "cover",
                }}
              />
            )}
          </div>
          {/* LAUNCH BUTTON */}
          <button
            type="button"
            onClick={handleLaunch}
            disabled={loading || !canLaunch}
            style={{
              background: DARK_GREEN,
              color: "#fff",
              fontWeight: 700,
              borderRadius: "1.1rem",
              border: "none",
              padding: "1rem 2.4rem",
              fontSize: "1.14rem",
              cursor: loading || !canLaunch ? "not-allowed" : "pointer",
              marginTop: "2.2rem",
              width: "100%",
              opacity: loading || !canLaunch ? 0.75 : 1,
              fontFamily: MODERN_FONT,
              boxShadow: "0 2px 18px 0 #15713717"
            }}
            title={!canLaunch ? "Fill in all required fields. Budget must be $3+." : ""}
          >
            {loading ? "Launching..." : "Launch Campaign"}
          </button>
          {launched && launchResult && (
            <div style={{
              color: "#1eea78",
              fontWeight: 800,
              marginTop: "1.2rem",
              fontSize: "1.16rem",
              textShadow: "0 2px 8px #0a893622"
            }}>
              Campaign launched! ID: {launchResult.campaignId || "--"}
            </div>
          )}
        </div>
      </div>
      {/* Pause Modal */}
      {showPauseModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            background: '#24262b', borderRadius: 16, padding: 32, minWidth: 340, boxShadow: "0 8px 40px #000a"
          }}>
            <div style={{fontWeight: 700, fontSize: 20, marginBottom: 24, color:'#fff'}}>
              Are you sure you want to pause this campaign?
            </div>
            <div style={{display: 'flex', justifyContent: 'flex-end', gap: 16}}>
              <button
                onClick={() => setShowPauseModal(false)}
                style={{background:'#e74c3c', color:'#fff', border:'none', padding:'0.6rem 1.5rem', borderRadius:12, fontWeight:700, cursor:'pointer'}}
              >
                No
              </button>
              <button
                onClick={async () => {
                  setShowPauseModal(false);
                  await pauseCampaign();
                }}
                style={{background:'#21b16d', color:'#fff', border:'none', padding:'0.6rem 1.5rem', borderRadius:12, fontWeight:700, cursor:'pointer'}}
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

export default CampaignSetup;
