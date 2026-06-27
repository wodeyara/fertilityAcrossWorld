"""Populate data/static_factors.csv from public sources.

  fem_years_schooling, gii  <- UNDP Human Development Report composite indices
                               (latest available year, keyed by iso3)
  social_cohesion           <- World Happiness Report 'Social support' (the public
                               Gallup measure), mapped from country name -> iso3

Occasional build step; the CSV is the committed artifact. Requires network + pycountry.
Run from data-pipeline/:  .venv/bin/python scripts/build_static_factors.py
"""
import csv
import io
from pathlib import Path

import pycountry
import requests

HDR_URL = "https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv"
WHR_URL = "https://raw.githubusercontent.com/Escavine/World-Happiness/main/World-happiness-report-2024.csv"
DATA = Path(__file__).resolve().parent.parent / "data"
YEARS = ["2022", "2021", "2020", "2019", "2018"]

# WHR country names that pycountry.lookup cannot resolve directly
WHR_OVERRIDES = {
    "Taiwan Province of China": "TWN",
    "Hong Kong S.A.R. of China": "HKG",
    "State of Palestine": "PSE",
    "Turkiye": "TUR",
    "Congo (Brazzaville)": "COG",
    "Congo (Kinshasa)": "COD",
    "Iran": "IRN",
    "Laos": "LAO",
    "Moldova": "MDA",
    "Russia": "RUS",
    "Ivory Coast": "CIV",
}


def _latest(row, prefix):
    for y in YEARS:
        v = (row.get(f"{prefix}_{y}") or "").strip()
        if v:
            return v
    return ""


def fetch_hdr():
    resp = requests.get(HDR_URL, timeout=120)
    resp.raise_for_status()
    out = {}
    for row in csv.DictReader(io.StringIO(resp.text)):
        iso3 = (row.get("iso3") or "").strip().upper()
        if len(iso3) != 3:
            continue
        out[iso3] = {"gii": _latest(row, "gii"), "fem_years_schooling": _latest(row, "mys_f")}
    return out


def _name_to_iso3(name):
    if name in WHR_OVERRIDES:
        return WHR_OVERRIDES[name]
    try:
        return pycountry.countries.lookup(name).alpha_3
    except LookupError:
        return None


def fetch_whr():
    resp = requests.get(WHR_URL, timeout=120)
    resp.raise_for_status()
    out, unmatched = {}, []
    for row in csv.DictReader(io.StringIO(resp.text)):
        name = (row.get("Country name") or "").strip()
        ss = (row.get("Social support") or "").strip()
        if not name or not ss:
            continue
        iso3 = _name_to_iso3(name)
        if iso3:
            out[iso3] = ss
        else:
            unmatched.append(name)
    if unmatched:
        print("WHR names not matched to iso3 (skipped):", unmatched)
    return out


def main():
    hdr = fetch_hdr()
    whr = fetch_whr()
    with open(DATA / "countries_ref.csv", newline="", encoding="utf-8") as fh:
        refs = [row["iso3"].strip().upper() for row in csv.DictReader(fh)]

    cov = {"fem_years_schooling": 0, "gii": 0, "social_cohesion": 0}
    rows = []
    for iso3 in sorted(refs):
        h = hdr.get(iso3, {})
        values = {
            "fem_years_schooling": h.get("fem_years_schooling", ""),
            "gii": h.get("gii", ""),
            "social_cohesion": whr.get(iso3, ""),
        }
        for k, v in values.items():
            if v:
                cov[k] += 1
        rows.append([iso3, values["fem_years_schooling"], values["gii"], values["social_cohesion"]])

    with open(DATA / "static_factors.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["iso3", "fem_years_schooling", "gii", "social_cohesion"])
        writer.writerows(rows)

    print(f"static_factors.csv: {len(rows)} countries")
    for k, n in cov.items():
        print(f"  {k}: {n}/{len(rows)}")


if __name__ == "__main__":
    main()
