import Link from "next/link";

export const metadata = {
  title: "Thanks — V35A Engine Tracker",
};

export default function ThanksPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
        Report received
      </p>
      <h1 className="mt-4 text-4xl font-bold tracking-tight italic sm:text-5xl">
        Thank you<span className="text-[#EB0A1E]">.</span>
      </h1>
      <p className="mt-6 text-base leading-7 text-zinc-600 dark:text-zinc-400">
        Your report is in. It joins the growing public record of V35A engine outcomes —
        the data Toyota won't publish itself.
      </p>
      <p className="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-400">
        We review submissions before they count toward the published metrics. If you
        provided an email, we may follow up to verify or ask a clarifying question.
      </p>

      <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Link
          href="/lifespan"
          className="inline-flex items-center justify-center bg-[#EB0A1E] px-6 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#c00917]"
        >
          See the data
        </Link>
        <Link
          href="/submit"
          className="inline-flex items-center justify-center border border-zinc-300 px-6 py-3 text-sm font-semibold uppercase tracking-wider text-zinc-900 transition-colors hover:border-zinc-900 dark:border-zinc-700 dark:text-zinc-100 dark:hover:border-zinc-100"
        >
          Report another
        </Link>
      </div>
    </div>
  );
}
