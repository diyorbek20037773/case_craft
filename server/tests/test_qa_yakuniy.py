"""Yakuniy QA (research/qa-yakuniy.md, top-5 dan 2–5) server nuqsonlari:
1) GET /session/{id}/approval — talabaga ochiq tasdiq holati (PIN siz);
2) bayonnoma moddalar jumlasi o'ziga zid emas, modda matnida ichki izoh yo'q (note_uz da);
3) maslahat so'z navbatiga mos (so'z talabada bo'lsa «so'z so'rang» yo'q);
4) bayonnomada «(keyingi bosqich so'raldi)» kabi texnik yozuv yo'q;
5) server chiqaradigan matnda o'zbek tutuq belgisi bitta turda (')."""
import asyncio
import re

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import modes as M
from app.content import load_content, load_fixtures, split_article_note
from app.providers.llm import LLMProvider
from app.report import UNVERIFIED_UZ, articles_note_uz, bayonnoma_html, finish_session, student_entries
from app.textutil import uz_apos
from conftest import make_engine

PIN = {"x-teacher-pin": "1234"}
CURLY_RX = re.compile(r"[A-Za-z][ʻʼ‘’`´][A-Za-z]")
INTERNAL_NOTE_RX = re.compile(r"rus tahriri|lex\.uz da tasdiqlan|yurist so'zma-so'z|\(Mazmuni")


def run(coro):
    return asyncio.run(coro)


@pytest.fixture
def eng():
    c = load_content(force=True)
    return make_engine(lambda: c)


@pytest.fixture
def client(monkeypatch):
    c = load_fixtures()
    monkeypatch.setattr(main, "engine", make_engine(lambda: c))
    monkeypatch.setattr(main.settings, "teacher_pin", "1234")
    with TestClient(main.app) as cl:
        yield cl


# ----------------------------------------------------------------------------- 1) /approval
def test_approval_public_endpoint_before_and_after_teacher(client):
    sid = client.post("/session/start", json={"mode": "majlis", "student_name": "Aziza"}).json()["session_id"]
    r = client.get(f"/session/{sid}/approval")  # PIN siz
    assert r.status_code == 200
    assert r.json() == {"session_id": sid, "approved": False, "teacher_name": None, "at": None, "at_uz": None,
                        "comment": None}
    client.post("/finish", json={"session_id": sid})
    client.post(f"/teacher/sessions/{sid}/approve", headers=PIN,
                json={"teacher_name": "Dots. Karimov", "comment": "Yaxshi"})
    body = client.get(f"/session/{sid}/approval").json()
    assert body["approved"] is True and body["teacher_name"] == "Dots. Karimov" and body["comment"] == "Yaxshi"
    assert body["at"] and re.match(r"\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}$", body["at_uz"])
    assert "rubric" not in body and "score" not in body  # faqat tasdiq holati, boshqa ma'lumot yo'q


def test_approval_is_per_session_and_404(client):
    a = client.post("/session/start", json={"mode": "majlis"}).json()["session_id"]
    b = client.post("/session/start", json={"mode": "majlis"}).json()["session_id"]
    client.post(f"/teacher/sessions/{a}/approve", headers=PIN, json={"teacher_name": "Karimova D."})
    assert client.get(f"/session/{a}/approval").json()["approved"] is True
    assert client.get(f"/session/{b}/approval").json()["approved"] is False
    r = client.get("/session/yoq123/approval")
    assert r.status_code == 404 and r.json()["detail"]["code"] == "session_not_found"


# ----------------------------------------------------------------------------- 2) moddalar matni
def test_article_internal_note_is_split_off():
    text, note = split_article_note("Savol berish taqiqlanadi. (Mazmuni; rus tahriri bo'yicha tekshirilgan, "
                                    "o'zbekcha matn lex.uz da tasdiqlanishi kerak.)")
    assert text == "Savol berish taqiqlanadi." and note.startswith("Mazmuni; rus tahriri")
    assert split_article_note("E'tirozlar bayonnomaga kiritiladi (4-qism).") == (
        "E'tirozlar bayonnomaga kiritiladi (4-qism).", "")  # mazmunli qavs saqlanadi
    c = load_content(force=True)
    for a in c.articles.values():
        assert not INTERNAL_NOTE_RX.search(a["text_uz"]), a["id"]
        assert "note_uz" in a
    assert any("rus tahriri" in a["note_uz"] for a in c.articles.values())
    pub = {a["id"]: a for a in c.public_rules()["articles"]}
    assert all(not INTERNAL_NOTE_RX.search(a["text_uz"]) for a in pub.values())


def test_talim_pause_rule_has_no_internal_note(eng):
    s, _, _ = run(eng.start(None, "Jasur", "talim"))
    run(eng.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    run(eng.turn(s, "", action="motion_reject_question"))  # tuzoqni ushlaydi, so'z talabaga
    r = run(eng.turn(s, "Siz sudlanuvchining yuzini aniq ko'rdingiz, to'g'rimi?"))
    t = r["tutor"]
    assert t["pause"] and t["rule"]
    assert not INTERNAL_NOTE_RX.search(t["rule"]["text_uz"]) and not INTERNAL_NOTE_RX.search(t["say_uz"])
    assert "note_uz" in t["rule"]


def test_bayonnoma_footer_matches_verified_state(eng):
    s, _, _ = run(eng.start(None, "Jasur", "majlis"))
    run(eng.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    run(eng.turn(s, "Siz sudlanuvchining yuzini aniq ko'rdingiz, to'g'rimi?"))  # tuzoq paytida — ruxsatsiz
    html = run(finish_session(eng.content, s, eng.llm))["bayonnoma_html"]
    assert "faqat trenajyorning tekshirilgan" not in html and "(matn tekshirilmagan)" not in html
    assert "Moddalar CaseCraft moddalar ro'yxatidan olinadi (uydirma modda filtrlanadi)" in html
    if not any(a["verified"] for a in eng.content.articles.values()):
        assert "modda matnlari yurist tekshiruvini kutmoqda" in html
        assert UNVERIFIED_UZ in html


def test_bayonnoma_verified_article_has_no_mark():
    c = load_fixtures()
    for a in c.articles.values():
        a["verified"] = True
    assert articles_note_uz(c).endswith("modda matnlari yurist tomonidan tekshirilgan.")
    e = make_engine(lambda: c)
    s, _, _ = run(e.start(None, "Jasur", "majlis"))
    run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    run(e.turn(s, "Siz sudlanuvchining yuzini aniq ko'rdingiz, to'g'rimi?"))
    html = run(finish_session(c, s, e.llm))["bayonnoma_html"]
    assert UNVERIFIED_UZ not in html and "kutmoqda" not in html


# ----------------------------------------------------------------------------- 3) maslahat so'z navbatiga mos
def test_opening_hints_never_ask_for_floor_when_student_has_it(eng):
    s, _, _ = run(eng.start(None, "Jasur", "talim"))
    says = []
    for _ in range(M.HINTS_MAX):
        r = run(eng.turn(s, "", action="hint"))
        assert r["floor"]["holder"] == "defense"
        says.append(r["text_uz"])
    assert all(not M.FLOOR_HINT_RX.search(x) for x in says), says
    assert re.search(r"tayyor|iltimos", says[0], re.IGNORECASE)  # ochilishda — tayyorlik haqida
    assert len(set(says)) == M.HINTS_MAX  # filtrdan keyin ham uch xil maslahat


def test_stage_hints_filter_depends_on_floor():
    st = {"hints_uz": ["Avval raislik qiluvchidan so'z so'rang.", "Sudga murojaat qiling.", "Tayyorligingizni ayting."]}
    assert M.stage_hints("opening", st, "defense")[0] == "Tayyorligingizni ayting."
    assert not any(M.FLOOR_HINT_RX.search(h) for h in M.stage_hints("opening", st, "defense"))
    assert "Avval raislik qiluvchidan so'z so'rang." in M.stage_hints("questioning", st, "prosecutor")
    assert M.hint_for("questioning", 0, False, False, st, floor_holder="prosecutor") == st["hints_uz"][0]
    assert M.hint_for("questioning", 0, False, False, st, floor_holder="defense") == "Sudga murojaat qiling."


# ----------------------------------------------------------------------------- 4) texnik yozuvlar yo'q
def test_next_stage_button_leaves_no_technical_record(eng):
    s, _, _ = run(eng.start(None, "Jasur", "majlis"))
    r = run(eng.turn(s, "", action="next_stage"))  # ochilishdan matnsiz o'tish
    assert r["stage_changed"]
    texts = [x["text_uz"] for x in r["record_delta"]]
    assert all("so'raldi)" not in x and not x.startswith("(") for x in texts), texts
    run(eng.turn(s, "", action="motion_reject_question"))
    run(eng.turn(s, "Guvoh, o'sha paytda qayerda turgan edingiz?"))
    r = run(eng.turn(s, "", action="next_stage"))  # rad etiladi (savol kam) — talaba yozuvi yo'q
    assert not any(x["speaker"] == "defense" for x in r["record_delta"])
    html = run(finish_session(eng.content, s, eng.llm))["bayonnoma_html"]
    assert "keyingi bosqich so'raldi" not in html and "(so'z so'radi)" not in html
    assert all(e.text.strip() for e in s.log)


def test_request_floor_record_is_human_and_not_a_quote(eng):
    s, _, _ = run(eng.start(None, "Jasur", "majlis"))
    run(eng.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    r = run(eng.turn(s, "", action="request_floor"))
    rec = [x for x in r["record_delta"] if x["speaker"] == "defense"]
    assert rec and rec[0]["text_uz"] == "Raislik qiluvchidan so'z so'radi."
    assert all(e.kind != "request" for e in student_entries(s))


# ----------------------------------------------------------------------------- 5) tutuq belgisi
def test_uz_apos_normalizes_only_in_word():
    assert uz_apos("Oʻqituvchi ta’lim yo‘q gʼalaba o`z") == "O'qituvchi ta'lim yo'q g'alaba o'z"
    assert uz_apos("‘iqtibos’ va «so‘z»") == "‘iqtibos’ va «so'z»"  # qo'shtirnoq sifatidagi belgi qoladi
    assert uz_apos("") == ""


class CurlyLLM(LLMProvider):
    name = "curly"

    async def complete_json(self, task, system, user, schema, ctx):
        if task == "turn":
            return {"speaker": "witness", "utterance_uz": "Men kassa yonida turgan edim, oʻsha kuni koʻrdim.",
                    "violation_id": "none", "rule_ids": [], "asked_hidden_fact": False, "advance_stage": False}
        return {"criteria": []}


def test_server_texts_use_one_apostrophe(monkeypatch):
    c = load_content(force=True)
    e = make_engine(lambda: c, CurlyLLM())
    seen = []
    orig = e.audio_ref

    async def spy(text, speaker):
        seen.append(text)
        return await orig(text, speaker)

    monkeypatch.setattr(e, "audio_ref", spy)
    s, _, _ = run(e.start(None, "Oʻktam", "talim"))
    run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    run(e.turn(s, "", action="motion_reject_question"))
    r = run(e.turn(s, "Guvoh, oʻsha paytda qayerda turgan edingiz?"))
    assert r["text_uz"] == "Men kassa yonida turgan edim, o'sha kuni ko'rdim."
    assert not any(CURLY_RX.search(x["text_uz"]) for x in r["record_delta"])
    assert "Men kassa yonida turgan edim, oʻsha kuni koʻrdim." in seen  # TTS asl matnni oldi
    res = run(finish_session(c, s, e.llm))
    html = res["bayonnoma_html"]
    assert "Ta'lim (ustoz bilan)" in html and not CURLY_RX.search(html)
    assert not any(CURLY_RX.search(x["text_uz"]) for x in res["record"])


def test_bayonnoma_has_no_curly_apostrophes_in_fixtures():
    c = load_fixtures()
    e = make_engine(lambda: c)
    s, _, _ = run(e.start(None, "Jasur", "talim"))
    html = bayonnoma_html(c, s, run(finish_session(c, s, e.llm))["rubric"])
    assert not CURLY_RX.search(html)
