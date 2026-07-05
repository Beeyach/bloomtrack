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
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Contact Form',
  'Rekindled',
  'Replied',
  'Interested',
  'Potential',
  'Nudge',
  'Snoozed',
  'Booked',
  'Client',
  'Payment Awaiting',
  'Finished',
  'Rejected',
  'Lost',
];

export const RATINGS = ['💚', '💙', '🟠', '⭐', '🔥', '🟡', '✖️'];

// Countries you send to. Stored in the DB as the short code (e.g. 'AU').
// The flag + representative IANA timezone live in the UI layer
// (COUNTRY_META in ProspectsApp) and are echoed on window.bloomtrack so the
// follow-up automation can time sends per prospect (e.g. AU midnight).
export const COUNTRIES = ['US', 'CA', 'AU', 'NZ', 'UK'];
