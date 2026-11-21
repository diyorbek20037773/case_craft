"""Testlar kalitsiz: mock LLM, TTS/STT o'chiq. .env dagi kalitlar testlarga ta'sir qilmaydi."""
import os
import sys
from pathlib import Path

os.environ.update({"LLM_PROVIDER": "mock", "TTS_PROVIDER": "none", "STT_PROVIDER": "none", "TTS_PREWARM": "0"})
SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

import pytest  # noqa: E402

from app.content import load_content, load_fixtures  # noqa: E402
from app.engine import Engine  # noqa: E402
from app.providers.llm import MockLLM  # noqa: E402
from app.providers.stt import NoSTT  # noqa: E402
from app.providers.tts import NoTTS  # noqa: E402
from app.config import settings  # noqa: E402


def make_engine(loader, llm=None) -> Engine:
    return Engine(loader, llm or MockLLM(), NoTTS(settings.cache_dir), NoSTT())


@pytest.fixture
def fixtures_engine() -> Engine:
    c = load_fixtures()
    return make_engine(lambda: c)


@pytest.fixture
def content_engine() -> Engine:
    c = load_content(force=True)
    return make_engine(lambda: c)
