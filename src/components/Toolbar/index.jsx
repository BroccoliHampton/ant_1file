import { useState } from 'react'
import { useSimStore } from '../../store/simStore.js'
import ToolRow from './ToolRow.jsx'
import CategoryTabs from './CategoryTabs.jsx'
import ElementTray from './ElementTray.jsx'
import ControlRow from './ControlRow.jsx'

export default function Toolbar() {
  const [activeCat, setActiveCat] = useState('terrain')

  // These now route through the store → engine
  const activeTool       = useSimStore(s => s.activeTool)
  const activeElement    = useSimStore(s => s.activeElement)
  const setActiveTool    = useSimStore(s => s.setActiveTool)
  const setActiveElement = useSimStore(s => s.setActiveElement)

  return (
    <div id="toolbar">
      <ToolRow      activeTool={activeTool}      onToolChange={setActiveTool} />

      {/* Stamp tool config — shown when stamp tool is active */}
      <div id="stamp-picker" style={{display: activeTool === 'stamp' ? 'block' : 'none',padding:'4px 8px',background:'var(--panel)',borderTop:'1px solid var(--btn-border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'8px',color:'var(--dim)',letterSpacing:'2px'}}>STAMP</span>
          <select id="stamp-sel" style={{flex:1,fontSize:'8px',padding:'2px 4px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'3px',fontFamily:'var(--mono)'}}>
            <option value="box">Box</option>
            <option value="bowl">Bowl</option>
            <option value="tube">Tube</option>
            <option value="funnel">Funnel</option>
            <option value="divider">Divider</option>
            <option value="cross">Cross</option>
            <option value="weatherstation">Weather Station</option>
            <option value="frogstone">Frogstone</option>
            <option value="fridge">Fridge</option>
            <option value="box_draw">Box Draw (drag)</option>
          </select>
        </div>
        <div id="stamp-hint" style={{display:'none',fontSize:'7px',color:'var(--dim)',marginTop:'3px',paddingLeft:'2px'}}>Click + drag to draw box</div>
      </div>

      {/* Programmable Cloud config — engine toggles display when progCloud selected */}
      <div id="pc-panel" style={{display:'none',padding:'4px 8px',background:'var(--panel)',borderTop:'1px solid var(--btn-border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'3px'}}>
          <span style={{fontSize:'8px',color:'var(--dim)',letterSpacing:'2px'}}>PROG CLOUD</span>
          <select id="pc-type" style={{flex:1,fontSize:'8px',padding:'2px 4px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'3px',fontFamily:'var(--mono)'}}>
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
          </select>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'8px',color:'var(--dim)'}}>RATE</span>
          <input id="pc-rate" type="range" min="1" max="120" defaultValue="30" style={{flex:1,accentColor:'var(--accent)'}} />
          <span id="pc-rate-val" style={{fontSize:'8px',color:'var(--text)',minWidth:'48px',textAlign:'right'}}>30 ticks</span>
        </div>
      </div>

      {/* Programmable Void config — engine toggles display when progVoid selected */}
      <div id="pv-panel" style={{display:'none',padding:'4px 8px',background:'var(--panel)',borderTop:'1px solid var(--btn-border)'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'3px'}}>
          <span style={{fontSize:'8px',color:'var(--dim)',letterSpacing:'2px'}}>PROG VOID</span>
          <select id="pv-type" style={{flex:1,fontSize:'8px',padding:'2px 4px',background:'var(--btn-bg)',border:'1px solid var(--btn-border)',color:'var(--text)',borderRadius:'3px',fontFamily:'var(--mono)'}}>
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
              <option value="cloud">Cloud</option><option value="bloom_cloud">Bloom Cloud</option>
            </optgroup>
            <optgroup label="Creatures">
              <option value="ant">Ant</option><option value="queen">Queen Ant</option>
              <option value="spider">Spider</option><option value="queen_spider">Queen Spider</option>
              <option value="fungi">Fungi</option><option value="wasp">Wasp</option>
              <option value="queen_wasp">Queen Wasp</option><option value="termite">Termite</option>
              <option value="queen_termite">Queen Termite</option><option value="plant">Plant</option>
            </optgroup>
            <optgroup label="Special">
              <option value="sand_all">All Sand</option><option value="agents">All Agents</option>
            </optgroup>
          </select>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <span style={{fontSize:'8px',color:'var(--dim)'}}>RADIUS</span>
          <input id="pv-radius" type="range" min="1" max="10" defaultValue="2" style={{flex:1,accentColor:'var(--accent)'}} />
          <span id="pv-radius-val" style={{fontSize:'8px',color:'var(--text)',minWidth:'16px',textAlign:'right'}}>2</span>
        </div>
      </div>

      <CategoryTabs activeCat={activeCat}        onCatChange={setActiveCat} />
      <ElementTray  activeCat={activeCat}        activeElement={activeElement} onElementChange={setActiveElement} />

      {/* Custom creature list — populated by engine; visible when any custom creatures exist */}
      <div id="custom-list" style={{overflowY:'auto',maxHeight:'90px'}} />

      <ControlRow />
    </div>
  )
}
