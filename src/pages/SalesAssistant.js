import React, { useState, useEffect, useRef, useCallback } from "react";

const LS_KEY = "sm_sales_assistant_v1";
const PASSCODE = "SMARTEMARK_SALES_2026";

// ─── Default Data ────────────────────────────────────────────────────────────

const DEFAULT_SCRIPT = {
  opener: `Hey, this is Will/Walter/Emma calling from UTSA — how've you been?\n\nI'm reaching out because I'm part of a small team over here at UTSA that's been getting feedback working with HVAC companies on an AI marketing software we built that basically helps automate advertising and helps get more calls coming in.\n\nI've been showing it to a few companies in the area and getting feedback.\n\nI know I caught you out of the blue here, but do you have a quick minute right now? I can give you the simple version so you can see if it's even worth taking a look at.`,
  ifBusy: `I understand. I'll make it super quick — less than a minute — just so you can see if it's even relevant.`,
  ifCantTalk: `No problem. How does your schedule look later today or tomorrow?`,
  pitch: `So in simple terms, you hop on our platform, tell the AI about your business and what you're trying to promote, and then the AI learns your business, creates the advertisement, writes the copy, helps launch the Facebook and Instagram campaign, and manages the campaign while it runs.\n\nSo instead of you having to learn Facebook ads yourself, constantly post content, or pay a high-ticket fee to an agency, the platform helps handle the campaign for you.\n\nIt's month-to-month, there's no contract, you can cancel anytime, and the plans range from $100 to $250 a month. Your Facebook ad budget is separate, and you control that.`,
  preClose: `Quick question — are you currently running paid ads, or are you mostly getting customers from word of mouth?`,
  mainClose: `Based on that, if this sounds like something that could help, we can honestly get you set up pretty quickly and let you test it out. Worst case, if you don't like it, you're not locked into anything.\n\nWould it make sense to get you set up and let you try it out?`,
  meetingLinks: [
    { label: "Will's Meeting Link", url: "https://meet.google.com/gaj-ocgq-dip" },
    { label: "Emma's Meeting Link", url: "https://meet.google.com/svi-itsm-ami" },
  ],
};

const DEFAULT_OBJECTIONS = [
  {
    id: "obj1",
    category: "Timing",
    trigger: "i'm busy",
    objection: "I'm busy right now",
    response: `Totally get it — I'll make it super quick, less than 60 seconds, just so you can tell me if it's even relevant for you. Is right now okay or is there a better time in the next day or two?`,
    followUp: `What does your schedule look like tomorrow morning?`,
    close: `Great — I'll shoot you a text reminder tonight so we don't lose track of it.`,
  },
  {
    id: "obj2",
    category: "Stall",
    trigger: "send me info",
    objection: "Send me info",
    response: `Absolutely, I can do that. I just want to make sure I send you the right thing. Can I ask — are you currently running any paid ads, or are you mostly relying on word of mouth right now?`,
    followUp: `Okay, so if I sent you info on how other HVAC companies in the area are using this to get more booked calls without a big ad agency, would that be what you're looking for?`,
    close: `Let me send that over and also get a quick 15-minute call on the books so I can walk you through it live — it'll make way more sense than a PDF.`,
  },
  {
    id: "obj3",
    category: "Bad Experience",
    trigger: "tried marketing before",
    objection: "I tried marketing before and it didn't work",
    response: `Yeah, that's honestly the most common thing I hear. Most of those agencies charge $1,500–$5,000 a month upfront and don't deliver. What we built is different — it's software, not an agency. You're in control, the AI runs the ads, and it's $100–$250 a month with no contract.`,
    followUp: `What was the last thing you tried — was it Facebook ads, Google, or something else?`,
    close: `The reason this works differently is the AI is optimizing it in real time. Would it make sense to just let you test it for a month and see what happens?`,
  },
  {
    id: "obj4",
    category: "Competition",
    trigger: "already have a marketing",
    objection: "I already have a marketing guy",
    response: `That's great — and honestly this isn't meant to replace anyone. A lot of our customers use this alongside what they already have. It's basically a second tool running ads 24/7 without adding more to your marketing guy's plate.`,
    followUp: `Is your current marketing person running Facebook and Instagram ads for you specifically?`,
    close: `If this could run a parallel campaign and bring in a few extra calls a month on top of what you're already doing, would that be worth taking a look at?`,
  },
  {
    id: "obj5",
    category: "Price",
    trigger: "how much",
    objection: "How much is it?",
    response: `The plans are $100 to $250 a month depending on what you need. There's no contract, cancel anytime. Your Facebook ad budget is separate — you set that yourself, even $10 a day works to start.`,
    followUp: `Just to make sure I'm pointing you to the right plan — are you looking to just test it out or do you want something more aggressive to start getting calls quickly?`,
    close: `Most people start with the $100 plan to test it, and if they're seeing results after 30 days, they scale up. Would that make sense for you?`,
  },
  {
    id: "obj6",
    category: "Decision",
    trigger: "talk to my wife",
    objection: "I need to talk to my wife/partner/owner",
    response: `Totally makes sense — this is a business decision. I don't want to pressure you into anything. Can I ask — setting aside that for a second, does the concept itself make sense to you? Do you see how it could be useful?`,
    followUp: `What would you need to see to feel confident bringing it up with them?`,
    close: `What if we set up a quick 15-minute call and had them on too — so everyone's on the same page at once and nobody has to explain it secondhand?`,
  },
  {
    id: "obj7",
    category: "Quality",
    trigger: "cheesy",
    objection: "Will the ads look cheesy or fake?",
    response: `That's a fair question. The AI actually generates professional-quality copy and visuals. You review everything before it goes live — so nothing gets published that you don't approve. Think of it like having a creative team draft the ad, then you hit publish when it looks right.`,
    followUp: `Have you seen Facebook ads from other HVAC companies in your area? Some of them are actually really clean.`,
    close: `You can literally see a preview of your ad before spending a dollar. Want me to show you what that looks like?`,
  },
  {
    id: "obj8",
    category: "Timing",
    trigger: "not ready",
    objection: "I'm not ready right now",
    response: `I hear you — and I'm not trying to push you into anything today. Can I ask what "not ready" means for you — is it timing, budget, or just not sure if it would work for your business?`,
    followUp: `If I could show you it working for an HVAC company similar to yours in the area, would that move the needle for you?`,
    close: `What would need to be true for you to feel ready? Let's work backward from that.`,
  },
  {
    id: "obj9",
    category: "Price",
    trigger: "facebook charges separately",
    objection: "Facebook charges separately?",
    response: `Yes — and that's actually a good thing. Facebook's ad spend goes directly to Facebook, not through us. You're in full control of that budget. Even $10–$15 a day is enough to start seeing results. Our platform fee is just $100–$250/month for the software that runs everything.`,
    followUp: `What kind of monthly budget were you thinking for ads if you were to test this?`,
    close: `A lot of our customers start at $300/month total — $100 for the platform, $200 for ads. That's less than one service call for them. Would that feel reasonable to test?`,
  },
  {
    id: "obj10",
    category: "Knowledge",
    trigger: "don't know anything about",
    objection: "I don't know anything about AI or Facebook ads",
    response: `Perfect — you don't need to. That's literally the whole point of the software. You answer a few questions about your business, the AI does the work, and you just review the ad before it goes live. If you can send a text, you can use this.`,
    followUp: `Have you ever boosted a post on Facebook before, even just once?`,
    close: `We also do a live walkthrough when you sign up so you're never left figuring it out alone. Want me to get that set up?`,
  },
  {
    id: "obj11",
    category: "Referral",
    trigger: "word of mouth",
    objection: "We mostly get business from word of mouth",
    response: `That's awesome — word of mouth is the best. The question is: what happens during slow seasons, or when referrals dry up for a few weeks? Paid ads are basically just a second pipeline you turn on and off as needed.`,
    followUp: `Do you ever have slow months where you wish you had more calls coming in?`,
    close: `This doesn't replace your referral business — it just adds a safety net so you're not dependent on one source. Worth running both, right?`,
  },
];

const OUTCOME_OPTIONS = [
  "No Answer",
  "Voicemail",
  "Heard Pitch",
  "Interested",
  "Signup Link Requested",
  "Booked Walkthrough",
  "Call Back Later",
  "Not Interested",
  "Paid / Customer",
  "Needs Follow-Up",
];

const CATEGORIES = ["All", "Timing", "Stall", "Bad Experience", "Competition", "Price", "Decision", "Quality", "Knowledge", "Referral"];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadLS() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLS(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}

function mergeWithDefaults(saved) {
  return {
    script: saved?.script || DEFAULT_SCRIPT,
    objections: saved?.objections || DEFAULT_OBJECTIONS,
    callLogs: saved?.callLogs || [],
    objectionTeachCard: saved?.objectionTeachCard ?? true,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ children, style }) {
  return (
    <div style={{ background: "#1e2028", border: "1px solid #2e3040", borderRadius: 12, padding: "20px 24px", marginBottom: 18, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 700, marginBottom: 14, marginTop: 0, letterSpacing: 0.3 }}>{children}</h2>;
}

function Badge({ children, color = "#1ec885" }) {
  return (
    <span style={{ background: color + "22", color, border: `1px solid ${color}55`, borderRadius: 6, fontSize: 11, fontWeight: 700, padding: "2px 10px", letterSpacing: 0.5, textTransform: "uppercase" }}>
      {children}
    </span>
  );
}

function CopyBtn({ text, label = "Copy" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ background: copied ? "#1ec885" : "#23252f", color: copied ? "#fff" : "#aaa", border: "1px solid #3a3d50", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", transition: "all 0.2s" }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

// ─── Script Panel ─────────────────────────────────────────────────────────────

function ScriptPanel({ script, adminMode, onChange }) {
  const sections = [
    { key: "opener", label: "Opening Script" },
    { key: "ifBusy", label: "If They're Busy" },
    { key: "ifCantTalk", label: "If They Can't Talk" },
    { key: "pitch", label: "Quick Pitch" },
    { key: "preClose", label: "Pre-Close Question" },
    { key: "mainClose", label: "Main Close" },
  ];

  return (
    <div>
      {sections.map(({ key, label }) => (
        <Card key={key}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ color: "#1ec885", fontSize: 13, fontWeight: 700 }}>{label}</span>
            <CopyBtn text={script[key]} />
          </div>
          {adminMode ? (
            <textarea
              value={script[key]}
              onChange={e => onChange(key, e.target.value)}
              style={{ width: "100%", background: "#13141a", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 6, padding: 10, fontSize: 14, lineHeight: 1.6, minHeight: 100, resize: "vertical", boxSizing: "border-box" }}
            />
          ) : (
            <p style={{ color: "#e8e8f0", fontSize: 14, lineHeight: 1.7, margin: 0, whiteSpace: "pre-wrap" }}>{script[key]}</p>
          )}
        </Card>
      ))}

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ color: "#1ec885", fontSize: 13, fontWeight: 700 }}>Meeting Links</span>
        </div>
        {script.meetingLinks.map((link, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            {adminMode ? (
              <>
                <input
                  value={link.label}
                  onChange={e => {
                    const next = script.meetingLinks.map((l, j) => j === i ? { ...l, label: e.target.value } : l);
                    onChange("meetingLinks", next);
                  }}
                  style={{ background: "#13141a", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 6, padding: "6px 10px", fontSize: 13, width: 160 }}
                />
                <input
                  value={link.url}
                  onChange={e => {
                    const next = script.meetingLinks.map((l, j) => j === i ? { ...l, url: e.target.value } : l);
                    onChange("meetingLinks", next);
                  }}
                  style={{ background: "#13141a", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 6, padding: "6px 10px", fontSize: 13, flex: 1 }}
                />
              </>
            ) : (
              <>
                <span style={{ color: "#aaa", fontSize: 13, minWidth: 140 }}>{link.label}:</span>
                <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ color: "#1ec885", fontSize: 13 }}>{link.url}</a>
                <CopyBtn text={link.url} label="Copy Link" />
              </>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Live Call Listener ───────────────────────────────────────────────────────

function LiveListener({ onTranscriptUpdate }) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setSupported(false); return; }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let final = "";
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + " ";
      }
      transcriptRef.current = final;
      setTranscript(final);
      onTranscriptUpdate(final);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
  }, [onTranscriptUpdate]);

  const start = () => { recognitionRef.current?.start(); setListening(true); };
  const stop = () => { recognitionRef.current?.stop(); setListening(false); };
  const clear = () => { setTranscript(""); transcriptRef.current = ""; onTranscriptUpdate(""); };

  if (!supported) {
    return (
      <Card>
        <SectionTitle>Live Call Listener</SectionTitle>
        <p style={{ color: "#f0a04b", fontSize: 14 }}>Live transcription is not supported in this browser. Use Chrome or paste notes manually.</p>
        <textarea
          placeholder="Paste call notes here..."
          onChange={e => onTranscriptUpdate(e.target.value)}
          style={{ width: "100%", background: "#13141a", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 6, padding: 10, fontSize: 14, minHeight: 100, resize: "vertical", boxSizing: "border-box" }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle>Live Call Listener</SectionTitle>
      <p style={{ color: "#666", fontSize: 12, marginBottom: 12 }}>
        Use only in compliance with applicable call recording and monitoring laws. This tool does not save audio recordings.
      </p>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={start} disabled={listening} style={{ background: listening ? "#333" : "#1ec885", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: listening ? "not-allowed" : "pointer" }}>
          {listening ? "Listening..." : "Start Listening"}
        </button>
        <button onClick={stop} disabled={!listening} style={{ background: !listening ? "#222" : "#e05a5a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontWeight: 700, fontSize: 14, cursor: !listening ? "not-allowed" : "pointer" }}>
          Stop Listening
        </button>
        <button onClick={clear} style={{ background: "#23252f", color: "#aaa", border: "1px solid #3a3d50", borderRadius: 8, padding: "9px 20px", fontSize: 14, cursor: "pointer" }}>
          Clear Transcript
        </button>
      </div>
      {listening && <div style={{ color: "#1ec885", fontSize: 12, marginBottom: 8, animation: "pulse 1.5s infinite" }}>● Recording...</div>}
      <div style={{ background: "#13141a", border: "1px solid #2e3040", borderRadius: 8, padding: 14, minHeight: 80, color: transcript ? "#e8e8f0" : "#555", fontSize: 14, lineHeight: 1.7 }}>
        {transcript || "Transcript will appear here..."}
      </div>
    </Card>
  );
}

// ─── Suggested Response ───────────────────────────────────────────────────────

function SuggestedResponse({ transcript, objections }) {
  const [usedIds, setUsedIds] = useState([]);

  const matched = objections.find(obj =>
    !usedIds.includes(obj.id) &&
    transcript.toLowerCase().includes((obj.trigger || "").toLowerCase())
  );

  return (
    <Card style={{ border: matched ? "1px solid #1ec88555" : "1px solid #2e3040" }}>
      <SectionTitle>Suggested Response</SectionTitle>
      {!matched ? (
        <p style={{ color: "#555", fontSize: 14 }}>Listening for objections... Detected phrases will appear here.</p>
      ) : (
        <>
          <div style={{ marginBottom: 10 }}>
            <Badge color="#f0a04b">Objection Detected</Badge>
            <span style={{ color: "#f0a04b", fontWeight: 700, marginLeft: 10, fontSize: 14 }}>{matched.objection}</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#aaa", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Response</div>
            <p style={{ color: "#e8e8f0", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{matched.response}</p>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: "#aaa", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Follow-Up Question</div>
            <p style={{ color: "#e8e8f0", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{matched.followUp}</p>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ color: "#aaa", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" }}>Move Forward / Close</div>
            <p style={{ color: "#1ec885", fontSize: 14, lineHeight: 1.7, margin: 0 }}>{matched.close}</p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <CopyBtn text={`${matched.response}\n\n${matched.followUp}\n\n${matched.close}`} label="Copy Response" />
            <button
              onClick={() => setUsedIds(p => [...p, matched.id])}
              style={{ background: "#23252f", color: "#aaa", border: "1px solid #3a3d50", borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer" }}
            >
              Mark Used
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Objection Library ────────────────────────────────────────────────────────

function ObjectionLibrary({ objections, adminMode, onChange }) {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState({});

  const filtered = objections.filter(o =>
    (cat === "All" || o.category === cat) &&
    (o.objection.toLowerCase().includes(search.toLowerCase()) ||
      (o.response || "").toLowerCase().includes(search.toLowerCase()))
  );

  const startEdit = (obj) => { setEditing(obj.id); setDraft({ ...obj }); };
  const saveEdit = () => {
    onChange(objections.map(o => o.id === editing ? draft : o));
    setEditing(null);
  };
  const deleteObj = (id) => onChange(objections.filter(o => o.id !== id));
  const addNew = () => {
    const newObj = { id: `obj_${Date.now()}`, category: "Timing", trigger: "", objection: "New Objection", response: "", followUp: "", close: "" };
    onChange([...objections, newObj]);
    startEdit(newObj);
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <input
          placeholder="Search objections..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 180, background: "#1e2028", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 8, padding: "8px 14px", fontSize: 14 }}
        />
        {adminMode && (
          <button onClick={addNew} style={{ background: "#1ec885", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            + Add Objection
          </button>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ background: cat === c ? "#1ec885" : "#23252f", color: cat === c ? "#fff" : "#aaa", border: `1px solid ${cat === c ? "#1ec885" : "#3a3d50"}`, borderRadius: 20, padding: "5px 14px", fontSize: 12, cursor: "pointer", fontWeight: cat === c ? 700 : 400 }}>
            {c}
          </button>
        ))}
      </div>
      {filtered.map(obj => (
        <Card key={obj.id}>
          {editing === obj.id ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>OBJECTION</label>
                  <input value={draft.objection} onChange={e => setDraft(p => ({ ...p, objection: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>CATEGORY</label>
                  <select value={draft.category} onChange={e => setDraft(p => ({ ...p, category: e.target.value }))} style={inputStyle}>
                    {CATEGORIES.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>TRIGGER PHRASE</label>
                <input value={draft.trigger} onChange={e => setDraft(p => ({ ...p, trigger: e.target.value }))} style={inputStyle} placeholder="e.g. i'm busy" />
              </div>
              <div>
                <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>RESPONSE</label>
                <textarea value={draft.response} onChange={e => setDraft(p => ({ ...p, response: e.target.value }))} style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} />
              </div>
              <div>
                <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>FOLLOW-UP QUESTION</label>
                <input value={draft.followUp} onChange={e => setDraft(p => ({ ...p, followUp: e.target.value }))} style={inputStyle} />
              </div>
              <div>
                <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>MOVE FORWARD / CLOSE</label>
                <input value={draft.close} onChange={e => setDraft(p => ({ ...p, close: e.target.value }))} style={inputStyle} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={saveEdit} style={{ background: "#1ec885", color: "#fff", border: "none", borderRadius: 6, padding: "7px 18px", fontWeight: 700, cursor: "pointer" }}>Save</button>
                <button onClick={() => setEditing(null)} style={{ background: "#23252f", color: "#aaa", border: "1px solid #3a3d50", borderRadius: 6, padding: "7px 14px", cursor: "pointer" }}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <Badge color={catColor(obj.category)}>{obj.category}</Badge>
                  <span style={{ color: "#fff", fontWeight: 700, marginLeft: 10, fontSize: 15 }}>{obj.objection}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <CopyBtn text={`${obj.response}\n\n${obj.followUp}\n\n${obj.close}`} />
                  {adminMode && <>
                    <button onClick={() => startEdit(obj)} style={adminBtnStyle}>Edit</button>
                    <button onClick={() => deleteObj(obj.id)} style={{ ...adminBtnStyle, color: "#e05a5a", borderColor: "#e05a5a44" }}>Delete</button>
                  </>}
                </div>
              </div>
              <div style={{ color: "#e8e8f0", fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}><strong style={{ color: "#aaa" }}>Response: </strong>{obj.response}</div>
              <div style={{ color: "#e8e8f0", fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}><strong style={{ color: "#aaa" }}>Follow-up: </strong>{obj.followUp}</div>
              <div style={{ color: "#1ec885", fontSize: 13, lineHeight: 1.7 }}><strong style={{ color: "#aaa" }}>Close: </strong>{obj.close}</div>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function catColor(cat) {
  const map = { Timing: "#1ec885", Stall: "#f0a04b", "Bad Experience": "#e05a5a", Competition: "#a78bfa", Price: "#60a5fa", Decision: "#f472b6", Quality: "#34d399", Knowledge: "#fb923c", Referral: "#4ade80" };
  return map[cat] || "#888";
}

const inputStyle = { display: "block", width: "100%", background: "#13141a", color: "#e8e8f0", border: "1px solid #3a3d50", borderRadius: 6, padding: "7px 10px", fontSize: 13, boxSizing: "border-box", marginTop: 3 };
const adminBtnStyle = { background: "#23252f", color: "#aaa", border: "1px solid #3a3d50", borderRadius: 6, padding: "4px 12px", fontSize: 12, cursor: "pointer" };

// ─── Objection Teach Card ─────────────────────────────────────────────────────

function ObjectionTeachCard() {
  return (
    <Card style={{ border: "1px solid #a78bfa44", background: "#1a1a28" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 28 }}>🧠</div>
        <div>
          <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: 14, marginBottom: 8 }}>OBJECTION = UNCERTAINTY</div>
          <p style={{ color: "#e8e8f0", fontSize: 13, margin: "0 0 8px", lineHeight: 1.6 }}>Use the 4-step loop:</p>
          <ol style={{ color: "#e8e8f0", fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Acknowledge</li>
            <li>Answer / Reframe</li>
            <li>Rebuild Certainty</li>
            <li>Move Forward</li>
          </ol>
          <p style={{ color: "#f0a04b", fontSize: 12, marginTop: 10, marginBottom: 0, fontWeight: 600 }}>
            Team rule: Never answer an objection and go silent. Answer it, then ask a question or move the conversation forward.
          </p>
        </div>
      </div>
    </Card>
  );
}

// ─── Call Log ─────────────────────────────────────────────────────────────────

function CallLog({ callLogs, onSave, onClear }) {
  const [form, setForm] = useState({ company: "", contact: "", phone: "", email: "", notes: "" });

  const handleOutcome = (outcome) => {
    const entry = {
      ...form,
      outcome,
      timestamp: new Date().toISOString(),
      id: `call_${Date.now()}`,
    };
    onSave(entry);
    setForm({ company: "", contact: "", phone: "", email: "", notes: "" });
  };

  return (
    <div>
      <Card>
        <SectionTitle>Log a Call</SectionTitle>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          {[["company", "Company Name"], ["contact", "Contact Name"], ["phone", "Phone Number"], ["email", "Email"]].map(([k, label]) => (
            <div key={k}>
              <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>{label.toUpperCase()}</label>
              <input value={form[k]} onChange={e => setForm(p => ({ ...p, [k]: e.target.value }))} style={{ ...inputStyle }} placeholder={label} />
            </div>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: "#aaa", fontSize: 11, fontWeight: 700 }}>NOTES</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} placeholder="Notes..." />
        </div>
        <div style={{ marginBottom: 6 }}>
          <div style={{ color: "#aaa", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>SELECT OUTCOME</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OUTCOME_OPTIONS.map(o => (
              <button key={o} onClick={() => handleOutcome(o)} style={{ background: outcomeColor(o) + "22", color: outcomeColor(o), border: `1px solid ${outcomeColor(o)}55`, borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                {o}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SectionTitle>Recent Calls</SectionTitle>
          {callLogs.length > 0 && (
            <button onClick={onClear} style={{ background: "#23252f", color: "#e05a5a", border: "1px solid #e05a5a44", borderRadius: 6, padding: "5px 14px", fontSize: 12, cursor: "pointer" }}>
              Clear All
            </button>
          )}
        </div>
        {callLogs.length === 0 ? (
          <p style={{ color: "#555", fontSize: 14 }}>No calls logged yet.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #2e3040" }}>
                  {["Time", "Company", "Contact", "Phone", "Outcome", "Notes"].map(h => (
                    <th key={h} style={{ color: "#aaa", fontWeight: 700, padding: "6px 10px", textAlign: "left" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...callLogs].reverse().map(log => (
                  <tr key={log.id} style={{ borderBottom: "1px solid #1e2028" }}>
                    <td style={{ color: "#666", padding: "7px 10px", whiteSpace: "nowrap" }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ color: "#e8e8f0", padding: "7px 10px" }}>{log.company || "—"}</td>
                    <td style={{ color: "#e8e8f0", padding: "7px 10px" }}>{log.contact || "—"}</td>
                    <td style={{ color: "#e8e8f0", padding: "7px 10px" }}>{log.phone || "—"}</td>
                    <td style={{ padding: "7px 10px" }}>
                      <span style={{ background: outcomeColor(log.outcome) + "22", color: outcomeColor(log.outcome), border: `1px solid ${outcomeColor(log.outcome)}44`, borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
                        {log.outcome}
                      </span>
                    </td>
                    <td style={{ color: "#aaa", padding: "7px 10px", maxWidth: 200 }}>{log.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function outcomeColor(outcome) {
  const map = {
    "No Answer": "#666",
    "Voicemail": "#888",
    "Heard Pitch": "#60a5fa",
    "Interested": "#1ec885",
    "Signup Link Requested": "#34d399",
    "Booked Walkthrough": "#a78bfa",
    "Call Back Later": "#f0a04b",
    "Not Interested": "#e05a5a",
    "Paid / Customer": "#fbbf24",
    "Needs Follow-Up": "#fb923c",
  };
  return map[outcome] || "#aaa";
}

// ─── Passcode Gate ────────────────────────────────────────────────────────────

function PasscodeGate({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const attempt = () => {
    if (value.trim() === PASSCODE) {
      localStorage.setItem("sm_sales_gate", "1");
      onUnlock();
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#13141a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#1e2028", border: "1px solid #2e3040", borderRadius: 16, padding: "40px 48px", maxWidth: 380, width: "90%", textAlign: "center" }}>
        <div style={{ color: "#1ec885", fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Smartemark</div>
        <div style={{ color: "#aaa", fontSize: 13, marginBottom: 28 }}>Internal Sales Tool</div>
        <input
          type="password"
          placeholder="Enter passcode"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => e.key === "Enter" && attempt()}
          style={{ width: "100%", background: "#13141a", color: "#e8e8f0", border: `1px solid ${error ? "#e05a5a" : "#3a3d50"}`, borderRadius: 8, padding: "11px 14px", fontSize: 15, boxSizing: "border-box", marginBottom: 12 }}
        />
        {error && <div style={{ color: "#e05a5a", fontSize: 13, marginBottom: 8 }}>Incorrect passcode.</div>}
        <button onClick={attempt} style={{ width: "100%", background: "#1ec885", color: "#fff", border: "none", borderRadius: 8, padding: "11px", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
          Enter
        </button>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SalesAssistant() {
  const [unlocked, setUnlocked] = useState(() => localStorage.getItem("sm_sales_gate") === "1");
  const [activeTab, setActiveTab] = useState("script");
  const [adminMode, setAdminMode] = useState(false);
  const [data, setData] = useState(() => mergeWithDefaults(loadLS()));
  const [transcript, setTranscript] = useState("");

  const persist = useCallback((next) => {
    setData(next);
    saveLS(next);
  }, []);

  const updateScript = (key, value) => {
    persist({ ...data, script: { ...data.script, [key]: value } });
  };

  const updateObjections = (next) => {
    persist({ ...data, objections: next });
  };

  const saveCall = (entry) => {
    persist({ ...data, callLogs: [...data.callLogs, entry] });
  };

  const clearCalls = () => {
    persist({ ...data, callLogs: [] });
  };

  const resetToDefaults = () => {
    if (window.confirm("Reset all script and objection data to defaults? Call logs will be preserved.")) {
      persist({ ...data, script: DEFAULT_SCRIPT, objections: DEFAULT_OBJECTIONS });
    }
  };

  const lock = () => {
    localStorage.removeItem("sm_sales_gate");
    setUnlocked(false);
  };

  if (!unlocked) return <PasscodeGate onUnlock={() => setUnlocked(true)} />;

  const tabs = [
    { id: "script", label: "Script Mode" },
    { id: "objections", label: "Objection Mode" },
    { id: "admin", label: "Admin Mode" },
    { id: "calllog", label: "Call Log" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#13141a", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1e2028", borderBottom: "1px solid #2e3040", padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: "#1ec885", fontSize: 18, fontWeight: 800, letterSpacing: -0.5 }}>Smartemark</span>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>Sales Assistant</span>
            <Badge>Internal Tool</Badge>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button
              onClick={() => setAdminMode(p => !p)}
              style={{ background: adminMode ? "#a78bfa22" : "#23252f", color: adminMode ? "#a78bfa" : "#aaa", border: `1px solid ${adminMode ? "#a78bfa55" : "#3a3d50"}`, borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: adminMode ? 700 : 400 }}
            >
              {adminMode ? "Admin ON" : "Admin Mode"}
            </button>
            {adminMode && (
              <button onClick={resetToDefaults} style={{ background: "#23252f", color: "#f0a04b", border: "1px solid #f0a04b44", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
                Reset Defaults
              </button>
            )}
            <button onClick={lock} style={{ background: "#23252f", color: "#e05a5a", border: "1px solid #e05a5a44", borderRadius: 8, padding: "6px 14px", fontSize: 13, cursor: "pointer" }}>
              Lock
            </button>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ background: "#181920", borderBottom: "1px solid #2e3040", padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", gap: 4 }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{ background: "none", border: "none", borderBottom: activeTab === t.id ? "2px solid #1ec885" : "2px solid transparent", color: activeTab === t.id ? "#1ec885" : "#aaa", padding: "14px 18px", fontSize: 14, fontWeight: activeTab === t.id ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 60px" }}>
        {activeTab === "script" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24 }}>
            <div>
              <ScriptPanel script={data.script} adminMode={adminMode} onChange={updateScript} />
            </div>
            <div>
              <LiveListener onTranscriptUpdate={setTranscript} />
              <SuggestedResponse transcript={transcript} objections={data.objections} />
            </div>
          </div>
        )}

        {activeTab === "objections" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24 }}>
            <ObjectionLibrary objections={data.objections} adminMode={adminMode} onChange={updateObjections} />
            <div>
              <ObjectionTeachCard />
              <SuggestedResponse transcript={transcript} objections={data.objections} />
            </div>
          </div>
        )}

        {activeTab === "admin" && (
          <div>
            <Card style={{ border: "1px solid #a78bfa44" }}>
              <SectionTitle>Admin Mode</SectionTitle>
              <p style={{ color: "#aaa", fontSize: 14, marginTop: 0 }}>
                Toggle Admin Mode in the header to edit script sections, meeting links, and objections inline. All changes are saved to localStorage key <code style={{ color: "#1ec885" }}>{LS_KEY}</code>. Use "Reset Defaults" to restore original content (call logs are preserved).
              </p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => { setAdminMode(true); setActiveTab("script"); }}
                  style={{ background: "#1ec885", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  Edit Script
                </button>
                <button
                  onClick={() => { setAdminMode(true); setActiveTab("objections"); }}
                  style={{ background: "#a78bfa", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                >
                  Edit Objections
                </button>
                <button onClick={resetToDefaults} style={{ background: "#23252f", color: "#f0a04b", border: "1px solid #f0a04b44", borderRadius: 8, padding: "9px 18px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
                  Reset to Defaults
                </button>
              </div>
            </Card>
            <ObjectionTeachCard />
            <Card>
              <SectionTitle>Call Log Summary</SectionTitle>
              <p style={{ color: "#aaa", fontSize: 14, marginTop: 0 }}>
                {data.callLogs.length} call{data.callLogs.length !== 1 ? "s" : ""} logged. Switch to Call Log tab to view or clear logs.
              </p>
            </Card>
          </div>
        )}

        {activeTab === "calllog" && (
          <CallLog callLogs={data.callLogs} onSave={saveCall} onClear={clearCalls} />
        )}
      </div>
    </div>
  );
}
