import { useState, useEffect } from 'react'
import GameScreen from './GameScreen.jsx'
import UltraficheShowcase from './UltraficheShowcase.jsx'

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
          <div id="dynamic-island" />
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
