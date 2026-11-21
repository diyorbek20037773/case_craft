"""O'zbek lotin matni uchun yordamchi funksiyalar."""
from __future__ import annotations

import re

# o' g' dagi turli tutuq belgilarini bitta ASCII ' ga keltiramiz
_APOS = str.maketrans({"ʻ": "'", "ʼ": "'", "‘": "'", "’": "'", "`": "'", "´": "'"})


# O'zbek kirill -> lotin (rasmiy imlo). Talaba kirillda yozsa ham regex, kalit so'z va bosqich iboralari ishlasin.
_CYR = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y",
    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "x", "ц": "s", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "'", "ь": "", "ы": "i", "э": "e",
    "ю": "yu", "я": "ya", "ў": "o'", "қ": "q", "ғ": "g'", "ҳ": "h",
}
_CYR_RX = re.compile(r"[а-яёўқғҳ]")
_CYR_VOWELS = set("аеёиоуўэюяыaeiou")


def cyr_to_lat(text: str) -> str:
    """Kirill yozuvidagi o'zbekcha (va ruscha) matnni lotinga o'giradi. Kirill harfi bo'lmasa matn o'zgarmaydi.
    «е» so'z boshida va unlidan / ъ / ь dan keyin «ye», aks holda «e». Natija kichik harfda."""
    t = (text or "").lower()
    if not _CYR_RX.search(t):
        return t
    out: list[str] = []
    prev = ""
    for ch in t:
        if ch == "е":
            out.append("ye" if (not prev or not prev.isalpha() or prev in _CYR_VOWELS or prev in "ъь") else "e")
        else:
            out.append(_CYR.get(ch, ch))
        prev = ch
    return "".join(out)


def norm(text: str) -> str:
    """Kichik harf, kirill -> lotin, yagona tutuq belgisi, ortiqcha bo'shliqsiz."""
    t = cyr_to_lat((text or "").translate(_APOS)).translate(_APOS)
    return re.sub(r"\s+", " ", t).strip()


def words(text: str) -> list[str]:
    return re.findall(r"[a-zA-ZЀ-ӿ']+|\d+", norm(text))


def truncate_words(text: str, limit: int = 25) -> str:
    """Matnni <= limit so'zgacha qisqartiradi, imkon bo'lsa gap chegarasida."""
    text = re.sub(r"\s+", " ", (text or "")).strip()
    tokens = text.split(" ")
    if len(tokens) <= limit:
        return text
    cut = " ".join(tokens[:limit])
    last = max(cut.rfind("."), cut.rfind("?"), cut.rfind("!"))
    if last >= len(cut) // 2:
        return cut[: last + 1]
    return cut.rstrip(",;:") + "."


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+", (text or "").strip())
    return [p for p in parts if p]


def contains_any(text: str, needles: list[str]) -> str | None:
    """Birinchi mos kelgan kalit so'zni qaytaradi (normallashtirilgan substring)."""
    t = norm(text)
    t_flat = t.replace("'", "")  # STT ko'pincha tutuq belgisini tashlab ketadi: "korishingizga"
    for n in needles or []:
        nn = norm(n)
        if nn and (nn in t or nn.replace("'", "") in t_flat):
            return n
    return None


_NEG_AFTER = re.compile(r"^[\s,]*emas")


def phrase_hits(text: str, phrases: list[str]) -> list[tuple[str, bool]]:
    """Iboralarni BUTUN so'z / ibora sifatida qidiradi (substring emas): «tayyor» «tayyormisiz» ichida topilmaydi.
    Har topilgan ibora uchun (ibora, inkormi): ibora darhol «emas…» bilan davom etsa («tayyor emasman») — inkor.
    Tutuq belgisisiz yozuv (STT: «savollarim yoq») ham mos keladi."""
    t = norm(text)
    flat = t.replace("'", "")
    out: list[tuple[str, bool]] = []
    for p in phrases or []:
        pn = norm(p)
        if not pn:
            continue
        for hay, needle in ((t, pn), (flat, pn.replace("'", ""))):
            hits = list(re.finditer(rf"(?<![\w']){re.escape(needle)}(?![\w'])", hay))
            if hits:
                neg = all(_NEG_AFTER.search(hay[m.end():]) for m in hits)
                out.append((p, neg))
                break
    return out


# So'z ichidagi tutuq belgisi (o' g' ta'lim): ʻ ʼ ‘ ’ ` ´ -> ' (loyihada ' ko'p). Faqat ikki harf orasida —
# ‘iqtibos’ qo'shtirnoqlari va kod belgilariga tegmaydi. Ko'rsatiladigan matn uchun; TTS asl matnni oladi.
_APOS_IN_WORD = re.compile(r"(?<=[A-Za-zЀ-ӿ])[ʻʼ‘’`´](?=[A-Za-zЀ-ӿ])")


def uz_apos(text: str) -> str:
    """O'zbek apostrofini bitta turga (') keltiradi; matnning boshqa qismi o'zgarmaydi."""
    return _APOS_IN_WORD.sub("'", text) if text else text
