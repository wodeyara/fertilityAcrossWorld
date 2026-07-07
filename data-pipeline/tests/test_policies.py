from pathlib import Path
from fertility_pipeline import policies

FIX = Path(__file__).parent / "fixtures" / "policies_sample.csv"


def test_loads_stance_and_measures():
    out = policies.load_policies(FIX)
    fra = out["FRA"]
    assert fra["stance"] == "raise"
    assert fra["measures"] == {
        "baby_bonus": True, "parental_leave": True,
        "childcare_subsidy": True, "tax_incentive": True,
    }
    assert fra["notes"] == "Strong family policy"


def test_no_measure_and_no_stance_are_none():
    out = policies.load_policies(FIX)
    nul = out["NUL"]
    assert nul["stance"] is None
    assert all(v is None for v in nul["measures"].values())
    assert nul["notes"] is None


def test_unknown_stance_coerced_to_none():
    out = policies.load_policies(FIX)
    assert out["XXX"]["stance"] is None  # "banana" is not a valid stance


def test_no_partial_only_yes_or_no_or_none():
    out = policies.load_policies(FIX)
    kor = out["KOR"]
    assert kor["measures"]["childcare_subsidy"] is False
    assert kor["measures"]["baby_bonus"] is True
