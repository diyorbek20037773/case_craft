"""Prokuror guvoh identifikatsiyasini bo'rttirmasin: "tanigan" -> "«o'xshaydi» deb ko'rsatgan"."""
import asyncio

import pytest

from app.engine import soften_identification

O = "«o'xshaydi» deb ko'rsatgan"


@pytest.mark.parametrize("src, expected", [
    ("Guvoh uni fotosuratdan tanigan.", f"Guvoh uni fotosuratdan {O}."),
    ("Guvoh sudlanuvchini aniq tanigan.", f"Guvoh sudlanuvchini {O}."),
    ("Guvoh Rahimova uni shubhasiz tanidi.", f"Guvoh Rahimova uni {O}."),
    ("Sotuvchi uni fotosuratdan tanib olgan.", f"Sotuvchi uni fotosuratdan {O}."),
    ("Guvoh uni ishonch bilan tanib oldi.", f"Guvoh uni {O}."),
    ("Guvoh uni to‘liq taniganini aytdi.", f"Guvoh uni {O}ini aytdi."),
    ("Guvoh uni so’zsiz tanidi.", f"Guvoh uni {O}."),
    ("Guvoh uni Aniq Tanigan.", f"Guvoh uni {O}."),
])
def test_soften_identification(src, expected):
    assert soften_identification(src) == expected


@pytest.mark.parametrize("src", [
    "Tanib olish bayonnomasi ishda bor.",  # hujjat nomi, fe'l emas
    "Sudlanuvchi do'konni yaxshi tanigan.",  # guvoh identifikatsiyasi konteksti yo'q
    "Kassa cheki uning do'konda bo'lganini ko'rsatadi.",
])
def test_soften_leaves_other_text(src):
    assert soften_identification(src) == src


def test_prosecutor_reply_is_softened(content_engine):
    """Mock prokuror prosecutor_position_uz ("guvoh uni fotosuratdan tanigan") ni qisqartiradi — javobda bo'rttirish yo'q."""
    e = content_engine
    run = asyncio.run
    s, _, _ = run(e.start(None, "Test"))
    run(e.turn(s, "Hurmatli sud, tayyorman."))
    run(e.turn(s, "Guvoh, o'sha kuni qayerda turgan edingiz?"))
    run(e.turn(s, "Guvoh, erkakni qanday kiyimda ko'rdingiz?"))
    r = run(e.turn(s, "Hurmatli sud, savollarim tugadi."))
    assert r["stage_kind"] == "arguments"
    r = run(e.turn(s, "Hurmatli sud, videoyozuvda yuz ko'rinmaydi, noutbuk sudlanuvchidan topilmagan, shubhalar "
                      "sudlanuvchi foydasiga hal qilinadi."))
    assert r["speaker"] == "prosecutor", r
    low = r["text_uz"].lower()
    assert "tanigan" not in low and "tanidi" not in low
