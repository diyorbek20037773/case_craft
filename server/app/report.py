"""/finish: bayonnoma (HTML) + rubrika bahosi.

Ishonchlilik: (1) har mezon iqtibosi talaba gapida so'zma-so'z bo'lishi kod bilan tekshiriladi;
(2) umumiy ball kodda hisoblanadi; (3) protsessual tartib darajasi faqat kod jurnalidan; (4) rule_ids faqat rules.json dan.
LLM rubrikasi bo'lmasa yoki tekshiruvdan o'tmasa — deterministik (kod) baho.
"""
from __future__ import annotations

import html
import logging
import re
from datetime import datetime
from typing import Any

from . import modes as M
from .content import Content
from .engine import TASHKENT, Entry, Session, filter_rule_ids
from .prompts import SPEAKER_UZ, build_rubric_prompt
from .providers.llm import LLMProvider, MockLLM, call_with_fallback
from .textutil import norm, split_sentences, uz_apos, words

log = logging.getLogger("report")

DISCLAIMER_UZ = "AI o'quv simulyatsiyasi, real sud qarori emas."
TEACHER_NOTE_UZ = "Baho — AI tavsiyasi. Yakuniy bahoni o'qituvchi tasdiqlaydi."
MAX_LEVEL = 2

CRITERIA: list[dict[str, str]] = [
    {"id": "savol_berish", "name_uz": "Savol berish",
     "description_uz": "Guvohga ochiq, aniq savollar; yo'naltiruvchi savoldan qochish; yashirin holatni ochish."},
    {"id": "dalilga_tayanish", "name_uz": "Dalilga tayanish",
     "description_uz": "Ish materialidagi dalillarga aniq tayanish."},
    {"id": "protsessual_tartib", "name_uz": "Protsessual tartib",
     "description_uz": "Bosqichlar tartibiga rioya, qoidabuzarliklar soni."},
    {"id": "muzokara_nutqi", "name_uz": "Muzokara nutqi",
     "description_uz": "Pozitsiya, dalillar va xulosa/so'rovdan iborat tuzilgan nutq."},
]
LISTENING = {"id": "tinglash", "name_uz": "Tinglash va protsessual hushyorlik",
             "description_uz": "Prokurorning ishora qiluvchi savolini payqab, raislik qiluvchidan uni rad etishni "
                               "so'radimi (JPK 102-modda)."}
ALL_CRITERIA = [*CRITERIA, LISTENING]


# ----------------------------------------------------------------------------- yordamchilar
def student_entries(s: Session) -> list[Entry]:
    return [e for e in s.log if e.speaker == "defense" and e.source == "student" and e.kind not in ("request", "meta")
            and not e.text.startswith("(")]


def denied_motion(s: Session, e: Entry) -> bool:
    """Asossiz (rad etilgan) murojaat: ijobiy iqtibos sifatida ishlatilmaydi."""
    return e.kind == "motion" and e.log_id != s.trap_motion_log_id


def evidence_entries(content: Content, s: Session) -> list[Entry]:
    """«Dalilga tayanish» uchun: himoyachining o'z gaplari (nutq, iltimos) — guvohga savollar, murojaatlar,
    qoidabuzarlik va meta gaplar hisobga olinmaydi (guvohga oddiy savol dalilga tayanish emas)."""
    return [e for e in student_entries(s) if not e.violation_id and e.kind != "motion" and not M.is_question(e.text)]


def quote_from(text: str, prefer: list[str] | None = None, limit: int = 20) -> str:
    """Talaba gapidan so'zma-so'z qisqa iqtibos (gap boshidan, <= limit so'z)."""
    sents = split_sentences(text) or [text]
    pick = sents[0]
    for p in prefer or []:
        hit = next((x for x in sents if norm(p) in norm(x)), None)
        if hit:
            pick = hit
            break
    toks = pick.split()
    return " ".join(toks[:limit]) + ("…" if len(toks) > limit else "")


def quote_is_verbatim(quote: str, entries: list[Entry]) -> bool:
    q = _qkey(quote)
    if len(q.split()) < 3:
        return False
    return any(q in norm(e.text) for e in entries)


def _qkey(quote: str) -> str:
    return norm(quote).rstrip("…").strip(" .,!?:;\"'«»—-")


def _clip(text: str, limit: int = 20) -> str:
    toks = text.split()
    return " ".join(toks[:limit]) + ("…" if len(toks) > limit else "")


def text_pieces(text: str) -> list[str]:
    """Talaba gapidan iqtibos nomzodlari (so'zma-so'z): har gap, so'ng uzun gapning bo'laklari — «: ; —» bo'yicha
    qismlar va vergul bilan ajratilgan ketma-ket bo'laklar oynalari (>= 4 so'z)."""
    out: list[str] = []
    for sent in split_sentences(text) or [text]:
        out.append(sent)
        if len(sent.split()) <= 10:
            continue
        parts = [p.strip() for p in re.split(r"\s*[:;—–]\s+|\s+-\s+", sent) if p.strip()]
        if len(parts) > 1:
            out += parts
        for p in parts:
            chunks = [c.strip() for c in p.split(",") if c.strip()]
            if len(chunks) < 2:
                continue
            for size in range(len(chunks) - 1, 0, -1):  # uzunroq oynalar avval
                for i in range(len(chunks) - size + 1):
                    win = ", ".join(chunks[i:i + size])
                    if 4 <= len(win.split()) <= 20:
                        out.append(win)
    seen: set[str] = set()
    res = []
    for p in out:
        k = _qkey(p)
        if len(k.split()) >= 3 and k not in seen:
            seen.add(k)
            res.append(_clip(p))
    return res


_SHINGLE = 3


def _qwords(q: str) -> list[str]:
    return re.findall(r"[\w']+", _qkey(q))


def quotes_overlap(a: str, b: str) -> bool:
    """Ikki iqtibos bir-birini takrorlaydimi: biri ikkinchisining ichida yoki ketma-ket 3 so'z umumiy."""
    ka, kb = _qkey(a), _qkey(b)
    if not (ka and kb):
        return False
    if ka in kb or kb in ka:
        return True
    wa, wb = _qwords(a), _qwords(b)
    sh = {tuple(wa[i:i + _SHINGLE]) for i in range(len(wa) - _SHINGLE + 1)}
    return any(tuple(wb[i:i + _SHINGLE]) in sh for i in range(len(wb) - _SHINGLE + 1))


# ----------------------------------------------------------------------------- matn tozalash
_A = "['’ʻʼ‘`´]?"
_OBJ_VERB_RX = re.compile(rf"\be{_A}tiroz\s+(bildir|qil)(\w*)", re.IGNORECASE)
_OBJ_RX = re.compile(rf"\be{_A}tiroz(\w*)", re.IGNORECASE)
_INTERNAL_RX = re.compile(r"\b(?:rules|case|tests|glossary)\.json\b", re.IGNORECASE)


def clean_text_uz(content: Content, text: str) -> str:
    """Rubrika va bayonnoma matnlari: amerikacha «e'tiroz» o'rniga «raislik qiluvchiga murojaat», ichki atamalar
    (rules.json, qoidabuzarlik / mezon id lari) o'rniga odam o'qiydigan nomlar."""
    t = str(text or "")
    t = _OBJ_VERB_RX.sub(lambda m: "raislik qiluvchiga murojaat qil" + m.group(2), t)
    t = _OBJ_RX.sub(lambda m: "murojaat" + m.group(1), t)
    t = _INTERNAL_RX.sub("moddalar ro'yxati", t)
    names = {vid: v.get("name_uz") or vid for vid, v in content.violations.items()}
    names.update({c["id"]: c["name_uz"] for c in ALL_CRITERIA})
    names.setdefault("ruxsatsiz_gapirish", M.DEFAULT_UNAUTHORIZED["name_uz"])
    for k in sorted(names, key=len, reverse=True):
        if "_" in k:
            t = re.sub(rf"(?<![\w']){re.escape(k)}(?![\w'])", names[k], t)
    return uz_apos(t)


def violation_name(content: Content, vid: str | None) -> str:
    if not vid:
        return ""
    v = content.violations.get(vid) or (M.DEFAULT_UNAUTHORIZED if vid == "ruxsatsiz_gapirish" else {})
    return v.get("name_uz") or vid.replace("_", " ")


def find_article(content: Content, stage_id: str | None, title_keys: list[str]) -> dict | None:
    pool = content.articles_for_stage(stage_id) if stage_id else list(content.articles.values())
    for k in title_keys:
        for a in pool or content.articles.values():
            if k in norm(a.get("title_uz", "")):
                return a
    return (pool or list(content.articles.values()) or [None])[0]


# Dalil tushunchalari: ish materialida (name_uz/about_uz/facts_uz) TRIGGER uchrasa, o'sha dalilga KALIT so'zlar
# biriktiriladi. Hammasi tutuq belgisisiz yoziladi (STT "ko'rsatuv"ni "korsatuv" deb beradi) va so'z boshidan
# (o'zak + istalgan qo'shimcha) mos keladi. Umumiy so'zlar (noutbuk, sudlanuvchi, dalil, do'kon) ataylab yo'q.
_EV_CONCEPTS: list[tuple[str, list[str]]] = [
    # videoyozuv / kuzatuv kamerasi
    (r"video|kamera|kuzatuv", [r"video", r"kamera", r"kuzatuv", r"yozuv(?!chi)", r"tasvir"]),
    # guvoh ko'rsatuvi / tanib olish
    (r"guvoh", [r"guvoh(?!nom)", r"oxsha(?!sh)", r"kozoynak", r"fotosurat", r"tanib\s+ol",
                r"(?<!sudlanuvchining )(?<!sudlanuvchi )(?<!sudlanuvchini )korsatuv",
                r"(?<!sudlanuvchining )(?<!sudlanuvchi )korsatma(?:si|sini|sida|lar|ni)?\b"]),
    # inventarizatsiya dalolatnomasi
    (r"inventar|dalolatnoma", [r"inventar", r"dalolatnoma"]),
    # kassa cheki
    # yolg'iz «kassa» emas: guvoh «kassa peshtaxtasi» yonida turgan — bu chek dalili emas
    (r"\bchek|kassa", [r"chek(?!l)", r"kassa\s+chek"]),
    # sudlanuvchining o'z ko'rsatuvi
    (r"sudlanuvchi\w*\s+korsat", [r"sudlanuvchi\w*\s+(?:\w+\s+)?korsat(?:uv|ma(?:si|sini|sida)\b)", r"chiqib\s+ket",
                                  r"oz\s+korsatuv"]),
    # tintuv: ashyo topilmagan (facts_uz)
    (r"topilma", [r"topilma", r"tintuv"]),
]
EVIDENCE_STOP = {"guvoh", "sudlanuvchi", "korsatuv", "bayonnoma", "tanib", "olish", "dalil", "ishonch"}


def _flat(text: str) -> str:
    """Kichik harf, tutuq belgisisiz: «Ko‘rsatuvi» == «ko'rsatuvi» == «korsatuvi»."""
    return norm(text).replace("'", "")


def _times_money(text: str) -> list[str]:
    t = _flat(text)
    return re.findall(r"\b\d{1,2}:\d{2}\b", t) + re.findall(r"\b\d{1,3}(?: \d{3})+\b", t)


def evidence_stems(content: Content) -> dict[str, list[re.Pattern]]:
    """Har dalil uchun talaba gapida qidiriladigan naqshlar (ish materialidan yasaladi).

    Manba: case.evidence (id, name_uz, about_uz) + facts_uz dagi dalillarga kirmagan «topilmagan» holati.
    Vaqt (19:15) va summa (5 400 000) faqat bitta dalilga tegishli bo'lsa, o'sha dalil kaliti bo'ladi.
    """
    case = content.case
    items: list[tuple[str, str, str]] = [(str(ev.get("id") or ev.get("name_uz", "")), ev.get("name_uz", ""),
                                          ev.get("about_uz", "")) for ev in case.get("evidence", [])]
    covered = _flat(" ".join(n for _, n, _ in items))
    for i, f in enumerate(case.get("facts_uz", [])):
        if re.search(r"topilma", _flat(f)) and "topilma" not in covered:
            items.append((f"F{i + 1}", f, ""))
            covered += " topilma"
    witness = [w for w in words(str((case.get("witness") or {}).get("name", ""))) if len(w) >= 4]
    nums = [_times_money(about) for _, _, about in items]
    out: dict[str, list[re.Pattern]] = {}
    for k, (eid, name, about) in enumerate(items):
        fname = _flat(name)
        keys: list[str] = []
        for trig, kws in _EV_CONCEPTS:
            if re.search(trig, fname):
                keys += kws
                if trig == "guvoh":
                    keys += [re.escape(w.replace("'", "")) for w in witness]
        if not keys:  # noma'lum dalil turi: nomidagi uzun so'zlar o'zagi (6 harf)
            keys = [re.escape(w[:6]) for w in fname.split() if len(w) >= 6 and not any(
                w.startswith(s) for s in EVIDENCE_STOP)]
        uniq = [x for x in nums[k] if sum(x in other for other in nums) == 1]
        keys += [re.escape(x).replace(r"\ ", r"\s?").replace(":", r"[:.\s]") for x in uniq]
        out[eid] = [re.compile(r"\b" + x) for x in dict.fromkeys(keys)]
    return out


def evidence_hits(text: str, stems: dict[str, list[re.Pattern]]) -> set[str]:
    """Matnda tilga olingan TURLI dalillar id lari."""
    t = _flat(text)
    return {eid for eid, pats in stems.items() if any(p.search(t) for p in pats)}


def _best_evidence_sentence(text: str, stems: dict[str, list[re.Pattern]]) -> list[str]:
    sents = split_sentences(text) or [text]
    best = max(sents, key=lambda x: len(evidence_hits(x, stems)))
    return [best] if evidence_hits(best, stems) else []


def _crit(cid: str, level: int, quote: str, art: dict | None, comment: str, source: str = "kod") -> dict:
    meta = next(c for c in ALL_CRITERIA if c["id"] == cid)
    return {
        "id": cid, "name_uz": meta["name_uz"], "level": int(level), "max": MAX_LEVEL,
        "evidence_quote": quote, "article_id": art["id"] if art else None,
        "article_ref": art["ref"] if art else None, "article_verified": bool(art and art.get("verified")),
        "comment_uz": comment, "source": source,
    }


# ----------------------------------------------------------------------------- deterministik rubrika
def deterministic_rubric(content: Content, s: Session) -> list[dict]:
    st = student_entries(s)
    q_stage = content.stage_by_kind("questioning")
    a_stage = content.stage_by_kind("arguments")
    stems = evidence_stems(content)
    res: list[dict] = []

    # 1) savol berish
    q_id = q_stage["id"] if q_stage else None
    qs = [e for e in st if e.stage_id == q_id and not e.violation_id and e.kind != "motion"]
    # faqat yo'naltiruvchi savollar; so'zsiz gapirish va boshqa qoidabuzarliklar «protsessual tartib» da sanaladi
    leading = [e for e in st if e.stage_id == q_id and e.violation_id == "yonaltiruvchi_savol"]
    other_q = [e for e in st if e.stage_id == q_id and e.violation_id and e.violation_id != "yonaltiruvchi_savol"]
    reveal_q = None
    for i, e in enumerate(s.log):
        if e.revealed_hidden_fact:
            reveal_q = next((x for x in reversed(s.log[:i]) if x.speaker == "defense"), None)
    if not qs and not leading:
        comment = ("Guvohga savol qoidaga muvofiq berilmadi (so'z olinmasdan yoki tartib buzilib). So'z olib, ochiq "
                   "savollar bilan guvohning ko'rsatuvini tekshiring." if other_q else
                   "Guvohga savol berilmadi. Ochiq savollar bilan guvohning ko'rsatuvini tekshiring.")
        res.append(_crit("savol_berish", 0, "", find_article(content, q_id, ["so'roq"]), comment))
    else:
        level = 2 if reveal_q and len(leading) <= 1 else (1 if qs else 0)
        src = reveal_q or (qs[0] if qs else leading[0])
        art = (content.articles.get(next((x for x in content.violations.get(leading[0].violation_id, {})
                                          .get("article_ids", []) if x in content.articles), ""))
               if leading and not reveal_q else None) or find_article(content, q_id, ["so'roq", "ishora"])
        if reveal_q:
            comment = "Savol bilan guvohning yashirin holati ochildi."
        elif qs:
            comment = "Savollar berildi, lekin guvoh ko'rsatuvining ishonchliligi ochilmadi: ko'rish sharoitini so'rang."
        else:
            comment = "Faqat yo'naltiruvchi savollar berildi: savolni ochiq shaklda bering."
        if leading:
            comment += f" Yo'naltiruvchi savollar: {len(leading)} ta."
        res.append(_crit("savol_berish", level, quote_from(src.text), art, comment))

    # 2) dalilga tayanish (faqat himoyachining o'z nutqi / iltimoslari; guvohga savol va meta gap emas)
    ev = evidence_entries(content, s)
    scored = [(len(evidence_hits(e.text, stems)), e) for e in ev]
    scored = [x for x in scored if x[0] > 0]
    all_hits: set[str] = set()
    for e in ev:
        all_hits |= evidence_hits(e.text, stems)
    if not scored:
        res.append(_crit("dalilga_tayanish", 0, "", find_article(content, None, ["dalil"]),
                         "Ish materialidagi dalillarga havola qilinmadi."))
    else:
        best = max(scored, key=lambda x: x[0])[1]
        level = 2 if len(all_hits) >= 2 else 1
        res.append(_crit("dalilga_tayanish", level, quote_from(best.text, _best_evidence_sentence(best.text, stems)),
                         find_article(content, None, ["dalil"]),
                         f"{len(all_hits)} ta dalilga tayanildi." + ("" if level == 2 else
                                                                     " Kamida ikki dalilni solishtiring.")))

    # 3) protsessual tartib (faqat kod jurnalidan)
    viol = [e for e in st if e.violation_id]
    n = len(viol)
    level = 0 if not st else (2 if n == 0 else (1 if n <= 2 else 0))
    if viol:
        v = content.violations.get(viol[0].violation_id, {})
        art = next((content.articles[a] for a in v.get("article_ids", []) if a in content.articles), None)
        names = sorted({violation_name(content, e.violation_id) for e in viol})
        comment = f"Qoidabuzarliklar: {n} ta ({'; '.join(names)})."
        res.append(_crit("protsessual_tartib", level, quote_from(viol[0].text), art, comment))
    else:
        art = find_article(content, None, ["raislik", "tartib"])
        pos = [e for e in st if not denied_motion(s, e)]  # asossiz murojaat ijobiy iqtibos bo'lmaydi
        res.append(_crit("protsessual_tartib", level, quote_from(pos[0].text) if pos else "", art,
                         "Qoidabuzarlik qayd etilmadi." if st else "Talaba majlisda ishtirok etmadi."))

    # 4) muzokara nutqi
    a_id = a_stage["id"] if a_stage else None
    speech = [e for e in st if e.stage_id == a_id and not e.violation_id]
    art = find_article(content, a_id, ["muzokara"])
    if not speech:
        res.append(_crit("muzokara_nutqi", 0, "", art, "Muzokara nutqi so'zlanmadi."))
    else:
        best = max(speech, key=lambda e: len(e.text.split()))
        n_words = sum(len(e.text.split()) for e in speech)
        has_request = any(k in norm(best.text) for k in ("so'rayman", "iltimos qilaman", "so'raymiz"))
        has_ev = bool(evidence_hits(best.text, stems))
        level = 2 if n_words >= 25 and has_request and has_ev else 1
        comment = ("Nutqda pozitsiya, dalil va so'rov bor." if level == 2 else
                   "Nutqni tuzing: pozitsiya, kamida ikki dalil, aniq so'rov (masalan, oqlash).")
        res.append(_crit("muzokara_nutqi", level, quote_from(best.text, ["so'rayman"]), art, comment))
    return res


def listening_criterion(content: Content, s: Session) -> dict:
    """Majlis rejimi 5-mezoni (faqat kod jurnalidan): prokurorning tuzoq savolini payqadimi."""
    ids = [a for a in (content.violations.get("yonaltiruvchi_savol") or {}).get("article_ids", [])
           if a in content.articles]
    art = next((content.articles[a] for a in ids if "102" in content.articles[a]["ref"]), None) or         (content.articles[ids[0]] if ids else find_article(content, None, ["ishora", "so'roq"]))
    if s.trap_state == "caught":
        motion = next((e for e in s.log if e.log_id == s.trap_motion_log_id), None)
        level = 2 if s.motions_invalid < 2 else 1
        comment = "Prokurorning ishora qiluvchi savolini payqab, raislik qiluvchidan uni rad etishni so'radingiz."
        if s.motions_invalid:
            comment += f" Asossiz murojaatlar: {s.motions_invalid} ta."
        return _crit("tinglash", level, quote_from(motion.text) if motion else "", art, comment)
    if s.trap_state in ("missed", "pending"):  # pending (yakunda oyna ochiq qolgan) = o'tkazib yuborilgan
        comment = f"Prokurorning savoli ishora qiluvchi edi («{s.trap_question}») — e'tibor bermadingiz."
        if s.trap_floor_requested:
            comment += " So'z so'radingiz, lekin savolni rad etishni so'ramadingiz."
        return _crit("tinglash", 0, "", art, comment)
    return _crit("tinglash", 0, "", art, "Guvoh so'rog'i bosqichiga yetilmadi: tinglash ko'nikmasi baholanmadi.")


def scored_listening(s: Session) -> bool:
    """5-mezon faqat majlisda va prokuror so'rog'i (tuzoq) bo'lgan bo'lsa: unga yetilmagan bo'lsa mezon baholanmaydi
    va max ga kirmaydi (0/2 deb hisoblanmaydi)."""
    return s.mode == "majlis" and not s.legacy and s.trap_state is not None


# ----------------------------------------------------------------------------- har mezonga alohida iqtibos
QUOTE_NOT_FOUND_UZ = "iqtibos topilmadi"
_REQUEST_KW = ("so'rayman", "iltimos qilaman", "so'raymiz")


def _has_request(text: str) -> bool:
    return any(k in norm(text) for k in _REQUEST_KW)


def quote_candidates(content: Content, s: Session) -> dict[str, list[str]]:
    """Har mezon uchun talaba gaplaridan iqtibos nomzodlari (afzallik tartibida, so'zma-so'z)."""
    st = student_entries(s)
    stems = evidence_stems(content)
    q_stage, a_stage = content.stage_by_kind("questioning"), content.stage_by_kind("arguments")
    q_id, a_id = (q_stage or {}).get("id"), (a_stage or {}).get("id")
    out: dict[str, list[str]] = {}

    reveal_q = []
    for i, e in enumerate(s.log):
        if e.revealed_hidden_fact:
            reveal_q = [x for x in reversed(s.log[:i]) if x.speaker == "defense"][:1]
    qs = [e for e in st if e.stage_id == q_id and not e.violation_id and e.kind != "motion"]
    leading = [e for e in st if e.stage_id == q_id and e.violation_id]
    out["savol_berish"] = [p for e in [*reveal_q, *qs, *leading] for p in text_pieces(e.text)]

    ranked = sorted(evidence_entries(content, s), key=lambda e: -len(evidence_hits(e.text, stems)))
    # dalil: ko'proq dalil tilga olingan bo'lak avval; so'rov («oqlashni so'rayman») bor bo'lak keyin — u nutqqa qoladi
    out["dalilga_tayanish"] = [p for e in ranked if evidence_hits(e.text, stems)
                               for p in sorted(text_pieces(e.text), key=lambda x: (-len(evidence_hits(x, stems)),
                                                                                   _has_request(x)))
                               if evidence_hits(p, stems)]

    viol = [e for e in st if e.violation_id]
    pos = [e for e in st if not denied_motion(s, e)]
    out["protsessual_tartib"] = [p for e in (viol or pos) for p in text_pieces(e.text)]

    speech = sorted([e for e in st if e.stage_id == a_id and not e.violation_id], key=lambda e: -len(e.text.split()))
    # nutq: so'rov bor eng ixcham bo'lak avval (pozitsiya + so'rov), so'ng qolganlari
    out["muzokara_nutqi"] = [p for e in speech for p in sorted(
        text_pieces(e.text), key=lambda x: (not _has_request(x), len(x.split()) if _has_request(x) else 0))]

    motion = next((e for e in s.log if e.log_id == s.trap_motion_log_id), None)
    out["tinglash"] = text_pieces(motion.text) if motion else []
    return out


def assign_distinct_quotes(criteria: list[dict], cands: dict[str, list[str]], max_opts: int = 10) -> None:
    """Har mezonga boshqa mezonlarnikidan farqli (bir-birini takrorlamaydigan) iqtibos tanlaydi.

    Nomzodlar: AI bahosining (so'zma-so'z tekshirilgan) iqtibosi birinchi; kod bahosida — mezon nomzodlari tartibi,
    joriy iqtibos oxirida. Maqsad tartibi: ball > 0 mezonlar iqtibossiz qolmasin -> iqtibossizlar kam bo'lsin ->
    har mezon o'z afzal nomzodiga yaqin (indekslar yig'indisi). Mos nomzod yo'q — bo'sh iqtibos, «iqtibos topilmadi»."""
    opts: list[list[str]] = []
    for c in criteria:
        cur = c.get("evidence_quote") or ""
        seq = [cur, *cands.get(c["id"], [])] if c.get("source") == "ai" else [*cands.get(c["id"], []), cur]
        lst: list[str] = []
        for q in seq:
            if q and not any(_qkey(q) == _qkey(x) for x in lst):
                lst.append(q)
        opts.append(lst[:max_opts] + [""])
    n = len(criteria)
    order = sorted(range(n), key=lambda i: len(opts[i]))
    best: list = [None, {}]
    pick: dict[int, str] = {}

    def cost() -> tuple[int, int, int]:
        es = sum(1 for i in pick if not pick[i] and criteria[i]["level"] > 0)
        return es, sum(1 for i in pick if not pick[i]), sum(opts[i].index(pick[i]) for i in pick if pick[i])

    def dfs(k: int) -> None:
        sc = cost()
        if best[0] is not None and sc >= best[0]:
            return  # chegara: qisman tanlov allaqachon eng yaxshisidan yomon (indekslar manfiy emas)
        if k == n:
            best[0], best[1] = sc, dict(pick)
            return
        i = order[k]
        for q in opts[i]:
            if q and any(pick[j] and quotes_overlap(q, pick[j]) for j in pick):
                continue
            pick[i] = q
            dfs(k + 1)
            del pick[i]

    dfs(0)
    for i, c in enumerate(criteria):
        q = best[1].get(i, "")
        c["evidence_quote"] = q
        c["quote_note_uz"] = None if q else QUOTE_NOT_FOUND_UZ


# ----------------------------------------------------------------------------- LLM rubrika (ixtiyoriy)
def rubric_schema(content: Content) -> dict:
    return {
        "type": "object",
        "properties": {"criteria": {"type": "array", "items": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "enum": [c["id"] for c in CRITERIA]},
                "level": {"type": "integer", "minimum": 0, "maximum": MAX_LEVEL},
                "evidence_quote": {"type": "string"},
                "rule_ids": {"type": "array", "items": {"type": "string", "enum": list(content.articles) or ["none"]}},
                "comment_uz": {"type": "string"},
            },
            "required": ["id", "level", "evidence_quote", "rule_ids", "comment_uz"],
        }}},
        "required": ["criteria"],
    }


_PRAISE_RX = re.compile(r"yaxshi|a'lo|ajoyib|zo'r|muvaffaqiyatli|mohirona|puxta|yuqori\s+darajada|to'g'ri\s+"
                        r"(?:qo'll|ishlat|ber|murojaat)|ustalik|tahsin|maqtov", re.IGNORECASE)
_DEFICIT_RX = re.compile(r"xato|kamchilik|yetarli\s+emas|zaif|noto'g'ri|yo'naltiruvchi\s+savol\s+berdi|"
                         r"rad\s+etildi|asossiz", re.IGNORECASE)


def comment_matches_level(level: int, comment: str) -> bool:
    """AI izohi ohangi darajaga zid emasmi: 0 da maqtov, 2 da «xato / kamchilik» bo'lmasin."""
    t = norm(comment)
    if level == 0 and _PRAISE_RX.search(t):
        return False
    if level == MAX_LEVEL and _DEFICIT_RX.search(t):
        return False
    return True


def criterion_entries(content: Content, s: Session, cid: str) -> list[Entry]:
    """AI iqtibosi qaysi gaplardan bo'lishi mumkin: asossiz murojaat hech qayerda; dalil — o'z nutqi / iltimosidan;
    savol — guvoh so'rog'idan; muzokara — muzokara bosqichidan."""
    st = [e for e in student_entries(s) if not denied_motion(s, e)]
    if cid == "dalilga_tayanish":
        return evidence_entries(content, s)
    stage = {"savol_berish": content.stage_by_kind("questioning"),
             "muzokara_nutqi": content.stage_by_kind("arguments")}.get(cid)
    return [e for e in st if e.stage_id == stage["id"]] if stage else st


def merge_llm_rubric(content: Content, s: Session, det: list[dict], llm_out: Any) -> list[dict]:
    """LLM rubrikasini kod bahosi bilan birlashtiradi. Kutilmagan shakl (criteria satr/obyekt, element satr,
    id ro'yxat ...) xato bermaydi — yaroqsiz qism tashlanadi va kod bahosi qoladi."""
    by_id = {c["id"]: c for c in det}
    criteria = llm_out.get("criteria") if isinstance(llm_out, dict) else None
    if not isinstance(criteria, list):
        if llm_out:
            log.warning("rubrika: LLM javobi kutilmagan shaklda (%s) — kod bahosi", type(criteria).__name__)
        criteria = []
    for item in criteria:
        if not isinstance(item, dict):
            continue
        cid = item.get("id")
        if not isinstance(cid, str) or cid not in by_id:
            continue
        quote = str(item.get("evidence_quote") or "").strip()
        if not quote_is_verbatim(quote, criterion_entries(content, s, cid)):
            log.info("rubrika %s: iqtibos bayonnomada (mos gaplarda) topilmadi — kod bahosi qoldi", cid)
            continue
        try:
            level = max(0, min(MAX_LEVEL, int(item.get("level", 0))))
        except (TypeError, ValueError):
            continue
        rids = filter_rule_ids(content, item.get("rule_ids"))
        art = content.articles[rids[0]] if rids else (content.articles.get(by_id[cid]["article_id"] or ""))
        if cid == "protsessual_tartib":
            level = by_id[cid]["level"]  # faqat kod jurnalidan
        comment = str(item.get("comment_uz") or by_id[cid]["comment_uz"])[:300]
        if not comment_matches_level(level, comment):
            log.info("rubrika %s: izoh ohangi darajaga zid (%d) — kod bahosi qoldi", cid, level)
            continue
        by_id[cid] = _crit(cid, level, quote, art, comment, source="ai")
    return [by_id[c["id"]] for c in CRITERIA]


async def build_rubric(content: Content, s: Session, llm: LLMProvider) -> dict[str, Any]:
    det = deterministic_rubric(content, s)
    criteria, provider = det, "kod"
    if not isinstance(llm, MockLLM) and student_entries(s):
        try:
            system, user = build_rubric_prompt(content, s, CRITERIA)
            out, prov, fell_back = await call_with_fallback(llm, "rubric", system, user, rubric_schema(content), {})
            if not fell_back:
                criteria, provider = merge_llm_rubric(content, s, det, out), prov
        except Exception as err:  # noqa: BLE001 — natija ekrani 500 bermasin: kod bahosi
            log.warning("rubrika LLM xato (%s) — kod bahosi", type(err).__name__)
            criteria, provider = deterministic_rubric(content, s), "kod"
    if scored_listening(s):
        criteria = [*criteria, listening_criterion(content, s)]
    for c in criteria:
        c["comment_uz"] = clean_text_uz(content, c["comment_uz"])
    assign_distinct_quotes(criteria, quote_candidates(content, s))
    total = sum(c["level"] for c in criteria)
    mx = MAX_LEVEL * len(criteria)
    viol = [e for e in student_entries(s) if e.violation_id]
    return {
        "criteria": criteria,
        "total": total,
        "max": mx,
        "percent": round(100 * total / mx) if mx else 0,
        "violations": [{"log_id": e.log_id, "id": e.violation_id, "name_uz": violation_name(content, e.violation_id),
                        "article_ref": e.article_ref, "quote": quote_from(e.text)} for e in viol],
        "revealed_hidden_fact": s.witness_revealed,
        "provider": provider,
        "teacher_approval_required": True,
        "note_uz": TEACHER_NOTE_UZ,
        "mode": s.mode,
        "trap": {"state": "missed" if s.trap_state == "pending" else s.trap_state,
                 "question_uz": s.trap_question or None,
                 "invalid_motions": s.motions_invalid} if s.exam_enabled else None,
        "hints_used": s.hints_used if s.mode == "talim" else None,
        "hints_left": (M.HINTS_MAX - s.hints_used) if s.mode == "talim" else None,
        "pauses": s.pauses if s.mode == "talim" else None,
    }


# ----------------------------------------------------------------------------- bayonnoma HTML
def _fmt_dt(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).astimezone(TASHKENT).strftime("%d.%m.%Y %H:%M")
    except ValueError:
        return iso


def _time(iso: str) -> str:
    try:
        return datetime.fromisoformat(iso).strftime("%H:%M:%S")
    except ValueError:
        return ""


UNVERIFIED_UZ = "(yurist tekshiruvi kutilmoqda)"


def _art_label(ref: str | None, verified: bool) -> str:
    if not ref:
        return "—"
    return html.escape(ref, quote=False) + ("" if verified else f" <span class='unv'>{UNVERIFIED_UZ}</span>")


def articles_note_uz(content: Content) -> str:
    """Bayonnoma pastidagi moddalar haqidagi jumla — moddalarning haqiqiy `verified` holatiga mos (o'ziga zid emas)."""
    base = "Moddalar CaseCraft moddalar ro'yxatidan olinadi (uydirma modda filtrlanadi)"
    arts = list(content.articles.values())
    if arts and all(a.get("verified") for a in arts):
        return base + "; modda matnlari yurist tomonidan tekshirilgan."
    if any(a.get("verified") for a in arts):
        return base + "; belgilangan modda matnlari yurist tekshiruvini kutmoqda."
    return base + "; modda matnlari yurist tekshiruvini kutmoqda."


def _provider_label(provider: str) -> str:
    return "dastur (qoidalar asosida)" if provider in ("kod", "", None) else f"AI ({provider}), dastur tekshiruvi bilan"


def _approval_html(s: Session, rubric: dict[str, Any] | None = None) -> str:
    """O'qituvchi tasdig'i qatori: tasdiqlangan bo'lsa ism, vaqt va tasdiqlangan ball, aks holda imzo uchun bo'sh joy.
    Tasdiqdan keyin baho o'zgargan bo'lsa (faol sessiya tasdiqlanib, keyin yakunlangan) — ogohlantirish."""
    a = getattr(s, "teacher_approval", None)
    if not a:
        return ("<div class=\"sign\"><b>O'qituvchi tasdig'i:</b> ____________________ &nbsp; "
                "Sana: ____________</div>")
    name = html.escape(a.get("teacher_name", ""), quote=False)
    comment = a.get("comment") or ""
    extra = f"<br><small>Izoh: {html.escape(comment, quote=False)}</small>" if comment else ""
    score = ""
    if a.get("total") is not None and a.get("max"):
        score = f" — tasdiqlangan baho: {a['total']} / {a['max']}"
        if rubric and (rubric.get("total"), rubric.get("max")) != (a["total"], a["max"]):
            score += (f"<br><small class=\"unv\">Tasdiqdan keyin baho o'zgargan (joriy: {rubric.get('total')} / "
                      f"{rubric.get('max')}) — o'qituvchi qayta ko'rib chiqishi kerak.</small>")
    return (f"<div class=\"sign appr\"><b>O'qituvchi tasdiqladi:</b> {name}, {_fmt_dt(a.get('approved_at', ''))}"
            f"{score}{extra}</div>")


INTERIM_NOTE_UZ = ("Oraliq bayonnoma: sessiya hali yakunlanmagan, yozuvlar joriy holatgacha; baho dastlabki "
                   "(dastur hisobi), yakuniy baho talaba majlisni yakunlagach chiqadi.")


def bayonnoma_html(content: Content, s: Session, rubric: dict[str, Any], interim: bool = False) -> str:
    def e_(x: Any) -> str:  # matn tugunlari uchun; o'zbekcha tutuq belgisi bitta turda (') saqlanadi
        return html.escape(uz_apos(str(x)), quote=False)

    c = content.case
    w = c.get("witness", {})
    speaker_name = {
        "judge": "Raislik qiluvchi (AI)", "prosecutor": "Prokuror (AI)", "witness": f"Guvoh {w.get('name', '')} (AI)",
        "defense": f"Himoyachi — {s.student_name}", "defendant": f"Sudlanuvchi {c.get('defendant', {}).get('name', '')} (AI)",
        "clerk": "Kotib",
    }
    ref_verified = {a["ref"]: a.get("verified", False) for a in content.articles.values()}
    sections = []
    for st in content.stages:
        rows = [x for x in s.log if x.stage_id == st["id"]]
        if not rows:
            continue
        trs = []
        for x in rows:
            rec = M.record_item(x)  # jonli bayonnoma (record_delta) bilan bir xil manba
            marks = []
            if rec["type"] == "motion":
                marks.append("<span class='mot'>Iltimos (murojaat)</span>")
            elif rec["type"] == "ruling" and not x.violation_id:
                marks.append("<span class='rul'>Raislik qiluvchining qarori</span>")
            if x.violation_id and x.speaker == "defense":
                marks.append(f"<span class='viol'>Qoidabuzarlik: {e_(violation_name(content, x.violation_id))}</span> "
                             f"{_art_label(x.article_ref, ref_verified.get(x.article_ref or '', False))}")
            if x.revealed_hidden_fact:
                marks.append("<span class='rev'>Guvoh yashirin holatni ochdi</span>")
            trs.append(f"<tr><td class='t'>{_time(x.t)} <small>({rec['t']})</small></td>"
                       f"<td class='s'>{e_(speaker_name.get(x.speaker, x.speaker))}"
                       f"</td><td>{e_(rec['text_uz'])}{'<br>' + ' '.join(marks) if marks else ''}</td></tr>")
        sections.append(f"<h3>{e_(st.get('name_uz', st['id']))}</h3><div class='tw'><table><thead><tr><th>Vaqt</th>"
                        f"<th>Kim</th><th>Matn</th></tr></thead><tbody>{''.join(trs)}</tbody></table></div>")
    crit_rows = "".join(
        f"<tr><td><b>{e_(k['name_uz'])}</b><br><small>{e_(k['comment_uz'])}</small></td>"
        f"<td class='n'>{k['level']}/{k['max']}</td>"
        f"<td>{('«' + e_(k['evidence_quote']) + '»') if k['evidence_quote'] else '<i>' + QUOTE_NOT_FOUND_UZ + '</i>'}</td>"
        f"<td>{_art_label(k['article_ref'], k['article_verified'])}</td></tr>"
        for k in rubric["criteria"])
    mode_extra = ""
    if s.mode == "talim":
        mode_extra = (f"<li><b>Maslahatlar:</b> {s.hints_used} / {M.HINTS_MAX} ishlatildi; "
                      f"<b>«Vaqt to'xtadi»:</b> {s.pauses} marta</li>")
    mode_uz = "Ta'lim (ustoz bilan)" if s.mode == "talim" else "Sud majlisi"
    no_rows = "<p>Yozuv yo'q.</p>"
    participants = "".join(f"<li>{e_(v)}</li>" for k, v in speaker_name.items() if k != "clerk") + \
        "<li>Kotib: avtomatik yozuv (kod)</li>"
    return f"""<!doctype html><html lang="uz"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Bayonnoma — {e_(c.get('title_uz', ''))}</title>
<style>
body{{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:16px;color:#1d1d1f;background:#fff;line-height:1.45}}
main{{max-width:880px;margin:0 auto}} h1{{font-size:1.3rem;margin:.2rem 0}} h2{{font-size:1.1rem;margin-top:1.6rem}}
h3{{font-size:1rem;margin:1.2rem 0 .4rem;color:#333}} .disc{{background:#fff4e5;border:1px solid #f0b46b;padding:10px 12px;border-radius:8px;font-weight:600}}
.tw{{overflow-x:auto}} table{{border-collapse:collapse;width:100%;font-size:.92rem}} th,td{{border:1px solid #ddd;padding:6px 8px;vertical-align:top;text-align:left}}
th{{background:#f5f5f7}} td.t{{white-space:nowrap;color:#666}} td.s{{white-space:nowrap;font-weight:600}} td.n{{text-align:center;font-weight:700}}
.viol{{color:#b00020;font-weight:600}} .mot{{color:#1f4fa3;font-weight:600}} .rul{{color:#5b3a00;font-weight:600}} .rev{{color:#0a6b2e;font-weight:600}} .unv{{color:#8a5a00;font-size:.85em}}
.meta li{{margin:.15rem 0}} .total{{font-size:1.15rem;font-weight:700}} .sign{{margin-top:1.5rem;border-top:1px dashed #999;padding-top:10px}} .appr{{color:#0a6b2e}}
@media (max-width:640px){{body{{padding:12px}} .tw table,.tw thead,.tw tbody,.tw tr,.tw td{{display:block;width:auto}}
.tw thead{{display:none}} .tw tr{{border:1px solid #ddd;border-radius:8px;margin:0 0 8px;padding:6px 8px}}
.tw td{{border:none;padding:2px 0}} .tw td.t,.tw td.s{{display:inline;white-space:normal;margin-right:6px}}
.tw td.n{{text-align:left}} .tw td.n:before{{content:"Ball: ";font-weight:400}}}}
@media print{{.disc{{border-color:#000}}}}
</style></head><body><main>
<p class="disc">{e_(DISCLAIMER_UZ)} {e_(TEACHER_NOTE_UZ)}</p>
{f'<p class="disc interim">{e_(INTERIM_NOTE_UZ)}</p>' if interim else ''}
<h1>Sud majlisi bayonnomasi (o'quv simulyatsiyasi){' — oraliq' if interim else ''}</h1>
<ul class="meta">
<li><b>Sana:</b> {_fmt_dt(s.created_at)}</li>
<li><b>Ish:</b> {e_(c.get('title_uz', ''))}</li>
<li><b>Ayblov:</b> {e_(c.get('charge', {}).get('article', ''))}</li>
<li><b>Sessiya:</b> {e_(s.id)}</li>
<li><b>Rejim:</b> {mode_uz}</li>
{mode_extra}</ul>
<h2>Ishtirokchilar</h2><ul class="meta">{participants}</ul>
<h2>Majlis borishi</h2>{''.join(sections) or no_rows}
<h2>Baho (rubrika)</h2>
<p class="total">Jami: {rubric['total']} / {rubric['max']} ({rubric['percent']}%)</p>
<div class="tw"><table><thead><tr><th>Mezon</th><th>Ball</th><th>Talaba gapidan iqtibos</th><th>Modda</th></tr></thead>
<tbody>{crit_rows}</tbody></table></div>
<p><small>Baholovchi: {e_(_provider_label(rubric['provider']))}. Iqtiboslar bayonnomada so'zma-so'z tekshirilgan. {e_(articles_note_uz(content))}</small></p>
{_approval_html(s, rubric)}
<p class="disc">{e_(DISCLAIMER_UZ)}</p>
</main></body></html>"""


async def interim_bayonnoma(content: Content, s: Session) -> str:
    """Faol sessiya uchun oraliq bayonnoma: kod rubrikasi (LLM siz), sessiya holati O'ZGARMAYDI (finished, closed,
    trap_state, kesh)."""
    rubric = await build_rubric(content, s, MockLLM())
    return bayonnoma_html(content, s, rubric, interim=True)


async def finish_session(content: Content, s: Session, llm: LLMProvider) -> dict[str, Any]:
    """/finish: yakuniy rubrika + bayonnoma. Sessiya yopiladi (keyingi /turn — 409 session_finished), natija
    keshlanadi: takroriy /finish shu natijani qaytaradi (qayta baholanmaydi)."""
    if s.finished:
        return s.finished
    completed = s.closed
    if s.trap_state == "pending":  # oyna ochiq holda yakunlandi — tuzoq o'tkazib yuborilgan
        s.trap_state, s.floor_granted = "missed", False
    rubric = await build_rubric(content, s, llm)
    result = {
        "session_id": s.id,
        "case_id": s.case_id,
        "completed": completed,
        "stage_id": s.stage_id,
        "rubric": rubric,
        "bayonnoma_html": bayonnoma_html(content, s, rubric),
        "record": [M.record_item(e) for e in s.log],
        "transcript": [{"log_id": e.log_id, "t": e.t, "t_rel": M.mmss(e.rel_ms), "kind": e.kind,
                        "stage_id": e.stage_id, "speaker": e.speaker,
                        "speaker_uz": SPEAKER_UZ.get(e.speaker, e.speaker), "text": e.text,
                        "violation_id": e.violation_id, "article_ref": e.article_ref,
                        "revealed_hidden_fact": e.revealed_hidden_fact} for e in s.log],
        "disclaimer_uz": DISCLAIMER_UZ,
    }
    s.finished = result
    s.closed = True
    return result
