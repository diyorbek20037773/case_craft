"""QA (research/qa-sahna.md) topgan nuqsonlar: talim «Vaqt to'xtadi» kafolati, ustoz xabari joriy hodisaga bog'liq,
rubrikada har mezonga alohida iqtibos, «e'tiroz» va ichki atamalar matnlarda yo'q."""
import asyncio
import re

import pytest

from app import modes as M
from app.content import load_content
from app.providers.llm import LLMProvider
from app.report import (QUOTE_NOT_FOUND_UZ, assign_distinct_quotes, clean_text_uz, finish_session,
                        quote_is_verbatim, quotes_overlap, student_entries)
from conftest import make_engine

PRAISE_RX = re.compile(r"payqadingiz|to'g'ri murojaat|barakalla|ofarin|zo'r", re.IGNORECASE)
LEADING_Q = "Siz sudlanuvchining yuzini aniq ko'rdingiz, to'g'rimi?"
OPEN_Q = "Guvoh, o'sha paytda qayerda turgan edingiz?"


def run(coro):
    return asyncio.run(coro)


class FakeLLM(LLMProvider):
    name = "fake"

    def __init__(self, turn=None, rubric=None):
        self.turn_out = turn or {"speaker": "witness", "utterance_uz": "Kassa yonida turgan edim.",
                                 "violation_id": "none", "rule_ids": [], "asked_hidden_fact": False,
                                 "advance_stage": False}
        self.rubric_out = rubric or {"criteria": []}

    async def complete_json(self, task, system, user, schema, ctx):
        return dict(self.turn_out) if task == "turn" else self.rubric_out


@pytest.fixture
def eng():
    c = load_content(force=True)
    return make_engine(lambda: c)


def to_questioning(e, mode="talim"):
    s, _, _ = run(e.start(None, "Jasur", mode))
    r = run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    assert r["stage_kind"] == "questioning"
    return s, r


def assert_pause(t, ref=None):
    """«Vaqt to'xtadi» kafolati: pause, rule (ref, sarlavha, matn), «Qayta urinib ko'ring», qayta urinish kartasi."""
    assert t["pause"] is True and t["event"] == "violation"
    assert t["say_uz"].startswith("Vaqt to'xtadi.") and "Qayta urinib ko'ring" in t["say_uz"]
    rule = t["rule"]
    assert rule and rule["ref"] and rule["title_uz"] and rule["text_uz"]
    assert rule["ref"] in t["say_uz"]
    if ref:
        assert rule["ref"] == ref
    assert len(t["choices"]) >= 1 and t["choices"][0]["label_uz"]
    assert t["choices"][0].get("action") or t["choices"][0]["text_uz"]
    assert not PRAISE_RX.search(t["say_uz"])


# ----------------------------------------------------------------------------- 1. talim: pauza kafolati
def test_qa_k10_leading_question_after_caught_motion_pauses(eng):
    """QA k10: murojaat qanoatlantirildi -> talaba o'zi ishora qiluvchi savol berdi -> overlay ma'lumoti bor."""
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="motion_reject_question"))
    assert r["tutor"]["event"] == "motion_ok"
    r = run(eng.turn(s, LEADING_Q))
    assert r["violation"]["id"] == "yonaltiruvchi_savol"
    assert_pause(r["tutor"], r["violation"]["article_ref"])
    assert r["tutor"]["choices"][0]["text_uz"].endswith("?")  # ochiq savol bilan qayta urinish


def test_leading_question_without_motion_in_trap_window_is_violation_with_pause(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, LEADING_Q))  # so'z olmasdan gapirdi
    assert r["violation"]["id"] == "ruxsatsiz_gapirish"
    assert_pause(r["tutor"])
    assert s.trap_question in r["tutor"]["say_uz"]  # tuzoq ham tushuntiriladi


def test_leading_question_after_floor_granted_is_violation_not_motion(eng):
    """So'z berildi, lekin talaba murojaat o'rniga o'zi ishora qiluvchi savol berdi: qoidabuzarlik + pauza."""
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="request_floor"))
    r = run(eng.turn(s, LEADING_Q))
    assert r["violation"] and r["violation"]["id"] == "yonaltiruvchi_savol"
    assert_pause(r["tutor"], r["violation"]["article_ref"])
    assert s.trap_state == "missed" and s.trap_question in r["tutor"]["say_uz"]
    assert student_entries(s)[-1].violation_id == "yonaltiruvchi_savol"


def test_leading_question_with_motion_words_is_not_treated_as_motion(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "Siz ishora qiluvchi savolga javob berdingiz, to'g'rimi?"))
    assert s.trap_state != "caught" and r["violation"] is not None
    assert not PRAISE_RX.search(r["tutor"]["say_uz"] or "")


def test_llm_violation_in_talim_pauses_with_rule_and_retry():
    c = load_content(force=True)
    llm = FakeLLM(turn={"speaker": "judge", "utterance_uz": "Savol ishga aloqador emas.",
                        "violation_id": "aloqasiz_savol", "rule_ids": [], "asked_hidden_fact": False,
                        "advance_stage": False})
    e = make_engine(lambda: c, llm)
    s, _ = to_questioning(e)
    run(e.turn(s, "", action="motion_reject_question"))
    r = run(e.turn(s, "Guvoh, kecha qaysi kinoni ko'rdingiz?"))  # regex ushlamaydi, LLM topadi
    assert r["violation"]["id"] == "aloqasiz_savol" and r["source"].startswith("llm:")
    assert_pause(r["tutor"])


@pytest.mark.parametrize("kind", ["opening", "questioning", "arguments", "last_word"])
def test_every_violation_has_retry_card_fitting_stage(kind):
    c = load_content(force=True)
    for vid in [*c.violations, "ruxsatsiz_gapirish", "nomalum_qoidabuzarlik"]:
        card = M.retry_card(vid, kind)
        assert card["label_uz"] and (card.get("action") or card["text_uz"])
        if kind == "arguments" and vid != "ruxsatsiz_gapirish":
            assert "Guvoh" not in card["text_uz"]  # muzokarada guvohga savol berilmaydi


def test_witness_question_in_arguments_retry_is_speech_not_question(eng):
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="motion_reject_question"))
    run(eng.turn(s, OPEN_Q))
    run(eng.turn(s, "Guvoh, ko'zoynak taqasizmi?"))
    r = run(eng.turn(s, "Savollarim tugadi."))
    assert r["stage_kind"] == "arguments"
    r = run(eng.turn(s, "Guvoh, siz o'sha kuni nimani ko'rdingiz?"))
    assert r["violation"] is not None
    assert_pause(r["tutor"])
    assert "Guvoh" not in r["tutor"]["choices"][0]["text_uz"]


def test_violation_rule_falls_back_when_article_missing(eng):
    vp = {"id": "x", "name_uz": "Sinov qoidabuzarlik", "article_id": None, "article_ids": [],
          "article_ref": None, "warning_uz": "Himoyachi, tartibga rioya qiling."}
    say, rule = M.violation_explanation(eng.content, vp)
    assert rule["ref"] and rule["title_uz"] and rule["text_uz"] and rule["verified"] is False
    assert "Qayta urinib ko'ring" in say


# ----------------------------------------------------------------------------- 2. ustoz xabari = joriy hodisa
def test_tutor_event_stage_start(eng):
    s, _, _ = run(eng.start(None, "Jasur", "talim"))
    t = run(eng.start_extras(s))["tutor"]
    assert t["event"] == "stage_start" and t["say_uz"] == eng.content.stages[0]["tutor_uz"]
    r = run(eng.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    assert r["tutor"]["event"] == "stage_start"
    assert r["tutor"]["say_uz"] == eng.content.stage_by_kind("questioning")["tutor_uz"]
    assert not PRAISE_RX.search(r["tutor"]["say_uz"])


def test_tutor_event_motion_ok_is_the_only_praise(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="motion_reject_question"))
    assert r["tutor"]["event"] == "motion_ok" and r["tutor"]["pause"] is False
    assert PRAISE_RX.search(r["tutor"]["say_uz"]) and "prokuror" in r["tutor"]["say_uz"]


def test_tutor_after_mistake_never_praises(eng):
    """QA k10: xatodan keyingi javoblarda maqtov yo'q, oddiy navbatda ustoz gapi yo'q (event none)."""
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="motion_reject_question"))
    events = []
    for txt in [LEADING_Q, OPEN_Q, LEADING_Q, "Guvoh, ko'zoynak taqasizmi?"]:
        r = run(eng.turn(s, txt))
        t = r["tutor"]
        events.append(t["event"])
        assert not PRAISE_RX.search(t["say_uz"] or "")
        if r["violation"]:
            assert_pause(t)
        else:
            assert t["event"] == "none" and t["say_uz"] is None and t["pause"] is False
    assert events == ["violation", "none", "violation", "none"]


def test_tutor_event_motion_missed(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="continue"))
    t = r["tutor"]
    assert t["event"] == "motion_missed" and t["pause"] is True
    assert s.trap_question in t["say_uz"] and not PRAISE_RX.search(t["say_uz"])
    assert t["rule"] and "102" in t["rule"]["ref"] and t["choices"]


def test_tutor_event_motion_denied_without_trap(eng):
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="motion_reject_question"))
    r = run(eng.turn(s, "", action="motion_reject_question"))  # endi rad etiladigan savol yo'q
    t = r["tutor"]
    assert r["text_uz"] == M.RULING_DENIED
    assert t["event"] == "motion_denied" and not PRAISE_RX.search(t["say_uz"]) and t["pause"] is False


def test_tutor_event_hint_and_none(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="hint"))
    assert r["tutor"]["event"] == "hint" and r["tutor"]["say_uz"] == r["text_uz"]
    r = run(eng.turn(s, "", action="request_floor"))
    assert r["tutor"]["event"] == "none" and r["tutor"]["say_uz"] is None


def test_majlis_has_no_tutor(eng):
    s, r = to_questioning(eng, "majlis")
    assert r["tutor"] is None


# ----------------------------------------------------------------------------- 3. rubrika iqtiboslari va matnlar
SPEECH = ("Hurmatli sud, ayblov dalillari sudlanuvchining aybini isbotlamaydi: guvoh ko'rsatuvi ishonchli emas, "
          "videoyozuv yuzni ko'rsatmaydi, noutbuk topilmagan, shubhalar sudlanuvchi foydasiga hal qilinadi, "
          "oqlashni so'rayman.")


def _majlis_to_finish(e):
    s, _ = to_questioning(e, "majlis")
    run(e.turn(s, "", action="motion_reject_question"))
    run(e.turn(s, OPEN_Q))
    run(e.turn(s, "Guvoh, ko'zoynak taqasizmi?"))
    run(e.turn(s, "Savollarim tugadi."))
    run(e.turn(s, SPEECH))
    run(e.turn(s, "Nutqim tugadi."))
    return s


def _check_distinct(res, s):
    crit = res["rubric"]["criteria"]
    quotes = [c["evidence_quote"] for c in crit if c["evidence_quote"]]
    for i, a in enumerate(quotes):
        for b in quotes[i + 1:]:
            assert not quotes_overlap(a, b), (a, b)
    st = student_entries(s)
    for c in crit:
        if c["evidence_quote"]:
            assert quote_is_verbatim(c["evidence_quote"], st) and c["quote_note_uz"] is None
        else:
            assert c["quote_note_uz"] == QUOTE_NOT_FOUND_UZ
    return {c["id"]: c for c in crit}


def test_rubric_evidence_and_speech_quotes_differ_from_single_sentence_speech(eng):
    s = _majlis_to_finish(eng)
    res = run(finish_session(eng.content, s, eng.llm))
    by = _check_distinct(res, s)
    assert by["dalilga_tayanish"]["level"] > 0 and by["muzokara_nutqi"]["level"] > 0
    assert by["dalilga_tayanish"]["evidence_quote"] and by["muzokara_nutqi"]["evidence_quote"]
    assert by["dalilga_tayanish"]["evidence_quote"] != by["muzokara_nutqi"]["evidence_quote"]


def test_rubric_llm_same_quote_for_two_criteria_is_deduplicated():
    c = load_content(force=True)
    same = "ayblov dalillari sudlanuvchining aybini isbotlamaydi"
    rub = {"criteria": [
        {"id": "dalilga_tayanish", "level": 2, "evidence_quote": same, "rule_ids": [],
         "comment_uz": "Talaba yonaltiruvchi_savol qoidasini bilib, prokurorga e'tiroz bildirgan."},
        {"id": "muzokara_nutqi", "level": 2, "evidence_quote": same, "rule_ids": [],
         "comment_uz": "Nutq tuzilgan, rules.json dagi moddalarga mos."},
        {"id": "protsessual_tartib", "level": 2, "evidence_quote": "o'sha paytda qayerda turgan edingiz",
         "rule_ids": [], "comment_uz": "O'zi e'tiroz bildirgan qoidani buzdi; e'tirozi qanoatlantirildi."},
    ]}
    e = make_engine(lambda: c, FakeLLM(rubric=rub))
    s = _majlis_to_finish(e)
    res = run(finish_session(e.content, s, e.llm))
    by = _check_distinct(res, s)
    assert by["dalilga_tayanish"]["evidence_quote"] != by["muzokara_nutqi"]["evidence_quote"]
    assert by["tinglash"]["evidence_quote"] == M.student_motion_text(c)  # murojaat iqtibosi tinglashga
    assert "rad etish" not in by["savol_berish"]["evidence_quote"]  # murojaat — guvohga savol emas
    html = res["bayonnoma_html"]
    for txt in [*(k["comment_uz"] for k in res["rubric"]["criteria"]), html]:
        assert not re.search(r"e['’ʻ]?tiroz", txt, re.IGNORECASE), txt
        assert "rules.json" not in txt and "yonaltiruvchi_savol" not in txt
    assert "raislik qiluvchiga murojaat qilgan" in by["dalilga_tayanish"]["comment_uz"]


def test_bayonnoma_has_no_internal_terms_and_shows_quote_not_found(eng):
    s, _ = to_questioning(eng, "talim")
    run(eng.turn(s, "", action="motion_reject_question"))
    run(eng.turn(s, LEADING_Q))
    res = run(finish_session(eng.content, s, eng.llm))
    html = res["bayonnoma_html"]
    assert "rules.json" not in html and "yonaltiruvchi_savol" not in html and "ruxsatsiz_gapirish" not in html
    assert eng.content.violations["yonaltiruvchi_savol"]["name_uz"] in html
    assert QUOTE_NOT_FOUND_UZ in html  # muzokara nutqi yo'q
    by = {c["id"]: c for c in res["rubric"]["criteria"]}
    assert "yonaltiruvchi_savol" not in by["protsessual_tartib"]["comment_uz"]
    assert res["rubric"]["violations"][0]["name_uz"]


def test_clean_text_replaces_objection_and_internal_ids():
    c = load_content(force=True)
    t = clean_text_uz(c, "U e'tiroz bildirdi, keyin E’tirozi rules.json bo'yicha; yonaltiruvchi_savol, "
                         "savol_berish mezoni.")
    assert "raislik qiluvchiga murojaat qildi" in t and "murojaati" in t
    assert not re.search(r"tiroz|rules\.json|yonaltiruvchi_savol|savol_berish", t)


def test_assign_distinct_quotes_empty_when_no_alternative():
    crit = [{"id": "a", "level": 2, "evidence_quote": "bir xil uzun gap shu yerda"},
            {"id": "b", "level": 1, "evidence_quote": "bir xil uzun gap shu yerda"}]
    assign_distinct_quotes(crit, {"a": [], "b": []})
    assert crit[0]["evidence_quote"] == "bir xil uzun gap shu yerda" and crit[1]["evidence_quote"] == ""
    assert crit[1]["quote_note_uz"] == QUOTE_NOT_FOUND_UZ
    crit = [{"id": "a", "level": 2, "evidence_quote": "bir xil uzun gap shu yerda"},
            {"id": "b", "level": 1, "evidence_quote": "bir xil uzun gap shu yerda"}]
    assign_distinct_quotes(crit, {"b": ["boshqa alohida gap bu yerda"]})
    assert crit[1]["evidence_quote"] == "boshqa alohida gap bu yerda"
