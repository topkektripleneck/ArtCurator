"""
Converts art_movements_master.csv → app/public/data/movements.json
Clean, frontend-ready JSON array.
"""

import pandas as pd
import json
import os
import re


def clean_text(text):
    if not isinstance(text, str) or text.lower() == "nan":
        return ""
    return text.strip()


def main():
    df = pd.read_csv("art_movements_master.csv")

    movements = []
    for _, row in df.iterrows():
        name = clean_text(row.get("name", ""))
        if not name:
            continue

        # Parse relationships JSON
        rels_raw = clean_text(row.get("relationships", "[]"))
        try:
            rels = json.loads(rels_raw)
        except Exception:
            rels = []

        # Create a slug for image filenames
        slug = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")

        movements.append(
            {
                "name": name,
                "slug": slug,
                "era": clean_text(row.get("era", "")),
                "region": clean_text(row.get("region", "")),
                "key_figures": clean_text(row.get("key_figures", "")),
                "summary": clean_text(row.get("summary", "")),
                "relationships": rels,
                "wikidata_id": clean_text(row.get("wikidata_id", "")),
                "wikipedia_snippet": clean_text(row.get("wikipedia_snippet", "")),
                "image": f"images/{slug}.jpg",
            }
        )

    # Sort by name
    movements.sort(key=lambda m: m["name"])

    # Ensure output directory
    os.makedirs("app/public/data", exist_ok=True)

    with open("app/public/data/movements.json", "w", encoding="utf-8") as f:
        json.dump(movements, f, ensure_ascii=False, indent=2)

    print(f"Exported {len(movements)} movements to app/public/data/movements.json")


if __name__ == "__main__":
    main()
