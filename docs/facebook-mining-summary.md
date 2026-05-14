# Facebook owner-group mining — summary

Hand-curated extraction of V35A engine-failure / engine-replacement
reports from three Toyota Tundra Facebook groups, captured 2026-05-14
via Chrome DevTools MCP (manual reading + JS DOM extraction; no
automated scraping; no member identities leave the local machine).

## Groups mined

| Group | ID | Findings |
|---|---|---|
| 2022+ Toyota Tundra i-FORCE MAX Hybrid | 568211129429141 | 1 confirmed replacement |
| Toyota Tundra's "2022-2026" Owners Group | 1004155144627915 | 5 findings (3 with mileage) |
| 2023-2027 Toyota Tundra Owners | 416962283933995 | 18 findings (9 with mileage) |

**24 findings total** across 9 keyword sweeps (`engine replaced`,
`engine failure`, `main bearing`, `seized`, `knock`, `swap`, `recall`,
`limp mode`, `lemon`).

## Mileage data points (12)

| Model year | Powertrain | Mileage | Context |
|---|---|---|---|
| 2022 | non-hybrid | 22,985 | Failure-driven; confirmed via Toyota Owner Portal |
| 2022 | non-hybrid | 40,000 | Proactive recall swap; **replacement died at 47k** |
| 2022 | non-hybrid | 70,000 | Proactive recall swap (original still strong) |
| 2022 | non-hybrid (TRD Off Road) | 82,000 | Proactive recall swap, no prior issues |
| 2023 | unspecified | 37,000 | Failure-driven; **truck sat at dealer 5+ months** waiting for swap |
| 2023 | Limited | 38,000 | Proactive swap; pre-symptom = throttle delay |
| 2023 | SR (used market) | 104k body / 3k new motor | Used-market listing post-swap |
| 2024 | unspecified | 20,800 | Catastrophic failure, 25V767 no remedy yet |
| 2024 | non-hybrid SR5 | 22,700 | Seized highway shutdown — **recall DENIED** |
| 2024 | i-FORCE MAX hybrid (Platinum) | 40,000 | Shuttering + limp mode |
| 2024 | i-FORCE MAX hybrid | 40,000 | Seized at a stoplight |
| 2024 | i-FORCE MAX hybrid (Platinum) | 46,000 | Catastrophic |
| 2024 | non-hybrid | 78,000 | White smoke, oil in exhaust |

## Key analytical findings

### 1. Hybrid V35A failures are real and cluster around 40-46k mi

Four documented hybrid failures, all 2024 i-FORCE MAX:

- #10: Platinum, 46k mi
- #16: WA owner, mileage unknown ("catastrophic")
- #19: 40k mi, seized at a stoplight
- #24: Platinum, 40k mi, shuttering + limp mode

Most NHTSA complaint data is non-hybrid because hybrid V35A is rarer
in the fleet. These owner reports confirm hybrids fail too — Toyota's
own §573 includes the i-FORCE MAX in 24V381 and 25V767. /lifespan
needs a callout: **"Hybrid V35A failures cluster around 40-46k mi
based on direct owner reports."**

### 2. Replacement-engine reliability concern (3 cases)

Of the proactive/early recall replacements found, 3 had subsequent
issues:

- **#2**: Replaced at 40k mi (October 2025), new engine **died at
  47k mi** with "loud bang and grinding, limp mode, wouldn't restart"
  — only ~7k mi / 7 months after the swap. Original engine was running
  fine when swapped.
- **#5**: Replaced at 70k mi (September 2025). Five months later
  (February 2026) truck "broke down, missing sound, stalled out, P0016
  code." Dealer cleared codes + ECU update; no second swap.
- **#12**: Replaced 2 months prior. On road trip: "warning lights
  flashing, CEL on, reverse camera flickering, won't shift gears."
  Dealer cleared codes, couldn't reproduce, sent owner on.

**Current /lifespan implicitly treats engine swap as a permanent fix.
The FB data suggests it isn't always.** Community is asking openly
whether replacement engines are reliable (#6, #14, #17).

### 3. Remedy throughput is broken for some VINs (#22, #15)

- **#22**: 2023 Tundra at dealer **since December 20, 2025**. As of
  the post in May 2026, that's ~146 days with no ETA for an engine.
  Owner has loaner but restricted to state.
- **#15**: Owner with August 2023 build date estimates "November or
  December or maybe even early 2027" before they get a new engine.

Toyota's §573 targets ~August 2026 for remedy availability on 25V767.
**In practice some owners are waiting 5+ months past failure with no
ETA**, and the remedy is slipping past the §573 target. /lifespan's
remediation-progress chart should add a caveat that "remedy available"
does not mean "engine in stock at dealer."

### 4. Recall coverage refused on classic-V35A failure (#18)

A 2024 SR5 at 22,700 mi seized on the highway with "metal broke off
inside" — the exact main-bearing-debris failure mode from Toyota's
§573. Toyota refused recall coverage (VIN out of scope) and is
rebuilding the engine instead of swapping it.

Toyota's §573 explicitly says **"not all 2022-2024 vehicles" in the
date range are covered**. This is a concrete example: a clear V35A
failure mode without recall coverage. The affected population is
wider than the recall-covered population.

### 5. Toyota Owner Portal disagrees with NHTSA (#9 — reconfirmed)

One owner says they checked two VINs on toyota.com/owners:

- '22 truck: portal correctly showed engine replacement at 22,985 mi
- '23 TRD: portal says "no recall" but NHTSA shows 25TB14 active

This matches our findings from `docs/toyota-portal-experiment.md`:
the owner portal's recall data disagrees with NHTSA. Don't trust the
portal as ground truth.

### 6. Community-aware of "improved batch" for 2025/26

Multiple posts (#8, #11, #17) reference that 2025/26 V35As come from
the "improved batch" with updated fuel system, turbos, and main
bearings — matching Toyota's §573 statement on revised production.
Resale implication: buyers are increasingly aware that pre-2025 V35As
are higher-risk and will price accordingly.

### 7. Pre-failure symptom: throttle response delay (#23)

One owner doing a proactive recall swap mentioned "small delay in
response time when accelerating" as their only noticeable issue
pre-swap. Worth adding to the `/submit` form as a symptom checkbox.

### 8. Hearsay: replacement may void extended warranty (#11)

UNVERIFIED rumor circulating: engine replacement under recall may drop
coverage from Toyota's extended 100k-mile warranty to a 1-year warranty
on the new motor. Owner said a coworker sold his 2025 for this reason.
Needs cross-check against Toyota's actual §573 remedy terms before
publishing.

### 9. V35A defect extends beyond Tundra (#20)

Out-of-scope but worth noting: 2021 Tacoma owner reports engine
failure at 53k mi with extended-warranty dispute. Tacoma uses a
related turbo i-FORCE engine. Suggests Toyota's quality issues are
broader than the Tundra-only narrative.

## Methodology

- All posts were read manually after navigating with Chrome DevTools
  MCP to FB group search results.
- No automated scraping. Each finding extracted via on-page JavaScript
  that filtered visible text by relevance keywords.
- Author names captured where available; FB scrambles permalinks +
  timestamps in search results, so dates are approximate.
- All findings stored as JSON in `data/facebook-mining/` (gitignored
  — no member identities are shipped publicly).
- Public summary (this doc) has anonymized aggregates only.

## What to do next

1. **Surface key FB findings on /lifespan** as a new section
   "What owners are reporting in private Facebook groups" with the
   anonymized aggregates from this doc — counts, mileage ranges,
   ratios. Most impactful single change.
2. **Add a "replacement-engine reliability" angle** to /lifespan —
   current narrative implicitly treats engine swap as permanent. FB
   data says otherwise for at least some trucks.
3. **Add "remedy throughput" caveat** — "recall available" ≠ "engine
   in stock at dealer." Some VINs are waiting 5+ months past failure.
4. **Add throttle-delay pre-symptom** to `/submit` form fields.
5. **Verify the warranty-voids-after-replacement hearsay** before
   publishing as fact.
6. **Optionally**: invite the WA hybrid-failure owner (#16) to use
   `/submit` so we get a documented full record.
