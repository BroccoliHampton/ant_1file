import { useSimStore } from '../store/simStore.js'

export default function StatsStrip() {
  const tick = useSimStore(s => s.tick)
  const era  = useSimStore(s => s.era)

  return (
    <div id="stats-strip">
      <div className="stat-cell">
        <div id="tick">{tick.toLocaleString()}</div>
        <div id="tl">TICKS</div>
      </div>
      <div id="era">ERA: {era}</div>
      <div className="stat-cell" id="quick-pop" />
    </div>
  )
}
