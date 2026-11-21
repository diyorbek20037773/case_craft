"""HTTP darajasida: /health, /case, /docs, CORS, start -> turn -> finish, xato holatlari."""
import base64

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.content import load_fixtures
from conftest import make_engine


@pytest.fixture
def client(monkeypatch):
    c = load_fixtures()
    monkeypatch.setattr(main, "engine", make_engine(lambda: c))
    with TestClient(main.app) as cl:
        yield cl


def test_health_docs_openapi(client):
    h = client.get("/health").json()
    assert h["ok"] and h["llm"] == "mock" and h["tts"] == "none" and h["stt"] == "none"
    assert client.get("/docs").status_code == 200
    paths = client.get("/openapi.json").json()["paths"]
    assert {"/session/start", "/turn", "/finish"} <= set(paths)


def test_case_hides_hidden_fact(client):
    body = client.get("/case").json()
    hidden = load_fixtures().case["witness"]["hidden_fact"]["text_uz"]
    assert hidden not in str(body) and "hidden_fact" not in body["case"]["witness"]
    assert body["rules"]["stages"] and all("verified" in a for a in body["rules"]["articles"])


@pytest.mark.parametrize("origin", ["http://localhost:5173", "https://sud-trenajyori.vercel.app",
                                    "https://sud-git-main-team.vercel.app"])
def test_cors_allowed(client, origin):
    r = client.options("/turn", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                         "Access-Control-Request-Headers": "content-type"})
    assert r.status_code == 200 and r.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_other_origin(client):
    r = client.options("/turn", headers={"Origin": "https://evil.example.com", "Access-Control-Request-Method": "POST"})
    assert r.headers.get("access-control-allow-origin") is None


def test_http_flow(client):
    st = client.post("/session/start", json={"case_id": "demo-ogirlik-001", "student_name": "Jasur"}).json()
    sid = st["session_id"]
    assert st["speaker"] == "judge" and st["stage_id"] == "tayyorlov" and st["audio_url"] is None
    assert len(st["stages"]) == 5 and st["disclaimer_uz"]

    def turn(text=None, **kw):
        r = client.post("/turn", json={"session_id": sid, "text": text, **kw})
        assert r.status_code == 200, r.text
        body = r.json()
        for k in ("speaker", "text_uz", "stage_id", "violation", "revealed_hidden_fact", "audio_url", "log_id"):
            assert k in body
        return body

    assert turn("Tayyormiz.")["stage_id"] == "sud_tergovi"
    assert turn("Guvoh, soat nechagacha ishladingiz?")["speaker"] == "witness"
    v = turn("U telefonni oldi, to'g'rimi?")["violation"]
    assert v["id"] == "yonaltiruvchi_savol" and v["article_ref"] and v["warning_uz"]
    assert turn("O'sha kuni ko'zoynak taqqanmidingiz?")["revealed_hidden_fact"] is True
    assert turn("Savollarim tugadi.")["stage_id"] == "muzokara"
    assert turn("Hurmatli sud, videoyozuvda vitrina ko'rinmaydi, oqlashni so'rayman.")["speaker"] == "prosecutor"

    fin = client.post("/finish", json={"session_id": sid}).json()
    assert fin["rubric"]["max"] == 8 and "<html" in fin["bayonnoma_html"]
    page = client.get(f"/session/{sid}/bayonnoma")
    assert page.status_code == 200 and "text/html" in page.headers["content-type"]
    assert "real sud qarori emas" in page.text
    state = client.get(f"/session/{sid}").json()
    assert state["witness_revealed"] and len(state["log"]) >= 13


def test_errors(client):
    assert client.post("/turn", json={"session_id": "nope", "text": "x"}).status_code == 404
    assert client.post("/session/start", json={"case_id": "boshqa-ish"}).status_code == 404
    sid = client.post("/session/start", json={}).json()["session_id"]
    r = client.post("/turn", json={"session_id": sid})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "empty"
    # STT sozlanmagan: audio yuborilsa 422 stt_failed (frontend matn kiritishga o'tadi)
    audio = "data:audio/webm;base64," + base64.b64encode(b"\x1aE\xdf\xa3fake").decode()
    r = client.post("/turn", json={"session_id": sid, "audio": audio})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "stt_failed"
    assert client.post("/finish", json={"session_id": "nope"}).status_code == 404


def test_deferred_tts_audio_url(monkeypatch, tmp_path):
    """deferred: /turn darhol javob beradi, audio /tts/<key>.mp3 so'ralganda yaratiladi va keshga tushadi."""
    from app.config import settings
    from app.providers.llm import MockLLM
    from app.providers.stt import NoSTT
    from app.providers.tts import TTSProvider
    from app.engine import Engine

    class FakeTTS(TTSProvider):
        name = "fake"
        calls = 0

        async def _generate(self, text, voice, out):
            FakeTTS.calls += 1
            out.write_bytes(b"ID3" + b"\0" * 6000)

    monkeypatch.setattr(settings, "tts_mode", "deferred")
    monkeypatch.setattr(settings, "cache_dir", tmp_path)
    c = load_fixtures()
    eng = Engine(lambda: c, MockLLM(), FakeTTS(tmp_path), NoSTT())
    monkeypatch.setattr(main, "engine", eng)
    with TestClient(main.app) as cl:
        st = cl.post("/session/start", json={}).json()
        assert "/tts/" in st["audio_url"] and FakeTTS.calls == 0  # hali yaratilmagan
        r = cl.get(st["audio_url"].replace("http://testserver", ""))
        assert r.status_code == 200 and r.headers["content-type"] == "audio/mpeg" and r.content[:3] == b"ID3"
        assert FakeTTS.calls == 1
        st2 = cl.post("/session/start", json={}).json()  # o'sha matn endi keshda -> statik /audio/
        assert "/audio/" in st2["audio_url"]
        r2 = cl.get(st2["audio_url"].replace("http://testserver", ""))
        assert r2.status_code == 200 and FakeTTS.calls == 1
        sid = st2["session_id"]
        t = cl.post("/turn", json={"session_id": sid, "text": "Tayyormiz."}).json()
        r3 = cl.get(t["audio_url"].replace("http://testserver", "") + "?stream=1")
        assert r3.status_code == 200 and r3.content[:3] == b"ID3"
        assert cl.get("/tts/doesnotexist.mp3").status_code == 404
        assert cl.get("/audio/..%2F.env").status_code == 404
