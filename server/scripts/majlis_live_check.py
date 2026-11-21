"""Real LLM bilan majlis rejimi sinovi: sud tergoviga o'tish -> prokuror so'rog'i (tuzoq savol) -> murojaat -> qaror.

    cd server
    python scripts/majlis_live_check.py            # tuzoqni payqash (motion_reject_question)
    python scripts/majlis_live_check.py --miss     # oyna o'tkazib yuboriladi (continue)

Jarayon ichida, server/.env dagi kalitlar bilan (kalit qiymati chiqarilmaydi). TTS o'chiq.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("TTS_PROVIDER", "none")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import engine  # noqa: E402
from app.report import finish_session  # noqa: E402


def show(title: str, r: dict) -> None:
    print(f"\n=== {title}  ({r['timings'].get('total_ms')} ms, source={r['source']})")
    print(f"  [{r['speaker']}] {r['text_uz']}")
    for f in r["followups"]:
        print(f"  + [{f['speaker']}/{f['kind']}] {f['text_uz']}")
    print(f"  floor={r['floor']}  window={r['window']}")
    if r.get("violation"):
        print(f"  violation={r['violation']['id']} {r['violation']['article_ref']}")


async def main(miss: bool) -> None:
    print(f"LLM: {engine.llm.name}")
    s, e, _ = await engine.start(None, "Sinov", "majlis")
    print(f"[judge] {e.text}")
    await asyncio.sleep(0)  # fon vazifasi (prokuror so'rog'i) boshlansin
    t0 = time.perf_counter()
    r = await engine.turn(s, "Hurmatli sud, iltimosim yo'q, sud tergoviga o'tishga tayyorman.")
    show(f"sud tergovi (prokuror so'rog'i manbasi: {s.exam_source}, {time.perf_counter() - t0:.1f}s)", r)
    if miss:
        show("oyna o'tdi (continue)", await engine.turn(s, "", action="continue"))
    else:
        show("so'z so'rash", await engine.turn(s, "", action="request_floor"))
        show("murojaat", await engine.turn(s, "", action="motion_reject_question"))
    show("himoyachi savoli", await engine.turn(s, "Guvoh, o'sha paytda siz qayerda turgan edingiz?"))
    show("himoyachining ishora qiluvchi savoli",
         await engine.turn(s, "Siz uni uzoqdan aniq ko'rmagansiz, to'g'rimi?"))
    res = await finish_session(engine.content, s, engine.llm)
    rub = res["rubric"]
    print(f"\nRubrika: {rub['total']}/{rub['max']} " + ", ".join(f"{c['id']}={c['level']}" for c in rub["criteria"]))
    lst = next(c for c in rub["criteria"] if c["id"] == "tinglash")
    print(f"  tinglash: {lst['comment_uz']} | iqtibos: {lst['evidence_quote']!r} | {lst['article_ref']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--miss", action="store_true")
    asyncio.run(main(ap.parse_args().miss))
