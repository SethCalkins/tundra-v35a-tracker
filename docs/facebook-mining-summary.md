# Facebook owner-group mining — summary

Hand-curated extraction of V35A engine-failure / engine-replacement
reports from three Toyota Tundra Facebook groups, captured 2026-05-14
via Chrome DevTools MCP (manual reading + JS DOM extraction; no
automated scraping).

## Groups mined

| Group | ID | Findings |
|---|---|---|
| 2022+ Toyota Tundra i-FORCE MAX Hybrid | 568211129429141 | 1 confirmed replacement |
| Toyota Tundra's "2022-2026" Owners Group | 1004155144627915 | 5 findings (3 with mileage) |
| 2023-2027 Toyota Tundra Owners | 416962283933995 | 12 findings (5 with mileage) |

## Mileage data points (8)

| Model year | Powertrain | Mileage | Context |
|---|---|---|---|
| 2022 | non-hybrid | 22,985 | Failure-driven; confirmed via Toyota Owner Portal |
| 2022 | non-hybrid | 40,000 | Proactive recall swap; **replacement died at 47k** |
| 2022 | non-hybrid | 70,000 | Proactive recall swap (original still strong) |
| 2022 | non-hybrid (TRD Off Road) | 82,000 | Proactive recall swap, no prior issues |
| 2024 | unspecified | 20,800 | Catastrophic failure, 25V767 no remedy yet |
| 2024 | non-hybrid SR5 | 22,700 | Seized highway shutdown — **recall DENIED** |
| 2024 | i-FORCE MAX hybrid (Platinum) | 46,000 | First confirmed HYBRID failure in our dataset |
| 2023 | non-hybrid SR | (104k body / 3k new motor) | Used-market listing with prior swap |

## Key analytical findings

### 1. Replacement-engine reliability concern (3 cases)

Of the proactive/early recall replacements we found, 3 had subsequent
issues:

- **#2**: Replaced at 40k mi (October 2025), new engine **died at 47k mi**
  with "loud bang and grinding, limp mode, wouldn't restart" — only
  ~7k mi / 7 months after the swap. Original engine was running fine.
- **#5**: Replaced at 70k mi (September 2025). Five months later
  (February 2026) truck "broke down, missing sound, stalled out, P0016
  code." Dealer cleared codes + ECU update; no second swap.
- **#12**: Replaced 2 months prior. On road trip: "warning lights
  flashing, CEL on, reverse camera flickering, won't shift gears."
  Dealer cleared codes, couldn't reproduce, sent owner on.

Community is asking openly whether replacement engines are reliable
(#6, #14). Worth surfacing on /lifespan as: "Confirmed replacements
are not always permanent fixes."

### 2. Hybrid V35A failures (2 confirmed)

Most NHTSA complaint data is non-hybrid. Direct owner reports here
confirm hybrid V35A failures happen too:

- **#10**: 2024 Platinum i-FORCE MAX, failed at 46,000 mi
- **#16**: 2024 hybrid in Washington State, "catastrophic engine
  failure"

Reinforces /lifespan argument: same engine block, same defect,
regardless of powertrain. Toyota's §573 confirms this (24V381 and
25V767 both include i-FORCE MAX trims).

### 3. Recall coverage refused on classic-V35A failure (#18)

A 2024 SR5 at 22,700 mi seized on the highway with "metal broke off
inside" — the exact main-bearing-debris failure mode in Toyota's §573.
Toyota refused recall coverage (VIN out of scope) and is rebuilding
the engine instead of swapping it. Three possibilities:

1. VIN genuinely falls outside the 25V767 production window. Toyota's
   §573 explicitly says "not all 2022-2024 vehicles" are covered.
2. Toyota is being restrictive in defining 'in scope' to limit recall
   exposure.
3. Dealer didn't properly verify eligibility.

For /lifespan: shows the affected population is wider than the
recall-covered population.

### 4. Remedy delay slipping (#15)

Owner with August 2023 build date estimates "November or December or
maybe even early 2027" before their truck gets a new engine. That's
past Toyota's §573-stated ~August 2026 target. /lifespan's
remediation-progress section may need a caveat that the 25V767 remedy
date is slipping.

### 5. Toyota Owner Portal data discrepancy reconfirmed (#9)

One owner says they looked up two VINs on toyota.com/owners:

- '22 truck: portal correctly showed recall replacement at 22,985 mi
- '23 TRD: portal says "no recall" but NHTSA shows 25TB14 active

This matches what we documented in
`docs/toyota-portal-experiment.md`: the owner portal's recall data
disagrees with NHTSA. Don't trust the portal as ground truth.

### 6. Community-aware of "improved batch" (2025/26 engines)

Multiple posts (#8, #11, #17) reference that 2025/26 V35As come from
"the improved batch" with updated fuel system, turbos, and main
bearings. Toyota's §573 confirms this. For /lifespan resale framing:
buyers are increasingly aware that pre-2025 V35As are higher-risk and
will discount accordingly — eventually.

### 7. Hearsay: replacement voids extended warranty (#11)

Unverified rumor: engine replacement under recall may drop coverage
from Toyota's extended 100k mile warranty to a 1-year-on-the-new-motor
warranty. Worth verifying against Toyota's actual remedy terms before
publishing.

## Methodology

- All posts were read manually after navigating with Chrome DevTools
  MCP to FB group search results.
- No automated scraping. Each finding was extracted via on-page
  JavaScript that filters visible text by relevance keywords.
- Author names captured where shown but the post-to-author mapping is
  uncertain in some cases (FB search results don't expose unique
  permalinks per post in the a11y tree).
- All findings stored as JSON in `data/facebook-mining/` (gitignored
  — no member identities are shipped publicly).
- Anonymized aggregate stats only would appear on /lifespan.

## What to do next

1. **Surface key findings on /lifespan** as a new section:
   "What owners are reporting in private Facebook groups (hand-curated)"
   with anonymized aggregate stats — counts, mileage ranges, ratios.
2. **Verify the warranty-voids hearsay (#11)** against Toyota's §573
   remedy terms before publishing as fact.
3. **Add the "replacement-engine reliability" framing** to /lifespan —
   our current narrative assumes a swap is permanent. The FB data
   suggests it isn't always.
4. **Optionally**: invite the WA hybrid-failure owner (#16) to use
   /submit so we get a documented full record. They're already
   organizing — could be a community ambassador.
