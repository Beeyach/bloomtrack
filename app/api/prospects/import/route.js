import { NextResponse } from 'next/server';
import { getDb, STAGES, RATINGS } from '@/lib/db';

export const runtime = 'edge';
// Force-dynamic so the import POST survives as a real Function on
// Cloudflare Pages (otherwise a static prerender 405s the POST).
export const dynamic = 'force-dynamic';

// Minimal CSV parser supporting quoted fields and embedded commas/newlines.
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = '';
  let row = [];
  let inQuotes = false;
  const len = text.length;
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  while (i < len) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\r') {
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// CSV columns we know how to read. Anything else is ignored.
const ALLOWED_COLS = [
  'name',
  'business_name',
  'email',
  'domain',
  'status',
  'rating',
  'stage',
  'emails_sent',
  'notes',
  'outreach_angle',
  'last_contact_date',
  'next_followup_date',
  'claude_chat_link',
  'gmail_labels',
];

// Map legacy CSV `status` → { stage, rating(emoji) }.
function mapStatusToStageRating(status) {
  if (!status) return { stage: 'New', rating: null };
  switch (status) {
    case 'Strong':       return { stage: 'New', rating: '💚' };
    case 'Maybe':        return { stage: 'New', rating: '💙' };
    case 'Sent':         return { stage: 'Email 1', rating: null };
    case 'Follow-up 1':  return { stage: 'Email 2', rating: null };
    case 'Follow-up 2':  return { stage: 'Email 3', rating: null };
    case 'Follow-up 3':  return { stage: 'Email 3', rating: null };
    case 'Rekindled':    return { stage: 'Rekindled', rating: null };
    case 'Replied':      return { stage: 'Replied', rating: null };
    case 'Interested':   return { stage: 'Interested', rating: null };
    case 'Skip':         return { stage: 'Lost', rating: '✖️' };
    default:
      if (STAGES.includes(status)) return { stage: status, rating: null };
      return { stage: 'New', rating: null };
  }
}

// Emoji/label patterns extracted from notes into gmail_labels.
const LABEL_PATTERNS = [
  /💞FF\w*/g,
  /🔁(?:\s*re-?sent)?/gi,
  /🔥\s*Rekindled\w*/gi,
  /✖️/g,
  /\bNudge\b/g,
  /\bClicked\b/g,
  /\bCheck back later\b/gi,
];

// Parse the legacy notes field for embedded biz/rating/email-count/labels.
// The remaining note text is discarded — v3 has no notes column.
function parseNotesField(raw) {
  let notes = (raw || '').trim();
  let business_name = null;
  let emails_sent = null;
  let rating = null;
  const labels = [];

  const bizMatch = notes.match(/^Biz:\s*([^.]+)\./);
  if (bizMatch) {
    business_name = bizMatch[1].trim();
    notes = notes.slice(bizMatch[0].length).trim();
  }

  const ratingMatch = notes.match(/Rating:\s*(Strong|Maybe|Skip)\b/i);
  if (ratingMatch) {
    const raw = ratingMatch[1].toLowerCase();
    rating = raw === 'strong' ? '💚' : raw === 'maybe' ? '💙' : '✖️';
    notes = notes.replace(ratingMatch[0], '');
  }

  const sentMatch = notes.match(/(\d+)\s+sent\b/i);
  if (sentMatch) emails_sent = parseInt(sentMatch[1], 10);

  for (const pat of LABEL_PATTERNS) {
    const matches = notes.match(pat);
    if (matches) labels.push(...matches);
  }

  return {
    business_name,
    emails_sent,
    rating,
    gmail_labels: labels.length > 0 ? Array.from(new Set(labels)).join(', ') : null,
  };
}

export async function POST(req) {
  const db = getDb();
  const body = await req.json();
  const csv = body?.csv || '';
  const confirm = !!body?.confirm;

  const rows = parseCsv(csv).filter(
    (r) => r.length > 0 && !(r.length === 1 && r[0].trim() === '')
  );
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Empty CSV' }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const colIndex = {};
  ALLOWED_COLS.forEach((col) => {
    const idx = header.indexOf(col);
    if (idx !== -1) colIndex[col] = idx;
  });

  const dataRows = rows.slice(1);
  const records = [];
  for (const r of dataRows) {
    const raw = {};
    for (const col of ALLOWED_COLS) {
      if (colIndex[col] != null) {
        const v = (r[colIndex[col]] ?? '').trim();
        raw[col] = v === '' ? null : v;
      } else {
        raw[col] = null;
      }
    }

    // Map legacy status → stage/rating (unless CSV already supplies them).
    if (raw.status && !raw.stage) {
      const mapped = mapStatusToStageRating(raw.status);
      raw.stage = mapped.stage;
      if (!raw.rating) raw.rating = mapped.rating;
    }

    // Parse legacy notes field for biz/emails_sent/rating-override/labels.
    const parsed = parseNotesField(raw.notes);
    const business_name = raw.business_name || parsed.business_name || null;
    const emails_sent_str = raw.emails_sent != null && raw.emails_sent !== ''
      ? raw.emails_sent
      : (parsed.emails_sent != null ? String(parsed.emails_sent) : null);
    // Rating override from notes wins over status-derived rating.
    let rating = raw.rating || null;
    if (parsed.rating) rating = parsed.rating;
    const gmail_labels = raw.gmail_labels || parsed.gmail_labels || null;

    let stage = raw.stage || 'New';
    if (!STAGES.includes(stage)) stage = 'New';
    if (rating && !RATINGS.includes(rating)) rating = null;

    records.push({
      name: raw.name,
      business_name,
      email: raw.email,
      domain: raw.domain,
      rating,
      stage,
      emails_sent: emails_sent_str == null ? 0 : parseInt(emails_sent_str, 10) || 0,
      last_contact_date: raw.last_contact_date,
      claude_chat_link: raw.claude_chat_link,
      gmail_labels,
    });
  }

  const existingRes = await db
    .prepare("SELECT LOWER(email) AS e FROM prospects WHERE email IS NOT NULL AND email != ''")
    .all();
  const existingEmails = new Set((existingRes.results || []).map((r) => r.e));
  const seenInBatch = new Set();
  const toInsert = [];
  let skipped = 0;
  for (const r of records) {
    const emailKey = r.email ? r.email.toLowerCase() : null;
    if (emailKey && (existingEmails.has(emailKey) || seenInBatch.has(emailKey))) {
      skipped++;
      continue;
    }
    if (emailKey) seenInBatch.add(emailKey);
    toInsert.push(r);
  }

  if (!confirm) {
    return NextResponse.json({
      preview: true,
      total: records.length,
      toInsert: toInsert.length,
      skipped,
    });
  }

  // D1 has no equivalent of better-sqlite3's synchronous db.transaction().
  // We use db.batch() instead — it runs the prepared statements atomically
  // in a single round trip.
  const insertSql = `INSERT INTO prospects (name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
  const stmt = db.prepare(insertSql);
  const batchStmts = toInsert.map((r) =>
    stmt.bind(
      r.name,
      r.business_name,
      r.email,
      r.domain,
      r.rating,
      r.stage,
      r.emails_sent,
      r.last_contact_date,
      r.claude_chat_link,
      r.gmail_labels
    )
  );
  if (batchStmts.length > 0) {
    await db.batch(batchStmts);
  }

  return NextResponse.json({ imported: toInsert.length, skipped });
}
