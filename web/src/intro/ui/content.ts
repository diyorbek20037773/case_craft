// Kirish qismi matnlari (o‘zbek lotin). Faktlar faqat research/fakt-tekshiruv.md dagi ✅ qatorlardan.
// Tutuq belgisi: o‘ g‘ uchun ‘ (U+2018), qolganlari uchun ’ (U+2019).
import type { ModeId, RoleId } from '../config'

export const LOGO_LARGE = '/intro/casecraft-logo-900.webp'
export const LOGO_EMBLEM = '/intro/casecraft-emblem-128.webp'

export const AI_LABEL = 'AI o‘quv simulyatsiyasi'

export const TITLE_COPY = {
  description: 'AI personajlar bilan sud majlisini mashq qiling.',
  start: 'Boshlash',
  scrollHint: 'Pastga aylantiring',
}

export type PersonInfo = {
  name: string
  /** protsessual maqomi */
  title: string
  task: string
  /** himoyachi uchun — "AI sizga nima beradi" */
  agent: string
  rule: string
  /** agent kartochkasi uchun 1–2 qatorli qisqa tavsif */
  card: string
  /** kartochkadagi qisqa qoida */
  ruleShort: string
}

export type PersonId = RoleId | 'sudlanuvchi'

/** SPEC.md, content/case.json, content/rules.json va server/README.md asosida (modda raqamlarisiz) */
export const PEOPLE: Record<PersonId, PersonInfo> = {
  himoyachi: {
    name: 'Himoyachi',
    title: 'Siz — talaba',
    task: 'Sudlanuvchi Anvar Sodiqovni himoya qilasiz: guvohni ochiq savollar bilan so‘roq qilasiz va muzokara nutqi so‘zlaysiz.',
    agent:
      'Majlis oxirida bayonnoma va mezonlar bo‘yicha baho olasiz: har bir ball yonida o‘z gapingizdan iqtibos. Yakuniy bahoni o‘qituvchi tasdiqlaydi.',
    rule: 'Guvohga yo‘naltiruvchi savol berish, bosim o‘tkazish va bosqichdan tashqari gapirish mumkin emas — bunda sudya majlisni to‘xtatadi.',
    card: 'Guvohni ochiq savollar bilan so‘roq qilasiz va muzokara nutqi so‘zlaysiz.',
    ruleShort: 'Yo‘naltiruvchi savol va bosim mumkin emas — sudya majlisni to‘xtatadi.',
  },
  sudya: {
    name: 'Sudya',
    title: 'Raislik qiluvchi',
    task: 'Majlisni ochadi, so‘z beradi, bosqichlarni e’lon qiladi va sud majlisi tartibini saqlaydi.',
    agent:
      'Har bir gapingizni qoidalar bilan tekshiradi. Yo‘naltiruvchi savol yoki guvohga bosim bo‘lsa, majlisni to‘xtatib, JPK moddasiga havola bilan ogohlantiradi.',
    rule: 'JPK bosqichlari: majlisni ochish → sud tergovi (guvoh so‘rog‘i) → taraflar muzokarasi → oxirgi so‘z. Modda havolasini faqat ish uchun tuzilgan ro‘yxatdan oladi — o‘zi modda to‘qimaydi.',
    card: 'Majlisni JPK bosqichlari bo‘yicha boshqaradi va har bir gapni qoidalar bilan tekshiradi.',
    ruleShort: 'Qoidabuzarlikda to‘xtatadi va moddaga havola qiladi — moddani ro‘yxatdan oladi, o‘zi to‘qimaydi.',
  },
  prokuror: {
    name: 'Prokuror',
    title: 'Davlat ayblovchisi',
    task: 'Ayblovni qo‘llab-quvvatlaydi: kassa cheki, guvohning tanib olishi va kuzatuv videoyozuviga tayanadi.',
    agent: 'Qarama-qarshi tomon: guvohni so‘roq qiladi va muzokarada ayblov nutqini so‘zlaydi.',
    rule: 'Faqat o‘z bosqichida va so‘z berilganda gapiradi. Ish materialida yo‘q modda raqamlari javobdan kod orqali olib tashlanadi.',
    card: 'Qarama-qarshi tomon: guvohni so‘roq qiladi va ayblov nutqini so‘zlaydi.',
    ruleShort: 'Faqat o‘z bosqichida gapiradi; ish materialida yo‘q modda raqamlari kod orqali olib tashlanadi.',
  },
  guvoh: {
    name: 'Guvoh',
    title: 'Mansur Rahimov, do‘kon sotuvchisi',
    task: 'Voqeani do‘kon ichida ko‘rgan va tergovda sudlanuvchini fotosuratdan «o‘xshaydi» deb ko‘rsatgan.',
    agent: 'O‘z xarakterida javob beradi: xotirjam, faqat so‘ralganiga. Bosim ostida xijolat bo‘ladi, lekin yolg‘on gapirmaydi.',
    rule: 'Bitta muhim faktni yashiradi. U faqat to‘g‘ri, ochiq savolda ochiladi, yo‘naltiruvchi savolda — yo‘q. Faktni ochish shartini model emas, kod tekshiradi.',
    card: 'O‘z xarakterida, faqat so‘ralganiga javob beradi; bosim ostida xijolat bo‘ladi.',
    ruleShort: 'Bitta faktni yashiradi — u faqat ochiq savolda ochiladi. Shartni kod tekshiradi.',
  },
  kotib: {
    name: 'Kotib',
    title: 'Sud majlisi kotibi',
    task: 'Sud majlisining bayonnomasini yuritadi.',
    agent: 'Har bir gapni so‘zlovchi va bosqich bilan jurnalga yozadi; majlis oxirida shu jurnaldan bayonnoma tuziladi.',
    rule: 'Faqat aytilgan gapni qayd etadi — o‘zidan hech narsa qo‘shmaydi va baho bermaydi.',
    card: 'Har bir gapni so‘zlovchi va bosqich bilan jurnalga yozadi; oxirida bayonnoma tuziladi.',
    ruleShort: 'Faqat aytilgan gapni qayd etadi — o‘zidan qo‘shmaydi, baho bermaydi.',
  },
  sudlanuvchi: {
    name: 'Sudlanuvchi',
    title: 'Anvar Sodiqov, to‘qima shaxs',
    task: 'O‘g‘rilikda ayblanmoqda. Do‘konda bo‘lganini tan oladi, noutbukni olmaganini aytadi.',
    agent: 'Majlis oxirida oxirgi so‘zni aytadi — bu gapni til modeli emas, kod ish materialidagi pozitsiyadan tuzadi.',
    rule: 'Ish materialidagi pozitsiyasidan chiqmaydi: aybiga iqror emas.',
    card: 'Do‘konda bo‘lganini tan oladi, noutbukni olmaganini aytadi; oxirgi so‘zni aytadi.',
    ruleShort: 'Ish materialidagi pozitsiyasidan chiqmaydi: aybiga iqror emas.',
  },
}

/** Rol nishoni. AI agent (LLM + kod qoidalari) — faqat sudya, prokuror, guvoh. Kotib va sudlanuvchi — kod
 * (engine.py:29 AI_SPEAKERS; sudlanuvchining oxirgi so‘zi — engine.py:253-257 shabloni). */
export const ROLE_BADGE: Record<PersonId, string> = {
  himoyachi: 'Siz o‘ynaysiz',
  sudya: 'AI boshqaradi',
  prokuror: 'AI boshqaradi',
  guvoh: 'AI boshqaradi',
  kotib: 'Avtomatik bayonnoma',
  sudlanuvchi: 'Kod ssenariysi',
}

/** Pastki rol plitkasidagi kichik yorliq */
export const ROLE_TAG: Record<PersonId, string> = {
  himoyachi: 'Siz',
  sudya: 'AI agent',
  prokuror: 'AI agent',
  guvoh: 'AI agent',
  kotib: 'Avtomatik',
  sudlanuvchi: 'Kod',
}

/** Rol panelidagi 2-bo‘lim sarlavhasi */
export function agentHeading(id: PersonId) {
  if (id === 'himoyachi') return 'AI qanday yordam beradi'
  if (id === 'kotib' || id === 'sudlanuvchi') return 'Simulyatorda'
  return 'AI agent sifatida'
}

/** "Har bir personaj — alohida agent" bo‘limidagi tartib */
export const AGENT_ORDER: PersonId[] = ['sudya', 'guvoh', 'prokuror', 'kotib', 'sudlanuvchi']

export const STEPS = [
  {
    title: 'Rol va ishni tanlang',
    text: 'Siz himoyachisiz. To‘qima jinoyat ishi bilan tanishasiz: ayblov, dalillar, guvoh ko‘rsatuvi.',
  },
  {
    title: 'Sud majlisida qatnashing',
    text: 'AI sudya majlisni JPK bosqichlari bo‘yicha olib boradi. Siz guvohni so‘roq qilasiz, personajlar o‘zbek tilida ovoz bilan javob beradi.',
  },
  {
    title: 'Bayonnoma va baho oling',
    text: 'Oxirida bayonnoma va moddalarga havolali baho chiqadi. Yakuniy bahoni o‘qituvchi tasdiqlaydi.',
  },
]

/** Faqat kirish-brief.md 7-bo‘limidagi va research/fakt-tekshiruv.md dagi xavfsiz faktlar. Boshqa raqam qo‘shmang. */
export type WhyFact = {
  value: string
  text: string
  source: string
  /** ko‘rinishga kirganda bir marta sanab chiqadi: from -> to */
  count?: { from: number; to: number }
  /** foiz halqasi (0..100) */
  ring?: number
}

export const WHY: { lead: string; facts: WhyFact[] } = {
  lead: 'Huquqiy ta’limda amaliyotga talab ortmoqda. Talabaga sud majlisini xatodan qo‘rqmay, takror-takror mashq qiladigan muhit kerak.',
  facts: [
    {
      value: '2-trek, 7-muammo',
      text: 'LexHackathon 2026 rasmiy muammosi: «Sud majlisi, mijoz bilan suhbat va muzokara jarayonlarini AI orqali o‘tkazadigan simulyator-trenajyor».',
      source: 'LexHackathon 2026 treklari',
    },
    {
      value: 'PF-232',
      // fakt-tekshiruv.md 1a/1b: 1-ilova ("Yo‘l xaritasi"), 15-qator; muddat 2026–2027-yillar; mas’ullar TDYU, Oliy sud
      text: 'Prezident farmoni PF-232 (26.11.2025), 1-ilova (yo‘l xaritasi), 15-qator: protsessual fanlarda virtual sud majlislarini imitatsiya va simulyatsiya qilish; ijro muddati 2026–2027-yillar, mas’ullar — TDYU va Oliy sud.',
      source: 'lex.uz, PF-232',
    },
    {
      value: '50%',
      ring: 50,
      text: 'PF-232 bo‘yicha 2–4-kurs o‘quv dasturining yarmi amaliy mashg‘ulot — sud va huquqni muhofaza qiluvchi organlarda.',
      source: 'lex.uz, PF-232',
    },
    {
      value: '4 577 → 7 732',
      count: { from: 4577, to: 7732 },
      text: 'Advokatlar soni 2022-yildan 2026-yilgacha shunchaga oshdi — yosh yuristlarni tayyorlashga talab katta.',
      source: 'Adliya vazirligi, gov.uz',
    },
  ],
}

// ---------------------------------------------------------------- "Qanday ishlaydi" quvuri
// HAR quti server/app/** kodi bilan tekshirilgan (fayl:qator — izohlarda). Kodga mos bo‘lmagan gap qo‘shmang.

/** siz — foydalanuvchi; kod — deterministik; llm — til modeli; llm-kod — LLM taklif qiladi, kod tekshiradi; inson — o‘qituvchi */
export type PipeTag = 'siz' | 'kod' | 'llm' | 'llm-kod' | 'inson'

export type PipeNode = {
  id: 'siz' | 'fsm' | 'agents' | 'gate' | 'clerk' | 'grade' | 'teacher'
  title: string
  sub?: string
  points?: string[]
  tag: PipeTag
}

export const PIPE_TAG_LABEL: Record<PipeTag, string> = {
  siz: 'Siz',
  kod: 'Kod',
  llm: 'LLM',
  'llm-kod': 'LLM + kod',
  inson: 'Inson',
}

export const PIPELINE: PipeNode[] = [
  // providers/stt.py:3 — audio diskka yozilmaydi; main.py:220-232 — /turn audio -> STT
  { id: 'siz', title: 'Siz', sub: 'Ovoz yoki matn. Ovoz xotirada matnga aylanadi — audio saqlanmaydi.', tag: 'siz' },
  // engine.py:1-4, 445-459 (kod pre-check), 591-620 (bosqichga o‘tish); content/rules.json — 4 bosqich
  {
    id: 'fsm',
    title: 'JPK holat mashinasi',
    sub: '4 bosqich: ochilish → so‘roq → muzokara → oxirgi so‘z. Bosqichni faqat kod almashtiradi; aniq qoidabuzarlik LLM chaqirilmasdan ushlanadi.',
    tag: 'kod',
  },
  // engine.py:29 AI_SPEAKERS, 260-272 JSON sxema, 488-490 LLM chaqiruvi; prompts.py:34-39 rol promptlari
  {
    id: 'agents',
    title: 'AI agentlar',
    sub: 'Sudya · Prokuror · Guvoh — har birining o‘z roli va prompti; javob qat’iy JSON sxemada.',
    tag: 'llm',
  },
  // engine.py:497-499 (bosqich navbati), 506 strip_fabricated_articles, 509 strip_forbidden, 527-533 yashirin fakt, 546 (25 so‘z)
  {
    id: 'gate',
    title: 'Kod qoidalari darvozasi',
    points: [
      'Modda — faqat ish ro‘yxatidan',
      'Bosqich navbati: kim gapira oladi',
      'Yashirin fakt shartini kod tekshiradi',
      'Javob — ko‘pi bilan 25 so‘z',
    ],
    tag: 'kod',
  },
  // engine.py:45-58 Entry, 303-311 _append; report.py:305 bayonnoma_html (LLM siz)
  {
    id: 'clerk',
    title: 'Kotib bayonnomasi',
    sub: 'Har gap so‘zlovchi, bosqich va vaqt bilan yoziladi. Bayonnomani kod tuzadi — til modeli emas.',
    tag: 'kod',
  },
  // report.py:3-4, 63 quote_is_verbatim, 227-249 merge_llm_rubric, 251-266 jami ball kodda
  {
    id: 'grade',
    title: 'Iqtibosli baho',
    sub: 'Har mezon yonida gapingizdan so‘zma-so‘z iqtibos. Iqtibosni tekshirish va jami ball — kodda.',
    tag: 'llm-kod',
  },
  // report.py:25 TEACHER_NOTE_UZ, 273 teacher_approval_required: True
  {
    id: 'teacher',
    title: 'O‘qituvchi tasdiqlaydi',
    sub: 'Baho — AI tavsiyasi. Yakuniy qaror insonda (O‘RQ-1115).',
    tag: 'inson',
  },
]

/** Darvozada qaytariladigan impuls yorlig‘i (engine.py:171-178, 506-508) */
export const PIPE_REJECT = 'Rad etildi: ro‘yxatda yo‘q modda'

export const PIPE_NOTES = [
  // providers/tts.py:216-225 (uz-UZ Sardor/Madina), engine.py:685-686
  'Darvozadan o‘tgan javob uz-UZ neyron ovozda o‘qiladi.',
  // engine.py:253-257, 607 — defendant_last_word (LLM chaqirilmaydi)
  'Sudlanuvchining oxirgi so‘zi ish materialidagi pozitsiyasidan kod bilan tuziladi.',
  // providers/llm.py:429-444 call_with_fallback
  'Til modeli javob bermasa, majlis to‘xtamaydi — zaxira javob ishlaydi.',
]

// ---------------------------------------------------------------- Shaffoflik (Nizom 6.5)

export type BuiltItem = { name: string; what: string; where: string }
export type TechItem = { name: string; what: string; license?: string }

/** O‘zimiz yozgan qismlar — har biri omborda ko‘rsatilgan fayl(lar)da */
export const BUILT: BuiltItem[] = [
  {
    name: 'JPK holat mashinasi va so‘z navbati',
    what: '4 bosqich, kim qachon gapirishi va keyingi bosqichga o‘tish sharti',
    where: 'server/app/engine.py',
  },
  {
    name: 'Kod qoidalari darvozasi',
    what: 'qoidabuzarlikni oldindan tekshirish, ro‘yxatda yo‘q modda va taqiqlangan iboralarni javobdan olib tashlash',
    where: 'engine.py · modes.py',
  },
  {
    name: 'Yashirin faktli guvoh mantig‘i',
    what: 'fakt matni ochilmaguncha modelga berilmaydi; ochilish shartini kod tekshiradi',
    where: 'prompts.py · engine.py',
  },
  {
    name: 'Prokurorning tuzoq savoli',
    what: 'ishora qiluvchi savolni payqab, 8 soniya ichida raislik qiluvchiga murojaat qilish mashqi',
    where: 'modes.py',
  },
  {
    name: 'Avtomatik bayonnoma va iqtibosli baho',
    what: 'iqtibos so‘zma-so‘zligi va jami ballni kod tekshiradi; model javob bermasa — kod bahosi',
    where: 'report.py',
  },
  {
    name: 'Ta’lim rejimi',
    what: 'ustoz izohlari, «Qaysi birini qilasiz?» variantlari va 3 ta maslahat',
    where: 'modes.py',
  },
  {
    name: 'Ishonchlilik qatlami',
    what: 'kalitlar navbati, zaxira modellar, oldindan tayyorlangan ovoz keshi',
    where: 'providers/llm.py · tts.py',
  },
  {
    name: 'To‘qima ish va qoidalar bazasi',
    what: 'jinoyat ishi, JPK moddalari havolalari, qoidabuzarliklar ro‘yxati',
    where: 'content/*.json',
  },
  {
    name: '3D sahna va interfeys',
    what: 'sud zali, kamera, rol slaydlari, ish papkasi, generativ fon musiqasi',
    where: 'web/src/intro',
  },
]

/** Tayyor vositalar (server/app/providers/*, web/package.json) */
export const TOOLS: { group: string; items: TechItem[] }[] = [
  {
    group: 'AI va ovoz',
    items: [
      {
        name: 'Google Gemini (Flash-Lite)',
        what: 'personajlar javobi va baholash uchun LLM; nutqni matnga aylantirish (STT) ham shu model orqali. Zaxira LLM — Anthropic Claude',
      },
      { name: 'Aisha STT', what: 'ovozni tanishning zaxira provayderi (kalit sozlangan bo‘lsa)' },
      { name: 'edge-tts', what: 'Microsoft Edge neyron ovozlari uz-UZ (Sardor, Madina) — norasmiy kutubxona orqali' },
      { name: 'ffmpeg', what: 'brauzer audiosini xotirada mp3 ga o‘girish (zarur bo‘lsa)' },
    ],
  },
  {
    group: 'Backend',
    items: [{ name: 'FastAPI, httpx (Python)', what: 'API serveri va tashqi so‘rovlar', license: 'MIT · BSD' }],
  },
  {
    group: 'Veb va 3D',
    items: [
      { name: 'React, TypeScript, Vite', what: 'interfeys va yig‘ish', license: 'MIT' },
      { name: 'Tailwind CSS', what: 'uslublar', license: 'MIT' },
      { name: 'three.js, React Three Fiber, drei', what: '3D sud zali, kamera, personajlar', license: 'MIT' },
      { name: 'Cormorant Garamond, Manrope, Lora, Courier Prime, Caveat', what: 'shriftlar (sahifaning o‘zida joylangan)', license: 'SIL OFL' },
    ],
  },
  {
    group: '3D modellar va teksturalar',
    items: [
      { name: 'Meshy', what: 'personaj va zal jihozlari modellari Meshy AI 3D generatorida yaratilgan, animatsiyalar Meshy kutubxonasidan' },
      {
        name: 'Poly Haven',
        what: 'yog‘och, parket, devor va marmar teksturalari, HDRI yoritish (Dario Barresi, Sergej Majboroda) va ayrim jihoz modellari',
        license: 'CC0',
      },
    ],
  },
  {
    group: 'Ishlab chiqishda',
    items: [{ name: 'Claude Code', what: 'kod yozishda AI yordamchi' }],
  },
]

export const NIZOM_NOTE =
  'Hakaton Nizomining 6.5-bandiga muvofiq: chap ustunda — o‘zimiz yozgan qismlar, o‘ngda — foydalangan tayyor vositalar va ularning litsenziyalari.'

export type TeamMember = { name: string; role: string }

/** Egasi to‘ldiradi. Bo‘sh bo‘lsa "Jamoa" bo‘limi ko‘rsatilmaydi. */
export const TEAM: TeamMember[] = []

export const FOOTER = {
  disclaimer:
    'AI o‘quv simulyatsiyasi. Ish to‘qima: real shaxs va voqealarga aloqasi yo‘q. AI personajlar faqat o‘quv maqsadida ishlaydi va huquqiy qaror chiqarmaydi.',
  law: 'O‘RQ-1115 qonuniga (21.01.2026) ko‘ra huquqiy ahamiyatli qaror faqat sun’iy intellekt xulosasiga asoslanishi mumkin emas. Shu sababli trenajyorda yakuniy bahoni o‘qituvchi tasdiqlaydi.',
  event: 'LexHackathon 2026 · final',
}

export type ModeInfo = { id: ModeId; title: string; text: string; badge: string; soon?: boolean }

/** Rejim tanlash ekrani (prompts/rejimlar-brief.md) */
export const MODES: ModeInfo[] = [
  {
    id: 'talim',
    title: 'Ta’lim rejimi',
    // T16a: ustoz izohlari — kod (server/app/modes.py: "Hammasi kod"), shuning uchun "AI ustoz" demaymiz
    text: 'Ustoz har bosqichni tushuntiradi va «Qaysi birini qilasiz?» deb variant beradi.',
    badge: 'Birinchi marta uchun',
  },
  {
    id: 'majlis',
    title: 'Sud majlisi',
    text: 'Real sud kabi: agentlar o‘zaro bahslashadi, maslahat yo‘q, oxirida baho.',
    badge: 'Imtihon',
  },
  {
    id: 'dostlar',
    title: 'Do‘stlar bilan',
    text: 'Do‘stlar rollarni oladi, nazoratchi agent protsessual tartibni kuzatadi.',
    badge: 'Tez orada',
    soon: true,
  },
]

export type LobbySeat = { role: string; who: 'friend' | 'you' | 'ai' | 'auto'; label: string; initials?: string }

/** "Do‘stlar bilan" namunaviy lobbisi — real ism yo‘q */
export const LOBBY = {
  code: 'CC-4821',
  seats: [
    { role: 'Sudya', who: 'ai', label: 'Bo‘sh — AI to‘ldiradi' },
    { role: 'Prokuror', who: 'friend', label: 'Do‘st 1', initials: 'D1' },
    { role: 'Himoyachi', who: 'you', label: 'Siz — xona egasi', initials: 'S' },
    { role: 'Guvoh', who: 'friend', label: 'Do‘st 2', initials: 'D2' },
    { role: 'Kotib', who: 'auto', label: 'Avtomatik bayonnoma' },
    // T16a: sudlanuvchi AI agent emas — oxirgi so‘zi kod shablonidan (server/app/engine.py)
    { role: 'Sudlanuvchi', who: 'auto', label: 'Kod ssenariysi' },
  ] as LobbySeat[],
  moderator: {
    title: 'Nazoratchi agent',
    lead: 'Majlisni kuzatadigan alohida AI agent — ishtirokchilar odam bo‘lsa ham tartib saqlanadi.',
    duties: [
      'Protsessual tartibni kuzatadi',
      'So‘z navbatini beradi',
      'Qoidabuzarlikni qayd qiladi',
      'Har bir ishtirokchiga alohida baho yozadi',
    ],
  },
}
