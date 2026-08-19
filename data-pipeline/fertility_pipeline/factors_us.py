"""US-state factor registry. Mirrors the `factors` module interface so it can be
passed as `registry=` to build_records / write_bundle.

Present-day snapshot only. Non-computed factors are columns in data/us_states.csv
(source="static", code == column name). Possibility is computed (see us_states.py).
"""
from .factors import Factor

GROUPS = ["Economic", "Education", "Women's work & agency", "Structure", "Community", "Connectivity", "Possibility"]

REGIONS = ["Northeast", "Midwest", "South", "West"]  # US Census regions

TARGET = Factor(
    id="tfr", label="Total fertility rate", group="Target", source="static",
    code="tfr", direction="mixed", unit="births per woman",
)

FACTORS = [
    Factor(id="income_pc", label="Per-capita personal income", group="Economic",
           source="static", code="income_pc", direction="negative", unit="US$"),
    Factor(id="home_value", label="Median home value", group="Economic",
           source="static", code="home_value", direction="negative", unit="US$"),
    Factor(id="fem_bachelors", label="Women 25+ with a bachelor's+", group="Education",
           source="static", code="fem_bachelors", direction="negative", unit="% of women 25+"),
    Factor(id="flfp", label="Female labour-force participation", group="Women's work & agency",
           source="static", code="flfp", direction="negative", unit="% of women 16+"),
    Factor(id="urbanisation", label="Urbanisation", group="Structure",
           source="static", code="urbanisation", direction="negative", unit="% urban"),
    Factor(id="social_capital", label="Social Capital Project index", group="Community",
           source="static", code="social_capital", direction="mixed", unit="index (z-like)"),
    Factor(id="smartphone", label="Smartphone in household", group="Connectivity",
           source="static", code="smartphone", direction="negative", unit="% of households"),
    Factor(id="possibility", label="Possibility index", group="Possibility",
           source="computed", code="possibility", direction="negative", unit="z-score index"),
]


def factor_ids() -> list[str]:
    return [f.id for f in FACTORS]


def worldbank_factors() -> list[Factor]:
    return []


def static_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "static"]


def computed_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "computed"]
