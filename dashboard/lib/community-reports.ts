/**
 * Anonymized aggregate of owner reports from three private Toyota Tundra
 * Facebook groups, hand-curated 2026-05-14.
 *
 * Source raw JSON is in `data/facebook-mining/` (local-only, gitignored —
 * member identities never leave the local machine). This file contains only
 * the anonymized aggregates, post bodies with author names stripped, and
 * dealer-specific identifiers removed where they could de-anonymize a
 * specific owner.
 *
 * Why a TypeScript constant and not a D1 table: the dataset is small
 * (24 findings), hand-curated, and unlikely to grow without another mining
 * session. Embedding as a constant keeps the public dashboard self-contained
 * and avoids over-engineering an ingest pipeline for ~24 rows.
 */
import "server-only";

export interface CommunityReportStats {
  total_findings: number;
  with_explicit_mileage: number;
  hybrid_failures: number;
  non_hybrid_failures: number;
  replacement_engines_with_issues: number;
  denied_recall_coverage: number;
  extended_dealer_wait_cases: number;
  mileage_min: number;
  mileage_max: number;
  hybrid_mileage_cluster: string;
}

export interface CommunityQuote {
  id: string;
  tag: string;
  headline: string;
  body: string;
  model_year: number | null;
  powertrain: "i-FORCE (non-hybrid)" | "i-FORCE MAX (hybrid)" | "unspecified" | null;
  mileage: number | null;
  significance: string;
}

export const COMMUNITY_STATS: CommunityReportStats = {
  total_findings: 24,
  with_explicit_mileage: 12,
  hybrid_failures: 4,
  non_hybrid_failures: 6,
  replacement_engines_with_issues: 3,
  denied_recall_coverage: 1,
  extended_dealer_wait_cases: 1,
  mileage_min: 20800,
  mileage_max: 82000,
  hybrid_mileage_cluster: "40k–46k mi",
};

/**
 * Mileage data points pulled from explicit owner statements. Used by the
 * /lifespan page to overlay community-sourced points on top of NHTSA
 * complaints. All entries are anonymous — no author or dealer attribution.
 */
export interface CommunityMileagePoint {
  model_year: number;
  powertrain: "i-FORCE" | "i-FORCE MAX" | "unspecified";
  mileage: number;
  outcome:
    | "failure_no_remedy"
    | "failure_recall_denied"
    | "failure_recall_swap"
    | "proactive_recall_swap"
    | "failure_post_swap"
    | "post_swap_codes";
  note: string;
}

export const COMMUNITY_MILEAGE_POINTS: CommunityMileagePoint[] = [
  { model_year: 2022, powertrain: "i-FORCE", mileage: 22985, outcome: "failure_recall_swap",     note: "Confirmed via Toyota Owner Portal lookup" },
  { model_year: 2022, powertrain: "i-FORCE", mileage: 40000, outcome: "proactive_recall_swap",   note: "Replacement engine subsequently died at ~47k mi" },
  { model_year: 2022, powertrain: "i-FORCE", mileage: 47000, outcome: "failure_post_swap",       note: "Replacement engine failed catastrophically 7k mi after swap" },
  { model_year: 2022, powertrain: "i-FORCE", mileage: 70000, outcome: "proactive_recall_swap",   note: "Original engine was running strong; later P0016 code on replacement" },
  { model_year: 2022, powertrain: "i-FORCE", mileage: 82000, outcome: "proactive_recall_swap",   note: "TRD Off Road, 3-year owner, no prior issues" },
  { model_year: 2023, powertrain: "unspecified", mileage: 37000, outcome: "failure_recall_swap", note: "Truck has been at dealer 5+ months waiting for replacement" },
  { model_year: 2023, powertrain: "i-FORCE", mileage: 38000, outcome: "proactive_recall_swap",   note: "Limited; only symptom was a slight throttle delay" },
  { model_year: 2024, powertrain: "unspecified", mileage: 20800, outcome: "failure_no_remedy",   note: "25V767 in-scope but Toyota's remedy isn't available yet" },
  { model_year: 2024, powertrain: "i-FORCE", mileage: 22700, outcome: "failure_recall_denied",   note: "SR5 seized on highway; Toyota refused recall, doing engine rebuild" },
  { model_year: 2024, powertrain: "i-FORCE MAX", mileage: 40000, outcome: "failure_no_remedy",   note: "Seized at a stoplight, towed" },
  { model_year: 2024, powertrain: "i-FORCE MAX", mileage: 40000, outcome: "failure_no_remedy",   note: "Platinum hybrid; shuttering, limp mode, hybrid + engine warnings" },
  { model_year: 2024, powertrain: "i-FORCE MAX", mileage: 46000, outcome: "failure_no_remedy",   note: "Platinum hybrid; long-time Toyota family" },
  { model_year: 2024, powertrain: "i-FORCE", mileage: 78000, outcome: "failure_no_remedy",       note: "Highway limp mode, white smoke, oil in exhaust tip" },
];

/**
 * Anonymized quotes — verbatim post bodies with author names stripped.
 * The bodies themselves contain no PII (no full names, addresses, VINs,
 * or phone numbers); only first-person stories.
 */
export const COMMUNITY_QUOTES: CommunityQuote[] = [
  {
    id: "fb-002",
    tag: "REPLACEMENT_ENGINE_FAILED",
    headline: "The recall replacement is not always a permanent fix",
    body: "Greetings everyone. Sorry for my first post here to be a sad one. I own a 2022 Tundra that I absolutely love. My original engine ran perfectly fine, but I went ahead with the recall replacement last October at 40k miles. Everything seemed to be going to plan and the new engine was running well. Fast forward to two days ago, while driving 30 miles an hour down a busy street… it failed. Loud bang and grinding and then straight to limp mode. Wouldn't turn over again… DEAD. 47k …",
    model_year: 2022,
    powertrain: "i-FORCE (non-hybrid)",
    mileage: 47000,
    significance:
      "Documented case of a 24V381 recall replacement engine itself failing 7k mi after the swap. Three separate replacement-engine-issues cases in our data — current dashboards implicitly treat engine swap as a permanent fix, but the community sees it differently.",
  },
  {
    id: "fb-022",
    tag: "EXTENDED_DEALER_WAIT",
    headline: "\"Recall available\" doesn't mean \"engine in stock\"",
    body: "The dealership has had my 2023 Toyota tundra since December 20th 2025. It is now May of 2026. No time frame for my engine replacement. Engine went at 37k. Yes I have a loaner but restricted to leave the state. Do I need to go above the dealership and see if Toyota can improve the replacement time frame?",
    model_year: 2023,
    powertrain: "unspecified",
    mileage: 37000,
    significance:
      "Five-plus months without an ETA. Toyota's §573 quarterly remedy counts capture vehicles eventually fixed but don't measure how long owners wait between failure and remedy.",
  },
  {
    id: "fb-024",
    tag: "HYBRID_FAILURE_CLUSTER",
    headline: "Hybrid V35A failures cluster at 40-46k mi",
    body: "Well it finally happened. 2024 platinum hybrid with 40,000 miles and just had it serviced. Engine started shuttering and went into limp mode. Hybrid malfunction warning came on as well as engine warning. Think the engine is toast.",
    model_year: 2024,
    powertrain: "i-FORCE MAX (hybrid)",
    mileage: 40000,
    significance:
      "Fourth documented hybrid V35A failure. All four are 2024 i-FORCE MAX Platinum-class trucks at 40-46k mi. NHTSA complaints under-represent hybrid failures because the hybrid V35A is rarer in the fleet — direct owner reports confirm hybrids fail too.",
  },
  {
    id: "fb-018",
    tag: "RECALL_COVERAGE_DENIED",
    headline: "Same failure mode, refused recall coverage",
    body: "Last week my 2024 Tundra SR5 shutdown while driving down I95, no warning just shut down. Today Toyota calls me and says it's the engine, something metal broke off inside and seized the engine. The truck has 22,700 miles on it and had all regular maintenance done. Since my engine isn't part of the recall Toyota won't be replacing the engine, instead they are shipping all the parts to rebuild the engine.",
    model_year: 2024,
    powertrain: "i-FORCE (non-hybrid)",
    mileage: 22700,
    significance:
      "Toyota's §573 explicitly says \"not all 2022-2024 vehicles\" in the date range are covered. This is one concrete example: classic main-bearing-debris failure mode, but the VIN was outside Toyota's defined scope. The affected population is wider than the recall-covered population.",
  },
];
