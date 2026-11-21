"""«Dalilga tayanish»: talaba gaplarida nechta TURLI dalil tilga olinganini sanash (case.json dan yasalgan kalitlar)."""
import asyncio

import pytest

from app.content import load_content, load_fixtures
from app.report import deterministic_rubric, evidence_hits, evidence_stems
from conftest import make_engine

THREE = ("Hurmatli sud, ayblov dalillari sudlanuvchining aybini isbotlamaydi: guvoh ko'rsatuvi ishonchli emas, "
         "videoyozuv yuzni ko'rsatmaydi, noutbuk topilmagan, oqlashni so'rayman.")
NONE = ("Hurmatli sud, sudlanuvchi aybsiz, noutbuk masalasida ayblov isbotlanmagan, shubhalar sudlanuvchi "
        "foydasiga hal qilinadi, oqlashni so'rayman.")
ONE_MANY_WORDS = ("Kuzatuv kamerasidagi yozuvda yuz ko'rinmaydi, video sifati past, tasvir aniq emas, "
                  "videoyozuvdagi odam sudlanuvchini ko'rsatmaydi.")


def run(coro):
    return asyncio.run(coro)


@pytest.fixture(scope="module")
def stems():
    return evidence_stems(load_content(force=True))


def n(text, stems):
    return len(evidence_hits(text, stems))


def test_three_evidence_speech_counts_three(stems):
    assert n(THREE, stems) == 3


def test_no_evidence_speech_counts_zero(stems):
    assert n(NONE, stems) == 0
    # umumiy so'zlar dalil emas
    for t in ["Sudlanuvchi noutbukni olmagan.", "Do'konda hech kim ko'rmagan.", "Dalillar yetarli emas.",
              "Ayblov sudlanuvchining aybini ko'rsatmaydi."]:
        assert n(t, stems) == 0, t


def test_one_evidence_in_many_words_counts_one(stems):
    assert n(ONE_MANY_WORDS, stems) == 1
    assert n("Guvoh Rahimov ko'zoynak taqmagan, faqat «o'xshaydi» degan, tanib olish fotosuratdan bo'lgan.",
             stems) == 1


def test_apostrophe_variants_and_suffixes(stems):
    for t in ["Guvoh ko‘rsatuvi ishonchsiz.", "Guvoh koʻrsatuvi ishonchsiz.", "Guvoh ko`rsatuvi ishonchsiz.",
              "guvohning korsatuvida", "Guvohlarning gapi", "Rahimovning ko’zoynagi yo'q edi."]:
        assert n(t, stems) == 1, t
    assert n("Kassa chekida 19:15 yozilgan.", stems) == 1
    assert n("Chekka ko'ra u soat 19.15 da kabel olgan.", stems) == 1
    assert n("Inventarizatsiya dalolatnomasiga ko'ra qiymati 5 400 000 so'm.", stems) == 1
    assert n("Uyida tintuv o'tkazilgan, hech narsa topilmadi.", stems) == 1


def test_bare_kassa_is_not_receipt_evidence(stems):
    for t in ["Guvoh kassa yonida turgan.", "guvoh kassa yonida turgan", "Kassa peshtaxtasi oldida edi.",
              "U zaryadka kabeli olgan."]:
        assert "E4" not in evidence_hits(t, stems), t
    assert evidence_hits("Kassa cheki bor.", stems) == {"E4"}
    assert evidence_hits("Soat 19:15 da u do'konda edi.", stems) == {"E4"}


def test_defendant_testimony_is_separate_from_witness(stems):
    assert evidence_hits("Sudlanuvchining ko'rsatuvi izchil.", stems) == {"E5"}
    assert evidence_hits("Guvohning ko'rsatuvi va sudlanuvchining ko'rsatuvi bir-biriga zid.", stems) == {"E3", "E5"}


def test_fixture_case_keywords_built_from_its_own_material():
    st = evidence_stems(load_fixtures())
    assert len(evidence_hits("Guvoh ko'rsatmasi, videokamera yozuvi va telefon topilmagani.", st)) == 3
    assert len(evidence_hits(NONE, st)) == 0


def test_rubric_comment_counts_distinct_evidence():
    c = load_content(force=True)
    e = make_engine(lambda: c)
    s, _, _ = run(e.start(None, "Jasur", "majlis"))
    run(e.turn(s, "Hurmatli sud, iltimosim yo'q, tayyorman."))
    run(e.turn(s, "Savollarim tugadi."))
    run(e.turn(s, THREE))
    by = {k["id"]: k for k in deterministic_rubric(c, s)}
    assert by["dalilga_tayanish"]["comment_uz"].startswith("3 ta dalil"), by["dalilga_tayanish"]["comment_uz"]
    assert by["dalilga_tayanish"]["level"] == 2
