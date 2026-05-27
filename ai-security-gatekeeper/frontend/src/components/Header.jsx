import { Shield } from "lucide-react";

export default function Header() {
  return (
    <header className="border-b border-surface-600/60 bg-surface-900/50 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-cyan/20 to-accent-blue/20 ring-1 ring-accent-cyan/30">
            <Shield className="h-6 w-6 text-accent-cyan" strokeWidth={2} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              AI Security Gatekeeper
            </h1>
            <p className="text-xs text-slate-400 sm:text-sm">
              Open-source dependency risk intelligence
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-surface-600 bg-surface-800/80 px-3 py-1.5 text-xs font-medium text-slate-400 sm:flex">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          OSV + AI Analysis
        </div>
      </div>
    </header>
  );
}
