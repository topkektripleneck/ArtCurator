# ArtMap: Taste Curator
<img width="925" height="544" alt="Screenshot 2026-05-06 010154" src="https://github.com/user-attachments/assets/9cb04fa4-4791-4dbf-9aec-65cf7ae7d166" />


ArtMap is an interactive, node-based genealogical map of art history. It visualizes the relationships, influences, and evolutions of over 600 art movements, styles, and periods.

The project consists of a high-speed Python data pipeline that aggregates data from Wikipedia and Wikidata, and a sleek, dynamic frontend built with Vite and D3.js that offers a dual-view experience:
1. **Node Graph Map:** A force-directed cluster layout to explore the macro-history of art.
2. **Essay Reader:** A narrative-driven, "Disco Elysium" style detailed view for exploring individual movements.

## Visual Organization

ArtMap organizes the history of art into two primary visual spaces:
- **Genealogical Map:** A large, central "bubble" containing classified movements organized by era and relationship.
- **Unclassified Movements:** A separate dedicated diagram area for movements awaiting categorization, ensuring a clean and structured visualization of the main art history timeline.

![ArtMap Dual-Diagram Layout](app/src/assets/preview_dual_bubbles.png)

## Project Architecture

- `scraper/`: Contains the Python data pipeline used to build the ArtMap dataset.
- `app/`: Contains the Vite + D3.js frontend application.
- `art_movements_master.csv`: The finalized master dataset containing summaries, eras, and relationship edges.
- `art_movements_registry_final_clean.csv`: The curated list of recognized art movements used as the seed for the pipeline.

## Data Pipeline

The pipeline is entirely automated, pulling structured data from Wikidata and plain-text summaries from Wikipedia, before using LLMs (Gemini/Groq) to synthesize consistent 300-500 word scholarly essays and relationship graphs.

### Setup

1. Ensure you have Python 3.10+ installed.
2. Install the required dependencies:
   ```bash
   pip install pandas httpx google-generativeai groq python-dotenv
   ```
3. Create a `.env` file in the root directory (do not commit this to version control) with your API keys:
   ```
   GEMINI_API_KEY=your_gemini_key
   GROQ_API_KEY=your_groq_key
   ```

### Running the Pipeline

To rebuild the `art_movements_master.csv` dataset, run the asynchronous pipeline:

```bash
python scraper/async_pipeline.py
```

The pipeline uses `scraper/utils.py` for all API calls and includes automatic rate-limiting, retries, and checkpointing (it will resume where it left off).

## Frontend Application

The frontend is a lightweight, high-performance visualization tool built with Vanilla JS, CSS, D3.js, and Vite.

### Setup

1. Navigate to the `app/` directory:
   ```bash
   cd app
   ```
2. Install the Node dependencies:
   ```bash
   npm install
   ```

### Running Locally

To start the development server:

```bash
npm run dev
```

Navigate to `http://localhost:5173` in your browser to view the ArtMap.

### Building for Production

To create an optimized production build:

```bash
npm run build
```
The bundled files will be placed in the `app/dist/` directory.

## Contributing

When contributing to the Python pipeline, please ensure you use strong typing (via the `models.py` definitions) and rely on the shared `utils.py` for any external API requests to maintain stability and prevent rate-limiting issues.
