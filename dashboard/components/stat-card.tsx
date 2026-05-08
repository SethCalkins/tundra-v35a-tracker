interface StatCardProps {
  label: string;
  value: string | number;
  caption?: string;
  emphasis?: "default" | "warning" | "info";
}

export function StatCard({ label, value, caption, emphasis = "default" }: StatCardProps) {
  const valueClass = {
    default: "",
    warning: "text-amber-700 dark:text-amber-400",
    info: "text-sky-700 dark:text-sky-400",
  }[emphasis];

  const display = typeof value === "number" ? value.toLocaleString() : value;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${valueClass}`}>{display}</dd>
      {caption && (
        <p className="mt-1 text-xs text-zinc-500">{caption}</p>
      )}
    </div>
  );
}
