from pathlib import Path

import pytest

from fertility_pipeline import countries_ref

FIXTURE = Path(__file__).parent / "fixtures" / "countries_ref_sample.csv"


def test_loads_keyed_by_iso3():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert set(refs) == {"USA", "ISR", "KOR", "NER", "FRA"}


def test_numeric_code_is_int():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert refs["USA"].iso_num == 840
    assert isinstance(refs["USA"].iso_num, int)


def test_region_and_name_populated():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert refs["ISR"].name == "Israel"
    assert refs["ISR"].region == "Middle East & North Africa"


def test_rejects_duplicate_iso3(tmp_path):
    bad = tmp_path / "dup.csv"
    bad.write_text("iso3,iso_num,name,region\n"
                   "USA,840,United States,North America\n"
                   "USA,841,Dup,North America\n")
    with pytest.raises(ValueError, match="duplicate iso3"):
        countries_ref.load_countries_ref(bad)


def test_normalizes_iso3_whitespace_and_case(tmp_path):
    f = tmp_path / "norm.csv"
    f.write_text("iso3,iso_num,name,region\n"
                 "  usa ,840,United States,North America\n")
    refs = countries_ref.load_countries_ref(f)
    assert "USA" in refs
    assert refs["USA"].iso_num == 840
