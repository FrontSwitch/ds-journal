const MUTE_KEY = 'dsj-blocks-muted'

function readMuted(): boolean {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export class BlocksSounds {
  private ctx: AudioContext | null = null
  private _muted: boolean

  constructor() {
    this._muted = readMuted()
  }

  get isMuted() { return this._muted }

  toggleMute(): boolean {
    this._muted = !this._muted
    try { localStorage.setItem(MUTE_KEY, this._muted ? '1' : '0') } catch { /* */ }
    return this._muted
  }

  private ac(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext()
    if (this.ctx.state === 'suspended') this.ctx.resume()
    return this.ctx
  }

  private play(fn: (ctx: AudioContext, t: number) => void) {
    if (this._muted) return
    try {
      const ctx = this.ac()
      fn(ctx, ctx.currentTime)
    } catch { /* */ }
  }

  // ── Sounds ────────────────────────────────────────────────────────────────

  rotate() {
    this.play((ctx, t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 520
      gain.gain.setValueAtTime(0.06, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03)
      osc.start(t); osc.stop(t + 0.03)
    })
  }

  softDrop() {
    this.play((ctx, t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain); gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = 110
      gain.gain.setValueAtTime(0.07, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
      osc.start(t); osc.stop(t + 0.04)
    })
  }

  hardDrop() {
    this.play((ctx, t) => {
      // Descending sweep
      const osc = ctx.createOscillator()
      const sweepGain = ctx.createGain()
      osc.connect(sweepGain); sweepGain.connect(ctx.destination)
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(380, t)
      osc.frequency.exponentialRampToValueAtTime(70, t + 0.1)
      sweepGain.gain.setValueAtTime(0.18, t)
      sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.11)
      osc.start(t); osc.stop(t + 0.11)

      // Impact thud
      const bufSize = Math.floor(ctx.sampleRate * 0.07)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 160
      const noiseGain = ctx.createGain()
      const hit = t + 0.09
      noiseGain.gain.setValueAtTime(0.35, hit)
      noiseGain.gain.exponentialRampToValueAtTime(0.001, hit + 0.07)
      noise.connect(filter); filter.connect(noiseGain); noiseGain.connect(ctx.destination)
      noise.start(hit); noise.stop(hit + 0.07)
    })
  }

  lock() {
    this.play((ctx, t) => {
      const bufSize = Math.floor(ctx.sampleRate * 0.06)
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate)
      const data = buf.getChannelData(0)
      for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1
      const noise = ctx.createBufferSource()
      noise.buffer = buf
      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 220
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.25, t)
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination)
      noise.start(t); noise.stop(t + 0.06)
    })
  }

  lineClear(count: 1 | 2 | 3 | 4) {
    this.play((ctx, t) => {
      if (count === 4) {
        // Triumphant ascending arpeggio + chord bloom
        const freqs = [261, 329, 392, 523]
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.type = 'square'
          osc.frequency.value = freq
          const at = t + i * 0.055
          gain.gain.setValueAtTime(0.001, at)
          gain.gain.linearRampToValueAtTime(0.1, at + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.38)
          osc.start(at); osc.stop(at + 0.38)
        })
      } else {
        // Rising tones, one per line cleared
        const baseFreqs = [320, 440, 560]
        for (let i = 0; i < count; i++) {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.connect(gain); gain.connect(ctx.destination)
          osc.type = 'sine'
          osc.frequency.value = baseFreqs[i]
          const at = t + i * 0.075
          gain.gain.setValueAtTime(0.001, at)
          gain.gain.linearRampToValueAtTime(0.14, at + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2)
          osc.start(at); osc.stop(at + 0.2)
        }
      }
    })
  }

  levelUp() {
    this.play((ctx, t) => {
      // Bright ascending arpeggio
      const freqs = [330, 415, 494, 659]
      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.connect(gain); gain.connect(ctx.destination)
        osc.type = 'triangle'
        osc.frequency.value = freq
        const at = t + i * 0.09
        gain.gain.setValueAtTime(0.001, at)
        gain.gain.linearRampToValueAtTime(0.13, at + 0.025)
        gain.gain.exponentialRampToValueAtTime(0.001, at + 0.2)
        osc.start(at); osc.stop(at + 0.2)
      })
    })
  }
}
