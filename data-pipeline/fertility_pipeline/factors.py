from dataclasses import dataclass


@dataclass(frozen=True)
class Factor:
    id: str
    label: str
    group: str
    source: str   # "worldbank" or "static"
    code: str     # World Bank indicator code, or static CSV column name
    direction: str  # "positive" | "negative" | "mixed" (expected effect on fertility)
    unit: str


GROUPS = [
    "Economic",
    "Education",
    "Women's work & agency",
    "Health & access",
    "Structure",
    "Community",
]

REGIONS = [
    "East Asia & Pacific",
    "Europe & Central Asia",
    "Latin America & Caribbean",
    "Middle East & North Africa",
    "North America",
    "South Asia",
    "Sub-Saharan Africa",
]

TARGET = Factor(
    id="tfr",
    label="Total fertility rate",
    group="Target",
    source="worldbank",
    code="SP.DYN.TFRT.IN",
    direction="mixed",
    unit="births per woman",
)

FACTORS = [
    Factor("gdp_pc", "GDP per capita (PPP)", "Economic", "worldbank",
           "NY.GDP.PCAP.PP.KD", "negative", "constant int'l $"),
    Factor("gini", "Income inequality (Gini)", "Economic", "worldbank",
           "SI.POV.GINI", "mixed", "index 0-100"),
    Factor("fem_sec_enroll", "Female secondary enrolment", "Education", "worldbank",
           "SE.SEC.ENRR.FE", "negative", "% gross"),
    Factor("fem_years_schooling", "Female mean years of schooling", "Education", "static",
           "fem_years_schooling", "negative", "years"),
    Factor("flfp", "Female labour-force participation", "Women's work & agency", "worldbank",
           "SL.TLF.CACT.FE.ZS", "negative", "% of women 15+"),
    Factor("gii", "Gender Inequality Index", "Women's work & agency", "static",
           "gii", "positive", "index 0-1"),
    Factor("contraceptive", "Contraceptive prevalence", "Health & access", "worldbank",
           "SP.DYN.CONU.ZS", "negative", "% of women 15-49"),
    Factor("child_mortality", "Child mortality (under-5)", "Health & access", "worldbank",
           "SH.DYN.MORT", "positive", "per 1,000 live births"),
    Factor("adolescent_fertility", "Adolescent birth rate", "Health & access", "worldbank",
           "SP.ADO.TFRT", "positive", "births per 1,000 women 15-19"),
    Factor("urbanisation", "Urbanisation", "Structure", "worldbank",
           "SP.URB.TOTL.IN.ZS", "negative", "% urban"),
    Factor("social_cohesion", "Social cohesion / support", "Community", "static",
           "social_cohesion", "mixed", "index 0-100"),
]


def factor_ids() -> list[str]:
    return [f.id for f in FACTORS]


def worldbank_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "worldbank"]


def static_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "static"]
