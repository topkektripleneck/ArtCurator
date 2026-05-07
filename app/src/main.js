/**
 * ArtMap — Main Application
 * Dual-view: Node Graph visualization and Disco Elysium style essay detail.
 */

import './style.css';
import * as d3 from 'd3';
import { initBrowser } from './browser.js';

/** @typedef {import('./types.js').Movement} Movement */
/** @typedef {import('./types.js').EraGroup} EraGroup */
/** @typedef {import('./types.js').Relationship} Relationship */

// ── State ────────────────────────────────────────────────────
/** @type {Movement[]} */
let movements = [];
/** @type {Movement | null} */
let activeMovement = null;
let typewriterRAF = null;
let simulation = null;

// Graph references (populated by buildGraph, used by filters)
let graphSvg = null;
let graphZoom = null;
let graphNode = null;
let graphLink = null;
let graphG = null;
let graphWidth = 0;
let graphHeight = 0;
/** @type {string|null} */
let activeEraFilter = null;
let activeRegionFilter = '';
let activeArtists = new Set();
let edges = [];

const THEMES = ['dark', 'light', 'sepia'];
let currentThemeIdx = 0;

let keyboardFocusNode = null;
let isFocusMode = false;

const $ = (sel) => document.querySelector(sel);

// ── ERA CLASSIFICATION & COLOR ───────────────────────────────
const ERA_GROUPS = [
  { label: 'Ancient & Classical', range: [-5000, 500], color: '#8B6914' },
  { label: 'Medieval',           range: [500, 1400],   color: '#6B4423' },
  { label: 'Renaissance',        range: [1400, 1600],  color: '#C4A35A' },
  { label: 'Baroque & Rococo',   range: [1600, 1800],  color: '#B8860B' },
  { label: '19th Century',       range: [1800, 1900],  color: '#D4763A' },
  { label: 'Early Modern',       range: [1900, 1945],  color: '#CD5C5C' },
  { label: 'Post-War',           range: [1945, 1980],  color: '#6A8EAE' },
  { label: 'Contemporary',       range: [1980, 2030],  color: '#7B68AE' },
  { label: 'Unclassified',       range: null,          color: '#555566' },
];

function classifyEra(movement) {
  const eraStr = movement.era || '';
  const yearMatch = eraStr.match(/-?\d{3,4}/);
  if (yearMatch) {
    const year = parseInt(yearMatch[0]);
    for (const g of ERA_GROUPS) {
      if (g.range && year >= g.range[0] && year < g.range[1]) return g;
    }
  }
  // Fallback: try to infer from name
  const name = movement.name.toLowerCase();
  if (name.includes('ancient') || name.includes('celtic') || name.includes('byzantine')) return ERA_GROUPS[0];
  if (name.includes('medieval') || name.includes('gothic') || name.includes('romanesque')) return ERA_GROUPS[1];
  if (name.includes('renaissance') || name.includes('manneris')) return ERA_GROUPS[2];
  if (name.includes('baroque') || name.includes('rococo')) return ERA_GROUPS[3];
  if (name.includes('impressioni') || name.includes('realis')) return ERA_GROUPS[4];
  if (name.includes('cubis') || name.includes('dada') || name.includes('bauhaus') || name.includes('constructiv')) return ERA_GROUPS[5];
  if (name.includes('pop') || name.includes('minimal') || name.includes('abstract express')) return ERA_GROUPS[6];
  if (name.includes('digital') || name.includes('cyber') || name.includes('ai ') || name.includes('conceptual')) return ERA_GROUPS[7];
  return ERA_GROUPS[8]; // Unclassified
}

// ── Data Loading ─────────────────────────────────────────────
async function loadMovements() {
  const [mRes, eRes] = await Promise.all([
    fetch('/data/movements.json'),
    fetch('/data/edges.json')
  ]);

  if (!mRes.ok) throw new Error(`Fetch error: ${mRes.statusText}`);
  if (!eRes.ok) throw new Error(`Fetch error: ${eRes.statusText}`);

  /** @type {Movement[]} */
  const raw = await mRes.json();
  edges = await eRes.json();

  // Dataset is pre-cleaned by the pipeline; simple validation only
  movements = raw.filter(m => m.name && m.summary);
  movements.forEach(m => { m._era = classifyEra(m); });
  
  return movements;
}

// ── Graph View ───────────────────────────────────────────────

function buildGraph() {
  const svg = d3.select('#graph-svg');
  const container = document.getElementById('graph-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  graphSvg = svg;
  graphWidth = width;
  graphHeight = height;

  svg.attr('viewBox', [0, 0, width, height]);

  // Arrow marker for directed edges
  const defs = svg.append('defs');
  defs.append('marker')
    .attr('id', 'arrow-marker')
    .attr('viewBox', '0 -3 6 6')
    .attr('refX', 14).attr('refY', 0)
    .attr('markerWidth', 4).attr('markerHeight', 4)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-2L4,0L0,2')
    .attr('fill', '#888')
    .attr('opacity', 0.25);

  // Soft glow filter used by halos
  const glowFilter = defs.append('filter')
    .attr('id', 'bubble-glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%');
  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '4')
    .attr('result', 'blur');
  glowFilter.append('feMerge')
    .selectAll('feMergeNode')
    .data(['blur', 'SourceGraphic'])
    .join('feMergeNode')
    .attr('in', d => d);

  // Build nodes
  const nodes = movements.map((m, i) => ({
    id: m.id || m.slug,
    name: m.name,
    movement: m,
    era: m._era,
    radius: Math.max(4, Math.min(24, Math.sqrt(m.summary.length) * 0.45)), // Importance-based sizing
    x: width / 2 + (Math.random() - 0.5) * width * 0.7,
    y: height / 2 + (Math.random() - 0.5) * height * 0.7,
  }));

  const nodeMap = new Map(nodes.map(n => [n.name.toLowerCase(), n]));

  // Build edges from relationships and create adjacency map for highlights
  const links = [];
  /** @type {Map<string, Set<string>>} */
  const adjacency = new Map();

  // 1. Internal relationships
  movements.forEach(m => {
    if (!m.relationships) return;
    m.relationships.forEach(rel => {
      const targetNode = nodeMap.get(rel.target.toLowerCase());
      if (targetNode) {
        links.push({
          source: m.id || m.slug,
          target: targetNode.id,
          type: rel.type,
        });
        const mId = m.id || m.slug;
        if (!adjacency.has(mId)) adjacency.set(mId, new Set());
        if (!adjacency.has(targetNode.id)) adjacency.set(targetNode.id, new Set());
        adjacency.get(mId).add(targetNode.id);
        adjacency.get(targetNode.id).add(mId);
      }
    });
  });

  // 2. External edges from edges.json
  edges.forEach(e => {
    const sourceNode = nodeMap.get(e.source_name?.toLowerCase() || '');
    const targetNode = nodeMap.get(e.target_name?.toLowerCase() || '');
    
    if (sourceNode && targetNode) {
      const exists = links.some(l => l.source === sourceNode.id && l.target === targetNode.id);
      if (!exists) {
        links.push({
          source: sourceNode.id,
          target: targetNode.id,
          type: e.type,
        });
        if (!adjacency.has(sourceNode.id)) adjacency.set(sourceNode.id, new Set());
        if (!adjacency.has(targetNode.id)) adjacency.set(targetNode.id, new Set());
        adjacency.get(sourceNode.id).add(targetNode.id);
        adjacency.get(targetNode.id).add(sourceNode.id);
      }
    }
  });

  // Per-node radial gradient for the halo aura
  nodes.forEach(n => {
    const grad = defs.append('radialGradient')
      .attr('id', `halo-${n.id}`)
      .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
    grad.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', n.era.color)
      .attr('stop-opacity', 0.6);
    grad.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', n.era.color)
      .attr('stop-opacity', 0);
  });

  // D3 Force Simulation — Dual-focus layout (Classified vs Unclassified)
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(220).strength(0.7))
    .force('charge', d3.forceManyBody().strength(-550).distanceMax(1200))
    .force('collision', d3.forceCollide().radius(d => d.radius + 40))
    .force('x', d3.forceX(d => d.era.label === 'Unclassified' ? width * 0.9 : width * 0.45).strength(0.08))
    .force('y', d3.forceY(height * 0.5).strength(0.08))
    .alphaDecay(0.02)
    .velocityDecay(0.28);

  // Zoom
  const g = svg.append('g');
  graphG = g;

  // Cluster hulls layer (behind edges)
  const hullGroup = g.append('g').attr('class', 'hull-layer');

  // Background bubbles for the two diagrams
  const bubbleGroup = g.append('g').attr('class', 'diagram-bubbles');
  
  bubbleGroup.append('circle')
    .attr('cx', width * 0.45).attr('cy', height * 0.5)
    .attr('r', Math.min(width, height) * 0.6)
    .attr('class', 'diagram-bubble');

  bubbleGroup.append('circle')
    .attr('cx', width * 0.9).attr('cy', height * 0.5)
    .attr('r', Math.min(width, height) * 0.2)
    .attr('class', 'diagram-bubble');

  // Labels for the two main diagrams
  g.append('text')
    .attr('x', width * 0.45).attr('y', height * 0.5 - Math.min(width, height) * 0.6 - 20)
    .attr('class', 'diagram-title')
    .attr('text-anchor', 'middle')
    .text('Genealogical Map');

  g.append('text')
    .attr('x', width * 0.9).attr('y', height * 0.5 - Math.min(width, height) * 0.2 - 20)
    .attr('class', 'diagram-title')
    .attr('text-anchor', 'middle')
    .text('Unclassified Movements');

  const zoom = d3.zoom()
    .scaleExtent([0.2, 6])
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
      const k = event.transform.k;
      g.selectAll('.node-label').style('display', k > 0.6 ? 'block' : 'none');
      g.selectAll('.node-label.large').style('display', 'block');
    });

  svg.call(zoom);
  svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.85));
  graphZoom = zoom;

  // Render Edges
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', d => `edge-line ${d.type}`)
    .attr('marker-end', 'url(#arrow-marker)');

  // Edge flow dots (animated directional indicators — sparse)
  const flowDots = g.append('g')
    .selectAll('circle')
    .data(links.filter((_, i) => i % 5 === 0))
    .join('circle')
    .attr('class', 'edge-flow-dot')
    .attr('r', 1.2)
    .attr('fill', '#888')
    .attr('opacity', 0.3);

  // Render Nodes
  const node = g.append('g')
    .selectAll('g')
    .data(nodes)
    .join('g')
    .attr('class', 'node-group')
    .call(d3.drag()
      .on('start', dragStarted)
      .on('drag', dragged)
      .on('end', dragEnded));

  graphNode = node;
  graphLink = link;

  // Outer glow halo (breathing aura behind each node)
  node.append('circle')
    .attr('class', 'node-halo')
    .attr('r', d => d.radius * 2.5)
    .attr('fill', d => `url(#halo-${d.id})`)
    .attr('filter', 'url(#bubble-glow)');

  // Core bubble circle
  node.append('circle')
    .attr('class', 'node-circle')
    .attr('r', d => d.radius)
    .attr('fill', d => d.era.color)
    .attr('stroke', d => d3.color(d.era.color).brighter(0.8))
    .attr('stroke-width', 1.2)
    .attr('opacity', 0.6);

  // Labels (only for larger nodes)
  node.filter(d => d.radius >= 7)
    .append('text')
    .attr('class', d => `node-label ${d.radius >= 12 ? 'large' : ''}`)
    .attr('dy', d => d.radius + 14)
    .text(d => d.name.length > 22 ? d.name.slice(0, 20) + '…' : d.name);

  // Neighbor-highlight interaction (Obsidian brain-map style)
  node.on('mouseover', (event, d) => {
    const neighbors = adjacency.get(d.id) || new Set();

    // Dim all nodes & edges, then highlight self + neighbors
    node.classed('dimmed', n => n.id !== d.id && !neighbors.has(n.id));
    node.classed('highlighted', n => n.id !== d.id && neighbors.has(n.id));

    link
      .classed('edge-highlighted', l =>
        (l.source.id === d.id || l.target.id === d.id))
      .classed('edge-dimmed', l =>
        (l.source.id !== d.id && l.target.id !== d.id));

    // Tooltip
    const tooltipImg = $('#tooltip-img');
    if (d.movement.image) {
      tooltipImg.src = d.movement.image;
      tooltipImg.style.display = 'block';
    } else {
      tooltipImg.style.display = 'none';
    }

    tooltipName.textContent = d.name;
    tooltipArtist.textContent = d.movement.key_figures || d.movement.era || d.era.label;
    tooltipDesc.textContent = d.movement.wikipedia_snippet
      ? d.movement.wikipedia_snippet.slice(0, 150) + '…'
      : '';
    tooltip.classList.remove('hidden');
  })
  .on('mousemove', (event) => {
    tooltip.style.left = (event.clientX + 16) + 'px';
    tooltip.style.top = (event.clientY - 10) + 'px';
  })
  .on('mouseout', () => {
    // Reset all highlights
    node.classed('dimmed', false).classed('highlighted', false);
    link.classed('edge-highlighted', false).classed('edge-dimmed', false);
    tooltip.classList.add('hidden');
  });

  // Tooltip elements
  const tooltip = $('#node-tooltip');
  const tooltipName = $('#tooltip-name');
  const tooltipArtist = $('#tooltip-artist');
  const tooltipDesc = $('#tooltip-desc');

  // Click → Open Essay
  node.on('click', (event, d) => {
    event.stopPropagation();
    keyboardFocusNode = d;
    updateKeyboardFocus();
    openEssayView(d.movement, event);
  });

  // Double Click → Focus Mode
  node.on('dblclick', (event, d) => {
    event.stopPropagation();
    const neighbors = adjacency.get(d.id) || new Set();
    
    isFocusMode = true;
    svg.classed('graph-focus-mode', true);
    
    node.classed('in-focus', n => n.id === d.id || neighbors.has(n.id));
    link.classed('in-focus', l => l.source.id === d.id || l.target.id === d.id);
  });

  // Background Click → Exit Focus Mode
  svg.on('click', () => {
    if (isFocusMode) {
      isFocusMode = false;
      svg.classed('graph-focus-mode', false);
      node.classed('in-focus', false);
      link.classed('in-focus', false);
    }
  });

  // Tick
  let tickCount = 0;
  simulation.on('tick', () => {
    tickCount++;
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node.attr('transform', d => `translate(${d.x},${d.y})`);

    // Animate flow dots along edges
    const t = (tickCount % 80) / 80;
    flowDots.each(function(d) {
      const dot = d3.select(this);
      dot.attr('cx', d.source.x + (d.target.x - d.source.x) * t)
         .attr('cy', d.source.y + (d.target.y - d.source.y) * t);
    });

    // Update cluster hulls every 20 ticks
    if (tickCount % 20 === 0) updateHulls(hullGroup, nodes);
  });

  // Drag handlers
  function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) {
    d.fx = event.x; d.fy = event.y;
  }
  function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null; d.fy = null;
  }

  // Fuzzy Search
  $('#map-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase().trim();
    const matchFn = d => !q || fuzzyMatch(d.name.toLowerCase(), q);
    node.selectAll('.node-circle')
      .attr('opacity', d => matchFn(d) ? 0.88 : 0.08);
    node.selectAll('.node-halo')
      .style('opacity', d => !q ? null : (matchFn(d) ? 0.35 : 0.02));
    node.selectAll('.node-label')
      .style('opacity', d => matchFn(d) ? 1 : 0.05);
    link.attr('stroke-opacity', d => {
      if (!q) return undefined;
      return (fuzzyMatch(d.source.name.toLowerCase(), q) || fuzzyMatch(d.target.name.toLowerCase(), q)) ? 0.4 : 0.02;
    });
  });

}

// ── Sidebar System ───────────────────────────────────────────

function initSidebar() {
  const sidebar = $('#sidebar');
  const toggleBtn = $('#sidebar-toggle');
  const resetBtn = $('#filter-reset');
  const eraList = $('#sidebar-era-list');
  const movementInput = $('#map-search');
  const dropdown = $('#filter-dropdown');

  // Toggle Sidebar
  toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
  });

  // Build era list items
  ERA_GROUPS.forEach(group => {
    const count = movements.filter(m => m._era === group).length;
    if (count === 0) return;
    const item = document.createElement('div');
    item.className = 'era-item';
    item.dataset.eraLabel = group.label;
    item.innerHTML = `
      <div class="era-item-left">
        <span class="era-dot" style="background:${group.color}"></span>
        <span class="era-name">${group.label}</span>
      </div>
      <span class="era-count">${count}</span>
    `;
    item.addEventListener('click', () => onSidebarEraClick(item, group));
    eraList.appendChild(item);
  });

  // Movement search input
  movementInput.addEventListener('input', () => {
    const q = movementInput.value.toLowerCase().trim();
    if (q.length < 1) { dropdown.classList.add('hidden'); return; }

    const matches = movements
      .filter(m => m.name.toLowerCase().includes(q) || fuzzyMatch(m.name.toLowerCase(), q))
      .slice(0, 15);

    if (matches.length === 0) { dropdown.classList.add('hidden'); return; }

    dropdown.innerHTML = '';
    matches.forEach(m => {
      const item = document.createElement('div');
      item.className = 'filter-dropdown-item';
      item.innerHTML = `<span class="era-dot" style="background:${m._era.color}"></span>${m.name}`;
      item.addEventListener('click', () => {
        movementInput.value = m.name;
        dropdown.classList.add('hidden');
        zoomToMovement(m.id || m.slug);
        
        // Trigger fuzzy search visual update
        movementInput.dispatchEvent(new Event('input'));
      });
      dropdown.appendChild(item);
    });
    dropdown.classList.remove('hidden');
  });

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.filter-select-wrapper')) {
      dropdown.classList.add('hidden');
    }
  });

  // Reset button
  resetBtn.addEventListener('click', () => {
    resetFilters();
    movementInput.value = '';
    movementInput.dispatchEvent(new Event('input')); // trigger clear
    
    // Clear new filters
    activeRegionFilter = '';
    $('#sidebar-region-filter').value = '';
    activeArtists.clear();
    renderArtistChips();
    updateGlobalFilters();
  });

  // Region Filter
  const regionSelect = $('#sidebar-region-filter');
  const regions = [...new Set(movements.map(m => m.region).filter(r => r))].sort();
  regions.forEach(r => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    regionSelect.appendChild(opt);
  });
  regionSelect.addEventListener('change', (e) => {
    activeRegionFilter = e.target.value;
    updateGlobalFilters();
  });

  // Artist Filter (with chips)
  const artistInput = $('#sidebar-artist-search');
  const artistDropdown = $('#sidebar-artist-dropdown');
  const allArtists = [...new Set(movements.flatMap(m => (m.key_figures || '').split(';').map(s => s.trim()).filter(s => s)))].sort();

  artistInput.addEventListener('input', () => {
    const q = artistInput.value.toLowerCase().trim();
    if (q.length < 2) { artistDropdown.classList.add('hidden'); return; }

    const matches = allArtists.filter(a => a.toLowerCase().includes(q)).slice(0, 10);
    if (matches.length === 0) { artistDropdown.classList.add('hidden'); return; }

    artistDropdown.innerHTML = '';
    matches.forEach(a => {
      const item = document.createElement('div');
      item.className = 'filter-dropdown-item';
      item.textContent = a;
      item.addEventListener('click', () => {
        activeArtists.add(a);
        artistInput.value = '';
        artistDropdown.classList.add('hidden');
        renderArtistChips();
        updateGlobalFilters();
      });
      artistDropdown.appendChild(item);
    });
    artistDropdown.classList.remove('hidden');
  });

  function renderArtistChips() {
    const container = $('#active-subtags');
    container.innerHTML = '';
    activeArtists.forEach(a => {
      const chip = document.createElement('div');
      chip.className = 'subtag-chip';
      chip.innerHTML = `${a} <span class="subtag-remove" data-val="${a}">✕</span>`;
      chip.querySelector('.subtag-remove').addEventListener('click', () => {
        activeArtists.delete(a);
        renderArtistChips();
        updateGlobalFilters();
      });
      container.appendChild(chip);
    });
  }
}

function updateGlobalFilters() {
  const searchQuery = $('#map-search').value.toLowerCase().trim();
  
  const isMatch = (d) => {
    const eraMatch = !activeEraFilter || d.era.label === activeEraFilter;
    const regionMatch = !activeRegionFilter || d.movement.region === activeRegionFilter;
    const artistMatch = activeArtists.size === 0 || [...activeArtists].every(a => (d.movement.key_figures || '').includes(a));
    const searchMatch = !searchQuery || fuzzyMatch(d.name.toLowerCase(), searchQuery);
    return eraMatch && regionMatch && artistMatch && searchMatch;
  };

  graphNode.classed('dimmed', d => !isMatch(d));
  graphNode.classed('highlighted', d => isMatch(d) && (activeEraFilter || activeRegionFilter || activeArtists.size > 0 || searchQuery));

  graphLink.classed('edge-dimmed', l => !isMatch(l.source) || !isMatch(l.target));
  graphLink.classed('edge-highlighted', l => isMatch(l.source) && isMatch(l.target) && (activeEraFilter || activeRegionFilter || activeArtists.size > 0 || searchQuery));
}

function onSidebarEraClick(itemEl, group) {
  const wasActive = itemEl.classList.contains('active');

  // Deactivate all chips
  document.querySelectorAll('.era-item').forEach(c => c.classList.remove('active'));

  if (wasActive) {
    activeEraFilter = null;
  } else {
    itemEl.classList.add('active');
    activeEraFilter = group.label;
  }
  
  updateGlobalFilters();

  if (activeEraFilter) {
    // Zoom to the centroid of matching nodes
    const matching = [];
    graphNode.each(d => { if (d.era.label === activeEraFilter) matching.push(d); });
    if (matching.length > 0) {
      zoomToBoundingBox(matching);
    }
  }
}

function zoomToMovement(slug) {
  let targetNode = null;
  graphNode.each(d => { if (d.id === slug) targetNode = d; });
  if (!targetNode) return;

  // Clear era filter state
  activeEraFilter = null;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));

  // Highlight only this node and its neighbors
  graphNode.classed('dimmed', d => d.id !== slug);
  graphNode.classed('highlighted', false);
  // Un-dim self
  graphNode.filter(d => d.id === slug).classed('dimmed', false).classed('highlighted', true);

  graphLink.classed('edge-dimmed', true).classed('edge-highlighted', false);
  graphLink
    .filter(l => l.source.id === slug || l.target.id === slug)
    .classed('edge-dimmed', false)
    .classed('edge-highlighted', true);

  // Animated zoom to the node
  const scale = 3;
  const tx = graphWidth / 2 - targetNode.x * scale;
  const ty = graphHeight / 2 - targetNode.y * scale;
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

  graphSvg.transition()
    .duration(600)
    .ease(d3.easeCubicOut)
    .call(graphZoom.transform, transform);
}

function zoomToBoundingBox(nodes) {
  if (nodes.length === 0) return;

  const padding = 80;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  nodes.forEach(d => {
    if (d.x < x0) x0 = d.x;
    if (d.y < y0) y0 = d.y;
    if (d.x > x1) x1 = d.x;
    if (d.y > y1) y1 = d.y;
  });

  const bw = x1 - x0 + padding * 2;
  const bh = y1 - y0 + padding * 2;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  // Don't zoom out too far; keep nodes legible.
  const scale = Math.max(0.6, Math.min(graphWidth / bw, graphHeight / bh, 3));
  const tx = graphWidth / 2 - cx * scale;
  const ty = graphHeight / 2 - cy * scale;
  const transform = d3.zoomIdentity.translate(tx, ty).scale(scale);

  graphSvg.transition()
    .duration(500)
    .ease(d3.easeCubicOut)
    .call(graphZoom.transform, transform);
}

function resetFilters() {
  activeEraFilter = null;
  document.querySelectorAll('.era-item').forEach(c => c.classList.remove('active'));
  $('#filter-dropdown').classList.add('hidden');

  // Clear all highlight/dim classes
  graphNode.classed('dimmed', false).classed('highlighted', false);
  graphLink.classed('edge-dimmed', false).classed('edge-highlighted', false);

  // Clear focus mode
  isFocusMode = false;
  graphSvg.classed('graph-focus-mode', false);
  graphNode.classed('in-focus', false);
  graphLink.classed('in-focus', false);

  // Zoom back to overview
  graphSvg.transition()
    .duration(400)
    .ease(d3.easeCubicOut)
    .call(graphZoom.transform, d3.zoomIdentity.translate(0, 0).scale(0.85));
}

function updateKeyboardFocus() {
  if (!graphNode) return;
  graphNode.selectAll('.node-circle').classed('keyboard-focused', d => d === keyboardFocusNode);
}

// ── Essay View ───────────────────────────────────────────────

function openEssayView(movement, event) {
  activeMovement = movement;
  const mapView = $('#map-view');
  const essayView = $('#essay-view');

  // Set background gradient and transition origin
  const hue = hashHue(movement.name);
  const bgLayer = $('#bg-layer');
  
  if (event) {
    bgLayer.style.setProperty('--origin-x', `${event.clientX}px`);
    bgLayer.style.setProperty('--origin-y', `${event.clientY}px`);
  } else {
    bgLayer.style.setProperty('--origin-x', '50%');
    bgLayer.style.setProperty('--origin-y', '50%');
  }

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  let l1 = 18, l2 = 6;
  if (theme === 'light') {
    l1 = 88; l2 = 96;
  }

  bgLayer.style.background = `
    radial-gradient(ellipse at 40% 30%, hsl(${hue}, 30%, ${l1}%) 0%, hsl(${hue + 30}, 20%, ${l2}%) 100%)
  `;
  bgLayer.classList.add('active');

  // Fill header & Image
  const heroImg = $('#essay-hero-img');
  heroImg.classList.remove('loaded');
  if (movement.image) {
    heroImg.src = movement.image;
    heroImg.onload = () => heroImg.classList.add('loaded');
    heroImg.onerror = () => { heroImg.style.display = 'none'; };
    heroImg.style.display = 'block';
  } else {
    heroImg.style.display = 'none';
  }

  $('#essay-title').textContent = movement.name;
  const eraEl = $('#essay-era');
  eraEl.textContent = movement.era || '';
  eraEl.style.display = movement.era ? 'inline' : 'none';
  const regionEl = $('#essay-region');
  regionEl.textContent = movement.region || '';
  regionEl.style.display = movement.region ? 'inline' : 'none';
  const figuresEl = $('#essay-figures');
  figuresEl.textContent = movement.key_figures || '';
  figuresEl.style.display = movement.key_figures ? 'block' : 'none';

  // Hide relations
  $('#essay-relations').classList.add('hidden');
  $('#essay-relations').classList.remove('visible');

  // Switch views
  mapView.classList.remove('active');
  essayView.classList.add('active');

  // Scroll to top
  $('#essay-content').scrollTop = 0;

  // Start typewriter
  typewriterStart(movement.summary, $('#essay-body'));
  setHash(movement.id || movement.slug);
}

function closeEssayView() {
  typewriterStop();
  $('#essay-view').classList.remove('active');
  $('#map-view').classList.add('active');
  activeMovement = null;
}

// ── Background helpers ───────────────────────────────────────
function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h % 360);
}

// ── Typewriter Engine (smooth, character-by-character) ────────
function typewriterStart(text, container) {
  typewriterStop();
  container.innerHTML = '';
  $('#skip-btn').classList.add('visible');

  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  let pi = 0, ci = 0, pEl = null;
  const cursor = document.createElement('span');
  cursor.className = 'typewriter-cursor';
  let lastTime = 0;
  const charDelay = 18; // ms per character — slow and smooth

  function tick(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const elapsed = timestamp - lastTime;

    if (pi >= paragraphs.length) {
      typewriterStop();
      cursor.remove();
      showRelations();
      return;
    }

    if (ci === 0) {
      pEl = document.createElement('p');
      container.appendChild(pEl);
      pEl.appendChild(cursor);
    }

    const chars = paragraphs[pi];
    // Render multiple characters per frame if needed
    const charsToRender = Math.max(1, Math.floor(elapsed / charDelay));

    for (let i = 0; i < charsToRender && ci < chars.length; i++) {
      pEl.insertBefore(document.createTextNode(chars[ci]), cursor);
      ci++;
    }
    lastTime = timestamp;

    if (ci >= chars.length) {
      pi++; ci = 0; lastTime = timestamp + 400; // paragraph pause
    }

    $('#essay-content').scrollTop = $('#essay-content').scrollHeight;
    typewriterRAF = requestAnimationFrame(tick);
  }

  typewriterRAF = requestAnimationFrame(tick);
}

function typewriterStop() {
  if (typewriterRAF) { cancelAnimationFrame(typewriterRAF); typewriterRAF = null; }
  $('#skip-btn').classList.remove('visible');
}

function typewriterSkip() {
  if (!activeMovement) return;
  typewriterStop();
  const paras = activeMovement.summary.split(/\n\n+/).filter(p => p.trim());
  $('#essay-body').innerHTML = paras.map(p => `<p>${p}</p>`).join('');
  showRelations();
}

function showRelations() {
  const rels = activeMovement?.relationships;
  if (!rels || rels.length === 0) { $('#essay-relations').classList.add('hidden'); return; }
  const list = $('#relations-list');
  list.innerHTML = '';
  rels.forEach(r => {
    const chip = document.createElement('span');
    const target = movements.find(m => m.name.toLowerCase() === r.target.toLowerCase());
    
    chip.className = `relation-chip ${r.type}`;
    if (target) {
      chip.style.color = target._era?.color || 'inherit';
    }
    
    chip.textContent = `${r.type === 'child_of' ? '← ' : '◈ '}${r.target}`;
    chip.addEventListener('click', () => {
      if (target) openEssayView(target);
    });
    list.appendChild(chip);
  });
  $('#essay-relations').classList.remove('hidden');
  $('#essay-relations').classList.add('visible');
}

// ── Fuzzy Search ─────────────────────────────────────────────
function fuzzyMatch(str, query) {
  if (str.includes(query)) return true;
  let qi = 0;
  for (let i = 0; i < str.length && qi < query.length; i++) {
    if (str[i] === query[qi]) qi++;
  }
  return qi === query.length;
}

// ── Cluster Hulls ────────────────────────────────────────────
function updateHulls(hullGroup, nodes) {
  const grouped = new Map();
  nodes.forEach(n => {
    if (!n.era || n.era.label === 'Unclassified') return;
    if (!grouped.has(n.era.label)) grouped.set(n.era.label, { color: n.era.color, pts: [] });
    grouped.get(n.era.label).pts.push([n.x, n.y]);
  });

  const hullData = [];
  grouped.forEach((val, label) => {
    if (val.pts.length < 3) return;
    const hull = d3.polygonHull(val.pts);
    if (hull) hullData.push({ label, color: val.color, hull });
  });

  const hulls = hullGroup.selectAll('.era-hull').data(hullData, d => d.label);
  hulls.enter().append('path')
    .attr('class', 'era-hull')
    .merge(hulls)
    .attr('d', d => `M${d.hull.join('L')}Z`)
    .attr('fill', d => d.color)
    .attr('stroke', d => d.color);
  hulls.exit().remove();
}

// ── Timeline Slider ──────────────────────────────────────────
function initTimeline() {
  const minSlider = $('#timeline-min');
  const maxSlider = $('#timeline-max');
  const labelMin = $('#timeline-label-min');
  const labelMax = $('#timeline-label-max');
  const fill = $('#timeline-fill');

  function formatYear(y) {
    return y < 0 ? `${Math.abs(y)} BC` : `${y}`;
  }

  function updateTimeline() {
    let lo = parseInt(minSlider.value);
    let hi = parseInt(maxSlider.value);
    if (lo > hi) { [lo, hi] = [hi, lo]; }

    labelMin.textContent = formatYear(lo);
    labelMax.textContent = formatYear(hi);

    // Update fill bar position
    const range = 2530; // -500 to 2030
    const left = ((lo + 500) / range) * 100;
    const right = ((hi + 500) / range) * 100;
    fill.style.left = left + '%';
    fill.style.width = (right - left) + '%';

    // Filter nodes by year range
    if (!graphNode) return;
    graphNode.classed('dimmed', d => {
      const eraStr = d.movement.era || '';
      const yearMatch = eraStr.match(/-?\d{3,4}/);
      if (!yearMatch) return false;
      const year = parseInt(yearMatch[0]);
      return year < lo || year > hi;
    });
  }

  minSlider.addEventListener('input', updateTimeline);
  maxSlider.addEventListener('input', updateTimeline);
}

// ── Theme System ─────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('artmap-theme');
  if (saved && THEMES.includes(saved)) {
    currentThemeIdx = THEMES.indexOf(saved);
    document.documentElement.setAttribute('data-theme', saved);
  }

  $('#theme-toggle').addEventListener('click', () => {
    currentThemeIdx = (currentThemeIdx + 1) % THEMES.length;
    const theme = THEMES[currentThemeIdx];
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('artmap-theme', theme);
  });
}

// ── URL Hash Routing ─────────────────────────────────────────
function initHashRouting() {
  function handleHash() {
    const hash = location.hash.replace('#', '');
    if (hash.startsWith('essay/')) {
      const slug = hash.replace('essay/', '');
      const m = movements.find(mv => (mv.id || mv.slug) === slug);
      if (m) openEssayView(m);
    }
  }

  window.addEventListener('hashchange', handleHash);
  if (location.hash) handleHash();
}

function setHash(slug) {
  history.pushState(null, '', `#essay/${slug}`);
}

function clearHash() {
  history.pushState(null, '', location.pathname);
}

// ── Particles (theme-aware) ──────────────────────────────────
function initParticles() {
  const c = $('#particles'), ctx = c.getContext('2d');
  const resize = () => { c.width = innerWidth; c.height = innerHeight; };
  resize(); window.addEventListener('resize', resize);

  const pts = Array.from({ length: 35 }, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    vx: (Math.random() - 0.5) * 0.25,
    vy: (Math.random() - 0.5) * 0.12 - 0.08,
    r: Math.random() * 1.8 + 0.5,
    a: Math.random() * 0.35 + 0.1,
  }));

  (function loop() {
    ctx.clearRect(0, 0, c.width, c.height);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--particle-color').trim() || '226,185,90';
    pts.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = c.width;
      if (p.x > c.width) p.x = 0;
      if (p.y < 0) p.y = c.height;
      if (p.y > c.height) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color},${p.a})`;
      ctx.fill();
    });
    requestAnimationFrame(loop);
  })();
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  await loadMovements();
  buildGraph();
  initSidebar();
  initTimeline();
  initTheme();
  initParticles();
  initHashRouting();
  initBrowser(movements);

  // Tab switching logic
  const tabGraph = $('#tab-graph');
  const tabBrowser = $('#tab-browser');
  const viewGraph = $('#graph-view');
  const viewBrowser = $('#browser-view');
  const sidebar = $('#sidebar');

  tabGraph.addEventListener('click', () => {
    tabGraph.classList.add('active');
    tabBrowser.classList.remove('active');
    viewGraph.classList.add('active');
    viewGraph.classList.remove('hidden');
    viewBrowser.classList.add('hidden');
    viewBrowser.classList.remove('active');
    sidebar.style.display = 'block';
  });

  tabBrowser.addEventListener('click', () => {
    tabBrowser.classList.add('active');
    tabGraph.classList.remove('active');
    viewBrowser.classList.add('active');
    viewBrowser.classList.remove('hidden');
    viewGraph.classList.add('hidden');
    viewGraph.classList.remove('active');
    sidebar.style.display = 'none'; // Hide sidebar in list view as it has its own controls
  });

  // Welcome screen
  $('#welcome-enter').addEventListener('click', () => {
    $('#welcome-overlay').classList.add('hidden');
  });

  // Back button
  $('#back-to-map').addEventListener('click', () => {
    closeEssayView();
    clearHash();
  });

  // Skip button
  $('#skip-btn').addEventListener('click', typewriterSkip);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (activeMovement) { closeEssayView(); clearHash(); }
      else if (isFocusMode) {
        isFocusMode = false;
        graphSvg.classed('graph-focus-mode', false);
        graphNode.classed('in-focus', false);
        graphLink.classed('in-focus', false);
      }
    }
    if ((e.key === ' ' || e.key === 'Enter') && typewriterRAF) {
      e.preventDefault();
      typewriterSkip();
    }
    
    // Graph Keyboard Navigation
    if (!activeMovement && !$('#map-search').matches(':focus')) {
      if (e.key === 'Enter' && keyboardFocusNode) {
        openEssayView(keyboardFocusNode.movement);
        return;
      }
      
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        if (!keyboardFocusNode) {
          // Select center-most node
          let closest = null, minD = Infinity;
          graphNode.each(d => {
            const dist = Math.hypot(d.x - graphWidth/2, d.y - graphHeight/2);
            if (dist < minD) { minD = dist; closest = d; }
          });
          if (closest) {
            keyboardFocusNode = closest;
            updateKeyboardFocus();
          }
          return;
        }

        // Find connected neighbors
        const neighbors = [];
        graphLink.each(l => {
          if (l.source.id === keyboardFocusNode.id) neighbors.push(l.target);
          else if (l.target.id === keyboardFocusNode.id) neighbors.push(l.source);
        });

        if (neighbors.length > 0) {
          // Determine intended direction angle
          const dirAngles = {
            'ArrowUp': -Math.PI / 2,
            'ArrowDown': Math.PI / 2,
            'ArrowLeft': Math.PI,
            'ArrowRight': 0
          };
          const targetAngle = dirAngles[e.key];

          let bestNeighbor = null;
          let minScore = Infinity; // Lower score is better

          neighbors.forEach(n => {
            const dx = n.x - keyboardFocusNode.x;
            const dy = n.y - keyboardFocusNode.y;
            const angle = Math.atan2(dy, dx);
            
            // Angular difference (0 to PI)
            let diff = Math.abs(angle - targetAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            
            const distance = Math.hypot(dx, dy);
            
            // Score based primarily on angle alignment, then distance
            const score = diff * 1000 + distance;
            
            // Only consider if reasonably in that general direction (< 90 deg)
            if (diff < Math.PI / 2 && score < minScore) {
              minScore = score;
              bestNeighbor = n;
            }
          });

          if (bestNeighbor) {
            keyboardFocusNode = bestNeighbor;
            updateKeyboardFocus();
            
            // Auto pan if neighbor is off-screen
            zoomToMovement(keyboardFocusNode.id);
          }
        }
      }
    }
  });
}

init().catch(err => {
  console.error('ArtMap init failed:', err);
  const btn = document.getElementById('welcome-enter');
  if (btn) {
    btn.textContent = 'Error loading data — check console';
    btn.style.background = '#800';
  }
});
