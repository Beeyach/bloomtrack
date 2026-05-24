import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'bloomtrack.db');

let db;

export function getDb() {
  if (db) return db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
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
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_prospects_email ON prospects(email);
    CREATE INDEX IF NOT EXISTS idx_prospects_stage ON prospects(stage);
    CREATE INDEX IF NOT EXISTS idx_prospects_last_contact ON prospects(last_contact_date);
  `);

  // Lightweight migrations — add any new columns missing from older DBs.
  const cols = db.prepare('PRAGMA table_info(prospects)').all().map((c) => c.name);
  if (!cols.includes('business_name')) db.exec('ALTER TABLE prospects ADD COLUMN business_name TEXT');
  if (!cols.includes('emails_sent')) db.exec('ALTER TABLE prospects ADD COLUMN emails_sent INTEGER DEFAULT 0');
  if (!cols.includes('gmail_labels')) db.exec('ALTER TABLE prospects ADD COLUMN gmail_labels TEXT');
  if (!cols.includes('stage')) db.exec('ALTER TABLE prospects ADD COLUMN stage TEXT');
  if (!cols.includes('rating')) db.exec('ALTER TABLE prospects ADD COLUMN rating TEXT');
  if (!cols.includes('claude_chat_link')) db.exec('ALTER TABLE prospects ADD COLUMN claude_chat_link TEXT');
  if (!cols.includes('is_read')) db.exec('ALTER TABLE prospects ADD COLUMN is_read INTEGER DEFAULT 0');

  // Legacy split: if rows still have a `status` column populated and no stage,
  // backfill stage/rating from it. Idempotent — only fires for rows where stage is NULL.
  if (cols.includes('status')) {
    db.exec(`
      UPDATE prospects SET
        rating = CASE
          WHEN status = 'Strong' THEN 'Strong'
          WHEN status = 'Maybe'  THEN 'Maybe'
          WHEN status = 'Skip'   THEN 'Skip'
          ELSE rating
        END,
        stage = CASE
          WHEN status IN ('Strong','Maybe')          THEN 'New'
          WHEN status = 'Sent'                       THEN 'Email 1'
          WHEN status = 'Follow-up 1'                THEN 'Email 2'
          WHEN status = 'Follow-up 2'                THEN 'Email 3'
          WHEN status = 'Follow-up 3'                THEN 'Email 3'
          WHEN status = 'Recycled'                   THEN 'Recycled'
          WHEN status = 'Rekindled'                  THEN 'Rekindled'
          WHEN status = 'Replied'                    THEN 'Replied'
          WHEN status = 'Interested'                 THEN 'Interested'
          WHEN status = 'Potential'                  THEN 'Potential'
          WHEN status = 'Nudge'                      THEN 'Nudge'
          WHEN status = 'Booked'                     THEN 'Booked'
          WHEN status = 'Unread'                     THEN 'Unread'
          WHEN status = 'Lost'                       THEN 'Lost'
          WHEN status = 'Skip'                       THEN 'Lost'
          WHEN status = 'Closed'                     THEN 'Closed'
          ELSE 'New'
        END
      WHERE stage IS NULL
    `);
  }

  // v3 migration: word ratings → emoji ratings.
  db.exec(`
    UPDATE prospects SET rating = CASE
      WHEN rating = 'Strong' THEN '💚'
      WHEN rating = 'Maybe'  THEN '💙'
      WHEN rating = 'Skip'   THEN '✖️'
      ELSE rating
    END
    WHERE rating IN ('Strong','Maybe','Skip')
  `);

  return db;
}

export const STAGES = [
  'New',
  'Email 1',
  'Email 2',
  'Email 3',
  'Email 4',
  'Email 5',
  'Email 6',
  'Email 7',
  'Recycled',
  'Rekindled',
  'Replied',
  'Interested',
  'Potential',
  'Nudge',
  'Booked',
  'Unread',
  'Lost',
  'Closed',
];

export const RATINGS = ['💚', '💙', '🟠', '⭐', '🔥', '🟡', '✖️'];
