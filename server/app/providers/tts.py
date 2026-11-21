"""TTS provayderlari: edge (edge-tts, kalitsiz) | azure | none. Hammasi server/cache/ orqali keshlanadi.

Kesh kaliti = sha1(provayder + ovoz + tezlik + balandlik + matn). Oldindan tayyor iboralar
(ogohlantirishlar, bosqich e'lonlari, yashirin fakt) bir marta yaratiladi va keyin ~0 s da beriladi.
"""
from __future__ import annotations

import asyncio
import hashlib
import html
import logging
import os
import time
from pathlib import Path

import httpx

from ..config import settings

log = logging.getLogger("tts")

# Rollarga ovoz jadvali. Ikki o'zbek ovozi bor: Madina (ayol), Sardor (erkak).
# Sudya, prokuror, guvoh (Mansur Rahimov, erkak — 3D model bilan mos) va sudlanuvchi — hammasi Sardor, shuning uchun
# tezlik/balandlik bilan farqlanadi: guvoh eng past va xotirjam (-16 Hz), sudya sekin va vazmin (-4 Hz),
# prokuror tez va qat'iy (+6 Hz), sudlanuvchi sekin va baland (+10 Hz). Kotib — Madina.
VOICES: dict[str, dict[str, str]] = {
    "judge": {"voice": "uz-UZ-SardorNeural", "rate": "-5%", "pitch": "-4Hz"},
    "prosecutor": {"voice": "uz-UZ-SardorNeural", "rate": "+8%", "pitch": "+6Hz"},
    "witness": {"voice": "uz-UZ-SardorNeural", "rate": "+3%", "pitch": "-16Hz"},
    "clerk": {"voice": "uz-UZ-MadinaNeural", "rate": "+5%", "pitch": "+0Hz"},
    "defense": {"voice": "uz-UZ-MadinaNeural", "rate": "+0%", "pitch": "+0Hz"},  # talaba savoli (agar o'qilsa)
    "defendant": {"voice": "uz-UZ-SardorNeural", "rate": "-8%", "pitch": "+10Hz"},
    # ta'lim rejimidagi ustoz: Madina, lekin kotibdan farqli — sekinroq va pastroq (iliq, tushuntiruvchi ohang)
    "tutor": {"voice": "uz-UZ-MadinaNeural", "rate": "-6%", "pitch": "-8Hz"},
}


def voice_for(speaker: str) -> dict[str, str]:
    return VOICES.get(speaker, VOICES["judge"])


class TTSProvider:
    name = "none"

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}

    def cache_key(self, text: str, speaker: str) -> str:
        v = voice_for(speaker)
        raw = f"{self.name}|{v['voice']}|{v['rate']}|{v['pitch']}|{text.strip()}"
        return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:20]

    def cached_path(self, text: str, speaker: str) -> Path:
        return self.cache_dir / f"{self.cache_key(text, speaker)}.mp3"

    async def synth(self, text: str, speaker: str) -> str | None:
        """mp3 fayl nomini qaytaradi (cache/ ichida) yoki None. Xato bo'lsa None — javob to'xtamaydi."""
        if self.name == "none" or not text.strip():
            return None
        path = self.cached_path(text, speaker)
        if path.exists() and path.stat().st_size > 0:
            return path.name
        lock = self._locks.setdefault(path.name, asyncio.Lock())
        async with lock:
            if path.exists() and path.stat().st_size > 0:
                return path.name
            tmp = path.with_suffix(f".{os.getpid()}.tmp")
            t0 = time.perf_counter()
            try:
                await asyncio.wait_for(self._generate(text, voice_for(speaker), tmp), timeout=settings.tts_timeout_s)
                os.replace(tmp, path)
                log.info("TTS %s %.2fs: %s", self.name, time.perf_counter() - t0, text[:40])
                return path.name
            except Exception as e:  # noqa: BLE001
                log.error("TTS xato (%s): %s", self.name, e)
                tmp.unlink(missing_ok=True)
                return None

    def cached_name(self, text: str, speaker: str) -> str | None:
        if self.name == "none" or not text.strip():
            return None
        path = self.cached_path(text, speaker)
        return path.name if path.exists() and path.stat().st_size > 0 else None

    async def stream(self, text: str, speaker: str):
        """mp3 baytlarini bo'laklab beradi (keshdan yoki generatsiya qilib). Oxirida keshga yoziladi."""
        name = self.cached_name(text, speaker) or await self.synth(text, speaker)
        if name:
            yield (self.cache_dir / name).read_bytes()

    async def _generate(self, text: str, voice: dict[str, str], out: Path) -> None:
        raise NotImplementedError


class NoTTS(TTSProvider):
    name = "none"


class EdgeTTS(TTSProvider):
    name = "edge"

    async def stream(self, text: str, speaker: str):
        """Birinchi bayt kelishi bilan uzatadi (~1,6–2,5 s), bir vaqtda keshga yozadi."""
        name = self.cached_name(text, speaker)
        if name:
            yield (self.cache_dir / name).read_bytes()
            return
        import edge_tts

        v = voice_for(speaker)
        path = self.cached_path(text, speaker)
        buf = bytearray()
        try:
            comm = edge_tts.Communicate(text, v["voice"], rate=v["rate"], pitch=v["pitch"])
            async for ch in comm.stream():
                if ch.get("type") == "audio" and ch.get("data"):
                    buf += ch["data"]
                    yield ch["data"]
        except Exception as e:  # noqa: BLE001
            log.error("edge-tts stream xato: %s", e)
            return
        if buf and not path.exists():
            tmp = path.with_suffix(f".{os.getpid()}.s.tmp")
            tmp.write_bytes(bytes(buf))
            os.replace(tmp, path)

    async def _generate(self, text: str, voice: dict[str, str], out: Path) -> None:
        import edge_tts

        comm = edge_tts.Communicate(text, voice["voice"], rate=voice["rate"], pitch=voice["pitch"])
        await comm.save(str(out))
        if not out.exists() or out.stat().st_size == 0:
            raise RuntimeError("edge-tts bo'sh audio qaytardi")


class AzureTTS(TTSProvider):
    name = "azure"

    def __init__(self, cache_dir: Path, key: str, region: str):
        super().__init__(cache_dir)
        self.key, self.region = key, region

    async def _generate(self, text: str, voice: dict[str, str], out: Path) -> None:
        ssml = (
            "<speak version='1.0' xml:lang='uz-UZ'>"
            f"<voice name='{voice['voice']}'><prosody rate='{voice['rate']}' pitch='{voice['pitch']}'>"
            f"{html.escape(text)}</prosody></voice></speak>"
        )
        async with httpx.AsyncClient(timeout=settings.tts_timeout_s) as client:
            r = await client.post(
                f"https://{self.region}.tts.speech.microsoft.com/cognitiveservices/v1",
                headers={"Ocp-Apim-Subscription-Key": self.key, "Content-Type": "application/ssml+xml",
                         "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "sud-trenajyori"},
                content=ssml.encode("utf-8"),
            )
        if r.status_code != 200:
            raise RuntimeError(f"Azure TTS {r.status_code}: {r.text[:200]}")
        out.write_bytes(r.content)


def make_tts() -> TTSProvider:
    p = settings.tts_provider
    cache = settings.cache_dir
    if p == "none":
        return NoTTS(cache)
    if p in ("azure", "auto") and settings.azure_speech_key:
        return AzureTTS(cache, settings.azure_speech_key, settings.azure_speech_region)
    try:
        import edge_tts  # noqa: F401

        return EdgeTTS(cache)
    except ImportError:
        log.warning("edge-tts o'rnatilmagan — TTS o'chirilgan")
        return NoTTS(cache)
