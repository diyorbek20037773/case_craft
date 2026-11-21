"""Kontentni yuklash: content/case.json + content/rules.json (+ tests.json).

Ikkala asosiy fayl content/ da bo'lsa o'sha ishlatiladi, aks holda server/fixtures/ (xuddi shu sxema).
Fayllar o'zgarsa (mtime) keyingi sessiyada qayta yuklanadi.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .config import PROJECT_DIR, settings

log = logging.getLogger("content")

# Rol nomlari kontentda inglizcha yoki o'zbekcha bo'lishi mumkin — ichki nomga keltiramiz.
SPEAKER_ALIASES = {
    "judge": "judge", "sudya": "judge", "raislik": "judge", "raislik_qiluvchi": "judge", "rais": "judge",
    "witness": "witness", "guvoh": "witness",
    "prosecutor": "prosecutor", "prokuror": "prosecutor", "davlat_ayblovchisi": "prosecutor",
    "defense": "defense", "defence": "defense", "himoyachi": "defense", "advokat": "defense", "student": "defense",
    "defendant": "defendant", "sudlanuvchi": "defendant",
    "clerk": "clerk", "kotib": "clerk",
}

# stage_ids berilmagan qoidabuzarliklar uchun regex qo'llanadigan bosqich turlari (content/README.md bo'yicha:
# yo'naltiruvchi / aloqasiz savol va "bosqichdan tashqari" faqat guvoh so'roqida; muzokarada "oqlashni so'rayman" to'g'ri).
VIOLATION_SCOPE_KINDS = {
    "yonaltiruvchi_savol": ["questioning"],
    "bosqichdan_tashqari": ["questioning"],
    "aloqasiz_savol": ["questioning"],
}

ARTICLE_NUM_RE = re.compile(r"(\d+(?:\s*[-–]\s*\d+)?)\s*[-–]?\s*(modda|bob)", re.IGNORECASE)


def article_key(m: re.Match) -> str:
    """ARTICLE_NUM_RE mosligidan "408-modda" / "52-bob" ko'rinishidagi kalit."""
    num = re.sub(r"\s+", "", m.group(1)).replace("–", "-")
    return f"{num}-{m.group(2).lower()}"


_NOTE_RX = re.compile(
    r"\s*\((?P<note>[^()]*(?:mazmun|tekshiri|lex\.uz|yurist|so['’ʻ]?zma-so['’ʻ]?z|qidiruv|tahrir)[^()]*)\)\s*$",
    re.IGNORECASE)


def split_article_note(text: str) -> tuple[str, str]:
    """Modda matni oxiridagi ichki izohni ajratadi: ("matn", "Mazmuni; rus tahriri ..."). Izoh bo'lmasa (matn, "")."""
    m = _NOTE_RX.search(text or "")
    if not m:
        return (text or "").strip(), ""
    return text[:m.start()].strip(), m.group("note").strip()


def norm_speaker(s: str) -> str:
    key = (s or "").strip().lower().replace(" ", "_").replace("'", "")
    return SPEAKER_ALIASES.get(key, key)


@dataclass
class Content:
    case: dict[str, Any]
    rules: dict[str, Any]
    tests: list[dict[str, Any]]
    source: str  # "content" | "fixtures"
    stages: list[dict[str, Any]] = field(default_factory=list)
    articles: dict[str, dict[str, Any]] = field(default_factory=dict)
    violations: dict[str, dict[str, Any]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        stages = sorted(self.rules.get("stages", []), key=lambda s: s.get("order", 0))
        for s in stages:
            s["allowed_speakers"] = [norm_speaker(x) for x in s.get("allowed_speakers", [])]
        case_ids = self.case.get("stage_ids") or []
        if case_ids:
            by_id = {s["id"]: s for s in stages}
            missing = [i for i in case_ids if i not in by_id]
            if missing:
                self.warnings.append(f"case.stage_ids rules.json da yo'q: {missing}")
            picked = [by_id[i] for i in case_ids if i in by_id]
            stages = sorted(picked, key=lambda s: s.get("order", 0)) or stages
        self.stages = stages
        self.articles = {a["id"]: a for a in self.rules.get("articles", [])}
        for a in self.articles.values():
            # Modda matni yurist tomonidan so'zma-so'z tasdiqlanmaguncha verified=false (UI/bayonnomada ko'rsatiladi)
            a["verified"] = bool(a.get("verified", False))
            # «(Mazmuni; rus tahriri bo'yicha tekshirildi...)» — ichki izoh: foydalanuvchiga chiqmaydi, note_uz da qoladi
            text, note = split_article_note(str(a.get("text_uz") or ""))
            if note:
                a["text_uz"] = text
                a["note_uz"] = note
            else:
                a.setdefault("note_uz", "")
        self.violations = {v["id"]: v for v in self.rules.get("violations", [])}
        for v in self.violations.values():
            # Kod pre-check qaysi bosqichlarda ishlaydi: aniq stage_ids > server siyosati (bosqich turi) > hamma bosqich
            if v.get("stage_ids"):
                v["_scope"] = list(v["stage_ids"])
            elif v["id"] in VIOLATION_SCOPE_KINDS:
                kinds = VIOLATION_SCOPE_KINDS[v["id"]]
                v["_scope"] = [s["id"] for s in self.stages if self.stage_kind(s) in kinds]
            else:
                v["_scope"] = None
            bad = [a for a in v.get("article_ids", []) if a not in self.articles]
            if bad:
                self.warnings.append(f"violation {v['id']}: noma'lum article_ids {bad}")
            v["_compiled"] = []
            for rx in v.get("regex_uz", []):
                try:
                    v["_compiled"].append(re.compile(rx, re.IGNORECASE))
                except re.error as e:
                    self.warnings.append(f"violation {v['id']}: regex xato {rx!r}: {e}")
        for w in self.warnings:
            log.warning(w)

    # --- yordamchilar ---
    def stage(self, stage_id: str) -> dict[str, Any] | None:
        return next((s for s in self.stages if s["id"] == stage_id), None)

    def stage_index(self, stage_id: str) -> int:
        return next((i for i, s in enumerate(self.stages) if s["id"] == stage_id), -1)

    def next_stage(self, stage_id: str) -> dict[str, Any] | None:
        i = self.stage_index(stage_id)
        return self.stages[i + 1] if 0 <= i < len(self.stages) - 1 else None

    def stage_kind(self, stage: dict[str, Any]) -> str:
        """Bosqich turini allowed_speakers va nomdan aniqlaydi (kontent id lari har xil bo'lishi mumkin)."""
        idx = self.stage_index(stage["id"])
        name = (stage["id"] + " " + stage.get("name_uz", "")).lower()
        if "witness" in stage.get("allowed_speakers", []) or "tergov" in name:
            return "questioning"
        if "muzokara" in name or "prenie" in name:
            return "arguments"
        if "oxirgi" in name:
            return "last_word"
        if idx == len(self.stages) - 1:
            return "closing"
        if idx == 0:
            return "opening"
        return "generic"

    def stage_by_kind(self, kind: str) -> dict[str, Any] | None:
        return next((s for s in self.stages if self.stage_kind(s) == kind), None)

    def articles_for_stage(self, stage_id: str) -> list[dict[str, Any]]:
        return [a for a in self.articles.values() if stage_id in (a.get("stage_ids") or [])]

    def known_article_numbers(self) -> set[str]:
        """rules.json dagi ref lardan "408-modda", "52-bob" kabi kalitlar to'plami."""
        nums: set[str] = set()
        for a in self.articles.values():
            for m in ARTICLE_NUM_RE.finditer(a.get("ref", "")):
                nums.add(article_key(m))
        return nums

    def public_case(self) -> dict[str, Any]:
        """Frontend uchun ish materiali — yashirin faktsiz."""
        c = json.loads(json.dumps(self.case))
        w = c.get("witness", {})
        w.pop("hidden_fact", None)
        w.pop("prosecutor_exam", None)  # tuzoq savol oldindan ko'rinmasin
        return c

    def public_rules(self) -> dict[str, Any]:
        return {
            "stages": self.stages,
            "articles": list(self.articles.values()),
            "violations": [{k: v for k, v in x.items() if not k.startswith("_")} for x in self.violations.values()],
            "source": self.source,
        }


def _read(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def _content_dir() -> Path:
    return Path(settings.content_dir) if settings.content_dir else PROJECT_DIR / "content"


def _pick_dir() -> tuple[Path, str]:
    cdir = _content_dir()
    if (cdir / "case.json").exists() and (cdir / "rules.json").exists():
        return cdir, "content"
    return settings.fixtures_dir, "fixtures"


_cache: dict[str, Any] = {"key": None, "content": None}


def _mtime_key(d: Path) -> tuple:
    return tuple((p.name, p.stat().st_mtime) for p in sorted(d.glob("*.json")))


def load_content(force: bool = False) -> Content:
    d, source = _pick_dir()
    key = (str(d), _mtime_key(d))
    if not force and _cache["key"] == key and _cache["content"] is not None:
        return _cache["content"]
    try:
        tests = _read(d / "tests.json") if (d / "tests.json").exists() else []
        content = Content(case=_read(d / "case.json"), rules=_read(d / "rules.json"), tests=tests, source=source)
    except Exception as e:  # buzilgan kontent faylida demo to'xtamasin
        if source == "fixtures":
            raise
        log.error("content/ yuklanmadi (%s), fixtures ishlatiladi", e)
        fd = settings.fixtures_dir
        content = Content(case=_read(fd / "case.json"), rules=_read(fd / "rules.json"),
                          tests=_read(fd / "tests.json"), source="fixtures")
        content.warnings.append(f"content/ xato: {e}")
    _cache.update(key=key, content=content)
    log.info("Kontent yuklandi: %s (%s)", source, d)
    return content


def load_fixtures() -> Content:
    fd = settings.fixtures_dir
    return Content(case=_read(fd / "case.json"), rules=_read(fd / "rules.json"),
                   tests=_read(fd / "tests.json"), source="fixtures")
