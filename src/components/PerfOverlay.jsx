/**
 * PerfOverlay — small floating chrome pill showing live perf stats.
 *
 * Toggled from Mission Control → SETTINGS. Polls the engine 4×/sec for
 * fps, sim ms, render ms, and active-cell count. Lets you self-diagnose
 * heat / framerate issues in the field without attaching a debugger.
 */
import { useEffect, useState } from 'react'
import { useSimStore } from '../store/simStore.js'

export default function PerfOverlay() {
  const enabled = useSimStore(s => s.perfOverlay)
  const engine  = useSimStore(s => s.engine)
  const [stats, setStats] = useState({ fps: 0, simMs: 0, renderMs: 0, activeCells: 0 })

  useEffect(() => {
    if (!enabled || !engine?.getPerfStats) return
    let raf = 0
    let last = 0
    function tick(t) {
      if (t - last > 250) {
        setStats(engine.getPerfStats())
        last = t
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [enabled, engine])

  if (!enabled) return null

  // Color the FPS pill green/yellow/red based on health
  const fpsColor = stats.fps >= 28 ? '#3dfc84'
                 : stats.fps >= 18 ? '#ffd633'
                 : '#ff4d6d'

  return (
    <div
      style={{
        position: 'absolute',
        left: 8, top: 44,
        zIndex: 100,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.78)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 8,
        fontFamily: 'var(--mono, monospace)',
        fontSize: 9,
        letterSpacing: '0.08em',
        color: '#e0e0e2',
        lineHeight: 1.5,
        pointerEvents: 'none',
        textShadow: '0 1px 2px rgba(0,0,0,0.8)',
      }}
    >
      <div>FPS <span style={{ color: fpsColor, fontWeight: 700 }}>{stats.fps.toFixed(1)}</span></div>
      <div>SIM <span style={{ color: '#9ad' }}>{stats.simMs.toFixed(1)}ms</span></div>
      <div>RND <span style={{ color: '#fa9' }}>{stats.renderMs.toFixed(1)}ms</span></div>
      <div>CELLS <span style={{ color: '#fff' }}>{stats.activeCells.toLocaleString()}</span></div>
    </div>
  )
}
