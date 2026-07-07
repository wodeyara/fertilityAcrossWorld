import csv

STANCES = {"raise", "maintain", "lower", "none"}
MEASURE_COLS = ["baby_bonus", "parental_leave", "childcare_subsidy", "tax_incentive"]


def _yes_no(v):
    v = (v or "").strip().lower()
    if v == "yes":
        return True
    if v == "no":
        return False
    return None


def load_policies(path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            iso3 = (row.get("iso3") or "").strip().upper()
            if len(iso3) != 3:
                continue
            stance = (row.get("stance") or "").strip().lower() or None
            if stance not in STANCES:
                stance = None
            out[iso3] = {
                "stance": stance,
                "measures": {c: _yes_no(row.get(c)) for c in MEASURE_COLS},
                "notes": (row.get("notes") or "").strip() or None,
            }
    return out
