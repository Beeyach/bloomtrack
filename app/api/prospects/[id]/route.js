import { NextResponse } from 'next/server';
import { getDb, STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';

export const runtime = 'edge';
// Force-dynamic so PUT/DELETE survive the next-on-pages build as a real
// Function instead of being prerendered static (which 405s non-GET methods).
export const dynamic = 'force-dynamic';

const ALLOWED_FIELDS = [
  'name',
  'business_name',
  'email',
  'domain',
  'rating',
  'stage',
  'emails_sent',
  'last_contact_date',
  'claude_chat_link',
  'gmail_labels',
  'is_read',
  'country',
  // Free-text / JSON columns — no validation needed.
  'email_sequence',
  'audit_notes',
  'pdf_filename',
  'info',
  'review_url',
  'replied',
  'reply_date',
  'reply_type',
  'replied_at_email',
  'next_action_date',
  'source',
];

const SELECT_COLS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, country, email_sequence, audit_notes, pdf_filename, info, review_url, replied, reply_date, reply_type, replied_at_email, next_action_date, source, created_at, updated_at';

export async function PUT(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  // Build SET fragment + positional bind values in parallel. The id goes
  // on the end (WHERE id = ?).
  const updates = [];
  const values = [];
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      if (key === 'stage' && body.stage != null && !STAGES.includes(body.stage)) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
      if (key === 'rating' && body.rating != null && body.rating !== '' && !RATINGS.includes(body.rating)) {
        return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
      }
      if (key === 'country' && body.country != null && body.country !== '' && !COUNTRIES.includes(body.country)) {
        return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
      }
      if (key === 'source' && body.source != null && body.source !== '' && !SOURCES.includes(body.source)) {
        return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
      }
      if (key === 'reply_type' && body.reply_type != null && body.reply_type !== '' && !REPLY_TYPES.includes(body.reply_type)) {
        return NextResponse.json({ error: 'Invalid reply_type' }, { status: 400 });
      }
      updates.push(`${key} = ?`);
      if (key === 'is_read' || key === 'replied') {
        values.push(body[key] ? 1 : 0);
      } else {
        values.push(body[key] === '' ? null : body[key]);
      }
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }
  updates.push(`updated_at = datetime('now')`);

  const rowId = Number(id);
  const sql = `UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`;
  const info = await db.prepare(sql).bind(...values, rowId).run();
  if ((info?.meta?.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await db
    .prepare(`SELECT ${SELECT_COLS} FROM prospects WHERE id = ?`)
    .bind(rowId)
    .first();
  return NextResponse.json({ prospect: row });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const info = await db
    .prepare('DELETE FROM prospects WHERE id = ?')
    .bind(Number(id))
    .run();
  if ((info?.meta?.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
