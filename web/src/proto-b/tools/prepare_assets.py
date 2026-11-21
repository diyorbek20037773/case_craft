"""B sahna assetlarini tayyorlash (qayta ishga tushirish mumkin).

  python web/src/proto-b/tools/prepare_assets.py          # rasmlar + video + ovoz
  python web/src/proto-b/tools/prepare_assets.py --no-tts # ovozni qayta yaratmaslik

Manba: materials/generated/. Natija: web/src/proto-b/assets/.
Kerak: Pillow, ffmpeg (C:/ffmpeg-8.0-full_build/bin yoki PATH), edge-tts (pip install edge-tts).
Kod (assets.ts) papkadagi fayllarni build vaqtida o'zi topadi: video > mouth/blink rasmlari > prosedural.
"""
import os, shutil, subprocess, sys
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
SRC = os.path.join(ROOT, 'materials', 'generated')
DST = os.path.join(ROOT, 'web', 'src', 'proto-b', 'assets')
ROLES = ['sudya', 'prokuror', 'kotib', 'guvoh', 'himoyachi', 'sudlanuvchi']
FFMPEG = 'C:/ffmpeg-8.0-full_build/bin/ffmpeg.exe'
if not os.path.exists(FFMPEG):
    FFMPEG = shutil.which('ffmpeg') or ''

os.makedirs(DST, exist_ok=True)

def src(name):
    p = os.path.join(SRC, name)
    return p if os.path.exists(p) else None

def webp(path, out, width=None, q=84):
    im = Image.open(path).convert('RGB')
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(os.path.join(DST, out), quality=q, method=6)

ONLY_VIDEO = '--only-video' in sys.argv

# 1) panorama: 4096 va 2048 (telefon GPU limiti)
p = None if ONLY_VIDEO else src('zal-360-1.png')
if p:
    im = Image.open(p).convert('RGB')
    for w in (4096, 2048):
        im.resize((w, w // 2), Image.LANCZOS).save(os.path.join(DST, f'zal-360-{w}.jpg'), quality=82, optimize=True, progressive=True)

# 2) keng kadrlar
for n in ('zal-himoyachidan', 'zal-sudyadan', 'zal-yon', 'zal-majlis'):
    p = None if ONLY_VIDEO else src(f'{n}-1.png')
    if p:
        webp(p, f'{n}.webp', q=82)

# 3) portretlar + og'iz/ko'z variantlari (asl o'lcham 1086 px — piksel mosligi saqlanadi)
for r in ROLES:
    p = None if ONLY_VIDEO else src(f'{r}-portret-1.png')
    if not p:
        continue
    base = Image.open(p)
    webp(p, f'{r}-portret.webp')
    for v in ('mouth-0', 'mouth-1', 'mouth-2', 'blink'):
        q = src(f'{r}-{v}.png')
        if not q:
            continue
        if Image.open(q).size != base.size:
            print(f'! {r}-{v}: o\'lcham portretga mos emas, o\'tkazib yuborildi')
            continue
        webp(q, f'{r}-{v}.webp')

# 4) videolar: H.264, ovozsiz, faststart, kengligi <= 720 (portret) / 1280 (zal)
def video(name, maxw, crf):
    p = src(name)
    if not p or not FFMPEG:
        return
    out = os.path.join(DST, name)
    vf = f"scale='min({maxw},iw)':-2"
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-i', p, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf),
                    '-pix_fmt', 'yuv420p', '-profile:v', 'main', '-movflags', '+faststart', '-vf', vf, out], check=True)

for r in ROLES:
    video(f'{r}-idle.mp4', 720, 23)  # yuz detali uchun sifatliroq
    video(f'{r}-talk.mp4', 720, 23)
video('guvoh-think-shake.mp4', 720, 23)
video('zal-intro.mp4', 1280, 26)

# 5) ovoz (edge-tts)
if '--no-tts' not in sys.argv and not ONLY_VIDEO:
    lines = [
        ('himoyachi-savol.mp3', 'uz-UZ-MadinaNeural', '-4%', '+0Hz', "Siz uning yuzini ko'rdingizmi?"),
        ('guvoh-javob.mp3', 'uz-UZ-SardorNeural', '-10%', '+3Hz', "Yo'q. Men uning yuzini ko'rmadim. Faqat kulrang kiyimini ko'rdim."),
        ('sudya-soz.mp3', 'uz-UZ-SardorNeural', '-6%', '-6Hz', 'Javob bayonnomaga kiritilsin. Himoyachi, keyingi savolingizni bering.'),
    ]
    for out, voice, rate, pitch, text in lines:
        subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', voice, f'--rate={rate}', f'--pitch={pitch}',
                        '--text', text, '--write-media', os.path.join(DST, out)], check=True)

for f in sorted(os.listdir(DST)):
    print(f'{f:32s} {os.path.getsize(os.path.join(DST, f)) // 1024:6d} KB')
