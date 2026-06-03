import { useState, useRef, useEffect } from "react";
import {
  AlertOctagon, AlertTriangle, FileWarning, Scale,
  ShieldCheck, Sparkles, Wrench, Package, Bot, Send,
  Zap, ChevronDown, ChevronUp, Shield, Activity,
} from "lucide-react";
import { getStatusTheme } from "../utils/statusTheme";
import { API_BASE_URL } from "../api/client";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function getStatusIcon(status) {
  const n = String(status || "").toUpperCase();
  if (n === "BLOCKED") return AlertOctagon;
  if (n === "APPROVED" || n === "APPROVE") return ShieldCheck;
  return AlertTriangle;
}

function buildQuickVerdict(result) {
  const status = String(result?.status || "").toUpperCase();
  const exp = String(result?.ai_explanation || "").toLowerCase();
  const lic = String(result?.license_type || "").toLowerCase();
  if (status === "BLOCKED") {
    if (lic.includes("gpl") || lic.includes("agpl")) return "Blocked — GPL/AGPL license policy violation.";
    if (exp.includes("rce") || exp.includes("remote code execution")) return "Blocked — critical remote code execution risk detected.";
    if (exp.includes("prototype pollution")) return "Blocked — prototype pollution vulnerability detected.";
    if (result?.cvss_max_score != null && result.cvss_max_score >= 7) return "Blocked — CVSS severity score ≥ 7.0.";
    return "Blocked — security policy conditions were violated.";
  }
  if (status === "WARNING") return "Warning — moderate risk findings require manual review.";
  return "Approved — no blocking policy violations found.";
}

function extractLicenseRows(result) {
  const status = String(result?.status || "WARNING").toUpperCase();
  const licenseType = result?.license_type || "Unknown";
  const packageLabel = result?.package?.name
    ? `${result.package.name}@${result.package.version ?? "—"}`
    : "Unknown package";
  if (String(licenseType).toLowerCase() !== "mixed") {
    return [{ packageName: packageLabel, status, license: licenseType }];
  }
  const rows = String(result?.cve_summary || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(line => {
      const m = line.match(/^(.+?):\s*(APPROVE|APPROVED|WARNING|BLOCKED)\b/i);
      return m ? { packageName: m[1].trim(), status: m[2].toUpperCase(), license: "Unknown" } : null;
    }).filter(Boolean);
  return rows.length > 0 ? rows : [{ packageName: packageLabel, status, license: "Unknown" }];
}

function deriveRecommendedFix(explanation, status) {
  const exp = String(explanation || "").toLowerCase();
  if (exp.includes("non-compete") || exp.includes("anti-security"))
    return "Replace with a permissive open-source license package (MIT, Apache-2.0, or ISC).";
  if (exp.includes("legal agent") && (exp.includes("gpl") || exp.includes("agpl") || exp.includes("copyleft")))
    return "Switch to an MIT or Apache-2.0 licensed equivalent.";
  if (exp.includes("legal agent"))
    return "Replace with a dependency using an approved SPDX license (MIT, Apache-2.0, BSD-2-Clause, ISC).";
  if (exp.includes("rce") || exp.includes("remote code execution") || exp.includes("code injection"))
    return "Critical RCE detected. Upgrade to the latest patched release immediately, or replace with a maintained alternative.";
  if (exp.includes("prototype pollution"))
    return "Upgrade to the latest version where prototype pollution is patched. Run `npm audit fix`.";
  if (exp.includes("sql injection") || exp.includes("data exposure"))
    return "Upgrade to the latest version that patches this vulnerability, or switch to a well-maintained alternative.";
  if (status === "WARNING")
    return "Manually review this dependency. Run `npm audit` for details and consider pinning to a known-good version.";
  return "Remove or upgrade this dependency. Run `npm audit fix` to apply automatic patches.";
}

function parseRecommendation(text) {
  if (!text) return { prose: "", alternatives: [] };
  const m = text.match(/^(.*?replace with[^:]+):\s*(.+)$/is);
  if (m) return { prose: m[1].trim(), alternatives: m[2].split(/[,;]/).map(s => s.trim()).filter(Boolean) };
  return { prose: text, alternatives: [] };
}

// ─────────────────────────────────────────────
// Status color helpers
// ─────────────────────────────────────────────

function getStatusColors(status) {
  const s = String(status || "").toUpperCase();
  if (s === "BLOCKED") return {
    headerGrad: "from-[#1a0a0a] via-[#1f0d0d] to-[#0f0a0a]",
    accent: "#ef4444", accentMuted: "rgba(239,68,68,0.12)",
    accentBorder: "rgba(239,68,68,0.25)", accentText: "text-red-400",
    accentBg: "bg-red-500/10", accentRing: "ring-red-500/30",
    badge: "bg-red-500/15 text-red-300 ring-red-500/30",
    pillBg: "bg-red-900/40", pillText: "text-red-300",
    sectionBorder: "border-red-900/30",
  };
  if (s === "WARNING") return {
    headerGrad: "from-[#150f00] via-[#1a1200] to-[#0f0c00]",
    accent: "#f59e0b", accentMuted: "rgba(245,158,11,0.12)",
    accentBorder: "rgba(245,158,11,0.25)", accentText: "text-amber-400",
    accentBg: "bg-amber-500/10", accentRing: "ring-amber-500/30",
    badge: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
    pillBg: "bg-amber-900/40", pillText: "text-amber-300",
    sectionBorder: "border-amber-900/30",
  };
  return {
    headerGrad: "from-[#030f0a] via-[#051210] to-[#030a07]",
    accent: "#10b981", accentMuted: "rgba(16,185,129,0.12)",
    accentBorder: "rgba(16,185,129,0.25)", accentText: "text-emerald-400",
    accentBg: "bg-emerald-500/10", accentRing: "ring-emerald-500/30",
    badge: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
    pillBg: "bg-emerald-900/40", pillText: "text-emerald-300",
    sectionBorder: "border-emerald-900/30",
  };
}

// ─────────────────────────────────────────────
// Section wrapper — consistent card style
// ─────────────────────────────────────────────

function Section({ icon: Icon, iconColor, title, children }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-white/[0.06]">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</span>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// KPI strip
// ─────────────────────────────────────────────

function KpiStrip({ result, colors }) {
  const status = String(result?.status || "").toUpperCase();
  const cvss = result?.cvss_max_score;
  const kpis = [
    {
      label: "Verdict",
      value: status || "—",
      color: colors.accentText,
      bg: colors.accentBg,
    },
    {
      label: "CVSS Score",
      value: cvss != null ? cvss.toFixed(1) : "N/A",
      color: cvss >= 9 ? "text-red-400" : cvss >= 7 ? "text-amber-400" : "text-emerald-400",
      bg: cvss >= 9 ? "bg-red-500/10" : cvss >= 7 ? "bg-amber-500/10" : "bg-emerald-500/10",
    },
    {
      label: "Ecosystem",
      value: result?.package?.ecosystem ?? "—",
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
    },
    {
      label: "License",
      value: result?.license_type || "Unknown",
      color: "text-violet-400",
      bg: "bg-violet-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-white/[0.05]">
      {kpis.map(k => (
        <div key={k.label} className={`rounded-xl ${k.bg} px-4 py-3`}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-1">{k.label}</p>
          <p className={`font-mono text-sm font-bold ${k.color} truncate`}>{k.value}</p>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Markdown renderer (lightweight)
// ─────────────────────────────────────────────

function MarkdownMessage({ content, streaming }) {
  if (!content) {
    return streaming
      ? <span className="inline-block w-1.5 h-3 bg-slate-400 animate-pulse rounded-sm align-middle" />
      : null;
  }
  const parts = content.split(/(```[\s\S]*?```)/g);
  return (
    <div className="space-y-2">
      {parts.map((part, i) => {
        const fence = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
        if (fence) {
          const lang = fence[1] || "text";
          const code = fence[2].trim();
          return (
            <div key={i}>
              {lang && <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-0.5 block">{lang}</span>}
              <pre className="overflow-x-auto rounded-lg bg-[#0d1117] border border-white/10 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-slate-300">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        const segs = part.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        return (
          <p key={i} className="whitespace-pre-wrap leading-relaxed">
            {segs.map((seg, j) => {
              if (seg.startsWith("**") && seg.endsWith("**"))
                return <strong key={j} className="font-semibold text-slate-100">{seg.slice(2, -2)}</strong>;
              if (seg.startsWith("`") && seg.endsWith("`"))
                return <code key={j} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px] text-cyan-300">{seg.slice(1, -1)}</code>;
              return seg;
            })}
            {streaming && i === parts.length - 1 && (
              <span className="inline-block w-1.5 h-3 bg-slate-400 animate-pulse rounded-sm align-middle ml-0.5" />
            )}
          </p>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// Remediation Co-Pilot Chat
// ─────────────────────────────────────────────

const STARTER_PROMPTS = [
  "What exactly is this vulnerability?",
  "Give me the exact commands to switch to the safe alternative.",
  "Show me a before/after code diff for the migration.",
  "What breaking changes should I watch out for?",
];

function RemediationChat({ scanId, packageName, status, colors }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text) {
    const userMsg = text || input.trim();
    if (!userMsg || streaming) return;
    const priorHistory = messages;
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setInput("");
    setStreaming(true);
    setMessages(prev => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`${API_BASE_URL}/api/chat/`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "69420",
        },
        body: JSON.stringify({ scan_id: scanId, message: userMsg, history: priorHistory }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            accumulated += JSON.parse(payload).token;
            setMessages(prev => {
              const u = [...prev];
              u[u.length - 1] = { role: "assistant", content: accumulated };
              return u;
            });
          } catch (_) { }
        }
      }
    } catch {
      setMessages(prev => {
        const u = [...prev];
        u[u.length - 1] = { role: "assistant", content: "⚠️ Connection error. Please try again." };
        return u;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-white/[0.06]" style={{ background: "linear-gradient(135deg, #0d1117 0%, #0a0d14 100%)" }}>
      {/* Chat header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.06]"
        style={{ background: `linear-gradient(to right, ${colors.accentMuted}, transparent)` }}>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
          style={{ background: colors.accentMuted, border: `1px solid ${colors.accentBorder}` }}>
          <Bot className={`h-4.5 w-4.5 ${colors.accentText}`} style={{ height: 18, width: 18 }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">Remediation Co-Pilot</span>
            <Zap className={`h-3 w-3 ${colors.accentText}`} />
            {streaming && (
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="flex gap-0.5">
                  {[0, 1, 2].map(i => (
                    <span key={i} className={`inline-block h-1 w-1 rounded-full ${colors.accentBg} animate-bounce`}
                      style={{ animationDelay: `${i * 0.15}s`, background: colors.accent }} />
                  ))}
                </span>
                Thinking
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate">
            Context-aware for <span className="font-mono text-slate-400">{packageName}</span>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="overflow-y-auto p-5 space-y-4" style={{ minHeight: 280, maxHeight: 420 }}>
        {messages.length === 0 && (
          <div className="space-y-2.5">
            <p className="text-xs text-slate-500 text-center pb-1">
              Ask anything about this package or its migration path.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STARTER_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)}
                  className="text-left text-xs text-slate-400 px-3.5 py-2.5 rounded-xl transition-all duration-150
                             border border-white/[0.07] hover:border-white/20 hover:text-slate-200"
                  style={{ background: "rgba(255,255,255,0.03)" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="shrink-0 mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg"
                style={{ background: colors.accentMuted, border: `1px solid ${colors.accentBorder}` }}>
                <Bot style={{ height: 13, width: 13, color: colors.accent }} />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed ${msg.role === "user"
                ? "text-slate-100 rounded-tr-sm"
                : "text-slate-200 rounded-tl-sm border border-white/[0.07]"
              }`}
              style={msg.role === "user"
                ? { background: `linear-gradient(135deg, ${colors.accent}33, ${colors.accent}22)`, border: `1px solid ${colors.accentBorder}` }
                : { background: "rgba(255,255,255,0.04)" }}>
              {msg.role === "user"
                ? <p>{msg.content}</p>
                : <MarkdownMessage content={msg.content} streaming={streaming && i === messages.length - 1} />
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/[0.06] px-4 py-3.5 flex gap-3">
        <input ref={inputRef}
          className="flex-1 text-xs rounded-xl px-4 py-2.5 text-slate-200 placeholder-slate-600
                     focus:outline-none transition-all duration-150 disabled:opacity-40"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
          placeholder="Ask about this vulnerability or migration…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          disabled={streaming}
          onFocus={e => e.target.style.borderColor = colors.accentBorder}
          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
        />
        <button onClick={() => send()} disabled={streaming || !input.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white
                     transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
          style={{ background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent}bb)` }}>
          <Send style={{ height: 14, width: 14 }} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main ScanResultCard
// ─────────────────────────────────────────────

export default function ScanResultCard({ result }) {
  if (!result) return null;

  const theme = getStatusTheme(result.status);
  const StatusIcon = getStatusIcon(result.status);
  const colors = getStatusColors(result.status);
  const pkg = result.package;
  const quickVerdict = buildQuickVerdict(result);
  const licenseRows = extractLicenseRows(result);

  const rawFix = result.recommendation?.trim()
    || deriveRecommendedFix(result.ai_explanation || "", result.status);
  const { prose: fixProse, alternatives: fixAlts } = parseRecommendation(rawFix);

  const status = String(result.status || "").toUpperCase();
  const showChat = status === "BLOCKED" || status === "WARNING";
  const needsFix = showChat;

  return (
    <section className="overflow-hidden rounded-2xl" style={{
      background: "linear-gradient(160deg, #0d1117 0%, #090c12 100%)",
      border: `1px solid ${colors.accentBorder}`,
      boxShadow: `0 0 40px ${colors.accentMuted}, 0 1px 0 rgba(255,255,255,0.05) inset`,
    }}>

      {/* ── Hero Header ── */}
      <div className={`bg-gradient-to-br ${colors.headerGrad} px-6 py-6`}
        style={{ borderBottom: `1px solid ${colors.accentBorder}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] mb-2"
              style={{ color: colors.accent, opacity: 0.7 }}>
              Dependency Audit Report
            </p>
            <h2 className="font-mono text-3xl font-bold text-white leading-none">
              {pkg?.name ?? "Unknown"}
              <span className="text-slate-500 text-xl">@{pkg?.version ?? "—"}</span>
            </h2>
            <p className="mt-2 text-sm text-slate-400">{quickVerdict}</p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="inline-flex items-center gap-2.5 rounded-full px-5 py-2.5 font-bold text-sm uppercase tracking-widest ring-1"
              style={{
                background: colors.accentMuted,
                color: colors.accent,
                ringColor: colors.accentBorder,
                border: `1px solid ${colors.accentBorder}`,
              }}>
              <StatusIcon style={{ height: 16, width: 16 }} />
              {status || "UNKNOWN"}
            </div>
            {result.cvss_max_score != null && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Activity style={{ height: 12, width: 12 }} />
                <span>Max CVSS</span>
                <span className={`font-mono font-bold text-sm ${colors.accentText}`}>
                  {result.cvss_max_score.toFixed(1)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <KpiStrip result={result} colors={colors} />

      {/* ── Body sections ── */}
      <div className="px-6 py-6 space-y-5">

        {/* CVE Summary */}
        <Section icon={FileWarning} iconColor="text-amber-400" title="CVE Summary">
          <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-300 max-h-44 overflow-y-auto scrollbar-thin">
            {result.cve_summary || "No CVE data available."}
          </pre>
        </Section>

        {/* License Visibility */}
        <Section icon={Scale} iconColor="text-violet-400" title="Dependency License Visibility">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  {["Package", "Status", "License"].map(h => (
                    <th key={h} className="pb-2.5 pr-6 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {licenseRows.map(row => (
                  <tr key={`${row.packageName}-${row.status}`}>
                    <td className="py-2.5 pr-6 font-mono text-slate-200">{row.packageName}</td>
                    <td className="py-2.5 pr-6">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${row.status === "BLOCKED"
                          ? "bg-red-500/15 text-red-300 ring-red-500/30"
                          : row.status === "WARNING"
                            ? "bg-amber-500/15 text-amber-300 ring-amber-500/30"
                            : "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30"
                        }`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="py-2.5 font-mono text-slate-400">{row.license}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Recommended Fix */}
        {needsFix && (
          <div className="rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))",
              border: "1px solid rgba(16,185,129,0.2)",
            }}>
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-emerald-500/15">
              <Wrench className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Recommended Fix</span>
            </div>
            <div className="px-5 py-4 space-y-3">
              {fixProse && (
                <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{fixProse}</p>
              )}
              {fixAlts.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-500">
                    Suggested alternatives
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {fixAlts.map(alt => (
                      <span key={alt}
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-semibold text-emerald-200"
                        style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                        <Package style={{ height: 11, width: 11 }} />
                        {alt}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Deep-Dive */}
        <Section icon={Sparkles} iconColor="text-cyan-400" title="Security Analyst Deep-Dive">
          <div className="flex items-center gap-2 mb-3">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/10 ring-1 ring-cyan-500/20">
              <Shield style={{ height: 11, width: 11, color: "#22d3ee" }} />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">AppSec Agent</span>
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-300 max-h-56 overflow-y-auto scrollbar-thin">
            {result.ai_explanation || "No explanation provided."}
          </pre>
        </Section>

        {/* ── Remediation Co-Pilot (full width, below analysis) ── */}
        {showChat && (
          <div>
            <div className="flex items-center gap-2 mb-3 px-1">
              <Bot className={`h-4 w-4 ${colors.accentText}`} />
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Remediation Co-Pilot</span>
              <span className="ml-auto text-[10px] text-slate-600 font-mono">AI-powered · context-aware</span>
            </div>
            <RemediationChat
              scanId={result.id}
              packageName={pkg?.name ?? "this package"}
              status={status}
              colors={colors}
            />
          </div>
        )}

      </div>
    </section>
  );
}