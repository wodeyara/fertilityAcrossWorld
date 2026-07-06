import json
import time
from pathlib import Path

import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "fertility-explorer/0.1 (research project; +https://github.com/)"
HEADERS = {"User-Agent": USER_AGENT}
QUERY_TIMEOUT = 90  # Overpass server-side timeout (s); countries exceeding it are skipped (best-effort)

AMENITY_TAGS = [
    "bar", "pub", "cafe", "restaurant", "fast_food",
    "cinema", "theatre", "nightclub", "arts_centre",
]


class OverpassError(Exception):
    pass


def build_query(value: str, tag: str = "ISO3166-1:alpha2") -> str:
    regex = "^(" + "|".join(AMENITY_TAGS) + ")$"
    return (
        f"[out:json][timeout:{QUERY_TIMEOUT}];"
        f'area["{tag}"="{value}"]->.a;'
        f'nwr["amenity"~"{regex}"](area.a);'
        "out count;"
    )


def parse_count(payload: dict) -> int:
    if "remark" in payload:  # Overpass reports timeouts/errors via a remark field
        raise OverpassError(payload["remark"])
    for el in payload.get("elements", []):
        if el.get("type") == "count":
            return int(el.get("tags", {}).get("total", 0))
    return 0


def fetch_amenity_count(value: str, session=None, url: str = OVERPASS_URL, tag: str = "ISO3166-1:alpha2") -> int:
    if session is None:
        session = requests
    resp = session.post(url, data={"data": build_query(value, tag=tag)}, headers=HEADERS, timeout=QUERY_TIMEOUT + 30)
    resp.raise_for_status()
    return parse_count(resp.json())


def fetch_all_amenity_counts(mapping, cache_dir, session=None, sleep=None, tag: str = "ISO3166-1:alpha2") -> dict[str, int]:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    if sleep is None:
        sleep = lambda s: time.sleep(s)
    out: dict[str, int] = {}
    for key, value in sorted(mapping.items()):
        cache_file = cache / f"{value}.json"
        if cache_file.exists():
            total = json.loads(cache_file.read_text()).get("total")
            if total is not None:  # null total = known-missing (timed out before); skip
                out[key] = int(total)
            continue
        try:
            count = fetch_amenity_count(value, session=session, tag=tag)
            cache_file.write_text(json.dumps({"value": value, "total": count}))
            out[key] = count
        except (OverpassError, requests.RequestException):
            # negative cache: record the miss so future runs don't re-attempt a slow timeout
            cache_file.write_text(json.dumps({"value": value, "total": None}))
        sleep(1.0)
    return out
