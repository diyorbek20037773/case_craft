// Qog‘oz varaqlash va muqova ochilish tovushi — WebAudio sintez (fayl yo‘q).
// Umumiy AudioContext va master (ui/audio.ts → sfxOut) orqali: ovoz o‘chiq bo‘lsa hech narsa yaratilmaydi,
// alohida (ikkinchi) AudioContext ham ochilmaydi.
import { sfxOut } from '../audio'

let rustle: AudioBuffer | null = null

/** Qog‘oz shitirlashi: shovqin, tez hujum, notekis "chirsillash" */
function rustleBuffer(c: BaseAudioContext) {
  if (rustle && rustle.sampleRate === c.sampleRate) return rustle
  const dur = 0.46
  const len = Math.floor(c.sampleRate * dur)
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let crackle = 0
  for (let i = 0; i < len; i++) {
    const t = i / c.sampleRate
    const env = t < 0.05 ? t / 0.05 : Math.exp(-(t - 0.05) * 6.5)
    if (Math.random() < 0.004) crackle = 1
    crackle *= 0.995
    const wobble = 0.6 + 0.4 * Math.sin(t * 70 + Math.sin(t * 19) * 4)
    d[i] = (Math.random() * 2 - 1) * env * (wobble + crackle * 0.8)
  }
  rustle = buf
  return buf
}

let lastFlipAt = -1e9

export function playPageFlip(gain = 0.16) {
  // tez-tez bosilganda (yoki klaviatura takrori) tovushlar ustma-ust yig‘ilib qolmasin
  const now = performance.now()
  if (now - lastFlipAt < 90) return
  lastFlipAt = now
  const o = sfxOut()
  if (!o) return
  const { c, out, done } = o
  const t0 = c.currentTime
  const src = c.createBufferSource()
  src.buffer = rustleBuffer(c)
  src.playbackRate.value = 0.85 + Math.random() * 0.3
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 900
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(7000, t0)
  lp.frequency.exponentialRampToValueAtTime(2600, t0 + 0.4)
  const g = c.createGain()
  g.gain.value = gain
  src.connect(hp).connect(lp).connect(g).connect(out)
  done(src, [hp, lp, g])
  src.start(t0)
}

/** Muqova ochilishi: past "tup" + yumshoq shitirlash */
export function playCoverOpen() {
  const o = sfxOut()
  if (!o) return
  const { c, out, done } = o
  const t0 = c.currentTime
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(120, t0)
  osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.25)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3)
  osc.connect(g).connect(out)
  done(osc, [g])
  osc.start(t0)
  osc.stop(t0 + 0.35)
  playPageFlip(0.1)
}
