"""Navbat oqimi: (STT) -> kod pre-check -> holat mashinasi -> LLM -> kod tekshiruvi -> TTS -> log.

LLM bosqichni o'zgartira olmaydi, modda o'ylab topa olmaydi, yashirin faktni o'zi ocha olmaydi —
bularning hammasini shu fayldagi kod hal qiladi.
"""
from __future__ import annotations

import asyncio
import json
import logging
import queue
import re
import threading
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from . import modes as M
from .config import settings
from .content import ARTICLE_NUM_RE, Content, article_key
from .prompts import build_exam_prompt, build_turn_prompt
from .providers.llm import LLMProvider, MockLLM, call_with_fallback
from .providers.tts import TTSProvider
from .textutil import _APOS, contains_any, norm, phrase_hits, split_sentences, truncate_words, uz_apos

log = logging.getLogger("engine")
TASHKENT = timezone(timedelta(hours=5))
MAX_WORDS = 25
AI_SPEAKERS = ("judge", "witness", "prosecutor")

# Talaba bosqichni yakunlashni so'raganini bildiruvchi iboralar (bosqich turiga qarab). BUTUN so'z / ibora sifatida
# solishtiriladi (textutil.phrase_hits): «Boshqa savol: …», «boshqa savolim bor», «tayyormisiz» yakunlamaydi;
# ibora «emas…» bilan davom etsa («tayyor emasman») — inkor, bosqich o'tmaydi.
ADVANCE_PHRASES = {
    "opening": ["tayyorman", "tayyormiz", "tayyor", "boshlashimiz mumkin", "iltimosim yo'q", "iltimosimiz yo'q",
                "iltimoslarim yo'q", "qarshi emasman", "qarshi emasmiz", "qarshiligim yo'q"],
    "questioning": ["savollarim yo'q", "savollarim tugadi", "savolim yo'q", "savolim qolmadi", "savolimiz yo'q",
                    "so'roqni tugatdim", "so'roqni yakunladim", "savollar tugadi", "savollarim qolmadi"],
    "arguments": ["nutqim tugadi", "so'zim tugadi", "boshqa so'zim yo'q", "nutqimni tugatdim", "nutqni tugatdim"],
    "last_word": [],
    "generic": [],
}
ADVANCE_ANY = ["keyingi bosqich", "keyingi bosqichga"]
_AP = "['’ʻʼ‘`´]?"


def advance_request(text: str, kind: str) -> tuple[bool, bool]:
    """(bosqichni yakunlash so'raldimi, inkor qilinganmi). Inkor bo'lsa («tayyor emasman») LLM taklifi ham rad etiladi."""
    if not text:
        return False, False
    hits = phrase_hits(text, ADVANCE_PHRASES.get(kind, []) + ADVANCE_ANY)
    negated = any(neg for _, neg in hits)
    return bool(hits) and not negated, negated


# Promptni chetlab o'tishga urinish / baho so'rash / meta gaplar: LLM ga yuborilmaydi, guvohga savol hisoblanmaydi
META_RX = re.compile(
    rf"ko{_AP}rsatmalar\w*\s+(?:ni\s+)?unut|oldingi\s+\w+\s+unut|\bunut\s+va\b|\bsystem\b|\bprompt|\bjson\b|"
    rf"asked_hidden_fact|reveal_line|hidden_fact|yashirin\s+fakt|\bai\s+(?:misan|misiz)\b|sun{_AP}iy\s+intellekt|"
    rf"\bignore\b|instructions?\b|developer|\d+\s*ball\s+(?:qo{_AP}y|ber)|ball\s+qo{_AP}ying|baho\s+qo{_AP}ying|"
    rf"[{{}}\[\]<>]{{2,}}", re.IGNORECASE)
META_REPLY = {"questioning": "Himoyachi, savol guvohga va ishga oid bo'lsin.",
              "arguments": "Himoyachi, faqat ish dalillari bo'yicha so'zlang."}
META_REPLY_DEFAULT = "Himoyachi, faqat ish bo'yicha gapiring."
NO_WORDS_REPLY = "Himoyachi, fikringizni so'z bilan ayting."
# LLM sudyasining «bosqich o'tdi» iboralari — kod bosqichni o'tkazmagan bo'lsa ishlatilmaydi
STAGE_GRANT_RX = re.compile(
    rf"qanoatlantiril|tugallandi|tugatildi|yakunlandi|nihoyasiga\s+yetdi|boshlanadi|o{_AP}tamiz|o{_AP}tiladi|"
    rf"keyingi\s+bosqich", re.IGNORECASE)
WITNESS_UNKNOWN = "Buni aniq eslay olmayman."
# Talaba so'zsiz dalilga oid savol bersa, LLM uni «aloqasiz» deb rad etmasin: ish materialidagi dalil so'zlari
EVIDENCE_WORDS_RX = re.compile(
    rf"kamera|video|kuzatuv|yozuv|tasvir|\bchek|kassa|noutbuk|javon|do{_AP}kon|fotosurat|surat|dalolatnoma|"
    rf"inventar|masofa|metr|kurtka|kepka|sumka|quti|tergovchi|tintuv|yorug{_AP}lik|soat\s+\d", re.IGNORECASE)
# Guvoh to'qishi mumkin bo'lgan, ish materialida bo'lmasa olib tashlanadigan tafsilotlar
WITNESS_DETAIL_RX = re.compile(
    rf"politsiya|militsiya|chiroq|yorug{_AP}|qorong{_AP}i|yomg{_AP}ir|\bqor\b|tuman|mashina|avtomobil|"
    rf"qo{_AP}ng{_AP}iroq|telefon|pichoq|qurol|sherig|ikki\s+kishi|uch\s+kishi|mototsikl|velosiped", re.IGNORECASE)
# Tuzoq paytida «So'z so'rash» tugmasi — bayonnomada odamcha yozuv (kind="request", rubrika iqtibosiga kirmaydi)
REQUEST_FLOOR_RECORD = "Raislik qiluvchidan so'z so'radi."
# Bosqichni yakunlash uchun himoyachining kamida nechta mazmunli (qoidabuzarliksiz) gapi kerak
MIN_TURNS = {"opening": 0, "questioning": 2, "arguments": 1, "last_word": 0, "generic": 0, "closing": 0}


@dataclass
class Entry:
    log_id: str
    t: str
    stage_id: str
    speaker: str
    text: str
    violation_id: str | None = None
    article_ref: str | None = None
    revealed_hidden_fact: bool = False
    source: str = "code"  # student | precheck | llm:<provider> | code | fallback
    input_mode: str | None = None  # text | audio | action (faqat talaba uchun; audio saqlanmaydi)
    kind: str = "utterance"  # utterance | motion | ruling | record | request
    rel_ms: int = 0  # sessiya boshidan ms (bayonnoma vaqti mm:ss)


@dataclass
class Session:
    id: str
    case_id: str
    student_name: str
    created_at: str
    stage_id: str
    log: list[Entry] = field(default_factory=list)
    witness_revealed: bool = False
    substantive: dict[str, int] = field(default_factory=dict)
    prosecutor_replied: dict[str, bool] = field(default_factory=dict)
    witness_answers: int = 0
    closed: bool = False
    finished: dict[str, Any] | None = None
    llm_fallbacks: int = 0
    timings: list[dict[str, float]] = field(default_factory=list)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock, repr=False)
    # --- rejimlar (prompts/api-rejimlar.md). legacy=True: mode yuborilmagan eski klient — avvalgi xatti-harakat
    mode: str = "majlis"
    legacy: bool = True
    t0: float = field(default_factory=time.monotonic, repr=False)
    record_cursor: int = 0
    # prokuror so'rog'i: None (hali yo'q) | pending (tuzoq savol berildi) | caught | missed
    trap_state: str | None = None
    trap_question: str = ""
    trap_answer: str = ""
    trap_floor_requested: bool = False
    trap_motion_log_id: str | None = None
    floor_granted: bool = False  # tuzoq paytida raislik qiluvchi himoyachiga so'z berdimi
    motions_invalid: int = 0
    hints_used: int = 0
    pauses: int = 0
    exam_script: dict[str, str] | None = None
    exam_source: str = ""
    exam_task: Any = field(default=None, repr=False)
    turn_tutor: dict[str, Any] | None = None
    turn_window: dict[str, Any] | None = None
    # o'qituvchi paneli: {teacher_name, comment, approved_at, total, max} — yakuniy baho odamniki (faqat xotirada)
    teacher_approval: dict[str, Any] | None = None
    last_active: float = field(default_factory=time.monotonic, repr=False)  # sessiyalarni tozalash (TTL) uchun

    @property
    def exam_enabled(self) -> bool:
        return not self.legacy

    def next_log_id(self) -> str:
        return f"{self.id}-{len(self.log) + 1:03d}"


def now_iso() -> str:
    return datetime.now(TASHKENT).isoformat(timespec="seconds")


class _LogWriter:
    """Sessiya jurnali (logs/<id>.jsonl) fon oqimida yoziladi: /turn yo'lida disk I/O kutilmaydi (Windows da har
    open/close antivirus skaneri bilan soniyalab cho'zilishi mumkin — kod-only navbatlar sekinlashardi)."""

    def __init__(self) -> None:
        self.q: queue.Queue = queue.Queue()
        self._thread: threading.Thread | None = None
        self._guard = threading.Lock()

    def put(self, path: Any, line: str) -> None:
        with self._guard:
            if self._thread is None or not self._thread.is_alive():
                self._thread = threading.Thread(target=self._run, name="session-log", daemon=True)
                self._thread.start()
        self.q.put((path, line))

    def _run(self) -> None:
        while True:
            path, line = self.q.get()
            try:
                with path.open("a", encoding="utf-8") as f:
                    f.write(line)
            except OSError as err:
                log.warning("log yozilmadi: %s", err)
            finally:
                self.q.task_done()

    def flush(self) -> None:
        self.q.join()


LOG_WRITER = _LogWriter()
SESSION_TTL_S = 6 * 3600  # shuncha vaqt harakatsiz sessiya xotiradan o'chiriladi
MAX_SESSIONS = 200        # undan ko'p bo'lsa eng eski (oxirgi harakati bo'yicha) sessiyalar o'chiriladi


def _norm_rx(p: str) -> str:
    return p.translate(_APOS)


AFTER_INVESTIGATION_RX = re.compile(r"guvoh[^.?!]*\?", re.IGNORECASE)
AFTER_INVESTIGATION_WARNING = ("Himoyachi, sud tergovi tugagan, endi guvohga savol berib bo'lmaydi. "
                               "Muzokara nutqingizni davom ettiring.")


def in_scope(v: dict[str, Any], stage_id: str) -> bool:
    scope = v.get("_scope")
    return not scope or stage_id in scope


def precheck(content: Content, stage_id: str, text: str) -> tuple[dict[str, Any], str | None] | None:
    """violations.regex_uz bo'yicha kod tekshiruvi. LLM siz, ~0 ms.

    Mos kelsa (violation, warning_override|None). Yashirin fakt tekshiruvidan OLDIN chaqiriladi:
    "ko'zoynaksiz edingiz, to'g'rimi?" kalit so'zga mos bo'lsa ham yo'naltiruvchi savol sifatida rad etiladi.
    """
    t_raw, t_norm = text, norm(text)
    for v in content.violations.values():
        if not in_scope(v, stage_id):
            continue
        for rx in v.get("regex_uz", []):
            try:
                if re.search(_norm_rx(rx), t_norm, re.IGNORECASE) or re.search(rx, t_raw, re.IGNORECASE):
                    return v, None
            except re.error:
                continue
    stage = content.stage(stage_id)
    # Guvoh so'rog'ida tasdiq so'rovchi yopiq savol («…-a?», «…, to'g'ri?», «…, ha?», «…emasmi?») — kontent regexi
    # ushlamasa ham modes.is_leading bilan bir xil qoida: yo'naltiruvchi savol (yashirin fakt bunday savolda ochilmaydi)
    lv = content.violations.get("yonaltiruvchi_savol")
    if (stage and lv and content.stage_kind(stage) == "questioning" and in_scope(lv, stage_id)
            and M.is_leading(content, text)):
        return lv, None
    # Muzokarada guvohga savol — kontentda alohida regex bo'lmasa ham kod ushlaydi
    if stage and content.stage_kind(stage) == "arguments" and AFTER_INVESTIGATION_RX.search(t_norm):
        for vid in ("tergovdan_keyin_savol", "bosqichdan_tashqari"):
            if vid in content.violations:
                v = content.violations[vid]
                return v, (None if v.get("stage_ids") and stage_id in v["stage_ids"] else AFTER_INVESTIGATION_WARNING)
    return None


def violation_payload(content: Content, v: dict[str, Any], preferred_rule_ids: list[str] | None = None,
                      stage_id: str | None = None, warning: str | None = None) -> dict:
    ids = [a for a in v.get("article_ids", []) if a in content.articles]
    pref = [a for a in (preferred_rule_ids or []) if a in ids]
    if not pref and stage_id:  # joriy bosqichga tegishli moddani afzal ko'ramiz
        pref = [a for a in ids if stage_id in (content.articles[a].get("stage_ids") or [])]
    aid = (pref or ids or [None])[0]
    art = content.articles.get(aid) if aid else None
    return {
        "id": v["id"],
        "name_uz": v.get("name_uz", ""),
        "article_id": aid,
        "article_ref": art["ref"] if art else None,
        "article_title_uz": art.get("title_uz") if art else None,
        "article_verified": bool(art and art.get("verified")),
        "article_ids": ids,
        "warning_uz": warning or v.get("warning_uz", ""),
    }


def strip_fabricated_articles(content: Content, text: str) -> tuple[str, list[str]]:
    """rules.json da yo'q modda/bob raqami bor gaplarni olib tashlaydi."""
    known = content.known_article_numbers()
    kept, removed = [], []
    for s in split_sentences(text):
        bad = [article_key(m) for m in ARTICLE_NUM_RE.finditer(s) if article_key(m) not in known]
        (removed if bad else kept).append(s)
    return " ".join(kept).strip(), removed


# Prokuror guvohning identifikatsiyasini bo'rttirmasin: ishda guvoh fotosuratdan faqat «o'xshaydi» degan.
_A = "['’ʻʼ‘`´]"
_ID_INTENSIFIER = (rf"(?:aniq|shubhasiz|shak-?shubhasiz|ishonch\s+bilan|to{_A}?liq|yaqqol|bexato|so{_A}?zsiz|"
                   rf"darhol|qat{_A}?iy)")
_ID_VERB_RX = re.compile(
    rf"(?:\b{_ID_INTENSIFIER}\s+)?\b(?:tanib\s+(?:ol|ber)(?:gan|di)|tani(?:gan|di|ydi|b\s+qolgan))"
    rf"(?P<suf>(?:lig|i|in|ni|ini|ligini|ligi|dek|day)?\b)",
    re.IGNORECASE)
_ID_CONTEXT_RX = re.compile(rf"guvoh|rahimov|mansur|madina|sotuvchi|foto|surat|identifikats|ko{_A}?rsat", re.IGNORECASE)


def soften_identification(text: str) -> str:
    """Prokuror gapida "guvoh uni (aniq) tanigan" kabi iboralarni "«o'xshaydi» deb ko'rsatgan" ga almashtiradi.

    Faqat guvoh identifikatsiyasi kontekstidagi gaplarda (guvoh/fotosurat/... so'zi bor gap). "Tanib olish
    bayonnomasi" kabi hujjat nomlari (fe'l emas) o'zgarmaydi.
    """
    out = []
    for sent in split_sentences(text):
        if _ID_CONTEXT_RX.search(sent):
            sent = _ID_VERB_RX.sub(lambda m: "«o'xshaydi» deb ko'rsatgan" + (m.group("suf") or ""), sent)
        out.append(sent)
    return " ".join(out)


def filter_rule_ids(content: Content, rule_ids: Any) -> list[str]:
    if not isinstance(rule_ids, list):
        return []
    out: list[str] = []
    for r in rule_ids:
        if isinstance(r, str) and r in content.articles and r not in out:
            out.append(r)
    return out


def _clean_text_for_speech(s: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", s or "").strip()


def opening_speech(content: Content) -> str:
    c = content.case
    title = _clean_text_for_speech(c.get("title_uz", ""))
    name = c.get("defendant", {}).get("name", "sudlanuvchi")
    art = _clean_text_for_speech(c.get("charge", {}).get("article", ""))
    parts = ["Sud majlisi ochiq deb e'lon qilinadi.", f"{title}." if title else "",
             f"Sudlanuvchi {name} {art} bo'yicha ayblanmoqda." if art else f"Sudlanuvchi: {name}.",
             "Himoyachi, majlisga tayyormisiz?"]
    return " ".join(p for p in parts if p)


def reveal_line(content: Content) -> str:
    """Guvoh yashirin faktni ochganda aytadigan gap: birinchi shaxsdagi reveal_line_uz (bo'lsa), aks holda text_uz."""
    hidden = content.case.get("witness", {}).get("hidden_fact") or {}
    return (hidden.get("reveal_line_uz") or hidden.get("text_uz") or "").strip()


def stage_announcement(content: Content, stage: dict[str, Any]) -> str:
    kind = content.stage_kind(stage)
    name = _clean_text_for_speech(stage.get("name_uz", stage["id"])).rstrip(".")
    suffix = {
        "questioning": "Himoyachi, guvohga savollaringizni bering.",
        "arguments": "Himoyachi, muzokara nutqingizni so'zlang.",
        "last_word": "Sudlanuvchi, sizga oxirgi so'z beriladi.",
        "closing": CLOSING_TEXT,
    }.get(kind, "")
    return f"{name} boshlanadi. {suffix}".strip() if kind != "closing" else suffix


CLOSED_TEXT = "Majlis yakunlangan. Bayonnoma va bahoni olish uchun yakunlash tugmasini bosing."
CLOSING_TEXT = "Sud maslahat xonasiga chiqadi. O'quv mashqi yakunlandi, hukm chiqarilmaydi."


def defendant_last_word(content: Content) -> str:
    about = norm(content.case.get("defendant", {}).get("about_uz", ""))
    if any(k in about for k in ("iqror emas", "tan olmaydi", "aybsiz", "olmaganini")):
        return "Hurmatli sud, men aybsizman. Sud adolatli qaror qabul qilishini so'rayman."
    return "Hurmatli sud, qilmishimdan pushaymonman. Jazo tayinlashda buni inobatga olishingizni so'rayman."


ARGUMENTS_GIVE_FLOOR = "Himoyachi, so'z sizga. Muzokara nutqingizni so'zlang."


def prosecutor_closing(content: Content) -> str:
    """Sud muzokarasida birinchi so'z davlat ayblovchisiniki (JPK 449): prosecutor_position_uz dan, <= 40 so'z."""
    pos = re.sub(r"^[^:.]{0,30}:\s*", "", str(content.case.get("prosecutor_position_uz") or "").strip())
    pos = pos or "Ayblov o'z kuchida qoladi, sudlanuvchining aybi ish materiallari bilan isbotlangan."
    pos, _ = strip_fabricated_articles(content, pos)
    pos, _ = M.strip_forbidden(pos)
    pos = soften_identification(pos) or "Ayblov o'z kuchida qoladi."
    return truncate_words("Hurmatli sud, " + pos[:1].lower() + pos[1:], 40)


def _material_text(content: Content) -> str:
    """Guvoh tayanishi mumkin bo'lgan ochiq material (yashirin faktsiz): ish, faktlar, dalillar, guvoh faktlari."""
    case = content.case
    w = case.get("witness") or {}
    parts = [case.get("summary_uz"), case.get("facts_uz"), case.get("evidence"), case.get("defendant"),
             w.get("public_facts_uz"), w.get("persona_uz"), w.get("prosecutor_exam")]
    return norm(json.dumps(parts, ensure_ascii=False))


def witness_fallback(content: Content, text: str, answers: int = 0) -> str:
    """Kod javobi: savol so'zlariga eng mos ochiq fakt, mos kelmasa «Buni aniq eslay olmayman.»"""
    facts = (content.case.get("witness") or {}).get("public_facts_uz", []) or []
    q = {w for w in re.findall(r"[a-z']+", norm(text)) if len(w) > 3}
    best, score = None, 0
    for f in facts:
        sc = len(q & {w for w in re.findall(r"[a-z']+", norm(f)) if len(w) > 3})
        if sc > score:
            best, score = f, sc
    return best or WITNESS_UNKNOWN


def check_witness_reply(content: Content, utter: str) -> str:
    """Guvohning LLM javobidagi to'qilgan tafsilotlarni olib tashlaydi: ish materialida yo'q raqam yoki hodisa
    (politsiya, chiroq, yorug'lik ...) bor gap tashlanadi. Hech narsa qolmasa — «Buni aniq eslay olmayman.»"""
    mat = _material_text(content)
    mat_nums = set(re.findall(r"\d+", mat))
    kept = []
    for sent in split_sentences(utter):
        t = norm(sent)
        bad_num = any(n not in mat_nums for n in re.findall(r"\d+", t))
        bad_detail = any(m.group(0) not in mat for m in WITNESS_DETAIL_RX.finditer(t))
        if bad_num or bad_detail:
            log.warning("guvoh javobidan to'qilgan tafsilot olib tashlandi: %s", sent[:80])
            continue
        kept.append(sent)
    return " ".join(kept).strip() or WITNESS_UNKNOWN


def turn_schema(content: Content) -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "speaker": {"type": "string", "enum": list(AI_SPEAKERS)},
            "utterance_uz": {"type": "string", "description": "<= 25 so'z, o'zbek lotin"},
            "violation_id": {"type": "string", "enum": ["none", *content.violations.keys()]},
            "rule_ids": {"type": "array", "items": {"type": "string", "enum": list(content.articles.keys()) or ["none"]}},
            "asked_hidden_fact": {"type": "boolean"},
            "advance_stage": {"type": "boolean"},
        },
        "required": ["speaker", "utterance_uz", "violation_id", "rule_ids", "asked_hidden_fact", "advance_stage"],
    }


class Engine:
    def __init__(self, content_loader, llm: LLMProvider, tts: TTSProvider, stt):
        self.content_loader = content_loader
        self.llm, self.tts, self.stt = llm, tts, stt
        self.sessions: dict[str, Session] = {}
        self.pending_tts: dict[str, tuple[str, str]] = {}  # deferred rejim: kalit -> (matn, speaker)
        settings.log_dir.mkdir(parents=True, exist_ok=True)

    async def audio_ref(self, text: str, speaker: str) -> str | None:
        """Keshda bo'lsa fayl nomi; deferred rejimda "tts:<kalit>" (audio GET so'rovida yaratiladi); aks holda synth."""
        if self.tts.name == "none" or not text.strip():
            return None
        cached = self.tts.cached_name(text, speaker)
        if cached:
            return cached
        if settings.tts_mode == "deferred":
            key = self.tts.cache_key(text, speaker)
            if len(self.pending_tts) > 1000:
                self.pending_tts.clear()
            self.pending_tts[key] = (text, speaker)
            return f"tts:{key}"
        return await self.tts.synth(text, speaker)

    @property
    def content(self) -> Content:
        return self.content_loader()

    # ------------------------------------------------------------------ log
    def _append(self, s: Session, e: Entry) -> Entry:
        e.text = uz_apos(e.text)  # ko'rsatiladigan matnda tutuq belgisi bitta turda ('); TTS asl matnni oladi
        s.last_active = time.monotonic()
        e.rel_ms = int((s.last_active - s.t0) * 1000)
        s.log.append(e)
        LOG_WRITER.put(settings.log_dir / f"{s.id}.jsonl", json.dumps(asdict(e), ensure_ascii=False) + "\n")
        return e

    def prune_sessions(self, now: float | None = None) -> int:
        """Xotirani cheklash: SESSION_TTL_S dan ko'p harakatsiz sessiyalar va MAX_SESSIONS dan ortig'i (eng eski
        harakat bo'yicha) o'chiriladi. O'chirilganlar soni."""
        now = time.monotonic() if now is None else now
        dead = [sid for sid, x in self.sessions.items() if now - x.last_active > SESSION_TTL_S]
        alive = sorted((x for sid, x in self.sessions.items() if sid not in dead), key=lambda x: x.last_active)
        dead += [x.id for x in alive[:max(0, len(alive) - MAX_SESSIONS)]]
        for sid in dead:
            self.sessions.pop(sid, None)
        if dead:
            log.info("xotiradan %d ta eski sessiya o'chirildi", len(dead))
        return len(dead)

    # ------------------------------------------------------------------ start
    async def start(self, case_id: str | None, student_name: str = "", mode: str | None = None
                    ) -> tuple[Session, Entry, str | None]:
        content = self.content
        cid = content.case.get("id")
        if case_id and case_id != cid:
            raise KeyError(cid)
        sid = uuid.uuid4().hex[:12]
        self.prune_sessions()
        s = Session(id=sid, case_id=cid, student_name=student_name.strip() or "Talaba", created_at=now_iso(),
                    stage_id=content.stages[0]["id"], mode=mode if mode in M.MODES else "majlis",
                    legacy=mode not in M.MODES)
        self.sessions[sid] = s
        text = opening_speech(content)
        e = self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker="judge",
                                  text=text, source="code"))
        if s.mode == "talim":
            st0 = content.stages[0]
            kind = content.stage_kind(st0)
            s.turn_tutor = {"say_uz": M.tutor_stage_say(content, kind, st0),
                            "choices": M.tutor_choices(content, kind, st0), "pause": False, "event": "stage_start"}
        fixed = M.content_exam(content) if s.exam_enabled else None
        if fixed:  # case.json dagi tayyor so'roq — deterministik demo, LLM chaqirilmaydi
            s.exam_script, s.exam_source = fixed
        elif s.exam_enabled and not isinstance(self.llm, MockLLM):
            # prokuror so'rog'ini oldindan tayyorlaymiz: sud tergoviga o'tishda kutilmasin
            s.exam_task = asyncio.create_task(self._gen_exam(s, content))
        audio = await self.audio_ref(text, "judge")
        return s, e, audio

    async def start_extras(self, s: Session) -> dict[str, Any]:
        """/session/start javobiga: mode, floor, record_delta, tutor, window."""
        return await self._extras(s, self.content)

    # ------------------------------------------------------------------ prokuror so'rog'i
    async def _gen_exam(self, s: Session, content: Content) -> None:
        try:
            system, user = build_exam_prompt(content)
            raw, _provider, _fell_back = await call_with_fallback(self.llm, "prosecutor_exam", system, user,
                                                                  M.EXAM_SCHEMA, {"stage_kind": "exam"})
        except Exception as err:  # noqa: BLE001
            log.warning("prokuror so'rog'i LLM xato (%s) — shablon", type(err).__name__)
            raw = {}
        s.exam_script, s.exam_source = M.validate_exam(content, raw)
        log.info("prokuror so'rog'i: %s", s.exam_source)

    async def _exam(self, s: Session, content: Content) -> dict[str, str]:
        if not s.exam_script and (fixed := M.content_exam(content)):
            s.exam_script, s.exam_source = fixed
        task = s.exam_task
        if not s.exam_script and task is not None and task.get_loop() is asyncio.get_running_loop():
            try:
                await asyncio.wait_for(asyncio.shield(task), timeout=settings.llm_timeout_s + 2)
            except Exception:  # noqa: BLE001
                pass
            if not s.exam_script:
                s.exam_script, s.exam_source = M.exam_template(content), "shablon"
        if not s.exam_script:
            await self._gen_exam(s, content)
        return s.exam_script or M.exam_template(content)

    def _trap_missed_lines(self, s: Session) -> list[tuple[str, str, str]]:
        s.trap_state, s.floor_granted = "missed", False
        return [("witness", s.trap_answer, "utterance"), ("prosecutor", M.PROSECUTOR_DONE, "utterance"),
                ("judge", M.JUDGE_GIVE_FLOOR, "utterance")]

    def _tutor_missed(self, s: Session, content: Content) -> None:
        if s.mode == "talim":
            s.pauses += 1
            s.turn_tutor = {"say_uz": M.missed_trap_explanation(content, s.trap_question),
                            "choices": [dict(M.MISSED_RETRY)], "pause": True, "rule": M.trap_rule(content),
                            "event": "motion_missed"}

    def _talim_pause(self, s: Session, content: Content, vp: dict[str, Any], missed_trap: bool = False) -> None:
        """Talim: qoidabuzarlikda «Vaqt to'xtadi» — pause, rule (ref, sarlavha, matn), «Qayta urinib ko'ring» va
        qayta urinish kartasi har doim. missed_trap: shu gap bilan prokurorning tuzoq savoli ham o'tkazib yuborildi."""
        if s.mode != "talim":
            return
        say, rule = M.violation_explanation(content, vp)
        kind = content.stage_kind(content.stage(s.stage_id) or content.stages[0])
        card = M.retry_card(vp["id"], kind)
        if missed_trap:
            say += " " + M.missed_trap_explanation(content, s.trap_question)
            if card.get("action") == "request_floor":  # tuzoq o'tib ketdi, so'z endi talabada — «So'z so'rash» no-op
                card = dict(M.MISSED_RETRY)
        s.pauses += 1
        s.turn_tutor = {"say_uz": say, "choices": [card], "pause": True, "rule": rule, "event": "violation"}

    def _open_window(self, s: Session) -> None:
        s.turn_window = {"kind": "motion_opportunity", "until_ms": M.WINDOW_MS,
                         "hint_uz": "Prokurorning savoliga diqqat qiling" if s.mode == "talim" else None}

    # ------------------------------------------------------------------ turn
    async def turn(self, s: Session, text: str, input_mode: str = "text", action: str | None = None) -> dict[str, Any]:
        content = self.content
        t0 = time.perf_counter()
        timings: dict[str, float] = {}
        stage = content.stage(s.stage_id) or content.stages[0]
        kind = content.stage_kind(stage)
        text = (text or "").strip()
        s.turn_tutor = s.turn_window = None

        if s.closed:  # yopilgan majlis: javob bayonnomaga yozilmaydi (har gapda yangi yozuv qo'shilmasin)
            return await self._ephemeral(s, content, "judge", CLOSED_TEXT, t0, timings)

        # --- maxsus harakatlar
        if action == "hint":
            return await self._hint(s, content, kind, t0, timings)
        if action == "request_floor":
            return await self._request_floor(s, content, t0, timings)
        if action == "continue" or (action == "next_stage" and s.trap_state == "pending"):
            if s.trap_state == "pending":  # oyna o'tdi: guvoh tuzoq savolga javob beradi, jim davom etadi
                lines = self._trap_missed_lines(s)
                self._tutor_missed(s, content)
                return await self._reply(s, content, lines[0][0], lines[0][1], None, False, "code", t0, timings,
                                         followups=lines[1:])
            return await self._ephemeral(s, content, "judge", M.JUDGE_FLOOR_YOURS, t0, timings)
        # Matnli murojaat («Hurmatli sud, savolni rad etishni so'rayman»): tuzoq kutilayotganda yoki guvoh so'rog'ida
        # har doim tugma bilan bir xil yo'l (asossiz bo'lsa rad etiladi). Savol yoki ishora qiluvchi gap murojaat emas.
        motion_text = bool(text) and M.is_motion_text(text) and not M.is_leading(content, text)
        if action == "motion_reject_question" or (motion_text and (
                s.trap_state == "pending" or (kind == "questioning" and s.exam_enabled))):
            return await self._motion(s, content, text, input_mode, t0, timings)
        if text and not action and not re.search(r"[^\W\d_]", text):  # harf yo'q (emoji, belgilar) — LLM siz
            return await self._ephemeral(s, content, "judge", NO_WORDS_REPLY, t0, timings)

        # Matnsiz «keyingi bosqich» tugmasi bayonnomaga yozilmaydi: raislik qiluvchining e'loni (yoki rad javobi)
        # o'zi yetarli; texnik «(keyingi bosqich so'raldi)» yozuvi foydalanuvchiga chiqmasin.
        student = self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker="defense",
                                        text=text, source="student", input_mode=input_mode)) if text else None
        timings["log_ms"] = round((time.perf_counter() - t0) * 1000, 2)

        # 0) So'z navbati: prokuror guvohni so'roq qilayotganda (tuzoq savol kutilmoqda) talaba gapirdi
        if text and s.trap_state == "pending":
            if s.floor_granted:  # so'z murojaat uchun berilgan edi, lekin murojaat qilinmadi
                hit = precheck(content, s.stage_id, text)
                if hit:  # so'z olib, o'zi qoidabuzarlik qildi (masalan, ishora qiluvchi savol)
                    vp = violation_payload(content, hit[0], stage_id=s.stage_id, warning=hit[1])
                    student.violation_id, student.article_ref = vp["id"], vp["article_ref"]
                    lines = self._trap_missed_lines(s)
                    self._talim_pause(s, content, vp, missed_trap=True)
                    return await self._reply(s, content, "judge", vp["warning_uz"], vp, False, "precheck", t0,
                                             timings, followups=lines)
                lines = self._trap_missed_lines(s)
                self._tutor_missed(s, content)
                return await self._reply(s, content, "judge", M.JUDGE_WAIT_PROSECUTOR, None, False, "code", t0,
                                         timings, followups=lines)
            vp = violation_payload(content, M.unauthorized_violation(content), stage_id=s.stage_id)
            student.violation_id, student.article_ref = vp["id"], vp["article_ref"]
            lines = self._trap_missed_lines(s)
            self._talim_pause(s, content, vp, missed_trap=True)
            return await self._reply(s, content, "judge", vp["warning_uz"], vp, False, "code", t0, timings,
                                     followups=lines)

        # 0b) Promptni chetlab o'tish / baho so'rash / meta gap: LLM ga yuborilmaydi, savol yoki nutq hisoblanmaydi
        if text and META_RX.search(norm(text)):
            student.kind = "meta"
            return await self._reply(s, content, "judge", META_REPLY.get(kind, META_REPLY_DEFAULT), None, False,
                                     "code", t0, timings)

        # 1) Kod pre-check: qoidabuzarlik bo'lsa LLM siz darhol ogohlantirish (oldindan tayyor mp3)
        if text:
            t_pc = time.perf_counter()
            hit = precheck(content, s.stage_id, text)
            timings["precheck_ms"] = round((time.perf_counter() - t0) * 1000, 2)
            timings["precheck_only_ms"] = round((time.perf_counter() - t_pc) * 1000, 2)
            if hit:
                vp = violation_payload(content, hit[0], stage_id=s.stage_id, warning=hit[1])
                student.violation_id, student.article_ref = vp["id"], vp["article_ref"]
                if s.mode == "majlis" and not s.legacy and vp["id"] == "yonaltiruvchi_savol":
                    # majlis: avval prokuror raislik qiluvchiga murojaat qiladi, keyin qaror (ikkalasi keshda)
                    return await self._reply(
                        s, content, "prosecutor", M.prosecutor_motion_text(content), vp, False, "precheck", t0,
                        timings, main_kind="motion",
                        followups=[("judge", M.ruling_on_prosecutor_motion(vp["warning_uz"]), "ruling")])
                self._talim_pause(s, content, vp)
                return await self._reply(s, content, "judge", vp["warning_uz"], vp, False, "precheck", t0, timings)

        # 2) Holat mashinasi: talaba bosqichni yakunlashni so'radimi (butun ibora; «tayyor emasman» — inkor)
        adv, adv_negated = advance_request(text, kind)
        wants_advance = action == "next_stage" or adv
        is_pure_request = wants_advance and len(text.split()) <= 6
        # Guvoh so'rog'ida faqat guvoh javob bergan savol hisoblanadi (pastda); boshqa bosqichda mazmunli gap
        if text and not is_pure_request and kind != "questioning":
            s.substantive[s.stage_id] = s.substantive.get(s.stage_id, 0) + 1
        if wants_advance:
            if self._can_advance(s, content, stage):
                return await self._advance(s, content, t0, timings)
            # Qaror kodniki: o'tish bloklangan bo'lsa matn ham shablondan (LLM «qanoatlantirildi» demasin). Uzun so'rov
            # («guvohga savollarim tugadi, muzokaraga o'tishni so'rayman») ham — faqat ichida savol bo'lsa LLM ga.
            if is_pure_request or (adv and not M.is_question(text)):
                return await self._reply(s, content, "judge", self._blocked_msg(s, content, stage), None, False,
                                         "code", t0, timings)

        if not text:
            return await self._reply(s, content, "judge", "Himoyachi, so'zingizni ayting.", None, False, "code",
                                     t0, timings)

        # 3) LLM (JSON schema)
        ctx = {
            "stage_kind": kind, "student_text": text, "case": content.case,
            "witness_answers": s.witness_answers,
            "prosecutor_replied": s.prosecutor_replied.get(s.stage_id, False),
        }
        system, user = build_turn_prompt(content, s, stage, text)
        t_llm = time.perf_counter()
        raw, provider, fell_back = await call_with_fallback(self.llm, "turn", system, user, turn_schema(content), ctx)
        timings["llm_ms"] = round((time.perf_counter() - t_llm) * 1000, 1)
        if fell_back:
            s.llm_fallbacks += 1
        source = f"llm:{provider}" + (":fallback" if fell_back else "")
        raw = raw if isinstance(raw, dict) else {}

        # 4) Kod tekshiruvi
        allowed = [x for x in stage.get("allowed_speakers", []) if x in AI_SPEAKERS] or ["judge"]
        speaker = raw.get("speaker") if raw.get("speaker") in allowed else "judge"
        rule_ids = filter_rule_ids(content, raw.get("rule_ids"))
        vid = raw.get("violation_id")
        v = content.violations.get(vid) if isinstance(vid, str) else None
        if v and v.get("stage_ids") and s.stage_id not in v["stage_ids"]:
            v = None  # kontent bu qoidabuzarlikni shu bosqichda aniq taqiqlamagan

        utter = str(raw.get("utterance_uz") or "").strip()
        utter, removed = strip_fabricated_articles(content, utter)
        if removed:
            log.warning("Uydirma modda olib tashlandi: %s", removed)
        utter, banned = M.strip_forbidden(utter)
        if banned:
            log.warning("Taqiqlangan ibora olib tashlandi: %s", banned)

        if (v and v["id"] == "aloqasiz_savol" and kind == "questioning" and "witness" in allowed
                and EVIDENCE_WORDS_RX.search(norm(text))):
            # ish dalillari (kamera, chek, masofa ...) haqidagi savol ishga aloqador — LLM rad etgan bo'lsa ham
            log.info("aloqasiz_savol bekor qilindi: savol ish dalillariga oid")
            v, speaker, utter = None, "witness", witness_fallback(content, text, s.witness_answers)
            raw = {**raw, "asked_hidden_fact": False}

        if v:  # sudya albatta to'xtatadi
            # Bosqich doirasida: yurist tekshirgan warning_uz. Doiradan tashqarida (masalan, muzokarada guvohga
            # savol) warning_uz matni boshqa bosqichga yozilgan — sudyaning tekshirilgan qisqa gapi ishlatiladi.
            warning = None if in_scope(v, s.stage_id) else (
                truncate_words(utter, MAX_WORDS) if utter and raw.get("speaker") == "judge"
                else f"Himoyachi, bunga yo'l qo'yilmaydi: {v.get('name_uz', '').lower()}.")
            vp = violation_payload(content, v, rule_ids, stage_id=s.stage_id, warning=warning)
            student.violation_id, student.article_ref = vp["id"], vp["article_ref"]
            if kind != "questioning":
                s.substantive[s.stage_id] = max(0, s.substantive.get(s.stage_id, 1) - 1)
            self._talim_pause(s, content, vp)
            return await self._reply(s, content, "judge", vp["warning_uz"], vp, False, source, t0, timings)

        revealed = False
        hidden = content.case.get("witness", {}).get("hidden_fact") or {}
        if speaker == "witness" and kind == "questioning":
            keyword = contains_any(text, hidden.get("reveal_keywords", []))
            # Fakt faqat kod ruxsati bilan: LLM «so'radi» desa + savolda kalit so'z + savol ishora qiluvchi emas
            grant = (bool(raw.get("asked_hidden_fact")) and bool(keyword) and bool(hidden.get("text_uz"))
                     and not M.is_leading(content, text))
            if grant:
                if not s.witness_revealed:
                    revealed = True
                    s.witness_revealed = True
                utter = reveal_line(content)  # fakt matnini kod qo'shadi (LLM o'zi bilmaydi), faqat kanonik qator
            elif M.mentions_hidden_topic(content, utter):
                # LLM yashirin fakt mavzusini o'zi to'qidi (masalan, kirill savolda) — kod ruxsatisiz aytilmaydi
                log.warning("guvoh javobi yashirin fakt mavzusiga tegdi (kod ruxsatisiz) — almashtirildi")
                utter = reveal_line(content) if s.witness_revealed else WITNESS_UNKNOWN
            else:
                utter = check_witness_reply(content, utter) if utter else utter
            s.witness_answers += 1
            s.substantive[s.stage_id] = s.substantive.get(s.stage_id, 0) + 1
        if speaker == "prosecutor":
            if kind == "arguments" and s.exam_enabled and s.prosecutor_replied.get(s.stage_id):
                # muzokarada ayblovchi birinchi so'zladi (JPK 449); oxirgi nutq himoyachida qoladi
                speaker, utter = "judge", "Sud himoyachining nutqini tingladi. Himoyachi, davom eting yoki nutqni yakunlang."
            else:
                s.prosecutor_replied[s.stage_id] = True
                utter = soften_identification(utter)

        if (raw.get("advance_stage") and speaker == "judge" and not adv_negated
                and self._can_advance(s, content, stage)):
            return await self._advance(s, content, t0, timings, source=source)
        if speaker == "judge" and (raw.get("advance_stage") or (
                (adv or kind == "questioning") and STAGE_GRANT_RX.search(norm(utter)))):
            # bosqich o'zgarmadi — sudya «qanoatlantirildi / tugallandi / boshlanadi» demasin: kod shabloni
            log.info("LLM sudyasi bosqich o'tishini aytdi, kod o'tkazmadi — shablon")
            utter = self._blocked_msg(s, content, stage)

        if not utter:
            utter = {"witness": WITNESS_UNKNOWN, "prosecutor": "Ayblov o'z kuchida qoladi."}.get(
                speaker, "Sud sizni eshitdi. Davom eting.")
        if not revealed:
            utter = truncate_words(utter, MAX_WORDS)
        return await self._reply(s, content, speaker, utter, None, revealed, source, t0, timings, rule_ids=rule_ids)

    # ------------------------------------------------------------------ harakatlar
    async def _motion(self, s: Session, content: Content, text: str, input_mode: str, t0: float, timings: dict):
        """Talaba raislik qiluvchidan savolni rad etishni so'raydi (JPK 102)."""
        st = self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker="defense",
                                   text=text or M.student_motion_text(content), source="student",
                                   input_mode=input_mode if text else "action", kind="motion"))
        if s.trap_state == "pending":
            s.trap_state, s.floor_granted, s.trap_motion_log_id = "caught", False, st.log_id
            if s.mode == "talim":  # so'z endi himoyachida — ochiq savol kartalari (harakatsiz)
                q = [c for c in M.tutor_choices(content, "questioning", content.stage(s.stage_id))
                     if not c.get("action")]
                s.turn_tutor = {"say_uz": M.CAUGHT_PRAISE_FREE, "choices": q, "pause": False, "event": "motion_ok"}
            return await self._reply(
                s, content, "judge", M.ruling_granted(content), None, False, "code", t0, timings, main_kind="ruling",
                followups=[("clerk", M.CLERK_RECORDED, "record"), ("prosecutor", M.PROSECUTOR_DONE, "utterance"),
                           ("judge", M.JUDGE_GIVE_FLOOR, "utterance")])
        s.motions_invalid += 1
        if s.mode == "talim":
            s.turn_tutor = {"say_uz": M.MOTION_DENIED_TUTOR, "choices": [], "pause": False, "event": "motion_denied"}
        return await self._reply(s, content, "judge", M.RULING_DENIED, None, False, "code", t0, timings,
                                 main_kind="ruling")

    async def _request_floor(self, s: Session, content: Content, t0: float, timings: dict):
        if s.trap_state == "pending" and not s.floor_granted:
            s.floor_granted = s.trap_floor_requested = True
            self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker="defense",
                                  text=REQUEST_FLOOR_RECORD, source="student", input_mode="action",
                                  kind="request"))
            self._open_window(s)  # murojaat uchun yana vaqt
            return await self._reply(s, content, "judge", M.JUDGE_HEARS, None, False, "code", t0, timings)
        return await self._ephemeral(s, content, "judge", M.JUDGE_FLOOR_YOURS, t0, timings)

    async def _hint(self, s: Session, content: Content, kind: str, t0: float, timings: dict):
        if s.mode != "talim":
            return await self._ephemeral(s, content, "judge", "Majlis rejimida maslahat berilmaydi.", t0, timings)
        if s.hints_used >= M.HINTS_MAX:
            say = "Maslahatlar tugadi. O'zingiz harakat qilib ko'ring."
        else:
            say = M.hint_for(kind, s.hints_used, s.trap_state == "pending", s.witness_revealed,
                             content.stage(s.stage_id), floor_holder=self._floor_holder(s))
            s.hints_used += 1
        s.turn_tutor = {"say_uz": say, "choices": [], "pause": False, "event": "hint"}
        if s.trap_state == "pending":
            self._open_window(s)
        return await self._ephemeral(s, content, "tutor", say, t0, timings)

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _blocked_msg(s: Session, content: Content, stage: dict[str, Any]) -> str:
        """Bosqichdan o'tish kod qoidasi (MIN_TURNS) bilan bloklanganda sudyaning shablon gapi."""
        kind = content.stage_kind(stage)
        need = max(1, MIN_TURNS.get(kind, 0) - s.substantive.get(stage["id"], 0))
        if kind == "questioning":
            msg = f"Himoyachi, guvohga yana kamida {need} ta savol bering, so'ng so'roqni yakunlaysiz."
        elif kind == "arguments":
            msg = "Himoyachi, avval muzokara nutqingizni so'zlang, so'ng nutqni yakunlaysiz."
        else:
            msg = f"Bu bosqich hali tugamadi: {stage.get('goal_uz', '')}".strip()
        return truncate_words(msg, MAX_WORDS)

    def _can_advance(self, s: Session, content: Content, stage: dict[str, Any]) -> bool:
        if content.next_stage(stage["id"]) is None:
            return False
        kind = content.stage_kind(stage)
        return s.substantive.get(stage["id"], 0) >= MIN_TURNS.get(kind, 0)

    async def _advance(self, s: Session, content: Content, t0: float, timings: dict, source: str = "code"):
        nxt = content.next_stage(s.stage_id)
        assert nxt is not None
        s.stage_id = nxt["id"]
        nkind = content.stage_kind(nxt)
        followups: list[tuple[str, ...]] = []
        text = stage_announcement(content, nxt)
        if content.next_stage(nxt["id"]) is None:  # oxirgi bosqich: majlis yopiladi, hukm chiqarilmaydi
            s.closed = True
            if nkind == "last_word":
                followups = [("defendant", defendant_last_word(content)), ("judge", CLOSING_TEXT)]
        elif nkind == "questioning" and s.exam_enabled and s.trap_state is None:
            # guvoh ayblov tarafidan chaqirilgan: avval prokuror so'roq qiladi (JPK 442), 2-savol — ishora qiluvchi
            sc = await self._exam(s, content)
            text = exam_announcement(content, nxt)
            followups = [("prosecutor", sc["q1_open"]), ("witness", sc["a1"]), ("prosecutor", sc["q2_leading"])]
            s.trap_state, s.trap_question, s.trap_answer, s.floor_granted = \
                "pending", sc["q2_leading"], sc["a2"], False
            self._open_window(s)
        elif nkind == "arguments" and s.exam_enabled:
            # Sud muzokarasi (JPK 449): avval davlat ayblovchisi, keyin himoyachi — oxirgi nutq himoyada qoladi
            text = muzokara_announcement(nxt)
            followups = [("prosecutor", prosecutor_closing(content)), ("judge", ARGUMENTS_GIVE_FLOOR)]
            s.prosecutor_replied[nxt["id"]] = True
        if s.mode == "talim":
            choices = [] if s.closed else M.tutor_choices(content, nkind, nxt)  # yopilgan majlisda karta yo'q
            if s.trap_state == "pending" and not s.floor_granted and nkind == "questioning":
                choices = M.trap_window_choices(content, choices)  # so'z prokurorda: faqat murojaat / so'z so'rash
            s.turn_tutor = {"say_uz": M.tutor_stage_say(content, nkind, nxt),
                            "choices": choices, "pause": False, "event": "stage_start"}
        return await self._reply(s, content, "judge", text, None, False, "code", t0,
                                 timings, stage_changed=True, followups=followups)

    @staticmethod
    def _floor_holder(s: Session) -> str:
        """Hozir so'z kimda: majlis yopilgan — judge; tuzoq savol kutilmoqda (so'z berilmagan) — prosecutor;
        aks holda — defense (talaba)."""
        if s.closed:
            return "judge"
        if s.trap_state == "pending" and not s.floor_granted:
            return "prosecutor"
        return "defense"

    async def _extras(self, s: Session, content: Content) -> dict[str, Any]:
        """Har javobga: mode, floor, record_delta (oxirgi javobdan beri yangi yozuvlar), tutor (talim), window."""
        holder = self._floor_holder(s)
        floor = M.floor_payload(holder, None if holder != "defense" else "defense", closed=s.closed)
        delta = [M.record_item(e) for e in s.log[s.record_cursor:]]
        s.record_cursor = len(s.log)
        tutor = None
        if s.mode == "talim":
            tt = s.turn_tutor or {}
            say = tt.get("say_uz") or None
            # event: ustoz xabari qaysi hodisaga tegishli. "none" — bu navbatda ustoz gapi yo'q (eski karta eskirgan)
            tutor = {"say_uz": uz_apos(say) if say else None, "choices": tt.get("choices", []), "hints_left": M.HINTS_MAX - s.hints_used,
                     "hints_used": s.hints_used, "pause": bool(tt.get("pause")), "rule": tt.get("rule"),
                     "event": tt.get("event") or "none",
                     "audio_file": await self.audio_ref(say, "tutor") if say else None}
        window, s.turn_tutor, s.turn_window = s.turn_window, None, None
        return {"mode": s.mode, "floor": floor, "record_delta": delta, "tutor": tutor, "window": window}

    def _response(self, s: Session, content: Content, speaker: str, text: str, violation: dict | None,
                  revealed: bool, audio: str | None, fu: list[dict], log_id: str | None, source: str,
                  timings: dict, stage_changed: bool, rule_ids: list[str] | None) -> dict[str, Any]:
        stage = content.stage(s.stage_id) or {}
        return {
            "speaker": speaker,
            "text_uz": text,
            "stage_id": s.stage_id,
            "stage_name_uz": stage.get("name_uz"),
            "stage_kind": content.stage_kind(stage) if stage else None,
            "stage_changed": stage_changed,
            "can_advance": self._can_advance(s, content, stage) if stage else False,
            "finished": s.closed,
            "violation": violation,
            "rule_refs": [content.articles[r]["ref"] for r in (rule_ids or [])],
            "revealed_hidden_fact": revealed,
            "audio_file": audio,
            "followups": fu,
            "log_id": log_id,
            "source": source,
            "timings": timings,
        }

    async def _ephemeral(self, s: Session, content: Content, speaker: str, text: str, t0: float, timings: dict):
        """Bayonnomaga yozilmaydigan javob (maslahat, "so'z sizda")."""
        audio = await self.audio_ref(text, speaker)
        timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        res = self._response(s, content, speaker, uz_apos(text), None, False, audio, [], None, "code", timings,
                             False, None)
        res.update(await self._extras(s, content))
        return res

    async def _reply(self, s: Session, content: Content, speaker: str, text: str, violation: dict | None,
                     revealed: bool, source: str, t0: float, timings: dict, stage_changed: bool = False,
                     rule_ids: list[str] | None = None, followups: list[tuple[str, ...]] | None = None,
                     main_kind: str = "utterance") -> dict[str, Any]:
        e = self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker=speaker,
                                  text=text, violation_id=violation["id"] if violation else None,
                                  article_ref=violation["article_ref"] if violation else None,
                                  revealed_hidden_fact=revealed, source=source, kind=main_kind))
        t_tts = time.perf_counter()
        fu_entries = [self._append(s, Entry(log_id=s.next_log_id(), t=now_iso(), stage_id=s.stage_id, speaker=f[0],
                                            text=f[1], source="code", kind=f[2] if len(f) > 2 else "utterance"))
                      for f in (followups or [])]
        audios = await asyncio.gather(self.audio_ref(text, speaker),
                                      *[self.audio_ref(f[1], fe.speaker) for f, fe in zip(followups or [], fu_entries)])
        timings["tts_ms"] = round((time.perf_counter() - t_tts) * 1000, 1)
        timings["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
        s.timings.append(timings)
        fu = [{"speaker": fe.speaker, "text_uz": fe.text, "audio_file": a, "log_id": fe.log_id, "kind": fe.kind}
              for fe, a in zip(fu_entries, audios[1:])]
        res = self._response(s, content, speaker, e.text, violation, revealed, audios[0], fu, e.log_id, source,
                             timings, stage_changed, rule_ids)
        res.update(await self._extras(s, content))
        return res


def exam_announcement(content: Content, stage: dict[str, Any]) -> str:
    name = _clean_text_for_speech(stage.get("name_uz", stage["id"])).rstrip(".")
    wname = content.case.get("witness", {}).get("name", "")
    return (f"{name} boshlanadi. Guvoh{' ' + wname if wname else ''}, siz yolg'on ko'rsatuv uchun javobgarlik "
            "haqida ogohlantirilasiz. Guvohni avval uni taklif qilgan taraf so'roq qiladi. Prokuror, so'z sizga.")


def muzokara_announcement(stage: dict[str, Any]) -> str:
    name = _clean_text_for_speech(stage.get("name_uz", stage["id"])).rstrip(".")
    return f"{name} boshlanadi. Avval davlat ayblovchisi so'zlaydi."


def prewarm_phrases(content: Content) -> list[tuple[str, str]]:
    """Oldindan TTS keshiga olinadigan tayyor iboralar (LLM siz aytiladiganlar)."""
    out: list[tuple[str, str]] = [("judge", opening_speech(content)), ("judge", CLOSED_TEXT), ("judge", CLOSING_TEXT),
                                  ("judge", AFTER_INVESTIGATION_WARNING), ("defendant", defendant_last_word(content))]
    out += [("judge", v.get("warning_uz", "")) for v in content.violations.values() if v.get("warning_uz")]
    out += [("judge", stage_announcement(content, st)) for st in content.stages[1:]]
    if reveal_line(content):
        out.append(("witness", reveal_line(content)))
    # rejimlar: so'z navbati, murojaat va qarorlar, prokuror so'rog'i shabloni, ustoz matnlari
    q_stage = content.stage_by_kind("questioning")
    if q_stage:
        out.append(("judge", exam_announcement(content, q_stage)))
    a_stage = content.stage_by_kind("arguments")
    if a_stage:
        out += [("judge", muzokara_announcement(a_stage)), ("prosecutor", prosecutor_closing(content)),
                ("judge", ARGUMENTS_GIVE_FLOOR)]
    out += [("judge", NO_WORDS_REPLY), ("judge", META_REPLY_DEFAULT), ("witness", WITNESS_UNKNOWN),
            *[("judge", t) for t in META_REPLY.values()]]
    for tpl in filter(None, [(M.content_exam(content) or (None,))[0], M.exam_template(content)]):
        out += [("prosecutor", tpl["q1_open"]), ("witness", tpl["a1"]), ("prosecutor", tpl["q2_leading"]),
                ("witness", tpl["a2"])]
    out += [("judge", M.ruling_granted(content)), ("judge", M.RULING_DENIED), ("clerk", M.CLERK_RECORDED),
            ("prosecutor", M.PROSECUTOR_DONE), ("judge", M.JUDGE_GIVE_FLOOR), ("judge", M.JUDGE_HEARS),
            ("judge", M.JUDGE_FLOOR_YOURS), ("judge", M.JUDGE_WAIT_PROSECUTOR),
            ("prosecutor", M.prosecutor_motion_text(content)),
            ("judge", M.unauthorized_violation(content).get("warning_uz", ""))]
    lv = content.violations.get("yonaltiruvchi_savol")
    if lv and lv.get("warning_uz"):
        out.append(("judge", M.ruling_on_prosecutor_motion(lv["warning_uz"])))
    out += [("tutor", t) for t in M.TUTOR_STAGE_UZ.values()]
    out += [("tutor", M.CAUGHT_PRAISE_FREE), ("tutor", M.MOTION_DENIED_TUTOR)]
    out += [("tutor", st["tutor_uz"]) for st in content.stages if st.get("tutor_uz")]
    seen: set[tuple[str, str]] = set()
    return [x for x in out if x[1] and not (x in seen or seen.add(x))]
