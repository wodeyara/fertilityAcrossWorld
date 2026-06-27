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


def build_query(iso2: str) -> str:
    regex = "^(" + "|".join(AMENITY_TAGS) + ")$"
    return (
        f"[out:json][timeout:{QUERY_TIMEOUT}];"
        f'area["ISO3166-1:alpha2"="{iso2}"]->.a;'
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


def fetch_amenity_count(iso2: str, session=None, url: str = OVERPASS_URL) -> int:
    if session is None:
        session = requests
    resp = session.post(url, data={"data": build_query(iso2)}, headers=HEADERS, timeout=QUERY_TIMEOUT + 30)
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
        try:
            count = fetch_amenity_count(iso2, session=session)
        except (OverpassError, requests.RequestException):
            continue  # best-effort: skip countries whose query times out / errors
        cache_file.write_text(json.dumps({"iso2": iso2, "total": count}))
        out[iso3] = count
        sleep(1.0)
    return out
