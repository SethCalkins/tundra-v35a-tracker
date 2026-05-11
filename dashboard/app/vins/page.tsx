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
        title="Inventory."
        description="Every Carvana Tundra we've seen, with the latest mileage / price observation and current Toyota recall status. 3rd-gen V35A trucks are shown by default. Filters and sorts apply client-side."
      />

      <div className="mb-6 border-l-4 border-[#EB0A1E] bg-zinc-50 p-4 text-xs leading-5 text-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
          Engine glossary
        </p>
        <p className="mt-2">
          <strong className="font-semibold">i-FORCE</strong> &mdash; 3.5L twin-turbo V6
          (V35A-FTS, 3rd gen non-hybrid).{" "}
          <strong className="font-semibold">i-FORCE MAX</strong> &mdash; same V6 + 1TM hybrid
          motor (3rd gen hybrid). <strong className="font-semibold">5.7L V8</strong> &mdash;
          2nd gen 3UR-FE. Hover the engine cell for the raw NHTSA code.
        </p>
      </div>

      <VinTable data={vehicles} />
    </main>
  );
}
