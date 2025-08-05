// src/pages/CampaignSetup.js

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const backendUrl = "https://smartmark-mvp.onrender.com";
const DARK_GREEN = "#185431";
const ACCENT_GREEN = "#1ec885";
const BG_GRADIENT = "linear-gradient(135deg,#232a24 0%,#34373d 100%)";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";

const getUserKey = (email, cashapp) =>
  `smartmark_user_${(email || "").trim().toLowerCase()}_${(cashapp || "").trim().toLowerCase()}`;

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = 25;
  const total = parsed + fee;
  return { fee, total };
};

const CampaignSetup = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({});
  const [userKey, setUserKey] = useState("");
  const [budget, setBudget] = useState("");
  const [fbConnected, setFbConnected] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [pages, setPages] = useState([]);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [metrics, setMetrics] = useState(null);
  const [launched, setLaunched] = useState(false);
  const [launchResult, setLaunchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [campaignStatus, setCampaignStatus] = useState("ACTIVE");
  const [showPauseModal, setShowPauseModal] = useState(false);

  // --- Get creative/copy data from FormPage (if present) ---
  const {
    imageUrl,
    videoUrl,
    headline,
    body,
    videoScript,
    answers
  } = location.state || {};

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
    if (!fbConnected) return;
    fetch(`${backendUrl}/auth/facebook/adaccounts`, { credentials: 'include' })
      .then(res => res.json())
      .then(json => {
        setAdAccounts(json.data || []);
        if (json.data && json.data.length > 0) setSelectedAccount(json.data[0].id.replace("act_", ""));
      })
      .catch(err => console.error("FB ad accounts error", err));
  }, [fbConnected]);

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

  const handleLaunch = async () => {
    setLoading(true);
    try {
      const acctId = selectedAccount.replace("act_", "");
      const safeBudget = Math.max(3, Number(budget) || 0);
      const payload = {
        form: { ...form },
        budget: safeBudget,
        campaignType: form?.campaignType || "Website Traffic",
        pageId: selectedPageId,
        aiAudience: form?.aiAudience,
        creative: {
          headline,
          body,
          imageUrl,
          videoUrl,
          videoScript
        },
        answers
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

  const { fee, total } = calculateFees(budget);

  // ----------- UI --------------
  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: BG_GRADIENT,
        fontFamily: MODERN_FONT,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowX: "hidden"
      }}
    >
      {/* Top nav/logo/back */}
      <div style={{
        width: "100vw",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "36px 56px 0 56px",
        position: "fixed",
        top: 0,
        zIndex: 99,
        background: "rgba(34,39,37,0.98)",
        boxShadow: "0 6px 32px #182f2144"
      }}>
        <button
          onClick={() => navigate('/form')}
          style={{
            background: "rgba(28,44,38,0.74)",
            color: "#fff",
            border: "none",
            borderRadius: "1.3rem",
            padding: "0.75rem 1.7rem",
            fontWeight: 700,
            fontSize: "1.09rem",
            letterSpacing: "0.7px",
            cursor: "pointer",
            boxShadow: "0 2px 10px 0 rgba(24,84,49,0.11)",
            fontFamily: MODERN_FONT,
          }}
        >
          ← Back
        </button>
        <SmartMarkLogoButton />
      </div>
      {/* Spacer for fixed nav */}
      <div style={{ height: 110 }} />

      {/* TOP: Campaign Setup Fields */}
      <div style={{
        width: "100vw",
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "flex-end",
        gap: "2.5vw",
        padding: "0 6vw 0 6vw",
        marginBottom: 36
      }}>
        {/* Connect + Payment */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <button
            onClick={() => window.location.href = `${backendUrl}/auth/facebook`}
            style={{
              padding: "1.18rem 3.1rem",
              borderRadius: "1.7rem",
              border: "none",
              background: fbConnected ? ACCENT_GREEN : "#1877F2",
              color: "#fff",
              fontWeight: 800,
              fontSize: "1.23rem",
              boxShadow: "0 2px 18px #1877f233",
              letterSpacing: "1.4px",
              cursor: "pointer",
              fontFamily: MODERN_FONT,
              transition: "background 0.23s",
              outline: "none"
            }}
          >
            {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
          </button>
          {fbConnected && (
            <button
              onClick={() => window.open(
                `https://business.facebook.com/ads/manager/account_settings/account_billing/?act=${selectedAccount}`,
                "Add Payment Method",
                `width=540,height=700,resizable,scrollbars`
              )}
              style={{
                padding: "1.1rem 2.2rem",
                borderRadius: "1.3rem",
                background: "#fff",
                color: "#1877F2",
                fontWeight: 700,
                border: "none",
                fontSize: "1.11rem",
                fontFamily: MODERN_FONT,
                boxShadow: "0 2px 8px #1877f233",
                cursor: "pointer",
                marginLeft: 6,
                outline: "none"
              }}
            >
              Add/Manage Payment Method
            </button>
          )}
        </div>
        {/* Campaign Name and Budget (side by side, equal width) */}
        <div style={{
          display: "flex",
          flexDirection: "row",
          gap: "2vw",
          width: "48vw",  // Responsive
          minWidth: 340,
          maxWidth: 760,
          justifyContent: "space-between",
          alignItems: "flex-end"
        }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 7 }}>Campaign Name</label>
            <input
              type="text"
              value={form.campaignName || ""}
              onChange={e => setForm({ ...form, campaignName: e.target.value })}
              placeholder="Name your campaign"
              style={{
                width: "100%",
                padding: "1.1rem 1.2rem",
                borderRadius: "1.2rem",
                border: "1.7px solid #13e7c4",
                fontSize: "1.22rem",
                background: "#19231b",
                color: "#b3f1d6",
                marginBottom: 6,
                outline: "none"
              }}
            />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <label style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 7 }}>Campaign Budget ($)</label>
            <input
              type="number"
              placeholder="Enter budget (minimum $3)"
              min={3}
              step={1}
              value={budget}
              onChange={e => setBudget(e.target.value)}
              style={{
                width: "100%",
                padding: "1.1rem 1.2rem",
                borderRadius: "1.2rem",
                border: "1.7px solid #13e7c4",
                fontSize: "1.22rem",
                background: "#19231b",
                color: "#b3f1d6",
                marginBottom: 6,
                outline: "none"
              }}
            />
          </div>
        </div>
        {/* Launch Button */}
        <button
          onClick={handleLaunch}
          disabled={loading}
          style={{
            background: "#14e7b9",
            color: "#181b20",
            border: "none",
            borderRadius: 15,
            fontWeight: 800,
            fontSize: "1.19rem",
            padding: "22px 38px",
            marginLeft: 18,
            minWidth: 170,
            boxShadow: "0 2px 24px #0cc4be22",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background 0.18s"
          }}
        >
          {loading ? "Launching..." : "Launch"}
        </button>
      </div>

      {/* Fee Summary */}
      <div style={{
        color: "#afeca3",
        fontWeight: 700,
        fontSize: "1.14rem",
        marginTop: 2,
        marginBottom: 18
      }}>
        SmartMark Fee: <span style={{ color: ACCENT_GREEN }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; 
        Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
        {budget && Number(budget) > 0 && (
          <span style={{ fontWeight: 700, color: ACCENT_GREEN, marginLeft: 14 }}>
            Pay to <span style={{ color: "#19bd7b" }}>$Wknowles20</span>
          </span>
        )}
      </div>
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

      {/* BOTTOM: Account/Page & Metrics */}
      <div style={{
        width: "100vw",
        padding: "0 0 60px 0",
        marginTop: 10,
        display: "flex",
        justifyContent: "center"
      }}>
        <div
          style={{
            width: "66vw",
            maxWidth: 950,
            background: "rgba(24,32,26,0.82)",
            borderRadius: "2.5rem",
            boxShadow: "0 2px 52px #183a2a18",
            padding: "2.4rem 2.7rem 2.5rem 2.7rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            fontFamily: MODERN_FONT,
            gap: "1.35rem"
          }}
        >
          {/* Ad Account & Page Selectors */}
          {fbConnected && (
            <div style={{ display: "flex", gap: 32, width: "100%", marginBottom: 12 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label style={{ color: "#d3f8ce", fontWeight: 700, marginBottom: 6, fontSize: 18 }}>Ad Account</label>
                <select
                  value={selectedAccount}
                  onChange={e => setSelectedAccount(e.target.value)}
                  style={{
                    padding: "1rem",
                    borderRadius: "1.2rem",
                    fontSize: "1.19rem",
                    outline: "none",
                    border: "1.7px solid #19bd7b",
                    background: "#1e2720",
                    color: "#b1fbd2",
                  }}>
                  {adAccounts.map(ac => (
                    <option key={ac.id} value={ac.id.replace("act_", "")}>
                      {ac.name ? `${ac.name} (${ac.id.replace("act_", "")})` : ac.id.replace("act_", "")}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <label style={{ color: "#d3f8ce", fontWeight: 700, marginBottom: 6, fontSize: 18 }}>Facebook Page</label>
                <select
                  value={selectedPageId}
                  onChange={e => setSelectedPageId(e.target.value)}
                  style={{
                    padding: "1rem",
                    borderRadius: "1.2rem",
                    fontSize: "1.19rem",
                    outline: "none",
                    border: "1.7px solid #19bd7b",
                    background: "#1e2720",
                    color: "#b1fbd2",
                  }}>
                  {pages.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {/* Metrics */}
          <div style={{
            fontSize: "1.53rem",
            fontWeight: 800,
            color: "#fff",
            marginBottom: 8,
            letterSpacing: ".08em"
          }}>
            Campaign: {form?.campaignName || "—"}
          </div>
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
        </div>
      </div>
    </div>
  );
};

export default CampaignSetup;
