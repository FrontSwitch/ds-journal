// Blocks game engine — pure TS, no React dependencies.
// Call attach(canvas) to bind to a canvas element, then start().

import { BlocksSounds } from './BlocksSounds'

export type BlocksState = {
  score: number
  highScore: number
  level: number
  lines: number
  doubles: number
  triples: number
  tetrises: number
  zenMode: boolean
  zenSlowed: boolean
  status: 'idle' | 'playing' | 'paused' | 'over'
}

type Cell = number  // 0 = empty, 1-7 = piece color index

// Tetrominoes: each piece has 4 rotation states, each state is a 4x4 bitmask (row-major)
// Using the Tetris Guideline standard orientations
const PIECES: number[][][] = [
  // I - index 1
  [
    [0,0,0,0, 1,1,1,1, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,0,1,0, 0,0,1,0, 0,0,1,0],
    [0,0,0,0, 0,0,0,0, 1,1,1,1, 0,0,0,0],
    [0,1,0,0, 0,1,0,0, 0,1,0,0, 0,1,0,0],
  ],
  // O - index 2
  [
    [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,1,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
  ],
  // T - index 3
  [
    [0,1,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,0,0, 0,1,1,0, 0,1,0,0, 0,0,0,0],
    [0,0,0,0, 1,1,1,0, 0,1,0,0, 0,0,0,0],
    [0,1,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0],
  ],
  // S - index 4
  [
    [0,1,1,0, 1,1,0,0, 0,0,0,0, 0,0,0,0],
    [0,1,0,0, 0,1,1,0, 0,0,1,0, 0,0,0,0],
    [0,0,0,0, 0,1,1,0, 1,1,0,0, 0,0,0,0],
    [1,0,0,0, 1,1,0,0, 0,1,0,0, 0,0,0,0],
  ],
  // Z - index 5
  [
    [1,1,0,0, 0,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,0,1,0, 0,1,1,0, 0,1,0,0, 0,0,0,0],
    [0,0,0,0, 1,1,0,0, 0,1,1,0, 0,0,0,0],
    [0,1,0,0, 1,1,0,0, 1,0,0,0, 0,0,0,0],
  ],
  // J - index 6
  [
    [1,0,0,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,1,0, 0,1,0,0, 0,1,0,0, 0,0,0,0],
    [0,0,0,0, 1,1,1,0, 0,0,1,0, 0,0,0,0],
    [0,1,0,0, 0,1,0,0, 1,1,0,0, 0,0,0,0],
  ],
  // L - index 7
  [
    [0,0,1,0, 1,1,1,0, 0,0,0,0, 0,0,0,0],
    [0,1,0,0, 0,1,0,0, 0,1,1,0, 0,0,0,0],
    [0,0,0,0, 1,1,1,0, 1,0,0,0, 0,0,0,0],
    [1,1,0,0, 0,1,0,0, 0,1,0,0, 0,0,0,0],
  ],
]

type Kick = [number, number]
type KickTable = Kick[][]

// SRS wall kick data: [fromRotation][kickIndex][dx, dy]
// JLSTZ pieces share one table; I has its own
const KICKS_JLSTZ: KickTable = [
  // 0→1
  [[ 0,0],[-1,0],[-1, 1],[0,-2],[-1,-2]],
  // 1→2
  [[ 0,0],[ 1,0],[ 1,-1],[0, 2],[ 1, 2]],
  // 2→3
  [[ 0,0],[ 1,0],[ 1, 1],[0,-2],[ 1,-2]],
  // 3→0
  [[ 0,0],[-1,0],[-1,-1],[0, 2],[-1, 2]],
]

const KICKS_I: KickTable = [
  // 0→1
  [[ 0,0],[-2,0],[ 1,0],[-2,-1],[ 1, 2]],
  // 1→2
  [[ 0,0],[-1,0],[ 2,0],[-1, 2],[ 2,-1]],
  // 2→3
  [[ 0,0],[ 2,0],[-1,0],[ 2, 1],[-1,-2]],
  // 3→0
  [[ 0,0],[ 1,0],[-2,0],[ 1,-2],[-2, 1]],
]

// Catppuccin Mocha-inspired colors per piece type (index 0 = empty)
const COLORS = [
  '',          // 0 empty
  '#89dceb',  // 1 I  - sky
  '#f9e2af',  // 2 O  - yellow
  '#cba6f7',  // 3 T  - mauve
  '#a6e3a1',  // 4 S  - green
  '#f38ba8',  // 5 Z  - red
  '#89b4fa',  // 6 J  - blue
  '#fab387',  // 7 L  - peach
]

const GHOST_ALPHA = 0.13

const BOARD_W = 10
const BOARD_H = 20
const BLOCK = 30
const PREVIEW_BLOCK = 24
const LOCK_DELAY_MS = 500
const LOCK_RESET_MAX = 15

const HIGH_SCORE_KEY = 'dsj-blocks-highscore'

// ms per gravity drop by speed (1-10); speed=5 ≈ half of normal level-1 speed
const ZEN_DROP_INTERVALS = [3200, 2800, 2400, 2200, 2000, 1700, 1400, 1100, 800, 500]

// Stack threshold rows (0-indexed from top): top row that counts as the threshold
const THRESH_80 = Math.floor(BOARD_H * 0.20)   // row 4  → stack 80% full
const THRESH_100 = 0                             // row 0  → stack 100% full

// Level speed table: ms per gravity drop
function dropInterval(level: number): number {
  // Formula approximates Tetris guideline
  return Math.max(50, Math.round(1000 * Math.pow(0.8 - (level - 1) * 0.007, level - 1)))
}

function readHighScore(): number {
  try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0 } catch { return 0 }
}

function writeHighScore(s: number): void {
  try { localStorage.setItem(HIGH_SCORE_KEY, String(s)) } catch { /* */ }
}

function randomBag(): number[] {
  const bag = [1, 2, 3, 4, 5, 6, 7]
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]]
  }
  return bag
}

interface ActivePiece {
  type: number       // 1-7
  rot: number        // 0-3
  x: number
  y: number
}

export interface BlocksOptions {
  zenMode?: boolean
  zenSpeed?: number  // 1-10, default 5
}

export class BlocksGame {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private board: Cell[][] = []
  private active: ActivePiece | null = null
  private next: number[] = []
  private held: number | null = null

  private score = 0
  private highScore = readHighScore()
  private level = 1
  private lines = 0
  private status: BlocksState['status'] = 'idle'

  // Zen mode state
  readonly zenMode: boolean
  private zenSpeed: number
  private zenBaseInterval: number
  private zenCurrentInterval: number
  private zenSlowed = false
  private doubles = 0
  private triples = 0
  private tetrises = 0
  private reliefFadeRow: number | null = null
  private reliefFadeAlpha = 1

  private lastDrop = 0
  private lockTimer: ReturnType<typeof setTimeout> | null = null
  private lockResets = 0
  private rafId = 0

  private onStateChange: ((s: BlocksState) => void) | null = null
  readonly sounds = new BlocksSounds()

  // Touch tracking
  private touchStart: { x: number; y: number; t: number } | null = null

  constructor(canvas: HTMLCanvasElement, options: BlocksOptions = {}) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No 2d context')
    this.ctx = ctx
    this.canvas.width = BOARD_W * BLOCK + 120  // board + sidebar
    this.canvas.height = BOARD_H * BLOCK

    this.zenMode = options.zenMode ?? false
    this.zenSpeed = Math.max(1, Math.min(10, options.zenSpeed ?? 5))
    this.zenBaseInterval = ZEN_DROP_INTERVALS[this.zenSpeed - 1]
    this.zenCurrentInterval = this.zenBaseInterval

    this.bindKeys()
    this.bindTouch()
    this.bindVisibility()
  }

  setOnStateChange(cb: (s: BlocksState) => void) {
    this.onStateChange = cb
  }

  private emit() {
    this.onStateChange?.({
      score: this.score,
      highScore: this.highScore,
      level: this.level,
      lines: this.lines,
      doubles: this.doubles,
      triples: this.triples,
      tetrises: this.tetrises,
      zenMode: this.zenMode,
      zenSlowed: this.zenSlowed,
      status: this.status,
    })
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  start() {
    this.board = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0))
    this.score = 0
    this.level = 1
    this.lines = 0
    this.held = null
    this.next = [...randomBag(), ...randomBag()]
    this.active = null
    this.status = 'playing'
    this.doubles = 0
    this.triples = 0
    this.tetrises = 0
    this.zenCurrentInterval = this.zenBaseInterval
    this.zenSlowed = false
    this.reliefFadeRow = null
    this.reliefFadeAlpha = 1
    this.spawnPiece()
    this.lastDrop = performance.now()
    this.emit()
    cancelAnimationFrame(this.rafId)
    this.rafId = requestAnimationFrame(this.loop)
  }

  pause() {
    if (this.status !== 'playing') return
    this.status = 'paused'
    this.cancelLock()
    cancelAnimationFrame(this.rafId)
    this.emit()
    this.draw()
  }

  resume() {
    if (this.status !== 'paused') return
    this.status = 'playing'
    this.lastDrop = performance.now()
    this.emit()
    this.rafId = requestAnimationFrame(this.loop)
  }

  togglePause() {
    if (this.status === 'playing') this.pause()
    else if (this.status === 'paused') this.resume()
  }

  destroy() {
    cancelAnimationFrame(this.rafId)
    this.cancelLock()
    document.removeEventListener('keydown', this.onKey)
    this.canvas.removeEventListener('touchstart', this.onTouchStart)
    this.canvas.removeEventListener('touchend', this.onTouchEnd)
    document.removeEventListener('visibilitychange', this.onVisibility)
  }

  // ── Game loop ──────────────────────────────────────────────────────────────

  private loop = (now: number) => {
    if (this.status !== 'playing') return
    const interval = this.zenMode ? this.zenCurrentInterval : dropInterval(this.level)
    if (now - this.lastDrop >= interval) {
      this.gravity()
      this.lastDrop = now
    }
    this.draw()
    this.rafId = requestAnimationFrame(this.loop)
  }

  private gravity() {
    if (!this.active) return
    if (this.canMove(this.active, 0, 1)) {
      this.active.y++
      this.cancelLock()
    } else {
      this.startLock()
    }
  }

  // ── Piece management ───────────────────────────────────────────────────────

  private spawnPiece() {
    const type = this.next.shift()!
    if (this.next.length < 7) this.next.push(...randomBag())
    this.active = { type, rot: 0, x: 3, y: 0 }
    if (!this.canPlace(this.active)) {
      if (this.zenMode) {
        // Should be caught by threshold check in zenLockPiece, but safety net
        this.active = null
      } else {
        this.gameOver()
      }
    }
  }

  private canPlace(p: ActivePiece): boolean {
    return this.canMove(p, 0, 0)
  }

  private canMove(p: ActivePiece, dx: number, dy: number): boolean {
    const cells = this.getCells(p.type, p.rot)
    for (const [cx, cy] of cells) {
      const nx = p.x + cx + dx
      const ny = p.y + cy + dy
      if (nx < 0 || nx >= BOARD_W || ny >= BOARD_H) return false
      if (ny >= 0 && this.board[ny][nx] !== 0) return false
    }
    return true
  }

  private getCells(type: number, rot: number): [number, number][] {
    const mask = PIECES[type - 1][rot]
    const result: [number, number][] = []
    for (let i = 0; i < 16; i++) {
      if (mask[i]) result.push([i % 4, Math.floor(i / 4)])
    }
    return result
  }

  private lockPiece() {
    if (!this.active) return
    const p = this.active
    const cells = this.getCells(p.type, p.rot)
    for (const [cx, cy] of cells) {
      const ny = p.y + cy
      const nx = p.x + cx
      if (ny >= 0) this.board[ny][nx] = p.type
    }
    this.sounds.lock()
    this.clearLines()
    this.active = null
    this.spawnPiece()
    this.lockResets = 0
  }

  private updateHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score
      writeHighScore(this.highScore)
    }
  }

  private clearLines() {
    let cleared = 0
    for (let y = BOARD_H - 1; y >= 0; y--) {
      if (this.board[y].every(c => c !== 0)) {
        this.board.splice(y, 1)
        this.board.unshift(Array(BOARD_W).fill(0))
        cleared++
        y++
      }
    }
    if (cleared > 0) {
      const pts = [0, 100, 300, 500, 800][cleared] * this.level
      this.score += pts
      this.lines += cleared
      const prevLevel = this.level
      this.level = Math.floor(this.lines / 10) + 1
      this.sounds.lineClear(Math.min(cleared, 4) as 1 | 2 | 3 | 4)
      if (this.level > prevLevel) this.sounds.levelUp()
    }
    this.updateHighScore()
    this.emit()
  }

  // Zen variant: tracks clears, handles zenSlowed recovery on tetris
  private zenClearLines(): number {
    let cleared = 0
    for (let y = BOARD_H - 1; y >= 0; y--) {
      if (this.board[y].every(c => c !== 0)) {
        this.board.splice(y, 1)
        this.board.unshift(Array(BOARD_W).fill(0))
        cleared++
        y++
      }
    }
    if (cleared > 0) {
      this.lines += cleared
      if (cleared === 2) this.doubles++
      else if (cleared === 3) this.triples++
      else if (cleared >= 4) {
        this.tetrises++
        if (this.zenSlowed) {
          // Recovery: reset to initial drop speed
          this.zenCurrentInterval = this.zenBaseInterval
          this.zenSlowed = false
        }
      }
      this.sounds.lineClear(Math.min(cleared, 4) as 1 | 2 | 3 | 4)
    }
    this.emit()
    return cleared
  }

  // Returns the highest row index (0=top) that has any filled cell, or BOARD_H if empty
  private getStackHighRow(): number {
    for (let y = 0; y < BOARD_H; y++) {
      if (this.board[y].some(c => c !== 0)) return y
    }
    return BOARD_H
  }

  // Animated bottom-up wipe for zen relief — pauses the drop loop while running
  private async runZenRelief(numRows: number): Promise<void> {
    cancelAnimationFrame(this.rafId)
    this.cancelLock()

    const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
    const FADE_STEPS = 6
    const FADE_STEP_MS = 25   // 150ms total fade per row
    const ROW_GAP_MS = 70     // gap between rows

    for (let i = 0; i < numRows; i++) {
      // Fade the current bottom row (after previous removals it's always index BOARD_H-1)
      for (let step = FADE_STEPS - 1; step >= 0; step--) {
        this.reliefFadeRow = BOARD_H - 1
        this.reliefFadeAlpha = step / (FADE_STEPS - 1)
        this.draw()
        await delay(FADE_STEP_MS)
      }
      // Remove it and shift everything down
      this.reliefFadeRow = null
      this.board.splice(BOARD_H - 1, 1)
      this.board.unshift(Array(BOARD_W).fill(0))
      this.draw()
      if (i < numRows - 1) await delay(ROW_GAP_MS)
    }

    this.reliefFadeRow = null
    this.reliefFadeAlpha = 1
  }

  // Zen-mode lock: clears lines, checks thresholds, runs relief animation, then spawns next
  private async zenLockPiece() {
    if (!this.active) return
    const p = this.active
    const cells = this.getCells(p.type, p.rot)
    for (const [cx, cy] of cells) {
      const ny = p.y + cy
      const nx = p.x + cx
      if (ny >= 0) this.board[ny][nx] = p.type
    }
    this.sounds.lock()
    this.zenClearLines()
    this.active = null
    this.lockResets = 0

    const highRow = this.getStackHighRow()

    if (highRow <= THRESH_100) {
      // 100% relief: clear 8 rows, slow drop speed by 75% (compounding)
      await this.runZenRelief(8)
      this.zenCurrentInterval = this.zenCurrentInterval / 0.75
      this.zenSlowed = true
      this.emit()
    } else if (highRow <= THRESH_80) {
      // 80% relief: clear 4 rows
      await this.runZenRelief(4)
      this.emit()
    }

    if (this.status !== 'playing') return
    this.spawnPiece()
    if (this.status === 'playing') {
      this.lastDrop = performance.now()
      this.rafId = requestAnimationFrame(this.loop)
      this.draw()
    }
  }

  private gameOver() {
    this.updateHighScore()
    this.status = 'over'
    this.cancelLock()
    cancelAnimationFrame(this.rafId)
    this.emit()
    this.draw()
  }

  // ── Lock delay ─────────────────────────────────────────────────────────────

  private startLock() {
    if (this.lockTimer !== null) return
    this.lockTimer = setTimeout(() => {
      this.lockTimer = null
      if (this.zenMode) {
        this.zenLockPiece()
      } else {
        this.lockPiece()
        if (this.status === 'playing') this.draw()
      }
    }, LOCK_DELAY_MS)
  }

  private cancelLock() {
    if (this.lockTimer !== null) {
      clearTimeout(this.lockTimer)
      this.lockTimer = null
    }
  }

  private resetLock() {
    if (this.lockResets >= LOCK_RESET_MAX) return
    if (this.lockTimer !== null) {
      this.cancelLock()
      this.lockResets++
      this.startLock()
    }
  }

  // ── Moves ──────────────────────────────────────────────────────────────────

  moveLeft()  { this.shiftH(-1) }
  moveRight() { this.shiftH(1) }

  private shiftH(dx: number) {
    if (!this.active || this.status !== 'playing') return
    if (this.canMove(this.active, dx, 0)) {
      this.active.x += dx
      this.resetLock()
      this.draw()
    }
  }

  softDrop() {
    if (!this.active || this.status !== 'playing') return
    if (this.canMove(this.active, 0, 1)) {
      this.active.y++
      this.lastDrop = performance.now()
      if (!this.zenMode) {
        this.score += 1
        this.updateHighScore()
      }
      this.sounds.softDrop()
      this.draw()
    }
  }

  hardDrop() {
    if (!this.active || this.status !== 'playing') return
    let dropped = 0
    while (this.canMove(this.active, 0, 1)) {
      this.active.y++
      dropped++
    }
    if (!this.zenMode) {
      this.score += dropped * 2
      this.updateHighScore()
    }
    this.sounds.hardDrop()
    this.cancelLock()
    if (this.zenMode) {
      this.zenLockPiece()
    } else {
      this.lockPiece()
      this.draw()
      this.emit()
    }
  }

  rotateCW()  { this.rotate(1) }
  rotateCCW() { this.rotate(-1) }

  private rotate(dir: 1 | -1) {
    if (!this.active || this.status !== 'playing') return
    const p = this.active
    const newRot = ((p.rot + dir) + 4) % 4
    const kicks = p.type === 1 ? KICKS_I : KICKS_JLSTZ
    const fromRot = dir === 1 ? p.rot : newRot
    for (const [kx, ky] of kicks[fromRot]) {
      const ox = dir === 1 ? kx : -kx
      const oy = dir === 1 ? ky : -ky
      const test = { ...p, rot: newRot, x: p.x + ox, y: p.y - oy }
      if (this.canPlace(test)) {
        this.active = test
        this.resetLock()
        this.sounds.rotate()
        this.draw()
        return
      }
    }
  }

  // ── Ghost piece ────────────────────────────────────────────────────────────

  private ghostY(): number {
    if (!this.active) return 0
    let gy = this.active.y
    while (this.canMove({ ...this.active, y: gy + 1 }, 0, 0)) gy++
    return gy
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  private draw() {
    const { ctx } = this
    const W = BOARD_W * BLOCK
    const H = BOARD_H * BLOCK
    const sideX = W + 8

    // Background
    ctx.fillStyle = 'var(--bg, #1e1e2e)'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    // Board cells
    for (let y = 0; y < BOARD_H; y++) {
      for (let x = 0; x < BOARD_W; x++) {
        const c = this.board[y][x]
        const alpha = (y === this.reliefFadeRow) ? this.reliefFadeAlpha : 1
        this.drawBlock(x * BLOCK, y * BLOCK, BLOCK, c, alpha)
      }
    }

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x <= BOARD_W; x++) {
      ctx.beginPath(); ctx.moveTo(x * BLOCK, 0); ctx.lineTo(x * BLOCK, H); ctx.stroke()
    }
    for (let y = 0; y <= BOARD_H; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * BLOCK); ctx.lineTo(W, y * BLOCK); ctx.stroke()
    }

    // Ghost
    if (this.active && this.status === 'playing') {
      const gy = this.ghostY()
      const cells = this.getCells(this.active.type, this.active.rot)
      for (const [cx, cy] of cells) {
        const nx = (this.active.x + cx) * BLOCK
        const ny = (gy + cy) * BLOCK
        if (gy + cy >= 0) this.drawBlock(nx, ny, BLOCK, this.active.type, GHOST_ALPHA, true)
      }

      // Active piece
      for (const [cx, cy] of cells) {
        const nx = (this.active.x + cx) * BLOCK
        const ny = (this.active.y + cy) * BLOCK
        if (this.active.y + cy >= 0) this.drawBlock(nx, ny, BLOCK, this.active.type, 1)
      }
    }

    // Board border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, W, H)

    // Sidebar
    ctx.font = '11px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    let sy = 16

    // Zen label
    if (this.zenMode) {
      ctx.fillStyle = '#cba6f7'
      ctx.font = 'bold 11px monospace'
      ctx.fillText('ZEN', sideX, sy); sy += 14
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(255,255,255,0.35)'
      ctx.fillText(`spd ${this.zenSpeed}`, sideX, sy); sy += 18
    }

    // Next pieces (show 3)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '11px monospace'
    ctx.fillText('NEXT', sideX, sy); sy += 14
    for (let i = 0; i < Math.min(3, this.next.length); i++) {
      sy = this.drawPreview(this.next[i], sideX, sy) + 4
    }

    sy += 8
    if (this.held !== null) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.fillText('HOLD', sideX, sy); sy += 14
      sy = this.drawPreview(this.held, sideX, sy) + 8
    }

    // Status overlay
    if (this.status === 'paused') {
      this.drawOverlay('PAUSED', 'P to resume')
    } else if (this.status === 'over') {
      this.drawOverlay('GAME OVER', 'Space to restart')
    } else if (this.status === 'idle') {
      this.drawOverlay(this.zenMode ? 'ZEN BLOCKS' : 'BLOCKS', 'Space to start')
    }
  }

  private drawBlock(px: number, py: number, size: number, type: number, alpha: number, ghost = false) {
    if (type === 0) {
      this.ctx.fillStyle = 'rgba(255,255,255,0.03)'
      this.ctx.fillRect(px + 0.5, py + 0.5, size - 1, size - 1)
      return
    }
    const color = ghost ? '#6c7086' : COLORS[type]
    this.ctx.globalAlpha = alpha
    this.ctx.fillStyle = color
    this.ctx.fillRect(px + 1, py + 1, size - 2, size - 2)
    if (!ghost) {
      // Highlight top-left
      this.ctx.fillStyle = 'rgba(255,255,255,0.25)'
      this.ctx.fillRect(px + 1, py + 1, size - 2, 3)
      this.ctx.fillRect(px + 1, py + 1, 3, size - 2)
      // Shadow bottom-right
      this.ctx.fillStyle = 'rgba(0,0,0,0.3)'
      this.ctx.fillRect(px + 1, py + size - 4, size - 2, 3)
      this.ctx.fillRect(px + size - 4, py + 1, 3, size - 2)
    }
    this.ctx.globalAlpha = 1
  }

  private drawPreview(type: number, sx: number, sy: number): number {
    const cells = this.getCells(type, 0)
    const minX = Math.min(...cells.map(([x]) => x))
    const minY = Math.min(...cells.map(([, y]) => y))
    for (const [cx, cy] of cells) {
      this.drawBlock(sx + (cx - minX) * PREVIEW_BLOCK, sy + (cy - minY) * PREVIEW_BLOCK, PREVIEW_BLOCK, type, 1)
    }
    const maxY = Math.max(...cells.map(([, y]) => y))
    return sy + (maxY - minY + 1) * PREVIEW_BLOCK
  }

  private drawOverlay(title: string, sub: string) {
    const { ctx } = this
    const W = BOARD_W * BLOCK
    const H = BOARD_H * BLOCK
    ctx.fillStyle = 'rgba(0,0,0,0.65)'
    ctx.fillRect(0, 0, W, H)
    ctx.fillStyle = '#cdd6f4'
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(title, W / 2, H / 2 - 16)
    ctx.font = '14px monospace'
    ctx.fillStyle = 'rgba(205,214,244,0.7)'
    ctx.fillText(sub, W / 2, H / 2 + 12)
    ctx.textAlign = 'left'
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private onKey = (e: KeyboardEvent) => {
    if (this.status === 'over') {
      if (e.code === 'Space') { e.preventDefault(); this.start(); return }
      return
    }
    if (this.status === 'idle') {
      if (e.code === 'Space') { e.preventDefault(); this.start(); return }
      return
    }
    if (e.code === 'KeyP' || e.code === 'Escape') {
      e.preventDefault()
      this.togglePause()
      return
    }
    if (this.status !== 'playing') return
    switch (e.code) {
      case 'ArrowLeft':  e.preventDefault(); this.moveLeft(); break
      case 'ArrowRight': e.preventDefault(); this.moveRight(); break
      case 'ArrowDown':  e.preventDefault(); this.softDrop(); break
      case 'Space':      e.preventDefault(); this.hardDrop(); break
      case 'KeyA':       e.preventDefault(); this.rotateCCW(); break
      case 'KeyS':       e.preventDefault(); this.rotateCW(); break
    }
  }

  private bindKeys() {
    document.addEventListener('keydown', this.onKey)
  }

  // Touch controls
  private onTouchStart = (e: TouchEvent) => {
    e.preventDefault()
    const t = e.touches[0]
    this.touchStart = { x: t.clientX, y: t.clientY, t: Date.now() }
  }

  private onTouchEnd = (e: TouchEvent) => {
    if (!this.touchStart) return
    const t = e.changedTouches[0]
    const dx = t.clientX - this.touchStart.x
    const dy = t.clientY - this.touchStart.y
    const dt = Date.now() - this.touchStart.t
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (this.status === 'over' || this.status === 'idle') {
      this.start()
      this.touchStart = null
      return
    }
    if (this.status === 'paused') {
      this.resume()
      this.touchStart = null
      return
    }

    const rect = this.canvas.getBoundingClientRect()
    const tapX = this.touchStart.x - rect.left

    if (absDx < 12 && absDy < 12 && dt < 300) {
      // Tap: left third = move left, right third = move right, center = rotate CW
      const third = rect.width / 3
      if (tapX < third) this.moveLeft()
      else if (tapX > third * 2) this.moveRight()
      else this.rotateCW()
    } else if (absDy > absDx) {
      if (dy > 40) this.softDrop()
      else if (dy < -40) this.hardDrop()
    } else {
      if (dx > 20) this.moveRight()
      else if (dx < -20) this.moveLeft()
    }
    this.touchStart = null
  }

  private bindTouch() {
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    this.canvas.addEventListener('touchend', this.onTouchEnd, { passive: false })
  }

  private onVisibility = () => {
    if (document.hidden && this.status === 'playing') this.pause()
  }

  private bindVisibility() {
    document.addEventListener('visibilitychange', this.onVisibility)
  }

  // Initial idle draw
  drawIdle() {
    this.board = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(0))
    this.draw()
    this.emit()
  }
}
