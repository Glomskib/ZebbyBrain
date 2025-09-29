-- Wave 1 Migration: Add enhanced weather tracking and body-part fields
-- This migration is idempotent - safe to run multiple times

-- Add enhanced weather fields to symptom_logs
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS weather_temp_c NUMERIC(5,2);
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS weather_text TEXT;
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS weather_observed_at TIMESTAMPTZ;
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS lat NUMERIC(10,7);
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS lon NUMERIC(10,7);
ALTER TABLE symptom_logs ADD COLUMN IF NOT EXISTS weather_source VARCHAR;

-- Add body-part tracking to symptom_entries
ALTER TABLE symptom_entries ADD COLUMN IF NOT EXISTS body_part VARCHAR;
ALTER TABLE symptom_entries ADD COLUMN IF NOT EXISTS side VARCHAR;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS symptom_logs_weather_idx ON symptom_logs(weather_source, weather_observed_at);
CREATE INDEX IF NOT EXISTS symptom_entries_body_part_idx ON symptom_entries(body_part);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Wave 1 migration completed successfully';
END $$;
