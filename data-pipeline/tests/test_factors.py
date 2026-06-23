from fertility_pipeline import factors


def test_target_is_tfr():
    assert factors.TARGET.id == "tfr"
    assert factors.TARGET.source == "worldbank"
    assert factors.TARGET.code == "SP.DYN.TFRT.IN"


def test_factor_ids_are_unique():
    ids = factors.factor_ids()
    assert len(ids) == len(set(ids))
    assert "tfr" not in ids  # target is separate from explanatory factors


def test_every_factor_group_is_known():
    for f in factors.FACTORS:
        assert f.group in factors.GROUPS


def test_every_factor_has_a_source_code():
    for f in factors.FACTORS:
        assert f.source in {"worldbank", "static"}
        assert f.code, f"{f.id} missing code"
        assert f.direction in {"positive", "negative", "mixed"}
        assert f.unit


def test_expected_core_factors_present():
    ids = set(factors.factor_ids())
    assert {"gdp_pc", "urbanisation", "contraceptive", "flfp",
            "child_mortality", "adolescent_fertility", "fem_sec_enroll",
            "gini", "fem_years_schooling", "gii", "social_cohesion"} <= ids
