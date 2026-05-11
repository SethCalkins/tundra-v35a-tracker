import Link from "next/link";

import { StatCard } from "@/components/stat-card";
import {
  getComplaintTotals,
  getOverviewCounts,
  getRecallBreakdown,
  getYearMileageBuckets,
  getSeverityTotals,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const [counts, recallBreakdown, mileageByYear, complaintTotals, severity] = await Promise.all([
    getOverviewCounts(),
    getRecallBreakdown(),
    getYearMileageBuckets(),
    getComplaintTotals(),
    getSeverityTotals(),
  ]);

  const polled24v381 = recallBreakdown.filter((r) => r.recall_id === "24V381");
  const polled25v767 = recallBreakdown.filter((r) => r.recall_id === "25V767");
  const totalPolled24 = polled24v381.reduce((s, r) => s + r.count, 0);
  const totalPolled25 = polled25v767.reduce((s, r) => s + r.count, 0);
  const open24 = polled24v381.find((r) => r.status === "open")?.count ?? 0;
  const open25 = polled25v767.find((r) => r.status === "open")?.count ?? 0;
  const pct = (n: number, d: number) =>
    d === 0 ? "—" : `${Math.round((n / d) * 100)}%`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      {/* Hero */}
      <section className="mb-16">
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#EB0A1E]">
          The data Toyota isn&apos;t showing you
        </p>
        <h1 className="mt-4 max-w-4xl text-5xl font-bold tracking-tight sm:text-7xl">
          <span className="italic">How reliable</span>
          <br className="hidden sm:block" />
          <span> are 3rd-gen Tundras, </span>
          <span className="italic text-[#EB0A1E]">really?</span>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-zinc-700 dark:text-zinc-300">
          Independent reliability tracker for the Toyota Tundra V35A engine
          recalls (
          <span className="font-mono font-semibold">24V381</span> and{" "}
          <span className="font-mono font-semibold">25V767</span>
          ). NHTSA complaint data, third-party inventory analysis, and Toyota recall
          status — surfaced honestly, with no marketing department in the loop.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/lifespan"
            className="inline-flex items-center gap-2 bg-[#EB0A1E] px-6 py-3 text-sm font-semibold uppercase tracking-wider text-white transition-colors hover:bg-[#c40818]"
          >
            See the failure data
            <span aria-hidden>→</span>
          </Link>
          <Link
            href="/failures"
            className="inline-flex items-center gap-2 border-2 border-zinc-900 bg-white px-6 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-900 transition-colors hover:bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            Recall status
          </Link>
          <Link
            href="/submit"
            className="inline-flex items-center gap-2 border-2 border-[#EB0A1E] bg-white px-6 py-3 text-sm font-semibold uppercase tracking-wider text-[#EB0A1E] transition-colors hover:bg-[#EB0A1E] hover:text-white dark:bg-zinc-950"
          >
            Report your engine
            <span aria-hidden>+</span>
          </Link>
        </div>
        <p className="mt-4 max-w-xl text-xs leading-5 text-zinc-500">
          Own a 3rd-gen Tundra? Add your VIN, mileage, and (if applicable) when your engine was
          replaced. Owner reports are how we close the gap that Toyota and Carfax leave.
        </p>
      </section>

      {/* The numbers */}
      <section className="mb-16">
        <div className="mb-6 flex items-baseline justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            The numbers
          </h2>
          <span className="text-[11px] uppercase tracking-wider text-zinc-400">
            refreshed nightly
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Owner complaints"
            value={complaintTotals.total}
            caption="filed with NHTSA, MY 2022–2024"
            emphasis="danger"
          />
          <StatCard
            label="Median failure mileage"
            value={complaintTotals.median_failure_mileage?.toLocaleString() ?? "—"}
            caption="of engine-component complaints"
            emphasis="danger"
          />
          <StatCard
            label="Trucks towed"
            value={severity.total_towed}
            caption="catastrophic engine failures"
          />
          <StatCard
            label="V35A trucks tracked"
            value={counts.recall_eligible}
            caption="2022-2024 V35A inventory tracked"
          />
        </dl>
      </section>

      {/* Public appeal */}
      <section className="mb-16">
        <div className="border-l-[6px] border-[#EB0A1E] bg-zinc-50 p-8 sm:p-10 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#EB0A1E]">
            An open ask of Toyota Motor North America
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight italic sm:text-4xl">
            Extend the V35A engine warranty to 100,000 miles
            <span className="text-[#EB0A1E]">.</span>
          </h2>
          <p className="mt-2 text-lg font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
            Both i-FORCE and i-FORCE MAX. Same engine, same defect, same risk.
          </p>

          <p className="mt-6 max-w-3xl text-base leading-7 text-zinc-700 dark:text-zinc-300">
            Toyota built its reputation on engines that last 200k+ miles. The V35A
            in 3rd-gen Tundras isn&apos;t living up to that. The recall data and
            owner complaints are clear — and the current{" "}
            <strong>5-year / 60,000-mile powertrain warranty</strong>{" "}isn&apos;t
            enough for owners caught in the gap.
          </p>

          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                What the data shows
              </h3>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Median V35A failure mileage:{" "}
                    <span className="font-bold tabular-nums">
                      {complaintTotals.median_failure_mileage?.toLocaleString() ?? "~34,000"} miles
                    </span>
                    . Range from a few thousand miles to{" "}
                    <span className="font-bold tabular-nums">
                      {complaintTotals.latest_failure?.toLocaleString() ?? "89,000"} miles
                    </span>
                    .
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    <span className="font-bold tabular-nums">
                      {severity.total_towed}
                    </span>{" "}
                    of these failures required the truck to be towed — catastrophic
                    on-road events.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Recall <span className="font-mono font-bold">25V767</span>&apos;s
                    remedy isn&apos;t scheduled until ~Aug 2026 per Toyota&apos;s own
                    §573 filing. Owners with affected VINs are told their engines
                    may fail and there is no fix yet.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Trucks at 65k–80k miles outside both recalls have <em>no</em>{" "}
                    recourse if their V35A fails. Powertrain warranty has expired,
                    recall doesn&apos;t cover them.
                  </span>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Why hybrids must be included
              </h3>
              <ul className="mt-3 space-y-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    The <strong>i-FORCE MAX uses the same V35A-FTS block</strong>{" "}as
                    the non-hybrid i-FORCE. The defect is in the engine&apos;s main
                    bearings — present regardless of powertrain.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Recall <span className="font-mono font-bold">25V767</span>{" "}
                    explicitly includes hybrid Tundras. Toyota has already
                    acknowledged the engine risk applies equally.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Toyota&apos;s 10-year / 150,000-mile hybrid warranty covers the
                    1TM electric drive motor and battery — <strong>not</strong>{" "}the
                    V35A engine block. Hybrid owners get the same 5/60 powertrain
                    coverage as everyone else, while paying a premium for the
                    hybrid system.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden className="mt-2 h-1 w-3 shrink-0 bg-[#EB0A1E]" />
                  <span>
                    Excluding hybrids from any extension would leave i-FORCE MAX
                    owners — who paid more for their truck — with weaker engine
                    coverage than gas-only buyers. That cannot be the policy.
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-2 border-[#EB0A1E] bg-white p-6 dark:bg-zinc-950">
            <p className="text-sm font-bold uppercase tracking-wider text-[#EB0A1E]">
              The ask
            </p>
            <p className="mt-2 text-base font-semibold leading-7 text-zinc-900 dark:text-zinc-100">
              Extend the V35A engine block warranty to 10 years / 100,000 miles for{" "}
              <em>every 3rd-gen Tundra and Lexus LX/GX</em>{" "}— i-FORCE and i-FORCE
              MAX, retroactive to all affected owners regardless of recall scope.
            </p>
            <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
              The cost of an extension is a fraction of the engine swaps Toyota is
              already performing under recall. The reputational return — restoring
              the &quot;Toyotas last forever&quot; promise that the brand was built
              on — is enormous. The right tail of the failure curve runs past 60k
              miles. Cover it.
            </p>
          </div>

          <p className="mt-6 text-xs leading-5 text-zinc-500">
            This is an independent owner&apos;s appeal based on public NHTSA data
            and third-party inventory analysis. Not affiliated with Toyota or
            Lexus. If you&apos;re a 3rd-gen Tundra owner and want to add your
            voice, file a complaint with NHTSA at{" "}
            <a
              href="https://www.nhtsa.gov/report-a-safety-problem"
              className="font-medium text-[#EB0A1E] underline-offset-2 hover:underline"
            >
              nhtsa.gov/report-a-safety-problem
            </a>{" "}
            or call Toyota at <strong>1-800-331-4331</strong>.
          </p>
        </div>
      </section>

      {/* Recall status callouts */}
      <section className="mb-16">
        <div className="mb-6 flex items-baseline justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Recall status
          </h2>
          <Link href="/failures" className="text-xs font-medium text-[#EB0A1E] hover:underline">
            View detail →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RecallCard
            id="24V381"
            campaign="Toyota 24TA07"
            statusLabel="REMEDY ACTIVE"
            statusTone="ok"
            description="2022–2023 Tundra & LX600 with V35A. Dealers replace the engine assembly free of charge. Active since Dec 2024."
            open={open24}
            polled={totalPolled24}
            pct={pct(open24, totalPolled24)}
          />
          <RecallCard
            id="25V767"
            campaign="Toyota 25TA14"
            statusLabel="REMEDY UNDER DEV"
            statusTone="warn"
            description="Expansion: 2022–2024 Tundra (incl. hybrid) + Lexus LX & GX. Final remedy not available until ~Aug 2026."
            open={open25}
            polled={totalPolled25}
            pct={pct(open25, totalPolled25)}
          />
        </div>
      </section>

      {/* Cohort table */}
      <section>
        <h2 className="mb-6 border-b border-zinc-200 pb-3 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500 dark:border-zinc-800">
          Snapshot by year &amp; engine
        </h2>
        <div className="overflow-hidden border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 text-[11px] uppercase tracking-wider text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              <tr>
                <th className="px-5 py-3 text-left">Year</th>
                <th className="px-5 py-3 text-left">Powertrain</th>
                <th className="px-5 py-3 text-right">Trucks</th>
                <th className="px-5 py-3 text-right">Median mileage</th>
                <th className="px-5 py-3 text-right">P25 / P75</th>
                <th className="px-5 py-3 text-right">Median price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {mileageByYear.map((b) => (
                <tr key={`${b.model_year}-${b.is_hybrid}`} className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/40">
                  <td className="px-5 py-3 font-medium tabular-nums">{b.model_year}</td>
                  <td className="px-5 py-3">
                    {b.is_hybrid === true ? (
                      <span className="text-zinc-700 dark:text-zinc-300">i-FORCE MAX</span>
                    ) : b.is_hybrid === false ? (
                      <span className="text-zinc-600 dark:text-zinc-400">non-hybrid</span>
                    ) : (
                      <span className="text-zinc-400">?</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">{b.count}</td>
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
  statusLabel: string;
  statusTone: "ok" | "warn";
  description: string;
  open: number;
  polled: number;
  pct: string;
}

function RecallCard({ id, campaign, statusLabel, statusTone, description, open, polled, pct }: RecallCardProps) {
  const toneClass = statusTone === "ok"
    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
    : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return (
    <div className="border border-zinc-200 bg-white p-6 transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-mono text-base font-bold tracking-tight">{id}</h3>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">{campaign}</p>
        </div>
        <span className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${toneClass}`}>
          {statusLabel}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">{description}</p>
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-zinc-200 pt-4 text-center dark:border-zinc-800">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Open</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#EB0A1E]">{open}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Polled</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{polled}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">% open</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{pct}</p>
        </div>
      </div>
    </div>
  );
}
