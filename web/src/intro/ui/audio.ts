// Yengil UI tovushlari (WebAudio sintez, fayl yo‘q) + ixtiyoriy fon musiqasi /intro/music.mp3.
// Standart holatda hammasi o‘chiq; faqat foydalanuvchi "Ovoz" tugmasini bosgandan keyin yangraydi.
//
// Darajalar (master 0.9 dan oldin, chiqishda ×0.9):
//   generativ partitura  RMS ≈ −24 dBFS, peak ≈ 0.28 (music/README.md "Daraja")
//   zal tovushi          pushti shovqin (RMS 1) × 0.012, 200–800 Hz → ≈ −46 dBFS RMS
//   UI SFX               cho‘qqi 0.012 (tick) … 0.12 (muhr zarbi)

import { getState } from '../state'
import { startScore, type Score, type ScoreLayers } from './music/generativeScore'

const MUSIC_URL = '/intro/music.mp3'
const MUSIC_VOLUME = 0.32
/** 'launch': musiqa shuncha soniyada to‘liq jim bo‘ladi (kotib subtitri 0.6 s da chiqadi) */
const LAUNCH_FADE = 0.4

type MusicState = 'unknown' | 'checking' | 'available' | 'missing'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null
let pinkBuf: AudioBuffer | null = null
let enabled = false

let musicState: MusicState = 'unknown'
let musicEl: HTMLAudioElement | null = null
let musicGain: GainNode | null = null
let musicStopTimer = 0
let lastTick = 0
// music.mp3 bo'lmasa — o'zimiz yaratgan generativ musiqa (ui/music)
let score: Score | null = null
let scorePhase = 'title'

/**
 * Yagona AudioContext (butun kirish sahifasi uchun — ish papkasining qog‘oz tovushlari ham shu yerdan).
 * Faqat ovoz yoqilgandan keyin chaqiriladi (setSoundEnabled — foydalanuvchi bosgan tugma ichida).
 */
function ensureCtx(): AudioContext | null {
  if (!ctx) {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch {
      return null
    }
    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(ctx.destination)
  }
  // 'suspended' (autoplay) yoki iOS 'interrupted' — qayta uyg‘otamiz
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
  return ctx
}

/** Bir martalik manba tugagach butun zanjirni uzish (osc/buffer source → filtr/gain → panner) */
function disconnectOnEnd(src: AudioScheduledSourceNode, chain: (AudioNode | null)[]) {
  src.onended = () => {
    src.disconnect()
    for (const n of chain) {
      // master'ni hech qachon uzmaymiz
      if (n && n !== master) n.disconnect()
    }
  }
}

/**
 * Ish papkasining qog‘oz tovushlari (case/paperSound.ts) uchun: ovoz yoqilgan bo‘lsa — umumiy context va master.
 * O‘chiq bo‘lsa null (alohida AudioContext yaratilmaydi).
 */
export function sfxOut(): { c: AudioContext; out: AudioNode; done: typeof disconnectOnEnd } | null {
  if (!enabled) return null
  const c = ensureCtx()
  if (!c || !master) return null
  return { c, out: master, done: disconnectOnEnd }
}

const clampPan = (p: number) => (Number.isFinite(p) ? Math.max(-1, Math.min(1, p)) : 0)

/** pan ≠ 0 bo‘lsa StereoPanner orqali, aks holda to‘g‘ridan-to‘g‘ri master'ga */
function outFor(c: AudioContext, pan: number): AudioNode | null {
  if (!master) return null
  const p = clampPan(pan)
  if (p === 0 || typeof c.createStereoPanner !== 'function') return master
  const sp = c.createStereoPanner()
  sp.pan.value = p
  sp.connect(master)
  return sp
}

type ToneOpts = {
  type?: OscillatorType
  gain?: number
  freqEnd?: number
  delay?: number
  attack?: number
  /** shu soniyagacha cho‘qqining ~70% ida ushlab turadi, keyin so‘nadi (sekin motivlar uchun) */
  hold?: number
  /** sent (cents) bo‘yicha surish */
  detune?: number
  pan?: number
}

type Voice = { osc: OscillatorNode; g: GainNode }

function tone(freq: number, dur: number, o: ToneOpts = {}): Voice | null {
  const c = ensureCtx()
  if (!c || !master) return null
  const out = outFor(c, o.pan ?? 0)
  if (!out) return null
  const t0 = c.currentTime + (o.delay ?? 0)
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t0)
  if (o.detune) osc.detune.setValueAtTime(o.detune, t0)
  if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(o.freqEnd, t0 + dur)
  const peak = o.gain ?? 0.04
  const atk = o.attack ?? 0.006
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + atk)
  if (o.hold && o.hold > atk && o.hold < dur) g.gain.linearRampToValueAtTime(peak * 0.7, t0 + o.hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(out)
  disconnectOnEnd(osc, [g, out])
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
  return { osc, g }
}

function noise(c: AudioContext) {
  if (!noiseBuf) {
    const len = Math.floor(c.sampleRate * 1.2)
    noiseBuf = c.createBuffer(1, len, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  return src
}

type BurstOpts = {
  filter: BiquadFilterType
  freq: number
  q?: number
  gain: number
  dur: number
  delay?: number
  attack?: number
  pan?: number
}

/** Qisqa filtrlangan shovqin zarbi (muhr, sinish, yozuv mashinkasi) */
function burst(o: BurstOpts) {
  const c = ensureCtx()
  if (!c || !master) return
  const out = outFor(c, o.pan ?? 0)
  if (!out) return
  const t0 = c.currentTime + (o.delay ?? 0)
  const src = noise(c)
  const f = c.createBiquadFilter()
  f.type = o.filter
  f.frequency.value = o.freq
  if (o.q !== undefined) f.Q.value = o.q
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(o.gain, t0 + (o.attack ?? 0.002))
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur)
  src.connect(f).connect(g).connect(out)
  disconnectOnEnd(src, [f, g, out])
  // bufer ichidan tasodifiy joydan — har zarb biroz boshqacha
  const buf = src.buffer
  const offset = buf ? Math.random() * Math.max(0, buf.duration - o.dur - 0.05) : 0
  src.start(t0, offset)
  src.stop(t0 + o.dur + 0.03)
}

function whooshRaw(dur: number, peak: number, from: number, to: number) {
  const c = ensureCtx()
  if (!c || !master) return
  const t0 = c.currentTime
  const src = noise(c)
  const bp = c.createBiquadFilter()
  bp.type = 'bandpass'
  bp.Q.value = 0.9
  bp.frequency.setValueAtTime(from, t0)
  bp.frequency.exponentialRampToValueAtTime(to, t0 + dur * 0.6)
  bp.frequency.exponentialRampToValueAtTime(from * 0.8, t0 + dur)
  const g = c.createGain()
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(peak, t0 + dur * 0.4)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(bp).connect(g).connect(master)
  disconnectOnEnd(src, [bp, g])
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

/**
 * Sichqoncha tugma / personaj ustiga kelganda — juda qisqa, sokin.
 * @param pan −1 (chap) … 1 (o‘ng), masalan personajning ekrandagi x o‘rni; standart 0
 */
export function playTick(pan = 0) {
  if (!enabled) return
  const now = performance.now()
  if (now - lastTick < 60) return
  lastTick = now
  tone(2100, 0.035, { gain: 0.012, pan })
}

/** Tugma bosilganda / ovoz yoqilganda */
export function playClick(pan = 0) {
  if (!enabled) return
  tone(540, 0.1, { type: 'triangle', gain: 0.045, freqEnd: 380, pan })
}

// playSelect (IntroApp, `selected` o‘zgarganda) va playRoleMotif (personaj tanlanganda) bir paytda chaqirilishi
// mumkin — ikkalasi ustma-ust yangramasin: motif ustun, select ovozi darhol o‘chiriladi yoki o‘tkazib yuboriladi.
let lastMotifAt = -1e9
let lastSelectAt = -1e9
let selectVoices: Voice[] = []

function silence(voices: Voice[]) {
  if (!ctx) return
  const t = ctx.currentTime
  for (const v of voices) {
    try {
      v.g.gain.cancelScheduledValues(t)
      v.g.gain.setValueAtTime(Math.max(0.0001, v.g.gain.value), t)
      v.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.015)
      v.osc.stop(t + 0.03)
    } catch {
      /* allaqachon to‘xtagan */
    }
  }
}

/**
 * Personaj tanlanganda — ikki notali yumshoq qo‘ng‘iroq.
 * @param pan −1 … 1, standart 0
 */
export function playSelect(pan = 0) {
  if (!enabled) return
  const now = performance.now()
  if (now - lastMotifAt < 300) return
  lastSelectAt = now
  selectVoices = [tone(587, 0.28, { gain: 0.03, pan }), tone(880, 0.36, { gain: 0.024, delay: 0.08, pan })].filter(
    (v): v is Voice => v !== null,
  )
}

/** Ekranlar almashganda */
export function playWhoosh() {
  if (!enabled) return
  whooshRaw(0.6, 0.05, 320, 1700)
}

/**
 * "Majlisni boshlash" — qisqa past zarb. 0.4 s ichida tugaydi: undan keyin to‘liq jimlik
 * (kotibning "Sud kelmoqda" subtitri 0.6 s da jimlikda chiqadi).
 */
export function playLaunch() {
  if (!enabled) return
  tone(92, 0.4, { gain: 0.1, freqEnd: 55, attack: 0.012 })
  whooshRaw(0.4, 0.035, 260, 900)
  fadeMusic(0, LAUNCH_FADE)
  stopGenScore(LAUNCH_FADE)
  setRoomLevel(0, 0.3)
}

// ---------- Musiqa ----------

/** Musiqa fayli bormi? Vite yo‘q faylga ham 200 + text/html qaytaradi, shuning uchun content-type tekshiriladi. */
export async function probeMusic() {
  if (musicState !== 'unknown') return
  musicState = 'checking'
  try {
    const r = await fetch(MUSIC_URL, { method: 'HEAD', cache: 'no-store' })
    const type = r.headers.get('content-type') ?? ''
    musicState = r.ok && type.startsWith('audio/') ? 'available' : 'missing'
  } catch {
    musicState = 'missing'
  }
  if (!enabled || scorePhase === 'launch') return
  if (musicState === 'available') startMusic()
  if (musicState === 'missing') startGenScore()
}

export function hasMusic() {
  return musicState === 'available'
}

function fadeMusic(target: number, seconds: number) {
  if (!ctx || !musicGain) return
  const t = ctx.currentTime
  const g = musicGain.gain
  g.cancelScheduledValues(t)
  g.setValueAtTime(g.value, t)
  g.linearRampToValueAtTime(target, t + seconds)
}

/** music.mp3 uchun faza darajasi (generativ partituradagi yupqalashishga o‘xshash) */
function mp3Level(phase: string) {
  if (phase === 'launch') return 0
  if (phase === 'case') return 0.6
  return 1
}

function startMusic() {
  const c = ensureCtx()
  if (!c || !master) return
  window.clearTimeout(musicStopTimer)
  if (!musicEl) {
    musicEl = new Audio(MUSIC_URL)
    musicEl.loop = true
    musicEl.preload = 'auto'
    musicGain = c.createGain()
    musicGain.gain.value = 0
    c.createMediaElementSource(musicEl).connect(musicGain).connect(master)
  }
  void musicEl.play().catch(() => {})
  fadeMusic(MUSIC_VOLUME * mp3Level(scorePhase), 2)
}

function stopMusic(fade = 0.7) {
  if (!musicEl) return
  fadeMusic(0, fade)
  window.clearTimeout(musicStopTimer)
  musicStopTimer = window.setTimeout(() => musicEl?.pause(), (fade + 0.05) * 1000)
}

/** Faza bo‘yicha musiqani qayta boshlash (ovoz yoqilganda yoki launch'dan qaytganda) */
function startPhaseMusic() {
  if (!enabled || scorePhase === 'launch') return
  if (musicState === 'available') startMusic()
  else if (musicState === 'unknown') void probeMusic()
  else if (musicState === 'missing') startGenScore()
  startRoom()
}

/**
 * "Ovoz" tugmasining click handleri ichida chaqiring (brauzer autoplay qoidasi: AudioContext va play()
 * foydalanuvchi harakati ichida boshlanishi kerak).
 */
export function setSoundEnabled(on: boolean) {
  enabled = on
  if (on) {
    ensureCtx()
    playClick()
    startPhaseMusic()
  } else {
    stopMusic()
    stopGenScore(1.2)
    stopRoom(0.6)
  }
}

// ---------- Generativ musiqa (music.mp3 bo'lmaganda) ----------

/** Faza → partitura: title — faqat pad + dron; mode/lobby — 0.6; select — 1; case — yupqa (pad + selesta) */
function scoreParams(phase: string): { intensity: number; layers: Required<ScoreLayers> } {
  switch (phase) {
    case 'title':
      return { intensity: 0, layers: { drone: 1, pad: 1 } }
    case 'mode':
    case 'lobby':
      return { intensity: 0.6, layers: { drone: 1, pad: 1 } }
    case 'case':
      return { intensity: 0.8, layers: { drone: 0, pad: 0.9 } } // ≈ −28 dBFS RMS (boshqa fazalardan ~4 dB past)
    default:
      return { intensity: 1, layers: { drone: 1, pad: 1 } }
  }
}

function startGenScore() {
  const c = ensureCtx()
  if (!c || !master || score || scorePhase === 'launch') return
  const p = scoreParams(scorePhase)
  score = startScore(c, master, { intensity: p.intensity, layers: p.layers, lite: getState().quality === 'low' })
}

function stopGenScore(fade = 1.2) {
  score?.stop(fade)
  score = null
}

/**
 * Ekran (phase) almashganda chaqiriladi (IntroApp va LaunchOverlay — takror chaqiruv xavfsiz).
 * 'launch' — musiqa 0.4 s da, zal tovushi 0.3 s da to‘liq jim bo‘ladi.
 */
export function setMusicPhase(phase: string) {
  const prev = scorePhase
  scorePhase = phase
  if (phase === 'launch') {
    fadeMusic(0, LAUNCH_FADE)
    stopGenScore(LAUNCH_FADE)
    setRoomLevel(0, 0.3)
    return
  }
  if (!enabled) return
  // ekran almashuvi odatda bosishdan keyin — to‘xtab qolgan (suspended/interrupted) context'ni uyg‘otamiz
  ensureCtx()
  if (prev === 'launch') {
    startPhaseMusic()
  }
  if (musicState === 'available' && musicEl) fadeMusic(MUSIC_VOLUME * mp3Level(phase), 1.2)
  if (score) {
    const p = scoreParams(phase)
    score.setIntensity(p.intensity)
    score.setLayers(p.layers)
  }
  setRoomLevel(roomLevel(phase), 0.6)
}

// ---------- Zal tovushi (juda past "havo" — faqat ovoz yoqilganda) ----------

const ROOM_GAIN = 0.012
const ROOM_LFO_HZ = 0.3
const ROOM_LFO_DEPTH = 0.004 // ±33% (≈ ±3 dB) sekin "nafas"

type Room = { src: AudioBufferSourceNode; lfo: OscillatorNode; level: GainNode; nodes: AudioNode[] }
let room: Room | null = null

function roomLevel(phase: string) {
  if (phase === 'launch') return 0
  if (phase === 'select' || phase === 'case') return 0.5
  return 1
}

/** Pushti shovqin (Paul Kellet), 2 kanal, 4 s halqa, RMS = 1 ga normallangan */
function pink(c: AudioContext) {
  if (pinkBuf && pinkBuf.sampleRate === c.sampleRate) return pinkBuf
  const len = Math.floor(c.sampleRate * 4)
  const buf = c.createBuffer(2, len, c.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0
    let sum = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      const v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362
      b6 = w * 0.115926
      d[i] = v
      sum += v * v
    }
    const k = 1 / Math.sqrt(sum / len || 1)
    for (let i = 0; i < len; i++) d[i] *= k
  }
  pinkBuf = buf
  return buf
}

function startRoom() {
  if (!enabled || room || scorePhase === 'launch') return
  const c = ensureCtx()
  if (!c || !master) return
  const t = c.currentTime
  const src = c.createBufferSource()
  src.buffer = pink(c)
  src.loop = true
  const hp = c.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 200
  hp.Q.value = -3 // dB → ~0.707, rezonanssiz
  const lp = c.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 800
  lp.Q.value = -3
  const breath = c.createGain()
  breath.gain.value = ROOM_GAIN
  const lfo = c.createOscillator()
  lfo.frequency.value = ROOM_LFO_HZ
  const depth = c.createGain()
  depth.gain.value = ROOM_LFO_DEPTH
  lfo.connect(depth).connect(breath.gain)
  const level = c.createGain()
  level.gain.setValueAtTime(0, t)
  level.gain.linearRampToValueAtTime(roomLevel(scorePhase), t + 2.5)
  src.connect(hp).connect(lp).connect(breath).connect(level).connect(master)
  src.start(t, Math.random() * 3)
  lfo.start(t)
  room = { src, lfo, level, nodes: [src, hp, lp, breath, lfo, depth, level] }
}

/** Zal tovushi darajasini o‘zgartirish; 0 ga — chiziqli, aniq `seconds` ichida */
function setRoomLevel(target: number, seconds: number) {
  if (!room || !ctx) return
  const g = room.level.gain
  const t = ctx.currentTime
  if (typeof g.cancelAndHoldAtTime === 'function') g.cancelAndHoldAtTime(t)
  else {
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
  }
  g.linearRampToValueAtTime(target, t + seconds)
}

function stopRoom(fade: number) {
  const r = room
  if (!r) return
  room = null
  if (ctx) {
    const g = r.level.gain
    const t = ctx.currentTime
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + fade)
  }
  // eski zanjir o‘z-o‘zidan tozalanadi (yangi startRoom bunga tegmaydi)
  window.setTimeout(() => {
    try {
      r.src.stop()
      r.lfo.stop()
    } catch {
      /* allaqachon to‘xtagan */
    }
    for (const n of r.nodes) n.disconnect()
  }, (fade + 0.1) * 1000)
}

// ---------- Qo'shimcha SFX (boshqa qismlar faqat chaqiradi) ----------

/** "TASDIQLANDI" muhri bosilganda: shovqin lowpass 400 Hz 60 ms + sinus 80 Hz 120 ms */
export function playStamp() {
  if (!enabled) return
  burst({ filter: 'lowpass', freq: 400, q: -3, gain: 0.5, dur: 0.06, attack: 0.002 })
  tone(80, 0.12, { gain: 0.12, attack: 0.003 })
}

/** Ish papkasidagi mum muhr sinishi: highpass klik juftligi (ikkinchisi 55 ms keyin, yuqoriroq va sokinroq) */
export function playSealCrack() {
  if (!enabled) return
  burst({ filter: 'highpass', freq: 2400, q: 0, gain: 0.14, dur: 0.014, attack: 0.001 })
  burst({ filter: 'highpass', freq: 3400, q: 0, gain: 0.1, dur: 0.011, attack: 0.001, delay: 0.055 })
}

// D eol (aeolian) notalari, Hz
const D2 = 73.42
const A2 = 110.0
const E3 = 164.81
const A3 = 220.0
const D4 = 293.66
const E4 = 329.63
const F4 = 349.23
const A4 = 440.0

/**
 * Rolga xos qisqa motiv (D eol). Noma'lum rol — playSelect.
 * @param pan −1 … 1, personajning ekrandagi o‘rni; standart 0
 */
export function playRoleMotif(role: string, pan = 0) {
  if (!enabled) return
  const now = performance.now()
  const isKnown = role === 'sudya' || role === 'prokuror' || role === 'himoyachi' || role === 'guvoh' || role === 'kotib'
  if (!isKnown) {
    playSelect(pan)
    return
  }
  // shu payt playSelect ham yangragan bo‘lsa — uni o‘chiramiz, motif ustun
  if (now - lastSelectAt < 200) silence(selectVoices)
  selectVoices = []
  lastMotifAt = now

  switch (role) {
    case 'sudya':
      // D2 + A2 birga, sekin (1.2 s): og‘ir, tantanali beshlik
      tone(D2, 1.2, { type: 'triangle', gain: 0.075, attack: 0.25, hold: 0.7, pan })
      tone(A2, 1.2, { type: 'triangle', gain: 0.05, attack: 0.3, hold: 0.7, pan })
      break
    case 'prokuror':
      // A3 → E3: qat‘iy, qisqa hujum
      tone(A3, 0.26, { type: 'triangle', gain: 0.055, attack: 0.006, pan })
      tone(E3, 0.42, { type: 'triangle', gain: 0.06, attack: 0.006, delay: 0.18, pan })
      break
    case 'himoyachi':
      // D4 → F4 → A4: iliq arpedjio (sinus + yumshoq uchburchak)
      for (const [i, f] of [D4, F4, A4].entries()) {
        const dur = i === 2 ? 0.9 : 0.45
        tone(f, dur, { gain: 0.032, attack: 0.02, delay: i * 0.13, pan })
        tone(f, dur, { type: 'triangle', gain: 0.012, attack: 0.03, delay: i * 0.13, detune: 4, pan })
      }
      break
    case 'guvoh':
      // E4 → F4 (+8 sent): ikkilanish, biroz noaniq
      tone(E4, 0.4, { gain: 0.032, attack: 0.03, pan })
      tone(F4, 0.6, { gain: 0.03, attack: 0.04, delay: 0.22, detune: 8, pan })
      break
    case 'kotib':
      // ikki yumshoq "yozuv mashinkasi" tiqi
      burst({ filter: 'bandpass', freq: 3000, q: 1.2, gain: 0.07, dur: 0.012, attack: 0.001, pan })
      tone(1400, 0.015, { type: 'triangle', gain: 0.008, attack: 0.001, pan })
      burst({ filter: 'bandpass', freq: 2700, q: 1.2, gain: 0.055, dur: 0.012, attack: 0.001, delay: 0.11, pan })
      tone(1250, 0.015, { type: 'triangle', gain: 0.006, attack: 0.001, delay: 0.11, pan })
      break
  }
}
