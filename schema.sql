-- Bloomtrack · D1 schema
-- One-time setup for the production database.
-- Run with: npx wrangler d1 execute bloomtrack --file=schema.sql --remote

-- ─────────────────────────────────────────────────────────────────────────
-- Migration: Add country column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN country TEXT;" --remote
--
-- Migration: Add email sequence storage (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN email_sequence TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN audit_notes TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN pdf_filename TEXT;" --remote
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  business_name TEXT,
  email TEXT,
  domain TEXT,
  rating TEXT,
  stage TEXT,
  emails_sent INTEGER DEFAULT 0,
  last_contact_date TEXT,
  claude_chat_link TEXT,
  gmail_labels TEXT,
  is_read INTEGER DEFAULT 0,
  country TEXT,
  -- JSON string: [{"number":1,"subject":"...","body":"..."}, ...] up to 5 entries.
  -- D1 has no native JSON type, so this is stored/read as TEXT and parsed in JS.
  email_sequence TEXT,
  -- Plain text audit summary / rating from the website review.
  audit_notes TEXT,
  -- Filename only (not a path) of the Email 5 PDF in ./prospect-pdfs/
  pdf_filename TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON prospects(last_contact_date);
