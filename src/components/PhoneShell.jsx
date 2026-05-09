import { useState, useEffect } from 'react'
import GameScreen from './GameScreen.jsx'
import UltraficheShowcase from './UltraficheShowcase.jsx'
import { useSimStore } from '../store/simStore.js'

export default function PhoneShell() {
  const [time, setTime] = useState(() => {
    const n = new Date()
    return `${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`
  })
  const [theme, setTheme] = useState(() => localStorage.getItem('aaTheme') || 'dark')

  // Ultrafiche brand showcase — load via ?ufshow=1 in the URL.
  // Lets us preview chrome/rainbow/neon utilities without modifying real UI.
  const [showcase, setShowcase] = useState(() => {
    if (typeof window === 'undefined') return false
    return new URLSearchParams(window.location.search).get('ufshow') === '1'
  })
  function closeShowcase() {
    setShowcase(false)
    const url = new URL(window.location.href)
    url.searchParams.delete('ufshow')
    window.history.replaceState(null, '', url.toString())
  }

  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date()
      setTime(`${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`)
    }, 15000)
    return () => clearInterval(id)
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('aaTheme', next)
  }

  return (
    <div id="phone">
      <div className="phone-btn" id="pb-silent" />
      <div className="phone-btn" id="pb-vol-up" />
      <div className="phone-btn" id="pb-vol-dn" />
      <div className="phone-btn" id="pb-power" />
      <div id="phone-screen">
        <div id="status-bar">
          <span id="status-time">{time}</span>
          <DynamicIsland />
          <div className="status-indicators">
            <div className="status-signal">
              <div className="signal-bar" style={{height:'4px'}} />
              <div className="signal-bar" style={{height:'7px'}} />
              <div className="signal-bar" style={{height:'10px'}} />
              <div className="signal-bar" style={{height:'12px'}} />
            </div>
            <div className="status-battery">
              <div className="battery-body"><div className="battery-fill" /></div>
              <div className="battery-tip" />
            </div>
          </div>
        </div>
        {showcase
          ? <UltraficheShowcase onClose={closeShowcase} />
          : <GameScreen theme={theme} onToggleTheme={toggleTheme} />}
        <div id="home-indicator"><div id="home-bar" /></div>
      </div>
    </div>
  )
}

/**
 * DynamicIsland — live game telemetry inside the iOS-style island shape.
 * Shows the current TICK by default; when GoL or bacteria are active, those
 * generation counters take over.
 */
function DynamicIsland() {
  const tick             = useSimStore(s => s.tick)
  const machineRunning   = useSimStore(s => s.machineRunning)
  const machineGen       = useSimStore(s => s.machineGen)
  const bacteriaRunning  = useSimStore(s => s.bacteriaRunning)
  const bacteriaGen      = useSimStore(s => s.bacteriaGen)

  let label = `${tick.toLocaleString()}`
  if (machineRunning)  label = `🦠 ${machineGen}`
  if (bacteriaRunning) label = `🧫 ${bacteriaGen}`

  return (
    <div id="dynamic-island" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <span
        className="uf-label"
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.12em',
          color: 'rgba(220, 220, 230, 0.92)',
          // Subtle cyan/pink chromatic-aberration on the readout
          textShadow:
            '-0.6px 0.4px 0 rgba(77, 230, 255, 0.6), 0.6px -0.4px 0 rgba(255, 71, 199, 0.55)',
        }}
      >
        {label}
      </span>
    </div>
  )
}
