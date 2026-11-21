# Generativ fon musiqasi (`generativeScore.ts`)

**Nima bu:** kirish (intro) uchun brauzerning o'zida WebAudio orqali sintez qilinadigan sokin, tantanali fon musiqasi.
Fayl yuklanmaydi, tarmoq kerak emas. Tarkibi: torli pad (4 ovoz, sekin filtr + chorus), past violonchel-dron,
siyrak selesta/pianino notalari, generatsiya qilingan reverb (~3 s), kompressor. D eol (modal minor), ~64 BPM,
akkord har 8–12 s da almashadi. Tasodif seed'li — har safar bir xil "kompozitsiya" chalinadi, takrorlanish sezilmaydi.

**Ulash:**

```ts
import { startScore } from './music/generativeScore'

const score = startScore(ctx, master, { intensity: 0, lite: false }) // 4 s da sekin kiradi
score.setIntensity(0)                  // 0 = faqat pad + dron (title), 1 = melodik qatlam qo'shiladi
score.setLayers({ drone: 0, pad: 0.9 }) // yupqa partitura (case: pad + selesta), ~1.5 s da
score.stop(1.2)                        // sekin so'nadi, keyin hamma tugunlar uziladi
```

- `startScore` ni foydalanuvchi bosishidan keyin chaqiring (autoplay qoidasi).
- `lite: true` (quality==='low'): chorus yo'q, reverb 1.8 s — sekin kompyuter uchun.
- Sahifa yashirin bo'lsa rejalashtirish to'xtaydi; qaytganda davom etadi.
- Bir vaqtda ≤ 9 ovoz (sekin kompyuter uchun yengil).

**Fazalar (`ui/audio.ts` → `setMusicPhase`):**

| faza | intensity | qatlamlar | chiqish RMS |
|---|---|---|---|
| title | 0 | pad + dron | ≈ −24.5 dBFS |
| mode, lobby | 0.6 | pad + dron + selesta | ≈ −24.4 dBFS |
| select | 1 | hammasi | ≈ −24.1 dBFS |
| case | 0.8 | pad 0.9 + selesta, dron 0 | ≈ −28.3 dBFS |
| launch | — | 0.4 s da to'liq jim (`stop(0.4)`) | — |

**Daraja (OfflineAudioContext'siz hisob):** Node'da vaqt sohasidagi simulyatsiya (24 s, 48 kHz, birinchi 4 s
tashlanadi): pad/dron/FM-qo'ng'iroqlar shu fayldagi formulalar bilan, WebAudio biquad (LP/HP Q — dB), reverb =
`makeImpulse` nusxasi + ConvolverNode `normalize=true` masshtabi (spec `calculateNormalizationScale`, FFT konvolyutsiya),
kompressor = spec egri chizig'i (threshold −20, knee 10, ratio 3) + avtomatik makeup (+6.1 dB), keyin
`MASTER_LEVEL` 0.42 va `audio.ts` master 0.9. Natija (select, intensity 1): **RMS −24.0 dBFS, peak 0.27** (< 0.5);
lite rejim: RMS −24.1 dBFS, peak 0.27. Eng baland fazada ham peak 0.5 dan ancha past — o'zgartirish shart emas.

**Litsenziya:** o'zimiz yaratgan generativ musiqa — tashqi litsenziya kerak emas.
