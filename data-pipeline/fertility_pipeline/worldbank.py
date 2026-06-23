BASE_URL = "https://api.worldbank.org/v2"


def fetch_indicator(code: str, start: int, end: int, session=None) -> dict[str, tuple[float, int]]:
    if session is None:
        import requests
        session = requests
    url = f"{BASE_URL}/country/all/indicator/{code}"

    latest: dict[str, tuple[float, int]] = {}
    page = 1
    while True:
        params = {
            "format": "json",
            "per_page": 20000,
            "date": f"{start}:{end}",
            "source": 2,
            "page": page,
        }
        resp = session.get(url, params=params, timeout=60)
        resp.raise_for_status()
        payload = resp.json()

        meta = payload[0] if isinstance(payload, list) and payload else {}
        rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and isinstance(payload[1], list) else []

        for row in rows:
            iso3 = (row.get("countryiso3code") or "").strip().upper()
            value = row.get("value")
            if not iso3 or value is None:
                continue
            try:
                year = int(row.get("date"))
            except (TypeError, ValueError):
                continue
            if iso3 not in latest or year > latest[iso3][1]:
                latest[iso3] = (float(value), year)

        total_pages = int(meta.get("pages", 1) or 1) if isinstance(meta, dict) else 1
        if page >= total_pages:
            break
        page += 1
    return latest
