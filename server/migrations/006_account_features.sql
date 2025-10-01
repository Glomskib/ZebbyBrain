-- Add delete_token field for 7-day account deletion undo
ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_token VARCHAR UNIQUE;
