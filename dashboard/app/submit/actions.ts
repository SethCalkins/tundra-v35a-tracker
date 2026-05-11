"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";

import { query, queryOne } from "@/lib/db";
import { validateVin } from "@/lib/vin-validation";

// Per-IP rate limit. Submissions are low-volume from any single owner.
const RATE_LIMIT_PER_HOUR = 3;
const RATE_LIMIT_PER_DAY = 8;

export interface SubmitState {
  ok: boolean;
  error?: string;
  message?: string;
}

const nowIso = () => new Date().toISOString();

export async function submitUserReport(
  prev: SubmitState | null,
  formData: FormData,
): Promise<SubmitState> {
  // Honeypot — real users won't fill the hidden field.
  const honeypot = String(formData.get("website") ?? "").trim();
  if (honeypot) {
    await query(
      `INSERT INTO user_submissions
        (submitted_at, vin, engine_replaced, honeypot_failed, ip_address, user_agent)
       VALUES (?, '00000000000000000', 0, 1, ?, ?)`,
      [nowIso(), await getIp(), await getUserAgent()],
    );
    return { ok: true, message: "Thanks for your report." };
  }

  // Turnstile — server-side verification. Skipped if no secret configured
  // (so local dev keeps working without a key).
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();
  const turnstileOk = await verifyTurnstile(turnstileToken, await getIp());
  if (!turnstileOk) {
    return { ok: false, error: "Bot check failed. Please reload and try again." };
  }

  const vin = String(formData.get("vin") ?? "").trim().toUpperCase();
  const vinCheck = validateVin(vin);
  if (!vinCheck.ok) {
    return { ok: false, error: vinCheck.reason ?? "Invalid VIN." };
  }

  // Per-IP rate limit. Uses the existing user_submissions table — no extra
  // storage needed. Counts non-honeypot rows from this IP in the last hour
  // and last 24 hours.
  const ip = await getIp();
  if (ip) {
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString();
    const oneDayAgo  = new Date(Date.now() - 86400_000).toISOString();
    const rate = await queryOne<{ last_hour: number; last_day: number }>(
      `SELECT
         SUM(CASE WHEN submitted_at > ? THEN 1 ELSE 0 END) AS last_hour,
         SUM(CASE WHEN submitted_at > ? THEN 1 ELSE 0 END) AS last_day
        FROM user_submissions
       WHERE ip_address = ? AND honeypot_failed = 0`,
      [oneHourAgo, oneDayAgo, ip],
    );
    const lastHour = rate?.last_hour ?? 0;
    const lastDay  = rate?.last_day  ?? 0;
    if (lastHour >= RATE_LIMIT_PER_HOUR || lastDay >= RATE_LIMIT_PER_DAY) {
      return {
        ok: false,
        error:
          "Thanks — looks like you've already submitted recently. Try again later, or email us if you have multiple trucks to report.",
      };
    }
  }

  const engineReplaced = formData.get("engine_replaced") === "yes";
  const replacementDateStr = String(formData.get("replacement_date") ?? "").trim();
  const replacementMileageStr = String(formData.get("replacement_mileage") ?? "").trim();
  const currentMileageStr = String(formData.get("current_mileage") ?? "").trim();
  const wasTowed = formData.get("was_towed") === "yes";
  const underRecall = formData.get("under_recall") === "yes";
  const recallCampaign = String(formData.get("recall_campaign") ?? "").trim().toUpperCase() || null;
  const failureMode = String(formData.get("failure_mode") ?? "").trim() || null;
  const dealerName = String(formData.get("dealer_name") ?? "").trim() || null;
  const dealerState = String(formData.get("dealer_state") ?? "").trim().toUpperCase().slice(0, 2) || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const submitterEmail = String(formData.get("email") ?? "").trim().toLowerCase() || null;
  const modelYearStr = String(formData.get("model_year") ?? "").trim();
  const trim = String(formData.get("trim") ?? "").trim() || null;
  const isHybridStr = String(formData.get("is_hybrid") ?? "").trim();

  const parseInt2 = (s: string): number | null => {
    if (!s) return null;
    const n = parseInt(s.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  };
  // D1/SQLite stores booleans as integers.
  const toIntBool = (v: boolean | null): number | null => (v === null ? null : v ? 1 : 0);

  const isHybrid: boolean | null =
    isHybridStr === "yes" ? true : isHybridStr === "no" ? false : null;

  if (engineReplaced && !replacementMileageStr) {
    return { ok: false, error: "If the engine was replaced, please enter the replacement mileage." };
  }
  if (submitterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
    return { ok: false, error: "Please enter a valid email or leave it blank." };
  }

  try {
    await query(
      `INSERT INTO user_submissions
        (submitted_at, vin, model_year, trim, is_hybrid, current_mileage,
         engine_replaced, replacement_date, replacement_mileage, failure_mode, was_towed,
         dealer_name, dealer_state, under_recall, recall_campaign,
         notes, submitter_email, ip_address, user_agent)
       VALUES
        (?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?,
         ?, ?, ?, ?,
         ?, ?, ?, ?)`,
      [
        nowIso(),
        vin,
        parseInt2(modelYearStr),
        trim,
        toIntBool(isHybrid),
        parseInt2(currentMileageStr),
        engineReplaced ? 1 : 0,
        replacementDateStr || null,
        parseInt2(replacementMileageStr),
        failureMode,
        engineReplaced ? (wasTowed ? 1 : 0) : null,
        dealerName,
        dealerState,
        engineReplaced ? (underRecall ? 1 : 0) : null,
        engineReplaced ? recallCampaign : null,
        notes,
        submitterEmail,
        await getIp(),
        await getUserAgent(),
      ],
    );
  } catch (e) {
    console.error("submission failed", e);
    return { ok: false, error: "Submission failed — try again or check the format." };
  }

  redirect("/submit/thanks");
}

async function getIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    null
  );
}

async function getUserAgent(): Promise<string | null> {
  const h = await headers();
  return h.get("user-agent");
}

async function verifyTurnstile(token: string, remoteip: string | null): Promise<boolean> {
  // Pull secret from Worker env (set with `wrangler secret put TURNSTILE_SECRET`).
  // If no secret is configured, skip verification — allows local dev / public-bootstrap.
  let secret: string | undefined;
  try {
    const { env } = getCloudflareContext();
    secret = (env as unknown as { TURNSTILE_SECRET?: string }).TURNSTILE_SECRET;
  } catch {
    return true;
  }
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteip) body.set("remoteip", remoteip);

  try {
    const r = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body },
    );
    const j = (await r.json()) as { success?: boolean };
    return !!j.success;
  } catch (e) {
    console.error("turnstile verify failed", e);
    return false;
  }
}
