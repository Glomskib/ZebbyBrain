-- Migration 004: Multi-Entry Symptoms + Flexible AI Lookbacks
-- Allow multiple symptom entries per day with precise timestamps
-- Each entry becomes independent with its own timestamp and weather data

-- 1) Add user_id to symptom_entries for flatter model (allows direct queries without join)
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS user_id VARCHAR;

-- 2) Add occurred_at timestamp to symptom_entries
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ;

-- 3) Add weather fields to symptom_entries (move from parent log to individual entries)
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS weather_temp_c NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS weather_text TEXT,
  ADD COLUMN IF NOT EXISTS weather_observed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS lon NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS weather_source VARCHAR;

-- 4) Add vitals/context fields to symptom_entries (for per-entry context)
ALTER TABLE symptom_entries
  ADD COLUMN IF NOT EXISTS water_intake_current_ml INTEGER,
  ADD COLUMN IF NOT EXISTS heart_rate_bpm INTEGER,
  ADD COLUMN IF NOT EXISTS sodium_intake_current_mg INTEGER;

-- 5) Backfill user_id from parent symptom_logs
UPDATE symptom_entries se
SET user_id = sl.user_id
FROM symptom_logs sl
WHERE se.symptom_log_id = sl.id
  AND se.user_id IS NULL;

-- 6) Backfill occurred_at from parent symptom_logs timestamp
UPDATE symptom_entries se
SET occurred_at = sl.timestamp
FROM symptom_logs sl
WHERE se.symptom_log_id = sl.id
  AND se.occurred_at IS NULL;

-- 7) Backfill weather data from parent symptom_logs to entries
UPDATE symptom_entries se
SET 
  weather_temp_c = sl.weather_temp_c,
  weather_text = sl.weather_text,
  weather_observed_at = sl.weather_observed_at,
  lat = sl.lat,
  lon = sl.lon,
  weather_source = sl.weather_source,
  water_intake_current_ml = sl.water_intake_current_ml,
  heart_rate_bpm = sl.heart_rate_bpm,
  sodium_intake_current_mg = sl.sodium_intake_current_mg
FROM symptom_logs sl
WHERE se.symptom_log_id = sl.id
  AND se.weather_temp_c IS NULL;

-- 8) Set NOT NULL constraints and defaults for required fields
ALTER TABLE symptom_entries
  ALTER COLUMN user_id SET NOT NULL,
  ALTER COLUMN occurred_at SET NOT NULL,
  ALTER COLUMN occurred_at SET DEFAULT now();

-- 9) Add foreign key for user_id (with IF NOT EXISTS check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'symptom_entries_user_id_users_id_fk'
  ) THEN
    ALTER TABLE symptom_entries
      ADD CONSTRAINT symptom_entries_user_id_users_id_fk
      FOREIGN KEY (user_id) REFERENCES users(id);
  END IF;
END$$;

-- 10) Create index for efficient time-ordered queries
CREATE INDEX IF NOT EXISTS idx_symptom_entries_user_occurred
  ON symptom_entries (user_id, occurred_at DESC);

-- 12) Add comment to track migration purpose
COMMENT ON COLUMN symptom_entries.occurred_at IS 'Precise timestamp when symptom occurred (allows multiple entries per day)';
COMMENT ON COLUMN symptom_entries.user_id IS 'Denormalized user_id for direct queries without joining through symptom_logs';
