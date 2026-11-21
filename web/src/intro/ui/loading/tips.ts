// "Bilasizmi?" maslahatlari — yangi matn to‘qilmaydi: faqat bundle'dagi tekshirilgan matnlar
// (content.ts: PEOPLE qoidalari va WHY faktlari, ular research/fakt-tekshiruv.md asosida).
import { PEOPLE, WHY, type PersonId } from '../content'

export type Tip = { lead: string; text: string }

/** Titul ostida 2 qatordan oshmasin (mobilda 3) — uzun matnlar kesilmaydi, ro‘yxatga kirmaydi */
const MAX_LEN = 150

const ROLE_ORDER: PersonId[] = ['himoyachi', 'sudya', 'guvoh', 'prokuror', 'kotib', 'sudlanuvchi']

function build(): Tip[] {
  const roles: Tip[] = ROLE_ORDER.map((id) => ({ lead: PEOPLE[id].name, text: PEOPLE[id].ruleShort }))
  const facts: Tip[] = WHY.facts.map((f) => ({ lead: f.value, text: f.text }))
  const ok = (t: Tip) => t.lead.length + t.text.length <= MAX_LEN
  const r = roles.filter(ok)
  const f = facts.filter(ok)
  // rol qoidasi va fakt navbatma-navbat
  const out: Tip[] = []
  for (let i = 0; i < Math.max(r.length, f.length); i++) {
    if (r[i]) out.push(r[i])
    if (f[i]) out.push(f[i])
  }
  return out
}

export const TIPS: Tip[] = build()
