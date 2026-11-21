"""STT provayderlari: gemini (flash-lite audio, mavjud kalitlar navbati) | aisha | none.

R6: audio diskka yozilmaydi — faqat xotirada STT ga yuboriladi va tashlab yuboriladi.
Aisha v1 REST hujjatda mp3/wav/ogg/m4a ni sanaydi; brauzer webm yuborsa va serverda ffmpeg bo'lsa,
xotirada (pipe orqali) mp3 ga o'giriladi.
"""
from __future__ import annotations

import asyncio
import base64
import logging
import re
import shutil
import time

import httpx

from ..config import settings

log = logging.getLogger("stt")

AISHA_URL = "https://back.aisha.group/api/v1/stt/post/"


class STTError(Exception):
    pass


class STTProvider:
    name = "base"
    available = False

    async def transcribe(self, audio: bytes, mime: str = "audio/webm") -> str:
        raise NotImplementedError


class NoSTT(STTProvider):
    name = "none"

    async def transcribe(self, audio: bytes, mime: str = "audio/webm") -> str:
        raise STTError("STT sozlanmagan (AISHA_API_KEY yo'q). Matn kiriting.")


async def _to_mp3(audio: bytes) -> bytes | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    proc = await asyncio.create_subprocess_exec(
        ffmpeg, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-ac", "1", "-ar", "16000", "-f", "mp3", "pipe:1",
        stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await asyncio.wait_for(proc.communicate(audio), timeout=10)
    if proc.returncode != 0 or not out:
        log.warning("ffmpeg o'girmadi: %s", err[:200])
        return None
    return out


class AishaSTT(STTProvider):
    name = "aisha"
    available = True

    def __init__(self, api_key: str):
        self.api_key = api_key

    async def transcribe(self, audio: bytes, mime: str = "audio/webm") -> str:
        filename, ctype = "voice.webm", mime or "audio/webm"
        if "webm" in ctype or "mp4" in ctype:
            mp3 = await _to_mp3(audio)
            if mp3:
                audio, filename, ctype = mp3, "voice.mp3", "audio/mpeg"
        elif "ogg" in ctype:
            filename = "voice.ogg"
        elif "wav" in ctype:
            filename = "voice.wav"
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.post(
                AISHA_URL,
                headers={"X-Api-Key": self.api_key, "Accept-Language": "uz"},
                files={"audio": (filename, audio, ctype)},
                data={"language": "uz", "has_diarization": "false"},
            )
        if r.status_code != 200:
            # provayder matni (inglizcha/JSON) faqat logga; foydalanuvchiga umumiy o'zbekcha xabar
            log.warning("Aisha STT %s: %s", r.status_code, r.text[:200])
            raise STTError("Ovozni tanib bo'lmadi. Qaytadan gapiring yoki matn kiriting.")
        text = (r.json() or {}).get("transcript", "").strip()
        if not text:
            raise STTError("Ovoz tanilmadi. Qaytadan gapiring yoki matn kiriting.")
        return text


# Gemini audio: WAV, MP3, AIFF, AAC, OGG, FLAC rasman; brauzer webm (opus) yuboradi — avval to'g'ridan-to'g'ri,
# rad etilsa va ffmpeg bo'lsa xotirada mp3 ga o'girib qayta yuboriladi.
_MIME_ALIASES = {"audio/mpeg": "audio/mp3", "audio/x-wav": "audio/wav", "audio/wave": "audio/wav",
                 "audio/x-m4a": "audio/aac", "audio/mp4": "audio/aac", "audio/x-flac": "audio/flac"}
STT_SCHEMA = {"type": "object", "properties": {"text_uz": {"type": "string"}}, "required": ["text_uz"]}
STT_SYSTEM = (
    "Sen nutqni matnga aylantiruvchisan (transkripsiya). Audiodagi o'zbekcha nutqni o'zbek lotin yozuvida "
    "SO'ZMA-SO'Z yoz: hech narsa qo'shma, tuzatma, qisqartirma, tarjima qilma, savolga javob berma, izoh yozma. "
    "O' va g' harflarini o' va g' (tutuq belgisi ') bilan yoz. Tinish belgilarini qo'y (savol bo'lsa ?). "
    "Nutq bo'lmasa yoki tushunarsiz bo'lsa text_uz bo'sh qator bo'lsin. Faqat JSON: {\"text_uz\": \"...\"}.")


def normalize_mime(mime: str | None) -> str:
    m = (mime or "audio/webm").split(";")[0].strip().lower() or "audio/webm"
    return _MIME_ALIASES.get(m, m)


class GeminiSTT(STTProvider):
    """Gemini flash-lite ga inline audio (base64) + "faqat o'zbekcha, so'zma-so'z" ko'rsatmasi.

    LLM bilan bir xil GeminiLLM obyekti (kalitlar navbati, cooldown, zaxira modellar) ishlatiladi. Audio faqat
    xotirada; kalit faqat sarlavhada (GeminiLLM). Xato bo'lsa — zaxira (Aisha) yoki STTError (-> 422).
    """

    name = "gemini"
    available = True

    def __init__(self, llm, fallback: STTProvider | None = None, vocabulary: list[str] | None = None):
        self.llm = llm
        self.fallback = fallback
        self.vocabulary = vocabulary or []
        self.last_ms: float = 0.0

    def _user(self) -> str:
        vocab = ", ".join(self.vocabulary)
        return ("Audioni so'zma-so'z transkripsiya qil." +
                (f" Uchrashi mumkin bo'lgan so'zlar (faqat eshitilsa yoz): {vocab}." if vocab else ""))

    async def _ask(self, audio: bytes, mime: str) -> str:
        parts = [{"inline_data": {"mime_type": mime, "data": base64.b64encode(audio).decode("ascii")}}]
        res = await self.llm.complete_json("stt", STT_SYSTEM, self._user(), STT_SCHEMA, {"_parts": parts})
        text = str((res or {}).get("text_uz") or "").strip()
        return re.sub(r"\s+", " ", text).strip().strip('"')

    async def transcribe(self, audio: bytes, mime: str = "audio/webm") -> str:
        if not audio or len(audio) < 100:
            raise STTError("Audio bo'sh yoki juda qisqa. Qaytadan gapiring yoki matn kiriting.")
        m = normalize_mime(mime)
        t0 = time.perf_counter()
        text, err = "", None
        try:
            text = await self._ask(audio, m)
        except Exception as e:  # noqa: BLE001
            err = e
            if m in ("audio/webm", "video/webm", "audio/aac"):
                mp3 = await _to_mp3(audio)
                if mp3:
                    try:
                        text, err = await self._ask(mp3, "audio/mp3"), None
                    except Exception as e2:  # noqa: BLE001
                        err = e2
        self.last_ms = (time.perf_counter() - t0) * 1000
        if err is not None:
            log.warning("Gemini STT xato (%s)", type(err).__name__)
            if self.fallback:
                return await self.fallback.transcribe(audio, mime)
            raise STTError("Ovozni tanib bo'lmadi. Matn kiriting.")
        if not text:
            raise STTError("Ovoz tanilmadi. Qaytadan gapiring yoki matn kiriting.")
        log.info("Gemini STT %.0f ms, %d so'z", self.last_ms, len(text.split()))
        return text


def _case_vocabulary() -> list[str]:
    try:
        from ..content import load_content

        c = load_content().case
        names = [c.get("witness", {}).get("name", ""), c.get("defendant", {}).get("name", "")]
    except Exception:  # noqa: BLE001
        names = []
    base = ["raislik qiluvchi", "Hurmatli sud", "himoyachi", "sudlanuvchi", "prokuror", "guvoh", "bayonnoma",
            "ishora qiluvchi savol", "iltimos", "noutbuk", "ko'zoynak", "fotosurat", "ko'rishingizga",
            "ko'rish sharoiti", "peshtaxta", "javon"]
    return [x for x in names if x] + base


def make_stt(llm=None) -> STTProvider:
    """auto: Gemini kalitlari bo'lsa GeminiSTT (Aisha kaliti bo'lsa — zaxira), aks holda Aisha, aks holda none."""
    p = settings.stt_provider
    aisha = AishaSTT(settings.aisha_api_key) if settings.aisha_api_key and p in ("aisha", "auto", "gemini") else None
    if p in ("gemini", "auto") and settings.gemini_api_keys:
        from .llm import GeminiLLM

        g = llm if isinstance(llm, GeminiLLM) else GeminiLLM(settings.gemini_api_keys, settings.gemini_model,
                                                             settings.gemini_fallback_models)
        log.info("STT gemini (%s)%s", " -> ".join(g.models), " + aisha zaxira" if aisha else "")
        return GeminiSTT(g, fallback=aisha, vocabulary=_case_vocabulary())
    if aisha and p in ("aisha", "auto"):
        return aisha
    return NoSTT()
