/**
 * BrushSheet — slides up from the bottom when the Brush chip is tapped.
 *
 * Layout:
 *   ─ Segmented category control (TERRAIN · LIFE · SPECIAL · Rx · MINE)
 *   ─ Element grid (3 columns of squircle tiles, neon-glow swatches)
 *   ─ Custom creature/element list (when MINE filter)
 *   ─ Brush size slider at bottom (with the legacy `bs` / `bsv` IDs the
 *     engine still queries)
 *   ─ Inline PROG CLOUD / PROG VOID config when those elements are selected
 *
 * Engine compatibility: keeps the legacy DOM IDs the engine reads/writes:
 *   #bs, #bsv, #pc-panel, #pc-type, #pc-rate, #pc-rate-val,
 *   #pv-panel, #pv-type, #pv-radius, #pv-radius-val, #custom-list
 */
import { useState, useEffect } from 'react'
import { useSimStore } from '../../store/simStore.js'
import { ELEMENTS } from '../../simulation/constants.js'

const CATS = [
  { id: 'elements', label: 'ELEMENTS' },
  { id: 'life',     label: 'LIFE'     },
  { id: 'virus',    label: 'VIRUS'    },
  { id: 'special',  label: 'SPECIAL'  },
  { id: 'rx',       label: 'Rx'       },
  { id: 'mine',     label: 'MINE'     },
]

const MOBILE_CATS = {
  elements: ['jelly','sand','clay','stone','ice','goldSand','whiteSand','salt','water','acid','oil','ash','smoke','steam','gunpowder','wall','fire','lava'],
  life:     ['worm','wood','ant','queen','spider','queenSpider','termite','queenTermite','wasp','queenWasp','plant','seed','detritus','fungi','spore','mutagen','chromadust'],
  virus:    ['machine','bacteria','replicator','bloom','inversion','rna1','fractal1','fractal2'],
  special:  ['quark','customelem_1','customelem_2','cloud','bloomCloud','progCloud','progVoid'],
  rx:       ['lucid','crank','flaca'],
}

export default function BrushSheet({ open, onClose }) {
  const [cat, setCat] = useState('terrain')
  const activeElement    = useSimStore(s => s.activeElement)
  const setActiveElement = useSimStore(s => s.setActiveElement)
  const brushSize        = useSimStore(s => s.brushSize)
  const setBrushSize     = useSimStore(s => s.setBrushSize)
  const engine           = useSimStore(s => s.engine)
  const customVer        = useSimStore(s => s.customElementsVersion)

  // Resolve which elements to show
  let displayElements = []
  if (cat === 'mine') {
    // User-saved custom elements + custom creatures live here
    if (engine?.listCustomElements) {
      const userElems = engine.listCustomElements({ userOnly: true }) || []
      displayElements = userElems.map(d => ({
        key: `customelem_${d.id}`,
        label: d.name?.toUpperCase() || `ELEM ${d.id}`,
        col: `hsl(${d.hue},${d.sat}%,${d.lit}%)`,
      }))
    }
  } else {
    const keys = MOBILE_CATS[cat] || []
    const builtins = keys.map(k => ELEMENTS.find(e => e.key === k)).filter(Boolean)
    // For SPECIAL, also append user custom elements at the end
    if (cat === 'special' && engine?.listCustomElements) {
      const userElems = engine.listCustomElements({ userOnly: true }) || []
      const userPills = userElems.map(d => ({
        key: `customelem_${d.id}`,
        label: d.name?.toUpperCase() || `ELEM ${d.id}`,
        col: `hsl(${d.hue},${d.sat}%,${d.lit}%)`,
      }))
      displayElements = [...builtins, ...userPills]
    } else {
      displayElements = builtins
    }
  }

  // Auto-switch category when a custom element is just saved & auto-selected.
  // We resolve which BrushSheet category contains the active element by
  // searching MOBILE_CATS directly (MOBILE_CATS is the source of truth for
  // categorization, not ELEMENTS.cat which uses legacy names).
  function findCatForKey(key) {
    for (const [catKey, keys] of Object.entries(MOBILE_CATS)) {
      if (keys.includes(key)) return catKey
    }
    return null
  }
  useEffect(() => {
    if (!open) return
    const target = findCatForKey(activeElement)
    if (target && target !== cat) setCat(target)
    else if (!target && activeElement?.startsWith('customelem_')) {
      // User-saved custom element — show in MINE
      if (cat !== 'mine') setCat('mine')
    }
  }, [open])
  // ↑ intentionally not depending on activeElement — only run on open

  if (!open) return null

  return (
    <>
      {/* Tap-outside backdrop closes the sheet */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          left: 0, right: 0, top: 0, bottom: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 40,
          animation: 'uf-fade-in 0.2s ease',
        }}
      />
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          maxHeight: '70%',
          background: 'var(--uf-void-deep, #000)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '14px 14px 0 0',
          padding: '14px 12px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 41,
          animation: 'uf-slide-up 0.22s cubic-bezier(0.2, 0.8, 0.3, 1)',
        }}
      >
        {/* Drag handle */}
        <div style={{
          alignSelf: 'center',
          width: 36, height: 4,
          background: 'rgba(255,255,255,0.25)',
          borderRadius: 2,
          marginBottom: 2,
        }} />

        {/* Segmented category control */}
        <div style={{
          display: 'flex', gap: 4,
          background: '#0a0a0a',
          padding: 3,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {CATS.map(c => (
            <button
              key={c.id}
              onClick={() => setCat(c.id)}
              className="uf-pressable"
              style={{
                flex: 1,
                padding: '6px 4px',
                background: cat === c.id
                  ? 'linear-gradient(#3a3a3a, #1a1a1a) padding-box, var(--uf-gradient-rainbow-conic) border-box'
                  : 'transparent',
                border: cat === c.id ? '1.5px solid transparent' : '1.5px solid transparent',
                borderRadius: 999,
                fontFamily: '-apple-system, "SF Pro Rounded", system-ui, sans-serif',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.12em',
                color: cat === c.id ? '#fff' : 'rgba(255,255,255,0.45)',
                boxShadow: cat === c.id
                  ? '0 0 10px rgba(250,63,140,0.4)'
                  : 'none',
                transition: 'color 0.15s',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* PROG CLOUD config — engine toggles display when progCloud selected.
            Stays in DOM always so the engine can find it. */}
        <div id="pc-panel" style={{
          display: 'none',
          padding: '8px 10px',
          background: 'rgba(40, 30, 80, 0.4)',
          border: '1px solid rgba(186, 102, 255, 0.3)',
          borderRadius: 8,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
            <span style={{fontSize:'9px',color:'#ba66ff',letterSpacing:'2px',fontWeight:700}}>PROG CLOUD</span>
            <select id="pc-type" style={{flex:1,fontSize:'10px',padding:'4px',background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.15)',color:'#fff',borderRadius:4,fontFamily:'inherit'}}>
              <optgroup label="Terrain">
                <option value="water">Water</option><option value="acid">Acid</option>
                <option value="sand">Sand</option><option value="lava">Lava</option>
                <option value="ice">Ice</option><option value="salt">Salt</option>
                <option value="smoke">Smoke</option><option value="steam">Steam</option>
                <option value="ash">Ash</option><option value="detritus">Detritus</option>
                <option value="gunpowder">Gunpowder</option><option value="fire">Fire</option>
                <option value="oil">Oil</option><option value="gold_sand">Gold Sand</option>
                <option value="stone">Stone</option><option value="clay">Clay</option>
                <option value="white_sand">White Sand</option>
              </optgroup>
              <optgroup label="Creatures">
                <option value="ant">Ant</option><option value="queen">Queen Ant</option>
                <option value="spider">Spider</option><option value="queen_spider">Queen Spider</option>
                <option value="fungi">Fungi</option><option value="wasp">Wasp</option>
                <option value="queen_wasp">Queen Wasp</option><option value="termite">Termite</option>
                <option value="queen_termite">Queen Termite</option><option value="plant">Plant</option>
              </optgroup>
              <optgroup label="Special">
                <option value="mutagen">Life Seed</option><option value="chromadust">Chromadust</option>
                <option value="cloud">Cloud</option><option value="bloom_cloud">Bloom Cloud</option>
                <option value="machine">Virus</option><option value="bacteria">Bacteria</option>
                <option value="quark">Quark</option>
              </optgroup>
              <optgroup label="Rx">
                <option value="lucid">Lucid</option><option value="crank">Crank</option>
                <option value="flaca">Flaca</option>
              </optgroup>
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'9px',color:'#aaa'}}>RATE</span>
            <input id="pc-rate" type="range" min="1" max="120" defaultValue="30" style={{flex:1,accentColor:'#ba66ff'}} />
            <span id="pc-rate-val" style={{fontSize:'9px',color:'#fff',minWidth:48,textAlign:'right'}}>30 ticks</span>
          </div>
        </div>

        {/* PROG VOID config — same pattern */}
        <div id="pv-panel" style={{
          display: 'none',
          padding: '8px 10px',
          background: 'rgba(20, 20, 40, 0.4)',
          border: '1px solid rgba(80, 80, 80, 0.4)',
          borderRadius: 8,
        }}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
            <span style={{fontSize:'9px',color:'#888',letterSpacing:'2px',fontWeight:700}}>PROG VOID</span>
            <select id="pv-type" style={{flex:1,fontSize:'10px',padding:'4px',background:'#1a1a2e',border:'1px solid rgba(255,255,255,0.15)',color:'#fff',borderRadius:4,fontFamily:'inherit'}}>
              <optgroup label="Terrain">
                <option value="water">Water</option><option value="acid">Acid</option>
                <option value="sand">Sand</option><option value="lava">Lava</option>
                <option value="ice">Ice</option><option value="salt">Salt</option>
                <option value="smoke">Smoke</option><option value="steam">Steam</option>
                <option value="ash">Ash</option><option value="detritus">Detritus</option>
                <option value="gunpowder">Gunpowder</option><option value="fire">Fire</option>
                <option value="oil">Oil</option><option value="gold_sand">Gold Sand</option>
                <option value="stone">Stone</option><option value="clay">Clay</option>
                <option value="white_sand">White Sand</option>
              </optgroup>
              <optgroup label="Creatures">
                <option value="ant">Ant</option><option value="queen">Queen Ant</option>
                <option value="spider">Spider</option><option value="queen_spider">Queen Spider</option>
                <option value="fungi">Fungi</option><option value="wasp">Wasp</option>
                <option value="queen_wasp">Queen Wasp</option><option value="termite">Termite</option>
                <option value="queen_termite">Queen Termite</option><option value="plant">Plant</option>
                <option value="seed">Seed</option><option value="egg">Egg</option>
                <option value="spore">Spore</option><option value="web">Web</option>
              </optgroup>
              <optgroup label="Special">
                <option value="cloud">Cloud</option><option value="bloom_cloud">Bloom Cloud</option>
                <option value="mutagen">Life Seed</option><option value="chromadust">Chromadust</option>
                <option value="machine">Virus</option><option value="bacteria">Bacteria</option>
                <option value="quark">Quark</option><option value="fractal">Sierp</option>
                <option value="julia">CCA</option>
              </optgroup>
              <optgroup label="Rx">
                <option value="lucid">Lucid</option><option value="crank">Crank</option>
                <option value="flaca">Flaca</option>
              </optgroup>
              <optgroup label="Groups">
                <option value="sand_all">All Sand</option><option value="agents">All Agents</option>
              </optgroup>
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <span style={{fontSize:'9px',color:'#aaa'}}>RADIUS</span>
            <input id="pv-radius" type="range" min="1" max="10" defaultValue="2" style={{flex:1,accentColor:'#888'}} />
            <span id="pv-radius-val" style={{fontSize:'9px',color:'#fff',minWidth:16,textAlign:'right'}}>2</span>
          </div>
        </div>

        {/* Element grid — 3 columns */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          paddingRight: 2,
        }}>
          {displayElements.length === 0 && cat === 'mine' && (
            <p style={{
              gridColumn: '1 / -1',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 10,
              padding: '16px 8px',
              fontFamily: 'inherit',
            }}>
              No saved elements yet. Open the Element Lab from Mission Control.
            </p>
          )}
          {displayElements.map(el => (
            <ElementTile
              key={el.key}
              el={el}
              active={activeElement === el.key}
              onClick={() => setActiveElement(el.key)}
            />
          ))}
        </div>

        {/* Custom creature list — engine writes pills here. Visible only on MINE. */}
        <div id="custom-list" style={{
          maxHeight: cat === 'mine' ? 90 : 0,
          overflowY: 'auto',
          opacity: cat === 'mine' ? 1 : 0,
          pointerEvents: cat === 'mine' ? 'auto' : 'none',
          transition: 'max-height 0.2s, opacity 0.2s',
        }} />

        {/* Brush size slider — keeps legacy IDs */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 4px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          marginTop: 4,
        }}>
          <span style={{ fontSize: 13 }}>🖌</span>
          <input
            id="bs"
            type="range" min="1" max="10" value={brushSize}
            onChange={e => setBrushSize(+e.target.value)}
            style={{ flex: 1, accentColor: '#fa3f8c' }}
          />
          <span id="bsv" style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#e0e0e2',
            minWidth: 16,
            textAlign: 'right',
          }}>{brushSize}</span>
        </div>
      </div>
    </>
  )
}

function ElementTile({ el, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="uf-pressable"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        padding: '8px 4px',
        background: active
          ? 'linear-gradient(#1a1a1a, #050505) padding-box, var(--uf-gradient-rainbow-conic) border-box'
          : 'linear-gradient(#1a1a1a, #050505) padding-box, rgba(255,255,255,0.12) border-box',
        border: '1.5px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'transform 0.1s',
        boxShadow: active
          ? `0 0 8px ${el.col}66, 0 0 14px rgba(250,63,140,0.25)`
          : '0 2px 6px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 6,
        background: el.col,
        boxShadow: `0 0 6px ${el.col}88, inset 0 1px 1px rgba(255,255,255,0.25)`,
      }} />
      <span style={{
        fontSize: 8.5,
        letterSpacing: '0.08em',
        fontWeight: 700,
        color: active ? '#fff' : 'rgba(255,255,255,0.7)',
        textAlign: 'center',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        maxWidth: '100%',
      }}>{el.label}</span>
    </button>
  )
}
