import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  getOverviewCounts,
  getRecallBreakdown,
  getYearMileageBuckets,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [counts, recallBreakdown, mileageByYear] = await Promise.all([
    getOverviewCounts(),
    getRecallBreakdown(),
    getYearMileageBuckets(),
  ]);

  // Compute "% of polled V35A trucks with engine recall open"
  const polled24v381 = recallBreakdown.filter((r) => r.recall_id === "24V381");
  const polled25v767 = recallBreakdown.filter((r) => r.recall_id === "25V767");
  const totalPolled24 = polled24v381.reduce((s, r) => s + r.count, 0);
  const totalPolled25 = polled25v767.reduce((s, r) => s + r.count, 0);
  const open24 = polled24v381.find((r) => r.status === "open")?.count ?? 0;
  const open25 = polled25v767.find((r) => r.status === "open")?.count ?? 0;
  const pct = (n: number, d: number) =>
    d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;

  // Cohort breakdown
  const cohort = mileageByYear.filter(
    (b) => b.model_year >= 2022 && b.model_year <= 2024,
  );
  const cohortCount = cohort.reduce((s, b) => s + b.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Live data"
        title="3rd Gen Tundra Tracker"
        description="Carvana inventory + NHTSA recall lookups. The recall section per VIN is our analytical spine: an open 24V381 means the engine has not yet been replaced; an open 25V767 means the expansion remedy is still under development for that build."
      />

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Population
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Vehicles tracked" value={counts.vehicles} />
          <StatCard
            label="V35A 2022-2024"
            value={counts.recall_eligible}
            caption="recall-eligible cohort"
          />
          <StatCard
            label="i-FORCE MAX (hybrid)"
            value={counts.v35a_hybrid}
            caption={`${counts.v35a_nonhybrid.toLocaleString()} non-hybrid`}
          />
          <StatCard
            label="Median mileage"
            value={counts.median_mileage_3rdgen?.toLocaleString() ?? "—"}
            caption="3rd gen, latest observation"
          />
        </dl>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Engine recall status
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-baseline justify-between">
              <h3 className="font-mono text-sm font-semibold">24V381</h3>
              <span className="text-xs text-zinc-500">Toyota 24TA07 · remedy ACTIVE</span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              2022–2023 Tundra. Dealers replace the engine assembly.
            </p>
            <div className="mt-4 flex items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
                <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {open24}
                </p>
              </div>
              <div className="text-zinc-400">/</div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Polled</p>
                <p className="text-2xl font-semibold tabular-nums">{totalPolled24}</p>
              </div>
              <div className="ml-auto">
                <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
                <p className="text-3xl font-semibold tabular-nums">{pct(open24, totalPolled24)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-baseline justify-between">
              <h3 className="font-mono text-sm font-semibold">25V767</h3>
              <span className="text-xs text-zinc-500">
                Toyota 25TA14 · remedy UNDER DEV (~Aug 2026)
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Expands 24V381 to 2022–2024 Tundra + Lexus LX/GX. Most eligible VINs
              still appear open because the final remedy isn&apos;t available.
            </p>
            <div className="mt-4 flex items-end gap-6">
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
                <p className="text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                  {open25}
                </p>
              </div>
              <div className="text-zinc-400">/</div>
              <div>
                <p className="text-xs uppercase tracking-wider text-zinc-500">Polled</p>
                <p className="text-2xl font-semibold tabular-nums">{totalPolled25}</p>
              </div>
              <div className="ml-auto">
                <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
                <p className="text-3xl font-semibold tabular-nums">{pct(open25, totalPolled25)}</p>
              </div>
            </div>
          </div>
        </div>
        {totalPolled24 + totalPolled25 < cohortCount * 2 && (
          <p className="mt-3 text-xs text-zinc-500">
            Recall poll in progress: {Math.max(totalPolled24, totalPolled25)} of {cohortCount}{" "}
            recall-eligible VINs polled. This page auto-refreshes on reload.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">
          Cohort snapshot
        </h2>
        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
              <tr>
                <th className="px-4 py-2 text-left">Year</th>
                <th className="px-4 py-2 text-left">Hybrid?</th>
                <th className="px-4 py-2 text-right">Count</th>
                <th className="px-4 py-2 text-right">Median mileage</th>
                <th className="px-4 py-2 text-right">P25 / P75</th>
                <th className="px-4 py-2 text-right">Median price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {mileageByYear.map((b) => (
                <tr key={`${b.model_year}-${b.is_hybrid}`}>
                  <td className="px-4 py-2 tabular-nums">{b.model_year}</td>
                  <td className="px-4 py-2">
                    {b.is_hybrid === true
                      ? "i-FORCE MAX"
                      : b.is_hybrid === false
                      ? "non-hybrid"
                      : "?"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {b.median_mileage?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-500">
                    {b.p25_mileage && b.p75_mileage
                      ? `${b.p25_mileage.toLocaleString()} / ${b.p75_mileage.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {b.median_price_usd ? `$${b.median_price_usd.toLocaleString()}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
