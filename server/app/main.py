"""Sud trenajyori — FastAPI backend.

Ishga tushirish (server/ papkasidan):  uvicorn app.main:app --reload --port 8000   -> http://localhost:8000/docs
"""
from __future__ import annotations

import asyncio
import base64
import binascii
import hmac
import logging
import re
import time
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from pydantic import BaseModel, Field

from .config import settings
from .content import load_content
from .engine import Engine, prewarm_phrases
from .providers.llm import MockLLM, make_llm
from .providers.stt import STTError, make_stt
from .providers.tts import make_tts
from . import teacher as T
from .report import DISCLAIMER_UZ, bayonnoma_html, finish_session, interim_bayonnoma

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("main")

MAX_AUDIO_BYTES = 8 * 1024 * 1024  # ~4 daqiqa webm/opus; undan katta audio rad etiladi


def build_engine() -> Engine:
    llm = make_llm()
    return Engine(load_content, llm, make_tts(), make_stt(llm))


engine = build_engine()


async def _prewarm() -> None:
    phrases = prewarm_phrases(engine.content)
    ok = 0
    for speaker, text in phrases:
        if await engine.tts.synth(text, speaker):
            ok += 1
    log.info("TTS kesh: %d/%d tayyor ibora", ok, len(phrases))


WARMUP_SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
_llm_warm: dict[str, Any] = {"state": "idle", "task": None}  # idle | running | ok | failed


async def _warm_llm() -> None:
    """Bitta arzon LLM so'rovi (TLS ulanish, model/variant tanlovi) — birinchi /turn 9–11 s kutmasin.
    Xato bo'lsa jim o'tadi: faqat log, kalit qiymati yozilmaydi."""
    _llm_warm["state"] = "running"
    t0 = asyncio.get_running_loop().time()
    try:
        await asyncio.wait_for(
            engine.llm.complete_json("warmup", "Faqat JSON qaytar.", 'Javob: {"ok": true}', WARMUP_SCHEMA, {}),
            timeout=max(settings.llm_timeout_s * 2, 10.0))
        _llm_warm["state"] = "ok"
        log.info("LLM warm-up %s: %.2fs", engine.llm.name, asyncio.get_running_loop().time() - t0)
    except asyncio.CancelledError:
        _llm_warm["state"] = "idle"
        raise
    except Exception as e:  # noqa: BLE001
        _llm_warm["state"] = "failed"
        log.warning("LLM warm-up o'tkazib yuborildi (%s)", type(e).__name__)


def _kick_llm_warmup() -> None:
    """Real LLM bo'lsa va hali isitilmagan bo'lsa — fon vazifasi. Mock da hech narsa qilmaydi."""
    if isinstance(engine.llm, MockLLM) or _llm_warm["state"] in ("running", "ok"):
        return
    _llm_warm["task"] = asyncio.create_task(_warm_llm())


DEFAULT_TEACHER_PIN = "1234"


def check_teacher_pin() -> bool:
    """Startupda: TEACHER_PIN standart (1234) bo'lsa ogohlantirish logi. True — standart PIN ishlatilmoqda."""
    if settings.teacher_pin == DEFAULT_TEACHER_PIN:
        log.warning("TEACHER_PIN standart qiymatda (1234) — demo uchun. Real foydalanishda server/.env da "
                    "TEACHER_PIN ni almashtiring (o'qituvchi paneli shu PIN bilan himoyalangan).")
        return True
    return False


@asynccontextmanager
async def lifespan(app: FastAPI):
    c = engine.content
    log.info("LLM=%s STT=%s TTS=%s kontent=%s (%s)", engine.llm.name, engine.stt.name, engine.tts.name, c.source,
             c.case.get("id"))
    check_teacher_pin()
    task = asyncio.create_task(_prewarm()) if settings.tts_prewarm and engine.tts.name != "none" else None
    _kick_llm_warmup()
    yield
    for t in (task, _llm_warm.get("task")):
        if t and not t.done():
            t.cancel()


app = FastAPI(title="Sud trenajyori API", version="0.1.0", lifespan=lifespan,
              description="AI o'quv simulyatsiyasi, real sud qarori emas. Sudya, prokuror va guvoh — AI; "
                          "talaba — himoyachi.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"https://([a-z0-9-]+\.)*vercel\.app|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"], allow_headers=["*"],
)
settings.cache_dir.mkdir(parents=True, exist_ok=True)
AUDIO_NAME_RE = re.compile(r"^[0-9a-f]{20}\.mp3$")


# ----------------------------------------------------------------------------- modellar
class StartReq(BaseModel):
    case_id: str | None = Field(None, description="Ish id si (case.json dagi id). Bo'sh bo'lsa joriy ish.")
    student_name: str | None = Field(None, max_length=80)
    mode: Literal["majlis", "talim"] | None = Field(
        None, description="majlis (imtihon) | talim (ustoz bilan). Yuborilmasa — eski xatti-harakat (prokuror "
                          "so'rog'i va 5-mezonsiz); javobda mode='majlis'.")


class TurnReq(BaseModel):
    session_id: str
    text: str | None = Field(None, max_length=2000, description="Talaba gapi (matn rejimi)")
    audio: str | None = Field(None, max_length=12_000_000,
                              description="webm/ogg/mp3 base64 (data: prefiksi bilan ham bo'ladi). Saqlanmaydi.")
    audio_mime: str | None = Field(None, description="masalan audio/webm;codecs=opus")
    action: Literal["next_stage", "request_floor", "motion_reject_question", "hint", "continue"] | None = Field(
        None, description="next_stage — keyingi bosqich; request_floor — so'z so'rash; motion_reject_question — "
                          "savolni rad etishni so'rash (JPK 102); hint — maslahat (faqat talim); continue — "
                          "motion_opportunity oynasi tugadi, sahna davom etsin")


class SttReq(BaseModel):
    audio_b64: str = Field(..., max_length=12_000_000, description="webm/ogg/mp3/wav base64 (data: prefiksi bilan "
                                                                   "ham bo'ladi). Saqlanmaydi.")
    mime: str | None = Field(None, description="masalan audio/webm;codecs=opus")


class FinishReq(BaseModel):
    session_id: str


class ApproveReq(BaseModel):
    teacher_name: str = Field(..., min_length=1, max_length=80, description="O'qituvchi ismi")
    comment: str | None = Field(None, max_length=500, description="Ixtiyoriy izoh")


# ----------------------------------------------------------------------------- yordamchilar
def _base_url(request: Request) -> str:
    return settings.public_base_url or str(request.base_url).rstrip("/")


def _audio_url(request: Request, name: str | None) -> str | None:
    if not name:
        return None
    if name.startswith("tts:"):  # deferred: brauzer so'raganda yaratiladi
        return f"{_base_url(request)}/tts/{name[4:]}.mp3"
    return f"{_base_url(request)}/audio/{name}"


def _with_audio(request: Request, res: dict[str, Any]) -> dict[str, Any]:
    res["audio_url"] = _audio_url(request, res.pop("audio_file", None))
    for f in res.get("followups", []):
        f["audio_url"] = _audio_url(request, f.pop("audio_file", None))
    if isinstance(res.get("tutor"), dict):
        res["tutor"]["audio_url"] = _audio_url(request, res["tutor"].pop("audio_file", None))
    return res


def _session(sid: str):
    s = engine.sessions.get(sid)
    if not s:
        raise HTTPException(404, detail={"code": "session_not_found", "message_uz": "Sessiya topilmadi. Qaytadan boshlang."})
    return s


def _decode_audio(b64: str) -> tuple[bytes, str | None]:
    mime = None
    if b64.startswith("data:"):
        head, _, b64 = b64.partition(",")
        mime = head[5:].split(";base64")[0] or None
    try:
        data = base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(422, detail={"code": "bad_audio", "message_uz": "Audio formati noto'g'ri. Matn kiriting."})
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, detail={"code": "audio_too_large", "message_uz": "Audio juda uzun. Qisqaroq gapiring."})
    return data, mime


# ----------------------------------------------------------------------------- endpointlar
@app.get("/health")
def health() -> dict[str, Any]:
    c = engine.content
    return {"ok": True, "llm": engine.llm.name, "stt": engine.stt.name, "tts": engine.tts.name,
            "tts_mode": settings.tts_mode,
            "content_source": c.source, "case_id": c.case.get("id"), "content_warnings": c.warnings,
            "sessions": len(engine.sessions)}


@app.get("/case")
def get_case() -> dict[str, Any]:
    """Ish materiali (yashirin faktsiz) va bosqichlar/moddalar — talaba ekrani uchun."""
    c = engine.content
    return {"case": c.public_case(), "rules": c.public_rules(), "disclaimer_uz": DISCLAIMER_UZ}


@app.post("/session/start")
async def session_start(req: StartReq, request: Request) -> dict[str, Any]:
    _kick_llm_warmup()  # startup warm-up xato bergan bo'lsa — birinchi sessiyada yana bir urinish (fon)
    try:
        s, e, audio = await engine.start(req.case_id, req.student_name or "", req.mode)
    except KeyError as k:
        raise HTTPException(404, detail={"code": "case_not_found", "message_uz": "Ish topilmadi.",
                                         "available": [str(k.args[0])]})
    c = engine.content
    st = c.stage(s.stage_id)
    extras = await engine.start_extras(s)
    return _with_audio(request, {
        "session_id": s.id, "case_id": s.case_id,
        "stage_id": s.stage_id, "stage": st, "stages": [{"id": x["id"], "order": x.get("order"),
                                                         "name_uz": x.get("name_uz"), "kind": c.stage_kind(x)}
                                                        for x in c.stages],
        "speaker": "judge", "text_uz": e.text, "audio_file": audio, "log_id": e.log_id,
        "disclaimer_uz": DISCLAIMER_UZ, **extras,
    })


@app.post("/turn")
async def turn(req: TurnReq, request: Request) -> dict[str, Any]:
    s = _session(req.session_id)
    text, mode = (req.text or "").strip(), "text"
    async with s.lock:
        if s.finished:  # /finish dan keyin majlis yopiq: baho o'zgarmasin (frontend natija ekranini ko'rsatadi)
            raise HTTPException(409, detail={"code": "session_finished",
                                             "message_uz": "Majlis yakunlangan. Natija va bayonnoma tayyor."})
        if not text and req.audio:
            data, mime = _decode_audio(req.audio)
            try:
                text = await engine.stt.transcribe(data, req.audio_mime or mime or "audio/webm")
            except STTError as err:
                raise HTTPException(422, detail={"code": "stt_failed", "message_uz": str(err)})
            except Exception as err:  # noqa: BLE001 — tarmoq xatosi va h.k.
                log.error("STT xato: %s", err)
                raise HTTPException(422, detail={"code": "stt_failed",
                                                 "message_uz": "Ovozni tanib bo'lmadi. Matn kiriting."})
            finally:
                del data  # R6: audio saqlanmaydi
            mode = "audio"
        if not text and not req.action:
            raise HTTPException(422, detail={"code": "empty", "message_uz": "Matn yoki audio yuboring."})
        if req.action == "hint" and s.mode != "talim":
            raise HTTPException(422, detail={"code": "hint_unavailable",
                                             "message_uz": "Maslahat faqat ta'lim rejimida beriladi."})
        res = await engine.turn(s, text, input_mode=mode, action=req.action)
    res["transcript_uz"] = text if mode == "audio" else None
    return _with_audio(request, res)


@app.post("/stt")
async def stt(req: SttReq) -> dict[str, Any]:
    """Ovoz -> o'zbekcha matn (Gemini flash-lite, kalitlar navbati bilan). Audio xotirada, saqlanmaydi.
    Xatoda 422 stt_failed — frontend matn maydoniga qaytadi."""
    data, mime = _decode_audio(req.audio_b64)
    if len(data) < 100:
        raise HTTPException(422, detail={"code": "bad_audio", "message_uz": "Audio bo'sh yoki juda qisqa."})
    t0 = time.perf_counter()
    try:
        text = await engine.stt.transcribe(data, req.mime or mime or "audio/webm")
    except STTError as err:
        raise HTTPException(422, detail={"code": "stt_failed", "message_uz": str(err)})
    except Exception as err:  # noqa: BLE001
        log.error("STT xato: %s", type(err).__name__)
        raise HTTPException(422, detail={"code": "stt_failed", "message_uz": "Ovozni tanib bo'lmadi. Matn kiriting."})
    finally:
        del data  # R6: audio saqlanmaydi
    return {"text_uz": text, "ms": round((time.perf_counter() - t0) * 1000), "provider": engine.stt.name}


@app.post("/finish")
async def finish(req: FinishReq) -> dict[str, Any]:
    """Yakuniy baho va bayonnoma. Sessiya yopiladi; takroriy /finish keshdagi o'sha natijani qaytaradi."""
    s = _session(req.session_id)
    async with s.lock:
        return await finish_session(engine.content, s, engine.llm)


@app.get("/session/{session_id}")
def session_state(session_id: str) -> dict[str, Any]:
    s = _session(session_id)
    return {"session_id": s.id, "mode": s.mode, "legacy": s.legacy, "trap_state": s.trap_state,
            "hints_used": s.hints_used, "pauses": s.pauses, "exam_source": s.exam_source,
            "stage_id": s.stage_id, "closed": s.closed, "witness_revealed": s.witness_revealed,
            "llm_fallbacks": s.llm_fallbacks, "timings": s.timings,
            "log": [e.__dict__ for e in s.log]}


@app.get("/session/{session_id}/approval")
def session_approval(session_id: str) -> dict[str, Any]:
    """Natija ekrani uchun (PIN siz): o'qituvchi shu sessiyani tasdiqladimi.
    {session_id, approved, teacher_name, at, at_uz, comment}; tasdiqlanmagan bo'lsa approved=false, qolgani null.
    Sessiya topilmasa 404 session_not_found (server qayta ishga tushgan bo'lishi mumkin)."""
    return T.public_approval(_session(session_id))


@app.get("/session/{session_id}/bayonnoma", response_class=HTMLResponse)
async def session_bayonnoma(session_id: str) -> HTMLResponse:
    """Yakunlangan (/finish) sessiya — keshdagi bayonnoma. Faol sessiya — joriy holatdan oraliq bayonnoma (kod
    rubrikasi, LLM siz); sessiya holati, finished keshi va bayroqlari o'zgarmaydi (o'qituvchi ko'rishi yakunlamaydi)."""
    s = _session(session_id)
    if s.finished:
        return HTMLResponse(s.finished["bayonnoma_html"])
    return HTMLResponse(await interim_bayonnoma(engine.content, s))


# ----------------------------------------------------------------------------- o'qituvchi paneli (R14)
PIN_MAX_FAILS = 10       # shuncha noto'g'ri urinish ...
PIN_WINDOW_S = 60.0      # ... shu oynada (IP bo'yicha) bo'lsa — 429, oyna o'tguncha
_pin_fails: dict[str, list[float]] = {}


def _client_ip(request: Request | None) -> str:
    return (request.client.host if request is not None and request.client else None) or "?"


def _teacher_auth(pin: str | None, request: Request | None = None) -> None:
    ip = _client_ip(request)
    now = time.monotonic()
    fails = [t for t in _pin_fails.get(ip, []) if now - t < PIN_WINDOW_S]
    if len(fails) >= PIN_MAX_FAILS:
        _pin_fails[ip] = fails
        retry = max(1, int(PIN_WINDOW_S - (now - fails[0])) + 1)
        raise HTTPException(429, detail={"code": "too_many_attempts",
                                         "message_uz": f"PIN ko'p marta noto'g'ri kiritildi. {retry} soniyadan keyin "
                                                       "qayta urinib ko'ring.", "retry_after_s": retry},
                            headers={"Retry-After": str(retry)})
    if not pin or not hmac.compare_digest(pin.encode(), settings.teacher_pin.encode()):
        fails.append(now)
        _pin_fails[ip] = fails
        if len(_pin_fails) > 10_000:  # xotira cheklovi
            _pin_fails.clear()
        raise HTTPException(401, detail={"code": "bad_pin", "message_uz": "PIN noto'g'ri."})
    _pin_fails.pop(ip, None)


@app.get("/teacher/sessions")
def teacher_sessions(request: Request, x_teacher_pin: str | None = Header(None)) -> dict[str, Any]:
    """Xotiradagi sessiyalar (yangisi birinchi). Header: x-teacher-pin."""
    _teacher_auth(x_teacher_pin, request)
    c = engine.content
    items = sorted((T.summary(c, s) for s in list(engine.sessions.values())),
                   key=lambda x: x["started_at"], reverse=True)
    return {"sessions": items, "count": len(items), "disclaimer_uz": DISCLAIMER_UZ}


@app.get("/teacher/sessions/{session_id}")
async def teacher_session(session_id: str, request: Request,
                          x_teacher_pin: str | None = Header(None)) -> dict[str, Any]:
    """Rubrika (yakunlanmagan bo'lsa — kod bo'yicha dastlabki) + bayonnoma havolasi."""
    _teacher_auth(x_teacher_pin, request)
    s = _session(session_id)
    return await T.detail(engine.content, s, _base_url(request))


@app.post("/teacher/sessions/{session_id}/approve")
async def teacher_approve(session_id: str, req: ApproveReq, request: Request,
                          x_teacher_pin: str | None = Header(None)) -> dict[str, Any]:
    """Yakuniy bahoni o'qituvchi tasdiqlaydi: vaqt va tasdiqlangan ball (total/max) xotirada saqlanadi, bayonnomaga
    qator qo'shiladi. Sessiya hali yakunlanmagan bo'lsa — avval /finish dagi kabi yakunlanadi (yopiladi): tasdiqlangan
    ball keyin o'zgarmaydi (talabaning keyingi /turn i 409 session_finished)."""
    _teacher_auth(x_teacher_pin, request)
    s = _session(session_id)
    if not req.teacher_name.strip():
        raise HTTPException(422, detail={"code": "empty", "message_uz": "O'qituvchi ismini kiriting."})
    async with s.lock:
        res = await finish_session(engine.content, s, engine.llm)  # yakunlangan bo'lsa — keshdagi natija
        approval = T.approve(engine.content, s, req.teacher_name, req.comment, res["rubric"])
    return {"ok": True, "approval": approval, "session": T.summary(engine.content, s)}


@app.get("/audio/{name}")
async def audio_file(name: str):
    """Keshdagi tayyor mp3 (oldindan yaratilgan ogohlantirishlar va h.k.)."""
    path = settings.cache_dir / name
    if not AUDIO_NAME_RE.match(name) or not path.exists():
        raise HTTPException(404, detail={"code": "audio_not_found", "message_uz": "Audio topilmadi."})
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "public, max-age=86400"})


@app.get("/tts/{key}.mp3")
async def tts_audio(key: str, stream: int = 0):
    if not re.match(r"^[0-9a-f]{20}$", key):
        raise HTTPException(404, detail={"code": "audio_not_found", "message_uz": "Audio topilmadi."})
    """Deferred TTS. stream=0: to'liq yaratib, Content-Length bilan (iOS Safari uchun ishonchli);
    stream=1: birinchi bayt kelishi bilan uzatadi (Android Chrome)."""
    path = settings.cache_dir / f"{key}.mp3"
    if path.exists() and path.stat().st_size > 0:
        return FileResponse(path, media_type="audio/mpeg")
    item = engine.pending_tts.get(key)
    if not item:
        raise HTTPException(404, detail={"code": "audio_not_found", "message_uz": "Audio topilmadi."})
    text, speaker = item
    if stream:
        return StreamingResponse(engine.tts.stream(text, speaker), media_type="audio/mpeg")
    name = await engine.tts.synth(text, speaker)
    if not name:
        raise HTTPException(503, detail={"code": "tts_failed", "message_uz": "Ovoz yaratilmadi, subtitrni o'qing."})
    return FileResponse(settings.cache_dir / name, media_type="audio/mpeg")


@app.get("/")
def root() -> dict[str, str]:
    return {"name": "Sud trenajyori API", "docs": "/docs", "disclaimer_uz": DISCLAIMER_UZ}


__all__ = ["app", "engine", "bayonnoma_html"]
