"""tests.json (content/ va fixtures) bo'yicha qoidabuzarlik va yashirin fakt testlari.

Har kiritma yangi sessiyada, kerakli bosqichda yuboriladi. Mock LLM bilan: qoidabuzarliklar kod pre-check orqali,
yashirin fakt — LLM bayrog'i + kalit so'z mosligi orqali.
"""
import asyncio
import json

import pytest

from app.config import PROJECT_DIR, settings
from conftest import make_engine
from app.content import load_content, load_fixtures


def _load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []


CONTENT_TESTS = _load(PROJECT_DIR / "content" / "tests.json")
FIXTURE_TESTS = _load(settings.fixtures_dir / "tests.json")


def _run_case(content, case):
    e = make_engine(lambda: content)
    s, _, _ = asyncio.run(e.start(None))
    s.stage_id = case["stage_id"]
    return asyncio.run(e.turn(s, case["input_uz"]))


def _assert_case(res, case):
    got_v = res["violation"]["id"] if res["violation"] else None
    assert got_v == case["expected_violation_id"], f"{case['input_uz']!r}: {case.get('note_uz')}"
    assert res["revealed_hidden_fact"] is bool(case["expect_reveal"]), f"{case['input_uz']!r}: {case.get('note_uz')}"
    if got_v:
        assert res["speaker"] == "judge" and res["violation"]["article_ref"]


@pytest.mark.skipif(not CONTENT_TESTS, reason="content/tests.json yo'q")
@pytest.mark.parametrize("case", CONTENT_TESTS, ids=[f"content-{i + 1}" for i in range(len(CONTENT_TESTS))])
def test_content_cases(case):
    content = load_content(force=True)
    assert content.source == "content"
    _assert_case(_run_case(content, case), case)


@pytest.mark.parametrize("case", FIXTURE_TESTS, ids=[f"fixture-{i + 1}" for i in range(len(FIXTURE_TESTS))])
def test_fixture_cases(case):
    _assert_case(_run_case(load_fixtures(), case), case)


def test_leading_question_with_reveal_keyword_does_not_reveal():
    """Koordinator talabi: "ko'zoynaksiz edingiz, to'g'rimi?" — kalit so'z bor, lekin yo'naltiruvchi savol."""
    content = load_content(force=True)
    for text in ["Siz o'sha kuni ko'zoynaksiz edingiz, to'g'rimi?",
                 "Siz ko'zoynak taqmagan edingiz, shunday emasmi?",
                 "Siz o’sha kuni ko‘zoynaksiz edingiz, to‘g‘rimi?"]:  # boshqa tutuq belgilari
        stage = content.stage_by_kind("questioning")
        res = _run_case(content, {"stage_id": stage["id"], "input_uz": text})
        assert res["violation"] is not None, text
        assert res["revealed_hidden_fact"] is False, text
