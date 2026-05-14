import {
  COMMUNITY_MILEAGE_POINTS,
  COMMUNITY_QUOTES,
  COMMUNITY_STATS,
} from "@/lib/community-reports";
import { StatCard } from "@/components/stat-card";

/**
 * Renders the "What owners are reporting in private groups" section on the
 * /lifespan page — anonymized aggregate stats + hand-curated verbatim
 * quotes (author names removed).
 */
export function CommunityReportsSection() {
  const s = COMMUNITY_STATS;

  // Build a small text histogram of mileage points grouped by powertrain
  // to give a sense of where failures cluster.
  const hybridPoints = COMMUNITY_MILEAGE_POINTS.filter((p) =>
    p.powertrain === "i-FORCE MAX",
  );
  const nonHybridPoints = COMMUNITY_MILEAGE_POINTS.filter((p) =>
    p.powertrain === "i-FORCE",
  );

  return (
    <section className="mb-12 overflow-hidden border-l-4 border-[#EB0A1E] bg-zinc-50 dark:bg-zinc-900/40">
      <header className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
          What owners are reporting in private groups
        </p>
        <h2 className="mt-2 text-xl font-bold tracking-tight italic">
          Direct accounts from Toyota Tundra owner communities.
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-700 dark:text-zinc-300">
          Hand-curated owner reports from three private Toyota Tundra Facebook
          groups, captured 2026-05-14. Member identities are stripped — what
          appears here is anonymized aggregates and verbatim post bodies that
          contain no personally-identifying information. Raw findings stay on
          a local machine and are never shipped.
        </p>
      </header>

      <div className="bg-white px-6 py-6 dark:bg-zinc-900">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total reports"
            value={s.total_findings}
            caption={`${s.with_explicit_mileage} with explicit mileage`}
          />
          <StatCard
            label="Hybrid failures"
            value={s.hybrid_failures}
            caption={`clustered at ${s.hybrid_mileage_cluster}`}
            emphasis="danger"
          />
          <StatCard
            label="Replacement engines that subsequently had issues"
            value={s.replacement_engines_with_issues}
            caption="of the proactive/early swaps we documented"
            emphasis="danger"
          />
          <StatCard
            label="Refused recall coverage"
            value={s.denied_recall_coverage}
            caption="classic V35A failure mode, VIN out-of-scope"
            emphasis="danger"
          />
        </dl>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Hybrid V35A failure mileages (owner-reported)
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {hybridPoints.map((p, i) => (
                <li key={i} className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-zinc-500">{p.model_year}</span>
                  <span className="font-bold text-[#EB0A1E]">
                    {p.mileage.toLocaleString()} mi
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {p.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Non-hybrid V35A failure / swap mileages
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {nonHybridPoints.map((p, i) => (
                <li key={i} className="flex items-baseline gap-2 tabular-nums">
                  <span className="text-zinc-500">{p.model_year}</span>
                  <span
                    className={`font-bold ${
                      p.outcome.startsWith("failure")
                        ? "text-[#EB0A1E]"
                        : "text-zinc-700 dark:text-zinc-300"
                    }`}
                  >
                    {p.mileage.toLocaleString()} mi
                  </span>
                  <span className="text-xs text-zinc-600 dark:text-zinc-400">
                    {p.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ul className="divide-y divide-zinc-200 bg-white dark:divide-zinc-800 dark:bg-zinc-900">
        {COMMUNITY_QUOTES.map((q) => (
          <li key={q.id} className="px-6 py-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-[10px] font-bold tracking-tight text-[#EB0A1E]">
                {q.tag.replace(/_/g, " ")}
              </span>
              {q.model_year && (
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  MY {q.model_year}
                </span>
              )}
              {q.powertrain && (
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {q.powertrain}
                </span>
              )}
              {q.mileage && (
                <span className="text-xs font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                  {q.mileage.toLocaleString()} mi
                </span>
              )}
            </div>
            <h3 className="mt-2 text-base font-bold tracking-tight italic">
              {q.headline}
            </h3>
            <p className="mt-3 border-l-2 border-zinc-300 bg-zinc-50 p-3 text-xs italic leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
              &ldquo;{q.body}&rdquo;
            </p>
            <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Why it matters:
              </span>{" "}
              {q.significance}
            </p>
          </li>
        ))}
      </ul>

      <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-4 text-[11px] leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/40">
        <strong>Methodology:</strong> Hand-curated from three Toyota Tundra
        owner Facebook groups via manual reading + on-page DOM extraction.
        No automated scraping. Author names stripped before any data leaves
        the local machine. Post bodies are quoted verbatim because they
        contain no PII (no full names, VINs, addresses, or phone numbers).
        Mileages and powertrains are owner-stated, not independently
        verified.
      </div>
    </section>
  );
}
