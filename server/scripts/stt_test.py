"""20 daqiqalik STT sinovi: edge-tts bilan 5 ta o'zbekcha sud savoli (mp3) -> POST /stt -> WER va vaqt.

    cd server
    python scripts/stt_test.py                 # jarayon ichida (server/.env dagi Gemini kalitlari bilan)
    python scripts/stt_test.py --url http://localhost:8000
    python scripts/stt_test.py --webm          # brauzer formatini sinash (ffmpeg bilan mp3 -> webm/opus)

Eslatma: bu SINTETIK ovoz (edge-tts, toza studiya sifati). Real mikrofon, shovqinli zal, talaffuz va urg'u bilan
aniqlik pastroq va vaqt boshqacha bo'ladi — demodan oldin telefonda yozilgan real ovoz bilan ham sinang.
Audio faqat xotirada (fayl yozilmaydi). Kalit qiymatlari hech qayerga chiqarilmaydi.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import re
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SENTENCES = [
    "Siz uning yuzini ko'rdingizmi?",
    "Voqea paytida siz qayerda turgan edingiz?",
    "Kassa peshtaxtasidan javongacha qancha masofa bor edi?",
    "Hurmatli sud, savolni rad etishni so'rayman, savol ishora qiluvchi.",
    "O'sha kuni ko'rishingizga biror narsa ta'sir qilganmi?",
]
VOICE = "uz-UZ-SardorNeural"


def words(t: str) -> list[str]:
    t = t.lower().translate(str.maketrans({"ʻ": "'", "ʼ": "'", "‘": "'", "’": "'", "`": "'", "´": "'"}))
    return re.findall(r"[a-zа-яёўқғҳ']+|\d+", t)


def wer(ref: str, hyp: str) -> float:
    r, h = words(ref), words(hyp)
    d = [[0] * (len(h) + 1) for _ in range(len(r) + 1)]
    for i in range(len(r) + 1):
        d[i][0] = i
    for j in range(len(h) + 1):
        d[0][j] = j
    for i in range(1, len(r) + 1):
        for j in range(1, len(h) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] != h[j - 1]))
    return d[len(r)][len(h)] / max(1, len(r))


async def synth(text: str) -> bytes:
    import edge_tts

    buf = bytearray()
    async for ch in edge_tts.Communicate(text, VOICE).stream():
        if ch.get("type") == "audio" and ch.get("data"):
            buf += ch["data"]
    return bytes(buf)


def to_webm(mp3: bytes) -> bytes | None:
    ff = shutil.which("ffmpeg")
    if not ff:
        return None
    p = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-c:a", "libopus", "-b:a", "32k",
                        "-f", "webm", "pipe:1"], input=mp3, capture_output=True, timeout=30)
    return p.stdout if p.returncode == 0 and p.stdout else None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", help="tashqi server (aks holda jarayon ichida)")
    ap.add_argument("--webm", action="store_true", help="audio/webm (opus) formatida yuborish")
    args = ap.parse_args()

    if args.url:
        import httpx

        client = httpx.Client(base_url=args.url.rstrip("/"), timeout=60)
        post = client.post
    else:
        from fastapi.testclient import TestClient

        from app.main import app, engine

        print(f"STT provayder: {engine.stt.name}")
        post = TestClient(app).post  # lifespan ishga tushmaydi (kesh/warm-up shart emas)

    rows = []
    for text in SENTENCES:
        audio = asyncio.run(synth(text))
        mime = "audio/mpeg"
        if args.webm:
            w = to_webm(audio)
            if w:
                audio, mime = w, "audio/webm;codecs=opus"
        t0 = time.perf_counter()
        r = post("/stt", json={"audio_b64": base64.b64encode(audio).decode(), "mime": mime})
        wall = (time.perf_counter() - t0) * 1000
        if r.status_code != 200:
            rows.append((text, f"XATO {r.status_code}: {r.text[:120]}", 1.0, None, wall, len(audio)))
            continue
        body = r.json()
        rows.append((text, body["text_uz"], wer(text, body["text_uz"]), body["ms"], wall, len(audio)))

    print(f"\nFormat: {'webm/opus' if args.webm else 'mp3'} | ovoz: {VOICE} (sintetik)\n")
    for ref, hyp, w, ms, wall, n in rows:
        print(f"- REF: {ref}\n  HYP: {hyp}\n  WER {w:.0%} | server {ms} ms | jami {wall:.0f} ms | {n // 1024} KB")
    ok = [r for r in rows if r[3] is not None]
    if ok:
        avg_wer = sum(r[2] for r in rows) / len(rows)
        ms = [r[3] for r in ok]
        print(f"\nO'rtacha WER: {avg_wer:.1%} | STT ms: p50 {statistics.median(ms):.0f}, max {max(ms)} | "
              f"muvaffaqiyatli {len(ok)}/{len(rows)}")


if __name__ == "__main__":
    main()
