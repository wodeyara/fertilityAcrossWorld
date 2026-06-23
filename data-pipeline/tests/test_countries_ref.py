from pathlib import Path

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
    try:
        countries_ref.load_countries_ref(bad)
        assert False, "expected ValueError on duplicate iso3"
    except ValueError:
        pass
