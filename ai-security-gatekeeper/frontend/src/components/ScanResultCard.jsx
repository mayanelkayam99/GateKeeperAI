import {
  AlertOctagon,
  AlertTriangle,
  FileWarning,
  Scale,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getStatusTheme } from "../utils/statusTheme";

function getStatusIcon(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "BLOCKED") return AlertOctagon;
  if (normalized === "APPROVED" || normalized === "APPROVE") return ShieldCheck;
  return AlertTriangle;
}

function buildQuickVerdict(result) {
  const status = String(result?.status || "").toUpperCase();
  const explanation = String(result?.ai_explanation || "").toLowerCase();
  const license = String(result?.license_type || "").toLowerCase();

  if (status === "BLOCKED") {
    if (license.includes("gpl") || license.includes("agpl")) {
      return "Blocked because GPL/AGPL license policy violation.";
    }
    if (explanation.includes("rce") || explanation.includes("remote code execution")) {
      return "Blocked because a critical RCE risk was detected.";
    }
    if (explanation.includes("prototype pollution")) {
      return "Blocked because prototype pollution risk was detected.";
    }
    if (result?.cvss_max_score != null && result.cvss_max_score >= 7) {
      return "Blocked because CVSS severity is 7.0 or higher.";
    }
    return "Blocked because security policy conditions were violated.";
  }

  if (status === "WARNING") {
    return "Warning because moderate risk findings require manual review.";
  }
  return "Approved because no blocking policy violations were found.";
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

  const summaryLines = String(result?.cve_summary || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const perPackageRows = summaryLines
    .map((line) => {
      const match = line.match(/^(.+?):\s*(APPROVE|APPROVED|WARNING|BLOCKED)\b/i);
      if (!match) return null;
      return {
        packageName: match[1].trim(),
        status: match[2].toUpperCase().replace("APPROVED", "APPROVED"),
        license: "Unknown",
      };
    })
    .filter(Boolean);

  return perPackageRows.length > 0
    ? perPackageRows
    : [{ packageName: packageLabel, status, license: "Unknown" }];
}

export default function ScanResultCard({ result }) {
  if (!result) return null;

  const theme = getStatusTheme(result.status);
  const StatusIcon = getStatusIcon(result.status);
  const pkg = result.package;
  const quickVerdict = buildQuickVerdict(result);
  const licenseRows = extractLicenseRows(result);

  return (
    <section
      className={`panel overflow-hidden border-2 ${theme.border} ${theme.glow}`}
    >
      <div className={`bg-gradient-to-r ${theme.gradient} px-6 py-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              High-Level Summary
            </p>
            <h2 className="mt-1 font-mono text-2xl font-bold text-white">
              {pkg?.name ?? "Unknown"}
              <span className="text-slate-400">@{pkg?.version ?? "—"}</span>
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Ecosystem: <span className="font-mono text-slate-300">{pkg?.ecosystem ?? "—"}</span>
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 ring-1 ${theme.badge}`}
          >
            <StatusIcon className={`h-5 w-5 ${theme.text}`} />
            <span className={`text-sm font-bold uppercase tracking-wide ${theme.text}`}>
              Status: {theme.label}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-200">
          <span className="font-semibold text-white">Quick Verdict:</span> {quickVerdict}
        </p>
        {result.cvss_max_score != null && (
          <p className="mt-3 text-sm text-slate-400">
            Max CVSS:{" "}
            <span className={`font-mono font-semibold ${theme.text}`}>
              {result.cvss_max_score.toFixed(1)}
            </span>
          </p>
        )}
      </div>

      <div className="space-y-5 p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <FileWarning className="h-4 w-4 text-amber-400" />
            CVE Summary
          </div>
          <pre className="scrollbar-thin max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-surface-600 bg-surface-950/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
            {result.cve_summary || "No CVE data available."}
          </pre>
        </div>

        <div className="flex flex-wrap gap-4">
          <div className="w-full rounded-lg border border-surface-600 bg-surface-800/50 px-4 py-3">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
              <Scale className="h-3.5 w-3.5" />
              Dependency License Visibility
            </div>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead>
                  <tr className="border-b border-surface-600/60 text-slate-400">
                    <th className="py-2 pr-4 font-semibold uppercase tracking-wider">Package Name</th>
                    <th className="py-2 pr-4 font-semibold uppercase tracking-wider">Status</th>
                    <th className="py-2 font-semibold uppercase tracking-wider">License</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-600/30">
                  {licenseRows.map((row) => (
                    <tr key={`${row.packageName}-${row.status}`} className="text-slate-200">
                      <td className="py-2 pr-4 font-mono">{row.packageName}</td>
                      <td className="py-2 pr-4">{row.status}</td>
                      <td className="py-2 font-mono">{row.license}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Sparkles className="h-4 w-4 text-accent-cyan" />
            Security Analyst Deep-Dive
          </div>
          <details className={`rounded-xl border ${theme.border} ${theme.bg}`} open>
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-200">
              Show detailed AI analysis
            </summary>
            <div className="border-t border-surface-600/50 px-5 py-4">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-cyan/20">
                  <Sparkles className="h-3.5 w-3.5 text-accent-cyan" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  AppSec Agent
                </span>
              </div>
              <pre className="scrollbar-thin max-h-64 overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-200">
                {result.ai_explanation || "No explanation provided."}
              </pre>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
