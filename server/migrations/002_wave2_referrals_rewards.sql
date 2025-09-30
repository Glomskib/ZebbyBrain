-- Wave 2: Referrals & Rewards Migration
-- Adds referral code to users and creates referral/rewards tracking tables

-- Add referral_code column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS referral_code VARCHAR UNIQUE;

-- Create referral_events table
CREATE TABLE IF NOT EXISTS referral_events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR NOT NULL, -- 'signup' | 'week_active'
  occurred_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS referral_events_referrer_idx ON referral_events(referrer_user_id);
CREATE INDEX IF NOT EXISTS referral_events_referred_idx ON referral_events(referred_user_id);
CREATE INDEX IF NOT EXISTS referral_events_type_idx ON referral_events(event_type);

-- Prevent duplicate signup events per referrer-referred pair
-- Use a partial unique index (week_active events can be multiple, one per week)
CREATE UNIQUE INDEX IF NOT EXISTS unique_signup_per_referred 
ON referral_events(referred_user_id, event_type) 
WHERE event_type = 'signup';

-- Create rewards_ledger table
CREATE TABLE IF NOT EXISTS rewards_ledger (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL, -- Positive for earned, negative for spent
  reason VARCHAR NOT NULL, -- 'invite_confirmed' | 'active_week' | 'referral_bonus' | 'streak_bonus'
  reference_id VARCHAR, -- ID of related event (referral_event_id, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rewards_ledger_user_created_idx ON rewards_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rewards_ledger_reason_idx ON rewards_ledger(reason);
