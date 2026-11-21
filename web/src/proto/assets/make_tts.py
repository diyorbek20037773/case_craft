import asyncio, json, edge_tts, inspect
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
                words.append({'t': ch['offset'] / 1e7, 'd': ch['duration'] / 1e7, 'w': ch['text']})
    return words
async def main():
    q = await gen("Siz uning yuzini ko'rdingizmi?", 'uz-UZ-MadinaNeural', 'savol', '+0%')
    a = await gen("Yo'q. Men uning yuzini ko'rmadim. Faqat kulrang kiyimini ko'rdim.", 'uz-UZ-SardorNeural', 'javob', '-8%')
    json.dump({'savol': q, 'javob': a}, open('timings.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(edge_tts.__version__ if hasattr(edge_tts,'__version__') else '', q, a)
asyncio.run(main())
