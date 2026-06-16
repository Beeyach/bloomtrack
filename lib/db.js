// Bloomtrack · D1 database helper for Cloudflare Pages.
//
// Replaces the old better-sqlite3 setup. We no longer open a local file —
// each request gets the D1 binding from the Cloudflare Pages request
// context, where it was attached at deploy time.
//
// Schema is created once via wrangler (see schema.sql), not on every
// connect like the SQLite version did.

import { getRequestContext } from '@cloudflare/next-on-pages';

export function getDb() {
  const { env } = getRequestContext();
  if (!env || !env.DB) {
    throw new Error(
      'D1 binding "DB" not found. Make sure the Pages project has the ' +
      'D1 binding configured in the Cloudflare dashboard (Settings → ' +
      'Functions → D1 database bindings).'
    );
  }
  return env.DB;
}

export const STAGES = [
  'New',
  'Email 1',
  'Email 2',
  'Email 3',
  'Email 4',
  'Email 5',
  'Recycled',
  'Rekindled',
  'Replied',
  'Interested',
  'Potential',
  'Nudge',
  'Booked',
  'Client',
  'Payment Awaiting',
  'Unread',
  'Lost',
  'Closed',
];

export const RATINGS = ['💚', '💙', '🟠', '⭐', '🔥', '🟡', '✖️'];
