"""Sozlamalar faqat server/.env (yoki muhit o'zgaruvchilari) dan o'qiladi."""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

SERVER_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = SERVER_DIR.parent
load_dotenv(SERVER_DIR / ".env", override=False)

log = logging.getLogger("config")


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _env_float(name: str, default: float) -> float:
    try:
        return float(_env(name, str(default)))
    except ValueError:
        return default


def _env_list(name: str) -> list[str]:
    return [x.strip() for x in _env(name).split(",") if x.strip()]


# Gemini kalitlari: eski "AIza..." (39 belgi) va yangi "AQ...." (~53 belgi) formatlari. Bo'shliq/kirill/juda uzun
# qiymat — nusxalashda buzilgan kalit; uni yuborish faqat vaqt yo'qotadi (InvalidURL / API_KEY_INVALID).
_KEY_CHARS = re.compile(r"[A-Za-z0-9_.\-]+")
_KEY_NAME = re.compile(r"GEMINI_API_KEY_?(\d*)")
KEY_MIN_LEN, KEY_MAX_LEN = 20, 120


def gemini_key_problem(value: str) -> str:
    """Kalit formati noto'g'ri bo'lsa sababini qaytaradi (qiymatning o'zini emas), to'g'ri bo'lsa ''."""
    if re.search(r"\s", value):
        return "ichida bo'shliq/qator bor"
    if len(value) > KEY_MAX_LEN:
        return f"juda uzun ({len(value)} belgi)"
    if len(value) < KEY_MIN_LEN:
        return f"juda qisqa ({len(value)} belgi)"
    if not _KEY_CHARS.fullmatch(value):
        return "ruxsat etilmagan belgi bor"
    return ""


def load_gemini_keys(environ: dict[str, str] | None = None) -> list[tuple[str, str]]:
    """[(yorliq, kalit)]: GEMINI_API_KEY (#1), GEMINI_API_KEY2 (#2), GEMINI_API_KEY3 (#3) ... so'ng GEMINI_API_KEYS
    (vergul bilan, #keys.1 ...). Bo'sh qiymatlar va takrorlar tashlanadi, noto'g'ri formatdagisi ogohlantirish bilan
    o'tkazib yuboriladi. Log va yorliqlarda kalit qiymati hech qachon bo'lmaydi."""
    env = os.environ if environ is None else environ
    numbered: list[tuple[int, str]] = []
    for name in env:
        m = _KEY_NAME.fullmatch(name)
        if m:
            numbered.append((int(m.group(1) or 1), name))
    raw = [(f"#{n}", name, env.get(name) or "") for n, name in sorted(numbered)]
    for i, part in enumerate((env.get("GEMINI_API_KEYS") or "").split(",")):
        raw.append((f"#keys.{i + 1}", f"GEMINI_API_KEYS[{i + 1}]", part))
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for label, source, value in raw:
        v = value.strip().strip("\"'").strip()
        if not v:
            continue
        problem = gemini_key_problem(v)
        if problem:
            log.warning("%s noto'g'ri formatda (%s) — o'tkazib yuborildi", source, problem)
            continue
        if v in seen:
            continue
        seen.add(v)
        out.append((label, v))
    return out


@dataclass
class Settings:
    llm_provider: str = field(default_factory=lambda: _env("LLM_PROVIDER", "auto").lower())
    gemini_api_keys: list[tuple[str, str]] = field(default_factory=load_gemini_keys)
    gemini_model: str = field(default_factory=lambda: _env("GEMINI_MODEL", "gemini-3.1-flash-lite"))
    # GEMINI_MODEL 404/429/503/timeout bersa navbatdagi modellar (vergul bilan). O'zgaruvchi umuman yo'q bo'lsa standart
    # ro'yxat; bo'sh qiymat (GEMINI_FALLBACK_MODELS=) — zaxira model yo'q.
    gemini_fallback_models: list[str] = field(default_factory=lambda: _env_list("GEMINI_FALLBACK_MODELS")
                                              if os.getenv("GEMINI_FALLBACK_MODELS") is not None
                                              else ["gemini-3.1-flash-lite", "gemini-flash-lite-latest"])
    anthropic_api_key: str = field(default_factory=lambda: _env("ANTHROPIC_API_KEY"))
    anthropic_model: str = field(default_factory=lambda: _env("ANTHROPIC_MODEL", "claude-sonnet-4-5"))
    llm_timeout_s: float = field(default_factory=lambda: _env_float("LLM_TIMEOUT_S", 8.0))

    stt_provider: str = field(default_factory=lambda: _env("STT_PROVIDER", "auto").lower())
    aisha_api_key: str = field(default_factory=lambda: _env("AISHA_API_KEY"))

    tts_provider: str = field(default_factory=lambda: _env("TTS_PROVIDER", "auto").lower())
    azure_speech_key: str = field(default_factory=lambda: _env("AZURE_SPEECH_KEY"))
    azure_speech_region: str = field(default_factory=lambda: _env("AZURE_SPEECH_REGION", "westeurope"))
    tts_timeout_s: float = field(default_factory=lambda: _env_float("TTS_TIMEOUT_S", 8.0))
    # deferred: /turn matnni darhol qaytaradi, audio /tts/<key>.mp3 so'ralganda yaratiladi; inline: /turn ichida
    tts_mode: str = field(default_factory=lambda: _env("TTS_MODE", "deferred").lower())
    tts_prewarm: bool = field(default_factory=lambda: _env("TTS_PREWARM", "1") not in ("0", "false", "no"))

    cors_origins: list[str] = field(
        default_factory=lambda: [o.strip() for o in _env("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]
    )
    public_base_url: str = field(default_factory=lambda: _env("PUBLIC_BASE_URL").rstrip("/"))
    content_dir: str = field(default_factory=lambda: _env("CONTENT_DIR"))
    # o'qituvchi paneli (/teacher/*) uchun oddiy PIN, header x-teacher-pin. Standart: 1234
    teacher_pin: str = field(default_factory=lambda: _env("TEACHER_PIN", "1234"))

    @property
    def gemini_api_key(self) -> str:
        """Moslik uchun: birinchi yaroqli kalit (yoki '')."""
        return self.gemini_api_keys[0][1] if self.gemini_api_keys else ""

    cache_dir: Path = SERVER_DIR / "cache"
    log_dir: Path = SERVER_DIR / "logs"
    prompts_dir: Path = SERVER_DIR / "prompts"
    fixtures_dir: Path = SERVER_DIR / "fixtures"


settings = Settings()
