import { useSimStore } from '../store/simStore.js'

export default function StatsStrip() {
  const tick             = useSimStore(s => s.tick)
  const era              = useSimStore(s => s.era)
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
  const showGol      = showMachine || showBacteria

  return (
    <div id="stats-strip">
      <div className="stat-cell">
        <div id="tick">{tick.toLocaleString()}</div>
        <div id="tl">TICKS</div>
      </div>

      {showGol ? (
        <div id="gol-status">
          {showMachine && (
            <span className={machineRunning ? 'machine-gen' : 'machine-countdown'}>
              🦠{machineRunning
                  ? ` ${machineGen} / ${machineBest}`
                  : machineCountdown > 0 ? ` ${machineCountdown}s` : ' READY'}
            </span>
          )}
          {showBacteria && (
            <span className={bacteriaRunning ? 'bacteria-gen' : 'bacteria-countdown'}>
              {showMachine ? ' · ' : ''}🧫{bacteriaRunning
                  ? ` ${bacteriaGen} / ${bacteriaBest}`
                  : bacteriaCountdown > 0 ? ` ${bacteriaCountdown}s` : ' READY'}
            </span>
          )}
        </div>
      ) : (
        <div id="era">ERA: {era}</div>
      )}

      <div className="stat-cell" id="quick-pop" />
    </div>
  )
}
