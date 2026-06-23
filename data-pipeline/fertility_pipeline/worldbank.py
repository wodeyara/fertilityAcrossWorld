BASE_URL = "https://api.worldbank.org/v2"


def fetch_indicator(code: str, start: int, end: int, session=None) -> dict[str, tuple[float, int]]:
    if session is None:
        import requests
        session = requests
    url = f"{BASE_URL}/country/all/indicator/{code}"
    params = {
        "format": "json",
        "per_page": 20000,
        "date": f"{start}:{end}",
        "source": 2,
    }
    resp = session.get(url, params=params, timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []

    latest: dict[str, tuple[float, int]] = {}
    for row in rows:
        iso3 = (row.get("countryiso3code") or "").strip().upper()
        value = row.get("value")
        if not iso3 or value is None:
            continue
        year = int(row["date"])
        if iso3 not in latest or year > latest[iso3][1]:
            latest[iso3] = (float(value), year)
    return latest
