import { MileageByYearChart } from "@/components/mileage-chart";
import { PageHeader } from "@/components/page-header";
import { getYearMileageBuckets } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Mileage() {
  const buckets = await getYearMileageBuckets();

  // Pivot for chart: one row per model_year with hybrid + non-hybrid medians
  const years = [...new Set(buckets.map((b) => b.model_year))].sort();
  const chartData = years.map((year) => {
    const hybrid = buckets.find((b) => b.model_year === year && b.is_hybrid === true);
    const nonhybrid = buckets.find((b) => b.model_year === year && b.is_hybrid === false);
    return {
      model_year: year,
      hybrid_median: hybrid?.median_mileage ?? null,
      nonhybrid_median: nonhybrid?.median_mileage ?? null,
    };
  });

  // Quick stats — overall medians
  const all3rdGen = buckets.filter((b) => b.model_year >= 2022);
  const totalCount = all3rdGen.reduce((s, b) => s + b.count, 0);
  const weightedMedian = (() => {
    const flat: number[] = [];
    for (const b of all3rdGen) {
      if (b.median_mileage !== null) {
        for (let i = 0; i < b.count; i++) flat.push(b.median_mileage);
      }
    }
    if (flat.length === 0) return null;
    flat.sort((a, b) => a - b);
    return flat[Math.floor(flat.length / 2)];
  })();

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Mileage"
        title="What mileage are 3rd gen Tundras getting?"
        description="Median mileage of latest Carvana observations, broken out by model year and powertrain. Carvana inventory skews to 25k–60k mile trucks coming off lease, so absolute mileages are lower than a random fleet sample."
      />

      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500">3rd gen tracked</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{totalCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Median mileage</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {weightedMedian?.toLocaleString() ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs uppercase tracking-wide text-zinc-500">Cohorts</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{years.length}</p>
          <p className="mt-1 text-xs text-zinc-500">model years × powertrain</p>
        </div>
      </section>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-4 text-sm font-medium">Median mileage by model year</h2>
        <MileageByYearChart data={chartData} />
      </section>

      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-left">Powertrain</th>
              <th className="px-4 py-2 text-right">Listings</th>
              <th className="px-4 py-2 text-right">Median mileage</th>
              <th className="px-4 py-2 text-right">P25 / P75</th>
              <th className="px-4 py-2 text-right">Median price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {buckets.map((b) => (
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
      </section>
    </main>
  );
}
