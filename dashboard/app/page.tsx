import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import {
  getComplaintTotals,
  getOverviewCounts,
  getRecallBreakdown,
  getYearMileageBuckets,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [counts, recallBreakdown, mileageByYear, complaintTotals] = await Promise.all([
    getOverviewCounts(),
    getRecallBreakdown(),
    getYearMileageBuckets(),
    getComplaintTotals(),
  ]);

  const polled24v381 = recallBreakdown.filter((r) => r.recall_id === "24V381");
  const polled25v767 = recallBreakdown.filter((r) => r.recall_id === "25V767");
  const totalPolled24 = polled24v381.reduce((s, r) => s + r.count, 0);
  const totalPolled25 = polled25v767.reduce((s, r) => s + r.count, 0);
  const open24 = polled24v381.find((r) => r.status === "open")?.count ?? 0;
  const open25 = polled25v767.find((r) => r.status === "open")?.count ?? 0;
  const pct = (n: number, d: number) =>
    d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;

  const cohort = mileageByYear.filter(
    (b) => b.model_year >= 2022 && b.model_year <= 2024,
  );
  const cohortCount = cohort.reduce((s, b) => s + b.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <section className="mb-14">
        <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
          Live data — refreshed nightly
        </p>
        <h1 className="mt-3 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-900 bg-clip-text text-transparent dark:from-zinc-50 dark:via-zinc-200 dark:to-zinc-50">
            How are 3rd-gen Tundras
          </span>{" "}
          <br className="hidden sm:block" />
          <span className="bg-gradient-to-r from-amber-500 to-orange-600 bg-clip-text text-transparent">
            actually holding up?
          </span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
          Independent tracker for the V35A engine recalls (
          <span className="font-mono text-zinc-900 dark:text-zinc-200">24V381</span>{" "}
          and{" "}
          <span className="font-mono text-zinc-900 dark:text-zinc-200">25V767</span>
          ). We scrape Carvana&apos;s 2022+ Tundra inventory, poll Toyota&apos;s
          recall lookup, pull free Carfax previews, and ingest NHTSA owner-filed
          complaints — then surface the patterns honestly.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/failures"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Engine recall status
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/lifespan"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            When do they fail?
          </Link>
        </div>
      </section>

      {/* Public appeal */}
      <section className="mb-14 overflow-hidden rounded-3xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 via-orange-50 to-white p-8 shadow-sm sm:p-10 dark:border-amber-900/50 dark:from-amber-950/30 dark:via-orange-950/30 dark:to-zinc-900">
        <div className="flex items-start gap-4">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md sm:flex">
            <svg viewBox="0 0 24 24" fill="none" className="h-7 w-7" aria-hidden>
              <path
                d="M12 9v4M12 17h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              An open ask of Toyota Motor North America
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Extend the V35A engine warranty to 100,000 miles.
            </h2>
            <p className="mt-4 text-base leading-7 text-zinc-700 dark:text-zinc-300">
              Toyota built its reputation on engines that last 200k+ miles. The
              V35A in 3rd-gen Tundras isn&apos;t living up to that. The recall
              data and owner complaints are clear — and the current{" "}
              <span className="font-medium">5-year / 60,000-mile powertrain warranty</span>{" "}
              isn&apos;t enough for owners caught in the gap.
            </p>

            <ul className="mt-5 space-y-2.5 text-sm text-zinc-700 dark:text-zinc-300">
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                <span>
                  Median V35A engine-failure mileage in NHTSA owner complaints is{" "}
                  <span className="font-semibold tabular-nums">
                    {complaintTotals.median_failure_mileage?.toLocaleString() ?? "~34,000"} miles
                  </span>
                  —some failures reported as early as a few thousand miles, and as
                  late as{" "}
                  <span className="font-semibold tabular-nums">
                    {complaintTotals.latest_failure?.toLocaleString() ?? "89,000"} miles
                  </span>
                  .
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                <span>
                  <span className="font-semibold tabular-nums">{complaintTotals.engine_with_mileage}</span>{" "}
                  owner complaints in the 2022–2024 cohort cite engine-component
                  problems with mileage data attached. Many more were filed
                  without mileage. This is a self-selected sample of an unknown
                  larger field.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                <span>
                  Recall <span className="font-mono">25V767</span>&apos;s remedy
                  isn&apos;t scheduled to be available until July or August 2026
                  per Toyota&apos;s own §573 filing. Owners with affected VINs
                  have been told their engines may fail and there is no fix yet.
                </span>
              </li>
              <li className="flex gap-3">
                <span aria-hidden className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-600" />
                <span>
                  Trucks at 65k–80k miles that were never in either recall&apos;s
                  build window have <em>no</em> recourse if their V35A fails — the
                  factory powertrain warranty has already expired and the recall
                  doesn&apos;t cover them.
                </span>
              </li>
            </ul>

            <div className="mt-6 rounded-xl bg-white/70 p-5 ring-1 ring-amber-200/60 backdrop-blur dark:bg-zinc-950/40 dark:ring-amber-900/30">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                The ask: extend the V35A engine warranty to 10 years / 100,000
                miles, retroactive to all 3rd-gen Tundra and Lexus LX/GX owners.
              </p>
              <p className="mt-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                Toyota already extends warranties on hybrid components to 10/150k.
                A V35A-specific extension to 100k would cost a fraction of the
                replacements Toyota is already performing under recall, restore
                trust with the owner base, and match what Toyota&apos;s own
                reputation is built on. It would cover the right tail of the
                failure distribution that the recalls don&apos;t reach.
              </p>
            </div>

            <p className="mt-5 text-xs text-zinc-500">
              This is an independent owner&apos;s appeal based on public NHTSA
              data and Carvana inventory analysis. Not affiliated with Toyota,
              Lexus, or Carvana. If you&apos;re a 3rd-gen Tundra owner and want
              to add your voice, file a complaint with NHTSA at{" "}
              <a
                href="https://www.nhtsa.gov/report-a-safety-problem"
                className="font-medium text-amber-700 underline hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-300"
              >
                nhtsa.gov/report-a-safety-problem
              </a>
              {" "}or contact Toyota directly at 1-800-331-4331.
            </p>
          </div>
        </div>
      </section>

      {/* Population KPIs */}
      <section className="mb-12">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Population
        </h2>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Vehicles tracked" value={counts.vehicles} caption="all 2022+ Tundras seen on Carvana" />
          <StatCard
            label="V35A 2022-2024"
            value={counts.recall_eligible}
            caption="recall-eligible cohort"
            emphasis="warning"
          />
          <StatCard
            label="i-FORCE MAX (hybrid)"
            value={counts.v35a_hybrid}
            caption={`${counts.v35a_nonhybrid.toLocaleString()} non-hybrid in cohort`}
          />
          <StatCard
            label="Median mileage"
            value={counts.median_mileage_3rdgen?.toLocaleString() ?? "—"}
            caption="latest observation per VIN"
          />
        </dl>
      </section>

      {/* Recall callouts */}
      <section className="mb-12">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Engine recall status
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RecallCard
            id="24V381"
            campaign="Toyota 24TA07"
            status="remedy ACTIVE"
            statusTone="emerald"
            description="2022–2023 Tundra. Dealers replace the engine assembly free of charge. Active since Dec 2024."
            open={open24}
            polled={totalPolled24}
            pct={pct(open24, totalPolled24)}
          />
          <RecallCard
            id="25V767"
            campaign="Toyota 25TA14"
            status="remedy UNDER DEV (~Aug 2026)"
            statusTone="amber"
            description="Expansion of 24V381 covering 2022–2024 Tundra + Lexus LX/GX. Most eligible VINs still appear open because Toyota's final remedy isn't available yet."
            open={open25}
            polled={totalPolled25}
            pct={pct(open25, totalPolled25)}
          />
        </div>
      </section>

      {/* Cohort table */}
      <section>
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">
          Cohort snapshot
        </h2>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/40">
              <tr>
                <th className="px-5 py-3 text-left">Year</th>
                <th className="px-5 py-3 text-left">Powertrain</th>
                <th className="px-5 py-3 text-right">Count</th>
                <th className="px-5 py-3 text-right">Median mileage</th>
                <th className="px-5 py-3 text-right">P25 / P75</th>
                <th className="px-5 py-3 text-right">Median price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {mileageByYear.map((b) => (
                <tr
                  key={`${b.model_year}-${b.is_hybrid}`}
                  className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30"
                >
                  <td className="px-5 py-3 tabular-nums">{b.model_year}</td>
                  <td className="px-5 py-3">
                    {b.is_hybrid === true ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                        i-FORCE MAX
                      </span>
                    ) : b.is_hybrid === false ? (
                      <span className="text-zinc-600 dark:text-zinc-400">non-hybrid</span>
                    ) : (
                      <span className="text-zinc-400">?</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">{b.count}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {b.median_mileage?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-zinc-500">
                    {b.p25_mileage && b.p75_mileage
                      ? `${b.p25_mileage.toLocaleString()} / ${b.p75_mileage.toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
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

interface RecallCardProps {
  id: string;
  campaign: string;
  status: string;
  statusTone: "emerald" | "amber";
  description: string;
  open: number;
  polled: number;
  pct: string;
}

function RecallCard({ id, campaign, status, statusTone, description, open, polled, pct }: RecallCardProps) {
  const toneClass = statusTone === "emerald"
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm transition-shadow hover:shadow-lg dark:border-zinc-800/80 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-base font-semibold tracking-tight">{id}</h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{campaign}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>{status}</span>
      </div>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">{description}</p>
      <div className="mt-5 flex items-end gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
            {open}
          </p>
        </div>
        <div className="text-zinc-300 dark:text-zinc-700">/</div>
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">Polled</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{polled}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums">{pct}</p>
        </div>
      </div>
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gradient-to-br from-amber-200/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100 dark:from-amber-500/10" />
    </div>
  );
}
