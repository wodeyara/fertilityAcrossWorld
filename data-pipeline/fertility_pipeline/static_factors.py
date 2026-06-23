import csv
from pathlib import Path


def load_static_factors(path: str | Path, columns: list[str]) -> dict[str, dict[str, float | None]]:
    out: dict[str, dict[str, float | None]] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        missing = set(columns) - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Columns not found in static factors CSV: {sorted(missing)}")
        for row in reader:
            iso3 = row["iso3"].strip().upper()
            values: dict[str, float | None] = {}
            for col in columns:
                raw = (row.get(col) or "").strip()
                if not raw:
                    values[col] = None
                    continue
                try:
                    values[col] = float(raw)
                except ValueError:
                    raise ValueError(
                        f"Non-numeric value {raw!r} for column {col!r} (iso3={iso3!r})"
                    )
            out[iso3] = values
    return out
