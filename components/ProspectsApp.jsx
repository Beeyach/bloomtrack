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

const STAGE_META = {
  New:        { emoji: '🆕', bg: 'transparent', border: '#D0CAD2' },
  'Email 1':  { emoji: '1️⃣', bg: '#F6F4F6', border: '#C5C0C8' },
  'Email 2':  { emoji: '2️⃣', bg: '#EEEAEE', border: '#B0AAB2' },
  'Email 3':  { emoji: '3️⃣', bg: '#E5E1E5', border: '#9C969E' },
  'Email 4':  { emoji: '4️⃣', bg: '#E5E1E5', border: '#9C969E' },
  'Email 5':  { emoji: '5️⃣', bg: '#E0DCE0', border: '#928C95' },
  'Email 6':  { emoji: '6️⃣', bg: '#DCD8DC', border: '#857F88' },
  'Email 7':  { emoji: '7️⃣', bg: '#D8D4D8', border: '#79737C' },
  Recycled:   { emoji: '🔁', bg: '#EEEAEE', border: '#8E8794' },
  Rekindled:  { emoji: '🔥', bg: '#FBE6CC', border: '#D9994A' },
  Replied:    { emoji: '💬', bg: '#E1F0E1', border: '#7FB07F' },
  Interested: { emoji: '💛', bg: '#CFE8C7', border: '#4F9E4F' },
  Potential:  { emoji: '🟠', bg: '#FDE3C7', border: '#D4894A' },
  Nudge:      { emoji: '👋', bg: '#FBF3CC', border: '#C8B85A' },
  Booked:     { emoji: '📅', bg: '#B5DEB5', border: '#2F8C2F' },
  Unread:     { emoji: '🩶', bg: '#E5E2E5', border: '#9C969E', faded: true },
  Lost:       { emoji: '✖️', bg: '#E8E4E8', border: '#B0AAB2', faded: true },
  Closed:     { emoji: '✅', bg: '#C9E5C9', border: '#3F8C3F' },
};

// Emoji rating → background tint for the cell + dropdown option.
const RATING_META = {
  '💚': { bg: '#CFE8C7', border: '#4F9E4F' },
  '💙': { bg: '#D5E1EE', border: '#5A85A6' },
  '🟠': { bg: '#FDE3C7', border: '#D4894A' },
  '⭐': { bg: '#FBF3CC', border: '#C8B85A' },
  '🔥': { bg: '#FBD8D2', border: '#C2543F' },
  '🟡': { bg: '#FBF3CC', border: '#C8B85A' },
  '✖️': { bg: '#E0DCE0', border: '#A8A0AC' },
};

function stageStyle(s) {
  return STAGE_META[s] || STAGE_META.New;
}
function stageLabel(s) {
  const m = STAGE_META[s];
  return m ? `${m.emoji} ${s}` : s;
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
          <svg className="ml-1 w-4 h-4 text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
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
          <div className="text-4xl mb-5">🌱</div>
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
                  // Stage tint stays untouched. Active highlight is a hot-pink
                  // border drawn via inset box-shadows on the td CSS rule —
                  // no background change, no layout shift.
                  const rowStyle = {
                    backgroundColor: c.bg === 'transparent' ? undefined : c.bg,
                    opacity: c.faded ? 0.6 : 1,
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
                          className="text-base leading-none hover:scale-110 transition-transform"
                          title={p.is_read ? 'Read — click to mark unread' : 'Unread — click to mark read'}
                        >
                          {p.is_read ? '✔️' : 'ℹ️'}
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
                        <select
                          className="status-select text-sm"
                          style={{
                            backgroundColor: c.bg === 'transparent' ? '#fff' : c.bg,
                            borderColor: c.border,
                            color: c.faded ? '#7C7480' : '#1E1E2A',
                          }}
                          value={stageKey}
                          onChange={(e) => handleStageChange(p, e.target.value)}
                        >
                          {stages.map((s) => {
                            const sc = stageStyle(s);
                            return (
                              <option
                                key={s}
                                value={s}
                                style={{
                                  backgroundColor: sc.bg === 'transparent' ? '#fff' : sc.bg,
                                  color: sc.faded ? '#7C7480' : '#1E1E2A',
                                }}
                              >
                                {stageLabel(s)}
                              </option>
                            );
                          })}
                        </select>
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
            className="text-paper/90 hover:text-paper border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            title="Mark selected as read"
          >
            ✔️ Read
          </button>
          <button
            onClick={() => bulkSetRead(0)}
            className="text-paper/90 hover:text-paper border border-paper/25 rounded-full px-3 py-1 text-xs hover:bg-paper/10 transition"
            title="Mark selected as unread"
          >
            ℹ️ Unread
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
        {ratings.map((r) => (
          <FilterRow
            key={r}
            checked={ratingChecked.has(r)}
            onChange={() => toggleRating(r)}
            label={<span className="text-base">{r}</span>}
          />
        ))}
        <FilterRow
          checked={ratingChecked.has(NO_RATING)}
          onChange={() => toggleRating(NO_RATING)}
          label={<span className="text-sm text-muted italic">(no rating)</span>}
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
                <span className={`text-sm ${m.faded ? 'text-muted' : 'text-charcoal'}`}>
                  <span className="mr-1.5">{m.emoji}</span>
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
          label={<span className="text-sm"><span className="mr-1.5">ℹ️</span>Unread</span>}
        />
        <FilterRow
          checked={readChecked.has('read')}
          onChange={() => toggleRead('read')}
          label={<span className="text-sm"><span className="mr-1.5">✔️</span>Read</span>}
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

  const m = value ? RATING_META[value] : null;
  const buttonStyle = m
    ? { backgroundColor: m.bg, borderColor: m.border }
    : { backgroundColor: 'transparent', borderColor: '#E4DAD0', borderStyle: 'dashed' };

  function pick(v) {
    setOpen(false);
    if ((value ?? null) !== (v ?? null)) onChange(v);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        style={buttonStyle}
        className="w-8 h-8 rounded-full border flex items-center justify-center text-base hover:brightness-95"
        title={value || 'Set rating'}
      >
        {value || <span className="text-muted/60 text-xs">—</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-surface border border-line rounded-xl shadow-card p-1.5 flex flex-col gap-1">
          <button
            onClick={() => pick(null)}
            className="w-8 h-8 rounded-full border border-dashed border-line text-xs text-muted hover:bg-blush-soft transition"
            title="Clear"
          >
            —
          </button>
          {options.map((r) => {
            const rm = RATING_META[r] || {};
            return (
              <button
                key={r}
                onClick={() => pick(r)}
                style={{ backgroundColor: rm.bg, borderColor: rm.border }}
                className="w-8 h-8 rounded border text-base hover:brightness-95 flex items-center justify-center"
                title={r}
              >
                {r}
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
        className="text-mauve hover:underline text-base"
        onClick={(e) => e.stopPropagation()}
        title={value}
      >
        🔗
      </a>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted/60 hover:text-mauve opacity-0 group-hover:opacity-100"
        title="Edit"
      >
        ✎
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
    <div className="flex items-center gap-1">
      <a
        href={normalizeDomainHref(value)}
        target="_blank"
        rel="noopener noreferrer"
        className="text-mauve hover:underline text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {value}
      </a>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-muted/60 hover:text-mauve"
        title="Edit"
      >
        ✎
      </button>
    </div>
  );
}
