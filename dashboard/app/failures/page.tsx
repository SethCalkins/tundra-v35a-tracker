import { PageHeader } from "@/components/page-header";
import {
  getRecallBreakdown,
  getVehiclesWithLatestListing,
  type VehicleWithListing,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

interface RecallSummary {
  recall_id: string;
  open: number;
  not_listed: number;
  unknown: number;
  total: number;
  open_pct: number | null;
}

function summarise(rows: { recall_id: string; status: string; count: number }[]): RecallSummary[] {
  const byId = new Map<string, RecallSummary>();
  for (const r of rows) {
    const cur = byId.get(r.recall_id) ?? {
      recall_id: r.recall_id,
      open: 0,
      not_listed: 0,
      unknown: 0,
      total: 0,
      open_pct: null,
    };
    if (r.status === "open") cur.open += r.count;
    else if (r.status === "not_listed") cur.not_listed += r.count;
    else cur.unknown += r.count;
    cur.total += r.count;
    byId.set(r.recall_id, cur);
  }
  return [...byId.values()].map((s) => ({
    ...s,
    open_pct: s.total > 0 ? s.open / s.total : null,
  }));
}

function statusOf(v: VehicleWithListing): "any_open" | "all_not_listed" | "not_polled" {
  const a = v.recall_24v381;
  const b = v.recall_25v767;
  if (a === null && b === null) return "not_polled";
  if (a === "open" || b === "open") return "any_open";
  return "all_not_listed";
}

export default async function Failures() {
  const [recallRows, vehicles] = await Promise.all([
    getRecallBreakdown(),
    getVehiclesWithLatestListing({ v35aOnly: true, limit: 1000 }),
  ]);

  const summary = summarise(recallRows);
  const v35aCohort = vehicles.filter(
    (v) => v.model_year !== null && v.model_year >= 2022 && v.model_year <= 2024,
  );

  // By year × powertrain (using whichever recall applies for that year)
  const byYearHybrid: Record<string, { open: number; closed: number; total: number }> = {};
  for (const v of v35aCohort) {
    const status = statusOf(v);
    if (status === "not_polled") continue;
    const key = `${v.model_year}|${v.is_hybrid === true ? "hybrid" : "nonhybrid"}`;
    const cur = byYearHybrid[key] ?? { open: 0, closed: 0, total: 0 };
    if (status === "any_open") cur.open += 1;
    else cur.closed += 1;
    cur.total += 1;
    byYearHybrid[key] = cur;
  }
  const yearRows = Object.entries(byYearHybrid)
    .map(([k, v]) => {
      const [year, ht] = k.split("|");
      return { year: Number(year), hybrid: ht === "hybrid", ...v };
    })
    .sort((a, b) => a.year - b.year || (a.hybrid ? 1 : 0) - (b.hybrid ? 1 : 0));

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Engine Failures"
        title="V35A engine recall status"
        description="For every recall-eligible truck we polled toyota.com/recall to see whether the engine recall is still listed as open. An open campaign means the engine has not been replaced. An absent campaign means it was either replaced or was never in the affected build window — Toyota does not publish per-VIN eligibility, so we cannot disambiguate without their internal data."
      />

      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {summary.map((s) => (
          <div
            key={s.recall_id}
            className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-mono text-sm font-semibold">{s.recall_id}</h3>
              <span className="text-xs text-zinc-500">
                {s.recall_id === "24V381"
                  ? "remedy active since Dec 2024"
                  : "remedy under development (~Aug 2026)"}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {s.open}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Not listed</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {s.not_listed}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums">
                  {s.open_pct === null
                    ? "—"
                    : `${Math.round(s.open_pct * 100)}%`}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
              {s.total} polled · {s.unknown > 0 ? `${s.unknown} unrecognised by Toyota` : null}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
          By year × powertrain
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-left">Powertrain</th>
              <th className="px-4 py-2 text-right">Polled</th>
              <th className="px-4 py-2 text-right">Any recall open</th>
              <th className="px-4 py-2 text-right">Not listed</th>
              <th className="px-4 py-2 text-right">% open</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {yearRows.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2 tabular-nums">{r.year}</td>
                <td className="px-4 py-2">{r.hybrid ? "i-FORCE MAX" : "non-hybrid"}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.total}</td>
                <td className="px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                  {r.open}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {r.closed}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {r.total > 0 ? `${Math.round((r.open / r.total) * 100)}%` : "—"}
                </td>
              </tr>
            ))}
            {yearRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No polled VINs yet — recall poll is still running. Refresh the page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">Interpretation caveat</p>
        <p className="mt-2">
          &quot;% open&quot; on these tables is an upper bound on real-world failure rate, not a
          measure of it. Toyota replaced engines proactively under the recall, including some
          that hadn&apos;t failed yet. And &quot;not listed&quot; could mean the VIN was either
          remedied or never in scope. Carvana inventory also isn&apos;t a random sample — it
          skews toward off-lease trucks. Treat these numbers as directional, not definitive.
        </p>
      </section>
    </main>
  );
}
