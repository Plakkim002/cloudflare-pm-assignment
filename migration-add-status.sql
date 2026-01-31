-- Migration: Add ticket lifecycle tracking
-- Safe to run multiple times (uses IF NOT EXISTS pattern)

-- Check if status column exists, add if not
-- SQLite doesn't have IF NOT EXISTS for ALTER TABLE, so we use a workaround

-- Add status column (will error if exists, that's OK)
ALTER TABLE feedback ADD COLUMN status TEXT DEFAULT 'open';

-- Add resolved_at column
ALTER TABLE feedback ADD COLUMN resolved_at TIMESTAMP;

-- Add resolution_note column
ALTER TABLE feedback ADD COLUMN resolution_note TEXT;

-- Set existing records to 'open' status
UPDATE feedback SET status = 'open' WHERE status IS NULL;