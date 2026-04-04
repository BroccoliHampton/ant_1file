import { useSimStore } from '../store/simStore.js'

export default function StatsStrip() {
  const tick           = useSimStore(s => s.tick)
  const era            = useSimStore(s => s.era)
  const machineGen     = useSimStore(s => s.machineGen)
  const machineBest    = useSimStore(s => s.machineBest)
  const machineRunning = useSimStore(s => s.machineRunning)
  const hasMachineCells= useSimStore(s => s.hasMachineCells)
  const startGoL       = useSimStore(s => s.startGoL)
  const stopGoL        = useSimStore(s => s.stopGoL)

  const showMachine = machineRunning || hasMachineCells

  return (
    <div id="stats-strip">
      <div className="stat-cell">
        <div id="tick">{tick.toLocaleString()}</div>
        <div id="tl">TICKS</div>
      </div>
      {showMachine ? (
        <div id="machine-stats">
          {machineRunning
            ? <><span className="machine-gen">⚙ GEN {machineGen}</span><span className="machine-best"> BEST {machineBest}</span></>
            : <span className="machine-countdown">⚙ READY</span>
          }
        </div>
      ) : (
        <div id="era">ERA: {era}</div>
      )}
      <div className="stat-cell" id="quick-pop">
        {hasMachineCells && !machineRunning && (
          <button className="gol-play-btn" onClick={startGoL} title="Start Game of Life">▶ RUN</button>
        )}
        {machineRunning && (
          <button className="gol-play-btn gol-stop-btn" onClick={stopGoL} title="Stop Game of Life">⏹ STOP</button>
        )}
      </div>
    </div>
  )
}
