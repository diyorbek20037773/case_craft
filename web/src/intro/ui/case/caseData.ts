// manba: content/case.json (faqat ochiq qismlar; o‘zgartirilmagan, faqat ' → ‘ / ’ almashtirilgan).
// DIQQAT: guvohning yashirin fakti (witness.hidden_fact) va persona_uz bu yerga ataylab KIRITILMAGAN —
// kirish sahifasi bundle'ida ham bo‘lmasin. case.json o‘zgarsa, shu faylni ham yangilang.
// Portretlar bu yerda emas — ui/portraits.ts (portraitOf) yagona manba.

export const CASE_FILE = {
  id: 'case-001-noutbuk',
  number: '001',
  title: 'Elektron do‘konda noutbuk o‘g‘riligi',
  /** summary_uz boshidagi belgi — alohida, doim ko‘rinib turadi */
  fictionalNote: 'To‘qima o‘quv ishi: real shaxs va voqeaga aloqasi yo‘q.',
  summary:
    '2026-yil 14-mart kuni kechqurun «Texnodunyo» do‘konidan 5 400 000 so‘mlik noutbuk yo‘qolgan. Videoyozuvda o‘g‘rining yuzi ko‘rinmaydi; do‘kon sotuvchisi Mansur Rahimov tergov paytida fotosuratlar orasidan Anvar Sodiqovni «o‘xshaydi» deb ko‘rsatgan. Sudlanuvchi do‘konda bo‘lganini tan oladi, lekin noutbukni olmaganini aytadi.',
  /** summary_uz oxirgi gapi — talabaning vazifasi */
  studentTask:
    'Talaba sudlanuvchining himoyachisi sifatida guvohni so‘roq qiladi va qisqa muzokara nutqi so‘zlaydi.',
  // config.ts (CASE) bilan bir xil
  articleShort: 'JK 169-modda',
  difficulty: 'O‘rta',
  duration: '12–15 daqiqa',
  charge: {
    // ‑ — bo‘linmaydigan chiziqcha (sarlavhada «169-» va «modda» ajralib qolmasin)
    article: 'Jinoyat kodeksi 169‑modda (O‘g‘rilik)',
    // case.json dagi qavs ichidagi ichki eslatma (yurist tekshiruvi haqida) ko‘rsatilmaydi
    text: 'Sodiqov A. o‘zganing mulkini, ya’ni qiymati 5 400 000 so‘m bo‘lgan noutbukni do‘kondan yashirincha talon-taroj qilishda ayblanmoqda.',
  },
  defendant: {
    name: 'Anvar Sodiqov',
    about:
      '29 yoshda, to‘qima shaxs. Ilgari sudlanmagan, kuryer bo‘lib ishlaydi. Aybiga iqror emas: 14-mart kuni 19:15 da do‘konda zaryadka kabeli sotib olganini, noutbukka tegmaganini aytadi.',
  },
  facts: [
    '2026-yil 14-mart, soat 19:41 atrofida «Texnodunyo» do‘konining noutbuklar bo‘limidan «ProBook 15» markali noutbuk qutisi yo‘qolgan.',
    'Noutbukning qiymati 5 400 000 so‘m, buni inventarizatsiya dalolatnomasi tasdiqlaydi.',
    'Kuzatuv kamerasi yozuvida qora kurtkali va kepkali erkak qutini sumkasiga solayotgani ko‘rinadi; yuzi kamera ko‘rinishida aniq emas.',
    'Sudlanuvchi 19:15 da shu do‘konda zaryadka kabeli sotib olgan, bu kassa chekida bor.',
    'Sudlanuvchining uyidan va shaxsiy buyumlaridan noutbuk topilmagan.',
    'Guvoh Mansur Rahimov tergov paytida 4 ta fotosuratdan Sodiqovni «o‘xshaydi» deb ko‘rsatgan.',
    'Sudlanuvchi aybiga iqror emas.',
  ],
  /** Vaqt chizig‘i — facts_uz, evidence (E4, E5) va guvohning ochiq ko‘rsatuvidagi vaqtlar */
  timeline: [
    { time: '19:15', text: 'Sodiqov do‘konda zaryadka kabeli sotib oladi', src: 'E4 · kassa cheki' },
    { time: '19:30', text: 'Sodiqov o‘z so‘ziga ko‘ra do‘kondan chiqib ketadi', src: 'E5 · sudlanuvchi ko‘rsatuvi' },
    { time: '19:41', text: 'Noutbuk qutisi sumkaga solinadi, yuz ko‘rinmaydi', src: 'E1 · videoyozuv' },
    { time: '20:00', text: 'Do‘konning ish vaqti tugaydi', src: 'guvoh ko‘rsatuvi' },
  ],
  evidence: [
    {
      id: 'E1',
      name: 'Kuzatuv kamerasi videoyozuvi',
      about: 'Soat 19:41. Qora kurtkali, kepkali erkak noutbuk qutisini sumkaga soladi. Yuz ko‘rinmaydi, sifat past.',
    },
    {
      id: 'E2',
      name: 'Inventarizatsiya dalolatnomasi',
      about: 'Noutbuk yo‘qligi va uning qiymati 5 400 000 so‘m ekani qayd etilgan.',
    },
    {
      id: 'E3',
      name: 'Guvoh Rahimov M. ko‘rsatuvi va fotosuratdan tanib olish bayonnomasi',
      about:
        'Guvoh 4 ta fotosuratdan Sodiqovni «o‘xshaydi» deb ko‘rsatgan. Tanib olish sharoiti bayonnomada batafsil yozilmagan.',
    },
    {
      id: 'E4',
      name: 'Kassa cheki',
      about: 'Sodiqov A. 19:15 da zaryadka kabeli sotib olgan. Bu uning do‘konda bo‘lganini ko‘rsatadi.',
    },
    {
      id: 'E5',
      name: 'Sudlanuvchining ko‘rsatuvi',
      about:
        'Do‘konda bo‘lganini tan oladi, noutbukni olmaganini aytadi, 19:30 da do‘kondan chiqib ketganini bildiradi.',
    },
  ],
  prosecutor:
    'Sudlanuvchi voqea kuni do‘konda bo‘lgan (kassa cheki), guvoh uni fotosuratdan «o‘xshaydi» deb ko‘rsatgan, kuzatuv yozuvidagi kiyim va qomat unga mos keladi. Dalillar yig‘indisi uning aybini isbotlaydi, jazo tayinlashni so‘raydi.',
  defense:
    'Sudlanuvchining aybi bevosita dalil bilan isbotlanmagan. Yagona shaxsiy dalil — guvohning fotosuratdan «o‘xshaydi» deb ko‘rsatishi, uning ishonchliligi tekshirilishi kerak (masofa, ko‘rish imkoniyati). Video yuzni ko‘rsatmaydi, noutbuk sudlanuvchida topilmagan, do‘konda bo‘lishi o‘zi aybni isbotlamaydi. Shubhalar sudlanuvchi foydasiga hal qilinishi kerak (aybsizlik prezumpsiyasi).',
  witness: {
    name: 'Mansur Rahimov',
    role: '«Texnodunyo» do‘konining sotuvchi-maslahatchisi, voqea guvohi',
    publicFacts: [
      'Men olti yildan beri shu do‘konda sotuvchiman.',
      '14-mart kuni ish vaqtimiz soat 20:00 gacha edi. Voqea soat 19:40 atrofida bo‘ldi.',
      'Noutbuklar javoni yonida qora kurtkali, kepkali erkakni ko‘rdim. U qutini olib, sumkasiga soldi.',
      'Men kassa peshtaxtasida turgandim. U yerdan javongacha taxminan 20 metr.',
      'Men mijoz bilan band edim, shuning uchun darhol yaqinlashmadim.',
      'Ertasi kuni tergovchi to‘rtta fotosurat ko‘rsatdi. Men Sodiqovni «o‘xshaydi» dedim.',
      'Sudlanuvchini ilgari tanimasdim.',
    ],
  },
  /** stage_ids → o‘qiladigan nomlar */
  stages: [
    { id: 'ochilish', label: 'Majlis ochilishi' },
    { id: 'guvoh_soroq', label: 'Guvohni so‘roq qilish' },
    { id: 'muzokara', label: 'Muzokara nutqi' },
    { id: 'oxirgi_soz', label: 'Sudlanuvchining oxirgi so‘zi' },
  ],
} as const

export type Evidence = (typeof CASE_FILE.evidence)[number]

/** Sahifalar (bo‘limlar) tartibi. tab — o‘ng chetdagi yorliq (bo‘lsa). */
export const SECTIONS = [
  { id: 'varaqa', title: 'Ish varaqasi', tab: null },
  { id: 'ayblov', title: 'Ayblov va sudlanuvchi', tab: null },
  { id: 'faktlar', title: 'Voqea faktlari', tab: 'Faktlar' },
  { id: 'dalillar', title: 'Dalillar', tab: 'Dalillar' },
  { id: 'guvoh', title: 'Guvoh', tab: 'Guvoh' },
  { id: 'vazifa', title: 'Sizning vazifangiz', tab: 'Vazifa' },
] as const

export const PAGE_COUNT = SECTIONS.length
