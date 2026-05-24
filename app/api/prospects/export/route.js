import { getDb } from '@/lib/db';

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
  const params = {};
  if (search) {
    where.push(`(
      COALESCE(name,'') LIKE @q OR
      COALESCE(business_name,'') LIKE @q OR
      COALESCE(email,'') LIKE @q OR
      COALESCE(domain,'') LIKE @q OR
      COALESCE(stage,'') LIKE @q OR
      COALESCE(rating,'') LIKE @q
    )`);
    params.q = `%${search}%`;
  }
  if (stageFilter.length > 0) {
    const placeholders = stageFilter.map((_, i) => `@st${i}`).join(',');
    where.push(`stage IN (${placeholders})`);
    stageFilter.forEach((s, i) => (params[`st${i}`] = s));
  }
  if (ratingFilter.length > 0) {
    const placeholders = ratingFilter.map((_, i) => `@r${i}`).join(',');
    where.push(`rating IN (${placeholders})`);
    ratingFilter.forEach((s, i) => (params[`r${i}`] = s));
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
  const rows = db.prepare(sql).all(params);

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
