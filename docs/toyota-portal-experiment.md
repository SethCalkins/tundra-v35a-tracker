# Toyota Owner Portal — feasibility experiment (closed)

## Goal

Determine whether `toyota.com/owners/vehicle-dashboard/` could serve as a
mass-data source for ground-truth "engine replaced" / service-history
data on our 239-truck V35A inventory.

## Setup

Driven via Chrome DevTools MCP against a logged-in Toyota account.
Captured the actual XHR calls during VIN add attempts.

## API discovered

**Endpoint:** `POST https://prod2.webservices.toyota.com/v1/customer/vehicles`

**Auth:** `Authorization: Bearer <JWT id_token>`
  - Issued by `account.toyota.com` OAuth flow on login
  - ~1 hour lifetime
  - Contains: email, customer subname, audience `TMNA_Owners`

**Body shape:**
```json
{
  "modelYearList": [],
  "VinList": [{"vin": "5TFJA5DA3NX004821"}],
  "tokenAttributes": {
    "xauthToken": "<reCAPTCHA Enterprise token, fresh per request>",
    "xconsumer": "TDRMT",
    "xreferrer": "https://www.toyota.com/"
  }
}
```

**Anti-bot stack:** reCAPTCHA Enterprise (`6LdgInQiAAAAA...`) + AWS WAF Bot
Manager (`f98792672267.edge.sdk.awswaf.com`) telemetry/report beacons.

## Results — three VIN add attempts

| VIN | HTTP | Code | Message |
|---|---|---|---|
| 5TFJA5DA3NX004821 (2022 Limited) | 400 | `B007` | "Vehicle already added" |
| 5TFJA5DA8NX051066 (2022 Limited) | 400 | `B007` | "Vehicle already added" |
| 5TFJA5DB3NX019800 (2022 Limited) | 500 | `P004` | "Process Error — We are having trouble processing your request" |

## Interpretation

`B007` is Toyota's gate against adding a VIN that already has an
owner-record in their CRM — i.e., almost every used vehicle. Earlier
the user successfully added two unrelated VINs (5TFNA5DB0PX079716 and
5TFJA5DB2PX114383) — those were apparently not in the same "registered
owner" state, but it isn't reproducible for our scraped Carvana
inventory.

`P004` is Toyota's generic upstream-failure code — either transient,
or a soft block on automated patterns.

## What the portal *does* give us (for one's own VIN)

For VINs successfully attached to an account, the dashboard reveals:
- Full dealer service history (date, mileage, location, line items)
- Recall service records (e.g., `SAFETY RECALL 25TA14`) with status
  `CUSTOMER DECLINED` / `COMPLETED` / `REMEDY IN DEVELOPMENT`
- `Print All` and `Download All` buttons (PDFs)

Two example captures are in this directory:
- `5TFNA5DB0PX079716.json` (2023 Platinum, 42,566 mi, Kokomo Toyota)
- `5TFJA5DB2PX114383.json` (2023 Limited, 72,843 mi, Family Toyota of Arlington)

## Conclusion

**Not viable as an automated source.** The B007 gate plus the reCAPTCHA
challenge plus the 1-hour JWT plus Toyota's WAF telemetry make
programmatic mass-add impossible without violating ToS and risking the
user's Toyota account.

**Viable as an owner-driven source.** Each owner who registers their
own VIN gets unredacted ground-truth data. The legitimate scale path is
to add a "Upload your Toyota Owner Portal service-history PDF" field
to `/submit` and let owners voluntarily share — one VIN at a time,
verified by the owner, with full provenance.
