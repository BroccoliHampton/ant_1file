/**
 * Console — Phase 2 bottom dock. Replaces the old multi-row Toolbar.
 *
 * Layout (left → right):
 *   [ Brush chip ]   [ ⏵/⏸ Hero FAB ]   [ Tool chip ]
 *
 * Tapping a chip toggles its sheet (BrushSheet or ToolSheet); only one
 * sheet can be open at a time. The hero is pause/play with long-press
 * for max-speed scrubbing.
 *
 * Engine compatibility: this component owns no element/tool state itself
 * — everything routes through the existing simStore so the engine doesn't
 * need to be touched. The legacy DOM IDs (bs/sp/stamp-sel/pc-panel/pv-panel)
 * are preserved inside the sheets so the engine continues to read them.
 */
import { useState, useRef, useEffect } from 'react'
import { useSimStore } from '../../store/simStore.js'
import { ELEMENTS } from '../../simulation/constants.js'
import BrushSheet from './BrushSheet.jsx'
import ToolSheet from './ToolSheet.jsx'

const TOOL_LABELS = {
  draw:    { icon: '✎', label: 'DRAW' },
  erase:   { icon: '✕', label: 'ERASE' },
  sun:     { icon: '☀', label: 'SUN' },
  stamp:   { icon: '⬛', label: 'STAMP' },
  observe: { icon: '👁', label: 'OBSERVE' },
  grab:    { icon: '✋', label: 'GRAB' },
}

export default function Console() {
  // 'closed' | 'brush' | 'tool' — only one sheet open at a time
  const [sheet, setSheet] = useState('closed')

  const activeTool    = useSimStore(s => s.activeTool)
  const activeElement = useSimStore(s => s.activeElement)
  const speedMult     = useSimStore(s => s.speedMult)
  const setSpeedMult  = useSimStore(s => s.setSpeedMult)

  // Find the active element's display info (label/swatch).
  // Custom elements aren't in ELEMENTS; we look them up via the engine.
  const engine = useSimStore(s => s.engine)
  const elementInfo = (() => {
    const e = ELEMENTS.find(x => x.key === activeElement)
    if (e) return { label: e.label, swatch: e.col }
    if (activeElement?.startsWith('customelem_') && engine) {
      const id = parseInt(activeElement.split('_')[1])
      const def = engine.listCustomElements?.()?.find(d => d.id === id)
      if (def) return { label: def.name?.toUpperCase() || `ELEM ${id}`,
                        swatch: `hsl(${def.hue},${def.sat}%,${def.lit}%)` }
    }
    return { label: (activeElement || '').toUpperCase(), swatch: '#666' }
  })()

  const tool = TOOL_LABELS[activeTool] || { icon: '?', label: activeTool || '' }
  const isPaused = speedMult === 0

  // Long-press hero for max-speed scrub.
  // Hold = temporarily 4.0×; release = restore previous speed.
  const heroPressTimer = useRef(null)
  const heroPressedAt = useRef(0)
  const speedBeforeHold = useRef(speedMult)
  const [scrubbing, setScrubbing] = useState(false)

  function onHeroPointerDown() {
    heroPressedAt.current = Date.now()
    speedBeforeHold.current = speedMult
    heroPressTimer.current = setTimeout(() => {
      setScrubbing(true)
      setSpeedMult(4.0)
    }, 380)  // long-press threshold
  }
  function onHeroPointerUp() {
    if (heroPressTimer.current) {
      clearTimeout(heroPressTimer.current)
      heroPressTimer.current = null
    }
    const heldDur = Date.now() - heroPressedAt.current
    if (scrubbing) {
      // End scrub — restore previous speed (which was non-zero, presumably)
      setSpeedMult(speedBeforeHold.current || 1.0)
      setScrubbing(false)
    } else if (heldDur < 380) {
      // Short tap — toggle pause/play
      if (isPaused) setSpeedMult(speedBeforeHold.current || 1.0)
      else { speedBeforeHold.current = speedMult; setSpeedMult(0) }
    }
  }
  // Cancel scrub if pointer leaves the button
  function onHeroPointerLeave() { onHeroPointerUp() }

  function toggleSheet(which) {
    setSheet(s => (s === which ? 'closed' : which))
  }

  return (
    <>
      {/* Sheets render above the dock; only one open at a time */}
      <BrushSheet open={sheet === 'brush'} onClose={() => setSheet('closed')} />
      <ToolSheet open={sheet === 'tool'} onClose={() => setSheet('closed')} />

      <div
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px 10px',
          background: 'var(--uf-void-deep, #000)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          position: 'relative',
          zIndex: 20,
        }}
      >
        {/* Brush chip — left */}
        <DockChip
          active={sheet === 'brush'}
          onClick={() => toggleSheet('brush')}
        >
          <span style={{
            width: 14, height: 14, borderRadius: 4,
            background: elementInfo.swatch,
            border: '1px solid rgba(255,255,255,0.2)',
            flexShrink: 0,
          }} />
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 70,
          }}>{elementInfo.label}</span>
        </DockChip>

        {/* Hero FAB — center */}
        <button
          onPointerDown={onHeroPointerDown}
          onPointerUp={onHeroPointerUp}
          onPointerLeave={onHeroPointerLeave}
          onPointerCancel={onHeroPointerLeave}
          className={`uf-rainbow-rim uf-pressable ${scrubbing ? 'uf-rainbow-rim-pulse' : ''}`}
          style={{
            width: 56, height: 56,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2.5px solid transparent',
            background: scrubbing
              ? 'radial-gradient(circle, #ff2e9e 0%, #1a0024 100%)'
              : 'linear-gradient(180deg, #2e2e2e, #0a0a0a)',
          }}
          aria-label={isPaused ? 'Play' : 'Pause'}
        >
          <span
            className="uf-chunky"
            style={{
              fontSize: 22,
              color: '#fff',
              textShadow: '0 0 8px rgba(255,255,255,0.5)',
              lineHeight: 1,
            }}
          >
            {scrubbing ? '⏩' : (isPaused ? '▶' : '⏸')}
          </span>
        </button>

        {/* Tool chip — right */}
        <DockChip
          active={sheet === 'tool'}
          onClick={() => toggleSheet('tool')}
        >
          <span style={{ fontSize: 14, lineHeight: 1 }}>{tool.icon}</span>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 70,
          }}>{tool.label}</span>
        </DockChip>
      </div>
    </>
  )
}

/**
 * DockChip — chrome-pill button used in the Console. Active state gets
 * a brighter rim + subtle glow so the user can see which sheet is open.
 */
function DockChip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className="uf-pressable"
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 38,
        padding: '0 12px',
        background:
          active
            ? 'linear-gradient(#1a1a1a, #0a0a0a) padding-box, var(--uf-gradient-rainbow-conic) border-box'
            : 'linear-gradient(#1a1a1a, #0a0a0a) padding-box, var(--uf-gradient-silver-vertical) border-box',
        border: '1.5px solid transparent',
        borderRadius: 999,
        color: '#e0e0e2',
        fontFamily: '-apple-system, "SF Pro Rounded", system-ui, sans-serif',
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: '0.1em',
        boxShadow: active
          ? '0 0 12px rgba(250, 63, 140, 0.35), 0 4px 10px rgba(0,0,0,0.6)'
          : '0 4px 10px rgba(0,0,0,0.6)',
        transition: 'box-shadow 0.18s ease',
      }}
    >
      {children}
    </button>
  )
}
