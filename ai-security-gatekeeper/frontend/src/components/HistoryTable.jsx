import { History, Loader2, RefreshCw } from "lucide-react";
import { formatDateTime, getStatusTheme } from "../utils/statusTheme";

export default function HistoryTable({
  history,
  loading,
  error,
  onRefresh,
}) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-600/60 px-6 py-4">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-accent-blue" />
          <h2 className="text-lg font-semibold text-white">Scan History</h2>
          <span className="rounded-full bg-surface-700 px-2.5 py-0.5 text-xs font-medium text-slate-400">
            {history.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-surface-600 bg-surface-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-accent-cyan/40 hover:text-white disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="overflow-x-auto scrollbar-thin">
        {loading && history.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-accent-cyan" />
            <p className="text-sm">Loading scan history…</p>
          </div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            No scans yet. Run your first package scan above.
          </div>
        ) : (
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-surface-600/60 bg-surface-800/40 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3 font-medium">Package</th>
                <th className="px-4 py-3 font-medium">Version</th>
                <th className="px-4 py-3 font-medium">Ecosystem</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Scanned At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-600/40">
              {history.map((item) => {
                const theme = getStatusTheme(item.status);
                const StatusIcon = theme.icon;
                return (
                  <tr
                    key={item.id}
                    className="transition hover:bg-surface-800/30"
                  >
                    <td className="px-6 py-3.5 font-mono font-medium text-white">
                      {item.package?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-slate-300">
                      {item.package?.version ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-slate-400">
                      {item.package?.ecosystem ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${theme.badge}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {theme.label}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-400">
                      {formatDateTime(item.scanned_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
