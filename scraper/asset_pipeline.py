import os
import sys
import json
import time
import requests
from utils import get_client, print_flush, WIKI_API, WIKIDATA_API

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def download_image(url, filepath, client):
    """Download an image from a URL and save it locally."""
    # Wikimedia is very picky about User-Agents for thumbnails
    ua_list = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "ArtMap/1.0 (https://artmap.example.com; student@example.com)",
    ]
    headers = {
        "User-Agent": ua_list[0],
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.wikipedia.org/",
        "Connection": "keep-alive",
    }
    for ua in ua_list:
        headers["User-Agent"] = ua
        try:
            r = requests.get(url, headers=headers, timeout=15.0, allow_redirects=True)
            if r.status_code == 200:
                if len(r.content) > 1000:
                    with open(filepath, "wb") as f:
                        f.write(r.content)
                    return True
            elif r.status_code == 403 or r.status_code == 400:
                continue
        except Exception:
            pass
    return False


def get_commons_url(filename, client):
    """Convert a Wikimedia Commons filename to a direct image URL."""
    params = {
        "action": "query",
        "format": "json",
        "prop": "imageinfo",
        "titles": f"File:{filename}",
        "iiprop": "url",
        "iiurlwidth": 1200,
    }
    try:
        r = client.get("https://commons.wikimedia.org/w/api.php", params=params)
        pages = r.json().get("query", {}).get("pages", {})
        pid = list(pages.keys())[0]
        if pid == "-1":
            return None
        info = pages[pid].get("imageinfo", [{}])[0]
        return info.get("thumburl") or info.get("url")
    except Exception:
        return None


def fetch_wikipedia_assets(title, client, wikidata_id=None):
    """
    Fetch a main image URL and a short (~100 word) intro for a Wikipedia page.
    Strategies:
    1. Wikidata P18/P6108 (if QID provided)
    2. Wikipedia pageimages API
    3. Wikipedia Search fallback
    """

    def query_wiki(search_title):
        params = {
            "action": "query",
            "format": "json",
            "prop": "pageimages|extracts|images",
            "titles": search_title,
            "piprop": "thumbnail",
            "pithumbsize": 1024,
            "exintro": 1,
            "explaintext": 1,
            "redirects": 1,
        }
        try:
            r = client.get(WIKI_API, params=params)
            if r.status_code != 200:
                return None

            pages = r.json().get("query", {}).get("pages", {})
            pid = list(pages.keys())[0]
            if pid == "-1":
                return None

            page = pages[pid]
            image_url = page.get("thumbnail", {}).get("source")
            
            # Fallback to images list if no thumbnail
            if not image_url and "images" in page:
                for img_info in page["images"]:
                    fname = img_info["title"].replace("File:", "")
                    if any(x in fname.lower() for x in [".svg", "icon", "logo", "stub", "crystal", "question"]): continue
                    if any(fname.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png"]):
                        image_url = get_commons_url(fname, client)
                        if image_url: break

            full_extract = page.get("extract", "")

            words = full_extract.split()
            short_intro = (
                " ".join(words[:110]) + "..." if len(words) > 110 else full_extract
            )

            return {
                "name": page.get("title", search_title),
                "image_url": image_url,
                "intro": short_intro,
            }
        except Exception as e:
            print_flush(f"  Error querying {search_title}: {e}")
            return None

    # 1. Try Wikidata for image first
    image_url = None
    if wikidata_id:
        try:
            wd_params = {
                "action": "wbgetentities",
                "format": "json",
                "ids": wikidata_id,
                "props": "claims",
            }
            wr = client.get(WIKIDATA_API, params=wd_params)
            claims = (
                wr.json().get("entities", {}).get(wikidata_id, {}).get("claims", {})
            )
            for prop in ["P18", "P6108"]:
                if prop in claims:
                    fname = claims[prop][0]["mainsnak"]["datavalue"]["value"]
                    image_url = get_commons_url(fname, client)
                    if image_url:
                        break
        except Exception:
            pass

    # 2. Query Wikipedia for text and image (if not found yet)
    data = query_wiki(title)
    if data:
        if image_url:  # Prefer Wikidata image
            data["image_url"] = image_url
        if data.get("image_url"):
            return data

    # 3. Search fallback
    print_flush(f"  Direct lookup for '{title}' failed or has no image. Searching...")
    for query_term in [f"{title} painting", f"{title} art movement", f"{title} art"]:
        search_params = {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": query_term,
            "srlimit": 1,
        }
        try:
            sr = client.get(WIKI_API, params=search_params)
            search_results = sr.json().get("query", {}).get("search", [])
            if search_results:
                top_result = search_results[0]["title"]
                print_flush(
                    f"  Found search result for '{query_term}': '{top_result}'. Fetching..."
                )
                search_data = query_wiki(top_result)
                if search_data and search_data.get("image_url"):
                    return search_data
                if not data and search_data:
                    data = search_data
        except Exception as e:
            print_flush(f"  Search failed for {query_term}: {e}")

    return data


def run_asset_pipeline():
    source_json = "app/public/data/movements.json"
    output_path = "app/public/data/movement_assets.json"
    image_dir = "app/public/images"

    os.makedirs(image_dir, exist_ok=True)

    if not os.path.exists(source_json):
        print_flush(f"Error: Source file {source_json} not found.")
        return

    with open(source_json, "r", encoding="utf-8") as f:
        movements_data = json.load(f)

    # Build a map of name -> {wikidata_id, slug}
    movement_info = {}
    for m in movements_data:
        # Fallback logic for slug
        slug = m.get("slug")
        if not slug:
            if "image" in m and m["image"]:
                # Try to extract slug from image path: "images/art_nouveau.jpg" -> "art_nouveau"
                img_path = m["image"]
                slug = os.path.splitext(os.path.basename(img_path))[0]
            else:
                slug = m.get("id") or m["name"].lower().replace(" ", "_")
        
        movement_info[m["name"]] = {
            "qid": m.get("wikidata_id"), 
            "slug": slug
        }

    # Deduplicate while preserving order
    seen = set()
    movements = []
    for m in movements_data:
        name = m["name"]
        if name not in seen:
            movements.append(name)
            seen.add(name)

    # Load existing to resume or skip
    if os.path.exists(output_path):
        with open(output_path, "r", encoding="utf-8") as f:
            assets = json.load(f)
    else:
        assets = {}

    client = get_client()
    print_flush(f"Starting Asset Pipeline for {len(movements)} movements...")

    for i, m in enumerate(movements):
        info = movement_info.get(m, {})
        wikidata_id = info.get("qid")
        slug = info.get("slug")
        local_image_path = os.path.join(image_dir, f"{slug}.jpg")

        # Check if we already have both the asset entry and the local image
        has_asset = m in assets and assets[m].get("image_url")
        has_file = os.path.exists(local_image_path)

        if has_asset and has_file:
            continue

        data = None
        if has_asset and not has_file:
            # We have the URL, just need to download
            data = assets[m]
            print_flush(
                f"[{i + 1}/{len(movements)}] Downloading missing image for: {m}"
            )
        else:
            # Missing asset or missing image URL, need to fetch
            print_flush(f"[{i + 1}/{len(movements)}] Fetching assets for: {m}")
            data = fetch_wikipedia_assets(m, client, wikidata_id)

        if data:
            assets[m] = data
            if data.get("image_url"):
                if not os.path.exists(local_image_path):
                    if download_image(data["image_url"], local_image_path, client):
                        print_flush(f"  Successfully downloaded: {slug}.jpg")
                    else:
                        print_flush(f"  Failed to download from: {data['image_url']}")
            else:
                print_flush(f"  No image URL found for: {m}")

            if i % 5 == 0:
                with open(output_path, "w", encoding="utf-8") as f:
                    json.dump(assets, f, indent=2, ensure_ascii=False)

        time.sleep(0.5)  # Polite scraping

    # Final save
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(assets, f, indent=2, ensure_ascii=False)

    print_flush("Asset Pipeline Complete!")

    # Synchronization Step: Update movements.json with local image paths
    print_flush("Synchronizing movements.json...")
    updated = 0
    for m in movements_data:
        # Fallback logic for slug
        slug = m.get("slug")
        if not slug:
            if "image" in m and m["image"]:
                img_path = m["image"]
                slug = os.path.splitext(os.path.basename(img_path))[0]
            else:
                slug = m.get("id") or m["name"].lower().replace(" ", "_")
        
        local_image_file = f"{slug}.jpg"
        if os.path.exists(os.path.join(image_dir, local_image_file)):
            m["image"] = f"images/{local_image_file}"
            updated += 1

    with open(source_json, "w", encoding="utf-8") as f:
        json.dump(movements_data, f, indent=2, ensure_ascii=False)

    print_flush(f"Sync Complete! Updated {updated} image paths in movements.json.")


if __name__ == "__main__":
    run_asset_pipeline()
