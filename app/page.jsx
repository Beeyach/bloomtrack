import { STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import ProspectsApp from '@/components/ProspectsApp';

// D1 lives in the edge runtime. The page itself doesn't touch the DB,
// but next-on-pages requires every non-static route to opt into edge.
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export default function Page() {
  // Note: the old version called getDb() here to trigger schema creation on
  // first request. With D1, the schema is applied separately via
  // `wrangler d1 execute` — no per-request setup needed.
  return (
    <ProspectsApp
      stages={STAGES}
      ratings={RATINGS}
      countries={COUNTRIES}
      sources={SOURCES}
      replyTypes={REPLY_TYPES}
    />
  );
}
