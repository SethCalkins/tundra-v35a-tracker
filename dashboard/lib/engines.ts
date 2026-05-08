/**
 * Friendly names for the engine codes NHTSA's vPIC API returns.
 * Toyota uses internal model codes that nobody recognises by sight.
 */

export interface EngineInfo {
  short: string;
  long: string;
  generation: "3rd" | "2nd" | "1st" | "?";
  recallEligible: boolean;
}

export function decodeEngine(raw: string | null): EngineInfo {
  const v = (raw ?? "").toUpperCase().replace(/\s/g, "");
  // 3rd gen V35A
  if (v.includes("V35A") && v.includes("1TM")) {
    return {
      short: "i-FORCE MAX",
      long: "3.5L twin-turbo V6 + 1TM hybrid motor (V35A-FTS + 1TM)",
      generation: "3rd",
      recallEligible: true,
    };
  }
  if (v.includes("V35A")) {
    return {
      short: "i-FORCE",
      long: "3.5L twin-turbo V6 (V35A-FTS)",
      generation: "3rd",
      recallEligible: true,
    };
  }
  // 2nd gen V8s
  if (v.includes("3UR")) {
    return {
      short: "5.7L V8",
      long: "5.7L 3UR-FE V8 (2nd gen iForce)",
      generation: "2nd",
      recallEligible: false,
    };
  }
  if (v.includes("1UR")) {
    return {
      short: "4.6L V8",
      long: "4.6L 1UR-FE V8 (2nd gen base)",
      generation: "2nd",
      recallEligible: false,
    };
  }
  if (v.includes("1GR")) {
    return {
      short: "4.0L V6",
      long: "4.0L 1GR-FE V6 (2nd gen base, rare)",
      generation: "2nd",
      recallEligible: false,
    };
  }
  if (!raw) {
    return { short: "?", long: "Unknown engine", generation: "?", recallEligible: false };
  }
  return { short: raw, long: raw, generation: "?", recallEligible: false };
}
