-- Migration 005: Herd Alert System for Manual Reach-Out
-- Wave 3+ enhancement: Allow users to manually reach out to their herd members

CREATE TABLE IF NOT EXISTS herd_alerts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR NOT NULL CHECK (status IN ('pending', 'sent', 'canceled')),
  message TEXT,
  cancel_token VARCHAR UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_expires_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ,
  CONSTRAINT no_self_alert CHECK (user_id != recipient_user_id)
);

-- Index for querying recipient's pending alerts
CREATE INDEX IF NOT EXISTS idx_herd_alerts_recipient_status ON herd_alerts(recipient_user_id, status);

-- Index for querying user's sent alerts (audit log)
CREATE INDEX IF NOT EXISTS idx_herd_alerts_user_created ON herd_alerts(user_id, created_at DESC);

-- Index for finding expired pending alerts (background scheduler)
CREATE INDEX IF NOT EXISTS idx_herd_alerts_pending_expired ON herd_alerts(status, window_expires_at) WHERE status = 'pending';
