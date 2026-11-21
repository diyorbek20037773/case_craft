"""Tayyor iboralarni (ogohlantirishlar, bosqich e'lonlari, yashirin fakt, ochilish) server/cache/ ga mp3 qilib yozadi.

  python scripts/prewarm_cache.py
Server ham ishga tushganda buni fon rejimida qiladi (TTS_PREWARM=1); bu skript deploydan oldin keshni tayyorlash uchun.
"""
import asyncio
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.content import load_content  # noqa: E402
from app.engine import prewarm_phrases  # noqa: E402
from app.providers.tts import make_tts  # noqa: E402


async def main() -> None:
    tts = make_tts()
    content = load_content(force=True)
    phrases = prewarm_phrases(content)
    print(f"TTS={tts.name}, kontent={content.source}, iboralar={len(phrases)}")
    ok = 0
    for speaker, text in phrases:
        t0 = time.perf_counter()
        cached = tts.cached_name(text, speaker)
        name = cached or await tts.synth(text, speaker)
        ok += bool(name)
        print(f"{'kesh ' if cached else 'yangi'} {time.perf_counter() - t0:5.2f}s {speaker:<10} {name} {text[:50]}")
    print(f"tayyor: {ok}/{len(phrases)}")


if __name__ == "__main__":
    asyncio.run(main())
