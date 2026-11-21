# Guvoh sahnasi ovozlari (edge-tts, onlayn; lokal model yo'q). Ishga tushirish: shu papkada `python make_tts.py`.
# Natija: <id>.mp3 + timings.ts (so'z chegaralari). Matnlar GuvohApp.tsx dagi QUESTIONS bilan bir xil bo'lsin.
import asyncio, json, edge_tts, inspect, os

ITEMS = [
    ('savol',  "Siz uning yuzini ko'rdingizmi?", 'uz-UZ-MadinaNeural', '+0%'),
    ('javob',  "Yo'q. Men uning yuzini ko'rmadim. Faqat kulrang kiyimini ko'rdim.", 'uz-UZ-SardorNeural', '-8%'),
    ('savol2', "Kassadan javongacha qancha masofa bor edi?", 'uz-UZ-MadinaNeural', '+0%'),
    ('javob2', "Taxminan yigirma metr. Men kassa peshtaxtasida turgandim.", 'uz-UZ-SardorNeural', '-8%'),
    ('savol3', "Sudlanuvchini ilgari tanirmidingiz?", 'uz-UZ-MadinaNeural', '+0%'),
    ('javob3', "Yo'q, uni ilgari tanimasdim. Birinchi marta tergovchining fotosuratida ko'rdim.", 'uz-UZ-SardorNeural', '-8%'),
]
ONLY_MISSING = True  # mavjud mp3 lar qayta yaratilmaydi (vaqtlar timings.json dan olinadi)

async def gen(text, voice, out, rate):
    kw = {}
    if 'boundary' in inspect.signature(edge_tts.Communicate.__init__).parameters:
        kw['boundary'] = 'WordBoundary'
    c = edge_tts.Communicate(text, voice, rate=rate, **kw)
    words = []
    with open(out + '.mp3', 'wb') as f:
        async for ch in c.stream():
            if ch['type'] == 'audio':
                f.write(ch['data'])
            elif ch['type'] in ('WordBoundary', 'SentenceBoundary'):
                words.append({'t': round(ch['offset'] / 1e7, 6), 'd': round(ch['duration'] / 1e7, 6), 'w': ch['text']})
    return words

async def main():
    old = {}
    if os.path.exists('timings.json'):
        old = json.load(open('timings.json', encoding='utf-8'))
    out = {}
    for cid, text, voice, rate in ITEMS:
        if ONLY_MISSING and cid in old and os.path.exists(cid + '.mp3'):
            out[cid] = old[cid]
            continue
        out[cid] = await gen(text, voice, cid, rate)
        print(cid, len(out[cid]), "so'z")
    json.dump(out, open('timings.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    with open('timings.ts', 'w', encoding='utf-8') as f:
        f.write("// edge-tts WordBoundary vaqtlari (s). Avtomatik: assets ichida 'python make_tts.py'.\n")
        f.write('export const TIMINGS = ' + json.dumps(out, ensure_ascii=False, indent=1) + ' as const\n')

asyncio.run(main())
