import { useSimStore } from '../../store/simStore.js'

export default function ControlRow() {
  const brushSize    = useSimStore(s => s.brushSize)
  const speedMult    = useSimStore(s => s.speedMult)
  const setBrushSize = useSimStore(s => s.setBrushSize)
  const setSpeedMult = useSimStore(s => s.setSpeedMult)

  // Speed slider: 0-20 raw → 0.0x-4.0x mult (0 = paused)
  const speedRaw = Math.round(speedMult / 0.2)
  const speedLabel = speedMult === 0 ? 'PAUSED' : speedMult.toFixed(1) + 'x'

  return (
    <div id="ctrl-row">
      <div className="ctrl-pill">
        <span className="ctrl-icon">🖌</span>
        <input
          type="range" id="bs" min="1" max="10" value={brushSize}
          onChange={e => setBrushSize(+e.target.value)}
        />
        <span id="bsv" className="ctrl-val">{brushSize}</span>
      </div>
      <div className="ctrl-pill">
        <span className="ctrl-icon">⏱</span>
        <input
          type="range" id="sp" min="0" max="20" value={speedRaw}
          onChange={e => setSpeedMult(+e.target.value * 0.2)}
        />
        <span id="spv" className="ctrl-val">{speedLabel}</span>
      </div>
    </div>
  )
}
