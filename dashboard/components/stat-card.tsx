interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  emphasis?: "default" | "warning" | "info" | "danger" | "success";
  trend?: { value: number; label?: string };
}

const EMPHASIS_VALUE_CLASS: Record<NonNullable<StatCardProps["emphasis"]>, string> = {
  default: "text-zinc-900 dark:text-zinc-100",
  warning: "text-amber-700 dark:text-amber-400",
  info: "text-sky-700 dark:text-sky-400",
  danger: "text-red-700 dark:text-red-400",
  success: "text-emerald-700 dark:text-emerald-400",
};

export function StatCard({ label, value, caption, emphasis = "default", trend }: StatCardProps) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="relative z-10">
        <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</dt>
        <dd
          className={`mt-2 text-3xl font-semibold tabular-nums tracking-tight ${EMPHASIS_VALUE_CLASS[emphasis]}`}
        >
          {display}
        </dd>
        {caption && <p className="mt-1.5 text-xs text-zinc-500">{caption}</p>}
        {trend && (
          <div
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
              trend.value >= 0
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            }`}
          >
            <span aria-hidden>{trend.value >= 0 ? "↑" : "↓"}</span>
            {Math.abs(trend.value).toLocaleString()}%
            {trend.label && <span className="text-zinc-500 dark:text-zinc-400">{trend.label}</span>}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br from-amber-100/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100 dark:from-amber-500/10" />
    </div>
  );
}
