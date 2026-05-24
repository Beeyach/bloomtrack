import { getDb, STAGES, RATINGS } from '@/lib/db';
import ProspectsApp from '@/components/ProspectsApp';

export const dynamic = 'force-dynamic';

export default function Page() {
  // Touch DB so schema/migrations run before any client API call.
  getDb();
  return <ProspectsApp stages={STAGES} ratings={RATINGS} />;
}
