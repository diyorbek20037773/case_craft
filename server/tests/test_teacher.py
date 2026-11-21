"""O'qituvchi paneli (R14): PIN, sessiyalar ro'yxati, rubrika, tasdiq -> bayonnoma qatori."""
import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.content import load_fixtures
from conftest import make_engine

PIN = {"x-teacher-pin": "1234"}


@pytest.fixture
def client(monkeypatch):
    c = load_fixtures()
    monkeypatch.setattr(main, "engine", make_engine(lambda: c))
    monkeypatch.setattr(main.settings, "teacher_pin", "1234")
    with TestClient(main.app) as cl:
        yield cl


def test_pin_required(client):
    assert client.get("/teacher/sessions").status_code == 401
    r = client.get("/teacher/sessions", headers={"x-teacher-pin": "0000"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "bad_pin"
    assert client.get("/teacher/sessions/nope", headers={"x-teacher-pin": "x"}).status_code == 401
    assert client.post("/teacher/sessions/nope/approve", json={"teacher_name": "A"}).status_code == 401


def test_empty_list(client):
    body = client.get("/teacher/sessions", headers=PIN).json()
    assert body["sessions"] == [] and body["count"] == 0


def test_list_active_then_finished(client):
    sid = client.post("/session/start", json={"mode": "talim", "student_name": "Aziza"}).json()["session_id"]
    anon = client.post("/session/start", json={"mode": "majlis"}).json()["session_id"]
    items = {x["id"]: x for x in client.get("/teacher/sessions", headers=PIN).json()["sessions"]}
    assert set(items) == {sid, anon}
    a = items[sid]
    assert a["student_name"] == "Aziza" and a["mode"] == "talim" and a["status"] == "active"
    assert a["status_uz"] == "davom etmoqda" and a["score"] is None and a["violations"] == 0
    assert a["hints_used"] == 0 and a["trap_caught"] is None and a["approval"] is None and a["started_at"]
    assert items[anon]["student_name"] == "Talaba" and items[anon]["mode"] == "majlis"

    client.post("/turn", json={"session_id": sid, "action": "hint"})
    fin = client.post("/finish", json={"session_id": sid}).json()
    a = {x["id"]: x for x in client.get("/teacher/sessions", headers=PIN).json()["sessions"]}[sid]
    assert a["status"] == "finished" and a["status_uz"] == "yakunlangan"
    assert a["score"] == fin["rubric"]["total"] and a["max"] == fin["rubric"]["max"] and a["hints_used"] == 1


def test_detail_rubric_and_link(client):
    sid = client.post("/session/start", json={"mode": "majlis", "student_name": "Bek"}).json()["session_id"]
    d = client.get(f"/teacher/sessions/{sid}", headers=PIN).json()
    assert d["rubric_final"] is False and d["rubric"]["criteria"] and d["status"] == "active"
    assert d["bayonnoma_url"].endswith(f"/session/{sid}/bayonnoma")
    fin = client.post("/finish", json={"session_id": sid}).json()
    d = client.get(f"/teacher/sessions/{sid}", headers=PIN).json()
    assert d["rubric_final"] is True and d["rubric"]["total"] == fin["rubric"]["total"]
    assert client.get("/teacher/sessions/nope", headers=PIN).status_code == 404


def test_approve_adds_line_to_bayonnoma(client):
    sid = client.post("/session/start", json={"mode": "majlis", "student_name": "Bek"}).json()["session_id"]
    client.post("/finish", json={"session_id": sid})
    before = client.get(f"/session/{sid}/bayonnoma").text
    assert "O'qituvchi tasdiqladi" not in before and "O'qituvchi tasdig'i" in before
    r = client.post(f"/teacher/sessions/{sid}/approve", headers=PIN,
                    json={"teacher_name": "Karimova D.", "comment": "Yaxshi <b>ish</b>"})
    assert r.status_code == 200
    ap = r.json()["approval"]
    assert ap["teacher_name"] == "Karimova D." and ap["approved_at"] and r.json()["session"]["approval"] == ap
    html = client.get(f"/session/{sid}/bayonnoma").text
    assert "O'qituvchi tasdiqladi:</b> Karimova D." in html and "Yaxshi &lt;b&gt;ish&lt;/b&gt;" in html
    # /finish qayta chaqirilsa ham tasdiq saqlanadi
    assert "O'qituvchi tasdiqladi" in client.post("/finish", json={"session_id": sid}).json()["bayonnoma_html"]
    items = client.get("/teacher/sessions", headers=PIN).json()["sessions"]
    assert items[0]["approval"]["teacher_name"] == "Karimova D."


def test_approve_unfinished_session_finishes_first(client):
    sid = client.post("/session/start", json={"mode": "talim"}).json()["session_id"]
    r = client.post(f"/teacher/sessions/{sid}/approve", headers=PIN, json={"teacher_name": "Ali"})
    assert r.status_code == 200 and r.json()["session"]["score"] is not None
    assert "O'qituvchi tasdiqladi:</b> Ali" in client.get(f"/session/{sid}/bayonnoma").text


def test_approve_validation(client):
    sid = client.post("/session/start", json={"mode": "majlis"}).json()["session_id"]
    assert client.post(f"/teacher/sessions/{sid}/approve", headers=PIN, json={"teacher_name": "  "}).status_code == 422
    assert client.post(f"/teacher/sessions/{sid}/approve", headers=PIN, json={}).status_code == 422
    assert client.post("/teacher/sessions/nope/approve", headers=PIN, json={"teacher_name": "A"}).status_code == 404
