/**
 * Admin — view + curate owner submissions.
 *
 * Auth: gated at the Cloudflare edge by Cloudflare Access (email OTP,
 * allowlist = sethcalkins@me.com). The Worker only sees authenticated
 * requests, so no app-layer auth here. CF Access forwards the
 * authenticated user's email in the `Cf-Access-Authenticated-User-Email`
 * header — we surface it on the page so you can confirm who's logged in.
 */
import { headers } from "next/headers";

import { query } from "@/lib/db";
import { SubmissionRow } from "./submission-row";
import type { AdminSubmission } from "./submission-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Tundra V35A Tracker", robots: { index: false, follow: false } };

interface PageProps {
  searchParams: Promise<{ filter?: string }>;
}

export default async function AdminPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all";

  const h = await headers();
  const accessEmail =
    h.get("cf-access-authenticated-user-email") ?? h.get("Cf-Access-Authenticated-User-Email");

  const where =
    filter === "pending"     ? "WHERE verified = 0 AND honeypot_failed = 0" :
    filter === "verified"    ? "WHERE verified = 1" :
    filter === "honeypot"    ? "WHERE honeypot_failed = 1" :
    filter === "replacement" ? "WHERE engine_replaced = 1 AND honeypot_failed = 0" :
    "WHERE 1=1";

  const rows = await query<AdminSubmission>(
    `SELECT id, submitted_at, vin, model_year, trim, is_hybrid, current_mileage,
            engine_replaced, replacement_date, replacement_mileage, failure_mode,
            was_towed, dealer_name, dealer_state, under_recall, recall_campaign,
            verified, verification_method, verified_at,
            notes, submitter_email, ip_address, user_agent, honeypot_failed
       FROM user_submissions
       ${where}
      ORDER BY submitted_at DESC
      LIMIT 200`,
  );

  // Counts for the filter chips
  const counts = await query<{ key: string; n: number }>(`
    SELECT 'all' AS key, COUNT(*) AS n FROM user_submissions UNION ALL
    SELECT 'pending', COUNT(*) FROM user_submissions WHERE verified = 0 AND honeypot_failed = 0 UNION ALL
    SELECT 'verified', COUNT(*) FROM user_submissions WHERE verified = 1 UNION ALL
    SELECT 'replacement', COUNT(*) FROM user_submissions WHERE engine_replaced = 1 AND honeypot_failed = 0 UNION ALL
    SELECT 'honeypot', COUNT(*) FROM user_submissions WHERE honeypot_failed = 1
  `);
  const countMap = Object.fromEntries(counts.map((c) => [c.key, c.n]));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#EB0A1E]">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight italic">
            Owner submissions
          </h1>
        </div>
        {accessEmail && (
          <p className="text-xs text-zinc-500">
            Signed in as <span className="font-mono">{accessEmail}</span>
          </p>
        )}
      </header>

      {/* Filter chips */}
      <nav className="mb-5 flex flex-wrap gap-2 text-xs">
        {(["all", "pending", "replacement", "verified", "honeypot"] as const).map((f) => {
          const active = filter === f;
          return (
            <a
              key={f}
              href={`/admin?filter=${f}`}
              className={`border px-3 py-1.5 font-medium uppercase tracking-wider transition-colors ${
                active
                  ? "border-[#EB0A1E] bg-[#EB0A1E] text-white"
                  : "border-zinc-300 text-zinc-700 hover:border-[#EB0A1E] hover:text-[#EB0A1E] dark:border-zinc-700 dark:text-zinc-300"
              }`}
            >
              {f} ({countMap[f] ?? 0})
            </a>
          );
        })}
      </nav>

      {rows.length === 0 ? (
        <p className="border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No submissions match this filter yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <SubmissionRow key={r.id} row={r} />
          ))}
        </ul>
      )}
    </main>
  );
}
