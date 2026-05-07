# ArtMap Development Roadmap & Status

This document tracks the technical evolution, current status, and future vision of the ArtMap project.

## 🎯 Primary Goal
The objective of this project is to transform a standard art history database into a **high-fidelity, scholarly visual atlas**. The focus is on combining the macro-scale structural visibility of a force-directed graph with the micro-scale narrative depth of an immersive essay reader.

## ✅ Completed Milestones

### Scholarly UI/UX Overhaul
- **Importance-Based Node Sizing:** Refactored node radii to scale with `Math.sqrt(summary.length)`, ensuring historically dense movements naturally anchor the map.
- **Shared-Element Transitions:** Implemented a radial `clip-path` "bloom" transition that makes essays appear to expand directly from the clicked node's screen coordinates.
- **Unified Explore Sidebar:** Consolidated all navigation, filtering, and search into a single collapsible panel to maximize graph viewport space.

### Interaction & Navigation
- **Keyboard Graph Navigation:** Users can "walk" the history of art using arrow keys, with the camera automatically tracking the focused node.
- **Focus Mode:** Implemented a double-click neighborhood isolation mode that dims the entire graph except for the selected node and its direct genealogical connections.
- **Dual-Diagram Organization:** Separated unclassified nodes into a distinct visual cluster with soft "bubble" containers and dedicated headers to maintain map cleanliness.

### Technical Hardening
- **Theme-Aware Rendering:** Implemented a dynamic system for background gradients and overlays that adapt to Dark, Light, and Sepia themes, ensuring perfect text legibility (100% Contrast).
- **Asynchronous Data Pipeline:** Built a robust Python scraper with rate-limiting and check-pointing to handle massive data harvests from Wikipedia and Wikidata.

## ⚠️ Current Challenges & Problems
- **Simulation Performance:** As the node count exceeds 600, the D3 force simulation's `tick` calculations can become CPU-heavy. Future refactoring should move the simulation to a **Web Worker**.
- **Label Density:** In highly connected eras (e.g., Early Modern), node labels can sometimes overlap. A more advanced collision detection for SVG labels is needed.
- **Classification Coverage:** Approximately 160 nodes are currently "Unclassified" due to missing birth/start years in the raw data. Improving the scraping heuristics for these specific cases is a priority.

## 🚀 Upcoming Features
- **Deep-Linking Support:** Expand the hash-routing system to allow users to share URLs that open the map in specific Focus Modes or filtered states.
- **Interactive Time-Scrubbing:** Upgrade the timeline slider to a full-featured "Time Machine" that visually hides/reveals movements and connections as you scrub through history.
- **Global Text Search:** Implement a search feature that parses the full content of all 600+ essays, not just movement titles.
- **Export Capabilities:** Add the ability to export the current graph view as a high-resolution SVG or PDF for scholarly use.
