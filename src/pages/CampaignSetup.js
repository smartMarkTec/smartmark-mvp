// src/pages/CampaignSetup.js

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import SmartMarkLogoButton from "../components/SmartMarkLogoButton";

const backendUrl = "https://smartmark-mvp.onrender.com";
const DARK_GREEN = "#185431";
const ACCENT_GREEN = "#1ec885";
const MODERN_FONT = "'Poppins', 'Inter', 'Segoe UI', Arial, sans-serif";
const BG_GRADIENT = "linear-gradient(135deg,#232a24 0%,#34373d 100%)";

// ----------- Responsive Helper ------------
const useIsMobile = () => {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth <= 900);
  React.useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
};
// ------------------------------------------

const getUserKey = (email, cashapp) =>
  `smartmark_user_${(email || "").trim().toLowerCase()}_${(cashapp || "").trim().toLowerCase()}`;

const calculateFees = (budget) => {
  const parsed = parseFloat(budget);
  if (isNaN(parsed) || parsed <= 0) return { fee: 0, total: 0 };
  const fee = 25; // Flat $25 per campaign
  const total = parsed + fee;
  return { fee, total };
};

const CampaignSetup = () => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({});
  const [userKey, setUserKey] = useState("");
  const [budget, setBudget] = useState("");
  const [fbConnected, setFbConnected] = useState(false);
  const [openAccount, setOpenAccount] = useState(true);
  const [openPage, setOpenPage] = useState(true);
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
    const params = new URLSearchParams(location.search);
    if (params.get("facebook_connected") === "1") {
      setFbConnected(true);
      if (userKey) {
        localStorage.setItem(`${userKey}_fb_connected_v2`, JSON.stringify({ connected: 1, time: Date.now() }));
      }
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

  const handleNewCampaign = () => {
    if (campaigns.length >= 2) return;
    setSelectedCampaignId("");
    setBudget("");
    setLaunched(false);
    setLaunchResult(null);
    setMetrics(null);
    setForm({});
  };

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
      const acctId = selectedAccount.replace("act_", "");
      const safeBudget = Math.max(3, Number(budget) || 0);
      const payload = {
        form: {
          ...form,
        },
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
        answers // optional: send all original answers for audit/debug
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

  // ----------- UI -------------
  return (
    <div
      style={{
        minHeight: "100vh",
        minWidth: "100vw",
        background: BG_GRADIENT,
        fontFamily: MODERN_FONT,
        padding: isMobile ? "0" : "0 0 0 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowX: "hidden"
      }}
    >
      {/* Fixed Logo + Back button */}
      <div style={{
        position: "fixed",
        top: 28,
        left: 38,
        zIndex: 98,
      }}>
        <SmartMarkLogoButton />
      </div>
      <button
        onClick={() => navigate('/form')}
        style={{
          position: "fixed",
          top: 32,
          left: 108,
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
          zIndex: 20,
          fontFamily: MODERN_FONT,
        }}
      >
        ← Back
      </button>

      {/* MAIN CONTENT GRID */}
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
        {/* LEFT: Campaign Setup Form */}
        <main style={{
          background: "#232528e6",
          borderRadius: "2.2rem",
          boxShadow: "0 12px 52px 0 rgba(30,200,133,0.13)",
          padding: isMobile ? "2.4rem 1.2rem" : "3.7rem 2.6rem",
          minWidth: isMobile ? "99vw" : 500,
          maxWidth: isMobile ? "100vw" : 540,
          flex: "0 1 520px",
          display: "flex",
          flexDirection: "column",
          gap: "2.3rem",
          alignItems: "center",
          marginBottom: isMobile ? 30 : 0,
        }}>
          {/* Facebook Connect */}
          <button
            onClick={() => window.location.href = `${backendUrl}/auth/facebook`}
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
              marginBottom: 10,
              fontFamily: MODERN_FONT,
              width: "100%",
              maxWidth: 370,
              transition: "background 0.23s"
            }}
          >
            {fbConnected ? "Facebook Ads Connected" : "Connect Facebook Ads"}
          </button>
          {fbConnected && (
            <button
              onClick={openFbPaymentPopup}
              style={{
                marginTop: 4,
                padding: "0.72rem 1.5rem",
                borderRadius: "1.1rem",
                background: "#fff",
                color: "#1877F2",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                fontFamily: MODERN_FONT,
                fontSize: "1.01rem",
                boxShadow: "0 2px 8px #1877f233"
              }}
            >
              Add/Manage Payment Method
            </button>
          )}

          {/* --- Removed Ad Account & Page from here --- */}

          {/* Campaign Name & Budget */}
          <div
            style={{
              background: "#252c26e6",
              borderRadius: "1.7rem",
              padding: "2.5rem 2rem",
              marginTop: "1rem",
              boxShadow: "0 2px 32px #181b2045",
              width: "100%",
              maxWidth: 500,
              display: "flex",
              flexDirection: "column",
              gap: "1.2rem",
            }}
          >
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem" }}>Campaign Name</label>
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
                outline: "none"
              }}
            />
            <label style={{ color: "#fff", fontWeight: 700, fontSize: "1.13rem" }}>Campaign Budget ($)</label>
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
                outline: "none"
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
            <div style={{ color: "#afeca3", fontWeight: 700 }}>
              SmartMark Fee: <span style={{ color: ACCENT_GREEN }}>${fee.toFixed(2)}</span> &nbsp;|&nbsp; Total: <span style={{ color: "#fff" }}>${total.toFixed(2)}</span>
            </div>
            {budget && Number(budget) >= 3 && (
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
                  border: "1.2px solid #2b2923"
                }}
              >
                Pay (${fee.toFixed(2)}) to <span style={{ color: ACCENT_GREEN }}>$Wknowles20</span>
              </div>
            )}
          </div>
          <button
            onClick={handleLaunch}
            disabled={loading}
            style={{
              background: "#14e7b9",
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
              cursor: loading ? "not-allowed" : "pointer",
              transition: "background 0.18s"
            }}
          >
            {loading ? "Launching..." : "Launch"}
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

        {/* RIGHT: Metrics and Summary */}
        <aside style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: isMobile ? "center" : "flex-start",
          width: isMobile ? "100vw" : "100%",
          marginTop: isMobile ? 36 : 0,
          gap: "2.5rem",
        }}>
          {/* Metrics Pane */}
          <div
            style={{
              background: "#1b1e22f7",
              borderRadius: "1.4rem",
              padding: isMobile ? "2rem 1.2rem" : "2.7rem 2.7rem",
              color: "#e7f8ec",
              fontWeight: 700,
              width: isMobile ? "97vw" : 460,
              maxWidth: "99vw",
              boxShadow: "0 2px 24px #183a2a13",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem"
            }}
          >
            {/* --- Ad Account & Page Dropdowns (now in Metrics box) --- */}
            {fbConnected && (
              <div style={{
                width: "100%",
                background: "#242628",
                borderRadius: "1.8rem",
                boxShadow: "0 2px 16px #193a3a16",
                padding: "1.2rem 1rem 0.8rem 1rem",
                marginBottom: "1.2rem",
              }}>
                <div style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "space-between",
                  marginBottom: 12
                }}>
                  <div style={{ fontWeight: 700, fontSize: "1.08rem", color: "#fff" }}>Ad Account</div>
                  <div style={{ fontWeight: 700, fontSize: "1.08rem", color: "#fff" }}>Facebook Page</div>
                </div>
                <div style={{
                  display: "flex",
                  gap: "1.1rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}>
                  <select
                    value={selectedAccount}
                    onChange={e => setSelectedAccount(e.target.value)}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "1.1rem",
                      fontSize: "1.07rem",
                      width: "50%",
                      outline: "none",
                      border: "1.5px solid #2e5c44",
                      background: "#2c2f33",
                      color: "#c7fbe3",
                    }}>
                    {adAccounts.map(ac => (
                      <option key={ac.id} value={ac.id.replace("act_", "")}>
                        {ac.name ? `${ac.name} (${ac.id.replace("act_", "")})` : ac.id.replace("act_", "")}
                      </option>
                    ))}
                  </select>
                  <select
                    value={selectedPageId}
                    onChange={e => setSelectedPageId(e.target.value)}
                    style={{
                      padding: "0.75rem",
                      borderRadius: "1.1rem",
                      fontSize: "1.07rem",
                      width: "48%",
                      outline: "none",
                      border: "1.5px solid #2e5c44",
                      background: "#2c2f33",
                      color: "#c7fbe3",
                    }}>
                    {pages.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <div style={{
              fontSize: "1.23rem",
              fontWeight: 800,
              color: "#fff",
              marginBottom: 12,
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
                  await pauseCampaign();
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

export default CampaignSetup;
