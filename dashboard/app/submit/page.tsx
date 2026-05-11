import { PageHeader } from "@/components/page-header";
import { query } from "@/lib/db";

import { SubmissionForm } from "./submission-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Report your engine — V35A Engine Tracker",
  description:
    "Help build the public record. Submit your VIN, mileage, and engine-replacement details so other 3rd-gen Tundra owners have honest data to act on.",
};

async function getSubmissionStats() {
  const [{ total = 0, replaced = 0 } = {}] = await query<{ total: number; replaced: number }>(
    `SELECT
        COUNT(*)                                                AS total,
        SUM(CASE WHEN engine_replaced = 1 THEN 1 ELSE 0 END)    AS replaced
      FROM user_submissions
     WHERE honeypot_failed = 0`,
  );
  return { total, replaced: replaced ?? 0 };
}

export default async function SubmitPage() {
  const stats = await getSubmissionStats();
  return (
    <div className="mx-auto max-w-3xl px-6 py-14">
      <PageHeader
        eyebrow="Community report"
        title="Report your engine."
        description="Toyota and Carfax don't show whether your V35A engine has been replaced. Owners do. Tell us what happened to your truck — failures, replacements, or just current mileage on a healthy engine. The more reports we get, the harder this story gets to ignore."
      />

      <div className="mb-10 grid grid-cols-2 gap-4 border-y border-zinc-200 py-6 dark:border-zinc-800">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Owner reports
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight">
            {stats.total.toLocaleString()}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Engine replacements reported
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-[#EB0A1E]">
            {stats.replaced.toLocaleString()}
          </p>
        </div>
      </div>

      <SubmissionForm />

      <aside className="mt-14 border-l-4 border-zinc-300 bg-zinc-50 p-5 text-sm leading-6 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/40 dark:text-zinc-300">
        <p className="font-semibold text-zinc-900 dark:text-zinc-100">A note on privacy</p>
        <p className="mt-2">
          Your VIN, email, and notes are stored privately and used only to verify reports and
          contact you if we need to. Aggregated stats (mileage at failure, replacement counts)
          may be published — individual VINs are never shown publicly without your permission.
        </p>
      </aside>
    </div>
  );
}
