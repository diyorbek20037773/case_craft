"""Butun oqim mock provayder bilan: start -> 6+ turn -> finish."""
import asyncio

from app.report import DISCLAIMER_UZ, finish_session, quote_is_verbatim, student_entries
from app.textutil import norm


def run(coro):
    return asyncio.run(coro)


def _check_finish(engine, s):
    res = run(finish_session(engine.content, s, engine.llm))
    html = res["bayonnoma_html"]
    assert DISCLAIMER_UZ in html
    assert "O'qituvchi tasdig'i" in html
    rub = res["rubric"]
    assert [c["id"] for c in rub["criteria"]] == ["savol_berish", "dalilga_tayanish", "protsessual_tartib",
                                                  "muzokara_nutqi"]
    assert rub["total"] == sum(c["level"] for c in rub["criteria"]) and rub["max"] == 8
    st = student_entries(s)
    for c in rub["criteria"]:
        assert c["article_ref"], c  # har ball yonida modda ref
        assert c["article_id"] in engine.content.articles
        if c["level"] > 0:
            assert quote_is_verbatim(c["evidence_quote"], st), c  # iqtibos talaba gapidan so'zma-so'z
            assert c["evidence_quote"] and c["evidence_quote"] in html
    for st_ in engine.content.stages[:3]:
        assert st_["name_uz"] in html
    return res


def test_full_flow_fixtures(fixtures_engine):
    e = fixtures_engine
    s, opening, _ = run(e.start(None, "Jasur"))
    assert s.stage_id == "tayyorlov" and "ochiq deb e'lon" in opening.text

    r1 = run(e.turn(s, "Hurmatli sud, himoyachi tayyormiz."))
    assert r1["stage_changed"] and r1["stage_id"] == "sud_tergovi" and r1["speaker"] == "judge"

    r2 = run(e.turn(s, "Guvoh, o'sha kuni do'konda soat nechagacha ishladingiz?"))
    assert r2["speaker"] == "witness" and r2["violation"] is None and not r2["revealed_hidden_fact"]

    r3 = run(e.turn(s, "Siz sudlanuvchini vitrina yonida ko'rdingiz, shunday emasmi?"))
    assert r3["speaker"] == "judge" and r3["violation"]["id"] == "yonaltiruvchi_savol"
    assert r3["violation"]["article_ref"] in {"JPK 408-modda", "JPK 52-bob"}
    assert r3["source"] == "precheck"  # LLM siz

    r4 = run(e.turn(s, "Kassadan vitrinagacha masofada yuzni qanchalik aniq ko'ra olasiz?"))
    assert r4["speaker"] == "witness" and r4["revealed_hidden_fact"] is True
    assert "ko'zoynag" in r4["text_uz"]

    r5 = run(e.turn(s, "Hurmatli sud, savollarim tugadi."))
    assert r5["stage_changed"] and r5["stage_id"] == "muzokara"

    r6 = run(e.turn(s, "Hurmatli sud, telefon sudlanuvchidan topilmagan, videoyozuvda vitrina ko'rinmaydi, guvoh esa "
                       "ko'zoynagini unutgan edi va kassadan o'n metr narida turgan. Inventarizatsiya dalolatnomasi faqat "
                       "telefon yo'qligini ko'rsatadi. Shu sababli himoyamni oqlashni so'rayman."))
    assert r6["speaker"] == "prosecutor" and r6["violation"] is None
    assert len(r6["text_uz"].split()) <= 25

    res = _check_finish(e, s)
    rub = {c["id"]: c for c in res["rubric"]["criteria"]}
    assert rub["savol_berish"]["level"] == 2
    assert rub["protsessual_tartib"]["level"] == 1  # 1 ta qoidabuzarlik
    assert rub["muzokara_nutqi"]["level"] == 2
    assert res["rubric"]["revealed_hidden_fact"] is True


def test_full_flow_content(content_engine):
    """content/ dagi haqiqiy ish bilan: oxirgi bosqichgacha (oxirgi so'z + yopilish)."""
    e = content_engine
    c = e.content
    stages = [s["id"] for s in c.stages]
    s, opening, _ = run(e.start(c.case["id"], "Jasur"))
    assert s.stage_id == stages[0]

    r = run(e.turn(s, "Hurmatli sud, iltimoslarim yo'q, tayyorman."))
    assert r["stage_changed"] and r["stage_kind"] == "questioning"

    r = run(e.turn(s, "Mansur Rahimov, o'sha kuni do'konda soat nechagacha ishladingiz?"))
    assert r["speaker"] == "witness" and not r["revealed_hidden_fact"]

    # Yo'naltiruvchi savol kalit so'zga ("ko'zoynaksiz") mos bo'lsa ham fakt ochilmaydi — avval qoidabuzarlik
    r = run(e.turn(s, "Siz o'sha kuni ko'zoynaksiz edingiz, to'g'rimi?"))
    assert r["violation"] and r["violation"]["id"] == "yonaltiruvchi_savol"
    assert not r["revealed_hidden_fact"] and not s.witness_revealed

    r = run(e.turn(s, "Voqea paytida ko'rishingizga biror narsa ta'sir qilganmi?"))
    assert r["revealed_hidden_fact"] and r["speaker"] == "witness"
    hf = c.case["witness"]["hidden_fact"]
    assert norm(hf.get("reveal_line_uz") or hf["text_uz"]) == norm(r["text_uz"])

    r = run(e.turn(s, "Savollarim tugadi."))
    assert r["stage_changed"] and r["stage_kind"] == "arguments"

    r = run(e.turn(s, "Hurmatli sud, kuzatuv kamerasi videoyozuvi yuzni ko'rsatmaydi, noutbuk sudlanuvchida topilmagan, "
                      "kassa cheki faqat uning do'konda bo'lganini ko'rsatadi. Guvoh ko'zoynaksiz, yigirma metrdan "
                      "ko'rgan. Shubhalar sudlanuvchi foydasiga hal qilinadi, shuning uchun oqlashni so'rayman."))
    assert r["violation"] is None and r["speaker"] == "prosecutor"

    r = run(e.turn(s, "Nutqim tugadi."))
    assert r["stage_changed"] and r["finished"] and r["stage_kind"] == "last_word"
    assert [f["speaker"] for f in r["followups"]] == ["defendant", "judge"]
    assert "hukm chiqarilmaydi" in r["followups"][-1]["text_uz"]

    r = run(e.turn(s, "Yana bir gap bor"))
    assert r["finished"] and "yakunlangan" in r["text_uz"]

    res = _check_finish(e, s)
    assert res["completed"] is True


def test_advance_blocked_until_enough_questions(fixtures_engine):
    e = fixtures_engine
    s, _, _ = run(e.start(None))
    run(e.turn(s, "Tayyormiz."))
    r = run(e.turn(s, "Savollarim yo'q."))
    assert not r["stage_changed"] and s.stage_id == "sud_tergovi" and r["speaker"] == "judge"
    r = run(e.turn(s, "", action="next_stage"))
    assert not r["stage_changed"]


def test_next_stage_action_button(fixtures_engine):
    e = fixtures_engine
    s, _, _ = run(e.start(None))
    r = run(e.turn(s, "", action="next_stage"))  # tayyorlov: min 0
    assert r["stage_changed"] and s.stage_id == "sud_tergovi"


def test_finish_without_turns(fixtures_engine):
    e = fixtures_engine
    s, _, _ = run(e.start(None))
    res = run(finish_session(e.content, s, e.llm))
    assert res["rubric"]["total"] == 0 and res["completed"] is False
    assert all(c["article_ref"] for c in res["rubric"]["criteria"])
