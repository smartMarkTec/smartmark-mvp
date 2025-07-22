// src/pages/CampaignSetup.js
import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const backendUrl = "https://smartmark-backend.onrender.com";
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

const CampaignSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef();

  // State for login/user
  const [form, setForm] = useState({});
  const [userKey, setUserKey] = useState("");

  // State for campaign setup
  const [budget, setBudget] = useState("");
  const [adCopy, setAdCopy] = useState("");
  const [adImage, setAdImage] = useState("");
  const [description, setDescription] = useState("");

  // Facebook/account state
  const [fbConnected, setFbConnected] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");

  // Campaign management
  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [metrics, setMetrics] = useState(null);

  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);

  // On mount: load user info and all saved data
  useEffect(() => {
    let email = localStorage.getItem("smartmark_last_email") || "";
    let cashapp = localStorage.getItem("smartmark_last_cashapp") || "";
    let key = getUserKey(email, cashapp);
    setUserKey(key);
    setFbConnected(localStorage.getItem(`${key}_fb_connected`) === "1");
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
    fetch("/auth/facebook/adaccounts")
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
    fetch("/auth/facebook/pages")
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
      fetch(`/auth/facebook/adaccount/${acctId}/campaigns`)
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
      fetch(`/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/details`)
        .then(res => res.json())
        .then(c => {
          setBudget(c.budget || "");
          setAdCopy(c.adCopy || "");
          setAdImage(c.adImage || "");
          setDescription(c.description || "");
        });
      // Fetch metrics
      fetch(`/auth/facebook/adaccount/${acctId}/campaign/${selectedCampaignId}/metrics`)
        .then(res => res.json())
        .then(setMetrics)
        .catch(() => setMetrics(null));
    }
  }, [selectedCampaignId, selectedAccount]);

  // + New Campaign (reset state if <2 exist)
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
    if (data.adCopy) setAdCopy(data.adCopy);
  };

  // After launch, set the new status
  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = selectedAccount.replace("act_", "");
      const res = await fetch(`/auth/facebook/adaccount/${acctId}/launch-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form,
          budget,
          adCopy,
          adImage,
          campaignType: form?.campaignType || "Website Traffic",
          pageId: selectedPageId,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setLaunched(true);
      setLaunchResult(json);
      setTimeout(() => setLaunched(false), 1500);
    } catch (err) {
      alert("Failed to launch campaign: " + (err.message || ""));
      console.error(err);
    }
    setLoading(false);
  };

  // OPEN FB PAYMENT POPUP
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
        {/* Facebook Connect: button always clickable, status shown nearby */}
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

        {/* --------- CAMPAIGNS TAB --------- */}
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
            {/* Campaign List Dropdown */}
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
                  {campaigns.map((c, i) => (
                    <option key={c.id} value={c.id}>
                      {c.name || `Campaign ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {/* Show metrics for selected campaign */}
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

        {/* --------- MAIN CAMPAIGN FORM --------- */}
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
                    {ac.name || ac.id}
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
            <label style={{ color: "#fff", fontWeight: 600 }}>Campaign Budget ($)</label>
            <input
              type="number"
              placeholder="Enter budget (minimum $100)"
              min={100}
              step={10}
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
            <div style={{ color: "#afeca3", fontWeight: 600 }}>
              SmartMark Fee: <span style={{ color: "#12cf5a" }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
            </div>
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
            disabled={loading}
            style={{
              background: DARK_GREEN,
              color: "#fff",
              fontWeight: 700,
              borderRadius: "1.1rem",
              border: "none",
              padding: "1rem 2.4rem",
              fontSize: "1.14rem",
              cursor: loading ? "not-allowed" : "pointer",
              marginTop: "2.2rem",
              width: "100%",
              opacity: loading ? 0.75 : 1,
              fontFamily: MODERN_FONT,
              boxShadow: "0 2px 18px 0 #15713717"
            }}
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
    </div>
  );
};

export default CampaignSetup;
