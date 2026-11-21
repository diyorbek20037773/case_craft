"""Gemini kalitlar navbati: soxta HTTP (httpx.MockTransport) bilan, internet kerak emas."""
import asyncio
import json
import logging

import httpx
import pytest

from app.config import load_gemini_keys, settings
from app.providers.llm import GeminiLLM, call_with_fallback

K1, K2, K3 = "AIza" + "a" * 35, "AQ." + "b" * 50, "AIza" + "c" * 35
SCHEMA = {"type": "object", "properties": {"utterance_uz": {"type": "string"}}}
CTX = {"stage_kind": "opening", "student_text": "tayyorman", "case": {}}


def ok(text: str = "salom") -> httpx.Response:
    body = {"candidates": [{"content": {"parts": [{"text": json.dumps({"utterance_uz": text})}]},
                            "finishReason": "STOP"}]}
    return httpx.Response(200, json=body)


def err(code: int, status: str, msg: str = "x", reason: str | None = None) -> httpx.Response:
    e = {"code": code, "status": status, "message": msg}
    if reason:
        e["details"] = [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": reason}]
    return httpx.Response(code, json={"error": e})


async def timeout(request: httpx.Request) -> httpx.Response:
    """Darhol timeout (real kutishsiz): GeminiLLM uni "timeout" transient xatosi sifatida ko'radi — deterministik."""
    raise httpx.ReadTimeout("soxta timeout", request=request)


INVALID = dict(code=400, status="INVALID_ARGUMENT", msg="API key not valid. Please pass a valid API key.",
               reason="API_KEY_INVALID")


class Fake:
    """Har kalit uchun javoblar navbati; so'rovlar (kalit yorlig'i, model, generationConfig) yoziladi."""

    def __init__(self, plan: dict[str, list]):
        self.plan = plan
        self.calls: list[tuple[str, str, dict]] = []
        self.names = {K1: "k1", K2: "k2", K3: "k3"}

    async def __call__(self, request: httpx.Request) -> httpx.Response:
        who = self.names[request.headers["x-goog-api-key"]]
        model = request.url.path.rsplit("/", 1)[-1].split(":")[0]
        self.calls.append((who, model, json.loads(request.content)["generationConfig"]))
        queue = self.plan[who]
        step = queue.pop(0) if len(queue) > 1 else queue[0]
        if callable(step):
            return await step(request)
        return step


def make(plan, keys=(K1, K2), model="m-main", fallback=()):
    fake = Fake(plan)
    llm = GeminiLLM([(f"#{i + 1}", k) for i, k in enumerate(keys)], model, list(fallback),
                    transport=httpx.MockTransport(fake))
    return llm, fake


def run(llm, task="turn"):
    return asyncio.run(call_with_fallback(llm, task, "sys", "user", SCHEMA, CTX))


def who(fake):
    return [c[0] for c in fake.calls]


def test_invalid_key_skipped_and_marked_dead():
    llm, fake = make({"k1": [err(**INVALID)], "k2": [ok("ikkinchi")]})
    res, provider, fell_back = run(llm)
    assert (res["utterance_uz"], provider, fell_back) == ("ikkinchi", "gemini", False)
    assert who(fake) == ["k1", "k2"]
    assert llm.last_key == "#2"
    run(llm)  # o'lik kalit sessiya davomida qayta sinalmaydi
    assert who(fake) == ["k1", "k2", "k2"]
    assert llm.key_status()[0]["state"] == "dead"


def test_403_marks_key_dead():
    llm, fake = make({"k1": [err(403, "PERMISSION_DENIED")], "k2": [ok()]})
    assert run(llm)[1] == "gemini"
    run(llm)
    assert who(fake) == ["k1", "k2", "k2"]


def test_429_moves_on_and_retries_after_cooldown():
    clock = [1000.0]
    llm, fake = make({"k1": [err(429, "RESOURCE_EXHAUSTED"), ok("birinchi")], "k2": [ok("ikkinchi")]})
    llm._now = lambda: clock[0]
    assert run(llm)[0]["utterance_uz"] == "ikkinchi"
    assert llm.key_status()[0]["state"] == "cooldown"
    run(llm)
    assert who(fake) == ["k1", "k2", "k2"]  # 60 s ichida #1 sinalmaydi
    clock[0] += 61
    llm._current = 0  # navbat boshiga qaytamiz: #1 yana sinaladi
    assert run(llm)[0]["utterance_uz"] == "birinchi"
    assert who(fake)[-1] == "k1"


def test_resource_exhausted_status_without_429_code():
    llm, fake = make({"k1": [err(400, "RESOURCE_EXHAUSTED", "quota")], "k2": [ok()]})
    assert run(llm)[1] == "gemini"
    assert llm.key_status()[0]["state"] == "cooldown"


def test_all_keys_fail_falls_back_to_mock():
    llm, fake = make({"k1": [err(**INVALID)], "k2": [err(403, "PERMISSION_DENIED")]})
    res, provider, fell_back = run(llm)
    assert provider == "mock" and fell_back is True
    assert res["utterance_uz"]  # mock javobi
    run(llm)  # ikkala kalit o'lik: tarmoqqa chiqmasdan mock
    assert who(fake) == ["k1", "k2"]


def test_timeout_tries_next_key_once(monkeypatch):
    monkeypatch.setattr(settings, "llm_timeout_s", 1.0)

    slow = timeout

    llm, fake = make({"k1": [slow], "k2": [ok("tez")]})
    assert run(llm)[0]["utterance_uz"] == "tez"
    assert who(fake) == ["k1", "k2"]


def test_second_timeout_gives_mock(monkeypatch):
    monkeypatch.setattr(settings, "llm_timeout_s", 1.0)

    slow = timeout

    llm, fake = make({"k1": [slow], "k2": [slow], "k3": [ok()]}, keys=(K1, K2, K3))
    res, provider, fell_back = run(llm)
    assert provider == "mock" and fell_back
    assert who(fake) == ["k1", "k2"]  # timeoutdan keyin faqat bitta qayta urinish


def test_503_switches_to_fallback_model_and_remembers():
    llm, fake = make({"k1": [err(503, "UNAVAILABLE")]}, keys=(K1,), fallback=("m-lite",))
    fake.plan["k1"] = [err(503, "UNAVAILABLE"), ok("lite")]
    assert run(llm)[0]["utterance_uz"] == "lite"
    assert [c[1] for c in fake.calls] == ["m-main", "m-lite"]
    run(llm)  # asosiy model 60 s chetda
    assert [c[1] for c in fake.calls][-1] == "m-lite"


def test_404_model_uses_fallback_model():
    llm, fake = make({"k1": [err(404, "NOT_FOUND"), ok("bor")]}, keys=(K1,), fallback=("m-lite",))
    assert run(llm)[0]["utterance_uz"] == "bor"
    assert llm.model == "m-lite"


def test_unsupported_config_degrades_variant_and_learns():
    llm, fake = make({"k1": [err(400, "INVALID_ARGUMENT", "Thinking budget is not supported"), ok("v2")]},
                     keys=(K1,))
    assert run(llm)[0]["utterance_uz"] == "v2"
    assert "thinkingConfig" in fake.calls[0][2] and fake.calls[0][2]["thinkingConfig"] == {"thinkingBudget": 0}
    assert fake.calls[1][2]["thinkingConfig"] != {"thinkingBudget": 0}
    run(llm)  # keyingi chaqiruv o'rganilgan variantdan boshlanadi
    assert fake.calls[2][2] == fake.calls[1][2]
    assert llm.key_status()[0]["state"] == "ok"  # kalit o'lik deb belgilanmagan


def test_logs_never_contain_key_values(caplog):
    caplog.set_level(logging.DEBUG)
    llm, _ = make({"k1": [err(**INVALID)], "k2": [err(429, "RESOURCE_EXHAUSTED")], "k3": [ok()]},
                  keys=(K1, K2, K3))
    run(llm)
    text = caplog.text
    assert "gemini key #3 ishlatildi" in text
    for k in (K1, K2, K3):
        assert k not in text


def test_load_gemini_keys_strips_skips_and_dedupes(caplog):
    broken = "AIza" + "z" * 100 + " " + "y" * 148  # 253 belgi, bo'shliqli
    env = {
        "GEMINI_API_KEY": broken,
        "GEMINI_API_KEY2": f"  {K2}  ",
        "GEMINI_API_KEY3": f'"{K3}"',
        "GEMINI_API_KEY4": "   ",
        "GEMINI_API_KEY10": K1,
        "GEMINI_API_KEYS": f" {K1} , ,{K2},{'q' * 200}",
    }
    with caplog.at_level(logging.WARNING):
        keys = load_gemini_keys(env)
    assert keys == [("#2", K2), ("#3", K3), ("#10", K1)]
    assert "GEMINI_API_KEY noto'g'ri formatda" in caplog.text
    assert "GEMINI_API_KEYS[4]" in caplog.text
    assert broken not in caplog.text and "z" * 20 not in caplog.text


def test_load_gemini_keys_order_and_empty():
    assert load_gemini_keys({}) == []
    assert load_gemini_keys({"GEMINI_API_KEY3": K3, "GEMINI_API_KEY": K1}) == [("#1", K1), ("#3", K3)]


@pytest.mark.parametrize("value", ["short", "a b" * 15, "кирилл" * 5])
def test_malformed_single_key_is_rejected(value):
    assert load_gemini_keys({"GEMINI_API_KEY": value}) == []


def test_daily_quota_429_uses_retry_delay_and_fallback_model_with_same_key():
    clock = [0.0]
    daily = httpx.Response(429, json={"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "quota",
                                                "details": [
        {"@type": "type.googleapis.com/google.rpc.QuotaFailure",
         "violations": [{"quotaId": "GenerateRequestsPerDayPerProjectPerModel-FreeTier", "quotaValue": "20"}]},
        {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": "48343s"}]}})

    async def by_model(request):
        return daily if "m-main" in request.url.path else ok("lite")

    llm, fake = make({"k1": [by_model]}, keys=(K1,), fallback=("m-lite",))
    llm._now = lambda: clock[0]
    assert run(llm)[0]["utterance_uz"] == "lite"  # limit loyiha+model bo'yicha: zaxira modelda o'sha kalit ishlaydi
    assert [c[1] for c in fake.calls] == ["m-main", "m-lite"]
    clock[0] += 120  # 60 s dan ko'p, lekin retryDelay (1 soatgacha cheklangan) hali tugamagan
    run(llm)
    assert [c[1] for c in fake.calls][-1] == "m-lite" and len(fake.calls) == 3
    assert llm.key_status("m-main")[0]["state"] == "cooldown"
    assert llm.key_status("m-lite")[0]["state"] == "ok"


def test_503_single_model_retries_next_key_once():
    llm, fake = make({"k1": [err(503, "UNAVAILABLE")], "k2": [ok("k2 javob")]})
    assert run(llm)[0]["utterance_uz"] == "k2 javob"
    assert who(fake) == ["k1", "k2"]
    llm2, fake2 = make({"k1": [err(503, "UNAVAILABLE")], "k2": [err(500, "INTERNAL")], "k3": [ok()]}, keys=(K1, K2, K3))
    assert run(llm2)[1] == "mock"
    assert who(fake2) == ["k1", "k2"]


def test_timeout_with_fallback_model_uses_next_key_and_fallback_model(monkeypatch):
    monkeypatch.setattr(settings, "llm_timeout_s", 1.0)

    slow = timeout

    async def k2(request):
        return ok("k2-lite") if "m-lite" in request.url.path else await slow(request)

    llm, fake = make({"k1": [slow], "k2": [k2]}, fallback=("m-lite",))
    assert run(llm)[0]["utterance_uz"] == "k2-lite"
    assert [(c[0], c[1]) for c in fake.calls] == [("k1", "m-main"), ("k2", "m-lite")]
    assert llm.key_status("m-main")[0]["state"] == "ok"  # timeout kalitni o'ldirmaydi


def test_two_timeouts_in_a_row_park_primary_model(monkeypatch):
    monkeypatch.setattr(settings, "llm_timeout_s", 1.0)

    async def by_model(request):
        if "m-main" in request.url.path:
            return await timeout(request)
        return ok("lite")

    llm, fake = make({"k1": [by_model], "k2": [by_model]}, fallback=("m-lite",))
    run(llm)
    run(llm)  # ikkinchi ketma-ket timeout -> asosiy model 60 s chetda
    n = len(fake.calls)
    assert run(llm)[0]["utterance_uz"] == "lite"
    assert [c[1] for c in fake.calls[n:]] == ["m-lite"]


def test_fallback_models_default_when_env_missing(monkeypatch):
    from app.config import Settings

    monkeypatch.delenv("GEMINI_FALLBACK_MODELS", raising=False)
    assert Settings().gemini_fallback_models == ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"]
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", "")
    assert Settings().gemini_fallback_models == []
    monkeypatch.setenv("GEMINI_FALLBACK_MODELS", " a , ,b ")
    assert Settings().gemini_fallback_models == ["a", "b"]
