# ArtMap: The Anatomy of a Scholarly Atlas

This document details the architectural philosophy, technical implementation, and design rationale behind the ArtMap project. It serves as a comprehensive guide to **how** and **why** this system was built.

---

## 🏛️ Architectural Philosophy: The "Scholarly Visual Atlas"

The core vision of ArtMap is to bridge the gap between **Macro-Scale Structural Visibility** and **Micro-Scale Narrative Depth**. 

Traditional art history resources usually fail in one of two ways:
1. **The Encyclopedia Trap**: Massive amounts of text (Wikipedia) but no sense of how movements relate spatially or chronologically.
2. **The Timeline Trap**: A linear list of dates that fails to capture the "web of influence" and simultaneous regional evolutions.

**ArtMap's solution** is a dual-view engine:
- **The Graph**: A D3-powered force-directed network that visualizes influence as physical tension.
- **The Reader**: A "Disco Elysium" inspired immersive essay viewer that treats art history as a living narrative.

---

## 🛠️ How It Was Made: The Technical Stack

### 1. The High-Speed Data Pipeline (`scraper/`)
Building a dataset of 600+ movements with consistent scholarly quality is impossible to do manually. We built an automated pipeline using:
- **Wikipedia API**: Fetches the raw "seed" text for each movement.
- **Multi-LLM Synthesis**: We use **Gemini 2.0 Flash** and **Groq (Llama 3.3 70B)** to process the raw text.
    - **Task**: Synthesize a 300–500 word scholarly essay.
    - **Task**: Extract "Edges" (relationships) against a controlled registry of 600+ valid movement names.
- **Robustness**: The pipeline includes **checkpointing** (resuming from where it left off) and **rate-limit handling** to ensure data integrity during long-running harvests.

### 2. The Wikipedia Asset Pipeline (`scraper/asset_pipeline.py`)
To enhance the visual experience, we built a standalone "asset harvester":
- **Image Extraction**: Uses Wikipedia's `pageimages` API to fetch representative high-resolution thumbnails for every movement.
- **Micro-Descriptions**: Pulls the introductory paragraph from Wikipedia, automatically clipped to ~100 words for consistent "quick-look" reading in the UI.
- **Data Sync**: Automatically syncs with the frontend's `movements.json` to ensure 100% asset coverage for all visible nodes.

### 3. The Visualization Engine (`app/src/main.js`)
The frontend is built for performance and aesthetic impact:
- **D3.js Force Simulation**:
    - **Era Grouping**: Custom gravity forces (`forceX`, `forceY`) pull movements into clusters based on their historical era.
    - **Dual-Diagram Layout**: A unique logic separates "Classified" movements (part of the main genealogical line) from "Unclassified" ones, preventing outliers from cluttering the primary visualization.
    - **Importance-Based Sizing**: Node radii are calculated based on the square root of their summary length, ensuring major movements (e.g., Renaissance, Impressionism) naturally anchor the map.
- **Vanilla JS + Vite**: We chose a "zero-framework" approach (Vanilla JS) to minimize overhead and maximize the speed of D3's DOM manipulations.

### 3. The Design System (`app/src/style.css`)
We prioritized **Rich Aesthetics** over generic UI:
- **Transitions**: We use shared-element "blooms" (radial clip-paths) to transition from the map to the reader, making the essay feel like it's emerging from the node itself.
- **Themes**: A native CSS variable system supports **Dark**, **Light**, and **Sepia** modes with 100% contrast ratios for scholarly reading.
- **Micro-Animations**: Animated "flow dots" travel along the edges of the graph to indicate the direction of influence (from parent to child).

---

## 🧠 Why It Was Made: Design Decisions

### Why the "Disco Elysium" Style Reader?
Standard web text is boring. By implementing a **Typewriter Engine** and **High-Contrast Typography**, we slow the user down, encouraging "deep reading" rather than scanning. The goal is to make art history feel as epic as a narrative RPG.

### Why Force-Directed Graphs?
Art history is not a hierarchy; it’s a mesh. A movement might be influenced by three others and influence ten more. D3's physics-based layout is the only way to represent these "tensions" naturally, allowing the clusters (like "Early Modernism") to form organically based on their connectivity.

### Why Automated Scraping?
To maintain **Structural Integrity**. By using LLMs to cross-reference a "Master Registry," we ensure that every relationship edge in the graph points to a real, existing node. This eliminates broken links and ensures the genealogy is mathematically sound.

---

## 📈 Future Evolution
The project is currently evolving towards:
- **Web Worker Offloading**: Moving the physics simulation to a background thread to maintain 60FPS with 1000+ nodes.
- **Time-Scrubbing**: A temporal filter that allows users to "watch" the map grow from 500 BC to 2024 AD.

---
*Created by the ArtMap Team — Exploring the genealogy of human expression.*
