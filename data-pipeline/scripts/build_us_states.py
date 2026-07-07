"""Populate data/us_states.csv from public US sources (occasional build step).

Fully API-driven — the committed CSV is the artifact of record. Requires a Census
API key in the CENSUS_API_KEY environment variable (free: api.census.gov/data/key_signup.html).

Sources (all authoritative, keyed where noted; no hand-entered values):
  population, income_pc, home_value        <- Census ACS 2022 1-yr detailed tables
  fem_bachelors                            <- Census ACS 2022 1-yr B15002 (women 25+ bachelor's+ / women 25+)
  flfp                                     <- Census ACS 2022 1-yr profile DP03 (female LFP rate %)
  broadband                                <- Census ACS 2022 1-yr profile DP02 (% households w/ broadband)
  tfr                                      <- computed from ACS 2022 1-yr B13016 age-specific fertility
                                              (women with a birth in past 12 months / women, by age group;
                                               TFR = sum of age-specific rates x group width)
  urbanisation                             <- 2020 Census DHC table P2 (urban pop / total pop, %)
  social_capital, religiosity              <- left blank: no authoritative keyless/API source located.
                                              Shown as "insufficient data" in the app until backfilled.

Run from data-pipeline/:  CENSUS_API_KEY=... .venv/bin/python scripts/build_us_states.py
"""
import csv
import os
from pathlib import Path

import requests

DATA = Path(__file__).resolve().parent.parent / "data"
ACS = "https://api.census.gov/data/2022/acs/acs1"
ACS_PROFILE = "https://api.census.gov/data/2022/acs/acs1/profile"
DEC = "https://api.census.gov/data/2020/dec/dhc"
UA = {"User-Agent": "fertility-explorer/0.1 (research project)"}
TFR_YEAR = 2022

# 50 states + DC: FIPS -> (USPS code, name, Census region). Standard reference codes.
STATES = {
    "01": ("AL", "Alabama", "South"), "02": ("AK", "Alaska", "West"),
    "04": ("AZ", "Arizona", "West"), "05": ("AR", "Arkansas", "South"),
    "06": ("CA", "California", "West"), "08": ("CO", "Colorado", "West"),
    "09": ("CT", "Connecticut", "Northeast"), "10": ("DE", "Delaware", "South"),
    "11": ("DC", "District of Columbia", "South"), "12": ("FL", "Florida", "South"),
    "13": ("GA", "Georgia", "South"), "15": ("HI", "Hawaii", "West"),
    "16": ("ID", "Idaho", "West"), "17": ("IL", "Illinois", "Midwest"),
    "18": ("IN", "Indiana", "Midwest"), "19": ("IA", "Iowa", "Midwest"),
    "20": ("KS", "Kansas", "Midwest"), "21": ("KY", "Kentucky", "South"),
    "22": ("LA", "Louisiana", "South"), "23": ("ME", "Maine", "Northeast"),
    "24": ("MD", "Maryland", "South"), "25": ("MA", "Massachusetts", "Northeast"),
    "26": ("MI", "Michigan", "Midwest"), "27": ("MN", "Minnesota", "Midwest"),
    "28": ("MS", "Mississippi", "South"), "29": ("MO", "Missouri", "Midwest"),
    "30": ("MT", "Montana", "West"), "31": ("NE", "Nebraska", "Midwest"),
    "32": ("NV", "Nevada", "West"), "33": ("NH", "New Hampshire", "Northeast"),
    "34": ("NJ", "New Jersey", "Northeast"), "35": ("NM", "New Mexico", "West"),
    "36": ("NY", "New York", "Northeast"), "37": ("NC", "North Carolina", "South"),
    "38": ("ND", "North Dakota", "Midwest"), "39": ("OH", "Ohio", "Midwest"),
    "40": ("OK", "Oklahoma", "South"), "41": ("OR", "Oregon", "West"),
    "42": ("PA", "Pennsylvania", "Northeast"), "44": ("RI", "Rhode Island", "Northeast"),
    "45": ("SC", "South Carolina", "South"), "46": ("SD", "South Dakota", "Midwest"),
    "47": ("TN", "Tennessee", "South"), "48": ("TX", "Texas", "South"),
    "49": ("UT", "Utah", "West"), "50": ("VT", "Vermont", "Northeast"),
    "51": ("VA", "Virginia", "South"), "53": ("WA", "Washington", "West"),
    "54": ("WV", "West Virginia", "South"), "55": ("WI", "Wisconsin", "Midwest"),
    "56": ("WY", "Wyoming", "West"),
}

# ACS detailed variables fetched in one call.
DETAIL_VARS = [
    "B01003_001E",  # total population
    "B19301_001E",  # per-capita income
    "B25077_001E",  # median home value
    "B15002_019E",  # female 25+ total
    "B15002_032E", "B15002_033E", "B15002_034E", "B15002_035E",  # female bachelor's/master's/prof/doctorate
] + [f"B13016_{i:03d}E" for i in range(1, 18)]  # fertility: total, births-by-age, no-birth-by-age

# B13016 age groups (births var, no-birth var, interval width in years).
TFR_GROUPS = [
    ("B13016_003E", "B13016_011E", 5),  # 15-19
    ("B13016_004E", "B13016_012E", 5),  # 20-24
    ("B13016_005E", "B13016_013E", 5),  # 25-29
    ("B13016_006E", "B13016_014E", 5),  # 30-34
    ("B13016_007E", "B13016_015E", 5),  # 35-39
    ("B13016_008E", "B13016_016E", 5),  # 40-44
    ("B13016_009E", "B13016_017E", 6),  # 45-50
]


def fetch(url, get_vars, key):
    r = requests.get(url, params={"get": "NAME," + ",".join(get_vars), "for": "state:*", "key": key},
                     timeout=120, headers=UA)
    r.raise_for_status()
    if r.text.strip().startswith("<"):
        raise RuntimeError(f"Census API error (bad key?): {r.text[:120]}")
    rows = r.json()
    header = rows[0]
    fips_i = header.index("state")
    return {row[fips_i]: dict(zip(header, row)) for row in rows[1:]}


def _num(d, key):
    v = (d.get(key) or "").strip()
    if v in ("", "null") or v.startswith("-6666666"):  # Census missing/jam values
        return None
    try:
        return float(v)
    except ValueError:
        return None


def compute_tfr(row):
    total = 0.0
    for births_v, nobirth_v, width in TFR_GROUPS:
        births = _num(row, births_v)
        nobirth = _num(row, nobirth_v)
        if births is None or nobirth is None:
            return None
        denom = births + nobirth
        if denom <= 0:
            continue
        total += (births / denom) * width
    return round(total, 3)


def compute_fem_bachelors(row):
    total = _num(row, "B15002_019E")
    parts = [_num(row, v) for v in ("B15002_032E", "B15002_033E", "B15002_034E", "B15002_035E")]
    if total in (None, 0) or any(p is None for p in parts):
        return None
    return round(sum(parts) / total * 100.0, 1)


def main():
    key = os.environ.get("CENSUS_API_KEY")
    if not key:
        raise SystemExit("Set CENSUS_API_KEY (free at api.census.gov/data/key_signup.html).")

    detail = fetch(ACS, DETAIL_VARS, key)
    profile = fetch(ACS_PROFILE, ["DP03_0011PE", "DP02_0154PE"], key)
    dec = fetch(DEC, ["P2_001N", "P2_002N"], key)

    header = ["iso3", "iso_num", "name", "region", "tfr", "tfr_year", "population", "broadband",
              "income_pc", "home_value", "fem_bachelors", "flfp", "urbanisation",
              "social_capital", "religiosity"]
    rows = []
    for fips in sorted(STATES):
        usps, name, region = STATES[fips]
        d = detail.get(fips, {})
        p = profile.get(fips, {})
        c = dec.get(fips, {})

        urb_total = _num(c, "P2_001N")
        urb_pop = _num(c, "P2_002N")
        urbanisation = round(urb_pop / urb_total * 100.0, 1) if (urb_total and urb_pop is not None) else ""

        def fmt(x):
            return "" if x is None else x

        rows.append([
            usps, str(int(fips)), name, region,
            fmt(compute_tfr(d)), TFR_YEAR,
            fmt(_num(d, "B01003_001E")), fmt(_num(p, "DP02_0154PE")),
            fmt(_num(d, "B19301_001E")), fmt(_num(d, "B25077_001E")),
            fmt(compute_fem_bachelors(d)), fmt(_num(p, "DP03_0011PE")),
            urbanisation,
            "", "",  # social_capital, religiosity: no authoritative source located
        ])

    with open(DATA / "us_states.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)

    filled = lambda i: sum(1 for r in rows if r[i] != "")
    print(f"us_states.csv: {len(rows)} rows")
    for i, col in enumerate(header):
        if col in ("iso3", "iso_num", "name", "region", "tfr_year"):
            continue
        print(f"  {col}: {filled(i)}/{len(rows)}")


if __name__ == "__main__":
    main()
