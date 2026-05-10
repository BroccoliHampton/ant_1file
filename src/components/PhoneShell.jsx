/**
 * AppShell — full-screen wrapper for the game.
 *
 * Previously this rendered a simulated iOS phone frame (status bar, dynamic
 * island, hardware buttons, home indicator). Now that the app is going into
 * a real iOS Capacitor build (and gets tested in the Xcode simulator on a
 * real device frame), the simulation is just visual debt. The app fills
 * the viewport and uses safe-area-inset padding so it sits cleanly under
 * the notch and above the home indicator on real iPhones.
 *
 * Filename kept as PhoneShell.jsx to avoid an import churn — the export
 * is still the default render root.
 */
import { useState, useEffect } from 'react'
import GameScreen from './GameScreen.jsx'
import UltraficheShowcase from './UltraficheShowcase.jsx'

export default function PhoneShell() {
  const [theme, setTheme] = useState(() => localStorage.getItem('ptTheme') || 'dark')

  // Ultrafiche brand toolkit showcase — `?ufshow=1` opens the preview
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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('ptTheme', next)
  }

  return (
    <div id="app-shell">
      {showcase
        ? <UltraficheShowcase onClose={closeShowcase} />
        : <GameScreen theme={theme} onToggleTheme={toggleTheme} />}
    </div>
  )
}
