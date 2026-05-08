import { MileageVsAgeChart } from "@/components/mileage-vs-age-chart";
import { PageHeader } from "@/components/page-header";
import { PriceMileageChart } from "@/components/price-mileage-chart";
import { StatCard } from "@/components/stat-card";
import {
  getHighMileageVehicles,
  getMileageVsAge,
  getPriceMileagePoints,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

function StatusBadge({ a, b }: { a: string | null; b: string | null }) {
  if (a === null && b === null) return <span className="text-xs text-zinc-400">not polled</span>;
  if (a === "open" || b === "open") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        OPEN
      </span>
    );
  }
  return (
    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
      not listed
    </span>
  );
}

export default async function Mileage() {
  const [scatter, highMileage, priceMileage] = await Promise.all([
    getMileageVsAge(),
    getHighMileageVehicles(15),
    getPriceMileagePoints(),
  ]);

  // Annualised stats — the apples-to-apples view since older trucks naturally have more miles.
  const mpys = scatter
    .filter((d) => d.age_months >= 6)
    .map((d) => Math.round(d.mileage / (d.age_months / 12)));
  mpys.sort((a, b) => a - b);
  const median = mpys.length ? mpys[Math.floor(mpys.length / 2)] : null;
  const p25 = mpys.length ? mpys[Math.floor(mpys.length * 0.25)] : null;
  const p75 = mpys.length ? mpys[Math.floor(mpys.length * 0.75)] : null;
  const maxMileage = scatter.length ? Math.max(...scatter.map((d) => d.mileage)) : 0;

  // 100k-mile timeline projection from the median miles/year
  const yearsTo100k = median ? Math.round((100000 / median) * 10) / 10 : null;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Mileage"
        title="How fast do these trucks rack up miles?"
        description="Older trucks have more miles by definition, so absolute mileage numbers don't tell us much. The useful view is the rate — miles per year — and where the highest-mileage 3rd-gen Tundras on Carvana actually are. Each dot below is one V35A truck currently for sale."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Median miles/yr"
          value={median?.toLocaleString() ?? "—"}
          caption={`P25 ${p25?.toLocaleString() ?? "?"} · P75 ${p75?.toLocaleString() ?? "?"}`}
        />
        <StatCard
          label="Highest mileage on lot"
          value={maxMileage > 0 ? maxMileage.toLocaleString() : "—"}
          caption="3rd gen V35A, current Carvana inventory"
        />
        <StatCard
          label="Years to 100k miles"
          value={yearsTo100k ?? "—"}
          caption="at median rate"
        />
        <StatCard
          label="Trucks plotted"
          value={scatter.length}
          caption="V35A 2022+ with mileage observation"
        />
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-base font-medium">Price vs mileage</h2>
        <p className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Carvana asking price vs current mileage for our V35A 2022+ cohort.
          Each dot is one truck. Hybrids in teal, non-hybrids in blue. The downward
          slope shows how much price typically falls per 10k of mileage.
        </p>
        <PriceMileageChart data={priceMileage} />
      </section>

      <section className="mb-10 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-medium">Mileage vs age</h2>
        <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          Each dot is one 3rd-gen V35A truck currently on Carvana. Diagonal dashed lines
          show 10k / 15k / 20k miles-per-year trajectories — if a dot sits on the 15k line,
          that truck has been driven about 15k miles per year of its life. Dots above the
          15k line are higher-mileage outliers. Dots colored amber have at least one engine
          recall (24V381 or 25V767) currently open with Toyota.
        </p>
        <div className="mt-4">
          {scatter.length > 0 ? (
            <MileageVsAgeChart data={scatter} />
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
              No data yet — run <code className="font-mono">tundra scrape</code>.
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          The cloud is bounded by Carvana&apos;s inventory profile (mostly off-lease trucks at 25k–60k miles).
          Trucks that suffered catastrophic engine failure may have been totaled or returned to Toyota and
          aren&apos;t visible here — this is a survival-biased sample.
        </p>
      </section>

      <section className="mb-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-base font-medium">Highest-mileage 3rd gens for sale right now</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Existence proof: these trucks made it this far. Open recall = engine has not been
            replaced. Not listed = either replaced or never in the affected build.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 text-left">VIN</th>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-left">Trim</th>
              <th className="px-4 py-2 text-left">Powertrain</th>
              <th className="px-4 py-2 text-right">Mileage</th>
              <th className="px-4 py-2 text-right">Mi/yr</th>
              <th className="px-4 py-2 text-right">Price</th>
              <th className="px-4 py-2 text-center">Engine recall</th>
              <th className="px-4 py-2 text-left">Carvana</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {highMileage.map((v) => (
              <tr key={v.vin}>
                <td className="px-4 py-2 font-mono text-xs">{v.vin}</td>
                <td className="px-4 py-2 tabular-nums">{v.model_year}</td>
                <td className="px-4 py-2">{v.trim ?? "—"}</td>
                <td className="px-4 py-2 text-xs">
                  {v.is_hybrid === true
                    ? "i-FORCE MAX"
                    : v.is_hybrid === false
                    ? "non-hybrid"
                    : "?"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {v.mileage.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-500">
                  {v.miles_per_year ? `${v.miles_per_year.toLocaleString()}/yr` : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {v.asking_price_usd ? `$${v.asking_price_usd.toLocaleString()}` : "—"}
                </td>
                <td className="px-4 py-2 text-center">
                  <StatusBadge a={v.recall_24v381} b={v.recall_25v767} />
                </td>
                <td className="px-4 py-2">
                  {v.listing_url ? (
                    <a
                      href={v.listing_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                    >
                      view ↗
                    </a>
                  ) : (
                    <span className="text-zinc-400">—</span>
                  )}
                </td>
              </tr>
            ))}
            {highMileage.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-zinc-500">
                  No 3rd-gen mileage data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-medium">Reading the chart</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            <span className="font-medium">Slope of the cloud</span> tells you typical usage.
            Most trucks sit between the 10k and 20k mi/yr lines.
          </li>
          <li>
            <span className="font-medium">High dots</span> are outliers — yes, those trucks
            have done that mileage in that time, and they&apos;re still on the road. Click
            a row in the table above to view that listing on Carvana.
          </li>
          <li>
            <span className="font-medium">Amber dots</span> still have an engine recall open
            with Toyota. Green dots don&apos;t have either V35A campaign open — could mean
            the engine was replaced under recall, or the VIN was outside the affected build
            window. Toyota does not publish per-VIN eligibility, so we can&apos;t tell which.
          </li>
        </ul>
      </section>
    </main>
  );
}
