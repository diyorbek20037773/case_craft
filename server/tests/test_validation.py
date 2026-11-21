"""Kod tekshiruvi: LLM uydirgan modda/id lar, noto'g'ri speaker, reveal shartlari, fallback, rubrika iqtiboslari."""
import asyncio

from app.engine import strip_fabricated_articles
from app.providers.llm import LLMProvider
from app.report import finish_session
from conftest import make_engine
from app.content import load_fixtures


class FakeLLM(LLMProvider):
    name = "fake"

    def __init__(self, turn=None, rubric=None, raise_exc=False):
        self.turn_out, self.rubric_out, self.raise_exc = turn or {}, rubric or {"criteria": []}, raise_exc

    async def complete_json(self, task, system, user, schema, ctx):
        if self.raise_exc:
            raise RuntimeError("tarmoq yo'q")
        return dict(self.turn_out) if task == "turn" else self.rubric_out


def _engine(llm):
    c = load_fixtures()
    return make_engine(lambda: c, llm)


def _at_stage(e, stage_id):
    s, _, _ = asyncio.run(e.start(None))
    s.stage_id = stage_id
    return s


BASE = {"speaker": "judge", "utterance_uz": "Davom eting.", "violation_id": "none", "rule_ids": [],
        "asked_hidden_fact": False, "advance_stage": False}


def test_fabricated_rule_ids_and_article_mentions_are_removed():
    e = _engine(FakeLLM({**BASE, "rule_ids": ["jpk_999", "jpk_408", "objection_rule", 5],
                         "utterance_uz": "JPK 999-moddaga ko'ra savol taqiqlangan. Himoyachi, davom eting."}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Hurmatli sud, bir izoh bermoqchiman."))
    assert r["rule_refs"] == ["JPK 408-modda"]
    assert "999" not in r["text_uz"] and r["text_uz"] == "Himoyachi, davom eting."


def test_known_article_mention_is_kept():
    c = load_fixtures()
    text, removed = strip_fabricated_articles(c, "JPK 408-modda bo'yicha tartibni saqlang. 52-bobga qarang.")
    assert removed == [] and "408-modda" in text
    text, removed = strip_fabricated_articles(c, "JK 777-modda bo'yicha jazo bor.")
    assert text == "" and removed


def test_unknown_violation_id_is_ignored():
    e = _engine(FakeLLM({**BASE, "violation_id": "objection_sustained"}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Hurmatli sud, izoh."))
    assert r["violation"] is None


def test_llm_violation_uses_vetted_warning_text():
    e = _engine(FakeLLM({**BASE, "violation_id": "yonaltiruvchi_savol", "rule_ids": ["jpk_b52"],
                         "utterance_uz": "Objection sustained!"}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Guvoh ko'rgan odam aynan sudlanuvchi edi-ku"))  # regexsiz yo'naltiruvchi
    assert r["violation"]["id"] == "yonaltiruvchi_savol"
    assert r["violation"]["article_ref"] == "JPK 52-bob"  # LLM rule_ids violation moddalari ichida
    assert "Objection" not in r["text_uz"] and r["text_uz"] == r["violation"]["warning_uz"]


def test_hidden_fact_needs_both_flag_and_keyword():
    # bayroq bor, kalit so'z yo'q -> ochilmaydi
    e = _engine(FakeLLM({**BASE, "speaker": "witness", "asked_hidden_fact": True, "utterance_uz": "Hmm..."}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Siz o'sha kuni nima qildingiz?"))
    assert not r["revealed_hidden_fact"] and not s.witness_revealed
    # kalit so'z bor, bayroq yo'q -> ochilmaydi
    e = _engine(FakeLLM({**BASE, "speaker": "witness", "asked_hidden_fact": False, "utterance_uz": "Bilmayman."}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Ko'zoynak taqasizmi?"))
    assert not r["revealed_hidden_fact"]
    # ikkalasi -> ochiladi, matnni kod qo'shadi
    e = _engine(FakeLLM({**BASE, "speaker": "witness", "asked_hidden_fact": True, "utterance_uz": "Hmm..."}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Ko'zoynak taqasizmi?"))
    assert r["revealed_hidden_fact"] and "ko'zoynagimni" in r["text_uz"]


def test_hidden_fact_not_in_prompt_before_reveal():
    from app.prompts import build_turn_prompt
    c = load_fixtures()
    e = _engine(FakeLLM(BASE))
    s = _at_stage(e, "sud_tergovi")
    system, _ = build_turn_prompt(c, s, c.stage("sud_tergovi"), "savol?")
    assert c.case["witness"]["hidden_fact"]["text_uz"] not in system
    s.witness_revealed = True
    system, _ = build_turn_prompt(c, s, c.stage("sud_tergovi"), "savol?")
    assert c.case["witness"]["hidden_fact"]["text_uz"] in system


def test_speaker_outside_stage_falls_back_to_judge_and_truncates():
    long = " ".join(["so'z"] * 60)
    e = _engine(FakeLLM({**BASE, "speaker": "witness", "utterance_uz": long}))
    s = _at_stage(e, "muzokara")  # guvoh muzokarada gapirmaydi
    r = asyncio.run(e.turn(s, "Hurmatli sud, nutqimni boshlayman."))
    assert r["speaker"] == "judge" and len(r["text_uz"].split()) <= 25


def test_llm_cannot_advance_stage_alone():
    e = _engine(FakeLLM({**BASE, "advance_stage": True}))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Hurmatli sud, izoh."))  # hali 2 ta savol yo'q
    assert not r["stage_changed"] and s.stage_id == "sud_tergovi"


def test_llm_error_falls_back_to_mock():
    e = _engine(FakeLLM(raise_exc=True))
    s = _at_stage(e, "sud_tergovi")
    r = asyncio.run(e.turn(s, "Guvoh, soat nechagacha ishladingiz?"))
    assert r["speaker"] == "witness" and r["source"].endswith(":fallback") and s.llm_fallbacks == 1


def test_rubric_rejects_non_verbatim_quote_and_fake_rule():
    rub = {"criteria": [
        {"id": "savol_berish", "level": 2, "evidence_quote": "talaba aslida aytmagan uydirma gap bu", "rule_ids": [],
         "comment_uz": "x"},
        {"id": "protsessual_tartib", "level": 2, "evidence_quote": "soat nechagacha ishladingiz",
         "rule_ids": ["jpk_999"], "comment_uz": "y"},
    ]}
    e = _engine(FakeLLM(BASE, rubric=rub))
    s = _at_stage(e, "sud_tergovi")
    asyncio.run(e.turn(s, "Guvoh, soat nechagacha ishladingiz?"))
    res = asyncio.run(finish_session(e.content, s, e.llm))
    by = {c["id"]: c for c in res["rubric"]["criteria"]}
    assert by["savol_berish"]["source"] == "kod"  # uydirma iqtibos rad etildi
    assert by["protsessual_tartib"]["source"] == "ai" and by["protsessual_tartib"]["article_id"] in e.content.articles


def test_reveal_line_prefers_first_person_field():
    from app.engine import reveal_line
    c = load_fixtures()
    assert reveal_line(c) == c.case["witness"]["hidden_fact"]["text_uz"]
    c.case["witness"]["hidden_fact"]["reveal_line_uz"] = "Rostini aytsam, ko'zoynagim yo'q edi."
    assert reveal_line(c) == "Rostini aytsam, ko'zoynagim yo'q edi."
