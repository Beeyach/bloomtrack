'use client';

import { forwardRef, useEffect, useMemo, useRef, useState, useCallback } from 'react';

const COLUMNS = [
  { key: 'is_read',           label: 'Read' },
  { key: 'name',              label: 'Name' },
  { key: 'business_name',     label: 'Business' },
  { key: 'email',             label: 'Email' },
  { key: 'domain',            label: 'Domain' },
  { key: 'rating',            label: 'Rating' },
  { key: 'stage',             label: 'Stage' },
  { key: 'emails_sent',       label: '#' },
  { key: 'days_ago',          label: 'Days Ago' },
  { key: 'last_contact_date', label: 'Last Contact' },
  { key: 'claude_chat_link',  label: 'Chat' },
];

// Default column widths (px). User-resized values are merged from localStorage.
const COL_DEFAULTS = {
  __select: 40,
  is_read: 44,
  name: 160,
  business_name: 180,
  email: 220,
  domain: 180,
  rating: 70,
  stage: 150,
  emails_sent: 50,
  days_ago: 80,
  last_contact_date: 120,
  claude_chat_link: 60,
  __delete: 40,
};
const COL_MIN_WIDTH = 36;
const COL_WIDTHS_KEY = 'bloomtrack:colWidths:v1';

// Sentinel for "no rating" in the rating filter checklist.
const NO_RATING = '__none__';
const READ_OPTIONS = ['unread', 'read'];
const FILTERS_KEY = 'bloomtrack:filters:v1';

// Stage metadata. Each entry pairs a Lucide-style icon name (see Icon
// component) with a warm-paper-friendly bg/border. The `faded` flag dims
// the row for stages that are effectively dead-ends.
const STAGE_META = {
  New:        { icon: 'sparkle',        bg: 'transparent', border: '#B48EAD' },
  'Email 1':  { icon: 'send',           bg: '#F2EAE0',     border: '#C8B79C' },
  'Email 2':  { icon: 'send',           bg: '#EBE0D2',     border: '#BFAA8C' },
  'Email 3':  { icon: 'send',           bg: '#E2D4C2',     border: '#B59C7B' },
  'Email 4':  { icon: 'send',           bg: '#D8C8B5',     border: '#A88E6A' },
  'Email 5':  { icon: 'send',           bg: '#CDBAA6',     border: '#988059' },
  'Email 6':  { icon: 'send',           bg: '#C2AC97',     border: '#88714A' },
  'Email 7':  { icon: 'send',           bg: '#B89F8B',     border: '#79633E' },
  Recycled:   { icon: 'recycle',        bg: '#F2DCC8',     border: '#C8895A' },
  Rekindled:  { icon: 'flame',          bg: '#FBE0C2',     border: '#D9904A' },
  Replied:    { icon: 'message',        bg: '#DDE9CC',     border: '#7FA567' },
  Interested: { icon: 'heart',          bg: '#C8E4BF',     border: '#5B9F4F' },
  Potential:  { icon: 'trending-up',    bg: '#FBDFC2',     border: '#D4894A' },
  Nudge:      { icon: 'bell',           bg: '#F5E9B8',     border: '#BFA94A' },
  Booked:     { icon: 'calendar-check', bg: '#B5DEB5',     border: '#3F8C3F' },
  Unread:     { icon: 'mail-open',      bg: '#E6DECF',     border: '#A89A85' },
  Lost:       { icon: 'x-circle',       bg: '#E2DAD0',     border: '#998E81', faded: true },
  Closed:     { icon: 'check-circle',   bg: '#C9E5C9',     border: '#3F8C3F' },
};

// Rating metadata. Stored value in DB is still the emoji string (we don't
// want to migrate data). We just present it as a colored icon.
const RATING_META = {
  '💚': { icon: 'heart',      color: '#4F9E4F', bg: '#DEEFD6', label: 'Green' },
  '💙': { icon: 'heart',      color: '#5A85A6', bg: '#D8E5F0', label: 'Blue' },
  '🟠': { icon: 'circle-dot', color: '#D4894A', bg: '#FBE2C9', label: 'Orange' },
  '⭐':  { icon: 'star',       color: '#BFA94A', bg: '#FBF3CC', label: 'Star' },
  '🔥': { icon: 'flame',      color: '#C2543F', bg: '#FBD2C9', label: 'Hot' },
  '🟡': { icon: 'circle-dot', color: '#BFA94A', bg: '#FBF3CC', label: 'Yellow' },
  '✖️': { icon: 'x-circle',   color: '#998E81', bg: '#E4DAD0', label: 'Skip' },
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
function daysAgoColor(n) {
  if (n == null) return '#8A8194';
  if (n <= 2) return '#2F8C2F';      // green
  if (n <= 5) return '#C8B85A';      // amber
  if (n <= 10) return '#D4894A';     // orange
  return '#C2543F';                  // red
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
function Icon({ name, className = 'w-4 h-4', strokeWidth = 2 }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
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
  const wrapRef = useRef(null);
  const meta = STAGE_META[value] || STAGE_META.New;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(s) {
    setOpen(false);
    if (s !== value) onChange(s);
  }

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
      {open && (
        <div className="absolute z-30 mt-1.5 left-0 w-52 bg-surface border border-line rounded-xl shadow-card p-1.5 max-h-[60vh] overflow-y-auto bw-scroll">
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
        </div>
      )}
    </div>
  );
}

// Stages that imply an email just went out — bumps emails_sent + last_contact_date.
const AUTO_EMAIL_STAGES = new Set([
  'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5', 'Email 6', 'Email 7',
  'Recycled', 'Rekindled',
]);

export default function ProspectsApp({ stages, ratings }) {
  const [prospects, setProspects] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState('');
  // Filter sets hold the *checked* (visible) options. Default: everything checked.
  const allRatingOpts = useMemo(() => [...ratings, NO_RATING], [ratings]);
  const allStageOpts = useMemo(() => [...stages], [stages]);
  const [ratingChecked, setRatingChecked] = useState(() => new Set(allRatingOpts));
  const [stageChecked, setStageChecked] = useState(() => new Set(allStageOpts));
  const [readChecked, setReadChecked] = useState(() => new Set(READ_OPTIONS));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [activeRowId, setActiveRowId] = useState(null);
  const filtersBtnRef = useRef(null);
  const filtersPanelRef = useRef(null);
  const hydratedFiltersRef = useRef(false);
  const [sort, setSort] = useState({ key: 'default', dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [quickAdd, setQuickAdd] = useState({ name: '', business_name: '', email: '', domain: '' });
  const [highlightId, setHighlightId] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [colWidths, setColWidths] = useState(COL_DEFAULTS);
  const rowRefs = useRef({});
  const fileInputRef = useRef(null);
  const hydratedWidthsRef = useRef(false);

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
          if (Array.isArray(stored.read)) {
            const valid = new Set(READ_OPTIONS);
            setReadChecked(new Set(stored.read.filter((v) => valid.has(v))));
          }
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
          read: [...readChecked],
        })
      );
    } catch {}
  }, [ratingChecked, stageChecked, readChecked]);

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

  // Apply the (checked) sets to URL params. If every option in a section is
  // checked, send nothing (= no filter). If zero are checked, send a sentinel
  // so the server returns no rows for that section.
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
    if (readChecked.size < READ_OPTIONS.length) {
      if (readChecked.size === 0) {
        // Both unchecked means hide every row — send a sentinel.
        url.searchParams.append('read', '__nomatch__');
      } else {
        readChecked.forEach((r) => url.searchParams.append('read', r));
      }
    }
  }

  const loadProspects = useCallback(async () => {
    const url = new URL('/api/prospects', window.location.origin);
    appendFilterParams(url);
    if (sort.key !== 'default') {
      url.searchParams.set('sort', sort.key);
      url.searchParams.set('dir', sort.dir);
    }
    const res = await fetch(url);
    const data = await res.json();
    setProspects(data.prospects || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, ratingChecked, stageChecked, readChecked, sort]);

  const loadTotal = useCallback(async () => {
    const res = await fetch('/api/prospects');
    const data = await res.json();
    setTotalCount((data.prospects || []).length);
  }, []);

  useEffect(() => {
    loadProspects();
  }, [loadProspects]);

  useEffect(() => {
    loadTotal();
  }, [loadTotal]);

  const hiddenCount =
    (allRatingOpts.length - ratingChecked.size) +
    (allStageOpts.length - stageChecked.size) +
    (READ_OPTIONS.length - readChecked.size);
  const hasActiveFilter = search.length > 0 || hiddenCount > 0;
  const showEmptyState = totalCount === 0 && !hasActiveFilter;

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
    setReadChecked(new Set(READ_OPTIONS));
  }
  function clearAllFilters() {
    setRatingChecked(new Set());
    setStageChecked(new Set());
    setReadChecked(new Set());
  }
  function toggleSort(key) {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return { key: 'default', dir: 'asc' };
    });
  }

  async function updateProspect(id, patch, { optimistic = true } = {}) {
    let prevSnapshot;
    if (optimistic) {
      setProspects((prev) => {
        prevSnapshot = prev;
        return prev.map((p) => (p.id === id ? { ...p, ...patch } : p));
      });
    }
    try {
      const res = await fetch(`/api/prospects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error('Save failed');
      const data = await res.json();
      setProspects((prev) => prev.map((p) => (p.id === id ? data.prospect : p)));
    } catch (e) {
      if (prevSnapshot) setProspects(prevSnapshot);
      alert('Save failed: ' + e.message);
    }
  }

  function toggleRead(p) {
    const next = p.is_read ? 0 : 1;
    updateProspect(p.id, { is_read: next });
  }

  async function handleStageChange(p, newStage) {
    const patch = { stage: newStage };
    if (AUTO_EMAIL_STAGES.has(newStage)) {
      patch.last_contact_date = todayIso();
      patch.emails_sent = (p.emails_sent || 0) + 1;
    }
    await updateProspect(p.id, patch);
  }

  async function addProspect(e) {
    e?.preventDefault?.();
    const { name, business_name, email, domain } = quickAdd;
    if (!name && !business_name && !email && !domain) return;
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        business_name,
        email,
        domain,
        rating: null,
        stage: 'New',
        is_read: 0,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setQuickAdd({ name: '', business_name: '', email: '', domain: '' });
      await Promise.all([loadProspects(), loadTotal()]);
      setHighlightId(data.prospect.id);
      setTimeout(() => setHighlightId(null), 1800);
    }
  }

  async function requestDelete(id) {
    if (pendingDelete === id) {
      setPendingDelete(null);
      const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProspects((prev) => prev.filter((p) => p.id !== id));
        setSelected((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        loadTotal();
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
    const ids = [...selected];
    await Promise.all(ids.map((id) => fetch(`/api/prospects/${id}`, { method: 'DELETE' })));
    setSelected(new Set());
    await Promise.all([loadProspects(), loadTotal()]);
  }

  async function bulkStage(newStage) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) => {
        const p = prospects.find((x) => x.id === id);
        const patch = { stage: newStage };
        if (AUTO_EMAIL_STAGES.has(newStage) && p) {
          patch.last_contact_date = todayIso();
          patch.emails_sent = (p.emails_sent || 0) + 1;
        }
        return fetch(`/api/prospects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
      })
    );
    await loadProspects();
  }

  async function bulkSetRead(value) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/prospects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: value ? 1 : 0 }),
        })
      )
    );
    await loadProspects();
  }

  async function bulkRating(newRating) {
    if (selected.size === 0) return;
    const ids = [...selected];
    await Promise.all(
      ids.map((id) =>
        fetch(`/api/prospects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating: newRating }),
        })
      )
    );
    await loadProspects();
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
      await Promise.all([loadProspects(), loadTotal()]);
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
    if (selected.size === prospects.length) setSelected(new Set());
    else setSelected(new Set(prospects.map((p) => p.id)));
  }

  return (
    <div className="min-h-screen px-6 py-10 sm:py-14 max-w-[1500px] mx-auto">
      <header className="mb-10 flex items-end justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-5xl sm:text-6xl leading-none tracking-tight text-charcoal">
            Bloomtrack
          </h1>
          <p className="mt-2 text-sm font-mono uppercase tracking-[0.18em] text-muted">
            Prospecting · since today
          </p>
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted">
          {totalCount} prospect{totalCount === 1 ? '' : 's'} on file
        </div>
      </header>

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
                readChecked={readChecked}
                toggleRating={(r) => toggleInSet(setRatingChecked, r)}
                toggleStage={(s) => toggleInSet(setStageChecked, s)}
                toggleRead={(r) => toggleInSet(setReadChecked, r)}
                onSelectAll={selectAllFilters}
                onClearAll={clearAllFilters}
                onDone={() => setFiltersOpen(false)}
              />
            )}
          </div>
        </div>

        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {hasActiveFilter
            ? `${prospects.length} / ${totalCount} shown`
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

      {showEmptyState ? (
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
                type="email"
                placeholder="Email"
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
                      checked={prospects.length > 0 && selected.size === prospects.length}
                      onChange={toggleSelectAll}
                    />
                    <ColResizer onMouseDown={(e) => startColResize(e, '__select')} />
                  </th>
                  {COLUMNS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`relative py-3 text-left font-mono text-[10px] uppercase tracking-[0.16em] text-muted hover:text-charcoal cursor-pointer select-none whitespace-nowrap overflow-hidden transition ${
                        c.key === 'is_read' ? 'px-1 text-center' : 'px-3'
                      }`}
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
                {prospects.length === 0 && (
                  <tr>
                    <td
                      colSpan={COLUMNS.length + 2}
                      className="px-4 py-14 text-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted"
                    >
                      No matches. Adjust filters or add a prospect.
                    </td>
                  </tr>
                )}
                {prospects.map((p) => {
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
                      className={`group border-b border-line/60 transition hover:bg-blush-soft/40 ${
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
                      <td className="px-1 py-1 align-top text-center w-8">
                        <button
                          onClick={() => toggleRead(p)}
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full transition ${
                            p.is_read
                              ? 'text-mauve-deep hover:bg-blush-soft'
                              : 'text-muted hover:text-charcoal hover:bg-blush-soft'
                          }`}
                          title={p.is_read ? 'Read — click to mark unread' : 'Unread — click to mark read'}
                        >
                          <Icon
                            name={p.is_read ? 'check-circle' : 'mail'}
                            className="w-4 h-4"
                          />
                        </button>
                      </td>
                      <EditableCell value={p.name} onSave={(v) => updateProspect(p.id, { name: v })} />
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
                      <DaysAgoCell value={p.last_contact_date} />
                      <EditableCell
                        value={p.last_contact_date}
                        type="date"
                        onSave={(v) => updateProspect(p.id, { last_contact_date: v || null })}
                      />
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
          <button
            onClick={() => bulkSetRead(1)}
            className="inline-flex items-center gap-1.5 text-paper/90 hover:text-paper border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            title="Mark selected as read"
          >
            <Icon name="check-circle" className="w-3.5 h-3.5" />
            Read
          </button>
          <button
            onClick={() => bulkSetRead(0)}
            className="inline-flex items-center gap-1.5 text-paper/90 hover:text-paper border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            title="Mark selected as unread"
          >
            <Icon name="mail" className="w-3.5 h-3.5" />
            Unread
          </button>
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

/* ----- Cell components ----- */

const FilterPanel = forwardRef(function FilterPanel(
  {
    ratings,
    stages,
    ratingChecked,
    stageChecked,
    readChecked,
    toggleRating,
    toggleStage,
    toggleRead,
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
                    <Icon name={rm.icon} className="w-3 h-3" />
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

      <FilterSection label="Read Status">
        <FilterRow
          checked={readChecked.has('unread')}
          onChange={() => toggleRead('unread')}
          label={
            <span className="flex items-center gap-2 text-sm text-charcoal">
              <span className="w-5 h-5 rounded-full bg-blush-soft text-muted flex items-center justify-center shrink-0">
                <Icon name="mail" className="w-3 h-3" />
              </span>
              Unread
            </span>
          }
        />
        <FilterRow
          checked={readChecked.has('read')}
          onChange={() => toggleRead('read')}
          label={
            <span className="flex items-center gap-2 text-sm text-charcoal">
              <span className="w-5 h-5 rounded-full bg-blush-soft text-mauve-deep flex items-center justify-center shrink-0">
                <Icon name="check-circle" className="w-3 h-3" />
              </span>
              Read
            </span>
          }
        />
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

function DaysAgoCell({ value }) {
  const n = daysBetween(value);
  if (n == null) {
    return (
      <td className="px-2 py-1 align-top text-center text-muted/60">—</td>
    );
  }
  const color = daysAgoColor(n);
  return (
    <td className="px-2 py-1 align-top text-center">
      <span style={{ color }} className="text-sm font-mono num-tabular font-semibold">
        {n}
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
        {m ? <Icon name={m.icon} className="w-3.5 h-3.5" /> : <span className="text-xs">—</span>}
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
                <Icon name={rm.icon} className="w-3.5 h-3.5" />
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
        placeholder="Paste Claude chat URL"
      />
    );
  }

  if (!value) {
    return (
      <span
        className="cell-display text-sm text-muted/60 cursor-pointer"
        onClick={() => setEditing(true)}
        title="Click to add Claude chat URL"
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
