import { useEffect, useRef, useState } from 'react'
import { BlocksGame, type BlocksState } from './BlocksGame'
import './BlocksPanel.css'

interface Props {
  onClose: () => void
}

export default function BlocksPanel({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gameRef = useRef<BlocksGame | null>(null)
  const [state, setState] = useState<BlocksState>({
    score: 0,
    highScore: 0,
    level: 1,
    lines: 0,
    status: 'idle',
  })
  const [muted, setMuted] = useState(() => localStorage.getItem('dsj-blocks-muted') === '1')

  useEffect(() => {
    if (!canvasRef.current) return
    const game = new BlocksGame(canvasRef.current)
    game.setOnStateChange(setState)
    game.drawIdle()
    gameRef.current = game
    return () => {
      game.destroy()
      gameRef.current = null
    }
  }, [])

  // Pause when panel closes / backgrounds
  useEffect(() => {
    return () => {
      gameRef.current?.pause()
    }
  }, [])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      gameRef.current?.pause()
      onClose()
    }
  }

  function handleClose() {
    gameRef.current?.pause()
    onClose()
  }

  function handleMute() {
    const game = gameRef.current
    if (!game) return
    setMuted(game.sounds.toggleMute())
  }

  const scoreStr = String(state.score).padStart(6, '0')
  const hiStr    = String(state.highScore).padStart(6, '0')

  return (
    <div className="blocks-backdrop" onClick={handleBackdropClick}>
      <div className="blocks-panel">
        <div className="blocks-header">
          <div className="blocks-scores">
            <div className="blocks-score-item">
              <span className="blocks-score-label">SCORE</span>
              <span className="blocks-score-value">{scoreStr}</span>
            </div>
            <div className="blocks-score-item">
              <span className="blocks-score-label">BEST</span>
              <span className="blocks-score-value hi">{hiStr}</span>
            </div>
            <div className="blocks-score-item">
              <span className="blocks-score-label">LEVEL</span>
              <span className="blocks-score-value">{state.level}</span>
            </div>
            <div className="blocks-score-item">
              <span className="blocks-score-label">LINES</span>
              <span className="blocks-score-value">{state.lines}</span>
            </div>
          </div>
          <div className="blocks-header-actions">
            <button className="blocks-mute" onClick={handleMute} title={muted ? 'Unmute' : 'Mute'}>
              {muted ? '♪̶' : '♪'}
            </button>
            <button className="blocks-close" onClick={handleClose} title="Close">✕</button>
          </div>
        </div>

        <div className="blocks-canvas-wrap">
          <canvas ref={canvasRef} className="blocks-canvas" />
        </div>

        <div className="blocks-footer">
          <span>← → move</span>
          <span>A/S rotate</span>
          <span>↓ soft drop</span>
          <span>Space hard drop</span>
          <span>P pause</span>
        </div>
      </div>
    </div>
  )
}
