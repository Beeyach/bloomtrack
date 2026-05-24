import { NextResponse } from 'next/server';
import { getDb, STAGES, RATINGS } from '@/lib/db';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';

const SELECT_COLS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, created_at, updated_at';

export async function GET(req) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') || '').trim();
  const stageFilter = searchParams.getAll('stage');
  const ratingFilter = searchParams.getAll('rating');
  const readFilter = searchParams.getAll('read'); // values: 'read' | 'unread'
  const sort = searchParams.get('sort') || 'default';
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';

  // D1 uses positional `?` placeholders, not named `@name` params like
  // better-sqlite3. We collect bind values in order as we build the WHERE.
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
    if (stageFilter.length === 1 && stageFilter[0] === '__nomatch__') {
      where.push('1 = 0');
    } else {
      const placeholders = stageFilter.map(() => '?').join(',');
      where.push(`stage IN (${placeholders})`);
      stageFilter.forEach((s) => values.push(s));
    }
  }
  if (ratingFilter.length > 0) {
    // `__none__` is the sentinel for rows with NULL rating.
    const includeNull = ratingFilter.includes('__none__');
    const concrete = ratingFilter.filter((r) => r !== '__none__');
    const clauses = [];
    if (concrete.length > 0) {
      const placeholders = concrete.map(() => '?').join(',');
      clauses.push(`rating IN (${placeholders})`);
      concrete.forEach((s) => values.push(s));
    }
    if (includeNull) clauses.push(`(rating IS NULL OR rating = '')`);
    where.push(clauses.length > 0 ? `(${clauses.join(' OR ')})` : '1 = 0');
  }
  if (readFilter.length > 0) {
    const vals = [];
    if (readFilter.includes('unread')) vals.push(0);
    if (readFilter.includes('read')) vals.push(1);
    if (vals.length > 0) {
      const placeholders = vals.map(() => '?').join(',');
      where.push(`COALESCE(is_read, 0) IN (${placeholders})`);
      vals.forEach((v) => values.push(v));
    }
  }

  let orderBy;
  switch (sort) {
    case 'name':
    case 'business_name':
    case 'email':
    case 'domain':
    case 'rating':
    case 'stage':
    case 'emails_sent':
    case 'last_contact_date':
    case 'claude_chat_link':
    case 'is_read':
      orderBy = `${sort} ${dir} NULLS LAST`;
      break;
    case 'days_ago':
      // Days Ago sorts by last_contact_date (fresher = smaller days). Asc = freshest first.
      orderBy = `CASE WHEN last_contact_date IS NULL OR last_contact_date = '' THEN 1 ELSE 0 END,
                 last_contact_date ${dir === 'DESC' ? 'ASC' : 'DESC'}`;
      break;
    default:
      // 'New' stage floats to the top (so freshly added prospects are visible
      // without scrolling). Within each group: most recent contact first,
      // then highest id (newest insert) as the tiebreaker.
      orderBy = `CASE WHEN stage = 'New' THEN 0 ELSE 1 END,
                 CASE WHEN last_contact_date IS NULL OR last_contact_date = '' THEN 1 ELSE 0 END,
                 last_contact_date DESC,
                 id DESC`;
  }

  const sql = `SELECT ${SELECT_COLS} FROM prospects ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ${orderBy}`;
  const { results } = await db.prepare(sql).bind(...values).all();
  return NextResponse.json({ prospects: results || [], stages: STAGES, ratings: RATINGS });
}

export async function POST(req) {
  const db = getDb();
  const body = await req.json();
  const {
    name = '',
    business_name = null,
    email = '',
    domain = '',
    rating = null,
    stage = 'New',
    emails_sent = 0,
    last_contact_date = null,
    claude_chat_link = null,
    gmail_labels = null,
    is_read = 0,
  } = body || {};

  if (stage && !STAGES.includes(stage)) {
    return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
  }
  if (rating && !RATINGS.includes(rating)) {
    return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
  }

  const info = await db
    .prepare(
      `INSERT INTO prospects (name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
    .bind(
      name,
      business_name,
      email,
      domain,
      rating,
      stage,
      Number(emails_sent) || 0,
      last_contact_date,
      claude_chat_link,
      gmail_labels,
      is_read ? 1 : 0
    )
    .run();

  // D1's run() returns { meta: { last_row_id, changes, ... } }. We need
  // last_row_id to fetch the fresh row back.
  const newId = info?.meta?.last_row_id;
  const row = await db
    .prepare(`SELECT ${SELECT_COLS} FROM prospects WHERE id = ?`)
    .bind(newId)
    .first();
  return NextResponse.json({ prospect: row }, { status: 201 });
}
