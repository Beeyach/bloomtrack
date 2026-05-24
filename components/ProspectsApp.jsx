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
    <div className="min-h-screen px-6 py-6 max-w-[1500px] mx-auto">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-charcoal">Bloomtrack</h1>
        <p className="text-sm text-muted">Prospecting tracker</p>
      </header>

      <div className="mb-4 flex items-center gap-2 flex-wrap relative">
        <input
          type="text"
          placeholder="Search name, business, email, domain..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm bg-white border border-blush/60 rounded-md w-80 focus:outline-none focus:border-mauve"
        />

        <div className="relative">
          <button
            ref={filtersBtnRef}
            onClick={() => setFiltersOpen((v) => !v)}
            className={`px-3 py-2 text-sm bg-white border rounded-md hover:bg-blush/30 flex items-center gap-1.5 ${
              hiddenCount > 0 ? 'border-mauve text-charcoal' : 'border-blush'
            }`}
          >
            <span>Filters</span>
            {hiddenCount > 0 && (
              <span className="text-xs text-muted">({hiddenCount} hidden)</span>
            )}
            <span className="text-xs text-muted">▾</span>
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

        <div className="text-xs text-muted">
          {hasActiveFilter
            ? `showing ${prospects.length} of ${totalCount}`
            : `${totalCount} prospect${totalCount === 1 ? '' : 's'}`}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 text-sm bg-white border border-blush rounded-md hover:bg-blush/30"
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
            className="px-3 py-1.5 text-sm bg-white border border-blush rounded-md hover:bg-blush/30"
          >
            Export CSV
          </button>
        </div>
      </div>

      {showEmptyState ? (
        <section className="bg-white border border-blush/60 rounded-md p-10 text-center shadow-sm">
          <div className="text-3xl mb-3">🌱</div>
          <h2 className="text-lg font-semibold text-charcoal mb-1">No data yet.</h2>
          <p className="text-sm text-muted mb-5">
            Import your CSV to get started.
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm bg-mauve text-white rounded-md hover:opacity-90"
          >
            Import CSV
          </button>
        </section>
      ) : (
        <>
          <form
            onSubmit={addProspect}
            className="mb-0 flex flex-wrap gap-2 rounded-t-md p-3 border border-b-2 border-blush/60 border-b-mauve/50"
            style={{ backgroundColor: '#F0ECF0' }}
          >
            <input
              type="text"
              placeholder="Name"
              value={quickAdd.name}
              onChange={(e) => setQuickAdd({ ...quickAdd, name: e.target.value })}
              className="px-3 py-1.5 text-sm bg-white border border-blush/60 rounded-md focus:outline-none focus:border-mauve flex-1 min-w-[140px]"
            />
            <input
              type="text"
              placeholder="Business"
              value={quickAdd.business_name}
              onChange={(e) => setQuickAdd({ ...quickAdd, business_name: e.target.value })}
              className="px-3 py-1.5 text-sm bg-white border border-blush/60 rounded-md focus:outline-none focus:border-mauve flex-1 min-w-[160px]"
            />
            <input
              type="email"
              placeholder="Email"
              value={quickAdd.email}
              onChange={(e) => setQuickAdd({ ...quickAdd, email: e.target.value })}
              className="px-3 py-1.5 text-sm bg-white border border-blush/60 rounded-md focus:outline-none focus:border-mauve flex-1 min-w-[200px]"
            />
            <input
              type="text"
              placeholder="Domain"
              value={quickAdd.domain}
              onChange={(e) => setQuickAdd({ ...quickAdd, domain: e.target.value })}
              className="px-3 py-1.5 text-sm bg-white border border-blush/60 rounded-md focus:outline-none focus:border-mauve flex-1 min-w-[160px]"
            />
            <button
              type="submit"
              className="px-4 py-1.5 text-sm bg-mauve text-white rounded-md hover:opacity-90"
            >
              Add
            </button>
          </form>

          <div
            className="bg-white border border-t-0 border-blush/60 rounded-b-md overflow-x-auto"
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
              <thead className="bg-blush/30 text-charcoal">
                <tr>
                  <th className="relative px-2 py-2 text-left">
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
                      className={`relative py-2 text-left font-semibold cursor-pointer select-none whitespace-nowrap overflow-hidden ${
                        c.key === 'is_read' ? 'px-1 text-center' : 'px-3'
                      }`}
                    >
                      {c.label}
                      {sort.key === c.key && (
                        <span className="ml-1 text-muted">{sort.dir === 'asc' ? '▲' : '▼'}</span>
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
                    <td colSpan={COLUMNS.length + 2} className="px-4 py-8 text-center text-muted">
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
                      className={`group border-b border-blush/30 transition ${
                        highlighted ? 'ring-2 ring-mauve' : ''
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-charcoal text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-3 text-sm">
          <span>{selected.size} selected</span>
          <select
            onChange={(e) => {
              if (e.target.value) {
                bulkRating(e.target.value === '__clear' ? null : e.target.value);
                e.target.value = '';
              }
            }}
            className="bg-charcoal border border-white/30 rounded px-2 py-0.5 text-sm"
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
            className="bg-charcoal border border-white/30 rounded px-2 py-0.5 text-sm"
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
            className="text-white/90 hover:text-white border border-white/30 rounded px-2 py-0.5"
            title="Mark selected as read"
          >
            ✔️ Mark Read
          </button>
          <button
            onClick={() => bulkSetRead(0)}
            className="text-white/90 hover:text-white border border-white/30 rounded px-2 py-0.5"
            title="Mark selected as unread"
          >
            ℹ️ Mark Unread
          </button>
          <button onClick={bulkDelete} className="text-red-300 hover:text-red-200">
            Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="text-muted hover:text-white">
            Clear
          </button>
        </div>
      )}

      {importPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-md p-5 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Import preview</h3>
            <p className="text-sm text-charcoal mb-1">
              Found <strong>{importPreview.total}</strong> rows in CSV.
            </p>
            <p className="text-sm text-charcoal mb-1">
              Will insert <strong>{importPreview.toInsert}</strong> new prospects.
            </p>
            <p className="text-sm text-muted mb-4">
              Skipping <strong>{importPreview.skipped}</strong> duplicate emails.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setImportPreview(null);
                  setImportCsvText('');
                }}
                className="px-3 py-1.5 text-sm bg-white border border-blush rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={confirmImport}
                className="px-3 py-1.5 text-sm bg-mauve text-white rounded-md"
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
      className="absolute z-30 mt-2 left-0 w-72 max-h-[70vh] overflow-y-auto bg-white border border-blush/60 rounded-md shadow-xl p-3"
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

      <div className="mt-3 pt-3 border-t border-blush/40 flex items-center justify-between text-xs">
        <div className="flex gap-3">
          <button onClick={onSelectAll} className="text-mauve hover:underline">
            Select All
          </button>
          <button onClick={onClearAll} className="text-muted hover:text-charcoal hover:underline">
            Clear All
          </button>
        </div>
        <button
          onClick={onDone}
          className="px-3 py-1 bg-mauve text-white rounded-md text-xs hover:opacity-90"
        >
          Done
        </button>
      </div>
    </div>
  );
});

function FilterSection({ label, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function FilterRow({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-blush/20 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="accent-mauve"
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
        <span className={`cell-display text-sm inline-block w-10 text-center ${displayClass}`}>
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
      <span style={{ color }} className="text-sm font-semibold">
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
    : { backgroundColor: 'transparent', borderColor: '#D0CAD2', borderStyle: 'dashed' };

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
        <div className="absolute z-20 mt-1 left-0 bg-white border border-blush/60 rounded-md shadow-lg p-1 flex flex-col gap-1">
          <button
            onClick={() => pick(null)}
            className="w-8 h-8 rounded border border-dashed border-blush/60 text-xs text-muted hover:bg-blush/10"
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
