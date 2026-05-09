/**
 * StatusRibbon — Phase 1 replacement for AppHeader + StatsStrip.
 *
 * A single chrome strip showing:
 *   ☰ MENU  ·  ALIEN ANT FARM  ·  ERA / POP  ·  ☀/🌙
 *
 * TICK lives in the dynamic island (PhoneShell), not here.
 *
 * Total height: 32px (down from 44+36 = 80px). Frees ~48px of
 * canvas headroom.
 */
import { useSimStore } from '../store/simStore.js'
import { T } from '../simulation/constants.js'

// Match StatsStrip's behavior: when GoL/bacteria are running, surface those
// counters. Otherwise show ERA + total pop.
function useGolStatus() {
  const machineGen       = useSimStore(s => s.machineGen)
  const machineBest      = useSimStore(s => s.machineBest)
  const machineRunning   = useSimStore(s => s.machineRunning)
  const machineCountdown = useSimStore(s => s.machineCountdown)
  const hasMachineCells  = useSimStore(s => s.hasMachineCells)
  const bacteriaGen      = useSimStore(s => s.bacteriaGen)
  const bacteriaBest     = useSimStore(s => s.bacteriaBest)
  const bacteriaRunning  = useSimStore(s => s.bacteriaRunning)
  const bacteriaCountdown= useSimStore(s => s.bacteriaCountdown)
  const hasBacteriaCells = useSimStore(s => s.hasBacteriaCells)
  const showMachine  = machineRunning  || hasMachineCells
  const showBacteria = bacteriaRunning || hasBacteriaCells
  return {
    machineGen, machineBest, machineRunning, machineCountdown, showMachine,
    bacteriaGen, bacteriaBest, bacteriaRunning, bacteriaCountdown, showBacteria,
    showGol: showMachine || showBacteria,
  }
}

// Sum living-organism populations for the POP readout
const LIVING_TYPES = [T.PLANT, T.ANT, T.SPIDER, T.WASP, T.TERMITE, T.FUNGI]
function getTotalPop(populations) {
  if (!populations) return 0
  let sum = 0
  for (const t of LIVING_TYPES) sum += populations[t] || 0
  return sum
}

export default function StatusRibbon({ theme, onToggleTheme }) {
  const setMenuOpen = useSimStore(s => s.setMenuOpen)
  const era         = useSimStore(s => s.era)
  const populations = useSimStore(s => s.populations)
  const gol         = useGolStatus()
  const totalPop    = getTotalPop(populations)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 36,
        minHeight: 36,
        padding: '0 10px',
        background: 'var(--uf-void-deep, #000)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Left — menu disc */}
      <button
        onClick={() => setMenuOpen(true)}
        className="uf-chrome-disc uf-pressable"
        style={{ width: 28, height: 28, fontSize: 14 }}
        aria-label="Mission control"
      >
        ☰
      </button>

      {/* Center — logo + status */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 1,
        pointerEvents: 'none',
      }}>
        <span
          className="uf-chunky uf-chrome-text"
          style={{ fontSize: 13, letterSpacing: '0.18em', lineHeight: 1 }}
        >
          ALIEN ANT FARM
        </span>
        <span
          className="uf-label uf-silver-text uf-label-sm"
          style={{ fontSize: 8, lineHeight: 1.2, opacity: 0.85 }}
        >
          {gol.showGol
            ? renderGolLabel(gol)
            : `ERA · ${era} · POP ${totalPop}`}
        </span>
      </div>

      {/* Right — theme toggle disc */}
      <button
        onClick={onToggleTheme}
        className="uf-chrome-disc uf-pressable"
        style={{ width: 28, height: 28, fontSize: 13 }}
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? '☀' : '🌙'}
      </button>
    </div>
  )
}

function renderGolLabel(g) {
  const parts = []
  if (g.showMachine) {
    parts.push(g.machineRunning
      ? `🦠 ${g.machineGen}/${g.machineBest}`
      : (g.machineCountdown > 0 ? `🦠 ${g.machineCountdown}s` : '🦠 READY'))
  }
  if (g.showBacteria) {
    parts.push(g.bacteriaRunning
      ? `🧫 ${g.bacteriaGen}/${g.bacteriaBest}`
      : (g.bacteriaCountdown > 0 ? `🧫 ${g.bacteriaCountdown}s` : '🧫 READY'))
  }
  return parts.join(' · ')
}
