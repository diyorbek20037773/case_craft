#!/usr/bin/env node
// Meshy -> veb pipeline'i (qayta ishlatiladi: guvoh, sudya, prokuror, kotib, jihozlar).
//
// Birinchi marta: web/scripts/meshy ichida `npm install` (bu papkaning o'z package.json i bor; asosiy ilovaga ta'sir qilmaydi).
//
// 1) PERSONAJ: bir nechta Meshy GLB (har biri bitta klip, bir xil skelet) -> bitta GLB, kliplar toza nomli.
//   node process.mjs <zip | papka> <rol> [--map Asl=yangi,...] [--keep-unmapped] [--q 88]
//   node process.mjs C:\Users\Flex\Downloads\Meshy_models_20261120_184026.zip guvoh
//   node process.mjs C:\Users\Flex\Downloads\Meshy_sudya.zip sudya --map Idle_3=idle_a,Talking=talk_both
//   Zal sahnasi personajlari (yagona klip nomlari idle/idle_b/sit_idle/sit_talk/sit_to_stand/stand_to_sit/talk/talk_b/walk):
//   node process.mjs ..\..\..\materials\3d\meshy\sudya\Meshy_models_20261120_222433.zip sudya --preset sahna --clean
//   (zip dan faqat Meshy "Merged_Animations.glb" ochiladi — u barcha kliplarni o'z ichiga oladi; hammasi kerak: --all-files.
//    --clean: ochilgan oraliq papka oxirida o'chiriladi, zip va report.json qoladi)
//   Natija: materials/3d/meshy/<rol>/ (asl fayllar + report.json), web/public/models/meshy/<rol>.glb va <rol>-mobile.glb
//
// 2) JIHOZ (prop): bitta statik Meshy GLB -> real o'lchamga keltirilgan, tagi y=0, markazi x/z=0.
//   node process.mjs <glb | zip | papka> --prop <nom> [--height 1.1 | --width 3.6 | --depth 0.8] [--rotate 180] [--q 88]
//   node process.mjs ..\..\..\materials\3d\meshy\props\minbar.glb --prop minbar --height 1.1
//   Natija: materials/3d/meshy/props/<nom>.report.json, web/public/models/meshy/props/<nom>.glb va <nom>-mobile.glb
//
// --dilate (ikkala rejimda): teksturalarga UV padding — dilate.mjs (mavjud fayllarni joyida: node dilate.mjs <glb>).
// Ikkala rejimda: teksturalar 2048 (noutbuk) / 1024 (telefon) WebP, meshopt siqish (EXT_meshopt_compression),
// keraksiz ma'lumot tozalanadi. Brauzerda: useGLTF(url, false, true) — meshopt dekoder yoqilgan bo'lishi shart.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions'
import { cloneDocument, dedup, getBounds, meshopt, prune, resample } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { skinnedBounds } from './skin-bounds.mjs'
import { padTexture, primitivesFor, uvMask, webpOptions } from './dilate.mjs'
import sharp from 'sharp'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '..', '..')
const REPO = resolve(WEB, '..')
const MATERIALS = join(REPO, 'materials', '3d', 'meshy')
const PUBLIC = join(WEB, 'public', 'models', 'meshy')

// Meshy klip nomi -> toza nom. Ro'yxatda yo'q kliplar tashlanadi (--keep-unmapped bilan saqlanadi).
const DEFAULT_MAP = [
  [/^idle_?11$/i, 'idle_a'],
  [/^idle_?9$/i, 'idle_b'],
  [/talk.*right_hand/i, 'talk_right'],
  [/talk.*hands_open/i, 'talk_both'],
  [/confused|scratch|think/i, 'think'],
  [/^walk(ing)?$/i, 'walk'],
]

// --preset sahna: zal sahnasi uchun yagona nomlar (himoyachi, prokuror, kotib, sudya, sudlanuvchi).
// Toifadagi ikkinchi klip (ikkinchi idle yoki talk) avtomatik <nom>_b bo'ladi. Running tashlanadi.
const SAHNA_MAP = [
  [/^idle_?\d+$/i, 'idle'],
  [/^chair_sit_idle(_[mf])?$/i, 'sit_idle'],
  [/^sitting_answering_questions$/i, 'sit_talk'],
  [/^sit_to_stand(_transition)?(_[mf])?$/i, 'sit_to_stand'],
  [/^stand_to_sit(_transition)?(_[mf])?$/i, 'stand_to_sit'],
  [/^talk_with/i, 'talk'],
  [/^walk(ing)?$/i, 'walk'],
]
// Bir toifada asosiysi: Idle_11 > Idle_9, Hands_Open > Right_Hand (guvohdagi idle_a/talk_both tartibi bilan bir xil)
const SAHNA_PRIORITY = [/^idle_?11$/i, /hands_open/i]

// ---------- argumentlar ----------
const args = process.argv.slice(2)
const flag = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return null
  const v = args[i + 1]
  args.splice(i, 2)
  return v
}
const bool = (name) => {
  const i = args.indexOf(name)
  if (i < 0) return false
  args.splice(i, 1)
  return true
}
const USAGE = `Ishlatish:
  node process.mjs <zip|papka> <rol> [--preset sahna] [--clean] [--dilate] [--all-files] [--map Asl=yangi,...] [--keep-unmapped] [--q 88]
  node process.mjs <glb|zip|papka> --prop <nom> [--height M | --width M | --depth M] [--rotate GRAD] [--dilate] [--q 88]`
const propName = flag('--prop')
const keepUnmapped = bool('--keep-unmapped')
const allFiles = bool('--all-files')
const clean = bool('--clean')
// --dilate: teksturalarga UV padding (dilate.mjs) — orolchalar orasidagi qora bo'shliq to'ldiriladi, frontda mipmap xavfsiz
const dilate = bool('--dilate')
const userMap = flag('--map')
const quality = Number(flag('--q') ?? 88)
const size = { height: flag('--height'), width: flag('--width'), depth: flag('--depth') }
const rotateDeg = Number(flag('--rotate') ?? 0)
const preset = flag('--preset')
if (preset && preset !== 'sahna') throw new Error(`Noma'lum --preset: ${preset} (faqat: sahna)`)
const [input, roleArg] = args
const name = propName ?? roleArg
if (!input || !name || !/^[a-z0-9_-]+$/i.test(name)) {
  console.error(USAGE)
  process.exit(1)
}
const inputAbs = resolve(input)
if (!existsSync(inputAbs)) throw new Error(`Topilmadi: ${inputAbs}`)

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
await MeshoptEncoder.ready

// ---------- umumiy yordamchilar ----------
/** zip -> dir (Windows 10+ tar.exe zip ni ochadi; boshqa tizimlarda unzip) */
function unzip(zip, dir, members = []) {
  mkdirSync(dir, { recursive: true })
  console.log(`[1] Arxiv ochilmoqda -> ${dir}${members.length ? ` (faqat: ${members.join(', ')})` : ''}`)
  if (process.platform === 'win32') execFileSync('C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', dir, ...members], { stdio: 'inherit' })
  else execFileSync('unzip', ['-o', '-q', zip, ...members, '-d', dir], { stdio: 'inherit' })
}
/** zip ichidagi fayllar ro'yxati */
function zipList(zip) {
  const out =
    process.platform === 'win32'
      ? execFileSync('C:\\Windows\\System32\\tar.exe', ['-tf', zip], { encoding: 'utf8' })
      : execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
  return out.split(/\r?\n/).filter(Boolean)
}
function findGlbs(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (extname(e.name).toLowerCase() === '.glb') out.push(p)
    }
  }
  walk(dir)
  return out
}
function countGeometry(doc) {
  let tris = 0
  let verts = 0
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      verts += p.getAttribute('POSITION').getCount()
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3
    }
  return { tris, verts }
}

/** Teksturalarni sharp bilan kichraytirib WebP ga o'tkazish (gltf-transform textureCompress ishlatilmaydi: sharp nusxalari to'qnashuvi) */
function webpTextures(px, q) {
  return async (d) => {
    if (!d.getRoot().listTextures().length) return
    d.createExtension(EXTTextureWebP).setRequired(true)
    for (const tex of d.getRoot().listTextures()) {
      const img = tex.getImage()
      if (!img) continue
      const isNormal = /normal/i.test(tex.getName()) || d.getRoot().listMaterials().some((m) => m.getNormalTexture() === tex)
      if (dilate) {
        // UV padding: niqob asl o'lchamda, kichraytirish + dilation padTexture() ichida (dilate.mjs)
        const meta = await sharp(Buffer.from(img)).metadata()
        const k = Math.min(1, px / Math.max(meta.width, meta.height))
        const tw = Math.round(meta.width * k)
        const th = Math.round(meta.height * k)
        const prims = primitivesFor(d.getRoot(), tex)
        if (prims.length) {
          const { raw, coverage } = await padTexture(img, uvMask(prims, meta.width, meta.height), tw, th)
          const out = await sharp(raw, { raw: { width: tw, height: th, channels: 3 } }).webp(webpOptions(isNormal, q)).toBuffer()
          tex.setImage(new Uint8Array(out)).setMimeType('image/webp')
          const uri = tex.getURI() ? tex.getURI().replace(/\.[a-z]+$/i, '') : tex.getName()
          if (uri) tex.setURI(`${uri}.webp`)
          console.log(`    dilation: ${tex.getName()} ${tw}px, UV qamrov ${(coverage * 100).toFixed(1)}%`)
          continue
        }
      }
      const out = await sharp(Buffer.from(img))
        .resize(px, px, { fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
        // Normal xarita: yuqoriroq sifat (yuz/yog'och relyefi "bloklanmasin")
        .webp({ quality: isNormal ? Math.min(95, q + 6) : q, effort: 5, smartSubsample: true })
        .toBuffer()
      tex.setImage(new Uint8Array(out)).setMimeType('image/webp')
      const uri = tex.getURI() ? tex.getURI().replace(/\.[a-z]+$/i, '') : tex.getName()
      if (uri) tex.setURI(`${uri}.webp`)
    }
  }
}

/** Ikki variant: noutbuk 2048 / telefon 1024 */
async function writeVariants(doc, outDir, base) {
  mkdirSync(outDir, { recursive: true })
  const outputs = []
  for (const v of [
    { file: `${base}.glb`, px: 2048, q: quality },
    { file: `${base}-mobile.glb`, px: 1024, q: quality - 6 },
  ]) {
    const d = cloneDocument(doc)
    await d.transform(webpTextures(v.px, v.q), meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    const out = join(outDir, v.file)
    await io.write(out, d)
    const mb = +(statSync(out).size / 1048576).toFixed(2)
    outputs.push({ file: out.slice(WEB.length + 1).replace(/\\/g, '/'), textures: v.px, mb })
    console.log(`[5] ${v.file}: ${mb} MB (teksturalar ${v.px}px WebP q${v.q}, meshopt)`)
  }
  return outputs
}

/**
 * --preset sahna: Hips (ildiz) trekini kliplar orasida "sakramaydigan" qilib siljitish (Armature birligida, odatda sm).
 *  - o'tirgan langar A = sit_idle boshidagi Hips X/Z; sit_idle o'zgarmaydi
 *  - sit_talk: X/Z boshi A ga; Y o'rtachasi sit_idle o'rtachasiga tenglanadi
 *  - sit_to_stand: boshi (X/Z) A ga; stand_to_sit: oxiri (X/Z) A ga (ichki oldinga harakati saqlanadi)
 *  - idle/idle_b/talk/talk_b: boshi X/Z = 0
 *  - walk: boshi X/Z = 0 va boshi->oxiri chiziqli siljish olib tashlanadi (joyida yuradi, chayqalish qoladi; yurishni kod boshqaradi)
 * Qaytaradi: har klip uchun { mode, offset[x,y,z] } (Armature birligida).
 */
function normalizeHips(root, hips) {
  const track = (anim) => anim.listChannels().find((c) => c.getTargetNode() === hips && c.getTargetPath() === 'translation')
  const byName = new Map(root.listAnimations().map((a) => [a.getName(), a]))
  const arrOf = (name) => {
    const ch = byName.get(name) && track(byName.get(name))
    return ch ? ch.getSampler().getOutput().getArray() : null
  }
  const first = (a) => [a[0], a[1], a[2]]
  const last = (a) => [a[a.length - 3], a[a.length - 2], a[a.length - 1]]
  const meanY = (a) => {
    let s = 0
    for (let i = 1; i < a.length; i += 3) s += a[i]
    return s / (a.length / 3)
  }
  const apply = (name, fn) => {
    const ch = byName.get(name) && track(byName.get(name))
    if (!ch) return
    const out = ch.getSampler().getOutput()
    const a = out.getArray().slice()
    fn(a, ch.getSampler().getInput().getArray())
    out.setArray(a)
  }
  const shift = (name, off, mode) => {
    apply(name, (a) => {
      for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) a[i + k] += off[k]
    })
    anchors[name] = { mode, offset: off.map((x) => +x.toFixed(3)) }
  }
  const anchors = {}
  const si = arrOf('sit_idle')
  const A = si ? first(si) : null
  if (A) {
    anchors.sit_idle = { mode: 'seated-anchor', offset: [0, 0, 0] }
    const st = arrOf('sit_talk')
    if (st) shift('sit_talk', [A[0] - st[0], meanY(si) - meanY(st), A[2] - st[2]], 'seated-anchor')
    const s2s = arrOf('sit_to_stand')
    if (s2s) shift('sit_to_stand', [A[0] - s2s[0], 0, A[2] - s2s[2]], 'start=seated-anchor')
    const t2s = arrOf('stand_to_sit')
    if (t2s) {
      const e = last(t2s)
      shift('stand_to_sit', [A[0] - e[0], 0, A[2] - e[2]], 'end=seated-anchor')
    }
  }
  for (const n of ['idle', 'idle_b', 'talk', 'talk_b']) {
    const a = arrOf(n)
    if (a) shift(n, [-a[0], 0, -a[2]], 'origin-at-start')
  }
  const w = arrOf('walk')
  if (w) {
    const s = first(w)
    const e = last(w)
    apply('walk', (a, t) => {
      const t0 = t[0]
      const t1 = t[t.length - 1] || 1
      for (let i = 0, f = 0; i < a.length; i += 3, f++) {
        const u = (t[f] - t0) / (t1 - t0 || 1)
        a[i] -= s[0] + (e[0] - s[0]) * u
        a[i + 2] -= s[2] + (e[2] - s[2]) * u
      }
    })
    anchors.walk = { mode: 'in-place (X/Z drift removed)', offset: [-s[0], 0, -s[2]].map((x) => +x.toFixed(3)) }
  }
  console.log(`[4] Hips langari: A=${A ? A.map((x) => x.toFixed(1)).join(',') : '-'}; ${Object.entries(anchors).map(([k, v]) => `${k}:${v.mode}`).join(', ')}`)
  return { seatedAnchor: A ? A.map((x) => +x.toFixed(3)) : null, clips: anchors }
}

if (propName) await runProp()
else await runCharacter()

// =====================================================================================
// JIHOZ
// =====================================================================================
async function runProp() {
  const propsSrc = join(MATERIALS, 'props')
  let file = inputAbs
  if (statSync(inputAbs).isDirectory() || extname(inputAbs).toLowerCase() === '.zip') {
    let dir = inputAbs
    if (!statSync(inputAbs).isDirectory()) {
      dir = join(propsSrc, name)
      unzip(inputAbs, dir)
    }
    const glbs = findGlbs(dir)
    if (!glbs.length) throw new Error(`GLB topilmadi: ${dir}`)
    file = glbs[0]
  } else if (!inputAbs.startsWith(MATERIALS)) {
    // asl nusxa materials/ da saqlansin (deploy qilinmaydi)
    mkdirSync(propsSrc, { recursive: true })
    copyFileSync(inputAbs, join(propsSrc, `${name}.glb`))
  }
  console.log(`[1] Jihoz: ${basename(file)} -> ${name}`)
  const doc = await io.read(file)
  const root = doc.getRoot()
  for (const a of root.listAnimations()) a.dispose()
  for (const s of root.listSkins()) s.dispose()

  // O'lchamni real metrga keltirish: bitta ildiz node orqali (masshtab + burish + tagini y=0 ga qo'yish)
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  const pivot = doc.createNode(`${name}_root`)
  for (const child of scene.listChildren()) {
    scene.removeChild(child)
    pivot.addChild(child)
  }
  scene.addChild(pivot)
  if (rotateDeg) {
    const r = (rotateDeg * Math.PI) / 360
    pivot.setRotation([0, Math.sin(r), 0, Math.cos(r)])
  }
  let b = getBounds(scene)
  const dims = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
  let k = 1
  if (size.height) k = Number(size.height) / dims[1]
  else if (size.width) k = Number(size.width) / dims[0]
  else if (size.depth) k = Number(size.depth) / dims[2]
  pivot.setScale([k, k, k])
  b = getBounds(scene)
  pivot.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2])
  b = getBounds(scene)
  const finalDims = [0, 1, 2].map((i) => +(b.max[i] - b.min[i]).toFixed(3))
  console.log(`[2] O'lcham: ${dims.map((x) => x.toFixed(2)).join(' x ')} (manba) -> ${finalDims.join(' x ')} m (en x bo'y x chuqurlik), masshtab ${k.toFixed(4)}`)

  await doc.transform(prune({ keepAttributes: true }), dedup())
  const { tris, verts } = countGeometry(doc)
  const outputs = await writeVariants(doc, join(PUBLIC, 'props'), name)
  mkdirSync(propsSrc, { recursive: true })
  const report = { prop: name, source: file, triangles: tris, vertices: verts, sizeMeters: finalDims, scale: k, rotateDeg, outputs }
  writeFileSync(join(propsSrc, `${name}.report.json`), JSON.stringify(report, null, 2))
  console.log(`[✓] ${tris} uchburchak, ${verts} verteks. Hisobot: ${join(propsSrc, `${name}.report.json`)}`)
}

// =====================================================================================
// PERSONAJ
// =====================================================================================
async function runCharacter() {
  const extraMap = (userMap ?? '')
    .split(',')
    .filter(Boolean)
    .map((p) => {
      const [from, to] = p.split('=')
      return [new RegExp(`^${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), to]
    })
  const CLIP_MAP = [...extraMap, ...(preset === 'sahna' ? SAHNA_MAP : DEFAULT_MAP)]
  const cleanName = (n) => CLIP_MAP.find(([re]) => re.test(n))?.[1] ?? null

  // ---------- 1) manba: zip -> materials/3d/meshy/<rol> ----------
  const srcDir = join(MATERIALS, name)
  mkdirSync(srcDir, { recursive: true })
  let scanDir = statSync(inputAbs).isDirectory() ? inputAbs : srcDir
  let extracted = null
  if (statSync(inputAbs).isFile() && extname(inputAbs).toLowerCase() === '.zip') {
    // Meshy "Merged_Animations.glb" barcha kliplarni o'z ichiga oladi: faqat shuni ochamiz (6x kam disk/xotira).
    // Hamma fayl kerak bo'lsa: --all-files
    const merged = allFiles ? null : zipList(inputAbs).find((m) => /Merged_Animations\.glb$/i.test(m))
    unzip(inputAbs, srcDir, merged ? [merged] : [])
    extracted = merged ? join(srcDir, dirname(merged)) : null
    if (extracted) scanDir = extracted
  }
  const glbs = findGlbs(scanDir)
  if (!glbs.length) throw new Error(`GLB topilmadi: ${scanDir}`)
  console.log(`[1] ${glbs.length} ta GLB:`, glbs.map((g) => basename(g)).join(', '))

  // ---------- 2) o'qish va skeletni tekshirish ----------
  const docs = []
  for (const f of glbs) {
    const doc = await io.read(f)
    if (!doc.getRoot().listSkins()[0]) {
      console.warn(`  ! skin yo'q, o'tkazib yuborildi: ${basename(f)}`)
      continue
    }
    docs.push({ file: f, doc, anims: doc.getRoot().listAnimations().length })
  }
  if (!docs.length) throw new Error('Skinli GLB topilmadi')
  // Asos: eng ko'p klipli fayl ("Rigged"/"Merged" ustun)
  docs.sort((a, b) => {
    const pa = /rigged|merged/i.test(a.file) ? 1 : 0
    const pb = /rigged|merged/i.test(b.file) ? 1 : 0
    return pb - pa || b.anims - a.anims
  })
  const base = docs[0]
  const doc = base.doc
  const root = doc.getRoot()
  console.log(`[2] Asos: ${basename(base.file)} (${base.anims} klip)`)

  const jointSig = (d) =>
    d
      .getRoot()
      .listSkins()[0]
      .listJoints()
      .map((j) => ({ n: j.getName(), t: j.getTranslation(), r: j.getRotation() }))
  const baseSig = jointSig(doc)
  const close = (a, b, eps) => a.every((x, i) => Math.abs(x - b[i]) < eps)
  function sameSkeleton(other) {
    const sig = jointSig(other)
    if (sig.length !== baseSig.length) return `suyaklar soni ${sig.length} != ${baseSig.length}`
    for (const a of sig) {
      const b = baseSig.find((x) => x.n === a.n)
      if (!b) return `suyak yo'q: ${a.n}`
      if (!close(a.t, b.t, 0.05) || !close(a.r, b.r, 0.01)) return `dam olish pozasi farq qiladi: ${a.n}`
    }
    return null
  }

  // ---------- 3) kliplarni bitta hujjatga ko'chirish (suyak nomi bo'yicha) ----------
  const nodeByName = new Map(root.listNodes().map((n) => [n.getName(), n]))
  const have = new Set(root.listAnimations().map((a) => a.getName()))
  const buffer = root.listBuffers()[0]
  for (const { file, doc: other } of docs.slice(1)) {
    const why = sameSkeleton(other)
    if (why) {
      console.warn(`  ! skelet mos emas (${why}), o'tkazib yuborildi: ${basename(file)}`)
      continue
    }
    console.log(`  ✓ skelet mos: ${basename(file)}`)
    for (const anim of other.getRoot().listAnimations()) {
      if (have.has(anim.getName())) continue
      const copy = doc.createAnimation(anim.getName())
      let lost = 0
      for (const ch of anim.listChannels()) {
        const target = nodeByName.get(ch.getTargetNode()?.getName())
        if (!target) {
          lost++
          continue
        }
        const s = ch.getSampler()
        const acc = (a) => doc.createAccessor().setType(a.getType()).setArray(a.getArray().slice()).setBuffer(buffer)
        const sampler = doc.createAnimationSampler().setInput(acc(s.getInput())).setOutput(acc(s.getOutput())).setInterpolation(s.getInterpolation())
        copy.addSampler(sampler)
        copy.addChannel(doc.createAnimationChannel().setTargetNode(target).setTargetPath(ch.getTargetPath()).setSampler(sampler))
      }
      have.add(anim.getName())
      console.log(`  + ${anim.getName()} <- ${basename(file)}${lost ? ` (${lost} kanal nishonsiz)` : ''}`)
    }
  }

  // ---------- 4) nomlash, keraksizini olib tashlash ----------
  const clips = []
  const ordered = root.listAnimations().slice()
  if (preset === 'sahna') {
    const pr = (a) => (SAHNA_PRIORITY.some((re) => re.test(a.getName())) ? 0 : 1)
    ordered.sort((a, b) => pr(a) - pr(b))
  }
  for (const anim of ordered) {
    const n = cleanName(anim.getName())
    if (!n && !keepUnmapped) {
      console.log(`  - tashlandi: ${anim.getName()}`)
      anim.dispose()
      continue
    }
    let finalName = n ?? anim.getName().toLowerCase()
    if (preset === 'sahna' && clips.includes(finalName) && !clips.includes(`${finalName}_b`)) finalName = `${finalName}_b`
    if (clips.includes(finalName)) {
      console.log(`  - takror: ${anim.getName()} (${finalName} allaqachon bor)`)
      anim.dispose()
      continue
    }
    anim.setName(finalName)
    clips.push(finalName)
  }

  // Meshy har suyakka doimiy scale (=1) va (son-dan tashqari) doimiy translation trek yozadi — faqat hajm
  const hips = root.listSkins()[0].listJoints()[0]
  let dropped = 0
  for (const anim of root.listAnimations()) {
    for (const ch of anim.listChannels()) {
      const path = ch.getTargetPath()
      const node = ch.getTargetNode()
      const out = ch.getSampler().getOutput().getArray()
      const restV = path === 'scale' ? node.getScale() : path === 'translation' ? node.getTranslation() : null
      if (!restV || (path === 'translation' && node === hips)) continue
      const eps = path === 'translation' ? 1e-2 : 1e-3
      let constant = true
      for (let i = 0; i < out.length && constant; i++) if (Math.abs(out[i] - restV[i % 3]) > eps) constant = false
      if (constant) {
        const s = ch.getSampler()
        ch.dispose()
        s.dispose()
        dropped++
      }
    }
  }
  console.log(`[4] Kliplar: ${clips.join(', ')}; doimiy trek olib tashlandi: ${dropped}`)

  const anchors = preset === 'sahna' ? normalizeHips(root, hips) : null

  await doc.transform(resample({ tolerance: 1e-4 }), prune({ keepAttributes: true }), dedup())
  const { tris, verts } = countGeometry(doc)
  // Bo'y (bind-poza, metr) — sahnaga joylashtirish va kamera uchun.
  // Skinli mesh: v_world = jointWorld * IBM * v (glTF da mesh node transformi e'tiborsiz), getBounds bunga yaramaydi.
  const sb = skinnedBounds(root)
  const heightM = +(sb.max[1] - sb.min[1]).toFixed(3)
  const boundsM = { min: sb.min.map((x) => +x.toFixed(3)), max: sb.max.map((x) => +x.toFixed(3)) }
  console.log(`[4] Bo'y: ${heightM} m, bounds ${JSON.stringify(boundsM)}`)

  // ---------- 5) ikki variant ----------
  const report = { role: name, source: inputAbs, base: basename(base.file), preset: preset ?? null, triangles: tris, vertices: verts, heightM, boundsM, joints: baseSig.map((j) => j.n), anchors, clips: [], outputs: [] }
  for (const anim of root.listAnimations()) {
    const dur = Math.max(...anim.listSamplers().map((s) => s.getInput().getMax([])[0]))
    report.clips.push({ name: anim.getName(), duration: +dur.toFixed(3), channels: anim.listChannels().length })
  }
  report.outputs = await writeVariants(doc, PUBLIC, name)
  writeFileSync(join(srcDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`[✓] ${tris} uchburchak, ${verts} verteks, ${baseSig.length} suyak. Hisobot: ${join(srcDir, 'report.json')}`)
  // --clean: zip dan ochilgan oraliq papkani o'chirish (zip va report.json qoladi)
  if (clean && extracted && extracted.startsWith(srcDir) && extracted !== srcDir) {
    rmSync(extracted, { recursive: true, force: true })
    console.log(`[✓] oraliq papka o'chirildi: ${extracted}`)
  }
}
