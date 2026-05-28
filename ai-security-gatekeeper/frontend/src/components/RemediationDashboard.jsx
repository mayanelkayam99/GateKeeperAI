import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  Package,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchRemediationScan } from "../api/client";
import { formatDateTime, getStatusTheme } from "../utils/statusTheme";
import Header from "./Header";

// ---------------------------------------------------------------------------
// Data parsing helpers  (logic unchanged)
// ---------------------------------------------------------------------------

function parseDependencyEntries(scan) {
  const isBatch =
    scan.license_type === "Mixed" ||
    scan.package?.name === "pre-push dependency batch";

  if (!isBatch) {
    const pkg = scan.package;
    return [
      {
        packageRef: pkg ? `${pkg.name}@${pkg.version}` : "Unknown",
        status: String(scan.status || "").toUpperCase(),
        explanation: scan.ai_explanation || "",
      },
    ];
  }

  const statusMap = {};
  (scan.cve_summary || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const m = line.match(/^(.+?):\s*(APPROVE(?:D)?|WARNING|BLOCKED)$/i);
      if (m) {
        const key = m[1].trim();
        const val = m[2].toUpperCase();
        statusMap[key] = val === "APPROVED" ? "APPROVED" : val;
      }
    });

  const sections = (scan.ai_explanation || "")
    .split(/\n\n---\n\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const entries = sections.map((section) => {
    const nlIdx = section.indexOf("\n");
    const packageRef = nlIdx >= 0 ? section.slice(0, nlIdx).trim() : section.trim();
    const explanation = nlIdx >= 0 ? section.slice(nlIdx + 1).trim() : "";
    const status = statusMap[packageRef] || "UNKNOWN";
    return { packageRef, status, explanation };
  });

  if (entries.length === 0) {
    return Object.entries(statusMap).map(([packageRef, status]) => ({
      packageRef,
      status,
      explanation: "",
    }));
  }

  return entries;
}

function deriveRecommendedFix(explanation, status) {
  const exp = explanation.toLowerCase();

  if (exp.includes("non-compete") || exp.includes("anti-security")) {
    return "Replace this package with one that uses a permissive open-source license (MIT, Apache-2.0, or ISC). Search npmjs.com for an alternative with a compatible license.";
  }
  if (exp.includes("legal agent") && (exp.includes("gpl") || exp.includes("agpl") || exp.includes("copyleft"))) {
    return "Switch to an MIT or Apache-2.0 licensed equivalent. Many popular packages have permissively licensed alternatives — check the npm registry or bundlephobia.com.";
  }
  if (exp.includes("legal agent")) {
    return "This package was flagged by the Legal Agent. Replace it with a dependency using an approved SPDX license (MIT, Apache-2.0, BSD-2-Clause, ISC).";
  }
  if (exp.includes("rce") || exp.includes("remote code execution") || exp.includes("code injection")) {
    return "Critical RCE detected. Upgrade to the latest patched release immediately, or replace with a maintained alternative. Check the package's GitHub security advisories for the minimum safe version.";
  }
  if (exp.includes("prototype pollution")) {
    return "Upgrade to the latest version where prototype pollution is patched. Run `npm audit fix` to automatically apply the recommended fix if available.";
  }
  if (exp.includes("sql injection") || exp.includes("data exposure") || exp.includes("data integrity")) {
    return "Upgrade to the latest version that patches this data-integrity vulnerability, or switch to a well-maintained alternative library.";
  }
  if (exp.includes("cvss") || exp.includes("severity")) {
    return "Upgrade to the latest version to receive the security patch. Run `npm audit` to identify the exact patched version required.";
  }
  if (status === "WARNING") {
    return "Manually review this dependency before pushing. Run `npm audit` for details, and consider pinning to a known-good version.";
  }
  return "Remove or upgrade this dependency. Run `npm audit fix` to apply automatic patches, or search npmjs.com for a secure alternative.";
}

// ---------------------------------------------------------------------------
// Risk-category badge  (NEW)
// ---------------------------------------------------------------------------

function RiskBadge({ explanation }) {
  const exp = String(explanation || "").toLowerCase();

  if (
    exp.includes("rce") ||
    exp.includes("remote code execution") ||
    exp.includes("code injection") ||
    exp.includes("cvss") ||
    exp.includes("vulnerability") ||
    exp.includes("cve-")
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-red-500/40">
        <ShieldAlert className="h-3 w-3" />
        Security Risk
      </span>
    );
  }
  if (
    exp.includes("legal agent") ||
    exp.includes("license") ||
    exp.includes("gpl") ||
    exp.includes("agpl") ||
    exp.includes("non-compete") ||
    exp.includes("copyleft")
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-semibold text-orange-300 ring-1 ring-orange-500/40">
        <Scale className="h-3 w-3" />
        Legal / License
      </span>
    );
  }
  if (
    exp.includes("prototype pollution") ||
    exp.includes("sql injection") ||
    exp.includes("data exposure")
  ) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/20 px-2.5 py-0.5 text-xs font-semibold text-yellow-300 ring-1 ring-yellow-500/40">
        <AlertTriangle className="h-3 w-3" />
        Data Integrity
      </span>
    );
  }
  if (exp.includes("policy") || exp.includes("compliance")) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-0.5 text-xs font-semibold text-violet-300 ring-1 ring-violet-500/40">
        <FileText className="h-3 w-3" />
        Policy Violation
      </span>
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-surface-600 border-t-accent-cyan" />
          <p className="text-sm text-slate-400">Loading remediation report…</p>
        </div>
      </main>
    </div>
  );
}

function ErrorState({ scanId, message }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-accent-cyan"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        <div className="mt-8 rounded-xl border border-red-500/40 bg-red-500/5 p-8 text-center">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-400" />
          <p className="text-base font-semibold text-red-300">Could not load scan #{scanId}</p>
          <p className="mt-1 text-sm text-slate-400">{message}</p>
        </div>
      </main>
    </div>
  );
}

function StatusChip({ status }) {
  const theme = getStatusTheme(status);
  const Icon = theme.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ${theme.badge}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {theme.label}
    </span>
  );
}

/**
 * DependencyCard  — the main card for each scanned package.
 *
 * Visual improvements over previous version:
 *  • More generous padding (p-6 body, px-6 py-5 header)
 *  • Package name at text-base for readability
 *  • Risk-category badge inline next to the package name
 *  • Explanation rendered as div+whitespace-pre-wrap (not <pre>) so browser
 *    wraps prose correctly while still honouring \n line breaks
 *  • Text sizes bumped to text-sm / text-base throughout
 *  • Recommended Fix replaced by a prominent emerald left-accent callout
 */
function DependencyCard({ entry }) {
  const theme = getStatusTheme(entry.status);
  const fix = deriveRecommendedFix(entry.explanation, entry.status);
  const needsFix = entry.status === "BLOCKED" || entry.status === "WARNING";

  return (
    <div className={`panel overflow-hidden border-2 ${theme.border} ${theme.glow}`}>

      {/* ── Card header ── */}
      <div className={`bg-gradient-to-r ${theme.gradient} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">

          {/* Package name + risk badge */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Package className="h-5 w-5 flex-shrink-0 text-slate-400" />
            <code className="font-mono text-base font-bold text-white">
              {entry.packageRef}
            </code>
            <RiskBadge explanation={entry.explanation} />
          </div>

          {/* Status chip (BLOCKED / WARNING) */}
          <StatusChip status={entry.status} />
        </div>
      </div>

      {/* ── Card body ── */}
      <div className="space-y-5 p-6">

        {/* AI explanation */}
        {entry.explanation ? (
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <Sparkles className="h-3.5 w-3.5 text-accent-cyan" />
              Why this dependency was flagged
            </p>
            {/*
              Using a plain <div> with whitespace-pre-wrap instead of <pre>:
              - Inherits the correct prose font (Inter)
              - Honours \n line breaks from the backend
              - Word-wraps long lines so nothing overflows
            */}
            <div className="scrollbar-thin max-h-56 overflow-auto rounded-lg border border-surface-600/80 bg-surface-950/70 p-4 text-sm leading-7 text-slate-200 whitespace-pre-wrap">
              {entry.explanation}
            </div>
          </div>
        ) : (
          <p className="text-sm italic text-slate-500">No detailed explanation available.</p>
        )}

        {/* ── Recommended Fix callout ── */}
        {needsFix && (
          <div className="overflow-hidden rounded-xl bg-emerald-950/50 ring-1 ring-emerald-500/35">
            {/* Left accent bar + content */}
            <div className="flex">
              <div className="w-1 flex-shrink-0 bg-emerald-500" />
              <div className="flex-1 px-5 py-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-300">
                  <Wrench className="h-4 w-4" />
                  Recommended Fix
                </p>
                {/*
                  whitespace-pre-wrap on the fix text too, in case future
                  fix strings include step-by-step line-separated instructions.
                */}
                <p className="text-base leading-7 text-slate-100 whitespace-pre-wrap">
                  {fix}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function RemediationDashboard() {
  const { scanId } = useParams();
  const [scan, setScan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchRemediationScan(scanId)
      .then(setScan)
      .catch((err) =>
        setError(err.response?.data?.detail || err.message || "Failed to load scan")
      )
      .finally(() => setLoading(false));
  }, [scanId]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState scanId={scanId} message={error} />;
  if (!scan) return null;

  const entries = parseDependencyEntries(scan);
  const blockedEntries = entries.filter((e) => e.status === "BLOCKED");
  const warningEntries = entries.filter((e) => e.status === "WARNING");
  const approvedEntries = entries.filter(
    (e) => e.status === "APPROVED" || e.status === "APPROVE"
  );

  const isActuallyBlocked = String(scan.status || "").toUpperCase() === "BLOCKED";

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-7 px-4 py-8 sm:px-6 lg:px-8">

        {/* Back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-accent-cyan"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        {/* ── Top banner ── */}
        {isActuallyBlocked ? (
          <div className="rounded-2xl border-2 border-red-500/70 bg-gradient-to-r from-red-500/20 via-red-500/8 to-transparent p-6 shadow-glow-red">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 rounded-xl bg-red-500/20 p-3 ring-1 ring-red-500/30">
                <AlertOctagon className="h-7 w-7 text-red-400" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="font-mono text-2xl font-bold uppercase tracking-wide text-red-300">
                    Push Blocked
                  </h1>
                  <span className="rounded-full bg-red-500/20 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-red-300 ring-1 ring-red-500/40">
                    Action Required
                  </span>
                </div>
                <p className="mt-2 text-base leading-relaxed text-slate-300">
                  Your git push was rejected by the AI Security Gatekeeper.{" "}
                  {blockedEntries.length > 0 && (
                    <span className="font-semibold text-red-300">
                      {blockedEntries.length}{" "}
                      {blockedEntries.length === 1 ? "dependency" : "dependencies"} must
                      be resolved before you can push.
                    </span>
                  )}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-5 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Scan #{scan.id}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatDateTime(scan.scanned_at)}
                  </span>
                  {scan.cvss_max_score != null && (
                    <span className="flex items-center gap-1.5 font-semibold text-red-400">
                      <ShieldAlert className="h-4 w-4" />
                      Max CVSS {scan.cvss_max_score.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-amber-500/60 bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent p-6 shadow-glow-amber">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 rounded-xl bg-amber-500/20 p-3 ring-1 ring-amber-500/30">
                <TriangleAlert className="h-7 w-7 text-amber-400" />
              </div>
              <div>
                <h1 className="font-mono text-2xl font-bold uppercase tracking-wide text-amber-300">
                  Push Warning
                </h1>
                <p className="mt-2 text-base leading-relaxed text-slate-300">
                  Your push was allowed but{" "}
                  <span className="font-semibold text-amber-300">
                    {warningEntries.length}{" "}
                    {warningEntries.length === 1
                      ? "dependency requires"
                      : "dependencies require"}{" "}
                    review
                  </span>
                  . Address these before your next release.
                </p>
                <div className="mt-3 flex flex-wrap gap-5 text-sm text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <FileText className="h-4 w-4" />
                    Scan #{scan.id}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4" />
                    {formatDateTime(scan.scanned_at)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Stat pills ── */}
        <div className="flex flex-wrap gap-3">
          {blockedEntries.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300">
              <AlertOctagon className="h-4 w-4" />
              {blockedEntries.length} Blocked
            </div>
          )}
          {warningEntries.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {warningEntries.length} Warning
            </div>
          )}
          {approvedEntries.length > 0 && (
            <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              {approvedEntries.length} Approved
            </div>
          )}
        </div>

        {/* ── Blocked dependencies ── */}
        {blockedEntries.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400">
              <AlertOctagon className="h-4 w-4" />
              Blocked Dependencies — must be fixed before pushing
            </h2>
            {blockedEntries.map((entry) => (
              <DependencyCard key={entry.packageRef} entry={entry} />
            ))}
          </section>
        )}

        {/* ── Warning dependencies ── */}
        {warningEntries.length > 0 && (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Warnings — review before next release
            </h2>
            {warningEntries.map((entry) => (
              <DependencyCard key={entry.packageRef} entry={entry} />
            ))}
          </section>
        )}

        {/* ── Approved — compact pill list ── */}
        {approvedEntries.length > 0 && (
          <section>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                Approved ({approvedEntries.length}) — no action required
              </h2>
              <div className="flex flex-wrap gap-2">
                {approvedEntries.map((entry) => (
                  <span
                    key={entry.packageRef}
                    className="rounded-full bg-emerald-500/10 px-3 py-1 font-mono text-xs text-emerald-300 ring-1 ring-emerald-500/25"
                  >
                    {entry.packageRef}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-surface-600/40 py-4 text-center text-xs text-slate-600">
        AI Security Gatekeeper · OSV + Groq Llama 3
      </footer>
    </div>
  );
}
