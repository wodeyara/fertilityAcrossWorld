import csv
from pathlib import Path


def load_static_factors(path: str | Path, columns: list[str]) -> dict[str, dict[str, float | None]]:
    out: dict[str, dict[str, float | None]] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            iso3 = row["iso3"].strip().upper()
            values: dict[str, float | None] = {}
            for col in columns:
                raw = (row.get(col) or "").strip()
                values[col] = float(raw) if raw else None
            out[iso3] = values
    return out
