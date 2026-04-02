import { useState, useEffect } from 'react'
import GameScreen from './GameScreen.jsx'

export default function PhoneShell() {
  const [time, setTime] = useState(() => {
    const n = new Date()
    return `${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`
  })
  const [theme, setTheme] = useState(() => localStorage.getItem('aaTheme') || 'dark')

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
        <GameScreen theme={theme} onToggleTheme={toggleTheme} />
        <div id="home-indicator"><div id="home-bar" /></div>
      </div>
    </div>
  )
}
