"""LLM provayderlari: gemini | anthropic | mock.

Hamma provayder bitta interfeysga ega: complete_json(task, system, user, schema, ctx) -> dict.
Mock kalitsiz va deterministik — testlar va demo zaxirasi uchun.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from typing import Any

from ..config import settings
from ..textutil import contains_any, norm, truncate_words, words

log = logging.getLogger("llm")


def task_budget_factor(task: str) -> float:
    return {"rubric": 3.0, "stt": 1.5}.get(task, 1.0)


class LLMProvider:
    name = "base"

    async def complete_json(self, task: str, system: str, user: str, schema: dict, ctx: dict) -> dict:
        raise NotImplementedError


# ----------------------------------------------------------------------------- mock
class MockLLM(LLMProvider):
    """Deterministik javoblar. Kontekst (ctx) dan bosqich turi, ish va talaba gapini oladi."""

    name = "mock"

    async def complete_json(self, task: str, system: str, user: str, schema: dict, ctx: dict) -> dict:
        if task == "turn":
            return self._turn(ctx)
        if task == "rubric":
            return {"criteria": []}  # bo'sh: kod deterministik rubrikani ishlatadi
        return {}

    @staticmethod
    def _turn(ctx: dict) -> dict:
        kind: str = ctx["stage_kind"]
        text: str = ctx["student_text"]
        case: dict = ctx["case"]
        out = {"speaker": "judge", "utterance_uz": "", "violation_id": "none", "rule_ids": [],
               "asked_hidden_fact": False, "advance_stage": False}
        t = norm(text)

        if kind == "opening":
            out["utterance_uz"] = "Himoyachining arizasi qabul qilindi. Sud tergoviga o'tishga tayyormisiz?"
            out["advance_stage"] = "tayyor" in t
            return out

        if kind == "questioning":
            witness = case.get("witness", {})
            hidden = witness.get("hidden_fact", {})
            asks = "?" in text or bool(re.search(r"\b\w+(mi|misiz|dingizmi|asizmi)\b", t))
            if asks and contains_any(text, hidden.get("reveal_keywords", [])):
                out.update(speaker="witness", asked_hidden_fact=True, utterance_uz="...")
                return out
            if asks:
                facts = witness.get("public_facts_uz", [])
                q = set(w for w in words(text) if len(w) > 3)
                best, score = None, 0
                for f in facts:
                    s = len(q & set(w for w in words(f) if len(w) > 3))
                    if s > score:
                        best, score = f, s
                if best is None and facts:
                    best = facts[ctx.get("witness_answers", 0) % len(facts)]
                out.update(speaker="witness", utterance_uz=best or "Bu haqda aniq bir narsa ayta olmayman.")
                return out
            if "ruxsat" in t:
                out["utterance_uz"] = "Ruxsat beriladi. Himoyachi, guvohga savolingizni bering."
                return out
            out["utterance_uz"] = "Himoyachi, guvohga savolingizni aniq bering."
            return out

        if kind == "arguments":
            if not ctx.get("prosecutor_replied"):
                pos = re.sub(r"^[^:.]{0,30}:\s*", "", case.get("prosecutor_position_uz") or "Ayblov o'z kuchida qoladi.")
                out.update(speaker="prosecutor", utterance_uz=truncate_words(pos[:1].upper() + pos[1:], 25))
                return out
            out.update(utterance_uz="Taraflarning muzokara nutqlari tinglandi.", advance_stage=True)
            return out

        if kind == "last_word":
            out.update(utterance_uz="Sudlanuvchiga oxirgi so'z berildi.", advance_stage=True)
            return out

        out["utterance_uz"] = "Sud sizni eshitdi."
        return out


# ----------------------------------------------------------------------------- gemini
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
KEY_COOLDOWN_S = 60.0    # 429 / RESOURCE_EXHAUSTED: kalit (shu model uchun) kamida shuncha dam oladi
KEY_COOLDOWN_MAX_S = 3600.0  # Google retryDelay (kunlik limitda soatlab) shu bilan cheklanadi
MODEL_COOLDOWN_S = 60.0  # 5xx (model band): zaxira model bo'lsa asosiysi shuncha chetga qo'yiladi
FIRST_TRY_SHARE = 0.6    # birinchi urinishga budjetning ulushi; qolgani timeout/5xx dan keyingi bitta urinishga


class _GeminiFail(Exception):
    """kind: key_dead | key_rate | model_gone | transient | bad_request | bad_output. detail da kalit qiymati yo'q."""

    def __init__(self, kind: str, detail: str, retry_s: float = 0.0):
        super().__init__(f"{kind}: {detail}")
        self.kind, self.detail, self.retry_s = kind, detail, retry_s


def _retry_info(details: list) -> tuple[float, str]:
    """429 tafsilotlaridan (retryDelay soniyada, kunlik limitmi)."""
    retry, per_day = 0.0, False
    for d in details:
        if not isinstance(d, dict):
            continue
        m = re.fullmatch(r"(\d+(?:\.\d+)?)s", str(d.get("retryDelay", "")))
        if m:
            retry = float(m.group(1))
        for v in d.get("violations", []) or []:
            if isinstance(v, dict) and "PerDay" in str(v.get("quotaId", "")):
                per_day = True
    return retry, " (kunlik limit)" if per_day else ""


def _classify_error(status: int, body: Any) -> _GeminiFail:
    err = body.get("error", {}) if isinstance(body, dict) else {}
    err = err if isinstance(err, dict) else {}
    st = str(err.get("status", ""))
    msg = str(err.get("message", ""))[:120]
    reasons = {str(d.get("reason", "")) for d in err.get("details", []) or [] if isinstance(d, dict)}
    detail = f"http {status} {st}".strip()
    low = msg.lower()
    bad_key_msg = "api key" in low and any(w in low for w in ("not valid", "invalid", "expired"))
    if "API_KEY_INVALID" in reasons or bad_key_msg:
        return _GeminiFail("key_dead", f"{detail} API_KEY_INVALID")
    if status in (401, 403):
        return _GeminiFail("key_dead", detail)
    if status == 429 or st == "RESOURCE_EXHAUSTED":
        retry, note = _retry_info(err.get("details", []) or [])
        return _GeminiFail("key_rate", detail + note, retry)
    if status == 404:
        return _GeminiFail("model_gone", detail)
    if status == 400:
        return _GeminiFail("bad_request", f"{detail} {msg}")
    return _GeminiFail("transient", detail)


class GeminiLLM(LLMProvider):
    """Gemini REST (v1beta generateContent) + kalitlar navbati.

    - 400 API_KEY_INVALID / 401 / 403 -> kalit sessiya (jarayon) davomida "o'lik", keyingisiga o'tiladi;
    - 429 / RESOURCE_EXHAUSTED -> keyingi kalit; eskisi shu model uchun KEY_COOLDOWN_S (yoki Google retryDelay,
      ko'pi bilan KEY_COOLDOWN_MAX_S) dan keyin qayta sinaladi. Free tier limiti loyiha+model bo'yicha, shuning
      uchun boshqa (zaxira) modelda o'sha kalit ishlatilaveradi;
    - timeout / 5xx -> keyingi kalit (zaxira model bo'lsa — o'sha model) bilan faqat bir marta; 5xx yoki ketma-ket
      2 timeoutdan keyin asosiy model MODEL_COOLDOWN_S chetga qo'yiladi (zaxira model bo'lsa);
    - 404 (model yo'q) -> zaxira model (GEMINI_FALLBACK_MODELS);
    - 400 boshqa (masalan thinking sozlamasi qo'llanmaydi) -> soddaroq so'rov varianti, model uchun eslab qolinadi.
    Hammasi ishlamasa RuntimeError — call_with_fallback mock ga o'tadi. Kalit qiymati hech qayerga yozilmaydi.
    """

    name = "gemini"
    self_timed = True  # vaqt budjetini o'zi boshqaradi (timeoutdan keyin qayta urinish uchun)

    def __init__(self, keys: list[tuple[str, str]] | list[str], model: str,
                 fallback_models: list[str] | tuple[str, ...] = (), transport: Any = None,
                 base_url: str = GEMINI_BASE):
        self._keys: list[tuple[str, str]] = [k if isinstance(k, tuple) else (f"#{i + 1}", k)
                                             for i, k in enumerate(keys)]
        if not self._keys:
            raise ValueError("Gemini kaliti yo'q")
        self.models: list[str] = list(dict.fromkeys(m for m in [model, *fallback_models] if m))
        self._transport = transport
        self._base = base_url.rstrip("/")
        self._client: Any = None
        self._client_loop: Any = None
        self._now = time.monotonic  # testlar almashtiradi
        self._dead: set[int] = set()
        self._cool: dict[tuple[int, str], float] = {}  # (kalit, model) -> qachongacha dam
        self._dead_models: set[str] = set()
        self._model_cool: dict[str, float] = {}
        self._model_timeouts: dict[str, int] = {}  # ketma-ket timeoutlar; 2 ta bo'lsa model 60 s chetga
        self._variant_start: dict[str, int] = {}
        self._current = 0
        self._last_used: tuple[str, int] | None = None

    # -- holat
    @property
    def model(self) -> str:
        return self._last_used[0] if self._last_used else self.models[0]

    @property
    def key_labels(self) -> list[str]:
        return [label for label, _ in self._keys]

    @property
    def last_key(self) -> str | None:
        return self._keys[self._last_used[1]][0] if self._last_used else None

    def key_status(self, model: str | None = None) -> list[dict]:
        now, model = self._now(), model or self.models[0]
        return [{"key": label,
                 "state": "dead" if i in self._dead else "cooldown" if self._cool.get((i, model), 0) > now else "ok"}
                for i, (label, _) in enumerate(self._keys)]

    def _keys_now(self, model: str) -> list[int]:
        now, n, out = self._now(), len(self._keys), []
        for j in range(n):
            i = (self._current + j) % n
            if i in self._dead:
                continue
            until = self._cool.get((i, model))
            if until is not None:
                if until > now:
                    continue
                del self._cool[(i, model)]
                log.info("gemini key %s (%s) qayta sinaladi", self._keys[i][0], model)
            out.append(i)
        return out

    def _models_now(self) -> list[str]:
        now = self._now()
        alive = [m for m in self.models if m not in self._dead_models]
        ready = [m for m in alive if self._model_cool.get(m, 0) <= now]
        return ready or alive  # hammasi dam olayotgan bo'lsa ham sinab ko'ramiz

    # -- HTTP
    def _http(self):
        import httpx

        loop = asyncio.get_running_loop()
        if self._client is None or self._client_loop is not loop:
            self._client = httpx.AsyncClient(transport=self._transport, timeout=httpx.Timeout(30.0, connect=5.0))
            self._client_loop = loop
        return self._client

    @staticmethod
    def _variants(base: dict, schema: dict) -> list[dict]:
        return [
            dict(base, responseJsonSchema=schema, thinkingConfig={"thinkingBudget": 0}),
            dict(base, responseJsonSchema=schema, thinkingConfig={"thinkingLevel": "minimal"}),
            dict(base, responseJsonSchema=schema, thinkingConfig={"thinkingLevel": "low"}),
            dict(base, responseJsonSchema=schema),
            dict(base),  # schema siz, faqat JSON — oxirgi chora
        ]

    async def _post(self, model: str, key: str, payload: dict, timeout: float) -> dict:
        import httpx

        url = f"{self._base}/models/{model}:generateContent"
        try:
            # kalit URL da emas, sarlavhada: xato matnida URL chiqsa ham kalit ko'rinmaydi
            resp = await asyncio.wait_for(self._http().post(url, json=payload, headers={"x-goog-api-key": key}),
                                          timeout=max(timeout, 0.1))
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise _GeminiFail("transient", "timeout") from None
        except (httpx.InvalidURL, httpx.LocalProtocolError, httpx.UnsupportedProtocol):
            raise _GeminiFail("key_dead", "so'rov yaratilmadi (kalit formati)") from None
        except httpx.TransportError as e:
            raise _GeminiFail("transient", f"tarmoq: {type(e).__name__}") from None
        try:
            body = resp.json()
        except ValueError:
            body = {}
        if resp.status_code != 200:
            raise _classify_error(resp.status_code, body)
        cands = body.get("candidates") or [] if isinstance(body, dict) else []
        if not cands:
            reason = (body.get("promptFeedback") or {}).get("blockReason", "candidates yo'q") \
                if isinstance(body, dict) else "JSON emas"
            raise _GeminiFail("bad_output", str(reason))
        parts = (cands[0].get("content") or {}).get("parts") or []
        text = "".join(p.get("text", "") for p in parts if isinstance(p, dict) and not p.get("thought"))
        try:
            res = _parse_json(text)
        except ValueError:
            raise _GeminiFail("bad_output", f"JSON emas ({cands[0].get('finishReason', '?')})") from None
        if not isinstance(res, dict):
            raise _GeminiFail("bad_output", "JSON obyekt emas")
        return res

    async def _call(self, model: str, key: str, task: str, system: str, user: str, schema: dict,
                    deadline: float, extra_parts: list | None = None) -> dict:
        base = {"responseMimeType": "application/json", "temperature": 0.2 if task == "turn" else 0.0,
                "maxOutputTokens": 1024 if task == "turn" else 2048}
        variants = self._variants(base, schema)
        last: _GeminiFail | None = None
        for vi in range(self._variant_start.get(model, 0), len(variants)):
            payload = {"systemInstruction": {"parts": [{"text": system}]},
                       "contents": [{"role": "user", "parts": [{"text": user}, *(extra_parts or [])]}],
                       "generationConfig": variants[vi]}
            try:
                return await self._post(model, key, payload, deadline - self._now())
            except _GeminiFail as f:
                if f.kind == "bad_request":
                    self._variant_start[model] = min(vi + 1, len(variants) - 1)
                    log.warning("gemini %s: so'rov varianti %d qabul qilinmadi (%s)", model, vi, f.detail)
                elif f.kind == "bad_output":
                    log.warning("gemini %s: javob yaroqsiz (%s)", model, f.detail)
                else:
                    raise
                last = f
                if deadline - self._now() < 0.3:
                    break
        raise last or _GeminiFail("bad_request", "variant qolmadi")

    async def complete_json(self, task: str, system: str, user: str, schema: dict, ctx: dict) -> dict:
        """ctx["_parts"] — qo'shimcha kontent qismlari (masalan STT uchun inline audio), ixtiyoriy."""
        budget = settings.llm_timeout_s * task_budget_factor(task)
        extra_parts = (ctx or {}).get("_parts")
        deadline = self._now() + budget
        transient_used = False
        last = "ishlaydigan kalit yo'q"
        models = self._models_now()
        for mi, model in enumerate(models):
            for i in self._keys_now(model):
                label, key = self._keys[i]
                remaining = deadline - self._now()
                if remaining < 0.3:
                    raise RuntimeError(f"Gemini: vaqt tugadi ({last})")
                cap = remaining if transient_used else min(remaining, budget * FIRST_TRY_SHARE)
                try:
                    res = await self._call(model, key, task, system, user, schema, self._now() + cap, extra_parts)
                except _GeminiFail as f:
                    last = f"key {label}, {model}: {f.detail}"
                    if f.kind == "key_dead":
                        self._dead.add(i)
                        log.warning("gemini key %s ishlamaydi (%s) — sessiya davomida o'tkazib yuboriladi",
                                    label, f.detail)
                        continue
                    if f.kind == "key_rate":
                        wait = min(max(KEY_COOLDOWN_S, f.retry_s), KEY_COOLDOWN_MAX_S)
                        self._cool[(i, model)] = self._now() + wait
                        log.warning("gemini key %s limitga yetdi (%s, %s) — %d s dan keyin qayta sinaladi",
                                    label, model, f.detail, wait)
                        continue
                    if f.kind == "model_gone":
                        self._dead_models.add(model)
                        log.warning("gemini model %s mavjud emas (%s)", model, f.detail)
                        break
                    if f.kind == "transient":
                        if transient_used:
                            raise RuntimeError(f"Gemini: {last}") from None
                        transient_used = True
                        # keyingi urinish keyingi kalitdan; navbatda zaxira model bo'lsa — o'sha model bilan
                        # (timeout/5xx ko'pincha modelning band bo'lishi). 5xx da asosiy model 60 s chetga qo'yiladi.
                        self._current = (i + 1) % len(self._keys)
                        to_model = mi + 1 < len(models)
                        log.warning("gemini key %s, %s: %s — keyingi kalit%s bilan bir marta qayta", label, model,
                                    f.detail, " va zaxira model" if to_model else "")
                        if f.detail == "timeout":
                            self._model_timeouts[model] = self._model_timeouts.get(model, 0) + 1
                        if to_model:
                            if f.detail != "timeout" or self._model_timeouts[model] >= 2:
                                self._model_cool[model] = self._now() + MODEL_COOLDOWN_S
                                self._model_timeouts[model] = 0
                            break
                        continue
                    raise RuntimeError(f"Gemini: {last}") from None
                self._current = i
                self._model_timeouts[model] = 0
                if self._last_used != (model, i):
                    log.info("gemini key %s ishlatildi (model %s)", label, model)
                    self._last_used = (model, i)
                return res
        raise RuntimeError(f"Gemini: ishlaydigan kalit/model qolmadi ({last})")


# ----------------------------------------------------------------------------- anthropic
class AnthropicLLM(LLMProvider):
    name = "anthropic"

    def __init__(self, api_key: str, model: str):
        import anthropic

        self.client = anthropic.AsyncAnthropic(api_key=api_key)
        self.model = model

    async def complete_json(self, task: str, system: str, user: str, schema: dict, ctx: dict) -> dict:
        resp = await self.client.messages.create(
            model=self.model, max_tokens=600 if task == "turn" else 2000, temperature=0.2 if task == "turn" else 0.0,
            system=system, messages=[{"role": "user", "content": user}],
            tools=[{"name": "respond", "description": "Javobni shu sxema bo'yicha qaytar.", "input_schema": schema}],
            tool_choice={"type": "tool", "name": "respond"},
        )
        for block in resp.content:
            if getattr(block, "type", "") == "tool_use":
                return dict(block.input)
        raise RuntimeError("Anthropic tool_use qaytarmadi")


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, flags=re.S)
        if m:
            return json.loads(m.group(0))
        raise


# ----------------------------------------------------------------------------- factory
def make_llm() -> LLMProvider:
    p = settings.llm_provider
    try:
        if p in ("gemini", "auto") and settings.gemini_api_keys:
            llm = GeminiLLM(settings.gemini_api_keys, settings.gemini_model, settings.gemini_fallback_models)
            log.info("LLM gemini: %d ta kalit (%s), model %s", len(llm.key_labels), " ".join(llm.key_labels),
                     " -> ".join(llm.models))
            return llm
        if p in ("anthropic", "auto") and settings.anthropic_api_key:
            return AnthropicLLM(settings.anthropic_api_key, settings.anthropic_model)
    except Exception as e:  # noqa: BLE001
        log.error("LLM provayder yaratilmadi (%s), mock ishlatiladi", e)
    if p not in ("auto", "mock"):
        log.warning("LLM_PROVIDER=%s, lekin kalit yo'q — mock ishlatiladi", p)
    return MockLLM()


async def call_with_fallback(llm: LLMProvider, task: str, system: str, user: str, schema: dict, ctx: dict
                             ) -> tuple[dict, str, bool]:
    """(natija, provayder nomi, fallback bo'ldimi). Real LLM xato/timeout bersa — mock."""
    if isinstance(llm, MockLLM):
        return await llm.complete_json(task, system, user, schema, ctx), "mock", False
    try:
        budget = settings.llm_timeout_s * (3 if task == "rubric" else 1)
        # o'z budjetini boshqaradigan provayderga (gemini) kichik zaxira: u budjet ichida o'zi to'xtaydi
        res = await asyncio.wait_for(llm.complete_json(task, system, user, schema, ctx),
                                     timeout=budget + (1.5 if getattr(llm, "self_timed", False) else 0))
        if not isinstance(res, dict):
            raise ValueError("JSON obyekt emas")
        return res, llm.name, False
    except Exception as e:  # noqa: BLE001
        log.error("%s xato (%s) — mock zaxira", llm.name, e)
        return await MockLLM().complete_json(task, system, user, schema, ctx), "mock", True
