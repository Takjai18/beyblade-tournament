import { STATUS_LABELS, FORMAT_LABELS } from "@beyblade/shared";
import clsx from "clsx";

const statusColor: Record<string, string> = {
  DRAFT: "bg-slate-700 text-slate-200",
  REGISTRATION: "bg-cyan-500/20 text-cyan-300",
  LIVE: "bg-orange-500/20 text-orange-300",
  FINISHED: "bg-emerald-500/20 text-emerald-300",
  ARCHIVED: "bg-slate-800 text-slate-400",
};

export function StatusBadge({ status }: { status: string }) {
  const label =
    STATUS_LABELS[status as keyof typeof STATUS_LABELS]?.zh ?? status;
  return (
    <span className={clsx("badge", statusColor[status] ?? statusColor.DRAFT)}>
      {label}
    </span>
  );
}

export function FormatBadge({ format }: { format: string }) {
  const label =
    FORMAT_LABELS[format as keyof typeof FORMAT_LABELS]?.zh ?? format;
  return (
    <span className="badge bg-slate-800 text-slate-300 border border-slate-700">
      {label}
    </span>
  );
}
