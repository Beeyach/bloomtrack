import { getDb } from '@/lib/db';

export const runtime = 'edge';

function csvEscape(v) {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(req) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').trim();
  const stageFilter = searchParams.getAll('stage');
  const ratingFilter = searchParams.getAll('rating');

  const where = [];
  const values = [];
  if (search) {
    where.push(`(
      COALESCE(name,'') LIKE ? OR
      COALESCE(business_name,'') LIKE ? OR
      COALESCE(email,'') LIKE ? OR
      COALESCE(domain,'') LIKE ? OR
      COALESCE(stage,'') LIKE ? OR
      COALESCE(rating,'') LIKE ?
    )`);
    const q = `%${search}%`;
    values.push(q, q, q, q, q, q);
  }
  if (stageFilter.length > 0) {
    const placeholders = stageFilter.map(() => '?').join(',');
    where.push(`stage IN (${placeholders})`);
    stageFilter.forEach((s) => values.push(s));
  }
  if (ratingFilter.length > 0) {
    const placeholders = ratingFilter.map(() => '?').join(',');
    where.push(`rating IN (${placeholders})`);
    ratingFilter.forEach((s) => values.push(s));
  }

  const headers = [
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
  ];

  const sql = `SELECT ${headers.join(', ')}
               FROM prospects ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY id ASC`;
  const { results } = await db.prepare(sql).bind(...values).all();
  const rows = results || [];

  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  const csv = lines.join('\r\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="bloomtrack-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
