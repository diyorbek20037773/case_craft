#!/usr/bin/env node
// Guvoh sahnasi zali uchun Poly Haven (CC0) PBR teksturalarini yuklab, WebP ga o'tkazadi.
// Ishlatish: node zal-textures.mjs  -> web/public/models/meshy/zal/*.webp (+ CREDITS.md)
// Har tekstura: 2k (noutbuk) va 1k (telefon, "-m" qo'shimchali) variant.
import sharp from 'sharp'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'models', 'meshy', 'zal')
mkdirSync(OUT, { recursive: true })

// [poly haven id, qisqa nom, kerakli xaritalar]
const SETS = [
  ['dark_wood', 'walnut', ['Diffuse', 'nor_gl', 'Rough']],
  ['herringbone_parquet', 'parquet', ['Diffuse', 'nor_gl', 'Rough']],
  ['beige_wall_001', 'plaster', ['Diffuse', 'nor_gl', 'Rough']],
  ['marble_01', 'marble', ['Diffuse', 'Rough']],
]
const SHORT = { Diffuse: 'diff', nor_gl: 'nor', Rough: 'rough' }

const credits = ['# Zal teksturalari (Poly Haven, CC0)', '', 'Yuklash: `node web/scripts/meshy/zal-textures.mjs`', '']
for (const [id, name, maps] of SETS) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()
  for (const m of maps) {
    const url = files[m]?.['2k']?.jpg?.url
    if (!url) throw new Error(`${id}: ${m} 2k topilmadi`)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    const q = m === 'nor_gl' ? 90 : 82
    await sharp(buf).webp({ quality: q }).toFile(join(OUT, `${name}_${SHORT[m]}.webp`))
    await sharp(buf).resize(1024, 1024).webp({ quality: q - 4 }).toFile(join(OUT, `${name}_${SHORT[m]}-m.webp`))
    console.log(`${name}_${SHORT[m]} <- ${url}`)
  }
  credits.push(`- ${name}_*.webp — ${id} — https://polyhaven.com/a/${id}`)
}
writeFileSync(join(OUT, 'CREDITS.md'), credits.join('\n') + '\n')
console.log('Tayyor:', OUT)
