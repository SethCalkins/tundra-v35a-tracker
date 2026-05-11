interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  emphasis?: "default" | "warning" | "info" | "danger" | "success";
}

const EMPHASIS_VALUE_CLASS: Record<NonNullable<StatCardProps["emphasis"]>, string> = {
  default: "text-zinc-900 dark:text-zinc-100",
  warning: "text-amber-600 dark:text-amber-400",
  info: "text-sky-700 dark:text-sky-400",
  danger: "text-[#EB0A1E]",
  success: "text-emerald-700 dark:text-emerald-400",
};

export function StatCard({ label, value, caption, emphasis = "default" }: StatCardProps) {
  const display = typeof value === "number" ? value.toLocaleString() : value;
  return (
    <div className="border-l-4 border-[#EB0A1E] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-shadow hover:shadow-md dark:bg-zinc-900">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd
        className={`mt-2 text-3xl font-bold tabular-nums tracking-tight ${EMPHASIS_VALUE_CLASS[emphasis]}`}
      >
        {display}
      </dd>
      {caption && <p className="mt-1.5 text-xs leading-5 text-zinc-500">{caption}</p>}
    </div>
  );
}
