"""Guvoh erkak (3D model bilan mos): ovoz Sardor, boshqa Sardor rollaridan farqli; LLM warm-up jim o'tadi."""
import asyncio

from app import main
from app.content import load_content
from app.providers.llm import LLMProvider, MockLLM
from app.providers.tts import VOICES, voice_for


def test_witness_is_male_voice_and_distinct():
    assert voice_for("witness")["voice"] == "uz-UZ-SardorNeural"
    assert voice_for("clerk")["voice"] == "uz-UZ-MadinaNeural"
    sardor = [(r, (v["rate"], v["pitch"])) for r, v in VOICES.items() if v["voice"] == "uz-UZ-SardorNeural"]
    profiles = [p for _, p in sardor]
    assert len(set(profiles)) == len(profiles), sardor  # sudya/prokuror/guvoh/sudlanuvchi bir xil eshitilmasin


def test_case_witness_name_and_no_overstated_identification():
    case = load_content(force=True).case
    w = case["witness"]
    assert w["name"] == "Mansur Rahimov"
    blob = " ".join([case["summary_uz"], case["prosecutor_position_uz"], case["defense_brief_uz"],
                     w["hidden_fact"]["text_uz"], *case["facts_uz"]]).lower()
    assert "madina" not in blob and "rahimova" not in blob
    assert "tanigan" not in blob and "tanidi" not in blob
    assert "kulrang" not in blob


class _Boom(LLMProvider):
    name = "boom"

    def __init__(self):
        self.calls = 0

    async def complete_json(self, *a, **k):
        self.calls += 1
        raise RuntimeError("tarmoq yo'q")


def test_llm_warmup_silent_on_error(monkeypatch):
    fake = _Boom()
    monkeypatch.setattr(main.engine, "llm", fake)
    monkeypatch.setitem(main._llm_warm, "state", "idle")

    async def go():
        main._kick_llm_warmup()
        await main._llm_warm["task"]

    asyncio.run(go())
    assert fake.calls == 1 and main._llm_warm["state"] == "failed"


def test_llm_warmup_skipped_for_mock(monkeypatch):
    monkeypatch.setattr(main.engine, "llm", MockLLM())
    monkeypatch.setitem(main._llm_warm, "state", "idle")
    monkeypatch.setitem(main._llm_warm, "task", None)
    main._kick_llm_warmup()  # event loop siz ham xato bermasligi kerak: mock da vazifa yaratilmaydi
    assert main._llm_warm["task"] is None
