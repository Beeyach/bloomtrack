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
--
-- Migration: Add info column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN info TEXT;" --remote
--
-- Migration: Add review_url column (run once on existing databases)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN review_url TEXT;" --remote
--
-- Migration: Reply tracking, next action, and source (run once on existing DBs)
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN replied INTEGER DEFAULT 0;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN reply_date TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN reply_type TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN next_action_date TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN source TEXT;" --remote
-- npx wrangler d1 execute bloomtrack --command="ALTER TABLE prospects ADD COLUMN replied_at_email INTEGER;" --remote
--
-- Data migration: Instagram was a stage; make it a source and reset the stage.
-- npx wrangler d1 execute bloomtrack --command="UPDATE prospects SET source='Instagram', stage='New' WHERE stage='Instagram';" --remote
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
  -- Freeform notes from the website audit: niche, location, services, findings.
  -- Plain text (not JSON); line breaks preserved.
  info TEXT,
  -- Public URL of the review PDF served from R2, e.g.
  -- https://gobloomwired.com/review/renee-zaia
  review_url TEXT,
  -- Reply tracking. A reply is an attribute of the lead, independent of stage.
  replied INTEGER DEFAULT 0,        -- 0/1
  reply_date TEXT,                  -- ISO date the reply landed
  reply_type TEXT,                  -- 'interested' | 'defer' | 'decline' | null
  replied_at_email INTEGER,         -- email number last sent when they replied (1-5)
  -- Intended recontact / next-touch date. When set, drives "due" instead of
  -- the stage-based window.
  next_action_date TEXT,
  -- Where the lead came from (Cold email / Instagram / Referral / …).
  source TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON prospects(last_contact_date);
