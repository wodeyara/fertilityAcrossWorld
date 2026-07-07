"""Populate data/policies.csv from the UN World Population Policies source.

Stance (government policy concerning the current fertility level: raise / maintain /
lower / none) is extracted from the authoritative UN DESA report
"World Population Policies 2021: Policies related to fertility" (annex table
"Policy concerning current fertility level"), which is publicly downloadable.

Measures (baby_bonus, parental_leave, childcare_subsidy, tax_incentive) are left
BLANK in this pass: the distinctive pronatalist measures (baby bonuses, tax
incentives) are not in the reachable report annex, and the structured UN World
Population Policies dataset — which carries per-measure detail — was under site
maintenance (esa.un.org/PopPolicy redirected to maintenance.un.org) when this ran.
Measures are a documented backfill (UN Excel + OECD Family Database) once reachable.
No values are guessed.

Occasional build step; data/policies.csv is the committed artifact of record.
Run from data-pipeline/:  .venv/bin/python scripts/build_policies.py
"""
import csv
import io
import re
from pathlib import Path

import pycountry
import requests

PDF_URL = "https://desapublications.un.org/file/983/download"
DATA = Path(__file__).resolve().parent.parent / "data"
UA = {"User-Agent": "fertility-explorer/0.1 (research project)"}

STANCE = {"Raise": "raise", "Maintain": "maintain", "Lower": "lower", "No policy": "none"}
# A data row is: <country name> <population> <tfr> <adolescent-rate> <stance> ...
ROW_RE = re.compile(
    r"^\s*([A-Za-z][A-Za-z’'().,\- ]+?)\s+[\d ]{2,}\s+\d+\.\d+\s+\d+\.\d+\s+"
    r"(Raise|Maintain|Lower|No policy)\b"
)

# UN report names that pycountry.lookup cannot resolve directly.
NAME_OVERRIDES = {
    "Republic of Korea": "KOR", "Democratic People's Republic of Korea": "PRK",
    "United States of America": "USA", "United Republic of Tanzania": "TZA",
    "Republic of Moldova": "MDA", "Russian Federation": "RUS",
    "Syrian Arab Republic": "SYR", "Lao People's Democratic Republic": "LAO",
    "Viet Nam": "VNM", "Brunei Darussalam": "BRN", "Czechia": "CZE",
    "United Kingdom": "GBR", "Türkiye": "TUR", "Turkey": "TUR",
    "State of Palestine": "PSE", "Democratic Republic of the Congo": "COD",
    "Congo": "COG", "China, Hong Kong SAR": "HKG",
    "China, Taiwan Province of China": "TWN", "North Macedonia": "MKD",
    "Holy See": "VAT", "Micronesia (Fed. States of)": "FSM",
    "Bolivia (Plurinational State of)": "BOL",
    "Venezuela (Bolivarian Republic of)": "VEN", "Iran (Islamic Republic of)": "IRN",
}
MEASURE_COLS = ["baby_bonus", "parental_leave", "childcare_subsidy", "tax_incentive"]


def _name_to_iso3(name):
    name = re.sub(r"\s+\)", ")", name).strip()  # fix "of )" spacing artifacts
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    try:
        return pycountry.countries.lookup(name).alpha_3
    except LookupError:
        return None


def extract_stances(pdf_bytes) -> dict[str, str]:
    import pypdf
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    out = {}
    for page in reader.pages:
        for line in (page.extract_text() or "").split("\n"):
            m = ROW_RE.match(line)
            if not m:
                continue
            name = m.group(1).strip()
            if len(name) < 3 or name.isupper():  # skip region headers
                continue
            iso3 = _name_to_iso3(name)
            if iso3:
                out[iso3] = STANCE[m.group(2)]
    return out


def main():
    resp = requests.get(PDF_URL, timeout=120, headers=UA)
    resp.raise_for_status()
    stances = extract_stances(resp.content)

    with open(DATA / "countries_ref.csv", newline="", encoding="utf-8") as fh:
        refs = [row["iso3"].strip().upper() for row in csv.DictReader(fh)]

    header = ["iso3", "stance"] + MEASURE_COLS + ["notes"]
    rows, covered = [], 0
    for iso3 in sorted(refs):
        stance = stances.get(iso3, "")
        if stance:
            covered += 1
        rows.append([iso3, stance, "", "", "", "", ""])

    with open(DATA / "policies.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)

    n_raise = sum(1 for r in rows if r[1] == "raise")
    print(f"policies.csv: {len(rows)} rows; stance for {covered}; raise={n_raise}")
    print(f"  (extracted {len(stances)} stances from UN report; measures left blank pending UN Excel/OECD)")


if __name__ == "__main__":
    main()
