"use client";

import { useTransition } from "react";

import { deleteSubmission, markUnverified, markVerified } from "./actions";

export interface AdminSubmission {
  id: number;
  submitted_at: string;
  vin: string;
  model_year: number | null;
  trim: string | null;
  is_hybrid: number | null;
  current_mileage: number | null;
  engine_replaced: number;
  replacement_date: string | null;
  replacement_mileage: number | null;
  failure_mode: string | null;
  was_towed: number | null;
  dealer_name: string | null;
  dealer_state: string | null;
  under_recall: number | null;
  recall_campaign: string | null;
  verified: number;
  verification_method: string | null;
  verified_at: string | null;
  notes: string | null;
  submitter_email: string | null;
  ip_address: string | null;
  user_agent: string | null;
  honeypot_failed: number;
}

export function SubmissionRow({ row }: { row: AdminSubmission }) {
  const [pending, startTransition] = useTransition();

  const verified = row.verified === 1;
  const isHoneypot = row.honeypot_failed === 1;
  const replaced = row.engine_replaced === 1;

  return (
    <li
      className={`relative border bg-white p-4 text-sm dark:bg-zinc-900 ${
        isHoneypot
          ? "border-zinc-200 opacity-60 dark:border-zinc-800"
          : verified
          ? "border-green-500"
          : "border-zinc-300 dark:border-zinc-700"
      }`}
    >
      {/* Top row */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xs text-zinc-500">#{row.id}</span>
        <span className="font-mono text-xs">{row.vin}</span>
        <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
          MY {row.model_year ?? "?"}
        </span>
        {row.trim && <span className="text-zinc-600 dark:text-zinc-400">{row.trim}</span>}
        <span className="text-zinc-600 dark:text-zinc-400">
          {row.is_hybrid === 1 ? "i-FORCE MAX" : row.is_hybrid === 0 ? "i-FORCE" : "?"}
        </span>
        {isHoneypot && (
          <span className="bg-zinc-300 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-700">
            honeypot
          </span>
        )}
        {replaced && (
          <span className="bg-[#EB0A1E] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            REPLACED
          </span>
        )}
        {verified && (
          <span className="border border-green-500 bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-700">
            verified
          </span>
        )}
        <span className="ml-auto text-xs text-zinc-500">
          {new Date(row.submitted_at).toLocaleString()}
        </span>
      </div>

      {/* Body grid */}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        <Item label="Current mi" value={row.current_mileage?.toLocaleString()} />
        {replaced && (
          <>
            <Item label="Replacement mi" value={row.replacement_mileage?.toLocaleString()} />
            <Item label="Replacement date" value={row.replacement_date ?? undefined} />
            <Item label="Failure mode" value={row.failure_mode ?? undefined} />
            <Item label="Towed" value={row.was_towed === 1 ? "yes" : row.was_towed === 0 ? "no" : undefined} />
            <Item label="Under recall" value={row.under_recall === 1 ? "yes" : row.under_recall === 0 ? "no" : undefined} />
            <Item label="Campaign" value={row.recall_campaign ?? undefined} />
            <Item label="Dealer" value={[row.dealer_name, row.dealer_state].filter(Boolean).join(", ") || undefined} />
          </>
        )}
        <Item label="Email" value={row.submitter_email ?? undefined} />
        <Item label="IP" value={row.ip_address ?? undefined} mono />
      </dl>

      {row.notes && (
        <p className="mt-3 whitespace-pre-wrap border-l-2 border-zinc-300 bg-zinc-50 p-3 text-xs italic text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
          {row.notes}
        </p>
      )}

      {/* Action row */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        {!isHoneypot && !verified && (
          <button
            disabled={pending}
            onClick={() => startTransition(() => { void markVerified(row.id); })}
            className="border border-green-500 bg-green-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-green-600 disabled:opacity-50"
          >
            Mark verified
          </button>
        )}
        {!isHoneypot && verified && (
          <button
            disabled={pending}
            onClick={() => startTransition(() => { void markUnverified(row.id); })}
            className="border border-zinc-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-700 transition-colors hover:border-zinc-500 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
          >
            Unverify
          </button>
        )}
        <button
          disabled={pending}
          onClick={() => {
            if (confirm(`Delete submission #${row.id}? This is permanent.`)) {
              startTransition(() => { void deleteSubmission(row.id); });
            }
          }}
          className="ml-auto border border-zinc-300 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:border-[#EB0A1E] hover:text-[#EB0A1E] disabled:opacity-50 dark:border-zinc-700"
        >
          Delete
        </button>
      </div>

      {pending && (
        <span className="absolute right-2 top-2 text-[10px] uppercase tracking-wider text-zinc-400">
          …saving
        </span>
      )}
    </li>
  );
}

function Item({ label, value, mono }: { label: string; value: string | undefined; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd className={`${mono ? "font-mono" : ""} mt-0.5 text-zinc-800 dark:text-zinc-200`}>
        {value}
      </dd>
    </div>
  );
}
