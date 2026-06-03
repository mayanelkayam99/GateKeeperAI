import { useEffect, useState, useCallback } from "react";
import { fetchScanById, fetchHistory as fetchHistoryApi } from "../api/client";

const C = {
    bg: "#f5f4ef", surface: "#ffffff", surface2: "#f0efe9", border: "#e8e6df", border2: "#d4d1c7",
    text: "#1a1915", textMuted: "#6b6860", textDim: "#9d9a91", orange: "#d97706",
    red: "#dc2626", redDim: "#fef2f2", redBorder: "#fecaca",
    amber: "#b45309", amberBg: "#fffbeb", amberBorder: "#fde68a",
    green: "#16a34a", greenDim: "#f0fdf4", greenBorder: "#bbf7d0",
    over: "#92400e", overBg: "#fef3c7", overBorder: "#fcd34d",
    indigo: "#4f46e5", indigoDim: "#eef2ff", indigoBorder: "#c7d2fe",
    mono: "'IBM Plex Mono', monospace", sans: "'IBM Plex Sans', sans-serif",
};

function getStatusColors(status) {
    const s = String(status || "").toUpperCase();
    if (s === "BLOCKED") return { color: C.red, bg: C.redDim, border: C.redBorder, label: "BLOCKED", icon: "🚫" };
    if (s === "WARNING") return { color: C.amber, bg: C.amberBg, border: C.amberBorder, label: "WARNING", icon: "⚠️" };
    if (s === "OVERRIDDEN") return { color: C.over, bg: C.overBg, border: C.overBorder, label: "OVERRIDDEN", icon: "⚡" };
    return { color: C.green, bg: C.greenDim, border: C.greenBorder, label: "APPROVED", icon: "✅" };
}

export default function CisoDashboard() {
    const [history, setHistory] = useState([]);
    const [selectedScan, setSelectedScan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchHistory = useCallback(async () => {
        try {
            const data = await fetchHistoryApi();
            const arr = Array.isArray(data) ? data : [];
            setHistory(arr.filter(h => h.source === "pre-push"));
            setLastUpdated(new Date().toLocaleTimeString());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { fetchHistory(); }, [fetchHistory]);
    useEffect(() => {
        const id = setInterval(fetchHistory, 3000);
        return () => clearInterval(id);
    }, [fetchHistory]);

    const handleSelect = async (scanId) => {
        try { setSelectedScan(await fetchScanById(scanId)); }
        catch (e) { console.error(e); }
    };

    const sc = selectedScan ? getStatusColors(selectedScan.status) : null;
    const pkg = selectedScan?.package;
    const blockedCount = history.filter(h => String(h.status || "").toUpperCase() === "BLOCKED").length;
    const overriddenCount = history.filter(h => String(h.status || "").toUpperCase() === "OVERRIDDEN").length;

    return (
        <div style={{ fontFamily: C.sans, minHeight: "100vh", background: C.bg, color: C.text }}>
            <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

            {/* HEADER */}
            <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 2rem", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                    </div>
                    <div>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>AI Security Gatekeeper</div>
                        <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>CISO Security Operations View</div>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textMuted }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green, display: "inline-block", animation: "pulse 2s infinite" }} />
                    Live · Updated {lastUpdated || "…"}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, background: C.redDim, color: C.red, fontWeight: 700 }}>🚫 {blockedCount} Blocked</span>
                    <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, background: C.overBg, color: C.over, fontWeight: 700 }}>⚡ {overriddenCount} Overridden</span>
                    <span style={{ fontSize: 12, padding: "4px 12px", borderRadius: 999, background: C.greenDim, color: C.green, fontWeight: 700 }}>📊 {history.length} Push Scans</span>
                </div>
            </header>

            <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>

                {/* SIDEBAR */}
                <aside style={{ width: 320, background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
                    <div style={{ padding: "16px 20px 10px", borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: C.textDim, textTransform: "uppercase" }}>Git Push Audit Log</div>
                        <div style={{ fontSize: 11, color: C.textDim, marginTop: 4 }}>Only git push events · auto-refreshing</div>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
                        {loading ? (
                            <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: C.textDim }}>Loading…</div>
                        ) : history.length === 0 ? (
                            <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: C.textDim }}>No git push scans yet.<br />Waiting for developers…</div>
                        ) : history.map(h => {
                            const hSc = getStatusColors(h.status);
                            const isSel = selectedScan?.id === h.id;
                            return (
                                <button key={h.id} onClick={() => handleSelect(h.id)} style={{
                                    width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 10, marginBottom: 2,
                                    background: isSel ? hSc.bg : "transparent",
                                    border: isSel ? `1.5px solid ${hSc.border}` : "1.5px solid transparent",
                                    cursor: "pointer", transition: "all 0.12s",
                                }}
                                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.surface2; }}
                                    onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? C.text : C.textMuted, fontFamily: C.mono }}>Push #{h.id}</span>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: hSc.color, background: hSc.bg, padding: "2px 7px", borderRadius: 999, border: `1px solid ${hSc.border}` }}>{hSc.icon} {hSc.label}</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: C.indigo, fontWeight: 600, marginBottom: 2 }}>👤 {h.developer_name || "unknown"}</div>
                                    <div style={{ fontSize: 11, color: C.textDim, fontFamily: C.mono }}>{h.package?.name}@{h.package?.version}</div>
                                    <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{new Date(h.scanned_at).toLocaleString()}</div>
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* MAIN */}
                <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: C.bg }}>
                    {!selectedScan ? (
                        <div style={{ background: C.surface, borderRadius: 12, padding: 64, textAlign: "center", border: `1px solid ${C.border}`, color: C.textDim }}>
                            <div style={{ fontSize: 32, marginBottom: 12 }}>🛡️</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 8 }}>CISO Security Operations</div>
                            <div style={{ fontSize: 13 }}>Select a git push event to review its full security audit.</div>
                        </div>
                    ) : (
                        <div style={{ background: C.surface, borderRadius: 14, border: `1.5px solid ${sc.border}`, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.07)" }}>

                            {/* Result header */}
                            <div style={{ padding: "20px 24px", background: sc.bg, borderBottom: `1px solid ${sc.border}` }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textDim }}>Git Push Security Audit</div>
                                        <div style={{ fontSize: 24, fontWeight: 700, fontFamily: C.mono, color: C.text, marginTop: 4 }}>
                                            {pkg?.name}<span style={{ color: C.textDim }}>@{pkg?.version}</span>
                                        </div>
                                        {/* Developer attribution */}
                                        <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6, background: C.indigoDim, border: `1px solid ${C.indigoBorder}`, borderRadius: 999, padding: "4px 14px" }}>
                                            <span>👤</span>
                                            <span style={{ fontSize: 13, fontWeight: 700, color: C.indigo }}>Pushed by: {selectedScan.developer_name || "unknown"}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>{new Date(selectedScan.scanned_at).toLocaleString()} · Push #{selectedScan.id}</div>
                                    </div>
                                    <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 18px", borderRadius: 999, fontWeight: 700, fontSize: 14, background: sc.color, color: "#fff" }}>
                                        {sc.icon} {sc.label}
                                    </div>
                                </div>
                            </div>

                            <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 20 }}>

                                {/* CVE */}
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>🛡️ CVE Summary</div>
                                    <pre style={{ margin: 0, fontFamily: C.mono, fontSize: 13, lineHeight: 1.8, background: C.surface2, padding: "16px", borderRadius: 10, border: `1px solid ${C.border}`, whiteSpace: "pre-wrap", color: C.text }}>
                                        {selectedScan.cve_summary || "No CVE data."}
                                    </pre>
                                </div>

                                {/* AI Analysis */}
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>🤖 AI Security Analysis</div>
                                    <pre style={{ margin: 0, fontFamily: C.sans, fontSize: 13, lineHeight: 1.9, background: C.surface2, padding: "16px", borderRadius: 10, border: `1px solid ${C.border}`, whiteSpace: "pre-wrap", color: C.text }}>
                                        {selectedScan.ai_explanation || "No analysis."}
                                    </pre>
                                </div>

                                {/* Override Audit Trail */}
                                {String(selectedScan.status || "").toUpperCase() === "OVERRIDDEN" && (() => {
                                    const m = (selectedScan.ai_explanation || "").match(/─── RISK ACCEPTANCE OVERRIDE ───\nStatus changed: .+? → OVERRIDDEN\nTimestamp:\s+(.+?)\nDeveloper:\s+(.+?)\nReason:\s+(.+?)\n─/s);
                                    if (!m) return null;
                                    const [, timestamp, developer, reason] = m;
                                    return (
                                        <div style={{ border: `1.5px solid ${C.overBorder}`, borderRadius: 12, overflow: "hidden" }}>
                                            <div style={{ background: C.overBg, padding: "12px 18px", borderBottom: `1px solid ${C.overBorder}`, display: "flex", alignItems: "center", gap: 8 }}>
                                                <span>⚡</span>
                                                <span style={{ fontSize: 13, fontWeight: 700, color: C.over }}>Risk Acceptance Override — Audit Record</span>
                                            </div>
                                            <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                                                {[{ label: "Timestamp", value: new Date(timestamp).toLocaleString() }, { label: "Developer", value: developer }, { label: "Reason", value: reason }].map(row => (
                                                    <div key={row.label} style={{ display: "flex", gap: 16 }}>
                                                        <div style={{ fontSize: 11, fontWeight: 700, color: C.textDim, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 100 }}>{row.label}</div>
                                                        <div style={{ fontSize: 13, color: C.text, flex: 1 }}>{row.value}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                            </div>
                        </div>
                    )}
                </main>
            </div>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>
        </div>
    );
}