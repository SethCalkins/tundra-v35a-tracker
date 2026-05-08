import { query } from "@/lib/db";

interface RecallRow {
  id: string;
  toyota_campaign: string | null;
  description: string | null;
  affected_years: number[];
  affected_models: string[];
}

interface Counts {
  vehicles: number;
  observations: number;
  recall_status_rows: number;
  events: number;
}

export const dynamic = "force-dynamic";

export default async function Home() {
  const recalls = await query<RecallRow>(
    "SELECT id, toyota_campaign, description, affected_years, affected_models FROM recalls ORDER BY id",
  );

  const [counts] = await query<Counts>(
    `SELECT
       (SELECT COUNT(*) FROM vehicles)::int             AS vehicles,
       (SELECT COUNT(*) FROM listing_observations)::int AS observations,
       (SELECT COUNT(*) FROM recall_status)::int        AS recall_status_rows,
       (SELECT COUNT(*) FROM recall_status_events)::int AS events`,
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-16 font-sans">
      <header className="mb-12">
        <p className="text-sm uppercase tracking-wider text-zinc-500">Phase 0 — bootstrap</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          3rd Gen Tundra Tracker
        </h1>
        <p className="mt-3 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Carvana inventory + NHTSA recall <code>25V767</code> as a proxy for V35A engine
          replacement. The data pipeline lands in Phase 1+; this page just confirms the
          dashboard can talk to Postgres.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-lg font-medium">Database</h2>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Vehicles" value={counts.vehicles} />
          <Stat label="Observations" value={counts.observations} />
          <Stat label="Recall status rows" value={counts.recall_status_rows} />
          <Stat label="Status events" value={counts.events} />
        </dl>
      </section>

      <section>
        <h2 className="text-lg font-medium">Recall registry</h2>
        <ul className="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800">
          {recalls.map((r) => (
            <li key={r.id} className="py-4">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-sm font-semibold">{r.id}</span>
                {r.toyota_campaign && (
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {r.toyota_campaign}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{r.description}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {r.affected_models.join(", ")} · {r.affected_years.join(", ")}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
