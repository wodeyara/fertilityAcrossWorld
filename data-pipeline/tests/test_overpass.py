import json
from pathlib import Path

from fertility_pipeline import overpass

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "overpass_count.json").read_text())


class FakeResp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, payload):
        self._p = payload
        self.calls = []

    def post(self, url, data=None, timeout=None):
        self.calls.append((url, data))
        return FakeResp(self._p)


def test_query_uses_out_count_and_area_filter():
    q = overpass.build_query("US")
    assert "out count;" in q
    assert '["ISO3166-1:alpha2"="US"]' in q
    assert "amenity" in q


def test_parse_count_reads_total():
    assert overpass.parse_count(FIXTURE) == 1350


def test_fetch_amenity_count_posts_query():
    session = FakeSession(FIXTURE)
    n = overpass.fetch_amenity_count("US", session=session)
    assert n == 1350
    assert session.calls[0][1]["data"]  # query body posted


def test_fetch_all_uses_cache(tmp_path):
    session = FakeSession(FIXTURE)
    calls = {"n": 0}
    fake_sleep = lambda s: calls.__setitem__("n", calls["n"] + 1)
    refs = {"USA": "US", "FRA": "FR"}
    first = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert first == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 2  # one API call per country
    # second run hits cache only — no new API calls
    session.calls.clear()
    second = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert second == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 0
