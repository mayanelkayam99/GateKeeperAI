import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHistory, fetchScanById, submitScan } from "./src/api/client";
import { scanPackage } from "./src/api/scan";

// ── Claude-inspired light palette ──────────────────────────────────────────
const C = {
  bg: "#f5f4ef",
  surface: "#ffffff",
  surface2: "#f0efe9",
  border: "#e8e6df",
  border2: "#d4d1c7",
  text: "#1a1915",
  textMuted: "#6b6860",
  textDim: "#9d9a91",
  orange: "#d97706",
  blue: "#2563eb",
  blueDark: "#1d4ed8",
  red: "#dc2626",
  redDim: "#fef2f2",
  redBorder: "#fecaca",
  amber: "#b45309",
  amberBg: "#fffbeb",
  amberBorder: "#fde68a",
  green: "#16a34a",
  greenDim: "#f0fdf4",
  greenBorder: "#bbf7d0",
  over: "#92400e",
  overBg: "#fef3c7",
  overBorder: "#fcd34d",
  indigo: "#4f46e5",
  indigoDim: "#eef2ff",
  indigoBorder: "#c7d2fe",
  mono: "'IBM Plex Mono', monospace",
  sans: "'IBM Plex Sans', sans-serif",
};

function getErrorMessage(err) {
  if (err?.response?.data?.detail) {
    const d = err.response.data.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
    return JSON.stringify(d);
  }
  return err?.message || "Unexpected error";
}

function getStatusColors(status) {
  const s = String(status || "").toUpperCase();
  if (s === "BLOCKED") return { color: C.red, bg: C.redDim, border: C.redBorder, label: "BLOCKED", icon: "🚫" };
  if (s === "WARNING") return { color: C.amber, bg: C.amberBg, border: C.amberBorder, label: "WARNING", icon: "⚠️" };
  if (s === "OVERRIDDEN") return { color: C.over, bg: C.overBg, border: C.overBorder, label: "OVERRIDDEN", icon: "⚡" };
  return { color: C.green, bg: C.greenDim, border: C.greenBorder, label: "APPROVED", icon: "✅" };
}

// ── Inline Policy Panel ─────────────────────────────────────────────────────
function PolicyPanel({ onClose }) {
  const [context, setContext] = useState("");
  const [allowedLicenses, setAllowedLicenses] = useState([]);
  const [blockedLicenses, setBlockedLicenses] = useState([]);
  const [newAllowed, setNewAllowed] = useState("");
  const [newBlocked, setNewBlocked] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/policy")
      .then((r) => r.json())
      .then((d) => {
        setContext(d.context || "");
        setAllowedLicenses(d.allowed_licenses || []);
        setBlockedLicenses(d.blocked_licenses || []);
      })
      .catch(console.error);
  }, []);

  const addLicense = (type) => {
    if (type === "allowed" && newAllowed.trim()) {
      setAllowedLicenses((p) => [...p, newAllowed.trim().toUpperCase()]);
      setNewAllowed("");
    } else if (type === "blocked" && newBlocked.trim()) {
      setBlockedLicenses((p) => [...p, newBlocked.trim().toUpperCase()]);
      setNewBlocked("");
    }
  };

  const removeLicense = (type, idx) => {
    if (type === "allowed") setAllowedLicenses((p) => p.filter((_, i) => i !== idx));
    else setBlockedLicenses((p) => p.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    try {
      const r = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context, allowed_licenses: allowedLicenses, blocked_licenses: blockedLicenses }),
      });
      if (r.ok) {
        setMessage("✓ Policy saved!");
        setTimeout(() => onClose(), 1200);
      } else {
        setMessage("✗ Error saving policy.");
      }
    } catch {
      setMessage("✗ Connection error.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      {/* Panel header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: C.indigoDim }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>🛡️</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.indigo }}>CISO AI Governance Policy</div>
            <div style={{ fontSize: 11, color: C.textDim }}>Configure guardrails for dependency scanning</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 18, color: C.textDim, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>

      <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

        {/* Business context */}
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Company Business & Regulatory Context
          </label>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={5}
            placeholder="Describe your architecture, compliance requirements, industry regulations..."
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: C.mono, outline: "none", resize: "vertical", background: C.bg, color: C.text, lineHeight: 1.6, boxSizing: "border-box" }}
          />
        </div>

        {/* License grids */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Allowed */}
          <div style={{ background: C.greenDim, border: `1px solid ${C.greenBorder}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.green, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>✓ Allowed Licenses (SPDX)</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input value={newAllowed} onChange={(e) => setNewAllowed(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLicense("allowed")}
                placeholder="E.g. MIT"
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.greenBorder}`, fontSize: 12, fontFamily: C.mono, outline: "none", background: C.surface, textTransform: "uppercase" }} />
              <button onClick={() => addLicense("allowed")} style={{ padding: "6px 12px", borderRadius: 6, background: C.green, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {allowedLicenses.map((lic, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.surface, border: `1px solid ${C.greenBorder}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: C.green, fontFamily: C.mono }}>
                  {lic}
                  <button onClick={() => removeLicense("allowed", i)} style={{ background: "none", border: "none", color: C.green, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Blocked */}
          <div style={{ background: C.redDim, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>✗ Blocked Licenses (SPDX)</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <input value={newBlocked} onChange={(e) => setNewBlocked(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addLicense("blocked")}
                placeholder="E.g. GPL-3.0"
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.redBorder}`, fontSize: 12, fontFamily: C.mono, outline: "none", background: C.surface, textTransform: "uppercase" }} />
              <button onClick={() => addLicense("blocked")} style={{ padding: "6px 12px", borderRadius: 6, background: C.red, color: "#fff", border: "none", fontWeight: 700, cursor: "pointer" }}>+</button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {blockedLicenses.map((lic, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: C.surface, border: `1px solid ${C.redBorder}`, borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: C.red, fontFamily: C.mono }}>
                  {lic}
                  <button onClick={() => removeLicense("blocked", i)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
          <span style={{ fontSize: 12, color: message.startsWith("✓") ? C.green : C.red, fontWeight: 600 }}>{message}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.border2}`, background: "transparent", fontSize: 13, fontWeight: 600, color: C.textMuted, cursor: "pointer" }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, background: saving ? C.textDim : C.indigo, color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}>
              {saving ? "Saving…" : "🛡️ Apply Policy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Override Modal ──────────────────────────────────────────────────────────
function OverrideModal({ scan, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState("");
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);
  const canSubmit = reason.trim().length >= 10 && !loading;
  const pkg = scan?.package;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: C.surface, borderRadius: 16, width: "100%", maxWidth: 480, border: `1.5px solid ${C.amberBorder}`, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", overflow: "hidden" }}>
        <div style={{ background: C.amberBg, borderBottom: `1px solid ${C.amberBorder}`, padding: "18px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>⚡</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.amber }}>Accept Risk & Force Push</div>
              <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
                Override block on <code style={{ fontFamily: C.mono, background: C.surface2, padding: "1px 5px", borderRadius: 4 }}>{pkg?.name}@{pkg?.version}</code>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div style={{ background: C.redDim, border: `1px solid ${C.redBorder}`, borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 4 }}>⚠️ Security Warning</div>
            <div style={{ fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>You are bypassing an AI-enforced security block. This action is logged and auditable.</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Reason <span style={{ color: C.red }}>*</span>
            </label>
            <textarea ref={inputRef} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Vulnerability is in a dev-only path, confirmed with security team..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, fontSize: 13, fontFamily: C.sans, border: `1.5px solid ${reason.trim().length >= 10 ? C.amberBorder : C.border}`, outline: "none", resize: "vertical", background: C.bg, color: C.text, lineHeight: 1.6, boxSizing: "border-box" }} />
            <div style={{ fontSize: 11, color: reason.trim().length >= 10 ? C.green : C.textDim, marginTop: 5 }}>
              {reason.trim().length >= 10 ? "✓ Reason accepted" : `${Math.max(0, 10 - reason.trim().length)} more characters required`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button onClick={onCancel} disabled={loading} style={{ padding: "9px 20px", borderRadius: 8, border: `1.5px solid ${C.border2}`, background: "transparent", fontSize: 13, fontWeight: 600, color: C.textMuted, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => onConfirm(reason.trim())} disabled={!canSubmit}
              style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: canSubmit ? C.amber : C.textDim, fontSize: 13, fontWeight: 700, color: "#fff", cursor: canSubmit ? "pointer" : "not-allowed" }}>
              {loading ? "Overriding…" : "⚡ Confirm Override"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [packageName, setPackageName] = useState("lodash");
  const [version, setVersion] = useState("4.17.20");
  const [ecosystem, setEcosystem] = useState("npm");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [latestResult, setLatestResult] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [focusedResult, setFocusedResult] = useState(null);
  const [focusedLoading, setFocusedLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("cve");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const [showPolicy, setShowPolicy] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await fetchHistory();
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  // קריאת scanId מה-URL בטעינה
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlScanId = params.get("scanId");
    if (!urlScanId) return;
    const parsed = parseInt(urlScanId, 10);
    if (!isNaN(parsed)) {
      handleSelectScan(parsed);
    }
  }, []);
  useEffect(() => { scanPackage("lodash").catch(() => { }); }, []);

  const handleScan = async () => {
    setScanLoading(true);
    setScanError(null);
    setChatMessages([]);
    setShowPolicy(false);
    try {
      const result = await submitScan({ name: packageName.trim(), version: version.trim(), ecosystem });
      setLatestResult(result);
      setFocusedResult(null);
      setActiveTab("cve");
      await loadHistory();
    } catch (err) { setScanError(getErrorMessage(err)); }
    finally { setScanLoading(false); }
  };

  const handleSelectScan = async (scanId) => {
    setFocusedLoading(true);
    setChatMessages([]);
    setOverrideError(null);
    setShowPolicy(false);
    try {
      const data = await fetchScanById(scanId);
      setFocusedResult(data);
      setActiveTab("cve");
    } catch (e) { console.error(e); }
    finally { setFocusedLoading(false); }
  };

  const handleOverrideConfirm = async (reason) => {
    if (!result) return;
    setOverrideLoading(true);
    setOverrideError(null);
    try {
      const res = await fetch("/api/override/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: result.id, reason, developer: "dashboard-user" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Override failed");
      }
      const data = await res.json();
      const updated = { ...result, status: data.new_status };
      if (focusedResult) setFocusedResult(updated);
      else setLatestResult(updated);
      await loadHistory();
      setShowOverrideModal(false);
    } catch (err) {
      setOverrideError(err.message);
    } finally {
      setOverrideLoading(false);
    }
  };

  const result = focusedResult || latestResult;
  const pkg = result?.package;
  const status = String(result?.status || "").toUpperCase();
  const isBlocked = status === "BLOCKED";
  const isWarning = status === "WARNING";
  const isOverridden = status === "OVERRIDDEN";
  const canOverride = (isBlocked || isWarning) && result?.source === "pre-push";
  const sc = getStatusColors(status);

  const blockedCount = history.filter(h => String(h.status || "").toUpperCase() === "BLOCKED").length;
  const approvedCount = history.filter(h => !["BLOCKED", "WARNING"].includes(String(h.status || "").toUpperCase())).length;

  async function sendChat(text) {
    const msg = text || chatInput.trim();
    if (!msg || chatStreaming || !result) return;
    const prior = chatMessages;
    setChatMessages((p) => [...p, { role: "user", content: msg }]);
    setChatInput("");
    setChatStreaming(true);
    setChatMessages((p) => [...p, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scan_id: result.id, message: msg, history: prior }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const p = line.slice(6);
          if (p === "[DONE]") break;
          try { acc += JSON.parse(p).token; } catch (_) { }
          setChatMessages((prev) => {
            const u = [...prev];
            u[u.length - 1] = { role: "assistant", content: acc };
            return u;
          });
        }
      }
    } catch {
      setChatMessages((p) => {
        const u = [...p]; u[u.length - 1] = { role: "assistant", content: "⚠️ Error." }; return u;
      });
    } finally { setChatStreaming(false); }
  }

  return (
    <div style={{ fontFamily: C.sans, minHeight: "100vh", background: C.bg, color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {showOverrideModal && (
        <OverrideModal
          scan={result}
          onConfirm={handleOverrideConfirm}
          onCancel={() => { setShowOverrideModal(false); setOverrideError(null); }}
          loading={overrideLoading}
        />
      )}

      {/* ── HEADER ── */}
      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#d97706,#f59e0b)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>AI Security Gatekeeper</div>
            <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>OSV + Groq Llama 3 · CI/CD Shield</div>
          </div>
        </div>

        {result && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", borderRadius: 999, fontWeight: 600, fontSize: 12, letterSpacing: "0.04em", background: sc.bg, color: sc.color, border: `1.5px solid ${sc.border}` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: sc.color, display: "inline-block" }} />
            STATUS: {sc.label}
          </div>
        )}

        <div style={{ fontSize: 12, color: C.textDim, fontFamily: C.mono }}>{history.length} scans logged</div>
      </header>

      <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>

        {/* ── SIDEBAR ── */}
        <aside style={{ width: 350, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
          <div style={{ padding: "18px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.textDim, textTransform: "uppercase", marginBottom: 4 }}>Audit History</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{history.length}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: C.redDim, color: C.red, fontWeight: 600 }}>{blockedCount} blocked</span>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, background: C.greenDim, color: C.green, fontWeight: 600 }}>{approvedCount} ok</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {historyLoading ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: C.textDim }}>Loading…</div>
            ) : history.map((h) => {
              const hSc = getStatusColors(h.status);
              const isSelected = result?.id === h.id;
              return (
                <button key={h.id} onClick={() => handleSelectScan(h.id)} style={{
                  width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 10, marginBottom: 2,
                  background: isSelected ? hSc.bg : "transparent",
                  border: isSelected ? `1.5px solid ${hSc.border}` : "1.5px solid transparent",
                  cursor: "pointer", transition: "all 0.12s",
                }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = C.surface2; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isSelected ? C.text : C.textMuted, fontFamily: C.mono }}>#{h.id}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: hSc.color, background: hSc.bg, padding: "2px 7px", borderRadius: 999, border: `1px solid ${hSc.border}` }}>
                      {hSc.icon} {hSc.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim, marginTop: 3, fontFamily: C.mono }}>{h.package?.name || "—"}@{h.package?.version || "*"}</div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: C.bg }}>

          {/* KPI CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Total Scanned", value: history.length, color: C.blue, icon: "📦" },
              { label: "Blocked", value: blockedCount, color: C.red, icon: "🚫" },
              { label: "Approved", value: approvedCount, color: C.green, icon: "✅" },
              { label: "Max CVSS", value: result?.cvss_max_score != null ? result.cvss_max_score.toFixed(1) : "—", color: C.amber, icon: "⚠️" },
            ].map((k) => (
              <div key={k.label} style={{ background: C.surface, borderRadius: 12, padding: "16px 18px", border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                <div style={{ fontSize: 18 }}>{k.icon}</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: k.color, marginTop: 6, fontFamily: C.mono }}>{k.value}</div>
                <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em" }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* ── SCAN FORM or POLICY PANEL ── */}
          {showPolicy ? (
            <div style={{ marginBottom: 20 }}>
              <PolicyPanel onClose={() => setShowPolicy(false)} />
            </div>
          ) : (
            <div style={{ background: C.surface, borderRadius: 12, padding: "18px 22px", border: `1px solid ${C.border}`, marginBottom: 20, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>🔍</span> Scan Package
                </div>
                {/* CISO Policy button — lives here, inside scan card */}
                <button onClick={() => setShowPolicy(true)} style={{
                  padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  background: C.indigoDim, color: C.indigo, border: `1.5px solid ${C.indigoBorder}`,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}>
                  🛡️ CISO AI Governance
                </button>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                {[
                  { label: "Package Name", value: packageName, set: setPackageName, placeholder: "lodash" },
                  { label: "Version", value: version, set: setVersion, placeholder: "4.17.20" },
                ].map((f) => (
                  <div key={f.label} style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>{f.label}</div>
                    <input value={f.value} onChange={(e) => f.set(e.target.value)} placeholder={f.placeholder}
                      style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: C.mono, outline: "none", background: C.bg, color: C.text, boxSizing: "border-box" }} />
                  </div>
                ))}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textDim, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ecosystem</div>
                  <select value={ecosystem} onChange={(e) => setEcosystem(e.target.value)}
                    style={{ width: "100%", padding: "8px 11px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: C.sans, outline: "none", background: C.bg, color: C.text }}>
                    <option>npm</option><option>PyPI</option><option>Maven</option><option>Go</option>
                  </select>
                </div>
                <button onClick={handleScan} disabled={scanLoading} style={{
                  padding: "8px 22px", borderRadius: 8, background: scanLoading ? C.textDim : C.orange,
                  color: "#fff", fontWeight: 600, fontSize: 13, border: "none", cursor: scanLoading ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: 7, whiteSpace: "nowrap",
                }}>
                  {scanLoading ? "Scanning…" : "⚡ Scan Package"}
                </button>
              </div>
              {scanError && <div style={{ marginTop: 10, fontSize: 13, color: C.red, background: C.redDim, padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}` }}>{scanError}</div>}
            </div>
          )}

          {/* RESULT PANEL */}
          {focusedLoading ? (
            <div style={{ background: C.surface, borderRadius: 12, padding: 48, textAlign: "center", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 13, color: C.textDim }}>Loading scan data…</div>
            </div>
          ) : result ? (
            <div style={{ background: C.surface, borderRadius: 14, border: `1.5px solid ${sc.border}`, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>

              {/* Result header */}
              <div style={{ padding: "20px 24px", background: sc.bg, borderBottom: `1px solid ${sc.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textDim }}>High-Level Summary</div>
                    <div style={{ fontSize: 24, fontWeight: 700, fontFamily: C.mono, color: C.text, marginTop: 4 }}>
                      {pkg?.name ?? "Unknown"}<span style={{ color: C.textDim }}>@{pkg?.version ?? "—"}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 3 }}>Ecosystem: <strong style={{ color: C.text }}>{pkg?.ecosystem ?? "—"}</strong></div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 16px", borderRadius: 999, fontWeight: 700, fontSize: 13, background: sc.color, color: "#fff" }}>
                      {sc.icon} {sc.label}
                    </div>
                    {canOverride && (
                      <button onClick={() => { setOverrideError(null); setShowOverrideModal(true); }}
                        style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "transparent", color: C.amber, border: `1.5px solid ${C.amberBorder}`, cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = C.amberBg}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        ⚡ Accept Risk & Force Push
                      </button>
                    )}
                    {isOverridden && (
                      <div style={{ fontSize: 11, color: C.over, background: C.overBg, border: `1px solid ${C.overBorder}`, borderRadius: 6, padding: "4px 10px" }}>
                        ⚡ Risk accepted — push is now allowed
                      </div>
                    )}
                    {result.cvss_max_score != null && (
                      <div style={{ fontSize: 12, color: C.textMuted, fontFamily: C.mono }}>
                        CVSS <strong style={{ color: result.cvss_max_score >= 7 ? C.red : C.amber }}>{result.cvss_max_score.toFixed(1)}</strong>
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: C.textMuted }}>
                  <strong style={{ color: C.text }}>Quick Verdict:</strong>{" "}
                  {isBlocked ? (result.ai_explanation?.toLowerCase().includes("rce") ? "Blocked — critical RCE risk detected." : "Blocked — security policy violated.")
                    : isOverridden ? "Override accepted — developer acknowledged risk."
                      : isWarning ? "Warning — requires manual review."
                        : "Approved — no blocking violations found."}
                </div>
                {overrideError && (
                  <div style={{ marginTop: 10, fontSize: 12, color: C.red, background: C.redDim, padding: "8px 12px", borderRadius: 6, border: `1px solid ${C.redBorder}` }}>⚠️ {overrideError}</div>
                )}
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 24px", background: C.surface }}>
                {[
                  { id: "cve", label: "CVE Summary", icon: "🛡️" },
                  { id: "license", label: "License Matrix", icon: "⚖️" },
                  { id: "fix", label: "Remediation", icon: "🔧" },
                  { id: "ai", label: "AI Deep-Dive", icon: "🤖" },
                  { id: "chat", label: "Co-Pilot Chat", icon: "💬" },
                ].map((t) => (
                  <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                    padding: "13px 16px", border: "none", background: "transparent", cursor: "pointer",
                    fontSize: 13, fontWeight: 600,
                    color: activeTab === t.id ? C.orange : C.textMuted,
                    borderBottom: activeTab === t.id ? `2.5px solid ${C.orange}` : "2.5px solid transparent",
                    marginBottom: -1, transition: "all 0.12s", display: "flex", alignItems: "center", gap: 6,
                  }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ padding: "22px 24px" }}>
                {activeTab === "cve" && (
                  <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 13, lineHeight: 1.8, background: C.surface2, padding: "18px", borderRadius: 10, border: `1px solid ${C.border}`, whiteSpace: "pre-wrap", color: C.text }}>
                    {result.cve_summary || "No CVE data available."}
                  </pre>
                )}
                {activeTab === "license" && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                        {["Package", "Status", "License"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.07em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "12px 14px", fontFamily: C.mono, fontWeight: 500 }}>{pkg?.name}@{pkg?.version}</td>
                        <td style={{ padding: "12px 14px" }}>
                          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700, background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{status}</span>
                        </td>
                        <td style={{ padding: "12px 14px", fontFamily: C.mono, color: C.textMuted }}>{result.license_type || "Unknown"}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                {activeTab === "fix" && (
                  <div style={{ background: C.greenDim, border: `1.5px solid ${C.greenBorder}`, borderRadius: 12, padding: "18px 22px" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.green, marginBottom: 10 }}>🔧 Recommended Fix</div>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: C.text, whiteSpace: "pre-wrap" }}>
                      {result.recommendation || "Run `npm audit fix` to apply patches."}
                    </div>
                  </div>
                )}
                {activeTab === "ai" && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 26, height: 26, borderRadius: 8, background: "#ede9fe", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em" }}>AppSec Agent Analysis</span>
                    </div>
                    <pre style={{ margin: 0, fontFamily: C.sans, fontSize: 14, lineHeight: 1.9, background: C.surface2, padding: "18px", borderRadius: 10, border: `1px solid ${C.border}`, whiteSpace: "pre-wrap", color: C.text }}>
                      {result.ai_explanation || "No explanation provided."}
                    </pre>
                    <div style={{ marginTop: 18, background: "#0d1117", borderRadius: 10, padding: "16px 20px", fontFamily: C.mono, fontSize: 12, lineHeight: 2, border: "1px solid #30363d" }}>
                      <div style={{ color: "#a371f7", marginBottom: 4, fontWeight: 600 }}>▶ AGENT THOUGHT PROCESS</div>
                      {[
                        `[INIT]    Scanning ${pkg?.name}@${pkg?.version} via OSV database…`,
                        `[OSV]     Querying CVE records for ${pkg?.ecosystem} ecosystem…`,
                        result.cvss_max_score >= 7 ? `[ALERT]   CVSS ${result.cvss_max_score?.toFixed(1)} exceeds threshold 7.0 → escalating to BLOCK` : `[CHECK]   CVSS score within acceptable range`,
                        `[LEGAL]   Running SPDX license compliance check (${result.license_type || "Unknown"})…`,
                        `[AI]      Groq Llama 3.3-70B generating risk explanation…`,
                        isOverridden ? `[OVERRIDE] Developer accepted risk — status set to OVERRIDDEN` : `[VERDICT] Final status: ${status} — push ${isBlocked ? "rejected" : "allowed"}`,
                      ].map((line, i) => (
                        <div key={i} style={{ color: line.includes("ALERT") || line.includes("reject") ? "#f85149" : line.includes("VERDICT") || line.includes("OVERRIDE") ? "#3fb950" : "#8b949e" }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {activeTab === "chat" && (
                  <div style={{ display: "flex", flexDirection: "column", height: 420 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "10px 14px", background: sc.bg, borderRadius: 10, border: `1px solid ${sc.border}` }}>
                      <span style={{ fontSize: 18 }}>🤖</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Remediation Co-Pilot</div>
                        <div style={{ fontSize: 11, color: C.textMuted }}>Context-aware for <code style={{ fontFamily: C.mono, background: C.surface2, padding: "1px 5px", borderRadius: 4, color: sc.color }}>{pkg?.name}@{pkg?.version}</code></div>
                      </div>
                      {chatStreaming && <span style={{ marginLeft: "auto", fontSize: 11, color: C.textDim }}>● Thinking…</span>}
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
                      {chatMessages.length === 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 12, color: C.textDim, textAlign: "center", padding: "8px 0" }}>Ask anything about this vulnerability or migration path.</div>
                          {["What exactly is this vulnerability?", "Give me the exact commands to switch to the safe alternative.", "Show me a before/after code diff.", "What breaking changes should I watch out for?"].map((p) => (
                            <button key={p} onClick={() => sendChat(p)} style={{ textAlign: "left", fontSize: 12, color: C.textMuted, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", cursor: "pointer" }}>{p}</button>
                          ))}
                        </div>
                      )}
                      {chatMessages.map((m, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                          <div style={{ maxWidth: "85%", borderRadius: 12, padding: "10px 14px", fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", background: m.role === "user" ? C.orange : C.surface2, color: m.role === "user" ? "#fff" : C.text, border: m.role === "assistant" ? `1px solid ${C.border}` : "none" }}>
                            {m.content || (chatStreaming && i === chatMessages.length - 1 ? "▌" : "")}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <input value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                        placeholder="Ask about this vulnerability or migration…"
                        disabled={chatStreaming}
                        style={{ flex: 1, padding: "9px 13px", borderRadius: 8, border: `1.5px solid ${C.border2}`, fontSize: 13, fontFamily: C.sans, outline: "none", background: C.bg, color: C.text }} />
                      <button onClick={() => sendChat()} disabled={chatStreaming || !chatInput.trim()} style={{ padding: "9px 18px", borderRadius: 8, background: C.orange, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", opacity: chatStreaming || !chatInput.trim() ? 0.5 : 1 }}>Send</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ background: C.surface, borderRadius: 12, padding: 48, textAlign: "center", border: `1px solid ${C.border}`, color: C.textDim, fontSize: 14 }}>
              Select a commit from the sidebar or scan a package to begin.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}