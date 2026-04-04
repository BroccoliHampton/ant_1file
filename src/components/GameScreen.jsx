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
      <div id="lab-popup"><div id="lab-panel"></div></div>
      <div id="held-panel" style={{display:'none'}}><div id="held-info"/></div>

      <AppHeader onToggleTheme={onToggleTheme} theme={theme} />
      <StatsStrip />
      <CanvasZone />
      <DeviceGrip />
      <Toolbar />
      <MenuDrawer />

      {/* ── Weather Station config panel (engine wires up button listeners) ── */}
      <div id="ws-panel" style={{display:'none',position:'fixed',bottom:'0',left:'50%',transform:'translateX(-50%)',zIndex:200,background:'var(--menu-bg)',border:'1px solid var(--btn-border)',borderRadius:'10px 10px 0 0',padding:'8px 12px',minWidth:'240px',fontFamily:'var(--mono)',fontSize:'8px',color:'var(--text)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
          <span style={{color:'var(--accent)',letterSpacing:'2px'}}>☁ WEATHER STATION</span>
          <button id="ws-close-btn" style={{marginLeft:'auto',background:'transparent',border:'none',color:'var(--dim)',cursor:'pointer',fontSize:'10px'}}>✕</button>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'4px'}}>
          <span style={{color:'var(--dim)'}}>TYPE</span>
          <select id="ws-type" style={{flex:1,fontSize:'8px',padding:'2px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'3px'}}>
            <option value="water">Water</option><option value="acid">Acid</option>
            <option value="sand">Sand</option><option value="lava">Lava</option>
            <option value="oil">Oil</option><option value="salt">Salt</option>
            <option value="ice">Ice</option><option value="fire">Fire</option>
            <option value="steam">Steam</option><option value="ash">Ash</option>
            <option value="smoke">Smoke</option><option value="gunpowder">Gunpowder</option>
            <option value="detritus">Detritus</option>
          </select>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'6px'}}>
          <span style={{color:'var(--dim)'}}>RATE</span>
          <input id="ws-rate" type="range" min="1" max="20" defaultValue="3" style={{flex:1}} />
          <span id="ws-rate-val" style={{minWidth:'16px',textAlign:'right'}}>3</span>
        </div>
        <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
          <span id="ws-status" style={{flex:1,color:'var(--dim)'}}>IDLE</span>
          <button id="ws-start" style={{fontSize:'8px',padding:'3px 8px',background:'rgba(0,255,136,0.1)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'4px',cursor:'pointer',fontFamily:'var(--mono)'}}>▶ START</button>
        </div>
      </div>
    </div>
  )
}
