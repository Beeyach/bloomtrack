'use client';

import { forwardRef, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

const COLUMNS = [
  { key: 'name',              label: 'Name' },
  { key: 'business_name',     label: 'Business' },
  { key: 'email',             label: 'Email' },
  { key: 'domain',            label: 'Domain' },
  { key: 'country',           label: 'Country' },
  { key: 'rating',            label: 'Rating' },
  { key: 'stage',             label: 'Stage' },
  { key: 'emails_sent',       label: '#' },
  { key: 'days_ago',          label: 'Days' },
  { key: 'last_contact_date', label: 'Last Contact' },
  { key: 'email_sequence',    label: 'Seq' },
  { key: 'claude_chat_link',  label: 'Chat' },
];

// Countries you email, keyed by the short code stored in the DB. `flag` is
// the emoji shown in the cell/dropdown; `tz` is a representative IANA
// timezone echoed on window.bloomtrack so the follow-up automation can
// time sends (e.g. AU during their local midnight). US/CA span multiple
// zones — these are business-hours representatives, not exact.
const COUNTRY_META = {
  US: { label: 'United States',  tz: 'America/New_York' },
  CA: { label: 'Canada',         tz: 'America/Toronto' },
  AU: { label: 'Australia',      tz: 'Australia/Sydney' },
  NZ: { label: 'New Zealand',    tz: 'Pacific/Auckland' },
  UK: { label: 'United Kingdom', tz: 'Europe/London' },
};

// Default column widths (px). User-resized values are merged from localStorage.
const COL_DEFAULTS = {
  __select: 40,
  name: 160,
  business_name: 180,
  email: 220,
  domain: 180,
  country: 84,
  rating: 70,
  stage: 150,
  emails_sent: 50,
  days_ago: 80,
  last_contact_date: 120,
  email_sequence: 60,
  claude_chat_link: 60,
  __delete: 40,
};
const COL_MIN_WIDTH = 36;
const COL_WIDTHS_KEY = 'bloomtrack:colWidths:v1';

// Sentinel for "no rating" in the rating filter checklist.
const NO_RATING = '__none__';
const FILTERS_KEY = 'bloomtrack:filters:v1';

// Stage metadata. Each entry pairs a Lucide-style icon name (see Icon
// component) with a warm-paper-friendly bg/border. The `faded` flag dims
// the row for stages that are effectively dead-ends.
// Bg + border colors are deliberately saturated so the chip stands apart
// from the paper bg and the left-edge stripe reads at a glance. The Email
// series progresses through a warm tan→bronze gradient so you can clock
// "where in the funnel" without reading the number.
const STAGE_META = {
  New:        { icon: 'sparkle',        bg: '#F4E5E9',     border: '#8E6A8D' },
  'Email 1':  { icon: 'send',           bg: '#F4E4CB',     border: '#A8895E' },
  'Email 2':  { icon: 'send',           bg: '#EFD7B5',     border: '#9A774A' },
  'Email 3':  { icon: 'send',           bg: '#E8C99D',     border: '#8B6638' },
  'Email 4':  { icon: 'send',           bg: '#DFBA85',     border: '#7C572A' },
  'Email 5':  { icon: 'send',           bg: '#D4A96E',     border: '#6D481D' },
  Instagram:      { icon: 'instagram',  bg: '#F3D9EC',     border: '#B84A8E' },
  Facebook:       { icon: 'facebook',   bg: '#D3E0F5',     border: '#3B5998' },
  LinkedIn:       { icon: 'linkedin',   bg: '#CFE0EE',     border: '#0A66C2' },
  'Contact Form': { icon: 'clipboard',  bg: '#D3EAE6',     border: '#3B8C7E' },
  Rekindled:  { icon: 'flame',          bg: '#FBD0A5',     border: '#C76A1F' },
  Replied:    { icon: 'message',        bg: '#D2E7BD',     border: '#5B8A3E' },
  Interested: { icon: 'heart',          bg: '#B6DCAB',     border: '#3D8030' },
  Potential:  { icon: 'trending-up',    bg: '#FBCEA3',     border: '#B86A2A' },
  Nudge:      { icon: 'bell',           bg: '#F2DF92',     border: '#9C8425' },
  Snoozed:    { icon: 'hourglass',      bg: '#DCE0F0',     border: '#6B76A8' },
  'Re-warm':  { icon: 'rotate-ccw',     bg: '#FBE0D2',     border: '#C77A52' },
  Booked:     { icon: 'calendar-check', bg: '#A4D7A4',     border: '#1F7A1F' },
  Client:           { icon: 'briefcase', bg: '#9DCC9D',    border: '#1A6B1A' },
  'Payment Awaiting': { icon: 'clock',   bg: '#FBE6A8',    border: '#9C7E0F' },
  Finished:   { icon: 'moon',           bg: '#D9D1D9',     border: '#6E6577', faded: true },
  Rejected:   { icon: 'ban',            bg: '#EED0CC',     border: '#A34A38', faded: true },
  Lost:       { icon: 'x-circle',       bg: '#D6CCBD',     border: '#7A6E5E', faded: true },
};

// Rating metadata. Stored value in DB is still the emoji string (we don't
// want to migrate data). We just present it as a colored icon.
// `filled` makes the icon render as a solid colored badge instead of an
// outline — way easier to scan as a "rating chip". `x-circle` stays
// outlined since filling it would hide its internal X mark.
const RATING_META = {
  '💚': { icon: 'heart',      filled: true,  color: '#3D8030', bg: '#D2E7BD', label: 'Green' },
  '💙': { icon: 'heart',      filled: true,  color: '#3A6A8B', bg: '#C6D9EA', label: 'Blue' },
  '🟠': { icon: 'circle-dot', filled: true,  color: '#B86A2A', bg: '#FBCEA3', label: 'Orange' },
  '⭐':  { icon: 'star',       filled: true,  color: '#9C8425', bg: '#F2DF92', label: 'Star' },
  '🔥': { icon: 'flame',      filled: true,  color: '#B23A28', bg: '#FBC4B7', label: 'Hot' },
  '🟡': { icon: 'circle-dot', filled: true,  color: '#A39024', bg: '#F4E8A0', label: 'Yellow' },
  '✖️': { icon: 'x-circle',   filled: false, color: '#7A6E5E', bg: '#D6CCBD', label: 'Skip' },
};

function stageStyle(s) {
  return STAGE_META[s] || STAGE_META.New;
}
function stageLabel(s) {
  // Plain text label — used inside native <select> options where SVGs
  // aren't allowed. Visual identity (icon, color) is carried by the
  // <StageChip> / <StagePicker> components instead.
  return s;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysBetween(dateStr) {
  if (!dateStr) return null;
  const t = Date.parse(dateStr);
  if (Number.isNaN(t)) return null;
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const then = Date.UTC(
    new Date(t).getUTCFullYear(),
    new Date(t).getUTCMonth(),
    new Date(t).getUTCDate()
  );
  return Math.floor((today - then) / 86400000);
}
// Days-since-contact color scale. Picked to harmonize with STAGE_META
// borders so the column doesn't look like a foreign element.
function daysAgoColor(n) {
  if (n == null) return '#8A8194';
  if (n <= 2) return '#3D8030';      // fresh green
  if (n <= 5) return '#9C8425';      // warm amber
  if (n <= 10) return '#B86A2A';     // burnt orange
  return '#B23A28';                  // alarm red
}
function normalizeDomainHref(domain) {
  if (!domain) return '#';
  let d = domain.trim();
  if (!/^https?:\/\//i.test(d)) d = 'https://' + d;
  return d;
}
function normalizeChatHref(url) {
  if (!url) return '#';
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

// ─────────────────────────────────────────────────────────────────────────
// Icon set. Lucide-style strokes, currentColor, 24×24 viewbox so size is
// driven by w/h utility classes. Keeping them inline avoids a runtime
// dependency on lucide-react (which would also need edge-runtime sanity
// checks).
// ─────────────────────────────────────────────────────────────────────────
function Icon({ name, className = 'w-4 h-4', strokeWidth = 2, filled = false }) {
  // `filled=true` makes shape icons (heart, star, flame, circle-dot, x-circle,
  // check-circle) read as solid badges instead of outlines — used by the
  // rating swatches where the icon IS the chit.
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: filled ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  switch (name) {
    case 'sparkle':
      return (
        <svg {...common}>
          <path d="M12 3 13.5 8.5 19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z" />
          <path d="M19 3v3M20.5 4.5h-3M5 17v3M6.5 18.5h-3" />
        </svg>
      );
    case 'send':
      return (
        <svg {...common}>
          <path d="m22 2-7 20-4-9-9-4Z" />
          <path d="M22 2 11 13" />
        </svg>
      );
    case 'recycle':
      return (
        <svg {...common}>
          <path d="M7 19H4.8a1.8 1.8 0 0 1-1.6-2.7L7.2 9.5" />
          <path d="M11 19h8.2a1.8 1.8 0 0 0 1.6-2.7l-1.2-2.1" />
          <path d="m14 16-3 3 3 3" />
          <path d="M8.3 13.6 7.2 9.5 3.1 10.6" />
          <path d="m9.3 5.8 1.1-1.9A1.8 1.8 0 0 1 12 3a1.8 1.8 0 0 1 1.5.9l3.9 6.8" />
          <path d="m13.4 9.6 4.1 1.1 1.1-4.1" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
        </svg>
      );
    case 'message':
      return (
        <svg {...common}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'heart':
      return (
        <svg {...common}>
          <path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" />
        </svg>
      );
    case 'trending-up':
      return (
        <svg {...common}>
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
          <polyline points="16 7 22 7 22 13" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      );
    case 'calendar-check':
      return (
        <svg {...common}>
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4" />
        </svg>
      );
    case 'mail-open':
      return (
        <svg {...common}>
          <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" />
          <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      );
    case 'x-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6M9 9l6 6" />
        </svg>
      );
    case 'check-circle':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case 'circle-dot':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'star':
      return (
        <svg {...common}>
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      );
    case 'link':
      return (
        <svg {...common}>
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    case 'external-link':
      return (
        <svg {...common}>
          <path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        </svg>
      );
    case 'pencil':
      return (
        <svg {...common}>
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      );
    case 'sprout':
      return (
        <svg {...common}>
          <path d="M7 20h10" />
          <path d="M10 20c5.5-2.5.8-6.4 3-10" />
          <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
          <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    case 'chevron-down':
      return (
        <svg {...common}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      );
    case 'briefcase':
      return (
        <svg {...common}>
          <rect width="20" height="14" x="2" y="7" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...common}>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      );
    case 'ban':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" />
          <path d="m4.93 4.93 14.14 14.14" />
        </svg>
      );
    case 'hourglass':
      return (
        <svg {...common}>
          <path d="M5 22h14M5 2h14M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
        </svg>
      );
    case 'rotate-ccw':
      return (
        <svg {...common}>
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...common}>
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...common}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'linkedin':
      return (
        <svg {...common}>
          <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
          <rect width="4" height="12" x="2" y="9" />
          <circle cx="4" cy="4" r="2" />
        </svg>
      );
    case 'clipboard':
      return (
        <svg {...common}>
          <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        </svg>
      );
    case 'file-text':
      return (
        <svg {...common}>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" />
          <path d="M14 2v5h5" />
          <path d="M9 13h6M9 17h6" />
        </svg>
      );
    default:
      return null;
  }
}

// Looks up a stage's icon name and renders the SVG. Falls back to a
// neutral dot for unknown stages.
function StageIcon({ stage, className = 'w-3.5 h-3.5' }) {
  const meta = STAGE_META[stage] || {};
  return <Icon name={meta.icon || 'circle-dot'} className={className} />;
}

// Custom stage selector. Renders as a chip that opens a popover with each
// option laid out as [colored icon swatch] + [name]. Replaces the native
// <select> we had before — same data, much nicer affordance.
function StagePicker({ value, stages, onChange }) {
  const [open, setOpen] = useState(false);
  // Fixed-position coords for the popover, computed from the button rect
  // when opened. Rendered through a portal so the table's overflow-x-auto
  // container can't clip it, and flipped above the button when there isn't
  // enough room below (the bug: bottom rows opened downward off-screen).
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const meta = STAGE_META[value] || STAGE_META.New;

  const MENU_WIDTH = 208; // w-52
  const MENU_MAX_HEIGHT = Math.round(
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400
  );

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 320) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    // Close when the PAGE/table scrolls (the fixed-position menu would
    // drift away from its button). But ignore scrolls that happen INSIDE
    // the menu's own list — otherwise scrolling a long stage list snaps
    // it shut. This was the "minimizes by itself, can't scroll" bug.
    function onScroll(e) {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function pick(s) {
    setOpen(false);
    if (s !== value) onChange(s);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="bw-chip"
        style={{
          backgroundColor: meta.bg === 'transparent' ? '#FBF7F0' : meta.bg,
          borderColor: meta.border,
          color: meta.faded ? '#7C7480' : '#1E1E2A',
        }}
        title={value}
      >
        <span style={{ color: meta.border }}>
          <StageIcon stage={value} className="w-3.5 h-3.5" />
        </span>
        <span className="truncate max-w-[110px]">{value}</span>
        <Icon name="chevron-down" className="w-3 h-3 opacity-60" />
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 w-52 bg-surface border border-line rounded-xl shadow-card p-1.5 overflow-y-auto bw-scroll"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: Math.max(160, Math.min(pos.maxHeight, MENU_MAX_HEIGHT)),
            }}
          >
            {stages.map((s) => {
              const m = STAGE_META[s] || {};
              const isCurrent = s === value;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => pick(s)}
                  className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                    isCurrent ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
                  }`}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: m.bg === 'transparent' ? '#FBF7F0' : m.bg,
                      borderColor: m.border,
                      color: m.border,
                    }}
                  >
                    <StageIcon stage={s} className="w-3.5 h-3.5" />
                  </span>
                  <span style={{ color: m.faded ? 'var(--muted)' : 'var(--charcoal)' }}>{s}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// Country flag selector. Same portal + flip machinery as StagePicker so it
// never gets clipped by the table's horizontal scroll. Shows the flag emoji
// (or a dashed placeholder), opens a small list of flag + code + name.
function CountryPicker({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const meta = value ? COUNTRY_META[value] : null;

  const MENU_WIDTH = 176; // w-44
  const MENU_MAX_HEIGHT = Math.round(
    typeof window !== 'undefined' ? window.innerHeight * 0.5 : 360
  );

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < Math.min(MENU_MAX_HEIGHT, 260) && rect.top > spaceBelow;
    const left = Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8);
    setPos(
      openUp
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: rect.top - 16 }
        : { left, top: rect.bottom + 6, maxHeight: spaceBelow - 16 }
    );
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onScroll(e) {
      if (popRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onResize() {
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  function pick(c) {
    setOpen(false);
    if (c !== (value || null)) onChange(c);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-line hover:bg-blush-soft transition text-sm"
        title={meta ? `${meta.label} · ${meta.tz}` : 'Set country'}
      >
        {meta ? (
          <span className="text-xs font-mono font-semibold text-charcoal">{value}</span>
        ) : (
          <span className="text-xs text-muted/60">—</span>
        )}
        <Icon name="chevron-down" className="w-3 h-3 opacity-50" />
      </button>
      {open && pos && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-50 w-44 bg-surface border border-line rounded-xl shadow-card p-1.5 overflow-y-auto bw-scroll"
            style={{
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: Math.max(120, Math.min(pos.maxHeight, MENU_MAX_HEIGHT)),
            }}
          >
            <button
              type="button"
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                !value ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
              }`}
            >
              <span className="w-5 text-center text-muted">—</span>
              <span className="text-muted">None</span>
            </button>
            {options.map((c) => {
              const m = COUNTRY_META[c] || {};
              const isCurrent = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition ${
                    isCurrent ? 'bg-blush-soft' : 'hover:bg-blush-soft/60'
                  }`}
                >
                  <span className="font-mono text-xs font-semibold text-charcoal w-7">{c}</span>
                  <span className="truncate text-muted">{m.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}

// Stages that imply an email just went out — bumps emails_sent + last_contact_date.
const AUTO_EMAIL_STAGES = new Set([
  'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5',
  'Rekindled',
]);

// Stages that (re)anchor the last_contact_date to today WITHOUT bumping
// emails_sent. Snoozing / re-warming isn't an email — but we stamp today
// so the come-back countdown starts from when you parked it, not from an
// old date.
const STAMP_ONLY_STAGES = new Set(['Snoozed', 'Re-warm']);

// Per-stage "due" cadence — how many days of silence before the row
// should surface as "time to send the next email". Email 5 is NOT here:
// after 7 days on Email 5 we auto-transition to 'Finished' instead of
// resurfacing as due (see FINISHED_AFTER_DAYS below).
const DUE_DAYS_BY_STAGE = {
  'Email 1': 3,  // → send Email 2 after 3 days of silence
  'Email 2': 5,  // → send Email 3 after 5 days
  'Email 3': 7,  // → send Email 4 after 7 days
  'Email 4': 7,  // → send Email 5 after 7 days
  'Snoozed': 30, // → "come back later" leads resurface ~1 month after snoozing
  'Re-warm': 60, // → interested-then-quiet leads resurface ~2 months later
};
const DEFAULT_DUE_STAGES = Object.keys(DUE_DAYS_BY_STAGE);

// Auto-transition: when an Email 5 row has been silent this long we flip
// it to 'Finished' the next tick — user said "7 days on Email 5 → change
// to Finished the next day", so threshold is 8.
const FINISHED_AFTER_DAYS = 8;
const FINISHED_FROM_STAGE = 'Email 5';

function isDueProspect(p) {
  if (!p) return false;
  const threshold = DUE_DAYS_BY_STAGE[p.stage];
  if (threshold == null) return false;
  const d = daysBetween(p.last_contact_date);
  if (d == null) return false;
  return d >= threshold;
}

// ── Stats categories ───────────────────────────────────────────────────
// "Responded" = the prospect actually replied in some form: said yes
// (Interested/Booked/Client/Payment Awaiting), said no (Rejected), or asked
// to come back later (Snoozed). Lost = no reply after the sequence, so it
// does NOT count. Re-warm (was interested, then went quiet) doesn't count —
// no confirmed current reply. Nudge/Potential are our own assessments.
const RESPONDED_STAGES = new Set([
  'Replied', 'Interested', 'Booked', 'Client', 'Payment Awaiting',
  'Rejected', 'Snoozed',
]);
// Pure, synchronous rollup over the canonical prospect list. Used by both
// the Stats tab and window.bloomtrack.getStats(). Every count maps to
// exactly one stage — nothing is summed across stages, so the numbers
// match what you see in the pipeline.
function computeStats(prospects) {
  const byStage = {};
  let responded = 0, booked = 0, interested = 0, newCount = 0,
    rejected = 0, lost = 0, clients = 0, paymentAwaiting = 0;
  for (const p of prospects) {
    const s = p.stage || 'New';
    byStage[s] = (byStage[s] || 0) + 1;
    if (s === 'New') newCount++;
    if (RESPONDED_STAGES.has(s)) responded++;
    if (s === 'Client') clients++;
    if (s === 'Payment Awaiting') paymentAwaiting++;
    if (s === 'Booked') booked++;
    if (s === 'Interested') interested++;
    if (s === 'Rejected') rejected++;
    if (s === 'Lost') lost++;
  }
  const total = prospects.length;
  const reachedOut = total - newCount;
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  return {
    total, newCount, reachedOut,
    responded, responseRate: pct(responded, reachedOut),
    interested, booked,
    clients, paymentAwaiting, conversionRate: pct(clients, reachedOut),
    rejected, lost,
    byStage,
  };
}

// Which email number was most recently SENT to this prospect.
// The stage is the source of truth while they're in the sequence
// ("Email 3" ⇒ emails 1-3 went out). Once they leave it (Replied,
// Interested, …) the stage no longer encodes a number, so fall back to the
// emails_sent counter, capped at 5.
function getLastSentNumber(prospect) {
  const stage = prospect?.stage || '';
  const match = stage.match(/^Email (\d)$/);
  if (match) return parseInt(match[1], 10);
  return Math.min(prospect?.emails_sent || 0, 5);
}

// email_sequence is stored in D1 as a JSON *string* (no native JSON type).
// Accept a string (parse it), an already-parsed array (pass through), or
// null/garbage (→ null). Never throws.
function parseEmailSequence(raw) {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Serializable shape returned by window.bloomtrack.getProspects(). Aliases
// business_name → business per the automation spec, and adds two computed
// fields the agent uses to make decisions without re-deriving them.
function enrichProspect(p) {
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    business: p.business_name ?? null,
    business_name: p.business_name ?? null,
    email: p.email,
    domain: p.domain,
    rating: p.rating ?? null,
    stage: p.stage || 'New',
    emails_sent: p.emails_sent ?? 0,
    days_ago: daysBetween(p.last_contact_date),
    last_contact_date: p.last_contact_date ?? null,
    // Unchanged: the daily-sweep automations read this. Do not rename/move.
    claude_chat_link: p.claude_chat_link ?? null,
    gmail_labels: p.gmail_labels ?? null,
    country: p.country ?? null,
    email_sequence: parseEmailSequence(p.email_sequence),
    audit_notes: p.audit_notes ?? null,
    pdf_filename: p.pdf_filename ?? null,
    // Representative IANA timezone for the country, so the automation can
    // compute local send times without its own lookup table. null if the
    // prospect has no country set.
    timezone: p.country && COUNTRY_META[p.country] ? COUNTRY_META[p.country].tz : null,
    due: isDueProspect(p),
  };
}

/**
 * Build the window.bloomtrack automation surface against the component's
 * in-memory canonical store. Reads are synchronous (the store IS the truth
 * — the same array the table renders from). Writes go through the shared
 * write path used by the UI dropdowns, so the table stays in sync.
 *
 * Lookups are by email, case-insensitive. Lookups by email scan the
 * in-memory array, so they're effectively O(n) on ~300 rows = negligible.
 *
 * Return shapes:
 *   getProspects()             → Prospect[]       (synchronous; every row, ignoring filters/search)
 *   getDue({days, stages})     → Prospect[]       (synchronous; default = Email 1-3 ∧ days_ago ≥ 3)
 *   findByEmail(email)         → Prospect|null    (synchronous)
 *   setStage(email, stage)     → Promise<Prospect> (auto-stamps last_contact_date + bumps emails_sent on AUTO_EMAIL_STAGES)
 *   markReplied(email)         → Promise<Prospect> (sets stage='Replied', does NOT stamp last_contact_date or bump emails_sent)
 *   setRating(email, rating)   → Promise<Prospect>
 *   setLastContact(email, iso) → Promise<Prospect>
 *   setChatLink(email, url)    → Promise<Prospect>
 *   refresh()                  → Promise<void>    (re-pulls the canonical store from the server)
 *
 * All write methods throw `Error('Prospect not found: <email>')` if the
 * email doesn't match. setStage / setRating throw on invalid values.
 *
 * @param {object} bridge
 * @param {string[]} bridge.stages              valid stage names
 * @param {string[]} bridge.ratings             valid rating emoji
 * @param {Set<string>} bridge.autoEmailStages  stages that auto-stamp + bump
 * @param {() => Prospect[]} bridge.getAllProspects   live reader over the canonical store
 * @param {(id, patch) => Promise<Prospect>} bridge.updateProspectById   shared write path with the UI
 * @param {() => Promise<void>} bridge.refresh  reloads the canonical store
 */
function makeBloomtrackApi({
  stages,
  ratings,
  countries,
  autoEmailStages,
  getAllProspects,
  updateProspectById,
  refresh,
}) {
  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function findRaw(email) {
    if (!email) return null;
    const wanted = String(email).toLowerCase();
    return getAllProspects().find((p) => (p.email || '').toLowerCase() === wanted) || null;
  }
  async function patchByEmail(email, patch) {
    const p = findRaw(email);
    if (!p) throw new Error(`Prospect not found: ${email}`);
    const updated = await updateProspectById(p.id, patch);
    return enrichProspect(updated);
  }

  return {
    // ----- Read (synchronous — the store is the truth) -----
    getProspects() {
      return getAllProspects().map(enrichProspect);
    },
    // Default behavior: uses per-stage thresholds (Email 1→3d, 2→5d,
    // 3→7d, 4→7d). Callers can override with a flat `days` and a custom
    // `stages` list to force uniform behavior (e.g. sweep every stage
    // touched in the last N days).
    getDue({ days, stages: stagesArg } = {}) {
      if (days == null && stagesArg == null) {
        return getAllProspects().filter(isDueProspect).map(enrichProspect);
      }
      const stageSet = new Set(stagesArg || DEFAULT_DUE_STAGES);
      const threshold = days ?? 3;
      return getAllProspects()
        .filter((p) => stageSet.has(p.stage))
        .filter((p) => {
          const d = daysBetween(p.last_contact_date);
          return d != null && d >= threshold;
        })
        .map(enrichProspect);
    },
    findByEmail(email) {
      const p = findRaw(email);
      return p ? enrichProspect(p) : null;
    },
    getStats() {
      return computeStats(getAllProspects());
    },

    // ----- Write -----
    async setStage(email, stage) {
      if (!stages.includes(stage)) {
        throw new Error(`Invalid stage: ${stage}. Valid: ${stages.join(', ')}`);
      }
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      const patch = { stage };
      if (autoEmailStages.has(stage)) {
        patch.last_contact_date = todayIso();
        patch.emails_sent = (p.emails_sent || 0) + 1;
      } else if (STAMP_ONLY_STAGES.has(stage)) {
        // Anchor the come-back countdown to now (e.g. Snoozed → due in ~30d).
        patch.last_contact_date = todayIso();
      }
      const updated = await updateProspectById(p.id, patch);
      return enrichProspect(updated);
    },
    async markReplied(email) {
      const p = findRaw(email);
      if (!p) throw new Error(`Prospect not found: ${email}`);
      // Explicit: stage='Replied' only. No last_contact_date stamp, no
      // emails_sent bump — Replied means *they* sent something, not us.
      const updated = await updateProspectById(p.id, { stage: 'Replied' });
      return enrichProspect(updated);
    },
    async setRating(email, rating) {
      if (rating != null && !ratings.includes(rating)) {
        throw new Error(`Invalid rating: ${rating}. Valid: ${ratings.join(' ')}`);
      }
      return patchByEmail(email, { rating });
    },
    async setCountry(email, country) {
      // Accept null/'' to clear. Uppercase + a couple of aliases so
      // setCountry('gb') / setCountry('cad') don't surprise the caller.
      let c = country ? String(country).trim().toUpperCase() : null;
      if (c === 'GB') c = 'UK';
      if (c === 'CAD') c = 'CA';
      if (c != null && !countries.includes(c)) {
        throw new Error(`Invalid country: ${country}. Valid: ${countries.join(', ')}`);
      }
      return patchByEmail(email, { country: c });
    },
    setLastContact(email, iso) {
      return patchByEmail(email, { last_contact_date: iso || null });
    },
    setChatLink(email, url) {
      return patchByEmail(email, { claude_chat_link: url || null });
    },

    // ----- Email sequence storage -----
    // sequence: [{ number, subject, body }, ...] (up to 5). Stored as a JSON
    // string because D1 has no native JSON type. Body whitespace is preserved
    // verbatim — no trimming.
    async setEmailSequence(email, sequence) {
      if (!Array.isArray(sequence)) {
        throw new Error('setEmailSequence: sequence must be an array');
      }
      sequence.forEach((e, i) => {
        if (!e || typeof e !== 'object') {
          throw new Error(`setEmailSequence: entry ${i} is not an object`);
        }
        if (typeof e.number !== 'number') {
          throw new Error(`setEmailSequence: entry ${i} missing numeric "number"`);
        }
        if (typeof e.subject !== 'string' || typeof e.body !== 'string') {
          throw new Error(`setEmailSequence: entry ${i} needs string "subject" and "body"`);
        }
      });
      return patchByEmail(email, { email_sequence: JSON.stringify(sequence) });
    },
    async setAuditNotes(email, notes) {
      return patchByEmail(email, { audit_notes: notes || null });
    },
    async setPdfFilename(email, filename) {
      return patchByEmail(email, { pdf_filename: filename || null });
    },
    // Synchronous read of the parsed sequence (or null).
    getEmailSequence(email) {
      const p = findRaw(email);
      return p ? parseEmailSequence(p.email_sequence) : null;
    },
    // Synchronous read of one email by its number (1-5), or null.
    getEmailByNumber(email, number) {
      const seq = this.getEmailSequence(email);
      if (!Array.isArray(seq)) return null;
      return seq.find((e) => e.number === number) || null;
    },

    // ----- UI -----
    refresh,

    // ----- Constants (handy for the caller) -----
    stages: [...stages],
    ratings: [...ratings],
    countries: [...countries],
    // code → IANA timezone, so the automation can time sends per prospect.
    COUNTRY_TIMEZONES: Object.fromEntries(
      Object.entries(COUNTRY_META).map(([code, m]) => [code, m.tz])
    ),
    AUTO_EMAIL_STAGES: [...autoEmailStages],
    DEFAULT_DUE_STAGES: [...DEFAULT_DUE_STAGES],
    DUE_DAYS_BY_STAGE: { ...DUE_DAYS_BY_STAGE },
    FINISHED_AFTER_DAYS,
  };
}

export default function ProspectsApp({ stages, ratings, countries = [] }) {
  // ─── Canonical store ───────────────────────────────────────────────────
  // `allProspects` is the single source of truth. The table renders from a
  // memoized filtered/sorted projection of this array. Writes patch this
  // array directly (optimistic) and re-confirm against the server response.
  // No more server-side filter fetches — that's what was causing the silent
  // revert and filter-desync bugs.
  const [allProspects, setAllProspects] = useState([]);
  const [storeReady, setStoreReady] = useState(false);
  const [search, setSearch] = useState('');
  // Filter sets hold the *checked* (visible) options. Default: everything checked.
  const allRatingOpts = useMemo(() => [...ratings, NO_RATING], [ratings]);
  const allStageOpts = useMemo(() => [...stages], [stages]);
  const [ratingChecked, setRatingChecked] = useState(() => new Set(allRatingOpts));
  const [stageChecked, setStageChecked] = useState(() => new Set(allStageOpts));
  const [dueOnly, setDueOnly] = useState(false);
  const [view, setView] = useState('prospects'); // 'prospects' | 'stats'
  const [seqProspect, setSeqProspect] = useState(null); // row shown in the email-sequence modal
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const filtersBtnRef = useRef(null);
  const filtersPanelRef = useRef(null);
  const hydratedFiltersRef = useRef(false);
  const [sort, setSort] = useState({ key: 'default', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [quickAdd, setQuickAdd] = useState({
    name: '', business_name: '', email: '', domain: '', country: '', claude_chat_link: '',
  });
  const [highlightId, setHighlightId] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [colWidths, setColWidths] = useState(COL_DEFAULTS);
  const rowRefs = useRef({});
  const fileInputRef = useRef(null);
  const hydratedWidthsRef = useRef(false);

  // Live mirror of allProspects for use in stable callbacks (window.bloomtrack
  // closures, write helpers). Keeps reads O(1) without re-running effects.
  const allProspectsRef = useRef(allProspects);
  allProspectsRef.current = allProspects;

  // Load saved column widths once on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COL_WIDTHS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored === 'object') {
          setColWidths((prev) => ({ ...prev, ...stored }));
        }
      }
    } catch {}
    hydratedWidthsRef.current = true;
  }, []);

  // Persist column widths after hydration.
  useEffect(() => {
    if (!hydratedWidthsRef.current) return;
    try {
      localStorage.setItem(COL_WIDTHS_KEY, JSON.stringify(colWidths));
    } catch {}
  }, [colWidths]);

  // Load saved filter state once on mount. Values that no longer exist in the
  // current option lists are dropped silently.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FILTERS_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        if (stored && typeof stored === 'object') {
          if (Array.isArray(stored.rating)) {
            const valid = new Set(allRatingOpts);
            setRatingChecked(new Set(stored.rating.filter((v) => valid.has(v))));
          }
          if (Array.isArray(stored.stage)) {
            const valid = new Set(allStageOpts);
            setStageChecked(new Set(stored.stage.filter((v) => valid.has(v))));
          }
          // Older versions of this app persisted a `read` array; it's silently
          // ignored now that the Read column has been removed.
        }
      }
    } catch {}
    hydratedFiltersRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist filter state after hydration.
  useEffect(() => {
    if (!hydratedFiltersRef.current) return;
    try {
      localStorage.setItem(
        FILTERS_KEY,
        JSON.stringify({
          rating: [...ratingChecked],
          stage: [...stageChecked],
        })
      );
    } catch {}
  }, [ratingChecked, stageChecked]);

  // Close the filter panel on click-outside / Escape.
  useEffect(() => {
    if (!filtersOpen) return;
    function onDocClick(e) {
      if (
        filtersPanelRef.current?.contains(e.target) ||
        filtersBtnRef.current?.contains(e.target)
      ) {
        return;
      }
      setFiltersOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setFiltersOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [filtersOpen]);

  function startColResize(e, key) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = colWidths[key] ?? COL_DEFAULTS[key] ?? 100;
    function onMove(ev) {
      const w = Math.max(COL_MIN_WIDTH, startWidth + (ev.clientX - startX));
      setColWidths((prev) => (prev[key] === w ? prev : { ...prev, [key]: w }));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  const totalTableWidth =
    (colWidths.__select ?? COL_DEFAULTS.__select) +
    COLUMNS.reduce((sum, c) => sum + (colWidths[c.key] ?? COL_DEFAULTS[c.key] ?? 100), 0) +
    (colWidths.__delete ?? COL_DEFAULTS.__delete);

  // Build query string for CSV export (server still does the filtering for
  // exports so the download matches what the user sees).
  function appendFilterParams(url) {
    if (search) url.searchParams.set('search', search);
    if (ratingChecked.size < allRatingOpts.length) {
      if (ratingChecked.size === 0) url.searchParams.append('rating', '__nomatch__');
      else ratingChecked.forEach((r) => url.searchParams.append('rating', r));
    }
    if (stageChecked.size < allStageOpts.length) {
      if (stageChecked.size === 0) url.searchParams.append('stage', '__nomatch__');
      else stageChecked.forEach((s) => url.searchParams.append('stage', s));
    }
  }

  // Monotonic request token. When the user triggers loadAll repeatedly
  // (writes, imports, manual refresh), an older response can resolve after
  // a newer one — we drop any response whose token isn't the latest.
  const loadAllTokenRef = useRef(0);

  const loadAll = useCallback(async () => {
    const token = ++loadAllTokenRef.current;
    const res = await fetch('/api/prospects');
    if (!res.ok) return;
    const data = await res.json();
    if (token !== loadAllTokenRef.current) return;
    setAllProspects(data.prospects || []);
    setStoreReady(true);
  }, []);

  // Initial load. Runs once.
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // The auto-mark-Finished effect lives further down, after `updateProspect`
  // is defined (it can't reference updateProspect before declaration).
  const autoFinishedRef = useRef(false);

  // ─── Client-side filter + sort projection ──────────────────────────────
  // Pure derivation from (allProspects, filter sets, search, sort). No
  // async, no network, no race conditions. Toggling a checkbox re-renders
  // synchronously with the new filter applied — the badge, the row count,
  // and the rendered rows are always one consistent snapshot.
  const visibleProspects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const ratingAll = ratingChecked.size === allRatingOpts.length;
    const stageAll = stageChecked.size === allStageOpts.length;

    let rows = allProspects.filter((p) => {
      if (q) {
        const hay = [p.name, p.business_name, p.email, p.domain, p.stage, p.rating, p.country]
          .map((x) => (x || '').toString().toLowerCase())
          .join(' ');
        if (!hay.includes(q)) return false;
      }
      if (!ratingAll) {
        const key = p.rating || NO_RATING;
        if (!ratingChecked.has(key)) return false;
      }
      if (!stageAll) {
        if (!stageChecked.has(p.stage || 'New')) return false;
      }
      if (dueOnly && !isDueProspect(p)) return false;
      return true;
    });

    // Sort. Default = 'New' stage on top, then last_contact_date DESC,
    // then id DESC. Column-header sort overrides default with the chosen
    // direction.
    const dir = sort.dir === 'desc' ? -1 : 1;
    function defaultCmp(a, b) {
      const aNew = a.stage === 'New' ? 0 : 1;
      const bNew = b.stage === 'New' ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      const aD = a.last_contact_date || '';
      const bD = b.last_contact_date || '';
      if (aD !== bD) {
        if (!aD) return 1;
        if (!bD) return -1;
        return aD > bD ? -1 : 1;
      }
      return (b.id || 0) - (a.id || 0);
    }
    function fieldCmp(key) {
      return (a, b) => {
        let av = a[key];
        let bv = b[key];
        if (key === 'days_ago') {
          // days_ago is derived. Asc means freshest first (smallest number).
          // Nulls (no last_contact_date) sort to the end regardless of dir.
          av = daysBetween(a.last_contact_date);
          bv = daysBetween(b.last_contact_date);
        }
        const aNull = av == null || av === '';
        const bNull = bv == null || bv === '';
        if (aNull && bNull) return 0;
        if (aNull) return 1;
        if (bNull) return -1;
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av).localeCompare(String(bv)) * dir;
      };
    }

    const sorted = [...rows];
    if (sort.key === 'default') sorted.sort(defaultCmp);
    else sorted.sort(fieldCmp(sort.key));
    return sorted;
  }, [allProspects, search, ratingChecked, stageChecked, dueOnly, sort, allRatingOpts.length, allStageOpts.length]);

  const dueCount = useMemo(
    () => allProspects.reduce((n, p) => n + (isDueProspect(p) ? 1 : 0), 0),
    [allProspects]
  );

  // ─── Bridge to window.bloomtrack ───────────────────────────────────────
  // Refs let us hand the API stable closures over the live store + write
  // path without recreating the API on every render.
  const getAllRef = useRef(() => []);
  getAllRef.current = () => allProspectsRef.current;
  const updateProspectByIdRef = useRef(async () => null);
  const refreshRef = useRef(async () => {});
  refreshRef.current = () => loadAll();

  // Install / tear down the window.bloomtrack automation surface.
  useEffect(() => {
    const api = makeBloomtrackApi({
      stages,
      ratings,
      countries,
      autoEmailStages: AUTO_EMAIL_STAGES,
      getAllProspects: () => getAllRef.current(),
      updateProspectById: (id, patch) => updateProspectByIdRef.current(id, patch),
      refresh: () => refreshRef.current(),
    });
    if (typeof window !== 'undefined') {
      window.bloomtrack = api;
      // eslint-disable-next-line no-console
      console.info(
        '[bloomtrack] window.bloomtrack ready:\n  ' +
          Object.keys(api).filter((k) => typeof api[k] === 'function').join(', ')
      );
    }
    return () => {
      if (typeof window !== 'undefined' && window.bloomtrack === api) {
        delete window.bloomtrack;
      }
    };
  }, [stages, ratings, countries]);

  const hiddenCount =
    (allRatingOpts.length - ratingChecked.size) +
    (allStageOpts.length - stageChecked.size) +
    (dueOnly ? 1 : 0);
  const hasActiveFilter = search.length > 0 || hiddenCount > 0;
  const totalCount = allProspects.length;
  const showEmptyState = storeReady && totalCount === 0 && !hasActiveFilter;

  function toggleInSet(setter, value) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }
  function selectAllFilters() {
    setRatingChecked(new Set(allRatingOpts));
    setStageChecked(new Set(allStageOpts));
  }
  function clearAllFilters() {
    setRatingChecked(new Set());
    setStageChecked(new Set());
  }
  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'default', dir: 'asc' };
    });
  }

  // Canonical write path. Used by the UI cells (rating, stage, etc.) AND
  // by window.bloomtrack.* — there's only one path, so there's only one
  // place a write can go wrong. Writes are keyed by stable id, patch the
  // canonical `allProspects` array (not any filtered view), then replace
  // the row with the server's confirmed row on success.
  //
  // The silent-revert bug fix: the previous architecture re-fetched
  // filtered rows from the server on every filter change. A PUT in flight
  // could be raced by a GET that returned pre-write rows, and the row in
  // the filtered view would silently revert to the old stage. Now there's
  // no per-filter-change refetch — the store is the single truth and
  // filter changes are pure derivations from it.
  const updateProspect = useCallback(async (id, patch) => {
    let prevSnapshot;
    setAllProspects((prev) => {
      prevSnapshot = prev;
      return prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
    });
    try {
      const res = await fetch(`/api/prospects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`save failed (${res.status}) ${body}`);
      }
      const data = await res.json();
      const fresh = data.prospect;
      setAllProspects((prev) => prev.map((p) => (p.id === id ? fresh : p)));
      return fresh;
    } catch (e) {
      if (prevSnapshot) setAllProspects(prevSnapshot);
      // eslint-disable-next-line no-alert
      alert('Save failed: ' + e.message);
      throw e;
    }
  }, []);

  // Expose the canonical write path to window.bloomtrack via the bridge ref.
  updateProspectByIdRef.current = updateProspect;

  // Auto-mark Finished: once the canonical store hydrates on first load,
  // sweep for Email 5 rows whose last_contact_date is FINISHED_AFTER_DAYS+
  // old and flip them to 'Finished'. Runs at most once per page load
  // (guarded by autoFinishedRef) so it doesn't re-fire on later state
  // changes. Idempotent — once a row is 'Finished' it won't re-match.
  useEffect(() => {
    if (!storeReady || autoFinishedRef.current) return;
    autoFinishedRef.current = true;
    const candidates = allProspectsRef.current.filter((p) => {
      if (p.stage !== FINISHED_FROM_STAGE) return false;
      const d = daysBetween(p.last_contact_date);
      return d != null && d >= FINISHED_AFTER_DAYS;
    });
    if (candidates.length === 0) return;
    Promise.all(
      candidates.map((p) =>
        updateProspect(p.id, { stage: 'Finished' }).catch(() => null)
      )
    ).then(() => {
      // eslint-disable-next-line no-console
      console.info(
        `[bloomtrack] auto-marked ${candidates.length} ${FINISHED_FROM_STAGE} → Finished (${FINISHED_AFTER_DAYS}+ days)`
      );
    });
  }, [storeReady, updateProspect]);

  async function handleStageChange(p, newStage) {
    const patch = { stage: newStage };
    if (AUTO_EMAIL_STAGES.has(newStage)) {
      patch.last_contact_date = todayIso();
      patch.emails_sent = (p.emails_sent || 0) + 1;
    } else if (STAMP_ONLY_STAGES.has(newStage)) {
      patch.last_contact_date = todayIso();
    }
    await updateProspect(p.id, patch);
  }

  async function addProspect(e) {
    e?.preventDefault?.();
    const { name, business_name, email, domain, country, claude_chat_link } = quickAdd;
    if (!name && !business_name && !email && !domain) return;
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        business_name,
        email,
        domain,
        country: country || null,
        claude_chat_link: claude_chat_link.trim() || null,
        rating: '💚', // new prospects default to Strong
        stage: 'New',
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuickAdd({ name: '', business_name: '', email: '', domain: '', country: '', claude_chat_link: '' });
      // Push directly into the canonical store — no refetch needed.
      setAllProspects((prev) => [data.prospect, ...prev]);
      setHighlightId(data.prospect.id);
      setTimeout(() => setHighlightId(null), 1800);
    } else {
      // Don't fail silently — surface the server error so a broken write
      // path (e.g. a 405 from a bad deploy) is obvious instead of looking
      // like the button did nothing.
      const detail = await res.text().catch(() => '');
      alert(`Couldn't add prospect (HTTP ${res.status}). ${detail}`.trim());
    }
  }

  async function requestDelete(id) {
    if (pendingDelete === id) {
      setPendingDelete(null);
      const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setAllProspects((prev) => prev.filter((p) => p.id !== id));
        setSelected((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    } else {
      setPendingDelete(id);
      setTimeout(() => {
        setPendingDelete((cur) => (cur === id ? null : cur));
      }, 3000);
    }
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} prospect(s)?`)) return;
    const ids = new Set(selected);
    await Promise.all(
      [...ids].map((id) => fetch(`/api/prospects/${id}`, { method: 'DELETE' }))
    );
    setAllProspects((prev) => prev.filter((p) => !ids.has(p.id)));
    setSelected(new Set());
  }

  async function bulkStage(newStage) {
    if (selected.size === 0) return;
    const ids = [...selected];
    // updateProspect already does optimistic + server confirm per row.
    await Promise.all(
      ids.map((id) => {
        const p = allProspectsRef.current.find((x) => x.id === id);
        const patch = { stage: newStage };
        if (AUTO_EMAIL_STAGES.has(newStage) && p) {
          patch.last_contact_date = todayIso();
          patch.emails_sent = (p.emails_sent || 0) + 1;
        } else if (STAMP_ONLY_STAGES.has(newStage)) {
          patch.last_contact_date = todayIso();
        }
        return updateProspect(id, patch).catch(() => null);
      })
    );
  }

  async function bulkRating(newRating) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => updateProspect(id, { rating: newRating }).catch(() => null))
    );
  }

  async function bulkCountry(newCountry) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => updateProspect(id, { country: newCountry }).catch(() => null))
    );
  }

  function onFilePick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || '');
      setImportCsvText(text);
      const res = await fetch('/api/prospects/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv: text, confirm: false }),
      });
      const data = await res.json();
      if (res.ok) setImportPreview(data);
      else alert(data.error || 'Import preview failed');
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function confirmImport() {
    const res = await fetch('/api/prospects/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: importCsvText, confirm: true }),
    });
    if (res.ok) {
      const data = await res.json();
      setImportPreview(null);
      setImportCsvText('');
      await loadAll();
      alert(`Imported ${data.imported}, skipped ${data.skipped}.`);
    } else {
      alert('Import failed');
    }
  }

  function exportCsv() {
    const url = new URL('/api/prospects/export', window.location.origin);
    appendFilterParams(url);
    window.location.href = url.toString();
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleSelectAll() {
    if (selected.size === visibleProspects.length) setSelected(new Set());
    else setSelected(new Set(visibleProspects.map((p) => p.id)));
  }

  return (
    <div className="min-h-screen px-6 py-10 sm:py-14 max-w-[1500px] mx-auto">
      <header className="mb-10 flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-5xl sm:text-6xl leading-none tracking-tight text-charcoal">
            Bloomtrack
          </h1>
          <p className="mt-2 text-sm font-mono uppercase tracking-[0.18em] text-muted">
            Prospecting · since today
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <WorldClockBar />
          <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
            {totalCount} prospect{totalCount === 1 ? '' : 's'} on file
          </div>
        </div>
      </header>

      {/* View switcher: prospects table vs. live stats. */}
      <div className="mb-6 inline-flex rounded-xl border border-line bg-surface p-1 shadow-card">
        {[
          { key: 'prospects', label: 'Prospects' },
          { key: 'stats', label: 'Stats' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg transition ${
              view === t.key ? 'bg-charcoal text-paper' : 'text-charcoal-2 hover:bg-blush-soft'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'prospects' && (
      <div className="mb-5 flex items-center gap-3 flex-wrap relative">
        {/* Search + filter share a soft "input group" container so they
            read as one tool rather than two stacked widgets. */}
        <div className="flex items-center gap-2 bg-surface border border-line rounded-xl px-2 py-1.5 shadow-card">
          <span className="ml-1 text-muted">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search name, business, email, domain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-2 py-1.5 text-sm bg-transparent border-0 outline-none w-72 placeholder:text-muted/80"
          />

          <div className="relative">
            <button
              ref={filtersBtnRef}
              onClick={() => setFiltersOpen((v) => !v)}
              className={`px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg flex items-center gap-1.5 transition ${
                hiddenCount > 0
                  ? 'bg-mauve text-white'
                  : 'text-charcoal-2 hover:bg-blush-soft'
              }`}
            >
              <span>Filters</span>
              {hiddenCount > 0 && (
                <span className="text-[10px] opacity-80">· {hiddenCount}</span>
              )}
              <span className="text-[10px] opacity-70">▾</span>
            </button>

            {filtersOpen && (
              <FilterPanel
                ref={filtersPanelRef}
                ratings={ratings}
                stages={stages}
                ratingChecked={ratingChecked}
                stageChecked={stageChecked}
                toggleRating={(r) => toggleInSet(setRatingChecked, r)}
                toggleStage={(s) => toggleInSet(setStageChecked, s)}
                onSelectAll={selectAllFilters}
                onClearAll={clearAllFilters}
                onDone={() => setFiltersOpen(false)}
              />
            )}
          </div>

          {/* Due quick-filter. One click filters the table to rows where
              stage ∈ {Email 1, 2, 3} AND days_ago ≥ 3 — the daily-sweep
              shortlist. Count badge shows total due across the whole
              store, not the current view, so it stays meaningful even
              when other filters are on. */}
          <button
            onClick={() => setDueOnly((v) => !v)}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg flex items-center gap-1.5 transition ${
              dueOnly
                ? 'bg-mauve-deep text-white'
                : 'text-charcoal-2 hover:bg-blush-soft'
            }`}
            title={dueOnly ? 'Showing only due prospects — click to clear' : 'Show only prospects due for follow-up (Email 1→3d, Email 2→5d, Email 3-4→7d, Snoozed→30d, Re-warm→60d)'}
          >
            <Icon name="bell" className="w-3.5 h-3.5" />
            <span>Due</span>
            {dueCount > 0 && (
              <span className="text-[10px] opacity-80">· {dueCount}</span>
            )}
          </button>
        </div>

        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {hasActiveFilter
            ? `${visibleProspects.length} / ${totalCount} shown`
            : `${totalCount} total`}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] text-charcoal-2 rounded-lg hover:bg-blush-soft transition"
          >
            Import CSV
          </button>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            className="hidden"
            onChange={onFilePick}
          />
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] text-charcoal-2 rounded-lg hover:bg-blush-soft transition"
          >
            Export CSV
          </button>
        </div>
      </div>
      )}

      {view === 'stats' ? (
        <StatsView prospects={allProspects} stages={stages} />
      ) : showEmptyState ? (
        <section className="bg-surface border border-line rounded-2xl p-16 text-center shadow-card">
          <div className="inline-flex w-16 h-16 mb-5 rounded-full bg-blush-soft items-center justify-center text-mauve-deep">
            <Icon name="sprout" className="w-7 h-7" />
          </div>
          <h2 className="font-serif text-3xl text-charcoal mb-2">
            A quiet beginning.
          </h2>
          <p className="text-sm text-charcoal-2 mb-8 max-w-sm mx-auto leading-relaxed">
            Nothing yet. Import your CSV — or just add the first prospect by
            hand. Either way, every row from here will save automatically.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 text-xs font-mono uppercase tracking-[0.18em] bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition"
          >
            Import CSV
          </button>
        </section>
      ) : (
        <>
          {/* Quick-add lives as a separate card above the table so it
              reads like an intentional "new entry" affordance rather
              than a header row of the table. */}
          <form
            onSubmit={addProspect}
            className="mb-3 bg-surface border border-line rounded-2xl p-4 shadow-card"
          >
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-3">
              Add a prospect
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Name"
                value={quickAdd.name}
                onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white flex-1 min-w-[140px] transition"
              />
              <input
                type="text"
                placeholder="Business"
                value={quickAdd.business_name}
                onChange={(e) => setQuickAdd({ ...quickAdd, business_name: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white flex-1 min-w-[160px] transition"
              />
              <input
                type="text"
                placeholder="Email or @handle"
                value={quickAdd.email}
                onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white flex-1 min-w-[200px] transition"
              />
              <input
                type="text"
                placeholder="Domain"
                value={quickAdd.domain}
                onChange={(e) => setQuickAdd({ ...quickAdd, domain: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white flex-1 min-w-[160px] transition"
              />
              <select
                value={quickAdd.country}
                onChange={(e) => setQuickAdd({ ...quickAdd, country: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white transition text-charcoal"
                title="Country"
              >
                <option value="">Country</option>
                {countries.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Chat link"
                value={quickAdd.claude_chat_link}
                onChange={(e) => setQuickAdd({ ...quickAdd, claude_chat_link: e.target.value })}
                className="px-3 py-2 text-sm bg-paper border border-line rounded-lg focus:outline-none focus:border-mauve focus:bg-white flex-1 min-w-[160px] transition"
              />
              <button
                type="submit"
                className="px-5 py-2 text-xs font-mono uppercase tracking-[0.18em] bg-charcoal text-paper rounded-lg hover:bg-mauve-deep transition"
              >
                Add
              </button>
            </div>
          </form>

          <div
            className="bg-surface border border-line rounded-2xl overflow-x-auto shadow-card bw-scroll"
            onClick={(e) => {
              // Active-row tracking. A click anywhere inside a data row pins
              // that row; a click on empty tbody/wrapper space clears it.
              // Header clicks (sort, resize handles) are ignored entirely.
              if (e.target.closest('thead')) return;
              const tr = e.target.closest('tr[data-row-id]');
              if (tr) setActiveRowId(Number(tr.dataset.rowId));
              else setActiveRowId(null);
            }}
          >
            <table
              className="text-sm border-collapse"
              style={{ tableLayout: 'fixed', width: totalTableWidth }}
            >
              <colgroup>
                <col style={{ width: colWidths.__select ?? COL_DEFAULTS.__select }} />
                {COLUMNS.map((c) => (
                  <col
                    key={c.key}
                    style={{ width: colWidths[c.key] ?? COL_DEFAULTS[c.key] ?? 100 }}
                  />
                ))}
                <col style={{ width: colWidths.__delete ?? COL_DEFAULTS.__delete }} />
              </colgroup>
              {/* Header is mono uppercase tracked, sits on the paper bg
                  with a hairline divider below — feels like a column
                  label, not a heavy table header. */}
              <thead className="bg-paper/60">
                <tr className="border-b border-line">
                  <th className="relative px-3 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={visibleProspects.length > 0 && selected.size === visibleProspects.length}
                      onChange={toggleSelectAll}
                    />
                    <ColResizer onMouseDown={(e) => startColResize(e, '__select')} />
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className="relative py-3 px-3 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-charcoal cursor-pointer select-none whitespace-nowrap overflow-hidden transition"
                    >
                      {c.label}
                      {sort.key === c.key && (
                        <span className="ml-1 text-mauve">{sort.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                      <ColResizer onMouseDown={(e) => startColResize(e, c.key)} />
                    </th>
                  ))}
                  <th className="relative">
                    <ColResizer onMouseDown={(e) => startColResize(e, '__delete')} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleProspects.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 2}
                      className="px-4 py-14 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted"
                    >
                      No matches. Adjust filters or add a prospect.
                    </td>
                  </tr>
                )}
                {visibleProspects.map((p) => {
                  const stageKey = p.stage || 'New';
                  const c = stageStyle(stageKey);
                  const highlighted = highlightId === p.id;
                  const isPending = pendingDelete === p.id;
                  const isActive = activeRowId === p.id;
                  // Per-row visual identity is now a 4px left stripe in the
                  // stage's border color (painted via the --stage-stripe CSS
                  // variable, see globals.css). No more full-row tint — the
                  // chip alone carries the stage color so the table stays
                  // scannable. `faded` still dims the row slightly for
                  // dead-end stages like Lost.
                  const rowStyle = {
                    '--stage-stripe': c.border,
                    opacity: c.faded ? 0.7 : 1,
                  };
                  return (
                    <tr
                      key={p.id}
                      data-row-id={p.id}
                      data-active-row={isActive ? 'true' : undefined}
                      ref={(el) => (rowRefs.current[p.id] = el)}
                      className={`group border-b border-line transition hover:bg-blush-soft/70 ${
                        highlighted ? 'ring-2 ring-mauve ring-inset' : ''
                      }`}
                      style={rowStyle}
                    >
                      <td className="px-2 py-1 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleSelect(p.id)}
                        />
                      </td>
                      <EditableCell
                        value={p.name}
                        onSave={(v) => updateProspect(p.id, { name: v })}
                        displayClassName="font-medium text-charcoal"
                      />
                      <EditableCell
                        value={p.business_name}
                        onSave={(v) => updateProspect(p.id, { business_name: v })}
                        displayClassName="text-muted"
                      />
                      <EditableCell value={p.email} onSave={(v) => updateProspect(p.id, { email: v })} />
                      <td className="px-2 py-1 align-top">
                        <DomainCell
                          value={p.domain}
                          onSave={(v) => updateProspect(p.id, { domain: v })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <CountryPicker
                          value={p.country}
                          options={countries}
                          onChange={(v) => updateProspect(p.id, { country: v })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <RatingCell
                          value={p.rating}
                          options={ratings}
                          onChange={(v) => updateProspect(p.id, { rating: v })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <StagePicker
                          value={stageKey}
                          stages={stages}
                          onChange={(s) => handleStageChange(p, s)}
                        />
                      </td>
                      <NumberCell
                        value={p.emails_sent ?? 0}
                        onSave={(v) => updateProspect(p.id, { emails_sent: parseInt(v, 10) || 0 })}
                      />
                      <DaysAgoCell value={p.last_contact_date} due={isDueProspect(p)} />
                      <EditableCell
                        value={p.last_contact_date}
                        type="date"
                        onSave={(v) => updateProspect(p.id, { last_contact_date: v || null })}
                      />
                      <td className="px-2 py-1 align-top">
                        <SeqCell prospect={p} onOpen={() => setSeqProspect(p)} />
                      </td>
                      <td className="px-2 py-1 align-top">
                        <ChatCell
                          value={p.claude_chat_link}
                          onSave={(v) => updateProspect(p.id, { claude_chat_link: v })}
                        />
                      </td>
                      <td className="px-2 py-1 align-top text-right">
                        <button
                          onClick={() => requestDelete(p.id)}
                          className={`text-xs transition-opacity ${
                            isPending
                              ? 'opacity-100 text-red-600 font-semibold'
                              : 'opacity-0 group-hover:opacity-100 text-muted hover:text-red-600'
                          }`}
                          title={isPending ? 'Click again to confirm' : 'Delete'}
                        >
                          {isPending ? 'Confirm?' : '✕'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-charcoal text-paper px-5 py-3 rounded-full shadow-pill flex items-center gap-3 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/80">
            <span className="num-tabular text-paper">{selected.size}</span> selected
          </span>
          <span className="w-px h-4 bg-paper/20" />
          <select
            onChange={(e) => {
              if (e.target.value) {
                bulkRating(e.target.value === '__clear' ? null : e.target.value);
                e.target.value = '';
              }
            }}
            className="bg-transparent border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            defaultValue=""
          >
            <option value="" disabled>Change rating…</option>
            <option value="__clear">— clear —</option>
            {ratings.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            onChange={(e) => {
              if (e.target.value) {
                bulkStage(e.target.value);
                e.target.value = '';
              }
            }}
            className="bg-transparent border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            defaultValue=""
          >
            <option value="" disabled>Change stage…</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {stageLabel(s)}
              </option>
            ))}
          </select>
          <select
            onChange={(e) => {
              if (e.target.value) {
                bulkCountry(e.target.value === '__clear' ? null : e.target.value);
                e.target.value = '';
              }
            }}
            className="bg-transparent border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            defaultValue=""
          >
            <option value="" disabled>Change country…</option>
            <option value="__clear">— clear —</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <span className="w-px h-4 bg-paper/20" />
          <button
            onClick={bulkDelete}
            className="text-xs font-mono uppercase tracking-[0.12em] text-red-300 hover:text-red-200"
          >
            Delete
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs font-mono uppercase tracking-[0.12em] text-paper/50 hover:text-paper"
          >
            Clear
          </button>
        </div>
      )}

      {seqProspect && (
        <EmailSequenceModal
          prospect={seqProspect}
          onClose={() => setSeqProspect(null)}
        />
      )}

      {importPreview && (
        <div className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-surface border border-line rounded-2xl p-7 max-w-md w-full shadow-card">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-2">
              Preview
            </div>
            <h3 className="font-serif text-3xl text-charcoal mb-5 leading-tight">
              Ready to import?
            </h3>
            <dl className="space-y-2.5 mb-7">
              <Stat label="In CSV" value={importPreview.total} />
              <Stat label="To insert" value={importPreview.toInsert} accent />
              <Stat label="Duplicates skipped" value={importPreview.skipped} muted />
            </dl>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setImportPreview(null);
                  setImportCsvText('');
                }}
                className="px-4 py-2 text-xs font-mono uppercase tracking-[0.16em] text-charcoal-2 rounded-full hover:bg-blush-soft transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-5 py-2 text-xs font-mono uppercase tracking-[0.18em] bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----- World clock ----- */

// Real-time digital clocks shown as a strip at the top. Times are derived
// per-tick from a single Date via Intl timezone formatting — no per-clock
// timers, just one interval.
const WORLD_CLOCKS = [
  { label: 'Toronto',     tz: 'America/Toronto' },
  { label: 'LA · PST',    tz: 'America/Los_Angeles' },
  { label: 'Florida',     tz: 'America/New_York' },
  { label: 'Sydney',      tz: 'Australia/Sydney' },
  { label: 'London',      tz: 'Europe/London' },
];

function WorldClockBar() {
  // Start null so SSR and first client render match (no hydration mismatch);
  // fill in on mount, then tick every second.
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
      {WORLD_CLOCKS.map((c) => {
        const time = now
          ? now.toLocaleTimeString('en-US', {
              timeZone: c.tz, hour: 'numeric', minute: '2-digit', hour12: true,
            })
          : '––:––';
        return (
          <span key={c.tz} className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
            <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">
              {c.label}
            </span>
            <span className="text-xs font-mono num-tabular text-charcoal-2">
              {time}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ----- Email sequence ----- */

// Compact cell that reads at a glance:
//   · no sequence, no extras → ghost mail + "＋" (add a sequence)
//   · no sequence, but audit/PDF exist → clipboard (there's data worth seeing)
//   · sequence with unsent emails → mail + count of what's LEFT to send
//   · sequence fully sent → green check (complete)
// Clicking always opens the viewer modal.
function SeqCell({ prospect, onOpen }) {
  const seq = parseEmailSequence(prospect.email_sequence);
  const count = Array.isArray(seq) ? seq.length : 0;
  const hasExtras = !!(prospect.audit_notes || prospect.pdf_filename);

  // Nothing stored at all — invite adding a sequence.
  if (!count && !hasExtras) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg border border-dashed border-line text-muted/60 hover:text-mauve-deep hover:border-mauve transition"
        title="No emails stored — click to view"
      >
        <Icon name="mail" className="w-3.5 h-3.5" />
        <span className="text-[10px] font-mono leading-none">＋</span>
      </button>
    );
  }

  // Audit notes / PDF but no emails yet — still worth opening.
  if (!count) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center px-1.5 py-1 rounded-lg border border-line text-charcoal-2 hover:bg-blush-soft transition"
        title="Audit notes / PDF stored — click to view"
      >
        <Icon name="clipboard" className="w-3.5 h-3.5" />
      </button>
    );
  }

  const lastSent = getLastSentNumber(prospect);
  const unsent = seq.filter((e) => (e.number || 0) > lastSent).length;

  // Every stored email has gone out.
  if (unsent === 0) {
    return (
      <button
        onClick={onOpen}
        className="inline-flex items-center px-1.5 py-1 rounded-lg border border-line hover:bg-blush-soft transition"
        style={{ color: '#3D8030' }}
        title={`All ${count} email${count === 1 ? '' : 's'} sent — click to view`}
      >
        <Icon name="check-circle" className="w-3.5 h-3.5" />
      </button>
    );
  }

  // Some still to send — the badge is a to-do count.
  return (
    <button
      onClick={onOpen}
      className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg border border-line hover:bg-blush-soft transition text-mauve-deep"
      title={`${unsent} of ${count} email${count === 1 ? '' : 's'} left to send — click to view`}
    >
      <Icon name="mail" className="w-3.5 h-3.5" />
      <span className="text-[11px] font-mono num-tabular text-charcoal-2">{unsent}</span>
    </button>
  );
}

// Read-only viewer for the stored cold-outreach sequence. Bodies render in a
// pre-wrap block so line breaks and spacing survive exactly as stored.
function EmailSequenceModal({ prospect, onClose }) {
  const [showAll, setShowAll] = useState(false);
  const seq = parseEmailSequence(prospect.email_sequence) || [];
  const sorted = [...seq].sort((a, b) => (a.number || 0) - (b.number || 0));

  const lastSent = getLastSentNumber(prospect);
  const unsent = sorted.filter((e) => (e.number || 0) > lastSent);
  const sentCount = sorted.length - unsent.length;
  const allSent = sorted.length > 0 && unsent.length === 0;
  const nextUp = unsent[0] || null;
  // Only worth a toggle when there's actually something hidden either way.
  const canToggle = sentCount > 0 && unsent.length > 0;
  // When everything's sent there's nothing to hide, so always show the lot.
  const visible = showAll || allSent ? sorted : unsent;
  // Email 4 means Email 5 (the one carrying the PDF) is up next.
  const pdfIsNext = prospect.stage === 'Email 4';

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const title = prospect.business_name || prospect.name || prospect.email || 'Prospect';

  return (
    <div
      className="fixed inset-0 bg-charcoal/40 backdrop-blur-sm flex items-center justify-center z-50 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl shadow-card w-full max-w-2xl max-h-full overflow-y-auto bw-scroll"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-line px-7 pt-6 pb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-1">
              Email sequence
            </div>
            <h3 className="font-serif text-2xl text-charcoal leading-tight">{title}</h3>
            {prospect.email && (
              <div className="mt-1 text-xs font-mono text-muted">{prospect.email}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 text-muted hover:text-charcoal text-sm px-2 py-1 rounded hover:bg-blush-soft transition"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>

        <div className="px-7 py-6 space-y-6">
          {prospect.audit_notes && (
            <section>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-2">
                Audit notes
              </div>
              <div className="bg-paper border border-line rounded-xl p-4 text-sm text-charcoal-2 whitespace-pre-wrap leading-relaxed">
                {prospect.audit_notes}
              </div>
            </section>
          )}

          {prospect.pdf_filename && (
            <section>
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-2">
                Email 5 PDF
              </div>
              <div
                className={`inline-flex flex-col gap-1 rounded-lg px-3 py-2 border transition ${
                  pdfIsNext ? 'border-mauve bg-blush-soft' : 'border-line bg-paper'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  <span className="text-mauve-deep">
                    <Icon name="file-text" className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-mono text-charcoal-2">
                    {prospect.pdf_filename}
                  </span>
                </span>
                <span className="text-[10px] font-mono text-muted">
                  Stored in prospect-pdfs/
                </span>
              </div>
              {pdfIsNext && (
                <p className="mt-1.5 text-[10px] font-mono text-mauve-deep">
                  Email 5 is next — attach this.
                </p>
              )}
            </section>
          )}

          <section>
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted">
                Emails ({sorted.length})
              </div>
              {canToggle && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="text-[10px] font-mono uppercase tracking-[0.14em] text-mauve-deep hover:underline"
                >
                  {showAll ? 'Show unsent only' : `Show all emails (${sentCount} sent)`}
                </button>
              )}
            </div>

            {sorted.length === 0 ? (
              <p className="text-sm text-muted italic">
                No emails stored for this prospect yet.
              </p>
            ) : (
              <>
                {allSent && (
                  <p className="mb-3 text-[11px] font-mono text-muted">Sequence complete.</p>
                )}
                <div className="space-y-4">
                  {visible.map((e, i) => (
                    <EmailCard
                      key={e.number ?? i}
                      email={e}
                      sent={(e.number || 0) <= lastSent}
                      isNext={!!nextUp && e.number === nextUp.number}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// One email in the sequence. `sent` dims it and swaps in a SENT pill;
// `isNext` gives it the mauve left-edge stripe as the one to send next.
function EmailCard({ email, sent, isNext }) {
  return (
    <article
      className={`bg-paper border border-line rounded-xl overflow-hidden transition ${
        isNext ? 'border-l-4 border-l-mauve-deep' : ''
      } ${sent ? 'opacity-60' : ''}`}
    >
      <header className="px-4 py-3 border-b border-line/70 flex items-center gap-2.5 flex-wrap">
        <span
          className={`shrink-0 w-6 h-6 rounded-full text-[11px] font-mono flex items-center justify-center ${
            sent ? 'bg-charcoal/10 text-muted' : 'bg-mauve text-white'
          }`}
        >
          {email.number}
        </span>
        {sent && (
          <span className="bg-charcoal/10 text-muted text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full">
            Sent
          </span>
        )}
        {isNext && (
          <span className="bg-mauve-deep text-white text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full">
            Next to send
          </span>
        )}
        <span
          className={`text-sm font-medium leading-snug min-w-0 ${
            sent ? 'text-muted' : 'text-charcoal'
          }`}
        >
          {email.subject || <span className="text-muted italic">(no subject)</span>}
        </span>
      </header>
      <pre className="px-4 py-3 text-sm text-charcoal-2 whitespace-pre-wrap font-sans leading-relaxed m-0">{email.body}</pre>
    </article>
  );
}

/* ----- Stats view ----- */

// Live analytics over the canonical prospect list. Pure derivation via
// useMemo — recomputes instantly whenever a stage changes, no refetch.
function StatsView({ prospects, stages }) {
  const s = useMemo(() => computeStats(prospects), [prospects]);
  const maxStage = Math.max(1, ...stages.map((st) => s.byStage[st] || 0));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total prospects" value={s.total} />
        <StatCard label="Reached out" value={s.reachedOut} sub={`${s.newCount} still New`} />
        <StatCard label="Responded" value={s.responded} sub={`${s.responseRate}% response rate`} accent />
        <StatCard
          label="Clients"
          value={s.clients}
          sub={`${s.conversionRate}% conversion${s.paymentAwaiting ? ` · ${s.paymentAwaiting} awaiting pay` : ''}`}
          accent
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Interested" value={s.interested} small />
        <StatCard label="Booked calls" value={s.booked} small />
        <StatCard label="Rejected" value={s.rejected} small />
        <StatCard label="Lost" value={s.lost} small />
      </div>

      <div className="bg-surface border border-line rounded-2xl p-5 shadow-card">
        <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted mb-4">
          Breakdown by stage
        </div>
        <div className="space-y-1.5">
          {stages.map((st) => {
            const count = s.byStage[st] || 0;
            const meta = STAGE_META[st] || {};
            const share = s.total > 0 ? Math.round((count / s.total) * 100) : 0;
            return (
              <div key={st} className="flex items-center gap-3">
                <span
                  className="w-36 shrink-0 flex items-center gap-1.5 text-xs"
                  style={{ color: meta.faded ? 'var(--muted)' : 'var(--charcoal)' }}
                >
                  <span style={{ color: meta.border }}>
                    <StageIcon stage={st} className="w-3.5 h-3.5" />
                  </span>
                  <span className="truncate">{st}</span>
                </span>
                <div className="flex-1 h-4 rounded bg-paper overflow-hidden">
                  <div
                    className="h-full rounded-r"
                    style={{
                      width: `${(count / maxStage) * 100}%`,
                      backgroundColor: meta.bg,
                      borderRight: count ? `2px solid ${meta.border}` : 'none',
                    }}
                  />
                </div>
                <span className="w-10 text-right font-mono num-tabular text-xs text-charcoal">
                  {count}
                </span>
                <span className="w-10 text-right font-mono num-tabular text-[10px] text-muted">
                  {share}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[10px] font-mono text-muted/80 leading-relaxed">
        Response rate = responded ÷ reached out. "Responded" counts anyone who
        replied — Replied, Interested, Booked, Client, Payment Awaiting,
        Rejected, and Snoozed. Lost (no reply) and Re-warm don't count.
        Conversion = Clients ÷ reached out.
      </p>
    </div>
  );
}

function StatCard({ label, value, sub, accent, small }) {
  return (
    <div className={`bg-surface border rounded-2xl p-4 shadow-card ${accent ? 'border-mauve' : 'border-line'}`}>
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted">{label}</div>
      <div
        className={`mt-1 font-mono num-tabular ${small ? 'text-2xl' : 'text-4xl'} ${
          accent ? 'text-mauve-deep' : 'text-charcoal'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] font-mono text-muted">{sub}</div>}
    </div>
  );
}

/* ----- Cell components ----- */

const FilterPanel = forwardRef(function FilterPanel(
  {
    ratings,
    stages,
    ratingChecked,
    stageChecked,
    toggleRating,
    toggleStage,
    onSelectAll,
    onClearAll,
    onDone,
  },
  ref
) {
  return (
    <div
      ref={ref}
      className="absolute z-30 mt-3 left-0 w-72 max-h-[70vh] overflow-y-auto bg-surface border border-line rounded-2xl shadow-card p-4 bw-scroll"
    >
      <FilterSection label="Rating">
        {ratings.map((r) => {
          const rm = RATING_META[r] || {};
          return (
            <FilterRow
              key={r}
              checked={ratingChecked.has(r)}
              onChange={() => toggleRating(r)}
              label={
                <span className="flex items-center gap-2 text-sm text-charcoal">
                  <span
                    className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                    style={{ backgroundColor: rm.bg, borderColor: rm.color, color: rm.color }}
                  >
                    <Icon name={rm.icon} filled={rm.filled} className="w-3 h-3" />
                  </span>
                  {rm.label || r}
                </span>
              }
            />
          );
        })}
        <FilterRow
          checked={ratingChecked.has(NO_RATING)}
          onChange={() => toggleRating(NO_RATING)}
          label={
            <span className="flex items-center gap-2 text-sm text-muted italic">
              <span className="w-5 h-5 rounded-full border border-dashed border-line shrink-0" />
              (no rating)
            </span>
          }
        />
      </FilterSection>

      <FilterSection label="Stage">
        {stages.map((s) => {
          const m = STAGE_META[s] || {};
          return (
            <FilterRow
              key={s}
              checked={stageChecked.has(s)}
              onChange={() => toggleStage(s)}
              label={
                <span className={`flex items-center gap-2 text-sm ${m.faded ? 'text-muted' : 'text-charcoal'}`}>
                  <span
                    className="w-5 h-5 rounded-full border flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: m.bg === 'transparent' ? '#FBF7F0' : m.bg,
                      borderColor: m.border,
                      color: m.border,
                    }}
                  >
                    <StageIcon stage={s} className="w-3 h-3" />
                  </span>
                  {s}
                </span>
              }
            />
          );
        })}
      </FilterSection>

      <div className="mt-4 pt-3 border-t border-line/70 flex items-center justify-between">
        <div className="flex gap-4">
          <button
            onClick={onSelectAll}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-mauve-deep hover:underline"
          >
            Select all
          </button>
          <button
            onClick={onClearAll}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-charcoal"
          >
            Clear all
          </button>
        </div>
        <button
          onClick={onDone}
          className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] bg-charcoal text-paper rounded-full hover:bg-mauve-deep transition"
        >
          Done
        </button>
      </div>
    </div>
  );
});

// Small key-value row used in the import preview. Label is mono-uppercased,
// value is a tabular figure. `accent` makes the value mauve (the "this is
// what's happening" number), `muted` softens it (the skip count).
function Stat({ label, value, accent, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2 last:border-b-0 last:pb-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
        {label}
      </dt>
      <dd
        className={`font-mono num-tabular text-2xl ${
          accent ? 'text-mauve-deep' : muted ? 'text-muted' : 'text-charcoal'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function FilterSection({ label, children }) {
  return (
    <div className="mb-4 last:mb-0">
      <div className="text-[10px] font-mono font-semibold uppercase tracking-[0.18em] text-muted mb-2">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2.5 px-1.5 py-1 rounded-md hover:bg-blush-soft/60 cursor-pointer select-none transition">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
      {label}
    </label>
  );
}

function ColResizer({ onMouseDown }) {
  // Sits flush with the right edge of the header cell. Stops propagation so
  // mousedown doesn't bubble into the th's sort onClick.
  return (
    <div
      onMouseDown={onMouseDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-mauve/40 active:bg-mauve/60"
      style={{ zIndex: 1 }}
      title="Drag to resize"
    />
  );
}

function focusNextEditable(currentTd, shiftKey) {
  if (!currentTd) return;
  const row = currentTd.closest('tr');
  if (!row) return;
  const cells = Array.from(row.querySelectorAll('td[data-tab="1"]'));
  const idx = cells.indexOf(currentTd);
  const nextIdx = shiftKey ? idx - 1 : idx + 1;
  const next = cells[nextIdx];
  if (next) next.click();
}

function EditableCell({ value, onSave, type = 'text', displayClassName = '' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);
  const tdRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        try { input.select(); } catch {}
      }
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft === '' ? null : draft;
    if ((value ?? null) !== next) onSave(next);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value ?? '');
      setEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit();
      const td = tdRef.current;
      setTimeout(() => focusNextEditable(td, e.shiftKey), 0);
    }
  }

  return (
    <td
      ref={tdRef}
      data-tab="1"
      className="px-2 py-1 align-top"
      onClick={() => !editing && setEditing(true)}
    >
      {editing ? (
        <input
          ref={inputRef}
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="cell-input text-sm"
        />
      ) : (
        <span className={`cell-display text-sm ${displayClassName}`}>
          {value || <span className="text-muted/60">—</span>}
        </span>
      )}
    </td>
  );
}

function NumberCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? 0);
  const inputRef = useRef(null);
  const tdRef = useRef(null);
  const num = Number(value) || 0;
  const displayClass =
    num >= 3 ? 'font-bold text-charcoal' : num === 2 ? 'text-charcoal' : 'text-muted';

  useEffect(() => {
    if (!editing) setDraft(value ?? 0);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      if (input) {
        input.focus();
        try { input.select(); } catch {}
      }
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    const next = Number.isFinite(parsed) ? parsed : 0;
    if ((Number(value) || 0) !== next) onSave(next);
  }

  function onKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      setDraft(value ?? 0);
      setEditing(false);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      commit();
      const td = tdRef.current;
      setTimeout(() => focusNextEditable(td, e.shiftKey), 0);
    }
  }

  return (
    <td
      ref={tdRef}
      data-tab="1"
      className="px-2 py-1 align-top text-center"
      onClick={() => !editing && setEditing(true)}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          className="cell-input text-sm w-14 text-center"
        />
      ) : (
        <span className={`cell-display text-sm inline-block w-10 text-center font-mono num-tabular ${displayClass}`}>
          {num}
        </span>
      )}
    </td>
  );
}

function DaysAgoCell({ value, due }) {
  const n = daysBetween(value);
  if (n == null) {
    return (
      <td className="px-2 py-1 align-top text-center text-muted/60">—</td>
    );
  }
  const color = daysAgoColor(n);
  return (
    <td className="px-2 py-1 align-top text-center">
      <span className="inline-flex items-center gap-1.5">
        {due && (
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-mauve-deep text-white"
            title="Due for next email"
          >
            <Icon name="bell" className="w-2.5 h-2.5" />
          </span>
        )}
        <span style={{ color }} className="text-sm font-mono num-tabular font-semibold">
          {n}
        </span>
      </span>
    </td>
  );
}

function RatingCell({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Rating value in the DB is still the emoji string (so import/export
  // CSVs stay portable). We just render it as a colored icon swatch.
  const m = value ? RATING_META[value] : null;
  const buttonStyle = m
    ? { backgroundColor: m.bg, borderColor: m.border, color: m.color }
    : { backgroundColor: 'transparent', borderColor: '#E4DAD0', borderStyle: 'dashed', color: '#8A8194' };

  function pick(v) {
    setOpen(false);
    if ((value ?? null) !== (v ?? null)) onChange(v);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
        className="w-7 h-7 rounded-full border flex items-center justify-center transition hover:brightness-95"
        title={m?.label || 'Set rating'}
      >
        {m ? (
          <Icon name={m.icon} filled={m.filled} className="w-3.5 h-3.5" />
        ) : (
          <span className="text-xs">—</span>
        )}
      </button>
      {open && (
        <div className="absolute z-20 mt-1.5 left-0 bg-surface border border-line rounded-xl shadow-card p-1.5 flex flex-col gap-1">
          <button
            onClick={() => pick(null)}
            className="w-7 h-7 rounded-full border border-dashed border-line text-xs text-muted hover:bg-blush-soft transition flex items-center justify-center"
            title="Clear rating"
          >
            —
          </button>
          {options.map((r) => {
            const rm = RATING_META[r] || {};
            const isCurrent = r === value;
            return (
              <button
                key={r}
                onClick={() => pick(r)}
                style={{ backgroundColor: rm.bg, borderColor: rm.color, color: rm.color }}
                className={`w-7 h-7 rounded-full border flex items-center justify-center transition hover:brightness-95 ${
                  isCurrent ? 'ring-2 ring-offset-1 ring-offset-surface ring-mauve' : ''
                }`}
                title={rm.label || r}
              >
                <Icon name={rm.icon} filled={rm.filled} className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChatCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      try { inputRef.current?.select(); } catch {}
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim() === '' ? null : draft.trim();
    if ((value ?? null) !== next) onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className="cell-input text-sm"
        placeholder="Paste chat URL"
      />
    );
  }

  if (!value) {
    return (
      <span
        className="cell-display text-sm text-muted/60 cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to add chat URL"
      >
        —
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <a
        href={normalizeChatHref(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-mauve-deep hover:bg-blush-soft transition"
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        <Icon name="link" className="w-3.5 h-3.5" />
      </a>
      <button
        onClick={() => setEditing(true)}
        className="inline-flex items-center justify-center w-5 h-5 rounded text-muted hover:text-mauve-deep opacity-0 group-hover:opacity-100 transition"
        title="Edit"
      >
        <Icon name="pencil" className="w-3 h-3" />
      </button>
    </div>
  );
}

function DomainCell({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      try { inputRef.current?.select(); } catch {}
    }
  }, [editing]);

  function commit() {
    setEditing(false);
    const next = draft === '' ? null : draft;
    if ((value ?? null) !== next) onSave(next);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false); }
        }}
        className="cell-input text-sm"
      />
    );
  }
  if (!value) {
    return (
      <span className="cell-display text-sm text-muted/60" onClick={() => setEditing(true)}>
        —
      </span>
    );
  }
  return (
    <div className="flex items-center gap-1 min-w-0">
      <a
        href={normalizeDomainHref(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-mauve-deep hover:underline text-sm truncate min-w-0"
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        {value}
      </a>
      <button
        onClick={() => setEditing(true)}
        className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-muted hover:text-mauve-deep opacity-0 group-hover:opacity-100 transition"
        title="Edit"
      >
        <Icon name="pencil" className="w-3 h-3" />
      </button>
    </div>
  );
}
