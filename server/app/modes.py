"""Rejimlar (majlis / talim), so'z navbati (floor), prokurorning guvoh so'rog'i (tuzoq savol), ustoz va bayonnoma yozuvlari.

Hammasi kod: agent iboralari research/rejim-huquq.md (a) dan, taqiqlar (b) — FORBIDDEN_RX, ustoz matnlari (c).
LLM faqat prokuror so'rog'ining matnini taklif qiladi; ishora qiluvchi savol borligini kod (regex) kafolatlaydi,
mos kelmasa tayyor shablon ishlatiladi.
"""
from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from .textutil import _APOS, contains_any, norm, split_sentences, truncate_words

if TYPE_CHECKING:
    from .content import Content

log = logging.getLogger("modes")

MODES = ("majlis", "talim")
CARD_ACTIONS = ("next_stage", "request_floor", "motion_reject_question", "hint", "continue")
WINDOW_MS = 8000
HINTS_MAX = 3
SPEAKER_UZ = {"judge": "Raislik qiluvchi", "witness": "Guvoh", "prosecutor": "Prokuror", "defense": "Himoyachi",
              "defendant": "Sudlanuvchi", "clerk": "Kotib", "tutor": "Ustoz"}

# ----------------------------------------------------------------------------- taqiqlangan iboralar (b)
_A = "['’ʻʼ‘`´]?"
FORBIDDEN_RX = re.compile(
    rf"objection|sustained|overruled|your\s+honou?r|janob\s+sudya|olijanob|kross{_A}?\s*-?\s*so{_A}ro{_A}q|"
    rf"cross-?exam|sud\s+pristavi|pristav|hakamlar\s+hay{_A}ati|e{_A}tiroz\s*!|e{_A}tiroz\s+qabul\s+qilindi|"
    rf"e{_A}tiroz\s+qo{_A}llab|hearsay|i\s+rest\s+my\s+case",
    re.IGNORECASE)


def strip_forbidden(text: str) -> tuple[str, list[str]]:
    """Taqiqlangan (amerikacha) ibora bor gaplarni olib tashlaydi."""
    kept, removed = [], []
    for s in split_sentences(text):
        (removed if FORBIDDEN_RX.search(s) else kept).append(s)
    return " ".join(kept).strip(), removed


# ----------------------------------------------------------------------------- ishora qiluvchi savol
_END = r"\s*[?.!]*\s*$"
_TG = rf"to{_A}g{_A}ri"
# Tasdiq so'rovchi (ishora qiluvchi) savol shakllari — gap oxirida: «…, to'g'rimi?», «…, to'g'ri?», «…-a?», «…, ha?»,
# «…, shundaymi / shunaqami / shunday emasmi?», «…emasmi(dingiz)?», «…, rostmi?», «tasdiqlaysizmi?». Ochiq savol
# («Ko'rishingizga biror narsa to'sqinlik qildimi?», «Ko'zingiz qanday ko'radi?») va neytral yopiq savol
# («O'sha kuni ko'zoynak taqqanmidingiz?») bunga kirmaydi.
LEADING_RX = re.compile(
    rf"(?:{_TG}(?:mi|\s+emasmi)|shunday\s*(?:mi|emasmi)|shunaqa\s*(?:mi|emasmi)|shundaymasmi|tasdiqlaysizmi"
    rf"|{_TG}\s+aytyapmanmi|\bemasmi(?:dingiz|siz|di)?|\w[-–]a|,\s*rostmi){_END}"
    rf"|(?<!yoki ){_TG}\s*\?+\s*$|,\s*{_TG}\s*[.!]?\s*$"
    rf"|[,\s]ha\s*\?+\s*$|,\s*ha\s*[.!]?\s*$",
    re.IGNORECASE)
# talaba matnidagi murojaat kalit so'zlari (ustoz kartasining harakatini aniqlash uchun ham ishlatiladi)
MOTION_TEXT_RX = re.compile(
    rf"rad\s+etish|rad\s+eting|chetlashtir|ishora\s+qiluvchi|yo{_A}naltiruvchi|e{_A}tiroz", re.IGNORECASE)
_MOTION_STRONG_RX = re.compile(rf"rad\s+etish|rad\s+eting|ishora\s+qiluvchi|yo{_A}naltiruvchi", re.IGNORECASE)
_MOTION_WEAK_RX = re.compile(rf"e{_A}tiroz|chetlashtir", re.IGNORECASE)
_MOTION_ADDR_RX = re.compile(r"hurmatli\s+sud|raislik\s+qiluvchi", re.IGNORECASE)
_MOTION_REQ_RX = re.compile(rf"so{_A}rayman|so{_A}raymiz|iltimos|bildiraman|bildiramiz|qilaman|qilamiz", re.IGNORECASE)
_QUESTION_END_RX = re.compile(r"\?\s*$|\b\w+(?:mi|misiz|misan|mikan)\s*[.!]?\s*$", re.IGNORECASE)


def is_question(text: str) -> bool:
    """Guvohga savolmi: biror gapi «?» yoki «-mi» bilan tugaydi yoki «Guvoh, …» murojaati bilan boshlanadi."""
    t = norm(text)
    return bool(t) and (t.startswith("guvoh") or any(_QUESTION_END_RX.search(p) for p in split_sentences(t)))


def is_motion_text(text: str) -> bool:
    """Matn raislik qiluvchiga murojaatmi (savolni rad etishni so'rash). Savol (oxirida «?» yoki «-mi», «Guvoh, …»
    bilan boshlangan) murojaat emas. «rad etish / ishora qiluvchi / yo'naltiruvchi» — sudga murojaat yoki so'rov fe'li
    bilan yoki qisqa (<= 6 so'z) gapda; «e'tiroz / chetlashtir» — faqat sudga murojaat yoki so'rov fe'li bilan."""
    t = norm(text)
    if not t or _QUESTION_END_RX.search(t) or t.startswith("guvoh"):
        return False
    addressed = bool(_MOTION_ADDR_RX.search(t) or _MOTION_REQ_RX.search(t))
    if _MOTION_STRONG_RX.search(t):
        return addressed or len(t.split()) <= 6
    return bool(_MOTION_WEAK_RX.search(t)) and addressed


def is_leading(content: "Content", text: str) -> bool:
    """Har gap bo'yicha: LEADING_RX yoki kontentdagi yonaltiruvchi_savol regexlari (bosqichdan qat'i nazar)."""
    t = norm(text)
    if not t:
        return False
    v = content.violations.get("yonaltiruvchi_savol") or {}
    rxs = []
    for rx in v.get("regex_uz", []):
        try:
            rxs.append(re.compile(rx.translate(_APOS), re.IGNORECASE))
        except re.error:
            continue
    for part in dict.fromkeys([t, *split_sentences(t)]):
        if LEADING_RX.search(part) or any(rx.search(part) for rx in rxs):
            return True
    return False


# ----------------------------------------------------------------------------- yashirin fakt mavzusi
# Ko'rish qobiliyati / ko'zoynak mavzusi: guvoh kod ruxsatisiz shu mavzuda gapirsa (LLM to'qisa) javob almashtiriladi.
_SIGHT_RX = (rf"ko{_A}zoyna|\blinza|diopt|\bko{_A}z(?:im|imni|imga|imning|lar(?:im|imni|imga)?)\b|"
             rf"ko{_A}rish\s+qobiliyat|\bko{_A}rishim|\bxira|\bsing(?:an|di|ib)|\bsinib|"
             rf"(?:uzoqni|yaqinni)\s+(?:yaxshi\s+|yomon\s+)?ko{_A}r")
# Promptga beriladigan matndan olib tashlanadigan «sir» so'zlar (LLM mavzuni bilib, o'zi to'qimasin)
_SECRET_RX = re.compile(rf"ko{_A}zoyna|\blinza|diopt|\bsing(?:an|di|ib)|\bsinib|ko{_A}rish\s+qobiliyat", re.IGNORECASE)


def _keyword_nouns(content: "Content") -> list[str]:
    """reveal_keywords dan savol shakli bo'lmaganlari (ko'zoynak, linza, ko'rish qobiliyati ...)."""
    hidden = content.case.get("witness", {}).get("hidden_fact") or {}
    out = []
    for kw in hidden.get("reveal_keywords", []) or []:
        k = norm(str(kw))
        if k and "ingiz" not in k and not re.search(r"(?:mi|siz|sizmi)$", k):
            out.append(k)
    return out


def hidden_topic_rx(content: "Content") -> re.Pattern:
    extra = "|".join(re.escape(k).replace("'", f"{_A}") for k in _keyword_nouns(content))
    return re.compile(_SIGHT_RX + (f"|{extra}" if extra else ""), re.IGNORECASE)


def mentions_hidden_topic(content: "Content", text: str) -> bool:
    return bool(text) and bool(hidden_topic_rx(content).search(norm(text)))


_DROP = "<<sir>>"


def strip_secret(text: str) -> str:
    """Promptdagi matndan yashirin fakt mavzusini olib tashlaydi: «sir» so'zli qavslar o'chiriladi, shunday iqtibos
    yoki so'z qolgan gap tashlanadi."""
    out = []
    for sent in split_sentences(str(text or "")):
        s2 = re.sub(r"\s*\([^)]*\)", lambda m: "" if _SECRET_RX.search(norm(m.group(0))) else m.group(0), sent)
        s2 = re.sub(r"«[^»]*»", lambda m: _DROP if _SECRET_RX.search(norm(m.group(0))) else m.group(0), s2)
        if _DROP in s2 or _SECRET_RX.search(norm(s2)):
            continue
        out.append(s2.strip())
    return " ".join(x for x in out if x)


def hidden_condition_for_prompt(content: "Content") -> str:
    """reveal_when_uz — mavzu so'zlarisiz (ko'zoynak va h.k. faqat fakt ochilgandan keyin promptga tushadi)."""
    hidden = content.case.get("witness", {}).get("hidden_fact") or {}
    cond = strip_secret(hidden.get("reveal_when_uz", ""))
    if cond and not re.search(rf"yo{_A}naltiruvchi", norm(cond)):
        cond += " Yo'naltiruvchi (ishora qiluvchi) savolda ochilmaydi."
    return cond


def article_ref_for(content: "Content", vid: str, num: str) -> str | None:
    """Qoidabuzarlik moddalaridan raqami `num` bo'lganining ref i (masalan "JPK 102-modda"), bo'lmasa birinchisi."""
    ids = [a for a in (content.violations.get(vid) or {}).get("article_ids", []) if a in content.articles]
    refs = [content.articles[a]["ref"] for a in ids]
    return next((r for r in refs if re.search(rf"\b{num}\b", r)), refs[0] if refs else None)


def _paren(ref: str | None) -> str:
    return f" ({ref})" if ref else ""


def student_motion_text(content: "Content") -> str:
    return ("Hurmatli sud, savolni rad etishni so'rayman: savol ishora qiluvchi"
            f"{_paren(article_ref_for(content, 'yonaltiruvchi_savol', '102'))}.")


def ruling_granted(content: "Content") -> str:
    return ("Iltimos qanoatlantirildi, savol rad etiladi. Ishora qiluvchi savol berishga yo'l qo'yilmaydi"
            f"{_paren(article_ref_for(content, 'yonaltiruvchi_savol', '102'))}. Guvoh, bu savolga javob bermang.")


RULING_DENIED = "Iltimos rad etildi: hozir guvohga rad etiladigan savol berilmagan. Himoyachi, davom eting."
CLERK_RECORDED = "Bayonnomaga kiritildi."
PROSECUTOR_DONE = "Raislik qiluvchi, savollarim tugadi."
JUDGE_GIVE_FLOOR = "Himoyachi, so'z sizga. Guvohni so'roq qilishingiz mumkin."
JUDGE_HEARS = "Himoyachi, eshitaman."
JUDGE_FLOOR_YOURS = "Himoyachi, so'z sizda. Davom eting."
JUDGE_WAIT_PROSECUTOR = "Himoyachi, prokuror so'rog'i hali tugamagan. So'z navbat bilan beriladi."


def prosecutor_motion_text(content: "Content") -> str:
    """Majlisda talaba ishora qiluvchi savol bersa prokuror raislik qiluvchiga murojaat qiladi (rejim-huquq (a))."""
    return ("Raislik qiluvchi, himoyachining savolini rad etishni so'rayman: savol ishora qiluvchi"
            f"{_paren(article_ref_for(content, 'yonaltiruvchi_savol', '102'))}.")


def ruling_on_prosecutor_motion(warning_uz: str) -> str:
    return f"Iltimos qanoatlantirildi. {warning_uz}".strip()


# ----------------------------------------------------------------------------- ruxsatsiz gapirish (default)
DEFAULT_UNAUTHORIZED = {
    "id": "ruxsatsiz_gapirish",
    "name_uz": "Raislik qiluvchining ruxsatisiz gapirish",
    "article_ids": ["jpk-408", "jpk-424", "jpk_408"],
    "warning_uz": "Himoyachi, so'zni faqat raislik qiluvchining ruxsati bilan oling. Majlisda tartib saqlanadi va "
                  "raislik qiluvchining ko'rsatmalari bajariladi.",
}


def unauthorized_violation(content: "Content") -> dict[str, Any]:
    return content.violations.get("ruxsatsiz_gapirish") or DEFAULT_UNAUTHORIZED


# ----------------------------------------------------------------------------- floor
def floor_payload(holder: str, expected: str | None, requested_by: list[str] | None = None,
                  closed: bool = False) -> dict[str, Any]:
    label = "Majlis yakunlandi" if closed else f"So'z: {SPEAKER_UZ.get(holder, holder)}"
    return {"holder": holder, "requested_by": list(requested_by or []), "expected": expected, "label_uz": label}


# ----------------------------------------------------------------------------- prokuror so'rog'i (tuzoq)
EXAM_SCHEMA = {
    "type": "object",
    "properties": {
        "q1_open": {"type": "string", "description": "prokurorning ochiq savoli, <= 20 so'z"},
        "a1": {"type": "string", "description": "guvoh javobi, faqat public_facts_uz dan, <= 25 so'z"},
        "q2_leading": {"type": "string", "description": "ishora qiluvchi savol, ', to'g'rimi?' bilan tugaydi"},
        "a2": {"type": "string", "description": "guvohning ehtiyotkor javobi, faqat public_facts_uz dan"},
    },
    "required": ["q1_open", "a1", "q2_leading", "a2"],
}
_CLAIMS_CLEAR_VIEW = re.compile(rf"aniq\s+ko{_A}rdim|yaxshi\s+ko{_A}rdim|yuzini\s+ko{_A}rdim|hech\s+narsa\s+to{_A}sqinlik",
                                re.IGNORECASE)


def _pick_fact(facts: list[str], keys: list[str], default: str = "") -> str:
    for k in keys:
        hit = next((f for f in facts if k in norm(f)), None)
        if hit:
            return hit
    return facts[0] if facts else default


def exam_template(content: "Content") -> dict[str, str]:
    """Kalitsiz/zaxira prokuror so'rog'i: ish materialidan, ikkinchi savol albatta ishora qiluvchi."""
    case = content.case
    w = case.get("witness", {})
    facts = w.get("public_facts_uz", [])
    name = case.get("defendant", {}).get("name", "").strip()
    who = f"sudlanuvchi {name}ni" if name else "sudlanuvchini"
    return {
        "q1_open": "Guvoh, voqea kuni do'konda nimani ko'rdingiz, sudga aytib bering.",
        "a1": truncate_words(_pick_fact(facts, ["ko'rdim", "ko'rdi"], "Bir erkakni ko'rdim."), 25),
        "q2_leading": f"Siz o'sha kuni aynan {who} ko'rdingiz, to'g'rimi?",
        "a2": truncate_words(_pick_fact(facts, ["o'xshaydi", "foto", "surat"], "Men ko'rganimni aytdim."), 25),
    }


def _bad_line(text: str, hidden_kw: list[str], hidden_words: set[str]) -> bool:
    if not text or FORBIDDEN_RX.search(text) or re.search(r"\d+\s*-?\s*modda", text, re.IGNORECASE):
        return True
    if contains_any(text, hidden_kw):
        return True
    return bool(hidden_words & set(re.findall(r"[a-z']+", norm(text))))


def validate_exam(content: "Content", raw: dict[str, Any] | None) -> tuple[dict[str, str], str]:
    """LLM taklifini tekshiradi; har maydon alohida: yaroqsiz bo'lsa shablondan. (skript, manba)."""
    tpl = exam_template(content)
    raw = raw if isinstance(raw, dict) else {}
    hidden = content.case.get("witness", {}).get("hidden_fact") or {}
    kws = hidden.get("reveal_keywords", [])
    hidden_words = {"ko'zoynak", "ko'zoynagim", "ko'zoynaksiz", "linza", "singan", "sinib"}
    out, used_llm = {}, 0
    for k in ("q1_open", "a1", "q2_leading", "a2"):
        v = re.sub(r"\s+", " ", str(raw.get(k) or "")).strip()
        v = truncate_words(v, 25) if v else ""
        ok = bool(v) and not _bad_line(v, kws, hidden_words)
        if k == "q1_open":
            ok = ok and not is_leading(content, v)
        elif k == "q2_leading":
            ok = ok and is_leading(content, v)  # kafolat: tuzoq savol albatta ishora qiluvchi
        else:  # guvoh javoblari: ko'rish sharoitini tasdiqlamaydi, yashirin faktni ochmaydi
            ok = ok and not _CLAIMS_CLEAR_VIEW.search(v)
        out[k] = v if ok else tpl[k]
        used_llm += int(ok)
    source = "llm" if used_llm == 4 else ("llm+shablon" if used_llm else "shablon")
    return out, source


EXAM_KEYS = ("q1_open", "a1", "q2_leading", "a2")


def content_exam(content: "Content") -> tuple[dict[str, str], str] | None:
    """case.json `witness.prosecutor_exam` — yurist yozgan deterministik so'roq (LLM dan ustun). Yo'q bo'lsa None.

    Kontentga ishoniladi (qisqartirilmaydi), lekin kafolatlar saqlanadi: bo'sh yoki taqiqlangan iborali maydon,
    ishora qiluvchi bo'lmagan q2_leading, ishora qiluvchi q1_open — shablon bilan almashtiriladi
    (manba `kontent+shablon`)."""
    raw = (content.case.get("witness") or {}).get("prosecutor_exam")
    if not isinstance(raw, dict):
        return None
    tpl = exam_template(content)
    out, used = {}, 0
    for k in EXAM_KEYS:
        v = re.sub(r"\s+", " ", str(raw.get(k) or "")).strip()
        ok = bool(v) and not FORBIDDEN_RX.search(v)
        if k == "q1_open":
            ok = ok and not is_leading(content, v)
        elif k == "q2_leading":
            ok = ok and is_leading(content, v)  # tuzoq savol albatta ishora qiluvchi
        if not ok and v:
            log.warning("case.json prosecutor_exam.%s yaroqsiz — shablon ishlatiladi", k)
        out[k] = v if ok else tpl[k]
        used += int(ok)
    if not used:
        return None
    return out, ("kontent" if used == len(EXAM_KEYS) else "kontent+shablon")


# ----------------------------------------------------------------------------- ustoz (talim)
TUTOR_STAGE_UZ = {
    "opening": "Majlisni raislik qiluvchi ochadi, sudlanuvchiga huquqlari tushuntiriladi va taraflarning iltimoslari "
               "so'raladi. Gapirishdan oldin o'rnidan turing va «Hurmatli sud» deb murojaat qiling.",
    "questioning": "Guvohni avval uni taklif qilgan taraf — prokuror so'roq qiladi, so'ng siz. Savol javobni o'zida "
                   "ko'rsatmasligi kerak: ishora qiluvchi savol taqiqlangan, bunday savolni raislik qiluvchidan rad "
                   "etishni so'rash mumkin.",
    "arguments": "Sud tergovi tugagach avval ayblov, keyin himoyachi so'zlaydi; nutq faqat sud tergovida tekshirilgan "
                 "dalillarga tayanadi. Maqsad: dalillar yetarli emasligini va shubhalar sudlanuvchi foydasiga hal "
                 "etilishini asoslash.",
    "last_word": "Muzokaradan keyin sudlanuvchi oxirgi so'zni aytadi; unga savol berilmaydi. Mashq shu yerda tugaydi, "
                 "hukm chiqarilmaydi.",
}


def _stage_for(content: "Content", kind: str, stage: dict[str, Any] | None) -> dict[str, Any] | None:
    if stage is not None:
        return stage
    return content.stage_by_kind(kind) if kind else None


def tutor_stage_say(content: "Content", kind: str, stage: dict[str, Any] | None = None) -> str | None:
    """Bosqich boshidagi ustoz gapi: rules.json bosqichining `tutor_uz` i, bo'lmasa TUTOR_STAGE_UZ."""
    st = _stage_for(content, kind, stage)
    txt = str((st or {}).get("tutor_uz") or "").strip()
    return txt or TUTOR_STAGE_UZ.get(kind)


_FLOOR_LABEL_RX = re.compile(rf"^so{_A}z\s+so{_A}ra", re.IGNORECASE)


def _card_action(content: "Content", kind: str, card: dict[str, Any]) -> str | None:
    """Kontent kartasining harakati: aniq `action` > shu bosqich turidagi default karta bilan bir xil sarlavha >
    kalit so'z (guvoh so'rog'ida «rad etish / ishora qiluvchi / yo'naltiruvchi» → murojaat; «So'z so'rash…» → so'z).
    id bo'yicha moslanmaydi: kontentda a/b/c tartibi defaultdan farq qiladi."""
    act = card.get("action")
    if act in CARD_ACTIONS:
        return act
    label = norm(str(card.get("label_uz") or ""))
    for d in _default_choices(content, kind):
        if d.get("action") and norm(d["label_uz"]) == label:
            return d["action"]
    if kind == "questioning" and MOTION_TEXT_RX.search(label + " " + norm(str(card.get("text_uz") or ""))):
        return "motion_reject_question"
    if _FLOOR_LABEL_RX.search(label):
        return "request_floor"
    return None


def tutor_choices(content: "Content", kind: str, stage: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Ustoz kartalari: rules.json bosqichining `tutor_choices` i (harakat xaritalanadi), bo'lmasa default."""
    st = _stage_for(content, kind, stage)
    raw = (st or {}).get("tutor_choices")
    if isinstance(raw, list):
        out = []
        for i, c in enumerate(raw):
            if not isinstance(c, dict) or not str(c.get("label_uz") or "").strip():
                continue
            card = {"id": str(c.get("id") or chr(97 + i)), "label_uz": str(c["label_uz"]).strip(),
                    "text_uz": str(c.get("text_uz") or "").strip()}
            act = _card_action(content, kind, c)
            if act:
                card["action"] = act
            out.append(card)
        if out:
            return out
    return _default_choices(content, kind)


FLOOR_CARD = {"label_uz": "So'z so'rash", "action": "request_floor", "text_uz": ""}


def trap_window_choices(content: "Content", choices: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Tuzoq oynasi ochiq va so'z prokurorda: faqat murojaat va so'z so'rash kartalari (matnli savol kartasi
    ruxsatsiz gapirishga olib keladi). Kontentda bo'lmasa default karta qo'shiladi."""
    motion = next((c for c in choices if c.get("action") == "motion_reject_question"), None) or \
        _default_choices(content, "questioning")[0]
    floor = next((c for c in choices if c.get("action") == "request_floor"), None) or FLOOR_CARD
    return [{**motion, "id": "a"}, {**floor, "id": "b"}]


def _default_choices(content: "Content", kind: str) -> list[dict[str, Any]]:
    if kind == "opening":
        return [
            {"id": "a", "label_uz": "Tayyorlikni bildirish",
             "text_uz": "Hurmatli sud, iltimosim yo'q. Sud tergoviga o'tishga tayyorman."},
            {"id": "b", "label_uz": "So'z so'rash", "action": "request_floor", "text_uz": ""},
        ]
    if kind == "questioning":
        return [
            {"id": "a", "label_uz": "Savolni rad etishni so'rash", "action": "motion_reject_question",
             "text_uz": student_motion_text(content)},
            {"id": "b", "label_uz": "Ochiq savol", "text_uz": "Guvoh, o'sha paytda qayerda turgan edingiz?"},
            {"id": "c", "label_uz": "Yopiq savol (xato yo'l)",
             "text_uz": "Siz sudlanuvchini aniq ko'rdingiz, to'g'rimi?"},
        ]
    if kind == "arguments":
        return [
            {"id": "a", "label_uz": "Dalillarga tayanish",
             "text_uz": "Hurmatli sud, ayblov dalillari sudlanuvchining aybini shubhasiz isbotlamaydi: guvoh "
                        "ko'rsatuvi ishonchli emas, boshqa dalillar uni tasdiqlamaydi. Shubhalar sudlanuvchi "
                        "foydasiga hal qilinadi, oqlashni so'rayman."},
            {"id": "b", "label_uz": "Guvohga savol (xato yo'l)", "text_uz": "Guvoh, siz o'sha kuni nimani ko'rdingiz?"},
            {"id": "c", "label_uz": "Nutqni yakunlash", "text_uz": "Nutqim tugadi."},
        ]
    return []


VIOLATION_RETRY = {
    "yonaltiruvchi_savol": {"id": "a", "label_uz": "Ochiq shaklda so'rash",
                            "text_uz": "Siz o'sha kuni nimani ko'rdingiz?"},
    "ruxsatsiz_gapirish": {"id": "a", "label_uz": "So'z so'rash", "action": "request_floor", "text_uz": ""},
    "bosim_haqorat": {"id": "a", "label_uz": "Hurmat bilan so'rash",
                      "text_uz": "Guvoh, iltimos, o'sha paytdagi holatni batafsil aytib bering."},
    "bosqichdan_tashqari": {"id": "a", "label_uz": "Guvohga savol", "text_uz": "Guvoh, siz qayerda turgan edingiz?"},
    "aloqasiz_savol": {"id": "a", "label_uz": "Ishga oid savol", "text_uz": "Guvoh, voqeani qayerdan kuzatdingiz?"},
}
# Bosqich turiga qarab qayta urinish kartasi: qoidabuzarlikka maxsus karta bo'lmasa yoki u bosqichga mos kelmasa
STAGE_RETRY = {
    "opening": {"id": "a", "label_uz": "Hurmat bilan murojaat",
                "text_uz": "Hurmatli sud, iltimosim yo'q. Sud tergoviga o'tishga tayyorman."},
    "questioning": {"id": "a", "label_uz": "Ochiq savol", "text_uz": "Guvoh, voqeani qayerdan kuzatdingiz?"},
    "arguments": {"id": "a", "label_uz": "Nutqni davom ettirish",
                  "text_uz": "Hurmatli sud, sud tergovida tekshirilgan dalillar sudlanuvchining aybini shubhasiz "
                             "isbotlamaydi. Shubhalar sudlanuvchi foydasiga hal qilinadi, oqlashni so'rayman."},
    "last_word": {"id": "a", "label_uz": "Ko'rsatmani kutish", "text_uz": "Hurmatli sud, boshqa iltimosim yo'q."},
}
# guvohga qaratilgan qayta urinish kartalari muzokara / oxirgi so'zda noto'g'ri (u yerda guvohga savol berilmaydi)
_WITNESS_RETRY = {"yonaltiruvchi_savol", "bosim_haqorat", "bosqichdan_tashqari", "aloqasiz_savol"}


def retry_card(vid: str, kind: str) -> dict[str, Any]:
    """«Vaqt to'xtadi» kartasining qayta urinish tanlovi — har doim bitta karta qaytadi."""
    card = VIOLATION_RETRY.get(vid)
    if card and not (vid in _WITNESS_RETRY and kind in ("opening", "arguments", "last_word")):
        return dict(card)
    return dict(STAGE_RETRY.get(kind) or STAGE_RETRY["questioning"])


def _rule_payload(art: dict[str, Any]) -> dict[str, Any]:
    """text_uz — foydalanuvchiga ko'rinadigan matn (ichki izohsiz); note_uz — ichki izoh (ko'rsatilmaydi)."""
    return {"ref": art["ref"], "title_uz": art.get("title_uz", ""), "text_uz": art.get("text_uz", ""),
            "note_uz": art.get("note_uz", ""), "verified": bool(art.get("verified"))}


def violation_explanation(content: "Content", vp: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """«Vaqt to'xtadi» kartasi: qoidabuzarlik nomi + moddaning ref, sarlavha va matni + «Qayta urinib ko'ring».

    `rule` doim bor: modda topilmasa qoidabuzarlikning boshqa moddasi, u ham bo'lmasa — raislik qiluvchining
    ogohlantirishi (tekshirilmagan deb belgilanadi)."""
    ids = [vp.get("article_id"), *(vp.get("article_ids") or [])]
    art = next((content.articles[a] for a in ids if a and a in content.articles), None)
    say = f"Vaqt to'xtadi. {vp.get('name_uz') or 'Qoidabuzarlik'}."
    if art:
        text = re.sub(r"\s*\([^)]*\)\s*$", "", art.get("text_uz", "")).strip()
        first = (split_sentences(text) or [""])[0]
        say += f" {art['ref']}: {art.get('title_uz', '')}." + (f" {first}" if first else "")
        rule = _rule_payload(art)
    else:
        rule = {"ref": vp.get("article_ref") or "Majlis tartibi", "title_uz": vp.get("name_uz") or "Qoidabuzarlik",
                "text_uz": vp.get("warning_uz") or "", "verified": False}
        say += f" {rule['ref']}: {rule['title_uz']}."
    return say.strip() + " Qayta urinib ko'ring.", rule


def trap_rule(content: "Content") -> dict[str, Any] | None:
    """Ishora qiluvchi savol moddasi (JPK 102) — o'tkazib yuborilgan tuzoq kartasi uchun."""
    ids = [a for a in (content.violations.get("yonaltiruvchi_savol") or {}).get("article_ids", [])
           if a in content.articles]
    art = next((content.articles[a] for a in ids if re.search(r"\b102\b", content.articles[a]["ref"])),
               content.articles[ids[0]] if ids else None)
    return _rule_payload(art) if art else None


def missed_trap_explanation(content: "Content", question: str) -> str:
    ref = article_ref_for(content, "yonaltiruvchi_savol", "102")
    return (f"Prokurorning savoli ishora qiluvchi edi: «{question}». Bunday paytda o'rnidan turib: "
            f"«{student_motion_text(content)}» deyish kerak edi" + (f" ({ref})." if ref else "."))


MISSED_RETRY = {"id": "a", "label_uz": "Guvohga ochiq savol", "text_uz": "Guvoh, voqeani qayerdan kuzatdingiz?"}

# Ustoz xabari faqat joriy hodisaga bog'lanadi (tutor.event): stage_start | violation | motion_ok | motion_missed |
# motion_denied | hint | none. Maqtov faqat motion_ok da.
CAUGHT_PRAISE_FREE = ("Siz prokurorning ishora qiluvchi savolini payqadingiz va raislik qiluvchiga to'g'ri murojaat "
                      "qildingiz. Endi guvohni o'zingiz ochiq savollar bilan so'roq qiling.")
MOTION_DENIED_TUTOR = ("Hozir rad etiladigan savol berilmagan edi. Raislik qiluvchiga murojaat faqat prokurorning "
                       "ishora qiluvchi savolidan keyin qilinadi.")
TUTOR_EVENTS = ("stage_start", "violation", "motion_ok", "motion_missed", "motion_denied", "hint", "none")


OPENING_READY_HINT = "Raislik qiluvchi tayyorligingizni so'radi: iltimosingiz bo'lmasa, shuni ayting."
# «Avval raislik qiluvchidan so'z so'rang» turidagi maslahat — so'z allaqachon talabada bo'lsa ziddiyat
FLOOR_HINT_RX = re.compile(rf"so{_A}z\s+so{_A}ra", re.IGNORECASE)
_READY_HINT_RX = re.compile(r"tayyor|iltimos", re.IGNORECASE)


def stage_hints(kind: str, stage: dict[str, Any] | None, floor_holder: str | None = None) -> list[str]:
    """Bosqichning `hints_uz` i holatga moslab: so'z talabada bo'lsa «so'z so'rang» maslahatlari olib tashlanadi;
    ochilishda tayyorlik/iltimos haqidagi maslahat birinchi. Ro'yxat qisqarsa kod maslahati bilan to'ldiriladi."""
    raw = [str(h).strip() for h in ((stage or {}).get("hints_uz") or []) if str(h).strip()]
    hints = [h for h in raw if not (floor_holder == "defense" and FLOOR_HINT_RX.search(h))]
    if kind == "opening":
        hints.sort(key=lambda h: 0 if _READY_HINT_RX.search(h) else 1)  # barqaror: qolgan tartib saqlanadi
        if raw and len(hints) < len(raw) and OPENING_READY_HINT not in hints:
            hints.append(OPENING_READY_HINT)
    return hints


def hint_for(kind: str, used: int, trap_pending: bool, revealed: bool,
             stage: dict[str, Any] | None = None, floor_holder: str | None = None) -> str:
    """Qisqa yo'naltiruvchi maslahat (javobni bermaydi). used — shu paytgacha olingan maslahatlar soni.

    Tuzoq oynasi ochiq bo'lsa — vaziyatga oid kod maslahati; aks holda bosqichning `hints_uz` i (tartib bilan,
    so'z navbatiga moslab — `stage_hints`), bo'lmasa default. floor_holder: hozir so'z kimda (judge | prosecutor |
    defense)."""
    if trap_pending:
        return "Prokurorning oxirgi savolini qayta eslang: unda javob tayyor holda berilmadimi?"
    hints = stage_hints(kind, stage, floor_holder)
    if hints:
        return hints[min(used, len(hints) - 1)]
    if kind == "opening":
        return OPENING_READY_HINT
    if kind == "questioning":
        if revealed:
            return "Muhim holat ochildi. Boshqa savolingiz bo'lmasa, so'roqni yakunlang."
        return ["Guvoh voqeani qayerdan va qanday sharoitda kuzatganini aniqlang.",
                "Guvohning o'zi haqida o'ylang: uzoqdagi odamni qanchalik aniq ko'ra olardi?",
                "«Nima», «qanday», «qayerda» bilan boshlanadigan ochiq savol bering, javobni savolga qo'shmang."
                ][min(used, 2)]
    if kind == "arguments":
        return ["Nutqni uch qismdan tuzing: pozitsiya, dalillar, so'rov.",
                "Sud tergovida tekshirilgan qaysi dalil ayblovni zaiflashtiradi? Ularni solishtiring.",
                "Nutq oxirida sudga aniq so'rovingizni ayting."][min(used, 2)]
    return "Bu bosqichda sizdan harakat talab qilinmaydi."


# ----------------------------------------------------------------------------- bayonnoma yozuvlari
def mmss(ms: int) -> str:
    sec = max(0, int(ms // 1000))
    return f"{sec // 60:02d}:{sec % 60:02d}"


def record_type(e) -> str:
    if e.revealed_hidden_fact:
        return "fact"
    if e.kind == "motion":
        return "motion"
    if e.kind == "ruling" or (e.speaker == "judge" and e.violation_id):
        return "ruling"
    if e.speaker == "defense" and e.violation_id:
        return "violation"
    return "normal"


def record_item(e) -> dict[str, Any]:
    return {"t": mmss(e.rel_ms), "speaker": e.speaker, "text_uz": e.text, "type": record_type(e),
            "log_id": e.log_id, "stage_id": e.stage_id, "article_ref": e.article_ref}
