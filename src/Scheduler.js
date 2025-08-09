import { useEffect, useRef, useState } from "react";

function nowISO() { return new Date().toISOString(); }
function loadJobs() {
  try { return JSON.parse(localStorage.getItem("sm_jobs") || "[]"); } catch { return []; }
}
function saveJobs(jobs) { localStorage.setItem("sm_jobs", JSON.stringify(jobs)); }

export default function Scheduler({ apiBase }) {
  const [jobs, setJobs] = useState(loadJobs());
  const [when, setWhen] = useState("");  // ISO datetime-local (without Z)
  const [payload, setPayload] = useState('{"url":"https://example.com","answers":{"industry":"gym","cta":"Join today"},"fbAdAccountId":""}');
  const timerRef = useRef(null);

  useEffect(() => {
    timerRef.current = setInterval(async () => {
      const current = new Date();
      const updated = [];
      for (const job of jobs) {
        if (!job.done && new Date(job.runAt) <= current) {
          try {
            const res = await fetch(`${apiBase}${job.path}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(job.body || {})
            });
            const json = await res.json().catch(() => ({}));
            console.log("[Scheduler] Ran job:", job.id, json);
            updated.push({ ...job, done: true, result: json, ranAt: nowISO() });
          } catch (e) {
            console.error("[Scheduler] Job failed:", job.id, e);
            updated.push({ ...job, done: true, error: String(e), ranAt: nowISO() });
          }
        } else {
          updated.push(job);
        }
      }
      if (JSON.stringify(updated) !== JSON.stringify(jobs)) {
        setJobs(updated);
        saveJobs(updated);
      }
    }, 30000); // 30s
    return () => clearInterval(timerRef.current);
  }, [jobs, apiBase]);

  function addJob() {
    if (!when) return;
    const job = {
      id: crypto.randomUUID(),
      path: "/api/generate-video-ad",
      runAt: new Date(when).toISOString(),
      body: JSON.parse(payload),
      done: false
    };
    const next = [...jobs, job];
    setJobs(next);
    saveJobs(next);
  }

  function clearDone() {
    const next = jobs.filter(j => !j.done);
    setJobs(next);
    saveJobs(next);
  }

  return (
    <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 8 }}>
      <h3>Scheduler (tab must stay open)</h3>
      <div style={{ display: "grid", gap: 8 }}>
        <label>
          Run At:
          <input
            type="datetime-local"
            value={when}
            onChange={e => setWhen(e.target.value)}
          />
        </label>
        <label>
          Request Body (JSON):
          <textarea rows={8} value={payload} onChange={e => setPayload(e.target.value)} />
        </label>
        <button onClick={addJob}>Schedule Job</button>
        <button onClick={clearDone}>Clear Done</button>
      </div>
      <hr />
      <ul>
        {jobs.map(j => (
          <li key={j.id} style={{ marginBottom: 8 }}>
            <code>{j.path}</code> @ {j.runAt} — {j.done ? "DONE" : "PENDING"}
          </li>
        ))}
      </ul>
    </div>
  );
}
