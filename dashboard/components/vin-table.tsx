"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";

import { decodeEngine } from "@/lib/engines";
import type { VehicleWithListing } from "@/lib/queries";

// ── Cell helpers ──────────────────────────────────────────────────────────

function HybridBadge({ value }: { value: boolean | null }) {
  if (value === null) return <span className="text-zinc-400">?</span>;
  if (value) {
    return (
      <span className="border border-zinc-900 bg-zinc-900 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900">
        i-FORCE MAX
      </span>
    );
  }
  return <span className="text-xs text-zinc-500">i-FORCE</span>;
}

function StatusBadge({ value }: { value: string | null }) {
  if (value === null) return <span className="text-zinc-400">—</span>;
  if (value === "open") {
    return (
      <span className="bg-[#EB0A1E] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
        OPEN
      </span>
    );
  }
  if (value === "not_listed") {
    return (
      <span className="border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        not listed
      </span>
    );
  }
  return (
    <span className="border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
      {value}
    </span>
  );
}

// ── Column definitions ───────────────────────────────────────────────────

const columns: ColumnDef<VehicleWithListing>[] = [
  {
    id: "vin",
    header: "VIN",
    accessorKey: "vin",
    cell: ({ getValue }) => <span className="font-mono text-xs">{String(getValue() ?? "")}</span>,
    filterFn: "includesString",
  },
  {
    id: "model_year",
    header: "Year",
    accessorKey: "model_year",
    cell: ({ getValue }) => (
      <span className="tabular-nums">{(getValue() as number | null) ?? "?"}</span>
    ),
    filterFn: (row, _id, value: number[]) => {
      if (!value || value.length === 0) return true;
      const y = row.original.model_year;
      return y !== null && value.includes(y);
    },
  },
  {
    id: "trim",
    header: "Trim",
    accessorKey: "trim",
    cell: ({ getValue }) => <span>{(getValue() as string | null) ?? "—"}</span>,
    filterFn: "includesString",
  },
  {
    id: "engine_code",
    header: "Engine",
    accessorKey: "engine_code",
    cell: ({ getValue }) => {
      const raw = getValue() as string | null;
      const info = decodeEngine(raw);
      const cls =
        info.generation === "3rd"
          ? "text-[#EB0A1E] font-medium"
          : info.generation === "2nd"
          ? "text-zinc-700 dark:text-zinc-300"
          : "text-zinc-500";
      return (
        <span title={info.long} className={`text-xs ${cls}`}>
          {info.short}
        </span>
      );
    },
    filterFn: "includesString",
  },
  {
    id: "is_hybrid",
    header: "Powertrain",
    accessorKey: "is_hybrid",
    cell: ({ getValue }) => <HybridBadge value={getValue() as boolean | null} />,
    filterFn: (row, _id, value: string) => {
      if (value === "" || value === "all") return true;
      const h = row.original.is_hybrid;
      if (value === "hybrid") return h === true;
      if (value === "nonhybrid") return h === false;
      if (value === "unknown") return h === null;
      return true;
    },
  },
  {
    id: "mileage",
    header: () => <span className="text-right">Mileage</span>,
    accessorKey: "mileage",
    cell: ({ getValue }) => (
      <span className="text-right tabular-nums">
        {((getValue() as number | null) ?? null)?.toLocaleString() ?? "—"}
      </span>
    ),
  },
  {
    id: "asking_price_usd",
    header: () => <span className="text-right">Price</span>,
    accessorKey: "asking_price_usd",
    cell: ({ getValue }) => {
      const v = getValue() as number | null;
      return <span className="text-right tabular-nums">{v ? `$${v.toLocaleString()}` : "—"}</span>;
    },
  },
  {
    id: "recall_24v381",
    header: () => <span className="text-center font-mono text-xs">24V381</span>,
    accessorKey: "recall_24v381",
    cell: ({ getValue }) => (
      <div className="text-center">
        <StatusBadge value={getValue() as string | null} />
      </div>
    ),
    filterFn: (row, _id, value: string) => {
      if (!value || value === "all") return true;
      if (value === "not_polled") return row.original.recall_24v381 === null;
      return row.original.recall_24v381 === value;
    },
  },
  {
    id: "recall_25v767",
    header: () => <span className="text-center font-mono text-xs">25V767</span>,
    accessorKey: "recall_25v767",
    cell: ({ getValue }) => (
      <div className="text-center">
        <StatusBadge value={getValue() as string | null} />
      </div>
    ),
    filterFn: (row, _id, value: string) => {
      if (!value || value === "all") return true;
      if (value === "not_polled") return row.original.recall_25v767 === null;
      return row.original.recall_25v767 === value;
    },
  },
  {
    id: "listing_url",
    header: "Carvana",
    accessorKey: "listing_url",
    enableSorting: false,
    cell: ({ getValue }) => {
      const url = getValue() as string | null;
      if (!url) return <span className="text-zinc-400">—</span>;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-[#EB0A1E] hover:underline"
        >
          view ↗
        </a>
      );
    },
  },
];

// ── Table component ───────────────────────────────────────────────────────

interface VinTableProps {
  data: VehicleWithListing[];
}

export function VinTable({ data }: VinTableProps) {
  // 3rd-gen only by default — Carvana's "you might also like" sidebar pulls in 2014-2021 trucks.
  const [include2ndGen, setInclude2ndGen] = useState(false);
  const [vinFilter, setVinFilter] = useState("");
  const [hybridFilter, setHybridFilter] = useState<string>("all");
  const [recall24Filter, setRecall24Filter] = useState<string>("all");
  const [recall25Filter, setRecall25Filter] = useState<string>("all");
  const [v35aOnly, setV35aOnly] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([
    { id: "model_year", desc: true },
  ]);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (!include2ndGen && (row.model_year === null || row.model_year < 2022)) return false;
      if (v35aOnly && !(row.engine_code?.includes("V35A") ?? false)) return false;
      return true;
    });
  }, [data, include2ndGen, v35aOnly]);

  const columnFilters: ColumnFiltersState = useMemo(() => {
    const f: ColumnFiltersState = [];
    if (vinFilter) f.push({ id: "vin", value: vinFilter });
    if (hybridFilter !== "all") f.push({ id: "is_hybrid", value: hybridFilter });
    if (recall24Filter !== "all") f.push({ id: "recall_24v381", value: recall24Filter });
    if (recall25Filter !== "all") f.push({ id: "recall_25v767", value: recall25Filter });
    return f;
  }, [vinFilter, hybridFilter, recall24Filter, recall25Filter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const total = data.length;
  const visible = table.getFilteredRowModel().rows.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              VIN search
            </label>
            <input
              type="text"
              value={vinFilter}
              onChange={(e) => setVinFilter(e.target.value)}
              placeholder="e.g. 5TFPC..."
              className="mt-1 w-full border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm focus:border-[#EB0A1E] focus:outline-none focus:ring-1 focus:ring-[#EB0A1E] dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <SelectFilter
            label="Powertrain"
            value={hybridFilter}
            onChange={setHybridFilter}
            options={[
              { v: "all", l: "All" },
              { v: "hybrid", l: "i-FORCE MAX" },
              { v: "nonhybrid", l: "non-hybrid" },
              { v: "unknown", l: "Unknown" },
            ]}
          />
          <SelectFilter
            label="24V381 (engine)"
            value={recall24Filter}
            onChange={setRecall24Filter}
            options={[
              { v: "all", l: "All" },
              { v: "open", l: "Open" },
              { v: "not_listed", l: "Not listed" },
              { v: "not_polled", l: "Not polled" },
            ]}
          />
          <SelectFilter
            label="25V767 (expansion)"
            value={recall25Filter}
            onChange={setRecall25Filter}
            options={[
              { v: "all", l: "All" },
              { v: "open", l: "Open" },
              { v: "not_listed", l: "Not listed" },
              { v: "not_polled", l: "Not polled" },
            ]}
          />
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs">
          <label className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={v35aOnly}
              onChange={(e) => setV35aOnly(e.target.checked)}
              className="rounded border-zinc-300"
            />
            V35A engine only
          </label>
          <label className="inline-flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={include2ndGen}
              onChange={(e) => setInclude2ndGen(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Include pre-2022 (2nd gen)
          </label>
          <span className="ml-auto text-zinc-500">
            {visible.toLocaleString()} / {total.toLocaleString()} vehicles
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <table className="w-full text-sm">
          <thead className="border-b-2 border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={`px-3 py-3 ${h.column.getCanSort() ? "cursor-pointer select-none hover:text-[#EB0A1E]" : ""}`}
                    onClick={h.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {{ asc: " ▲", desc: " ▼" }[h.column.getIsSorted() as string] ?? null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No vehicles match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-zinc-500">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
          {" · "}
          {visible.toLocaleString()} rows ({table.getState().pagination.pageSize} per page)
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-[#EB0A1E] hover:text-[#EB0A1E] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-300 disabled:hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            ← Prev
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:border-[#EB0A1E] hover:text-[#EB0A1E] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-zinc-300 disabled:hover:text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

interface SelectFilterProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { v: string; l: string }[];
}

function SelectFilter({ label, value, onChange, options }: SelectFilterProps) {
  return (
    <div>
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 border border-zinc-300 bg-white px-2 py-1.5 text-sm focus:border-[#EB0A1E] focus:outline-none focus:ring-1 focus:ring-[#EB0A1E] dark:border-zinc-700 dark:bg-zinc-800"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </div>
  );
}
