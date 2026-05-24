import { NextResponse } from 'next/server';
import { getDb, STAGES, RATINGS } from '@/lib/db';

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
];

const SELECT_COLS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, created_at, updated_at';

export async function PUT(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const body = await req.json();

  const updates = [];
  const values = { id: Number(id) };
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      if (key === 'stage' && body.stage != null && !STAGES.includes(body.stage)) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
      if (key === 'rating' && body.rating != null && body.rating !== '' && !RATINGS.includes(body.rating)) {
        return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
      }
      updates.push(`${key} = @${key}`);
      if (key === 'is_read') {
        values[key] = body[key] ? 1 : 0;
      } else {
        values[key] = body[key] === '' ? null : body[key];
      }
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }
  updates.push(`updated_at = datetime('now')`);

  const sql = `UPDATE prospects SET ${updates.join(', ')} WHERE id = @id`;
  const info = db.prepare(sql).run(values);
  if (info.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = db.prepare(`SELECT ${SELECT_COLS} FROM prospects WHERE id = ?`).get(values.id);
  return NextResponse.json({ prospect: row });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const info = db.prepare('DELETE FROM prospects WHERE id = ?').run(Number(id));
  if (info.changes === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
