-- One-time dedupe + add UNIQUE indices so re-ingests are idempotent.

-- listing_observations: one row per (vin, observed_at, source)
DELETE FROM listing_observations
 WHERE id NOT IN (
   SELECT MIN(id) FROM listing_observations
    GROUP BY vin, observed_at, source
 );
CREATE UNIQUE INDEX IF NOT EXISTS ux_listing_obs_vin_observed_source
  ON listing_observations(vin, observed_at, source);

-- recall_status_events: one row per (vin, recall_id, observed_at, new_status)
DELETE FROM recall_status_events
 WHERE id NOT IN (
   SELECT MIN(id) FROM recall_status_events
    GROUP BY vin, recall_id, observed_at, new_status
 );
CREATE UNIQUE INDEX IF NOT EXISTS ux_recall_events_natural_key
  ON recall_status_events(vin, recall_id, observed_at, new_status);

-- carfax_observations: one row per (vin, observed_at, source)
DELETE FROM carfax_observations
 WHERE id NOT IN (
   SELECT MIN(id) FROM carfax_observations
    GROUP BY vin, observed_at, source
 );
CREATE UNIQUE INDEX IF NOT EXISTS ux_carfax_obs_vin_observed_source
  ON carfax_observations(vin, observed_at, source);
