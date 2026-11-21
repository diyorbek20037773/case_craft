"""/stt: Gemini flash-lite audio STT (soxta HTTP bilan), 422 holatlari, audio saqlanmasligi."""
import asyncio
import base64
import json

import httpx
import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.config import settings
from app.content import load_fixtures
from app.providers.llm import GeminiLLM
from app.providers.stt import GeminiSTT, STTError, STTProvider, normalize_mime
from conftest import make_engine

KEY = "AIza" + "s" * 35
AUDIO = b"ID3" + b"\x00" * 400


def gemini_ok(text):
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps({"text_uz": text})}]}, "finishReason": "STOP"}]}
    return httpx.Response(200, json=body)


def make_stt(handler):
    calls = []

    async def h(request):
        calls.append(request)
        return await handler(request) if asyncio.iscoroutinefunction(handler) else handler(request)

    llm = GeminiLLM([("#1", KEY)], "m-main", [], transport=httpx.MockTransport(h))
    return GeminiSTT(llm, vocabulary=["Mansur Rahimov"]), calls


def test_gemini_stt_sends_inline_audio_and_returns_text():
    stt, calls = make_stt(lambda r: gemini_ok("Siz uning yuzini ko'rdingizmi?"))
    text = asyncio.run(stt.transcribe(AUDIO, "audio/webm;codecs=opus"))
    assert text == "Siz uning yuzini ko'rdingizmi?"
    req = calls[0]
    assert KEY not in str(req.url) and req.headers["x-goog-api-key"] == KEY
    payload = json.loads(req.content)
    parts = payload["contents"][0]["parts"]
    inline = parts[1]["inline_data"]
    assert inline["mime_type"] == "audio/webm" and base64.b64decode(inline["data"]) == AUDIO
    assert "so'zma-so'z" in payload["systemInstruction"]["parts"][0]["text"].lower()
    assert "Mansur Rahimov" in parts[0]["text"]
    assert payload["generationConfig"]["temperature"] == 0.0


@pytest.mark.parametrize("raw,want", [("audio/mpeg", "audio/mp3"), ("audio/ogg;codecs=opus", "audio/ogg"),
                                      ("audio/x-wav", "audio/wav"), (None, "audio/webm")])
def test_mime_normalization(raw, want):
    assert normalize_mime(raw) == want


def test_gemini_stt_empty_text_is_error():
    stt, _ = make_stt(lambda r: gemini_ok("   "))
    with pytest.raises(STTError):
        asyncio.run(stt.transcribe(AUDIO, "audio/mp3"))


def test_gemini_stt_http_error_is_stterror(monkeypatch):
    monkeypatch.setattr(settings, "llm_timeout_s", 1.0)
    stt, _ = make_stt(lambda r: httpx.Response(403, json={"error": {"code": 403, "status": "PERMISSION_DENIED"}}))
    with pytest.raises(STTError):
        asyncio.run(stt.transcribe(AUDIO, "audio/mp3"))


def test_gemini_stt_too_short_audio():
    stt, calls = make_stt(lambda r: gemini_ok("x"))
    with pytest.raises(STTError):
        asyncio.run(stt.transcribe(b"abc", "audio/webm"))
    assert calls == []


class FakeSTT(STTProvider):
    name = "fake"
    available = True

    def __init__(self, text=None):
        self.text, self.seen = text, []

    async def transcribe(self, audio, mime="audio/webm"):
        self.seen.append((len(audio), mime))
        if self.text is None:
            raise STTError("Ovoz tanilmadi.")
        return self.text


@pytest.fixture
def client(monkeypatch):
    c = load_fixtures()
    eng = make_engine(lambda: c)
    monkeypatch.setattr(main, "engine", eng)
    with TestClient(main.app) as cl:
        yield cl, eng


def b64(data=AUDIO, mime="audio/webm"):
    return f"data:{mime};base64," + base64.b64encode(data).decode()


def test_stt_endpoint_not_configured_returns_422(client):
    cl, _ = client
    r = cl.post("/stt", json={"audio_b64": b64(), "mime": "audio/webm"})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "stt_failed"


def test_stt_endpoint_bad_audio(client):
    cl, _ = client
    r = cl.post("/stt", json={"audio_b64": base64.b64encode(b"xy").decode()})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "bad_audio"
    assert cl.post("/stt", json={}).status_code == 422


def test_stt_endpoint_with_provider(client, tmp_path):
    cl, eng = client
    eng.stt = FakeSTT("Siz uning yuzini ko'rdingizmi?")
    before = set(settings.cache_dir.iterdir())
    r = cl.post("/stt", json={"audio_b64": b64(mime="audio/ogg"), "mime": "audio/ogg"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text_uz"] == "Siz uning yuzini ko'rdingizmi?" and isinstance(body["ms"], int) and body["ms"] >= 0
    assert eng.stt.seen == [(len(AUDIO), "audio/ogg")]
    assert set(settings.cache_dir.iterdir()) == before  # audio diskka yozilmadi
    # mime berilmasa data: prefiksidan olinadi
    cl.post("/stt", json={"audio_b64": b64(mime="audio/mp3")})
    assert eng.stt.seen[-1][1] == "audio/mp3"


def test_stt_endpoint_provider_failure_returns_422(client):
    cl, eng = client
    eng.stt = FakeSTT(None)
    r = cl.post("/stt", json={"audio_b64": b64()})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "stt_failed"
