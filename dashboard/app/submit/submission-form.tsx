"use client";

import Script from "next/script";
import { useActionState, useState } from "react";

import { type SubmitState, submitUserReport } from "./actions";

const initialState: SubmitState = { ok: false };

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function SubmissionForm() {
  const [state, formAction, isPending] = useActionState(submitUserReport, initialState);
  const [engineReplaced, setEngineReplaced] = useState<"yes" | "no">("no");

  return (
    <form action={formAction} className="space-y-8">
      {/* Honeypot — hidden from users, bots fill it */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>

      {state.error && (
        <div
          role="alert"
          className="border-l-4 border-[#EB0A1E] bg-red-50 p-4 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-200"
        >
          {state.error}
        </div>
      )}

      <Section
        title="Your truck"
        description="The basics. VIN is the only required field in this section."
      >
        <Field label="VIN" hint="17 characters, no I / O / Q" required>
          <input
            type="text"
            name="vin"
            required
            minLength={17}
            maxLength={17}
            pattern="[A-HJ-NPR-Z0-9a-hj-npr-z0-9]{17}"
            placeholder="5TFLA5DB4PX072937"
            className={inputCls}
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="Model year">
            <select name="model_year" className={inputCls} defaultValue="">
              <option value="">Select…</option>
              {[2022, 2023, 2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </Field>

          <Field label="Trim" hint="SR5, Limited, TRD Pro, Capstone…">
            <input type="text" name="trim" className={inputCls} placeholder="TRD Pro" />
          </Field>

          <Field label="Engine">
            <select name="is_hybrid" className={inputCls} defaultValue="">
              <option value="">Select…</option>
              <option value="no">i-FORCE (non-hybrid)</option>
              <option value="yes">i-FORCE MAX (hybrid)</option>
            </select>
          </Field>
        </div>

        <Field label="Current odometer (miles)">
          <input
            type="number"
            name="current_mileage"
            min={0}
            max={500000}
            inputMode="numeric"
            className={inputCls}
            placeholder="51000"
          />
        </Field>
      </Section>

      <Section
        title="Engine replacement"
        description="If you've had the engine block replaced under recall (24V381 / 25V767) or for any other reason, tell us when."
      >
        <Field label="Has the engine been replaced?" required>
          <div className="flex gap-3">
            <RadioCard
              name="engine_replaced"
              value="no"
              label="No"
              checked={engineReplaced === "no"}
              onChange={() => setEngineReplaced("no")}
            />
            <RadioCard
              name="engine_replaced"
              value="yes"
              label="Yes"
              checked={engineReplaced === "yes"}
              onChange={() => setEngineReplaced("yes")}
            />
          </div>
        </Field>

        {engineReplaced === "yes" && (
          <div className="space-y-6 border-l-2 border-[#EB0A1E] bg-zinc-50 p-5 dark:bg-zinc-900/40">
            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Mileage at replacement" required>
                <input
                  type="number"
                  name="replacement_mileage"
                  min={0}
                  max={500000}
                  inputMode="numeric"
                  className={inputCls}
                  placeholder="34000"
                />
              </Field>

              <Field label="Date of replacement">
                <input
                  type="date"
                  name="replacement_date"
                  className={inputCls}
                  max={new Date().toISOString().slice(0, 10)}
                />
              </Field>
            </div>

            <Field label="Failure mode" hint="What went wrong before replacement?">
              <select name="failure_mode" className={inputCls} defaultValue="">
                <option value="">Select…</option>
                <option value="engine_seized">Engine seized / locked up</option>
                <option value="knocking">Rod knock / bearing noise</option>
                <option value="metal_shavings">Metal in oil</option>
                <option value="stalled_no_restart">Stalled, wouldn't restart</option>
                <option value="loss_of_power">Loss of power / limp mode</option>
                <option value="proactive_recall">Proactive (no failure, recall)</option>
                <option value="other">Other / unsure</option>
              </select>
            </Field>

            <div className="grid gap-6 sm:grid-cols-2">
              <Field label="Was the truck towed?">
                <div className="flex gap-3">
                  <RadioCard name="was_towed" value="yes" label="Yes" />
                  <RadioCard name="was_towed" value="no" label="No" defaultChecked />
                </div>
              </Field>
              <Field label="Done under recall?">
                <div className="flex gap-3">
                  <RadioCard name="under_recall" value="yes" label="Yes" />
                  <RadioCard name="under_recall" value="no" label="No" defaultChecked />
                </div>
              </Field>
            </div>

            <Field label="Recall campaign code" hint="e.g. 24TA07, 25TA14 — leave blank if unknown">
              <input
                type="text"
                name="recall_campaign"
                className={inputCls}
                placeholder="24TA07"
                maxLength={32}
              />
            </Field>

            <div className="grid gap-6 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Dealer name">
                  <input
                    type="text"
                    name="dealer_name"
                    className={inputCls}
                    placeholder="Longo Toyota"
                  />
                </Field>
              </div>
              <Field label="Dealer state">
                <input
                  type="text"
                  name="dealer_state"
                  className={inputCls}
                  placeholder="CA"
                  maxLength={2}
                />
              </Field>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Anything else?"
        description="Optional. Helps us understand the data — and reach out if we need to verify."
      >
        <Field label="Notes">
          <textarea
            name="notes"
            rows={4}
            className={inputCls}
            placeholder="What else should we know? Any unusual symptoms, dealer experience, etc."
          />
        </Field>

        <Field
          label="Email"
          hint="Optional. Only used to verify your submission — never published, never shared."
        >
          <input
            type="email"
            name="email"
            className={inputCls}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </Field>
      </Section>

      {TURNSTILE_SITE_KEY && (
        <div className="flex justify-start">
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            async
            defer
            strategy="afterInteractive"
          />
          <div className="cf-turnstile" data-sitekey={TURNSTILE_SITE_KEY} />
        </div>
      )}

      <div className="flex flex-col gap-4 border-t border-zinc-200 pt-8 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md text-xs leading-5 text-zinc-500">
          Submissions are reviewed before counting toward published metrics. Your VIN won't be
          shown publicly without your explicit permission.
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center justify-center bg-[#EB0A1E] px-8 py-3 text-sm font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#c00917] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Submitting…" : "Submit report"}
        </button>
      </div>
    </form>
  );
}

const inputCls =
  "block w-full border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 transition-colors focus:border-[#EB0A1E] focus:outline-none focus:ring-1 focus:ring-[#EB0A1E] dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-6">
      <header className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <h2 className="text-xl font-bold tracking-tight italic">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
        {label}
        {required && <span className="text-[#EB0A1E]">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

function RadioCard({
  name,
  value,
  label,
  checked,
  defaultChecked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: () => void;
}) {
  const controlled = checked !== undefined || onChange !== undefined;
  return (
    <label className="relative flex flex-1 cursor-pointer items-center justify-center border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium transition-colors hover:border-zinc-400 has-[:checked]:border-[#EB0A1E] has-[:checked]:bg-[#EB0A1E] has-[:checked]:text-white dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600">
      <input
        type="radio"
        name={name}
        value={value}
        {...(controlled
          ? { checked: !!checked, onChange: onChange ?? (() => {}) }
          : { defaultChecked })}
        className="sr-only"
      />
      <span>{label}</span>
    </label>
  );
}
