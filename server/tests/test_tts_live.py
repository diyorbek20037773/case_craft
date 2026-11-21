"""edge-tts bilan haqiqiy o'zbekcha mp3 (internet kerak; bo'lmasa skip). Vaqtni chop etadi: pytest -s."""
import asyncio
import tempfile
import time
from pathlib import Path

import pytest

from app.providers.tts import EdgeTTS

TEXT = "Himoyachi, savol yo'naltiruvchi. Raislik qiluvchi uni rad etadi."


@pytest.mark.parametrize("speaker", ["judge", "witness"])
def test_edge_tts_generates_uzbek_mp3(speaker):
    pytest.importorskip("edge_tts")
    with tempfile.TemporaryDirectory() as d:
        tts = EdgeTTS(Path(d))
        t0 = time.perf_counter()
        name = asyncio.run(tts.synth(TEXT, speaker))
        dt = time.perf_counter() - t0
        if name is None:
            pytest.skip("edge-tts ishlamadi (internet yo'q?)")
        path = Path(d) / name
        data = path.read_bytes()
        assert len(data) > 5000
        assert data[:3] == b"ID3" or data[0] == 0xFF  # mp3 sarlavhasi
        print(f"\n[edge-tts] {speaker}: {len(data)} bayt, {dt:.2f} s")
        # kesh: ikkinchi chaqiruv tarmoqsiz va tez
        t1 = time.perf_counter()
        assert asyncio.run(tts.synth(TEXT, speaker)) == name
        assert time.perf_counter() - t1 < 0.05
