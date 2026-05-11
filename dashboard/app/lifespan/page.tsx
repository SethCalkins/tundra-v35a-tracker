import Link from "next/link";

import { ComplaintsTimelineChart } from "@/components/complaints-timeline-chart";
import { CumulativeFailureChart } from "@/components/cumulative-failure-chart";
import { FailureMileageChart } from "@/components/failure-mileage-chart";
import { FailurePhrasesChart } from "@/components/failure-phrases-chart";
import { PageHeader } from "@/components/page-header";
import { RecallRemediationChart } from "@/components/recall-remediation-chart";
import { StateDistributionChart } from "@/components/state-distribution-chart";
import { StatCard } from "@/components/stat-card";
import { TowRateChart } from "@/components/tow-rate-chart";
import {
  getCohortFailures,
  getComplaintTotals,
  getComplaintsByMonth,
  getComplaintsByState,
  getCumulativeFailureCurve,
  getEngineComplaintSamples,
  getFailureMileageHistogram,
  getEngineMfrComms,
  getInventoryWithComplaints,
  getMfrCommsTotals,
  getRecallDocuments,
  getRecallRemediation,
  getRecentUserReplacements,
  getSeverityTotals,
  getTopFailurePhrases,
  getTowRateByMileage,
  getUserReplacementMileageHistogram,
  getUserSubmissionTotals,
} from "@/lib/queries";

function decodeFailureMode(mode: string | null): string {
  if (!mode) return "—";
  return (
    {
      engine_seized: "Seized / locked",
      knocking: "Rod knock",
      metal_shavings: "Metal in oil",
      stalled_no_restart: "Stalled, no restart",
      loss_of_power: "Loss of power",
      proactive_recall: "Proactive (recall)",
      other: "Other",
    } as Record<string, string>
  )[mode] ?? mode;
}

export const dynamic = "force-dynamic";

export default async function Lifespan() {
  const [
    hist,
    totals,
    samples,
    crossref,
    timeline,
    phrases,
    byState,
    userTotals,
    userReports,
    userHist,
    severity,
    towRate,
    cohortFailures,
    failureCurve,
    remediation,
    recallDocs,
    engineTsbs,
    tsbTotals,
  ] = await Promise.all([
    getFailureMileageHistogram(),
    getComplaintTotals(),
    getEngineComplaintSamples(20),
    getInventoryWithComplaints(),
    getComplaintsByMonth(),
    getTopFailurePhrases(),
    getComplaintsByState(12),
    getUserSubmissionTotals(),
    getRecentUserReplacements(15),
    getUserReplacementMileageHistogram(),
    getSeverityTotals(),
    getTowRateByMileage(),
    getCohortFailures(),
    getCumulativeFailureCurve(),
    getRecallRemediation(),
    getRecallDocuments(),
    getEngineMfrComms(),
    getMfrCommsTotals(),
  ]);

  // 24V381 latest snapshot (newest quarter)
  const latest24 = remediation
    .filter((r) => r.recall_id === "24V381")
    .at(-1);
  const remainingUnremedied24 = latest24
    ? (latest24.involved ?? 0) -
      (latest24.total_remedied ?? 0) -
      (latest24.total_unreachable ?? 0) -
      (latest24.total_removed ?? 0)
    : null;

  const towPctOfEngine =
    severity.engine_complaints > 0
      ? Math.round((severity.total_towed / severity.engine_complaints) * 100)
      : 0;
  const firePctOfEngine =
    severity.engine_complaints > 0
      ? Math.round((severity.total_fires / severity.engine_complaints) * 100)
      : 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Lifespan"
        title="At what mileage do V35A engines fail?"
        description="Owner-filed complaints from NHTSA's public database. Each row is a real owner reporting a real problem with a 2022-2024 V35A Toyota Tundra. Complaints capture mileage at the time of failure, the affected component, and a free-text description. NHTSA publishes 11-character VIN prefixes (per DPPA), enough to bucket by year/plant/engine but not identify a specific truck."
      />

      {/* ── Recall remedy progress (NHTSA §573 quarterly filings) ──── */}
      {remediation.length > 0 && (
        <section className="mb-12 border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <header className="mb-5 border-b border-zinc-200 pb-3 dark:border-zinc-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
              Recall remedy progress
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight italic">
              How many V35A engines have actually been replaced?
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Per-quarter cumulative remedy counts from Toyota&apos;s own
              §573 §577.5 filings with NHTSA. This is the ground-truth
              denominator: of the population in scope for each recall, what
              percent have actually had the engine assembly replaced.
            </p>
          </header>

          {latest24 && (
            <dl className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="24V381 in scope"
                value={(latest24.involved ?? 0).toLocaleString()}
                caption="Toyota's involved population"
              />
              <StatCard
                label="Engines replaced"
                value={(latest24.total_remedied ?? 0).toLocaleString()}
                caption={latest24.pct_remedied !== null ? `${latest24.pct_remedied}% of in-scope` : "—"}
                emphasis="danger"
              />
              <StatCard
                label="Still unremedied"
                value={remainingUnremedied24?.toLocaleString() ?? "—"}
                caption={
                  remainingUnremedied24 !== null && latest24.involved
                    ? `${Math.round((remainingUnremedied24 / latest24.involved) * 100)}% of in-scope`
                    : "—"
                }
                emphasis="danger"
              />
              <StatCard
                label="As of"
                value={latest24.quarter}
                caption={
                  latest24.submission_date
                    ? `filed ${latest24.submission_date.slice(0, 10)}`
                    : "—"
                }
              />
            </dl>
          )}

          <RecallRemediationChart data={remediation} />

          <p className="mt-4 text-[11px] leading-5 text-zinc-500">
            Source: NHTSA FLAT_RCL_Qrtly_Rpts (production.static.nhtsa.dot.gov),
            Toyota Motor Engineering &amp; Manufacturing filings. 25V767 figures
            appear once Toyota files its first quarterly report for that
            campaign — remedy isn&apos;t available yet.
          </p>
        </section>
      )}

      {/* ── Severity ───────────────────────────────────────────────── */}
      <section className="mb-12">
        <header className="mb-6 flex items-baseline justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Severity
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            NHTSA owner complaints, MY 2022–2024
          </span>
        </header>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Engine complaints"
            value={severity.engine_complaints}
            caption="filed with NHTSA"
            emphasis="danger"
          />
          <StatCard
            label="Trucks towed"
            value={severity.total_towed}
            caption={
              severity.engine_complaints > 0
                ? `${towPctOfEngine}% of engine complaints`
                : "no data"
            }
            emphasis="danger"
          />
          <StatCard
            label="Engine fires"
            value={severity.total_fires}
            caption={firePctOfEngine > 0 ? `${firePctOfEngine}% of engine complaints` : "—"}
            emphasis={severity.total_fires > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Crashes"
            value={severity.total_crashed}
            caption={
              severity.total_injured > 0
                ? `${severity.total_injured.toLocaleString()} injured · ${severity.total_deaths} deaths`
                : "no injuries on record"
            }
          />
        </dl>
      </section>

      {/* ── Headline numbers ───────────────────────────────────────── */}
      <section className="mb-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Tundra complaints"
          value={totals.total}
          caption="all components, MY 22-24"
        />
        <StatCard
          label="Engine + mileage data"
          value={totals.engine_with_mileage}
          caption="engine complaints with miles-at-failure recorded"
        />
        <StatCard
          label="Median failure mileage"
          value={totals.median_failure_mileage ? totals.median_failure_mileage.toLocaleString() : "—"}
          caption="of engine complaints"
          emphasis="danger"
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

      {/* ── Community-reported replacements ─────────────────────────── */}
      <section className="mb-12 border-l-4 border-[#EB0A1E] bg-zinc-50 p-6 dark:bg-zinc-900/40">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
              Community reports
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight italic">
              Owners filling in what Toyota won&rsquo;t.
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              NHTSA shows complaints. Toyota shows open recalls. Neither shows whether your engine was actually replaced.
              These are direct reports from owners, with the mileage at which their V35A engine block was swapped out.
            </p>
          </div>
          <Link
            href="/submit"
            className="inline-flex items-center bg-[#EB0A1E] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#c00917]"
          >
            Add yours
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Owner reports"
            value={userTotals.total}
            caption={`${userTotals.total_verified.toLocaleString()} verified`}
          />
          <StatCard
            label="Engine replacements"
            value={userTotals.replacements}
            caption={`${userTotals.replacements_verified.toLocaleString()} verified`}
            emphasis="danger"
          />
          <StatCard
            label="Median mileage at replacement"
            value={
              userTotals.median_replacement_mileage
                ? userTotals.median_replacement_mileage.toLocaleString()
                : "—"
            }
            caption="from owner reports"
            emphasis={userTotals.median_replacement_mileage ? "warning" : "default"}
          />
          <StatCard
            label="Towed before replacement"
            value={userTotals.reports_with_tow}
            caption={
              userTotals.replacements > 0
                ? `${Math.round(
                    (userTotals.reports_with_tow / userTotals.replacements) * 100,
                  )}% of replacements`
                : "no data yet"
            }
          />
        </div>

        {userReports.length > 0 ? (
          <div className="mt-6 overflow-x-auto border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left">Reported</th>
                  <th className="px-4 py-2 text-left">VIN prefix</th>
                  <th className="px-4 py-2 text-left">Year / Powertrain</th>
                  <th className="px-4 py-2 text-right">Mileage</th>
                  <th className="px-4 py-2 text-left">Failure mode</th>
                  <th className="px-4 py-2 text-center">Towed?</th>
                  <th className="px-4 py-2 text-center">Recall?</th>
                  <th className="px-4 py-2 text-left">Verified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {userReports.map((r) => (
                  <tr key={r.id} className="align-top">
                    <td className="px-4 py-2 tabular-nums text-xs text-zinc-500">
                      {new Date(r.submitted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{r.vin_prefix}</td>
                    <td className="px-4 py-2">
                      {r.model_year ?? "?"}{" "}
                      <span className="text-xs text-zinc-500">
                        {r.is_hybrid === true
                          ? "i-FORCE MAX"
                          : r.is_hybrid === false
                            ? "i-FORCE"
                            : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-medium tabular-nums">
                      {r.replacement_mileage?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">{decodeFailureMode(r.failure_mode)}</td>
                    <td className="px-4 py-2 text-center text-xs">
                      {r.was_towed === true ? "🚚" : r.was_towed === false ? "—" : "?"}
                    </td>
                    <td className="px-4 py-2 text-center text-xs">
                      {r.under_recall === true ? r.recall_campaign ?? "yes" : r.under_recall === false ? "no" : "?"}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {r.verified ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Verified</span>
                      ) : (
                        <span className="text-zinc-500">Pending</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-6 border border-dashed border-zinc-300 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-sm font-medium">No owner reports yet — be the first.</p>
            <p className="mt-1 text-xs text-zinc-500">
              If you own a 3rd-gen Tundra, your data point matters.
            </p>
            <Link
              href="/submit"
              className="mt-4 inline-flex items-center bg-[#EB0A1E] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#c00917]"
            >
              Submit yours
            </Link>
          </div>
        )}

        {userHist.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-3 text-xs sm:grid-cols-9">
            {userHist.map((b) => {
              const max = Math.max(...userHist.map((x) => x.reports));
              const pct = max > 0 ? (b.reports / max) * 100 : 0;
              return (
                <div key={b.bucket_floor} className="flex flex-col items-center">
                  <div className="flex h-24 w-full items-end">
                    <div
                      className="w-full bg-[#EB0A1E]/80"
                      style={{ height: `${pct}%` }}
                      title={`${b.reports} report${b.reports === 1 ? "" : "s"} at ${b.bucket_label}`}
                    />
                  </div>
                  <div className="mt-1 text-center font-mono text-[10px] text-zinc-500">
                    {b.bucket_label}
                  </div>
                  <div className="text-center text-[11px] font-bold tabular-nums">
                    {b.reports}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-500">
          Submissions are reviewed before counting toward the &ldquo;verified&rdquo; column. Aggregated stats above include all non-spam reports.
        </p>
      </section>

      {/* Failure mileage histogram + cumulative curve side by side */}
      <section className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          eyebrow="Mileage at failure"
          title="When does the V35A break?"
          description="Engine-component complaints in light red. &ldquo;Stall&rdquo; mentions in Toyota Red — the canonical failure mode. Many owners file without entering mileage, so this undercounts the true failure curve."
        >
          <FailureMileageChart data={hist} />
        </ChartCard>
        <ChartCard
          eyebrow="Cumulative"
          title="By what mileage have most failures occurred?"
          description="Bars show per-bucket failure count. The red overlay is the cumulative percentage — the mileage at which 50%, 75%, 90% of reported failures had already happened."
        >
          <CumulativeFailureChart data={failureCurve} />
        </ChartCard>
      </section>

      {/* Tow rate */}
      <section className="mb-12">
        <ChartCard
          eyebrow="Catastrophic vs gradual"
          title="What share of failures left the truck on a flatbed?"
          description="When V35A failures happen, this is how often they're catastrophic enough to require towing. A high tow rate means owners aren't getting warnings — they're getting stranded."
        >
          <TowRateChart data={towRate} />
        </ChartCard>
      </section>

      <section className="mb-12 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard
          eyebrow="Timeline"
          title="Complaints over time."
          description="Monthly NHTSA volume for 2022–2024 Tundra. Engine complaints in light red, towed cases in deep Toyota Red."
        >
          <ComplaintsTimelineChart data={timeline} />
        </ChartCard>
        <ChartCard
          eyebrow="Geography"
          title="Where are owners reporting?"
          description="Top states by engine-complaint volume. Reflects where 3rd-gen Tundras are most concentrated, not just where they fail most."
        >
          <StateDistributionChart data={byState} />
        </ChartCard>
      </section>

      <section className="mb-12">
        <ChartCard
          eyebrow="Owner narratives"
          title="What owners actually say."
          description="Phrase frequency in engine-component complaint narratives. &ldquo;Stalled&rdquo; and &ldquo;towed&rdquo; cluster the catastrophic failure mode; &ldquo;main bearing&rdquo; is the mechanical cause Toyota called out in the recall."
        >
          <FailurePhrasesChart data={phrases} />
        </ChartCard>
      </section>

      {/* Cohort comparison table */}
      <section className="mb-12 overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
            Impact by year
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight italic">
            How does each model year stack up?
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            Year-by-year comparison of trucks we&rsquo;ve seen in inventory versus engine
            complaints filed with NHTSA. NHTSA only publishes 11-char VIN prefixes, so
            complaints are grouped by model year, not matched to specific VINs.
          </p>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-left">Powertrain</th>
              <th className="px-4 py-2 text-right">Inventory tracked</th>
              <th className="px-4 py-2 text-right">Engine complaints</th>
              <th className="px-4 py-2 text-right">Towed cases</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {cohortFailures.map((r, i) => (
              <tr key={i}>
                <td className="px-4 py-2 tabular-nums">{r.year}</td>
                <td className="px-4 py-2">
                  {r.hybrid === true ? "i-FORCE MAX" : r.hybrid === false ? "i-FORCE" : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.carvana_count}</td>
                <td className="px-4 py-2 text-right font-bold tabular-nums text-[#EB0A1E]">
                  {r.engine_complaint_count}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-[#c00917]">
                  {r.with_tow}
                </td>
              </tr>
            ))}
            {cohortFailures.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-12 overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
            Outliers
          </p>
          <h2 className="mt-2 text-xl font-bold tracking-tight italic">
            Highest-mileage engine failures reported.
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            The trucks whose engines failed at the highest mileages on record. The shape
            of the tail tells you how late the failure curve extends.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
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
                  <td className="px-4 py-2 text-right font-bold tabular-nums text-[#EB0A1E]">
                    {s.miles_at_failure?.toLocaleString() ?? "?"}
                  </td>
                  <td className="px-4 py-2 tabular-nums text-zinc-500">{s.fail_date ?? "—"}</td>
                  <td className="px-4 py-2">{s.state ?? "—"}</td>
                  <td className="px-4 py-2 text-center">
                    {s.vehicle_towed === true ? "Yes" : s.vehicle_towed === false ? "—" : "?"}
                  </td>
                  <td className="px-4 py-2 text-xs leading-5 text-zinc-700 dark:text-zinc-300">
                    {(s.description ?? "").slice(0, 240)}
                    {(s.description?.length ?? 0) > 240 ? "…" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {crossref.length > 0 && (
        <section className="mb-12 overflow-hidden border-l-4 border-[#EB0A1E] bg-zinc-50 dark:bg-zinc-900/40">
          <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
              Same year &amp; engine match
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight italic">
              Inventory trucks from problem years.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              Inventory whose 11-char VIN prefix matches at least one NHTSA
              complaint. NHTSA only publishes the 11-char prefix, so this isn&rsquo;t a
              same-truck match — it means &ldquo;same year × plant × engine config has had
              complaints filed.&rdquo;
            </p>
          </header>
          <div className="overflow-x-auto bg-white dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:bg-zinc-900">
                <tr>
                  <th className="px-4 py-2 text-left">VIN</th>
                  <th className="px-4 py-2 text-left">Prefix</th>
                  <th className="px-4 py-2 text-left">Year</th>
                  <th className="px-4 py-2 text-left">Powertrain</th>
                  <th className="px-4 py-2 text-left">Trim</th>
                  <th className="px-4 py-2 text-right">Engine complaints (same year &amp; engine)</th>
                  <th className="px-4 py-2 text-right">Total complaints (same year &amp; engine)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {crossref.slice(0, 30).map((r) => (
                  <tr key={r.vin}>
                    <td className="px-4 py-2 font-mono text-xs">{r.vin}</td>
                    <td className="px-4 py-2 font-mono text-xs">{r.vin_prefix}</td>
                    <td className="px-4 py-2 tabular-nums">{r.model_year}</td>
                    <td className="px-4 py-2">{r.is_hybrid ? "i-FORCE MAX" : "non-hybrid"}</td>
                    <td className="px-4 py-2">{r.trim ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-[#EB0A1E]">
                      {r.engine_complaints_for_prefix}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                      {r.complaints_for_prefix}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Toyota's filings, in their own words ─────────────────── */}
      {recallDocs.length > 0 && (
        <section className="mb-12 overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
              Toyota&rsquo;s filings, in their own words
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight italic">
              What Toyota told NHTSA.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
              Every public §573 document Toyota filed for these recalls.
              Each card shows the most defect-relevant passage extracted
              from the PDF; click through to read the original filing.
            </p>
          </header>
          <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {recallDocs.map((d) => (
              <li key={d.id} className="px-6 py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-bold tracking-tight text-[#EB0A1E]">
                    {d.recall_id}
                  </span>
                  <span className="text-sm font-semibold">{d.title}</span>
                  <span className="border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
                    {d.doc_type.replace(/_/g, " ")}
                  </span>
                  {d.submission_date && (
                    <span className="text-xs text-zinc-500">
                      filed {d.submission_date.slice(0, 10)}
                    </span>
                  )}
                  {d.page_count && (
                    <span className="text-xs text-zinc-500">{d.page_count} pp</span>
                  )}
                </div>
                <p className="mt-3 border-l-2 border-zinc-300 bg-zinc-50 p-3 text-xs italic leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                  {d.excerpt || "No defect-related text extracted."}
                </p>
                {d.source_url && (
                  <a
                    href={d.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-semibold text-[#EB0A1E] hover:underline"
                  >
                    Read the full filing on nhtsa.gov →
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Pre-recall TSB trail ───────────────────────────────────── */}
      {engineTsbs.length > 0 && (
        <section className="mb-12 overflow-hidden border-l-4 border-[#EB0A1E] bg-zinc-50 dark:bg-zinc-900/40">
          <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
              Pre-recall service bulletins
            </p>
            <h2 className="mt-2 text-xl font-bold tracking-tight italic">
              Toyota told dealers to swap engines before NHTSA filed a recall.
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              Of <span className="font-bold tabular-nums">{tsbTotals.total}</span> Tundra
              Manufacturer Communications filed with NHTSA for MY 2022+,
              {" "}
              <span className="font-bold tabular-nums text-[#EB0A1E]">
                {tsbTotals.engine_keyword}
              </span>
              {" "}
              explicitly reference V35A engine block, main bearing, or
              short-block repair work — internal dealer guidance that
              predates the 24V381 recall announcement.
            </p>
          </header>
          <ul className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
            {engineTsbs.map((t) => (
              <li key={t.nhtsa_id} className="px-6 py-5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs font-bold tracking-tight text-[#EB0A1E]">
                    NHTSA #{t.nhtsa_id}
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    MY {t.model_years}
                  </span>
                </div>
                {t.summary && (
                  <p className="mt-3 border-l-2 border-zinc-300 bg-zinc-50 p-3 text-xs italic leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                    {t.summary.length > 600 ? t.summary.slice(0, 600) + " …" : t.summary}
                  </p>
                )}
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-[#EB0A1E] hover:underline"
                >
                  View on nhtsa.gov →
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="border-l-4 border-zinc-300 bg-zinc-50 p-6 text-sm leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
          Methodology
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight italic text-zinc-900 dark:text-zinc-100">
          How to read this data.
        </h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            NHTSA only publishes the first 11 characters of each VIN. That&rsquo;s enough
            to identify model year + plant + engine config, not a specific truck.
          </li>
          <li>
            Many complaints are filed before mileage is recorded — total complaint count
            is much higher than the &ldquo;with mileage&rdquo; subset shown in the
            histogram.
          </li>
          <li>
            This is a self-selected sample: owners who hit a problem AND chose to file
            with NHTSA. Field reliability data this is not. But the shape of the
            failure-mileage distribution is meaningful — it&rsquo;s the only free public
            signal of when V35A engines actually fail. The community-reported section
            above adds direct owner accounts of replacements with mileage attached.
          </li>
          <li>
            The match table pairs inventory VINs to complaint groups that share the
            same 11-char prefix. A high count there doesn&rsquo;t mean{" "}
            <em>that specific truck</em>{" "}has had problems; it means trucks of{" "}
            <em>that exact configuration</em>{" "}have had problems reported.
          </li>
        </ul>
      </section>
    </main>
  );
}

function ChartCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <article className="border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="mb-5 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight italic">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      </header>
      {children}
    </article>
  );
}
