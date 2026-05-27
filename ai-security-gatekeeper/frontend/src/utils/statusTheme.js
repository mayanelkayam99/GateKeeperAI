import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ShieldAlert,
  XOctagon,
} from "lucide-react";

const THEMES = {
  APPROVED: {
    label: "Approved",
    border: "border-emerald-500/60",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40",
    glow: "shadow-glow-green",
    icon: CheckCircle2,
    gradient: "from-emerald-500/20 via-emerald-500/5 to-transparent",
  },
  WARNING: {
    label: "Warning",
    border: "border-amber-500/60",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    badge: "bg-amber-500/20 text-amber-300 ring-amber-500/40",
    glow: "shadow-glow-amber",
    icon: AlertTriangle,
    gradient: "from-amber-500/20 via-amber-500/5 to-transparent",
  },
  BLOCKED: {
    label: "Blocked",
    border: "border-red-500/70",
    bg: "bg-red-500/10",
    text: "text-red-400",
    badge: "bg-red-500/20 text-red-300 ring-red-500/40",
    glow: "shadow-glow-red",
    icon: XOctagon,
    gradient: "from-red-500/25 via-red-500/10 to-transparent",
  },
  PENDING: {
    label: "Pending",
    border: "border-sky-500/50",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
    badge: "bg-sky-500/20 text-sky-300 ring-sky-500/40",
    glow: "shadow-glow-blue",
    icon: Clock,
    gradient: "from-sky-500/20 via-sky-500/5 to-transparent",
  },
};

const DEFAULT_THEME = {
  label: "Unknown",
  border: "border-slate-500/50",
  bg: "bg-slate-500/10",
  text: "text-slate-400",
  badge: "bg-slate-500/20 text-slate-300 ring-slate-500/40",
  glow: "",
  icon: ShieldAlert,
  gradient: "from-slate-500/20 to-transparent",
};

export function getStatusTheme(status) {
  const key = String(status || "").toUpperCase();
  return THEMES[key] || DEFAULT_THEME;
}

export function formatDateTime(isoString) {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
