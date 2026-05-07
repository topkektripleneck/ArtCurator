import os
import sys
import csv
import httpx
import pandas as pd
from typing import Optional, Dict, Set

# ── CONSTANTS ────────────────────────────────────────────────────────

HEADERS = {
    "User-Agent": "ArtMapResearchBot/1.0 (https://artmap.example.com; student@example.com)"
}
WIKI_API = "https://en.wikipedia.org/w/api.php"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"

# ── LOGGING HELPERS ──────────────────────────────────────────────────

def print_flush(msg: str):
    """Prints a message and flushes stdout for real-time logging."""
    print(msg)
    sys.stdout.flush()

# ── HTTP HELPERS ─────────────────────────────────────────────────────

def get_client(timeout: int = 15) -> httpx.Client:
    """Returns a pre-configured synchronous HTTPX client."""
    return httpx.Client(timeout=timeout, headers=HEADERS)

def get_async_client(timeout: int = 15) -> httpx.AsyncClient:
    """Returns a pre-configured asynchronous HTTPX client."""
    return httpx.AsyncClient(timeout=timeout, headers=HEADERS)

# ── WIKIPEDIA HELPERS ───────────────────────────────────────────────

def fetch_wikipedia_extract(title: str, client: httpx.Client) -> Optional[str]:
    """Fetch the first few sentences of a Wikipedia page (synchronous)."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "extracts",
        "titles": title,
        "exintro": 1,
        "explaintext": 1,
        "exsentences": 3,
        "redirects": 1,
    }
    try:
        r = client.get(WIKI_API, params=params)
        r.raise_for_status()
        pages = r.json().get("query", {}).get("pages", {})
        pid = list(pages.keys())[0]
        if pid == "-1":
            return None
        return pages[pid].get("extract")
    except (httpx.HTTPError, KeyError, IndexError) as e:
        print_flush(f"  [Utils] Wiki fetch failed for '{title}': {e}")
        return None

async def fetch_wikipedia_extract_async(
    title: str, client: httpx.AsyncClient
) -> Optional[str]:
    """Fetch the first few sentences of a Wikipedia page (asynchronous)."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "extracts",
        "titles": title,
        "exintro": 1,
        "explaintext": 1,
        "exsentences": 3,
        "redirects": 1,
    }
    try:
        r = await client.get(WIKI_API, params=params)
        r.raise_for_status()
        pages = r.json().get("query", {}).get("pages", {})
        pid = list(pages.keys())[0]
        if pid == "-1":
            return None
        return pages[pid].get("extract")
    except (httpx.HTTPError, KeyError, IndexError) as e:
        print_flush(f"  [Utils] Async Wiki fetch failed for '{title}': {e}")
        return None

# ── WIKIDATA HELPERS ───────────────────────────────────────────────

def fetch_wikidata_id(title: str, client: httpx.Client) -> Optional[str]:
    """Resolve a Wikipedia title to its Wikidata QID."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "pageprops",
        "titles": title,
        "redirects": 1,
    }
    try:
        r = client.get(WIKI_API, params=params)
        r.raise_for_status()
        pages = r.json().get("query", {}).get("pages", {})
        pid = list(pages.keys())[0]
        if pid == "-1":
            return None
        return pages[pid].get("pageprops", {}).get("wikibase_item")
    except (httpx.HTTPError, KeyError, IndexError) as e:
        print_flush(f"  [Utils] Wikidata ID resolution failed for '{title}': {e}")
        return None

def resolve_entity_label(qid: str, client: httpx.Client) -> str:
    """Resolve a Wikidata QID to its English label."""
    params = {
        "action": "wbgetentities",
        "format": "json",
        "ids": qid,
        "props": "labels",
        "languages": "en",
    }
    try:
        r = client.get(WIKIDATA_API, params=params)
        r.raise_for_status()
        return r.json()["entities"][qid]["labels"]["en"]["value"]
    except (httpx.HTTPError, KeyError) as e:
        print_flush(f"  [Utils] Label resolution failed for '{qid}': {e}")
        return qid

# ── DATA HELPERS ─────────────────────────────────────────────────────

def load_processed_movements(file_path: str) -> Set[str]:
    """Loads a set of movement names already present in the output CSV."""
    if not os.path.exists(file_path):
        return set()
    try:
        df = pd.read_csv(file_path)
        return set(df["name"].tolist())
    except Exception as e:
        print_flush(f"  [Utils] Failed to load processed movements from {file_path}: {e}")
        return set()

def append_to_csv(file_path: str, record: Dict[str, str]):
    """Appends a single record to a CSV file with consistent formatting."""
    file_exists = os.path.exists(file_path)
    pd.DataFrame([record]).to_csv(
        file_path, mode="a", header=not file_exists, index=False, quoting=csv.QUOTE_ALL
    )
