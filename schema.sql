-- Bloomtrack · D1 schema
-- One-time setup for the production database.
-- Run with: npx wrangler d1 execute bloomtrack --file=schema.sql --remote

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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON prospects(last_contact_date);
