"""O'qituvchi paneli (R14): xotiradagi sessiyalar ro'yxati, rubrika va tasdiq.

Yakuniy baho — odamniki (O'RQ-1115 ruhida): AI faqat tavsiya beradi, o'qituvchi tasdiqlaydi.
Ma'lumot faqat xotirada (server qayta ishga tushsa yo'qoladi) — demo/MVP uchun ataylab shunday.
"""
from __future__ import annotations

from typing import Any

from .content import Content
from .engine import Session, now_iso
from .providers.llm import MockLLM
from .report import _fmt_dt, build_rubric, bayonnoma_html, student_entries
from .textutil import uz_apos

STATUS_UZ = {"active": "davom etmoqda", "finished": "yakunlangan"}


def is_finished(s: Session) -> bool:
    """Faqat /finish qo'ygan natija yoki majlis yopilgan. O'qituvchining bayonnoma / rubrika ko'rishi bu bayroqlarni
    o'zgartirmaydi (oraliq bayonnoma keshga yozilmaydi)."""
    return bool(s.finished) or s.closed


def trap_caught(s: Session) -> bool | None:
    """True — tuzoq savol payqaldi, False — o'tkazib yuborildi, None — hali bo'lmagan / rejimda yo'q."""
    if s.trap_state == "caught":
        return True
    if s.trap_state == "missed":
        return False
    return None


def summary(content: Content, s: Session) -> dict[str, Any]:
    status = "finished" if is_finished(s) else "active"
    rub = (s.finished or {}).get("rubric") or {}
    stage = content.stage(s.stage_id) if s.stage_id else None
    return {
        "id": s.id,
        "student_name": s.student_name or "Talaba",
        "mode": s.mode,
        "started_at": s.created_at,
        "last_activity": s.log[-1].t if s.log else s.created_at,
        "status": status,
        "status_uz": STATUS_UZ[status],
        "stage_uz": (stage or {}).get("name_uz") if isinstance(stage, dict) else None,
        "score": rub.get("total") if rub else None,
        "max": rub.get("max") if rub else None,
        "violations": sum(1 for e in student_entries(s) if e.violation_id),
        "revealed_hidden_fact": s.witness_revealed,
        "trap_caught": trap_caught(s),
        "hints_used": s.hints_used,
        "approval": s.teacher_approval,
    }


async def detail(content: Content, s: Session, base_url: str) -> dict[str, Any]:
    """Yakunlangan bo'lsa — /finish rubrikasi; aks holda kod bo'yicha dastlabki rubrika (LLM chaqirilmaydi)."""
    if s.finished:
        rubric, final = s.finished["rubric"], True
    else:
        rubric, final = await build_rubric(content, s, MockLLM()), False
    return {**summary(content, s), "rubric": rubric, "rubric_final": final,
            "bayonnoma_url": f"{base_url}/session/{s.id}/bayonnoma"}


def approve(content: Content, s: Session, teacher_name: str, comment: str | None,
            rubric: dict[str, Any] | None = None) -> dict[str, Any]:
    """Tasdiqni xotirada saqlaydi va keshdagi bayonnomani yangilaydi (\"O'qituvchi tasdiqladi: ism, vaqt, ball\").
    Tasdiq aynan o'qituvchi ko'rgan ballga bog'lanadi (total/max nusxasi): sessiya keyin o'zgarsa bayonnomada
    «baho o'zgargan» ogohlantirishi chiqadi."""
    rub = rubric or (s.finished or {}).get("rubric") or {}
    s.teacher_approval = {"teacher_name": uz_apos(teacher_name.strip()), "comment": uz_apos((comment or "").strip()),
                          "approved_at": now_iso(), "total": rub.get("total"), "max": rub.get("max"),
                          "rubric_final": bool(s.finished)}
    if s.finished:
        s.finished["bayonnoma_html"] = bayonnoma_html(content, s, s.finished["rubric"])
    return s.teacher_approval


def public_approval(s: Session) -> dict[str, Any]:
    """Talaba (natija ekrani) uchun: faqat shu sessiyaning tasdiq holati, PIN siz. Baho va boshqa sessiyalar yo'q.
    {approved, teacher_name, at, at_uz, comment} — tasdiqlanmagan bo'lsa qolgan maydonlar null."""
    a = s.teacher_approval
    if not a:
        return {"session_id": s.id, "approved": False, "teacher_name": None, "at": None, "at_uz": None,
                "comment": None}
    at = a.get("approved_at") or None
    return {"session_id": s.id, "approved": True, "teacher_name": a.get("teacher_name") or None, "at": at,
            "at_uz": _fmt_dt(at) if at else None, "comment": a.get("comment") or None}
