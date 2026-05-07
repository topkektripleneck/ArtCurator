/**
 * ArtMap Data Browser
 * Handles tabular view, filtering, and sorting of art movement data.
 */

/** @typedef {import('./types.js').Movement} Movement */

const ERA_ORDER = [
  'Ancient & Classical',
  'Medieval',
  'Renaissance',
  'Baroque & Rococo',
  '19th Century',
  'Early Modern',
  'Post-War',
  'Contemporary',
  'Unclassified',
];

let _movements = [];
let _filtered  = [];
let _sortCol   = 'name';
let _sortDir   = 1;   // 1 = asc, -1 = desc
let _page      = 0;
const PAGE_SIZE = 40;

// ── Public API ────────────────────────────────────────────────────────────────

export function initBrowser(movements) {
  _movements = movements;
  _filtered  = [...movements];
  renderEraFilters();
  renderRegionFilter();
  bindControls();
  renderTable();
  updateCount();
}

// ── Filter state ──────────────────────────────────────────────────────────────

let activeEras    = new Set();
let activeRegions = new Set();
let searchQuery   = '';

function applyFilters() {
  _page = 0;
  _filtered = _movements.filter(m => {
    const matchEra    = activeEras.size === 0    || activeEras.has(m.era);
    const matchRegion = activeRegions.size === 0 || activeRegions.has(m.region || 'Unknown');
    const q = searchQuery.toLowerCase();
    const kf = Array.isArray(m.key_figures) ? m.key_figures.join(' ') : (m.key_figures || '');
    const matchSearch = !q
      || m.name.toLowerCase().includes(q)
      || (m.region || '').toLowerCase().includes(q)
      || kf.toLowerCase().includes(q)
      || m.summary.toLowerCase().includes(q);
    return matchEra && matchRegion && matchSearch;
  });
  sortFiltered();
  renderTable();
  updateCount();
}

function sortFiltered() {
  _filtered.sort((a, b) => {
    let av = a[_sortCol] ?? '';
    let bv = b[_sortCol] ?? '';
    if (_sortCol === 'start_year') {
      av = av || 9999;
      bv = bv || 9999;
      return (av - bv) * _sortDir;
    }
    return av.toString().localeCompare(bv.toString()) * _sortDir;
  });
}

// ── Render helpers ────────────────────────────────────────────────────────────

function renderEraFilters() {
  const container = document.getElementById('browser-era-filters');
  if (!container) return;

  const eraCounts = {};
  _movements.forEach(m => {
    eraCounts[m.era] = (eraCounts[m.era] || 0) + 1;
  });

  const eras = ERA_ORDER.filter(e => eraCounts[e]);
  container.innerHTML = eras.map(era => `
    <button class="browser-era-pill" data-era="${era}" title="${eraCounts[era]} movements">
      <span class="era-dot" style="background:${eraColor(era)}"></span>
      ${era}
      <span class="era-count">${eraCounts[era]}</span>
    </button>
  `).join('');

  container.querySelectorAll('.browser-era-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const era = btn.dataset.era;
      if (activeEras.has(era)) {
        activeEras.delete(era);
        btn.classList.remove('active');
      } else {
        activeEras.add(era);
        btn.classList.add('active');
      }
      applyFilters();
    });
  });
}

function renderRegionFilter() {
  const sel = document.getElementById('browser-region-select');
  if (!sel) return;

  const regions = [...new Set(
    _movements.map(m => m.region || '').filter(Boolean).sort()
  )];

  sel.innerHTML = '<option value="">All regions</option>' +
    regions.map(r => `<option value="${r}">${r}</option>`).join('');

  sel.addEventListener('change', () => {
    activeRegions = sel.value ? new Set([sel.value]) : new Set();
    applyFilters();
  });
}

function bindControls() {
  // Search
  const search = document.getElementById('browser-search');
  if (search) {
    search.addEventListener('input', e => {
      searchQuery = e.target.value;
      applyFilters();
    });
  }

  // Sort headers
  document.querySelectorAll('[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (_sortCol === col) {
        _sortDir *= -1;
      } else {
        _sortCol = col;
        _sortDir = 1;
      }
      document.querySelectorAll('[data-sort]').forEach(h => h.classList.remove('sort-asc','sort-desc'));
      th.classList.add(_sortDir === 1 ? 'sort-asc' : 'sort-desc');
      sortFiltered();
      renderTable();
    });
  });

  // Pagination
  document.getElementById('browser-prev')?.addEventListener('click', () => {
    if (_page > 0) { _page--; renderTable(); }
  });
  document.getElementById('browser-next')?.addEventListener('click', () => {
    if ((_page + 1) * PAGE_SIZE < _filtered.length) { _page++; renderTable(); }
  });

  // Clear filters
  document.getElementById('browser-clear')?.addEventListener('click', () => {
    activeEras    = new Set();
    activeRegions = new Set();
    searchQuery   = '';
    document.getElementById('browser-search').value = '';
    document.getElementById('browser-region-select').value = '';
    document.querySelectorAll('.browser-era-pill').forEach(b => b.classList.remove('active'));
    applyFilters();
  });
}

function renderTable() {
  const tbody = document.getElementById('browser-tbody');
  if (!tbody) return;

  const start = _page * PAGE_SIZE;
  const page  = _filtered.slice(start, start + PAGE_SIZE);

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="browser-empty">No movements match your filters.</td></tr>`;
    updatePager();
    return;
  }

  tbody.innerHTML = page.map(m => `
    <tr class="browser-row" data-id="${m.id}" tabindex="0">
      <td class="col-name">
        <span class="movement-name">${m.name}</span>
        ${m.wikidata_id ? `<a class="wiki-link" href="https://www.wikidata.org/wiki/${m.wikidata_id}" target="_blank" title="Wikidata">↗</a>` : ''}
      </td>
      <td class="col-era">
        <span class="era-badge" style="--era-color:${eraColor(m.era)}">${m.era}</span>
      </td>
      <td class="col-year">${m.start_year || '—'}</td>
      <td class="col-region">${m.region || '—'}</td>
      <td class="col-figures">${
        (Array.isArray(m.key_figures) ? m.key_figures : (m.key_figures || '').split(';').map(s => s.trim()).filter(s => s))
        .slice(0, 3).join(', ') || '—'
      }</td>
    </tr>
  `).join('');

  // Row click → expand essay
  tbody.querySelectorAll('.browser-row').forEach(row => {
    row.addEventListener('click', () => toggleEssay(row, page));
    row.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') toggleEssay(row, page);
    });
  });

  updatePager();
}

let _openId = null;

function toggleEssay(row, page) {
  const id = row.dataset.id;
  const movement = page.find(m => m.id === id);
  if (!movement) return;

  // Close if already open
  const existing = document.querySelector('.browser-essay-row');
  if (existing) existing.remove();
  if (_openId === id) { _openId = null; return; }

  _openId = id;
  const essayRow = document.createElement('tr');
  essayRow.className = 'browser-essay-row';
  essayRow.innerHTML = `
    <td colspan="5">
      <div class="browser-essay">
        <div class="essay-header">
          <div>
            <h3 class="essay-title">${movement.name}</h3>
            <div class="essay-meta">
              <span class="era-badge" style="--era-color:${eraColor(movement.era)}">${movement.era}</span>
              ${movement.region ? `<span class="essay-region">📍 ${movement.region}</span>` : ''}
              ${movement.start_year ? `<span class="essay-year">c. ${movement.start_year}</span>` : ''}
            </div>
          </div>
          <button class="essay-close" onclick="this.closest('.browser-essay-row').remove()">✕</button>
        </div>
        ${movement.key_figures?.length ? `
          <div class="essay-figures">
            <span class="essay-label">Key figures</span>
            ${movement.key_figures.map(f => `<span class="figure-tag">${f}</span>`).join('')}
          </div>
        ` : ''}
        <div class="essay-body">${movement.summary}</div>
        ${movement.snippet ? `
          <details class="essay-snippet">
            <summary>Wikipedia excerpt</summary>
            <p>${movement.snippet}</p>
          </details>
        ` : ''}
      </div>
    </td>
  `;
  row.after(essayRow);
  essayRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateCount() {
  const el = document.getElementById('browser-count');
  if (el) el.textContent = `${_filtered.length} of ${_movements.length} movements`;
}

function updatePager() {
  const total = Math.ceil(_filtered.length / PAGE_SIZE);
  const el = document.getElementById('browser-page-info');
  if (el) el.textContent = `Page ${_page + 1} of ${Math.max(1, total)}`;
  const prev = document.getElementById('browser-prev');
  const next = document.getElementById('browser-next');
  if (prev) prev.disabled = _page === 0;
  if (next) next.disabled = (_page + 1) * PAGE_SIZE >= _filtered.length;
}

function eraColor(era) {
  const colors = {
    'Ancient & Classical': '#8B6914',
    'Medieval':           '#6B4423',
    'Renaissance':        '#C4A35A',
    'Baroque & Rococo':   '#B8860B',
    '19th Century':       '#D4763A',
    'Early Modern':       '#CD5C5C',
    'Post-War':           '#6A8EAE',
    'Contemporary':       '#7B68AE',
    'Unclassified':       '#555566',
  };
  return colors[era] || '#555566';
}

/* ─────────────────────────────────────────────────────────────────────────────
   HTML TO ADD TO YOUR index.html
   Add this section wherever you want the browser to appear.
   The tab toggle logic is at the bottom — wire it into your existing nav.
─────────────────────────────────────────────────────────────────────────────

<section id="browser-view" style="display:none">
  <div class="browser-controls">
    <input id="browser-search" type="text" placeholder="Search movements, figures, regions…" autocomplete="off">
    <select id="browser-region-select"></select>
    <button id="browser-clear">Clear filters</button>
    <span id="browser-count" class="browser-count"></span>
  </div>

  <div id="browser-era-filters" class="browser-era-filters"></div>

  <div class="browser-table-wrap">
    <table class="browser-table">
      <thead>
        <tr>
          <th data-sort="name">Movement <span class="sort-icon"></span></th>
          <th data-sort="era">Era <span class="sort-icon"></span></th>
          <th data-sort="start_year">Year <span class="sort-icon"></span></th>
          <th data-sort="region">Region <span class="sort-icon"></span></th>
          <th>Key Figures</th>
        </tr>
      </thead>
      <tbody id="browser-tbody"></tbody>
    </table>
  </div>

  <div class="browser-pagination">
    <button id="browser-prev">← Prev</button>
    <span id="browser-page-info"></span>
    <button id="browser-next">Next →</button>
  </div>
</section>

CSS TO ADD TO style.css:
─────────────────────────────────────────────────────────────────────────────

#browser-view { padding: 1.5rem 2rem; }

.browser-controls {
  display: flex; align-items: center; gap: 0.75rem;
  margin-bottom: 1rem; flex-wrap: wrap;
}
#browser-search {
  flex: 1; min-width: 200px; padding: 0.5rem 0.75rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; color: var(--text); font-size: 0.875rem;
}
#browser-region-select {
  padding: 0.5rem 0.75rem; background: var(--surface);
  border: 1px solid var(--border); border-radius: 6px;
  color: var(--text); font-size: 0.875rem;
}
#browser-clear {
  padding: 0.5rem 1rem; background: transparent;
  border: 1px solid var(--border); border-radius: 6px;
  color: var(--text-muted); font-size: 0.8rem; cursor: pointer;
}
.browser-count { margin-left: auto; font-size: 0.8rem; color: var(--text-muted); }

.browser-era-filters {
  display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.25rem;
}
.browser-era-pill {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.3rem 0.75rem; border-radius: 20px;
  border: 1px solid var(--border); background: transparent;
  color: var(--text-muted); font-size: 0.78rem; cursor: pointer;
  transition: all 0.15s;
}
.browser-era-pill.active, .browser-era-pill:hover {
  background: var(--surface); color: var(--text); border-color: var(--border-hover);
}
.era-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.era-count { opacity: 0.5; font-size: 0.72rem; }

.browser-table-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }
.browser-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
.browser-table thead th {
  padding: 0.6rem 1rem; text-align: left; font-weight: 500;
  background: var(--surface); border-bottom: 1px solid var(--border);
  color: var(--text-muted); cursor: pointer; user-select: none; white-space: nowrap;
}
.browser-table thead th:hover { color: var(--text); }
.browser-table thead th.sort-asc .sort-icon::after { content: ' ↑'; }
.browser-table thead th.sort-desc .sort-icon::after { content: ' ↓'; }
.browser-row { border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.1s; }
.browser-row:hover { background: var(--surface); }
.browser-row td { padding: 0.6rem 1rem; vertical-align: middle; }
.movement-name { font-weight: 500; }
.wiki-link { margin-left: 0.4rem; opacity: 0.4; font-size: 0.75rem; text-decoration: none; }
.wiki-link:hover { opacity: 1; }

.era-badge {
  display: inline-block; padding: 0.15rem 0.6rem; border-radius: 12px;
  font-size: 0.72rem; font-weight: 500;
  background: color-mix(in srgb, var(--era-color) 15%, transparent);
  color: var(--era-color); border: 1px solid color-mix(in srgb, var(--era-color) 30%, transparent);
}

.browser-essay-row td { padding: 0; }
.browser-essay {
  padding: 1.25rem 1.5rem; background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.essay-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.75rem; }
.essay-title { font-size: 1.1rem; font-weight: 500; margin: 0 0 0.4rem; }
.essay-meta { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
.essay-region, .essay-year { font-size: 0.8rem; color: var(--text-muted); }
.essay-close { background: none; border: none; font-size: 1rem; color: var(--text-muted); cursor: pointer; padding: 0.25rem; }
.essay-figures { margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.essay-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.figure-tag {
  font-size: 0.78rem; padding: 0.15rem 0.6rem; border-radius: 4px;
  background: var(--bg); border: 1px solid var(--border);
}
.essay-body { font-size: 0.875rem; line-height: 1.7; color: var(--text); max-height: 300px; overflow-y: auto; }
.essay-snippet { margin-top: 0.75rem; font-size: 0.8rem; color: var(--text-muted); }
.essay-snippet summary { cursor: pointer; }

.browser-pagination {
  display: flex; align-items: center; justify-content: center;
  gap: 1rem; margin-top: 1rem; font-size: 0.875rem;
}
.browser-pagination button {
  padding: 0.4rem 0.9rem; border-radius: 6px;
  border: 1px solid var(--border); background: var(--surface);
  color: var(--text); cursor: pointer;
}
.browser-pagination button:disabled { opacity: 0.3; cursor: default; }
#browser-page-info { color: var(--text-muted); }
.browser-empty { padding: 2rem; text-align: center; color: var(--text-muted); }
.col-year { width: 80px; }
.col-region { width: 160px; }
.col-era { width: 180px; }
.col-figures { color: var(--text-muted); font-size: 0.8rem; }

WIRING INTO main.js:
─────────────────────────────────────────────────────────────────────────────
import { initBrowser } from './browser.js';

// After your data fetch:
const data = await d3.json('/movements.json');
initGraph(data);        // your existing graph init
initBrowser(data);      // browser gets same array

// Tab switcher (add to your nav toggle logic):
document.getElementById('tab-graph').addEventListener('click', () => {
  document.getElementById('graph-view').style.display = 'block';
  document.getElementById('browser-view').style.display = 'none';
});
document.getElementById('tab-browser').addEventListener('click', () => {
  document.getElementById('graph-view').style.display = 'none';
  document.getElementById('browser-view').style.display = 'block';
});
*/
