import { useEffect, useState } from 'react'
import { useSimStore } from '../store/simStore.js'

// Entropy event categories shown in the menu checklist
const ENTROPY_CATS = [
  { label: 'Elements', keys: [
    ['fire','Fire'],['smoke','Smoke'],['steam','Steam'],['water','Water'],
    ['detritus','Detritus'],['ash','Ash'],['acid','Acid'],['oil','Oil'],
    ['lava','Lava'],['ice','Ice'],['salt','Salt'],
  ]},
  { label: 'Creatures', keys: [
    ['ant','Ant'],['spider','Spider'],['wasp','Wasp'],['termite','Termite'],
    ['fungi','Fungi'],['plant','Plant'],['seed','Seed'],['spore','Spore'],
    ['egg','Egg'],['queen_spawn','Queen Spawn'],['worm','Worm'],['custom_creature','Custom'],
  ]},
  { label: 'Special', keys: [
    ['mutagen','Life Seed'],['chromadust','Chromadust'],
    ['virus','Virus'],['bacteria','Bacteria'],
    ['meteor','Meteor'],['lightning','Lightning'],
    ['flood','Flood'],['gunpowder_chain','Gunpowder'],
  ]},
  { label: 'Rx', keys: [
    ['lucid','Lucid'],['crank','Crank'],['flaca','Flaca'],
  ]},
]

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
  const entropyFilter     = useSimStore(s => s.entropyFilter)
  const initEntropyFilter = useSimStore(s => s.initEntropyFilter)
  const toggleEntropyKey  = useSimStore(s => s.toggleEntropyKey)
  const setAllEntropyKeys = useSimStore(s => s.setAllEntropyKeys)
  const [eventsOpen, setEventsOpen] = useState(false)

  // Sync the store's filter cache from the engine on first drawer open
  useEffect(() => { if (open) initEntropyFilter() }, [open, initEntropyFilter])

  const close = () => {
    setOpen(false)
    // Reset any scroll that accumulated while the drawer was open
    const appEl = document.getElementById('app')
    if (appEl) appEl.scrollTop = 0
  }

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
            <div style={{marginTop:'6px'}}>
              <button
                onClick={() => setEventsOpen(v => !v)}
                style={{width:'100%',fontSize:'9px',padding:'4px 8px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--dim)',borderRadius:'3px',fontFamily:'var(--mono)',letterSpacing:'1px',textAlign:'left',cursor:'pointer'}}
              >
                {eventsOpen ? '▼' : '▶'} ENTROPY EVENTS
              </button>
              {eventsOpen && (
                <div style={{marginTop:'4px',padding:'6px 8px',background:'var(--panel)',border:'1px solid var(--btn-border)',borderRadius:'3px'}}>
                  <div style={{display:'flex',gap:'4px',marginBottom:'6px'}}>
                    <button
                      onClick={() => setAllEntropyKeys(true)}
                      style={{flex:1,fontSize:'8px',padding:'3px 4px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'2px',cursor:'pointer'}}
                    >ALL ON</button>
                    <button
                      onClick={() => setAllEntropyKeys(false)}
                      style={{flex:1,fontSize:'8px',padding:'3px 4px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'2px',cursor:'pointer'}}
                    >ALL OFF</button>
                  </div>
                  {ENTROPY_CATS.map(cat => (
                    <div key={cat.label} style={{marginBottom:'6px'}}>
                      <div style={{fontSize:'8px',color:'var(--dim)',letterSpacing:'2px',marginBottom:'3px'}}>{cat.label.toUpperCase()}</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'2px 8px'}}>
                        {cat.keys.map(([key, label]) => {
                          const on = entropyFilter.has(key)
                          return (
                            <label key={key} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'8px',color:on?'var(--text)':'var(--dim)',cursor:'pointer',userSelect:'none'}}>
                              <input
                                type="checkbox"
                                checked={on}
                                onChange={() => toggleEntropyKey(key)}
                                style={{margin:0,cursor:'pointer',accentColor:'#ff6600'}}
                              />
                              <span>{label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
