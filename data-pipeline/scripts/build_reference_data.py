"""Build the committed reference data files for the country pipeline.

Generates (under data-pipeline/data/):
  countries_ref.csv   columns: iso3, iso_num, name, region
  static_factors.csv  header only: iso3, fem_years_schooling, gii, social_cohesion
                      (these 3 UNDP/Gallup-derived factors are backfilled later;
                      empty file => those factors load as null, no silent imputation)

Sources: the World Bank country-list API (iso3, name, World Bank region) joined
with pycountry (ISO 3166-1 numeric code). This is an occasional build step; the
CSV outputs are the committed artifacts. Not part of the pipeline runtime.

Requires: pip install pycountry, and network access.
Run from data-pipeline/:  .venv/bin/python scripts/build_reference_data.py
"""
import csv
from pathlib import Path

import pycountry
import requests

WB_COUNTRIES = "https://api.worldbank.org/v2/country?format=json&per_page=400"
DATA = Path(__file__).resolve().parent.parent / "data"
STATIC_COLUMNS = ["fem_years_schooling", "gii", "social_cohesion"]


def fetch_wb_countries():
    """Return [(iso3, name, region)] for real countries (excluding aggregates)."""
    resp = requests.get(WB_COUNTRIES, timeout=60)
    resp.raise_for_status()
    rows = resp.json()[1]
    out = []
    for row in rows:
        region = row.get("region") or {}
        if region.get("id") == "NA" or region.get("value", "").strip() == "Aggregates":
            continue
        iso3 = (row.get("id") or "").strip().upper()
        if len(iso3) != 3:
            continue
        out.append((iso3, (row.get("name") or "").strip(), region.get("value", "").strip()))
    return out


def main():
    wb = fetch_wb_countries()
    rows, skipped = [], []
    for iso3, name, region in wb:
        country = pycountry.countries.get(alpha_3=iso3)
        numeric = getattr(country, "numeric", None) if country else None
        if not numeric:
            skipped.append(iso3)
            continue
        rows.append((iso3, int(numeric), name, region))
    rows.sort()

    DATA.mkdir(parents=True, exist_ok=True)
    with open(DATA / "countries_ref.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["iso3", "iso_num", "name", "region"])
        writer.writerows(rows)

    with open(DATA / "static_factors.csv", "w", newline="", encoding="utf-8") as fh:
        csv.writer(fh).writerow(["iso3"] + STATIC_COLUMNS)

    iso2_rows = []
    for iso3, _iso_num, _name, _region in rows:
        country = pycountry.countries.get(alpha_3=iso3)
        alpha2 = getattr(country, "alpha_2", None) if country else None
        if alpha2:
            iso2_rows.append((iso3, alpha2))

    with open(DATA / "iso2.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["iso3", "iso2"])
        writer.writerows(iso2_rows)

    print(f"countries_ref.csv: {len(rows)} countries")
    if skipped:
        print(f"skipped (no ISO numeric in pycountry): {sorted(skipped)}")
    print(f"static_factors.csv: header only {STATIC_COLUMNS} — backfill from UNDP/Gallup later")
    print(f"iso2.csv: {len(iso2_rows)} countries")


if __name__ == "__main__":
    main()
