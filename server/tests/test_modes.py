"""Rejimlar (prompts/api-rejimlar.md): floor, prokurorning tuzoq savoli + murojaat, talim ustozi, record_delta, rubrika /10.

Hammasi mock/soxta LLM bilan, internet kerak emas.
"""
import asyncio
import copy
import re

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import modes as M
from app.content import Content, load_content, load_fixtures
from app.providers.llm import LLMProvider
from app.providers.tts import voice_for
from app.report import finish_session, quote_is_verbatim, student_entries
from conftest import make_engine


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def eng():
    c = load_content(force=True)
    return make_engine(lambda: c)


def bare_content(exam=True, tutor=True) -> Content:
    """Haqiqiy kontent nusxasi, yangi maydonlarsiz (default / LLM yo'lini tekshirish uchun)."""
    c = load_content(force=True)
    case, rules = copy.deepcopy(c.case), copy.deepcopy(c.rules)
    if exam:
        case.get("witness", {}).pop("prosecutor_exam", None)
    if tutor:
        for st in rules.get("stages", []):
            for k in ("tutor_uz", "tutor_choices", "hints_uz"):
                st.pop(k, None)
    return Content(case=case, rules=rules, tests=c.tests, source=c.source)


def to_questioning(e, mode="majlis"):
    s, _, _ = run(e.start(None, "Jasur", mode))
    r = run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    assert r["stage_changed"] and r["stage_kind"] == "questioning"
    return s, r


# ----------------------------------------------------------------------------- legacy (mode yo'q)
def test_legacy_without_mode_has_no_exam_and_8_point_rubric(eng):
    s, _, _ = run(eng.start(None, "Jasur"))
    assert s.mode == "majlis" and s.legacy
    r = run(eng.turn(s, "Tayyorman."))
    assert r["followups"] == [] and r["window"] is None and r["tutor"] is None
    assert r["floor"]["holder"] == "defense" and r["mode"] == "majlis"
    res = run(finish_session(eng.content, s, eng.llm))
    assert res["rubric"]["max"] == 8 and len(res["rubric"]["criteria"]) == 4


# ----------------------------------------------------------------------------- majlis: tuzoq savol
def test_majlis_exam_has_leading_question_and_window(eng):
    s, r = to_questioning(eng)
    assert [f["speaker"] for f in r["followups"]] == ["prosecutor", "witness", "prosecutor"]
    trap = r["followups"][-1]["text_uz"]
    assert M.is_leading(eng.content, trap) and trap == s.trap_question
    assert r["window"] == {"kind": "motion_opportunity", "until_ms": 8000, "hint_uz": None}  # majlisda ishora yo'q
    assert r["floor"]["holder"] == "prosecutor" and r["floor"]["expected"] is None
    assert "Prokuror, so'z sizga" in r["text_uz"]
    for f in r["followups"]:
        assert not M.FORBIDDEN_RX.search(f["text_uz"])


def test_motion_in_window_is_granted_and_witness_does_not_answer(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="motion_reject_question"))
    assert r["speaker"] == "judge" and r["text_uz"].startswith("Iltimos qanoatlantirildi, savol rad etiladi")
    assert "102-modda" in r["text_uz"]
    assert "witness" not in [f["speaker"] for f in r["followups"]]
    assert [f["kind"] for f in r["followups"]] == ["record", "utterance", "utterance"]
    assert r["followups"][-1]["text_uz"] == M.JUDGE_GIVE_FLOOR
    assert r["floor"]["holder"] == "defense" and r["window"] is None
    types = [d["type"] for d in r["record_delta"]]
    assert types[:2] == ["motion", "ruling"]
    assert s.trap_state == "caught"
    res = run(finish_session(eng.content, s, eng.llm))
    rub = {c["id"]: c for c in res["rubric"]["criteria"]}
    assert res["rubric"]["max"] == 10 and rub["tinglash"]["level"] == 2
    assert quote_is_verbatim(rub["tinglash"]["evidence_quote"], student_entries(s))
    assert "102" in rub["tinglash"]["article_ref"]
    assert "Iltimos (murojaat)" in res["bayonnoma_html"]


def test_missed_window_continues_silently(eng):
    s, r0 = to_questioning(eng)
    r = run(eng.turn(s, "", action="continue"))
    assert r["speaker"] == "witness" and r["text_uz"] == s.trap_answer
    assert [f["text_uz"] for f in r["followups"]] == [M.PROSECUTOR_DONE, M.JUDGE_GIVE_FLOOR]
    assert r["tutor"] is None  # majlisda ustoz yo'q
    assert r["floor"]["holder"] == "defense" and s.trap_state == "missed"
    # oyna o'tgach murojaat — asossiz
    r = run(eng.turn(s, "", action="motion_reject_question"))
    assert r["text_uz"] == M.RULING_DENIED and s.motions_invalid == 1
    res = run(finish_session(eng.content, s, eng.llm))
    rub = {c["id"]: c for c in res["rubric"]["criteria"]}
    assert rub["tinglash"]["level"] == 0 and "e'tibor bermadingiz" in rub["tinglash"]["comment_uz"]
    assert res["rubric"]["total"] == sum(c["level"] for c in res["rubric"]["criteria"])


def test_speaking_without_floor_is_unauthorized(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "Guvoh, siz qayerda turgan edingiz?"))
    assert r["violation"]["id"] == "ruxsatsiz_gapirish" and r["speaker"] == "judge"
    assert re.search(r"424|408", r["violation"]["article_ref"] or "")
    assert [f["speaker"] for f in r["followups"]] == ["witness", "prosecutor", "judge"]
    assert r["floor"]["holder"] == "defense"
    assert "violation" in [d["type"] for d in r["record_delta"]]
    # endi so'z talabada: oddiy savol qoidabuzarlik emas
    r = run(eng.turn(s, "Guvoh, siz qayerda turgan edingiz?"))
    assert r["violation"] is None and r["speaker"] == "witness"


def test_request_floor_then_spoken_motion(eng):
    s, _ = to_questioning(eng)
    r = run(eng.turn(s, "", action="request_floor"))
    assert r["text_uz"] == M.JUDGE_HEARS and r["floor"]["holder"] == "defense"
    assert r["window"]["kind"] == "motion_opportunity"
    r = run(eng.turn(s, "Hurmatli sud, savol yo'naltiruvchi, uni rad etishingizni so'rayman."))
    assert r["text_uz"].startswith("Iltimos qanoatlantirildi") and s.trap_state == "caught"
    assert s.log[-5].kind == "motion" and s.log[-5].input_mode == "text"


def test_request_floor_without_trap_is_noop(eng):
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="continue"))
    n = len(s.log)
    r = run(eng.turn(s, "", action="request_floor"))
    assert r["text_uz"] == M.JUDGE_FLOOR_YOURS and len(s.log) == n and r["record_delta"] == []


def test_majlis_student_leading_question_prosecutor_moves(eng):
    s, _ = to_questioning(eng)
    run(eng.turn(s, "", action="motion_reject_question"))
    r = run(eng.turn(s, "Siz sudlanuvchini aniq ko'rdingiz, to'g'rimi?"))
    assert r["speaker"] == "prosecutor" and r["violation"]["id"] == "yonaltiruvchi_savol"
    assert r["text_uz"].startswith("Raislik qiluvchi, himoyachining savolini rad etishni so'rayman")
    assert r["followups"][0]["speaker"] == "judge" and r["followups"][0]["kind"] == "ruling"
    assert r["followups"][0]["text_uz"].startswith("Iltimos qanoatlantirildi.")
    assert r["source"] == "precheck"


# ----------------------------------------------------------------------------- tuzoq savol kod nazorati
class ExamLLM(LLMProvider):
    name = "fake"

    def __init__(self, exam):
        self.exam = exam

    async def complete_json(self, task, system, user, schema, ctx):
        if task == "prosecutor_exam":
            return dict(self.exam)
        return {"speaker": "judge", "utterance_uz": "Davom eting.", "violation_id": "none", "rule_ids": [],
                "asked_hidden_fact": False, "advance_stage": True}


GOOD = {"q1_open": "Guvoh, 14-mart kuni kechqurun do'konda nima bo'ldi?",
        "a1": "Noutbuklar javoni yonida qora kurtkali, kepkali erkakni ko'rdim.",
        "q2_leading": "Siz javon yonida aynan sudlanuvchini ko'rdingiz, to'g'rimi?",
        "a2": "Ertasi kuni tergovchi to'rtta fotosurat ko'rsatdi. Men Sodiqovni «o'xshaydi» dedim."}


def test_exam_llm_text_used_when_valid():
    c = load_content(force=True)
    script, src = M.validate_exam(c, GOOD)
    assert script == GOOD and src == "llm"


@pytest.mark.parametrize("bad", [
    {"q2_leading": "Siz nimani ko'rdingiz?"},                          # ishora qiluvchi emas
    {"q2_leading": "Objection! Siz uni ko'rdingiz, to'g'rimi?"},        # taqiqlangan ibora
    {"a2": "Ha, o'sha kuni ko'zoynagim yo'q edi."},                     # yashirin fakt
    {"a2": "Ha, men uning yuzini aniq ko'rdim."},                       # ko'rishni bo'rttirish
    {"q1_open": "Siz uni ko'rdingiz, shunday emasmi?"},                 # 1-savol ochiq bo'lishi shart
    {"a1": "JPK 999-moddaga ko'ra aytaman."},                           # modda raqami
])
def test_exam_invalid_fields_fall_back_to_template(bad):
    c = load_content(force=True)
    script, src = M.validate_exam(c, {**GOOD, **bad})
    tpl = M.exam_template(c)
    k = next(iter(bad))
    assert script[k] == tpl[k] and src == "llm+shablon"
    assert M.is_leading(c, script["q2_leading"])


def test_exam_from_llm_is_used_in_session_and_trap_is_guaranteed():
    c = bare_content()  # case.json da prosecutor_exam yo'q — LLM yo'li
    e = make_engine(lambda: c, ExamLLM({**GOOD, "q2_leading": "Siz uni ko'rdingiz."}))
    s, _, _ = run(e.start(None, "Jasur", "majlis"))
    r = run(e.turn(s, "Tayyorman."))
    assert r["followups"][0]["text_uz"] == GOOD["q1_open"]
    assert M.is_leading(c, r["followups"][-1]["text_uz"])  # LLM ishora qilmagan — kod shablonni qo'ydi
    assert s.exam_source == "llm+shablon"


def test_llm_forbidden_phrase_is_stripped():
    c = load_fixtures()

    class Bad(LLMProvider):
        name = "bad"

        async def complete_json(self, task, system, user, schema, ctx):
            return {"speaker": "judge", "utterance_uz": "Objection sustained. Himoyachi, davom eting.",
                    "violation_id": "none", "rule_ids": [], "asked_hidden_fact": False, "advance_stage": False}

    e = make_engine(lambda: c, Bad())
    s, _, _ = run(e.start(None))
    s.stage_id = "sud_tergovi"
    r = run(e.turn(s, "Hurmatli sud, izoh."))
    assert r["text_uz"] == "Himoyachi, davom eting."


# ----------------------------------------------------------------------------- talim
def test_talim_tutor_stage_text_and_choices():
    c = bare_content()  # rules.json da tutor_* maydonlari yo'q — default matnlar
    eng = make_engine(lambda: c)
    s, _, _ = run(eng.start(None, "Jasur", "talim"))
    ex = run(eng.start_extras(s))
    assert ex["tutor"]["say_uz"] == M.TUTOR_STAGE_UZ["opening"] and len(ex["tutor"]["choices"]) >= 2
    assert ex["tutor"]["hints_left"] == 3 and ex["tutor"]["pause"] is False
    r = run(eng.turn(s, "Tayyorman."))
    t = r["tutor"]
    assert t["say_uz"] == M.TUTOR_STAGE_UZ["questioning"]
    assert 2 <= len(t["choices"]) <= 3 and t["choices"][0]["action"] == "motion_reject_question"
    assert r["window"]["hint_uz"]  # talimda yumshoq ishora bor
    for txt in [t["say_uz"], *[ch["text_uz"] for ch in t["choices"]]]:
        assert not M.FORBIDDEN_RX.search(txt)


def test_talim_hints_decrease_and_stop(eng):
    s, _ = to_questioning(eng, "talim")
    run(eng.turn(s, "", action="motion_reject_question"))
    n = len(s.log)
    lefts, says = [], []
    for _ in range(4):
        r = run(eng.turn(s, "", action="hint"))
        assert r["speaker"] == "tutor" and r["tutor"]["say_uz"] == r["text_uz"]
        lefts.append(r["tutor"]["hints_left"])
        says.append(r["text_uz"])
    assert lefts == [2, 1, 0, 0] and "tugadi" in says[-1]
    assert len(s.log) == n  # maslahat bayonnomaga yozilmaydi
    hidden = eng.content.case["witness"]["hidden_fact"]
    for h in says:  # maslahat javobni bermaydi
        assert "ko'zoynak" not in h and hidden["reveal_line_uz"] not in h
    res = run(finish_session(eng.content, s, eng.llm))
    assert res["rubric"]["hints_used"] == 3 and res["rubric"]["hints_left"] == 0
    assert res["rubric"]["max"] == 8  # 5-mezon faqat majlisda
    assert "Maslahatlar:" in res["bayonnoma_html"]


def test_talim_violation_pauses_with_rule(eng):
    s, _ = to_questioning(eng, "talim")
    run(eng.turn(s, "", action="motion_reject_question"))
    r = run(eng.turn(s, "Siz sudlanuvchini aniq ko'rdingiz, to'g'rimi?"))
    assert r["speaker"] == "judge" and r["violation"]["id"] == "yonaltiruvchi_savol"  # talimda prokuror murojaatsiz
    t = r["tutor"]
    assert t["pause"] is True and "Qayta urinib ko'ring" in t["say_uz"]
    assert t["rule"]["ref"] == r["violation"]["article_ref"] and t["rule"]["ref"] in t["say_uz"]
    assert t["choices"] and t["choices"][0]["text_uz"].endswith("?")
    assert s.pauses == 1
    r = run(eng.turn(s, "Siz qayerda turgan edingiz?"))
    assert r["tutor"]["pause"] is False and r["tutor"]["say_uz"] is None


def test_talim_missed_trap_tutor_explains(eng):
    s, _ = to_questioning(eng, "talim")
    r = run(eng.turn(s, "", action="continue"))
    assert r["tutor"]["pause"] is True and s.trap_question in r["tutor"]["say_uz"]
    assert "rad etishni so'rayman" in r["tutor"]["say_uz"]


def test_hint_in_majlis_rejected_by_api(monkeypatch):
    c = load_content(force=True)
    monkeypatch.setattr(main, "engine", make_engine(lambda: c))
    with TestClient(main.app) as cl:
        st = cl.post("/session/start", json={"mode": "majlis"}).json()
        assert st["mode"] == "majlis" and st["tutor"] is None and st["floor"]["holder"] == "defense"
        r = cl.post("/turn", json={"session_id": st["session_id"], "action": "hint"})
        assert r.status_code == 422 and r.json()["detail"]["code"] == "hint_unavailable"
        st2 = cl.post("/session/start", json={"mode": "talim"}).json()
        assert st2["tutor"]["say_uz"] and "audio_url" in st2["tutor"] and "audio_file" not in st2["tutor"]
        assert st2["record_delta"][0]["speaker"] == "judge" and st2["record_delta"][0]["t"] == "00:00"
        r = cl.post("/turn", json={"session_id": st2["session_id"], "action": "hint"})
        assert r.status_code == 200 and r.json()["tutor"]["hints_left"] == 2
        assert cl.post("/session/start", json={"mode": "boshqa"}).status_code == 422


# ----------------------------------------------------------------------------- record_delta
def test_record_delta_covers_log_exactly_once_and_matches_bayonnoma(eng):
    s, _, _ = run(eng.start(None, "Jasur", "majlis"))
    deltas = list(run(eng.start_extras(s))["record_delta"])
    for kw in [dict(text="Tayyorman."), dict(text="", action="request_floor"),
               dict(text="", action="motion_reject_question"), dict(text="Guvoh, siz qayerda turgan edingiz?"),
               dict(text="Voqea paytida ko'rishingizga biror narsa ta'sir qilganmi?"),
               dict(text="", action="hint"), dict(text="Savollarim tugadi.")]:
        deltas += run(eng.turn(s, kw["text"], action=kw.get("action")))["record_delta"]
    assert [d["log_id"] for d in deltas] == [e.log_id for e in s.log]
    assert all(re.fullmatch(r"\d\d:\d\d", d["t"]) for d in deltas)
    assert {"motion", "ruling", "fact", "normal"} <= {d["type"] for d in deltas}
    for d in deltas:
        assert set(d) >= {"t", "speaker", "text_uz", "type"}
    res = run(finish_session(eng.content, s, eng.llm))
    assert [r["log_id"] for r in res["record"]] == [d["log_id"] for d in deltas]
    for d in deltas:
        assert d["text_uz"].replace("'", "'") in res["bayonnoma_html"].replace("&#x27;", "'")
        assert f"({d['t']})" in res["bayonnoma_html"]


# ----------------------------------------------------------------------------- ovoz
def test_tutor_voice_is_madina_but_not_clerk_profile():
    t, k = voice_for("tutor"), voice_for("clerk")
    assert t["voice"] == "uz-UZ-MadinaNeural" and (t["rate"], t["pitch"]) != (k["rate"], k["pitch"])


def test_keyword_match_tolerates_missing_apostrophe_from_stt():
    from app.textutil import contains_any

    assert contains_any("O'sha kuni korishingizga biror narsa ta'sir qilganmi?", ["ko'rishingizga"])
    assert contains_any("Siz uning yuzini ko‘rdingizmi?", ["yuzini ko'rdingizmi"])
    assert contains_any("Siz qayerda turgan edingiz?", ["ko'rishingizga"]) is None


# ----------------------------------------------------------------------------- kontentdagi maydonlar
def test_content_prosecutor_exam_is_deterministic_and_skips_llm():
    c = load_content(force=True)
    pe = c.case["witness"]["prosecutor_exam"]
    assert M.is_leading(c, pe["q2_leading"]) and not M.is_leading(c, pe["q1_open"])
    assert M.content_exam(c) == ({k: pe[k] for k in M.EXAM_KEYS}, "kontent")

    class Boom(ExamLLM):
        async def complete_json(self, task, system, user, schema, ctx):
            assert task != "prosecutor_exam", "kontentda so'roq bor — LLM chaqirilmasligi kerak"
            return await super().complete_json(task, system, user, schema, ctx)

    for _ in range(2):  # ikki sessiya — aynan bir xil matn
        e = make_engine(lambda: c, Boom(GOOD))
        s, _, _ = run(e.start(None, "Jasur", "majlis"))
        assert s.exam_task is None and s.exam_source == "kontent"
        r = run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
        assert [f["text_uz"] for f in r["followups"]] == [pe["q1_open"], pe["a1"], pe["q2_leading"]]
        assert s.trap_question == pe["q2_leading"] and s.trap_answer == pe["a2"]
        r = run(e.turn(s, "", action="continue"))  # murojaat qilinmadi — guvoh a2 ni aytadi
        assert r["followups"][0]["speaker"] == "witness" or r["speaker"] == "witness"
        said = [r["text_uz"]] + [f["text_uz"] for f in r["followups"]]
        assert pe["a2"] in said
    assert "prosecutor_exam" not in c.public_case()["witness"]


def test_content_exam_non_leading_q2_falls_back_to_template():
    c = bare_content(tutor=False)
    c.case["witness"]["prosecutor_exam"] = {"q1_open": "Guvoh, nimani ko'rdingiz?", "a1": "Erkakni ko'rdim.",
                                            "q2_leading": "Siz nimani ko'rdingiz?", "a2": "Bilmayman."}
    script, src = M.content_exam(c)
    assert src == "kontent+shablon" and script["q2_leading"] == M.exam_template(c)["q2_leading"]
    assert script["q1_open"] == "Guvoh, nimani ko'rdingiz?" and M.is_leading(c, script["q2_leading"])
    assert M.content_exam(bare_content()) is None


def test_mock_without_content_exam_uses_template():
    c = bare_content()
    e = make_engine(lambda: c)
    s, r = to_questioning(e)
    assert s.exam_source == "shablon" and r["followups"][-1]["text_uz"] == M.exam_template(c)["q2_leading"]


def test_talim_tutor_texts_choices_and_hints_from_rules():
    c = load_content(force=True)
    st0, sq = c.stages[0], c.stage_by_kind("questioning")
    e = make_engine(lambda: c)
    s, _, _ = run(e.start(None, "Jasur", "talim"))
    t = run(e.start_extras(s))["tutor"]
    assert t["say_uz"] == st0["tutor_uz"]
    assert [ch["label_uz"] for ch in t["choices"]] == [ch["label_uz"] for ch in st0["tutor_choices"]]
    floor = next(ch for ch in t["choices"] if ch["label_uz"] == "So'z so'rash")
    assert floor["action"] == "request_floor"  # default karta bilan bir xil sarlavha
    assert "action" not in t["choices"][0]
    r = run(e.turn(s, "", action="hint"))
    # ochilishda so'z allaqachon talabada: «so'z so'rang» maslahati o'tkaziladi, tayyorlik haqidagisi birinchi (QA #9)
    expected = M.stage_hints("opening", st0, "defense")[0]
    assert expected in st0["hints_uz"] and r["text_uz"] == expected
    assert not M.FLOOR_HINT_RX.search(r["text_uz"]) and r["floor"]["holder"] == "defense"
    r = run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    t = r["tutor"]
    assert t["say_uz"] == sq["tutor_uz"]
    # Tuzoq oynasi ochiq, so'z prokurorda: faqat murojaat va so'z so'rash kartalari (AI playtest #11 — matnli savol
    # kartasi bu paytda ruxsatsiz gapirishga olib kelardi). Kontentning murojaat kartasi ishlatiladi.
    assert [ch.get("action") for ch in t["choices"]] == ["motion_reject_question", "request_floor"]
    assert t["choices"][0]["label_uz"] == "Raislik qiluvchiga murojaat"
    # kontent kartalarining harakat xaritasi o'zgarmagan (so'z himoyachiga o'tgach shu kartalar beriladi)
    by_label = {ch["label_uz"]: ch for ch in M.tutor_choices(c, "questioning", sq)}
    assert len(by_label) == len(sq["tutor_choices"])
    assert by_label["Raislik qiluvchiga murojaat"]["action"] == "motion_reject_question"  # matn bo'yicha
    assert "action" not in by_label["Ochiq savol"] and "action" not in by_label["Dalilga tayanib savol"]
    r = run(e.turn(s, "", action="hint"))  # tuzoq oynasi ochiq — vaziyatga oid kod maslahati
    assert "Prokurorning oxirgi savoli" in r["text_uz"]
    run(e.turn(s, "", action="motion_reject_question"))
    r = run(e.turn(s, "", action="hint"))
    assert r["text_uz"] == sq["hints_uz"][2]  # indeks = umumiy hints_used (ochilishda 1 + tuzoqda 1)


def test_explicit_card_action_and_bad_cards():
    c = bare_content()
    st = c.stage_by_kind("arguments")
    st["tutor_choices"] = [{"id": "x", "label_uz": "Keyingi bosqich", "text_uz": "", "action": "next_stage"},
                           {"id": "y", "label_uz": "", "text_uz": "bo'sh sarlavha"}, "buzuq"]
    st["hints_uz"] = ["Bitta maslahat."]
    assert M.tutor_choices(c, "arguments", st) == [
        {"id": "x", "label_uz": "Keyingi bosqich", "text_uz": "", "action": "next_stage"}]
    assert M.hint_for("arguments", 2, False, False, st) == "Bitta maslahat."
    st["tutor_choices"] = []
    assert M.tutor_choices(c, "arguments", st) == M.tutor_choices(bare_content(), "arguments")
    assert M.tutor_stage_say(c, "arguments", st) == M.TUTOR_STAGE_UZ["arguments"]
