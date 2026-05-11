/**
 * VIN validation — pattern + ISO 3779 check-digit + Toyota WMI gate.
 *
 * Real-world VINs follow ISO 3779. The 9th character is a check digit
 * computed deterministically from the other 16. Spam bots typing random
 * 17-character strings will fail this ~91% of the time.
 */

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/i;

// Toyota & Lexus World Manufacturer Identifier prefixes (first 3 chars).
// Tundras built in San Antonio are 5TF; Mexican / Japanese builds get
// different WMIs. Whitelisting the common ones rejects most fake VINs.
const TOYOTA_WMI = new Set([
  "5TF", "5TD", "5TE", "5TY", "5TB",   // Toyota USA (San Antonio, others)
  "JTM", "JTN", "JTE", "JTH", "JTJ",   // Toyota Japan
  "JTD", "JTK", "JTL",
  "4T1", "4T3", "4T4",                 // Toyota Georgetown
  "2T1", "2T2", "2T3",                 // Toyota Canada
  "JTH", "JTJ",                        // Lexus
  "JTHB",                              // Lexus LX600 (4-char prefix tolerated)
]);

// VIN transliteration table per ISO 3779. I/O/Q can't appear in VINs.
const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5,        P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
  "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Position-10 model-year code. Range covers 1980 → 2039 (then cycles).
// We only accept the years a 3rd-gen Tundra could plausibly be (2022+).
const YEAR_CODE: Record<string, number> = {
  N: 2022, P: 2023, R: 2024, S: 2025, T: 2026, V: 2027, W: 2028,
};

export interface VinCheckResult {
  ok: boolean;
  reason?: string;
}

/** Validate VIN format, ISO 3779 check digit, Toyota WMI, plausible MY. */
export function validateVin(raw: string): VinCheckResult {
  const vin = raw.trim().toUpperCase();
  if (!VIN_RE.test(vin)) {
    return { ok: false, reason: "VIN must be exactly 17 characters (no I/O/Q)." };
  }

  // Toyota WMI check. We try 3-char prefix; some Lexus VINs use 4.
  if (!TOYOTA_WMI.has(vin.slice(0, 3)) && !TOYOTA_WMI.has(vin.slice(0, 4))) {
    return { ok: false, reason: "VIN doesn't match a Toyota or Lexus manufacturer code." };
  }

  // ISO 3779 check digit.
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i];
    const t = TRANSLIT[ch];
    if (t === undefined) return { ok: false, reason: `Invalid character at position ${i + 1}.` };
    sum += t * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  if (vin[8] !== expected) {
    return { ok: false, reason: "VIN check digit is invalid. Re-check what you typed." };
  }

  // Plausible model year. 3rd-gen Tundra runs 2022+.
  const my = YEAR_CODE[vin[9]];
  if (!my || my < 2022 || my > new Date().getFullYear() + 1) {
    return { ok: false, reason: "VIN model-year code doesn't match a 3rd-gen Tundra (2022+)." };
  }

  return { ok: true };
}
