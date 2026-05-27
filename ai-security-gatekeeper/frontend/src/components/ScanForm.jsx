import { Loader2, ScanSearch } from "lucide-react";

const ECOSYSTEMS = [
  { value: "npm", label: "npm" },
  { value: "pypi", label: "PyPI" },
  { value: "crates.io", label: "crates.io" },
  { value: "Go", label: "Go" },
  { value: "NuGet", label: "NuGet" },
];

export default function ScanForm({
  packageName,
  version,
  ecosystem,
  loading,
  error,
  onPackageNameChange,
  onVersionChange,
  onEcosystemChange,
  onSubmit,
}) {
  return (
    <section className="panel p-6">
      <div className="mb-5 flex items-center gap-2">
        <ScanSearch className="h-5 w-5 text-accent-cyan" />
        <h2 className="text-lg font-semibold text-white">Scan Package</h2>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="package-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Package Name
            </label>
            <input
              id="package-name"
              type="text"
              className="input-field font-mono"
              placeholder="lodash"
              value={packageName}
              onChange={(e) => onPackageNameChange(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div>
            <label htmlFor="version" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Version
            </label>
            <input
              id="version"
              type="text"
              className="input-field font-mono"
              placeholder="4.17.20"
              value={version}
              onChange={(e) => onVersionChange(e.target.value)}
              disabled={loading}
              required
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="ecosystem" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-slate-400">
              Ecosystem
            </label>
            <select
              id="ecosystem"
              className="input-field cursor-pointer"
              value={ecosystem}
              onChange={(e) => onEcosystemChange(e.target.value)}
              disabled={loading}
            >
              {ECOSYSTEMS.map((eco) => (
                <option key={eco.value} value={eco.value}>
                  {eco.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !packageName.trim() || !version.trim()}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent-cyan to-accent-blue px-6 py-3 text-sm font-bold text-surface-950 transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              AI is analyzing…
            </>
          ) : (
            <>
              <ScanSearch className="h-5 w-5" />
              Scan Package
            </>
          )}
        </button>

        {loading && (
          <p className="text-center text-xs text-slate-500 sm:text-left">
            Querying OSV vulnerability database and running Groq security analysis. This may take up to a minute.
          </p>
        )}
      </form>
    </section>
  );
}
