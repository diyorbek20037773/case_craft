#!/usr/bin/env node
// UV dilation (padding): Meshy tekstura atlasida UV orolchalar orasida padding yo'q (qora bo'shliq) — mipmap darajalarida
// qo'shni orolcha rangi chok bo'ylab oqib, qorong'i kiyimda mis/oq chiziq beradi. Bu skript har teksturani orolchalardan
// tashqariga "yoyadi": avval R px (standart 16) halqa-halqa qo'shni o'rtacha, keyin qolgan bo'shliq push-pull bilan
// silliq to'ldiriladi. Shundan keyin frontda generateMipmaps=true qaytarish mumkin.
//
//   node dilate.mjs <glb> [<glb> ...] [--radius 16] [--embedded] [--source <glb|zip|papka>] [--q 88] [--no-manifest]
//   node dilate.mjs ../../public/models/meshy/sudya.glb ../../public/models/meshy/sudya-mobile.glb
//
// Qorong'i kiyim tozalash (cloth.mjs, CLOTH_ROLES dagi rollar — sudya, prokuror): mato texellarida roughness ~0.92, metal 0,
// normal og'ishi 0.45, baseColor xromasi mato rangiga + mayda nuqtalar olib tashlanadi. Teri/soch/yoqa/nishon tegilmaydi.
// O'chirish: --no-cloth. Qo'shimcha rol: --cloth <rol>[,<rol>] (maxLum 60).
//
// Manba (eng yaxshi sifat): materials/3d/meshy/<rol>/ dagi asl Meshy GLB (zip bo'lsa faqat *Merged_Animations.glb vaqtincha
// ochiladi). Asl tekstura asl o'lchamda niqob alfa sifatida qo'shilib premultiplied lanczos3 bilan kichraytiriladi (qora
// bo'shliq chetga oqmaydi), so'ng nishon o'lchamida (2048/1024) dilation. --embedded: GLB ning o'zidagi WebP ishlatiladi.
// Faqat tekstura rasmlari almashadi: geometriya, skelet, kliplar, morphlar, meshopt (EXT_meshopt_compression, QUANTIZE =
// process.mjs dagi level 'medium') o'zgarmaydi — yozilgandan keyin barcha accessorlar asl bilan solishtiriladi.
// Asl fayl birinchi marta materials/3d/meshy/_backup/<fayl> ga nusxalanadi (keyingi ishga tushirishlar uni ustidan yozmaydi).
// WebP sifati process.mjs dagidek: noutbuk q88 / telefon (-mobile) q82, normal xarita +6 (max 95), effort 5, smartSubsample.
//
// process.mjs bilan: `--dilate` bayrog'i shu moduldagi padTexture() ni resize/WebP dan oldin chaqiradi.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer'
import sharp from 'sharp'
import { applyCloth, CLOTH_ROLES, clothWeights } from './cloth.mjs'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const WEB = resolve(HERE, '..', '..')
const REPO = resolve(WEB, '..')
const MATERIALS = join(REPO, 'materials', '3d', 'meshy')
const BACKUP = join(MATERIALS, '_backup')
const PUBLIC = join(WEB, 'public', 'models', 'meshy')

// ---------------------------------------------------------------------------------------------------------------------
// Yadro (process.mjs ham ishlatadi)
// ---------------------------------------------------------------------------------------------------------------------

const SLOTS = [
  ['baseColor', (m) => m.getBaseColorTexture(), (m) => m.getBaseColorTextureInfo()],
  ['normal', (m) => m.getNormalTexture(), (m) => m.getNormalTextureInfo()],
  ['metallicRoughness', (m) => m.getMetallicRoughnessTexture(), (m) => m.getMetallicRoughnessTextureInfo()],
  ['occlusion', (m) => m.getOcclusionTexture(), (m) => m.getOcclusionTextureInfo()],
  ['emissive', (m) => m.getEmissiveTexture(), (m) => m.getEmissiveTextureInfo()],
]

/** Tekstura -> [{ material, slot, texCoord }] */
export function textureUses(root, tex) {
  const out = []
  for (const m of root.listMaterials())
    for (const [slot, get, info] of SLOTS) if (get(m) === tex) out.push({ material: m, slot, texCoord: info(m)?.getTexCoord() ?? 0 })
  return out
}

/** Teksturani ishlatadigan barcha materiallarning barcha primitivlari (bitta niqob uchun) */
export function primitivesFor(root, tex) {
  const uses = textureUses(root, tex)
  const out = []
  for (const mesh of root.listMeshes())
    for (const p of mesh.listPrimitives()) {
      const u = uses.find((x) => x.material === p.getMaterial())
      if (u) out.push({ prim: p, texCoord: u.texCoord })
    }
  return out
}

/** UV accessor -> Float32 [u,v,...] (normalized butun sonlarni 0..1 ga) */
function uvArray(acc) {
  const a = acc.getArray()
  if (!acc.getNormalized() || a instanceof Float32Array) return a
  const max = a instanceof Uint16Array ? 65535 : a instanceof Uint8Array ? 255 : a instanceof Int16Array ? 32767 : 127
  const f = new Float32Array(a.length)
  for (let i = 0; i < a.length; i++) f[i] = Math.max(a[i] / max, -1)
  return f
}

/**
 * UV-qamrov niqobi: TEXCOORD_n uchburchaklari w x h rastrga (piksel markazi uchburchak ichida -> 255).
 * glTF da UV (0,0) — rasmning yuqori chap burchagi, shuning uchun y = v * h. REPEAT: [0,1] dan tashqari UV o'raladi.
 */
export function uvMask(prims, w, h) {
  const mask = new Uint8Array(w * h)
  for (const { prim, texCoord } of prims) {
    if (prim.getMode() !== 4) continue // faqat TRIANGLES
    const acc = prim.getAttribute(`TEXCOORD_${texCoord}`)
    if (!acc) continue
    const uv = uvArray(acc)
    const idx = prim.getIndices()?.getArray()
    const n = idx ? idx.length : uv.length / 2
    for (let t = 0; t + 2 < n; t += 3) {
      const i0 = idx ? idx[t] : t
      const i1 = idx ? idx[t + 1] : t + 1
      const i2 = idx ? idx[t + 2] : t + 2
      let x0 = uv[i0 * 2] * w, y0 = uv[i0 * 2 + 1] * h
      let x1 = uv[i1 * 2] * w, y1 = uv[i1 * 2 + 1] * h
      let x2 = uv[i2 * 2] * w, y2 = uv[i2 * 2 + 1] * h
      // butun tile siljishi (REPEAT) — uchburchakni [0,1) ga qaytarish
      const ox = Math.floor(Math.min(x0, x1, x2) / w) * w
      const oy = Math.floor(Math.min(y0, y1, y2) / h) * h
      x0 -= ox; x1 -= ox; x2 -= ox; y0 -= oy; y1 -= oy; y2 -= oy
      rasterTri(mask, w, h, x0, y0, x1, y1, x2, y2)
    }
  }
  return mask
}

function rasterTri(mask, w, h, x0, y0, x1, y1, x2, y2) {
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0)
  if (!area) return
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)))
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1, x2)))
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)))
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1, y2)))
  const s = area > 0 ? 1 : -1
  const eps = -1e-7 * Math.abs(area)
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      const e0 = s * ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1))
      const e1 = s * ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2))
      const e2 = s * ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0))
      if (e0 >= eps && e1 >= eps && e2 >= eps) mask[y * w + x] = 255
    }
  }
}

/**
 * In-place: rgb (Float32, 3 kanal) ning filled=0 piksellarini to'ldiradi.
 * 1) radius halqa: har halqada oldingi halqagacha to'lgan 8 qo'shnining o'rtachasi (chetning rangi aniq davom etadi)
 * 2) qolgani push-pull (piramida: pastga vaznli o'rtacha, yuqoriga bilinear) — butun bo'shliq silliq, qora qolmaydi.
 */
export function dilateRGB(rgb, filled, w, h, radius) {
  const N = w * h
  const stamp = new Int32Array(N) // halqa raqami (frontierda takrorlanmasin)
  let frontier = []
  for (let i = 0; i < N; i++) {
    if (filled[i]) continue
    const x = i % w
    const y = (i / w) | 0
    if (hasFilledNeighbor(filled, w, h, x, y)) {
      frontier.push(i)
      stamp[i] = 1
    }
  }
  const tmp = []
  for (let ring = 1; ring <= radius && frontier.length; ring++) {
    tmp.length = 0
    for (const i of frontier) {
      const x = i % w
      const y = (i / w) | 0
      let r = 0, g = 0, b = 0, c = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if ((!dx && !dy) || xx < 0 || xx >= w) continue
          const j = yy * w + xx
          if (!filled[j]) continue
          // diagonal qo'shni kamroq vaznli (doiraga yaqinroq)
          const k = dx && dy ? 0.7071 : 1
          r += rgb[j * 3] * k; g += rgb[j * 3 + 1] * k; b += rgb[j * 3 + 2] * k; c += k
        }
      }
      tmp.push(i, r / c, g / c, b / c)
    }
    for (let k = 0; k < tmp.length; k += 4) {
      const i = tmp[k]
      rgb[i * 3] = tmp[k + 1]; rgb[i * 3 + 1] = tmp[k + 2]; rgb[i * 3 + 2] = tmp[k + 3]
      filled[i] = 1
    }
    const next = []
    for (const i of frontier) {
      const x = i % w
      const y = (i / w) | 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          const j = yy * w + xx
          if (!filled[j] && stamp[j] !== ring + 1) {
            stamp[j] = ring + 1
            next.push(j)
          }
        }
      }
    }
    frontier = next
  }
  pushPull(rgb, filled, w, h)
}

function hasFilledNeighbor(filled, w, h, x, y) {
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy
    if (yy < 0 || yy >= h) continue
    for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx
      if (xx >= 0 && xx < w && filled[yy * w + xx]) return true
    }
  }
  return false
}

function pushPull(rgb, filled, w, h) {
  // daraja: { w, h, c: Float32 (3 kanal, normallangan rang), a: Float32 (vazn 0..1) }
  const a0 = new Float32Array(w * h)
  let any = false
  let holes = false
  for (let i = 0; i < a0.length; i++) {
    a0[i] = filled[i] ? 1 : 0
    any ||= !!filled[i]
    holes ||= !filled[i]
  }
  if (!any || !holes) return
  const levels = [{ w, h, c: rgb, a: a0 }]
  while (levels.at(-1).w > 1 || levels.at(-1).h > 1) {
    const L = levels.at(-1)
    const W = Math.max(1, Math.ceil(L.w / 2))
    const H = Math.max(1, Math.ceil(L.h / 2))
    const c = new Float32Array(W * H * 3)
    const a = new Float32Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, s = 0
        for (let dy = 0; dy < 2; dy++) {
          const yy = 2 * y + dy
          if (yy >= L.h) continue
          for (let dx = 0; dx < 2; dx++) {
            const xx = 2 * x + dx
            if (xx >= L.w) continue
            const j = yy * L.w + xx
            const wj = L.a[j]
            if (!wj) continue
            r += L.c[j * 3] * wj; g += L.c[j * 3 + 1] * wj; b += L.c[j * 3 + 2] * wj; s += wj
          }
        }
        const i = y * W + x
        if (s > 0) {
          c[i * 3] = r / s; c[i * 3 + 1] = g / s; c[i * 3 + 2] = b / s
        }
        a[i] = Math.min(1, s)
      }
    levels.push({ w: W, h: H, c, a })
  }
  // yuqoriga: vazni <1 bo'lgan piksel dag'alroq darajadan bilinear qiymat oladi
  for (let l = levels.length - 2; l >= 0; l--) {
    const F = levels[l]
    const C = levels[l + 1]
    for (let y = 0; y < F.h; y++) {
      const cy = Math.min(C.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5))
      const y0 = Math.floor(cy)
      const y1 = Math.min(C.h - 1, y0 + 1)
      const fy = cy - y0
      for (let x = 0; x < F.w; x++) {
        const i = y * F.w + x
        const wf = F.a[i]
        if (wf >= 1) continue
        const cx = Math.min(C.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5))
        const x0 = Math.floor(cx)
        const x1 = Math.min(C.w - 1, x0 + 1)
        const fx = cx - x0
        for (let k = 0; k < 3; k++) {
          const v =
            (C.c[(y0 * C.w + x0) * 3 + k] * (1 - fx) + C.c[(y0 * C.w + x1) * 3 + k] * fx) * (1 - fy) +
            (C.c[(y1 * C.w + x0) * 3 + k] * (1 - fx) + C.c[(y1 * C.w + x1) * 3 + k] * fx) * fy
          F.c[i * 3 + k] = wf * F.c[i * 3 + k] + (1 - wf) * v
        }
        F.a[i] = 1
      }
    }
  }
}

/**
 * Asl rasm + niqob (asl o'lchamda) -> nishon o'lchamida paddingli RGB.
 * Kichraytirish ikki xil:
 *  - orolcha ichi (chetdan LANCZOS_R px uzoq): lanczos3 — process.mjs dagi bilan bir xil tiniqlik;
 *  - chet bandi: niqobli box o'rtacha (faqat qamrovdagi asl piksellar) — bo'shliq qorasi/Meshy chiziqlari chetga
 *    oqmaydi va lanczos "ringing" i (premultiplied alfa bilan chegarada och nuqtali chiziq beradi) yo'q.
 * Manba piksel = box qamrovi >= 50%. Qolgani dilateRGB bilan to'ldiriladi.
 * Natija: { raw: Buffer (RGB uint8, tw*th*3), coverage: 0..1 (nishon o'lchamidagi manba piksellar ulushi) }
 */
const LANCZOS_R = 3

/** 1 o'lchamli eroziya (dx=1: gorizontal, dy=1: vertikal): natija 1 faqat [-r, r] oralig'ida hammasi 1 bo'lsa */
function erode(src, w, h, r, dx, dy) {
  const out = new Uint8Array(w * h)
  const len = dx ? w : h
  const lines = dx ? h : w
  const pre = new Int32Array(len + 1)
  for (let l = 0; l < lines; l++) {
    const at = (k) => (dx ? l * w + k : k * w + l)
    for (let k = 0; k < len; k++) pre[k + 1] = pre[k] + src[at(k)]
    for (let k = 0; k < len; k++) {
      const a = Math.max(0, k - r)
      const b = Math.min(len, k + r + 1)
      if (pre[b] - pre[a] === b - a) out[at(k)] = 1
    }
  }
  return out
}
export async function padTexture(srcImage, srcMask, tw, th, { radius = 16, transform = null } = {}) {
  const meta = await sharp(Buffer.from(srcImage)).metadata()
  const sw = meta.width
  const sh = meta.height
  const rgb = await sharp(Buffer.from(srcImage)).removeAlpha().toColourspace('srgb').raw().toBuffer()
  if (rgb.length !== sw * sh * 3) throw new Error(`kutilmagan raw o'lcham: ${rgb.length} != ${sw}x${sh}x3`)
  if (transform) transform(rgb, sw, sh) // masalan cloth.mjs: qorong'i kiyim tozalash (asl o'lchamda, kichraytirishdan oldin)
  const same = sw === tw && sh === th
  const lanczos = same
    ? rgb
    : await sharp(rgb, { raw: { width: sw, height: sh, channels: 3 } }).resize(tw, th, { fit: 'fill', kernel: 'lanczos3' }).raw().toBuffer()
  const N = tw * th
  const out = new Float32Array(N * 3)
  const cov = new Float32Array(N)
  // niqobli box (premultiplied) o'rtacha
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor((y * sh) / th)
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / th))
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x * sw) / tw)
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / tw))
      let r = 0, g = 0, b = 0, c = 0
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const j = yy * sw + xx
          if (!srcMask[j]) continue
          r += rgb[j * 3]; g += rgb[j * 3 + 1]; b += rgb[j * 3 + 2]; c++
        }
      const i = y * tw + x
      cov[i] = c / ((y1 - y0) * (x1 - x0))
      if (c) {
        out[i * 3] = r / c; out[i * 3 + 1] = g / c; out[i * 3 + 2] = b / c
      }
    }
  }
  // to'liq qamrovli va LANCZOS_R radiusda ham to'liq qamrovli piksellar -> lanczos qiymati
  const full = new Uint8Array(N)
  for (let i = 0; i < N; i++) full[i] = cov[i] >= 1 ? 1 : 0
  const interior = erode(erode(full, tw, th, LANCZOS_R, 1, 0), tw, th, LANCZOS_R, 0, 1)
  const filled = new Uint8Array(N)
  let count = 0
  for (let i = 0; i < N; i++) {
    if (interior[i]) {
      out[i * 3] = lanczos[i * 3]; out[i * 3 + 1] = lanczos[i * 3 + 1]; out[i * 3 + 2] = lanczos[i * 3 + 2]
    }
    if (cov[i] >= 0.5) {
      filled[i] = 1
      count++
    }
  }
  dilateRGB(out, filled, tw, th, radius)
  const raw = Buffer.alloc(N * 3)
  for (let i = 0; i < N * 3; i++) raw[i] = Math.max(0, Math.min(255, Math.round(out[i])))
  return { raw, coverage: count / N }
}

export const webpOptions = (isNormal, q) => ({ quality: isNormal ? Math.min(95, q + 6) : q, effort: 5, smartSubsample: true })

// ---------------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------------

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

/** Rol uchun asl Meshy GLB: papkadagi Rigged/Merged GLB yoki zip dan faqat *Merged_Animations.glb (vaqtincha). */
function locateSource(spec, role) {
  let p = spec ? resolve(spec) : join(MATERIALS, role)
  if (!existsSync(p)) return null
  if (statSync(p).isFile() && extname(p).toLowerCase() === '.glb') return { file: p, cleanup: null }
  if (statSync(p).isDirectory()) {
    const glbs = findGlbs(p)
    const pick = glbs.find((g) => /merged_animations/i.test(g)) ?? glbs.find((g) => /rigged/i.test(g)) ?? glbs[0]
    if (pick) return { file: pick, cleanup: null }
    const zip = readdirSync(p).find((f) => /\.zip$/i.test(f))
    if (!zip) return null
    p = join(p, zip)
  }
  if (extname(p).toLowerCase() !== '.zip') return null
  const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : null
  const list = (tar ? execFileSync(tar, ['-tf', p], { encoding: 'utf8' }) : execFileSync('unzip', ['-Z1', p], { encoding: 'utf8' }))
    .split(/\r?\n/)
    .filter(Boolean)
  const member = list.find((m) => /Merged_Animations\.glb$/i.test(m)) ?? list.find((m) => /rigged.*\.glb$/i.test(m)) ?? list.find((m) => /\.glb$/i.test(m))
  if (!member) return null
  const dir = join(tmpdir(), `meshy-dilate-${role}-${process.pid}`)
  mkdirSync(dir, { recursive: true })
  console.log(`  zip dan ochilmoqda: ${member}`)
  if (tar) execFileSync(tar, ['-xf', p, '-C', dir, member], { stdio: 'inherit' })
  else execFileSync('unzip', ['-o', '-q', p, member, '-d', dir], { stdio: 'inherit' })
  return { file: join(dir, member), cleanup: dir }
}

/** Ikki GLB ning geometriya/animatsiya/skelet ma'lumotlari bir xilmi (rasmlardan tashqari) */
function compareDocs(a, b) {
  const ra = a.getRoot()
  const rb = b.getRoot()
  const diffs = []
  const accA = ra.listAccessors()
  const accB = rb.listAccessors()
  if (accA.length !== accB.length) diffs.push(`accessor soni ${accA.length} != ${accB.length}`)
  for (let i = 0; i < Math.min(accA.length, accB.length); i++) {
    const x = accA[i].getArray()
    const y = accB[i].getArray()
    if (x.length !== y.length || x.constructor !== y.constructor || accA[i].getNormalized() !== accB[i].getNormalized()) {
      diffs.push(`accessor ${i} turi/uzunligi farq`)
      continue
    }
    for (let k = 0; k < x.length; k++)
      if (x[k] !== y[k] && !(Number.isNaN(x[k]) && Number.isNaN(y[k]))) {
        diffs.push(`accessor ${i} [${k}] ${x[k]} != ${y[k]}`)
        break
      }
  }
  const sig = (r) => ({
      anims: r.listAnimations().map((an) => [an.getName(), an.listChannels().length, an.listSamplers().map((s) => s.getInterpolation()).join('')]),
      joints: r.listSkins().map((s) => s.listJoints().map((j) => j.getName())),
      nodes: r.listNodes().map((n) => [n.getName(), n.getTranslation(), n.getRotation(), n.getScale(), n.listChildren().length]),
      meshes: r.listMeshes().map((m) => [m.getName(), m.getWeights(), m.listPrimitives().map((p) => [p.listSemantics(), p.listTargets().length, p.getMode()])]),
      materials: r.listMaterials().map((m) => [m.getName(), m.getBaseColorFactor(), m.getMetallicFactor(), m.getRoughnessFactor(), m.getAlphaMode()]),
      textures: r.listTextures().map((t) => [t.getName(), t.getMimeType()]), // URI: GLB yozuvchisi ichki nom beradi (baseColor_1.webp) — ahamiyatsiz
      ext: r.listExtensionsUsed().map((e) => `${e.extensionName}:${e.isRequired()}`),
  })
  const sa = sig(ra)
  const sb = sig(rb)
  for (const k of Object.keys(sa)) {
    const x = JSON.stringify(sa[k])
    const y = JSON.stringify(sb[k])
    if (x !== y) diffs.push(`${k} farq: ${x.slice(0, 300)} != ${y.slice(0, 300)}`)
  }
  return diffs
}

/** Windows: dev server / antivirus faylni ushlab tursa rename EPERM beradi — nusxalash (bir necha urinish) */
function replaceFile(tmp, file) {
  let err = null
  for (let i = 0; i < 5; i++) {
    try {
      renameSync(tmp, file)
      return
    } catch (e) {
      err = e
      try {
        copyFileSync(tmp, file)
        rmSync(tmp, { force: true })
        return
      } catch (e2) {
        err = e2
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
      }
    }
  }
  throw err
}

function updateManifest(files) {
  const mf = join(PUBLIC, 'manifest.json')
  if (!existsSync(mf)) return
  const m = JSON.parse(readFileSync(mf, 'utf8'))
  const mb = (f) => +(statSync(f).size / 1048576).toFixed(2)
  let changed = false
  for (const f of files) {
    if (dirname(resolve(f)) !== PUBLIC) continue
    const mobile = /-mobile\.glb$/i.test(f)
    const role = basename(f).replace(/(-mobile)?\.glb$/i, '')
    const c = m.characters?.[role]
    if (!c) continue
    c[mobile ? 'mobileMb' : 'mb'] = mb(f)
    changed = true
  }
  if (!changed) return
  const sum = (xs) => +xs.reduce((s, x) => s + (x ?? 0), 0).toFixed(2)
  const T = m.totalsMb
  if (T?.desktop && T?.mobile) {
    T.desktop.characters = sum(Object.values(m.characters).map((c) => c.mb))
    T.mobile.characters = sum(Object.values(m.characters).map((c) => c.mobileMb))
    T.desktop.all = sum([T.desktop.characters, T.desktop.props, T.desktop.zalTextures])
    T.mobile.all = sum([T.mobile.characters, T.mobile.props, T.mobile.zalTextures])
  }
  m.texturePadding = 'personaj teksturalari UV dilation bilan (scripts/meshy/dilate.mjs) — generateMipmaps xavfsiz'
  writeFileSync(mf, JSON.stringify(m, null, 2) + '\n')
  console.log(`manifest.json yangilandi (characters: ${T?.desktop?.characters} / ${T?.mobile?.characters} MB)`)
}

async function main() {
  const args = process.argv.slice(2)
  const flag = (n) => {
    const i = args.indexOf(n)
    if (i < 0) return null
    const v = args[i + 1]
    args.splice(i, 2)
    return v
  }
  const bool = (n) => {
    const i = args.indexOf(n)
    if (i < 0) return false
    args.splice(i, 1)
    return true
  }
  const radius = Number(flag('--radius') ?? 16)
  const sourceSpec = flag('--source')
  const qArg = flag('--q')
  const embedded = bool('--embedded')
  const noManifest = bool('--no-manifest')
  const noCloth = bool('--no-cloth')
  const clothExtra = flag('--cloth')
  const clothRoles = noCloth ? {} : { ...CLOTH_ROLES }
  if (clothExtra && !noCloth) for (const r of clothExtra.split(',')) clothRoles[r.trim()] ??= { maxLum: 60 }
  const files = args.map((f) => resolve(f))
  if (!files.length) {
    console.error('node dilate.mjs <glb> [<glb> ...] [--radius 16] [--embedded] [--source <glb|zip|papka>] [--q 88] [--no-manifest]')
    process.exit(1)
  }
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready])
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder })

  const sources = new Map() // rol -> { doc, cleanup } (desktop va mobile bir manbadan)
  const results = []
  try {
    for (const file of files) {
      if (!existsSync(file)) throw new Error(`Topilmadi: ${file}`)
      const role = basename(file).replace(/(-mobile)?\.glb$/i, '')
      const mobile = /-mobile\.glb$/i.test(file)
      const q = Number(qArg ?? (mobile ? 82 : 88))
      const t0 = Date.now()
      console.log(`\n== ${basename(file)} (rol ${role}, q${q}, radius ${radius}px)`)

      // 1) zaxira (asl holat; mavjud bo'lsa ustidan yozilmaydi)
      mkdirSync(BACKUP, { recursive: true })
      const backup = join(BACKUP, basename(file))
      if (!existsSync(backup)) {
        copyFileSync(file, backup)
        console.log(`  zaxira: ${backup}`)
      } else console.log(`  zaxira bor (asl): ${backup}`)
      const sizeBefore = statSync(backup).size // asl (zaxiradagi) hajm

      // 2) o'qish — har doim zaxiradagi asl fayldan (qayta ishga tushirish dilation ustiga dilation qilmasin)
      const doc = await io.read(backup)
      const root = doc.getRoot()
      if (root.listExtensionsUsed().some((e) => e.extensionName === 'KHR_texture_transform'))
        console.warn('  ! KHR_texture_transform bor — niqob uni hisobga olmaydi')

      // 3) manba
      let src = null
      if (!embedded) {
        if (!sources.has(role)) {
          const loc = locateSource(sourceSpec, role)
          if (loc) {
            console.log(`  manba: ${loc.file}`)
            sources.set(role, { doc: await io.read(loc.file), cleanup: loc.cleanup })
          } else {
            console.warn(`  ! asl manba topilmadi — GLB ning o'z teksturasi ishlatiladi (--embedded)`)
            sources.set(role, null)
          }
        }
        src = sources.get(role)
      }

      // 4) har tekstura
      const texRows = []
      const clothCfg = clothRoles[role]
      const clothCache = new Map() // material nomi -> clothWeights natijasi (asl baseColor dan)
      if (clothCfg && !src) console.warn(`  ! cloth: asl manba yo'q — embedded tekstura ustida ishlaydi`)
      for (const tex of root.listTextures()) {
        const uses = textureUses(root, tex)
        if (!uses.length || !tex.getImage()) continue
        const isNormal = uses.some((u) => u.slot === 'normal')
        const meta = await sharp(Buffer.from(tex.getImage())).metadata()
        let srcImage = tex.getImage()
        let srcPrims = primitivesFor(root, tex)
        let from = 'embedded'
        if (src) {
          const sr = src.doc.getRoot()
          // mos tekstura: shu material nomi + shu slot; bo'lmasa nom bo'yicha
          let st = null
          for (const u of uses) {
            const sm = sr.listMaterials().find((m) => m.getName() === u.material.getName())
            const get = SLOTS.find(([s]) => s === u.slot)[1]
            st = sm && get(sm)
            if (st) break
          }
          st ??= sr.listTextures().find((t) => t.getName() === tex.getName())
          if (st?.getImage()) {
            srcImage = st.getImage()
            srcPrims = primitivesFor(sr, st)
            from = 'source'
          } else console.warn(`  ! ${tex.getName()}: manbada mos tekstura yo'q — embedded`)
        }
        const sMeta = await sharp(Buffer.from(srcImage)).metadata()
        const mask = uvMask(srcPrims, sMeta.width, sMeta.height)
        let srcCov = 0
        for (let i = 0; i < mask.length; i++) if (mask[i]) srcCov++
        // qorong'i kiyim tozalash: vaznlar shu materialning (manbadagi) baseColor idan, shu o'lchamda
        let transform = null
        let clothInfo = ''
        const slot = uses[0].slot
        if (clothCfg && ['baseColor', 'metallicRoughness', 'normal'].includes(slot)) {
          const mat = uses[0].material
          const sr = src ? src.doc.getRoot() : root
          const sm = sr.listMaterials().find((m) => m.getName() === mat.getName()) ?? mat
          const bcTex = sm.getBaseColorTexture()
          const key = `${sm.getName()}@${sMeta.width}`
          if (bcTex?.getImage() && !clothCache.has(key)) {
            const bm = await sharp(Buffer.from(bcTex.getImage())).metadata()
            if (bm.width === sMeta.width && bm.height === sMeta.height) {
              const bcRaw = await sharp(Buffer.from(bcTex.getImage())).removeAlpha().toColourspace('srgb').raw().toBuffer()
              const bcMask = uvMask(primitivesFor(sr, bcTex), bm.width, bm.height)
              const cw = clothWeights(bcRaw, bcMask, bm.width, bm.height, clothCfg)
              clothCache.set(key, cw)
              if (cw) console.log(`  cloth: mato rangi rgb(${cw.color.map((v) => v.toFixed(0)).join(',')}), mato ${cw.pct}% atlas`)
            } else clothCache.set(key, null)
          }
          const cw = clothCache.get(key)
          if (cw) {
            transform = (rgb) => {
              const n = applyCloth(slot, rgb, cw)
              clothInfo = ` cloth ${slot}: ${((n / cw.wide.length) * 100).toFixed(1)}% texel`
            }
          }
        }
        const { raw, coverage } = await padTexture(srcImage, mask, meta.width, meta.height, { radius, transform })
        const before = tex.getImage().byteLength
        const webp = await sharp(raw, { raw: { width: meta.width, height: meta.height, channels: 3 } })
          .webp(webpOptions(isNormal, q))
          .toBuffer()
        tex.setImage(new Uint8Array(webp)).setMimeType('image/webp')
        const row = {
          texture: tex.getName(),
          slots: uses.map((u) => u.slot).join('+'),
          from,
          srcPx: `${sMeta.width}x${sMeta.height}`,
          px: `${meta.width}x${meta.height}`,
          maskCoveragePct: +((srcCov / mask.length) * 100).toFixed(1),
          targetCoveragePct: +(coverage * 100).toFixed(1),
          kbBefore: +(before / 1024).toFixed(0),
          kbAfter: +(webp.length / 1024).toFixed(0),
        }
        texRows.push(row)
        console.log(`  ${row.texture} [${row.slots}] ${row.from} ${row.srcPx}->${row.px} qamrov ${row.maskCoveragePct}% (nishon ${row.targetCoveragePct}%), ${row.kbBefore} -> ${row.kbAfter} KB${clothInfo}`)
      }

      // 5) yozish: vaqtinchalik fayl -> tekshiruv -> asl o'rniga
      const tmp = `${file}.dilate-tmp`
      writeFileSync(tmp, await io.writeBinary(doc)) // writeBinary: kengaytmadan qat'iy nazar GLB (io.write .tmp ni glTF+bin deb yozadi)
      if (readFileSync(tmp).subarray(0, 4).toString('latin1') !== 'glTF') throw new Error(`${tmp}: GLB emas (magic)`)
      const diffs = compareDocs(await io.read(backup), await io.readBinary(new Uint8Array(readFileSync(tmp))))
      if (diffs.length) {
        rmSync(tmp, { force: true })
        throw new Error(`${basename(file)}: tekstura bo'lmagan ma'lumot o'zgardi, yozilmadi:\n  ${diffs.slice(0, 8).join('\n  ')}`)
      }
      replaceFile(tmp, file)
      const sizeAfter = statSync(file).size
      const r = { file: basename(file), mbBefore: +(sizeBefore / 1048576).toFixed(2), mbAfter: +(sizeAfter / 1048576).toFixed(2), textures: texRows, sec: +((Date.now() - t0) / 1000).toFixed(1) }
      results.push(r)
      console.log(`  ✓ ${r.mbBefore} -> ${r.mbAfter} MB, geometriya/kliplar/skelet bir xil (accessorlar solishtirildi), ${r.sec}s`)
    }
  } finally {
    for (const s of sources.values()) if (s?.cleanup) rmSync(s.cleanup, { recursive: true, force: true })
  }
  if (!noManifest) updateManifest(files)
  console.log('\nNATIJA ' + JSON.stringify(results))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main()
