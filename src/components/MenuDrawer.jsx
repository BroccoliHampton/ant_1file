import { useSimStore } from '../store/simStore.js'

export default function MenuDrawer() {
  const open       = useSimStore(s => s.menuOpen)
  const setOpen    = useSimStore(s => s.setMenuOpen)
  const narrator   = useSimStore(s => s.narrator)
  const reset      = useSimStore(s => s.reset)
  const seed       = useSimStore(s => s.seed)
  const randomMap  = useSimStore(s => s.randomMap)
  const openLab    = useSimStore(s => s.openLab)
  const mutRate       = useSimStore(s => s.mutRate)
  const setMutRate    = useSimStore(s => s.setMutRate)
  const entropyRate   = useSimStore(s => s.entropyRate)
  const setEntropyRate = useSimStore(s => s.setEntropyRate)

  const close = () => setOpen(false)

  return (
    <>
      {open && <div id="menu-overlay" onClick={close} style={{position:'absolute',inset:0,zIndex:149,background:'rgba(0,0,0,0.4)'}} />}
      <div id="menu-drawer" className={open ? 'open' : ''}>
        <div id="menu-drawer-inner">
          <div id="menu-header">
            <div className="menu-title">MISSION CONTROL</div>
            <button id="menu-close-btn" className="hdr-btn" onClick={close}>✕</button>
          </div>

          <div className="menu-section">
            <div className="menu-section-label">WORLD</div>
            <div className="menu-btn-grid">
              <button className="mbtn primary" onClick={() => { seed(); close(); }}>🌱 SEED LIFE</button>
              <button className="mbtn" onClick={() => { randomMap(); close(); }}>🗺 RANDOM MAP</button>
              <button className="mbtn danger" onClick={() => { reset(); close(); }}>↺ RESET</button>
            </div>
          </div>

          <div className="menu-section">
            <div className="menu-section-label">CREATURE LAB</div>
            <div className="menu-btn-grid">
              <button className="mbtn primary" onClick={() => { openLab(); close(); }}>🧬 OPEN LAB</button>
            </div>
          </div>

          <div className="menu-section">
            <div className="menu-section-label">SETTINGS</div>
            <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px'}}>
              <span style={{fontSize:'9px',color:'var(--dim)',letterSpacing:'2px',minWidth:'80px'}}>MUTATION</span>
              <input
                type="range" min="0" max="0.05" step="0.001"
                value={mutRate}
                onChange={e => setMutRate(parseFloat(e.target.value))}
                style={{flex:1,accentColor:'var(--accent)'}}
              />
              <span style={{fontSize:'9px',color:'var(--text)',minWidth:'28px',textAlign:'right'}}>
                {mutRate === 0 ? 'OFF' : `${(mutRate * 100).toFixed(1)}%`}
              </span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'9px',color:'var(--dim)',letterSpacing:'2px',minWidth:'80px'}}>ENTROPY</span>
              <input
                type="range" min="0" max="1" step="0.05"
                value={entropyRate}
                onChange={e => setEntropyRate(parseFloat(e.target.value))}
                style={{flex:1,accentColor:'#ff6600'}}
              />
              <span style={{fontSize:'9px',color:entropyRate===0?'var(--text)':'#ff8844',minWidth:'28px',textAlign:'right'}}>
                {entropyRate === 0 ? 'OFF' : `${Math.round(entropyRate * 100)}%`}
              </span>
            </div>
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
    </>
  )
}
