import { PageHeader } from "@/components/page-header";
import { VinTable } from "@/components/vin-table";
import { getVehiclesWithLatestListing } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function Vins() {
  const vehicles = await getVehiclesWithLatestListing({ limit: 1000 });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <PageHeader
        eyebrow="VIN Explorer"
        title="Inventory"
        description="Every Carvana Tundra we&apos;ve seen, with the latest mileage / price observation and current Toyota recall status. 3rd-gen V35A trucks are shown by default. Filters and sorts apply client-side."
      />

      <div className="mb-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Engine glossary:</span>{" "}
        <span className="font-medium text-amber-700 dark:text-amber-400">i-FORCE</span> = 3.5L twin-turbo V6 (V35A-FTS, 3rd gen non-hybrid).{" "}
        <span className="font-medium text-amber-700 dark:text-amber-400">i-FORCE MAX</span> = same V6 + 1TM hybrid motor (3rd gen hybrid).{" "}
        <span className="font-medium">5.7L V8</span> = 2nd gen 3UR-FE. Hover the engine cell for the raw NHTSA code.
      </div>

      <VinTable data={vehicles} />
    </main>
  );
}
