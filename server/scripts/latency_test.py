"""20 daqiqalik kechikish testi (research/texnik-ai.md §11). Kalitlar server/.env dan.

Ishlatish (server/ papkasidan):
  # 1) jarayon ichida, real provayderlar bilan (GEMINI_API_KEY / AISHA_API_KEY .env da):
  python scripts/latency_test.py --minutes 20
  # 2) tez tekshiruv: 1 ta raund
  python scripts/latency_test.py --rounds 1
  # 3) ishlab turgan server orqali (deploydan keyin ham):
  python scripts/latency_test.py --url http://localhost:8000 --rounds 3
  # 4) STT ham o'lchash: telefonda yozilgan 10 s lik fayllar (mp3/wav/ogg/webm) papkasi
  python scripts/latency_test.py --audio-dir C:/path/to/yozuvlar --rounds 1

Natija: jadval (p50/p95) + logs/latency-<vaqt>.csv. Maqsad: oddiy navbat < 4 s, qoidabuzarlik ~1 s (oldindan mp3).
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

SERVER = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER))

from app.config import settings  # noqa: E402
from app.content import load_content  # noqa: E402

MIME = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".ogg": "audio/ogg", ".webm": "audio/webm", ".m4a": "audio/mp4"}


def scenario(content) -> list[tuple[str, str | None]]:
    """(matn, action) ro'yxati: ochilish -> so'roq (tests.json dan) -> muzokara -> yakun."""
    q = content.stage_by_kind("questioning")
    a = content.stage_by_kind("arguments")
    qs = [t["input_uz"] for t in content.tests if q and t["stage_id"] == q["id"]][:8]
    if not qs:
        qs = ["Guvoh, o'sha kuni nimani ko'rdingiz?", "Siz qayerda turgan edingiz?"]
    speech = next((t["input_uz"] for t in content.tests if a and t["stage_id"] == a["id"]
                   and not t["expected_violation_id"]),
                  "Hurmatli sud, ayb isbotlanmagan, shubhalar sudlanuvchi foydasiga, oqlashni so'rayman.")
    return [("Hurmatli sud, iltimoslarim yo'q, tayyorman.", None), *[(x, None) for x in qs],
            ("Savollarim tugadi.", None), (speech, None), ("Nutqim tugadi.", None)]


def pct(xs: list[float], p: float) -> float:
    if not xs:
        return 0.0
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(round(p * (len(xs) - 1))))]


async def run_inprocess(args, rows: list[dict]) -> None:
    from app.engine import Engine
    from app.providers.llm import make_llm
    from app.providers.stt import make_stt
    from app.providers.tts import make_tts

    settings.tts_mode = "inline"  # TTS vaqti /turn ichida o'lchanadi
    content = load_content(force=True)
    eng = Engine(lambda: content, make_llm(), make_tts(), make_stt())
    print(f"LLM={eng.llm.name} ({getattr(eng.llm, 'model', '-')}) STT={eng.stt.name} TTS={eng.tts.name} "
          f"kontent={content.source}")
    if args.audio_dir:
        for f in sorted(Path(args.audio_dir).glob("*")):
            if f.suffix.lower() not in MIME:
                continue
            t0 = time.perf_counter()
            try:
                text = await eng.stt.transcribe(f.read_bytes(), MIME[f.suffix.lower()])
                err = ""
            except Exception as e:  # noqa: BLE001
                text, err = "", str(e)
            ms = (time.perf_counter() - t0) * 1000
            print(f"STT {f.name}: {ms:.0f} ms -> {text[:80]!r} {err}")
            rows.append({"kind": "stt", "input": f.name, "stt_ms": round(ms), "output": text, "error": err})
    deadline = time.time() + args.minutes * 60 if args.minutes else None
    rnd = 0
    while (deadline and time.time() < deadline) or (not deadline and rnd < args.rounds):
        rnd += 1
        s, _, _ = await eng.start(None, "latency")
        for text, action in scenario(content):
            t0 = time.perf_counter()
            r = await eng.turn(s, text, action=action)
            wall = (time.perf_counter() - t0) * 1000
            tm = r["timings"]
            rows.append({"kind": "turn", "round": rnd, "stage": r["stage_id"], "input": text[:60],
                         "speaker": r["speaker"], "source": r["source"], "violation": (r["violation"] or {}).get("id"),
                         "reveal": r["revealed_hidden_fact"], "llm_ms": tm.get("llm_ms", 0),
                         "tts_ms": tm.get("tts_ms", 0), "total_ms": round(wall), "output": r["text_uz"][:80]})
            print(f"[{rnd}] {r['source']:<18} llm {tm.get('llm_ms', 0):>6.0f}  tts {tm.get('tts_ms', 0):>6.0f}  "
                  f"jami {wall:>6.0f} ms  {r['speaker']:<10} {r['text_uz'][:60]}")
            if s.closed:
                break
        if deadline and time.time() < deadline:
            await asyncio.sleep(args.pause)


async def run_http(args, rows: list[dict]) -> None:
    import httpx

    content = load_content(force=True)
    async with httpx.AsyncClient(base_url=args.url, timeout=30) as cl:
        h = (await cl.get("/health")).json()
        print("server:", h)
        deadline = time.time() + args.minutes * 60 if args.minutes else None
        rnd = 0
        while (deadline and time.time() < deadline) or (not deadline and rnd < args.rounds):
            rnd += 1
            sid = (await cl.post("/session/start", json={"student_name": "latency"})).json()["session_id"]
            for text, action in scenario(content):
                t0 = time.perf_counter()
                r = (await cl.post("/turn", json={"session_id": sid, "text": text, "action": action})).json()
                t_text = (time.perf_counter() - t0) * 1000
                t_audio = 0.0
                if r.get("audio_url"):
                    a0 = time.perf_counter()
                    await cl.get(r["audio_url"])
                    t_audio = (time.perf_counter() - a0) * 1000
                total = t_text + t_audio
                rows.append({"kind": "turn", "round": rnd, "stage": r.get("stage_id"), "input": text[:60],
                             "speaker": r.get("speaker"), "source": r.get("source"),
                             "violation": (r.get("violation") or {}).get("id"), "reveal": r.get("revealed_hidden_fact"),
                             "llm_ms": r.get("timings", {}).get("llm_ms", 0), "tts_ms": round(t_audio),
                             "total_ms": round(total), "output": (r.get("text_uz") or "")[:80]})
                print(f"[{rnd}] matn {t_text:>6.0f} ms + audio {t_audio:>6.0f} ms = {total:>6.0f} ms  "
                      f"{r.get('speaker')}: {(r.get('text_uz') or '')[:60]}")
                if r.get("finished"):
                    break
            if deadline and time.time() < deadline:
                await asyncio.sleep(args.pause)


def summary(rows: list[dict]) -> None:
    turns = [r for r in rows if r["kind"] == "turn"]
    if not turns:
        return
    groups = {
        "hammasi": turns,
        "pre-check (LLM siz)": [r for r in turns if r["source"] == "precheck"],
        "LLM navbatlari": [r for r in turns if str(r["source"]).startswith("llm")],
    }
    print("\n=== Natija (ms) ===")
    print(f"{'guruh':<22}{'n':>4}{'p50':>8}{'p95':>8}{'max':>8}   LLM p50   TTS p50")
    for name, g in groups.items():
        if not g:
            continue
        tot = [r["total_ms"] for r in g]
        print(f"{name:<22}{len(g):>4}{pct(tot, .5):>8.0f}{pct(tot, .95):>8.0f}{max(tot):>8.0f}"
              f"   {statistics.median([r['llm_ms'] for r in g]):>7.0f}   {statistics.median([r['tts_ms'] for r in g]):>7.0f}")
    fb = sum(1 for r in turns if str(r["source"]).endswith("fallback"))
    print(f"LLM fallback (mock zaxira): {fb} ta;  < 4 s: {sum(r['total_ms'] < 4000 for r in turns)}/{len(turns)}")
    stt = [r["stt_ms"] for r in rows if r["kind"] == "stt"]
    if stt:
        print(f"STT: n={len(stt)} p50={pct(stt, .5):.0f} ms p95={pct(stt, .95):.0f} ms")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutes", type=float, default=0, help="shuncha daqiqa takrorlash (20 daqiqalik test)")
    ap.add_argument("--rounds", type=int, default=1, help="--minutes berilmasa, nechta to'liq raund")
    ap.add_argument("--pause", type=float, default=5, help="raundlar orasidagi pauza, s")
    ap.add_argument("--url", help="ishlab turgan server manzili (bo'lmasa jarayon ichida)")
    ap.add_argument("--audio-dir", help="STT o'lchash uchun audio fayllar papkasi (faqat jarayon ichida)")
    args = ap.parse_args()
    rows: list[dict] = []
    try:
        asyncio.run(run_http(args, rows) if args.url else run_inprocess(args, rows))
    except KeyboardInterrupt:
        print("\nto'xtatildi")
    summary(rows)
    settings.log_dir.mkdir(parents=True, exist_ok=True)
    out = settings.log_dir / f"latency-{datetime.now():%Y%m%d-%H%M%S}.csv"
    keys = sorted({k for r in rows for k in r})
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        w.writerows(rows)
    print("CSV:", out)


if __name__ == "__main__":
    main()
