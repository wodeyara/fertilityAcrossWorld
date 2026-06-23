import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CountryRef:
    iso3: str
    iso_num: int
    name: str
    region: str


def load_countries_ref(path: str | Path) -> dict[str, CountryRef]:
    refs: dict[str, CountryRef] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            iso3 = row["iso3"].strip().upper()
            if iso3 in refs:
                raise ValueError(f"duplicate iso3 in reference: {iso3}")
            try:
                iso_num = int(row["iso_num"].strip())
            except ValueError:
                raise ValueError(f"Invalid iso_num for {iso3!r}: {row['iso_num']!r}")
            refs[iso3] = CountryRef(
                iso3=iso3,
                iso_num=iso_num,
                name=row["name"].strip(),
                region=row["region"].strip(),
            )
    return refs
