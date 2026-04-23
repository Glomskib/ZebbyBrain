import { pool } from "../db";
import { sql } from "drizzle-orm";
import { db } from "../db";
import fs from "node:fs";
import path from "node:path";

// Baseline schema generated from shared/schema.ts — creates core tables if missing.
// We keep this deliberately permissive (IF NOT EXISTS everywhere) so it's safe
// to run every boot against a live pglite file.
const BASELINE_SQL = `
-- Users + sessions (mandatory)
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR UNIQUE,
  password_hash VARCHAR,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  avatar_key VARCHAR,
  stripe_customer_id VARCHAR UNIQUE,
  plan VARCHAR DEFAULT 'free',
  plan_status VARCHAR DEFAULT 'inactive',
  current_period_end TIMESTAMP,
  onboarding_completed BOOLEAN DEFAULT false,
  eds_type VARCHAR,
  diagnosis_year INTEGER,
  primary_symptoms TEXT[],
  experience_level VARCHAR,
  daily_goals TEXT[],
  birth_year INTEGER,
  gender VARCHAR,
  identity TEXT[],
  symptom_logs_retention_months INTEGER DEFAULT 36,
  vitals_logs_retention_months INTEGER DEFAULT 36,
  sleep_logs_retention_months INTEGER DEFAULT 36,
  ai_interactions_retention_months INTEGER DEFAULT 24,
  deleted_at TIMESTAMP,
  delete_token VARCHAR UNIQUE,
  deletion_reason TEXT,
  referral_code VARCHAR UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_key VARCHAR;

CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions(expire);

-- Symptom logs (parent session)
CREATE TABLE IF NOT EXISTS symptom_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  timestamp TIMESTAMP NOT NULL,
  notes TEXT,
  weather_temp DECIMAL(5,2),
  weather_condition VARCHAR,
  weather_location VARCHAR,
  weather_temp_c DECIMAL(5,2),
  weather_text TEXT,
  weather_observed_at TIMESTAMPTZ,
  lat DECIMAL(10,7),
  lon DECIMAL(10,7),
  weather_source VARCHAR,
  water_intake_current_ml INTEGER,
  heart_rate_bpm INTEGER,
  sodium_intake_current_mg INTEGER,
  ai_reflection TEXT,
  ai_processed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  symptoms TEXT[],
  intensity INTEGER
);
CREATE INDEX IF NOT EXISTS symptom_logs_user_time_idx ON symptom_logs(user_id, timestamp DESC);

-- Individual entries
CREATE TABLE IF NOT EXISTS symptom_entries (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  symptom_log_id VARCHAR NOT NULL REFERENCES symptom_logs(id) ON DELETE CASCADE,
  symptom_name VARCHAR NOT NULL,
  intensity INTEGER NOT NULL,
  notes TEXT,
  body_part VARCHAR,
  side VARCHAR,
  mood VARCHAR,
  activity VARCHAR,
  diet TEXT,
  tags TEXT[],
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS symptom_entries_user_time_idx ON symptom_entries(user_id, logged_at DESC);

-- Water + sodium
CREATE TABLE IF NOT EXISTS water_intake_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  amount_ml INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sodium_intake_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  amount_mg INTEGER NOT NULL,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Vitals + sleep
CREATE TABLE IF NOT EXISTS vitals_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  type VARCHAR NOT NULL,
  value_numeric DECIMAL,
  value_text TEXT,
  position VARCHAR,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS sleep_logs (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  hours DECIMAL,
  quality INTEGER,
  notes TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI interactions
CREATE TABLE IF NOT EXISTS ai_interactions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  kind VARCHAR,
  prompt TEXT,
  response TEXT,
  feedback VARCHAR,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Reminders
CREATE TABLE IF NOT EXISTS reminders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  title VARCHAR NOT NULL,
  body TEXT,
  cadence VARCHAR,
  time_of_day VARCHAR,
  enabled BOOLEAN DEFAULT true,
  snoozed_until TIMESTAMPTZ,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Devices (push)
CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  token VARCHAR NOT NULL,
  platform VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Rewards ledger
CREATE TABLE IF NOT EXISTS reward_ledger (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  reason VARCHAR,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Uplifting messages
CREATE TABLE IF NOT EXISTS uplifting_messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  category VARCHAR,
  weight INTEGER DEFAULT 1,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
`;

const UPLIFTING_SEEDS = [
  ["Your pace is the right pace today.", "encouragement"],
  ["Rest is not a setback — it's strategy.", "encouragement"],
  ["Small symptom wins count. Log one today.", "motivation"],
  ["You are more than a flare.", "encouragement"],
  ["Hydration is self-respect.", "reminder"],
  ["Salt, water, rest — the EDS trinity.", "reminder"],
  ["Your story helps the herd. Keep going.", "community"],
  ["Not everything has to be fixed today.", "encouragement"],
  ["Pacing is a superpower.", "motivation"],
  ["You're allowed to take the elevator.", "encouragement"],
  ["One gentle stretch is enough.", "motivation"],
  ["Your body is doing an enormous amount of quiet work.", "encouragement"],
  ["Flares are data, not failure.", "reframe"],
  ["It's okay to cancel plans.", "permission"],
  ["Naps are medicine.", "permission"],
  ["You are not too much.", "encouragement"],
  ["Zebras move in herds. You're not alone.", "community"],
  ["Compression socks today? You earned them.", "practical"],
  ["Asking for help is brave.", "encouragement"],
  ["You're allowed to feel two things at once.", "encouragement"],
];

export async function initDb() {
  // 1a. Minimal baseline (ensures users/sessions exist so auth can start)
  const statements = BASELINE_SQL.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    try {
      await pool.query(stmt);
    } catch (e: any) {
      if (!/already exists/i.test(e?.message ?? "")) {
        console.warn(`[initDb] baseline stmt warning:`, e?.message);
      }
    }
  }

  // 1b. Full schema push from drizzle definitions (idempotent)
  try {
    const { syncSchema } = await import("./schemaSync");
    await syncSchema();
    console.log("[initDb] schema synced from drizzle definitions");
  } catch (e: any) {
    console.warn("[initDb] schema sync failed:", e?.message);
  }

  // 2. Apply /server/migrations/*.sql (idempotent, IF NOT EXISTS-style)
  const migDir = path.resolve(process.cwd(), "server/migrations");
  if (fs.existsSync(migDir)) {
    const files = fs
      .readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const body = fs.readFileSync(path.join(migDir, f), "utf8");
      // Split on semicolons but keep DO $$ ... $$ blocks together.
      const chunks = splitSqlPreservingDollarBlocks(body);
      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;
        try {
          await pool.query(trimmed);
        } catch (e: any) {
          const msg = e?.message ?? "";
          if (/already exists|duplicate|does not support/i.test(msg)) continue;
          console.warn(`[initDb] ${f} chunk warning:`, msg.slice(0, 160));
        }
      }
    }
  }

  // 3. Seed uplifting messages if empty
  try {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM uplifting_messages");
    if ((rows[0]?.c ?? 0) === 0) {
      for (const [text, category] of UPLIFTING_SEEDS) {
        await pool.query(
          "INSERT INTO uplifting_messages (text, category, weight, active) VALUES ($1, $2, $3, $4)",
          [text, category, 1, true],
        );
      }
      console.log(`[initDb] seeded ${UPLIFTING_SEEDS.length} uplifting messages`);
    }
  } catch (e: any) {
    console.warn("[initDb] uplifting seed skipped:", e?.message);
  }
}

function splitSqlPreservingDollarBlocks(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let inDollar = false;
  const lines = sql.split(/\r?\n/);
  for (const line of lines) {
    if (/\$\$/.test(line)) inDollar = !inDollar;
    buf += line + "\n";
    if (!inDollar && /;\s*$/.test(line)) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf.trim()) out.push(buf);
  return out;
}

// Silence unused import warning
export { sql, db };
