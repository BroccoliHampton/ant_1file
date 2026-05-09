import { useState, useEffect, useMemo } from 'react'
import { useSimStore } from '../store/simStore.js'
import { T } from '../simulation/constants.js'

// Trait catalog — each entry describes an available behavior the user can
// add to their element. `params` lists the tweakable knobs and their UI hints.
// Keep this in sync with TRAIT_HANDLERS in engine.js.
const TRAITS = [
  {
    id: 'falls', label: 'FALLS', icon: '⬇',
    desc: 'Gravity. Heavier than nothing — sinks through air and lighter cells.',
    defaults: { density: 3 },
    params: [
      { key: 'density', label: 'Density', min: 0.5, max: 8, step: 0.5,
        hint: 'How heavy. 1 = oil-like, 3 = sand, 6 = stone' },
    ],
  },
  {
    id: 'flows', label: 'FLOWS', icon: '〰',
    desc: 'Liquid spread — moves sideways when blocked.',
    defaults: { viscosity: 2 },
    params: [
      { key: 'viscosity', label: 'Viscosity', min: 1, max: 5, step: 1,
        hint: '1 = water-thin · 5 = honey-thick' },
    ],
  },
  {
    id: 'burns', label: 'BURNS', icon: '🔥',
    desc: 'Catches fire when adjacent to flame or lava.',
    defaults: { flammability: 0.6, burnsInto: 'ASH' },
    params: [
      { key: 'flammability', label: 'Flammability', min: 0, max: 1, step: 0.05,
        hint: 'Chance to ignite per tick when next to fire' },
      { key: 'burnsInto', label: 'Leaves behind', type: 'select',
        options: [['ASH','Ash'],['SMOKE','Smoke'],['NULL','Nothing']],
        hint: 'What residue appears after burning' },
    ],
  },
  {
    id: 'glows', label: 'GLOWS', icon: '✨',
    desc: 'Radiates light into surrounding cells. Visible in dark areas.',
    defaults: { brightness: 0.6 },
    params: [
      { key: 'brightness', label: 'Brightness', min: 0.1, max: 1, step: 0.05,
        hint: 'How far the halo reaches and how strong it is' },
    ],
  },
  {
    id: 'decays', label: 'DECAYS', icon: '⌛',
    desc: 'Has a lifespan — transforms into another type when time runs out.',
    defaults: { ttl: 800, decaysInto: 'NULL' },
    params: [
      { key: 'ttl', label: 'Lifespan (ticks)', min: 50, max: 5000, step: 50,
        hint: '50 = blink-and-gone · 5000 = very persistent' },
      { key: 'decaysInto', label: 'Turns into', type: 'select',
        options: [['NULL','Nothing'],['ASH','Ash'],['DETRITUS','Detritus'],['WATER','Water'],['SAND','Sand'],['STONE','Stone'],['STEAM','Steam']],
        hint: 'What replaces this cell when it expires' },
    ],
  },
]

// Map "burnsInto" / "decaysInto" string literals to the engine's T.* numbers
const T_LOOKUP = {
  ASH: T.ASH, SMOKE: T.SMOKE, DETRITUS: T.DETRITUS,
  WATER: T.WATER, SAND: T.SAND, STONE: T.STONE, STEAM: T.STEAM,
  NULL: null,
}

const STORAGE_KEY = 'aaf_custom_elements_v1'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) || []
  } catch (e) {
    return []
  }
}

function saveToStorage(defs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defs))
  } catch (e) {
    console.warn('Could not save custom elements:', e)
  }
}

function emptyDef() {
  return {
    name: '',
    hue: Math.floor(Math.random() * 360),
    sat: 75,
    lit: 45,
    traits: [
      { id: 'falls', params: { density: 3 } },
    ],
  }
}

// Convert UI-form trait list → engine-savable trait list (resolves T.* names)
function compileTraits(uiTraits) {
  return uiTraits.map(t => {
    const params = { ...t.params }
    if (t.id === 'burns' && typeof params.burnsInto === 'string')
      params.burnsInto = T_LOOKUP[params.burnsInto] ?? null
    if (t.id === 'decays' && typeof params.decaysInto === 'string')
      params.decaysInto = T_LOOKUP[params.decaysInto] ?? null
    return { id: t.id, params }
  })
}

// Reverse — engine def → UI form trait list
function uncompileTraits(traits) {
  const reverse = {}
  for (const k in T_LOOKUP) reverse[T_LOOKUP[k] ?? 'NULL'] = k
  return traits.map(t => {
    const params = { ...t.params }
    if (t.id === 'burns' && typeof params.burnsInto !== 'string')
      params.burnsInto = reverse[params.burnsInto] || 'NULL'
    if (t.id === 'decays' && typeof params.decaysInto !== 'string')
      params.decaysInto = reverse[params.decaysInto] || 'NULL'
    return { id: t.id, params }
  })
}

export default function ElementLab() {
  const open = useSimStore(s => s.elementLabOpen)
  const close = () => useSimStore.getState().setElementLabOpen(false)
  const engine = useSimStore(s => s.engine)
  const bump = useSimStore(s => s.bumpCustomElements)

  const [editing, setEditing] = useState(emptyDef())   // current draft
  const [editingId, setEditingId] = useState(null)     // null = creating new
  const [savedList, setSavedList] = useState([])

  // Refresh saved list whenever lab opens or after a save/delete
  function refresh() {
    if (!engine) return
    setSavedList(engine.listCustomElements({ userOnly: true }))
  }

  useEffect(() => {
    if (open) refresh()
  }, [open, engine])

  if (!open) return null

  // ── Helpers ───────────────────────────────────────────────────
  function setHue(v) { setEditing(d => ({ ...d, hue: v })) }
  function setSat(v) { setEditing(d => ({ ...d, sat: v })) }
  function setLit(v) { setEditing(d => ({ ...d, lit: v })) }
  function setName(v) { setEditing(d => ({ ...d, name: v })) }

  function toggleTrait(traitId) {
    setEditing(d => {
      const has = d.traits.find(t => t.id === traitId)
      if (has) return { ...d, traits: d.traits.filter(t => t.id !== traitId) }
      const cat = TRAITS.find(t => t.id === traitId)
      return { ...d, traits: [...d.traits, { id: traitId, params: { ...cat.defaults } }] }
    })
  }

  function setTraitParam(traitId, key, value) {
    setEditing(d => ({
      ...d,
      traits: d.traits.map(t =>
        t.id === traitId ? { ...t, params: { ...t.params, [key]: value } } : t
      ),
    }))
  }

  function saveElement() {
    if (!engine) return
    const name = editing.name.trim() || `Element ${savedList.length + 1}`
    const def = {
      id: editingId,
      name,
      hue: editing.hue, sat: editing.sat, lit: editing.lit,
      traits: compileTraits(editing.traits),
    }
    const id = engine.saveCustomElement(def)
    // Persist the entire user-created list to localStorage
    const all = engine.listCustomElements({ userOnly: true })
    saveToStorage(all)
    bump()
    refresh()
    setEditing(emptyDef())
    setEditingId(null)
    // Auto-select the new element so the user can immediately paint it
    useSimStore.getState().setActiveElement(`customelem_${id}`)
  }

  function loadForEdit(def) {
    setEditing({
      name: def.name,
      hue: def.hue, sat: def.sat, lit: def.lit,
      traits: uncompileTraits(def.traits || []),
    })
    setEditingId(def.id)
  }

  function deleteElement(id) {
    if (!engine) return
    if (!confirm('Delete this element?')) return
    engine.deleteCustomElement(id)
    saveToStorage(engine.listCustomElements({ userOnly: true }))
    bump()
    refresh()
    if (editingId === id) {
      setEditing(emptyDef())
      setEditingId(null)
    }
  }

  function newElement() {
    setEditing(emptyDef())
    setEditingId(null)
  }

  // Live preview swatch
  const swatchColor = `hsl(${editing.hue}, ${editing.sat}%, ${editing.lit}%)`

  return (
    <>
      <div onClick={close} style={{ position:'absolute', inset:0, zIndex:189, background:'rgba(0,0,0,0.55)' }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(560px, 96vw)', maxHeight: '88vh',
        zIndex: 190,
        background: 'var(--menu-bg, #111)',
        border: '1px solid var(--btn-border, #333)',
        borderRadius: '10px',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'var(--mono, monospace)',
        color: 'var(--text, #fff)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.7)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '10px 14px',
          borderBottom: '1px solid var(--btn-border, #333)',
        }}>
          <span style={{ fontSize: '14px', marginRight: '8px' }}>⚗</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', letterSpacing: '2px', color: 'var(--accent, #4f8)' }}>ELEMENT LAB</div>
            <div style={{ fontSize: '8px', color: 'var(--dim, #888)' }}>
              {editingId == null ? 'creating new' : `editing #${editingId}`}
            </div>
          </div>
          <button onClick={close} style={{
            background: 'transparent', border: 'none',
            color: 'var(--dim, #888)', cursor: 'pointer', fontSize: '14px'
          }}>✕</button>
        </div>

        {/* Body — scrollable */}
        <div style={{ overflowY: 'auto', padding: '12px 14px' }}>

          {/* IDENTITY ROW */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
            {/* Color swatch */}
            <div style={{
              width: '64px', height: '64px',
              background: swatchColor,
              borderRadius: '6px',
              border: '1px solid var(--btn-border)',
              flexShrink: 0,
            }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <input
                type="text"
                value={editing.name}
                onChange={e => setName(e.target.value)}
                placeholder="Element name…"
                style={inputStyle}
              />
              <SliderRow label="HUE"  min={0}   max={360} value={editing.hue} onChange={setHue} accent="#ff0080" />
              <SliderRow label="SAT"  min={0}   max={100} value={editing.sat} onChange={setSat} accent="#88ff88" />
              <SliderRow label="LIT"  min={10}  max={75}  value={editing.lit} onChange={setLit} accent="#ffcc44" />
            </div>
          </div>

          {/* TRAITS */}
          <div style={sectionStyle}>BEHAVIORS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
            {TRAITS.map(cat => {
              const active = editing.traits.find(t => t.id === cat.id)
              return (
                <div key={cat.id} style={{
                  border: `1px solid ${active ? 'var(--accent, #4f8)' : 'var(--btn-border, #333)'}`,
                  borderRadius: '4px',
                  padding: '6px 8px',
                  background: active ? 'rgba(68,255,136,0.05)' : 'transparent',
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!active}
                      onChange={() => toggleTrait(cat.id)}
                      style={{ accentColor: 'var(--accent, #4f8)' }}
                    />
                    <span style={{ fontSize: '10px', letterSpacing: '2px', color: active ? 'var(--text)' : 'var(--dim)' }}>
                      {cat.icon} {cat.label}
                    </span>
                  </label>
                  <div style={{ fontSize: '8px', color: 'var(--dim)', marginTop: '2px', marginLeft: '20px' }}>
                    {cat.desc}
                  </div>
                  {active && (
                    <div style={{ marginTop: '6px', marginLeft: '20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {cat.params.map(p => (
                        <ParamRow
                          key={p.key}
                          spec={p}
                          value={active.params[p.key]}
                          onChange={v => setTraitParam(cat.id, p.key, v)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* SAVED LIST */}
          {savedList.length > 0 && (
            <>
              <div style={sectionStyle}>SAVED ({savedList.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '4px', marginBottom: '12px' }}>
                {savedList.map(d => (
                  <div key={d.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 6px',
                    border: `1px solid ${editingId === d.id ? 'var(--accent, #4f8)' : 'var(--btn-border, #333)'}`,
                    borderRadius: '4px',
                    fontSize: '9px',
                  }}>
                    <span style={{
                      width: '14px', height: '14px',
                      background: `hsl(${d.hue}, ${d.sat}%, ${d.lit}%)`,
                      borderRadius: '2px',
                      flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.name}
                    </span>
                    <button onClick={() => loadForEdit(d)} style={miniBtnStyle} title="Edit">✎</button>
                    <button onClick={() => deleteElement(d.id)} style={{ ...miniBtnStyle, color: '#f88' }} title="Delete">✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div style={{
          display: 'flex', gap: '6px', padding: '10px 14px',
          borderTop: '1px solid var(--btn-border, #333)',
        }}>
          <button onClick={newElement} style={btnStyle}>+ NEW</button>
          <div style={{ flex: 1 }} />
          <button onClick={close} style={btnStyle}>CANCEL</button>
          <button
            onClick={saveElement}
            disabled={editing.traits.length === 0}
            style={{
              ...btnStyle,
              background: editing.traits.length === 0 ? 'var(--btn-bg)' : 'var(--accent, #4f8)',
              color: editing.traits.length === 0 ? 'var(--dim)' : '#000',
            }}
          >
            {editingId == null ? '💾 SAVE' : '💾 UPDATE'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── small reusable bits ───────────────────────────────────────────
const inputStyle = {
  fontSize: '11px', padding: '5px 8px',
  background: 'var(--btn-bg, #222)',
  border: '1px solid var(--btn-border, #333)',
  color: 'var(--text, #fff)',
  borderRadius: '3px', fontFamily: 'var(--mono, monospace)',
  outline: 'none',
}

const sectionStyle = {
  fontSize: '9px', letterSpacing: '2px',
  color: 'var(--dim, #888)',
  marginBottom: '6px',
  marginTop: '2px',
}

const btnStyle = {
  padding: '6px 14px', fontSize: '10px', letterSpacing: '1px',
  background: 'var(--btn-bg, #222)',
  border: '1px solid var(--btn-border, #333)',
  color: 'var(--text, #fff)',
  borderRadius: '4px',
  fontFamily: 'var(--mono, monospace)',
  cursor: 'pointer',
}

const miniBtnStyle = {
  padding: '0 4px', fontSize: '9px',
  background: 'transparent',
  border: 'none',
  color: 'var(--dim, #888)',
  cursor: 'pointer',
}

function SliderRow({ label, min, max, value, onChange, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '8px', color: 'var(--dim)', letterSpacing: '2px', minWidth: '32px' }}>{label}</span>
      <input
        type="range" min={min} max={max} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: accent || 'var(--accent)' }}
      />
      <span style={{ fontSize: '9px', minWidth: '32px', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function ParamRow({ spec, value, onChange }) {
  if (spec.type === 'select') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '8px', color: 'var(--dim)', letterSpacing: '1px', minWidth: '90px' }}>{spec.label}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            flex: 1, fontSize: '9px', padding: '2px 4px',
            background: 'var(--btn-bg)',
            border: '1px solid var(--btn-border)',
            color: 'var(--text)',
            borderRadius: '3px', fontFamily: 'var(--mono)',
          }}
        >
          {spec.options.map(([v, lbl]) => <option key={v} value={v}>{lbl}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '8px', color: 'var(--dim)', letterSpacing: '1px', minWidth: '90px' }}>{spec.label}</span>
      <input
        type="range" min={spec.min} max={spec.max} step={spec.step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ flex: 1, accentColor: 'var(--accent)' }}
      />
      <span style={{ fontSize: '9px', minWidth: '40px', textAlign: 'right' }}>{value}</span>
    </div>
  )
}
