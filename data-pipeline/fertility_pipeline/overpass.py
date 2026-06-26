import json
import time
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

AMENITY_TAGS = [
    "bar", "pub", "cafe", "restaurant", "fast_food",
    "cinema", "theatre", "nightclub", "arts_centre",
]


def build_query(iso2: str) -> str:
    regex = "^(" + "|".join(AMENITY_TAGS) + ")$"
    return (
        "[out:json][timeout:180];"
        f'area["ISO3166-1:alpha2"="{iso2}"]->.a;'
        f'(node["amenity"~"{regex}"](area.a);way["amenity"~"{regex}"](area.a););'
        "out count;"
    )


def parse_count(payload: dict) -> int:
    for el in payload.get("elements", []):
        if el.get("type") == "count":
            return int(el.get("tags", {}).get("total", 0))
    return 0


def fetch_amenity_count(iso2: str, session=None, url: str = OVERPASS_URL) -> int:
    if session is None:
        import requests
        session = requests
    resp = session.post(url, data={"data": build_query(iso2)}, timeout=200)
    resp.raise_for_status()
    return parse_count(resp.json())


def fetch_all_amenity_counts(iso2_by_iso3, cache_dir, session=None, sleep=None) -> dict[str, int]:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    if sleep is None:
        sleep = lambda s: time.sleep(s)
    out: dict[str, int] = {}
    for iso3, iso2 in sorted(iso2_by_iso3.items()):
        cache_file = cache / f"{iso2}.json"
        if cache_file.exists():
            out[iso3] = int(json.loads(cache_file.read_text())["total"])
            continue
        count = fetch_amenity_count(iso2, session=session)
        cache_file.write_text(json.dumps({"iso2": iso2, "total": count}))
        out[iso3] = count
        sleep(1.0)  # be polite to the public Overpass instance
    return out
