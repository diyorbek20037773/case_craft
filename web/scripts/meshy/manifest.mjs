// web/public/models/meshy/manifest.json ni yig'adi (personajlar + jihozlar). Faqat o'qiydi va bitta JSON yozadi.
// node manifest.mjs
// Manba: chiqqan GLB lar (kliplar/davomiylik/uchburchak — JSON qismidan), materials/3d/meshy/<rol>/report.json (bo'y, suyaklar),
// props uchun prop-probe.mjs (o'lcham). "front" — taxmin (pastdagi FRONT), yakuniy qaror vizual tekshiruvda.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readGlbJson } from './probe.mjs'
import { probeProp } from './prop-probe.mjs'
import { skinnedBounds } from './skin-bounds.mjs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'

await MeshoptDecoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
/** report.json da bo'y yo'q bo'lsa (masalan eski guvoh) — chiqqan GLB dan hisoblash */
async function heightOf(file) {
  const b = skinnedBounds((await io.read(file)).getRoot())
  return +(b.max[1] - b.min[1]).toFixed(3)
}
/**
 * Har klipda Hips (ildiz) ning birinchi/oxirgi kadrdagi joyi (metr, personaj fazosida; Armature masshtabi hisobga olingan).
 * Meshy o'tirish kliplarida son X/Z bo'yicha 0.2–0.7 m siljigan — kliplar orasida o'tishda "sakrash" bo'lmasligi uchun
 * kod shu farqni kompensatsiya qilishi yoki ildiz trekini nollashi kerak.
 */
async function hipsMotion(file, anchors) {
  const root = (await io.read(file)).getRoot()
  const hips = root.listSkins()[0].listJoints()[0]
  const parent = root.listNodes().find((n) => n.listChildren().includes(hips))
  const k = parent ? parent.getWorldMatrix()[0] : 1 // Armature uniform masshtab (0.01)
  const r3 = (a) => a.map((x) => +(x * k).toFixed(3))
  const out = {}
  for (const anim of root.listAnimations()) {
    const ch = anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation')
    if (!ch) continue
    const arr = ch.getSampler().getOutput().getArray()
    const a = anchors?.clips?.[anim.getName()]
    out[anim.getName()] = {
      start: r3(Array.from(arr.slice(0, 3))),
      end: r3(Array.from(arr.slice(arr.length - 3))),
      ...(a ? { anchor: a.mode, offsetApplied: r3(a.offset) } : {}),
    }
  }
  return { rest: r3(hips.getTranslation()), seatedAnchor: anchors?.seatedAnchor ? r3(anchors.seatedAnchor) : null, clips: out }
}

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '..', '..')
const PUBLIC = join(WEB, 'public', 'models', 'meshy')
const MATERIALS = resolve(WEB, '..', 'materials', '3d', 'meshy')
const ROLES = ['guvoh', 'himoyachi', 'prokuror', 'kotib', 'sudya', 'sudlanuvchi']
const SAHNA_CLIPS = ['idle', 'idle_b', 'sit_idle', 'sit_talk', 'sit_to_stand', 'stand_to_sit', 'talk', 'talk_b', 'walk']
// guvoh eski nomlarda qolgan (web/src/guvoh shu nomlarni ishlatadi) — yagona nomga moslik jadvali
const GUVOH_ALIASES = { idle: 'idle_a', idle_b: 'idle_b', talk: 'talk_both', talk_b: 'talk_right', walk: 'walk', think: 'think' }

const FRONT = {
  minbar: { front: '+Z', note: 'Meshy odatiy yo\'nalishi; layout.ts STAND_ROT_Y bilan ishlatilmoqda' },
  'sudya-stoli': { front: '-Z', note: 'zal tomoni -Z, kreslo +Z da (layout.ts rotY=PI bilan ishlatilmoqda)' },
  'kotib-stoli': { front: '-Z', note: 'zal tomoni -Z, kreslo +Z da (layout.ts rotY=PI+0.35)' },
  'prokuror-stoli': { front: '+Z', note: 'layout.ts rotY=PI/2 shu taxminga asoslangan' },
  'himoyachi-stoli': { front: '+Z', note: 'layout.ts rotY=-PI/2 shu taxminga asoslangan' },
  'sudlanuvchi-orni': { front: '+Z', note: 'layout.ts rotY=-PI/2 shu taxminga asoslangan' },
  eshik: { front: '+Z', note: 'deyarli simmetrik; romi/qoplamasi +Z ga chiqqan (massa markazi +Z, detal +Z da ko\'p). Devorga: orqasi (-Z) devorga' },
  chiroq: { front: null, note: 'yumaloq shift chirog\'i (aylanma simmetrik, yo\'nalishsiz). Tagi y=0 — shiftga: y = shift_balandligi - 0.216' },
  ekran: { front: '+Z', note: '--rotate 180 bilan burildi: tekis displey paneli +Z da, orqa korpus -Z da. Devorga osiladi' },
  skameyka: { front: '+Z', note: 'ikki qator o\'rindiq; har qatorda suyanchiq -Z tomonda, o\'tiruvchi +Z ga qaraydi' },
}

const mb = (f) => +(statSync(f).size / 1048576).toFixed(2)
const rel = (f) => '/' + f.slice(join(WEB, 'public').length + 1).replace(/\\/g, '/')

function glbInfo(file) {
  const j = readGlbJson(file)
  let tris = 0
  for (const m of j.meshes ?? []) for (const p of m.primitives) tris += (p.indices != null ? j.accessors[p.indices].count : j.accessors[p.attributes.POSITION].count) / 3
  const clips = (j.animations ?? []).map((a) => ({
    name: a.name,
    duration: +Math.max(...a.samplers.map((s) => j.accessors[s.input].max?.[0] ?? 0)).toFixed(3),
  }))
  return { tris, clips, joints: j.skins?.[0]?.joints.length ?? 0 }
}

const characters = {}
for (const role of ROLES) {
  const file = join(PUBLIC, `${role}.glb`)
  const mobile = join(PUBLIC, `${role}-mobile.glb`)
  if (!existsSync(file)) continue
  const info = glbInfo(file)
  const repFile = join(MATERIALS, role, 'report.json')
  const rep = existsSync(repFile) ? JSON.parse(readFileSync(repFile, 'utf8')) : {}
  const names = info.clips.map((c) => c.name)
  characters[role] = {
    file: rel(file),
    mobile: existsSync(mobile) ? rel(mobile) : null,
    mb: mb(file),
    mobileMb: existsSync(mobile) ? mb(mobile) : null,
    triangles: info.tris,
    heightM: rep.heightM ?? (await heightOf(file)),
    clipNaming: role === 'guvoh' ? 'eski (idle_a/talk_both/talk_right/think)' : 'sahna',
    ...(role === 'guvoh' ? { aliases: GUVOH_ALIASES } : { missingSahnaClips: SAHNA_CLIPS.filter((c) => !names.includes(c) && !c.endsWith('_b')) }),
    clips: info.clips,
    hipsMeters: await hipsMotion(file, rep.anchors),
    skeleton: {
      joints: info.joints,
      sameAsGuvoh: 'nomlar, tartib va ierarxiya bir xil (inspect-skel.mjs); rest pozasi farq qiladi — arms.ts rest ni modeldan oladi',
    },
  }
}
const jointNames = JSON.parse(readFileSync(join(MATERIALS, 'guvoh', 'report.json'), 'utf8')).joints

const props = {}
const propDir = join(PUBLIC, 'props')
for (const f of readdirSync(propDir).filter((f) => f.endsWith('.glb') && !f.endsWith('-mobile.glb')).sort()) {
  const name = f.replace(/\.glb$/, '')
  const p = await probeProp(join(propDir, f))
  const mobile = join(propDir, `${name}-mobile.glb`)
  const repFile = join(MATERIALS, 'props', `${name}.report.json`)
  const rep = existsSync(repFile) ? JSON.parse(readFileSync(repFile, 'utf8')) : {}
  props[name] = {
    file: rel(join(propDir, f)),
    mobile: existsSync(mobile) ? rel(mobile) : null,
    mb: mb(join(propDir, f)),
    mobileMb: existsSync(mobile) ? mb(mobile) : null,
    triangles: p.triangles,
    sizeMeters: { x: p.sizeMeters[0], y: p.sizeMeters[1], z: p.sizeMeters[2] },
    origin: 'tagi y=0, markazi x/z=0',
    rotateDegApplied: rep.rotateDeg ?? 0,
    ...(FRONT[name] ?? { front: '+Z', note: 'taxmin (Meshy odatiy)' }),
  }
}

const sum = (xs) => +xs.reduce((a, b) => a + (b ?? 0), 0).toFixed(2)
const zalDir = join(PUBLIC, 'zal')
const zalAll = existsSync(zalDir) ? readdirSync(zalDir).filter((f) => f.endsWith('.webp')) : []
const zalDesktop = sum(zalAll.filter((f) => !f.endsWith('-m.webp')).map((f) => mb(join(zalDir, f))))
const zalMobile = sum(zalAll.filter((f) => f.endsWith('-m.webp')).map((f) => mb(join(zalDir, f))))
const all = [...Object.values(characters), ...Object.values(props)]
const manifest = {
  generated: new Date().toISOString(),
  regenerate: 'cd web/scripts/meshy && node manifest.mjs',
  loader: "useGLTF(url, false, true) — meshopt dekoder shart (EXT_meshopt_compression), teksturalar WebP (EXT_texture_webp)",
  axes: '+Y yuqori, metr. Personaj oldi +Z. Jihozlar: "front" maydoni (taxmin)',
  sahnaClipNames: SAHNA_CLIPS,
  skeletonJoints: jointNames,
  totalsMb: {
    desktop: { characters: sum(Object.values(characters).map((c) => c.mb)), props: sum(Object.values(props).map((c) => c.mb)), zalTextures: zalDesktop },
    mobile: { characters: sum(Object.values(characters).map((c) => c.mobileMb)), props: sum(Object.values(props).map((c) => c.mobileMb)), zalTextures: zalMobile },
  },
  characters,
  props,
}
manifest.totalsMb.desktop.all = sum([sum(all.map((a) => a.mb)), zalDesktop])
manifest.totalsMb.mobile.all = sum([sum(all.map((a) => a.mobileMb)), zalMobile])
writeFileSync(join(PUBLIC, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('manifest.json yozildi:', join(PUBLIC, 'manifest.json'))
console.log('jami MB:', JSON.stringify(manifest.totalsMb))
for (const [r, c] of Object.entries(characters)) console.log(r, c.mb, c.mobileMb, c.triangles, c.heightM, c.clips.map((x) => `${x.name}:${x.duration}`).join(' '), c.missingSahnaClips ?? '')
for (const [n, p] of Object.entries(props)) console.log(n, p.mb, p.mobileMb, p.triangles, JSON.stringify(p.sizeMeters), p.front)
