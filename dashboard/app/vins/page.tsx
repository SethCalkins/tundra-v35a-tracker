import { PageHeader } from "@/components/page-header";
import { getVehiclesWithLatestListing, type VehicleWithListing } from "@/lib/queries";

export const dynamic = "force-dynamic";

function StatusBadge({ status }: { status: string | null }) {
  if (status === null) {
    return <span className="text-zinc-400">—</span>;
  }
  if (status === "open") {
    return (
      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
        OPEN
      </span>
    );
  }
  if (status === "not_listed") {
    return (
      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
        not listed
      </span>
    );
  }
  return (
    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
      {status}
    </span>
  );
}

function HybridBadge({ isHybrid }: { isHybrid: boolean | null }) {
  if (isHybrid === null) return <span className="text-zinc-400">?</span>;
  if (isHybrid) {
    return (
      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
        i-FORCE MAX
      </span>
    );
  }
  return <span className="text-xs text-zinc-500">non-hybrid</span>;
}

export default async function Vins() {
  const vehicles = await getVehiclesWithLatestListing({ limit: 500 });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="VIN Explorer"
        title={`${vehicles.length} vehicles`}
        description="Every Carvana 3rd-gen Tundra (and a few sidebar 2nd-gens) we&apos;ve seen, with the latest mileage / price observation and current Toyota recall status."
      />

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:bg-zinc-800/50">
            <tr>
              <th className="px-3 py-2 text-left">VIN</th>
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-left">Trim</th>
              <th className="px-3 py-2 text-left">Engine</th>
              <th className="px-3 py-2 text-left">Hybrid</th>
              <th className="px-3 py-2 text-right">Mileage</th>
              <th className="px-3 py-2 text-right">Price</th>
              <th className="px-3 py-2 text-center">24V381</th>
              <th className="px-3 py-2 text-center">25V767</th>
              <th className="px-3 py-2 text-left">Carvana</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {vehicles.map((v: VehicleWithListing) => (
              <tr key={v.vin} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="px-3 py-2 font-mono text-xs">{v.vin}</td>
                <td className="px-3 py-2 tabular-nums">{v.model_year ?? "?"}</td>
                <td className="px-3 py-2">{v.trim ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {v.engine_code?.includes("V35A") ? (
                    <span className="text-amber-700 dark:text-amber-400">{v.engine_code}</span>
                  ) : (
                    <span className="text-zinc-500">{v.engine_code ?? "—"}</span>
                  )}
                </td>
                <td className="px-3 py-2"><HybridBadge isHybrid={v.is_hybrid} /></td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {v.mileage?.toLocaleString() ?? "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {v.asking_price_usd ? `$${v.asking_price_usd.toLocaleString()}` : "—"}
                </td>
                <td className="px-3 py-2 text-center">
                  <StatusBadge status={v.recall_24v381} />
                </td>
                <td className="px-3 py-2 text-center">
                  <StatusBadge status={v.recall_25v767} />
                </td>
                <td className="px-3 py-2">
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
          </tbody>
        </table>
      </div>
    </main>
  );
}
