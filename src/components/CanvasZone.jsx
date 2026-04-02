import { useRef, useEffect } from 'react'
import { createEngine } from '../simulation/engine.js'
import { useSimStore } from '../store/simStore.js'
import { W, H, S } from '../simulation/constants.js'

export default function CanvasZone() {
  const canvasRef    = useRef(null)
  const zoneRef      = useRef(null)
  const setSimState  = useSimStore(s => s.setState)
  const setEngine    = useSimStore(s => s.setEngine)

  useEffect(() => {
    const canvas = canvasRef.current
    canvas.width  = W * S
    canvas.height = H * S

    const engine = createEngine(canvas, (state) => {
      setSimState(state)
    })
    setEngine(engine)  // ← register in store so Toolbar/MenuDrawer can reach it
    engine.start()

    // Contain-fit canvas into zone on both axes — absolute-centered via CSS
    const zone = zoneRef.current
    const wrap = canvas.parentElement
    function fitCanvas() {
      const zW = zone.clientWidth
      const zH = zone.clientHeight
      if (!zW || !zH) return
      const scaleX = zW / (W * S)
      const scaleY = zH / (H * S)
      const scale  = Math.min(scaleX, scaleY)
      // translate(-50%,-50%) centers the abs-positioned wrap, then scale
      wrap.style.transform = `translate(-50%, -50%) scale(${scale})`
    }
    const observer = new ResizeObserver(fitCanvas)
    observer.observe(zone)
    setTimeout(fitCanvas, 50)

    return () => {
      engine.stop()
      setEngine(null)
      observer.disconnect()
    }
  }, [])

  return (
    <div id="canvas-zone" ref={zoneRef}>
      <div id="canvas-outer">
        <div id="canvas-wrap">
          <canvas ref={canvasRef} id="c" />
          <div id="pause-badge">⏸ PAUSED</div>
          <div id="observe-badge">👁 OBSERVE</div>
          <div id="box-preview" style={{display:'none',position:'absolute',border:'2px dashed rgba(68,136,255,0.8)',background:'rgba(68,136,255,0.08)',pointerEvents:'none',boxSizing:'border-box'}} />
        </div>
      </div>
      <div id="hint-text" style={{display:'none'}}>CLICK+DRAG DRAW</div>
    </div>
  )
}
