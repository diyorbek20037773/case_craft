// Bosqichga mos tayyor savol/nutq chiplari. Bir bosishda shu matn talaba gapi sifatida yuboriladi.
import type { StageKind } from '../api'

export interface Chip {
  label: string
  text: string
  /** Atayin noto'g'ri misol (yo'naltiruvchi savol) — sudya to'xtatishini ko'rsatish uchun */
  wrong?: boolean
}

const CHIPS: Partial<Record<StageKind, Chip[]>> = {
  opening: [
    { label: 'Himoyachi tayyor', text: 'Hurmatli sud, himoyachi majlisga tayyor.' },
    { label: "Iltimosim yo'q", text: "Hurmatli sud, iltimosim yo'q, sud tergoviga o'tishga tayyorman." },
  ],
  questioning: [
    { label: 'Qayerda turgan edingiz?', text: "Guvoh, voqea paytida do'konning qayerida turgan edingiz?" },
    { label: 'Masofa qancha edi?', text: 'Turgan joyingizdan noutbuklar javonigacha qancha masofa bor edi?' },
    { label: "Ko'rishingizga nima ta'sir qildi?", text: "Voqea paytida ko'rishingizga biror narsa ta'sir qilganmi?" },
    { label: "Yuzini ko'rdingiz, to'g'rimi?", text: "Siz sudlanuvchining yuzini aniq ko'rdingiz, to'g'rimi?", wrong: true },
  ],
  arguments: [
    {
      label: 'Qisqa nutq (shablon)',
      // faqat ochiq ish materiali (ayblov, dalillar) — guvohdan so'roqda olinadigan narsa bu yerda yozilmaydi
      text:
        "Hurmatli sud, ayblov yagona shaxsiy dalilga — guvohning fotosuratdan «o'xshaydi» degan gapiga tayanadi. " +
        "Tanib olish sharoiti bayonnomada yozilmagan, guvoh voqeani uzoqdan kuzatgan. Videoyozuvda yuz ko'rinmaydi, " +
        "noutbuk sudlanuvchidan topilmagan. JPK 23-moddaga ko'ra isbotlanmagan shubhalar sudlanuvchi foydasiga hal " +
        "qilinadi, shu sababli Sodiqovni oqlashni so'rayman.",
    },
    {
      label: 'Shubha — sudlanuvchi foydasiga',
      text: "Hurmatli sud, yagona shaxsiy dalil guvohning «o'xshaydi» degan gapi. Bu shubha sudlanuvchi foydasiga hal qilinishi kerak.",
    },
    { label: 'Nutqim tugadi', text: 'Hurmatli sud, nutqim tugadi.' },
  ],
}

/** Uzun guvoh gapi chipda bitta-ikkita gap bo'lib qolsin */
function clip(line: string, max = 220): string {
  const t = line.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, max).replace(/\s+\S*$/, '') + '…'
}

/**
 * Bosqich chiplari. revealedLine — shu sessiyada guvoh so'roqda o'zi aytgan (serverdan kelgan) yangi fakt gapi:
 * bo'lsa, muzokara bosqichida o'sha gapga tayangan nutq chipi qo'shiladi. Matn bundle ichida emas, ish vaqtida quriladi.
 */
export function chipsFor(kind: StageKind | null, revealedLine: string | null = null): Chip[] {
  const base = (kind && CHIPS[kind]) || []
  if (kind !== 'arguments' || !revealedLine) return base
  const quoted: Chip = {
    label: "Nutq — guvohning o'z so'zi bilan",
    text:
      `Hurmatli sud, guvoh so'roqda shunday dedi: «${clip(revealedLine)}». Demak, uning fotosuratdan «o'xshaydi» ` +
      "deb tanib olishi ishonchli emas. Videoyozuvda yuz ko'rinmaydi, noutbuk sudlanuvchidan topilmagan. JPK " +
      "23-moddaga ko'ra isbotlanmagan shubhalar sudlanuvchi foydasiga hal qilinadi, Sodiqovni oqlashni so'rayman.",
  }
  return [quoted, ...base]
}

export const PLACEHOLDER: Partial<Record<StageKind, string>> = {
  // qisqa: 390 px da mikrofon va "Yuborish" yonida bir qatorga sig'sin
  opening: 'Sudga javob bering…',
  questioning: 'Ochiq savol bering…',
  arguments: 'Nutqingizni yozing…',
}
