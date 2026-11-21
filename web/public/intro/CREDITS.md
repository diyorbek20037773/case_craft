# Kirish qismi (intro) — mualliflar va litsenziyalar

## Logotip
- `casecraft-logo.png` — CaseCraft logotipi, loyiha egasining o‘z ishi.
- `casecraft-logo-900.webp`, `casecraft-emblem-128.webp`, `casecraft-emblem-64.png` — shu logotipdan kichraytirilgan nusxalar
  (sahifa tez yuklanishi uchun).

## Fon musiqasi
- Hozir: **o‘zimiz yaratgan generativ musiqa** (`src/intro/ui/music/generativeScore.ts`) — brauzerda WebAudio bilan
  real vaqtda sintez qilinadi; tashqi fayl va litsenziya kerak emas.
- Agar `music.mp3` qo‘yilsa, u ustun turadi (generativ musiqa o‘chadi). Faqat litsenziyasi aniq bepul manbalar:
  Pixabay Music (Pixabay Content License), freesound.org (CC0), OpenGameArt (CC0 yoki CC-BY — CC-BY bo‘lsa muallifni
  "Texnologiyalar va mualliflar" bo‘limiga ham yozing).
- music.mp3 qo‘yilsa to‘ldiring: nomi — … · muallif — … · manba havolasi — … · litsenziya — …

## UI tovushlari
- Fayl yo‘q: `src/intro/ui/audio.ts` da WebAudio orqali sintez qilinadi (jamoa kodi).

## Shriftlar (fonts/)
- Cormorant Garamond, Manrope, Lora, Courier Prime — Google Fonts (fonts.gstatic.com dan yuklab olingan, sahifaning o‘zida
  joylangan), **SIL Open Font License 1.1** (https://openfontlicense.org). Faqat latin va latin-ext qismlari, woff2.
  - Cormorant Garamond — Christian Thalmann (Catharsis Fonts); Manrope — Mikhail Sharanda; Lora — Cyreal;
    Courier Prime — Alan Dague-Greene (Quote-Unquote Apps).
  - Fayllar: cormorant-garamond-*, manrope-*, lora-*, lora-italic-*, courier-prime-* (.woff2). Cormorant, Manrope va Lora —
    variable (bir fayl bir necha qalinlikni qamraydi).
- Caveat — Pablo Impallari, **SIL Open Font License 1.1**, fayl caveat-latin.woff2 (ish papkasidagi qo‘lyozma «o‘xshaydi»).

## 3D zal va personajlar
- `public/models/meshy/zal/CREDITS.md` va `public/env/CREDITS.md` ga qarang (Poly Haven, CC0; Meshy).
