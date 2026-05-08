import { FailureMileageChart } from "@/components/failure-mileage-chart";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  getComplaintTotals,
  getEngineComplaintSamples,
  getFailureMileageHistogram,
  getInventoryWithComplaints,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Lifespan() {
  const [hist, totals, samples, crossref] = await Promise.all([
    getFailureMileageHistogram(),
    getComplaintTotals(),
    getEngineComplaintSamples(20),
    getInventoryWithComplaints(),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Lifespan"
        title="At what mileage do V35A engines fail?"
        description="Owner-filed complaints from NHTSA's public database. Each row is a real owner reporting a real problem with a 2022-2024 V35A Toyota Tundra. Complaints capture mileage at the time of failure, the affected component, and a free-text description. NHTSA publishes 11-character VIN prefixes (per DPPA), enough to bucket by year/plant/engine but not identify a specific truck."
      />

      <section className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Tundra complaints (MY 22-24)"
          value={totals.total}
          caption="all components"
        />
        <StatCard
          label="Engine + mileage data"
          value={totals.engine_with_mileage}
          caption="engine-component complaints with miles-at-failure recorded"
        />
        <StatCard
          label="Median failure mileage"
          value={totals.median_failure_mileage ? totals.median_failure_mileage.toLocaleString() : "—"}
          caption="of engine complaints"
          emphasis="warning"
        />
        <StatCard
          label="Range"
          value={
            totals.earliest_failure && totals.latest_failure
              ? `${totals.earliest_failure.toLocaleString()} – ${totals.latest_failure.toLocaleString()}`
              : "—"
          }
          caption="earliest – latest"
        />
      </section>

      <section className="mb-10 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="mb-1 text-base font-medium">Complaints by mileage bucket</h2>
        <p className="mb-4 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">
          The amber bars (engine-component complaints) are the V35A failure signal.
          Red bars track narratives mentioning &quot;stall&quot; — the canonical V35A
          failure mode. Note this is an undercount of failures: many owners file
          complaints without entering mileage, and not all V35A failures get reported
          to NHTSA at all.
        </p>
        <FailureMileageChart data={hist} />
      </section>

      <section className="mb-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <h2 className="text-base font-medium">Highest-mileage engine failures reported</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            These are the trucks whose engines failed at the highest mileages on
            record. The shape of the cloud lets you see how late the failure curve
            extends.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 text-left">VIN prefix</th>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-right">Mileage at failure</th>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">State</th>
              <th className="px-4 py-2 text-center">Towed?</th>
              <th className="px-4 py-2 text-left">Owner narrative (truncated)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {samples.map((s) => (
              <tr key={s.cmplid} className="align-top">
                <td className="px-4 py-2 font-mono text-xs">{s.vin_prefix ?? "—"}</td>
                <td className="px-4 py-2 tabular-nums">{s.model_year ?? "?"}</td>
                <td className="px-4 py-2 text-right tabular-nums font-medium">
                  {s.miles_at_failure?.toLocaleString() ?? "?"}
                </td>
                <td className="px-4 py-2 tabular-nums text-zinc-500">{s.fail_date ?? "—"}</td>
                <td className="px-4 py-2">{s.state ?? "—"}</td>
                <td className="px-4 py-2 text-center">
                  {s.vehicle_towed === true ? "🚚" : s.vehicle_towed === false ? "—" : "?"}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-700 dark:text-zinc-300">
                  {(s.description ?? "").slice(0, 240)}{(s.description?.length ?? 0) > 240 ? "…" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {crossref.length > 0 && (
        <section className="mb-10 overflow-hidden rounded-lg border border-amber-300 bg-amber-50 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <div className="border-b border-amber-300 px-5 py-3 dark:border-amber-900/40">
            <h2 className="text-base font-medium">Carvana inventory with matching complaint VIN prefix</h2>
            <p className="mt-1 text-sm">
              Carvana trucks whose 11-char VIN prefix matches at least one NHTSA
              complaint. NHTSA only publishes the 11-char prefix so this isn&apos;t a
              same-truck match — it means &quot;same year × plant × engine config has
              had complaints filed.&quot; Higher engine-complaint counts = noisier
              cohort.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-amber-100 text-xs uppercase tracking-wider text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
              <tr>
                <th className="px-4 py-2 text-left">VIN</th>
                <th className="px-4 py-2 text-left">Prefix</th>
                <th className="px-4 py-2 text-left">Year</th>
                <th className="px-4 py-2 text-left">Powertrain</th>
                <th className="px-4 py-2 text-left">Trim</th>
                <th className="px-4 py-2 text-right">Engine complaints (cohort)</th>
                <th className="px-4 py-2 text-right">Total complaints (cohort)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200 dark:divide-amber-900/30">
              {crossref.slice(0, 30).map((r) => (
                <tr key={r.vin}>
                  <td className="px-4 py-2 font-mono text-xs">{r.vin}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.vin_prefix}</td>
                  <td className="px-4 py-2 tabular-nums">{r.model_year}</td>
                  <td className="px-4 py-2">{r.is_hybrid ? "i-FORCE MAX" : "non-hybrid"}</td>
                  <td className="px-4 py-2">{r.trim ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">
                    {r.engine_complaints_for_prefix}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                    {r.complaints_for_prefix}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">How to read this</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            NHTSA only publishes the first 11 characters of each VIN. That&apos;s
            enough to identify model year + plant + engine config, not a specific truck.
          </li>
          <li>
            Many complaints are filed before mileage is recorded — total complaint
            count is much higher than the &quot;with mileage&quot; subset shown in
            the histogram.
          </li>
          <li>
            This is a self-selected sample: owners who hit a problem AND chose to
            file with NHTSA. Field reliability data this is not. But the shape of
            the failure-mileage distribution is meaningful — it&apos;s the only
            free public signal of when V35A engines actually fail.
          </li>
          <li>
            The cross-reference table above pairs Carvana VINs to complaint cohorts
            that share the same 11-char prefix. A high count there doesn&apos;t mean
            <em> that specific truck</em> has had problems; it means trucks of
            <em> that exact configuration</em> have had problems reported.
          </li>
        </ul>
      </section>
    </main>
  );
}
