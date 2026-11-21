"""server/prompts/*.md dan promptlarni yig'ish.

Yashirin fakt MATNI guvoh uni ochmaguncha promptga qo'shilmaydi — faqat ochilish sharti (reveal_when_uz).
"""
from __future__ import annotations

import json
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from .config import settings
from .modes import hidden_condition_for_prompt, strip_secret

if TYPE_CHECKING:
    from .content import Content
    from .engine import Session

SPEAKER_UZ = {"judge": "Raislik qiluvchi", "witness": "Guvoh", "prosecutor": "Prokuror", "defense": "Himoyachi",
              "defendant": "Sudlanuvchi", "clerk": "Kotib"}


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    return (settings.prompts_dir / f"{name}.md").read_text(encoding="utf-8")


def _j(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)


def build_turn_prompt(content: "Content", s: "Session", stage: dict, student_text: str) -> tuple[str, str]:
    case = content.case
    w = case.get("witness", {})
    hidden = w.get("hidden_fact") or {}
    roles = [load_prompt("judge")]
    allowed = stage.get("allowed_speakers", [])
    if "witness" in allowed:
        roles.append(load_prompt("witness"))
    if "prosecutor" in allowed:
        roles.append(load_prompt("prosecutor"))

    articles = [{"id": a["id"], "ref": a["ref"], "title_uz": a.get("title_uz", ""), "text_uz": a.get("text_uz", "")}
                for a in content.articles.values()]
    violations = [{"id": v["id"], "name_uz": v.get("name_uz", ""), "detect_hint_uz": v.get("detect_hint_uz", ""),
                   "article_ids": v.get("article_ids", [])} for v in content.violations.values()]
    stage_info = {
        "id": stage["id"], "name_uz": stage.get("name_uz"), "goal_uz": stage.get("goal_uz"),
        "judge_hint_uz": stage.get("judge_hint_uz"), "next_on_uz": stage.get("next_on_uz"),
        "allowed_ai_speakers": [x for x in allowed if x in ("judge", "witness", "prosecutor")],
    }
    case_info = {k: case.get(k) for k in ("title_uz", "summary_uz", "charge", "defendant", "facts_uz", "evidence",
                                          "prosecutor_position_uz")}
    witness_info: dict[str, Any] = {
        "name": w.get("name"), "role_uz": w.get("role_uz"),
        # fakt ochilmaguncha mavzu so'zlari (ko'zoynak ...) LLM ga berilmaydi — o'zi to'qib aytmasin
        "persona_uz": w.get("persona_uz") if s.witness_revealed else strip_secret(w.get("persona_uz", "")),
        "public_facts_uz": w.get("public_facts_uz", []),
        "hidden_fact_condition_uz": hidden_condition_for_prompt(content),
        "hidden_fact_revealed": s.witness_revealed,
    }
    if s.witness_revealed:
        witness_info["revealed_fact_uz"] = hidden.get("text_uz", "")

    system = "\n\n".join([
        load_prompt("system"),
        *roles,
        "# Ish materiali\n" + _j(case_info),
        "# Guvoh\n" + _j(witness_info),
        "# Joriy bosqich\n" + _j(stage_info),
        "# Moddalar ro'yxati (faqat shu id lar)\n" + _j(articles),
        "# Qoidabuzarliklar ro'yxati (faqat shu id lar)\n" + _j(violations),
    ])
    recent = [e for e in s.log if e.stage_id == s.stage_id][-8:]
    transcript = "\n".join(f"{SPEAKER_UZ.get(e.speaker, e.speaker)}: {e.text}" for e in recent[:-1])
    user = (f"Bosqichdagi so'nggi gaplar:\n{transcript or '(hali yo`q)'}\n\n"
            f"Himoyachi (talaba) hozir aytdi:\n\"{student_text}\"\n\n"
            "Kim javob beradi va nima deydi? Faqat JSON qaytar.")
    return system, user


def build_rubric_prompt(content: "Content", s: "Session", criteria: list[dict]) -> tuple[str, str]:
    articles = [{"id": a["id"], "ref": a["ref"], "title_uz": a.get("title_uz", "")} for a in content.articles.values()]
    lines = []
    for e in s.log:
        tag = ""
        if e.violation_id and e.speaker == "defense":
            v = content.violations.get(e.violation_id) or {}
            tag = f" [QOIDABUZARLIK: {v.get('name_uz') or e.violation_id}]"
        elif e.kind == "motion" and e.speaker == "defense":
            ok = e.log_id == s.trap_motion_log_id
            tag = (" [RAISLIK QILUVCHIGA MUROJAAT: qanoatlantirildi]" if ok else
                   " [ASOSSIZ MUROJAAT: rad etildi — ijobiy iqtibos qilinmaydi]")
        elif e.kind == "meta" and e.speaker == "defense":
            tag = " [ISHGA ALOQASIZ / META GAP — baholanmaydi]"
        lines.append(f"[{e.stage_id}] {SPEAKER_UZ.get(e.speaker, e.speaker).upper()}: {e.text}{tag}")
    system = "\n\n".join([
        load_prompt("rubric"),
        "# Mezonlar\n" + _j([{k: c[k] for k in ("id", "name_uz", "description_uz")} for c in criteria]),
        "# Moddalar ro'yxati (faqat shu id lar)\n" + _j(articles),
        "# Kod faktlari (o'zgartirma)\n" + _j({"trap_state": s.trap_state, "invalid_motions": s.motions_invalid,
                                               "violations": [e.violation_id for e in s.log
                                                              if e.speaker == "defense" and e.violation_id]}),
        "# Ish qisqacha\n" + _j({"title_uz": content.case.get("title_uz"),
                                  "evidence": content.case.get("evidence", []),
                                  "defense_brief_uz": content.case.get("defense_brief_uz")}),
    ])
    user = "Bayonnoma:\n" + "\n".join(lines) + "\n\nHar mezon uchun JSON qaytar."
    return system, user


def build_exam_prompt(content: "Content") -> tuple[str, str]:
    """Prokurorning guvoh so'rog'i (tuzoq savol bilan) uchun prompt. Yashirin fakt matni berilmaydi."""
    case = content.case
    w = case.get("witness", {})
    info = {
        "title_uz": case.get("title_uz"), "charge": case.get("charge"), "defendant": case.get("defendant", {}).get("name"),
        "prosecutor_position_uz": case.get("prosecutor_position_uz"),
        "witness": {"name": w.get("name"), "role_uz": w.get("role_uz"),
                    "persona_uz": strip_secret(w.get("persona_uz", "")),
                    "public_facts_uz": w.get("public_facts_uz", [])},
    }
    system = "\n\n".join([load_prompt("prosecutor_exam"), "# Ish materiali\n" + _j(info)])
    return system, "Prokuror so'rog'ini yoz. Faqat JSON."
