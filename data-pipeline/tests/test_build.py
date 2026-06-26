import pytest

from fertility_pipeline import build
from fertility_pipeline.countries_ref import CountryRef

REFS = {
    "USA": CountryRef("USA", 840, "United States", "North America"),
    "NER": CountryRef("NER", 562, "Niger", "Sub-Saharan Africa"),
}
TFR = {"USA": (1.66, 2022), "NER": (6.82, 2021)}
WB = {
    "gdp_pc": {"USA": (63000.0, 2022), "NER": (1200.0, 2022)},
    "urbanisation": {"USA": (82.7, 2022)},  # NER missing on purpose
}
STATIC = {
    "USA": {"gii": 0.179, "social_cohesion": 90.0},
    "NER": {"gii": 0.611, "social_cohesion": None},
}
COMPUTED = {"USA": {"possibility": 1.4}}  # NER absent -> None


def test_record_shape_and_join():
    records = build.build_records(REFS, TFR, WB, STATIC, COMPUTED)
    by_iso = {r["iso3"]: r for r in records}
    usa = by_iso["USA"]
    assert usa["name"] == "United States"
    assert usa["iso_num"] == 840
    assert usa["tfr"] == 1.66
    assert usa["tfr_year"] == 2022
    assert usa["factors"]["gdp_pc"] == 63000.0
    assert usa["factors"]["social_cohesion"] == 90.0


def test_missing_factor_is_none():
    records = build.build_records(REFS, TFR, WB, STATIC, COMPUTED)
    ner = next(r for r in records if r["iso3"] == "NER")
    assert ner["factors"]["urbanisation"] is None      # absent from WB result
    assert ner["factors"]["social_cohesion"] is None   # explicit None in static


def test_only_reference_countries_emitted():
    wb_extra = {"gdp_pc": {"USA": (63000.0, 2022), "XXX": (1.0, 2022)}}
    records = build.build_records(REFS, TFR, wb_extra, STATIC, COMPUTED)
    assert {r["iso3"] for r in records} == {"USA", "NER"}


def test_all_registry_factor_ids_present_in_each_record():
    from fertility_pipeline import factors
    records = build.build_records(REFS, TFR, WB, STATIC, COMPUTED)
    for r in records:
        assert set(r["factors"]) == set(factors.factor_ids())


def test_raises_if_factor_in_multiple_sources(monkeypatch):
    from fertility_pipeline import factors
    dup = factors.Factor(id="gdp_pc", label="x", group="Economic", source="static",
                         code="gdp_pc", direction="negative", unit="x")
    original = factors.static_factors()
    monkeypatch.setattr(factors, "static_factors", lambda: original + [dup])
    with pytest.raises(ValueError, match="multiple sources"):
        build.build_records(REFS, TFR, WB, STATIC, COMPUTED)


def test_computed_factor_merged_and_missing_is_none():
    records = build.build_records(REFS, TFR, WB, STATIC, COMPUTED)
    by = {r["iso3"]: r for r in records}
    assert by["USA"]["factors"]["possibility"] == 1.4
    assert by["NER"]["factors"]["possibility"] is None
