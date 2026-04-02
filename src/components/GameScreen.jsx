import AppHeader from './AppHeader.jsx'
import StatsStrip from './StatsStrip.jsx'
import CanvasZone from './CanvasZone.jsx'
import DeviceGrip from './DeviceGrip.jsx'
import Toolbar from './Toolbar/index.jsx'
import MenuDrawer from './MenuDrawer.jsx'

export default function GameScreen({ theme, onToggleTheme }) {
  return (
    <div id="app" data-theme={theme}>
      {/* Hidden legacy divs the engine JS needs */}
      <div id="elist" style={{display:'none'}} />
      <div id="pop-tracker" style={{display:'none'}} />
      <div id="hover-tip" />
      <div id="observe-tooltip" />
      <div id="event-toast"><div className="et-name"/><div className="et-desc"/></div>
      <div id="mut-popup" style={{display:'none'}}><div id="mut-card"><button id="mut-card-close">✕</button><div id="mut-card-content"/></div></div>
      <div id="docs-overlay" style={{display:'none'}}><div id="docs-panel"><button id="docs-close">✕ CLOSE</button></div></div>
      <div id="guide-overlay" style={{display:'none'}} />
      <div id="lab-popup" style={{display:'none'}}><div id="lab-panel"><button id="lab-close">✕ CLOSE</button><div id="lab-left"/><div id="lab-right"/></div></div>
      <div id="held-panel" style={{display:'none'}}><div id="held-info"/></div>

      <AppHeader onToggleTheme={onToggleTheme} theme={theme} />
      <StatsStrip />
      <CanvasZone />
      <DeviceGrip />
      <Toolbar />
      <MenuDrawer />
    </div>
  )
}
