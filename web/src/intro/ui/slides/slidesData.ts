// Rol tushuntiruvchi slaydlar matni (o‘zbek lotin).
// Tutuq belgisi: o‘ g‘ uchun ‘ (U+2018), qolganlari uchun ’ (U+2019).
//
// Manbalar:
//  - real sud haqidagi umumiy gaplar — JPK ning umumiy qoidalari (modda raqami faqat
//    research/fakt-tekshiruv.md dagi ✅ qatorlardan: 32, 49, 408, 409, 451);
//  - simulyatordagi xatti-harakat — SPEC.md, content/case.json, content/rules.json, server/README.md.
// Taqiqlangan iboralar ishlatilmaydi (ro‘yxat: prompts/kirish-brief.md, 7-bo‘lim).
import type { RoleId } from '../../config'
import { portraitOf } from '../portraits'

export type SlideRole = RoleId | 'sudlanuvchi'

export type SlideIcon =
  | 'gavel'
  | 'scroll'
  | 'shield'
  | 'speech'
  | 'quill'
  | 'person'
  | 'chip'
  | 'cap'
  | 'lens'
  | 'scales'
  | 'book'
  | 'lock'
  | 'bulb'

export type SlideKind = 'who' | 'court' | 'sim' | 'rule' | 'tips'

export type Slide = {
  kind: SlideKind
  /** kichik ustki yozuv, masalan "Kim u?" */
  kicker: string
  title: string
  /** bitta asosiy gap */
  lead?: string
  /** ko‘pi bilan 3 ta */
  bullets?: string[]
  /** 'who' slaydida portret ko‘rsatiladi, qolganlarida shu ikonka */
  icon: SlideIcon
  /** kichik manba yorlig‘i, masalan "JPK 408-modda" */
  source?: string
  /** 'sim' slaydidagi "AI pasport" — FAQAT server/app/** da haqiqatan bor xususiyatlar */
  passport?: Passport
}

/**
 * AI pasport. Har maydon backend kodi bilan tekshirilgan (fayl:qator — slidesData dagi izohlarda).
 * engine: 'llm' — javobni til modeli yozadi (keyin kod tekshiradi); 'kod' — matnni kod yozadi.
 */
export type Passport = {
  engine: 'llm' | 'kod'
  model: string
  knows: string
  rule: string
  voice: string
}

export type RoleDeck = {
  role: SlideRole
  name: string
  /** protsessual maqomi yoki simulyatordagi ismi */
  status: string
  /** "AI boshqaradi" | "Siz o‘ynaysiz" | "Avtomatik bayonnoma" | "Kod ssenariysi" */
  badge: string
  playable: boolean
  portrait: string
  slides: Slide[]
}

/** portretlar manzili — ../portraits.ts (yagona joy) */
const portrait = (r: SlideRole) => portraitOf(r)

const SIM_KICKER = 'Simulyatorda'
/** config.py:88 — GEMINI_MODEL standart qiymati gemini-3.1-flash-lite */
const MODEL_LLM = 'Google Gemini Flash-Lite'
const AI_TITLE = 'AI agent sifatida'

export const slidesData: Record<SlideRole, RoleDeck> = {
  sudya: {
    role: 'sudya',
    name: 'Sudya',
    status: 'Raislik qiluvchi',
    badge: 'AI boshqaradi',
    playable: false,
    portrait: portrait('sudya'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Sudya — sud majlisida raislik qiluvchi',
        lead: 'Sud majlisini olib boradi, taraflarni tinglaydi va ish yakunida hukm chiqaradi.',
        icon: 'gavel',
        source: 'JPK 408-modda',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Majlisni ochadi va uning bosqichlarini e’lon qiladi',
          'Taraflarga so‘z beradi, zalda tartibni saqlaydi',
          'Dalillarni tekshirib, hukm chiqaradi',
        ],
        icon: 'gavel',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: AI_TITLE,
        lead: 'Majlisni JPK bosqichlari bo‘yicha boshqaradi.',
        bullets: [
          'Majlisni ochish → guvoh so‘rog‘i → muzokara → oxirgi so‘z',
          'Yo‘naltiruvchi savol yoki guvohga bosim bo‘lsa — majlisni to‘xtatadi va qoidaga havola qiladi',
          'Hukm chiqarmaydi: baho va bayonnomani o‘qituvchi ko‘rib chiqadi',
        ],
        icon: 'chip',
        // config.py:88 (gemini-3.1-flash-lite), prompts.py:61-69, engine.py:497-506 va 591-620, tts.py:217
        passport: {
          engine: 'llm',
          model: MODEL_LLM,
          knows: 'Ish materiali, joriy bosqich, moddalar va qoidabuzarliklar ro‘yxati',
          rule: 'Kod tekshiradi: bosqichni faqat kod almashtiradi, modda faqat ro‘yxatdan',
          voice: 'uz-UZ Sardor — neyron ovoz, sekin va vazmin',
        },
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Bosqichdan chiqmaydi, modda to‘qimaydi',
        lead: 'Modda havolasini faqat shu ish uchun tuzilgan ro‘yxatdan oladi.',
        bullets: [
          'Har bir to‘xtatishda qaysi qoida buzilganini aytadi',
          'Talabaga yon bosmaydi: xato bo‘lsa, ochiq aytadi',
        ],
        icon: 'scales',
      },
    ],
  },

  prokuror: {
    role: 'prokuror',
    name: 'Prokuror',
    status: 'Davlat ayblovchisi',
    badge: 'AI boshqaradi',
    playable: false,
    portrait: portrait('prokuror'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Prokuror — davlat ayblovchisi',
        lead: 'Sud majlisida davlat nomidan ayblovni qo‘llab-quvvatlaydi.',
        icon: 'scroll',
        source: 'JPK 409-modda',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Ayblovni qo‘llab-quvvatlaydi va dalillarni taqdim etadi',
          'Guvohlar va sudlanuvchini so‘roq qiladi',
          'Muzokarada ayblov nutqini so‘zlaydi',
        ],
        icon: 'scroll',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: 'Sizning qarama-qarshi tomoningiz',
        lead: 'AI agent ayblov tarafini o‘ynaydi.',
        bullets: [
          'Kassa cheki, guvohning tanib olishi va kuzatuv videoyozuviga tayanadi',
          'Guvohni sizdan oldin so‘roq qiladi',
          'Muzokarada ayblov nutqini so‘zlaydi',
        ],
        icon: 'chip',
        // prompts.py:50-51 va 96-106, modes.py:201-226 (case.json prosecutor_exam), engine.py:497-498, 506, 535-537, tts.py:218
        passport: {
          engine: 'llm',
          model: `${MODEL_LLM}; guvoh so‘rog‘i — yurist yozgan ssenariy`,
          knows: 'Ish materiali, ayblov pozitsiyasi, guvohning ochiq ko‘rsatuvlari',
          rule: 'Kod tekshiradi: faqat o‘z bosqichida; uydirma modda olib tashlanadi; tanib olish bo‘rttirilmaydi',
          voice: 'uz-UZ Sardor — neyron ovoz, tez va qat’iy',
        },
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Faqat so‘z berilganda gapiradi',
        lead: 'O‘z bosqichidan tashqari gapirmaydi va faqat ish materialiga tayanadi.',
        bullets: ['Ish materialida yo‘q modda raqami bo‘lgan gap javobdan kod orqali olib tashlanadi'],
        icon: 'book',
      },
    ],
  },

  himoyachi: {
    role: 'himoyachi',
    name: 'Himoyachi',
    status: 'Siz — talaba',
    badge: 'Siz o‘ynaysiz',
    playable: true,
    portrait: portrait('himoyachi'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Himoyachi — sudlanuvchi tarafida',
        lead: 'Sudlanuvchining huquq va qonuniy manfaatlarini himoya qiladi.',
        icon: 'shield',
        source: 'JPK 49-modda',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Iltimos bildiradi va dalillar taqdim etadi',
          'Guvohlarni so‘roq qilib, ko‘rsatuvlarni tekshiradi',
          'Muzokarada himoya nutqini so‘zlaydi',
        ],
        icon: 'shield',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: 'Bu rolni siz o‘ynaysiz',
        lead: 'To‘qima ishda Anvar Sodiqovni himoya qilasiz (JK 169-modda, o‘g‘rilik).',
        bullets: [
          'Guvohni ochiq savollar bilan so‘roq qilasiz',
          'Muzokara nutqini so‘zlaysiz',
          'Oxirida bayonnoma va iqtibosli baho olasiz — uni o‘qituvchi tasdiqlaydi',
        ],
        icon: 'cap',
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Sudya har bir gapingizni tekshiradi',
        bullets: [
          'Yo‘naltiruvchi savol bermang — javob savolning ichida bo‘lmasin',
          'Guvohga bosim o‘tkazmang',
          'Faqat o‘z bosqichida gapiring: nutq — muzokarada',
        ],
        icon: 'scales',
      },
      {
        kind: 'tips',
        kicker: 'Maslahat',
        title: 'Uchta amaliy maslahat',
        bullets: [
          'Ochiq savol bering: «Nima ko‘rdingiz?», «Qayerda turgan edingiz?»',
          'Ko‘rsatuvning ishonchliligini tekshiring: masofa, sharoit, vaqt',
          'Nutqda faqat sudda tekshirilgan dalillarga tayaning: shubha sudlanuvchi foydasiga',
        ],
        icon: 'bulb',
      },
    ],
  },

  guvoh: {
    role: 'guvoh',
    name: 'Guvoh',
    status: 'Mansur Rahimov, do‘kon sotuvchisi',
    badge: 'AI boshqaradi',
    playable: false,
    portrait: portrait('guvoh'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Guvoh — voqeadan xabardor shaxs',
        lead: 'Ish uchun ahamiyatli holatlar haqida o‘ziga ma’lum bo‘lganlarni sudga so‘zlab beradi.',
        icon: 'speech',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Yolg‘on ko‘rsatuv uchun javobgarlik haqida ogohlantiriladi',
          'Bilganlarini so‘zlab beradi',
          'Taraflar va sudning savollariga javob beradi',
        ],
        icon: 'speech',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: AI_TITLE,
        lead: 'Do‘kon sotuvchisi, voqea guvohi (to‘qima shaxs).',
        bullets: [
          'Savollarga o‘z xarakterida javob beradi: xotirjam, faqat so‘ralganiga',
          'Bitta muhim faktni yashiradi — uni siz topishingiz kerak',
          'Bosim ostida xijolat bo‘ladi, lekin yolg‘on gapirmaydi',
        ],
        icon: 'lens',
        // prompts.py:3 va 52-59 (fakt matni ochilmaguncha promptda yo‘q), engine.py:527-533, tts.py:219
        passport: {
          engine: 'llm',
          model: MODEL_LLM,
          knows: 'O‘z xarakteri va ochiq ko‘rsatuvlari; yashirin fakt matnini model bilmaydi',
          rule: 'Kod tekshiradi: fakt faqat shart bajarilganda ochiladi, matnni kod qo‘shadi',
          voice: 'uz-UZ Sardor — neyron ovoz, past va xotirjam',
        },
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Yashirin fakt faqat to‘g‘ri savolda ochiladi',
        bullets: [
          'Yo‘naltiruvchi savolda fakt ochilmaydi',
          'Bu mavzuni hech qachon o‘zi boshlamaydi',
          'Faktni ochish shartini model emas, kod tekshiradi',
        ],
        icon: 'lock',
      },
    ],
  },

  kotib: {
    role: 'kotib',
    name: 'Kotib',
    status: 'Sud majlisi kotibi',
    badge: 'Avtomatik bayonnoma',
    playable: false,
    portrait: portrait('kotib'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Kotib — sud majlisi kotibi',
        lead: 'Sud majlisining borishini qayd etadi va bayonnoma yuritadi.',
        icon: 'quill',
        source: 'JPK 32-modda',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Majlisga kim kelganini aniqlab, raislik qiluvchiga ma’lum qiladi',
          'Majlisning borishini bayonnomaga yozadi',
          'Bayonnomani rasmiylashtiradi',
        ],
        icon: 'quill',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: 'Avtomatik bayonnoma',
        lead: 'Majlis jurnali va bayonnomani dastur kodi yozadi — matn uchun til modeli ishlatilmaydi (faqat ovozi sintez qilinadi).',
        bullets: [
          'Har bir gapni so‘zlovchi va bosqich bilan yozib boradi',
          'Majlis oxirida shu jurnaldan bayonnoma tuziladi',
          'Bayonnoma o‘qituvchi ko‘rib chiqishiga yuboriladi',
        ],
        icon: 'chip',
        // engine.py:45-58 va 303-311 (jurnal), report.py:305 (bayonnoma HTML), modes.py:89, tts.py:220
        passport: {
          engine: 'kod',
          model: 'Yo‘q — matnni dastur kodi yozadi',
          knows: 'Majlis jurnali: har gap, so‘zlovchi, bosqich va vaqt',
          rule: 'Faqat aytilgan gap qayd etiladi — o‘zidan qo‘shmaydi',
          voice: 'uz-UZ Madina — neyron ovoz',
        },
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Faqat aytilgan gapni qayd etadi',
        bullets: [
          'O‘zidan hech narsa qo‘shmaydi',
          'Baho bermaydi va fikr bildirmaydi',
          'Ovoz saqlanmaydi — faqat matn jurnali',
        ],
        icon: 'book',
      },
    ],
  },

  sudlanuvchi: {
    role: 'sudlanuvchi',
    name: 'Sudlanuvchi',
    status: 'Anvar Sodiqov, to‘qima shaxs',
    badge: 'Kod ssenariysi',
    playable: false,
    portrait: portrait('sudlanuvchi'),
    slides: [
      {
        kind: 'who',
        kicker: 'Kim u?',
        title: 'Sudlanuvchi — ishi sudda ko‘rilayotgan ayblanuvchi',
        lead: 'Aybi qonunda belgilangan tartibda isbotlanmaguncha aybsiz hisoblanadi (aybsizlik prezumpsiyasi).',
        icon: 'person',
      },
      {
        kind: 'court',
        kicker: 'Haqiqiy sudda',
        title: 'Sud majlisida nima qiladi',
        bullets: [
          'Himoyachi orqali va o‘zi himoyalanish huquqiga ega',
          'Ko‘rsatuv beradi, savollarga javob beradi',
          'Muzokaradan keyin oxirgi so‘zni aytadi',
        ],
        icon: 'person',
        source: 'JPK 451-modda — oxirgi so‘z',
      },
      {
        kind: 'sim',
        kicker: SIM_KICKER,
        title: 'Kod ssenariysi',
        lead: 'To‘qima ishda o‘g‘rilikda ayblanmoqda (JK 169-modda).',
        bullets: [
          'Do‘konda bo‘lganini tan oladi, noutbukni olmaganini aytadi',
          'Majlis oxirida oxirgi so‘zni aytadi — bitta qisqa gap; uni til modeli emas, kod tuzadi',
          'Siz — uning himoyachisisiz',
        ],
        icon: 'chip',
        // engine.py:253-257 va 604-607 (defendant_last_word — LLM chaqirilmaydi), case.json defendant.about_uz, tts.py:222
        passport: {
          engine: 'kod',
          model: 'Til modeli emas — oxirgi so‘z kod shablonidan',
          knows: 'Ish materialidagi pozitsiyasi: aybiga iqror emas',
          rule: 'Kod: gap pozitsiyadan tanlanadi; shundan keyin majlis yopiladi',
          voice: 'uz-UZ Sardor — neyron ovoz, sekin',
        },
      },
      {
        kind: 'rule',
        kicker: 'Qoidasi',
        title: 'Pozitsiyasidan chiqmaydi',
        lead: 'Ish materialida qanday bo‘lsa, shunday: aybiga iqror emas.',
        bullets: ['Oxirgi so‘z paytida unga savol berilmaydi', 'Mashq hukmsiz tugaydi: hukmni AI chiqarmaydi'],
        icon: 'book',
      },
    ],
  },
}
