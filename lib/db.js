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

// Linear pipeline only. Channel/source labels (Instagram, Facebook, …) moved
// to the `source` field — a source is where a lead came from, not a pipeline
// position. Reply status lives in the `replied` field, not a "Replied" stage.
// Removed stages (all empty except Instagram, which migrates to source='Instagram'):
// Instagram, Facebook, LinkedIn, Contact Form, Rekindled, Replied, Potential,
// Nudge, Re-warm, Booked, Payment Awaiting, Lost.
export const STAGES = [
  'New',
  'Email 1',
  'Email 2',
  'Email 3',
  'Email 4',
  'Email 5',
  'Snoozed',
  'Interested',
  'Setup Check',
  'Client',
  'Finished',
  'Rejected',
  'Invalid Email',
];

// Where a lead came from. Distinct from pipeline stage. null = unset.
export const SOURCES = [
  'Cold email',
  'Instagram',
  'Facebook',
  'LinkedIn',
  'Contact Form',
  'Referral',
];

// A reply's disposition, independent of stage. null = no reply.
export const REPLY_TYPES = ['interested', 'defer', 'decline'];

// Trimmed to the three actually in use. 💚 Strong · 💙 Client/won · ✖️ Skip.
export const RATINGS = ['💚', '💙', '✖️'];

// Countries you send to. Stored in the DB as the short code (e.g. 'AU').
// The flag + representative IANA timezone live in the UI layer
// (COUNTRY_META in ProspectsApp) and are echoed on window.bloomtrack so the
// follow-up automation can time sends per prospect (e.g. AU midnight).
export const COUNTRIES = ['US', 'CA', 'AU', 'NZ', 'UK'];
