import { useSimStore } from '../store/simStore.js'

export default function StatsStrip() {
  const tick            = useSimStore(s => s.tick)
  const era             = useSimStore(s => s.era)
  const machineGen      = useSimStore(s => s.machineGen)
  const machineBest     = useSimStore(s => s.machineBest)
  const machineRunning  = useSimStore(s => s.machineRunning)
  const machineCountdown= useSimStore(s => s.machineCountdown)

  const showMachine = machineRunning || machineCountdown !== null

  return (
    <div id="stats-strip">
      <div className="stat-cell">
        <div id="tick">{tick.toLocaleString()}</div>
        <div id="tl">TICKS</div>
      </div>
      {showMachine ? (
        <div id="machine-stats">
          {machineCountdown !== null
            ? <span className="machine-countdown">⚙ ACTIVATING {machineCountdown}</span>
            : <><span className="machine-gen">⚙ GEN {machineGen}</span><span className="machine-best"> BEST {machineBest}</span></>
          }
        </div>
      ) : (
        <div id="era">ERA: {era}</div>
      )}
      <div className="stat-cell" id="quick-pop" />
    </div>
  )
}
