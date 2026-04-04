import { useSimStore } from '../store/simStore.js'

export default function AppHeader({ theme, onToggleTheme }) {
  const setMenuOpen = useSimStore(s => s.setMenuOpen)
  return (
    <div id="app-header">
      <div id="header-logo">ALIEN <span>ANT</span> FARM</div>
      <div id="header-right">
        <button id="theme-toggle" className="hdr-btn" onClick={onToggleTheme}>
          {theme === 'dark' ? '☀' : '🌙'}
        </button>
        <button id="menu-open-btn" className="hdr-btn" onClick={() => setMenuOpen(true)}>☰</button>
      </div>
    </div>
  )
}
