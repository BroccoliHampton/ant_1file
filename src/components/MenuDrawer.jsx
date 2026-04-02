import { useState } from 'react'
import { useSimStore } from '../store/simStore.js'

export default function MenuDrawer() {
  const [open, setOpen]   = useState(false)
  const tick              = useSimStore(s => s.tick)
  const narrator          = useSimStore(s => s.narrator)

  return (
    <>
      <div id="menu-drawer" className={open ? 'open' : ''}>
        <div id="menu-drawer-inner">
          <div id="menu-header">
            <div className="menu-title">MISSION CONTROL</div>
            <button id="menu-close-btn" className="hdr-btn" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="menu-section">
            <div className="menu-section-label">NARRATOR</div>
            <div id="narrator">{narrator ? narrator : 'Awaiting life...'}</div>
          </div>
          <div className="menu-section">
            <div className="menu-section-label">STATISTICS</div>
            <div id="estats" />
          </div>
          <div className="menu-section">
            <div className="menu-section-label">KINGDOMS</div>
            <div id="kbars" />
            <div id="klist" style={{marginTop:'8px'}} />
          </div>
        </div>
      </div>
      {open && <div id="menu-overlay" onClick={() => setOpen(false)} style={{position:'fixed',inset:0,zIndex:149,background:'rgba(0,0,0,0.4)'}} />}
    </>
  )
}
