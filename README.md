# ArtMap: Taste Curator

ArtMap is an interactive, node-based genealogical map of art history. It visualizes the relationships, influences, and evolutions of **288 curated art movements**, styles, and periods.

The project features an automated Python pipeline for data harvesting and an immersive D3.js frontend for exploration.

## ✨ Features

- **Dual-Mode Visualization:** Switch between a macro-level **Genealogical Map** and a high-fidelity **List Browser**.
- **Interactive Graph:** Explore influences and connections through a force-directed layout with era-based clustering.
- **Deep Content:** Over 200 high-resolution art assets and detailed scholarly essays for each movement.
- **Disco Elysium Style UI:** Narrative-focused detail panels with smooth typography and typewriter effects.

## 📁 Project Structure

- `scraper/`: Python scripts for data harvesting and asset discovery.
- `app/`: Vite + D3.js frontend application.
- `art_movements_master.csv`: The primary deduplicated dataset.
- `app/public/data/movements.json`: The runtime-ready JSON payload.

## 🚀 Getting Started

### 1. Data Pipeline (Scraper)
The pipeline harvests data from Wikipedia and Wikidata, using LLMs (Gemini/Groq) for synthesis.

**Setup:**
```bash
pip install pandas httpx google-generativeai groq python-dotenv
```

**Run Asset Pipeline (Images/Intros):**
```bash
python scraper/asset_pipeline.py
```

### 2. Frontend Application
The frontend is built with Vanilla JS and D3.js for maximum performance.

**Setup:**
```bash
cd app
npm install
```

**Run Locally:**
```bash
npm run dev
```

## 📊 Dataset Stats
- **Total Unique Movements:** 288
- **Visual Asset Coverage:** 72% (208 Images)
- **Eras Covered:** Ancient to Contemporary

## 📜 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
