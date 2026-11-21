# Panorama nusxalari: materials/generated/zal-360-1.png (8192x4096) dan.
# zal-4k.jpg / zal-2k.jpg — butun sfera; zal-detail.webp — guvoh atrofidagi qism asl 8k aniqlikda (chetlari silliq shaffof).
from PIL import Image, ImageFilter
import os
Image.MAX_IMAGE_PIXELS = None
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', '..', '..', '..', 'materials', 'generated', 'zal-360-1.png')
U0, U1, V0, V1 = 0.54, 0.80, 0.30, 0.80  # Stage.tsx dagi DETAIL bilan bir xil bo'lsin

im = Image.open(SRC).convert('RGB')
W, H = im.size
im.resize((4096, 2048), Image.LANCZOS).save(os.path.join(HERE, 'zal-4k.jpg'), quality=82, optimize=True, progressive=True)
im.resize((2048, 1024), Image.LANCZOS).save(os.path.join(HERE, 'zal-2k.jpg'), quality=80, optimize=True, progressive=True)

box = (round(U0 * W), round(V0 * H), round(U1 * W), round(V1 * H))
crop = im.crop(box)
cw, ch = crop.size
f = 48  # chetdagi silliq o'tish (px)
mask = Image.new('L', (cw, ch), 0)
mask.paste(255, (f, f, cw - f, ch - f))
mask = mask.filter(ImageFilter.GaussianBlur(f / 2.5))
crop.putalpha(mask)
crop.save(os.path.join(HERE, 'zal-detail.webp'), quality=84, method=6)
print(box, crop.size)
