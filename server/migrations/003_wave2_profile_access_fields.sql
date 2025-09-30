-- Wave 2: Add profile fields for Groups access control
-- Adds birthYear, gender, and identity fields for age/gender/diagnosis-based group gating

-- Add birthYear for age-based group access
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS birth_year INTEGER;

-- Add gender for gender-based group access
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS gender VARCHAR;

-- Add identity array for identity-based group access (LGBTQ+, etc.)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS identity TEXT[];

-- Create index for faster age-based queries
CREATE INDEX IF NOT EXISTS users_birth_year_idx ON users(birth_year) WHERE birth_year IS NOT NULL;
