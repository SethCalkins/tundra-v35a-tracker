import { PageHeader } from "@/components/page-header";
import {
  getCombinedRecallStates,
  type CombinedRecallRow,
  type EngineRecallState,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const STATE_META: Record<
  EngineRecallState,
  { label: string; tone: "danger" | "warning" | "muted" | "info"; description: string }
> = {
  open: {
    label: "Engine recall OPEN",
    tone: "danger",
    description:
      "24V381 is currently flagged. Toyota's engine-replacement remedy is available; this engine has not been replaced.",
  },
  pending_remedy: {
    label: "25V767 pending — no remedy yet",
    tone: "warning",
    description:
      "Truck is in the 25V767 expansion scope. Toyota's final remedy is anticipated July/August 2026. Engine cannot be replaced under recall yet.",
  },
  unknown: {
    label: "Unknown — out-of-scope OR completed",
    tone: "muted",
    description:
      "Carfax shows no engine recall on this VIN. Either the truck was outside the affected production window, or the recall was completed and removed from Carfax's feed (Toyota only licenses open-recall data to Carfax).",
  },
  not_polled: {
    label: "Not yet polled",
    tone: "muted",
    description: "Recall poll / Carfax fetch hasn't reached this VIN yet.",
  },
  post_recall_build: {
    label: "Post-recall build (not eligible)",
    tone: "info",
    description:
      "2025+ V35A engines were manufactured after Toyota corrected the contamination process. These trucks aren't in either recall.",
  },
};

const TONE_BG: Record<string, string> = {
  danger: "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30",
  warning: "border-orange-300 bg-orange-50 dark:border-orange-900/40 dark:bg-orange-950/30",
  muted: "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
  info: "border-sky-300 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-950/30",
};

function summariseStates(rows: CombinedRecallRow[]) {
  const buckets: Record<EngineRecallState, CombinedRecallRow[]> = {
    open: [], pending_remedy: [], unknown: [], not_polled: [], post_recall_build: [],
  };
  for (const r of rows) buckets[r.state].push(r);
  return buckets;
}

export default async function Failures() {
  const rows = await getCombinedRecallStates();
  const buckets = summariseStates(rows);
  const total = rows.length;

  // 24V381 cohort = 2022-2023 V35A only (Toyota's original recall scope)
  const cohort24 = rows.filter(
    (r) => r.model_year !== null && r.model_year >= 2022 && r.model_year <= 2023,
  );
  // 25V767 cohort = 2022-2024 V35A
  const cohort25 = rows.filter(
    (r) => r.model_year !== null && r.model_year >= 2022 && r.model_year <= 2024,
  );

  const open24 = cohort24.filter((r) => r.toyota_24v381 === "open").length;
  const open25 = cohort25.filter((r) => r.toyota_25v767 === "open").length;
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`);

  // Year × powertrain breakdown
  const byKey: Record<string, { year: number; hybrid: boolean; total: number; open: number; pending: number; unknown: number }> = {};
  for (const r of cohort25) {
    if (r.model_year === null) continue;
    const key = `${r.model_year}|${r.is_hybrid === true ? "h" : "n"}`;
    const cur = byKey[key] ?? {
      year: r.model_year,
      hybrid: r.is_hybrid === true,
      total: 0,
      open: 0,
      pending: 0,
      unknown: 0,
    };
    cur.total += 1;
    if (r.state === "open") cur.open += 1;
    else if (r.state === "pending_remedy") cur.pending += 1;
    else if (r.state === "unknown") cur.unknown += 1;
    byKey[key] = cur;
  }
  const yearRows = Object.values(byKey).sort(
    (a, b) => a.year - b.year || (a.hybrid ? 1 : 0) - (b.hybrid ? 1 : 0),
  );

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="Engine recall analysis"
        title="V35A recall status"
        description="For every V35A truck on Carvana we polled Toyota's recall page and pulled Carfax's free preview. Toyota only licenses open-recall data to Carfax, so completed recalls disappear from both sources rather than showing up as 'completed.' That puts a ceiling on what public data can tell us — which we lay out honestly below."
      />

      {/* Top-level state breakdown */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(["open", "pending_remedy", "unknown", "post_recall_build", "not_polled"] as EngineRecallState[]).map(
          (state) => {
            const meta = STATE_META[state];
            const list = buckets[state];
            if (list.length === 0 && state === "not_polled") return null;
            return (
              <div key={state} className={`rounded-lg border p-5 shadow-sm ${TONE_BG[meta.tone]}`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="text-sm font-medium">{meta.label}</h3>
                  <span className="text-2xl font-semibold tabular-nums">{list.length}</span>
                </div>
                <p className="mt-2 text-xs text-zinc-700 dark:text-zinc-400">{meta.description}</p>
              </div>
            );
          },
        )}
      </section>

      {/* Recall cards */}
      <section className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between">
            <h3 className="font-mono text-sm font-semibold">24V381</h3>
            <span className="text-xs text-zinc-500">remedy active since Dec 2024</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Original V35A engine recall, 2022–2023 Tundra build window.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {open24}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Cohort polled</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{cohort24.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {pct(open24, cohort24.length)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-baseline justify-between">
            <h3 className="font-mono text-sm font-semibold">25V767</h3>
            <span className="text-xs text-zinc-500">remedy under dev, ~Aug 2026</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Expansion: 2022–2024 Tundra + Lexus LX/GX. Toyota hasn&apos;t released the
            replacement procedure yet, so most are in &quot;pending&quot; state.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Open</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {open25}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">Cohort polled</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">{cohort25.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-zinc-500">% open</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {pct(open25, cohort25.length)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Year × powertrain table */}
      <section className="mb-10 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="border-b border-zinc-200 px-5 py-3 text-sm font-medium dark:border-zinc-800">
          Cohort × powertrain breakdown
        </h2>
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-4 py-2 text-left">Year</th>
              <th className="px-4 py-2 text-left">Powertrain</th>
              <th className="px-4 py-2 text-right">Trucks</th>
              <th className="px-4 py-2 text-right">Engine recall OPEN</th>
              <th className="px-4 py-2 text-right">Pending remedy</th>
              <th className="px-4 py-2 text-right">Unknown / out of scope</th>
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
                <td className="px-4 py-2 text-right tabular-nums text-orange-700 dark:text-orange-400">
                  {r.pending}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{r.unknown}</td>
              </tr>
            ))}
            {yearRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-zinc-500">
                  No polled VINs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Why we can't say "engine replaced" */}
      <section className="rounded-lg border border-zinc-300 bg-zinc-100 p-5 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">
          Why this dashboard doesn&apos;t answer &quot;was the engine replaced?&quot;
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-600 dark:text-zinc-400">
          <li>
            Toyota&apos;s public recall lookup only shows <em>currently open</em> recalls per
            VIN. Once a recall is completed it disappears from the lookup — there&apos;s no
            &quot;completed&quot; status surfaced publicly.
          </li>
          <li>
            Carfax&apos;s free preview pulls recall data under licence from Toyota, with the
            same constraint: &quot;This data applies only to vehicles with currently open
            safety or emissions recalls.&quot; Completions are removed from the feed, not
            relabelled.
          </li>
          <li>
            AutoCheck (Experian) doesn&apos;t expose a free-tier per-VIN lookup at all —
            their data is gated behind paid subscriptions.
          </li>
          <li>
            So a VIN where neither source lists the engine recall is in one of two states
            we cannot disambiguate from the outside: <em>built outside the affected
            production window</em>, or <em>built inside the window and engine was
            replaced</em>. Those are very different things, but they look identical in
            public data.
          </li>
          <li>
            What we <em>can</em> see definitively: 24V381 listed as open = engine has not
            been replaced (the cohort that&apos;s definitely still original). 25V767 pending
            = remedy isn&apos;t available yet, so replacement hasn&apos;t happened.
          </li>
          <li>
            Tracking VINs over time should let us infer some completions: a VIN whose
            24V381 status flips from <em>open</em> to <em>not listed</em> between weekly
            polls is strong evidence the engine was replaced in between.
          </li>
        </ul>
      </section>
    </main>
  );
}
